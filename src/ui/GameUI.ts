import type { RoundResult } from '../systems/RoundSession';
import { LeaderboardSystem, playerName, recordId } from '../systems/LeaderboardSystem';
import type { LeaderboardEntry } from '../systems/LeaderboardSystem';
import { SharedLeaderboard } from '../systems/SharedLeaderboard';
import { LoopingMusic } from '../systems/LoopingMusic';
import { audioPreferences } from '../systems/AudioPreferences';
import { GameSounds } from '../systems/GameSounds';
import { FailureBackdrop } from './FailureBackdrop';
import { applyTranslations, formatNumber, formatPlacedCount, setLanguage, subscribeLanguage, t, type Language } from './i18n';

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
  private lastResult?: RoundResult;
  private saveStatus?: { key: string; values?: Record<string, string | number> };
  constructor(private readonly actions: UIActions, private readonly ranked: boolean, sounds: GameSounds) {
    this.sounds = sounds;
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Browser privacy settings may block storage. */ }
    this.leaderboard = new LeaderboardSystem(storage);
    applyTranslations();
    this.cleanups.push(subscribeLanguage(() => {
      applyTranslations();
      this.renderTutorialCount();
      this.renderStartLabel();
      this.renderAudioControls();
      if (this.lastResult) this.renderResultDetails(this.lastResult);
      this.renderSaveStatus();
      if (this.board.open) this.renderBoard();
    }));
    document.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
      const onSelect = () => {
        const next = button.dataset.language;
        if (next === 'en' || next === 'zh' || next === 'ja') setLanguage(next as Language);
      };
      button.addEventListener('click', onSelect);
      this.cleanups.push(() => button.removeEventListener('click', onSelect));
    });
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
      this.renderStartLabel();
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
    musicToggle.textContent = t(state.musicMuted ? 'unmute' : 'mute');
    musicToggle.setAttribute('aria-pressed', String(state.musicMuted));
    musicToggle.setAttribute('aria-label', t(state.musicMuted ? 'musicUnmuteLabel' : 'musicMuteLabel'));
    musicToggle.title = t(state.musicMuted ? 'musicMutedTitle' : 'musicMuteTitle');
    const effectsToggle = element<HTMLButtonElement>('effects-toggle');
    effectsToggle.textContent = t(state.effectsMuted ? 'unmute' : 'mute');
    effectsToggle.setAttribute('aria-pressed', String(state.effectsMuted));
    effectsToggle.setAttribute('aria-label', t(state.effectsMuted ? 'effectsUnmuteLabel' : 'effectsMuteLabel'));
    effectsToggle.title = t(state.effectsMuted ? 'effectsMutedTitle' : 'effectsMuteTitle');
  }
  private renderTutorialCount(): void {
    element('tutorial-description').textContent = t('tutorialDescription', { count: Number(this.target.value) });
  }
  private renderStartLabel(): void {
    element('start-label').textContent = t(this.started ? 'resume' : 'start');
  }
  private openNewChallenge(): void {
    this.started = false;
    this.target.disabled = false;
    this.renderStartLabel();
    this.actions.pause(true);
    this.show(this.tutorial, 'tutorial-title');
  }
  render(remaining: number, elapsed: number, score: number, message: string, statusSymbol: string, placed: number, warning: boolean): void {
    element('remaining-count').textContent = String(remaining);
    element('remaining-readout').setAttribute('aria-label', t('remainingCountAria', { count: remaining }));
    element('elapsed-time').textContent = formatTime(elapsed);
    element('score-count').textContent = formatNumber(score);
    element('status-symbol').textContent = statusSymbol;
    element('placed-count').textContent = String(placed);
    element('status-readout').classList.toggle('is-warning', warning);
    const status = element('game-status');
    if (status.textContent !== message) status.textContent = message;
  }
  setMode(target: number): void {
    this.boardTarget.value = String(target);
  }
  finish(result: RoundResult): void {
    this.lastResult = result;
    this.resultCompleted = result.completed;
    this.renderResultDetails(result);
    element<HTMLFormElement>('name-form').hidden = !this.ranked;
    if (this.ranked) {
      this.entry = { ...result, id: recordId(globalThis.crypto?.randomUUID?.bind(globalThis.crypto)), playerName: playerName(element<HTMLInputElement>('player-name').value, t('anonymous')), createdAt: new Date().toISOString() };
      this.persistEntry();
    } else {
      this.saveStatus = undefined;
      this.renderSaveStatus();
    }
    if (result.completed) this.failureBackdrop.clear(); else this.failureBackdrop.show(result.target - result.placedCount);
    this.show(this.result, 'result-title');
  }
  private renderResultDetails(result: RoundResult): void {
    element('result-title').textContent = t(result.completed ? 'resultSuccess' : 'resultFailure');
    element('again-label').textContent = t(result.completed ? 'moreChallenges' : 'tryAgain');
    element('again-icon').textContent = result.completed ? '→' : '↻';
    element<HTMLButtonElement>('menu-button').hidden = result.completed;
    element('result-description').textContent = result.completed
      ? t('successDescription')
      : t('failureDescription', { count: result.target - result.placedCount });
    element('result-score').textContent = formatNumber(result.score);
    element('result-count').textContent = formatPlacedCount(result.placedCount, result.target);
    element('result-time').textContent = formatTime(result.elapsedMilliseconds);
    element('result-base').textContent = `+${formatNumber(result.baseScore)}`;
    element('result-height').textContent = `+${formatNumber(result.heightBonus)}`;
    element('result-speed').textContent = `+${formatNumber(result.speedBonus)}`;
  }
  private renderSaveStatus(): void {
    const status = element('save-status');
    status.textContent = this.saveStatus ? t(this.saveStatus.key, this.saveStatus.values) : '';
  }
  private setSaveStatus(key?: string, values?: Record<string, string | number>): void {
    this.saveStatus = key ? { key, values } : undefined;
    this.renderSaveStatus();
  }
  private persistEntry(): void {
    if (!this.entry) return;
    this.leaderboard.save(this.entry);
    if (!this.sharedLeaderboard.enabled) {
      this.setSaveStatus(this.leaderboard.persistent ? 'savedLocal' : 'saveTemporary');
      return;
    }
    this.setSaveStatus('syncing');
    const entry = { ...this.entry };
    void this.sharedLeaderboard.save(entry).then((rank) => {
      if (this.entry?.id !== entry.id) return;
      this.setSaveStatus(rank ? 'syncedRank' : 'syncedOutsideTop', rank ? { rank } : undefined);
    }).catch(() => {
      if (this.entry?.id !== entry.id) return;
      this.setSaveStatus('syncFailed');
    });
  }
  private saveName(): void {
    if (!this.entry) return;
    this.entry.playerName = playerName(element<HTMLInputElement>('player-name').value, t('anonymous'));
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
    storage.hidden = false;
    if (!this.sharedLeaderboard.enabled) {
      storage.textContent = t(this.leaderboard.persistent ? 'localRecords' : 'storageUnavailable');
      return;
    }
    const request = ++this.boardRequest;
    storage.textContent = t('loadingLeaderboard');
    void this.sharedLeaderboard.top(target).then((sharedRows) => {
      if (request !== this.boardRequest || this.boardTarget.value !== String(target)) return;
      this.renderBoardRows(sharedRows);
      storage.textContent = '';
      storage.hidden = true;
    }).catch(() => {
      if (request !== this.boardRequest || this.boardTarget.value !== String(target)) return;
      storage.textContent = t('leaderboardUnavailable');
    });
  }
  private renderBoardRows(rows: LeaderboardEntry[]): void {
    const list = element('leaderboard-list'); list.replaceChildren();
    if (!rows.length) { const empty = document.createElement('li'); empty.className = 'empty-records'; empty.textContent = t('noRecords'); list.append(empty); }
    rows.forEach((row, index) => {
      const item = document.createElement('li');
      const rank = document.createElement('span'); rank.className = 'record-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const detail = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = row.playerName;
      const info = document.createElement('small'); info.textContent = `${row.completed ? t('completedRecord') : t('progressRecord', { placed: row.placedCount, target: row.target })} · ${formatTime(row.elapsedMilliseconds)}`;
      detail.append(name, info);
      const score = document.createElement('b'); score.textContent = formatNumber(row.score);
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
