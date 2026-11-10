/* =========================================================
   網站/panels/fee.js — 管委會島「財務」分頁（整合維護）
   規格：claude/community-core/API.md 第 5.4 節（v2.8.0）、島嶼/admin/規格.md
   住戶（fee:resident）：本戶帳單（fee.mine）、收支公布（fee.reports／fee.report）
   管委會（fee:admin）：帳單總表、戶別／項目明細、管理費金額、收支登打、收支報告、應收參考、參數
   隱私：帳單金額不存 localStorage；收支不得出現戶號（後端會擋）。
   沒有免登入的 fee.*，3D 不顯示金額。
   ========================================================= */
window.FeePanel = (function(){
  const ST = {ok:'ok', '月結未完成':'warn', '尚未啟用':''};
  const amt = (ui, it) => it.status === '尚未啟用' ? '<span class="muted">尚未啟用</span>'
    : it.status === '月結未完成' ? '<span class="tag-s warn">月結未完成</span>' : ui.money(it.amount);
  const baseText = (ui, b) => b.state === 'pending' ? '<span class="tag-s warn">待提供</span>' : ui.money(b.amount);
  const monthPicker = (ui, m, label = '帳單月份') =>
    `<form class="inline mpick"><input type="month" name="m" value="${ui.esc(m)}" aria-label="${label}"><button class="btn small">查詢</button></form>`;
  const pickOn = (el, fn) => { const f = el.querySelector('.mpick'); if(f) f.onsubmit = e => { e.preventDefault(); fn(f.m.value); }; };

  function detailRows(ui, it){
    const {esc} = ui, d = it.detail || [];
    if(!d.length) return '';
    if(it.key === 'pkg') return d.map(x => `<div class="small muted">包裹 ${esc(x.package || x.id)}・${ui.money(x.amount)}</div>`).join('');
    if(it.key === 'gym') return d.map(x => `<div class="small muted">${esc(x.date)}・超額 ${x.count} 人次</div>`).join('');
    if(it.key === 'ev') return d.map(x => `<div class="small muted">${esc(x.period)}・${x.kwh} 度・${ui.money(x.amount)}${x.kind === '差額' ? '（更正差額）' : ''}</div>`).join('');
    return '';
  }

  /* ---------- 住戶：本戶帳單 ---------- */
  async function mine(el, ui, month){
    const {esc} = ui;
    month = month || ui.month(0);
    el.innerHTML = monthPicker(ui, month) + '<div class="fm-body"></div>';
    pickOn(el, m => mine(el, ui, m));
    const body = el.querySelector('.fm-body'); ui.loading(body);
    const r = await ui.run('fee.mine', {month}); if(!r.ok){ body.innerHTML = ''; return; }
    const d = r.data;
    body.innerHTML = `<h3>${esc(d.unit)}・${esc(d.month)} 帳單</h3>
      <table class="tbl"><tbody>
        <tr><td>管理費${d.base.effMonth ? `<div class="small muted">${esc(d.base.effMonth)} 起</div>` : ''}</td><td class="num">${baseText(ui, d.base)}</td></tr>
        ${d.items.map(it => `<tr><td>${esc(it.label)}<div class="small muted">${esc(it.month)} 產生</div>${detailRows(ui, it)}</td><td class="num">${amt(ui, it)}</td></tr>`).join('')}
        <tr><th>合計</th><th class="num">${ui.money(d.total)}</th></tr></tbody></table>
      ${d.complete ? '' : `<p class="warnbox">帳單尚未完整：${d.base.state === 'pending' ? '管理費金額待管委會提供；' : ''}標示「月結未完成」的項目還沒算進合計。</p>`}
      ${d.payTracking ? (d.paid ? `<p class="okbox">已繳（${esc(d.paidDate)}）${d.changed ? '・金額有變動，請洽管委會核對' : ''}</p>` : `<p class="muted">尚未登錄繳費</p>`) : ''}
      <p class="muted small">帳單月份＝當月管理費＋上個月產生的延伸費用。</p>`;
  }

  /* ---------- 收支公布（住戶與管委會共用顯示） ---------- */
  async function reports(el, ui, all){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('fee.reports', all ? {all:true} : {}); if(!r.ok){ el.innerHTML = ''; return; }
    const list = r.data.reports;
    if(!list.length){ el.innerHTML = `<p class="muted">目前還沒有公布的收支報告。</p>`; return; }
    el.innerHTML = `<ul class="list">${list.map(x => `<li><button class="item linkrow" data-id="${esc(x.id)}">
        <div class="row"><b>${esc(x.from)}～${esc(x.to)}</b><span class="tag-s ${x.status === '已公布' ? 'ok' : 'warn'}">${esc(x.status)}</span></div>
        <span class="small muted">收入 ${ui.money(x.income)}・支出 ${ui.money(x.expense)}・期末 ${ui.money(x.close)}</span></button></li>`).join('')}</ul><div class="rp-one"></div>`;
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => report(el.querySelector('.rp-one'), ui, b.dataset.id, all));
  }
  async function report(el, ui, id, admin){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('fee.report', {id}); if(!r.ok){ el.innerHTML = ''; return; }
    const p = r.data.report;
    const items = (title, xs) => `<h4>${title}</h4><table class="tbl"><tbody>${xs.map(x => `<tr><td>${esc(x.subject)}
        ${x.months.map(m => `<div class="small muted">${esc(m.month)}・${ui.money(m.amount)}${m.note ? '・' + esc(m.note) : ''}</div>`).join('')}</td>
        <td class="num">${ui.money(x.total)}</td></tr>`).join('')}</tbody></table>`;
    el.innerHTML = `<h3>${esc(p.from)}～${esc(p.to)} 收支報告</h3>
      ${(p.corrections || []).length ? `<p class="warnbox">更正紀錄：${p.corrections.map(c => esc(c.reason || c)).join('；')}</p>` : ''}
      <dl class="kv"><dt>期初結餘</dt><dd>${ui.money(p.open)}</dd><dt>收入</dt><dd>${ui.money(p.income)}</dd><dt>支出</dt><dd>${ui.money(p.expense)}</dd>
        <dt>期末結餘</dt><dd><b>${ui.money(p.close)}</b></dd>${p.fund != null ? `<dt>公共基金</dt><dd>${ui.money(p.fund)}</dd>` : ''}
        ${p.publishedAt ? `<dt>公布</dt><dd>${esc(p.publishedAt)}</dd>` : ''}</dl>
      ${items('收入', p.incomeItems || [])}${items('支出', p.expenseItems || [])}
      ${p.attach ? `<p><a href="${esc(p.attach)}" target="_blank" rel="noopener">附件（憑證影本）</a></p>` : ''}
      ${admin ? `<div class="btnrow">${p.status === '草稿' ? `<button class="btn primary" id="pub">公布</button>` : `<button class="btn" id="fix">更正（回到草稿）</button>`}</div>
        <form class="form" id="fixf" hidden novalidate><label>更正原因（會顯示在住戶頁）<input name="reason" required></label><p class="alert" hidden></p><button class="btn">確認更正</button></form>
        <pre class="announce" hidden></pre>` : ''}`;
    if(!admin) return;
    const pub = el.querySelector('#pub'), fix = el.querySelector('#fix'), ff = el.querySelector('#fixf'), pre = el.querySelector('.announce');
    if(pub) pub.onclick = () => ui.confirmTwice(pub, async () => {
      const res = await ui.run('fee.reportPublish', {id:p.id}, {button:pub});
      if(res.ok){ pre.textContent = res.data.text; pre.hidden = false; ui.copy(res.data.text, pre); }
    });
    if(fix) fix.onclick = () => { ff.hidden = false; };
    ff.onsubmit = async e => { e.preventDefault();
      const res = await ui.run('fee.reportCorrect', {id:p.id, reason:ff.reason.value.trim()}, {form:ff, box:ff.querySelector('.alert'), button:ff.querySelector('button')});
      if(res.ok){ ui.toast('已回到草稿，修改收支明細後再公布'); report(el, ui, p.id, true); }
    };
  }

  function resident(el, ui){
    if(!Auth.user().unit){ el.innerHTML = ''; ui.fold(el, '收支公布', b => reports(b, ui), true); return; }
    const top = document.createElement('div'); el.appendChild(top); mine(top, ui);
    ui.fold(el, '收支公布', b => reports(b, ui));
  }

  /* ---------- 管委會：帳單總表 ---------- */
  async function bill(el, ui, month, filter = {}){
    const {esc} = ui;
    month = month || ui.month(0);
    el.innerHTML = monthPicker(ui, month) + `<div class="btnrow"><label class="small"><input type="checkbox" name="ext"${filter.onlyExt ? ' checked' : ''}> 只看有延伸費用的戶</label></div><div class="fb-body"></div>`;
    pickOn(el, m => bill(el, ui, m, filter));
    el.querySelector('[name=ext]').onchange = e => bill(el, ui, month, Object.assign({}, filter, {onlyExt:e.target.checked}));
    const body = el.querySelector('.fb-body'); ui.loading(body);
    const r = await ui.run('fee.bill', Object.assign({month}, filter)); if(!r.ok){ body.innerHTML = ''; return; }
    const d = r.data, keys = d.footer.items;
    body.innerHTML = `${(d.notices || []).map((n, i) => `<p class="alert">${esc(n.text)} <button class="btn small" data-redo="${i}">重新月結</button></p>`).join('')}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>戶號</th><th class="num">管理費</th>${keys.map(k => `<th class="num">${esc(k.label)}</th>`).join('')}<th class="num">合計</th>${d.payTracking ? '<th>已繳</th>' : ''}</tr></thead>
      <tbody>${d.rows.map(x => `<tr class="click" data-unit="${esc(x.unit)}"><td>${esc(x.unit)}${x.complete ? '' : ' <span class="tag-s warn">未完整</span>'}</td><td class="num">${baseText(ui, x.base)}</td>
        ${x.items.map(it => `<td class="num">${amt(ui, it)}</td>`).join('')}<td class="num">${ui.money(x.total)}</td>
        ${d.payTracking ? `<td>${x.paid ? '✓' + (x.changed ? '（金額變動）' : '') : ''}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><th>小計</th><th class="num">${ui.money(d.footer.base)}${d.footer.basePending ? `<div class="small muted">${d.footer.basePending} 戶待提供</div>` : ''}</th>
        ${keys.map(k => `<th class="num">${k.status === '尚未啟用' ? '<span class="muted">尚未啟用</span>' : ui.money(k.subtotal)}<div class="small muted">${k.households} 戶</div></th>`).join('')}
        <th class="num">${ui.money(d.footer.total)}</th>${d.payTracking ? '<th></th>' : ''}</tr></tfoot></table></div>
      <div class="btnrow"><button class="btn small" id="csv">下載 CSV</button>${keys.filter(k => k.status !== '尚未啟用').map(k => `<button class="btn small ghost" data-item="${esc(k.key)}">${esc(k.label)}明細</button>`).join('')}</div>
      <div class="fb-detail"></div>`;
    const det = body.querySelector('.fb-detail');
    body.querySelectorAll('[data-redo]').forEach(b => b.onclick = () => ui.confirmTwice(b, async () => {
      const n = d.notices[+b.dataset.redo];
      const res = await ui.run(n.redo, {month:n.month}, {button:b});
      if(res.ok){ ui.toast(`已重新月結 ${n.island} ${n.month}`); bill(el, ui, month, filter); }
    }));
    body.querySelectorAll('tr[data-unit]').forEach(tr => tr.onclick = () => detail(det, ui, {month, unit:tr.dataset.unit}));
    body.querySelectorAll('[data-item]').forEach(b => b.onclick = () => detail(det, ui, {month, item:b.dataset.item}));
    body.querySelector('#csv').onclick = () => ui.csv(`帳單總表-${month}.csv`,
      [['戶號','管理費'].concat(keys.map(k => k.label), ['合計','完整'])].concat(d.rows.map(x =>
        [x.unit, x.base.state === 'pending' ? '待提供' : x.base.amount].concat(x.items.map(it => it.status === 'ok' ? it.amount : it.status), [x.total, x.complete ? '是' : '否']))));
  }
  async function detail(el, ui, q){
    const {esc} = ui;
    ui.loading(el);
    const r = await ui.run('fee.detail', q); if(!r.ok){ el.innerHTML = ''; return; }
    const d = r.data;
    if(d.line){
      const L = d.line;
      el.innerHTML = `<h3>${esc(L.unit)}・${esc(L.month)} 明細</h3><table class="tbl"><tbody>
        <tr><td>管理費</td><td class="num">${baseText(ui, L.base)}</td></tr>
        ${L.items.map(it => `<tr><td>${esc(it.label)}<div class="small muted">${esc(it.month)} 產生</div>${detailRows(ui, it)}</td><td class="num">${amt(ui, it)}</td></tr>`).join('')}
        <tr><th>合計</th><th class="num">${ui.money(L.total)}</th></tr></tbody></table>`;
    } else {
      const rows = d.rows.filter(x => x.status !== 'ok' || x.amount);
      el.innerHTML = `<h3>${esc(d.label)}・${esc(d.month)}</h3>` + (rows.length ? `<table class="tbl"><tbody>${rows.map(x => `<tr><td>${esc(x.unit)}${detailRows(ui, Object.assign({key:d.item}, x))}</td><td class="num">${amt(ui, x)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">這個月沒有戶別有這項費用。</p>`);
    }
    el.scrollIntoView({block:'nearest'});
  }

  /* ---------- 管委會：管理費金額 ---------- */
  async function bases(el, ui){
    const {esc} = ui;
    el.innerHTML = `<form class="form" novalidate>
        <div class="dims"><label>戶號<input name="unit" required placeholder="2A" autocapitalize="characters"></label>
        <label>金額（元）<input name="amount" type="number" inputmode="numeric" min="1" required></label></div>
        <label>生效月份<input name="effMonth" type="month" required value="${esc(ui.month(1))}"></label>
        <label>備註（選填）<input name="note" placeholder="例：依坪數"></label>
        <p class="muted small">調整金額＝新增一列新的生效月份，舊帳單不變；同戶同月份會覆蓋。</p>
        <p class="alert" hidden></p><button class="btn primary block">儲存</button></form><div class="fbs-list"></div>`;
    const f = el.querySelector('form'), list = el.querySelector('.fbs-list');
    const load = async () => {
      ui.loading(list);
      const r = await ui.run('fee.bases'); if(!r.ok){ list.innerHTML = ''; return; }
      list.innerHTML = r.data.bases.length ? `<table class="tbl"><thead><tr><th>戶號</th><th>生效</th><th class="num">金額</th></tr></thead><tbody>${r.data.bases.map(b =>
        `<tr><td>${esc(b.unit)}</td><td>${esc(b.effMonth)}${b.note ? `<div class="small muted">${esc(b.note)}</div>` : ''}</td><td class="num">${ui.money(b.amount)}</td></tr>`).join('')}</tbody></table>`
        : `<p class="warnbox">還沒有輸入任何一戶的管理費，帳單會顯示「待提供」。</p>`;
    };
    f.onsubmit = async e => { e.preventDefault();
      const v = ui.formData(f);
      const res = await ui.run('fee.setBase', {unit:v.unit.toUpperCase(), amount:+v.amount, effMonth:v.effMonth, note:v.note}, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok){ ui.toast(`${res.data.unit} ${res.data.effMonth} 起 ${res.data.amount} 元${res.data.replaced ? '（已覆蓋）' : ''}`); f.unit.value = ''; f.amount.value = ''; load(); }
    };
    load();
  }

  /* ---------- 管委會：收支登打（一次存一個月份，取代該月） ---------- */
  async function ledger(el, ui, month){
    const {esc} = ui;
    month = month || ui.month(-1);
    el.innerHTML = monthPicker(ui, month, '收支月份') + '<div class="fl-body"></div>';
    pickOn(el, m => ledger(el, ui, m));
    const body = el.querySelector('.fl-body'); ui.loading(body);
    const r = await ui.run('fee.ledger', {month}); if(!r.ok){ body.innerHTML = ''; return; }
    const d = r.data;
    const row = (e = {}) => `<div class="ledrow item"><div class="dims">
        <label>類別<select name="type">${['收入','支出'].map(t => `<option${e.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>科目<select name="subject"></select></label></div>
        <div class="dims"><label>金額<input name="amount" type="number" inputmode="numeric" min="0" value="${e.amount == null ? '' : e.amount}"></label>
        <label>說明（不可寫戶號）<input name="note" value="${esc(e.note || '')}"></label></div>
        <button class="btn small ghost" type="button" data-del>刪除這列</button></div>`;
    body.innerHTML = `${d.locked ? `<p class="warnbox">這個月已被已公布的報告 ${esc(d.lockedBy)} 涵蓋，要修改請先在「收支報告」按更正。</p>` : ''}
      <form class="form" novalidate><div class="rows">${(d.entries.length ? d.entries : [{type:'收入'}]).map(row).join('')}</div>
      <button class="btn small" type="button" id="add">＋ 新增一列</button>
      <p class="alert" hidden></p><button class="btn primary block" type="submit"${d.locked ? ' disabled' : ''}>儲存 ${esc(d.month)} 收支（取代整個月）</button></form>`;
    const f = body.querySelector('form'), rows = f.querySelector('.rows');
    const wire = div => {
      const t = div.querySelector('[name=type]'), sj = div.querySelector('[name=subject]'), cur = sj.dataset.v;
      const fill = v => { sj.innerHTML = (t.value === '收入' ? d.income : d.expense).map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join(''); };
      t.onchange = () => fill(); fill(cur);
      div.querySelector('[data-del]').onclick = () => div.remove();
    };
    [...rows.children].forEach((div, i) => { const e = d.entries[i]; if(e) div.querySelector('[name=subject]').dataset.v = e.subject; wire(div); });
    f.querySelector('#add').onclick = () => { rows.insertAdjacentHTML('beforeend', row({type:'支出'})); wire(rows.lastElementChild); };
    f.onsubmit = async e => { e.preventDefault();
      const entries = [...rows.children].map(div => ({type:div.querySelector('[name=type]').value, subject:div.querySelector('[name=subject]').value,
        amount:Number(div.querySelector('[name=amount]').value || 0), note:div.querySelector('[name=note]').value.trim()}));
      const res = await ui.run('fee.ledgerSave', {month:d.month, entries}, {box:f.querySelector('.alert'), button:f.querySelector('[type=submit]')});
      if(res.ok) ui.toast(`已儲存 ${res.data.count} 筆：收入 ${res.data.income}、支出 ${res.data.expense}`);
    };
  }

  /* ---------- 管委會：收支報告 ---------- */
  function reportAdmin(el, ui){
    el.innerHTML = `<form class="form" novalidate><h4>新增報告草稿</h4>
        <div class="dims"><label>起<input name="from" type="month" required></label><label>迄<input name="to" type="month" required></label></div>
        <label>期初結餘（只有第一份要填）<input name="open" type="number" inputmode="numeric"></label>
        <label>公共基金（選填）<input name="fund" type="number" inputmode="numeric"></label>
        <label>附件連結（選填，雲端資料夾）<input name="attach" type="url"></label>
        <p class="muted small">期間要接續上一份，不可重疊或跳月。</p>
        <p class="alert" hidden></p><button class="btn block">建立草稿</button></form><div class="fr-list"></div>`;
    const f = el.querySelector('form'), list = el.querySelector('.fr-list');
    f.onsubmit = async e => { e.preventDefault();
      const v = ui.formData(f), body = {from:v.from, to:v.to};
      ['open','fund'].forEach(k => { if(v[k] !== '') body[k] = Number(v[k]); }); if(v.attach) body.attach = v.attach;
      const res = await ui.run('fee.reportSave', body, {form:f, box:f.querySelector('.alert'), button:f.querySelector('button')});
      if(res.ok){ ui.toast(`草稿 ${res.data.id}：期末 ${res.data.close} 元` + (res.data.warnings.length ? '（' + res.data.warnings.join('；') + '）' : '')); f.reset(); reports(list, ui, true); }
    };
    reports(list, ui, true);
  }

  async function receivable(el, ui){
    const {esc} = ui;
    el.innerHTML = `<form class="inline"><input type="month" name="from" value="${esc(ui.month(0))}" aria-label="起"><input type="month" name="to" value="${esc(ui.month(5))}" aria-label="迄"><button class="btn small">查詢</button></form><div class="rv"></div>`;
    const f = el.querySelector('form'), out = el.querySelector('.rv');
    const load = async () => {
      ui.loading(out);
      const r = await ui.run('fee.receivable', {from:f.from.value, to:f.to.value}); if(!r.ok){ out.innerHTML = ''; return; }
      out.innerHTML = `<table class="tbl"><thead><tr><th>月份</th><th class="num">管理費</th><th class="num">延伸費用</th><th class="num">待提供</th></tr></thead><tbody>${r.data.months.map(m =>
        `<tr><td>${esc(m.month)}</td><td class="num">${ui.money(m.base)}</td><td class="num">${ui.money(m.ext)}</td><td class="num">${m.pending} 戶</td></tr>`).join('')}</tbody></table>
        <p class="muted small">參考用，不會自動寫入收支。</p>`;
    };
    f.onsubmit = e => { e.preventDefault(); load(); }; load();
  }

  function admin(el, ui){
    const pn = document.getElementById('panel'); if(pn) pn.classList.add('wide');     // 總表欄位多，用寬版面板
    ui.fold(el, '帳單總表', b => bill(b, ui), true);
    ui.fold(el, '管理費金額', b => bases(b, ui));
    ui.fold(el, '收支登打', b => ledger(b, ui));
    ui.fold(el, '收支報告', b => reportAdmin(b, ui));
    ui.fold(el, '應收參考', b => receivable(b, ui));
    ui.fold(el, '財務參數', b => ui.params(b, 'fee'));
  }

  return {resident, admin};
})();
