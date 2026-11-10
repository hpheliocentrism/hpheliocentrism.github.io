/* =========================================================
   網站/panels/works.js — 工程島面板（整合維護）
   規格：claude/community-core/API.md 第 5.2 節（v2.8.0，只做規格 4.1）
   住戶（works:resident）：施工行事曆（works.calendar，看得到戶別樓層，看不到廠商）
   管理員（works:guard）：今日／明日施工（含廠商與電話，不存任何地方）、公告文字
   管委會（works:admin）：施工登記（依紙本申請單輸入）、狀態、停工日與國定假日、參數
   另提供 WorksPanel.publicSoon(el, ui)：公告島「近期公共工程」
   ========================================================= */
window.WorksPanel = (function(){
  const ITEMS = ['油漆','木作','水電','泥作敲除','廚衛','地板','窗戶鐵窗冷氣','清潔','其他'];
  const KIND = {weekday:'', weekend:'假日', holiday:'國定假日'};

  function entryLine(ui, e, staff){
    const {esc} = ui;
    const tags = [];
    if(e.mode === 'public') tags.push('<span class="tag-s">公共工程</span>');
    if(e.stopped) tags.push('<span class="tag-s bad">停工</span>');
    else if(e.noise) tags.push('<span class="tag-s warn">噪音</span>');
    if(e.noiseBlocked) tags.push('<span class="tag-s">噪音工項暫停</span>');
    if(e.mode === 'quiet') tags.push('<span class="tag-s ok">假日靜音</span>');
    if(e.status === '暫停') tags.push('<span class="tag-s bad">暫停</span>');
    const who = e.mode === 'public' ? '全棟' : `${esc(e.unit)}（${esc(e.floor)}F）`;
    return `<div class="entry"><div class="row"><span><b>${who}</b> ${esc(e.title)}</span><span class="small">${esc(e.time)}</span></div>
      <div class="small muted">${(e.items || []).map(esc).join('、')}${e.quietNote ? '・靜音：' + esc(e.quietNote) : ''}${e.elevatorStop ? '・電梯停用 ' + esc(e.elevatorStop) : ''}</div>
      ${tags.length ? `<div class="btnrow">${tags.join('')}</div>` : ''}
      ${staff ? `<div class="small">${e.company ? esc(e.company) + '・' : ''}${e.contactName ? esc(e.contactName) + ' ' : ''}${e.contactPhone ? `<a href="tel:${esc(e.contactPhone)}">${esc(e.contactPhone)}</a>` : ''}
        ${e.elevatorUse === '是' ? `・電梯保護費 ${e.feeWarn ? '<b class="tag-s bad">待繳</b>' : esc(e.elevatorFee)}` : ''}${e.noteText ? '・' + esc(e.noteText) : ''}</div>` : ''}</div>`;
  }
  function dayBox(ui, d, staff){
    const {esc} = ui, off = d.kind !== 'weekday';
    return `<div class="day${off ? ' off' : ''}"><h4>${esc(d.date.slice(5).replace('-','/'))}（${esc(d.dow)}）${KIND[d.kind] ? `<span class="tag-s">${KIND[d.kind]}</span>` : ''}
        ${d.stop ? `<span class="tag-s bad">${esc(d.stop.scope)}：${esc(d.stop.reason)}</span>` : ''}</h4>
      ${d.entries.length ? d.entries.map(e => entryLine(ui, e, staff)).join('') : '<div class="small muted">沒有施工</div>'}</div>`;
  }

  /* ---------- 住戶：行事曆 ---------- */
  async function calendar(el, ui, from){
    const {esc} = ui;
    from = from || ui.today();
    const to = new Date(new Date(from + 'T00:00:00Z').getTime() + 13*864e5).toISOString().slice(0,10);
    el.innerHTML = `<div class="row"><button class="btn small ghost" data-go="-14">← 前兩週</button><span class="small muted">${esc(from)}～${esc(to)}</span><button class="btn small ghost" data-go="14">後兩週 →</button></div><div class="daylist"></div>`;
    const shift = n => new Date(new Date(from + 'T00:00:00Z').getTime() + n*864e5).toISOString().slice(0,10);
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => calendar(el, ui, shift(+b.dataset.go)));
    const list = el.querySelector('.daylist'); ui.loading(list);
    const r = await ui.run('works.calendar', {from, to}); if(!r.ok){ list.innerHTML = ''; return; }
    list.innerHTML = r.data.days.map(d => dayBox(ui, d, false)).join('')
      + `<p class="muted small">平日施工 09:00–17:00；假日只可做靜音工程。施工問題請洽管理室。</p>`;
  }

  /* ---------- 管理員：今日 ---------- */
  async function today(el, ui, date){
    const {esc} = ui;
    date = date || ui.today();
    const admin = Auth.can('works:admin');
    el.innerHTML = `<div class="btnrow"><button class="btn small" data-d="${ui.today()}">今天</button><button class="btn small" data-d="${ui.today(1)}">明天</button>
      ${admin ? `<form class="inline"><input type="date" name="d" value="${esc(date)}" aria-label="日期"><button class="btn small">查詢</button></form>` : ''}</div><div class="wt"></div>`;
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => today(el, ui, b.dataset.d));
    const f = el.querySelector('form'); if(f) f.onsubmit = e => { e.preventDefault(); today(el, ui, f.d.value); };
    const box = el.querySelector('.wt'); ui.loading(box);
    // 含廠商負責人電話：只顯示，不存 localStorage
    const r = await ui.run('works.today', {date}); if(!r.ok){ box.innerHTML = ''; return; }
    const d = r.data;
    box.innerHTML = (d.notices || []).map(n => `<p class="warnbox">${esc(n)}</p>`).join('') + dayBox(ui, d, true);
  }
  function announce(el, ui){
    el.innerHTML = `<div class="btnrow"><button class="btn small" data-m="day" data-d="${ui.today(1)}">明天的公告</button><button class="btn small" data-m="day" data-d="${ui.today()}">今天的公告</button>
      <button class="btn small" data-m="week" data-d="${ui.today()}">下週彙整</button></div><div class="wa"></div>`;
    const out = el.querySelector('.wa');
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
      ui.loading(out);
      const r = await ui.run('works.announce', {mode:b.dataset.m, date:b.dataset.d}, {button:b}); if(!r.ok){ out.innerHTML = ''; return; }
      const d = r.data;
      out.innerHTML = d.count ? `<pre class="announce">${ui.esc(d.text)}</pre><button class="btn primary block">複製公告</button>`
        : `<p class="muted">${ui.esc(d.message || '沒有需要公告的施工。')}</p>`;
      const c = out.querySelector('button'); if(c) c.onclick = () => ui.copy(d.text, out.querySelector('.announce'));
    });
  }

  /* ---------- 管委會：施工登記 ---------- */
  async function list(el, ui){
    const {esc} = ui;
    el.innerHTML = `<button class="btn primary block" id="new">＋ 依紙本申請單新增</button>
      <form class="inline flt"><select name="status" aria-label="狀態"><option value="">全部狀態</option>${['已核准','施工中','暫停','已完工','已取消'].map(s => `<option>${s}</option>`).join('')}</select>
      <input name="unit" placeholder="戶號" aria-label="戶號"><button class="btn small">篩選</button></form><div class="wf"></div><div class="wl"></div>`;
    const form = el.querySelector('.wf'), out = el.querySelector('.wl'), flt = el.querySelector('.flt');
    el.querySelector('#new').onclick = () => edit(form, ui, null, load);
    const load = async () => {
      ui.loading(out);
      const q = {}; if(flt.status.value) q.status = flt.status.value; if(flt.unit.value.trim()) q.unit = flt.unit.value.trim().toUpperCase();
      const r = await ui.run('works.list', q); if(!r.ok){ out.innerHTML = ''; return; }
      const ws = r.data.works;
      out.innerHTML = `<p class="muted small">共 ${r.data.total} 件${r.data.truncated ? '（只列前 500 件）' : ''}</p><ul class="list">${ws.map(w => `<li class="item">
          <div class="row"><b>${esc(w.unit)}・${esc(w.title)}</b><span class="tag-s ${w.status === '暫停' || w.status === '已取消' ? 'bad' : w.status === '已完工' ? '' : 'ok'}">${esc(w.status)}</span></div>
          <div class="small muted">${esc(w.id)}・${esc(w.start)}～${esc(w.end)}・${esc(w.time)}${w.noise ? '・噪音' : ''}${w.holiday !== '無' ? '・假日靜音 ' + esc(w.holiday) : ''}</div>
          ${w.type === '住戶裝修' ? `<div class="small muted">${esc(w.company)}・${esc(w.contactName)}・電梯保護費 ${esc(w.elevatorFee)}</div>` : ''}
          ${w.statusWhy ? `<div class="small">原因：${esc(w.statusWhy)}</div>` : ''}
          <div class="btnrow"><button class="btn small" data-edit="${esc(w.id)}">修改</button>
            <select data-st="${esc(w.id)}" aria-label="改狀態"><option value="">改狀態…</option>${['已核准','施工中','暫停','已完工','已取消'].filter(s => s !== w.status).map(s => `<option>${s}</option>`).join('')}</select></div></li>`).join('')}</ul>`;
      out.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { edit(form, ui, ws.find(w => w.id === b.dataset.edit), load); form.scrollIntoView({block:'start'}); });
      out.querySelectorAll('[data-st]').forEach(s => s.onchange = async () => {
        const status = s.value; if(!status) return;
        let reason = '';
        if(status === '暫停' || status === '已取消'){ reason = (prompt(`請輸入「${status}」的原因`) || '').trim(); if(!reason){ s.value = ''; return; } }
        const res = await ui.run('works.setStatus', {id:s.dataset.st, status, reason});
        if(res.ok){ ui.toast(`${res.data.id} 改為 ${res.data.status}`); API.invalidateStats('works.stats'); load(); } else s.value = '';
      });
    };
    flt.onsubmit = e => { e.preventDefault(); load(); };
    load();
  }
  function edit(el, ui, w, done){
    const {esc} = ui, v = w || {type:'住戶裝修', items:[], holiday:'無', time:'09:00–17:00', elevatorUse:'是', elevatorFee:'待繳', exterior:['無']};
    const has = x => (v.items || []).includes(x);
    el.innerHTML = `<form class="form" novalidate><h4>${w ? '修改 ' + esc(w.id) : '新增施工'}</h4>
      <fieldset class="seg"><legend>類別</legend>${['住戶裝修','社區公共工程'].map(t => `<label><input type="radio" name="type" value="${t}"${v.type === t ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
      <div class="res"><div class="dims"><label>戶號<input name="unit" value="${esc(v.type === '住戶裝修' ? v.unit || '' : '')}" autocapitalize="characters"></label>
        <label>紙本申請日<input name="paperDate" type="date" value="${esc(v.paperDate || '')}"></label></div></div>
      <label>工程名稱（30 字內）<input name="title" maxlength="30" value="${esc(v.title || '')}" required></label>
      <fieldset class="res"><legend>工項</legend><div class="btnrow">${ITEMS.map(x => `<label class="small"><input type="checkbox" name="items" value="${x}"${has(x) ? ' checked' : ''}> ${x}</label>`).join('')}</div></fieldset>
      <label class="res">噪音工程<select name="noise"><option value="">依工項判斷（含泥作敲除＝是）</option><option${w && w.noise ? ' selected' : ''}>是</option><option${w && w.noise === false ? ' selected' : ''}>否</option></select></label>
      <div class="dims"><label>開始<input name="start" type="date" value="${esc(v.start || '')}" required></label><label>結束<input name="end" type="date" value="${esc(v.end || '')}" required></label></div>
      <label>施工時段<input name="time" value="${esc(v.time || '')}" placeholder="09:00–17:00"></label>
      <div class="res"><label>假日靜音<select name="holiday">${['無','週六','週日','週六日'].map(h => `<option${v.holiday === h ? ' selected' : ''}>${h}</option>`).join('')}</select></label>
        <label>假日靜音工項說明<input name="holidayNote" value="${esc(v.holidayNote || '')}" placeholder="例：油漆、清潔"></label>
        <div class="dims"><label>廠商<input name="company" value="${esc(v.company || '')}"></label><label>負責人<input name="contactName" value="${esc(v.contactName || '')}"></label></div>
        <label>負責人電話<input name="contactPhone" type="tel" value="${esc(v.contactPhone || '')}"></label>
        <div class="dims"><label>使用電梯<select name="elevatorUse">${['是','否'].map(x => `<option${v.elevatorUse === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>電梯保護費<select name="elevatorFee">${['待繳','已繳','免收'].map(x => `<option${v.elevatorFee === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div></div>
      <label class="pub">電梯停用時段（沒有就留白）<input name="elevatorStop" value="${esc(v.elevatorStop && v.elevatorStop !== '否' ? v.elevatorStop : '')}" placeholder="09:00–12:00"></label>
      <label>備註<input name="note" value="${esc(v.note || '')}"></label>
      <p class="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit">儲存</button><button class="btn ghost" type="button" id="cx">取消</button></div></form>`;
    const f = el.querySelector('form');
    const sync = () => { const pub = f.elements.type.value === '社區公共工程'; f.querySelectorAll('.res').forEach(x => x.hidden = pub); f.querySelectorAll('.pub').forEach(x => x.hidden = !pub); };
    f.addEventListener('change', sync); sync();
    f.querySelector('#cx').onclick = () => { el.innerHTML = ''; };
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => f.elements[n].value.trim(), pub = g('type') === '社區公共工程';
      const body = {type:g('type'), title:g('title'), start:g('start'), end:g('end')};
      if(w) body.id = w.id;
      if(g('time')) body.time = g('time');
      if(g('note')) body.note = g('note');
      if(pub){ if(g('elevatorStop')) body.elevatorStop = g('elevatorStop'); }
      else {
        Object.assign(body, {unit:g('unit').toUpperCase(), paperDate:g('paperDate'), items:[...f.querySelectorAll('[name=items]:checked')].map(x => x.value),
          holiday:g('holiday'), holidayNote:g('holidayNote'), company:g('company'), contactName:g('contactName'), contactPhone:g('contactPhone'),
          elevatorUse:g('elevatorUse'), elevatorFee:g('elevatorFee')});
        if(g('noise')) body.noise = g('noise');
      }
      const res = await ui.run('works.save', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
      if(res.ok){ ui.toast(`已儲存 ${res.data.id}`); API.invalidateStats('works.stats'); el.innerHTML = ''; done && done(); }
    };
  }

  /* ---------- 管委會：停工日與國定假日 ---------- */
  async function holidays(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('works.holidays'); if(!r.ok){ el.innerHTML = ''; return; }
    const show = d => {
      el.innerHTML = `${d.holidays.length ? '' : `<p class="warnbox">還沒有輸入國定假日。沒輸入的平日國定假日會被當成一般平日（可做噪音工程）。</p>`}
        <h4>國定假日</h4><ul class="list">${d.holidays.map(h => `<li class="item"><div class="row"><span>${esc(h.date)} ${esc(h.name)}</span><button class="btn small ghost" data-del="holiday" data-date="${esc(h.date)}">刪除</button></div></li>`).join('')}</ul>
        <form class="inline" data-k="holiday"><input type="date" name="date" required aria-label="日期"><input name="name" placeholder="名稱，例如 行憲紀念日" aria-label="名稱"><button class="btn small">新增</button></form>
        <h4>停工日</h4><ul class="list">${d.stops.map(s => `<li class="item"><div class="row"><span>${esc(s.date)}・${esc(s.scope)}・${esc(s.reason)}</span><button class="btn small ghost" data-del="stop" data-date="${esc(s.date)}">刪除</button></div></li>`).join('')}</ul>
        <form class="inline" data-k="stop"><input type="date" name="date" required aria-label="日期"><select name="scope" aria-label="範圍"><option>全部停工</option><option>只停噪音工程</option></select><input name="reason" placeholder="原因" aria-label="原因"><button class="btn small">新增</button></form>
        <p class="muted small">國定假日請依人事行政總處公告輸入；同日期會覆蓋。</p>`;
      el.querySelectorAll('form[data-k]').forEach(f => f.onsubmit = async e => {
        e.preventDefault();
        const body = {kind:f.dataset.k, date:f.elements.date.value};
        if(f.dataset.k === 'holiday') body.name = f.elements.name.value.trim(); else { body.scope = f.elements.scope.value; body.reason = f.elements.reason.value.trim(); }
        const res = await ui.run('works.holidaySave', body, {button:f.querySelector('button')});
        if(res.ok){ API.invalidateStats('works.stats'); show(res.data); }
      });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
        const res = await ui.run('works.holidayDel', {kind:b.dataset.del, date:b.dataset.date}, {button:b});
        if(res.ok){ API.invalidateStats('works.stats'); show(res.data); }
      }));
    };
    show(r.data);
  }

  /* ---------- 公告島：近期公共工程（登入住戶） ---------- */
  async function publicSoon(el, ui){
    const {esc} = ui;
    if(!Auth.can('works:resident')) return;
    const r = await API.call('works.calendar', {from:ui.today(), to:ui.today(13)});
    if(!r.ok) return;
    const rows = [];
    r.data.days.forEach(d => d.entries.filter(e => e.mode === 'public').forEach(e => rows.push({d, e})));
    el.innerHTML = `<h3>近期公共工程</h3>` + (rows.length ? `<ul class="list">${rows.map(({d, e}) => `<li class="item"><div class="row"><b>${esc(e.title)}</b><span class="small">${esc(d.date.slice(5).replace('-','/'))}（${esc(d.dow)}）${esc(e.time)}</span></div>
        ${e.elevatorStop ? `<div class="small">電梯停用 ${esc(e.elevatorStop)}</div>` : ''}</li>`).join('')}</ul>` : `<p class="muted small">未來兩週沒有公共工程。</p>`)
      + `<button class="link" id="to-works">看全部施工行事曆 →</button>`;
    el.querySelector('#to-works').onclick = () => ui.openIsland('works');
  }

  function render(el, ui, d, opt = {}){
    const tabs = [];
    if(Auth.can('works:resident')) tabs.push({key:'cal', label:'行事曆', show:b => calendar(b, ui)});
    if(Auth.can('works:guard')){ tabs.push({key:'today', label:'今日施工', show:b => today(b, ui)}); tabs.push({key:'ann', label:'公告', show:b => announce(b, ui)}); }
    if(Auth.can('works:admin')) tabs.push({key:'admin', label:'登記管理', show:b => {
      ui.fold(b, '施工登記', x => list(x, ui), true);
      ui.fold(b, '停工日與國定假日', x => holidays(x, ui));
      ui.fold(b, '工程參數', x => ui.params(x, 'works', {readonly:[10]}));
    }});
    el.innerHTML = '<div class="w-main"></div><section class="w-rules"></section>';
    if(window.Rules) Rules.render(el.querySelector('.w-rules'), Rules.of('works'), {heading:'規範'});
    const main = el.querySelector('.w-main');
    if(!tabs.length){ main.innerHTML = `<p class="lead">您的帳號沒有工程島的權限。</p>`; return; }
    if(tabs.length === 1) tabs[0].show(main); else ui.tabs(main, tabs, opt.tab || (Auth.can('works:guard') && !Auth.can('works:admin') ? 'today' : tabs[0].key));
  }

  window.Panels = window.Panels || {};
  window.Panels.works = {render};
  return {publicSoon};
})();
