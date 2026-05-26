// WebSocket network client wrapper
export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.playerIndex = 0; // 0 or 1

    this._listeners = {};
    this._reconnectTimer = null;
    this._serverUrl = null;
  }

  connect(serverUrl) {
    this._serverUrl = serverUrl;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          this.connected = true;
          console.log('[NetClient] Connected to', serverUrl);
          resolve();
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          console.log('[NetClient] Disconnected', event.code, event.reason);
          this._emit('disconnected', { code: event.code, reason: event.reason });
        };

        this.ws.onerror = (error) => {
          console.error('[NetClient] WebSocket error', error);
          if (!this.connected) {
            reject(error);
          }
          this._emit('error', error);
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._handleMessage(msg);
          } catch (e) {
            console.error('[NetClient] Failed to parse message', e);
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
  }

  send(type, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[NetClient] Cannot send, not connected');
      return false;
    }
    const msg = JSON.stringify({ type, ...data });
    this.ws.send(msg);
    return true;
  }

  // Room management
  createRoom(characterId) {
    this.send('create_room', { characterId });
  }

  joinRoom(code, characterId) {
    this.send('join_room', { code, characterId });
  }

  sendInput(dx, dy) {
    this.send('input', { dx, dy });
  }

  sendAbility() {
    this.send('ability');
  }

  sendUpgrade(upgradeId) {
    this.send('upgrade', { upgradeId });
  }

  sendReady() {
    this.send('ready');
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code;
        this.playerId = msg.playerId;
        this.playerIndex = 0;
        this._emit('room_created', msg);
        break;

      case 'room_joined':
        this.roomCode = msg.code;
        this.playerId = msg.playerId;
        this.playerIndex = msg.playerIndex;
        this._emit('room_joined', msg);
        break;

      case 'player_joined':
        this._emit('player_joined', msg);
        break;

      case 'game_start':
        this._emit('game_start', msg);
        break;

      case 'game_state':
        this._emit('game_state', msg);
        break;

      case 'wave_start':
        this._emit('wave_start', msg);
        break;

      case 'level_up':
        this._emit('level_up', msg);
        break;

      case 'game_over':
        this._emit('game_over', msg);
        break;

      case 'victory':
        this._emit('victory', msg);
        break;

      case 'error':
        this._emit('server_error', msg);
        break;

      default:
        this._emit(msg.type, msg);
    }
  }

  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error('[NetClient] Handler error for', event, e);
        }
      });
    }
  }

  // Get the WebSocket server URL based on current page URL
  static getDefaultServerUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = 4000;
    return `${protocol}//${host}:${port}`;
  }
}

// Singleton instance
export const netClient = new NetClient();
