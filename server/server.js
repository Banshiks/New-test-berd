const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const rooms = new Map();
const TOTAL_LEVELS = 3;

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let currentPlayerId = null;

  function send(data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  function broadcastToRoom(data, excludeSelf = false) {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.players.forEach((player) => {
      if (excludeSelf && player.ws === ws) return;
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(data));
      }
    });
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'create_room': {
        let roomId;
        do { roomId = generateRoomId(); } while (rooms.has(roomId));

        const room = {
          id: roomId,
          players: [{ id: 1, ws }],
          finishedPlayers: new Set(),
          currentLevel: 0,
        };
        rooms.set(roomId, room);
        currentRoomId = roomId;
        currentPlayerId = 1;

        send({ type: 'room_created', roomId, playerId: 1 });
        break;
      }

      case 'join_room': {
        const roomId = (msg.roomId || '').toUpperCase().trim();
        const room = rooms.get(roomId);

        if (!room) {
          send({ type: 'error', message: 'Комната не найдена' });
          return;
        }
        if (room.players.length >= 2) {
          send({ type: 'error', message: 'Комната заполнена' });
          return;
        }

        room.players.push({ id: 2, ws });
        currentRoomId = roomId;
        currentPlayerId = 2;

        send({ type: 'room_joined', roomId, playerId: 2 });
        room.players.forEach((p) => {
          if (p.id === 1) p.ws.send(JSON.stringify({ type: 'partner_joined' }));
        });
        break;
      }

      case 'player_update': {
        broadcastToRoom(
          { type: 'partner_update', x: msg.x, y: msg.y, facing: msg.facing },
          true,
        );
        break;
      }

      case 'player_finished': {
        const room = rooms.get(currentRoomId);
        if (!room) return;
        if (msg.level !== room.currentLevel) return;

        room.finishedPlayers.add(currentPlayerId);
        broadcastToRoom({ type: 'partner_finished' }, true);

        if (room.finishedPlayers.size >= 2) {
          room.finishedPlayers.clear();
          room.currentLevel++;

          if (room.currentLevel >= TOTAL_LEVELS) {
            broadcastToRoom({ type: 'game_won' });
          } else {
            broadcastToRoom({ type: 'next_level', level: room.currentLevel });
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoomId) {
      broadcastToRoom({ type: 'partner_disconnected' }, true);
      rooms.delete(currentRoomId);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game server: http://localhost:${PORT}`));
