/* =========================================================
   網站/core/md.js — 極簡 Markdown 轉 HTML（整合維護）
   只支援規範文件用到的語法：標題、粗體、斜體、項目清單（可巢狀）、編號清單、表格、段落。
   先跳脫 HTML，再轉語法，所以文件內容不會變成程式碼。
   ========================================================= */
window.MD = (function(){
  const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const inline = s => esc(s)
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');

  function render(src){
    const lines = src.replace(/\r/g, '').split('\n');
    const out = [];
    let para = [], list = [];                       // list：[{type, indent}]
    const flushPara = () => { if(para.length){ out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const closeLists = (toIndent = -1) => {
      while(list.length && list[list.length-1].indent > toIndent){ out.push('</li></' + list.pop().type + '>'); }
    };
    for(let i = 0; i < lines.length; i++){
      const raw = lines[i], line = raw.trim();
      if(!line){ flushPara(); continue; }
      // 表格
      if(line.startsWith('|') && i+1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])){
        flushPara(); closeLists();
        const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(line); i += 2;
        const rows = [];
        while(i < lines.length && lines[i].trim().startsWith('|')){ rows.push(cells(lines[i])); i++; }
        i--;
        const body = rows.filter(r => r.some(c => c));
        out.push('<div class="md-table"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if(h){
        flushPara(); closeLists();
        const text = h[2].replace(/\*\*/g, '').trim(); if(!text) continue;
        const lv = Math.min(4, h[1].length + 1);       // 文件的 # 對應面板裡的 h2，避免比面板標題還大
        out.push(`<h${lv}>${inline(text)}</h${lv}>`);
        continue;
      }
      const li = raw.match(/^(\s*)([*-]|\d+\.)\s+(.*)$/);
      if(li){
        flushPara();
        const indent = li[1].replace(/\t/g, '    ').length, type = /\d/.test(li[2]) ? 'ol' : 'ul';
        const top = list[list.length-1];
        if(!top || indent > top.indent){ out.push(`<${type}><li>`); list.push({type, indent}); }
        else {
          closeLists(indent);
          const t2 = list[list.length-1];
          if(t2 && t2.indent === indent && t2.type === type) out.push('</li><li>');
          else { if(t2 && t2.indent === indent) out.push('</li></' + list.pop().type + '>'); out.push(`<${type}><li>`); list.push({type, indent}); }
        }
        out.push(inline(li[3]));
        continue;
      }
      if(list.length){ out.push('<br>' + inline(line)); continue; }   // 清單項目的續行
      para.push(line);
    }
    flushPara(); closeLists();
    return out.join('');
  }
  return {render};
})();
