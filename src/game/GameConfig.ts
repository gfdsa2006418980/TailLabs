import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { PHYSICS_CONFIG } from './PhysicsConfig';
import { STAGE } from './StageConfig';
import { performancePreferences } from '../systems/PerformancePreferences';
import { installFramePacer } from '../systems/FramePacer';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: STAGE.width,
  height: STAGE.height,
  backgroundColor: '#faf9f2',
  physics: PHYSICS_CONFIG,
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { target: 60, limit: performancePreferences.profile.frameRate, smoothStep: false },
  callbacks: { postBoot: (game) => installFramePacer(game.loop) },
  render: { antialias: true, powerPreference: 'low-power' },
  input: { activePointers: 2 },
};
