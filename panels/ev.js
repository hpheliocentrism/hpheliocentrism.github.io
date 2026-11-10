/* =========================================================
   網站/panels/ev.js — 充電車位島面板（整合維護）
   規格：claude/community-core/API.md 第 5.3 節（v2.8.0）
   公開：已啟用戶數（ev.stats）與辦法
   住戶（ev:resident）：本戶申裝進度、近 12 期電費分攤（ev.mine）
   代理住戶（ev:agent）：抄表試算（ev.devices → ev.calc）、公告、更正
   管委會（ev:admin）：待辦、申裝（登錄、審核、保證金、狀態、驗收啟用）、代理住戶、參數
   代理住戶看得到各戶戶號、車位、度數（計算分攤需要），看不到電話與 Email。
   ========================================================= */
(function(){
  const DOCS = ['附件一申請暨切結書','廠商執照與電工證照','施工規劃圖與材料規格表'];
  const SPECS = ['CNS＋VPC','產品責任險','漏電保護','OCPP 1.6J 以上','≤AC 7 kW 32A'];
  const ACCEPT = ['台電竣工報驗合格證明','完工照片','附件三確認書'];
  const tone = s => s === '已啟用' ? 'ok' : (s === '不核准' || s === '停權' || s === '已拆除') ? 'bad' : 'warn';
  const checks = (name, all, have) => `<div class="btnrow">${all.map(x => `<label class="small"><input type="checkbox" name="${name}" value="${x}"${(have || []).includes(x) ? ' checked' : ''}> ${x}</label>`).join('')}</div>`;
  const picked = (f, name) => [...f.querySelectorAll(`[name="${name}"]:checked`)].map(x => x.value);

  async function publicBox(el, ui){
    const r = await API.stats('ev.stats'); if(!r.ok) return;
    const d = r.data;
    el.innerHTML = `<div class="statgrid"><div class="stat"><b>已啟用</b><strong>${d.installed}</strong><span>戶</span></div>
      <div class="stat"><b>申請進行中</b><strong>${d.reviewing}</strong><span>件</span></div>
      <div class="stat"><b>階段</b><strong style="font-size:1.1rem">${d.phase === 'ems' ? 'EMS 評估' : '起步期'}</strong><span>&nbsp;</span></div></div>`;
  }

  /* ---------- 住戶 ---------- */
  async function mine(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('ev.mine'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data;
    const apps = d.applications.filter(a => a.status !== '已拆除' || d.applications.length === 1);
    el.innerHTML = `<h3>${esc(d.unit)} 的充電設備</h3>` + (apps.length ? `<ul class="list">${apps.map(a => `<li class="item">
        <div class="row"><b>${esc(a.spot)}・${esc(a.id)}</b><span class="tag-s ${tone(a.status)}">${esc(a.status)}</span></div>
        <div class="small muted">申請 ${esc(a.appliedAt)}・${esc(a.install)} ${a.power} kW・${esc(a.contractor)}</div>
        ${a.opinion ? `<div class="small">審核意見：${esc(a.opinion)}</div>` : ''}
        ${(a.docsMissing || []).length ? `<div class="small">待補文件：${a.docsMissing.map(esc).join('、')}</div>` : ''}
        ${a.status === '核准待繳保證金' ? `<div class="small">請繳施工保證金後通知管委會登記。</div>` : ''}
        ${a.status === '待驗收' && (a.acceptMissing || []).length ? `<div class="small">驗收待補：${a.acceptMissing.map(esc).join('、')}</div>` : ''}
        <div class="small muted">保證金：${esc(a.deposit.status)}${a.deposit.amount ? ' ' + ui.money(a.deposit.amount) : ''}${a.deposit.refunded ? '・已退 ' + ui.money(a.deposit.refunded) : ''}</div>
        ${a.status === '已啟用' ? `<div class="small muted">分表 ${esc(a.meter)}・${esc(a.activatedAt)} 啟用</div>` : ''}</li>`).join('')}</ul>`
      : `<p class="muted">本戶沒有充電設備申請。要申裝請向管委會索取申請書（附件一），依辦法準備文件。</p>`);
    if(d.correcting.length) el.insertAdjacentHTML('beforeend', `<p class="warnbox">${d.correcting.map(c => esc(c.period || c)).join('、')} 期別更正中，金額以重新公告為準。</p>`);
    if(d.periods.length){
      el.insertAdjacentHTML('beforeend', `<h3>電費分攤</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>期別</th><th class="num">度數</th><th class="num">電費</th><th class="num">差額分攤</th><th class="num">應繳</th><th class="num">準備金</th></tr></thead><tbody>
        ${d.periods.map(p => p.rows.map(x => `<tr><td>${esc(p.bill.period)}<div class="small muted">每度 ${p.bill.price} 元・${esc(p.bill.userDue)} 前交代理住戶</div></td>
          <td class="num">${x.usage}</td><td class="num">${ui.money(x.fee)}</td><td class="num">${ui.money(x.share)}</td><td class="num"><b>${ui.money(x.pay)}</b></td>
          <td class="num">${d.reserveOn ? ui.money(x.reserve) : '<span class="muted">尚未啟用</span>'}</td></tr>`).join('')).join('')}</tbody></table></div>
        <p class="muted small">電費交給代理住戶；充電準備金${d.reserveOn ? '併入下期管理費' : '尚未啟用'}。</p>`);
    }
  }

  /* ---------- 代理住戶：抄表試算 ---------- */
  async function calc(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const [dv, ps] = await Promise.all([ui.run('ev.devices'), ui.run('ev.periods')]);
    if(!dv.ok){ el.innerHTML = ''; return; }
    const draft = ps.ok ? ps.data.periods.find(p => p.status === '草稿') : null;
    const v = draft || {};
    el.innerHTML = `<form class="form" novalidate>
        ${draft ? `<p class="hintbox">接續草稿 ${esc(draft.period)}，重新送出會覆蓋。</p>` : ''}
        <label>期別名稱<input name="period" value="${esc(v.period || '')}" placeholder="例：2026-11～12" required></label>
        <div class="dims"><label>帳單起<input name="from" type="date" value="${esc(v.from || '')}"></label><label>帳單迄<input name="to" type="date" value="${esc(v.to || '')}"></label></div>
        <div class="dims"><label>帳單金額（元）<input name="total" type="number" inputmode="numeric" value="${v.total == null ? '' : v.total}" required></label>
          <label>總度數<input name="kwh" type="number" inputmode="decimal" step="0.1" value="${v.kwh == null ? '' : v.kwh}" required></label></div>
        <div class="dims"><label>台電繳費期限<input name="taipowerDue" type="date" value="${esc(v.taipowerDue || '')}" required></label>
          <label>住戶繳費期限（選填）<input name="userDue" type="date" value="${esc(v.userDue || '')}"></label></div>
        <label>遲繳費（選填）<input name="late" type="number" inputmode="numeric" value="${v.late || ''}"></label>
        <h4>各戶分表度數</h4>
        ${dv.data.devices.map(x => `<div class="item"><div class="row"><b>${esc(x.unit)}・${esc(x.spot)}</b><span class="small muted">分表 ${esc(x.meter)}・上期 ${x.prev}${x.status !== '已啟用' ? '・' + esc(x.status) : ''}</span></div>
          <div class="dims" data-app="${esc(x.id)}"><label>本期度數<input name="reading" type="number" inputmode="decimal" step="0.1"></label><label>說明（換表、異常）<input name="note"></label></div></div>`).join('') || '<p class="muted">目前沒有已啟用的設備。</p>'}
        <p class="alert" hidden></p><button class="btn primary block">試算並存草稿</button></form><div class="ev-out"></div>`;
    const f = el.querySelector('form'), out = el.querySelector('.ev-out');
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => f.elements[n].value.trim();
      const body = {period:g('period'), from:g('from'), to:g('to'), total:Number(g('total')), kwh:Number(g('kwh')), taipowerDue:g('taipowerDue')};
      if(g('userDue')) body.userDue = g('userDue'); if(g('late')) body.late = Number(g('late'));
      body.readings = [...f.querySelectorAll('[data-app]')].map(div => {
        const rd = div.querySelector('[name=reading]').value, note = div.querySelector('[name=note]').value.trim();
        return rd === '' ? null : Object.assign({app:div.dataset.app, reading:Number(rd)}, note ? {note} : {});
      }).filter(Boolean);
      const r = await ui.run('ev.calc', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(!r.ok) return;
      const d = r.data;
      out.innerHTML = `<p class="muted">每度 ${d.price} 元・差額 ${ui.money(d.diff)}</p>
        <table class="tbl"><thead><tr><th>戶</th><th class="num">度數</th><th class="num">電費</th><th class="num">分攤</th><th class="num">應繳</th></tr></thead><tbody>${d.rows.map(x =>
          `<tr><td>${esc(x.unit)}</td><td class="num">${x.usage}</td><td class="num">${x.fee}</td><td class="num">${x.share}</td><td class="num"><b>${x.pay}</b></td></tr>`).join('')}</tbody></table>
        ${d.missing.length ? `<p class="warnbox">還沒填度數：${d.missing.map(m => esc(m.unit || m)).join('、')}，填齊才能公告。</p>` : ''}
        <pre class="announce">${esc(d.text)}</pre>
        ${d.canPublish ? `<button class="btn primary block" id="pub">公告這一期</button>` : ''}`;
      const pub = out.querySelector('#pub');
      if(pub) pub.onclick = () => ui.confirmTwice(pub, async () => {
        const res = await ui.run('ev.publish', {period:d.period}, {button:pub});
        if(res.ok){ const pre = out.querySelector('.announce'); pre.textContent = res.data.text + (res.data.correctionText ? '\n' + res.data.correctionText : ''); ui.copy(pre.textContent, pre); pub.remove(); }
      });
    };
  }
  async function periods(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('ev.periods'); if(!r.ok){ el.innerHTML = ''; return; }
    const ps = r.data.periods;
    el.innerHTML = ps.length ? `<ul class="list">${ps.map((p, i) => `<li class="item"><div class="row"><b>${esc(p.period)}</b><span class="tag-s ${p.status === '已公告' ? 'ok' : 'warn'}">${esc(p.status)}</span></div>
        <div class="small muted">${ui.money(p.total)}／${p.kwh} 度・每度 ${p.price}${p.publishedAt ? '・公告 ' + esc(p.publishedAt) : ''}${p.reserveMonth ? '・準備金計入 ' + esc(p.reserveMonth) : ''}</div>
        ${i === 0 && p.status === '已公告' ? `<form class="inline" data-p="${esc(p.period)}"><input name="reason" placeholder="更正原因" aria-label="更正原因"><button class="btn small">更正</button></form>` : ''}</li>`).join('')}</ul>
        <p class="muted small">只能更正最新一期；更正後回到草稿，到「抄表試算」重新送出再公告。</p>` : `<p class="muted">還沒有期別。</p>`;
    el.querySelectorAll('form[data-p]').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      if(!f.reason.value.trim()){ f.reason.setAttribute('aria-invalid','true'); return; }
      const res = await ui.run('ev.correct', {period:f.dataset.p, reason:f.reason.value.trim()}, {button:f.querySelector('button')});
      if(res.ok){ ui.toast(res.data.message); periods(el, ui); }
    });
  }

  /* ---------- 管委會 ---------- */
  async function todo(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('ev.todo'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, lst = (t, xs) => xs.length ? `<h4>${t}（${xs.length}）</h4><ul class="list">${xs.map(a => `<li class="item">${esc(a.unit)}・${esc(a.spot || '')}・${esc(a.id)}</li>`).join('')}</ul>` : '';
    el.innerHTML = d.notices.map(n => `<p class="warnbox">${esc(n)}</p>`).join('') + `<p class="muted">已啟用 ${d.active} 戶${d.ems ? '・已達 EMS 評估門檻' : ''}</p>`
      + lst('待審核', d.review) + lst('待繳保證金', d.waitDeposit) + lst('施工中', d.building) + lst('待驗收', d.waitAccept)
      + (d.review.length + d.waitDeposit.length + d.building.length + d.waitAccept.length ? '' : '<p class="okbox">目前沒有待處理的申請。</p>');
  }
  async function apps(el, ui){
    const {esc} = ui;
    el.innerHTML = `<button class="btn primary block" id="new">＋ 依紙本申請書登錄</button><div class="ev-form"></div><div class="ev-list"></div>`;
    const form = el.querySelector('.ev-form'), out = el.querySelector('.ev-list');
    el.querySelector('#new').onclick = () => editApp(form, ui, null, load);
    const load = async () => {
      ui.loading(out);
      const r = await ui.run('ev.list'); if(!r.ok){ out.innerHTML = ''; return; }
      const xs = r.data.applications;
      out.innerHTML = xs.length ? `<ul class="list">${xs.map(a => `<li class="item" data-id="${esc(a.id)}">
          <div class="row"><b>${esc(a.unit)}・${esc(a.spot)}・${esc(a.id)}</b><span class="tag-s ${tone(a.status)}">${esc(a.status)}</span></div>
          <div class="small muted">申請 ${esc(a.appliedAt)}・${esc(a.contractor)}・保證金 ${esc(a.deposit.status)}${a.meter ? '・分表 ' + esc(a.meter) : ''}</div>
          ${a.opinion ? `<div class="small">意見：${esc(a.opinion)}</div>` : ''}
          <div class="btnrow">${actions(a).map(([k, t]) => `<button class="btn small" data-act="${k}">${t}</button>`).join('')}</div><div class="act-box"></div></li>`).join('')}</ul>` : `<p class="muted">還沒有申請。</p>`;
      out.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
        const li = b.closest('[data-id]'), a = xs.find(x => x.id === li.dataset.id);
        act(li.querySelector('.act-box'), ui, a, b.dataset.act, load);
      });
    };
    load();
  }
  const actions = a => {
    const s = a.status, o = [['edit','修改']];
    if(s === '審核中' || s === '補件') o.push(['review','審核']);
    if(s === '核准待繳保證金') o.push(['dep收','收保證金']);
    if(s === '施工中') o.push(['施工完成','施工完成']);
    if(s === '待驗收') o.push(['complete','驗收啟用']);
    if(s === '已啟用') o.push(['停權','停權'], ['拆除','拆除'], ['過戶','過戶']);
    if(s === '停權') o.push(['復電','復電'], ['拆除','拆除']);
    if(a.deposit.status === '已收') o.push(['dep扣抵','扣抵保證金'], ['dep退','退保證金']);
    return o;
  };
  function act(box, ui, a, k, done){
    const {esc} = ui;
    const finish = async (action, body, btn, msg) => { const r = await ui.run(action, body, {button:btn}); if(r.ok){ ui.toast(msg(r.data)); API.invalidateStats('ev.stats'); done(); } };
    if(k === 'edit') return editApp(box, ui, a, done);
    if(k === 'review'){
      box.innerHTML = `<form class="form" novalidate><label>結果<select name="result"><option>核准</option><option>補件</option><option>不核准</option></select></label>
        <label>意見（補件、不核准必填）<input name="opinion"></label><button class="btn primary">送出</button></form>`;
      const f = box.querySelector('form');
      f.onsubmit = e => { e.preventDefault(); finish('ev.review', {id:a.id, result:f.elements.result.value, opinion:f.elements.opinion.value.trim()}, f.querySelector('button'), d => d.message || `${a.id}：${d.status}`); };
      return;
    }
    if(k.startsWith('dep')){
      const op = k.slice(3);
      box.innerHTML = `<form class="form" novalidate><div class="dims"><label>日期<input name="date" type="date" value="${ui.today()}"></label><label>金額（留白＝預設）<input name="amount" type="number" inputmode="numeric"></label></div>
        ${op === '扣抵' ? '<label>扣抵原因<input name="reason" required></label>' : ''}<button class="btn primary">${op}保證金</button></form>`;
      const f = box.querySelector('form');
      f.onsubmit = e => { e.preventDefault(); const b = {id:a.id, op, date:f.elements.date.value};
        if(f.elements.amount.value) b.amount = Number(f.elements.amount.value); if(f.elements.reason) b.reason = f.elements.reason.value.trim();
        finish('ev.deposit', b, f.querySelector('button'), d => `保證金${d.deposit.status}・${d.status}`); };
      return;
    }
    if(k === 'complete'){
      box.innerHTML = `<form class="form" novalidate><fieldset><legend>驗收文件</legend>${checks('acceptDocs', ACCEPT, a.acceptDocs)}</fieldset>
        <div class="dims"><label>分表編號<input name="meter" required></label><label>起始度數<input name="startReading" type="number" step="0.1" inputmode="decimal" required></label></div>
        <label>啟用日<input name="activatedAt" type="date" value="${ui.today()}"></label><p class="alert" hidden></p><button class="btn primary">驗收啟用</button></form>`;
      const f = box.querySelector('form');
      f.onsubmit = async e => { e.preventDefault();
        const r = await ui.run('ev.complete', {id:a.id, acceptDocs:picked(f, 'acceptDocs'), meter:f.elements.meter.value.trim(), startReading:Number(f.elements.startReading.value), activatedAt:f.elements.activatedAt.value},
          {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
        if(r.ok){ ui.toast(`已啟用，目前 ${r.data.installed} 戶${r.data.notice ? '・' + r.data.notice : ''}`); API.invalidateStats('ev.stats'); ui.pushStats(true); done(); } };
      return;
    }
    // ev.status：施工完成／停權／復電／拆除／過戶
    const need = {停權:['reason','noticeDate'], 拆除:['reason'], 過戶:['newUnit']}[k] || [];
    const label = {reason:'原因', noticeDate:'限期改善通知日', newUnit:'新戶號'};
    box.innerHTML = `<form class="form" novalidate>${need.map(n => `<label>${label[n]}<input name="${n}"${n === 'noticeDate' ? ' type="date"' : ''} required></label>`).join('')}
      <p class="alert" hidden></p><button class="btn primary">確認${esc(k)}</button></form>`;
    const f = box.querySelector('form');
    f.onsubmit = async e => { e.preventDefault();
      const b = {id:a.id, op:k}; need.forEach(n => b[n] = n === 'newUnit' ? f.elements[n].value.trim().toUpperCase() : f.elements[n].value.trim());
      const r = await ui.run('ev.status', b, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(r.ok){ ui.toast(`${a.id}：${r.data.status}`); API.invalidateStats('ev.stats'); done(); } };
  }
  function editApp(el, ui, a, done){
    const {esc} = ui, v = a || {install:'壁掛式', power:7};
    el.innerHTML = `<form class="form" novalidate><h4>${a ? '修改 ' + esc(a.id) : '登錄申請'}</h4>
      <div class="dims"><label>戶號<input name="unit" value="${esc(v.unit || '')}" required autocapitalize="characters"></label><label>車位<input name="spot" value="${esc(v.spot || '')}" required placeholder="B1-18"></label></div>
      <label>申請日<input name="appliedAt" type="date" value="${esc(v.appliedAt || ui.today())}" required></label>
      <fieldset><legend>申請文件</legend>${checks('docs', DOCS, v.docs)}</fieldset>
      <fieldset><legend>設備規格</legend>${checks('specs', SPECS, v.specs)}</fieldset>
      <div class="dims"><label>功率 kW<input name="power" type="number" step="0.1" value="${v.power}"></label><label>安裝方式<input name="install" value="${esc(v.install || '')}"></label></div>
      <label>施工廠商<input name="contractor" value="${esc(v.contractor || '')}"></label>
      <div class="dims"><label>預定施工起<input name="workFrom" type="date" value="${esc(v.workFrom || '')}"></label><label>迄<input name="workTo" type="date" value="${esc(v.workTo || '')}"></label></div>
      ${a ? '' : `<label class="check"><input type="checkbox" name="reject"> 直接登錄為「不核准」（例如重複申請）</label><label>不核准意見<input name="opinion"></label>`}
      <p class="alert" hidden></p><div class="btnrow"><button class="btn primary" type="submit">儲存</button><button class="btn ghost" type="button" id="cx">取消</button></div></form>`;
    const f = el.querySelector('form');
    f.querySelector('#cx').onclick = () => { el.innerHTML = ''; };
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => f.elements[n].value.trim();
      const body = {unit:g('unit').toUpperCase(), spot:g('spot'), appliedAt:g('appliedAt'), docs:picked(f, 'docs'), specs:picked(f, 'specs'),
        power:Number(g('power')), install:g('install'), contractor:g('contractor'), workFrom:g('workFrom'), workTo:g('workTo')};
      if(a) body.id = a.id;
      if(!a && f.elements.reject.checked){ body.status = '不核准'; body.opinion = g('opinion'); }
      const r = await ui.run('ev.save', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
      if(r.ok){ ui.toast(`已儲存 ${r.data.id}`); API.invalidateStats('ev.stats'); el.innerHTML = ''; done(); }
    };
  }
  async function agents(el, ui){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('ev.agents'); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data, isAgent = id => d.agents.some(x => x.id === id);
    const people = d.agents.concat(d.candidates.filter(c => !isAgent(c.id)));
    el.innerHTML = people.length ? `<ul class="list">${people.map(p => `<li class="item"><div class="row"><b>${esc(p.unit)}・${esc(p.name)}</b>
        <button class="btn small${isAgent(p.id) ? '' : ' primary'}" data-acc="${esc(p.id)}" data-on="${isAgent(p.id) ? '' : '1'}">${isAgent(p.id) ? '收回代理' : '設為代理住戶'}</button></div></li>`).join('')}</ul>
      <p class="muted small">代理住戶由使用戶推派，只能是有已啟用設備之戶的屋主或住戶；設定後對方下次操作即生效。</p>` : `<p class="muted">要先有已啟用設備的戶，才能設定代理住戶。</p>`;
    el.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => {
      const res = await ui.run('ev.agentSet', {account:b.dataset.acc, on:!!b.dataset.on}, {button:b});
      if(res.ok){ ui.toast('已更新'); agents(el, ui); }
    });
  }

  function render(el, ui, d, opt = {}){
    el.innerHTML = '<section class="ev-pub"></section><div class="ev-main"></div><section class="ev-rules"></section>';
    publicBox(el.querySelector('.ev-pub'), ui);
    if(window.Rules) Rules.render(el.querySelector('.ev-rules'), Rules.of('ev'), {heading:'規範'});
    const main = el.querySelector('.ev-main');
    if(!Auth.loggedIn()){
      main.innerHTML = `<p class="muted">住戶登入後可查看本戶申裝進度與電費分攤。</p><button class="btn primary block">登入</button>`;
      main.querySelector('button').onclick = () => ui.showLogin();
      return;
    }
    const tabs = [];
    if(Auth.can('ev:resident') && Auth.user().unit) tabs.push({key:'mine', label:'本戶', show:b => mine(b, ui)});
    if(Auth.can('ev:agent')){ tabs.push({key:'calc', label:'抄表試算', show:b => calc(b, ui)}); tabs.push({key:'periods', label:'期別', show:b => periods(b, ui)}); }
    if(Auth.can('ev:admin')) tabs.push({key:'admin', label:'管理', show:b => {
      ui.fold(b, '待辦', x => todo(x, ui), true);
      ui.fold(b, '申裝', x => apps(x, ui));
      ui.fold(b, '代理住戶', x => agents(x, ui));
      ui.fold(b, '充電參數', x => ui.params(x, 'ev'));
    }});
    if(!tabs.length){ main.innerHTML = ''; return; }
    if(tabs.length === 1) tabs[0].show(main); else ui.tabs(main, tabs, opt.tab || tabs[0].key);
  }

  window.Panels = window.Panels || {};
  window.Panels.ev = {render};
})();
