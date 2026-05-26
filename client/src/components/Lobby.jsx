import { useState } from 'react';

export default function Lobby({ ws, onReady }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [roomInput, setRoomInput] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [roomId, setRoomId] = useState('');

  function handleCreate() {
    setError('');
    ws.send(JSON.stringify({ type: 'create_room' }));
    setWaiting(true);

    ws.addEventListener('message', function handler(e) {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room_created') {
        setRoomId(msg.roomId);
        setMode('waiting_partner');
        setWaiting(false);
      }
      if (msg.type === 'partner_joined') {
        ws.removeEventListener('message', handler);
        onReady(msg.roomId || roomId, 1);
      }
    });
  }

  function handleJoin() {
    const code = roomInput.trim().toUpperCase();
    if (code.length < 2) { setError('Введи код комнаты'); return; }
    setError('');
    ws.send(JSON.stringify({ type: 'join_room', roomId: code }));

    ws.addEventListener('message', function handler(e) {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room_joined') {
        ws.removeEventListener('message', handler);
        onReady(msg.roomId, 2);
      }
      if (msg.type === 'error') {
        setError(msg.message);
        ws.removeEventListener('message', handler);
      }
    });
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>Вместе до финиша</h1>
        <p className="subtitle">Кооперативный платформер для двоих</p>

        {!mode && (
          <div className="buttons">
            <button className="btn-primary" onClick={() => { setMode('create'); handleCreate(); }}>
              Создать комнату
            </button>
            <button className="btn-secondary" onClick={() => setMode('join')}>
              Войти по коду
            </button>
          </div>
        )}

        {mode === 'waiting_partner' && (
          <div className="waiting-box">
            <p>Ожидаем второго игрока...</p>
            <div className="room-code">{roomId}</div>
            <p className="hint">Отправь этот код подруге</p>
            <div className="hearts">❤️ 💙</div>
          </div>
        )}

        {mode === 'join' && (
          <div className="join-box">
            <p>Введи код комнаты:</p>
            <input
              className="code-input"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="XXXX"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              autoFocus
            />
            <button className="btn-primary" onClick={handleJoin}>Войти</button>
            {error && <p className="error">{error}</p>}
          </div>
        )}

        <div className="controls-hint">
          <strong>Управление:</strong> WASD или Стрелки &nbsp;|&nbsp; Прыжок: W / ↑ / Space
        </div>
      </div>
    </div>
  );
}
