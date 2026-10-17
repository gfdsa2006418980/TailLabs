# TailLabs — TL001《誰複製了 500 隻蛇貂？》

TailLabs 是一組瀏覽器遊戲實驗；TL001 是一款把蛇貂疊回魔法陣的物理堆疊挑戰。每局可選 10、50、100 或 500 隻，預設從 10 隻開始；蛇貂會從 15 種造型中依權重抽選，最近兩次抽到的造型不會立刻重複。

遊戲使用各造型的輪廓碰撞，蛇貂接觸後會有局部柔軟變形、晃動與回彈，並隨時間逐漸穩定。堆疊升高時鏡頭會平順跟隨；放置過程、失敗與成功都有音效。畫面支援桌機與手機，採固定直式遊戲比例並依視窗縮放。

繁體中文、日文與英文介面會依裝置語言選擇初始語言：日文和繁體中文地區使用對應介面，其他語言預設英文；玩家也能在玩法視窗切換語言。背景音樂與遊戲音效可分別調整音量或靜音，設定會保存在目前瀏覽器；預設音樂為 100%，音效為 200%。

## 啟動

需要 Node.js 22.12 以上，建議使用 Node.js 22 LTS；目前相依版本已鎖在 `package-lock.json`。

在 Windows 可以直接雙擊 **`啟動 labs.cmd`**，它會啟動本機伺服器並開啟瀏覽器。第一次下載專案時，啟動檔會先安裝相依套件。

也可以在專案資料夾執行：

```sh
npm ci
npm run dev
```

本機網址為 `http://localhost:5173/`。同區網手機可使用啟動時顯示的 Network 網址，實際連線仍取決於本機網路與防火牆設定。

## 操作與手感

- 桌機在場內移動滑鼠定位，點擊落下；手機在場內拖動，放手落下。
- 鍵盤左右方向鍵移動，空白鍵或下方向鍵落下。
- 下方的左右按鈕與「放下」按鈕支援觸控操作。
- 「重新開始」會重新開啟玩法視窗，可清空本局並重新選擇挑戰數量。
- 時間與分數顯示在場地左右兩側，剩餘數量與已放穩數量靠近下方左右控制鍵。
- 碰撞處會有局部柔軟變形、晃動與連續回彈；碰撞範圍依各蛇貂外形製作。
- 首次接觸魔法陣、底部或其他已放下蛇貂後，保留約 3 秒自然運動，再逐漸減速，黏性會持續增強直到停穩。
- 移動與旋轉均低於停止門檻，且保持接觸並穩定約 0.45 秒後，固定位置與角度。
- 固定後的小綠點代表已黏住，後續碰撞仍可觸發較小的外觀回彈。
- 開發者可在網址加上 `?outline=1` 顯示遊戲中的碰撞外框與內部分塊。
- 開啟 `colliders.html` 可檢查 15 種造型的外框，並獨立、重複試放指定造型；這種試放不列入排行榜。
- 依檔名權重抽選，最近兩次生成的種類不會再次抽中；預覽會直接成為下一個手持物件。
- 塔頂上升到畫面中段後，鏡頭平順抬升，手持位置跟著上移；場景中已放下物件的座標保持不變。
- 50、100、500 隻挑戰的光柱設有碰撞邊界；蛇貂離開安全範圍或掉出場地並持續 0.75 秒，即判定失敗。
- 最後一隻放下後會等待全部停穩，才發放完成獎勵並結算。
- 「玩法圖解」與「我的排行榜」會暫停遊戲；切到其他分頁時同樣暫停，返回後繼續。
- 每種挑戰各自保留最多 100 筆排行榜紀錄。未設定共用排行榜服務時，排行榜使用目前瀏覽器的紀錄；若部署環境設定了共用排行榜服務，成績會同步至全球排行榜，並同時保存在本機。無法使用瀏覽器儲存時仍可遊玩，但紀錄只保留在目前分頁工作階段。

## 技術

| 項目 | 版本／做法 |
| --- | --- |
| Vite | 8.3.4 |
| TypeScript | 7.0.2，strict 模式 |
| Phaser | **3.90.0** |
| Matter.js | 使用 Phaser 3 隨附的自訂整合版本，單一物理世界 |
| 畫面 | 520 × 660 直式邏輯比例，依視窗自動縮放 |
| 素材 | 15 張 96 × 96 WebP 保留原始位元組，魔法陣由程式繪製，無外部字型依賴 |
| 碰撞外框 | 透明度 128 門檻、1 px 簡化；每種 34–56 節點、7–17 個凸形分塊 |

Phaser 官方說明其內建自訂版 Matter.js；這裡直接啟用 `physics.default: 'matter'`，無須另起獨立 Matter 引擎。參考：[Matter Physics](https://docs.phaser.io/phaser/concepts/physics/matter)。

## 結構

```text
labs/
├─ .github/workflows/deploy.yml   # GitHub Pages 建置與部署
├─ public/
│  ├─ assets/serpentelas/         # 15 張原圖、外框資料與 SVG 總覽
│  ├─ assets/audio/               # 循環背景音樂；遊戲音效由 Web Audio 即時產生
│  ├─ favicon.svg
│  ├─ colliders.html             # 逐張外框檢查與試放
│  └─ .nojekyll
├─ src/
│  ├─ game/                      # 場景、舞台及物理設定
│  ├─ entities/                  # 凹形剛體、接觸處局部變形顯示
│  ├─ systems/SpawnSystem.ts      # 手持、落下、重設與顯示同步
│  ├─ systems/StickinessSystem.ts # 接觸計時、減速、停穩、凍結
│  ├─ systems/SerpentelaPicker.ts # 檔名權重 + 最近兩抽排除
│  ├─ systems/SharedLeaderboard.ts # 共用排行榜 API
│  ├─ systems/AudioPreferences.ts  # 音量、靜音偏好
│  ├─ data/                      # 蛇貂定義與產生的外框資料
│  ├─ ui/controls.ts             # 按鈕及狀態顯示
│  ├─ main.ts
│  └─ style.css
├─ tests/                        # 幾何、實際物理與抽選測試
├─ tools/                        # 可重現的透明度描邊與外框輸出
├─ docs/TL001.md
├─ index.html
├─ vite.config.ts
└─ 啟動 labs.cmd
```

## 檢查與建置

```sh
npm test
npm run build
npm run preview
```

`npm run build` 會先做 TypeScript 型別檢查，再輸出 `dist/`；正式建置預覽位於 `http://localhost:4173/`。`npm test` 使用 Phaser 隨附的 Matter 引擎，涵蓋外框、黏性、局部彈簧、加權佇列、勝敗與計分、抬升鏡頭、排行榜儲存，以及實際 10 隻凹形剛體的完整成功流程。

## 外框檢查與重建

啟動後開啟 `http://localhost:5173/colliders.html`。橘線為外框，綠線為引擎使用的凸形分塊；「試放這種造型」會把該造型固定為當前測試對象，供重複落下檢查。回到沒有 `shape` 參數的首頁即可恢復正常抽選。

本次素材實際分組為權重 50 × 5、20 × 5、5 × 3、1 × 2，總權重 367；剪貼簿的額外附件是既有造型，未另計為第 16 種。

外框已產生並納入版本管理，日常啟動或部署無須 Python。如需重建，使用具 Pillow、numpy 的 Python 執行：

```sh
python tools/trace-colliders.py <原始圖片資料夾>
node tools/finalize-colliders.mjs
```

這兩個工具只讀取原圖透明度並複製原始 WebP 位元組，不會裁切、重畫或覆寫原圖。細節與驗證見 `docs/colliders.md`。

Phaser 引擎壓縮後約 1.2 MB（gzip 約 319 KB），Vite 會提示大型區塊；目前已獨立分塊以便快取，此提示不影響建置。30 Hz 壓力測試會觸發 Matter 建議使用較小物理步長的訊息；場景預設採 Phaser 的 60 Hz 物理步長。

## GitHub Pages

GitHub Pages 部署工作流程已設定；合入 `main` 並完成 Pages 設定後，TL001 會發布到下方網址。

1. 在 GitHub repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. 將變更推送到 `main`，或從 Actions 手動執行 **Deploy to GitHub Pages**。
3. 工作流程會安裝鎖定套件、型別檢查、建置、執行黏性物理測試，然後發布 `dist/`。

正式建置會先清空 `dist/`，將 TL001 建置至 `dist/TL001/`，再由 `tools/build-commission.mjs` 將遊戲委託頁輸出至 `dist/Commission/`。工作流程發布整個 `dist/`：

- 遊戲入口：[蛇貂疊疊樂](https://gfdsa2006418980.github.io/TailLabs/TL001/)
- 委託入口：[浣熊拉芙・遊戲委託](https://gfdsa2006418980.github.io/TailLabs/Commission/)

委託頁的 HTML、樣式、互動位於 `commission/`，直接編輯後執行 `npm run build` 即可。內容依[遊戲委託文件](https://docs.google.com/document/d/1NwfgXDX-ODlL-yqW9u1Fa0S5FQNrrzrTELzfNiWD2zs/edit?tab=t.0) 於 2026-10-18 的版本整理；文件後續修改需同步更新網頁。頁面以靜態檔案運作，主視覺使用 CSS 橘色表情球，包含方案範例切換、可展開條款、取消費用試算，以及可複製的委託訊息；資料只在訪客的瀏覽器中處理。

若要啟用共用排行榜，請在 GitHub repository variables 設定 `VITE_LEADERBOARD_API_URL`。`base: './'` 讓遊戲資源使用相對網址；後續新增 public 圖片時，請透過 `import.meta.env.BASE_URL` 組合路徑，避免寫死 `/assets/...`。

參考：[Vite 靜態部署與 GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)。

目前規則、原型計分參數與驗證見 `docs/gameplay.md`；物理決策歷程見 `docs/TL001.md`，初始化歷史紀錄見 `docs/validation.md`。
