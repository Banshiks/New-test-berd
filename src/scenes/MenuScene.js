// MenuScene - main menu with room creation/joining
import { NetClient, netClient } from '../network/NetClient.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this._unsubscribers = [];
  }

  create() {
    const { width, height } = this.scale;

    this._drawBackground(width, height);
    this._drawTitle(width, height);
    this._drawButtons(width, height);
    this._setupNetworkHandlers();
  }

  _drawBackground(width, height) {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    // Animated particle stars
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 0.3;
      const star = this.add.graphics();
      star.fillStyle(0xffffff, Math.random() * 0.6 + 0.1);
      star.fillCircle(x, y, size);

      // Twinkle animation
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: 0.05 },
        duration: Phaser.Math.Between(1000, 3000),
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000
      });
    }

    // Gradient overlay at bottom
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x1a0a2e, 0x1a0a2e, 0.8);
    grad.fillRect(0, height * 0.5, width, height * 0.5);
  }

  _drawTitle(width, height) {
    // Glow circle behind title
    const glow = this.add.graphics();
    glow.fillStyle(0x9b59b6, 0.12);
    glow.fillCircle(width / 2, height * 0.2, 140);

    const title1 = this.add.text(width / 2, height * 0.15, 'ВЫЖИВАНИЕ', {
      fontSize: '38px',
      fontFamily: 'Arial Black, Arial',
      color: '#e74c3c',
      stroke: '#000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const title2 = this.add.text(width / 2, height * 0.25, 'ВАМПИРОВ', {
      fontSize: '30px',
      fontFamily: 'Arial Black, Arial',
      color: '#9b59b6',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height * 0.34, 'Кооператив • 2 игрока', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5);

    // Pulse animation on title
    this.tweens.add({
      targets: title1,
      scaleX: { from: 1, to: 1.03 },
      scaleY: { from: 1, to: 1.03 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  _drawButtons(width, height) {
    // Create Room button
    this._createBtn = this._makeButton(
      width / 2,
      height * 0.52,
      'СОЗДАТЬ КОМНАТУ',
      0xe74c3c,
      () => this._onCreateRoom()
    );

    // Join Room button
    this._joinBtn = this._makeButton(
      width / 2,
      height * 0.64,
      'ВОЙТИ В КОМНАТУ',
      0x3498db,
      () => this._onJoinRoom()
    );

    // Solo Play button
    this._soloBtn = this._makeButton(
      width / 2,
      height * 0.76,
      'ОДИНОЧНАЯ ИГРА',
      0x27ae60,
      () => this._onSoloPlay()
    );

    // Status text
    this._statusText = this.add.text(width / 2, height * 0.88, '', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#bdc3c7',
      align: 'center'
    }).setOrigin(0.5);

    // Room code display (hidden initially)
    this._roomCodeBg = this.add.graphics();
    this._roomCodeText = this.add.text(width / 2, height * 0.88, '', {
      fontSize: '28px',
      fontFamily: 'Arial Black, Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5).setVisible(false);

    // Input field for room code join
    this._inputField = null;
    this._joinCode = '';
  }

  _makeButton(x, y, label, color, callback) {
    const w = 260, h = 50;
    const btn = this.add.graphics();

    const draw = (pressed) => {
      btn.clear();
      const alpha = pressed ? 0.9 : 1;
      // Darken by reducing each channel by ~20%
      const r = ((color >> 16) & 0xff) * (pressed ? 0.75 : 1);
      const g = ((color >> 8) & 0xff) * (pressed ? 0.75 : 1);
      const b = (color & 0xff) * (pressed ? 0.75 : 1);
      const bgColor = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
      btn.fillStyle(bgColor, alpha);
      btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
      btn.lineStyle(2, 0xffffff, 0.3);
      btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    };

    draw(false);

    const text = this.add.text(x, y, label, {
      fontSize: '18px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Hit zone
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => { draw(true); });
    zone.on('pointerup', () => { draw(false); callback(); });
    zone.on('pointerout', () => { draw(false); });

    return { btn, text, zone };
  }

  _setupNetworkHandlers() {
    const unsub1 = netClient.on('room_created', (msg) => {
      this._setStatus(`Комната создана! Код: ${msg.code}`);
      this._showRoomCode(msg.code);
    });

    const unsub2 = netClient.on('room_joined', (msg) => {
      this._setStatus('Подключено к комнате!');
      // Go to character select
      this.time.delayedCall(300, () => {
        this.scene.start('CharSelectScene', {
          roomCode: msg.code,
          playerIndex: msg.playerIndex,
          isHost: false
        });
      });
    });

    const unsub3 = netClient.on('player_joined', (msg) => {
      this._setStatus('Второй игрок подключился!');
      this.time.delayedCall(800, () => {
        this.scene.start('CharSelectScene', {
          roomCode: netClient.roomCode,
          playerIndex: 0,
          isHost: true
        });
      });
    });

    const unsub4 = netClient.on('server_error', (msg) => {
      this._setStatus(`Ошибка: ${msg.message || 'Неизвестная ошибка'}`);
    });

    this._unsubscribers = [unsub1, unsub2, unsub3, unsub4];
  }

  _showRoomCode(code) {
    const { width, height } = this.scale;
    this._roomCodeText
      .setText(`КОД: ${code}`)
      .setVisible(true)
      .setY(height * 0.88);

    this._setStatus('Ожидание второго игрока...');
  }

  _setStatus(msg) {
    this._statusText.setText(msg);
  }

  async _onCreateRoom() {
    this._setStatus('Подключение к серверу...');
    try {
      const url = NetClient.getDefaultServerUrl();
      await netClient.connect(url);
      netClient.createRoom('warrior'); // Will change in CharSelect
    } catch (e) {
      this._setStatus('Не удалось подключиться к серверу');
      console.error(e);
    }
  }

  _onJoinRoom() {
    // Show input prompt overlay
    this._showJoinInput();
  }

  _onSoloPlay() {
    // Start solo game without network
    this.scene.start('CharSelectScene', {
      roomCode: null,
      playerIndex: 0,
      isHost: true,
      solo: true
    });
  }

  _showJoinInput() {
    const { width, height } = this.scale;

    // Overlay background
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, width, height);

    const panel = this.add.graphics();
    panel.fillStyle(0x1a1a2e, 1);
    panel.fillRoundedRect(width / 2 - 160, height / 2 - 120, 320, 240, 16);
    panel.lineStyle(2, 0x9b59b6, 1);
    panel.strokeRoundedRect(width / 2 - 160, height / 2 - 120, 320, 240, 16);

    const title = this.add.text(width / 2, height / 2 - 90, 'Введите код комнаты', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ecf0f1'
    }).setOrigin(0.5);

    // Code display
    let code = '';
    const codeDisplay = this.add.text(width / 2, height / 2 - 30, '____', {
      fontSize: '48px',
      fontFamily: 'Arial Black, Arial',
      color: '#f1c40f',
      letterSpacing: 12
    }).setOrigin(0.5);

    // Virtual keyboard: A-Z rows
    const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const keySize = 38;
    const keysPerRow = 7;
    const startX = width / 2 - (keysPerRow * keySize) / 2 + keySize / 2;

    // Just show 4 large buttons: input via keyboard hint
    const hint = this.add.text(width / 2, height / 2 + 20, 'Код из 4 букв (A-Z)', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5);

    // Backspace and confirm buttons
    const backBtn = this._makeSimpleBtn(width / 2 - 70, height / 2 + 65, '← DEL', 0x7f8c8d, () => {
      if (code.length > 0) {
        code = code.slice(0, -1);
        codeDisplay.setText(code.padEnd(4, '_'));
      }
    });

    const confirmBtn = this._makeSimpleBtn(width / 2 + 70, height / 2 + 65, 'ВОЙТИ', 0x27ae60, async () => {
      if (code.length !== 4) return;
      overlay.destroy(); panel.destroy(); title.destroy();
      codeDisplay.destroy(); hint.destroy();
      backBtn.btn.destroy(); backBtn.text.destroy(); backBtn.zone.destroy();
      confirmBtn.btn.destroy(); confirmBtn.text.destroy(); confirmBtn.zone.destroy();
      letterBtns.forEach(b => { b.btn.destroy(); b.text.destroy(); b.zone.destroy(); });

      this._setStatus('Подключение...');
      try {
        const url = NetClient.getDefaultServerUrl();
        await netClient.connect(url);
        netClient.joinRoom(code, 'warrior');
      } catch (e) {
        this._setStatus('Не удалось подключиться к серверу');
      }
    });

    // Letter buttons grid (A-Z in grid)
    const letterBtns = [];
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const cols = 9;
    const btnW = 32, btnH = 32;
    const gridStartX = width / 2 - (cols * (btnW + 2)) / 2 + btnW / 2;
    const gridStartY = height / 2 - 75;

    letters.forEach((letter, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = gridStartX + col * (btnW + 2);
      const by = gridStartY + row * (btnH + 4);

      const lb = this._makeSimpleBtn(bx, by, letter, 0x2c3e50, () => {
        if (code.length < 4) {
          code += letter;
          codeDisplay.setText(code.padEnd(4, '_'));
        }
      }, btnW, btnH, '14px');
      letterBtns.push(lb);
    });
  }

  _makeSimpleBtn(x, y, label, color, callback, w = 100, h = 40, fontSize = '15px') {
    const btn = this.add.graphics();
    btn.fillStyle(color, 1);
    btn.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    btn.lineStyle(1, 0xffffff, 0.2);
    btn.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

    const text = this.add.text(x, y, label, {
      fontSize,
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h).setInteractive();
    zone.on('pointerup', callback);

    return { btn, text, zone };
  }

  shutdown() {
    this._unsubscribers.forEach(fn => typeof fn === 'function' && fn());
    this._unsubscribers = [];
  }
}
