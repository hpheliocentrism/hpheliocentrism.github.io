/* =========================================================
   網站/islands/registry.js — 島嶼註冊表（程式版，整合維護）
   唯一來源是 整合/README.md 第 3 節；改表時兩邊一起改。
   id      ：島嶼代號，也是網址 #id（可做 QR Code）
   q, r    ：六角格座標（公告島在 0,0）
   status  ：open 已開放 / building 建置中 / planned 規劃中
   prefix  ：後端 API 動作前綴
   stats   ：3D 場景用的免登入統計動作（沒有就留空）
   need    ：進入面板的最低權限（perms 字串）；null＝公開；'login'＝任何已登入帳號
   prop    ：scene.js 內建的預覽造景代號（有 props/<id>.js 時以該檔為準）
   ========================================================= */
window.ISLANDS = [
  {id:'notice',  name:'公告島',     q:0,  r:0,  status:'building', prefix:'notice', stats:'',          need:'login',           prop:'building',
   desc:'管委會公告、社區共同規範、各島規範總目錄'},
  {id:'package', name:'包裹島',     q:1,  r:-1, status:'building', prefix:'pkg',    stats:'pkg.stats', need:null,              prop:'boxes',
   desc:'待領包裹數量、我的包裹、管理員簽收'},
  {id:'gym',     name:'健身房島',   q:1,  r:0,  status:'building', prefix:'gym',    stats:'',          need:'login',           prop:'gym',
   desc:'開放時間 09:00–21:00、使用額度與感應扣借還、使用守則'},
  {id:'ev',      name:'充電車位島', q:0,  r:1,  status:'building', prefix:'ev',     stats:'',          need:'login',           prop:'ev',
   desc:'住戶車位自設充電樁：申裝規格、施工與驗收、電費原則'},
  {id:'parking', name:'停車場島',   q:-1, r:0,  status:'building', prefix:'park',   stats:'',          need:'login',           prop:'parking',
   desc:'汽車與機車車位、無障礙車位、訪客車登記與停車規範'},
  {id:'works',   name:'工程島',     q:-1, r:1,  status:'building', prefix:'works',  stats:'',          need:'login',           prop:'works', tagH:4.4,
   desc:'住戶裝修施工登記：施工廠商、施工日期與時段'},
  {id:'admin',   name:'管委會島',   q:0,  r:-1, status:'building', prefix:'',       stats:'',          need:'*:admin',         prop:'office',
   desc:'後台：帳號、屋主名單、規則參數、系統檢查'}
];
