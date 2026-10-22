# TL004《爆打四十塊》交接(2026-10-22)

> 給下一個工作階段(換機器、換模型都能接手)。線上:https://tailmaskgames.github.io/TailLabs/TL004/
> 最新提交:`ff977f2 feat: TL004 加入五位夥伴能力、右上角選單與夥伴介紹`

---

## 1. 現況:已上線

- 橫式彈射遊戲,單一關卡「木造小工坊」(`src/tl004/levels/test-tower.json`):6 塊木板、3 隻四十塊、5 發。
- 進攻方 5 位夥伴依序上弓:彩燈、竹筍、撲克、薑片、3D油飯(原圖 `art/tl004/attackers/`,`npm run art:tl004` 重新產生貼圖與碰撞外框)。
- 目標「四十塊」= TL001 的 15 種蛇貂(真實凹形外框),耐久規則同舊版水晶;打倒時用物理踢飛出畫面(不顯示裂痕)。
- **能力**(飛行中、第一次碰撞前點一下畫面或點下方提示鈕,每發一次):

  | 夥伴 | 能力 | 實作 |
  | --- | --- | --- |
  | 彩燈 | 煙火爆炸 | 本體消失,半徑 210 範圍推開+傷害 |
  | 竹筍 | 破竹衝刺 | 加速到 26 px/步,撞穿木板/玻璃,碰石頭/地面/四十塊停 |
  | 撲克 | 三張牌分身 | 多出兩張 0.75 倍的牌,±0.2 弧度散開 |
  | 薑片 | 辣勁彈跳 | 彈性 0.95,撞擊傷害 ×1.6 |
  | 3D油飯 | 重壓下砸 | 停住、質量 ×3、垂直下砸 |

  數值在 `src/tl004/config/Abilities.ts`;說明文字也在同檔(夥伴介紹頁直接讀)。
- **右上角 ☰ 選單**:繼續、重新開始、夥伴介紹、音效開關;開啟時遊戲暫停;Esc 也能開關。
- 浮空 bug 已修(移動中的物體會叫醒碰到的睡眠物體)。
- 存檔模組 `src/tl004/rules/Progress.ts` **已寫好、已有測試,但還沒接到畫面**(見 §2)。

---

## 2. 剩下要做的需求(使用者 2026-10-22 提出)

### 2.1 20 關,難度漸增
- **第 10 關 = 最早那座「石頭擋最前面」的塔**(見 §3 座標,水晶換成四十塊)。
- 建議排法(已向使用者說明並獲同意的方向):

  | 關卡 | 主題 | 重點 |
  | --- | --- | --- |
  | 1 | 現有木造小工坊 | 使用者已確認難度「剛好」,不要改 |
  | 2~6 | 木造 | 每關主打一位夥伴能力(陣容多放該夥伴):2 彩燈、3 竹筍、4 撲克、5 3D油飯、6 薑片 |
  | 7~9 | 木+玻璃 | 塔變高、四十塊變多(3~4 隻) |
  | 10 | 石頭擋最前面 | §3 的塔 |
  | 11~15 | 石造堡壘 | 石頭當地基/前牆,需要用能力破解 |
  | 16~20 | 混合高塔 | 發數變少(3~4)、四十塊 4~5 隻、躲得更深 |

- 每關陣容 `shots` 可重複同一位夥伴。
- **難度驗證方法**(沿用本次做法):
  1. 機器人過關:對每發掃角度×力道×(用/不用能力),貪婪選最好的 → 確認每關打得過;把過關解法存進關卡資料 `solution`,測試直接重播斷言過關(Node 物理可重現)。
  2. 亂打玩家模擬:每關 200 局隨機角度(-0.15~-1.0 rad)、力道(0.65~1.0)、能力時機用 `tests/tl004-helpers.mjs` 的 `wantsAbility()` 決定 → 過關率應隨關卡遞減(第 1 關目前約 64%,目標第 20 關約 15~20%)。
- **星級門檻**:建議依機器人最佳分自動算:`three = floor(0.85 × 機器人最佳分 / 1000) × 1000`,`two = floor((四十塊數 × 5000 + three) / 2 / 1000) × 1000`;第 1 關維持現有 35000/45000。
- 關卡資料建議改成單一檔 `src/tl004/levels/levels.json`(`{ levels: [...] }`),瀏覽器 import、Node 測試用 readFile 讀(Node 不能直接 import JSON)。可寫 `tools/tl004-levels.mjs` 用小積木函式(柱子、橫板、四十塊)組出座標再輸出 JSON。

### 2.2 選關畫面
- 流程:開始畫面 →**選關畫面** → 關卡 → 結算(下一關 / 再玩一次 / 選關)。
- 選關畫面:20 格,每格顯示關卡編號與最高星數;上方顯示總星數(例「★ 23/60」)。
- 解鎖規則(使用者選定):**過前一關(≥1 星)才開下一關**。`Progress.isUnlocked()` 已實作。
- ☰ 選單加一項「選擇關卡」。HUD 顯示「第 N 關」。

### 2.3 存檔接線
- 結算時 `progress.submit(level.id, score, stars)`;選關畫面讀 `progress.stars()`、`totalStars()`。
- `new Progress(localStorage)`(包 try/catch;無法儲存時 `persistent=false`,在結算顯示「本次紀錄只保存在此分頁」)。
- 注意 iPhone 主畫面 App 與 Safari 不共用 localStorage(規格已記載,轉移碼之後再做)。

### 2.4 場景需要的改動
- `BattleScene` 目前在 constructor 吃固定 `config.level`;改成 `startLevel(level)` 設定目前關卡後 `restartLevel()`(`create()` 讀 `this.level`)。
- `preload()` 一次載入所有關卡會用到的夥伴與四十塊貼圖(都很小)。
- `CameraRig.setTower()` 會在 create 時依塔的範圍取景,不同關卡寬度不同時要確認瞄準視角仍能同時看到彈弓與塔(塔太遠時鏡頭會縮小)。

---

## 3. 第 10 關:最早的石頭塔(座標)

原為水晶,改成 `target` 並指定四十塊造型(下表造型為建議)。射程:最大初速 24 px/步、重力 0.85,這座塔要接近滿弓才打得到(當時使用者覺得「難度超級高」,正好當中段難度)。

```json
{ "material": "stone", "x": 1950, "y": 860, "w": 100, "h": 160 },
{ "material": "stone", "x": 2350, "y": 860, "w": 100, "h": 160 },
{ "material": "glass", "x": 2090, "y": 880, "w": 24, "h": 120 },
{ "material": "glass", "x": 2210, "y": 880, "w": 24, "h": 120 },
{ "material": "glass", "x": 2150, "y": 808, "w": 160, "h": 24 },
{ "material": "target", "x": 2150, "y": 895, "shape": "serpentela-w50-03" },
{ "material": "wood", "x": 2150, "y": 765, "w": 520, "h": 30 },
{ "material": "wood", "x": 1960, "y": 650, "w": 30, "h": 200 },
{ "material": "wood", "x": 2340, "y": 650, "w": 30, "h": 200 },
{ "material": "wood", "x": 2080, "y": 690, "w": 28, "h": 120 },
{ "material": "wood", "x": 2220, "y": 690, "w": 28, "h": 120 },
{ "material": "target", "x": 2150, "y": 710, "shape": "serpentela-w20-03" },
{ "material": "wood", "x": 2150, "y": 617, "w": 200, "h": 28 },
{ "material": "wood", "x": 2150, "y": 536, "w": 440, "h": 28 },
{ "material": "stone", "x": 2150, "y": 487, "w": 70, "h": 70 },
{ "material": "target", "x": 2150, "y": 410, "shape": "serpentela-w1-01" }
```
放好後跑一次 presettle 確認四十塊有放進玻璃罩/柱子間(77×77 的四十塊:玻璃罩內寬 96、中層柱間 112,都放得下)。

---

## 4. 檔案地圖

| 內容 | 路徑 |
| --- | --- |
| 入口 | `TL004/index.html`、`src/tl004/main.ts`(DOM、選單、結算、夥伴介紹) |
| 數值 | `src/tl004/config/Tuning.ts`、`Materials.ts`、`Abilities.ts` |
| 規則(純邏輯) | `src/tl004/rules/`:Launch、Damage、Scoring、FixedStepper、Progress |
| 物理核心 | `src/tl004/sim/BattleSim.ts`(注入 Matter;Node 測試與瀏覽器同一份) |
| 畫面 | `src/tl004/scene/BattleScene.ts`、CameraRig、Scenery、Textures |
| 夥伴資料 | `src/tl004/data/attackers.generated.json`(由 `tools/build-tl004-art.mjs` 產生,勿手改) |
| 測試 | `tests/tl004-*.test.mjs`、共用 `tests/tl004-helpers.mjs`(`createSim`、`playShots`、`playSmart`、`wantsAbility`) |
| 規格(只在原機器本地,未進版控) | `docs/TL004-v0.1.md` |

指令:`npm run dev:tl004`(port 5176)、`npm run test:tl004`、`npm run typecheck:tl004`、`npm run build:tl004`、`npm run art:tl004`。

---

## 5. 已確認的使用者決策

- 橫式;手繪繪本風;完全免費;GitHub Pages 部署;加入完整建置流程。
- 名稱《爆打四十塊》;四十塊=被攻擊方,被打中撞飛出畫面;進攻方 5 位夥伴(名字見上)。
- 文案:開場「四十塊逃家了還亂跑！快來爆打他！」、過關「四十塊被打爆了！」、失敗「還有四十塊在外面晃...」。
- 第 1 關只有木板,難度剛好(亂打玩家約 64% 過關);每關 5 發。
- 能力組合用推薦組合;解鎖=過前一關。
- 第 10 關=最早的石頭塔。

---

## 6. 地雷

- **Matter 睡眠**:兩個睡著的物體會在「睡著當下」觸發 collisionEnd,之後支撐移走不會再通知 → 不要用 collisionEnd 叫醒;現行做法是 `wakeTouchingMovers()`。建材/四十塊的睡眠門檻 3 秒,避免慢慢傾倒的柱子凍在半空。
- **調難度要重量化**:修物理後過關率會變(本次 63%→46%→64%),每次改物理都用亂打玩家模擬確認。
- **瀏覽器預覽窗格隱藏時不跑 requestAnimationFrame**,要手動 `game.step()`;Phaser 補間依真實時間,不能瞬間推幾百幀;改 JSON 會觸發 Vite 整頁重載。
- **推送**:SSH 金鑰(rafuMacaca)沒有 `tailmaskgames/TailLabs` 權限;用已登入的 gh 帳號(gfdsa2006418980,ADMIN)走 HTTPS:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/tailmaskgames/TailLabs.git main`
- 工作目錄與 TL003 對話共用:只 `git add` TL004 相關路徑;TL003 測試失敗可能來自它尚未提交的改動。
- commit 訊息:單行、前綴、繁中、不加 Co-Authored-By;不主動 commit/push(本次為使用者授權)。
- `.git/info/exclude` 有 `docs/TL004-*.md`(agent 文件預設不進版控);本檔是使用者要求推送,用 `git add -f`。
