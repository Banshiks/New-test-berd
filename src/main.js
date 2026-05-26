// Main entry point for Vampire Roguelike Co-op
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { CharSelectScene } from './scenes/CharSelectScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UpgradeScene } from './scenes/UpgradeScene.js';

// Wait for Phaser to load from CDN
function initGame() {
  if (typeof Phaser === 'undefined') {
    setTimeout(initGame, 100);
    return;
  }

  const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 854,
    backgroundColor: '#0a0a1a',
    parent: 'game-container',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 480,
      height: 854
    },
    scene: [
      BootScene,
      MenuScene,
      CharSelectScene,
      GameScene,
      UpgradeScene
    ],
    input: {
      touch: true,
      mouse: true,
      activePointers: 4
    },
    render: {
      antialias: false,
      pixelArt: false,
      roundPixels: true
    }
  };

  const game = new Phaser.Game(config);

  // Handle orientation
  window.addEventListener('orientationchange', () => {
    setTimeout(() => game.scale.refresh(), 200);
  });

  // Prevent context menu on right click
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // Prevent default touch behaviors
  document.addEventListener('touchstart', (e) => {
    if (e.target.tagName !== 'INPUT') e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });

  return game;
}

initGame();
