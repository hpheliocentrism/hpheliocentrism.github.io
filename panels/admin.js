/* =========================================================
   網站/panels/admin.js — 管委會島面板（整合維護）
   進入條件：登入（註冊表 need:'login'）。面板內分三頁：
     財務：需要 fee:resident（住戶看本戶帳單與收支公布；管委會 fee:admin 看總表與登打）→ panels/fee.js
     公告：任何已登入帳號；v1 為靜態文件（rules/rules.js 的 公告／決議／會議紀錄／財務公告）
     後台：任一 *:admin；系統檢查、帳號（含重新同意狀態）、屋主名單、各島參數
   3D 標示「財務」「公告」點擊時，app.js 傳入 opt.tab = 'fee' | 'notice'
   規格：claude/community-core/API.md 第 4.9、5.4 節；整合/規格審查.md 第 6 節
   ========================================================= */
(function(){
  const NOTICE_KINDS = ['公告','決議','會議紀錄','財務公告'];

  function render(el, ui, d, opt = {}){
    const tabs = [];
    if(Auth.can('fee:resident')) tabs.push({key:'fee', label:'財務', show:b => Auth.can('fee:admin') ? FeePanel.admin(b, ui) : FeePanel.resident(b, ui)});
    tabs.push({key:'notice', label:'公告', show:b => noticeTab(b, ui)});
    if(Auth.can('*:admin')) tabs.push({key:'back', label:'後台', show:b => backTab(b, ui)});
    const want = tabs.find(t => t.key === opt.tab) ? opt.tab : (opt.tab === 'fee' ? 'notice' : tabs[0].key);
    if(opt.tab === 'fee' && !Auth.can('fee:resident')) ui.toast('您的帳號沒有財務權限，先顯示公告');
    ui.tabs(el, tabs, want);
  }

  /* ---------- 公告（靜態） ---------- */
  function noticeTab(el, ui){
    const docs = Rules.all().filter(r => NOTICE_KINDS.includes(r.kind)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = `<p class="muted small">管委會正式公告、決議與會議紀錄。線上發布功能完成前，由管委會提供文件後更新。</p>`;
    if(docs.length) Rules.render(el, docs, {openFirst:false});
    else el.insertAdjacentHTML('beforeend', `<p class="muted">目前沒有公告。</p>`);
  }

  /* ---------- 後台 ---------- */
  const SECTIONS = [
    {title:'系統自我檢查', need:'sys:admin',   load:checkView},
    {title:'帳號清單',     need:'acct:admin',  load:acctView},
    {title:'屋主名單',     need:'acct:admin',  load:ownersView},
    {title:'包裹規則參數', need:'pkg:admin',   load:(b, ui) => pkgParams(b, ui)},
    {title:'健身房參數',   need:'gym:admin',   load:(b, ui) => ui.params(b, 'gym')},
    {title:'工程參數',     need:'works:admin', load:(b, ui) => ui.params(b, 'works', {readonly:[10]})},
    {title:'充電參數',     need:'ev:admin',    load:(b, ui) => ui.params(b, 'ev')}
  ];
  function backTab(el, ui){
    SECTIONS.filter(s => Auth.can(s.need)).forEach(s => ui.fold(el, s.title, b => s.load(b, ui)));
    const r = document.createElement('section'); el.appendChild(r);
    if(window.Rules) Rules.render(r, Rules.of('admin'), {heading:'物業與值勤規範'});
  }

  async function checkView(el, ui){
    ui.loading(el);
    const r = await ui.run('sys.check'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<ul class="list">${r.data.checks.map(c => `<li class="item"><div class="row"><b>${ui.esc(c.name)}</b>
      <span class="tag-s ${c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'bad'}">${c.level === 'ok' ? '正常' : c.level === 'warn' ? '注意' : '錯誤'}</span></div>
      <div class="small muted">${ui.esc(c.detail)}</div></li>`).join('')}</ul>`;
  }
  async function acctView(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('acct.list'); if(!r.ok){ el.innerHTML = ''; return; }
    const need = r.data.accounts.filter(a => a.needReconsent && a.status === '啟用').length;
    el.innerHTML = (need ? `<p class="warnbox">${need} 個啟用中的帳號還沒同意目前版本的個資告知。長輩帳號可在取得書面同意後按「登錄書面同意」。</p>` : '')
      + `<ul class="list">${r.data.accounts.map(a => `<li class="item"><div class="row"><b>${esc(a.unit ? a.unit + '・' : '')}${esc(a.name)}</b>
        <span class="muted small">${esc(a.roleLabel)}・${esc(a.status)}</span></div>
        <div class="small muted">登入帳號：${esc(a.login)}${a.extra ? '・額外權限 ' + esc(a.extra) : ''}・同意 ${esc(a.consentVersion || '—')}${a.consentAt ? '（' + esc(a.consentAt) + '）' : ''}</div>
        ${a.needReconsent ? `<span class="tag-s warn">需要重新同意</span>
          <form class="inline" data-id="${esc(a.id)}"><input name="v" placeholder="版本，例如 v2" aria-label="同意版本"><input name="at" type="date" aria-label="書面同意日期"><button class="btn small">登錄書面同意</button></form>` : ''}
      </li>`).join('')}</ul>`;
    el.querySelectorAll('form[data-id]').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      if(!f.v.value.trim()){ f.v.setAttribute('aria-invalid','true'); f.v.focus(); return; }
      const body = {id:f.dataset.id, consentVersion:f.v.value.trim()}; if(f.at.value) body.consentAt = f.at.value;
      const res = await ui.run('acct.update', body, {button:f.querySelector('button')});
      if(res.ok){ ui.toast('已登錄書面同意'); acctView(el, ui); }
    });
  }
  async function ownersView(el, ui){
    ui.loading(el);
    const r = await ui.run('owners.list'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<table class="tbl"><thead><tr><th>戶號</th><th>屋主</th><th>帳號狀態</th></tr></thead><tbody>${r.data.owners.map(o =>
      `<tr><td>${ui.esc(o.unit)}</td><td>${ui.esc(o.name || '—')}</td><td>${ui.esc(o.accountStatus)}</td></tr>`).join('')}</tbody></table>`;
  }
  async function pkgParams(el, ui){
    const top = document.createElement('div'), info = document.createElement('p');
    el.innerHTML = ''; el.append(top, info);
    ui.params(top, 'pkg');
    const d = await ui.run('pkg.dataInfo');
    if(d.ok){ info.className = 'muted small'; info.textContent = `資料表使用 ${d.data.used}／${d.data.capacity} 列・待領 ${d.data.pending} 件・可封存 ${d.data.eligible} 筆`; }
  }

  window.Panels = window.Panels || {};
  window.Panels.admin = {render};
})();
