// UpgradeScene - Level up upgrade selection overlay
// Launched as parallel scene on top of GameScene

export class UpgradeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UpgradeScene' });
  }

  init(data) {
    this._upgrades = data.upgrades || [];
    this._level = data.level || 1;
    this._onSelect = data.onSelect || (() => {});
  }

  create() {
    const { width, height } = this.scale;

    // Semi-transparent overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    // Animated glow background
    const glow = this.add.graphics();
    glow.fillStyle(0x9b59b6, 0.08);
    glow.fillCircle(width / 2, height / 2, 280);

    this.tweens.add({
      targets: glow,
      scaleX: { from: 0.9, to: 1.1 },
      scaleY: { from: 0.9, to: 1.1 },
      alpha: { from: 0.5, to: 1.0 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Level up title
    const levelText = this.add.text(width / 2, height * 0.08, `УРОВЕНЬ ${this._level}!`, {
      fontSize: '36px',
      fontFamily: 'Arial Black, Arial',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 6
    }).setOrigin(0.5).setAlpha(0);

    const subtitleText = this.add.text(width / 2, height * 0.16, 'Выбери улучшение', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#ecf0f1',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5).setAlpha(0);

    // Animate title in
    this.tweens.add({
      targets: [levelText, subtitleText],
      alpha: 1,
      y: { from: -50, to: levelText.y },
      duration: 400,
      ease: 'Back.easeOut'
    });

    this.tweens.add({
      targets: subtitleText,
      alpha: 1,
      duration: 400,
      delay: 100
    });

    // Create upgrade cards
    const cardW = Math.min((width - 60) / 3, 180);
    const cardH = 210;
    const totalW = this._upgrades.length * cardW + (this._upgrades.length - 1) * 15;
    const startX = (width - totalW) / 2 + cardW / 2;
    const cardY = height * 0.55;

    this._upgrades.forEach((upg, i) => {
      const cx = startX + i * (cardW + 15);
      this._createUpgradeCard(cx, cardY, cardW, cardH, upg, i);
    });
  }

  _createUpgradeCard(cx, cy, w, h, upgrade, index) {
    const container = this.add.container(cx, cy);
    container.setAlpha(0);

    // Card background
    const bg = this.add.graphics();
    bg.fillStyle(0x0f0f2e, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, 0x2c3e50, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    container.add(bg);

    // Color accent strip at top
    const strip = this.add.graphics();
    strip.fillStyle(upgrade.color, 1);
    strip.fillRoundedRect(-w / 2, -h / 2, w, 8, { tl: 14, tr: 14, bl: 0, br: 0 });
    container.add(strip);

    // Icon drawing
    const iconGfx = this.add.graphics();
    this._drawUpgradeIcon(iconGfx, 0, -h / 2 + 48, upgrade);
    container.add(iconGfx);

    // Name
    const nameText = this.add.text(0, -h / 2 + 80, upgrade.name, {
      fontSize: '15px',
      fontFamily: 'Arial Black, Arial',
      color: '#' + upgrade.color.toString(16).padStart(6, '0'),
      align: 'center',
      wordWrap: { width: w - 20 }
    }).setOrigin(0.5);
    container.add(nameText);

    // Description
    const descText = this.add.text(0, -h / 2 + 120, upgrade.description, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#7f8c8d',
      align: 'center',
      wordWrap: { width: w - 24 }
    }).setOrigin(0.5);
    container.add(descText);

    // Select button
    const btnY = h / 2 - 25;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(upgrade.color, 0.8);
    btnBg.fillRoundedRect(-w / 2 + 10, btnY - 18, w - 20, 36, 8);
    container.add(btnBg);

    const btnText = this.add.text(0, btnY, 'ВЫБРАТЬ', {
      fontSize: '13px',
      fontFamily: 'Arial Black, Arial',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(0.5);
    container.add(btnText);

    // Hover state
    const hoverGlow = this.add.graphics();
    hoverGlow.lineStyle(3, upgrade.color, 0.8);
    hoverGlow.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    hoverGlow.fillStyle(upgrade.color, 0.06);
    hoverGlow.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    hoverGlow.setVisible(false);
    container.add(hoverGlow);

    // Interactive zone
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      hoverGlow.setVisible(true);
      this.tweens.add({
        targets: container,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 120,
        ease: 'Power2'
      });
    });

    zone.on('pointerout', () => {
      hoverGlow.setVisible(false);
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Power2'
      });
    });

    zone.on('pointerdown', () => {
      this.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 80
      });
    });

    zone.on('pointerup', () => {
      // Flash effect
      const flash = this.add.graphics().setDepth(50);
      flash.fillStyle(upgrade.color, 0.6);
      flash.fillRect(0, 0, this.scale.width, this.scale.height);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 300,
        onComplete: () => flash.destroy()
      });

      this._onSelect(upgrade.id);
    });

    container.add(zone);

    // Animate card in with delay
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: { from: cy + 60, to: cy },
      duration: 350,
      delay: index * 80 + 200,
      ease: 'Back.easeOut'
    });
  }

  _drawUpgradeIcon(gfx, x, y, upgrade) {
    const size = 22;
    gfx.clear();

    switch (upgrade.icon) {
      case 'sword':
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillRect(x - 3, y - size, 6, size * 1.8);
        gfx.fillRect(x - size * 0.5, y - size * 0.2, size, 5);
        gfx.fillStyle(0xd4ac0d, 1);
        gfx.fillRect(x - 4, y + size * 0.8, 8, 8);
        break;

      case 'boot':
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillRoundedRect(x - size * 0.5, y - size * 0.8, size, size * 1.6, 6);
        gfx.fillStyle(0x2c3e50, 0.5);
        gfx.fillRect(x - size * 0.5, y + size * 0.4, size, size * 0.4);
        // Speed lines
        gfx.lineStyle(2, 0xffffff, 0.6);
        gfx.lineBetween(x + size * 0.6, y - size * 0.3, x + size * 1.1, y - size * 0.3);
        gfx.lineBetween(x + size * 0.6, y, x + size * 1.3, y);
        gfx.lineBetween(x + size * 0.6, y + size * 0.3, x + size * 1.0, y + size * 0.3);
        break;

      case 'heart':
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillCircle(x - size * 0.3, y - size * 0.1, size * 0.55);
        gfx.fillCircle(x + size * 0.3, y - size * 0.1, size * 0.55);
        gfx.fillTriangle(x - size * 0.8, y + size * 0.1, x + size * 0.8, y + size * 0.1, x, y + size * 0.9);
        break;

      case 'lightning':
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillTriangle(x + size * 0.2, y - size, x - size * 0.4, y + size * 0.1, x + size * 0.1, y + size * 0.1);
        gfx.fillTriangle(x - size * 0.2, y - size * 0.1, x - size * 0.4, y + size, x + size * 0.4, y - size * 0.1);
        break;

      case 'arrow':
        gfx.lineStyle(3, upgrade.color, 1);
        gfx.lineBetween(x - size, y, x + size, y);
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillTriangle(x + size, y, x + size * 0.4, y - size * 0.4, x + size * 0.4, y + size * 0.4);
        break;

      case 'cross':
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillRect(x - 5, y - size, 10, size * 2);
        gfx.fillRect(x - size, y - 5, size * 2, 10);
        break;

      case 'potion':
        gfx.fillStyle(0x95a5a6, 1);
        gfx.fillRect(x - 5, y - size * 0.9, 10, size * 0.5);
        gfx.fillStyle(upgrade.color, 0.9);
        gfx.fillEllipse(x, y + size * 0.2, size * 1.2, size * 1.6);
        gfx.fillStyle(0xffffff, 0.3);
        gfx.fillEllipse(x - size * 0.2, y - size * 0.1, size * 0.35, size * 0.5);
        // Bubbles
        gfx.fillStyle(0xffffff, 0.5);
        gfx.fillCircle(x + size * 0.1, y + size * 0.1, 3);
        gfx.fillCircle(x - size * 0.15, y + size * 0.35, 2);
        break;

      case 'star':
        gfx.fillStyle(upgrade.color, 1);
        this._drawStar(gfx, x, y, 5, size * 0.5, size);
        break;

      default:
        gfx.fillStyle(upgrade.color, 1);
        gfx.fillCircle(x, y, size * 0.6);
    }
  }

  _drawStar(gfx, cx, cy, points, innerR, outerR) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => gfx.lineTo(p.x, p.y));
    gfx.closePath();
    gfx.fillPath();
  }
}
