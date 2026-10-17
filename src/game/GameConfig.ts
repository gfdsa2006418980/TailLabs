import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { PHYSICS_CONFIG } from './PhysicsConfig';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
  backgroundColor: '#faf9f2',
  physics: PHYSICS_CONFIG,
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true },
  input: { activePointers: 2 },
};
