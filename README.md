# labs

TailLabs 遊戲實驗專案，第一個實驗是 **TL001《誰複製了500隻蛇貂》**。

目前為 **0.3.3 完整流程原型**：圖片教學 → 500 隻挑戰 → 加權 Current／Next → 疊高時平順抬升畫面 → 成功或失敗結算 → 本機 Top 10 → 即時重玩。15 張正式素材沿各自凹形外框碰撞，保留局部假彈性與漸進黏住。開始遊戲後會播放循環背景音樂，可在右上角開關；落下與停穩時也有短音效，停穩會閃出一圈暖色光。

0.3.3 依試玩回饋把蛇貂與碰撞外框同步縮至前一版的 75%，魔法陣換為細線符文，兩側光柱有碰撞牆並與平台相接；簡化開場圖解。失敗時依遊戲相同權重顯示不同造型的剩餘蛇貂，每隻與結算卡右上角插圖同尺寸。

首頁上方只顯示剩餘蛇貂，下方顯示經過時間與分數；右上角可預覽下一隻。另提供 10／50／100 隻練習，各數量分開排行。指定造型的外框試放不列入排名。

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

- 桌機在場內移動滑鼠定位，左鍵落下；手機在場內拖動，放手落下。
- 鍵盤左右方向鍵移動，空白鍵或下方向鍵落下。
- 下方的左右按鈕與「放下這一隻」支援觸控及鍵盤操作。
- 按「重新開始」清空已放下物件、黏性狀態與計數。
- 碰撞處附近有輕微壓縮與回彈，局部彈簧自然回復；碰撞範圍維持各自的蛇貂輪廓。
- 首次接觸魔法陣、底部或其他已放下蛇貂後，保留約 3 秒自然運動，再逐漸減速，黏性會持續增強直到停穩。
- 移動與旋轉均低於停止門檻，且保持接觸並穩定約 0.45 秒後，固定位置與角度。
- 固定後的小綠點代表已黏住，後續碰撞仍可觸發較小的外觀回彈。
- 勾選「顯示碰撞外框」可檢查遊戲中實際外沿與內部分塊。
- 點「查看全部 15 種」進入 `colliders.html`，各造型均可獨立、重複試放。
- 依檔名權重抽選，最近兩次生成的種類不會再次抽中；預覽會直接成為下一個手持物件。
- 塔頂上升到畫面中段後，鏡頭平順抬升，手持位置跟著上移；場景中已放下物件的座標保持不變。
- 魔法陣兩側沒有實體牆；整個碰撞範圍離開平台左右邊界，或掉落到底部以下，持續 0.75 秒即失敗。
- 最後一隻放下後會等待全部停穩，才發放完成獎勵並結算。
- 「玩法圖解」與「我的排行榜」會暫停遊戲；切到其他分頁時同樣暫停，返回後繼續。
- 成績自動存入同一網址來源、同一瀏覽器的 Top 10，結算後可填寫名字；無法使用瀏覽器儲存時仍可玩，頁面會說明只暫存本次紀錄。

## 技術

| 項目 | 版本／做法 |
| --- | --- |
| Vite | 8.3.4 |
| TypeScript | 7.0.2，strict 模式 |
| Phaser | **3.90.0** |
| Matter.js | 使用 Phaser 3 隨附的自訂整合版本，單一物理世界 |
| 畫面 | 520 × 660 邏輯解析度，自動縮放與窄螢幕排版 |
| 素材 | 15 張 96 × 96 WebP 保留原始位元組，魔法陣由程式繪製，無外部字型依賴 |
| 碰撞外框 | 透明度 128 門檻、1 px 簡化；每種 34–56 節點、7–17 個凸形分塊 |

Phaser 官方說明其內建自訂版 Matter.js；這裡直接啟用 `physics.default: 'matter'`，無須另起獨立 Matter 引擎。參考：[Matter Physics](https://docs.phaser.io/phaser/concepts/physics/matter)。

## 結構

```text
labs/
├─ .github/workflows/deploy.yml   # GitHub Pages 建置與部署
├─ public/
│  ├─ assets/serpentelas/         # 15 張原圖、外框資料與 SVG 總覽
│  ├─ assets/audio/               # 循環背景音樂
│  ├─ favicon.svg
│  ├─ colliders.html             # 逐張外框檢查與試放
│  └─ .nojekyll
├─ src/
│  ├─ game/                      # 場景、舞台及物理設定
│  ├─ entities/                  # 凹形剛體、接觸處局部變形顯示
│  ├─ systems/SpawnSystem.ts      # 手持、落下、重設與顯示同步
│  ├─ systems/StickinessSystem.ts # 接觸計時、減速、停穩、凍結
│  ├─ systems/SerpentelaPicker.ts # 檔名權重 + 最近兩抽排除
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

正式建置會先清空 `dist/`，再將 TL001 建置至 `dist/TL001/`；工作流程發布整個 `dist/`，只保留 [https://gfdsa2006418980.github.io/TailLabs/TL001/](https://gfdsa2006418980.github.io/TailLabs/TL001/) 作為遊戲入口。`base: './'` 讓建置資源使用相對網址；後續新增 public 圖片時，請透過 `import.meta.env.BASE_URL` 組合路徑，避免寫死 `/assets/...`。

參考：[Vite 靜態部署與 GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)。

目前規則、原型計分參數與驗證見 `docs/gameplay.md`；物理決策歷程見 `docs/TL001.md`，初始化歷史紀錄見 `docs/validation.md`。
