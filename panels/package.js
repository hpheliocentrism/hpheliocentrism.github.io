/* =========================================================
   網站/panels/package.js — 包裹島面板（整合維護）
   第 1 層（公開）：只顯示 pkg.stats 的數量
   住戶（pkg:resident）：我的包裹、夜間自助領取；屋主另有家人帳號
   管理員（pkg:sign）：今日待辦與公告、簽收、待領清單（含夜間紙本補記）
   管委會（pkg:admin）：另有保管費月結
   2.2.0：「我已領取」只在 pkg.mine 的 selfCollect 與 night 都是 true 時顯示
   規格：claude/community-core/API.md 第 4.5～4.8 節
   ========================================================= */
(function(){
  const STAGE_TONE = s => s === '正常' ? 'ok' : (s === '可處理' || s === '可退件') ? 'bad' : 'warn';

  async function render(el, ui){
    const {esc} = ui;
    el.innerHTML = `<section id="pk-stats"></section><section id="pk-role"></section><section id="pk-rules"></section>`;
    if(window.Rules) Rules.render(el.querySelector('#pk-rules'), Rules.of('package'), {heading:'規範'});
    renderStats(el.querySelector('#pk-stats'), ui);
    const role = el.querySelector('#pk-role');
    if(!Auth.loggedIn()){
      role.innerHTML = `<p class="muted">住戶登入後可查看自己的包裹；管理員登入後可簽收。</p><button class="btn primary block">登入</button>`;
      role.querySelector('button').onclick = () => ui.showLogin();
      return;
    }
    if(Auth.can('pkg:sign')) return staffView(role, ui);
    if(Auth.can('pkg:resident')) return residentView(role, ui);
  }

  /* ---------- 公開統計 ---------- */
  async function renderStats(el, ui){
    ui.loading(el, '讀取包裹數量…');
    const res = await API.stats();
    if(!res.ok){ el.innerHTML = `<p class="alert">${ui.esc(res.error)}</p>`; return; }
    const d = res.data;
    el.innerHTML = `<div class="statgrid">${d.rows.map(r => `
        <div class="stat"><b>${ui.esc(r.cls)}</b><strong>${r.total}</strong>
          <span><i class="dot ok"></i>${r.normal}<i class="dot warn"></i>${r.attention}<i class="dot bad"></i>${r.soon}</span></div>`).join('')}
      </div>
      <p class="muted small"><i class="dot ok"></i>正常　<i class="dot warn"></i>需注意　<i class="dot bad"></i>即將處理　・更新 ${ui.esc(d.updated)}</p>`;
  }

  /* ---------- 住戶 ---------- */
  async function residentView(el, ui){
    const {esc} = ui;
    ui.loading(el, '讀取我的包裹…');
    const res = await ui.run('pkg.mine');
    if(!res.ok){ el.innerHTML = ''; return; }
    const {unit, packages, night} = res.data;
    const self = !!res.data.selfCollect && !!night;     // 2.2.0：管委會開放夜間自助且現在是夜間，才顯示「我已領取」
    el.innerHTML = `<h3>${esc(unit)} 的待領包裹</h3>` + (packages.length ? `<ul class="list">${packages.map(p => `
        <li class="item">
          <div class="row"><b>${esc(p.cls)}</b><span class="tag-s ${STAGE_TONE(p.stage)}">${esc(p.stage)}</span></div>
          <div class="muted small">簽收 ${esc(p.time)}・已存放 ${p.days} 天${p.countdown > 0 ? `・距可處理 ${p.countdown} ${esc(p.cdUnit)}` : ''}${p.fee ? `・保管費 ${p.fee} 元` : ''}</div>
          ${p.note ? `<div class="small">${esc(p.note)}</div>` : ''}
          ${self ? `<button class="btn small primary" data-collect="${esc(p.id)}">我已領取</button>` : ''}
        </li>`).join('')}</ul>` : `<p class="okbox">目前沒有待領包裹。</p>`) +
      (packages.length ? (self ? `<p class="muted small">夜間自助領取：拿到包裹後按「我已領取」。</p>`
        : night ? `<p class="warnbox">夜間請至管理室自行取件，並在紙本登記本寫下戶號、件數、時間並簽名，管理員次日補記。</p>`
        : `<p class="muted small">請向管理員出示本戶頁面並簽收。</p>`) : '');
    el.querySelectorAll('[data-collect]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const r = await ui.run('pkg.collect', {id:b.dataset.collect}, {button:b});
      if(r.ok){ ui.toast('已記錄領取'); API.invalidateStats(); ui.pushStats(true); ui.refresh(); }
    }));
    if(Auth.user().role === 'owner') familyBlock(el, ui);
  }

  async function familyBlock(el, ui, opts = {}){
    const {esc} = ui;
    const sec = document.createElement('details'); sec.className = 'fold';
    sec.innerHTML = `<summary>家人帳號管理</summary><div class="fold-body"></div>`;
    el.appendChild(sec);
    const body = sec.querySelector('.fold-body');
    const load = async () => {
      ui.loading(body);
      const r = await ui.run('acct.family'); if(!r.ok){ body.innerHTML = ''; return; }
      body.innerHTML = `<ul class="list">${r.data.accounts.map(a => `<li class="item"><div class="row"><b>${esc(a.name)}</b><span class="muted small">${esc(a.roleLabel)}・${esc(a.status)}</span></div></li>`).join('')}</ul>
        <p class="muted small">本戶最多 ${r.data.limit} 個帳號（含屋主）。租客也用這裡新增。</p>
        <form class="form" novalidate><label>姓名<input name="name" required></label><label>Email<input name="email" type="email" required></label>
        <p class="alert" hidden></p><button class="btn block">寄出邀請</button></form>`;
      const f = body.querySelector('form');
      f.onsubmit = async e => { e.preventDefault();
        const res = await ui.run('acct.familyAdd', ui.formData(f), {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
        if(res.ok){ ui.toast('邀請信已寄出'); load(); }
      };
    };
    sec.addEventListener('toggle', () => { if(sec.open) load(); });
    if(opts.open) sec.open = true;
  }

  /* ---------- 管理員 ---------- */
  function staffView(el, ui){
    el.innerHTML = `<div class="tabs" role="tablist">
        <button role="tab" data-t="todo" aria-selected="true">今日待辦</button>
        <button role="tab" data-t="sign">簽收</button>
        <button role="tab" data-t="list">待領清單</button>
        ${Auth.can('pkg:admin') ? `<button role="tab" data-t="fees">保管費月結</button>` : ''}</div><div id="pk-tab"></div>`;
    const tab = el.querySelector('#pk-tab');
    const show = t => {
      el.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
      ({todo:todoTab, sign:signTab, list:listTab, fees:feesTab})[t](tab, ui);
    };
    el.querySelectorAll('[role=tab]').forEach(b => b.onclick = () => show(b.dataset.t));
    show('todo');
  }

  async function todoTab(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('pkg.todo'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, a = d.announce;
    // hits / overdue 含戶號與電話：只顯示，不存任何地方
    el.innerHTML = `
      ${a.missed ? `<p class="alert">昨天應發公告但沒有發，請今天補發。</p>` : ''}
      ${a.doneToday ? `<p class="okbox">今天已發過公告。</p>` : a.needed ? `<p class="warnbox">建議今日公告：有包裹到了規則日。</p>` : `<p class="muted">今天不需要公告。</p>`}
      <details class="fold"${a.needed && !a.doneToday ? ' open' : ''}><summary>公告文字（只有數量，不含戶號）</summary>
        <pre class="announce">${esc(a.text)}</pre><button class="btn primary block" id="copy">複製公告並記錄</button></details>
      <h3>今天到規則日（${d.hits.length} 戶）</h3>
      ${d.hits.length ? `<ul class="list">${d.hits.map(h => `<li class="item"><div class="row"><b>${esc(h.unit)}</b></div>
        ${h.items.map(i => `<div class="small">${esc(i.cls)}・${esc(i.stage)}・${esc(i.msg)}</div>`).join('')}
        ${contacts(h.contacts, esc)}</li>`).join('')}</ul>` : '<p class="muted small">無</p>'}
      <h3>逾期／催告中（${d.overdue.length} 戶）</h3>
      ${d.overdue.length ? `<ul class="list">${d.overdue.map(o => `<li class="item"><div class="row"><b>${esc(o.unit)}</b><span class="tag-s ${STAGE_TONE(o.worst)}">${esc(o.worst)}</span></div>
        <div class="small muted">小型 ${o.counts['小型']}・大型 ${o.counts['大型']}・冷藏 ${o.counts['冷藏']}・最久 ${o.maxDays} 天${o.fee ? `・保管費 ${o.fee} 元` : ''}</div>
        ${contacts(o.contacts, esc)}</li>`).join('')}</ul>` : '<p class="muted small">無</p>'}`;
    el.querySelector('#copy').onclick = async e => {
      const btn = e.currentTarget;
      let copied = false;
      try{ await navigator.clipboard.writeText(a.text); copied = true; }catch(err){}
      if(!copied){ const pre = el.querySelector('.announce'); const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(rg); ui.toast('請長按選取的文字複製'); }
      const res = await ui.run('pkg.announce', {}, {button:btn});
      if(res.ok){ if(copied) ui.toast('已複製，請貼到住戶 LINE 群組'); todoTab(el, ui); }
    };
  }
  const contacts = (cs, esc) => cs && cs.length ? `<div class="small">${cs.map(c => `${esc(c.name)}（${esc(c.roleLabel)}）<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>`).join('、')}</div>` : `<div class="small muted">無聯絡電話</div>`;

  function signTab(el, ui){
    el.innerHTML = `<form class="form" novalidate>
        <label>戶號<input name="unit" required placeholder="例如 5A" autocapitalize="characters" inputmode="text"></label>
        <fieldset class="seg"><legend>溫層</legend>
          <label><input type="radio" name="temp" value="常溫" checked> 常溫</label><label><input type="radio" name="temp" value="冷藏"> 冷藏</label></fieldset>
        <div class="dims"><label>長<input name="l" type="number" inputmode="numeric" min="1"></label><label>寬<input name="w" type="number" inputmode="numeric" min="1"></label><label>高<input name="h" type="number" inputmode="numeric" min="1"></label><span class="muted small">公分</span></div>
        <p class="muted small" id="auto"></p>
        <label>改判類別（選填）<select name="finalClass"><option value="">依系統判定</option><option>小型</option><option>大型</option></select></label>
        <label id="reason-l" hidden>改判原因<input name="reason"></label>
        <label>照片（選填）<input name="photo" type="file" accept="image/*" capture="environment"></label>
        <p class="muted small">拍包裹外觀即可，避免把貨運單上的姓名電話拍清楚。</p>
        <label>備註（選填）<input name="note"></label>
        <p class="alert" hidden></p>
        <button class="btn primary block" type="submit">簽收登記</button>
      </form>`;
    const f = el.querySelector('form'), auto = f.querySelector('#auto');
    const upd = () => {
      const cold = f.temp.value === '冷藏';
      f.querySelector('.dims').hidden = cold;
      const l = +f.l.value, w = +f.w.value, h = +f.h.value;
      auto.textContent = cold ? '系統判定：冷藏' : (l && w && h) ? `系統判定：${Math.max(l,w,h) > 100 || l+w+h > 200 ? '大型' : '小型'}` : '';
      f.querySelector('#reason-l').hidden = !f.finalClass.value;
    };
    f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
    f.onsubmit = async e => {
      e.preventDefault();
      const v = ui.formData(f), body = {unit:v.unit.toUpperCase(), temp:v.temp, note:v.note};
      if(v.temp === '常溫') Object.assign(body, {l:+v.l, w:+v.w, h:+v.h});
      if(v.finalClass){ body.finalClass = v.finalClass; body.reason = v.reason; }
      const file = f.photo.files[0];
      if(file){ try{ body.photoBase64 = await shrink(file); body.photoMime = 'image/jpeg'; }catch(err){ ui.toast('照片處理失敗，請重拍', 'error'); return; } }
      const r = await ui.run('pkg.create', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button[type=submit]')});
      if(r.ok){ ui.toast(`已簽收 ${r.data.unit}・${r.data.cls}`); f.reset(); upd(); API.invalidateStats(); ui.pushStats(true); }
    };
  }
  /* API.md 第 6 節：長邊縮到 1280px、JPEG 品質 0.75，順便去掉 EXIF */
  function shrink(file){
    return new Promise((ok, bad) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', .75).split(',')[1]);
      };
      img.onerror = bad; img.src = url;
    });
  }

  async function listTab(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('pkg.pending'); if(!r.ok){ el.innerHTML = ''; return; }
    const ps = r.data.packages.slice().sort((a,b) => a.unit.localeCompare(b.unit));
    el.innerHTML = `<p class="muted small">共 ${ps.length} 件待領</p><ul class="list">${ps.map(p => `
      <li class="item"><div class="row"><b>${esc(p.unit)}・${esc(p.cls)}</b><span class="tag-s ${STAGE_TONE(p.stage)}">${esc(p.stage)}</span></div>
        <div class="small muted">${esc(p.time)}・${p.days} 天${p.fee ? `・${p.fee} 元` : ''}${p.hasPhoto ? '・有照片' : ''}</div>
        <div class="btnrow"><button class="btn small" data-id="${esc(p.id)}">住戶當面領取</button>
          <button class="btn small ghost" data-paper="${esc(p.id)}">夜間紙本補記</button></div>
        <form class="form paper" data-for="${esc(p.id)}" hidden novalidate>
          <label>登記本上的領取時間<input name="gotAt" type="datetime-local" required></label>
          <p class="muted small">須晚於簽收時間、48 小時內；更早的請管委會補登。</p>
          <p class="alert" hidden></p><button class="btn small primary">補記領取</button></form></li>`).join('')}</ul>`;
    const done = msg => { ui.toast(msg); API.invalidateStats(); ui.pushStats(true); listTab(el, ui); };
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const res = await ui.run('pkg.collect', {id:b.dataset.id}, {button:b});
      if(res.ok) done('已標記領取' + (res.data.fee ? `，保管費 ${res.data.fee} 元` : ''));
    }));
    el.querySelectorAll('[data-paper]').forEach(b => b.onclick = () => {
      const f = el.querySelector(`form[data-for="${b.dataset.paper}"]`); f.hidden = !f.hidden;
      if(!f.hidden && !f.gotAt.value) f.gotAt.value = ui.today().slice(0,10) + 'T' + new Date(Date.now()+8*3600e3).toISOString().slice(11,16);
    });
    el.querySelectorAll('form.paper').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const gotAt = f.gotAt.value.replace('T', ' ');
      if(!gotAt){ f.gotAt.setAttribute('aria-invalid','true'); return; }
      const res = await ui.run('pkg.collect', {id:f.dataset.for, how:'夜間紙本', gotAt}, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok) done('已補記夜間紙本領取' + (res.data.fee ? `，保管費 ${res.data.fee} 元` : ''));
    });
  }

  /* ---------- 管委會：保管費月結（pkg.fees／pkg.feesClose，API.md 4.9）---------- */
  async function feesTab(el, ui, month){
    const {esc} = ui;
    month = month || ui.month(-1);
    el.innerHTML = `<form class="inline"><input type="month" name="m" value="${esc(month)}" aria-label="月份"><button class="btn small">查詢</button></form><div class="fees-body"></div>`;
    el.querySelector('form').onsubmit = e => { e.preventDefault(); feesTab(el, ui, e.target.m.value); };
    const body = el.querySelector('.fees-body'); ui.loading(body);
    const r = await ui.run('pkg.fees', {month}); if(!r.ok){ body.innerHTML = ''; return; }
    const d = r.data, ended = d.month < ui.month(0);
    body.innerHTML = `${d.closed ? `<p class="okbox">${esc(d.month)} 已月結（${esc(d.closedAt)}）</p>` : `<p class="warnbox">${esc(d.month)} 尚未月結，以下為即時試算。</p>`}
      ${d.rows.length ? `<table class="tbl"><thead><tr><th>戶號</th><th class="num">件數</th><th class="num">保管費</th></tr></thead><tbody>
        ${d.rows.map(x => `<tr><td>${esc(x.unit)}</td><td class="num">${x.count}</td><td class="num">${ui.money(x.amount)}</td></tr>`).join('')}
        <tr><th>合計</th><th class="num">${d.total.count}</th><th class="num">${ui.money(d.total.amount)}</th></tr></tbody></table>` : `<p class="muted">這個月沒有保管費。</p>`}
      <p class="muted small">月份以領取日為準；保管費併入管理費帳單，由管委會島「財務」處理。</p>
      ${ended ? `<button class="btn block" id="close">${d.closed ? '重新月結' : '執行月結'}</button>` : `<p class="muted small">月份結束後才能月結（每月 1 日 00:10 會自動執行）。</p>`}`;
    const c = body.querySelector('#close');
    if(c) c.onclick = () => ui.confirmTwice(c, async () => {
      const res = await ui.run('pkg.feesClose', {month:d.month}, {button:c});
      if(res.ok){ ui.toast(`已月結 ${res.data.month}：${res.data.units} 戶 ${res.data.amount} 元`); feesTab(el, ui, d.month); }
    });
  }

  window.Panels = window.Panels || {};
  window.Panels.package = {render, family: (el, ui) => familyBlock(el, ui, {open:true})};
})();
