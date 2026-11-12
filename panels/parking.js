/* =========================================================
   網站/panels/parking.js — 停車場島面板（整合維護）
   規格：後端 API.md 第 5.5 節（v2.9.0）、島嶼/parking/規格.md 第 4.1 節
   公開：抽籤倒數、機車位總數與已分配數（park.stats）、平面圖、規範
   住戶（park:resident）：我的車位（park.mine）、抽籤結果（park.result，不含車牌，可重算驗證）
   管理員（park:guard）：車位與車牌對照（park.slots，查違停用）
   管委會（park:admin）：抽籤（預覽 → 再按一次確認）、名單、租用分配、車位設定、參數
   隱私：車牌、名單只顯示在畫面，不存 localStorage、不放網址。
   抽籤結果在按下當下由後端決定；這裡的動畫只是演出。
   ========================================================= */
window.ParkPanel = (function(){
  const TYPES = ['住戶登記','第二輛租用','物業店面租用','臨時'];
  /* 試抽期間（config.js 的 PARKING_TRIAL）：所有人看到的結果都標示「測試、非正式」；正式抽籤前把該設定刪掉 */
  const TRIAL = !!(window.CONFIG && CONFIG.PARKING_TRIAL);
  const TRIAL_TAG = TRIAL ? '<p class="alert pk-trial"><b>【抽籤測試】以下是測試結果，不是正式結果。</b></p>' : '';
  const byNum = (a, b) => (Number(a) - Number(b)) || (a < b ? -1 : a > b ? 1 : 0);

  /* 抽籤演算法 park-draw-v1（與後端 Park.gs、後端/tools/park-draw-verify.js 相同）：種子 → mulberry32 → Fisher–Yates */
  function rng(seedInt){
    let a = seedInt >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function assign(seed, units, slots){
    const u = units.map(String).slice().sort(), sl = slots.map(String).slice().sort(byNum);
    const rnd = rng(parseInt(seed, 16));
    for(let i = u.length - 1; i >= 1; i--){ const j = Math.floor(rnd() * (i + 1)); const t = u[i]; u[i] = u[j]; u[j] = t; }
    const result = {}, waitlist = [];
    u.forEach((x, k) => { if(k < sl.length) result[x] = sl[k]; else waitlist.push(x); });
    return {result, waitlist};
  }
  /* 用公開的種子重算，和後端回傳的結果逐筆比對 */
  function verify(d){
    if(d.algo !== 'park-draw-v1' || !/^[0-9a-f]{8}$/.test(String(d.seed))) return null;
    const r = assign(d.seed, d.units, d.slots);
    return d.results.length === Object.keys(r.result).length && d.results.every(x => r.result[x.unit] === String(x.slot))
      && d.waitlist.length === r.waitlist.length && d.waitlist.every(w => r.waitlist[w.order - 1] === w.unit);
  }

  const drawTime = iso => { const t = new Date(iso); if(isNaN(t)) return '';
    const p = new Date(t.getTime() + 8*3600e3), wd = '日一二三四五六'[p.getUTCDay()];
    return `${p.getUTCMonth()+1}/${p.getUTCDate()}（${wd}）${String(p.getUTCHours()).padStart(2,'0')}:${String(p.getUTCMinutes()).padStart(2,'0')}`; };

  /* ---------- 公開：倒數與統計 ---------- */
  async function publicBox(el, ui, force){
    const {esc} = ui;
    const r = await API.stats('park.stats', force);
    if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, left = new Date(d.drawAt) - Date.now();
    let head;
    if(d.drawn && TRIAL) head = `<p class="hintbox pk-count">正式抽籤時間：<b>${esc(drawTime(d.drawAt))}</b>。目前系統裡的抽籤結果是<b>測試用</b>，正式抽籤前會清除。</p>`;
    else if(d.drawn) head = `<p class="okbox"><b>機車位抽籤已完成。</b>${Auth.loggedIn() ? '結果在下方「抽籤結果」。' : '結果請登入查看。'}</p>`;
    else if(left > 0){ const m = Math.ceil(left/60000);
      head = `<p class="hintbox pk-count">機車位線上抽籤：<b>${esc(drawTime(d.drawAt))}</b><br>還有 <b>${Math.floor(m/1440)}</b> 天 <b>${Math.floor(m%1440/60)}</b> 時 <b>${m%60}</b> 分</p>`; }
    else head = `<p class="hintbox pk-count">機車位線上抽籤時間 <b>${esc(drawTime(d.drawAt))}</b> 已到，等待管委會按下抽籤。</p>`;
    el.innerHTML = head + `<div class="statgrid">
        <div class="stat"><strong>${d.total}</strong><span>機車位（格）</span></div>
        <div class="stat"><strong>${d.capacity}</strong><span>可停（輛）</span></div>
        <div class="stat"><strong>${d.assignedCars}</strong><span>已分配（輛）</span></div></div>`;
  }

  /* ---------- 抽籤結果（住戶以上；不含車牌） ---------- */
  function resultHtml(ui, d, unit){
    const {esc} = ui, ok = verify(d);
    return `${TRIAL_TAG}<p class="small muted">抽籤時間 ${esc(d.drawnAt)}・編號 ${esc(d.id)}</p>
      <div class="pk-grid">${d.results.map(x => `<div class="pk-cell${unit && x.unit === unit ? ' me' : ''}"><span>車位</span><strong>${esc(x.slot)}</strong><b>${esc(x.unit)}</b></div>`).join('')}</div>
      ${d.waitlist.length ? `<p class="warnbox">候補：${d.waitlist.map(w => `${w.order}. ${esc(w.unit)}`).join('、')}</p>` : ''}
      <details class="fold"><summary>怎麼確認抽籤公平？</summary><div class="fold-body small">
        <p>抽籤當下系統產生一組「種子」，用固定的公開算法（${esc(d.algo)}）把參加戶號洗牌後依序對到車位。任何人拿同一組種子重算，結果都會一樣，事後無法更改。</p>
        <dl class="kv"><dt>種子</dt><dd><code>${esc(d.seed)}</code></dd><dt>參加戶號</dt><dd>${d.units.map(esc).join('、')}</dd><dt>抽籤車位</dt><dd>${d.slots.map(esc).join('、')}</dd></dl>
        ${ok === null ? '' : ok ? `<p class="okbox">✓ 您的裝置剛才用這組種子重算了一次，結果和上面完全相同。</p>` : `<p class="alert">重算結果和公布的不一致，請通知管委會。</p>`}
      </div></details>`;
  }
  async function result(el, ui){
    ui.loading(el);
    const r = await ui.run('park.result'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, u = Auth.user();
    el.innerHTML = d.drawn ? resultHtml(ui, d, u && u.unit) + `<p class="muted small">結果只列戶號與車位編號，不含車牌。</p>`
      : `<p class="lead">尚未抽籤。抽籤時間：${ui.esc(d.drawAt)}，抽完後結果會公布在這裡。</p>`;
  }

  /* ---------- 住戶：我的車位 ---------- */
  async function mine(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('park.mine'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data;
    if(!d.items.length){ el.innerHTML = `<p class="lead">${esc(d.unit)} 目前沒有機車位登記。要登記或租用請洽管委會。</p>`; return; }
    el.innerHTML = `${d.items.some(x => x.slot) ? TRIAL_TAG : ''}<ul class="list">${d.items.map(x => `<li class="item">
        <div class="row"><b>${esc(x.type)}</b>${x.slot ? `<span class="pk-slot">車位 ${esc(x.slot)}</span>` : `<span class="tag-s ${x.draw ? 'warn' : ''}">${esc(x.draw || (x.confirm === '已確認' ? (d.drawn ? '尚未分配' : '等待抽籤') : '待管委會確認'))}</span>`}</div>
        <div class="small muted">車牌 ${x.plate ? esc(x.plate) : '尚未提供（請告知管委會）'}・每月 ${ui.money(x.fee)}${x.startMonth ? '・' + esc(x.startMonth) + ' 起算' : ''}</div></li>`).join('')}</ul>
      ${d.drawn ? '' : `<p class="muted small">抽籤時間：${esc(d.drawAt)}。只有「已確認」的住戶登記會參加抽籤。</p>`}
      <p class="muted small">資料有誤或要更換車牌，請洽管委會。</p>`;
  }

  /* ---------- 管理員以上：車位與車牌對照；管委會可改設定 ---------- */
  async function slots(el, ui){
    const {esc} = ui, admin = Auth.can('park:admin');
    ui.loading(el);
    const r = await ui.run('park.slots'); if(!r.ok){ el.innerHTML = ''; return; }
    const tag = s => `<span class="tag-s ${s.status === '空位' ? '' : s.status === '保留' ? 'bad' : 'ok'}">${esc(s.status)}${s.capacity > 1 ? ` ${s.used}/${s.capacity}` : ''}</span>`;
    el.innerHTML = `<p class="muted small">${admin ? '離路順序 1＝離馬路（中北三街）最遠；抽籤從最遠的車位開始取。' : '查違停用：車位上應停的車牌。'}</p>
      <ul class="list">${r.data.slots.map(s => `<li class="item" data-id="${esc(s.id)}">
        <div class="row"><b>${esc(s.id)} 號・${esc(s.category)}</b>${tag(s)}</div>
        ${s.cars.length ? s.cars.map(c => `<div>${esc(c.unit)}　<b>${c.plate ? esc(c.plate) : '（車牌未提供）'}</b> <span class="small muted">${esc(c.type)}</span></div>`).join('') : ''}
        <div class="small muted">${esc(s.use)}${s.order ? '・離路順序 ' + s.order : ''}・${esc(s.size)}・${esc(s.position)}${s.note ? '・' + esc(s.note) : ''}</div>
        ${admin ? `<button class="btn small" data-edit="${esc(s.id)}">修改</button><div class="pk-edit"></div>` : ''}</li>`).join('')}</ul>`;
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const s = r.data.slots.find(x => x.id === b.dataset.edit), box = b.nextElementSibling, acc = s.category === '無障礙';
      box.innerHTML = `<form class="form" novalidate>
        <div class="dims"><label>用途<select name="use"${acc ? ' disabled' : ''}>${['登記抽籤','租用'].map(u => `<option${s.use === u ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
          <label>離路順序<input name="order" inputmode="numeric" value="${esc(s.order || '')}"></label></div>
        <div class="dims"><label>容量（輛）<input name="capacity" inputmode="numeric" value="${esc(s.capacity)}"${acc ? '' : ' disabled'}></label>
          <label>保留不用<select name="status"><option value="">否</option><option value="保留"${s.status === '保留' ? ' selected' : ''}>保留</option></select></label></div>
        <label>備註<input name="note" value="${esc(s.note || '')}"></label>
        <p class="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit">儲存</button><button class="btn ghost" type="button">取消</button></div></form>`;
      const f = box.querySelector('form');
      f.querySelector('[type=button]').onclick = () => { box.innerHTML = ''; };
      f.onsubmit = async e => {
        e.preventDefault();
        const g = n => f.elements[n].value.trim();
        const body = {id:s.id, use:g('use'), capacity:Number(g('capacity')), status:g('status'), note:g('note')};
        if(g('order') !== '') body.order = Number(g('order')); else if(body.use === '租用') body.order = 0;
        const res = await ui.run('park.slotSave', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
        if(res.ok){ ui.toast(`${s.id} 號已儲存`); changed(ui); slots(el, ui); }
      };
    });
  }

  /* ---------- 管委會：名單 ---------- */
  async function list(el, ui){
    const {esc} = ui;
    el.innerHTML = `<button class="btn primary block" id="pk-new">＋ 新增一筆</button><div class="pk-form"></div><div class="pk-list"></div>`;
    const form = el.querySelector('.pk-form'), out = el.querySelector('.pk-list');
    const load = async () => {
      ui.loading(out);
      const r = await ui.run('park.list'); if(!r.ok){ out.innerHTML = ''; return; }
      const s = r.data.summary, items = r.data.items;
      out.innerHTML = `<p class="small">住戶登記 <b>${s.registered}</b> 戶（已確認 <b>${s.confirmed}</b> 戶會參加抽籤）・租用 <b>${s.rent}</b> 筆</p>
        ${s.missingPlateText ? `<p class="warnbox">${esc(s.missingPlateText)}（可之後補，不影響抽籤）</p>` : ''}
        ${r.data.drawn ? `<p class="hintbox">已正式抽籤：參加過抽籤的名單不能改戶號、類型，也不能刪；之後新增的登記不參加這次抽籤。</p>` : ''}
        <ul class="list">${items.map(x => `<li class="item">
          <div class="row"><b>${esc(x.unit)}</b>${x.slot ? `<span class="pk-slot">車位 ${esc(x.slot)}</span>` : x.draw ? `<span class="tag-s warn">${esc(x.draw)}</span>` : `<span class="tag-s ${x.confirm === '已確認' ? 'ok' : 'warn'}">${esc(x.confirm)}</span>`}</div>
          <div>${x.plate ? esc(x.plate) : '<span class="tag-s warn">缺車牌</span>'} <span class="small muted">${esc(x.type)}・${ui.money(x.fee)}／月${x.startMonth ? '・' + esc(x.startMonth) + ' 起' : ''}</span></div>
          ${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}
          <div class="btnrow"><button class="btn small" data-edit="${esc(x.id)}">修改</button><button class="btn small ghost" data-del="${esc(x.id)}">刪除</button></div></li>`).join('')}</ul>
        ${items.length ? '' : '<p class="muted">名單是空的。</p>'}`;
      out.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { edit(form, ui, items.find(x => x.id === b.dataset.edit), load); form.scrollIntoView({block:'start'}); });
      out.querySelectorAll('[data-del]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
        const res = await ui.run('park.remove', {id:b.dataset.del}, {button:b});
        if(res.ok){ ui.toast('已刪除'); changed(ui); load(); }
      }));
    };
    el.querySelector('#pk-new').onclick = () => edit(form, ui, null, load);
    load();
  }
  function edit(el, ui, x, done){
    const {esc} = ui, v = x || {type:'住戶登記', confirm:'已確認', startMonth:'2026-12'};
    el.innerHTML = `<form class="form" novalidate><h4>${x ? '修改 ' + esc(x.unit) : '新增名單'}</h4>
      <label>類型<select name="type">${TYPES.map(t => `<option${v.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label><span class="pk-ulabel"></span><input name="unit" value="${esc(v.unit || '')}" autocapitalize="characters"></label>
      <label>車牌（可先空白，之後補）<input name="plate" value="${esc(v.plate || '')}" autocapitalize="characters" autocomplete="off" placeholder="ABC-1234"></label>
      <div class="dims"><label>確認狀態<select name="confirm">${['已確認','待確認'].map(c => `<option${v.confirm === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>起算月份<input name="startMonth" type="month" value="${esc(v.startMonth || '')}"></label></div>
      <label>備註<input name="note" value="${esc(v.note || '')}"></label>
      <p class="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit">儲存</button><button class="btn ghost" type="button">取消</button></div></form>`;
    const f = el.querySelector('form');
    const sync = () => { const shop = f.elements.type.value === '物業店面租用';
      f.querySelector('.pk-ulabel').textContent = shop ? '名稱（例如：物業－代書）' : '戶號（樓層＋棟，例如 5A）'; };
    f.elements.type.onchange = sync; sync();
    f.querySelector('[type=button]').onclick = () => { el.innerHTML = ''; };
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => f.elements[n].value.trim(), shop = g('type') === '物業店面租用';
      const body = {type:g('type'), unit:shop ? g('unit') : g('unit').toUpperCase(), plate:g('plate').toUpperCase(), confirm:g('confirm'), startMonth:g('startMonth'), note:g('note')};
      if(x) body.id = x.id;
      const res = await ui.run('park.save', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
      if(res.ok){ ui.toast(res.data.notice || '已儲存'); changed(ui); el.innerHTML = ''; done && done(); }
    };
  }

  /* ---------- 管委會：抽籤 ---------- */
  async function draw(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const rr = await ui.run('park.result'); if(!rr.ok){ el.innerHTML = ''; return; }
    if(rr.data.drawn) return drawn(el, ui, rr.data);
    const r = await ui.run('park.draw', {}); if(!r.ok){ el.innerHTML = ''; return; }
    const p = r.data, can = p.participants > 0 && !p.busy.length;
    el.innerHTML = previewHtml(ui, p) + `
      <p class="alert" hidden></p>
      <button class="btn primary block pk-big" id="pk-go"${can ? '' : ' disabled'}>開始抽籤</button>
      <div class="pk-confirm" hidden></div>
      <p class="muted small">按下後系統當場決定結果並立刻公布，住戶登入就看得到。名單或車位要調整，請先到「名單」「車位」修改再回來。</p>
      <div class="pk-history"></div>`;
    const go = el.querySelector('#pk-go'), box = el.querySelector('.alert'), cf = el.querySelector('.pk-confirm');
    go.onclick = async () => {
      box.hidden = true;
      const again = await ui.run('park.draw', {}, {button:go, box}); if(!again.ok) return;   // 按下當下再讀一次，確認畫面用最新數字
      const q = again.data;
      go.hidden = true; cf.hidden = false;
      cf.innerHTML = `<div class="warnbox"><b>請再確認一次</b><br>參加 <b>${q.participants}</b> 戶，抽 <b>${q.slotCount}</b> 格車位（${q.slots.map(esc).join('、')}）。
          ${q.early ? `<br>現在早於公告的抽籤時間（${esc(q.drawAt)}）。` : ''}<br>確認後無法取消，只能「作廢重抽」並填寫原因。</div>
        <div class="btnrow"><button class="btn primary pk-big" id="pk-yes">確認，正式抽籤</button><button class="btn ghost" id="pk-no">先不要</button></div>`;
      cf.scrollIntoView({block:'nearest'});
      cf.querySelector('#pk-no').onclick = () => { cf.hidden = true; cf.innerHTML = ''; go.hidden = false; };
      const yes = cf.querySelector('#pk-yes');
      yes.onclick = async () => {
        const res = await ui.run('park.draw', {confirm:true}, {button:yes, box});
        if(!res.ok){ if(res.code === 'CONFLICT') draw(el, ui); return; }
        changed(ui);
        await show(el, ui, res.data);
        drawn(el, ui, res.data, true);
      };
    };
    drawLog(el.querySelector('.pk-history'), ui);
  }
  function previewHtml(ui, p){
    const {esc} = ui;
    return `<div class="statgrid">
        <div class="stat"><strong>${p.participants}</strong><span>參加（戶）</span></div>
        <div class="stat"><strong>${p.slotCount}</strong><span>抽籤車位（格）</span></div>
        <div class="stat"><strong>${p.waitCount ? p.waitCount : p.leftover}</strong><span>${p.waitCount ? '候補（戶）' : '抽完剩（格）'}</span></div></div>
      <p class="small">抽籤車位（離馬路最遠優先）：<b>${p.slots.map(esc).join('、') || '—'}</b></p>
      ${p.participants ? '' : `<p class="alert">名單裡沒有「已確認」的住戶登記，還不能抽籤。</p>`}
      ${p.waitCount ? `<p class="warnbox">登記戶數比車位多，會有 ${p.waitCount} 戶候補。</p>` : ''}
      ${p.missingPlateText ? `<p class="warnbox">${esc(p.missingPlateText)}</p>` : ''}
      ${p.busy.length ? `<p class="alert">以下車位或名單已有分配，要先到「租用」收回才能抽：${p.busy.map(b => `${esc(b.unit)}（車位 ${esc(b.slot)}）`).join('、')}</p>` : ''}
      ${p.early ? `<p class="hintbox">公告的抽籤時間是 ${esc(p.drawAt)}，現在還沒到（系統不會擋，只是提醒）。</p>` : ''}`;
  }
  /* 演出：號碼跳動約 2.5 秒。結果已由後端決定，這裡只是顯示方式 */
  function show(el, ui, d){
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(still) return Promise.resolve();
    el.innerHTML = `<p class="lead">抽籤中…</p><div class="pk-grid">${d.results.map(x => `<div class="pk-cell roll"><span>車位</span><strong>${ui.esc(x.slot)}</strong><b>？</b></div>`).join('')}</div>`;
    const cells = [...el.querySelectorAll('.pk-cell b')], units = d.units;
    return new Promise(done => {
      let n = 0;
      const t = setInterval(() => {
        n++;
        const settled = Math.floor((n - 12) / 2);                 // 1.2 秒後一格一格定下來
        cells.forEach((c, i) => { if(i < settled){ c.textContent = d.results[i].unit; c.parentNode.classList.remove('roll'); }
          else c.textContent = units[Math.floor(Math.random() * units.length)]; });
        if(settled >= cells.length || !el.isConnected){ clearInterval(t); setTimeout(done, 500); }
      }, 100);
    });
  }
  function drawn(el, ui, d, fresh){
    el.innerHTML = `${fresh ? `<p class="okbox"><b>${TRIAL ? '試抽完成。' : '抽籤完成，結果已公布。'}</b>接著可到「租用」分配租用車位。</p>` : ''}
      ${resultHtml(ui, d)}
      <details class="fold"><summary>作廢重抽</summary><div class="fold-body">
        <p class="small muted">只有名單或車位有誤時才使用。作廢後舊結果仍會留在紀錄裡，住戶的車位分配會清除，要重新按抽籤。</p>
        <form class="form" novalidate><label>作廢原因（必填）<input name="reason" maxlength="100"></label>
          <p class="alert" hidden></p><button class="btn" type="submit">作廢這次抽籤</button></form></div></details>
      <div class="pk-history"></div>`;
    const f = el.querySelector('form'), btn = f.querySelector('button');
    f.onsubmit = e => { e.preventDefault();
      const box = f.querySelector('.alert'), reason = f.elements.reason.value.trim();
      if(!reason){ box.textContent = '請填寫作廢原因'; box.hidden = false; return; }
      box.hidden = true;
      ui.confirmTwice(btn, async () => {
        const res = await ui.run('park.drawVoid', {id:d.id, reason}, {form:f, box, button:btn});
        if(res.ok){ ui.toast(`已作廢 ${res.data.id}`); changed(ui); draw(el, ui); }
      });
    };
    drawLog(el.querySelector('.pk-history'), ui);
  }
  function drawLog(el, ui){
    const {esc} = ui;
    ui.fold(el, '抽籤紀錄', async b => {
      ui.loading(b);
      const r = await ui.run('park.draws'); if(!r.ok){ b.innerHTML = ''; return; }
      b.innerHTML = r.data.draws.length ? `<ul class="list">${r.data.draws.map(x => `<li class="item">
          <div class="row"><b>${esc(x.id)}</b><span class="tag-s ${x.status === '正式' ? 'ok' : 'bad'}">${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.time)}・${x.participants} 戶／${x.slots} 格・種子 ${esc(x.seed)}${x.env ? '・' + esc(x.env) + '環境' : ''}</div>
          ${x.voidReason ? `<div class="small">作廢原因：${esc(x.voidReason)}（${esc(x.voidAt)}）</div>` : ''}</li>`).join('')}</ul>` : `<p class="muted small">還沒有抽籤紀錄。</p>`;
    });
    ui.fold(el, '抽籤時間與費用參數', b => ui.params(b, 'park'));
  }

  /* ---------- 管委會：租用分配（抽籤後直接分配；空白＝收回） ---------- */
  async function rent(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const [L, S] = await Promise.all([ui.run('park.list'), ui.run('park.slots')]);
    if(!L.ok || !S.ok){ el.innerHTML = ''; return; }
    const items = L.data.items.filter(x => x.type !== '住戶登記' || (L.data.drawn && x.how !== '抽籤')), free = S.data.slots.filter(s => s.rentable);
    const opts = cur => free.filter(s => s.id !== cur).map(s => `<option value="${esc(s.id)}">${esc(s.id)} 號（${esc(s.category)}${s.capacity > 1 ? `，已停 ${s.used}/${s.capacity}` : ''}）</option>`).join('');
    el.innerHTML = `${L.data.drawn ? `<p class="small">可分配的車位：<b>${free.map(s => esc(s.id)).join('、') || '沒有了'}</b></p>` : `<p class="warnbox">要等正式抽籤之後才能分配租用車位。</p>`}
      <p class="alert" hidden></p>
      <ul class="list">${items.map(x => `<li class="item">
        <div class="row"><b>${esc(x.unit)}</b>${x.slot ? `<span class="pk-slot">車位 ${esc(x.slot)}</span>` : `<span class="tag-s ${x.confirm === '已確認' ? '' : 'warn'}">${x.draw ? esc(x.draw) : x.confirm === '已確認' ? '未分配' : '待確認'}</span>`}</div>
        <div class="small muted">${esc(x.type)}・${x.plate ? esc(x.plate) : '缺車牌'}</div>
        ${L.data.drawn && x.confirm === '已確認' ? `<form class="inline" data-id="${esc(x.id)}"><select name="slot" aria-label="車位"><option value="">${x.slot ? '換到…' : '選車位…'}</option>${opts(x.slot)}</select><button class="btn small">${x.slot ? '移動' : '分配'}</button></form>` : ''}
        ${x.slot ? `<button class="btn small ghost" data-back="${esc(x.id)}">收回車位</button>` : ''}</li>`).join('')}</ul>
      ${items.length ? '' : '<p class="muted">沒有需要分配的名單。租用名單請到「名單」新增。</p>'}
      <p class="muted small">無障礙 4、5 號每格最多 2 輛，管委會可隨時收回。抽籤抽到的車位不能在這裡改。</p>`;
    const box = el.querySelector('.alert');
    el.querySelectorAll('form[data-id]').forEach(f => f.onsubmit = async e => {
      e.preventDefault(); box.hidden = true;
      const slot = f.elements.slot.value; if(!slot) return;
      const res = await ui.run('park.rentAssign', {id:f.dataset.id, slot}, {box, button:f.querySelector('button')});
      if(res.ok){ ui.toast(res.data.moved ? `已從 ${res.data.moved} 號移到 ${slot} 號` : `已分配 ${slot} 號`); changed(ui); rent(el, ui); }
    });
    el.querySelectorAll('[data-back]').forEach(b => b.onclick = async () => {
      box.hidden = true;
      const reason = (prompt('請輸入收回車位的原因') || '').trim(); if(!reason) return;
      const res = await ui.run('park.rentAssign', {id:b.dataset.back, slot:'', reason}, {box, button:b});
      if(res.ok){ ui.toast(`已收回 ${res.data.revoked} 號`); changed(ui); rent(el, ui); }
    });
  }

  /* 寫入後：清公開統計快取、更新上方數字與 3D 看板 */
  let topBox = null;
  function changed(ui){ API.invalidateStats('park.stats'); ui.pushStats(true); if(topBox && topBox.isConnected) publicBox(topBox, ui, true); }

  function render(el, ui, d, opt = {}){
    const u = Auth.user(), tabs = [];
    if(Auth.can('park:admin')){
      tabs.push({key:'draw', label:'抽籤', show:b => draw(b, ui)}, {key:'list', label:'名單', show:b => list(b, ui)},
                {key:'rent', label:'租用', show:b => rent(b, ui)}, {key:'slots', label:'車位', show:b => slots(b, ui)});
    } else if(Auth.can('park:guard')){
      tabs.push({key:'slots', label:'車位對照', show:b => slots(b, ui)}, {key:'result', label:'抽籤結果', show:b => result(b, ui)});
    }
    if(Auth.can('park:resident') && u && u.unit){
      tabs.unshift({key:'mine', label:'我的車位', show:b => mine(b, ui)});
      if(!tabs.some(t => t.key === 'result') && !Auth.can('park:admin')) tabs.push({key:'result', label:'抽籤結果', show:b => result(b, ui)});
    }
    el.innerHTML = `${TRIAL ? `<p class="alert pk-trial"><b>【測試中】</b>停車場島正在測試抽籤功能，這裡的名單、車位分配與抽籤結果都是<b>測試資料，不是正式結果</b>。正式抽籤時間見下方。</p>` : ''}<div class="pk-top"></div><div class="pk-main"></div>
      <details class="fold"><summary>機車位平面圖</summary><div class="fold-body"><img class="pk-plan" src="scene/plans/1f-rear-parking.svg" alt="一樓後側露天停車場平面圖，機車位 1 到 18 號" loading="lazy">
        <p class="muted small">下方是中北三街；北排（16–18、9–15）離馬路最遠。</p></div></details>
      <section class="pk-rules"></section>`;
    topBox = el.querySelector('.pk-top'); publicBox(topBox, ui);
    if(window.Rules) Rules.render(el.querySelector('.pk-rules'), Rules.of('parking'), {heading:'規範'});
    const main = el.querySelector('.pk-main');
    if(!Auth.loggedIn()){
      main.innerHTML = `<p class="lead">住戶登入後可以看本戶的車位與抽籤結果。</p><button class="btn primary block">登入</button>`;
      main.querySelector('button').onclick = () => ui.showLogin();
    } else if(!tabs.length) main.innerHTML = `<p class="lead">您的帳號沒有停車場島的權限。如需使用，請洽管委會。</p>`;
    else if(tabs.length === 1) tabs[0].show(main);
    else ui.tabs(main, tabs, opt.tab || (Auth.can('park:admin') ? 'draw' : tabs[0].key));
  }

  window.Panels = window.Panels || {};
  window.Panels.parking = {render};
  return {assign, verify};
})();
