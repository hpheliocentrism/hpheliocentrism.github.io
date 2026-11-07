/* =========================================================
   網站/scene/props/ev.js — 充電車位島造景（美術 3D）
   島本身與其他島相同（草地六角島），中央放一組小模型：
     抬高的街道平台（閘門、B1 標誌）→ 旋轉車道繞一圈下到地面層 → 下坡後約一台車距離就是唯一的充電車位（壁掛式充電盒）。
   「地下一樓」直接畫在島的地面上，只用赭橘色牆、灰色地坪、燈管與管線表現地下室。
   依已通過的充電樁辦法：社區沒有公共充電位，住戶在自有車位牆上安裝壁掛式充電盒（上緣離地約 130–150 公分）。
   使用的住戶變多時，不增加車位，改成多台車「輪流」進場充電。
   對外：{ build(group), update(group, data), empty(group) }
   選用：tick(group, dt, t)
   data：ev.stats 的 data；只用 installed（已安裝充電樁數 → 輪流的車輛數，1–9；0 ＝ 不播放）。沒有資料時為 1。
   不顯示任何戶號、車位編號、姓名。
   依賴：全域 THREE（r128）
   ========================================================= */
(function(){
  if(!window.THREE) return;
  const THREE = window.THREE;
  // ---- 模型座標（相對於島中央的模型群組）----
  const FLOOR = .05;                                     // 「地下一樓」地坪（島的地面）
  const TOP = 1.57;                                      // 街道平台路面
  const SP = {cx:-1.4, cz:-.7, r:.85, ri:.42, ro:1.25};  // 旋轉車道：圓心、行車線半徑、內外半徑
  const LANE_X = SP.cx + SP.r;                           // 平台車道中心線（＝旋轉車道起點）
  const DECK_Z = -2.0;                                   // 街道平台前緣
  const GATE_Z = -2.9;
  const STALL = {x:.85, z:-1.15};                        // 唯一的充電車位（車尾朝後牆）
  const BACK_Z = -1.75;                                  // 車位後牆
  const TURN_Z = .15;                                    // 下坡後轉向用的空間
  const MAX_CARS = 9;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({color:c, flatShading:true, roughness:.9, metalness:0}, o));
  const mat = {
    concrete:M(0x9a9b9e), floor:M(0x2c2d30,{emissive:0x2c2d30, emissiveIntensity:.15}),
    terracotta:M(0x8f3e1c,{emissive:0x8f3e1c, emissiveIntensity:.15}), wallGrey:M(0x2f3236,{emissive:0x2f3236, emissiveIntensity:.1}),
    rampTop:M(0x5d5f63,{emissive:0x5d5f63, emissiveIntensity:.1}),
    pipe:M(0xb9bcc0,{metalness:.3, roughness:.5}), tube:M(0xffffff,{emissive:0xf4f8ff, emissiveIntensity:1.1}),
    line:M(0xf4f4f0,{emissive:0xf4f4f0, emissiveIntensity:.15}),
    asphalt:M(0x55534f), walk:M(0xc9c3b8), white:M(0xfaf5ea),
    leaf:M(0x6fa84a), leafB:M(0x8dbb4f), trunk:M(0x8a5a32), metal:M(0x8f9499,{metalness:.3, roughness:.6}),
    yellow:M(0xf2c230), black:M(0x232325), red:M(0xc8302a), mirror:M(0xd8dde2,{metalness:.8, roughness:.15}), orange:M(0xe0752f),
    chargerBody:M(0xf3f4f5,{roughness:.4}), chargerDark:M(0x2b2d31), cable:M(0x1d1d1f)
  };
  // 輪流進場的車：第 1 台是白色 Model 3，之後依安裝數量增加（顏色、車型不同，不代表特定住戶）
  const CARS = [
    {color:0xf4f4f2, suv:false}, {color:0x4d545c, suv:true}, {color:0xb8352c, suv:false},
    {color:0x2c4f7c, suv:true},  {color:0xc9c7c2, suv:false}, {color:0x26272a, suv:true},
    {color:0x4f7d5a, suv:false}, {color:0xe8e2d6, suv:true},  {color:0xd9772b, suv:false}
  ];
  const SHIRTS = [0x3d6fb0, 0xd9682b, 0x4fa36b, 0x8a5bb0, 0xc8302a, 0x2b7c8a, 0xb0893d, 0x5c6470, 0xe0a33a];

  /* ---------- 小工具 ---------- */
  const box = (w,h,d,m,x=0,y=0,z=0,cast=true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); o.position.set(x,y,z); o.castShadow = cast; o.receiveShadow = true; return o; };
  const cyl = (rt,rb,h,s,m,x=0,y=0,z=0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s), m); o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; return o; };
  // 長方形範圍：x1..x2、z1..z2，y0..y1
  const block = (x1,z1,x2,z2,y0,y1,m,cast=true) => box(x2-x1, y1-y0, z2-z1, m, (x1+x2)/2, (y0+y1)/2, (z1+z2)/2, cast);
  function tree(g,x,z,s=1){
    g.add(cyl(.12*s,.16*s,.7*s,5,mat.trunk,x,.35*s,z));
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(.62*s,0), Math.random()>.5?mat.leaf:mat.leafB);
    c.position.set(x,1.05*s,z); c.castShadow = true; g.add(c);
  }
  // 不會動的零件依材質合併（與 scene.js 的 mergeStatic 相同做法）
  function mergeStatic(root){
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map();
    (function visit(o){
      if(o !== root && o.userData.dynamic) return;
      if(o.isMesh && !o.isInstancedMesh && o.visible && o.geometry.attributes.position){
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
  function signTexture(text, bg, fg){
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0,0,512,128);
    x.fillStyle = fg; x.font = `700 70px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text,256,68);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function hazardTexture(){
    const c = document.createElement('canvas'); c.width = 16; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#f2c230'; x.fillRect(0,0,16,128);
    x.fillStyle = '#1f1f1f'; for(let i=-16;i<128;i+=24){ x.beginPath(); x.moveTo(0,i); x.lineTo(16,i+12); x.lineTo(16,i+24); x.lineTo(0,i+12); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function stripeTexture(){
    const c = document.createElement('canvas'); c.width = 64; c.height = 4;
    const x = c.getContext('2d'); for(let i=0;i<8;i++){ x.fillStyle = i%2 ? '#ffffff' : '#d62d24'; x.fillRect(i*8,0,8,4); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  const helixY = a => TOP - (TOP-FLOOR) * a / (Math.PI*2);
  // 旋轉車道：從平台高度繞一圈降到地面層（含外側矮牆、中央圓柱、止滑線）
  function spiralRamp(){
    const N = 72, pos = [], wall = [];
    const P = (r,a,dy=0) => [SP.cx + r*Math.cos(a), helixY(a)+dy, SP.cz + r*Math.sin(a)];
    const quad = (arr, a,b,c,d) => arr.push(...a,...b,...c, ...a,...c,...d);
    for(let i=0;i<N;i++){
      const a0 = i/N*Math.PI*2, a1 = (i+1)/N*Math.PI*2;
      quad(pos, P(SP.ri,a0), P(SP.ri,a1), P(SP.ro,a1), P(SP.ro,a0));
      quad(pos, P(SP.ri,a0,-.06), P(SP.ro,a0,-.06), P(SP.ro,a1,-.06), P(SP.ri,a1,-.06));
      quad(pos, P(SP.ro,a0), P(SP.ro,a1), P(SP.ro,a1,-.06), P(SP.ro,a0,-.06));
      quad(wall, P(SP.ro,a0,.2), P(SP.ro,a1,.2), P(SP.ro,a1), P(SP.ro,a0));
      quad(wall, P(SP.ro-.04,a0), P(SP.ro-.04,a1), P(SP.ro-.04,a1,.2), P(SP.ro-.04,a0,.2));
    }
    const mk = (arr, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr,3)); g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(arr.length/3*2).fill(0),2)); const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };
    const rampM = mat.rampTop.clone(); rampM.side = THREE.DoubleSide;
    const wallM = mat.terracotta.clone(); wallM.side = THREE.DoubleSide;
    const grp = new THREE.Group();
    grp.add(mk(pos, rampM), mk(wall, wallM));
    grp.add(cyl(SP.ri, SP.ri, TOP-FLOOR, 16, mat.terracotta, SP.cx, (TOP+FLOOR)/2, SP.cz));
    for(let i=1;i<12;i++){ const a = i/12*Math.PI*2, [x,y,z] = P((SP.ri+SP.ro)/2, a);
      const st = box(.03,.006,.7,mat.yellow,x,y+.006,z,false); st.rotation.y = -a; grp.add(st); }
    return grp;
  }

  /* ---------- 車、人、充電盒 ---------- */
  function makeEV(spec){
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const body = M(spec.color,{metalness:.25,roughness:.35}), glass = M(0x1a1f26,{roughness:.15,metalness:.4});
    const ext = (pts,w,m) => { const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z,y]) => new THREE.Vector2(z,y))), {depth:w, bevelEnabled:false}); geo.rotateY(-Math.PI/2); geo.translate(w/2,0,0); const mesh = new THREE.Mesh(geo,m); mesh.castShadow = true; return mesh; };
    const sedan = [[-.56,.075],[.55,.075],[.575,.12],[.565,.17],[.45,.2],[.2,.245],[-.02,.355],[-.27,.35],[-.5,.255],[-.565,.22],[-.575,.13]];
    const sedanG = [[.2,.249],[-.02,.359],[-.27,.354],[-.5,.259],[-.47,.24],[.18,.24]];
    const suv = [[-.56,.085],[.55,.085],[.575,.13],[.565,.2],[.42,.245],[.22,.27],[.06,.41],[-.46,.41],[-.56,.33],[-.575,.15]];
    const suvG = [[.22,.274],[.06,.414],[-.46,.414],[-.545,.335],[-.52,.27],[.2,.27]];
    const s = spec.suv, H = s ? 1.12 : 1;
    g.add(ext(s ? suv : sedan, .46, body));
    g.add(ext(s ? suvG : sedanG, .468, glass));
    g.add(box(.462,.03,1.0,M(0x2a2a2c),0,.09,0,false));
    const wheels = [];
    [[.215,.36],[-.215,.36],[.215,-.36],[-.215,-.36]].forEach(([x,z]) => {
      const w = cyl(.085*H,.085*H,.06,12,mat.black,x,.085*H,z); w.rotation.z = Math.PI/2;
      w.add(cyl(.05,.05,.062,8,M(0x9a9da2,{metalness:.6}),0,0,0)); w.add(box(.09,.064,.014,M(0x6d7075),0,0,0,false));
      g.add(w); wheels.push(w);
    });
    const head = M(0xfff3cf,{emissive:0xfff0c0, emissiveIntensity:.9}), tail = M(0xb3121a,{emissive:0xff2a2a, emissiveIntensity:.6});
    [.15,-.15].forEach(x => { g.add(box(.1,.012,.012,head,x,.165*H,.565,false)); g.add(box(.12,.025,.012,tail,x,.21*H,-.572,false)); });
    [.25,-.25].forEach(x => g.add(box(.045,.025,.05,body,x,.26*H,.17,false)));
    const door = new THREE.Group(); door.position.set(.232,0,.3);
    door.add(box(.012,.15*H,.3,body,0,.165*H,-.15,false), box(.012,.075,.26,glass,0,.29*H,-.15,false)); g.add(door);
    const port = new THREE.Object3D(); port.position.set(.25,.215*H,-.47); g.add(port);
    const portGlow = box(.012,.022,.032,M(0x3ddc84,{emissive:0x3ddc84, emissiveIntensity:1}),.236,.215*H,-.47,false); portGlow.visible = false; g.add(portGlow);
    g.visible = false; g.userData.dynamic = true;
    return {g, wheels, door, port, portGlow};
  }
  function makePerson(shirtColor){
    const g = new THREE.Group();
    const skin = M(0xf1c9a5), shirt = M(shirtColor), pants = M(0x2f3540), hair = M(0x2a211c), shoe = M(0x222222);
    const leg = x => { const p = new THREE.Group(); p.position.set(x,.2,0); p.add(box(.05,.2,.06,pants,0,-.1,0), box(.055,.03,.085,shoe,0,-.19,.012)); g.add(p); return p; };
    const arm = x => { const p = new THREE.Group(); p.position.set(x,.36,0); p.add(box(.035,.16,.04,shirt,0,-.08,0)); const h = box(.035,.03,.035,skin,0,-.17,0); p.add(h); g.add(p); return {p,h}; };
    const legL = leg(.035), legR = leg(-.035);
    g.add(box(.13,.17,.08,shirt,0,.29,0));
    const aL = arm(.085), aR = arm(-.085);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(.055,8,6), skin); hd.position.y = .43; hd.castShadow = true; g.add(hd);
    g.add(box(.115,.04,.115,hair,0,.475,-.005));
    g.visible = false; g.userData.dynamic = true;
    return {g, legL, legR, armL:aL.p, armR:aR.p, hand:aR.h, phase:0};
  }
  // 壁掛式充電盒：掛在車位後牆，上緣離地約 140 公分（本場景 1 單位約 4 公尺）
  function makeWallCharger(x){
    const g = new THREE.Group(); g.position.set(x, FLOOR, BACK_Z);
    const led = M(0x222222,{emissive:0x8fd3ff, emissiveIntensity:.6});
    g.add(box(.13,.19,.045,mat.chargerBody,0,.255,.025));
    g.add(box(.11,.03,.048,mat.chargerDark,0,.32,.027,false));
    g.add(box(.06,.012,.05,led,0,.28,.028,false));
    g.add(box(.035,.05,.05,mat.chargerDark,.1,.22,.03));
    const anchor = (ax,ay,az) => { const o = new THREE.Object3D(); o.position.set(ax,ay,az); g.add(o); return o; };
    const top = anchor(0,.17,.05), holster = anchor(.1,.21,.07), front = anchor(.08,0,.32);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(.05,.009,5,14), mat.cable); coil.position.set(-.11,.2,.04); coil.castShadow = true;
    const drop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.17,.05), new THREE.Vector3(.02,.08,.07), new THREE.Vector3(.1,.21,.07)),8,.009,5,false), mat.cable);
    const stow = new THREE.Group(); stow.add(coil, drop); g.add(stow);
    g.userData.dynamic = true;
    return {g, led, top, holster, front, stow};
  }
  function makeChargeLabel(){
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false}));
    sprite.scale.set(.95,.36,1); sprite.visible = false; sprite.renderOrder = 10;
    const set = (k, done) => {
      x.clearRect(0,0,256,96);
      x.fillStyle = 'rgba(255,248,236,.95)'; x.fillRect(4,4,248,88);
      x.fillStyle = '#3b2a1a'; x.font = `700 30px ${FONT}`;
      x.fillText(done ? '充電完成 ✓' : '充電中 ' + Math.round(k*100) + '%', 20, 42);
      x.fillStyle = '#e4d6c0'; x.fillRect(20,58,216,18);
      x.fillStyle = '#3ddc84'; x.fillRect(20,58,216*k,18);
      tex.needsUpdate = true;
    };
    return {sprite, set};
  }

  /* ---------- 建造 ---------- */
  function build(group){
    // 島體沿用 scene.js 的六角草地島；只在中央加模型
    const S = {cars:[], people:[], count:1, active:true};
    const mod = new THREE.Group(); mod.position.set(.4, 0, 1.6); group.add(mod);   // 整組模型移到島中央
    const stat = new THREE.Group(); mod.add(stat);

    // 「地下一樓」地坪（島地面上的一塊灰色樓板）
    stat.add(block(-2.75,-1.85, 2.4,1.2, 0,FLOOR, mat.floor));
    // 街道平台（地面層，抬高）：混凝土量體＋柏油路面＋人行道
    stat.add(block(LANE_X-.7,-4.35, LANE_X+.95,DECK_Z, 0,TOP-.02, mat.concrete));
    stat.add(block(LANE_X-.42,-4.35, LANE_X+.42,DECK_Z, TOP-.02,TOP, mat.asphalt, false));
    stat.add(block(LANE_X+.42,-4.35, LANE_X+.95,DECK_Z, TOP-.02,TOP+.04, mat.walk, false));
    stat.add(block(LANE_X-.7,DECK_Z-.04, LANE_X+.95,DECK_Z, .05,TOP-.25, mat.terracotta, false));  // 平台面向停車區的牆面
    // 平台到旋轉車道起點的短橋
    stat.add(block(LANE_X-.42,DECK_Z, LANE_X+.42,SP.cz, TOP-.1,TOP, mat.concrete));
    stat.add(cyl(.05,.05,TOP-FLOOR-.1,8,mat.concrete,LANE_X+.3,(TOP+FLOOR)/2-.05,(DECK_Z+SP.cz)/2));
    [LANE_X-.46, LANE_X+.46].forEach(x => { for(let z=DECK_Z; z<SP.cz; z+=.3) stat.add(box(.03,.22,.03,mat.metal,x,TOP+.11,z)); stat.add(box(.025,.025,SP.cz-DECK_Z,mat.metal,x,TOP+.22,(DECK_Z+SP.cz)/2)); });
    // 閘門與 B1 標誌
    stat.add(box(.14,.36,.14,mat.white,LANE_X+.55,TOP+.18,GATE_Z));
    const stripeM = new THREE.MeshStandardMaterial({map:stripeTexture(), flatShading:true});
    const gate = new THREE.Group(); gate.position.set(LANE_X+.55,TOP+.33,GATE_Z); gate.add(box(.98,.035,.035,stripeM,-.49,0,0));
    gate.userData.dynamic = true; mod.add(gate); S.gate = gate;
    stat.add(cyl(.02,.02,.9,6,mat.metal,LANE_X+.75,TOP+.45,-3.5));
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(.5,.18), new THREE.MeshBasicMaterial({map:signTexture('B1 停車場','#2c6fb7','#ffffff')}));
    b1.position.set(LANE_X+.75,TOP+.86,-3.48); stat.add(b1);

    // 旋轉車道
    stat.add(spiralRamp());

    // 車位區：後牆（赭橘＋上段深灰）、側牆、柱子護角、頂板（上有燈管與管線）
    stat.add(block(.25,BACK_Z-.06, 1.75,BACK_Z, FLOOR,TOP-.35, mat.terracotta));
    stat.add(block(.25,BACK_Z-.06, 1.75,BACK_Z, TOP-.35,TOP-.08, mat.wallGrey));
    stat.add(block(1.75,BACK_Z-.06, 1.81,-.35, FLOOR,TOP-.08, mat.terracotta));
    stat.add(block(.25,BACK_Z-.06, 1.81,-.35, TOP-.08,TOP, mat.concrete));
    const hz = new THREE.MeshStandardMaterial({map:hazardTexture(), flatShading:true, roughness:.9});
    stat.add(block(.25,BACK_Z, .43,BACK_Z+.18, FLOOR,TOP-.08, mat.terracotta));
    stat.add(box(.03,.32,.19,hz,.445,FLOOR+.2,BACK_Z+.09,false));
    stat.add(box(.36,.02,.045,mat.tube,1.0,TOP-.11,-.9,false));
    { const p = cyl(.03,.03,1.5,6,mat.pipe,1.0,TOP-.18,-1.45); p.rotation.z = Math.PI/2; stat.add(p); }
    // 車位白線（不顯示編號）
    const line = (w,d,x,z) => stat.add(box(w,.008,d,mat.line,x,FLOOR+.004,z,false));
    line(.025,1.25,STALL.x-.36,BACK_Z+.62); line(.025,1.25,STALL.x+.36,BACK_Z+.62); line(.745,.025,STALL.x,BACK_Z+1.25);
    // 凸面反光鏡（旋轉車道出口旁）
    const mp = new THREE.Group(); mp.position.set(LANE_X+.55, 0, .55);
    mp.add(cyl(.02,.02,1.0,6,mat.metal,0,.5,0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.13,.025,6,16), mat.orange); ring.position.set(0,1.05,0); ring.rotation.y = -.6; mp.add(ring);
    const mir = new THREE.Mesh(new THREE.SphereGeometry(.13,12,6,0,Math.PI*2,0,Math.PI/2), mat.mirror); mir.rotation.x = Math.PI/2; mir.rotation.z = -.6; mir.position.set(0,1.05,0); mp.add(mir);
    stat.add(mp);

    // 壁掛充電盒（車子左後方）
    const ch = makeWallCharger(STALL.x + .26); mod.add(ch.g); S.ch = ch;

    // 島上其他地方：與其他島相同的樹木與矮樹叢
    const deco = new THREE.Group(); group.add(deco);
    [[-4.2,-1.2,.9],[4.2,-1.8,.85],[3.8,2.6,.8],[-3.6,2.8,.8],[1.2,-4.4,.75],[-2.0,4.3,.7]].forEach(([x,z,s]) => tree(deco,x,z,s));
    for(let a=0; a<Math.PI*2; a+=.32){ const x = Math.cos(a)*4.6, z = Math.sin(a)*4.6;
      if(Math.abs(x) > 4.4) continue;
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,0), Math.random()>.5?mat.leaf:mat.leafB); h.scale.set(1,.7,1); h.position.set(x,.12,z); h.castShadow = true; deco.add(h); }

    mergeStatic(stat); mergeStatic(deco);

    // 動畫角色：輪流進場的車與駕駛（需要時才建立）、充電槍、纜線、充電進度
    const conn = box(.035,.035,.08,mat.black); conn.userData.dynamic = true; mod.add(conn);
    const cable = new THREE.Mesh(new THREE.BufferGeometry(), mat.cable); cable.visible = false; cable.userData.dynamic = true; mod.add(cable);
    const label = makeChargeLabel(); mod.add(label.sprite);
    S.conn = conn; S.cable = cable; S.label = label; S.mod = mod;
    S.carAt = i => {
      if(!S.cars[i]){ const c = makeEV(CARS[i % CARS.length]); mod.add(c.g); S.cars[i] = c;
        const p = makePerson(SHIRTS[i % SHIRTS.length]); mod.add(p.g); S.people[i] = p; }
      return {T:S.cars[i], P:S.people[i]};
    };
    group.userData.evx = S;
    S.run = runner(mod, S);
    return group;
  }

  function setCount(group, n){
    const S = group.userData.evx;
    S.count = Math.max(0, Math.min(MAX_CARS, n|0));
    S.active = S.count > 0;
    S.ch.g.visible = S.active;
  }

  /* ---------- 動畫 ---------- */
  let DT = 0;
  function* wait(s){ for(let t=0; t<s; t+=DT) yield; }
  function* tween(s, fn){ for(let t=0; t<s;){ t += DT; fn(Math.min(1,t/s)); yield; } }
  const easeIO = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2, easeOut = t => 1-(1-t)*(1-t), easeIn = t => t*t, lin = t => t;
  const bez = (a,b,c,d,y) => t => { const u = 1-t; return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x, z:u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z, y}; };
  const seg = (a,b,y) => t => ({x:a.x+(b.x-a.x)*t, z:a.z+(b.z-a.z)*t, y});
  const helix = down => t => { const a = (down ? t : 1-t) * Math.PI*2; return {x:SP.cx + SP.r*Math.cos(a), z:SP.cz + SP.r*Math.sin(a), y:helixY(a)}; };
  const angLerp = (a,b,k) => { const d = ((b-a+Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI; return a + d*k; };

  function runner(mod, S){
    const {conn, cable, label, ch} = S, tmp = new THREE.Vector3();
    const local = o => { o.getWorldPosition(tmp); return mod.worldToLocal(tmp.clone()); };
    const car = {x:0, z:0, y:TOP, h:0, pitch:0}, pp = {x:0, z:0, h:0};
    let T = null, P = null, idx = 0, connMode = 'holster', charging = false;
    const placeCar = () => { T.g.position.set(car.x, car.y, car.z); T.g.rotation.y = car.h; T.g.rotation.x = -car.pitch; label.sprite.position.set(car.x, car.y+1.0, car.z); };
    const placeP = () => { P.g.position.set(pp.x, FLOOR, pp.z); P.g.rotation.y = pp.h; };
    const carPt = (lx,lz) => ({x:car.x + lx*Math.cos(car.h) + lz*Math.sin(car.h), z:car.z - lx*Math.sin(car.h) + lz*Math.cos(car.h)});
    function* drive(path, dur, reverse, easing){
      let prev = path(0);
      yield* tween(dur, k => {
        const t = easing(k), p = path(t), q = path(Math.min(1,t+.01)), r = path(Math.max(0,t-.01));
        const dh = Math.hypot(q.x-r.x, q.z-r.z);
        if(dh > 1e-5){ car.h = Math.atan2(q.x-r.x, q.z-r.z) + (reverse ? Math.PI : 0); car.pitch = Math.atan2((q.y-r.y) * (reverse ? -1 : 1), dh); }
        const d = Math.hypot(p.x-prev.x, p.z-prev.z); prev = p;
        T.wheels.forEach(w => w.rotation.x += (reverse ? -1 : 1) * d/.085);
        car.x = p.x; car.z = p.z; car.y = p.y; placeCar();
      });
      car.pitch = 0; placeCar();
    }
    function* gate(open){ yield* tween(.6, k => S.gate.rotation.z = -1.35 * (open ? k : 1-k)); }
    function* door(open){ yield* tween(.45, k => T.door.rotation.y = -1.1 * (open ? k : 1-k)); }
    function* fade(show){ yield* tween(.5, k => { const s = show ? k : 1-k; T.g.scale.setScalar(.6 + .4*s); T.g.visible = s > .02; }); T.g.scale.setScalar(1); T.g.visible = show; }
    function* walk(pt, holding){
      for(;;){
        const dx = pt.x-pp.x, dz = pt.z-pp.z, d = Math.hypot(dx,dz);
        if(d < .01) break;
        const st = Math.min(d, .5*DT);
        pp.x += dx/d*st; pp.z += dz/d*st; pp.h = angLerp(pp.h, Math.atan2(dx,dz), Math.min(1, DT*12));
        P.phase += DT*11; const s = Math.sin(P.phase)*.6;
        P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s*.7; if(!holding) P.armR.rotation.x = s*.7;
        placeP(); yield;
      }
      P.legL.rotation.x = P.legR.rotation.x = P.armL.rotation.x = 0; if(!holding) P.armR.rotation.x = 0;
    }
    function* face(pt){ const h = Math.atan2(pt.x-pp.x, pt.z-pp.z); yield* tween(.25, k => { pp.h = angLerp(pp.h, h, k); placeP(); }); }
    function* arm(from, to, s=.3){ yield* tween(s, k => P.armR.rotation.x = from + (to-from)*k); }
    function* getOut(seat, out){ yield* door(true); pp.x = seat.x; pp.z = seat.z; pp.h = Math.atan2(out.x-seat.x, out.z-seat.z); placeP(); P.g.visible = true; yield* walk(out); yield* door(false); }
    function* getIn(seat, out){ yield* walk(out); yield* door(true); yield* walk(seat); P.g.visible = false; yield* door(false); }

    function* script(){
      const L = LANE_X, E = {x:STALL.x, z:STALL.z};
      const spawn = {x:L, z:-4.15}, stopIn = {x:L, z:-3.55}, top = {x:L, z:SP.cz}, stopOut = {x:L, z:-2.3};
      for(;;){
        if(!S.active){ yield* wait(1); continue; }
        ({T, P} = S.carAt(idx % S.count)); idx++;
        P.g.visible = label.sprite.visible = false; connMode = 'holster'; charging = false;
        yield* wait(1.0);
        // 1. 車子出現在街道平台後端，開到閘門前
        car.x = spawn.x; car.z = spawn.z; car.y = TOP; car.h = 0; car.pitch = 0; placeCar();
        yield* fade(true);
        yield* drive(seg(spawn, stopIn, TOP), 1.2, false, easeOut);
        // 2. 閘門抬起，經短橋到旋轉車道起點，繞一圈下到地面層
        yield* gate(true);
        yield* drive(seg(stopIn, top, TOP), 2.2, false, easeIO);
        const gc = gate(false); for(const _ of gc){ yield; }
        yield* drive(helix(true), 4.6, false, lin);
        // 3. 下坡後往前約一台車距離，倒車入格
        yield* drive(bez(top, {x:L,z:TURN_Z+.1}, {x:L+.6,z:TURN_Z}, {x:E.x+.85,z:TURN_Z}, FLOOR), 1.8, false, easeOut);
        yield* wait(.3);
        yield* drive(bez({x:E.x+.85,z:TURN_Z}, {x:E.x+.2,z:TURN_Z}, {x:E.x,z:E.z+.75}, E, FLOOR), 2.6, true, easeIO);
        yield* wait(.4);
        const seat = carPt(.12,.05), out = carPt(.46,-.05), port = carPt(.46,-.5), chFront = local(ch.front), chPt = local(ch.holster);
        // 4. 下車取槍、插入充電口
        yield* getOut(seat, out);
        yield* walk(chFront); yield* face(chPt);
        yield* arm(0,-1.2); connMode = 'hand'; yield* arm(-1.2,-.7,.25);
        yield* walk(port, true); yield* face(local(T.port));
        yield* arm(-.7,-1.2,.25); connMode = 'port'; charging = true; yield* arm(-1.2,0);
        // 5. 回車上，充電 3 秒
        yield* getIn(seat, out);
        label.set(0); label.sprite.visible = true;
        yield* tween(3, k => label.set(k));
        charging = false; label.set(1, true);
        yield* wait(.7); label.sprite.visible = false;
        // 6. 下車拔槍、掛回充電盒
        yield* getOut(seat, out);
        yield* walk(port); yield* face(local(T.port));
        yield* arm(0,-1.2); connMode = 'hand'; yield* arm(-1.2,-.7,.25);
        yield* walk(chFront, true); yield* face(chPt);
        yield* arm(-.7,-1.2,.25); connMode = 'holster'; yield* arm(-1.2,0);
        yield* getIn(seat, out);
        yield* wait(.4);
        // 7. 開出車位、迴轉回旋轉車道底部，上行一圈
        yield* drive(bez(E, {x:E.x,z:TURN_Z+.2}, {x:L,z:TURN_Z+.55}, top, FLOOR), 2.6, false, easeIO);
        yield* drive(helix(false), 4.6, false, lin);
        // 8. 回到平台，閘門抬起後駛離
        yield* drive(seg(top, stopOut, TOP), 1.8, false, easeIO);
        yield* gate(true);
        yield* drive(seg(stopOut, spawn, TOP), 1.6, false, easeIn);
        yield* gate(false);
        yield* fade(false);
      }
    }
    const gen = script();
    return {
      step(dt, t){
        DT = dt; gen.next();
        if(!T){ conn.visible = false; return; }
        mod.updateMatrixWorld(true);
        const cp = connMode === 'holster' ? local(ch.holster) : connMode === 'hand' ? local(P.hand) : local(T.port);
        conn.position.copy(cp); conn.visible = S.active;
        conn.rotation.y = connMode === 'port' ? car.h : connMode === 'hand' ? pp.h : 0;
        ch.stow.visible = connMode === 'holster'; cable.visible = !ch.stow.visible;
        if(cable.visible){
          const a = local(ch.top), mid = a.clone().lerp(cp,.5); mid.y = Math.max(FLOOR+.05, Math.min(a.y,cp.y) - .2);
          cable.geometry.dispose(); cable.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, cp), 14, .009, 5, false);
        }
        ch.led.emissive.setHex(charging ? 0x3ddc84 : 0x8fd3ff);
        ch.led.emissiveIntensity = charging ? .7 + .5*Math.sin(t*6) : .6;
        T.portGlow.visible = connMode === 'port';
      }
    };
  }

  /* ---------- 對外函式 ---------- */
  function update(group, data){
    if(!group.userData.evx) return;
    if(data && typeof data.installed === 'number') setCount(group, data.installed);
  }
  function empty(group){ if(group.userData.evx) setCount(group, 0); }
  function tick(group, dt, t){ const S = group.userData.evx; if(S && S.run) S.run.step(dt, t); }

  const api = {build, update, empty, tick};
  (window.SceneProps = window.SceneProps || {}).ev = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
