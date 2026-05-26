import { useState, useEffect, useRef } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';
import WinScreen from './components/WinScreen';
import './App.css';

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | game | win
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [wsReady, setWsReady] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    return () => ws.close();
  }, []);

  function handleReady(rid, pid) {
    setRoomId(rid);
    setPlayerId(pid);
    setScreen('game');
  }

  function handleWin() {
    setScreen('win');
  }

  function handlePartnerLeft() {
    alert('Партнёр отключился. Возвращаемся в лобби.');
    setScreen('lobby');
  }

  function handleRestart() {
    // Reconnect WebSocket and go back to lobby
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    setPlayerId(null);
    setRoomId('');
    setScreen('lobby');
  }

  if (!wsReady) {
    return (
      <div className="connecting">
        <div className="connecting-box">
          <div className="spinner"></div>
          <p>Подключаемся к серверу...</p>
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    return <Lobby ws={wsRef.current} onReady={handleReady} />;
  }

  if (screen === 'game') {
    return (
      <div className="game-wrapper">
        <Game
          ws={wsRef.current}
          playerId={playerId}
          roomId={roomId}
          onGameWon={handleWin}
          onPartnerLeft={handlePartnerLeft}
        />
      </div>
    );
  }

  if (screen === 'win') {
    return <WinScreen onRestart={handleRestart} />;
  }
}
