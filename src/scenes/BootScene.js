// BootScene - initial loading scene, transitions to MenuScene
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // No external assets to load - all graphics are procedural
  }

  create() {
    const { width, height } = this.scale;

    // Draw dark background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    // Animated title text
    const title = this.add.text(width / 2, height / 2 - 40, 'ВЫЖИВАНИЕ', {
      fontSize: '42px',
      fontFamily: 'Arial Black, Arial',
      color: '#e74c3c',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 + 20, 'ВАМПИРОВ', {
      fontSize: '32px',
      fontFamily: 'Arial Black, Arial',
      color: '#9b59b6',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    const loading = this.add.text(width / 2, height * 0.75, 'Загрузка...', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#7f8c8d'
    }).setOrigin(0.5);

    // Particle stars
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 2 + 0.5;
      const star = this.add.graphics();
      star.fillStyle(0xffffff, Math.random() * 0.7 + 0.1);
      star.fillCircle(x, y, size);
    }

    // Tween title for glow effect
    this.tweens.add({
      targets: [title, subtitle],
      alpha: { from: 0, to: 1 },
      duration: 800,
      ease: 'Power2'
    });

    // After 1.5s, go to menu
    this.time.delayedCall(1500, () => {
      this.scene.start('MenuScene');
    });
  }
}
