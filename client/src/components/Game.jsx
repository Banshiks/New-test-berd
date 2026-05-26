import { useEffect, useRef, useCallback, useState } from 'react';
import { LEVELS } from '../constants/levels';
import {
  GRAVITY, JUMP_VELOCITY, PLAYER_SPEED, PLAYER_WIDTH, PLAYER_HEIGHT,
  CANVAS_WIDTH, CANVAS_HEIGHT, SEND_INTERVAL,
} from '../constants/gameConfig';

// ─── Physics helpers ──────────────────────────────────────────────────────────

function makePlayer(spawnX, spawnY) {
  return { x: spawnX, y: spawnY, vx: 0, vy: 0, onGround: false, facing: 1 };
}

function overlaps(px, py, plat) {
  return (
    px < plat.x + plat.w &&
    px + PLAYER_WIDTH > plat.x &&
    py < plat.y + plat.h &&
    py + PLAYER_HEIGHT > plat.y
  );
}

function updatePlayerPhysics(player, platforms, keys) {
  const left = keys['ArrowLeft'] || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const jump = keys['ArrowUp'] || keys['KeyW'] || keys['Space'];

  if (left) { player.vx = -PLAYER_SPEED; player.facing = -1; }
  else if (right) { player.vx = PLAYER_SPEED; player.facing = 1; }
  else player.vx = 0;

  if (jump && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }

  // Horizontal step + resolve
  player.x += player.vx;
  player.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, player.x));
  for (const plat of platforms) {
    if (overlaps(player.x, player.y, plat)) {
      if (player.vx > 0) player.x = plat.x - PLAYER_WIDTH;
      else if (player.vx < 0) player.x = plat.x + plat.w;
      player.vx = 0;
    }
  }

  // Vertical step + resolve
  player.vy = Math.min(player.vy + GRAVITY, 16);
  player.onGround = false;
  player.y += player.vy;
  for (const plat of platforms) {
    if (overlaps(player.x, player.y, plat)) {
      if (player.vy > 0) {
        player.y = plat.y - PLAYER_HEIGHT;
        player.onGround = true;
      } else {
        player.y = plat.y + plat.h;
      }
      player.vy = 0;
    }
  }
}

function touchesFinish(player, finish) {
  return (
    player.x + PLAYER_WIDTH > finish.x + 6 &&
    player.x < finish.x + finish.w - 6 &&
    player.y + PLAYER_HEIGHT > finish.y + 10 &&
    player.y < finish.y + finish.h
  );
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawBg(ctx, level) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  g.addColorStop(0, level.bgTop);
  g.addColorStop(1, level.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawPlatform(ctx, plat, level) {
  ctx.fillStyle = level.platformColor;
  ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
  ctx.fillStyle = level.platformTop;
  ctx.fillRect(plat.x, plat.y, plat.w, Math.min(8, plat.h));
  // Small decorative dots
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 20; i < plat.w - 10; i += 30) {
    ctx.fillRect(plat.x + i, plat.y + 3, 4, 2);
  }
}

function drawFinishFlag(ctx, finish, tick) {
  const cx = finish.x + finish.w / 2;
  const base = finish.y + finish.h;
  const top = finish.y + 8;

  // Pole
  ctx.strokeStyle = '#CFD8DC';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, base);
  ctx.lineTo(cx, top);
  ctx.stroke();

  // Waving flag
  const wave = Math.sin(tick * 0.07) * 4;
  ctx.fillStyle = '#FF4081';
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx + 16 + wave, top + 10, cx + 30, top + 5);
  ctx.quadraticCurveTo(cx + 16 + wave, top + 20, cx, top + 18);
  ctx.closePath();
  ctx.fill();

  // Glow ring
  const pulse = 1 + Math.sin(tick * 0.05) * 0.12;
  const grd = ctx.createRadialGradient(cx, base, 5, cx, base, 30 * pulse);
  grd.addColorStop(0, 'rgba(255,64,129,0.35)');
  grd.addColorStop(1, 'rgba(255,64,129,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, base, 30 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Star label
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ФИНИШ', cx, base + 14);
}

function drawPlayer(ctx, x, y, facing, isMe, tick) {
  const w = PLAYER_WIDTH;
  const h = PLAYER_HEIGHT;

  ctx.save();
  ctx.translate(Math.round(x + w / 2), Math.round(y + h / 2));
  if (facing === -1) ctx.scale(-1, 1);
  ctx.translate(-w / 2, -h / 2);

  const skinColor = '#FFDAB9';
  const hairColor = isMe ? '#AD1457' : '#0D47A1';
  const shirtColor = isMe ? '#E91E63' : '#1E88E5';
  const pantsColor = isMe ? '#880E4F' : '#0A237A';
  const shoeColor = '#263238';

  // Shoes
  ctx.fillStyle = shoeColor;
  ctx.fillRect(2, h - 8, 12, 8);
  ctx.fillRect(w - 14, h - 8, 12, 8);

  // Pants
  ctx.fillStyle = pantsColor;
  ctx.fillRect(3, h * 0.55, w / 2 - 4, h * 0.4);
  ctx.fillRect(w / 2 + 1, h * 0.55, w / 2 - 4, h * 0.4);

  // Shirt/body
  ctx.fillStyle = shirtColor;
  ctx.fillRect(2, h * 0.28, w - 4, h * 0.3);

  // Arms
  ctx.fillStyle = skinColor;
  ctx.fillRect(-5, h * 0.28, 7, h * 0.22);
  ctx.fillRect(w - 2, h * 0.28, 7, h * 0.22);

  // Neck
  ctx.fillStyle = skinColor;
  ctx.fillRect(w / 2 - 4, h * 0.2, 8, h * 0.1);

  // Head
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.13, w * 0.36, h * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.07, w * 0.37, h * 0.13, 0, 0, Math.PI);
  ctx.fill();
  if (!isMe) {
    // Boy hair side tuft
    ctx.fillRect(w - 5, h * 0.04, 5, h * 0.1);
  } else {
    // Girl ponytail
    ctx.beginPath();
    ctx.ellipse(w - 2, h * 0.12, 5, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye
  ctx.fillStyle = '#1A1A1A';
  ctx.beginPath();
  ctx.arc(w * 0.64, h * 0.12, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyelash (girl only)
  if (isMe) {
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.64, h * 0.095);
    ctx.lineTo(w * 0.68, h * 0.075);
    ctx.stroke();
  }

  // Blush
  ctx.fillStyle = isMe ? 'rgba(255,100,120,0.45)' : 'rgba(100,160,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.76, h * 0.17, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(w / 2 + 3, h * 0.17, 4, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.restore();
}

function drawHUD(ctx, myFinished, partnerFinished, level, total, levelName, isMe) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, 38);

  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(levelName, CANVAS_WIDTH / 2, 25);

  ctx.font = '13px Arial';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFF';
  ctx.fillText(`Уровень ${level + 1} / ${total}`, 10, 25);

  const p1Label = isMe ? 'Ты' : 'Партнёр';
  const p2Label = isMe ? 'Партнёр' : 'Ты';

  ctx.textAlign = 'right';
  ctx.fillStyle = myFinished ? '#69F0AE' : '#FFF';
  ctx.fillText(`${p1Label}: ${myFinished ? '✓' : '○'}`, CANVAS_WIDTH - 90, 25);
  ctx.fillStyle = partnerFinished ? '#69F0AE' : '#FFF';
  ctx.fillText(`${p2Label}: ${partnerFinished ? '✓' : '○'}`, CANVAS_WIDTH - 5, 25);
}

function drawWaitingOverlay(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 - 45, 320, 90);
  ctx.strokeStyle = '#FF4081';
  ctx.lineWidth = 2;
  ctx.strokeRect(CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT / 2 - 45, 320, 90);

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Ждём партнёра...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#FFB3C1';
  ctx.fillText('Ты уже на финише! Молодец!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
}

function drawControls(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, CANVAS_HEIGHT - 28, 280, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Управление: WASD / Стрелки | Прыжок: W / ↑ / Space', 8, CANVAS_HEIGHT - 10);
}

// ─── Game component ───────────────────────────────────────────────────────────

export default function Game({ ws, playerId, roomId, onGameWon, onPartnerLeft }) {
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const stateRef = useRef({
    level: 0,
    me: null,
    partner: null,
    myFinished: false,
    partnerFinished: false,
    tick: 0,
  });
  const rafRef = useRef(null);

  const initLevel = useCallback((levelIdx) => {
    const lvl = LEVELS[levelIdx];
    const mySpawn = playerId === 1 ? lvl.spawn1 : lvl.spawn2;
    const partnerSpawn = playerId === 1 ? lvl.spawn2 : lvl.spawn1;
    stateRef.current = {
      level: levelIdx,
      me: makePlayer(mySpawn.x, mySpawn.y),
      partner: makePlayer(partnerSpawn.x, partnerSpawn.y),
      myFinished: false,
      partnerFinished: false,
      tick: 0,
    };
  }, [playerId]);

  // WebSocket messages
  useEffect(() => {
    if (!ws) return;
    const handle = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const s = stateRef.current;
      switch (msg.type) {
        case 'partner_update':
          if (s.partner) {
            s.partner.x = msg.x;
            s.partner.y = msg.y;
            s.partner.facing = msg.facing;
          }
          break;
        case 'partner_finished':
          s.partnerFinished = true;
          break;
        case 'next_level':
          initLevel(msg.level);
          break;
        case 'game_won':
          onGameWon?.();
          break;
        case 'partner_disconnected':
          onPartnerLeft?.();
          break;
      }
    };
    ws.addEventListener('message', handle);
    return () => ws.removeEventListener('message', handle);
  }, [ws, initLevel, onGameWon, onPartnerLeft]);

  // Keyboard
  useEffect(() => {
    const down = (e) => { keysRef.current[e.code] = true; e.preventDefault(); };
    const up = (e) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Game loop
  useEffect(() => {
    initLevel(0);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let lastSend = 0;

    const loop = (ts) => {
      const s = stateRef.current;
      const lvl = LEVELS[s.level];

      if (s.me && !s.myFinished) {
        updatePlayerPhysics(s.me, lvl.platforms, keysRef.current);

        // Fell off bottom → respawn
        if (s.me.y > CANVAS_HEIGHT + 60) {
          const sp = playerId === 1 ? lvl.spawn1 : lvl.spawn2;
          s.me.x = sp.x; s.me.y = sp.y; s.me.vx = 0; s.me.vy = 0;
        }

        // Send position
        if (ts - lastSend > SEND_INTERVAL && ws?.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'player_update',
            x: Math.round(s.me.x),
            y: Math.round(s.me.y),
            facing: s.me.facing,
          }));
          lastSend = ts;
        }

        // Finish check
        if (!s.myFinished && touchesFinish(s.me, lvl.finish)) {
          s.myFinished = true;
          ws?.send(JSON.stringify({ type: 'player_finished', level: s.level }));
        }
      }

      s.tick++;

      // Render
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawBg(ctx, lvl);
      lvl.platforms.forEach((p) => drawPlatform(ctx, p, lvl));
      drawFinishFlag(ctx, lvl.finish, s.tick);
      if (s.partner) drawPlayer(ctx, s.partner.x, s.partner.y, s.partner.facing ?? 1, false, s.tick);
      if (s.me) drawPlayer(ctx, s.me.x, s.me.y, s.me.facing, true, s.tick);
      drawHUD(ctx, s.myFinished, s.partnerFinished, s.level, LEVELS.length, lvl.name, true);
      if (s.myFinished && !s.partnerFinished) drawWaitingOverlay(ctx);
      drawControls(ctx);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ws, playerId, initLevel]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ display: 'block', borderRadius: 10, boxShadow: '0 0 32px rgba(0,0,0,0.6)' }}
      />
      <div style={{
        position: 'absolute', bottom: 32, right: 8,
        background: 'rgba(0,0,0,0.55)', color: '#FFF',
        padding: '4px 10px', borderRadius: 6, fontSize: 12,
      }}>
        {playerId === 1 ? '❤️ Игрок 1' : '💙 Игрок 2'} | Комната: <strong>{roomId}</strong>
      </div>
    </div>
  );
}
