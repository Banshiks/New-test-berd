// Character Selection Scene
import { CHARACTERS } from '../data/characters.js';
import { netClient } from '../network/NetClient.js';

export class CharSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharSelectScene' });
    this._selectedChar = null;
    this._unsubscribers = [];
  }

  init(data) {
    this._roomCode = data.roomCode || null;
    this._playerIndex = data.playerIndex || 0;
    this._isHost = data.isHost !== false;
    this._solo = data.solo || false;
  }

  create() {
    const { width, height } = this.scale;

    this._drawBackground(width, height);
    this._drawTitle(width, height);
    this._drawCharacters(width, height);
    this._drawConfirmButton(width, height);
    this._setupNetworkHandlers();
  }

  _drawBackground(width, height) {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle grid pattern
    bg.lineStyle(1, 0x1a1a3e, 0.4);
    for (let x = 0; x < width; x += 40) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += 40) {
      bg.lineBetween(0, y, width, y);
    }
  }

  _drawTitle(width, height) {
    this.add.text(width / 2, height * 0.06, 'ВЫБОР ПЕРСОНАЖА', {
      fontSize: '26px',
      fontFamily: 'Arial Black, Arial',
      color: '#ecf0f1',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    if (this._roomCode) {
      this.add.text(width / 2, height * 0.12, `Комната: ${this._roomCode}`, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#f1c40f'
      }).setOrigin(0.5);
    }

    const playerLabel = this._solo ? 'Одиночная игра' : `Игрок ${this._playerIndex + 1}`;
    this.add.text(width / 2, height * 0.17, playerLabel, {
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5);
  }

  _drawCharacters(width, height) {
    const cols = 2;
    const cardW = (width - 60) / cols;
    const cardH = 165;
    const startX = 20;
    const startY = height * 0.22;
    const gap = 10;

    this._charCards = [];

    CHARACTERS.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap) + cardW / 2;
      const cy = startY + row * (cardH + gap) + cardH / 2;

      const card = this._createCharCard(cx, cy, cardW, cardH, char, i);
      this._charCards.push(card);
    });
  }

  _createCharCard(cx, cy, w, h, char, index) {
    const container = this.add.container(cx, cy);

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x16213e, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(2, 0x2c3e50, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    container.add(bg);

    // Character avatar (drawn with graphics)
    const avatar = this.add.graphics();
    this._drawCharacterSprite(avatar, 0, -30, char.id, char.color, 26);
    container.add(avatar);

    // Name
    const name = this.add.text(0, 5, char.name, {
      fontSize: '18px',
      fontFamily: 'Arial Black, Arial',
      color: char.colorHex || '#ffffff'
    }).setOrigin(0.5);
    container.add(name);

    // Description
    const desc = this.add.text(0, 25, char.description, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#7f8c8d',
      wordWrap: { width: w - 20 },
      align: 'center'
    }).setOrigin(0.5);
    container.add(desc);

    // Stats bars
    const statsY = 48;
    ['hp', 'speed', 'damage', 'range'].forEach((stat, si) => {
      const statNames = { hp: 'HP', speed: 'СКР', damage: 'УРН', range: 'ДАЛ' };
      const statX = -w / 2 + 12;
      const statBarY = statsY + si * 14;

      const statLabel = this.add.text(statX, statBarY, statNames[stat], {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: '#7f8c8d'
      });
      container.add(statLabel);

      const barBg = this.add.graphics();
      barBg.fillStyle(0x2c3e50, 1);
      barBg.fillRoundedRect(statX + 26, statBarY, w - 55, 8, 3);
      container.add(barBg);

      const val = char.stats[stat] || 0;
      const barFill = this.add.graphics();
      const barColor = { hp: 0xe91e63, speed: 0x3498db, damage: 0xe74c3c, range: 0x1abc9c }[stat];
      barFill.fillStyle(barColor, 1);
      barFill.fillRoundedRect(statX + 26, statBarY, ((w - 55) * val) / 5, 8, 3);
      container.add(barFill);
    });

    // Selection overlay (hidden initially)
    const selOverlay = this.add.graphics();
    selOverlay.lineStyle(3, char.color, 1);
    selOverlay.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    selOverlay.fillStyle(char.color, 0.12);
    selOverlay.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    selOverlay.setVisible(false);
    container.add(selOverlay);

    // Touch interaction
    const zone = this.add.zone(0, 0, w, h).setInteractive();
    zone.on('pointerdown', () => {
      this._selectCharacter(index, char.id);
    });
    container.add(zone);

    return { container, bg, selOverlay, charId: char.id, index };
  }

  _drawCharacterSprite(gfx, x, y, charId, color, size) {
    gfx.clear();

    switch (charId) {
      case 'warrior':
        // Body
        gfx.fillStyle(color, 1);
        gfx.fillRect(x - size * 0.4, y - size * 0.3, size * 0.8, size * 0.7);
        // Head
        gfx.fillStyle(0xffcc99, 1);
        gfx.fillCircle(x, y - size * 0.5, size * 0.3);
        // Sword
        gfx.fillStyle(0xecf0f1, 1);
        gfx.fillRect(x + size * 0.4, y - size * 0.6, 4, size * 0.8);
        // Shield
        gfx.fillStyle(0x8e44ad, 1);
        gfx.fillRect(x - size * 0.7, y - size * 0.3, size * 0.3, size * 0.55);
        break;

      case 'mage':
        // Robe
        gfx.fillStyle(color, 1);
        gfx.fillTriangle(
          x, y + size * 0.4,
          x - size * 0.5, y + size * 0.4,
          x, y - size * 0.3
        );
        gfx.fillTriangle(
          x, y + size * 0.4,
          x + size * 0.5, y + size * 0.4,
          x, y - size * 0.3
        );
        // Head
        gfx.fillStyle(0xffcc99, 1);
        gfx.fillCircle(x, y - size * 0.45, size * 0.28);
        // Staff
        gfx.fillStyle(0x8B4513, 1);
        gfx.fillRect(x + size * 0.35, y - size * 0.7, 4, size * 0.9);
        // Orb
        gfx.fillStyle(0x9b59b6, 0.9);
        gfx.fillCircle(x + size * 0.37, y - size * 0.7, 7);
        // Magic sparkles
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillCircle(x + size * 0.37, y - size * 0.7, 3);
        break;

      case 'ranger':
        // Body
        gfx.fillStyle(color, 1);
        gfx.fillRect(x - size * 0.3, y - size * 0.25, size * 0.6, size * 0.6);
        // Head
        gfx.fillStyle(0xffcc99, 1);
        gfx.fillCircle(x, y - size * 0.45, size * 0.27);
        // Bow
        gfx.lineStyle(3, 0x8B4513, 1);
        gfx.beginPath();
        gfx.arc(x + size * 0.5, y - size * 0.1, size * 0.35, -0.9, 0.9, false);
        gfx.strokePath();
        // Arrow
        gfx.lineStyle(1, 0xecf0f1, 1);
        gfx.lineBetween(x + size * 0.15, y - size * 0.1, x + size * 0.7, y - size * 0.1);
        break;

      case 'healer':
        // Robe
        gfx.fillStyle(color, 1);
        gfx.fillRect(x - size * 0.35, y - size * 0.25, size * 0.7, size * 0.65);
        // Head
        gfx.fillStyle(0xffcc99, 1);
        gfx.fillCircle(x, y - size * 0.48, size * 0.28);
        // Cross symbol on robe
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(x - 3, y - size * 0.1, 6, size * 0.35);
        gfx.fillRect(x - size * 0.2, y + size * 0.0, size * 0.4, 6);
        // Halo
        gfx.lineStyle(2, 0xf1c40f, 0.8);
        gfx.strokeCircle(x, y - size * 0.7, size * 0.25);
        break;

      default:
        gfx.fillStyle(color, 1);
        gfx.fillCircle(x, y, size * 0.5);
    }
  }

  _selectCharacter(index, charId) {
    this._selectedChar = charId;

    this._charCards.forEach((card, i) => {
      card.selOverlay.setVisible(i === index);
      card.container.setAlpha(i === index ? 1 : 0.6);
    });

    if (this._confirmText) {
      this._confirmText.setAlpha(1);
    }
    if (this._confirmZone) {
      this._confirmZone.setInteractive();
    }
    if (this._confirmBg) {
      this._confirmBg.clear();
      const { width, height } = this.scale;
      this._confirmBg.fillStyle(0x27ae60, 1);
      this._confirmBg.fillRoundedRect(
        width / 2 - 130,
        height * 0.87 - 25,
        260, 50, 12
      );
    }
  }

  _drawConfirmButton(width, height) {
    const btnY = height * 0.87;

    this._confirmBg = this.add.graphics();
    this._confirmBg.fillStyle(0x2c3e50, 1);
    this._confirmBg.fillRoundedRect(width / 2 - 130, btnY - 25, 260, 50, 12);

    this._confirmText = this.add.text(width / 2, btnY, 'ВЫБРАТЬ ПЕРСОНАЖА', {
      fontSize: '16px',
      fontFamily: 'Arial Black, Arial',
      color: '#7f8c8d',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5).setAlpha(0.5);

    this._confirmZone = this.add.zone(width / 2, btnY, 260, 50);

    this._statusText = this.add.text(width / 2, height * 0.94, '', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#bdc3c7',
      align: 'center'
    }).setOrigin(0.5);
  }

  _setupNetworkHandlers() {
    // Re-select confirm zone behavior
    this.input.on('pointerup', (pointer) => {
      if (!this._selectedChar) return;

      const { width, height } = this.scale;
      const btnY = height * 0.87;

      // Check if tap on confirm button area
      if (
        pointer.x >= width / 2 - 130 &&
        pointer.x <= width / 2 + 130 &&
        pointer.y >= btnY - 25 &&
        pointer.y <= btnY + 25
      ) {
        this._onConfirm();
      }
    });

    const unsub1 = netClient.on('game_start', (msg) => {
      this.scene.start('GameScene', {
        roomCode: this._roomCode,
        playerIndex: this._playerIndex,
        characterId: this._selectedChar,
        solo: this._solo,
        gameState: msg
      });
    });

    const unsub2 = netClient.on('server_error', (msg) => {
      this._statusText.setText(`Ошибка: ${msg.message}`);
    });

    this._unsubscribers = [unsub1, unsub2];
  }

  _onConfirm() {
    if (!this._selectedChar) return;

    if (this._solo) {
      // Start game directly
      this.scene.start('GameScene', {
        roomCode: null,
        playerIndex: 0,
        characterId: this._selectedChar,
        solo: true
      });
      return;
    }

    if (!netClient.connected) {
      this._statusText.setText('Нет соединения с сервером');
      return;
    }

    // Send character selection
    netClient.send('select_character', { characterId: this._selectedChar });
    this._statusText.setText('Ожидание второго игрока...');
    this._confirmText.setText('ОЖИДАНИЕ...');
  }

  shutdown() {
    this._unsubscribers.forEach(fn => typeof fn === 'function' && fn());
    this._unsubscribers = [];
  }
}
