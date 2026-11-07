/* =========================================================
   網站/config.js — 部署設定（只放公開網址，絕對不要放密碼或金鑰）
   MOCK = true  ：用 mock/mock.js 的假資料，不連後端（驗證階段）
   MOCK = false ：連 API_URL 的 Apps Script 後端
   API_URL      ：Apps Script「網頁應用程式」網址（…/exec）
   FRONT_URL    ：本網站的公開網址（驗證信連結會指向這裡）
   ========================================================= */
window.CONFIG = {
  MOCK: false,
  API_URL: 'https://script.google.com/macros/s/AKfycbytQtbQpV4dxihcs8aW2zy9u0u8Y8f8TFeAdgavi8cpEk-pY7bpsuftZaIeupsscspz/exec',   // 測試後端（環境=測試）
  FRONT_URL: 'https://jttaiwan.github.io/heliocentrism-islands/',
  API_MAJOR: 2,            // 後端主版號；不符時提示重新整理
  STATS_CACHE_MS: 5 * 60 * 1000
};
