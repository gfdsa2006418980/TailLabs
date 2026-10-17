import type { RoundResult } from '../systems/RoundSession';
import { LeaderboardSystem, playerName, recordId } from '../systems/LeaderboardSystem';
import type { LeaderboardEntry } from '../systems/LeaderboardSystem';
import { SharedLeaderboard } from '../systems/SharedLeaderboard';
import { LoopingMusic } from '../systems/LoopingMusic';
import { audioPreferences } from '../systems/AudioPreferences';
import { GameSounds } from '../systems/GameSounds';
import { FailureBackdrop } from './FailureBackdrop';

const element = <T extends HTMLElement>(id: string) => {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing game UI: ${id}`);
  return result as T;
};
export function formatTime(milliseconds: number): string {
  const hundredths = Math.floor(milliseconds / 10);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}
interface UIActions { start: (target: number) => void; restart: () => void; pause: (paused: boolean) => void; }

export class GameUI {
  private readonly tutorial = element<HTMLDialogElement>('tutorial-dialog');
  private readonly result = element<HTMLDialogElement>('result-dialog');
  private readonly board = element<HTMLDialogElement>('leaderboard-dialog');
  private readonly target = element<HTMLSelectElement>('target-select');
  private readonly boardTarget = element<HTMLSelectElement>('board-target');
  private readonly failureBackdrop = new FailureBackdrop(this.result);
  private readonly leaderboard: LeaderboardSystem;
  private readonly sharedLeaderboard = new SharedLeaderboard();
  private readonly music: LoopingMusic;
  private readonly sounds: GameSounds;
  private readonly cleanups: Array<() => void> = [];
  private entry?: LeaderboardEntry;
  private started = false;
  private returnToResult = false;
  private resultCompleted = false;
  private boardRequest = 0;
  constructor(private readonly actions: UIActions, private readonly ranked: boolean, sounds: GameSounds) {
    this.sounds = sounds;
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Browser privacy settings may block storage. */ }
    this.leaderboard = new LeaderboardSystem(storage);
    element('leaderboard-description').textContent = this.sharedLeaderboard.enabled
      ? '全體玩家共用排行榜；各挑戰分開排名。'
      : '目前保存在這個瀏覽器；連線共用排行榜後，所有玩家都能看到相同名次。';
    this.music = new LoopingMusic();
    this.cleanups.push(audioPreferences.subscribe(() => this.renderAudioControls()));
    this.listen('audio-settings-toggle', 'click', () => {
      const panel = element<HTMLDivElement>('audio-controls');
      const button = element<HTMLButtonElement>('audio-settings-toggle');
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    this.listen('music-volume', 'input', (event) => audioPreferences.setVolume('music', Number((event.currentTarget as HTMLInputElement).value)));
    this.listen('effects-volume', 'input', (event) => audioPreferences.setVolume('effects', Number((event.currentTarget as HTMLInputElement).value)));
    this.listen('music-toggle', 'click', () => audioPreferences.setMuted('music', !audioPreferences.get().musicMuted));
    this.listen('effects-toggle', 'click', () => audioPreferences.setMuted('effects', !audioPreferences.get().effectsMuted));
    document.addEventListener('click', this.onButtonClick);
    this.cleanups.push(() => document.removeEventListener('click', this.onButtonClick));
    this.listen('start-button', 'click', () => {
      this.tutorial.close();
      this.music.start();
      if (!this.started) { this.started = true; actions.start(Number(this.target.value)); }
      actions.pause(false);
    });
    this.listen('help-button', 'click', () => {
      this.target.disabled = this.started;
      element('start-button').textContent = this.started ? '繼續實驗 →' : '把他們疊回去 →';
      actions.pause(true); this.show(this.tutorial, 'tutorial-title');
    });
    this.listen('reset-button', 'click', () => this.openNewChallenge());
    this.listen('again-button', 'click', () => {
      this.failureBackdrop.clear(); this.result.close(); this.entry = undefined;
      if (this.resultCompleted) this.openNewChallenge();
      else { actions.restart(); actions.pause(false); }
    });
    this.listen('menu-button', 'click', () => {
      this.failureBackdrop.clear(); this.result.close(); this.entry = undefined;
      this.openNewChallenge();
    });
    this.listen('leaderboard-button', 'click', () => this.showBoard(false));
    this.listen('result-board-button', 'click', () => { this.result.close(); this.showBoard(true); });
    this.listen('board-close-button', 'click', () => this.closeBoard());
    this.listen('target-select', 'change', () => this.renderTutorialCount());
    this.listen('board-target', 'change', () => this.renderBoard());
    this.listen('name-form', 'submit', (event) => { event.preventDefault(); this.saveName(); });
    for (const dialog of [this.tutorial, this.result, this.board]) {
      const cancel = (event: Event) => {
        event.preventDefault();
        if (dialog === this.board) this.closeBoard();
        else if (dialog === this.tutorial && this.started) { dialog.close(); actions.pause(false); }
      };
      dialog.addEventListener('cancel', cancel);
      this.cleanups.push(() => dialog.removeEventListener('cancel', cancel));
    }
    this.renderTutorialCount();
    this.renderAudioControls();
    this.show(this.tutorial, 'tutorial-title');
  }
  private readonly onButtonClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (button && !button.disabled && button.closest('.lab, dialog')) this.sounds.playClick();
  };
  private renderAudioControls(): void {
    const state = audioPreferences.get();
    const musicVolume = element<HTMLInputElement>('music-volume');
    const effectsVolume = element<HTMLInputElement>('effects-volume');
    musicVolume.value = String(state.musicVolume);
    effectsVolume.value = String(state.effectsVolume);
    const musicToggle = element<HTMLButtonElement>('music-toggle');
    musicToggle.textContent = state.musicMuted ? '開啟' : '靜音';
    musicToggle.setAttribute('aria-pressed', String(state.musicMuted));
    musicToggle.setAttribute('aria-label', state.musicMuted ? '開啟背景音樂' : '靜音背景音樂');
    musicToggle.title = state.musicMuted ? '背景音樂已靜音' : '靜音背景音樂';
    const effectsToggle = element<HTMLButtonElement>('effects-toggle');
    effectsToggle.textContent = state.effectsMuted ? '開啟' : '靜音';
    effectsToggle.setAttribute('aria-pressed', String(state.effectsMuted));
    effectsToggle.setAttribute('aria-label', state.effectsMuted ? '開啟遊戲音效' : '靜音遊戲音效');
    effectsToggle.title = state.effectsMuted ? '遊戲音效已靜音' : '靜音遊戲音效';
  }
  private renderTutorialCount(): void {
    element('tutorial-target-count').textContent = this.target.value;
  }
  private openNewChallenge(): void {
    this.started = false;
    this.target.disabled = false;
    element('start-button').textContent = '把他們疊回去 →';
    this.actions.pause(true);
    this.show(this.tutorial, 'tutorial-title');
  }
  render(remaining: number, elapsed: number, score: number, message: string): void {
    element('remaining-count').textContent = String(remaining);
    element('elapsed-time').textContent = formatTime(elapsed);
    element('score-count').textContent = score.toLocaleString('zh-TW');
    const status = element('game-status');
    if (status.textContent !== message) status.textContent = message;
  }
  setMode(target: number): void {
    this.boardTarget.value = String(target);
  }
  finish(result: RoundResult): void {
    this.resultCompleted = result.completed;
    element('result-title').textContent = result.completed ? '魔法成功了！' : '魔法失敗了！';
    element('again-label').textContent = result.completed ? '挑戰更多隻' : '再試一次';
    element('again-icon').textContent = result.completed ? '→' : '↻';
    element<HTMLButtonElement>('menu-button').hidden = result.completed;
    element('result-description').textContent = result.completed
      ? '你現在有一隻闖大禍的蛇貂了，恭喜你！'
      : `你現在有${result.target - result.placedCount}隻完全一樣的蛇貂了，恭喜你`;
    element('result-score').textContent = result.score.toLocaleString('zh-TW');
    element('result-count').textContent = `${result.placedCount} / ${result.target} 隻`;
    element('result-time').textContent = formatTime(result.elapsedMilliseconds);
    element('result-base').textContent = `+${result.baseScore.toLocaleString('zh-TW')}`;
    element('result-height').textContent = `+${result.heightBonus.toLocaleString('zh-TW')}`;
    element('result-speed').textContent = `+${result.speedBonus.toLocaleString('zh-TW')}`;
    element<HTMLFormElement>('name-form').hidden = !this.ranked;
    if (this.ranked) {
      this.entry = { ...result, id: recordId(globalThis.crypto?.randomUUID?.bind(globalThis.crypto)), playerName: playerName(element<HTMLInputElement>('player-name').value), createdAt: new Date().toISOString() };
      this.persistEntry();
    } else {
      element('save-status').textContent = '';
    }
    if (result.completed) this.failureBackdrop.clear(); else this.failureBackdrop.show(result.target - result.placedCount);
    this.show(this.result, 'result-title');
  }
  private persistEntry(): void {
    if (!this.entry) return;
    this.leaderboard.save(this.entry);
    const status = element('save-status');
    if (!this.sharedLeaderboard.enabled) {
      status.textContent = this.leaderboard.persistent ? '本次成績已保存在這個瀏覽器。' : '目前無法永久儲存；成績暫存於本次開啟期間。';
      return;
    }
    status.textContent = '成績已保存在本機，正在同步全體排行榜…';
    const entry = { ...this.entry };
    void this.sharedLeaderboard.save(entry).then((rank) => {
      if (this.entry?.id !== entry.id) return;
      status.textContent = rank ? `已同步全體排行榜，目前第 ${rank} 名。` : '已同步；本次成績未進入目前前 10 名。';
    }).catch(() => {
      if (this.entry?.id !== entry.id) return;
      status.textContent = '共用排行榜暫時無法連線；本次成績仍保存在這個瀏覽器。';
    });
  }
  private saveName(): void {
    if (!this.entry) return;
    this.entry.playerName = playerName(element<HTMLInputElement>('player-name').value);
    element<HTMLInputElement>('player-name').value = this.entry.playerName;
    this.persistEntry();
  }
  private showBoard(fromResult: boolean): void {
    this.returnToResult = fromResult;
    this.actions.pause(true); this.renderBoard(); this.show(this.board, 'leaderboard-title');
  }
  private closeBoard(): void {
    this.board.close();
    if (this.returnToResult) this.show(this.result, 'result-title'); else this.actions.pause(false);
  }
  private renderBoard(): void {
    const list = element('leaderboard-list'); list.replaceChildren();
    const target = Number(this.boardTarget.value);
    const rows = this.leaderboard.top(target);
    this.renderBoardRows(rows);
    const storage = element('leaderboard-storage');
    if (!this.sharedLeaderboard.enabled) {
      storage.textContent = this.leaderboard.persistent ? '僅此瀏覽器的個人紀錄。完成者優先，各挑戰保留前 10 名。' : '瀏覽器儲存不可用，重新開啟後不會保留這次的紀錄。';
      return;
    }
    const request = ++this.boardRequest;
    storage.textContent = '正在讀取全體玩家排行榜…';
    void this.sharedLeaderboard.top(target).then((sharedRows) => {
      if (request !== this.boardRequest || this.boardTarget.value !== String(target)) return;
      this.renderBoardRows(sharedRows);
      storage.textContent = '全體玩家共用紀錄；各挑戰分開排名，每種挑戰保留前 10 名。';
    }).catch(() => {
      if (request !== this.boardRequest || this.boardTarget.value !== String(target)) return;
      storage.textContent = '共用排行榜暫時無法連線，現在顯示這個瀏覽器的個人紀錄。';
    });
  }
  private renderBoardRows(rows: LeaderboardEntry[]): void {
    const list = element('leaderboard-list'); list.replaceChildren();
    if (!rows.length) { const empty = document.createElement('li'); empty.className = 'empty-records'; empty.textContent = '還沒有紀錄。第一位煉金術士會是你嗎？'; list.append(empty); }
    rows.forEach((row, index) => {
      const item = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'record-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const detail = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = row.playerName;
      const info = document.createElement('small'); info.textContent = `${row.completed ? '魔法解除' : `${row.placedCount} / ${row.target} 隻`} · ${formatTime(row.elapsedMilliseconds)}`;
      detail.append(name, info);
      const score = document.createElement('b'); score.textContent = row.score.toLocaleString('zh-TW');
      item.append(rank, detail, score); list.append(item);
    });
  }
  private listen(id: string, type: string, callback: (event: Event) => void): void {
    const target = element(id); target.addEventListener(type, callback);
    this.cleanups.push(() => target.removeEventListener(type, callback));
  }
  private show(dialog: HTMLDialogElement, heading: string): void {
    dialog.showModal(); element(heading).focus({ preventScroll: true }); dialog.scrollTop = 0;
  }
  destroy(): void { this.failureBackdrop.destroy(); this.music.destroy(); this.cleanups.forEach((cleanup) => cleanup()); [this.tutorial, this.result, this.board].forEach((dialog) => dialog.close()); }
}
