/* =========================================================
   網站/core/app.js — 主程式：路由、面板、登入、2D 後備（整合維護）
   - 網址 #<島id> 直接打開該島（QR Code 用 #package）
   - ?mode=verify&t=... 進入驗證頁（屋主首次設定、家人受邀、重設密碼）
   - 各島面板放在 panels/<id>.js，註冊到 window.Panels[id] = {render(el, ui)}
   ========================================================= */
(function(){
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATUS_TEXT = {open:'已開放', building:'建置中', planned:'規劃中'};
  const panel = $('#panel'), pTitle = $('#p-title'), pSub = $('#p-sub'), pBody = $('#p-body');
  let current = null, use3D = false;
  window.Panels = window.Panels || {};

  /* ---------- 共用 UI 工具（交給各面板使用） ---------- */
  const ui = {
    esc,
    /* 呼叫 API，失敗時把錯誤顯示在 box（或 toast），欄位錯誤標在對應輸入框 */
    async run(action, body, opts = {}){
      const btn = opts.button; if(btn){ btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '處理中…'; }
      const res = await API.call(action, body);
      if(btn){ btn.disabled = false; btn.textContent = btn.dataset.label; }
      if(!res.ok){
        if(res.field && opts.form){
          const f = opts.form.querySelector(`[name="${res.field}"]`);
          if(f){ f.setAttribute('aria-invalid','true'); f.focus(); }
        }
        if(opts.box){ opts.box.textContent = res.error; opts.box.hidden = false; } else ui.toast(res.error, 'error');
        if(res.code === 'AUTH_EXPIRED' || res.code === 'AUTH_REQUIRED') ui.showLogin('登入已過期，請重新登入');
      }
      return res;
    },
    toast(msg, kind){
      const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
      clearTimeout(ui._tt); ui._tt = setTimeout(() => t.className = 'toast', 3200);
    },
    loading(el, text){ el.innerHTML = `<p class="muted loading">${esc(text || '讀取中…')}</p>`; },
    formData(form){ const o = {}; new FormData(form).forEach((v,k) => o[k] = typeof v === 'string' ? v.trim() : v); form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid')); return o; },
    refresh(){ if(current) openIsland(current, {keepHash:true}); },
    showLogin, openIsland, closePanel,
    /* 危險動作：第一次按變成「再按一次確認」 */
    confirmTwice(btn, fn){
      if(btn.dataset.armed){ delete btn.dataset.armed; btn.textContent = btn.dataset.orig; fn(); return; }
      btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent; btn.textContent = '再按一次確認';
      setTimeout(() => { if(btn.dataset.armed){ delete btn.dataset.armed; btn.textContent = btn.dataset.orig; } }, 4000);
    }
  };
  window.UI = ui;

  /* ---------- 面板開關 ---------- */
  function openPanel(title, sub){
    pTitle.textContent = title; pSub.textContent = sub || '';
    panel.classList.add('open'); panel.removeAttribute('inert');
  }
  function closePanel(){
    panel.classList.remove('open'); panel.setAttribute('inert','');
    current = null; if(use3D) Scene.unfocus();
    try{ history.replaceState(null, '', location.pathname); }catch(e){}
    render2D();
  }
  $('#p-close').onclick = closePanel;
  addEventListener('keydown', e => { if(e.key === 'Escape' && panel.classList.contains('open')) closePanel(); });

  function openIsland(id, opt = {}){
    const d = ISLANDS.find(x => x.id === id); if(!d) return;
    current = id;
    openPanel(d.name, d.desc);
    if(use3D) Scene.focus(id);
    if(!opt.keepHash){ try{ history.replaceState(null, '', '#' + id); }catch(e){ location.hash = id; } }
    pBody.innerHTML = '';
    const head = document.createElement('div'); head.className = 'p-meta';
    head.innerHTML = d.status !== 'open' ? `<span class="chip">${STATUS_TEXT[d.status]}</span>` : '';
    pBody.appendChild(head);
    const host = document.createElement('div'); host.className = 'p-content'; pBody.appendChild(host);

    // 需要登入才能進入的島：未登入顯示登入表單；登入但權限不足顯示說明
    if(d.need && !Auth.can(d.need)){
      if(!Auth.loggedIn()){ host.innerHTML = `<p class="lead">這座島需要住戶登入後才能查看。</p>`; loginForm(host, () => openIsland(id, {keepHash:true})); }
      else host.innerHTML = `<p class="lead">您的帳號沒有這座島的權限。如需使用，請洽管委會。</p>`;
      return;
    }
    const P = Panels[id];
    if(P && P.render) P.render(host, ui, d);
    else if(window.Rules && Rules.of(id).length) Rules.panel(host, ui, d);
    else host.innerHTML = `<p class="lead">這座島${STATUS_TEXT[d.status]}，規範與功能完成後會在這裡開放。</p>`;
  }

  /* ---------- 頂列：登入狀態 ---------- */
  function renderUser(){
    const u = Auth.user(), el = $('#userbox');
    if(!u){ el.innerHTML = `<button class="btn small" id="btn-login">登入</button>`; $('#btn-login').onclick = () => showLogin(); }
    else {
      el.innerHTML = `<span class="who">${esc(u.unit ? u.unit + '・' : '')}${esc(u.name)}<small>${esc(u.roleLabel || '')}</small></span>`
        + (u.role === 'owner' ? `<button class="btn small ghost" id="btn-family">家人帳號</button>` : '')
        + `<button class="btn small ghost" id="btn-logout">登出</button>`;
      const fb = $('#btn-family');
      if(fb) fb.onclick = () => {
        current = null;
        openPanel('家人帳號管理', '屋主可邀請家人、租客建立帳號（每戶最多 6 個）');
        pBody.innerHTML = '';
        window.Panels.package.family(pBody, ui);
      };
      $('#btn-logout').onclick = () => { Auth.logout(); ui.toast('已登出'); if(current) ui.refresh(); };
    }
  }
  document.addEventListener('auth:change', () => { renderUser(); render2D(); });
  document.addEventListener('auth:expired', () => ui.toast('登入已過期，請重新登入', 'error'));
  document.addEventListener('api:version', () => ui.toast('系統已更新，請重新整理網頁', 'error'));

  /* ---------- 登入 ---------- */
  function showLogin(msg){
    current = null;
    openPanel('登入', '住戶、管理員、管委會都從這裡登入');
    pBody.innerHTML = '';
    const host = document.createElement('div'); pBody.appendChild(host);
    if(msg) host.insertAdjacentHTML('beforeend', `<p class="alert">${esc(msg)}</p>`);
    loginForm(host, () => { closePanel(); const back = location.hash.slice(1); if(back) openIsland(back); });
  }
  function loginForm(host, done){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <form class="form" novalidate>
        <label>帳號<input name="account" type="text" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="收驗證信的 Email"></label>
        <p class="muted small">屋主與家人請輸入收驗證信的 Email；管委會代建的長輩帳號輸入戶號（如 3B）；工作人員輸入工作帳號。</p>
        <label>密碼<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="alert" hidden></p>
        <button class="btn primary block" type="submit">登入</button>
      </form>
      <div class="links"><button class="link" data-go="setup">屋主第一次設定</button><button class="link" data-go="forgot">忘記密碼</button></div>
      ${CONFIG.MOCK ? `<p class="hintbox">假資料模式測試帳號（密碼 ${MockBackend.PASSWORD}）：chair 管委會、guard1 管理員、owner@example.com 屋主、3b 長輩</p>` : ''}`;
    host.appendChild(wrap);
    const f = wrap.querySelector('form'), box = wrap.querySelector('.alert');
    f.onsubmit = async e => {
      e.preventDefault(); box.hidden = true;
      const v = ui.formData(f);
      if(!v.account || !v.password){ box.textContent = '請輸入帳號與密碼'; box.hidden = false; return; }
      const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = '登入中…';
      const res = await Auth.login(v.account, v.password);
      btn.disabled = false; btn.textContent = '登入';
      if(!res.ok){ box.textContent = res.error; box.hidden = false; return; }
      ui.toast(`歡迎，${res.data.user.name}`);
      done && done();
    };
    wrap.querySelector('[data-go=setup]').onclick = () => ownerStart();
    wrap.querySelector('[data-go=forgot]').onclick = () => forgot();
  }
  function ownerStart(){
    openPanel('屋主第一次設定', '輸入戶號與管委會登記的 Email，我們會寄出設定連結');
    pBody.innerHTML = `<form class="form" novalidate>
        <label>戶號<input name="unit" required placeholder="例如 2A" autocapitalize="characters"></label>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <p class="alert" hidden></p><p class="okbox" hidden></p>
        <button class="btn primary block" type="submit">寄出設定信</button>
      </form><button class="link" id="back">← 回登入</button>`;
    const f = pBody.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const res = await ui.run('auth.ownerStart', ui.formData(f), {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok){ const ok = f.querySelector('.okbox'); ok.textContent = res.data.message; ok.hidden = false; }
    };
    pBody.querySelector('#back').onclick = () => showLogin();
  }
  function forgot(){
    openPanel('忘記密碼', '輸入登入用的 Email；長輩帳號請洽管委會重設');
    pBody.innerHTML = `<form class="form" novalidate>
        <label>Email<input name="account" type="email" required autocomplete="email"></label>
        <p class="alert" hidden></p><p class="okbox" hidden></p>
        <button class="btn primary block" type="submit">寄出重設信</button>
      </form><button class="link" id="back">← 回登入</button>`;
    const f = pBody.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const res = await ui.run('auth.forgot', ui.formData(f), {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok){ const ok = f.querySelector('.okbox'); ok.textContent = res.data.message; ok.hidden = false; }
    };
    pBody.querySelector('#back').onclick = () => showLogin();
  }

  /* ---------- 驗證頁：?mode=verify&t=... ---------- */
  async function verifyPage(t){
    openPanel('帳號設定', '');
    ui.loading(pBody);
    const res = await API.call('auth.verifyInfo', {t});
    // 讀完就把 t 從網址移除，避免被分享或留在瀏覽紀錄
    try{ history.replaceState(null, '', location.pathname); }catch(e){}
    if(!res.ok){
      pBody.innerHTML = `<p class="alert">${esc(res.code === 'LINK_INVALID' ? '連結已失效或已使用過。' : res.error)}</p>
        <div class="links"><button class="link" data-go="setup">重新取得屋主設定信</button><button class="link" data-go="forgot">重新取得重設密碼信</button></div>`;
      pBody.querySelector('[data-go=setup]').onclick = ownerStart; pBody.querySelector('[data-go=forgot]').onclick = forgot;
      return;
    }
    const d = res.data, title = {setup:'屋主第一次設定', family:'家人帳號啟用', reset:'重設密碼'}[d.purpose] || '帳號設定';
    pTitle.textContent = title;
    pBody.innerHTML = `<form class="form" novalidate>
        <dl class="spec"><dt>姓名</dt><dd>${esc(d.name)}</dd><dt>戶號</dt><dd>${esc(d.unit)}</dd></dl>
        ${d.email ? `<label>登入帳號（以後登入請輸入這個 Email）<input name="username" type="email" autocomplete="username" value="${esc(d.email)}" readonly></label>` : ''}
        ${d.needConsent ? `<div class="consent" tabindex="0">${esc(d.consentText)}</div>
          <label class="check"><input type="checkbox" name="consent" value="1"> 我已閱讀並同意以上個資告知（${esc(d.consentVersion)}）</label>` : ''}
        ${d.needPhone ? `<label>電話<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="0912345678"></label>` : ''}
        <label>設定密碼（至少 8 個字）<input name="password" type="password" autocomplete="new-password" required></label>
        <label>再輸入一次密碼<input name="password2" type="password" autocomplete="new-password" required></label>
        <p class="alert" hidden></p>
        <button class="btn primary block" type="submit">完成設定</button>
      </form>`;
    const f = pBody.querySelector('form'), box = f.querySelector('.alert');
    f.onsubmit = async e => {
      e.preventDefault(); box.hidden = true;
      const v = ui.formData(f);
      if(v.password !== v.password2){ box.textContent = '兩次輸入的密碼不一樣'; box.hidden = false; f.password2.setAttribute('aria-invalid','true'); return; }
      if(d.needConsent && !f.consent.checked){ box.textContent = '請先閱讀並勾選同意'; box.hidden = false; return; }
      const body = {t, password:v.password};
      if(d.needPhone) body.phone = v.phone;
      if(d.needConsent) body.consent = true;
      const r = await ui.run('auth.complete', body, {form:f, box, button:f.querySelector('button')});
      if(r.ok){ Auth.save(r.data); ui.toast('設定完成，已自動登入'); closePanel(); openIsland('package'); }
    };
  }

  /* ---------- 2D 後備畫面（WebGL 不可用，或使用者選擇簡易模式） ---------- */
  function render2D(){
    const box = $('#fallback'); if(use3D || !box) return;
    box.innerHTML = `<p class="fb-lead">${use3D ? '' : '簡易模式：點選下方小島進入'}</p><div class="fb-grid">` +
      ISLANDS.map(d => `<button class="fb-island" data-id="${d.id}"><b>${esc(d.name)}</b><span>${esc(d.desc)}</span>${d.status !== 'open' ? `<em>${STATUS_TEXT[d.status]}</em>` : ''}</button>`).join('') + `</div>`;
    box.querySelectorAll('.fb-island').forEach(b => b.onclick = () => openIsland(b.dataset.id));
  }

  /* ---------- 公開統計 → 3D 包裹島 ---------- */
  async function pushStats(force){
    if(!use3D) return;
    Scene.setLoading('package', true);
    const res = await API.stats(force);
    Scene.setLoading('package', false);
    if(res.ok) Scene.setIslandData('package', res.data.total ? res.data : null);
  }
  ui.pushStats = pushStats;

  /* ---------- 啟動 ---------- */
  function start(){
    const params = new URLSearchParams(location.search);
    const want2D = params.get('view') === '2d';
    if(!want2D && window.THREE){
      try{ Scene.init($('#stage')); use3D = true; }
      catch(e){ console.warn('3D 無法啟動，改用簡易模式', e); use3D = false; }
    }
    document.body.classList.toggle('mode-2d', !use3D);
    if(use3D){
      Scene.onIslandClick(id => openIsland(id));
      document.querySelectorAll('.timebar button').forEach(b => b.onclick = () => Scene.setMode(b.dataset.mode));
      pushStats();
      setInterval(() => pushStats(), CONFIG.STATS_CACHE_MS);
    } else render2D();
    renderUser();
    if(CONFIG.MOCK) $('#mockflag').hidden = false;

    if(params.get('mode') === 'verify' && params.get('t')) verifyPage(params.get('t'));
    else if(location.hash.length > 1) setTimeout(() => openIsland(location.hash.slice(1), {keepHash:true}), use3D ? 300 : 0);
    addEventListener('hashchange', () => { const id = location.hash.slice(1); if(id && id !== current) openIsland(id, {keepHash:true}); });
    if(Auth.loggedIn()) Auth.refresh();
  }
  start();
})();
