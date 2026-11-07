/* =========================================================
   網站/panels/admin.js — 管委會島面板（整合維護）
   需持有任一 *:admin。目前提供：系統自我檢查、帳號清單、屋主名單、包裹規則參數與資料量。
   建立帳號、修改參數、封存／補登／重設等寫入功能，待試算表測試環境建好後逐項開放。
   規格：claude/community-core/API.md 第 4.9 節
   ========================================================= */
(function(){
  const SECTIONS = [
    {key:'check',  title:'系統自我檢查', need:'sys:admin',  load:checkView},
    {key:'acct',   title:'帳號清單',     need:'acct:admin', load:acctView},
    {key:'owners', title:'屋主名單',     need:'acct:admin', load:ownersView},
    {key:'params', title:'包裹規則參數', need:'pkg:admin',  load:paramsView}
  ];

  function render(el, ui){
    const list = SECTIONS.filter(s => Auth.can(s.need));
    el.innerHTML = list.map(s => `<details class="fold" data-k="${s.key}"><summary>${s.title}</summary><div class="fold-body"></div></details>`).join('')
      + `<p class="muted small">新增帳號、調整參數等寫入功能，將在測試環境建好後開放。</p><section id="ad-rules"></section>`;
    if(window.Rules) Rules.render(el.querySelector('#ad-rules'), Rules.of('admin'), {heading:'物業與值勤規範'});
    list.forEach(s => {
      const d = el.querySelector(`[data-k="${s.key}"]`);
      d.addEventListener('toggle', () => { if(d.open) s.load(d.querySelector('.fold-body'), ui); });
    });
  }

  async function checkView(el, ui){
    ui.loading(el);
    const r = await ui.run('sys.check'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<ul class="list">${r.data.checks.map(c => `<li class="item"><div class="row"><b>${ui.esc(c.name)}</b>
      <span class="tag-s ${c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'bad'}">${c.level === 'ok' ? '正常' : c.level === 'warn' ? '注意' : '錯誤'}</span></div>
      <div class="small muted">${ui.esc(c.detail)}</div></li>`).join('')}</ul>`;
  }
  async function acctView(el, ui){
    ui.loading(el);
    const r = await ui.run('acct.list'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<ul class="list">${r.data.accounts.map(a => `<li class="item"><div class="row"><b>${ui.esc(a.unit ? a.unit + '・' : '')}${ui.esc(a.name)}</b>
      <span class="muted small">${ui.esc(a.roleLabel)}・${ui.esc(a.status)}</span></div><div class="small muted">登入帳號：${ui.esc(a.login)}</div></li>`).join('')}</ul>`;
  }
  async function ownersView(el, ui){
    ui.loading(el);
    const r = await ui.run('owners.list'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<table class="tbl"><thead><tr><th>戶號</th><th>屋主</th><th>帳號狀態</th></tr></thead><tbody>${r.data.owners.map(o =>
      `<tr><td>${ui.esc(o.unit)}</td><td>${ui.esc(o.name || '—')}</td><td>${ui.esc(o.accountStatus)}</td></tr>`).join('')}</tbody></table>`;
  }
  async function paramsView(el, ui){
    ui.loading(el);
    const [p, d] = await Promise.all([ui.run('pkg.params'), ui.run('pkg.dataInfo')]);
    if(!p.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<table class="tbl"><tbody>${p.data.params.map(x => `<tr><td>${ui.esc(x.group)}</td><td>${ui.esc(x.name)}</td><td class="num">${x.value} ${ui.esc(x.unit)}</td></tr>`).join('')}</tbody></table>`
      + (d.ok ? `<p class="muted small">資料表使用 ${d.data.used}／${d.data.capacity} 列・待領 ${d.data.pending} 件・可封存 ${d.data.eligible} 筆</p>` : '');
  }

  window.Panels = window.Panels || {};
  window.Panels.admin = {render};
})();
