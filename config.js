/* =========================================================
   網站/config.js — 部署設定（只放公開網址，絕對不要放密碼或金鑰）
   MOCK = true  ：用 mock/mock.js 的假資料，不連後端（驗證階段）
   MOCK = false ：連 API_URL 的 Apps Script 後端
   API_URL      ：Apps Script「網頁應用程式」網址（…/exec）
   FRONT_URL    ：本網站的公開網址（驗證信連結會指向這裡）
   ========================================================= */
window.CONFIG = {
  MOCK: false,
  API_URL: 'https://script.google.com/macros/s/AKfycbzopIAaA2kzarFWMq7t--LnLANigZ8U_x413XLETzKbr0TdoRj8aXN3Skim7G7f385H/exec',   // 測試後端（環境=測試，管委會帳號部署）
  FRONT_URL: 'https://hpheliocentrism.github.io/',
  API_MAJOR: 2,            // 後端主版號；不符時提示重新整理
  STATS_CACHE_MS: 5 * 60 * 1000,
  // 停車場島 3D 倒數看板：面板上線後以後端 park.stats.drawAt 為準，這裡是讀不到後端時的後備（兩邊保持一致）
  PARKING_DRAW: {drawAt:'2026-11-25T08:00:00+08:00', title:'機車位線上抽籤'},
  // 停車場試抽期間：面板標示「測試結果、非正式」。正式抽籤（11/25）前、換成正式名單時把這一行刪掉
  PARKING_TRIAL: true
};
