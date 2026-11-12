/* =========================================================
   網站/scene/props/gym.js — 健身房島造景（美術 3D）
   島中央：木棧道地板的健身房（與頂樓空中花園相同風格），兩台 HORIZON 7.0AT-24 跑步機面向鏡牆。
   造型依《宏樸日心說社區 HORIZON 7.0AT-24 跑步機快速操作指南》：深灰機身、兩側防滑側踏板、
   7.8 吋螢幕與藍色 LED 視窗、綠色 START／紅色 STOP、左右藍色 QuickDial 滾輪、左右數字快捷鍵、
   兩側喇叭與置杯架、上方平板架、面板下方紅色安全磁扣。
   使用情形看板：依辦法「感應扣每次借用上限 90 分鐘」，09:00–21:00 以 90 分鐘為一個時段，
   顯示「本時段」與「下一時段」的感應扣借出／登記數量（只有數量，沒有戶號、姓名）。
   對外：{ build(group), update(group, data), empty(group), tick(group, dt, t) }
   data（建議由 gym.stats 提供，欄位皆可省略）：
     { open:true|false, closedReason:'保養', broken:0,          // 開放中：吊燈與玻璃亮暖光；閉館：燈暗；暫停開放：前方掛紅色吊牌（原因類別）
       slotNow:{start:'10:30', end:'12:00', borrowed:1},     // 本時段借出中的感應扣數
       slotNext:{start:'12:00', end:'13:30', booked:0} }     // 下一時段已登記（含夜間預約）數
   沒有 slotNow／slotNext 時，時段由瀏覽器時間計算、數量顯示「—」。
   跑步的人數＝min(本時段借出數, 可用跑步機數)；沒有資料時開放時間內放 1 人示意。
   依賴：全域 THREE（r128）
   ========================================================= */
(function(){
  if(!window.THREE) return;
  const THREE = window.THREE;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const OPEN_H = 9, CLOSE_H = 21, SLOT_MIN = 90;          // 辦法：09:00–21:00；感應扣每次 90 分鐘
  const S_M = .4;                                          // 跑步機與人：1 公尺 ＝ 0.4 單位

  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({color:c, flatShading:true, roughness:.9, metalness:0}, o));
  const mat = {
    deck:M(0xc29262), deckDark:M(0x9c7046), wall:M(0xf1ece4), wallBand:M(0x8c8f94), frame:M(0x3a3d42,{metalness:.3, roughness:.5}),
    mirror:M(0xcfdde6,{roughness:.25, emissive:0xcfdde6, emissiveIntensity:.25}), glass:M(0xbcd3d9,{roughness:.15, transparent:true, opacity:.35}),
    ac:M(0xfafafa,{roughness:.5}), planter:M(0x6b6f75), soil:M(0x5a3d26), leaf:M(0x6fa84a), leafB:M(0x8dbb4f), trunk:M(0x8a5a32),
    // 跑步機
    tmBody:M(0x2b2d31,{roughness:.6}), tmDark:M(0x1c1d20,{roughness:.5}), tmRail:M(0x6b6f75,{roughness:.8}), tmSilver:M(0xb9bcc0,{metalness:.6, roughness:.3}),
    tmBlue:M(0x2f6fd6,{emissive:0x2f6fd6, emissiveIntensity:.25}), tmGreen:M(0x3faa4f,{emissive:0x3faa4f, emissiveIntensity:.3}),
    tmRed:M(0xd6302a,{emissive:0xd6302a, emissiveIntensity:.3}), tmSpeaker:M(0x45484e,{roughness:.95}), tmKey:M(0x8a8e94),
    yellow:M(0xf2c230), black:M(0x232325), white:M(0xfaf5ea), metal:M(0x8f9499,{metalness:.3, roughness:.6})
  };

  /* ---------- 小工具 ---------- */
  const box = (w,h,d,m,x=0,y=0,z=0,cast=true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); o.position.set(x,y,z); o.castShadow = cast; o.receiveShadow = true; return o; };
  const cyl = (rt,rb,h,s,m,x=0,y=0,z=0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s), m); o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; return o; };
  function tree(g,x,z,s=1){
    g.add(cyl(.12*s,.16*s,.7*s,5,mat.trunk,x,.35*s,z));
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(.62*s,0), Math.random()>.5?mat.leaf:mat.leafB);
    c.position.set(x,1.05*s,z); c.castShadow = true; g.add(c);
  }
  function mergeStatic(root){
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map();
    (function visit(o){
      if(o !== root && o.userData.dynamic) return;
      if(o.isMesh && !o.isInstancedMesh && o.visible && o.geometry.attributes.position && !o.material.map){
        const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
        if(!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(o);
      }
      o.children.forEach(visit);
    })(root);
    const m = new THREE.Matrix4();
    buckets.forEach(parts => {
      if(parts.length < 2) return;
      let n = 0;
      const geos = parts.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); m.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m); n += g.attributes.position.count; return g; });
      const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2); let k = 0;
      geos.forEach(g => { pos.set(g.attributes.position.array, k*3); if(g.attributes.normal) nor.set(g.attributes.normal.array, k*3); if(g.attributes.uv) uv.set(g.attributes.uv.array, k*2); k += g.attributes.position.count; g.dispose(); });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor,3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv,2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, parts[0].material); mesh.castShadow = parts[0].castShadow; mesh.receiveShadow = true;
      parts.forEach(o => o.parent && o.parent.remove(o)); root.add(mesh);
    });
  }
  function canvasTex(w, h, draw){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  // 跑帶：深色帶細橫紋，往後捲動
  function beltTexture(){
    const t = canvasTex(32, 128, (x,w,h) => { x.fillStyle = '#18191b'; x.fillRect(0,0,w,h); x.fillStyle = '#2a2b2e'; for(let y=0;y<h;y+=16) x.fillRect(0,y,w,3); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t;
  }
  // 7.8 吋螢幕（點陣）＋ LED 數字視窗
  function screenTexture(on){
    return canvasTex(256, 128, (x,w,h) => {
      x.fillStyle = on ? '#c9d6c2' : '#3c4240'; x.fillRect(0,0,w,70);
      x.fillStyle = on ? '#28302a' : '#4a514e'; x.font = `700 22px monospace`;
      if(on){ x.fillText('25:30', 12, 30); x.fillText('8.7', 196, 30); x.fillText('PACE  MANUAL', 40, 60); }
      x.fillStyle = '#101214'; x.fillRect(0,74,w,54);
      x.fillStyle = on ? '#7fd6ff' : '#253038'; x.font = `700 26px monospace`;
      ['253','105','87','463'].forEach((s,i) => x.fillText(on ? s : '--', 10 + i*62, 112));
    });
  }

  /* ---------- 跑步機（公尺為單位，外層縮放 S_M）；面板朝 +z（跑者面向 -z 的鏡牆）---------- */
  function makeTreadmill(){
    const g = new THREE.Group();
    // 機身與跑帶（前端在 -z）
    g.add(box(.86,.18,2.0,mat.tmBody,0,.12,0));
    [-.4,.4].forEach(x => { g.add(box(.06,.05,.12,mat.tmDark,x,.025,.9)); g.add(box(.06,.05,.12,mat.tmDark,x,.025,-.9)); });
    const beltTex = beltTexture();
    const belt = box(.56,.02,1.5,new THREE.MeshStandardMaterial({map:beltTex, roughness:.9}),0,.215,.18,false);
    g.add(belt);
    [-.36,.36].forEach(x => g.add(box(.15,.03,1.55,mat.tmRail,x,.225,.15)));            // ① 兩側防滑側踏板
    g.add(box(.86,.2,.4,mat.tmDark,0,.3,-.78));                                           // 前方馬達罩
    g.add(box(.84,.03,.06,mat.tmRail,0,.215,.97,false));                                  // 後端蓋
    // 立柱（略向跑者傾斜）
    [-.42,.42].forEach(x => { const p = box(.08,1.05,.12,mat.tmBody,x,.85,-.72); p.rotation.x = .16; g.add(p); });
    // 面板群組：面朝 +z 上方
    const con = new THREE.Group(); con.position.set(0,1.36,-.6); con.rotation.x = .9; g.add(con);
    con.add(box(1.02,.1,.46,mat.tmBody,0,0,0));                                           // 面板外殼
    con.add(box(.46,.09,.5,mat.tmDark,0,.02,0));                                          // 中央凸起控制區
    [-.37,.37].forEach(x => {
      con.add(box(.22,.012,.16,mat.tmSpeaker,x,.056,-.1,false));                          // 喇叭
      con.add(box(.2,.06,.12,mat.tmDark,x,.03,.13,false));                                // ⑤ 置杯架
    });
    const scrOff = screenTexture(false), scrOn = screenTexture(true);
    const scrM = new THREE.MeshBasicMaterial({map:scrOff});
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.38,.19), scrM); scr.rotation.x = -Math.PI/2; scr.position.set(0,.067,-.08); con.add(scr);
    con.add(box(.06,.014,.035,mat.tmGreen,0,.072,.1,false));                              // START
    con.add(box(.06,.014,.03,mat.tmRed,0,.072,.15,false));                                // STOP
    con.add(box(.38,.004,.006,mat.tmBlue,0,.068,.05,false));                              // 藍色飾線
    con.add(box(.045,.03,.03,mat.tmRed,0,.0,.25));                                        // ② 紅色安全磁扣
    [-.19,.19].forEach(x => {                                                             // ④ 左右數字快捷鍵
      const pad = box(.16,.012,.08,mat.tmDark,x*2.35,.058,.17,false); con.add(pad);
      for(let i=0;i<6;i++) con.add(box(.014,.006,.014,mat.tmKey,x*2.35-.06+i*.024,.066,.17,false));
    });
    // 平板／手機架
    const tab = new THREE.Group(); tab.position.set(0,1.62,-.78); tab.rotation.x = -.25; g.add(tab);
    tab.add(box(.05,.16,.04,mat.tmDark,0,-.1,0), box(.34,.22,.025,mat.tmDark,0,.04,0));
    // 前方把手與 QuickDial 滾輪（左坡度、右速度，藍色）＋銀色心率感應片
    [-.2,.2].forEach(x => {
      const arm = box(.05,.05,.42,mat.tmBody,x,1.12,-.32); arm.rotation.x = .35; g.add(arm);
      g.add(box(.055,.06,.12,mat.tmSilver,x,1.06,-.2));
      g.add(cyl(.035,.035,.07,8,mat.tmBlue,x,1.22,-.42));
    });
    { const loop = box(.48,.05,.05,mat.tmBody,0,1.0,-.12); g.add(loop); }
    // 兩側短扶手
    [-.47,.47].forEach(x => g.add(box(.05,.05,.45,mat.tmBody,x,1.05,-.42)));
    // 維修中警示牌（預設隱藏）
    const warn = new THREE.Group(); warn.visible = false; g.add(warn);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(.6,.3), new THREE.MeshBasicMaterial({map:canvasTex(256,128,(x,w,h) => {
      x.fillStyle = '#f2c230'; x.fillRect(0,0,w,h); x.fillStyle = '#1f1f1f'; for(let i=-40;i<w;i+=40){ x.beginPath(); x.moveTo(i,0); x.lineTo(i+20,0); x.lineTo(i+40,18); x.lineTo(i+20,18); x.fill(); x.beginPath(); x.moveTo(i,h-18); x.lineTo(i+20,h-18); x.lineTo(i+40,h); x.lineTo(i+20,h); x.fill(); }
      x.font = `900 52px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('維修中', w/2, h/2+2); })}));
    ws.position.set(0,1.05,.02); ws.rotation.x = -.15; warn.add(ws);
    warn.userData.dynamic = true;
    belt.userData.dynamic = true; scr.userData.dynamic = true;
    return {g, beltTex, scr, scrM, scrOn, scrOff, warn};
  }

  /* ---------- 跑者（公尺為單位）---------- */
  function makeRunner(shirt, pantsC){
    const g = new THREE.Group();
    const skin = M(0xf1c9a5), top = M(shirt), pants = M(pantsC), hair = M(0x2a211c), shoe = M(0xf2f2f2);
    const body = new THREE.Group(); body.position.y = .92; g.add(body);
    const leg = x => { const hip = new THREE.Group(); hip.position.set(x,0,0); body.add(hip);
      hip.add(box(.13,.44,.14,pants,0,-.22,0));
      const knee = new THREE.Group(); knee.position.y = -.44; hip.add(knee);
      knee.add(box(.11,.42,.12,pants,0,-.21,0), box(.12,.07,.24,shoe,0,-.44,-.04));
      return {hip, knee}; };
    const L = leg(.09), R = leg(-.09);
    body.add(box(.36,.56,.2,top,0,.3,0));
    const arm = x => { const sh = new THREE.Group(); sh.position.set(x,.52,0); body.add(sh);
      sh.add(box(.09,.3,.1,top,0,-.14,0));
      const el = new THREE.Group(); el.position.y = -.3; sh.add(el); el.add(box(.08,.26,.08,skin,0,-.13,0));
      return {sh, el}; };
    const AL = arm(.23), AR = arm(-.23);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6), skin); hd.position.y = .72; hd.castShadow = true; body.add(hd);
    body.add(box(.25,.09,.25,hair,0,.8,.01));
    g.userData.dynamic = true; g.visible = false;
    return {g, body, L, R, AL, AR, ph:Math.random()*6};
  }
  function poseRunner(r, dt, run){
    r.ph += dt * (run ? 9.5 : 0);
    const s = Math.sin(r.ph), c = Math.cos(r.ph);
    // 跑者面向 -z：大腿往前擺 ＝ rotation.x 為正
    r.L.hip.rotation.x = .75*s;  r.L.knee.rotation.x = -(.6 + .6*Math.max(0, c));
    r.R.hip.rotation.x = -.75*s; r.R.knee.rotation.x = -(.6 + .6*Math.max(0, -c));
    r.AL.sh.rotation.x = -.7*s; r.AR.sh.rotation.x = .7*s;
    r.AL.el.rotation.x = r.AR.el.rotation.x = 1.3;
    r.body.position.y = .92 + .04*Math.abs(Math.cos(r.ph));
    r.body.rotation.x = -.12;
  }

  /* ---------- 時段計算（90 分鐘一段）---------- */
  const pad = n => String(n).padStart(2,'0');
  const fmt = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
  function slotsAt(date){
    const m = date.getHours()*60 + date.getMinutes(), o = OPEN_H*60, c = CLOSE_H*60;
    if(m < o) return {open:false, now:null, next:{start:fmt(o), end:fmt(o+SLOT_MIN), day:'今日'}};
    if(m >= c) return {open:false, now:null, next:{start:fmt(o), end:fmt(o+SLOT_MIN), day:'明日'}};
    const k = Math.floor((m-o)/SLOT_MIN), s = o + k*SLOT_MIN, e = Math.min(c, s+SLOT_MIN);
    const next = e >= c ? {start:fmt(o), end:fmt(o+SLOT_MIN), day:'明日'} : {start:fmt(e), end:fmt(Math.min(c, e+SLOT_MIN)), day:''};
    return {open:true, now:{start:fmt(s), end:fmt(e)}, next, key:k};
  }

  /* ---------- 使用情形看板 ---------- */
  function makeBoard(){
    const c = document.createElement('canvas'); c.width = 640; c.height = 400;
    const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const draw = info => {
      x.fillStyle = '#fff8ec'; x.fillRect(0,0,640,400);
      x.fillStyle = '#3b2a1a'; x.fillRect(0,0,640,78);
      x.fillStyle = '#fff8ec'; x.font = `700 40px ${FONT}`; x.textBaseline = 'middle'; x.fillText('跑步機使用情形', 26, 41);
      x.font = `700 26px ${FONT}`; x.textAlign = 'right';
      x.fillStyle = info.open ? '#7fd88f' : '#f0a07a'; x.fillText(info.status, 614, 41); x.textAlign = 'left';
      const row = (y, label, time, what, n, accent) => {
        x.fillStyle = accent; x.fillRect(26, y, 10, 104);
        x.fillStyle = '#7a6a58'; x.font = `700 26px ${FONT}`; x.fillText(label, 54, y+24);
        x.fillStyle = '#3b2a1a'; x.font = `700 40px ${FONT}`; x.fillText(time, 54, y+72);
        x.textAlign = 'right'; x.fillStyle = '#7a6a58'; x.font = `700 24px ${FONT}`; x.fillText(what, 614, y+24);
        x.fillStyle = '#3b2a1a'; x.font = `900 58px ${FONT}`; x.fillText(n, 614, y+74); x.textAlign = 'left';
      };
      row(100, '本時段', info.nowTime, '感應扣借出', info.nowN, '#4fa36b');
      row(222, '下一時段', info.nextTime, '已登記', info.nextN, '#f2a516');
      x.fillStyle = '#7a6a58'; x.font = `500 22px ${FONT}`; x.fillText('每次借用上限 90 分鐘・開放 09:00–21:00', 26, 368);
      tex.needsUpdate = true;
    };
    const g = new THREE.Group();
    g.add(box(.05,1.25,.05,mat.frame,-.5,.62,-.07), box(.05,1.25,.05,mat.frame,.5,.62,-.07));
    g.add(box(1.24,.8,.04,mat.frame,0,1.12,-.025));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.16,.725), new THREE.MeshBasicMaterial({map:tex}));
    face.position.set(0,1.12,.003); g.add(face);
    return {g, draw};
  }

  /* ---------- 暫停開放吊牌 ---------- */
  function makeCloseSign(){
    const g = new THREE.Group(); g.userData.dynamic = true; g.visible = false;
    [-.42,.42].forEach(x => g.add(box(.012,.3,.012,mat.frame,x,.17,0,false)));
    g.add(box(1.04,.4,.04,mat.tmRed,0,-.02,0));
    const c = document.createElement('canvas'); c.width = 512; c.height = 180;
    const ctx = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.98,.345), new THREE.MeshBasicMaterial({map:tex})); face.position.z = .022; g.add(face);
    let last = null;
    function draw(reason){
      if(reason === last) return; last = reason;
      ctx.fillStyle = '#c4281f'; ctx.fillRect(0,0,512,180);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 76px ${FONT}`; ctx.fillText('暫停開放', 256, 70);
      ctx.font = `700 40px ${FONT}`; ctx.fillText(`${reason}中`, 256, 142);
      tex.needsUpdate = true;
    }
    return {g, draw};
  }

  /* ---------- 建造 ---------- */
  function build(group){
    const S = {data:null, slotKey:null, runners:[], tms:[], lastMin:-1};
    const stat = new THREE.Group(); group.add(stat);
    // 木棧道地板（空中花園風格）
    stat.add(box(4.6,.08,3.3,mat.deckDark,0,.04,0));
    for(let z=-1.55; z<1.6; z+=.22) stat.add(box(4.5,.03,.18,mat.deck,0,.095,z,false));
    const FL = .11;
    // 後牆（白色＋灰色腰帶）與鏡牆、側邊玻璃、冷氣
    stat.add(box(4.6,1.75,.12,mat.wall,0,FL+.875,-1.6));
    stat.add(box(4.6,.12,.13,mat.wallBand,0,FL+.3,-1.59));
    stat.add(box(2.6,1.0,.02,mat.mirror,0,FL+.95,-1.53));
    stat.add(box(.12,1.75,3.3,mat.wall,-2.24,FL+.875,0));
    stat.add(box(.6,.2,.16,mat.ac,1.6,FL+1.45,-1.47));
    // 右側玻璃牆（通往空中花園，門窗隨手關）＋框
    const glass = box(.04,1.6,2.6,mat.glass.clone(),2.26,FL+.8,-.25,false); glass.userData.dynamic = true; group.add(glass);
    [-1.55,-.25,1.05].forEach(z => stat.add(box(.07,1.7,.07,mat.frame,2.26,FL+.85,z)));
    stat.add(box(.07,.07,2.67,mat.frame,2.26,FL+1.68,-.25));
    // 頂部樑架（不加屋頂，方便看到室內）
    stat.add(box(4.6,.08,.1,mat.frame,0,FL+1.8,-1.55), box(.1,.08,3.3,mat.frame,-2.2,FL+1.8,0), box(.1,.08,3.3,mat.frame,2.2,FL+1.8,0));
    for(let x=-1.6; x<2; x+=.8) stat.add(box(.04,.04,3.2,mat.frame,x,FL+1.8,0));
    // 吊燈（開放中亮、閉館暗）＋室內暖光：材質共用，切換時只換顏色，不重建
    S.lampM = M(0xfff1c8,{emissive:0xffd88a, emissiveIntensity:1.1, roughness:.4});
    const lamps = new THREE.Group(); lamps.userData.dynamic = true; group.add(lamps);
    [[-1.2,-.7],[.4,-.7],[-1.2,.6],[.4,.6]].forEach(([x,z]) => {
      lamps.add(box(.012,.16,.012,mat.frame,x,FL+1.7,z,false));
      lamps.add(box(.5,.04,.16,S.lampM,x,FL+1.6,z,false));
    });
    S.glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.9), new THREE.MeshBasicMaterial({color:0xffc870, transparent:true, opacity:.16, depthWrite:false, blending:THREE.AdditiveBlending}));
    S.glow.rotation.x = -Math.PI/2; S.glow.position.set(0,FL+.012,-.1); S.glow.userData.dynamic = true; group.add(S.glow);
    S.glassM = glass.material;
    // 暫停開放吊牌（保養、清潔、施工、天候、其他；非開放時間不掛）
    S.closeSign = makeCloseSign(); S.closeSign.g.position.set(.25, FL+1.38, 1.62); group.add(S.closeSign.g);
    // 跑步機 ×2，面向鏡牆
    [-.7,.7].forEach((x,i) => {
      const tm = makeTreadmill(); tm.g.scale.setScalar(S_M); tm.g.position.set(x,FL,-.35);
      group.add(tm.g); S.tms.push(tm);
      const r = makeRunner(i ? 0xd9682b : 0x3d6fb0, i ? 0x3a3f4a : 0x2f3540); r.g.scale.setScalar(S_M);
      r.g.position.set(x, FL + .23*S_M, -.35 + .25*S_M); group.add(r.g); S.runners.push(r);
    });
    // 地墊、置物籃、純水提醒小牌
    stat.add(box(1.3,.02,.9,M(0x3f6f8f),-1.35,FL+.01,1.0,false));
    stat.add(box(.4,.22,.3,mat.white,-1.95,FL+.11,1.35));
    // 前緣植栽槽（空中花園）
    [-1.7,-.6,.5].forEach(x => {
      stat.add(box(.8,.28,.32,mat.planter,x,FL+.14,1.82));
      stat.add(box(.74,.04,.26,mat.soil,x,FL+.28,1.82,false));
      for(let k=-1;k<=1;k++){ const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.15,0), (k&1)?mat.leaf:mat.leafB); b.position.set(x+k*.24,FL+.38,1.82); b.castShadow = true; stat.add(b); }
    });
    // 使用情形看板（木棧道外右前方的草地上，朝向鏡頭）
    const board = makeBoard(); board.g.position.set(3.1, 0, 1.7); board.g.rotation.y = .7; group.add(board.g); S.board = board;
    // 島上其他地方：樹
    const deco = new THREE.Group(); group.add(deco);
    [[-4.0,-1.6,.9],[3.9,-2.3,.85],[3.6,2.9,.8],[-3.5,2.7,.8],[0.6,-4.2,.75],[-1.6,4.2,.7]].forEach(([x,z,s]) => tree(deco,x,z,s));
    mergeStatic(stat); mergeStatic(deco);
    group.userData.gymx = S;
    refresh(group, true);
    return group;
  }

  /* ---------- 依資料與時間更新 ---------- */
  function refresh(group, force){
    const S = group.userData.gymx; if(!S) return;
    const now = new Date(), min = now.getHours()*60 + now.getMinutes();
    if(!force && min === S.lastMin) return;
    S.lastMin = min;
    const d = S.data || {}, sl = slotsAt(now);
    const open = typeof d.open === 'boolean' ? (d.open && sl.open) : sl.open;
    const sNow = d.slotNow || sl.now, sNext = d.slotNext || sl.next;
    const num = v => typeof v === 'number' ? String(v) : '—';
    const broken = Math.max(0, Math.min(2, d.broken|0));
    // 暫停開放＝管委會設的關閉時段（有原因類別）；「非開放時間」只是閉館
    const paused = !open && !!d.closedReason && d.closedReason !== '非開放時間';
    S.lampM.color.setHex(open ? 0xfff1c8 : 0x8c8f94); S.lampM.emissive.setHex(open ? 0xffd88a : 0x000000);
    S.glow.visible = open;
    S.glassM.emissive.setHex(open ? 0xffd890 : 0x000000); S.glassM.emissiveIntensity = open ? .35 : 0; S.glassM.opacity = open ? .45 : .35;
    S.closeSign.g.visible = paused; if(paused) S.closeSign.draw(d.closedReason);
    S.board.draw({
      open,
      status: open ? '開放中' : (paused ? `暫停開放（${d.closedReason}）` : '已閉館'),
      nowTime: open && sNow ? `${sNow.start}–${sNow.end}` : '目前不開放',
      nowN: open ? num(d.slotNow && d.slotNow.borrowed) : '0',
      nextTime: sNext ? `${sNext.day || ''}${sNext.day ? ' ' : ''}${sNext.start}–${sNext.end}` : '—',
      nextN: num(d.slotNext && d.slotNext.booked)
    });
    // 跑步人數：本時段借出數（沒有資料時開放中放 1 人示意），不超過可用跑步機
    const avail = 2 - broken;
    let n = 0;
    if(open){ const b = d.slotNow && d.slotNow.borrowed; n = typeof b === 'number' ? b : (S.data ? 0 : 1); }
    n = Math.max(0, Math.min(avail, n));
    S.tms.forEach((tm,i) => {
      const isBroken = i >= 2 - broken;                    // 由右側（靠玻璃）那台開始標維修中
      tm.warn.visible = isBroken;
      const run = !isBroken && i < n;                      // 可用的跑步機都在左側，依序放人
      tm.running = run;
      S.runners[i].g.visible = run;
      tm.scrM.map = run ? tm.scrOn : tm.scrOff; tm.scrM.needsUpdate = true;
    });
  }

  function update(group, data){ const S = group.userData.gymx; if(!S) return; S.data = data || null; refresh(group, true); }
  function empty(group){ const S = group.userData.gymx; if(!S) return; S.data = {}; refresh(group, true); }
  function tick(group, dt, t){
    const S = group.userData.gymx; if(!S) return;
    refresh(group, false);
    S.tms.forEach((tm,i) => {
      if(tm.running){ tm.beltTex.offset.y -= dt * 1.4; poseRunner(S.runners[i], dt, true); }
    });
  }

  const api = {build, update, empty, tick};
  (window.SceneProps = window.SceneProps || {}).gym = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
