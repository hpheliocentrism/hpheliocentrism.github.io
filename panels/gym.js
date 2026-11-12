/* =========================================================
   網站/panels/gym.js — 健身房島面板（美術，2026-11-11）
   規格：島嶼/gym/規格.md 第 2、4 節；API：claude/community-core/API.md 第 5.1 節（v2.8.0，Gym.gs）
   公開（未登入）：開放狀態、今日時段、維修器材數、本時段借出／下一時段已登記（gym.stats）、辦法、登入鈕
   住戶（gym:resident，有戶號）：本戶本週額度、本月清潔費、近期紀錄、夜間預約（依 nightBooking）、報修與我的報修
   管理員（gym:guard）：登記日間使用、感應扣借還與遺失、夜間預約名單與投遞、代登記夜間預約、報修處理與器材狀態
   管委會（gym:admin）：使用紀錄（修正、匯出 CSV）、清潔費月結、暫停使用、關閉時段、器材、感應扣恢復、參數
   隱私：戶號只出現在管理員以上的畫面；不寫 localStorage、不放網址。照片上傳前縮到長邊 1280、JPEG 0.75。
   ========================================================= */
(function(){
  const CLOSE_CATS = ['保養','清潔','施工','天候','其他'];            // Gym.gs GYM_CLOSE_CATS
  const EQ_STATUS = ['正常','維修中','停用'];
  const REP_STATUS = ['待處理','處理中','已完成','不處理'];
  const REG_STATUS = ['已預約','使用中','已歸還','取消','未歸還'];
  const regTone = s => s === '已歸還' ? 'ok' : s === '取消' ? '' : s === '未歸還' ? 'bad' : 'warn';
  const repTone = s => s === '已完成' ? 'ok' : s === '不處理' ? '' : 'warn';
  const eqTone = s => s === '正常' ? 'ok' : 'bad';
  const fobTone = s => s === '在管理中心' ? 'ok' : s === '借出' ? 'warn' : 'bad';
  const md = s => String(s || '').slice(5).replace('-', '/');                      // 2026-11-12 → 11/12
  const changed = () => { if(window.API && API.invalidateStats) API.invalidateStats('gym.stats'); if(UI.pushStats) UI.pushStats(true); };
  const opts = (xs, sel) => xs.map(x => `<option${x === sel ? ' selected' : ''}>${x}</option>`).join('');

  /* ---------- 公開：開放狀態（gym.stats，只有數量） ---------- */
  async function publicBox(el, ui){
    const {esc} = ui;
    const r = await API.stats('gym.stats'); if(!r.ok) return;
    const d = r.data;
    const paused = !d.open && d.closedReason && d.closedReason !== '非開放時間';
    const state = d.open ? '開放中' : paused ? '暫停開放' : '已閉館';
    el.innerHTML = `<div class="statgrid">
        <div class="stat"><b>現在</b><strong style="font-size:1.25rem"><span class="dot ${d.open ? 'ok' : 'bad'}"></span>${state}</strong><span>${esc(d.hours || '09:00–21:00')}</span></div>
        <div class="stat"><b>本時段借出</b><strong>${d.slotNow ? d.slotNow.borrowed : '—'}</strong><span>${d.slotNow ? esc(d.slotNow.start + '–' + d.slotNow.end) : '不開放'}</span></div>
        <div class="stat"><b>下一時段</b><strong>${d.slotNext ? d.slotNext.booked : '—'}</strong><span>${d.slotNext ? esc(d.slotNext.start + '–' + d.slotNext.end) : '今日已結束'}</span></div></div>
      ${paused ? `<p class="warnbox">暫停開放（${esc(d.closedReason)}）${d.closedText ? '：' + esc(d.closedText) : ''}</p>` : ''}
      ${d.broken ? `<p class="warnbox">有 ${d.broken} 台器材維修中或停用，請勿使用掛有黃色警示牌的器材。</p>` : ''}
      <p class="muted small">數字是感應扣借出與登記的數量，不是在場人數。日間 09:00–18:00 請到管理中心登記借感應扣。</p>`;
  }

  /* ---------- 照片縮圖（API.md 第 6 節） ---------- */
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

  /* ---------- 住戶：本戶 ---------- */
  async function mine(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.mine'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, w = d.week, m = d.month;
    el.innerHTML = `${d.suspended ? `<p class="alert">本戶暫停使用健身房：${esc(d.suspended.from)}～${esc(d.suspended.to)}。如有疑問請洽管委會。</p>` : ''}
      <h3>${esc(d.unit)} 本週額度 <span class="small muted">${md(w.start)}～${md(w.end)}</span></h3>
      <div class="statgrid"><div class="stat"><b>已用</b><strong>${w.used}</strong><span>人次</span></div>
        <div class="stat"><b>剩餘免費</b><strong>${w.remaining}</strong><span>／${w.quota} 人次</span></div>
        <div class="stat"><b>${esc(m.month.slice(5))} 月清潔費</b><strong>${m.fee}</strong><span>元・${m.billed} 人次</span></div></div>
      <p class="muted small">每戶每週一起算 ${w.quota} 人次免費，一人去一次算 1 人次；超過的人次收清潔費，在管理費帳單上個別列出、一起繳。</p>
      ${d.upcoming.length ? `<h3>已預約</h3><ul class="list">${d.upcoming.map(x => `<li class="item" data-id="${esc(x.id)}">
          <div class="row"><b>${md(x.date)} ${esc(x.slot)}</b><span class="tag-s warn">已預約</span></div>
          <div class="small muted">${x.people} 人${x.billed ? `・其中 ${x.billed} 人次收 ${x.fee} 元` : ''}・${d.cutoff} 前可取消</div>
          <button class="btn small" data-cx>取消預約</button></li>`).join('')}</ul>` : ''}
      <h3>近期紀錄</h3>${d.recent.length ? `<ul class="list">${d.recent.map(x => `<li class="item"><div class="row"><span>${md(x.date)} ${esc(x.slot)}</span><span class="tag-s ${regTone(x.status)}">${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.dn)}・${x.people} 人・免費 ${x.free}${x.billed ? `・計費 ${x.billed} 人次 ${x.fee} 元` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">還沒有使用紀錄。</p>'}`;
    el.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const res = await ui.run('gym.cancel', {id:b.closest('[data-id]').dataset.id}, {button:b});
      if(res.ok){ ui.toast('已取消預約'); changed(); mine(el, ui); }
    }));
  }

  /* ---------- 住戶：夜間預約（參數 7 開啟才可用） ---------- */
  async function night(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.mine'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data;
    const days = [...Array(8)].map((_, i) => ui.today(i));
    el.innerHTML = `<p class="muted">夜間 18:00–21:00 管理員不在，要先預約，管理員下班前會把感應扣投進您的信箱；用完請投回歸還信箱。</p>
      ${d.nightBooking ? `<form class="form" novalidate>
          <label>日期<select name="date">${days.map((x, i) => `<option value="${x}">${md(x)}${i === 0 ? '（今天）' : ''}</option>`).join('')}</select></label>
          <fieldset class="seg"><legend>時段</legend>${d.nightSlots.map((s, i) => `<label><input type="radio" name="slot" value="${esc(s)}"${i ? '' : ' checked'}> ${esc(s)}</label>`).join('')}</fieldset>
          <label>使用人數（本戶住戶，不含訪客）<input name="people" type="number" inputmode="numeric" min="1" max="10" value="1"></label>
          <p class="hintbox">當天預約請在 ${esc(d.cutoff)} 前；一戶一天一筆，${esc(d.cutoff)} 前可取消。本週剩餘免費 ${d.week.remaining} 人次。</p>
          <p class="alert" hidden></p><button class="btn primary block">預約</button></form><div class="g-out"></div>`
        : `<p class="warnbox">此功能尚未開放；夜間使用請於管理員值勤時間至管理中心登記</p><button class="btn block" disabled>預約（尚未開放）</button>`}`;
    const f = el.querySelector('form'); if(!f) return;
    f.onsubmit = async e => {
      e.preventDefault();
      const body = {date:f.elements.date.value, slot:f.querySelector('[name=slot]:checked').value, people:Number(f.elements.people.value)};
      const res = await ui.run('gym.book', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(!res.ok) return;
      const x = res.data;
      el.querySelector('.g-out').innerHTML = `<p class="okbox">已預約 ${md(x.date)} ${esc(x.slot)}・${x.people} 人。${esc(x.message || '')}</p>${x.notice ? `<p class="warnbox">${esc(x.notice)}</p>` : ''}`;
      changed();
    };
  }

  /* ---------- 報修（住戶與管理員共用表單） ---------- */
  async function reportForm(el, ui, after){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.equipment'); if(!r.ok){ el.innerHTML = ''; return; }
    const eq = r.data.equipment;
    el.innerHTML = `<ul class="list">${eq.map(x => `<li class="item"><div class="row"><b>${esc(x.name)}</b><span class="tag-s ${eqTone(x.status)}">${esc(x.status)}</span></div>
        ${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</li>`).join('')}</ul>
      <form class="form" novalidate><h4>我要報修</h4>
        <label>器材<select name="equipment">${eq.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}<option value="OTHER">其他／環境（冷氣、燈、門窗…）</option></select></label>
        <label>問題描述（200 字內）<input name="text" maxlength="200" required placeholder="例：速度忽快忽慢"></label>
        <label>照片（選填）<input name="photo" type="file" accept="image/*"></label>
        <p class="muted small">拍器材就好，請不要拍到人。</p>
        <p class="alert" hidden></p><button class="btn primary block">送出報修</button></form>`;
    const f = el.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const body = {equipment:f.elements.equipment.value, text:f.elements.text.value.trim()};
      if(!body.text){ f.elements.text.setAttribute('aria-invalid','true'); f.elements.text.focus(); return; }
      const file = f.elements.photo.files[0];
      if(file){ try{ body.photoBase64 = await shrink(file); body.photoMime = 'image/jpeg'; }catch(err){ ui.toast('照片處理失敗，請重拍', 'error'); return; } }
      const res = await ui.run('gym.report', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok){ ui.toast(`已送出報修 ${res.data.id}`); if(res.data.notice) ui.toast(res.data.notice); f.reset(); after && after(); }
    };
  }
  async function myReports(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.reports'); if(!r.ok){ el.innerHTML = ''; return; }
    const xs = r.data.reports;
    el.innerHTML = `<h3>我的報修</h3>` + (xs.length ? `<ul class="list">${xs.map(x => `<li class="item"><div class="row"><b>${esc(x.equipmentName)}</b><span class="tag-s ${repTone(x.status)}">${esc(x.status)}</span></div>
        <div class="small">${esc(x.text)}</div><div class="small muted">${esc(x.id)}・${esc(x.reportedAt)}</div>
        ${x.note ? `<div class="small">您回報的${esc(x.equipmentName)}已${esc(x.status)}：${esc(x.note)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">沒有報修紀錄。</p>');
  }
  function residentReport(el, ui){
    el.innerHTML = '<div class="g-form"></div><div class="g-mine"></div>';
    const mineBox = el.querySelector('.g-mine');
    reportForm(el.querySelector('.g-form'), ui, () => myReports(mineBox, ui));
    myReports(mineBox, ui);
  }

  /* ---------- 管理員：值勤（登記日間使用、感應扣） ---------- */
  async function duty(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.today'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, admin = Auth.can('gym:admin');
    const daySlots = d.slots.filter(s => !s.night);
    const free = d.fobs.filter(f => f.status === '在管理中心');
    el.innerHTML = `${d.notices.map(n => `<p class="warnbox">${esc(n)}</p>`).join('')}
      ${d.closures.length ? `<p class="hintbox">關閉時段：${d.closures.map(c => `${esc(c.from)}～${esc(c.to.slice(-5))} ${esc(c.category)}（${esc(c.text)}）`).join('；')}</p>` : ''}
      <form class="form g-in" novalidate><h4>登記日間使用 <span class="small muted">09:00–18:00</span></h4>
        <div class="dims"><label>戶號<input name="unit" required autocapitalize="characters" placeholder="5B"></label>
          <label>人數<input name="people" type="number" inputmode="numeric" min="1" max="10" value="1"></label></div>
        <div class="dims"><label>時段<select name="slot"><option value="">現在這個時段</option>${daySlots.map(s => `<option>${esc(s.label)}</option>`).join('')}</select></label>
          <label>感應扣<select name="fob"><option value="">自動</option>${free.map(f => `<option value="${f.no}">${f.no} 號</option>`).join('')}</select></label></div>
        <p class="hintbox">只限本戶住戶使用，不得帶訪客；每位使用者算 1 人次。</p>
        <p class="alert" hidden></p><button class="btn primary block"${free.length ? '' : ' disabled'}>${free.length ? '登記並借出感應扣' : '感應扣都已借出'}</button></form>
      <div class="g-res"></div>
      <h3>感應扣 <span class="small muted">在管理中心 ${d.freeFobs} 個</span></h3>
      <ul class="list" style="display:grid;grid-template-columns:1fr 1fr">${d.fobs.map(f => `<li class="item" data-fob="${f.no}"><div class="row"><b>${f.no} 號</b><span class="tag-s ${fobTone(f.status)}">${esc(f.status)}</span></div>
          ${f.unit ? `<div class="small">${esc(f.unit)}</div>` : ''}
          ${f.note && f.status !== '在管理中心' && f.status !== '借出' ? `<div class="small muted">${esc(f.note)}</div>` : ''}
          ${f.status === '借出' ? `<button class="btn small primary" data-ret>歸還</button>` : ''}
          ${admin && (f.status === '遺失' || f.status === '損壞停用') ? `<button class="btn small" data-restore>恢復使用</button>` : ''}</li>`).join('')}</ul>
      <div class="g-lost"></div>
      ${d.overdue.length ? `<h3>未歸還</h3><ul class="list">${d.overdue.map(x => `<li class="item"><div class="row"><b>${esc(x.unit)}・${x.fob} 號</b><span class="tag-s bad">未歸還</span></div>
          <div class="small muted">${md(x.date)} ${esc(x.slot)}・${esc(x.dn)}借出</div></li>`).join('')}</ul>` : ''}
      <h3>今日登記</h3>${d.registrations.length ? `<ul class="list">${d.registrations.map(x => `<li class="item"><div class="row"><b>${esc(x.unit)}・${esc(x.slot)}</b><span class="tag-s ${regTone(x.status)}">${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.dn)}・${x.people} 人・免費 ${x.free}${x.billed ? `・計費 ${x.billed} 人次 ${x.fee} 元` : ''}${x.fob ? `・${x.fob} 號` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">今天還沒有登記。</p>'}`;
    const f = el.querySelector('.g-in'), res = el.querySelector('.g-res');
    f.onsubmit = async e => {
      e.preventDefault();
      const body = {unit:f.elements.unit.value.trim().toUpperCase(), people:Number(f.elements.people.value)};
      if(f.elements.slot.value) body.slot = f.elements.slot.value;
      if(f.elements.fob.value) body.fob = Number(f.elements.fob.value);
      const r2 = await ui.run('gym.checkIn', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(!r2.ok) return;
      const x = r2.data;
      changed();
      await duty(el, ui);
      el.querySelector('.g-res').innerHTML = `<p class="okbox">${esc(x.unit)} 已登記 ${esc(x.slot)}，借出 <b>${x.fob} 號</b>。本次免費 ${x.free} 人次${x.billed ? `、計費 ${x.billed} 人次 ${x.fee} 元` : ''}；本週剩餘免費 ${x.week.remaining} 人次。</p>
        ${x.notice ? `<p class="warnbox">${esc(x.notice)}</p>` : ''}`;
    };
    el.querySelectorAll('[data-ret]').forEach(b => b.onclick = async () => {
      const no = Number(b.closest('[data-fob]').dataset.fob);
      const r2 = await ui.run('gym.return', {fob:no}, {button:b});
      if(r2.ok){ ui.toast(`${no} 號已歸還`); changed(); duty(el, ui); }
    });
    // 感應扣遺失或損壞：收在展開區，避免誤按
    const lostable = d.fobs.filter(f => f.status === '借出' || f.status === '在管理中心');
    if(lostable.length) ui.fold(el.querySelector('.g-lost'), '感應扣遺失或損壞', b => {
      b.innerHTML = `<form class="form" novalidate><div class="dims"><label>感應扣<select name="fob">${lostable.map(f => `<option value="${f.no}">${f.no} 號${f.unit ? '（' + esc(f.unit) + '）' : ''}</option>`).join('')}</select></label>
          <label>狀況<select name="status"><option>遺失</option><option value="損壞停用">損壞</option></select></label></div>
        <label>說明（選填）<input name="note" maxlength="100"></label>
        <p class="muted small">依辦法照原價賠償；系統只記錄借用戶與金額，不會自動計入清潔費。</p>
        <p class="alert" hidden></p><button class="btn block" type="submit">登記</button></form>`;
      const f2 = b.querySelector('form'), btn = f2.querySelector('button');
      f2.onsubmit = e => { e.preventDefault(); ui.confirmTwice(btn, async () => {
        const no = Number(f2.elements.fob.value), body = {fob:no, status:f2.elements.status.value};
        if(f2.elements.note.value.trim()) body.note = f2.elements.note.value.trim();
        const r2 = await ui.run('gym.fobLost', body, {form:f2, box:f2.querySelector('.alert'), button:btn});
        if(r2.ok){ const x = r2.data; ui.toast(`${no} 號已記${x.status}${x.unit ? '（' + x.unit + '）' : ''}・${x.price != null ? '賠償 ' + x.price + ' 元' : '賠償金額待管委會填入'}`); changed(); duty(el, ui); }
      }); };
    });
    el.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
      const no = Number(b.closest('[data-fob]').dataset.fob);
      const r2 = await ui.run('gym.fobRestore', {fob:no}, {button:b});
      if(r2.ok){ ui.toast(`${no} 號已恢復使用`); duty(el, ui); }
    });
  }

  /* ---------- 管理員：夜間預約名單、投遞、代登記 ---------- */
  async function nightDesk(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.today'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, nightSlots = d.slots.filter(s => s.night);
    const free = d.fobs.filter(f => f.status === '在管理中心');
    const fobSel = `<select name="fob" aria-label="感應扣">${free.map(f => `<option value="${f.no}">${f.no} 號</option>`).join('')}</select>`;
    const days = [...Array(8)].map((_, i) => ui.today(i));
    el.innerHTML = `<h3>今日待投遞 <span class="small muted">18:00 下班前投入信箱</span></h3>
      ${d.toDeliver.length ? `<ul class="list">${d.toDeliver.map(x => `<li class="item" data-id="${esc(x.id)}"><div class="row"><b>${esc(x.unit)}・${esc(x.slot)}</b><span class="small">${x.people} 人</span></div>
          ${free.length ? `<form class="inline">${fobSel}<button class="btn small primary">投遞</button></form>` : '<div class="small">沒有在管理中心的感應扣</div>'}
          <button class="btn small ghost" data-cx>取消預約</button></li>`).join('')}</ul>` : '<p class="muted">今天沒有夜間預約。</p>'}
      <form class="form g-bk" novalidate><h4>代登記夜間預約 <span class="small muted">09:00–18:00 受理</span></h4>
        <div class="dims"><label>戶號<input name="unit" required autocapitalize="characters" placeholder="5B"></label>
          <label>人數<input name="people" type="number" inputmode="numeric" min="1" max="10" value="1"></label></div>
        <div class="dims"><label>日期<select name="date">${days.map((x, i) => `<option value="${x}">${md(x)}${i === 0 ? '（今天）' : ''}</option>`).join('')}</select></label>
          <label>時段<select name="slot">${nightSlots.map(s => `<option>${esc(s.label)}</option>`).join('')}</select></label></div>
        <p class="alert" hidden></p><button class="btn primary block">代登記預約</button></form><div class="g-out"></div>`;
    el.querySelectorAll('[data-id] form').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const r2 = await ui.run('gym.deliver', {id:f.closest('[data-id]').dataset.id, fob:Number(f.elements.fob.value)}, {button:f.querySelector('button')});
      if(r2.ok){ ui.toast(`已投遞 ${r2.data.fob} 號`); changed(); nightDesk(el, ui); }
    });
    el.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const r2 = await ui.run('gym.cancel', {id:b.closest('[data-id]').dataset.id}, {button:b});
      if(r2.ok){ ui.toast('已取消預約'); changed(); nightDesk(el, ui); }
    }));
    const f = el.querySelector('.g-bk');
    f.onsubmit = async e => {
      e.preventDefault();
      const body = {unit:f.elements.unit.value.trim().toUpperCase(), people:Number(f.elements.people.value), date:f.elements.date.value, slot:f.elements.slot.value};
      const r2 = await ui.run('gym.bookByStaff', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(!r2.ok) return;
      const x = r2.data; changed();
      await nightDesk(el, ui);
      el.querySelector('.g-out').innerHTML = `<p class="okbox">${esc(x.unit)} 已預約 ${md(x.date)} ${esc(x.slot)}・${x.people} 人。</p>${x.notice ? `<p class="warnbox">${esc(x.notice)}</p>` : ''}`;
    };
  }

  /* ---------- 管理員：報修處理與器材狀態 ---------- */
  async function repairs(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const [rp, eq] = await Promise.all([ui.run('gym.reports'), ui.run('gym.equipment')]);
    if(!rp.ok || !eq.ok){ el.innerHTML = ''; return; }
    const open = rp.data.reports.filter(x => x.status === '待處理' || x.status === '處理中'), done = rp.data.reports.filter(x => !open.includes(x));
    const card = x => `<li class="item" data-id="${esc(x.id)}"><div class="row"><b>${esc(x.equipmentName)}</b><span class="tag-s ${repTone(x.status)}">${esc(x.status)}</span></div>
        <div class="small">${esc(x.text)}</div><div class="small muted">${esc(x.id)}・${esc(x.unit || '')}・${esc(x.reportedAt)}${x.hasPhoto ? '・有照片（管委會 Drive）' : ''}</div>
        ${x.note ? `<div class="small">處理說明：${esc(x.note)}</div>` : ''}
        <form class="inline"><select name="status" aria-label="處理狀態">${opts(REP_STATUS, x.status)}</select><input name="note" placeholder="處理說明" aria-label="處理說明" value="${esc(x.note)}"><button class="btn small">更新</button></form></li>`;
    el.innerHTML = `<h3>器材狀態</h3><ul class="list">${eq.data.equipment.map(x => `<li class="item" data-eq="${esc(x.id)}"><div class="row"><b>${esc(x.name)}</b><span class="tag-s ${eqTone(x.status)}">${esc(x.status)}</span></div>
        <form class="inline"><select name="status" aria-label="器材狀態">${opts(EQ_STATUS, x.status)}</select><input name="note" placeholder="說明，例如 已叫修" aria-label="狀態說明" value="${esc(x.note)}"><button class="btn small">更新</button></form></li>`).join('')}</ul>
      <p class="muted small">器材改成維修中或停用，3D 健身房的跑步機會掛黃色警示牌。</p>
      <h3>未完成報修（${open.length}）</h3>${open.length ? `<ul class="list">${open.map(card).join('')}</ul>` : '<p class="okbox">沒有未完成的報修。</p>'}
      ${done.length ? '<div class="g-done"></div>' : ''}<div class="g-new"></div>`;
    el.querySelectorAll('[data-eq] form').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const r2 = await ui.run('gym.equipSet', {id:f.closest('[data-eq]').dataset.eq, status:f.elements.status.value, note:f.elements.note.value.trim()}, {button:f.querySelector('button')});
      if(r2.ok){ ui.toast('器材狀態已更新'); changed(); repairs(el, ui); }
    });
    const bindRep = root => root.querySelectorAll('[data-id] form').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const r2 = await ui.run('gym.reportSet', {id:f.closest('[data-id]').dataset.id, status:f.elements.status.value, note:f.elements.note.value.trim()}, {button:f.querySelector('button')});
      if(r2.ok){ ui.toast(`${r2.data.id} 已改為${r2.data.status}`); repairs(el, ui); }
    });
    bindRep(el);
    if(done.length) ui.fold(el.querySelector('.g-done'), `已結案報修（${done.length}）`, b => { b.innerHTML = `<ul class="list">${done.map(card).join('')}</ul>`; bindRep(b); });
    ui.fold(el.querySelector('.g-new'), '代住戶報修', b => reportForm(b, ui, () => repairs(el, ui)));
  }

  /* ---------- 管委會：使用紀錄（修正、匯出） ---------- */
  async function records(el, ui, month){
    const {esc} = ui;
    month = month || ui.month();
    el.innerHTML = `<form class="inline g-m"><input type="month" name="m" value="${esc(month)}" aria-label="月份"><button class="btn small">查詢</button></form><div class="g-list"></div>`;
    el.querySelector('.g-m').onsubmit = e => { e.preventDefault(); records(el, ui, e.target.elements.m.value); };
    const out = el.querySelector('.g-list'); ui.loading(out);
    const r = await ui.run('gym.records', {month}); if(!r.ok){ out.innerHTML = ''; return; }
    const xs = r.data.records;
    out.innerHTML = `<div class="row"><span class="muted small">共 ${xs.length} 筆（系統保留最新 ${r.data.keep} 筆${r.data.prunedBefore ? `，${esc(r.data.prunedBefore)} 以前已部分清除` : ''}）</span>
        ${xs.length ? '<button class="btn small" id="csv">匯出 CSV</button>' : ''}</div>
      ${xs.length ? `<ul class="list">${xs.map(x => `<li class="item" data-id="${esc(x.id)}"><div class="row"><b>${esc(x.unit)}・${md(x.date)} ${esc(x.slot)}</b><span class="tag-s ${regTone(x.status)}">${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.id)}・${esc(x.dn)}・${x.people} 人・免費 ${x.free}・計費 ${x.billed}・${x.fee} 元${x.fob ? `・${x.fob} 號` : ''}</div>
          ${x.fixWhy ? `<div class="small">修正原因：${esc(x.fixWhy)}</div>` : ''}
          <button class="btn small" data-fix>修正</button><div class="g-fix"></div></li>`).join('')}</ul>` : '<p class="muted">這個月沒有紀錄。</p>'}`;
    const csv = out.querySelector('#csv');
    if(csv) csv.onclick = () => ui.csv(`健身房使用紀錄_${month}.csv`, [['登記編號','戶號','日期','時段','日夜','人數','免費','計費','清潔費','感應扣','狀態','修正原因']]
      .concat(xs.map(x => [x.id, x.unit, x.date, x.slot, x.dn, x.people, x.free, x.billed, x.fee, x.fob == null ? '' : x.fob, x.status, x.fixWhy])));
    out.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
      const li = b.closest('[data-id]'), x = xs.find(v => v.id === li.dataset.id), box = li.querySelector('.g-fix');
      box.innerHTML = `<form class="form" novalidate><div class="dims"><label>人數<input name="people" type="number" inputmode="numeric" min="1" max="10" value="${x.people}"></label>
          <label>狀態<select name="status">${opts(REG_STATUS, x.status)}</select></label></div>
        <label>修正原因（必填）<input name="reason" required placeholder="例：誤登人數"></label>
        <p class="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit">儲存修正</button><button class="btn ghost" type="button" data-x>取消</button></div></form>`;
      const f = box.querySelector('form');
      f.querySelector('[data-x]').onclick = () => { box.innerHTML = ''; };
      f.onsubmit = async e => {
        e.preventDefault();
        const reason = f.elements.reason.value.trim();
        if(!reason){ f.elements.reason.setAttribute('aria-invalid','true'); f.elements.reason.focus(); return; }
        const body = {id:x.id, reason};
        if(Number(f.elements.people.value) !== x.people) body.people = Number(f.elements.people.value);
        if(f.elements.status.value !== x.status) body.status = f.elements.status.value;
        const r2 = await ui.run('gym.fix', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
        if(r2.ok){ ui.toast('已修正，該週額度已重新計算'); changed(); records(el, ui, month); }
      };
    });
  }

  /* ---------- 管委會：清潔費月結 ---------- */
  async function fees(el, ui, month){
    const {esc} = ui;
    month = month || ui.month(-1);
    el.innerHTML = `<form class="inline g-m"><input type="month" name="m" value="${esc(month)}" aria-label="月份"><button class="btn small">查詢</button></form><div class="g-fee"></div>`;
    el.querySelector('.g-m').onsubmit = e => { e.preventDefault(); fees(el, ui, e.target.elements.m.value); };
    const out = el.querySelector('.g-fee'); ui.loading(out);
    const r = await ui.run('gym.fees', {month}); if(!r.ok){ out.innerHTML = ''; return; }
    const d = r.data, ended = d.month < ui.month();
    out.innerHTML = `<p class="${d.closed ? 'okbox' : 'hintbox'}">${esc(d.month)}：${d.closed ? `已月結（${esc(d.closedAt)}）` : '尚未月結，以下為即時試算'}・${d.rows.length} 戶、${d.total.count} 人次、合計 ${ui.money(d.total.amount)}</p>
      ${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>戶號</th><th class="num">計費人次</th><th class="num">清潔費</th><th>明細</th></tr></thead><tbody>
        ${d.rows.map(x => `<tr><td>${esc(x.unit)}</td><td class="num">${x.count}</td><td class="num">${ui.money(x.amount)}</td><td class="small muted">${x.items.map(i => `${md(i.date)}×${i.count}`).join('、')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="muted small">清潔費在管理費帳單上個別列出、與管理費一起收；健身房島不記繳費狀態。</p>
      <div class="btnrow">${ended ? `<button class="btn" id="close">${d.closed ? '重新月結' : '執行月結'}</button>` : ''}${d.rows.length ? '<button class="btn small" id="csv">匯出 CSV</button>' : ''}</div>`;
    const c = out.querySelector('#close');
    if(c) c.onclick = () => ui.confirmTwice(c, async () => {
      const r2 = await ui.run('gym.feesClose', {month:d.month}, {button:c});
      if(r2.ok){ ui.toast(`${r2.data.month} 已月結：${r2.data.units} 戶、${ui.money(r2.data.amount)}`); fees(el, ui, d.month); }
    });
    const x = out.querySelector('#csv');
    if(x) x.onclick = () => ui.csv(`健身房清潔費_${d.month}.csv`, [['月份','戶號','計費人次','清潔費','明細']].concat(d.rows.map(v => [d.month, v.unit, v.count, v.amount, v.items.map(i => i.date + ':' + i.count).join(',')])));
  }

  /* ---------- 管委會：暫停使用（停權） ---------- */
  async function suspensions(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.suspensions'); if(!r.ok){ el.innerHTML = ''; return; }
    const xs = r.data.suspensions;
    el.innerHTML = `<p class="muted small">依辦法第七條，經勸導不聽者由管委會決定暫停天數；系統不會自動停權。</p>
      ${xs.length ? `<ul class="list">${xs.map(x => `<li class="item" data-id="${esc(x.id)}"><div class="row"><b>${esc(x.unit)}・${md(x.from)}～${md(x.to)}</b><span class="tag-s ${x.status === '有效' ? 'bad' : ''}">${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.reason)}</div>${x.status === '有效' ? '<button class="btn small" data-end>提前結束</button>' : ''}</li>`).join('')}</ul>` : '<p class="muted">沒有暫停使用的紀錄。</p>'}
      <form class="form" novalidate><h4>新增暫停使用</h4>
        <label>戶號<input name="unit" required autocapitalize="characters"></label>
        <label>開始<input name="from" type="date" value="${ui.today()}" required></label><label>結束<input name="to" type="date" required></label>
        <label>原因<input name="reason" required placeholder="例：勸導不聽（辦法第七條）"></label>
        <p class="alert" hidden></p><button class="btn primary">新增</button></form>`;
    el.querySelectorAll('[data-end]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const r2 = await ui.run('gym.unsuspend', {id:b.closest('[data-id]').dataset.id}, {button:b});
      if(r2.ok){ ui.toast('已結束暫停'); suspensions(el, ui); }
    }));
    const f = el.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => f.elements[n].value.trim();
      const r2 = await ui.run('gym.suspend', {unit:g('unit').toUpperCase(), from:g('from'), to:g('to'), reason:g('reason')}, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(r2.ok){ ui.toast(`已新增 ${r2.data.id}`); suspensions(el, ui); }
    };
  }

  /* ---------- 管委會：關閉時段 ---------- */
  async function closures(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.closures'); if(!r.ok){ el.innerHTML = ''; return; }
    const xs = r.data.closures;
    const dt = v => String(v || '').replace('T', ' ');
    el.innerHTML = `${xs.length ? `<ul class="list">${xs.map(x => `<li class="item" data-id="${esc(x.id)}"><div class="row"><b>${esc(x.from)}～${esc(x.to.slice(-5))}</b><span class="tag-s ${x.status === '有效' ? 'warn' : ''}">${esc(x.category)}・${esc(x.status)}</span></div>
          <div class="small muted">${esc(x.text)}</div>${x.status === '有效' ? '<button class="btn small" data-end>取消這個時段</button>' : ''}</li>`).join('')}</ul>` : '<p class="muted">沒有關閉時段。</p>'}
      <form class="form" novalidate><h4>新增關閉時段</h4>
        <label>開始<input name="from" type="datetime-local" required></label>
        <label>結束<input name="to" type="datetime-local" required></label>
        <label>原因類別<select name="category">${opts(CLOSE_CATS)}</select></label>
        <label>公開說明（3D 與公告會顯示）<input name="text" required maxlength="100" placeholder="例：器材年度保養"></label>
        <p class="alert" hidden></p><button class="btn primary">新增</button><pre class="announce" hidden></pre></form>`;
    el.querySelectorAll('[data-end]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const r2 = await ui.run('gym.closeEnd', {id:b.closest('[data-id]').dataset.id}, {button:b});
      if(r2.ok){ ui.toast('已取消關閉時段'); changed(); closures(el, ui); }
    }));
    const f = el.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const body = {from:dt(f.elements.from.value), to:dt(f.elements.to.value), category:f.elements.category.value, text:f.elements.text.value.trim()};
      const r2 = await ui.run('gym.close', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(!r2.ok) return;
      changed();
      // 公告範本（規格第 7 節）：給管委會貼到公告島與住戶群組
      const text = `【健身房】${md(body.from.slice(0,10))} ${body.from.slice(11)}–${body.to.slice(11)} 因${body.category}暫停開放，造成不便敬請見諒。`;
      await closures(el, ui);
      el.insertAdjacentHTML('beforeend', `<p class="okbox">已新增關閉時段。可複製下面的公告文字：</p><pre class="announce">${esc(text)}</pre><button class="btn primary block" id="cp">複製公告</button>`);
      el.querySelector('#cp').onclick = () => ui.copy(text, el.querySelector('pre.announce:not([hidden])'));
    };
  }

  /* ---------- 管委會：器材清單 ---------- */
  async function equipAdmin(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('gym.equipment'); if(!r.ok){ el.innerHTML = ''; return; }
    el.innerHTML = `<ul class="list">${r.data.equipment.map(x => `<li class="item"><div class="row"><span class="small muted">${esc(x.id)}</span><span class="tag-s ${eqTone(x.status)}">${esc(x.status)}</span></div>
        <form class="inline" data-id="${esc(x.id)}"><input name="name" value="${esc(x.name)}" aria-label="器材名稱"><button class="btn small">改名</button></form></li>`).join('')}</ul>
      <form class="inline" data-new><input name="name" placeholder="新器材名稱" aria-label="新器材名稱"><button class="btn small">新增</button></form>`;
    el.querySelectorAll('form').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const body = {name:f.elements.name.value.trim()}; if(f.dataset.id) body.id = f.dataset.id;
      if(!body.name){ f.elements.name.setAttribute('aria-invalid','true'); return; }
      const r2 = await ui.run('gym.equipSave', body, {button:f.querySelector('button')});
      if(r2.ok){ ui.toast(`已儲存 ${r2.data.id}`); equipAdmin(el, ui); }
    });
  }

  function render(el, ui, d, opt = {}){
    el.innerHTML = '<section class="gym-pub"></section><div class="gym-main"></div><section class="gym-rules"></section>';
    publicBox(el.querySelector('.gym-pub'), ui);
    if(window.Rules) Rules.render(el.querySelector('.gym-rules'), Rules.of('gym'), {heading:'使用管理辦法'});
    const main = el.querySelector('.gym-main');
    if(!Auth.loggedIn()){
      main.innerHTML = `<p class="muted">住戶登入後可查看本戶本週剩餘免費人次、本月清潔費與報修進度。</p><button class="btn primary block">登入</button>`;
      main.querySelector('button').onclick = () => ui.showLogin();
      return;
    }
    const tabs = [], u = Auth.user() || {};
    if(Auth.can('gym:resident') && u.unit){
      tabs.push({key:'mine', label:'本戶', show:b => mine(b, ui)});
      if(!Auth.can('gym:guard')) tabs.push({key:'night', label:'夜間預約', show:b => night(b, ui)});
      if(!Auth.can('gym:guard')) tabs.push({key:'report', label:'報修', show:b => residentReport(b, ui)});
    }
    if(Auth.can('gym:guard')){
      tabs.push({key:'duty', label:'值勤', show:b => duty(b, ui)});
      tabs.push({key:'nightdesk', label:'夜間', show:b => nightDesk(b, ui)});
      tabs.push({key:'repair', label:'報修', show:b => repairs(b, ui)});
    }
    if(Auth.can('gym:admin')) tabs.push({key:'admin', label:'管理', show:b => {
      ui.fold(b, '使用紀錄（修正、匯出）', x => records(x, ui), true);
      ui.fold(b, '清潔費月結', x => fees(x, ui));
      ui.fold(b, '暫停使用', x => suspensions(x, ui));
      ui.fold(b, '關閉時段', x => closures(x, ui));
      ui.fold(b, '器材清單', x => equipAdmin(x, ui));
      ui.fold(b, '健身房參數', x => ui.params(x, 'gym'));
    }});
    if(!tabs.length){ main.innerHTML = ''; return; }
    if(tabs.length === 1) tabs[0].show(main);
    else ui.tabs(main, tabs, opt.tab || (Auth.can('gym:guard') && !Auth.can('gym:admin') ? 'duty' : tabs[0].key));
  }

  window.Panels = window.Panels || {};
  window.Panels.gym = {render};
})();
