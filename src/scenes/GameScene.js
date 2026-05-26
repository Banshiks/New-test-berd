// GameScene - Main gameplay scene
import { getCharacter } from '../data/characters.js';
import { ENEMY_TYPES, WAVES } from '../data/enemies.js';
import { getRandomUpgrades } from '../data/upgrades.js';
import { netClient } from '../network/NetClient.js';

const WORLD_W = 2400;
const WORLD_H = 2400;
const TILE_SIZE = 80;

// Zone types
const ZONE_FOREST = 'forest';
const ZONE_DUNGEON = 'dungeon';
const ZONE_VOID = 'void';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._unsubscribers = [];
  }

  init(data) {
    this._roomCode = data.roomCode || null;
    this._playerIndex = data.playerIndex || 0;
    this._characterId = data.characterId || 'warrior';
    this._solo = data.solo || false;
    this._initialGameState = data.gameState || null;
  }

  create() {
    const { width, height } = this.scale;

    // Game state
    this._players = [];       // player objects {id, x, y, hp, maxHp, charId, stats, xp, level}
    this._enemies = [];       // enemy objects rendered client-side (server-auth or solo)
    this._projectiles = [];   // visual projectiles
    this._particles = [];     // visual particles
    this._floatingTexts = []; // damage numbers

    this._myPlayer = null;
    this._wave = 0;
    this._waveActive = false;
    this._gameOver = false;
    this._victory = false;
    this._paused = false;
    this._lastStateTime = 0;

    // Solo game state
    this._soloEnemyId = 0;
    this._spawnQueue = [];
    this._spawnTimer = 0;
    this._waveKills = 0;
    this._waveKillTarget = 0;
    this._nextWaveDelay = 0;
    this._waveCountdown = 0;

    // Setup world
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // Determine zone by wave
    this._zone = ZONE_FOREST;

    // Draw world background
    this._worldGfx = this.add.graphics();
    this._drawWorldBackground();

    // Groups
    this._enemyGfxGroup = this.add.group();
    this._playerGfxGroup = this.add.group();
    this._projectileGfxGroup = this.add.group();
    this._uiLayer = this.add.group(); // Fixed to camera

    // Initialize solo or network game
    if (this._solo) {
      this._initSoloGame();
    } else {
      this._initNetworkGame();
    }

    // Draw HUD
    this._createHUD(width, height);

    // Virtual joystick
    this._createJoystick(width, height);

    // Input
    this._joystickActive = false;
    this._joystickPointerId = null;
    this._joystickBase = { x: 0, y: 0 };
    this._joystickDelta = { x: 0, y: 0 };

    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup', this._onPointerUp, this);
    this.input.on('pointercancel', this._onPointerUp, this);
  }

  // ─── WORLD DRAWING ────────────────────────────────────────────────

  _drawWorldBackground() {
    const gfx = this._worldGfx;
    gfx.clear();

    switch (this._zone) {
      case ZONE_FOREST:
        this._drawForestBackground(gfx);
        break;
      case ZONE_DUNGEON:
        this._drawDungeonBackground(gfx);
        break;
      case ZONE_VOID:
        this._drawVoidBackground(gfx);
        break;
    }
  }

  _drawForestBackground(gfx) {
    // Ground
    gfx.fillStyle(0x2d5a1b, 1);
    gfx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Grass tiles variation
    for (let tx = 0; tx < WORLD_W / TILE_SIZE; tx++) {
      for (let ty = 0; ty < WORLD_H / TILE_SIZE; ty++) {
        const r = (tx * 7 + ty * 13) % 100;
        if (r < 20) {
          gfx.fillStyle(0x3a7a20, 0.5);
          gfx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (r < 35) {
          gfx.fillStyle(0x1e3d0f, 0.4);
          gfx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Brown dirt paths
    for (let i = 0; i < 8; i++) {
      const px = (i * 300 + 100) % WORLD_W;
      const py = (i * 400 + 150) % WORLD_H;
      gfx.fillStyle(0x8B4513, 0.3);
      gfx.fillRect(px, py, TILE_SIZE * 3, TILE_SIZE);
    }

    // Trees (dark circles)
    const treePts = [
      [200,200],[600,400],[1000,150],[1400,600],[1800,250],[2100,500],
      [300,800],[700,1100],[1200,900],[1600,1200],[2000,1000],
      [400,1500],[900,1700],[1300,1400],[1700,1600],[2200,1800],
      [150,2100],[600,1900],[1100,2200],[1500,2000],[2000,2200]
    ];
    treePts.forEach(([tx, ty]) => {
      gfx.fillStyle(0x1a3a08, 0.8);
      gfx.fillCircle(tx, ty, 45);
      gfx.fillStyle(0x2d5a1b, 0.6);
      gfx.fillCircle(tx + 10, ty - 10, 30);
    });
  }

  _drawDungeonBackground(gfx) {
    // Dark stone
    gfx.fillStyle(0x1a1a1a, 1);
    gfx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Stone tiles
    for (let tx = 0; tx < WORLD_W / TILE_SIZE; tx++) {
      for (let ty = 0; ty < WORLD_H / TILE_SIZE; ty++) {
        const r = (tx * 11 + ty * 7) % 100;
        const shade = r < 30 ? 0x2a2a2a : (r < 60 ? 0x1e1e1e : 0x252525);
        gfx.fillStyle(shade, 1);
        gfx.fillRect(tx * TILE_SIZE + 1, ty * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        gfx.lineStyle(1, 0x111111, 0.5);
        gfx.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Torches (orange glow spots)
    for (let i = 0; i < 15; i++) {
      const tx = 160 + (i * 503) % (WORLD_W - 320);
      const ty = 160 + (i * 701) % (WORLD_H - 320);
      gfx.fillStyle(0xff6600, 0.15);
      gfx.fillCircle(tx, ty, 80);
      gfx.fillStyle(0xffaa00, 0.3);
      gfx.fillCircle(tx, ty, 30);
    }
  }

  _drawVoidBackground(gfx) {
    // Deep purple void
    gfx.fillStyle(0x06021a, 1);
    gfx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Stars
    for (let i = 0; i < 300; i++) {
      const sx = (i * 199 + 50) % WORLD_W;
      const sy = (i * 307 + 80) % WORLD_H;
      const size = (i % 3) + 0.5;
      gfx.fillStyle(0xffffff, 0.2 + (i % 5) * 0.1);
      gfx.fillCircle(sx, sy, size);
    }

    // Nebula patches
    for (let i = 0; i < 12; i++) {
      const nx = (i * 600 + 200) % WORLD_W;
      const ny = (i * 500 + 300) % WORLD_H;
      gfx.fillStyle(0x4a0080, 0.12);
      gfx.fillCircle(nx, ny, 200);
      gfx.fillStyle(0x200040, 0.2);
      gfx.fillCircle(nx + 50, ny - 30, 120);
    }

    // Floating void crystals (hexagons drawn as polygons)
    for (let i = 0; i < 20; i++) {
      const cx = (i * 400 + 150) % WORLD_W;
      const cy = (i * 550 + 250) % WORLD_H;
      gfx.fillStyle(0x8800ff, 0.2);
      gfx.beginPath();
      for (let h = 0; h < 6; h++) {
        const a = (h * Math.PI) / 3;
        const hx = cx + Math.cos(a) * 25;
        const hy = cy + Math.sin(a) * 25;
        if (h === 0) gfx.moveTo(hx, hy);
        else gfx.lineTo(hx, hy);
      }
      gfx.closePath();
      gfx.fillPath();
    }
  }

  // ─── PLAYER DRAWING ───────────────────────────────────────────────

  _createPlayerGfx(player) {
    const container = this.add.container(player.x, player.y);
    container.setDepth(10);

    const char = getCharacter(player.charId);

    // Shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.3);
    shadow.fillEllipse(0, 18, 36, 14);
    container.add(shadow);

    // Body graphics
    const body = this.add.graphics();
    this._drawPlayerBody(body, 0, 0, char, player.isMe ? 1.0 : 0.85);
    container.add(body);

    // HP bar background
    const hpBarBg = this.add.graphics();
    hpBarBg.fillStyle(0x2c3e50, 1);
    hpBarBg.fillRoundedRect(-20, -38, 40, 6, 3);
    container.add(hpBarBg);

    // HP bar fill
    const hpBar = this.add.graphics();
    container.add(hpBar);

    // Name tag
    const nameTag = this.add.text(0, -48, player.isMe ? '← ВЫ' : 'П2', {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: player.isMe ? '#f1c40f' : '#3498db',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5);
    container.add(nameTag);

    // Glow effect for my player
    if (player.isMe) {
      const glow = this.add.graphics();
      glow.fillStyle(char.color, 0.15);
      glow.fillCircle(0, 0, 28);
      container.addAt(glow, 0);
    }

    this._updatePlayerHPBar(hpBar, player);

    return { container, body, hpBar, hpBarBg, shadow };
  }

  _drawPlayerBody(gfx, x, y, char, alpha = 1) {
    gfx.clear();
    const c = char.color;
    const r = 16;

    switch (char.id) {
      case 'warrior': {
        // Legs
        gfx.fillStyle(0x5d4e37, alpha);
        gfx.fillRect(x - 8, y + 8, 6, 12);
        gfx.fillRect(x + 2, y + 8, 6, 12);
        // Body armor
        gfx.fillStyle(c, alpha);
        gfx.fillRect(x - 10, y - 10, 20, 20);
        // Shoulder plates
        gfx.fillStyle(0xbdc3c7, alpha);
        gfx.fillRect(x - 14, y - 10, 8, 8);
        gfx.fillRect(x + 6, y - 10, 8, 8);
        // Head
        gfx.fillStyle(0xffcc99, alpha);
        gfx.fillCircle(x, y - 15, 9);
        // Helmet
        gfx.fillStyle(0x95a5a6, alpha);
        gfx.fillRect(x - 9, y - 24, 18, 8);
        // Sword
        gfx.fillStyle(0xecf0f1, alpha);
        gfx.fillRect(x + 14, y - 18, 4, 22);
        gfx.fillRect(x + 11, y - 13, 10, 3);
        break;
      }
      case 'mage': {
        // Robe
        gfx.fillStyle(c, alpha);
        gfx.fillTriangle(x - 12, y + 20, x + 12, y + 20, x, y - 6);
        gfx.fillTriangle(x - 16, y + 14, x, y - 6, x - 10, y + 4);
        gfx.fillTriangle(x + 16, y + 14, x, y - 6, x + 10, y + 4);
        // Sleeves
        gfx.fillStyle(0x6c3483, alpha);
        gfx.fillTriangle(x - 20, y + 4, x - 10, y - 4, x - 6, y + 8);
        gfx.fillTriangle(x + 20, y + 4, x + 10, y - 4, x + 6, y + 8);
        // Head
        gfx.fillStyle(0xffcc99, alpha);
        gfx.fillCircle(x, y - 14, 8);
        // Pointed hat
        gfx.fillStyle(c, alpha);
        gfx.fillTriangle(x, y - 32, x - 8, y - 16, x + 8, y - 16);
        gfx.fillStyle(0x5b2c6f, alpha);
        gfx.fillRect(x - 10, y - 20, 20, 6);
        // Staff
        gfx.fillStyle(0x8B4513, alpha);
        gfx.fillRect(x + 16, y - 26, 3, 30);
        gfx.fillStyle(0xda70d6, alpha * 0.9);
        gfx.fillCircle(x + 17, y - 28, 6);
        break;
      }
      case 'ranger': {
        // Legs
        gfx.fillStyle(0x5d4e37, alpha);
        gfx.fillRect(x - 7, y + 8, 5, 12);
        gfx.fillRect(x + 2, y + 8, 5, 12);
        // Body (leather)
        gfx.fillStyle(c, alpha);
        gfx.fillRect(x - 8, y - 8, 16, 18);
        // Quiver
        gfx.fillStyle(0x8B4513, alpha);
        gfx.fillRect(x + 10, y - 10, 5, 16);
        // Head
        gfx.fillStyle(0xffcc99, alpha);
        gfx.fillCircle(x, y - 14, 8);
        // Hood (semi-circle)
        gfx.fillStyle(c, alpha);
        gfx.beginPath();
        gfx.arc(x, y - 14, 10, Phaser.Math.DegToRad(190), Phaser.Math.DegToRad(350), false);
        gfx.closePath();
        gfx.fillPath();
        // Bow
        gfx.lineStyle(3, 0x8B4513, alpha);
        gfx.beginPath();
        gfx.arc(x - 16, y, 14, -1.0, 1.0, false);
        gfx.strokePath();
        gfx.lineStyle(1, 0xc8a97e, alpha);
        gfx.lineBetween(x - 16, y - 14, x - 16, y + 14);
        break;
      }
      case 'healer': {
        // Legs
        gfx.fillStyle(0xd4ac0d, alpha);
        gfx.fillRect(x - 7, y + 8, 5, 12);
        gfx.fillRect(x + 2, y + 8, 5, 12);
        // Robe
        gfx.fillStyle(c, alpha);
        gfx.fillRect(x - 9, y - 8, 18, 20);
        // Cross on robe
        gfx.fillStyle(0xffffff, alpha);
        gfx.fillRect(x - 2, y - 6, 4, 12);
        gfx.fillRect(x - 7, y - 2, 14, 4);
        // Head
        gfx.fillStyle(0xffcc99, alpha);
        gfx.fillCircle(x, y - 14, 8);
        // Halo
        gfx.lineStyle(2, 0xf1c40f, alpha * 0.9);
        gfx.strokeCircle(x, y - 24, 8);
        // Staff/wand
        gfx.fillStyle(0xf1c40f, alpha);
        gfx.fillRect(x + 13, y - 22, 3, 26);
        // Star tip on wand
        gfx.fillStyle(0xffffff, alpha);
        gfx.fillCircle(x + 14, y - 24, 4);
        break;
      }
      default:
        gfx.fillStyle(c, alpha);
        gfx.fillCircle(x, y, r);
    }
  }

  _updatePlayerHPBar(hpBar, player) {
    hpBar.clear();
    const pct = Math.max(0, player.hp / player.maxHp);
    const hpColor = pct > 0.6 ? 0x2ecc71 : pct > 0.3 ? 0xf39c12 : 0xe74c3c;
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRoundedRect(-20, -38, 40 * pct, 6, 3);
  }

  // ─── ENEMY DRAWING ────────────────────────────────────────────────

  _createEnemyGfx(enemy) {
    const type = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;
    const container = this.add.container(enemy.x, enemy.y);
    container.setDepth(8);

    const body = this.add.graphics();
    this._drawEnemyBody(body, 0, 0, type, enemy.hp / type.hp);
    container.add(body);

    // HP bar
    const hpBarBg = this.add.graphics();
    const barW = type.size * 2 + 6;
    hpBarBg.fillStyle(0x2c3e50, 0.8);
    hpBarBg.fillRoundedRect(-barW / 2, -type.size - 10, barW, 5, 2);
    container.add(hpBarBg);

    const hpBar = this.add.graphics();
    container.add(hpBar);
    this._updateEnemyHPBar(hpBar, enemy, type);

    return { container, body, hpBar, hpBarBg, type };
  }

  _drawEnemyBody(gfx, x, y, type, hpPct = 1) {
    gfx.clear();
    const c = type.color;
    const s = type.size;

    switch (type.shape) {
      case 'blob': {
        // Slime - wobbly circle
        gfx.fillStyle(c, 0.9);
        gfx.fillEllipse(x, y, s * 2.2, s * 1.8);
        gfx.fillStyle(0xffffff, 0.3);
        gfx.fillEllipse(x - s * 0.3, y - s * 0.3, s * 0.5, s * 0.4);
        // Eyes
        gfx.fillStyle(0x000000, 1);
        gfx.fillCircle(x - s * 0.25, y - s * 0.1, s * 0.18);
        gfx.fillCircle(x + s * 0.25, y - s * 0.1, s * 0.18);
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(x - s * 0.2, y - s * 0.15, s * 0.06);
        gfx.fillCircle(x + s * 0.3, y - s * 0.15, s * 0.06);
        break;
      }
      case 'bat': {
        // Wings
        gfx.fillStyle(c, 0.85);
        gfx.fillTriangle(x, y, x - s * 2.2, y - s * 0.8, x - s * 0.4, y + s * 0.6);
        gfx.fillTriangle(x, y, x + s * 2.2, y - s * 0.8, x + s * 0.4, y + s * 0.6);
        // Body
        gfx.fillStyle(0x5b2c6f, 0.9);
        gfx.fillEllipse(x, y, s * 0.9, s * 1.2);
        // Eyes
        gfx.fillStyle(0xff0000, 1);
        gfx.fillCircle(x - s * 0.2, y - s * 0.15, s * 0.2);
        gfx.fillCircle(x + s * 0.2, y - s * 0.15, s * 0.2);
        break;
      }
      case 'humanoid': {
        // Skeleton
        // Legs
        gfx.lineStyle(3, c, 0.9);
        gfx.lineBetween(x - s * 0.25, y + s * 0.3, x - s * 0.35, y + s);
        gfx.lineBetween(x + s * 0.25, y + s * 0.3, x + s * 0.35, y + s);
        // Arms
        gfx.lineBetween(x - s * 0.5, y - s * 0.2, x - s, y + s * 0.3);
        gfx.lineBetween(x + s * 0.5, y - s * 0.2, x + s, y + s * 0.3);
        // Ribs
        gfx.fillStyle(c, 0.8);
        gfx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8);
        // Rib lines
        gfx.lineStyle(1, 0x1a1a2e, 0.7);
        for (let ri = 0; ri < 3; ri++) {
          gfx.lineBetween(x - s * 0.35, y - s * 0.25 + ri * (s * 0.22), x + s * 0.35, y - s * 0.25 + ri * (s * 0.22));
        }
        // Head (skull)
        gfx.fillStyle(c, 0.9);
        gfx.fillCircle(x, y - s * 0.7, s * 0.42);
        gfx.fillStyle(0x000000, 1);
        gfx.fillEllipse(x - s * 0.18, y - s * 0.7, s * 0.2, s * 0.22);
        gfx.fillEllipse(x + s * 0.18, y - s * 0.7, s * 0.2, s * 0.22);
        // Teeth
        gfx.fillStyle(c, 0.9);
        for (let ti = 0; ti < 3; ti++) {
          gfx.fillRect(x - s * 0.22 + ti * (s * 0.22), y - s * 0.5, s * 0.12, s * 0.12);
        }
        break;
      }
      case 'big': {
        // Ogre
        // Feet
        gfx.fillStyle(0x784212, 0.9);
        gfx.fillEllipse(x - s * 0.4, y + s, s * 0.7, s * 0.4);
        gfx.fillEllipse(x + s * 0.4, y + s, s * 0.7, s * 0.4);
        // Legs
        gfx.fillStyle(c, 0.9);
        gfx.fillRect(x - s * 0.6, y + s * 0.3, s * 0.45, s * 0.7);
        gfx.fillRect(x + s * 0.15, y + s * 0.3, s * 0.45, s * 0.7);
        // Body
        gfx.fillStyle(c, 1);
        gfx.fillEllipse(x, y, s * 1.8, s * 1.7);
        // Arms
        gfx.fillStyle(0xca6f1e, 0.9);
        gfx.fillEllipse(x - s * 1.1, y - s * 0.1, s * 0.7, s * 1.1);
        gfx.fillEllipse(x + s * 1.1, y - s * 0.1, s * 0.7, s * 1.1);
        // Head
        gfx.fillStyle(c, 1);
        gfx.fillCircle(x, y - s * 1.0, s * 0.65);
        // Eyes (angry)
        gfx.fillStyle(0xff0000, 1);
        gfx.fillCircle(x - s * 0.22, y - s * 1.05, s * 0.2);
        gfx.fillCircle(x + s * 0.22, y - s * 1.05, s * 0.2);
        gfx.fillStyle(0x000000, 0.8);
        gfx.fillCircle(x - s * 0.22, y - s * 1.05, s * 0.1);
        gfx.fillCircle(x + s * 0.22, y - s * 1.05, s * 0.1);
        // Eyebrows (angry slant)
        gfx.lineStyle(3, 0x5a1a00, 1);
        gfx.lineBetween(x - s * 0.38, y - s * 1.22, x - s * 0.06, y - s * 1.15);
        gfx.lineBetween(x + s * 0.38, y - s * 1.22, x + s * 0.06, y - s * 1.15);
        // Mouth
        gfx.lineStyle(3, 0x5a1a00, 1);
        gfx.lineBetween(x - s * 0.28, y - s * 0.8, x + s * 0.28, y - s * 0.8);
        // Club
        gfx.fillStyle(0x8B4513, 0.9);
        gfx.fillRect(x + s * 0.8, y - s * 1.5, s * 0.25, s * 1.2);
        gfx.fillEllipse(x + s * 0.9, y - s * 1.6, s * 0.5, s * 0.4);
        break;
      }
      case 'boss': {
        // Boss - large red demon
        // Wings
        gfx.fillStyle(0x8b0000, 0.7);
        gfx.fillTriangle(x, y, x - s * 1.8, y - s * 1.5, x - s * 0.5, y + s * 0.5);
        gfx.fillTriangle(x, y, x + s * 1.8, y - s * 1.5, x + s * 0.5, y + s * 0.5);
        // Body
        gfx.fillStyle(c, 1);
        gfx.fillEllipse(x, y, s * 1.6, s * 1.8);
        // Legs
        gfx.fillStyle(0xc0392b, 0.9);
        gfx.fillRect(x - s * 0.55, y + s * 0.7, s * 0.45, s * 0.8);
        gfx.fillRect(x + s * 0.1, y + s * 0.7, s * 0.45, s * 0.8);
        // Arms
        gfx.fillStyle(0xc0392b, 0.9);
        gfx.fillEllipse(x - s * 1.0, y - s * 0.2, s * 0.55, s * 1.0);
        gfx.fillEllipse(x + s * 1.0, y - s * 0.2, s * 0.55, s * 1.0);
        // Claws
        gfx.fillStyle(0x1a0000, 1);
        gfx.fillTriangle(x - s * 1.35, y + s * 0.4, x - s * 1.5, y + s * 0.6, x - s * 1.1, y + s * 0.5);
        gfx.fillTriangle(x + s * 1.35, y + s * 0.4, x + s * 1.5, y + s * 0.6, x + s * 1.1, y + s * 0.5);
        // Head
        gfx.fillStyle(c, 1);
        gfx.fillCircle(x, y - s * 1.1, s * 0.65);
        // Horns
        gfx.fillStyle(0x1a0000, 1);
        gfx.fillTriangle(x - s * 0.4, y - s * 1.6, x - s * 0.2, y - s * 1.05, x - s * 0.6, y - s * 1.05);
        gfx.fillTriangle(x + s * 0.4, y - s * 1.6, x + s * 0.2, y - s * 1.05, x + s * 0.6, y - s * 1.05);
        // Eyes (glowing)
        gfx.fillStyle(0xff4400, 1);
        gfx.fillCircle(x - s * 0.25, y - s * 1.15, s * 0.25);
        gfx.fillCircle(x + s * 0.25, y - s * 1.15, s * 0.25);
        gfx.fillStyle(0xff0000, 1);
        gfx.fillCircle(x - s * 0.25, y - s * 1.15, s * 0.13);
        gfx.fillCircle(x + s * 0.25, y - s * 1.15, s * 0.13);
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(x - s * 0.2, y - s * 1.2, s * 0.05);
        gfx.fillCircle(x + s * 0.3, y - s * 1.2, s * 0.05);
        // Mouth with teeth
        gfx.lineStyle(3, 0xffffff, 0.9);
        gfx.lineBetween(x - s * 0.3, y - s * 0.9, x + s * 0.3, y - s * 0.9);
        for (let ti = 0; ti < 4; ti++) {
          gfx.lineStyle(2, 0xffffff, 0.8);
          gfx.lineBetween(x - s * 0.25 + ti * (s * 0.18), y - s * 0.9, x - s * 0.25 + ti * (s * 0.18), y - s * 0.78);
        }
        // Aura
        gfx.lineStyle(3, 0xff0000, 0.25);
        gfx.strokeCircle(x, y, s * 1.4);
        gfx.lineStyle(2, 0xff6600, 0.15);
        gfx.strokeCircle(x, y, s * 1.7);
        // HP bar indicator (boss HP displayed bigger)
        const bossHpPct = hpPct;
        gfx.fillStyle(0x1a0000, 0.8);
        gfx.fillRoundedRect(x - s * 1.0, y - s * 2.1, s * 2.0, 10, 4);
        gfx.fillStyle(0xff0000, 1);
        gfx.fillRoundedRect(x - s * 1.0, y - s * 2.1, s * 2.0 * bossHpPct, 10, 4);
        break;
      }
    }
  }

  _updateEnemyHPBar(hpBar, enemy, type) {
    hpBar.clear();
    const pct = Math.max(0, enemy.hp / type.hp);
    const barW = type.size * 2 + 6;
    const hpColor = pct > 0.5 ? 0xe74c3c : 0xff6b6b;
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRoundedRect(-barW / 2, -type.size - 10, barW * pct, 5, 2);
  }

  // ─── GAME INITIALIZATION ─────────────────────────────────────────

  _initSoloGame() {
    const char = getCharacter(this._characterId);

    this._myPlayer = {
      id: 'player1',
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      hp: char.hp,
      maxHp: char.hp,
      charId: this._characterId,
      stats: {
        hp: char.hp,
        maxHp: char.hp,
        speed: char.speed,
        damage: char.damage,
        attackRange: char.attackRange,
        attackSpeed: char.attackSpeed,
        attackType: char.attackType,
        regen: 0,
        critChance: 0
      },
      xp: 0,
      xpToNext: 100,
      level: 1,
      isMe: true,
      lastAttackTime: 0,
      attackCooldown: 1000 / char.attackSpeed,
      healCooldown: 0,
      invincible: 0
    };
    this._players = [this._myPlayer];

    const gfxData = this._createPlayerGfx(this._myPlayer);
    this._myPlayer.gfx = gfxData;

    this.cameras.main.startFollow(this._myPlayer.gfx.container, true, 0.08, 0.08);

    // Start first wave
    this._startWave(0);
  }

  _initNetworkGame() {
    if (!netClient.connected) {
      this.scene.start('MenuScene');
      return;
    }

    // Setup handlers
    const unsub1 = netClient.on('game_state', (msg) => this._onNetworkGameState(msg));
    const unsub2 = netClient.on('wave_start', (msg) => this._onNetworkWaveStart(msg));
    const unsub3 = netClient.on('level_up', (msg) => this._onNetworkLevelUp(msg));
    const unsub4 = netClient.on('game_over', (msg) => this._onGameOver(false));
    const unsub5 = netClient.on('victory', (msg) => this._onVictory());
    this._unsubscribers = [unsub1, unsub2, unsub3, unsub4, unsub5];

    netClient.sendReady();
  }

  _onNetworkGameState(msg) {
    // msg.players: array of player states
    // msg.enemies: array of enemy states
    // msg.wave, msg.events

    // Update/create players
    if (msg.players) {
      msg.players.forEach(pState => {
        let p = this._players.find(pl => pl.id === pState.id);
        if (!p) {
          p = {
            id: pState.id,
            charId: pState.charId,
            isMe: pState.id === netClient.playerId,
            gfx: null
          };
          const gfxData = this._createPlayerGfx(p);
          p.gfx = gfxData;
          this._players.push(p);
          if (p.isMe) {
            this._myPlayer = p;
            this.cameras.main.startFollow(p.gfx.container, true, 0.08, 0.08);
          }
        }
        Object.assign(p, pState);
        if (p.gfx) {
          p.gfx.container.setPosition(p.x, p.y);
          this._updatePlayerHPBar(p.gfx.hpBar, p);
        }
      });
    }

    // Update/create enemies
    if (msg.enemies) {
      const activeIds = new Set(msg.enemies.map(e => e.id));

      // Remove dead enemies
      this._enemies = this._enemies.filter(e => {
        if (!activeIds.has(e.id)) {
          e.gfx.container.destroy();
          return false;
        }
        return true;
      });

      // Update existing + create new
      msg.enemies.forEach(eState => {
        let e = this._enemies.find(en => en.id === eState.id);
        if (!e) {
          e = { ...eState, gfx: null };
          const gfxData = this._createEnemyGfx(e);
          e.gfx = gfxData;
          this._enemies.push(e);
        }
        Object.assign(e, eState);
        if (e.gfx) {
          e.gfx.container.setPosition(e.x, e.y);
          this._updateEnemyHPBar(e.gfx.hpBar, e, e.gfx.type);
        }
      });
    }

    // Process events
    if (msg.events) {
      msg.events.forEach(ev => this._processEvent(ev));
    }

    this._lastStateTime = Date.now();
  }

  _onNetworkWaveStart(msg) {
    this._wave = msg.wave;
    this._updateZoneForWave(this._wave);
    this._showWaveBanner(this._wave);
  }

  _onNetworkLevelUp(msg) {
    if (msg.playerId === netClient.playerId) {
      this.scene.launch('UpgradeScene', {
        upgrades: msg.upgrades,
        onSelect: (upgradeId) => {
          netClient.sendUpgrade(upgradeId);
          this.scene.stop('UpgradeScene');
        }
      });
    }
  }

  // ─── SOLO GAME LOOP ───────────────────────────────────────────────

  _startWave(waveIndex) {
    this._wave = waveIndex;
    this._waveActive = false;
    this._waveKills = 0;
    this._spawnQueue = [];

    if (waveIndex >= WAVES.length) {
      this._onVictory();
      return;
    }

    this._updateZoneForWave(waveIndex);

    // Count total kills needed
    let total = 0;
    WAVES[waveIndex].forEach(group => { total += group.count; });
    this._waveKillTarget = total;

    // Show wave banner then start spawning
    this._showWaveBanner(waveIndex);

    this.time.delayedCall(2500, () => {
      if (this._gameOver) return;
      this._waveActive = true;
      this._buildSpawnQueue(waveIndex);
      this._updateHUDWave();
    });
  }

  _updateZoneForWave(waveIndex) {
    if (waveIndex < 3) this._zone = ZONE_FOREST;
    else if (waveIndex < 7) this._zone = ZONE_DUNGEON;
    else this._zone = ZONE_VOID;

    this._drawWorldBackground();
  }

  _buildSpawnQueue(waveIndex) {
    const groups = WAVES[waveIndex];
    this._spawnQueue = [];
    let t = 500; // initial delay
    groups.forEach(group => {
      for (let i = 0; i < group.count; i++) {
        this._spawnQueue.push({ type: group.type, time: t });
        t += group.delay;
      }
    });
    this._spawnQueue.sort((a, b) => a.time - b.time);
    this._waveTimer = 0;
    this._spawnIndex = 0;
  }

  _spawnEnemy(type) {
    const eType = ENEMY_TYPES[type] || ENEMY_TYPES.slime;
    const angle = Math.random() * Math.PI * 2;
    const dist = 380 + Math.random() * 120;
    const cx = this._myPlayer ? this._myPlayer.x : WORLD_W / 2;
    const cy = this._myPlayer ? this._myPlayer.y : WORLD_H / 2;
    const x = Phaser.Math.Clamp(cx + Math.cos(angle) * dist, 80, WORLD_W - 80);
    const y = Phaser.Math.Clamp(cy + Math.sin(angle) * dist, 80, WORLD_H - 80);

    const id = 'e_' + (++this._soloEnemyId);
    const enemy = {
      id,
      type,
      x,
      y,
      hp: eType.hp,
      maxHp: eType.hp,
      gfx: null,
      attackTimer: Math.random() * 1000
    };
    const gfxData = this._createEnemyGfx(enemy);
    enemy.gfx = gfxData;
    this._enemies.push(enemy);
    return enemy;
  }

  _updateSoloGame(delta) {
    if (this._gameOver || this._victory || this._paused) return;

    const p = this._myPlayer;
    if (!p || p.hp <= 0) return;

    // Spawn queue
    if (this._waveActive && this._spawnIndex < this._spawnQueue.length) {
      this._waveTimer = (this._waveTimer || 0) + delta;
      while (
        this._spawnIndex < this._spawnQueue.length &&
        this._waveTimer >= this._spawnQueue[this._spawnIndex].time
      ) {
        this._spawnEnemy(this._spawnQueue[this._spawnIndex].type);
        this._spawnIndex++;
      }
    }

    // Move player from joystick
    const speed = p.stats.speed;
    const jx = this._joystickDelta.x;
    const jy = this._joystickDelta.y;
    const mag = Math.sqrt(jx * jx + jy * jy);
    if (mag > 0.05) {
      p.x = Phaser.Math.Clamp(p.x + (jx / mag) * speed * (delta / 1000), 20, WORLD_W - 20);
      p.y = Phaser.Math.Clamp(p.y + (jy / mag) * speed * (delta / 1000), 20, WORLD_H - 20);
    }
    if (p.gfx) {
      p.gfx.container.setPosition(p.x, p.y);
    }

    // Auto-attack
    const now = Date.now();
    if (now - p.lastAttackTime >= p.attackCooldown && this._enemies.length > 0) {
      const target = this._findNearestEnemy(p);
      if (target && Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y) <= p.stats.attackRange) {
        this._doPlayerAttack(p, target);
        p.lastAttackTime = now;
      }
    }

    // Regen
    if (p.stats.regen > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * (delta / 1000));
    }

    // Healer heal aura
    if (p.charId === 'healer') {
      // In solo, heals self
      p.healCooldown -= delta;
      if (p.healCooldown <= 0) {
        p.hp = Math.min(p.maxHp, p.hp + 5);
        p.healCooldown = 1000;
        this._spawnHealParticle(p.x, p.y);
      }
    }

    // Update player HP bar
    if (p.gfx) {
      this._updatePlayerHPBar(p.gfx.hpBar, p);
    }

    // Update enemies
    this._updateEnemiesSolo(delta, p);

    // Check invincibility
    if (p.invincible > 0) {
      p.invincible -= delta;
      if (p.gfx) {
        p.gfx.container.setAlpha(Math.sin(Date.now() * 0.02) * 0.4 + 0.6);
      }
    } else if (p.gfx) {
      p.gfx.container.setAlpha(1);
    }

    // Update HUD
    this._updateHUD();

    // Check wave completion
    if (this._waveActive && this._enemies.length === 0 && this._spawnIndex >= this._spawnQueue.length) {
      this._waveActive = false;
      const nextWave = this._wave + 1;
      if (nextWave >= WAVES.length) {
        this.time.delayedCall(1000, () => this._onVictory());
      } else {
        this.time.delayedCall(2000, () => {
          if (!this._gameOver) this._startWave(nextWave);
        });
      }
    }
  }

  _updateEnemiesSolo(delta, player) {
    const toRemove = [];

    this._enemies.forEach(enemy => {
      const eType = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;

      if (enemy.hp <= 0) {
        toRemove.push(enemy);
        return;
      }

      // Move toward nearest player
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const speed = eType.speed;
        const ndx = dx / dist;
        const ndy = dy / dist;

        // Separate from other enemies (avoidance)
        let sepX = 0, sepY = 0;
        this._enemies.forEach(other => {
          if (other === enemy) return;
          const ex = enemy.x - other.x;
          const ey = enemy.y - other.y;
          const ed = Math.sqrt(ex * ex + ey * ey);
          const minDist = (eType.size + (ENEMY_TYPES[other.type] || ENEMY_TYPES.slime).size) * 1.5;
          if (ed < minDist && ed > 0) {
            sepX += (ex / ed) * (minDist - ed) * 0.3;
            sepY += (ey / ed) * (minDist - ed) * 0.3;
          }
        });

        enemy.x += (ndx * speed + sepX) * (delta / 1000);
        enemy.y += (ndy * speed + sepY) * (delta / 1000);
        enemy.x = Phaser.Math.Clamp(enemy.x, 20, WORLD_W - 20);
        enemy.y = Phaser.Math.Clamp(enemy.y, 20, WORLD_H - 20);
      }

      // Attack player
      if (enemy.attackTimer !== undefined) {
        enemy.attackTimer -= delta;
        if (enemy.attackTimer <= 0 && dist < eType.size + 22) {
          this._doEnemyAttack(enemy, player, eType);
          enemy.attackTimer = 1200 + Math.random() * 800;
        }
      }

      // Update gfx position
      if (enemy.gfx) {
        enemy.gfx.container.setPosition(enemy.x, enemy.y);
        this._updateEnemyHPBar(enemy.gfx.hpBar, enemy, eType);
      }
    });

    // Remove dead enemies
    toRemove.forEach(enemy => {
      this._onEnemyKilled(enemy);
    });
  }

  _findNearestEnemy(player) {
    let nearest = null;
    let minDist = Infinity;
    this._enemies.forEach(e => {
      if (e.hp <= 0) return;
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    });
    return nearest;
  }

  _doPlayerAttack(player, target) {
    const stats = player.stats;
    const char = getCharacter(player.charId);

    let dmg = stats.damage;
    let isCrit = false;
    if (stats.critChance > 0 && Math.random() < stats.critChance) {
      dmg = Math.floor(dmg * 2);
      isCrit = true;
    }

    switch (stats.attackType) {
      case 'melee':
        this._meleeAttack(player, target, dmg, isCrit);
        break;
      case 'ranged':
        this._rangedAttack(player, target, dmg, isCrit);
        break;
      case 'aoe':
        this._aoeAttack(player, target, dmg, isCrit, stats.attackRange * 0.4);
        break;
      case 'heal':
        this._healAttack(player, target, dmg, isCrit);
        break;
      default:
        this._rangedAttack(player, target, dmg, isCrit);
    }
  }

  _meleeAttack(player, target, dmg, isCrit) {
    // Instant hit with slash effect
    this._dealDamage(target, dmg, isCrit);
    this._spawnSlashEffect(player.x, player.y, target.x, target.y, player.stats ? getCharacter(player.charId).color : 0xffffff);
    this._spawnDamageText(target.x, target.y - 30, dmg, isCrit);
  }

  _rangedAttack(player, target, dmg, isCrit) {
    // Projectile
    this._spawnProjectile(player.x, player.y, target.x, target.y, dmg, isCrit, 0xf1c40f, 5, 400);
  }

  _aoeAttack(player, target, dmg, isCrit, radius) {
    // Hits all enemies in radius around target
    const gfx = this.add.graphics();
    gfx.fillStyle(0x9b59b6, 0.35);
    gfx.fillCircle(target.x, target.y, radius);
    gfx.lineStyle(2, 0xda70d6, 0.8);
    gfx.strokeCircle(target.x, target.y, radius);
    gfx.setDepth(15);

    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.9, to: 0 },
      scaleX: { from: 0.6, to: 1.2 },
      scaleY: { from: 0.6, to: 1.2 },
      duration: 350,
      onComplete: () => gfx.destroy()
    });

    this._enemies.forEach(e => {
      if (e.hp <= 0) return;
      const d = Phaser.Math.Distance.Between(target.x, target.y, e.x, e.y);
      if (d <= radius) {
        this._dealDamage(e, dmg, isCrit);
        this._spawnDamageText(e.x, e.y - 30, dmg, isCrit);
      }
    });
  }

  _healAttack(player, target, dmg, isCrit) {
    // Attack target + send heal beam to nearest ally (or self)
    this._rangedAttack(player, target, dmg, isCrit);

    // Heal effect on self
    const healAmt = Math.floor(dmg * 0.3);
    player.hp = Math.min(player.maxHp, player.hp + healAmt);
    this._spawnHealParticle(player.x, player.y);
    this._spawnDamageText(player.x, player.y - 40, '+' + healAmt, false, 0x2ecc71);
  }

  _dealDamage(enemy, dmg, isCrit) {
    enemy.hp -= dmg;
    if (enemy.hp < 0) enemy.hp = 0;

    // Update gfx
    if (enemy.gfx) {
      const eType = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;
      this._drawEnemyBody(enemy.gfx.body, 0, 0, eType, enemy.hp / eType.hp);

      // Flash red
      this.tweens.add({
        targets: enemy.gfx.container,
        alpha: { from: 0.4, to: 1 },
        duration: 120,
        ease: 'Linear'
      });
    }
  }

  _doEnemyAttack(enemy, player, eType) {
    if (player.invincible > 0) return;

    player.hp -= eType.damage;
    if (player.hp < 0) player.hp = 0;

    player.invincible = 600;

    this._spawnDamageText(player.x, player.y - 30, eType.damage, false, 0xe74c3c);

    if (player.hp <= 0) {
      this._onGameOver(true);
    }
  }

  _onEnemyKilled(enemy) {
    // XP gain
    const eType = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.slime;
    this._addXP(eType.xp);
    this._waveKills++;

    // Kill particles
    this._spawnDeathParticles(enemy.x, enemy.y, eType.color);

    // Remove gfx
    if (enemy.gfx) {
      enemy.gfx.container.destroy();
    }
    this._enemies = this._enemies.filter(e => e !== enemy);
  }

  _addXP(amount) {
    const p = this._myPlayer;
    if (!p) return;
    p.xp += amount;

    // Check level up
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level++;
      p.xpToNext = Math.floor(p.xpToNext * 1.4);
      this._triggerLevelUp(p);
    }

    this._updateHUD();
  }

  _triggerLevelUp(player) {
    // Pause game
    this._paused = true;

    const upgrades = getRandomUpgrades(3);

    this.scene.launch('UpgradeScene', {
      upgrades,
      level: player.level,
      onSelect: (upgradeId) => {
        this._paused = false;
        this.scene.stop('UpgradeScene');

        // Apply upgrade
        const upg = upgrades.find(u => u.id === upgradeId);
        if (upg) {
          upg.apply(player.stats);
          // Sync stats back to player
          player.hp = player.stats.hp;
          player.maxHp = player.stats.maxHp;
          player.attackCooldown = 1000 / player.stats.attackSpeed;

          this._showUpgradeFlash(upg.name);
        }
      }
    });
  }

  // ─── VFX ──────────────────────────────────────────────────────────

  _spawnProjectile(fromX, fromY, toX, toY, dmg, isCrit, color, size, speed) {
    const gfx = this.add.graphics();
    gfx.fillStyle(color, 1);
    gfx.fillCircle(0, 0, size);
    gfx.setPosition(fromX, fromY);
    gfx.setDepth(12);

    const dist = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const duration = (dist / speed) * 1000;

    const startX = fromX;
    const startY = fromY;

    this.tweens.add({
      targets: gfx,
      x: toX,
      y: toY,
      duration,
      ease: 'Linear',
      onComplete: () => {
        // Find enemy near landing spot
        let hit = false;
        this._enemies.forEach(e => {
          if (!hit && e.hp > 0) {
            const d = Phaser.Math.Distance.Between(gfx.x, gfx.y, e.x, e.y);
            if (d < (ENEMY_TYPES[e.type] || ENEMY_TYPES.slime).size + 12) {
              this._dealDamage(e, dmg, isCrit);
              this._spawnDamageText(e.x, e.y - 30, dmg, isCrit);
              hit = true;
            }
          }
        });
        gfx.destroy();
      }
    });
  }

  _spawnSlashEffect(fx, fy, tx, ty, color) {
    const gfx = this.add.graphics();
    gfx.lineStyle(4, color, 0.9);
    gfx.lineBetween(0, 0, tx - fx, ty - fy);
    gfx.setPosition(fx, fy);
    gfx.setDepth(12);

    this.tweens.add({
      targets: gfx,
      alpha: { from: 1, to: 0 },
      duration: 200,
      onComplete: () => gfx.destroy()
    });
  }

  _spawnDeathParticles(x, y, color) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      const gfx = this.add.graphics();
      gfx.fillStyle(color, 0.9);
      gfx.fillCircle(0, 0, 4 + Math.random() * 4);
      gfx.setPosition(x, y);
      gfx.setDepth(14);

      this.tweens.add({
        targets: gfx,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0 },
        scaleY: { from: 1, to: 0 },
        duration: 400 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => gfx.destroy()
      });
    }
  }

  _spawnHealParticle(x, y) {
    for (let i = 0; i < 5; i++) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x2ecc71, 1);
      gfx.fillCircle(0, 0, 4);
      gfx.setPosition(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
      gfx.setDepth(14);

      this.tweens.add({
        targets: gfx,
        y: gfx.y - 30 - Math.random() * 20,
        alpha: { from: 1, to: 0 },
        duration: 600,
        ease: 'Power2',
        onComplete: () => gfx.destroy()
      });
    }
  }

  _spawnDamageText(x, y, amount, isCrit, color = null) {
    const col = color ? ('#' + color.toString(16).padStart(6, '0')) : (isCrit ? '#f1c40f' : '#ffffff');
    const text = this.add.text(x, y, isCrit ? `${amount}!` : `${amount}`, {
      fontSize: isCrit ? '22px' : '16px',
      fontFamily: 'Arial Black, Arial',
      color: col,
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - 50,
      alpha: { from: 1, to: 0 },
      duration: 800,
      ease: 'Power2',
      onComplete: () => text.destroy()
    });
  }

  // ─── EVENTS ───────────────────────────────────────────────────────

  _processEvent(ev) {
    switch (ev.type) {
      case 'hit':
        this._spawnDamageText(ev.x, ev.y, ev.amount, ev.crit);
        break;
      case 'kill':
        this._spawnDeathParticles(ev.x, ev.y, ENEMY_TYPES[ev.enemyType]?.color || 0xffffff);
        break;
      case 'heal':
        this._spawnHealParticle(ev.x, ev.y);
        break;
    }
  }

  _onGameOver(myDeath) {
    if (this._gameOver) return;
    this._gameOver = true;
    this._paused = true;

    const { width, height } = this.scale;

    // Overlay
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(100);
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, width, height);

    this.add.text(width / 2, height * 0.3, 'ИГРА ОКОНЧЕНА', {
      fontSize: '44px',
      fontFamily: 'Arial Black, Arial',
      color: '#e74c3c',
      stroke: '#000',
      strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.add.text(width / 2, height * 0.45, myDeath ? 'Вы пали в бою...' : 'Команда разгромлена', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#bdc3c7'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.add.text(width / 2, height * 0.55, `Волна: ${this._wave + 1}`, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    // Retry button
    const retryBg = this.add.graphics().setScrollFactor(0).setDepth(101);
    retryBg.fillStyle(0xe74c3c, 1);
    retryBg.fillRoundedRect(width / 2 - 120, height * 0.66 - 25, 240, 50, 12);

    this.add.text(width / 2, height * 0.66, 'ПОПРОБОВАТЬ СНОВА', {
      fontSize: '18px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102)
      .setInteractive()
      .on('pointerup', () => {
        netClient.disconnect();
        this.scene.start('MenuScene');
      });

    // Kicking enemies animation
    this._enemies.forEach(e => {
      if (e.gfx) {
        this.tweens.add({
          targets: e.gfx.container,
          scaleX: 2, scaleY: 2,
          alpha: 0,
          duration: 800,
          ease: 'Power2'
        });
      }
    });
  }

  _onVictory() {
    if (this._victory) return;
    this._victory = true;
    this._paused = true;

    const { width, height } = this.scale;

    // Fireworks
    for (let i = 0; i < 30; i++) {
      this.time.delayedCall(i * 100, () => {
        const x = Math.random() * width;
        const y = Math.random() * height * 0.6;
        this._spawnDeathParticles(x, y, [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71][Math.floor(Math.random() * 4)]);
      });
    }

    const overlay = this.add.graphics().setScrollFactor(0).setDepth(100);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    this.add.text(width / 2, height * 0.28, 'ПОБЕДА!', {
      fontSize: '56px',
      fontFamily: 'Arial Black, Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.add.text(width / 2, height * 0.42, 'Все 10 волн пройдены!', {
      fontSize: '22px',
      fontFamily: 'Arial',
      color: '#ecf0f1'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.add.text(width / 2, height * 0.52, `Уровень: ${this._myPlayer?.level || 1}`, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    const menuBg = this.add.graphics().setScrollFactor(0).setDepth(101);
    menuBg.fillStyle(0x27ae60, 1);
    menuBg.fillRoundedRect(width / 2 - 110, height * 0.63 - 25, 220, 50, 12);

    this.add.text(width / 2, height * 0.63, 'В ГЛАВНОЕ МЕНЮ', {
      fontSize: '18px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102)
      .setInteractive()
      .on('pointerup', () => {
        netClient.disconnect();
        this.scene.start('MenuScene');
      });
  }

  // ─── HUD ──────────────────────────────────────────────────────────

  _createHUD(width, height) {
    const hudDepth = 50;

    // Top bar background
    const topBarBg = this.add.graphics().setScrollFactor(0).setDepth(hudDepth - 1);
    topBarBg.fillStyle(0x000000, 0.5);
    topBarBg.fillRect(0, 0, width, 62);

    // HP bar (top-left)
    const hpLabel = this.add.text(10, 10, 'HP', {
      fontSize: '12px', fontFamily: 'Arial Black, Arial', color: '#e74c3c'
    }).setScrollFactor(0).setDepth(hudDepth);

    this._hudHPBarBg = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    this._hudHPBarBg.fillStyle(0x2c3e50, 1);
    this._hudHPBarBg.fillRoundedRect(30, 12, 140, 14, 5);

    this._hudHPBar = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);

    this._hudHPText = this.add.text(175, 10, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ecf0f1'
    }).setScrollFactor(0).setDepth(hudDepth);

    // XP bar
    const xpLabel = this.add.text(10, 32, 'XP', {
      fontSize: '12px', fontFamily: 'Arial Black, Arial', color: '#3498db'
    }).setScrollFactor(0).setDepth(hudDepth);

    this._hudXPBarBg = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    this._hudXPBarBg.fillStyle(0x2c3e50, 1);
    this._hudXPBarBg.fillRoundedRect(30, 34, 140, 10, 4);

    this._hudXPBar = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);

    this._hudLevelText = this.add.text(175, 30, 'Ур. 1', {
      fontSize: '13px', fontFamily: 'Arial Black, Arial', color: '#f1c40f'
    }).setScrollFactor(0).setDepth(hudDepth);

    // Wave display (top-right)
    this._hudWaveText = this.add.text(width - 10, 10, 'Волна 1/10', {
      fontSize: '16px', fontFamily: 'Arial Black, Arial',
      color: '#ecf0f1', stroke: '#000', strokeThickness: 2
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hudDepth);

    this._hudStatusText = this.add.text(width - 10, 34, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#7f8c8d'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(hudDepth);

    this._updateHUD();
    this._updateHUDWave();
  }

  _updateHUD() {
    const p = this._myPlayer;
    if (!p) return;

    // HP bar
    const hpPct = Math.max(0, p.hp / p.maxHp);
    const hpColor = hpPct > 0.6 ? 0x2ecc71 : hpPct > 0.3 ? 0xf39c12 : 0xe74c3c;
    this._hudHPBar.clear();
    this._hudHPBar.fillStyle(hpColor, 1);
    this._hudHPBar.fillRoundedRect(30, 12, 140 * hpPct, 14, 5);
    this._hudHPText.setText(`${Math.ceil(p.hp)}/${p.maxHp}`);

    // XP bar
    const xpPct = p.xp / p.xpToNext;
    this._hudXPBar.clear();
    this._hudXPBar.fillStyle(0x3498db, 1);
    this._hudXPBar.fillRoundedRect(30, 34, 140 * xpPct, 10, 4);
    this._hudLevelText.setText(`Ур. ${p.level}`);
  }

  _updateHUDWave() {
    this._hudWaveText.setText(`Волна ${this._wave + 1}/10`);
  }

  _showWaveBanner(waveIndex) {
    const { width, height } = this.scale;
    const isBoss = waveIndex === 9;

    const bannerBg = this.add.graphics().setScrollFactor(0).setDepth(80);
    bannerBg.fillStyle(isBoss ? 0x8b0000 : 0x000000, 0.75);
    bannerBg.fillRect(0, height * 0.35, width, 90);

    const waveText = this.add.text(width / 2, height * 0.38, `ВОЛНА ${waveIndex + 1}`, {
      fontSize: '40px',
      fontFamily: 'Arial Black, Arial',
      color: isBoss ? '#ff4444' : '#f1c40f',
      stroke: '#000',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);

    const subText = this.add.text(width / 2, height * 0.43, isBoss ? '⚠ ФИНАЛЬНЫЙ БОСС ⚠' : `Приготовься!`, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ecf0f1'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);

    this.tweens.add({
      targets: [bannerBg, waveText, subText],
      alpha: { from: 0, to: 1 },
      duration: 400
    });

    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: [bannerBg, waveText, subText],
        alpha: { from: 1, to: 0 },
        duration: 400,
        onComplete: () => {
          bannerBg.destroy();
          waveText.destroy();
          subText.destroy();
        }
      });
    });
  }

  _showUpgradeFlash(name) {
    const { width, height } = this.scale;
    const text = this.add.text(width / 2, height * 0.15, `+ ${name}`, {
      fontSize: '22px',
      fontFamily: 'Arial Black, Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90);

    this.tweens.add({
      targets: text,
      y: height * 0.08,
      alpha: { from: 1, to: 0 },
      duration: 1500,
      ease: 'Power2',
      onComplete: () => text.destroy()
    });
  }

  // ─── VIRTUAL JOYSTICK ─────────────────────────────────────────────

  _createJoystick(width, height) {
    const joyRadius = 55;
    const joyX = 80;
    const joyY = height - 90;

    this._joystickBaseX = joyX;
    this._joystickBaseY = joyY;
    this._joystickRadius = joyRadius;

    // Base ring
    this._joyBasGfx = this.add.graphics().setScrollFactor(0).setDepth(60);
    this._joyBasGfx.lineStyle(3, 0xffffff, 0.2);
    this._joyBasGfx.strokeCircle(joyX, joyY, joyRadius);
    this._joyBasGfx.fillStyle(0xffffff, 0.06);
    this._joyBasGfx.fillCircle(joyX, joyY, joyRadius);

    // Stick
    this._joyStickGfx = this.add.graphics().setScrollFactor(0).setDepth(61);
    this._drawJoyStick(0, 0);
  }

  _drawJoyStick(dx, dy) {
    const gfx = this._joyStickGfx;
    if (!gfx) return;
    gfx.clear();
    const x = this._joystickBaseX + dx;
    const y = this._joystickBaseY + dy;
    gfx.fillStyle(0xffffff, 0.35);
    gfx.fillCircle(x, y, 28);
    gfx.lineStyle(2, 0xffffff, 0.6);
    gfx.strokeCircle(x, y, 28);
  }

  _onPointerDown(pointer) {
    const { width, height } = this.scale;

    // Check if in joystick zone (left half, bottom area)
    if (pointer.x < width * 0.55 && pointer.y > height * 0.55) {
      if (!this._joystickActive) {
        this._joystickActive = true;
        this._joystickPointerId = pointer.id;
        this._joystickBase = { x: pointer.x, y: pointer.y };

        // Move base to tap position
        this._joystickBaseX = pointer.x;
        this._joystickBaseY = pointer.y;

        if (this._joyBasGfx) {
          this._joyBasGfx.clear();
          this._joyBasGfx.lineStyle(3, 0xffffff, 0.25);
          this._joyBasGfx.strokeCircle(pointer.x, pointer.y, this._joystickRadius);
          this._joyBasGfx.fillStyle(0xffffff, 0.07);
          this._joyBasGfx.fillCircle(pointer.x, pointer.y, this._joystickRadius);
        }

        this._drawJoyStick(0, 0);
      }
    }
  }

  _onPointerMove(pointer) {
    if (!this._joystickActive || pointer.id !== this._joystickPointerId) return;

    const dx = pointer.x - this._joystickBase.x;
    const dy = pointer.y - this._joystickBase.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampDist = Math.min(dist, this._joystickRadius);
    const angle = Math.atan2(dy, dx);

    const sdx = Math.cos(angle) * clampDist;
    const sdy = Math.sin(angle) * clampDist;

    this._joystickDelta.x = dx / (this._joystickRadius || 55);
    this._joystickDelta.y = dy / (this._joystickRadius || 55);

    // Clamp to unit length
    const mag = Math.sqrt(this._joystickDelta.x ** 2 + this._joystickDelta.y ** 2);
    if (mag > 1) {
      this._joystickDelta.x /= mag;
      this._joystickDelta.y /= mag;
    }

    this._drawJoyStick(sdx, sdy);
  }

  _onPointerUp(pointer) {
    if (pointer.id === this._joystickPointerId) {
      this._joystickActive = false;
      this._joystickPointerId = null;
      this._joystickDelta = { x: 0, y: 0 };
      this._drawJoyStick(0, 0);
    }
  }

  // ─── MAIN UPDATE LOOP ─────────────────────────────────────────────

  update(time, delta) {
    if (this._solo) {
      this._updateSoloGame(delta);
    } else {
      this._updateNetworkGame(delta);
    }
  }

  _updateNetworkGame(delta) {
    if (!this._myPlayer || !netClient.connected) return;

    // Send input to server at ~30Hz
    if (!this._lastInputSend || Date.now() - this._lastInputSend > 33) {
      netClient.sendInput(this._joystickDelta.x, this._joystickDelta.y);
      this._lastInputSend = Date.now();
    }

    // Client-side interpolation for smooth rendering
    // (already handled by server state updates in _onNetworkGameState)

    this._updateHUD();
  }

  shutdown() {
    this._unsubscribers.forEach(fn => typeof fn === 'function' && fn());
    this._unsubscribers = [];
    this.input.off('pointerdown', this._onPointerDown, this);
    this.input.off('pointermove', this._onPointerMove, this);
    this.input.off('pointerup', this._onPointerUp, this);
  }
}
