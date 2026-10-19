import Phaser from 'phaser';
import { GAME_CONFIG } from './game/GameConfig';
import { showStartupError } from './ui/controls';
import { t } from './ui/i18n';
import './style.css';
import './ui/leaderboard.css';

let game: Phaser.Game;
try {
  game = new Phaser.Game(GAME_CONFIG);
  game.events.once(Phaser.Core.Events.READY, () => {
    const canvas = game.canvas;
    canvas.setAttribute('aria-label', t('gameCanvas'));
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('pointerdown', () => canvas.focus());
  });
} catch (error) {
  showStartupError(t('startupError'));
  console.error('Unable to start TL001:', error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.destroy(true));
}
