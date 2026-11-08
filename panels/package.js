/* =========================================================
   網站/panels/package.js — 包裹島面板（整合維護）
   第 1 層（公開）：只顯示 pkg.stats 的數量
   住戶（pkg:resident）：我的包裹、夜間自助領取；屋主另有家人帳號
   管理員（pkg:sign）：今日待辦與公告、簽收、待領清單
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
    el.innerHTML = `<h3>${esc(unit)} 的待領包裹</h3>` + (packages.length ? `<ul class="list">${packages.map(p => `
        <li class="item">
          <div class="row"><b>${esc(p.cls)}</b><span class="tag-s ${STAGE_TONE(p.stage)}">${esc(p.stage)}</span></div>
          <div class="muted small">簽收 ${esc(p.time)}・已存放 ${p.days} 天${p.countdown > 0 ? `・距可處理 ${p.countdown} ${esc(p.cdUnit)}` : ''}${p.fee ? `・保管費 ${p.fee} 元` : ''}</div>
          ${p.note ? `<div class="small">${esc(p.note)}</div>` : ''}
        </li>`).join('')}</ul>` : `<p class="okbox">目前沒有待領包裹。</p>`) +
      (packages.length ? `<p class="muted small">06:00～18:00 請向管理員出示本頁面或戶號憑證領取；18:00～06:00 可自行取件，取件後請在管理室紙本登記本寫下戶號、件數、時間並簽名（管理員次日補記）。</p>` : '');
    el.querySelectorAll('[data-collect]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const r = await ui.run('pkg.collect', {id:b.dataset.collect}, {button:b});
      if(r.ok){ ui.toast('已記錄領取'); API.invalidateStats(); ui.pushStats(true); ui.refresh(); }
    }));
    if(Auth.user().role === 'owner') familyBlock(el, ui);
  }

  async function familyBlock(el, ui){
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
  }

  /* ---------- 管理員 ---------- */
  function staffView(el, ui){
    el.innerHTML = `<div class="tabs" role="tablist">
        <button role="tab" data-t="todo" aria-selected="true">今日待辦</button>
        <button role="tab" data-t="sign">簽收</button>
        <button role="tab" data-t="list">待領清單</button></div><div id="pk-tab"></div>`;
    const tab = el.querySelector('#pk-tab');
    const show = t => {
      el.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
      ({todo:todoTab, sign:signTab, list:listTab})[t](tab, ui);
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
        <button class="btn small" data-id="${esc(p.id)}">住戶當面領取</button></li>`).join('')}</ul>`;
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const res = await ui.run('pkg.collect', {id:b.dataset.id}, {button:b});
      if(res.ok){ ui.toast('已標記領取'); API.invalidateStats(); ui.pushStats(true); listTab(el, ui); }
    }));
  }

  window.Panels = window.Panels || {};
  window.Panels.package = {render};
})();
