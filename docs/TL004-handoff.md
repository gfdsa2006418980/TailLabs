# TL004《爆打四十塊》交接(2026-10-22)

> 給下一個工作階段(換機器、換模型都能接手)。線上:https://tailmaskgames.github.io/TailLabs/TL004/
> 本次改動尚未提交;上一個提交:`bb724e4 docs: TL004 交接文件(20 關、選關與存檔待辦)`

---

## 1. 現況

- 橫式彈射遊戲,**20 關**、選關畫面、存檔都已接好。流程:開始 → 選關 → 關卡 → 結算(下一關/再玩一次/選關)。
- 進攻方 **7 位夥伴**:彩燈、竹筍、撲克、薑片、3D油飯、札西德勒、澗(原圖 `art/tl004/attackers/`,`npm run art:tl004` 重新產生貼圖與碰撞外框)。
  - 2026-10-22 修正:竹筍與薑片的圖片原本放反,已對調(竹筍=藍色紅尾那隻,薑片=灰白那隻);能力跟著名字走(竹筍=破竹衝刺、薑片=辣勁彈跳)。
  - 札西德勒、澗的原圖已裁切置中並縮放到和其他夥伴一樣大(約佔畫框 69%)。
- 目標「四十塊」= TL001 的 15 種蛇貂(真實凹形外框),被打倒時用物理踢飛出畫面。
- **能力**:每發一次。飛行中點畫面(或下方提示鈕、空白鍵)發動;**碰到東西後 1 秒內也還能發動**(`ABILITY_GRACE_STEPS`),此時提示鈕變橘色閃動。

  | 夥伴 | 能力 | 實作 |
  | --- | --- | --- |
  | 彩燈 | 煙火爆炸 | 本體消失,半徑 210 範圍推開+傷害 |
  | 竹筍 | 破竹衝刺 | 加速到 26 px/步,撞穿木板/玻璃,碰石頭/地面/四十塊停 |
  | 撲克 | 三張牌分身 | 多出兩張 0.75 倍的牌,±0.2 弧度散開 |
  | 薑片 | 辣勁彈跳 | 彈性 0.95,撞擊傷害 ×1.6 |
  | 3D油飯 | 重壓下砸 | 停住、質量 ×3、垂直下砸 |
  | 札西德勒 | 吉祥大翻滾 | 質量 ×3,往前滾 2.5 秒(持續補到 11 px/步、持續旋轉),把擋路的東西推倒 |
  | 澗 | 山澗激流 | 前方 560 px 的水帶把木板/四十塊往前沖(不直接扣血,靠翻倒碰撞);石頭只動 30%,且擋住它後面的東西 |

  碰撞後才發動時,方向改用發射方向(速度太小時)。數值與說明文字都在 `src/tl004/config/Abilities.ts`。
- **發射音效**:每位夥伴離開彈弓時有一聲電子「weeeee」(方波+鋸齒波、上滑後顫音),音高各不相同,在 `Sfx.ts` 的 `LAUNCH_PITCH`(3D油飯最低 G4 … 澗最高 A5)。
- **右上角 ☰ 選單**:繼續、重新開始、選擇關卡、夥伴介紹、音效開關。HUD 顯示「第 N 關」。結算畫面開著時 ☰ 不作用(避免面板疊在一起)。
- **存檔**:`Progress`(`localStorage` 鍵 `taillabs.tl004.progress.v1`)。過關才寫入(最佳星數、最高分);過前一關(≥1 星)才開下一關。無法儲存時結算顯示「本次紀錄只保存在此分頁」。iPhone 主畫面 App 與 Safari 不共用 localStorage(轉移碼之後再做)。

---

## 2. 20 關

關卡幾何在 `tools/tl004-levels.mjs`(小積木函式:`post`、`slab`、`hut`、`t`;`dx` 整關左右平移),順序在檔尾 `ORDER`。
`npm run levels:tl004` 會檢查、求解並寫出 `src/tl004/levels/levels.json`(遊戲與測試都讀這份)。

| 關 | id | 名稱 | 四十塊 | 發數 | 亂打過關率(不用/用能力) |
| --- | --- | --- | --- | --- | --- |
| 1 | m1-wood-hut | 木造小工坊 | 3 | 5 | 62% / 98% |
| 2 | firework-shed | 煙火工坊(彩燈) | 3 | 5 | 38% / 74% |
| 3 | bamboo-gate | 竹林關(竹筍) | 3 | 5 | 49% / 73% |
| 4 | card-tower | 紙牌塔(撲克) | 3 | 5 | 41% / 71% |
| 5 | rice-press | 油飯壓頂(3D油飯) | 3 | 5 | 40% / 71% |
| 6 | spicy-bounce | 辣味彈跳(薑片) | 3 | 5 | 25% / 60% |
| 7 | glasshouse | 玻璃溫室(澗登場) | 4 | 5 | 12% / 65% |
| 8 | twin-towers | 雙塔 | 4 | 5 | 13% / 64% |
| 9 | longhouse | 長屋(札西德勒登場) | 3 | 5 | 14% / 42% |
| 10 | stone-front | 石頭擋路(使用者指定的最早石頭塔) | 3 | 5 | 9% / 23% |
| 11 | stone-base | 石基高塔 | 4 | 5 | 15% / 50% |
| 12 | stone-wall | 石牆小屋 | 3 | 5 | 16% / 43% |
| 13 | bunker | 碉堡 | 4 | 5 | 2% / 44% |
| 14 | stair-town | 階梯城 | 4 | 5 | 6% / 37% |
| 15 | stone-gate | 石門 | 4 | 5 | 7% / 36% |
| 16 | glass-spire | 玻璃尖塔 | 4 | 4 | 1% / 25% |
| 17 | castle | 四十塊城堡 | 5 | 4 | 2% / 26% |
| 18 | stone-heart | 石心塔 | 5 | 4 | 2% / 26% |
| 19 | twin-spires | 雙子高塔 | 4 | 4 | 1% / 14% |
| 20 | headquarters | 四十塊總部 | 5 | 3 | 6% / 14% |

- **亂打玩家**:每發隨機角度 -0.15~-1.0 rad、力道 0.65~1.0,每關 300 局。「用能力」= 用 `wantsAbility()` 的時機。
  舊交接寫的「第 1 關約 64%」是**不用能力**的數字(本次重測 62%)。難度曲線以「用能力」那欄為主。
- 第 10 關是使用者指定的塔,位置沒動,只換了陣容;它離彈弓遠、要接近滿弓,所以比前後關難(中段的難關)。
- **機器人**:每發掃 25 角度 × 4 力道 × (用/不用能力),貪婪選最好;過關解法存成 `solution`,`tests/tl004-levels.test.mjs` 直接重播斷言過關。大多數關卡機器人一發就過(精準瞄準+能力很強)。
- **星級**:`three = floor(0.85 × 機器人最佳分 / 1000) × 1000`、`two = floor((四十塊數 × 5000 + three) / 2 / 1000) × 1000`;第 1 關維持 35000/45000。
- 關卡 id 是存檔鍵:**已上線的關卡不要改 id**;調整順序只改 `ORDER`。
- 亂打玩家的落點集中在 x≈1400~1500,1800 以後明顯變少;塔往右移=變難,太近反而容易打過頭。

---

## 3. 可能的下一步

- 實機試玩調整難度(機器人與亂打都不等於真人)。
- 存檔轉移碼(iPhone 主畫面 App 與 Safari 分開存)。
- 新夥伴的能力特效目前是粒子+染色,之後可換成手繪特效。

---

## 4. 檔案地圖

| 內容 | 路徑 |
| --- | --- |
| 入口 | `TL004/index.html`、`src/tl004/main.ts`(DOM、選單、選關、存檔、結算、夥伴介紹) |
| 數值 | `src/tl004/config/Tuning.ts`、`Materials.ts`、`Abilities.ts` |
| 規則(純邏輯) | `src/tl004/rules/`:Launch、Damage、Scoring、FixedStepper、Progress |
| 物理核心 | `src/tl004/sim/BattleSim.ts`(注入 Matter;Node 測試與瀏覽器同一份) |
| 畫面 | `src/tl004/scene/BattleScene.ts`(`startLevel()` 換關、`restartLevel()` 重來)、CameraRig、Scenery、Textures |
| 音效 | `src/tl004/audio/Sfx.ts`(全部即時合成;`wee()` 為發射音) |
| 夥伴資料 | `src/tl004/data/attackers.generated.json`(由 `tools/build-tl004-art.mjs` 產生,勿手改) |
| 關卡 | 幾何 `tools/tl004-levels.mjs` → `tools/tl004-balance.mjs` → `src/tl004/levels/levels.json`(產生檔,勿手改) |
| 模擬工具 | `tools/tl004-sim-kit.mjs`(Matter、`wantsAbility`、`playReplay`;測試與平衡工具共用) |
| 測試 | `tests/tl004-*.test.mjs`、共用 `tests/tl004-helpers.mjs` |
| 規格(只在原機器本地,未進版控) | `docs/TL004-v0.1.md` |

指令:`npm run dev:tl004`(port 5176)、`npm run test:tl004`、`npm run typecheck:tl004`、`npm run build:tl004`、`npm run art:tl004`、`npm run levels:tl004`(可加 `-- --only=3,5` 只重算某幾關、`-- --runs=300`)。

---

## 5. 已確認的使用者決策

- 橫式;手繪繪本風;完全免費;GitHub Pages 部署;加入完整建置流程。
- 名稱《爆打四十塊》;四十塊=被攻擊方,被打中撞飛出畫面;進攻方 7 位夥伴(名字見上)。
- 文案:開場「四十塊逃家了還亂跑！快來爆打他！」、過關「四十塊被打爆了！」、失敗「還有四十塊在外面晃...」。
- 第 1 關只有木板,難度剛好;每關 5 發(16~20 關 3~4 發)。
- 能力組合用推薦組合;能力在碰到物體後 1 秒內仍可發動;每位夥伴發射時有不同音高的電子 weeeee。
- 解鎖=過前一關;第 10 關=最早的石頭塔。

---

## 6. 地雷

- **Matter 睡眠**:兩個睡著的物體會在「睡著當下」觸發 collisionEnd,之後支撐移走不會再通知 → 不要用 collisionEnd 叫醒;現行做法是 `wakeTouchingMovers()`。建材/四十塊的睡眠門檻 3 秒,避免慢慢傾倒的柱子凍在半空。
- **改物理或能力就要重跑 `npm run levels:tl004`**:解法是逐步重播,物理一變就可能不再過關(測試會抓到),星級也要重算。
- 有幾種四十塊(w20-04、w50-04、w5-03)放上去會自己側躺,屬正常;平衡工具允許四十塊沉降時移動 45 px 內。
- **瀏覽器預覽窗格隱藏時不跑 requestAnimationFrame**,要手動 `game.step()`;Phaser 補間依真實時間,不能瞬間推幾百幀;改 JSON 會觸發 Vite 整頁重載。開發模式有 `window.tl004.playLevel(n)` 直接跳關。
- **美術建置需要 ImageMagick**(`magick`)。2026-10-22 在這台機器用 `winget install ImageMagick.ImageMagick` 裝好(7.1.2,路徑 `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI`;新開的終端機才吃得到 PATH)。新版本重編碼會讓沒改過的 webp 也產生差異,只提交真的有變的圖。
- **推送**:SSH 金鑰(rafuMacaca)沒有 `tailmaskgames/TailLabs` 權限;用已登入的 gh 帳號(gfdsa2006418980,ADMIN)走 HTTPS:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/tailmaskgames/TailLabs.git main`
- 工作目錄與其他對話共用:只 `git add` TL004 相關路徑(TL002 有別人未提交的改動);TL003 測試失敗可能來自它尚未提交的改動。
- commit 訊息:單行、前綴、繁中、不加 Co-Authored-By;不主動 commit/push。
- `.git/info/exclude` 有 `docs/TL004-*.md`(agent 文件預設不進版控);本檔已被追蹤,改動會照常出現在 git status。
