/* =========================================================
   網站/panels/rules.js — 已通過規範的顯示（整合維護）
   資料：rules/rules.js 的 window.RULES
   - Rules.of(id)：屬於某島（含 also 交叉列出）的文件
   - Rules.render(el, docs, opts)：每份文件一個可展開區塊，內文用 core/md.js 轉換
   - 沒有專屬面板、但有規範的島，由 core/app.js 直接呼叫 Rules.panel()
   ========================================================= */
window.Rules = (function(){
  const ALL = () => window.RULES || [];
  const of = id => ALL().filter(r => r.island === id || (r.also || []).includes(id))
    .sort((a, b) => (b.island === id) - (a.island === id));          // 本島的文件排前面
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function block(r, open){
    const d = document.createElement('details');
    d.className = 'fold rule'; d.id = 'rule-' + r.id;
    if(open) d.open = true;
    d.innerHTML = `<summary><span class="chip">${esc(r.kind)}</span>${esc(r.title)}<small>${esc(r.date)}</small></summary>
      <div class="fold-body md"></div>`;
    const body = d.querySelector('.md');
    const fill = () => { if(!body.dataset.done){ body.innerHTML = MD.render(r.md); body.dataset.done = '1'; } };
    if(open) fill();
    d.addEventListener('toggle', () => { if(d.open) fill(); });
    return d;
  }
  function render(el, docs, opts = {}){
    if(opts.heading) el.insertAdjacentHTML('beforeend', `<h3>${esc(opts.heading)}</h3>`);
    docs.forEach((r, i) => el.appendChild(block(r, opts.openFirst ? i === 0 : (opts.openSingle && docs.length === 1))));
  }
  function panel(el, ui, d){
    const docs = of(d.id);
    el.innerHTML = d.status !== 'open' ? `<p class="muted">線上功能建置中，以下是管委會已通過的規範。</p>` : '';
    render(el, docs, {openFirst:true});
  }
  return {of, render, panel, all: ALL};
})();
