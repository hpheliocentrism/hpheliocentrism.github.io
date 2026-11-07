/* =========================================================
   網站/core/auth.js — 登入狀態（整合維護）
   - token 不放網址
   - 住戶（owner／member）存 localStorage；管理員、管委會存 sessionStorage（共用手機較安全）
   - 權限一律看 user.perms（「島:等級」），不用 role 字串硬編
   ========================================================= */
window.Auth = (function(){
  const KEY = 'hp_session';
  const LEVELS = {pkg:['resident','sign','admin']};          // 其他島預設只有 resident < admin
  let session = null;                                        // {token, expiresAt, user}

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
  function clear(){ session = null; clearStores(); document.dispatchEvent(new CustomEvent('auth:change')); }

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

  async function login(account, password){
    const res = await API.call('auth.login', {account, password});
    if(res.ok) save(res.data);
    return res;
  }
  async function refresh(){
    if(!session) return null;
    const res = await API.call('auth.me');
    if(res.ok){ save({token:session.token, expiresAt:session.expiresAt, user:res.data.user}); }
    return res;
  }

  load();
  return {
    token: () => session && session.token,
    user: () => session && session.user,
    loggedIn: () => !!session,
    can, login, refresh, save, clear,
    logout(){ clear(); }
  };
})();
