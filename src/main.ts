import Phaser from 'phaser';
import { GAME_CONFIG } from './game/GameConfig';
import { updateReadout } from './ui/controls';
import './style.css';

let game: Phaser.Game;
try {
  game = new Phaser.Game(GAME_CONFIG);
  game.events.once(Phaser.Core.Events.READY, () => {
    const canvas = game.canvas;
    canvas.setAttribute('aria-label', '蛇貂落下實驗場');
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('pointerdown', () => canvas.focus());
  });
} catch (error) {
  updateReadout(0, '啟動失敗，請重新整理');
  console.error('Unable to start TL001:', error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.destroy(true));
}
