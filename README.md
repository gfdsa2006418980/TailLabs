# labs

TailLabs 遊戲實驗專案，第一個實驗是 **TL001《誰複製了500隻蛇貂》**。

目前為 0.2 輪廓原型：15 張蛇貂圖片已接入各自的凹形碰撞外框，可左右定位、落下、碰撞與堆疊，支援柔軟回彈及漸進黏住。一般試玩依圖片檔名的權重抽選並排除最近兩抽；NEXT 預覽與正式勝敗規則仍待後續接入。

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

- 滑鼠／手指在場內移動以定位，點擊場內落下。
- 鍵盤左右方向鍵移動，空白鍵或下方向鍵落下。
- 下方的左右按鈕與「放下這一隻」支援觸控及鍵盤操作。
- 按「重新開始」清空已放下物件、黏性狀態與計數。
- 碰撞處附近有輕微壓縮與回彈，局部彈簧自然回復；碰撞範圍維持各自的蛇貂輪廓。
- 首次接觸魔法陣、底部或其他已放下蛇貂後，保留約 3 秒自然運動，再逐漸減速，黏性會持續增強直到停穩。
- 移動與旋轉均低於停止門檻，且保持接觸並穩定約 0.45 秒後，固定位置與角度。
- 固定後的小綠點代表已黏住，後續碰撞仍可觸發較小的外觀回彈。
- 勾選「顯示碰撞外框」可檢查遊戲中實際外沿與內部分塊。
- 點「查看全部 15 種」進入 `colliders.html`，各造型均可獨立、重複試放。

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
│  ├─ assets/audio/               # 後續音效
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

`npm run build` 會先做 TypeScript 型別檢查，再輸出 `dist/`；正式建置預覽位於 `http://localhost:4173/`。`npm test` 使用 Phaser 隨附的 Matter 引擎，涵蓋 15 種外框的原檔雜湊、凹處保留、重心對齊、逐隻落地黏住、固定後承受新撞擊、複合剛體多接觸、轉動慣性與落地穩定性、局部彈簧回復，以及最近兩抽排除。

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

已提供部署設定，尚未連接 GitHub 遠端或實際發布。

1. 將這個資料夾的 Git repository 推送到 GitHub，預設分支使用 `main`。
2. 在 GitHub repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 推送到 `main`，或從 Actions 手動執行 **Deploy to GitHub Pages**。
4. 工作流程會安裝鎖定套件、型別檢查、建置、執行黏性物理測試，然後發布 `dist/`。

`base: './'` 讓建置的資源使用相對網址，可支援 `https://<帳號>.github.io/labs/` 與網域根目錄。後續新增 public 圖片時，請透過 `import.meta.env.BASE_URL` 組合路徑，避免寫死 `/assets/...`。

參考：[Vite 靜態部署與 GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)。

本階段的範圍與後續規格記於 `docs/TL001.md`；實際檢查結果記於 `docs/validation.md`。
