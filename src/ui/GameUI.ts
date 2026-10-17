import type { RoundResult } from '../systems/RoundSession';
import { LeaderboardSystem, playerName, recordId } from '../systems/LeaderboardSystem';
import type { LeaderboardEntry } from '../systems/LeaderboardSystem';
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
  private readonly cleanups: Array<() => void> = [];
  private entry?: LeaderboardEntry;
  private started = false;
  private returnToResult = false;
  constructor(private readonly actions: UIActions, private readonly ranked: boolean) {
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { /* Browser privacy settings may block storage. */ }
    this.leaderboard = new LeaderboardSystem(storage);
    this.listen('start-button', 'click', () => {
      this.tutorial.close();
      if (!this.started) { this.started = true; actions.start(Number(this.target.value)); }
      actions.pause(false);
    });
    this.listen('help-button', 'click', () => {
      this.target.disabled = this.started;
      element('start-button').textContent = this.started ? '繼續實驗 →' : '把他們疊回去 →';
      actions.pause(true); this.show(this.tutorial, 'tutorial-title');
    });
    this.listen('again-button', 'click', () => { this.failureBackdrop.clear(); this.result.close(); this.entry = undefined; actions.restart(); actions.pause(false); });
    this.listen('menu-button', 'click', () => {
      this.failureBackdrop.clear(); this.result.close(); this.started = false; this.entry = undefined; this.target.disabled = false;
      element('start-button').textContent = '把他們疊回去 →';
      actions.pause(true); this.show(this.tutorial, 'tutorial-title');
    });
    this.listen('leaderboard-button', 'click', () => this.showBoard(false));
    this.listen('result-board-button', 'click', () => { this.result.close(); this.showBoard(true); });
    this.listen('board-close-button', 'click', () => this.closeBoard());
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
    element('mode-label').textContent = !this.ranked ? `${target} 隻 · 指定造型試放（不列入排名）` : target === 500 ? '500 隻挑戰' : `${target} 隻 · 練習`;
    this.boardTarget.value = String(target);
  }
  finish(result: RoundResult): void {
    element('result-title').textContent = result.completed ? '魔法，終於解除了。' : '魔法失敗了！';
    element('result-description').textContent = result.completed ? '每一隻都回來了。這次的實驗，算是成功了吧。' : `你現在有 ${result.target - result.placedCount} 隻各種造型的蛇貂了，恭喜你`;
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
      element('result-rank').textContent = '指定造型試放，不列入排行榜。';
      element('save-status').textContent = '';
    }
    if (result.completed) this.failureBackdrop.clear(); else this.failureBackdrop.show(result.target - result.placedCount);
    this.show(this.result, 'result-title');
  }
  private persistEntry(): void {
    if (!this.entry) return;
    const rank = this.leaderboard.save(this.entry);
    element('result-rank').textContent = rank ? `本機 ${this.entry.target} 隻挑戰 · 第 ${rank} 名` : '這次沒有進入前 10 名，再試一次吧。';
    element('save-status').textContent = this.leaderboard.persistent ? '本次成績已自動保存在這個瀏覽器。' : '目前瀏覽器無法永久儲存；成績暫存於本次開啟期間。';
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
    const rows = this.leaderboard.top(Number(this.boardTarget.value));
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
    element('leaderboard-storage').textContent = this.leaderboard.persistent ? '僅此瀏覽器的個人紀錄。完成者優先，各挑戰保留前 10 名。' : '瀏覽器儲存不可用，重新開啟後不會保留這次的紀錄。';
  }
  private listen(id: string, type: string, callback: (event: Event) => void): void {
    const target = element(id); target.addEventListener(type, callback);
    this.cleanups.push(() => target.removeEventListener(type, callback));
  }
  private show(dialog: HTMLDialogElement, heading: string): void {
    dialog.showModal(); element(heading).focus({ preventScroll: true }); dialog.scrollTop = 0;
  }
  destroy(): void { this.failureBackdrop.destroy(); this.cleanups.forEach((cleanup) => cleanup()); [this.tutorial, this.result, this.board].forEach((dialog) => dialog.close()); }
}
