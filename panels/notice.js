/* =========================================================
   網站/panels/notice.js — 公告島面板（整合維護）
   v1：顯示管委會已通過的公告與社區規範總目錄（資料在 rules/rules.js）。
   公告的線上發布方式使用者之後會提出新做法，屆時改接後端。
   登入住戶另顯示「近期公共工程」（panels/works.js 的 WorksPanel.publicSoon）。
   ========================================================= */
(function(){
  function render(el, ui){
    const {esc} = ui, all = Rules.all();
    const notices = all.filter(r => r.kind === '公告');
    const rules = all.filter(r => r.kind !== '公告' && r.island !== 'admin');
    el.innerHTML = '';
    // 近期公共工程（工程島 works.calendar 篩 mode:"public"；只有登入住戶看得到）
    if(window.WorksPanel && Auth.can('works:resident')){ const w = document.createElement('section'); el.appendChild(w); WorksPanel.publicSoon(w, ui); }
    Rules.render(el, notices, {heading:'管委會公告'});
    Rules.render(el, rules.filter(r => r.island === 'notice'), {heading:'社區共同規範'});
    const others = rules.filter(r => r.island !== 'notice');
    if(others.length){
      el.insertAdjacentHTML('beforeend', `<h3>各島規範</h3><ul class="list">${others.map(r => {
        const isl = ISLANDS.find(d => d.id === r.island);
        return `<li><button class="item linkrow" data-isl="${esc(r.island)}" data-rule="${esc(r.id)}">
          <b>${esc(r.title)}</b><span class="muted small">${esc(isl ? isl.name : '')}・${esc(r.date)}</span></button></li>`;
      }).join('')}</ul>`);
      el.querySelectorAll('[data-isl]').forEach(b => b.onclick = () => {
        ui.openIsland(b.dataset.isl);
        setTimeout(() => { const d = document.getElementById('rule-' + b.dataset.rule); if(d){ d.open = true; d.scrollIntoView({block:'start'}); } }, 60);
      });
    }
  }
  window.Panels = window.Panels || {};
  window.Panels.notice = {render};
})();
