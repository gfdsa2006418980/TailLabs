# labs

TailLabs 遊戲實驗專案，第一個實驗是 **TL001《誰複製了500隻蛇貂》**。

目前完成可執行的最小場景：測試圓球可左右定位、落下、碰撞與堆疊，支援柔軟回彈及漸進黏住。正式蛇貂素材、抽選與遊戲勝敗規則會在後續階段接入。

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
- 碰撞時有輕微壓扁與回彈，外觀約 0.4 秒恢復；碰撞範圍維持固定圓形。
- 首次接觸魔法陣、底部或其他已放下圓球後，保留約 3 秒自然運動，再逐漸減速。
- 移動與旋轉均低於停止門檻，且保持接觸並穩定約 0.45 秒後，固定位置與角度。
- 固定後的小綠點代表已黏住，後續碰撞仍可觸發較小的外觀回彈。

## 技術

| 項目 | 版本／做法 |
| --- | --- |
| Vite | 8.3.4 |
| TypeScript | 7.0.2，strict 模式 |
| Phaser | **3.90.0** |
| Matter.js | 使用 Phaser 3 隨附的自訂整合版本，單一物理世界 |
| 畫面 | 520 × 660 邏輯解析度，自動縮放與窄螢幕排版 |
| 素材 | 當前圓球與魔法陣由程式繪製，無外部圖片或字型依賴 |

Phaser 官方說明其內建自訂版 Matter.js；這裡直接啟用 `physics.default: 'matter'`，無須另起獨立 Matter 引擎。參考：[Matter Physics](https://docs.phaser.io/phaser/concepts/physics/matter)。

## 結構

```text
labs/
├─ .github/workflows/deploy.yml   # GitHub Pages 建置與部署
├─ public/
│  ├─ assets/serpentelas/         # 後續蛇貂圖片
│  ├─ assets/audio/               # 後續音效
│  ├─ favicon.svg
│  └─ .nojekyll
├─ src/
│  ├─ game/                      # 場景、舞台及物理設定
│  ├─ entities/TestOrb.ts         # 固定碰撞圓形 + 獨立柔軟外觀
│  ├─ systems/SpawnSystem.ts      # 手持、落下、重設與顯示同步
│  ├─ systems/StickinessSystem.ts # 接觸計時、減速、停穩、凍結
│  ├─ data/                      # 預留正式蛇貂定義
│  ├─ ui/controls.ts             # 按鈕及狀態顯示
│  ├─ main.ts
│  └─ style.css
├─ tests/stickiness.test.mjs
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

`npm run build` 會先做 TypeScript 型別檢查，再輸出 `dist/`；正式建置預覽位於 `http://localhost:4173/`。`npm test` 使用 Phaser 隨附的 Matter 引擎驗證接觸、3 秒延遲、漸進減速、旋轉停止、空中不凍結、重設與固定後承受後續撞擊。

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
