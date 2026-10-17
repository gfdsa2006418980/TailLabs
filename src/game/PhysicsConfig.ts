import type Phaser from 'phaser';

// Phaser 3 includes its own Matter.js integration; use one shared physics world.
export const PHYSICS_CONFIG: Phaser.Types.Core.PhysicsConfig = {
  default: 'matter',
  matter: {
    gravity: { x: 0, y: 1.2 },
    enableSleeping: true,
    debug: false,
  },
};
