/* =========================================================
   網站/scene/props/parking.js — 停車場島：機車位線上抽籤倒數看板（美術 3D，2026-11-09）
   保留 scene.js 內建的停車場造景（withBuiltin），只在島上加一面倒數看板與一個抽籤箱。
   對外：{ build(group), update(group, data), empty(group), tick(group, dt, t), withBuiltin:true }
   data：{ drawAt:'2026-11-25T08:00:00+08:00', title:'機車位線上抽籤' }
     drawAt 之前：「距離抽籤還有 X 天 X 時 X 分」
     drawAt 之後：「抽籤已完成，結果請登入查看」
     沒有 data 或沒有 drawAt：看板不顯示
   只顯示時間，不顯示戶號、車牌、車位對應。時間以住戶裝置的時鐘計算，每分鐘更新一次。
   依賴：全域 THREE（r128）
   ========================================================= */
(function(){
  if(!window.THREE) return;
  const THREE = window.THREE;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({color:c, flatShading:true, roughness:.9, metalness:0}, o));
  const mat = { post:M(0x6e4a2e), frame:M(0x2c6fb7), roof:M(0xc95e2c), box:M(0xf3e6d0), boxTop:M(0xd9542b), drum:M(0xf2a516), metal:M(0x8f9499,{metalness:.3, roughness:.6}), ticket:M(0xfffaf0) };
  const box = (w,h,d,m,x=0,y=0,z=0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; return o; };
  const WD = ['日','一','二','三','四','五','六'];
  const pad = n => String(n).padStart(2,'0');

  function draw(S){
    const x = S.ctx, W = 640, H = 400, d = S.data || {};
    const at = d.drawAt ? new Date(d.drawAt) : null;
    x.clearRect(0,0,W,H);
    x.fillStyle = '#fff8ec'; x.fillRect(0,0,W,H);
    x.fillStyle = '#2c6fb7'; x.fillRect(0,0,W,88);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 46px ${FONT}`; x.fillText(d.title || '機車位線上抽籤', W/2, 46);
    if(!at || isNaN(at)) { S.tex.needsUpdate = true; return; }
    const left = at - Date.now();
    if(left > 0){
      const m = Math.ceil(left/60000), dd = Math.floor(m/1440), hh = Math.floor(m%1440/60), mm = m%60;
      x.fillStyle = '#7a6a58'; x.font = `700 34px ${FONT}`; x.fillText('距離抽籤還有', W/2, 134);
      // 大字：X 天 X 時 X 分
      const parts = [[dd,'天'],[hh,'時'],[mm,'分']];
      x.font = `900 104px ${FONT}`; const nw = parts.map(([n]) => x.measureText(String(n)).width);
      x.font = `700 44px ${FONT}`; const uw = x.measureText('天').width;
      const gap = 18, total = nw.reduce((a,b)=>a+b,0) + parts.length*(uw+8) + gap*(parts.length-1);
      let cx = (W-total)/2; x.textAlign = 'left';
      parts.forEach(([n,u],i) => {
        x.fillStyle = '#d9542b'; x.font = `900 104px ${FONT}`; x.fillText(String(n), cx, 232); cx += nw[i] + 8;
        x.fillStyle = '#3b2a1a'; x.font = `700 44px ${FONT}`; x.fillText(u, cx, 252); cx += uw + gap;
      });
      x.textAlign = 'center';
    } else {
      x.fillStyle = '#4fa36b'; x.font = `900 76px ${FONT}`; x.fillText('抽籤已完成', W/2, 186);
      x.fillStyle = '#3b2a1a'; x.font = `700 40px ${FONT}`; x.fillText('結果請登入查看', W/2, 262);
    }
    // 抽籤時間（以台北時間顯示）
    const tp = new Date(at.getTime() + (480 + at.getTimezoneOffset())*60000);
    x.fillStyle = '#7a6a58'; x.font = `500 30px ${FONT}`;
    x.fillText(`抽籤時間 ${tp.getFullYear()}/${tp.getMonth()+1}/${tp.getDate()}（${WD[tp.getDay()]}）${pad(tp.getHours())}:${pad(tp.getMinutes())}`, W/2, 350);
    S.tex.needsUpdate = true;
  }

  function build(group){
    const S = {data:null, lastMin:-1};
    const root = new THREE.Group(); root.position.set(-2.4, 0, 3.55); root.rotation.y = .45; root.visible = false; root.userData.dynamic = true;
    group.add(root); S.root = root;
    // 看板：兩支木柱＋藍框＋屋簷
    root.add(box(.09,1.3,.09,mat.post,-.82,.65,0), box(.09,1.3,.09,mat.post,.82,.65,0));
    root.add(box(1.86,1.2,.07,mat.frame,0,1.25,-.02));
    root.add(box(2.05,.08,.36,mat.roof,0,1.9,0));
    const c = document.createElement('canvas'); c.width = 640; c.height = 400;
    S.ctx = c.getContext('2d'); S.tex = new THREE.CanvasTexture(c); S.tex.encoding = THREE.sRGBEncoding; S.tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.76,1.1), new THREE.MeshBasicMaterial({map:S.tex}));
    face.position.set(0,1.25,.02); root.add(face);
    // 看板旁的抽籤箱：倒數時籤筒慢慢轉，抽籤後停止
    const lot = new THREE.Group(); lot.position.set(1.35, 0, .15); root.add(lot);
    lot.add(box(.42,.36,.36,mat.box,0,.18,0), box(.46,.04,.4,mat.boxTop,0,.38,0));
    [-.2,.2].forEach(dx => lot.add(box(.03,.24,.03,mat.metal,dx,.52,0)));
    const drum = new THREE.Group(); drum.position.set(0,.6,0); lot.add(drum);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.34,8), mat.drum); cyl.rotation.z = Math.PI/2; cyl.castShadow = true; drum.add(cyl);
    drum.add(box(.36,.02,.02,mat.metal,0,0,0));
    for(let i=0;i<3;i++){ const tk = box(.09,.005,.05,mat.ticket,-.1+i*.1,.395,-.06+i*.05); tk.rotation.y = i*.7; lot.add(tk); }
    S.drum = drum;
    group.userData.parkx = S;
    return group;
  }
  function refresh(group, force){
    const S = group.userData.parkx; if(!S) return;
    const d = S.data, ok = d && d.drawAt && !isNaN(new Date(d.drawAt));
    S.root.visible = !!ok;
    if(!ok) return;
    const min = Math.floor(Date.now()/60000);
    if(force || min !== S.lastMin){ S.lastMin = min; draw(S); }
  }
  function update(group, data){ const S = group.userData.parkx; if(!S) return; S.data = data || null; refresh(group, true); }
  function empty(group){ update(group, null); }
  function tick(group, dt){
    const S = group.userData.parkx; if(!S || !S.root.visible) return;
    refresh(group, false);
    if(new Date(S.data.drawAt) - Date.now() > 0) S.drum.rotation.x += dt * 1.2;
  }

  const api = {build, update, empty, tick, withBuiltin:true};
  (window.SceneProps = window.SceneProps || {}).parking = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
