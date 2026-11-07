/* =========================================================
   網站/core/api.js — 呼叫後端（整合維護）
   規格：claude/community-core/API.md 第 1、2 節
   - 一律 POST 到同一個網址，Content-Type 必須是 text/plain，不加任何自訂標頭
   - 回傳 {ok, data} 或 {ok:false, code, error, field}
   - MOCK 模式改呼叫 window.MockBackend.handle()
   ========================================================= */
window.API = (function(){
  const C = window.CONFIG;
  let statsCache = null;

  async function call(action, body){
    const req = Object.assign({action}, body || {});
    const tok = window.Auth && Auth.token();
    if(tok && !req.token) req.token = tok;
    let res;
    try{
      if(C.MOCK){
        await new Promise(r => setTimeout(r, 250 + Math.random()*350));   // 模擬網路延遲
        res = window.MockBackend.handle(JSON.parse(JSON.stringify(req)));
      } else {
        if(!C.API_URL) return {ok:false, code:'INTERNAL', error:'尚未設定後端網址（config.js 的 API_URL）'};
        const r = await fetch(C.API_URL, {
          method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify(req), redirect:'follow'
        });
        res = await r.json();
      }
    }catch(e){
      return {ok:false, code:'NETWORK', error:'連線失敗，請確認網路後再試一次'};
    }
    if(res && res.code === 'BUSY'){                 // 系統忙碌：自動重試一次
      await new Promise(r => setTimeout(r, 1200));
      return call(action, body);
    }
    if(res && (res.code === 'AUTH_EXPIRED' || res.code === 'AUTH_REQUIRED') && window.Auth){
      Auth.clear(); document.dispatchEvent(new CustomEvent('auth:expired'));
    }
    if(res && res.v && Number(String(res.v).split('.')[0]) !== C.API_MAJOR){
      document.dispatchEvent(new CustomEvent('api:version', {detail:res.v}));
    }
    return res;
  }

  /* 公開統計：前端快取 5 分鐘；簽收或領取後呼叫 invalidateStats() */
  async function stats(force){
    if(!force && statsCache && Date.now() - statsCache.at < C.STATS_CACHE_MS) return statsCache.res;
    const res = await call('pkg.stats');
    if(res.ok) statsCache = {at:Date.now(), res};
    return res;
  }
  function invalidateStats(){ statsCache = null; }

  return {call, stats, invalidateStats};
})();
