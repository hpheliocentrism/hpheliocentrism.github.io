/* =========================================================
   網站/scene/props/works.js — 工程島「本週施工登記」看板（美術 3D，2026-11-11）
   保留 scene.js 內建的工程島造景（withBuiltin），只把看板換成依資料畫的本週行事曆。
   data：works.stats 的 data（API.md 5.2）
     { updated, today:'2026-11-11', days:[{date, dow, kind:'weekday'|'weekend'|'holiday', stop:{scope,reason}|null,
       resident, noise, quiet, public:[{title, start, end, elevator}] }] }（從本週一起 14 天）
   看板只顯示：每天住戶施工件數、其中噪音件數、假日靜音件數、停工日、社區公共工程標題與時段。
   不顯示戶別、樓層、廠商（工程規格 §5、README 隱私紅線）。
   對外：{ build, update, empty, tick, withBuiltin:true }
   ========================================================= */
(function(){
  if(!window.THREE) return;
  const THREE = window.THREE;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const CW = 1024, CH = 620;
  const md = s => Number(s.slice(5,7)) + '/' + Number(s.slice(8,10));

  function draw(S){
    const x = S.ctx, d = S.data;
    x.fillStyle = '#ffffff'; x.fillRect(0,0,CW,CH);
    x.fillStyle = '#3b2a1a'; x.font = `700 54px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillText('本週施工登記', 32, 50);
    const week = d && Array.isArray(d.days) ? d.days.slice(0,7) : [];
    if(week.length){ x.font = `500 26px ${FONT}`; x.fillStyle = '#7a6a58'; x.textAlign = 'right';
      x.fillText(md(week[0].date) + '–' + md(week[week.length-1].date), CW-32, 54); }
    // 七欄
    const x0 = 24, cw = (CW-48)/7, y0 = 96, hh = 50, y1 = 430;
    const names = ['一','二','三','四','五','六','日'];
    for(let i=0;i<7;i++){
      const day = week[i], cx = x0 + i*cw, isToday = day && d.today === day.date, off = day && day.kind !== 'weekday';
      x.fillStyle = isToday ? '#fff1d6' : (off ? '#f6f2ec' : '#ffffff'); x.fillRect(cx, y0, cw, y1-y0);
      x.fillStyle = isToday ? '#f2a516' : '#efe4d2'; x.fillRect(cx, y0, cw, hh);
      x.textAlign = 'center'; x.fillStyle = off ? '#d9682b' : '#3b2a1a'; x.font = `700 28px ${FONT}`;
      x.fillText((day ? md(day.date) + ' ' : '') + (day ? day.dow : names[i]), cx+cw/2, y0+hh/2+2);
      if(!day) continue;
      let y = y0 + hh + 46;
      if(day.stop){
        x.fillStyle = '#8f9499'; x.fillRect(cx+10, y-30, cw-20, 56);
        x.fillStyle = '#fff'; x.font = `700 28px ${FONT}`; x.fillText(day.stop.scope === '全部停工' ? '停工' : '停噪音', cx+cw/2, y-2);
        y += 62;
      }
      if(day.resident > 0){
        x.fillStyle = '#3b2a1a'; x.font = `900 64px ${FONT}`; x.fillText(String(day.resident), cx+cw/2 - 14, y+18);
        x.font = `700 26px ${FONT}`; x.fillText('件', cx+cw/2 + 30, y+28); y += 74;
        if(day.noise > 0){ x.fillStyle = '#d9542b'; x.font = `700 26px ${FONT}`; x.fillText('噪音 ' + day.noise, cx+cw/2, y); y += 38; }
        if(day.quiet > 0){ x.fillStyle = '#4fa36b'; x.font = `700 26px ${FONT}`; x.fillText('靜音 ' + day.quiet, cx+cw/2, y); y += 38; }
      } else if(!day.stop){ x.fillStyle = '#c9bca8'; x.font = `500 30px ${FONT}`; x.fillText('—', cx+cw/2, y+10); y += 50; }
      if(day.public && day.public.length){
        x.fillStyle = '#2c6fb7'; x.beginPath(); x.arc(cx+cw/2, Math.max(y, y1-34), 14, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.font = `700 18px ${FONT}`; x.fillText('公', cx+cw/2, Math.max(y, y1-34)+1);
      }
    }
    x.strokeStyle = '#e4d6c0'; x.lineWidth = 2;
    for(let i=0;i<=7;i++){ x.beginPath(); x.moveTo(x0+i*cw, y0); x.lineTo(x0+i*cw, y1); x.stroke(); }
    x.strokeRect(x0, y0, CW-48, y1-y0);
    // 公共工程：今天起最近兩筆
    x.textAlign = 'left'; x.fillStyle = '#2c6fb7'; x.font = `700 28px ${FONT}`;
    x.fillText('社區公共工程', 32, 470);
    const pub = [];
    (d && d.days || []).forEach(day => { if(day.date >= (d.today || '')) (day.public || []).forEach(p => pub.push({day, p})); });
    x.font = `500 26px ${FONT}`; x.fillStyle = '#3b2a1a';
    if(!pub.length) x.fillText(d ? '近期沒有公共工程' : '資料讀取中', 32, 510);
    pub.slice(0,2).forEach((o,i) => {
      const t = o.p.start ? ` ${o.p.start}–${o.p.end}` : '';
      let line = `${md(o.day.date)}（${o.day.dow}）${t} ${o.p.title}${o.p.elevator ? '・電梯暫停使用' : ''}`;
      while(x.measureText(line).width > CW-64 && line.length > 4) line = line.slice(0,-2) + '…';
      x.fillText(line, 32, 510 + i*40);
    });
    x.fillStyle = '#a8957c'; x.font = `500 20px ${FONT}`; x.textAlign = 'right';
    x.fillText('件數為住戶裝修；戶別與時段請登入查看', CW-32, CH-22);
    S.tex.needsUpdate = true;
  }

  function build(group){
    const S = {data:null};
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    S.ctx = c.getContext('2d'); S.tex = new THREE.CanvasTexture(c); S.tex.encoding = THREE.sRGBEncoding; S.tex.anisotropy = 4;
    const cal = group.userData.calMesh, board = group.userData.calBoard;
    if(cal){ cal.material = new THREE.MeshBasicMaterial({map:S.tex}); cal.scale.set(1, (1.22*CH/CW)/.74, 1); }
    if(board) board.scale.setScalar(1.3);
    group.userData.worksx = S; draw(S);
    return group;
  }
  function update(group, data){ const S = group.userData.worksx; if(!S) return; S.data = data || null; draw(S); }
  function empty(group){ const S = group.userData.worksx; if(!S) return; S.data = {today:'', days:[]}; draw(S); }
  function tick(){}

  const api = {build, update, empty, tick, withBuiltin:true};
  (window.SceneProps = window.SceneProps || {}).works = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
