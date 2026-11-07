# 網站：本地測試與部署說明

給接手的管委會成員。這個資料夾就是整個前端網站，上傳到 GitHub Pages 即可使用。

## 檔案分工

| 檔案 | 負責 | 內容 |
|---|---|---|
| `index.html` | 整合 | 外殼與載入順序 |
| `config.js` | 整合 | 後端網址、假資料開關（只放公開網址） |
| `islands/registry.js` | 整合 | 島嶼註冊表，與 `整合/README.md` 第 3 節一致 |
| `core/api.js` `core/auth.js` `core/app.js` `core/app.css` | 整合 | 呼叫後端、登入、路由、面板外框、2D 簡易模式 |
| `panels/<島>.js` | 整合 | 各島的面板（清單、表單） |
| `mock/mock.js` | 整合 | 假資料後端（驗證階段用） |
| `scene/scene.js` `scene/theme.css` `scene/props/<島>.js` | 美術 | 3D 場景、配色字型、各島造景 |

## 網址用法

| 網址 | 作用 |
|---|---|
| `…/` | 群島首頁 |
| `…/#package` | 直接打開包裹島（QR Code 用這個） |
| `…/?view=2d` | 強制簡易模式（不載入 3D） |
| `…/?mode=verify&t=…` | 驗證信連結（屋主首次設定、家人受邀、重設密碼） |

手機效能較弱或 WebGL 無法使用時，會自動改用簡易模式。

## 假資料模式（目前）

`config.js` 裡 `MOCK: true`。不連後端，資料只存在瀏覽器記憶體，重新整理就重來。

測試帳號（密碼都是 `test1234`，只在假資料模式有效）：

| 帳號 | 角色 |
|---|---|
| `chair` | 管委會 |
| `guard1` | 管理員 |
| `owner@example.com` | 屋主（2A） |
| `3b` | 長輩帳號（3B） |

驗證頁測試：`?mode=verify&t=demo-setup`、`demo-family`、`demo-reset`。

本機預覽：在這個資料夾執行 `python3 -m http.server 8000`，瀏覽器開 `http://localhost:8000`。不能直接雙擊 index.html 開啟。

## 接上真正的後端

1. 後端依 `claude/community-core/DEPLOY_CHECKLIST.md` 部署好，取得 `…/exec` 網址。
2. 先開 `API_URL?action=ping`，確認看得到 JSON。
3. 改 `config.js`：`MOCK: false`、填入 `API_URL` 與 `FRONT_URL`（本網站網址）。
4. 後端選單「設定前端網址」也填同一個 `FRONT_URL`，驗證信才會連回來。

## 部署到 GitHub Pages

1. 用管委會信箱註冊 GitHub，開兩步驟驗證。
2. 建立一個公開的 repository，把本資料夾全部檔案放在根目錄。
3. Settings → Pages → Source 選 `main` 分支、根目錄，儲存。
4. 幾分鐘後網址會出現在同一頁，形如 `https://<帳號>.github.io/<repo>/`。

專案裡沒有任何密碼或金鑰；請維持這樣，不要把密碼寫進任何檔案。
