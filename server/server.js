'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ─── STATIC SERVE ────────────────────────────────────────────────────────────
// Serve built files if dist/ exists
const path = require('path');
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;
const WORLD_W = 2400;
const WORLD_H = 2400;
const PORT = process.env.PORT || 4000;

const ENEMY_TYPES = {
  slime:    { id: 'slime',    hp: 30,   speed: 60,  damage: 8,  xp: 5,   size: 16, attackInterval: 1500 },
  bat:      { id: 'bat',      hp: 20,   speed: 130, damage: 6,  xp: 6,   size: 14, attackInterval: 1200 },
  skeleton: { id: 'skeleton', hp: 60,   speed: 80,  damage: 15, xp: 12,  size: 18, attackInterval: 1400 },
  ogre:     { id: 'ogre',     hp: 180,  speed: 50,  damage: 30, xp: 25,  size: 28, attackInterval: 2000 },
  boss:     { id: 'boss',     hp: 2000, speed: 65,  damage: 50, xp: 500, size: 45, attackInterval: 1800 }
};

const CHARACTERS = {
  warrior:  { hp: 150, speed: 160, damage: 35, attackRange: 90,  attackSpeed: 1.2, attackType: 'melee'  },
  mage:     { hp: 80,  speed: 150, damage: 60, attackRange: 200, attackSpeed: 0.7, attackType: 'aoe'    },
  ranger:   { hp: 100, speed: 185, damage: 25, attackRange: 260, attackSpeed: 2.0, attackType: 'ranged' },
  healer:   { hp: 110, speed: 165, damage: 20, attackRange: 180, attackSpeed: 1.0, attackType: 'heal',  healAmount: 5 }
};

const WAVES = [
  [{ type: 'slime',    count: 8,  delay: 300 }],
  [{ type: 'slime',    count: 12, delay: 250 }, { type: 'bat',      count: 4,  delay: 400 }],
  [{ type: 'bat',      count: 10, delay: 200 }, { type: 'skeleton', count: 3,  delay: 500 }],
  [{ type: 'slime',    count: 15, delay: 200 }, { type: 'skeleton', count: 6,  delay: 350 }],
  [{ type: 'bat',      count: 14, delay: 150 }, { type: 'ogre',     count: 2,  delay: 600 }],
  [{ type: 'skeleton', count: 10, delay: 250 }, { type: 'bat',      count: 12, delay: 150 }],
  [{ type: 'ogre',     count: 4,  delay: 500 }, { type: 'slime',    count: 20, delay: 150 }],
  [{ type: 'skeleton', count: 15, delay: 200 }, { type: 'ogre',     count: 5,  delay: 400 }],
  [{ type: 'bat',      count: 20, delay: 100 }, { type: 'ogre',     count: 6,  delay: 300 }, { type: 'skeleton', count: 10, delay: 200 }],
  [{ type: 'boss',     count: 1,  delay: 0   }, { type: 'skeleton', count: 8,  delay: 300 }, { type: 'bat',      count: 10, delay: 150 }]
];

const UPGRADES = {
  damage_up:      { id: 'damage_up',      apply: (s) => { s.damage = Math.floor(s.damage * 1.25); } },
  speed_up:       { id: 'speed_up',       apply: (s) => { s.speed = Math.floor(s.speed * 1.20); } },
  hp_up:          { id: 'hp_up',          apply: (s) => { s.maxHp += 40; s.hp = Math.min(s.maxHp, s.hp + 40); } },
  attack_speed_up:{ id: 'attack_speed_up',apply: (s) => { s.attackSpeed *= 1.25; } },
  range_up:       { id: 'range_up',       apply: (s) => { s.attackRange += 50; } },
  regen:          { id: 'regen',          apply: (s) => { s.regen = (s.regen || 0) + 3; } },
  heal_now:       { id: 'heal_now',       apply: (s) => { s.hp = Math.min(s.maxHp, s.hp + 50); } },
  crit_up:        { id: 'crit_up',        apply: (s) => { s.critChance = (s.critChance || 0) + 0.20; } }
};

// ─── ROOM MANAGEMENT ─────────────────────────────────────────────────────────
const rooms = new Map(); // code -> Room
let globalEnemyId = 0;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O to avoid confusion
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map(); // id -> PlayerState
    this.enemies = new Map(); // id -> EnemyState
    this.state = 'waiting'; // waiting | char_select | playing | gameover | victory
    this.wave = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnIndex = 0;
    this.waveTimer = 0;
    this.waveKills = 0;
    this.waveKillTarget = 0;
    this.tick = 0;
    this.lastTick = Date.now();
    this.gameLoopInterval = null;
    this.events = []; // events to broadcast in next tick
  }

  addPlayer(ws, playerId, charId) {
    const charBase = CHARACTERS[charId] || CHARACTERS.warrior;
    const player = {
      id: playerId,
      ws,
      charId,
      x: WORLD_W / 2 + (this.players.size === 0 ? -80 : 80),
      y: WORLD_H / 2,
      hp: charBase.hp,
      maxHp: charBase.hp,
      stats: {
        hp: charBase.hp,
        maxHp: charBase.hp,
        speed: charBase.speed,
        damage: charBase.damage,
        attackRange: charBase.attackRange,
        attackSpeed: charBase.attackSpeed,
        attackType: charBase.attackType,
        regen: 0,
        critChance: 0,
        healAmount: charBase.healAmount || 0
      },
      xp: 0,
      xpToNext: 100,
      level: 1,
      dx: 0,
      dy: 0,
      lastAttackTime: 0,
      attackCooldown: Math.round(1000 / charBase.attackSpeed),
      healCooldown: 0,
      invincible: 0,
      alive: true,
      charSelected: !!charId,
      ready: false
    };
    this.players.set(playerId, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size === 0 && this.gameLoopInterval) {
      this.stop();
    }
  }

  start() {
    this.state = 'playing';
    this.lastTick = Date.now();
    this.gameLoopInterval = setInterval(() => this._tick(), TICK_MS);
    this._startWave(0);
  }

  stop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
  }

  _tick() {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;
    this.tick++;

    if (this.state !== 'playing') return;

    this._updatePlayers(delta);
    this._updateEnemies(delta);
    this._updateSpawnQueue(delta);
    this._checkWaveComplete();
    this._checkGameOver();

    this._broadcast();
    this.events = []; // clear events after broadcast
  }

  _updatePlayers(delta) {
    this.players.forEach(player => {
      if (!player.alive) return;

      // Move
      const speed = player.stats.speed;
      const mag = Math.sqrt(player.dx * player.dx + player.dy * player.dy);
      if (mag > 0.05) {
        player.x = clamp(player.x + (player.dx / mag) * speed * (delta / 1000), 20, WORLD_W - 20);
        player.y = clamp(player.y + (player.dy / mag) * speed * (delta / 1000), 20, WORLD_H - 20);
      }

      // Regen
      if (player.stats.regen > 0) {
        player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.regen * (delta / 1000));
      }

      // Invincibility frames
      if (player.invincible > 0) {
        player.invincible -= delta;
        if (player.invincible < 0) player.invincible = 0;
      }

      // Healer ability: heal nearby allies
      if (player.charId === 'healer' && player.stats.healAmount > 0) {
        player.healCooldown -= delta;
        if (player.healCooldown <= 0) {
          this.players.forEach(other => {
            if (other.id !== player.id && other.alive) {
              const d = dist2D(player.x, player.y, other.x, other.y);
              if (d < 250) {
                other.hp = Math.min(other.stats.maxHp, other.hp + player.stats.healAmount);
                this.events.push({ type: 'heal', x: other.x, y: other.y });
              }
            }
          });
          // Heal self too
          player.hp = Math.min(player.stats.maxHp, player.hp + player.stats.healAmount * 0.5);
          player.healCooldown = 1000;
        }
      }

      // Auto attack
      const now = Date.now();
      if (now - player.lastAttackTime >= player.attackCooldown && this.enemies.size > 0) {
        const target = this._findNearestEnemy(player);
        if (target && dist2D(player.x, player.y, target.x, target.y) <= player.stats.attackRange) {
          this._doPlayerAttack(player, target, now);
          player.lastAttackTime = now;
        }
      }
    });
  }

  _findNearestEnemy(player) {
    let nearest = null;
    let minDist = Infinity;
    this.enemies.forEach(e => {
      if (e.hp <= 0) return;
      const d = dist2D(player.x, player.y, e.x, e.y);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    });
    return nearest;
  }

  _doPlayerAttack(player, target, now) {
    const s = player.stats;
    let dmg = s.damage;
    let crit = false;

    if (s.critChance > 0 && Math.random() < s.critChance) {
      dmg = Math.floor(dmg * 2);
      crit = true;
    }

    switch (s.attackType) {
      case 'aoe': {
        const aoeRadius = s.attackRange * 0.4;
        this.enemies.forEach(e => {
          if (e.hp <= 0) return;
          if (dist2D(target.x, target.y, e.x, e.y) <= aoeRadius) {
            this._dealDamage(e, dmg, crit);
          }
        });
        break;
      }
      case 'melee':
      case 'ranged':
      case 'heal':
      default:
        this._dealDamage(target, dmg, crit);
        if (s.attackType === 'heal') {
          // Heal allies
          let closestAlly = null;
          let minD = 9999;
          this.players.forEach(other => {
            if (other.id !== player.id && other.alive) {
              const d = dist2D(player.x, player.y, other.x, other.y);
              if (d < minD) { minD = d; closestAlly = other; }
            }
          });
          if (closestAlly) {
            const healAmt = Math.floor(dmg * 0.3);
            closestAlly.hp = Math.min(closestAlly.stats.maxHp, closestAlly.hp + healAmt);
            this.events.push({ type: 'heal', x: closestAlly.x, y: closestAlly.y });
          }
        }
        break;
    }

    this.events.push({ type: 'hit', x: target.x, y: target.y, amount: dmg, crit });
  }

  _dealDamage(enemy, dmg, crit) {
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      this._onEnemyKilled(enemy);
    }
  }

  _onEnemyKilled(enemy) {
    const eType = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;
    this.waveKills++;
    this.events.push({ type: 'kill', x: enemy.x, y: enemy.y, enemyType: enemy.type });

    // Distribute XP to alive players
    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    if (alivePlayers.length > 0) {
      const xpShare = Math.ceil(eType.xp / alivePlayers.length);
      alivePlayers.forEach(p => this._addXP(p, xpShare));
    }

    this.enemies.delete(enemy.id);
  }

  _addXP(player, amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = Math.floor(player.xpToNext * 1.4);
      this._triggerLevelUp(player);
    }
  }

  _triggerLevelUp(player) {
    const upgradeIds = Object.keys(UPGRADES);
    const shuffled = [...upgradeIds].sort(() => Math.random() - 0.5).slice(0, 3);
    const upgradeOptions = shuffled.map(id => ({
      id,
      name: getUpgradeName(id),
      description: getUpgradeDesc(id)
    }));

    this._sendTo(player, {
      type: 'level_up',
      playerId: player.id,
      level: player.level,
      upgrades: upgradeOptions
    });
  }

  applyUpgrade(playerId, upgradeId) {
    const player = this.players.get(playerId);
    if (!player) return;

    const upg = UPGRADES[upgradeId];
    if (!upg) return;

    upg.apply(player.stats);
    // Sync derived values
    player.hp = Math.min(player.stats.maxHp, Math.max(1, player.stats.hp !== undefined ? player.stats.hp : player.hp));
    player.stats.hp = player.hp;
    player.attackCooldown = Math.round(1000 / player.stats.attackSpeed);
  }

  _updateEnemies(delta) {
    // Build players array once
    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    const enemyList = [...this.enemies.values()];

    this.enemies.forEach(enemy => {
      if (enemy.hp <= 0) return;

      const eType = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;

      // Find nearest player
      let nearestPlayer = null;
      let minD = Infinity;
      alivePlayers.forEach(p => {
        const d = dist2D(enemy.x, enemy.y, p.x, p.y);
        if (d < minD) { minD = d; nearestPlayer = p; }
      });

      if (!nearestPlayer) return;

      const dx = nearestPlayer.x - enemy.x;
      const dy = nearestPlayer.y - enemy.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d > 0) {
        const ndx = dx / d;
        const ndy = dy / d;

        // Simple separation from other enemies
        let sepX = 0, sepY = 0;
        enemyList.forEach(other => {
          if (other === enemy || other.hp <= 0) return;
          const ex = enemy.x - other.x;
          const ey = enemy.y - other.y;
          const ed = Math.sqrt(ex * ex + ey * ey);
          const minSep = (eType.size + (ENEMY_TYPES[other.type] || ENEMY_TYPES.slime).size) * 1.4;
          if (ed < minSep && ed > 0) {
            sepX += (ex / ed) * (minSep - ed) * 0.25;
            sepY += (ey / ed) * (minSep - ed) * 0.25;
          }
        });

        const spd = eType.speed;
        enemy.x = clamp(enemy.x + (ndx * spd + sepX) * (delta / 1000), 20, WORLD_W - 20);
        enemy.y = clamp(enemy.y + (ndy * spd + sepY) * (delta / 1000), 20, WORLD_H - 20);
      }

      // Attack player
      if (enemy.attackTimer !== undefined) {
        enemy.attackTimer -= delta;
        if (enemy.attackTimer <= 0 && d < eType.size + 22) {
          this._doEnemyAttack(enemy, nearestPlayer, eType);
          enemy.attackTimer = eType.attackInterval + Math.random() * 400;
        }
      }
    });
  }

  _doEnemyAttack(enemy, player, eType) {
    if (player.invincible > 0) return;

    player.hp -= eType.damage;
    player.invincible = 600;
    this.events.push({ type: 'player_hit', playerId: player.id, amount: eType.damage, x: player.x, y: player.y });

    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
    }
  }

  _updateSpawnQueue(delta) {
    if (!this.waveActive) return;
    this.waveTimer += delta;

    while (
      this.spawnIndex < this.spawnQueue.length &&
      this.waveTimer >= this.spawnQueue[this.spawnIndex].time
    ) {
      const spawn = this.spawnQueue[this.spawnIndex];
      this._spawnEnemy(spawn.type);
      this.spawnIndex++;
    }
  }

  _spawnEnemy(type) {
    const eType = ENEMY_TYPES[type] || ENEMY_TYPES.slime;

    // Spawn around centroid of players
    let cx = WORLD_W / 2, cy = WORLD_H / 2;
    if (this.players.size > 0) {
      let sumX = 0, sumY = 0, cnt = 0;
      this.players.forEach(p => { if (p.alive) { sumX += p.x; sumY += p.y; cnt++; } });
      if (cnt > 0) { cx = sumX / cnt; cy = sumY / cnt; }
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = 380 + Math.random() * 120;
    const x = clamp(cx + Math.cos(angle) * dist, 60, WORLD_W - 60);
    const y = clamp(cy + Math.sin(angle) * dist, 60, WORLD_H - 60);

    const id = 'e' + (++globalEnemyId);
    const enemy = {
      id,
      type,
      x,
      y,
      hp: eType.hp,
      maxHp: eType.hp,
      attackTimer: Math.random() * eType.attackInterval
    };
    this.enemies.set(id, enemy);
    return enemy;
  }

  _checkWaveComplete() {
    if (!this.waveActive) return;
    if (this.enemies.size === 0 && this.spawnIndex >= this.spawnQueue.length) {
      this.waveActive = false;

      const nextWave = this.wave + 1;
      if (nextWave >= WAVES.length) {
        // Victory
        setTimeout(() => {
          this.state = 'victory';
          this._broadcastAll({ type: 'victory' });
          this.stop();
          rooms.delete(this.code);
        }, 1500);
      } else {
        // Start next wave after delay
        setTimeout(() => {
          if (this.state === 'playing') this._startWave(nextWave);
        }, 3000);
      }
    }
  }

  _checkGameOver() {
    if (this.state !== 'playing') return;
    const allDead = [...this.players.values()].every(p => !p.alive);
    if (allDead) {
      this.state = 'gameover';
      this._broadcastAll({ type: 'game_over', wave: this.wave });
      this.stop();
      setTimeout(() => rooms.delete(this.code), 30000);
    }
  }

  _startWave(waveIndex) {
    this.wave = waveIndex;
    this.waveActive = false;
    this.waveKills = 0;
    this.enemies.clear();
    this.spawnQueue = [];
    this.spawnIndex = 0;
    this.waveTimer = 0;

    this._broadcastAll({ type: 'wave_start', wave: waveIndex });

    // Build spawn queue
    const groups = WAVES[waveIndex];
    let t = 2500; // initial delay after wave banner
    groups.forEach(group => {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({ type: group.type, time: t });
        t += group.delay;
      }
    });
    this.spawnQueue.sort((a, b) => a.time - b.time);

    setTimeout(() => {
      if (this.state === 'playing') {
        this.waveActive = true;
      }
    }, 2500);
  }

  _broadcast() {
    const playersData = [...this.players.values()].map(p => ({
      id: p.id,
      charId: p.charId,
      x: Math.round(p.x),
      y: Math.round(p.y),
      hp: Math.round(p.hp),
      maxHp: p.stats.maxHp,
      xp: p.xp,
      xpToNext: p.xpToNext,
      level: p.level,
      alive: p.alive
    }));

    const enemiesData = [...this.enemies.values()].filter(e => e.hp > 0).map(e => ({
      id: e.id,
      type: e.type,
      x: Math.round(e.x),
      y: Math.round(e.y),
      hp: Math.round(e.hp)
    }));

    const msg = {
      type: 'game_state',
      tick: this.tick,
      players: playersData,
      enemies: enemiesData,
      wave: this.wave,
      events: this.events.slice()
    };

    this._broadcastAll(msg);
  }

  _broadcastAll(msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(player => {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    });
  }

  _sendTo(player, msg) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(msg));
    }
  }
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function dist2D(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function generatePlayerId() {
  return crypto.randomBytes(8).toString('hex');
}

function getUpgradeName(id) {
  const names = {
    damage_up: '+25% урон',
    speed_up: '+20% скорость',
    hp_up: '+40 макс. HP',
    attack_speed_up: '+25% скорость атаки',
    range_up: '+50 дальность атаки',
    regen: '3 HP/сек',
    heal_now: 'Восстановить 50 HP',
    crit_up: '+20% крит. шанс'
  };
  return names[id] || id;
}

function getUpgradeDesc(id) {
  const descs = {
    damage_up: 'Все атаки наносят на 25% больше урона',
    speed_up: 'Скорость передвижения увеличена на 20%',
    hp_up: 'Максимальное здоровье увеличено на 40',
    attack_speed_up: 'Атакуешь на 25% быстрее',
    range_up: 'Дальность всех атак увеличена на 50',
    regen: 'Постоянная регенерация 3 HP в секунду',
    heal_now: 'Немедленно восстанавливает 50 единиц здоровья',
    crit_up: 'Шанс критического удара увеличен на 20%'
  };
  return descs[id] || '';
}

// ─── WEBSOCKET HANDLING ──────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  let currentRoom = null;
  let currentPlayer = null;

  console.log(`[WS] Player connected: ${playerId}`);

  ws.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const code = generateRoomCode();
        const room = new Room(code);
        rooms.set(code, room);
        currentRoom = room;

        const charId = msg.characterId || 'warrior';
        currentPlayer = room.addPlayer(ws, playerId, charId);

        ws.send(JSON.stringify({
          type: 'room_created',
          code,
          playerId,
          playerIndex: 0
        }));

        console.log(`[Room] Created: ${code} by ${playerId}`);
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);

        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: `Комната ${code} не найдена` }));
          return;
        }
        if (room.players.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Комната заполнена' }));
          return;
        }
        if (room.state !== 'waiting' && room.state !== 'char_select') {
          ws.send(JSON.stringify({ type: 'error', message: 'Игра уже идёт' }));
          return;
        }

        currentRoom = room;
        const charId = msg.characterId || 'warrior';
        currentPlayer = room.addPlayer(ws, playerId, charId);

        ws.send(JSON.stringify({
          type: 'room_joined',
          code,
          playerId,
          playerIndex: room.players.size - 1
        }));

        // Notify host
        room._broadcastAll({ type: 'player_joined', playerId, playerIndex: room.players.size - 1 });

        console.log(`[Room] ${playerId} joined ${code}`);

        // If 2 players, advance to char select
        if (room.players.size === 2) {
          room.state = 'char_select';
        }
        break;
      }

      case 'select_character': {
        if (!currentRoom || !currentPlayer) return;
        currentPlayer.charId = msg.characterId || 'warrior';
        currentPlayer.charSelected = true;

        // Update player stats based on new character
        const charBase = CHARACTERS[currentPlayer.charId] || CHARACTERS.warrior;
        currentPlayer.stats = {
          hp: charBase.hp,
          maxHp: charBase.hp,
          speed: charBase.speed,
          damage: charBase.damage,
          attackRange: charBase.attackRange,
          attackSpeed: charBase.attackSpeed,
          attackType: charBase.attackType,
          regen: 0,
          critChance: 0,
          healAmount: charBase.healAmount || 0
        };
        currentPlayer.hp = charBase.hp;
        currentPlayer.maxHp = charBase.hp;
        currentPlayer.attackCooldown = Math.round(1000 / charBase.attackSpeed);

        // Check if both selected
        const allSelected = [...currentRoom.players.values()].every(p => p.charSelected);
        if (allSelected && currentRoom.players.size === 2) {
          // Start game
          currentRoom._broadcastAll({ type: 'game_start' });
          currentRoom.start();
        }
        break;
      }

      case 'ready': {
        if (!currentRoom || !currentPlayer) return;
        currentPlayer.ready = true;

        const allReady = [...currentRoom.players.values()].every(p => p.ready);
        if (allReady && currentRoom.state === 'playing') {
          // Already started, just acknowledge
        }
        break;
      }

      case 'input': {
        if (!currentPlayer) return;
        currentPlayer.dx = typeof msg.dx === 'number' ? clamp(msg.dx, -1, 1) : 0;
        currentPlayer.dy = typeof msg.dy === 'number' ? clamp(msg.dy, -1, 1) : 0;
        break;
      }

      case 'ability': {
        // Future: handle ability activation
        break;
      }

      case 'upgrade': {
        if (!currentRoom || !currentPlayer) return;
        currentRoom.applyUpgrade(playerId, msg.upgradeId);
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Player disconnected: ${playerId}`);
    if (currentRoom) {
      currentRoom.removePlayer(playerId);
      // Notify others
      if (currentRoom.players.size > 0) {
        currentRoom._broadcastAll({ type: 'player_left', playerId });
      } else {
        // Last player left - clean up room
        currentRoom.stop();
        rooms.delete(currentRoom.code);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${playerId}:`, err.message);
  });
});

// ─── START ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🎮 Vampire Roguelike Server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

// Cleanup old empty rooms every minute
setInterval(() => {
  rooms.forEach((room, code) => {
    if (room.players.size === 0) {
      room.stop();
      rooms.delete(code);
    }
  });
}, 60000);

module.exports = { app, server };
