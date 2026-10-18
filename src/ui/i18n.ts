export type Language = 'en' | 'zh' | 'ja';
type Message = string;
type Catalog = Record<string, Message>;

const messages: Record<Language, Catalog> = {
  en: {
    gameMenu: 'Menu', openMenu: 'Open menu', closeMenu: 'Close menu',
    powerSaving: 'Power saving', powerSavingDescription: '30 FPS · No collision bounce effects · Lighter glow',
    documentTitle: 'The Serpentela Copying Incident',
    metaDescription: 'A Serpentela has invaded your magic circle. Stack them all back onto it.',
    gameArea: 'TL001 game area', helpButton: 'Help', leaderboardButton: 'Leaderboard', resetButton: 'Restart',
    volume: 'Audio', audioControls: 'Audio controls', music: 'Music', effects: 'Effects',
    musicVolume: 'Background music volume', effectsVolume: 'Game sound effects volume', mute: 'Mute', unmute: 'Unmute',
    musicMuteLabel: 'Mute background music', musicUnmuteLabel: 'Unmute background music', musicMutedTitle: 'Background music is muted', musicMuteTitle: 'Mute background music',
    effectsMuteLabel: 'Mute game sound effects', effectsUnmuteLabel: 'Unmute game sound effects', effectsMutedTitle: 'Game sound effects are muted', effectsMuteTitle: 'Mute game sound effects',
    remaining: 'Serpentelas left', remainingCountAria: '{{count}} Serpentelas left', ready: 'Ready to begin', gameCanvas: 'Serpentela stacking challenge', time: 'Time', score: 'Score',
    gameControls: 'Game controls', moveLeft: 'Move left', moveRight: 'Move right', drop: 'Drop',
    controlHint: 'Move the mouse and click to drop · Drag and release on touch screens', noScript: 'This game needs JavaScript enabled.',
    languageSelector: 'Language', tutorialOops: 'Oh no!', tutorialTitle: 'A Serpentela has invaded your magic circle!', serpentelaName: 'Serpentela',
    tutorialDescription: 'Your lab is overflowing with {{count}} identical Serpentelas.\nStack them all back onto the magic circle to restore order.',
    tutorialMove: 'Move left or right, then click to drop', tutorialStack: 'Drop a Serpentela onto the magic circle', tutorialFall: 'Keep them on the circle, or things get messy',
    challenge: 'Choose a challenge', start: 'Stack them back up', resume: 'Resume experiment',
    rescueHint: 'Hold an escaping Serpentela, drag it back, then release', rescueHolding: 'Rescuing…', rescuing: 'Drag it back onto the circle, then release',
    targetCount: '{{count}} Serpentelas',
    resultArt: 'Serpentela', resultSuccess: 'Magic restored!', resultFailure: 'Magic failed!', resultScore: 'Score this round', placed: 'Placed safely', elapsed: 'Time taken', placementScore: 'Placement points', heightBonus: 'Height bonus', speedBonus: 'Time bonus',
    playerName: 'Your name', anonymous: 'Anonymous Keeper', saveName: 'Save name', maxName: 'Up to 12 characters', tryAgain: 'Try again', moreChallenges: 'More challenges', viewLeaderboard: 'View leaderboard',
    successDescription: 'You now have a troublemaking Serpentela. Congratulations!', failureDescription: 'You still have {{count}} identical Serpentelas. Better luck next time!',
    placedCount: '{{placed}} / {{target}} placed',
    leaderboardEyebrow: 'GLOBAL RANKING / TOP 100', leaderboardTitle: 'Best Records', viewChallenge: 'Challenge', back: 'Back',
    savedLocal: 'This score is saved in this browser.', saveTemporary: 'Could not save permanently; this score will last only for this session.',
    syncing: 'Score saved locally. Syncing with the global leaderboard…', syncedRank: 'Synced! Your current rank is #{{rank}}.',
    syncedOutsideTop: 'Synced! This score is outside the current top 100.', syncFailed: 'Could not reach the global leaderboard; this score is still saved in this browser.',
    localRecords: 'Only this browser’s records are available. The top 100 are kept for each challenge.', storageUnavailable: 'Browser storage is unavailable. These records will not remain after you close this page.',
    loadingLeaderboard: 'Loading the global leaderboard…', leaderboardUnavailable: 'The global leaderboard is unavailable. Showing this browser’s records instead.',
    noRecords: 'No records yet. Will you be the first?', completedRecord: 'Magic restored', progressRecord: '{{placed}} / {{target}} placed',
    dropWaitingFinal: 'Waiting for the last one to settle…', dropWaiting: 'Wait for it to land…',
    next: 'NEXT', last: 'LAST', allPlaced: 'ALL PLACED', gameAreaAria: 'Serpentela stacking challenge. Current: {{current}}. Next: {{next}}.',
    allDropped: 'All Serpentelas placed', noNext: 'None', warning: 'Careful, a Serpentela is about to fall!', waitingFinal: 'Waiting for the last Serpentela to settle…',
    placedStable: '{{count}} placed safely', completedStatus: 'Challenge complete', failedStatus: 'Challenge failed', startupError: 'Could not start the game. Please refresh.',
  },
  zh: {
    gameMenu: '選單', openMenu: '開啟選單', closeMenu: '關閉選單',
    powerSaving: '省電模式', powerSavingDescription: '30 FPS · 關閉碰撞回彈特效 · 精簡光效',
    documentTitle: '誰複製了 500 隻蛇貂？',
    metaDescription: '有隻蛇貂闖進你的魔法陣了！把蛇貂全部疊回魔法陣上。',
    gameArea: 'TL001 遊戲實驗場', helpButton: '玩法', leaderboardButton: '排行榜', resetButton: '重新開始',
    volume: '音量', audioControls: '音量控制', music: '音樂', effects: '音效',
    musicVolume: '背景音樂音量', effectsVolume: '遊戲音效音量', mute: '靜音', unmute: '開啟',
    musicMuteLabel: '靜音背景音樂', musicUnmuteLabel: '開啟背景音樂', musicMutedTitle: '背景音樂已靜音', musicMuteTitle: '靜音背景音樂',
    effectsMuteLabel: '靜音遊戲音效', effectsUnmuteLabel: '開啟遊戲音效', effectsMutedTitle: '遊戲音效已靜音', effectsMuteTitle: '靜音遊戲音效',
    remaining: '剩餘蛇貂', remainingCountAria: '剩餘 {{count}} 隻蛇貂', ready: '準備開始實驗', gameCanvas: '蛇貂堆疊挑戰', time: '時間', score: '分數',
    gameControls: '遊戲操作', moveLeft: '向左移動', moveRight: '向右移動', drop: '放下',
    controlHint: '滑鼠移動、點擊落下 · 手機拖動、放手落下', noScript: '這個遊戲需要開啟 JavaScript 才能執行。',
    languageSelector: '語言', tutorialOops: '喔不！', tutorialTitle: '有隻蛇貂闖進你的魔法陣了！', serpentelaName: '蛇貂',
    tutorialDescription: '{{count}} 隻完全一樣的蛇貂塞滿了實驗室，\n復原方法只有一個：把牠們全部疊回魔法陣上。',
    tutorialMove: '左右移動，點擊放下', tutorialStack: '把蛇貂放到魔法陣上', tutorialFall: '掉到魔法陣外就大事不好了',
    challenge: '這次想挑戰', start: '把牠們疊回去', resume: '繼續實驗',
    rescueHint: '點住快掉出的蛇貂，拖回魔法陣後放開', rescueHolding: '救援中', rescuing: '拖回魔法陣後放開，讓牠重新落下',
    targetCount: '{{count}} 隻',
    resultArt: '蛇貂', resultSuccess: '魔法成功了！', resultFailure: '魔法失敗了！', resultScore: '本次分數', placed: '成功放穩', elapsed: '經過時間', placementScore: '放置分數', heightBonus: '高度獎勵', speedBonus: '完成時間獎勵',
    playerName: '你的名字', anonymous: '匿名飼主', saveName: '儲存名字', maxName: '最多 12 個字', tryAgain: '再試一次', moreChallenges: '挑戰更多隻', viewLeaderboard: '查看排行榜',
    successDescription: '你現在有一隻闖大禍的蛇貂了，恭喜你！', failureDescription: '你現在有{{count}}隻完全一樣的蛇貂了，恭喜你',
    placedCount: '{{placed}} / {{target}} 隻',
    leaderboardEyebrow: 'GLOBAL RANKING / TOP 100', leaderboardTitle: '最佳紀錄', viewChallenge: '查看挑戰', back: '返回',
    savedLocal: '本次成績已保存在這個瀏覽器。', saveTemporary: '目前無法永久儲存；成績暫存於本次開啟期間。',
    syncing: '成績已保存在本機，正在同步全體排行榜…', syncedRank: '已同步全體排行榜，目前第 {{rank}} 名。',
    syncedOutsideTop: '已同步；本次成績未進入目前前 100 名。', syncFailed: '共用排行榜暫時無法連線；本次成績仍保存在這個瀏覽器。',
    localRecords: '僅此瀏覽器的個人紀錄；各挑戰保留前 100 名。', storageUnavailable: '瀏覽器儲存不可用，重新開啟後不會保留這次的紀錄。',
    loadingLeaderboard: '正在讀取全體玩家排行榜…', leaderboardUnavailable: '共用排行榜暫時無法連線，現在顯示這個瀏覽器的個人紀錄。',
    noRecords: '還沒有紀錄。第一名會是你嗎？', completedRecord: '魔法解除', progressRecord: '{{placed}} / {{target}} 隻',
    dropWaitingFinal: '等待最後一隻停穩…', dropWaiting: '稍等牠落下…',
    next: '下一隻', last: '最後一隻', allPlaced: '全部放下', gameAreaAria: '蛇貂落下實驗場。目前：{{current}}；下一隻：{{next}}。',
    allDropped: '已全部放下', noNext: '無', warning: '小心，蛇貂快掉出去了', waitingFinal: '等最後的蛇貂停穩…',
    placedStable: '已放穩 {{count}} 隻', completedStatus: '挑戰完成', failedStatus: '挑戰失敗', startupError: '啟動失敗，請重新整理。',
  },
  ja: {
    gameMenu: 'メニュー', openMenu: 'メニューを開く', closeMenu: 'メニューを閉じる',
    powerSaving: '省電力モード', powerSavingDescription: '30 FPS・衝突時の弾む演出をオフ・発光を軽減',
    documentTitle: '増殖したテンレラを積み戻せ！',
    metaDescription: 'テンレラが魔法陣に入り込んだ！全員を魔法陣の上に積み戻そう。',
    gameArea: 'TL001 ゲームエリア', helpButton: '遊び方', leaderboardButton: 'ランキング', resetButton: 'やり直す',
    volume: '音量', audioControls: '音量設定', music: '音楽', effects: '効果音',
    musicVolume: 'BGMの音量', effectsVolume: 'ゲーム効果音の音量', mute: 'ミュート', unmute: '音を出す',
    musicMuteLabel: 'BGMをミュート', musicUnmuteLabel: 'BGMのミュートを解除', musicMutedTitle: 'BGMはミュート中', musicMuteTitle: 'BGMをミュート',
    effectsMuteLabel: 'ゲーム効果音をミュート', effectsUnmuteLabel: 'ゲーム効果音のミュートを解除', effectsMutedTitle: 'ゲーム効果音はミュート中', effectsMuteTitle: 'ゲーム効果音をミュート',
    remaining: '残りのテンレラ', remainingCountAria: '残り {{count}} 匹のテンレラ', ready: '実験を始めよう', gameCanvas: 'テンレラ積み上げチャレンジ', time: 'タイム', score: 'スコア',
    gameControls: 'ゲーム操作', moveLeft: '左へ移動', moveRight: '右へ移動', drop: '落とす',
    controlHint: 'マウスを動かしてクリックで落とす · タッチ操作はドラッグして離す', noScript: 'このゲームを遊ぶには JavaScript を有効にしてください。',
    languageSelector: '言語', tutorialOops: 'たいへん！', tutorialTitle: 'テンレラが魔法陣に入り込んだ！', serpentelaName: 'テンレラ',
    tutorialDescription: '同じテンレラ {{count}} 匹が研究室いっぱいに増えちゃった。\nみんなを魔法陣の上に積み戻して、元に戻そう！',
    tutorialMove: '左右に動かして、クリックで落とす', tutorialStack: 'テンレラを魔法陣の上に落とそう', tutorialFall: '魔法陣の外に落とすと大変！',
    challenge: 'チャレンジを選ぶ', start: 'みんなを積み戻す', resume: '実験を再開',
    rescueHint: '落ちそうなテンレラを押さえ、魔法陣へ戻して離す', rescueHolding: '救出中', rescuing: '魔法陣へ引き戻してから離そう',
    targetCount: '{{count}} 匹',
    resultArt: 'テンレラ', resultSuccess: '魔法が元に戻った！', resultFailure: '魔法は失敗！', resultScore: '今回のスコア', placed: '安定して置けた数', elapsed: '経過時間', placementScore: '配置ポイント', heightBonus: '高さボーナス', speedBonus: 'タイムボーナス',
    playerName: '名前', anonymous: '匿名の飼い主', saveName: '名前を保存', maxName: '12文字まで', tryAgain: 'もう一度', moreChallenges: 'もっと挑戦', viewLeaderboard: 'ランキングを見る',
    successDescription: 'いたずら好きのテンレラが一匹残ったね。おめでとう！', failureDescription: 'まだ {{count}} 匹のテンレラが残っているよ。次こそ成功させよう！',
    placedCount: '{{placed}} / {{target}} 匹',
    leaderboardEyebrow: 'GLOBAL RANKING / TOP 100', leaderboardTitle: 'ベスト記録', viewChallenge: 'チャレンジ', back: '戻る',
    savedLocal: 'スコアをこのブラウザーに保存しました。', saveTemporary: '永続保存できません。このページを開いている間だけ記録されます。',
    syncing: 'ローカルに保存しました。全体ランキングに同期中…', syncedRank: '同期しました！現在の順位は {{rank}} 位です。',
    syncedOutsideTop: '同期しましたが、今回のスコアはトップ100に入りませんでした。', syncFailed: '全体ランキングに接続できません。スコアはこのブラウザーに保存されています。',
    localRecords: 'このブラウザーの記録のみ表示します。各チャレンジの上位100件を保存します。', storageUnavailable: 'ブラウザーの保存機能が使えません。ページを閉じると記録は消えます。',
    loadingLeaderboard: '全体ランキングを読み込み中…', leaderboardUnavailable: '全体ランキングに接続できません。このブラウザーの記録を表示します。',
    noRecords: 'まだ記録がありません。最初のランクインを目指そう！', completedRecord: '魔法を解除', progressRecord: '{{placed}} / {{target}} 匹',
    dropWaitingFinal: '最後の一匹が落ち着くのを待っています…', dropWaiting: '落ち着くまで待ってね…',
    next: 'つぎ', last: 'さいご', allPlaced: '配置完了', gameAreaAria: 'テンレラ積み上げチャレンジ。現在：{{current}}。次：{{next}}。',
    allDropped: 'すべて配置済み', noNext: 'なし', warning: 'テンレラが落ちそう！気をつけて', waitingFinal: '最後のテンレラが落ち着くのを待っています…',
    placedStable: '{{count}} 匹を安定して配置', completedStatus: 'チャレンジ成功', failedStatus: 'チャレンジ失敗', startupError: 'ゲームを開始できませんでした。再読み込みしてください。',
  },
};

const STORAGE_KEY = 'taillabs.tl001.language.v1';
const localeByLanguage: Record<Language, string> = { en: 'en-US', zh: 'zh-TW', ja: 'ja-JP' };
const documentLanguage: Record<Language, string> = { en: 'en', zh: 'zh-Hant', ja: 'ja' };
const listeners = new Set<(language: Language) => void>();
function isLanguage(value: string | null): value is Language { return value === 'en' || value === 'zh' || value === 'ja'; }
function detectDeviceLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? '' : navigator.languages?.[0] || navigator.language;
  const locale = preferred.toLowerCase().replaceAll('_', '-');
  if (/^ja(?:-|$)/.test(locale)) return 'ja';
  if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(locale)) return 'zh';
  return 'en';
}
function loadLanguage(): Language {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (isLanguage(saved)) return saved; } catch { /* Storage may be unavailable. */ }
  return detectDeviceLanguage();
}
let language: Language = loadLanguage();

export function getLanguage(): Language { return language; }
export function setLanguage(next: Language): void {
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Language still changes for this session. */ }
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener(language));
}
export function subscribeLanguage(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function t(key: string, values: Record<string, string | number> = {}): string {
  const template = messages[language][key] ?? messages.zh[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''));
}
export function formatNumber(value: number): string { return value.toLocaleString(localeByLanguage[language]); }
export function formatTarget(count: number): string { return t('targetCount', { count }); }
export function formatPlacedCount(placed: number, target: number): string { return t('placedCount', { placed, target }); }

export function applyTranslations(root: ParentNode = document): void {
  document.documentElement.lang = documentLanguage[language];
  document.title = t('documentTitle');
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t('metaDescription');
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n ?? ''); });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder ?? ''); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria ?? '')); });
  root.querySelectorAll<HTMLImageElement>('[data-i18n-alt]').forEach((node) => { node.alt = t(node.dataset.i18nAlt ?? ''); });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((node) => { node.title = t(node.dataset.i18nTitle ?? ''); });
  root.querySelectorAll<HTMLOptionElement>('[data-count-option]').forEach((node) => { node.textContent = formatTarget(Number(node.dataset.countOption)); });
  root.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
}
