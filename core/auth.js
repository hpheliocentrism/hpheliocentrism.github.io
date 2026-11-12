/* =========================================================
   網站/core/auth.js — 登入狀態（整合維護）
   - token 不放網址
   - 住戶（owner／member）存 localStorage；管理員、管委會存 sessionStorage（共用手機較安全）
   - 權限一律看 user.perms（「島:等級」），不用 role 字串硬編
   ========================================================= */
window.Auth = (function(){
  const KEY = 'hp_session';
  // 各島等級由低到高（API.md 第 3 節、第 10.2 節）；沒列的島預設 resident < admin
  const LEVELS = {pkg:['resident','sign','admin'], gym:['resident','guard','admin'], works:['resident','guard','admin'],
                  ev:['resident','agent','admin'], fee:['resident','admin'], park:['resident','guard','admin']};
  let session = null;                                        // {token, expiresAt, user}
  let consent = null;                                        // 需要重新同意時：{version, text}（只放記憶體）

  const store = role => (role === 'admin' || role === 'committee') ? sessionStorage : localStorage;
  function safe(fn){ try{ return fn(); }catch(e){ return null; } }

  function load(){
    for(const s of [sessionStorage, localStorage]){
      const raw = safe(() => s.getItem(KEY));
      if(!raw) continue;
      const v = safe(() => JSON.parse(raw));
      if(v && v.token && (!v.expiresAt || new Date(v.expiresAt) > new Date())){ session = v; return; }
      safe(() => s.removeItem(KEY));
    }
  }
  function save(data){
    session = {token:data.token, expiresAt:data.expiresAt, user:data.user};
    clearStores();
    // 只存登入所需最少資料：不存電話、Email
    const u = data.user || {};
    const slim = {token:data.token, expiresAt:data.expiresAt,
      user:{id:u.id, name:u.name, role:u.role, roleLabel:u.roleLabel, unit:u.unit, perms:u.perms||[], mustChangePassword:!!u.mustChangePassword}};
    safe(() => store(u.role).setItem(KEY, JSON.stringify(slim)));
    document.dispatchEvent(new CustomEvent('auth:change'));
  }
  function clearStores(){ safe(() => localStorage.removeItem(KEY)); safe(() => sessionStorage.removeItem(KEY)); }
  function clear(){ session = null; consent = null; clearStores(); document.dispatchEvent(new CustomEvent('auth:change')); }

  /* can('pkg:sign')；can('*:admin') = 任一島的 admin */
  function can(perm){
    if(!perm) return true;
    if(!session) return false;
    if(perm === 'login') return true;
    const [isl, lv] = perm.split(':');
    return (session.user.perms || []).some(p => {
      const [pi, pl] = p.split(':');
      if(isl !== '*' && pi !== isl) return false;
      const order = LEVELS[pi] || ['resident','admin'];
      const have = order.indexOf(pl), need = order.indexOf(lv);
      return have >= 0 && need >= 0 ? have >= need : pl === lv;
    });
  }

  const noteConsent = d => { consent = d && d.needReconsent ? {version:d.consentVersion, text:d.consentText} : null; };
  async function login(account, password){
    const res = await API.call('auth.login', {account, password});
    if(res.ok){ noteConsent(res.data); save(res.data); }
    return res;
  }
  async function refresh(){
    if(!session) return null;
    const res = await API.call('auth.me');
    if(res.ok){ noteConsent(res.data); save({token:session.token, expiresAt:session.expiresAt, user:res.data.user}); }
    return res;
  }
  /* 重新同意（API.md 4.1.1）：成功後同一個 token 繼續用 */
  async function agree(version){
    const res = await API.call('auth.consent', {consent:true, version});
    if(res.ok){ consent = null; save({token:session.token, expiresAt:session.expiresAt, user:res.data.user}); }
    return res;
  }

  load();
  return {
    token: () => session && session.token,
    user: () => session && session.user,
    loggedIn: () => !!session,
    can, login, refresh, save, clear, agree, noteConsent,
    consent: () => consent,
    logout(){ clear(); }
  };
})();
