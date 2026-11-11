/* =========================================================
   網站/scene/scene.js — 3D 群島場景（美術負責維護）
   由 群島網頁/index.html（2026-11-07 版）拆分而來。
   對外只提供 window.Scene（見 整合/README.md 第 4 節），不呼叫 API、不讀 token。
   島嶼清單來自 window.ISLANDS（islands/registry.js）；
   若 window.SceneProps[島id] 存在（props/<id>.js），用它的 build/update/empty/setLoading/tick，
   否則用本檔內建的 PROPS[def.prop] 預覽造景。
   依賴：全域 THREE（r128）、THREE.OrbitControls
   效能（2026-11-07 美術）：不會動的零件依材質合併成單一網格（mergeStatic）；
   會動的物件標記 userData.dynamic = true 就不會被合併。
   畫質分三段：high／medium／low；未被外部指定時，開場 4 秒內依實際幀率自動調整。
   ========================================================= */
window.Scene = (function(){
  let clickCb = () => {};
  let api = null;
  const STATUS_TEXT = {open:'已開放', building:'建置中', planned:'規劃中'};

  function init(container){
    if(api) return api;
    const ISLANDS = window.ISLANDS || [];
/* =========================================================
   二、場景與美術基準
   ========================================================= */
const R = 6, GAP = 0.45, SQ3 = Math.sqrt(3);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = container;
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffd9a0, 60, 140);
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.5, 400);
const narrow = innerWidth < 720;
camera.position.set(26, 30, 38).multiplyScalar(narrow ? 1.25 : 1);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 8; controls.maxDistance = 95;
controls.maxPolarAngle = Math.PI * 0.42;
controls.autoRotate = !reduced; controls.autoRotateSpeed = 0.35;

const hemi = new THREE.HemisphereLight(0xfff1d6, 0xb0743f, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
sun.position.set(30, 45, 20); sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera, {left:-28, right:28, top:28, bottom:-28, near:1, far:120});
scene.add(sun);

/* 共用材質（低多邊形：flatShading） */
const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({color:c, flatShading:true, roughness:.95, metalness:0}, o));
const mat = {
  grass:M(0x9cc25a), grassAlt:M(0xb8cc6a), soil:M(0xc98a4b), rock:M(0x9a6b45),
  stone:M(0xf1dfbf), wall:M(0xf3e3c8), wallDark:M(0xd8bf98), trim:M(0xf2a516), slab:M(0xe6cfa8),
  glass:M(0x7fa7b8,{roughness:.4}), glassLit:M(0x7fa7b8,{roughness:.4, emissive:0xffc865, emissiveIntensity:0}),
  door:M(0x6e4a2e), roof:M(0xc95e2c), wood:M(0x9b6a3c), cork:M(0xd9a66b), paper:M(0xfffaf0),
  leaf:M(0x6fa84a), leafB:M(0x8dbb4f), trunk:M(0x8a5a32), asphalt:M(0x6d6a66), white:M(0xfaf5ea),
  box:M(0xc99a5e), boxB:M(0xb88548), red:M(0xd9542b), green:M(0x4fa36b), metal:M(0x8f9499,{metalness:.3,roughness:.6}),
  sea:new THREE.MeshStandardMaterial({color:0x6fb7c9, roughness:.6, metalness:.1, transparent:true, opacity:.92})
};
const box = (w,h,d,m,x=0,y=0,z=0,cast=true) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
  o.position.set(x,y,z); o.castShadow = cast; o.receiveShadow = true; return o;
};
const cyl = (rt,rb,h,s,m,x=0,y=0,z=0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s), m);
  o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; return o;
};

/* =========================================================
   效能：把不會動的零件依「材質＋是否投影」合併成一個網格（外觀不變）
   - 標記 userData.dynamic 的物件與其子孫：不合併（會動、會切換顯示的東西）
   - 標記 userData.mergeRoot 的子群組：由它自己合併（例如大樓，點擊判斷要用到）
   - InstancedMesh、Sprite、隱藏中的網格：不合併
   ========================================================= */
function mergeStatic(root){
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  (function visit(o){
    if(o !== root && (o.userData.dynamic || o.userData.mergeRoot)) return;
    if(o.isMesh && !o.isInstancedMesh && o.visible && o.geometry && o.geometry.attributes.position && !Array.isArray(o.material)){
      const key = o.material.uuid + (o.castShadow ? '|c' : '|n') + (o.receiveShadow ? 'r' : '');
      if(!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    o.children.forEach(visit);
  })(root);
  const m = new THREE.Matrix4();
  buckets.forEach(parts => {
    if(parts.length < 2) return;
    let n = 0;
    const geos = parts.map(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      m.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m);
      n += g.attributes.position.count; return g;
    });
    const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2);
    let k = 0;
    geos.forEach(g => {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, k*3);
      if(g.attributes.normal) nor.set(g.attributes.normal.array, k*3);
      if(g.attributes.uv) uv.set(g.attributes.uv.array, k*2);
      k += c; g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor,3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, parts[0].material);
    mesh.castShadow = parts[0].castShadow; mesh.receiveShadow = parts[0].receiveShadow;
    parts.forEach(o => o.parent && o.parent.remove(o));
    root.add(mesh);
  });
  return root;
}

/* 海面 */
const sea = new THREE.Mesh(new THREE.CircleGeometry(160, 48), mat.sea);
sea.rotation.x = -Math.PI/2; sea.position.y = -4.2; sea.receiveShadow = true; scene.add(sea);

/* 六角島基座：草皮頂 + 土層 + 倒錐岩底 */
function hexBase(main){
  const g = new THREE.Group();
  const top = cyl(R, R, .6, 6, main ? mat.grass : mat.grassAlt, 0, -.3, 0);
  const soil = cyl(R*.97, R*.62, 2.2, 6, mat.soil, 0, -1.7, 0);
  const rock = cyl(R*.6, .6, 2.4, 6, mat.rock, 0, -4, 0);
  g.add(top, soil, rock);
  return g;
}
function tree(x,z,s=1){
  const g = new THREE.Group();
  g.add(cyl(.12*s,.16*s,.7*s,5,mat.trunk,0,.35*s,0));
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.62*s,0), Math.random()>.5?mat.leaf:mat.leafB);
  c1.position.y = 1.05*s; c1.castShadow = true; g.add(c1);
  g.position.set(x,0,z); return g;
}

/* 招牌貼圖（Canvas 文字） */
function signTexture(text, bg='#f2a516', fg='#3b2a1a'){
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0,0,512,128);
  x.fillStyle = fg; x.font = '700 66px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}


/* ---------- 電動車島：Model 3、駕駛、充電樁、充電進度標籤 ---------- */
function makeModel3(){
  const g = new THREE.Group();
  const white = M(0xf4f4f2,{metalness:.25,roughness:.35}), glass = M(0x1a1f26,{roughness:.15,metalness:.4});
  const ext = (pts,w,m) => {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z,y]) => new THREE.Vector2(z,y))), {depth:w, bevelEnabled:false});
    geo.rotateY(-Math.PI/2); geo.translate(w/2,0,0);
    const mesh = new THREE.Mesh(geo,m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  // 車身側面輪廓（流線型斜背）
  g.add(ext([[-.56,.075],[.55,.075],[.575,.12],[.565,.17],[.45,.2],[.2,.245],[-.02,.355],[-.27,.35],[-.5,.255],[-.565,.22],[-.575,.13]], .46, white));
  // 全景玻璃車頂與車窗
  g.add(ext([[.2,.249],[-.02,.359],[-.27,.354],[-.5,.259],[-.47,.24],[.18,.24]], .468, glass));
  g.add(box(.462,.03,1.0,M(0x2a2a2c),0,.09,0,false));
  const wheels = [];
  [[.215,.36],[-.215,.36],[.215,-.36],[-.215,-.36]].forEach(([x,z]) => {
    const w = cyl(.085,.085,.06,12,bmat.black,x,.085,z); w.rotation.z = Math.PI/2;
    w.add(cyl(.05,.05,.062,8,M(0x9a9da2,{metalness:.6}),0,0,0)); w.add(box(.09,.064,.014,M(0x6d7075),0,0,0,false));
    g.add(w); wheels.push(w);
  });
  [.15,-.15].forEach(x => g.add(box(.1,.012,.012,mat.lamp,x,.165,.565,false)));
  const tail = M(0xb3121a,{emissive:0xff2a2a, emissiveIntensity:.5});
  [.15,-.15].forEach(x => g.add(box(.12,.025,.012,tail,x,.21,-.572,false)));
  [.25,-.25].forEach(x => g.add(box(.045,.025,.05,white,x,.255,.17,false)));
  // 駕駛座車門（左側，鉸鏈在前緣）
  const door = new THREE.Group(); door.position.set(.232,0,.3);
  door.add(box(.012,.15,.3,white,0,.165,-.15,false), box(.012,.075,.26,glass,0,.282,-.15,false));
  g.add(door);
  // 充電口（左後）
  const port = new THREE.Object3D(); port.position.set(.25,.215,-.47); g.add(port);
  const portGlow = box(.012,.022,.032,M(0x3ddc84,{emissive:0x3ddc84, emissiveIntensity:1}),.236,.215,-.47,false); portGlow.visible = false; g.add(portGlow);
  return {g, wheels, door, port, portGlow};
}
function makePerson(){
  const g = new THREE.Group();
  const skin = M(0xf1c9a5), shirt = M(0x3d6fb0), pants = M(0x2f3540), hair = M(0x2a211c), shoe = M(0x222222);
  const leg = x => { const p = new THREE.Group(); p.position.set(x,.2,0); p.add(box(.05,.2,.06,pants,0,-.1,0), box(.055,.03,.085,shoe,0,-.19,.012)); g.add(p); return p; };
  const arm = x => { const p = new THREE.Group(); p.position.set(x,.36,0); p.add(box(.035,.16,.04,shirt,0,-.08,0)); const h = box(.035,.03,.035,skin,0,-.17,0); p.add(h); g.add(p); return {p,h}; };
  const legL = leg(.035), legR = leg(-.035);
  g.add(box(.13,.17,.08,shirt,0,.29,0));
  const aL = arm(.085), aR = arm(-.085);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.055,8,6), skin); head.position.y = .43; head.castShadow = true; g.add(head);
  g.add(box(.115,.04,.115,hair,0,.475,-.005));
  return {g, legL, legR, armL:aL.p, armR:aR.p, hand:aR.h, phase:0};
}
function makeCharger(x,z){
  const g = new THREE.Group(); g.position.set(x,.05,z);
  const led = M(0x222222,{emissive:0x8fd3ff, emissiveIntensity:.5}), dark = M(0x2b2d31);
  g.add(box(.17,.03,.13,bmat.charDark,0,.015,0));
  g.add(box(.12,.62,.085,M(0xeceef0,{roughness:.4}),0,.34,0));
  g.add(box(.125,.04,.09,dark,0,.67,0));
  g.add(box(.025,.4,.006,led,0,.38,.045,false));
  g.add(box(.05,.06,.05,dark,.085,.44,0));
  const anchor = (ax,ay,az) => { const o = new THREE.Object3D(); o.position.set(ax,ay,az); g.add(o); return o; };
  const top = anchor(.04,.62,.03), holster = anchor(.1,.44,.03), front = anchor(.12,0,.34);
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(.04,.62,.03), new THREE.Vector3(.14,.5,.09), new THREE.Vector3(.1,.44,.03)),10,.011,5,false), M(0x1d1d1f));
  g.add(coil);
  return {g, led, top, holster, front, coil};
}
function makeChargeLabel(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false}));
  sprite.scale.set(.95,.36,1); sprite.visible = false; sprite.renderOrder = 10;
  const set = (k, done) => {
    x.clearRect(0,0,256,96);
    x.fillStyle = 'rgba(255,248,236,.95)'; x.fillRect(4,4,248,88);
    x.fillStyle = '#3b2a1a'; x.font = '700 30px "Noto Sans TC","PingFang TC",sans-serif';
    x.fillText(done ? '充電完成 ✓' : '充電中 ' + Math.round(k*100) + '%', 20, 42);
    x.fillStyle = '#e4d6c0'; x.fillRect(20,58,216,18);
    x.fillStyle = '#3ddc84'; x.fillRect(20,58,216*k,18);
    tex.needsUpdate = true;
  };
  return {sprite, set};
}

/* =========================================================
   三、公告島地標：宏樸日心說大樓（模擬外觀）
   依官方外觀圖、平面圖與住戶夜間實拍：
   ・正面 A、B 戶臨民享路（北），1F 為店面；後側 C 戶臨中北三街（南），C 戶量體較前側窄
   ・東側臨中北三街176巷：大樓正門（銅色日芒紋雙開門，兩側仙人掌植栽）
   ・外牆皆為磁磚：正面米色、側牆深灰、1F 深灰丁掛磚（後側為深淺混色磚）
   ・1F 挑高：民享路側三間店面，上方黑色直條格柵
   ・1F 後側：有頂蓋的停車場（汽車、機車、無障礙車位），夜間嵌燈全開，銅色後門，上方黑色格柵量體
   ・8F 只有前側 A、B，後側為 8F 住戶露台
   ・8F 之上：健身房（玻璃屋）＋空中花園（木棧道、植栽）；再上一層為水箱（外牆包覆）
   座標：+z = 北、-x = 東
   ========================================================= */
const ROAD_TAGS = [];
Object.assign(mat, {
  lamp:M(0xfff3cf,{emissive:0xffd77a, emissiveIntensity:0}),
  signRed:M(0xc8302a,{emissive:0xff3b2f, emissiveIntensity:0}),
  lampWood:M(0xc8a46e,{emissive:0xffcf80, emissiveIntensity:0}),
  soilDark:M(0x5a4030), curb:M(0xbdb7ad), road:M(0x55534f), orange:M(0xf06a1d),
  glow:M(0x3a3632,{emissive:0xffc77a, emissiveIntensity:0}),
  gravel:M(0xd9d6cf), cactus:M(0x7f9a3c), redGrass:M(0xa0524a)
});
const parkLights = [];
/* 正門：銅色日芒紋雙開門（兩扇門片、半圓把手） */
function doorTexture(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const x = c.getContext('2d'), cx = 128, cy = 165;
  x.fillStyle = '#6f3f28'; x.fillRect(0,0,256,320);
  for(let i=0;i<420;i++){
    const a = (i/420)*Math.PI*2 + Math.random()*.01, r0 = 18+Math.random()*30, l = 120+Math.random()*120;
    x.strokeStyle = i%3 ? 'rgba(196,128,86,.6)' : 'rgba(58,28,14,.55)'; x.lineWidth = 1+Math.random()*1.4;
    x.beginPath(); x.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0); x.lineTo(cx+Math.cos(a)*l, cy+Math.sin(a)*l); x.stroke();
  }
  x.fillStyle = '#1b1b1d'; x.fillRect(126,0,4,320); x.fillRect(0,0,256,5); x.fillRect(0,0,5,320); x.fillRect(251,0,5,320);
  x.strokeStyle = '#1b1b1d'; x.lineWidth = 7;
  x.beginPath(); x.arc(122,cy,22,Math.PI/2,Math.PI*1.5); x.stroke();
  x.beginPath(); x.arc(134,cy,22,-Math.PI/2,Math.PI/2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
/* 門牌：深銅底、金色字 */
function plaqueTexture(){
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#3a2418'; x.fillRect(0,0,512,128);
  x.fillStyle = '#d8b46a'; x.font = '700 64px "Noto Serif TC","Noto Sans TC",serif'; x.textBaseline = 'middle';
  x.fillText('宏樸日心說', 28, 60);
  x.font = '500 24px Georgia,serif'; x.fillText('Heliocentrism', 352, 84);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

/* 磁磚貼圖：每 1 單位面積的磚數固定，不同大小的牆面磚縫一致 */
function tileTexture(base, grout, cols, rows, bond=false, vary=12){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = grout; x.fillRect(0,0,256,256);
  const tw = 256/cols, th = 256/rows, R0 = base>>16&255, G0 = base>>8&255, B0 = base&255;
  for(let r=0; r<rows; r++) for(let k=-1; k<cols; k++){
    const off = bond && r%2 ? tw/2 : 0, f = 1 + (Math.random()-.5)*vary/100;
    x.fillStyle = `rgb(${Math.min(255,R0*f)|0},${Math.min(255,G0*f)|0},${Math.min(255,B0*f)|0})`;
    x.fillRect(k*tw+off+1.2, r*th+1.2, tw-2.4, th-2.4);
  }
  return canvasTex(c);
}
function canvasTex(c){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
/* 人行道外側的編織磚鋪面 */
function basketTexture(base, grout){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = grout; x.fillRect(0,0,256,256);
  const s = 32, R0 = base>>16&255, G0 = base>>8&255, B0 = base&255;
  const fill = (px,py,w,h) => { const f = 1+(Math.random()-.5)*.14;
    x.fillStyle = `rgb(${Math.min(255,R0*f)|0},${Math.min(255,G0*f)|0},${Math.min(255,B0*f)|0})`; x.fillRect(px+1,py+1,w-2,h-2); };
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const px = i*s, py = j*s;
    if((i+j)%2){ fill(px,py,s,s/2); fill(px,py+s/2,s,s/2); } else { fill(px,py,s/2,s); fill(px+s/2,py,s/2,s); }
  }
  return canvasTex(c);
}
/* 後側停車場地坪：車格、無障礙標誌、斜線區、編號 */
function parkingTexture(){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 272;
  const x = c.getContext('2d');
  const PX = v => (v+2.25)/4.5*1024, PZ = v => (v+2.35)/1.2*272;
  x.fillStyle = '#cbc2b3'; x.fillRect(0,0,1024,272);
  x.strokeStyle = 'rgba(120,110,95,.35)'; x.lineWidth = 1.5;
  for(let i=0;i<=1024;i+=34){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,272); x.stroke(); }
  for(let j=0;j<=272;j+=34){ x.beginPath(); x.moveTo(0,j); x.lineTo(1024,j); x.stroke(); }
  const z0 = PZ(-2.3), z1 = PZ(-1.22), zm = (z0+z1)/2;
  const space = (a,b,col) => { x.strokeStyle = col; x.lineWidth = 6; x.strokeRect(PX(Math.min(a,b)), z0, Math.abs(PX(a)-PX(b)), z1-z0); };
  const chair = (cx,cy,s) => {
    x.fillStyle = '#3d7fc4'; x.fillRect(cx-s/2, cy-s/2, s, s);
    x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = s*.08; x.lineCap = 'round';
    x.beginPath(); x.arc(cx-s*.05, cy-s*.3, s*.08, 0, 7); x.fill();
    x.beginPath(); x.moveTo(cx-s*.08, cy-s*.18); x.lineTo(cx-s*.08, cy+s*.02); x.lineTo(cx+s*.18, cy+s*.02); x.lineTo(cx+s*.26, cy+s*.28); x.stroke();
    x.beginPath(); x.arc(cx-s*.05, cy+s*.15, s*.2, Math.PI*.6, Math.PI*2.1); x.stroke();
  };
  // 編號從街道方向讀（旋轉 180°）
  const num = (t,cx) => { x.save(); x.translate(cx, z0+26); x.rotate(Math.PI);
    x.fillStyle = '#fff'; x.font = '700 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t,0,0); x.restore(); };
  space(1.35,1.95,'#3d7fc4'); chair(PX(1.65), zm+12, 70); num('23', PX(1.65));
  x.save(); x.beginPath(); x.rect(PX(1.05), z0, PX(1.35)-PX(1.05), z1-z0); x.clip();
  x.strokeStyle = '#fff'; x.lineWidth = 7;
  for(let k=-300;k<400;k+=26){ x.beginPath(); x.moveTo(PX(1.05)+k, z0); x.lineTo(PX(1.05)+k+120, z1); x.stroke(); }
  x.restore(); space(1.05,1.35,'#3d7fc4');
  space(.45,1.05,'#fff'); num('22', PX(.75));
  [[.15,.45,'1'],[-.15,.15,'2'],[-.63,-.33,'3']].forEach(([a,b,t]) => { space(a,b,'#fff'); num(t, PX((a+b)/2)); });
  [[-1.04,-.63],[-1.45,-1.04]].forEach(([a,b]) => { space(a,b,'#3d7fc4'); chair(PX((a+b)/2), zm, 46); });
  return canvasTex(c);
}
/* 車道坡道：往北漸暗，表示下行 */
function rampTexture(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,'#77736e'); gr.addColorStop(.55,'#4a4846'); gr.addColorStop(1,'#141414');
  x.fillStyle = gr; x.fillRect(0,0,64,256);
  x.fillStyle = 'rgba(255,255,255,.75)'; x.fillRect(29,20,6,40); x.beginPath(); x.moveTo(20,60); x.lineTo(44,60); x.lineTo(32,80); x.fill();
  return canvasTex(c);
}
function stripeTexture(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const x = c.getContext('2d');
  for(let i=0;i<8;i++){ x.fillStyle = i%2 ? '#ffffff' : '#d62d24'; x.fillRect(i*8,0,8,4); }
  return canvasTex(c);
}
function tiled(mesh, w, h, d){
  const uv = mesh.geometry.attributes.uv, dims = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0; f<6; f++) for(let i=0; i<4; i++){ const k = f*4+i; uv.setXY(k, uv.getX(k)*dims[f][0], uv.getY(k)*dims[f][1]); }
  uv.needsUpdate = true; return mesh;
}
const tbox = (w,h,d,m,x=0,y=0,z=0,cast=true) => tiled(box(w,h,d,m,x,y,z,cast), w, h, d);
const walkTex = tileTexture(0x8f8d89, '#6f6d69', 8, 8, false, 14); walkTex.repeat.set(1.5,1.5);
const herringTex = basketTexture(0xc9b79c, '#9c8c75'); herringTex.repeat.set(2,2);
const tmat = {
  char:   M(0xffffff,{map:tileTexture(0x707176, '#55565a', 8, 14)}),         // 塔樓灰色磁磚
  beige:  M(0xffffff,{map:tileTexture(0xdcd0bb, '#bfb39e', 6, 12)}),         // 正面米色磁磚
  brick:  M(0xffffff,{map:tileTexture(0x3f4044, '#2a2b2e', 6, 14, true)}),   // 1F 深灰丁掛磚
  brickLt:M(0xffffff,{map:tileTexture(0x6c6d71, '#47484c', 6, 14, true, 45)}), // 後側深淺混色磚
  walk:   M(0xffffff,{map:walkTex}),                                         // 人行道灰色方磚
  herring:M(0xffffff,{map:herringTex}),                                      // 外側編織磚
  deck:   M(0xffffff,{map:tileTexture(0xa9774a, '#6e4a2c', 1, 9, false, 18)}) // 頂樓木棧道
};
mat.stripe = M(0xffffff,{map:stripeTexture()});
function chairTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), s = 128, cx = 64, cy = 64;
  x.fillStyle = '#3d7fc4'; x.fillRect(0,0,128,128);
  x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = 10; x.lineCap = 'round';
  x.beginPath(); x.arc(cx-6, cy-38, 10, 0, 7); x.fill();
  x.beginPath(); x.moveTo(cx-10, cy-22); x.lineTo(cx-10, cy+2); x.lineTo(cx+22, cy+2); x.lineTo(cx+32, cy+34); x.stroke();
  x.beginPath(); x.arc(cx-6, cy+20, 26, Math.PI*.6, Math.PI*2.1); x.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function calendarTexture(){
  const c = document.createElement('canvas'); c.width = 640; c.height = 388;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0,0,640,388);
  x.fillStyle = '#3b2a1a'; x.font = '700 40px "Noto Sans TC","PingFang TC",sans-serif'; x.fillText('本週施工登記', 24, 52);
  const days = ['一','二','三','四','五','六','日'], cw = 84, x0 = 30, y0 = 78;
  x.font = '700 24px "Noto Sans TC",sans-serif';
  days.forEach((d,i) => { x.fillStyle = i>4 ? '#d9682b' : '#3b2a1a'; x.fillText(d, x0+i*cw+30, y0+28); });
  x.strokeStyle = '#e4d6c0'; x.lineWidth = 2;
  for(let i=0;i<=7;i++){ x.beginPath(); x.moveTo(x0+i*cw, y0); x.lineTo(x0+i*cw, 370); x.stroke(); }
  x.beginPath(); x.moveTo(x0, y0+42); x.lineTo(x0+7*cw, y0+42); x.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
function hazardTexture(){
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const x = c.getContext('2d'); x.fillStyle = '#f2c230'; x.fillRect(0,0,128,16);
  x.fillStyle = '#222'; for(let i=-16;i<128;i+=24){ x.beginPath(); x.moveTo(i,16); x.lineTo(i+12,0); x.lineTo(i+24,0); x.lineTo(i+12,16); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
mat.hazard = M(0xffffff,{map:hazardTexture()});

const bmat = {
  char:M(0x4a4b50), charDark:M(0x37383c), beige:M(0xd9ccb6), cream:M(0xf4ece0),
  rust:M(0x9a4e2a), tan:M(0xb89a78), gold:M(0xd9a441,{metalness:.5,roughness:.4}), black:M(0x232325),
  bronze:M(0x8c4b2a,{metalness:.45,roughness:.5}), silver:M(0xc9c7c2,{metalness:.35,roughness:.45}),
  frameGrey:M(0xbab7b1), door:M(0xffffff,{map:doorTexture(), metalness:.35, roughness:.55}),
  maple:M(0xd9a441), dryGrass:M(0xb39a72), slat:M(0xffffff,{map:tileTexture(0x8a8580,'#3a3836',14,1,false,25)}), rib:M(0xffffff,{map:tileTexture(0x4c4d51,'#2d2e31',18,1,false,6)}),
  gymGlass:M(0xbcd3d9,{roughness:.2, transparent:true, opacity:.55, emissive:0xffe2a0, emissiveIntensity:0})
};

/* 輪胎＋五爆輪框（輪軸沿 x）。side：1＝左側（+x）、-1＝右側 */
const rimMat = M(0xb9bcc0,{metalness:.55, roughness:.35}), hubMat = M(0x55585d,{metalness:.4, roughness:.5});
function wheelHD(r, side){
  const w = cyl(r,r,.06,14,bmat.black); w.rotation.z = Math.PI/2;
  const o = -side*.031;                                              // 輪框朝外那一面
  w.add(cyl(r*.68,r*.68,.004,14,hubMat,0,o,0));                      // 輪框內凹深色底
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r*.66,.006,4,16), rimMat); ring.rotation.x = Math.PI/2; ring.position.y = o*1.02; w.add(ring);
  for(let k=0;k<5;k++){ const sp = box(.016,.006,r*1.25,rimMat,0,o*1.03,0,false); sp.rotation.y = k*Math.PI*2/5; w.add(sp); }
  w.add(cyl(r*.18,r*.18,.008,6,rimMat,0,o*1.06,0));
  return w;
}
/* 一般轎車（車頭朝 -z）：側面輪廓擠出、玻璃、輪拱、後照鏡、空白車牌（不寫號碼）、燈組 */
function sedan(s = bmat.silver){
  const g = new THREE.Group();
  const ext = (pts, w, m) => { const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z,y]) => new THREE.Vector2(z,y))), {depth:w, bevelEnabled:false});
    geo.rotateY(-Math.PI/2); geo.translate(w/2,0,0); const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };
  // 外型座標：z 為車身前後（車頭在 -z），y 為高度
  g.add(ext([[-.5,.07],[.5,.07],[.515,.15],[.5,.215],[.36,.235],[.22,.245],[.12,.355],[-.1,.365],[-.2,.345],[-.31,.25],[-.48,.225],[-.515,.15]], .44, s));
  g.add(ext([[.205,.249],[.115,.36],[-.1,.37],[-.195,.35],[-.3,.254],[.2,.244]], .448, mat.glass));
  g.add(ext([[.02,.25],[.02,.355],[-.005,.355],[-.005,.25]], .452, s));               // B 柱
  g.add(box(.446,.035,1.0,M(0x2a2a2c),0,.088,0,false));                              // 下緣飾條
  [[.32,1],[-.32,1]].forEach(([z]) => [1,-1].forEach(side => {
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.01,10,1,false,0,Math.PI), M(0x2a2a2c)); arch.rotation.z = Math.PI/2; arch.rotation.y = 0;
    arch.position.set(side*.221,.085,z); arch.rotation.x = Math.PI; g.add(arch);
    const w = wheelHD(.08, side); w.position.set(side*.205,.08,z); g.add(w);
  }));
  [1,-1].forEach(side => g.add(box(.05,.03,.035,s,side*.245,.265,-.26,false)));       // 後照鏡
  [.14,-.14].forEach(x => { g.add(box(.09,.035,.015,mat.lamp,x,.18,-.512,false)); g.add(box(.1,.03,.015,M(0xb3121a,{emissive:0xff2a2a, emissiveIntensity:.35}),x,.2,.512,false)); });
  g.add(box(.2,.035,.012,M(0x2a2a2c),0,.13,-.516,false));                             // 水箱護罩
  g.add(box(.13,.045,.01,mat.white,0,.13,.517,false));                  // 空白車牌
  return g;
}
/* 休旅車（MPV）：車頭朝 -z，與 sedan() 相同做法 */
function mpv(s){
  const g = new THREE.Group();
  const ext = (pts, w, m) => { const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z,y]) => new THREE.Vector2(z,y))), {depth:w, bevelEnabled:false});
    geo.rotateY(-Math.PI/2); geo.translate(w/2,0,0); const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };
  g.add(ext([[-.5,.08],[.5,.08],[.515,.16],[.505,.3],[.47,.36],[.3,.4],[-.24,.41],[-.36,.3],[-.48,.25],[-.515,.16]], .45, s));
  g.add(ext([[.46,.305],[.44,.355],[.29,.395],[-.23,.405],[-.34,.3],[.44,.3]], .458, mat.glass));
  g.add(box(.456,.035,1.0,M(0x2a2a2c),0,.095,0,false));
  [[.32],[-.32]].forEach(([z]) => [1,-1].forEach(side => { const w = wheelHD(.085, side); w.position.set(side*.21,.085,z); g.add(w); }));
  [1,-1].forEach(side => g.add(box(.05,.03,.035,s,side*.25,.31,-.28,false)));
  [.15,-.15].forEach(x => { g.add(box(.1,.03,.015,mat.lamp,x,.22,-.512,false)); g.add(box(.08,.08,.015,M(0xb3121a,{emissive:0xff2a2a, emissiveIntensity:.35}),x*1.25,.3,.512,false)); });
  g.add(box(.24,.06,.012,M(0x2a2a2c),0,.17,-.516,false));
  g.add(box(.13,.045,.01,mat.white,0,.17,.517,false));
  return g;
}
function scooter(c){
  const g = new THREE.Group();
  g.add(box(.09,.1,.26,c,0,.15,.03));
  g.add(box(.08,.03,.12,bmat.black,0,.08,-.04));
  g.add(box(.08,.04,.13,bmat.black,0,.22,.06));
  g.add(box(.06,.2,.05,c,0,.2,-.12));
  g.add(box(.2,.02,.02,bmat.black,0,.31,-.12));
  [-.13,.13].forEach(z => g.add(cyl(.05,.05,.035,8,bmat.black,0,.05,z).rotateZ(Math.PI/2)));
  return g;
}
function columnShrub(x,y,z,h){
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.075,0), Math.random()>.5?mat.leaf:mat.leafB);
  s.scale.set(1, h/.15, 1); s.position.set(x, y+h/2, z); s.castShadow = true; return s;
}

function makeBuilding(){
  const g = new THREE.Group();
  const W = 4.2, D = 4.4, FH = .56, L1 = 1.2, H = D/2;
  const hx = (W+.3)/2, hz = (D+.3)/2, zBack = -1.15;
  const win = (w,h,x,y,z,ry=0) => { const m = box(w,h,.05, Math.random()<.6 ? mat.glassLit : mat.glass, x,y,z,false); m.rotation.y = ry; return m; };

  /* ---------- 1F 挑高室內量體（後側留出停車空間） ---------- */
  g.add(tbox(W+.3, L1, hz-zBack, tmat.brick, 0, L1/2, (hz+zBack)/2));

  // 民享路側（北）店面 ×3：玻璃門窗、紅色招牌、木紋壁燈；上層黑色直條格柵
  [-1.45,0,1.45].forEach(xc => {
    g.add(box(1.1,.56,.04,mat.glassLit,xc,.29,hz+.01,false));
    [-.55,0,.55].forEach(d => g.add(box(.035,.58,.05,bmat.black,xc+d,.29,hz+.03,false)));
    g.add(box(1.14,.1,.05,mat.signRed,xc,.64,hz+.03,false));
    g.add(box(.06,.3,.05,mat.lampWood,xc+.62,.6,hz+.05,false));
    for(let k=-.55; k<=.551; k+=.07) g.add(box(.02,.44,.035,bmat.black,xc+k,.95,hz+.04,false));
  });

  // 中北三街176巷側（東）：正門位於後側停車場北側
  const ex = -hx, dz = -.65;
  [dz-.42, dz+.42].forEach(z => g.add(tbox(.18,.86,.1,tmat.brickLt,ex-.09,.43,z)));     // 門洞兩側磚柱
  g.add(box(.2,.012,.74,M(0xd8d2c8),ex-.1,.006,dz,false));                                 // 門前石材地坪
  g.add(box(.035,.5,.36,bmat.door,ex-.02,.25,dz+.1,false));                               // 銅色日芒紋雙開門
  g.add(box(.03,.5,.2,mat.glassLit,ex-.012,.25,dz-.22,false));                           // 左側落地玻璃
  g.add(box(.03,.32,.76,mat.glassLit,ex-.012,.68,dz,false));                             // 上方高窗
  [dz-.33,dz-.11,dz+.29].forEach(z => g.add(box(.04,.84,.022,bmat.black,ex-.025,.42,z,false)));
  [.51,.68].forEach(yy => g.add(box(.04,.022,.76,bmat.black,ex-.025,yy,dz,false)));
  // 1F 上緣黑色直條格柵（從停車場延伸到正門）
  g.add(box(.3,.04,2.2,bmat.black,ex-.15,1.2,-1.25), box(.3,.03,2.2,bmat.black,ex-.15,.86,-1.25));
  for(let z=-2.33; z<=-.15; z+=.07) g.add(box(.035,.34,.02,bmat.black,ex-.29,1.03,z,false));
  // 雉堞狀磚造女兒牆
  for(let z=-2.3; z<-.3; z+=.42) g.add(tbox(.12,.26,.34,tmat.brickLt,ex+.06,L1+.13,z+.17));
  // 柵門、機房小門、門牌
  g.add(tbox(.03,.56,.86,bmat.slat,ex-.02,.28,dz+1.05,false));
  g.add(box(.03,.42,.24,bmat.charDark,ex-.02,.21,dz+1.75,false));
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(.3,.075), new THREE.MeshBasicMaterial({map:plaqueTexture()}));
  plaque.rotation.y = -Math.PI/2; plaque.position.set(ex-.02,.42,dz+.53); g.add(plaque);
  // 門前耐候鋼植栽：南側（小楓樹、芒草、石塊）、北側（芒草、仙人掌）
  const bed = (zc,w,d) => { g.add(box(d,.08,w,bmat.rust,ex-d/2-.03,.04,zc)); g.add(box(d-.03,.012,w-.03,mat.gravel,ex-d/2-.03,.083,zc,false)); };
  bed(dz-.68,.4,.46); bed(dz+.53,.2,.3);
  const maple = new THREE.Group(); maple.add(cyl(.018,.025,.45,5,mat.trunk,0,.22,0));
  [[0,.5,0,.16],[.08,.42,.06,.11],[-.07,.44,-.05,.1]].forEach(([x,y,z,r]) => { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r,0), mat.maple); c.position.set(x,y,z); c.castShadow = true; maple.add(c); });
  maple.position.set(ex-.3,.08,dz-.7); g.add(maple);
  const tuft = (x,z,h,m) => { const t = new THREE.Mesh(new THREE.ConeGeometry(.06,h,5), m); t.position.set(x,.08+h/2,z); g.add(t); };
  tuft(ex-.12,dz-.56,.2,mat.dryGrass); tuft(ex-.4,dz-.82,.22,mat.dryGrass); tuft(ex-.16,dz+.5,.24,mat.dryGrass);
  g.add(box(.08,.05,.07,M(0xc8b79a),ex-.38,.11,dz-.55));
  [[ex-.08,dz+.6],[ex-.24,dz+.46]].forEach(([x,z]) => { const ca = new THREE.Mesh(new THREE.IcosahedronGeometry(.035,1), mat.cactus); ca.position.set(x,.115,z); g.add(ca); });
  // 西側樓梯間長窗
  g.add(tbox(.03,L1-.08,hz-zBack-.1,bmat.rib,hx+.015,L1/2+.04,(hz+zBack)/2,false));
  [.2,1.3].forEach(z => g.add(box(.035,.16,.26,mat.white,hx+.03,.62,z,false)));

  /* ---------- 1F 後側（中北三街）：有頂蓋的停車場 ---------- */
  const pd = zBack+hz, pz = (zBack-hz)/2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W+.3, pd), M(0xffffff,{map:parkingTexture()}));
  floor.geometry.rotateX(-Math.PI/2); floor.position.set(0,.004,pz); floor.receiveShadow = true; g.add(floor);
  g.add(tbox(.3,.86,pd,tmat.brickLt,hx-.15,.43,pz));                    // 西側磚牆
  g.add(tbox(.18,.62,.18,tmat.brickLt,-.24,.31,-hz+.12));                // 中間磚柱
  g.add(box(W+.3,.06,pd,bmat.charDark,0,.65,pz));                        // 頂蓋
  g.add(tbox(W+.3,.22,.24,tmat.brickLt,0,.79,-hz+.12));                  // 磚造樑帶
  g.add(tbox(W+.3,L1-.68,pd-.25,tmat.brick,0,(.68+L1)/2,pz+.125));       // 上層退縮量體
  g.add(box(.36,.5,.04,bmat.door,.05,.25,zBack-.02,false));              // 銅色雙開後門（同正門日芒紋）
  g.add(box(.012,.5,.045,bmat.black,.05,.25,zBack-.02,false));
  [[-1.6,-1.9],[-.6,-1.45],[.4,-1.9],[1.4,-1.45],[-1.1,-2.15],[.9,-2.15]].forEach(([x,z]) => g.add(cyl(.05,.05,.012,8,mat.lamp,x,.615,z)));
  [[-.9,-1.75],[.9,-1.75]].forEach(([x,z]) => { const pl = new THREE.PointLight(0xffdcae, 0, 2.6, 1.6); pl.position.set(x,.55,z); g.add(pl); parkLights.push(pl); });
  g.add(box(W+.2,.36,.01,mat.glow,0,1.04,-hz+.245,false));          // 格柵後方室內燈光
  // 車輛：汽車停 22 號車位，機車停 1–3 號
  const car = sedan(); car.position.set(.75,0,-1.72); g.add(car);
  [[.3,mat.white],[0,bmat.black],[-.48,bmat.black]].forEach(([x,c]) => { const s = scooter(c); s.position.set(x,0,-1.55); g.add(s); });
  g.add(cyl(.004,.05,.16,8,mat.orange,1.58,.08,-1.4));
  // 東側黑色植栽箱（中間留通道）
  [[-1.98,.55],[-1.32,.4]].forEach(([zc,len]) => {
    g.add(box(.24,.18,len,bmat.black,-2.1,.09,zc));
    for(let z=zc-len/2+.07; z<zc+len/2; z+=.11) g.add(columnShrub(-2.1,.18,z,.5+Math.random()*.2));
  });
  // 上方黑色直條格柵量體（東端斜撐）
  g.add(box(W+.4,.04,.32,bmat.black,0,.86,-hz-.12));
  g.add(box(W+.4,.04,.32,bmat.black,0,1.42,-hz-.12));
  for(let x=-hx; x<=hx+.001; x+=.085) g.add(box(.022,.54,.05,bmat.black,x,1.14,-hz-.28,false));
  for(let z=-hz-.2; z<=-hz+.001; z+=.085){ [hx+.02,-hx-.02].forEach(x => g.add(box(.05,.54,.022,bmat.black,x,1.14,z,false))); }
  const brace = box(.05,.42,.04,bmat.black,-hx-.02,.68,-hz-.14,false); brace.rotation.x = -.6; g.add(brace);

  /* ---------- 2F–8F 住宅 ----------
     依平面圖：前側 A、B 全寬；後側 C 戶較窄（約前側寬度 64%），略偏西 */
  const Df = D*.56, Dr = D-Df, zf = D/2-Df/2, zr = -D/2+Dr/2, Wc = W*.64, xc = W*.08;
  const cE = xc-Wc/2, cW = xc+Wc/2;
  // 外框窗：灰色凸出外框 + 深色窗框 + 中間分隔
  const frameWin = (cx,cy,cz,nx,nz,w) => {
    const along = (a,b) => nx ? [b,a] : [a,b];
    const [sw,sd] = along(w+.14,.07), [gw2,gd2] = along(w,.085), [mw,md] = along(.02,.09);
    g.add(box(sw, FH*.74, sd, bmat.frameGrey, cx+nx*.035, cy, cz+nz*.035, false));
    g.add(box(gw2, FH*.56, gd2, Math.random()<.6?mat.glassLit:mat.glass, cx+nx*.04, cy, cz+nz*.04, false));
    g.add(box(mw, FH*.56, md, bmat.black, cx+nx*.045, cy, cz+nz*.045, false));
  };
  const rustBalcony = (cx,cy,cz,nx,nz,w) => {
    const [rw,rd] = nx ? [.05,w] : [w,.05];
    g.add(box(nx?.04:w, FH*.72, nx?w:.04, bmat.charDark, cx+nx*.01, cy+FH/2, cz+nz*.01, false));
    g.add(box(rw, .22, rd, bmat.rust, cx+nx*.06, cy+.18, cz+nz*.06, false));
  };
  // 東側前段：凹陷陽台 + 黑色斜向格柵
  const louverBay = (x,y,zc,w) => {
    g.add(box(.04, FH*.92, w, bmat.charDark, x-.005, y+FH/2, zc, false));
    g.add(box(.05, FH*.6, w*.6, Math.random()<.6?mat.glassLit:mat.glass, x-.02, y+FH*.5, zc, false));
    g.add(box(.2, .05, w, bmat.charDark, x-.1, y+.03, zc, false));
    for(let k=-w/2+.05; k<=w/2-.04; k+=.085){ const f = box(.14, FH*.97, .018, bmat.black, x-.2, y+FH/2, zc+k, false); f.rotation.y = .55; g.add(f); }
  };
  // 小方窗（可加白色斜簷）；nx = -1 東面、1 西面
  const smallWin = (x,y,zc,hood,nx=-1) => {
    g.add(box(.05, FH*.36, .24, bmat.black, x+nx*.012, y+FH*.48, zc, false));
    g.add(box(.05, FH*.3, .19, Math.random()<.5?mat.glassLit:mat.glass, x+nx*.02, y+FH*.48, zc, false));
    if(hood){ const h = box(.11, .035, .36, mat.white, x+nx*.05, y+FH*.78, zc, false); h.rotation.z = .18; g.add(h); }
  };
  // 西側大型凹框：凸出外框 + 內部 L 形凸塊
  const recessPanel = (x,y,zc,w) => {
    [zc-w/2, zc+w/2].forEach(z => g.add(tbox(.07, FH, .1, tmat.char, x+.035, y+FH/2, z)));
    g.add(tbox(.07, .09, w+.1, tmat.char, x+.035, y+FH-.045, zc));
    g.add(tbox(.035, FH*.42, w*.5, tmat.char, x+.018, y+FH*.25, zc+w*.22, false));
  };
  // C 戶東側外推陽台
  const cBalcony = (y,zc,w) => {
    g.add(box(.03, FH*.85, w, bmat.charDark, cE-.012, y+FH/2, zc, false));
    g.add(box(.04, FH*.58, w*.7, Math.random()<.6?mat.glassLit:mat.glass, cE-.02, y+FH*.5, zc, false));
    g.add(box(.34, .05, w, bmat.char, cE-.17, y+.03, zc));
    g.add(box(.04, .22, w, bmat.rust, cE-.33, y+.16, zc));
  };
  let y = L1;
  for(let f=2; f<=8; f++){
    const full = f < 8;                       // 8F 只有前側 A、B
    g.add(tbox(W, FH, Df, tmat.char, 0, y+FH/2, zf));
    g.add(box(W+.04, .05, Df+.04, bmat.charDark, 0, y+.025, zf, false));
    if(full){
      g.add(tbox(Wc, FH, Dr+.02, tmat.char, xc, y+FH/2, zr-.01));
      g.add(box(Wc+.04, .05, Dr+.04, bmat.charDark, xc, y+.025, zr, false));
    }
    // 正面（民享路）米色立面
    g.add(tbox(W-.1, FH, .05, tmat.beige, 0, y+FH/2, D/2+.03, false));
    const tilt = (f%2 ? 1 : -1) * 0.26;
    [-1.42, 1.42].forEach((x,k) => {
      const ry = k ? -tilt : tilt;
      const fr = box(1.15, FH*.86, .22, bmat.cream, x, y+FH/2, D/2+.14); fr.rotation.y = ry; g.add(fr);
      g.add(win(.85, FH*.6, x, y+FH*.52, D/2+.26, ry));
    });
    [-.42,.42].forEach(x => {
      g.add(box(.78, .07, .55, bmat.charDark, x, y+.04, D/2+.3));
      g.add(box(.78, .22, .05, bmat.rust, x, y+.18, D/2+.56));
      g.add(win(.6, FH*.7, x, y+FH*.48, D/2+.06));
    });
    const cy = y+FH*.52;
    // 東側（176巷）前段：黑色斜向格柵陽台 + 白色斜簷小方窗
    louverBay(-W/2, y, .55, .85);
    smallWin(-W/2, y, 1.75, true);
    // 前、後量體交接凹槽：鏽蝕板
    g.add(box(.55, FH*.78, .04, bmat.rust, -W/2+.32, y+FH/2, zf-Df/2-.03, false));
    // 西側（唯一不臨路的一面）：大型凹框牆面、L 形分割、北端小方窗
    recessPanel(W/2, y, 1.15, 1.25);
    smallWin(W/2, y, 2.0, false, 1);
    if(full){
      // C 戶東側：外推陽台＋鏽蝕欄板、深灰凹牆小窗；北端樓梯間窗
      if(f > 2){ cBalcony(y, -1.7, .75); smallWin(cE, y, -1.08, false); }
      frameWin(cE, cy, -.55, -1, 0, .32);
      // C 戶西側大型凹框牆面；前後量體交接處的凹槽陽台（黑色欄杆）
      recessPanel(cW, y, -1.45, 1.3);
      g.add(box(W/2-cW, .05, .62, bmat.charDark, (W/2+cW)/2, y+.03, -.58, false));
      g.add(box(.025, .2, .62, bmat.black, W/2-.02, y+.16, -.58, false));
      [.08,.16].forEach(dy => g.add(box(.02, .015, .62, bmat.black, W/2-.02, y+dy, -.58, false)));
      g.add(box(.12, .1, .14, mat.white, cW+.08, y+.1, -.4));
      // 背面
      frameWin(xc-.6, cy, -D/2, 0, -1, .6);
      rustBalcony(xc+.6, y, -D/2, 0, -1, .75);
    }
    y += FH;
  }

  // C 戶 2F 東側外推磚造量體（位於雉堞女兒牆之上）
  g.add(tbox(1.05, FH*.95, Dr-.15, tmat.brickLt, cE-.4, L1+FH*.48, zr+.02));

  /* ---------- 8F 後側：8F 住戶露台（位於 7F C 戶屋頂） ---------- */
  const y7 = L1 + FH*6;
  g.add(tbox(Wc-.1, .04, Dr-.06, tmat.walk, xc, y7+.02, zr-.03, false));
  g.add(tbox(Wc, .2, .06, tmat.char, xc, y7+.1, -D/2+.03));
  [cE+.03, cW-.03].forEach(x => g.add(tbox(.06, .2, Dr, tmat.char, x, y7+.1, zr)));
  [[xc-.8,-1.7],[xc+.8,-1.8],[xc,-1.95]].forEach(([x,z]) => {
    g.add(cyl(.11,.08,.15,8,bmat.cream,x,y7+.115,z));
    const t = tree(x,z,.3); t.position.y = y7+.19; g.add(t);
  });

  /* ---------- 頂樓：健身房玻璃屋 + 空中花園 + 水箱層 ---------- */
  const roofY = y;
  g.add(box(W+.06, .16, Df+.06, bmat.charDark, 0, roofY+.08, zf));
  const gw = 2.4, gh = .7, gd = Df*.7, gx = -.6, gz = zf;
  g.add(box(gw, gh, gd, bmat.gymGlass, gx, roofY+.16+gh/2, gz, false));
  g.add(box(gw+.08, .07, gd+.08, bmat.black, gx, roofY+.16+gh, gz));
  for(let i=0;i<=4;i++) g.add(box(.05, gh, .05, bmat.black, gx-gw/2+i*gw/4, roofY+.16+gh/2, gz+gd/2));
  // 水箱層：以實牆包覆，外觀看不到水箱
  g.add(tbox(gw-.5, .3, gd-.3, tmat.char, gx, roofY+.16+gh+.185, gz));
  // 空中花園：木棧道 + 多處植栽槽
  g.add(tbox(W-.1, .05, Df-.1, tmat.deck, 0, roofY+.185, zf, false));
  const planter = (x,z,w,d,tall) => {
    g.add(box(w, .18, d, bmat.char, x, roofY+.3, z));
    g.add(box(w-.06, .03, d-.06, mat.soil, x, roofY+.39, z, false));
    const n = Math.max(2, Math.round(w*d*6));
    for(let i=0;i<n;i++){
      const px = x+(Math.random()-.5)*(w-.12), pz2 = z+(Math.random()-.5)*(d-.12);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(.08+Math.random()*.06, .22+Math.random()*.2, 5), Math.random()>.5?mat.leaf:mat.leafB);
      tuft.position.set(px, roofY+.5, pz2); tuft.castShadow = true; g.add(tuft);
    }
    if(tall){ const t = tree(x, z, .5); t.position.y = roofY+.39; g.add(t); }
  };
  planter(1.4, .0, 1.2, .3, true);
  planter(1.85, 1.0, .3, 1.2, false);
  planter(1.3, 1.95, .9, .3, false);
  planter(-1.95, 1.95, .2, .35, false);
  planter(1.0, 1.0, .45, .45, true);
  // 屋頂與 8F 露台的開放式方框（西側天際線）
  const portal = (x,z,y0,h,len) => { g.add(tbox(.1,h,.1,tmat.char,x,y0+h/2,z-len/2), tbox(.1,h,.1,tmat.char,x,y0+h/2,z+len/2), tbox(.1,.1,len+.1,tmat.char,x,y0+h-.05,z)); };
  portal(cW-.06, zr-.2, y7, .62, .9);
  portal(W/2-.06, zf+.55, roofY+.16, .8, .9);
  return g;
}
function noticeBoard(){
  const g = new THREE.Group();
  g.add(box(.12,1.3,.12,mat.wood,-1.25,.65,0), box(.12,1.3,.12,mat.wood,1.25,.65,0));
  g.add(box(2.6,1.3,.12,mat.trim,0,1.1,0));
  g.add(box(2.4,1.1,.14,mat.cork,0,1.1,0));
  g.add(box(2.9,.1,.5,mat.roof,0,1.85,0));
  [[-.75,1.25],[0,1.3],[.72,1.18],[-.3,.85],[.45,.86]].forEach(([x,y],i)=>{
    const p = box(.5,.38,.02, i===1?mat.white:mat.paper, x,y,.09,false);
    p.rotation.z = (Math.random()-.5)*.12; g.add(p);
  });
  return g;
}

/* 地面鋪面：矩形裁切到六角島範圍內 */
const HEXR = R*.985;
function hexClip(pts){
  let out = pts;
  for(let k=0; k<6 && out.length; k++){
    const a = k*Math.PI/3, b = a+Math.PI/3;
    const v1 = [HEXR*Math.sin(a), HEXR*Math.cos(a)], v2 = [HEXR*Math.sin(b), HEXR*Math.cos(b)];
    const side = p => (v2[0]-v1[0])*(p[1]-v1[1]) - (v2[1]-v1[1])*(p[0]-v1[0]);
    const sc = Math.sign(side([0,0])), inp = out; out = [];
    for(let i=0;i<inp.length;i++){
      const P = inp[i], Q = inp[(i+1)%inp.length], fp = side(P)*sc, fq = side(Q)*sc;
      if(fp >= 0) out.push(P);
      if((fp >= 0) !== (fq >= 0)){ const t = fp/(fp-fq); out.push([P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t]); }
    }
  }
  return out;
}
const insideHex = (x,z,m=0) => Math.abs(x) <= HEXR*.866-m && Math.abs(z) <= HEXR - Math.abs(x)/SQ3 - m;
function ground(g, x1,z1,x2,z2, m, h=.06){
  const pts = hexClip([[x1,z1],[x2,z1],[x2,z2],[x1,z2]]);
  if(pts.length < 3) return;
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x,z]) => new THREE.Vector2(x,-z))), {depth:h, bevelEnabled:false});
  geo.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; g.add(mesh); return mesh;
}

/* 其他島的預覽造景（規劃中，之後各自細修） */
const PROPS = {
  building(g){
    const BX = .6, BZ = .2;           // 大樓在島上的位置（略偏西，東側留給巷道）
    // 人行道：內側灰色方磚、外側編織磚、緣石
    ground(g,-2.6,-3.1,3.65,3.5,tmat.walk,.06);
    ground(g,-2.6,3.12,3.65,3.5,tmat.herring,.065);
    ground(g,-2.6,-3.1,-2.22,3.5,tmat.herring,.066);
    ground(g,-2.6,-3.1,2.85,-2.72,tmat.herring,.065);
    ground(g,-2.66,3.5,3.65,3.56,mat.curb,.08);
    ground(g,-2.66,-3.16,-2.6,3.56,mat.curb,.08);
    ground(g,-2.66,-3.16,3.65,-3.1,mat.curb,.08);
    // 道路：民享路（北）、東側巷道、中北三街（南）
    ground(g,-7,3.56,7,7,mat.road,.02);
    ground(g,-7,-7,-2.66,7,mat.road,.021);
    ground(g,-7,-7,7,-3.16,mat.road,.022);
    for(let x=-6; x<6; x+=.9){ if(insideHex(x,4.45,.35)) g.add(box(.45,.01,.05,mat.white,x,.03,4.45,false)); if(insideHex(x,-4.05,.35)) g.add(box(.45,.01,.05,mat.white,x,.03,-4.05,false)); }
    for(let z=-6; z<6; z+=.9){ if(insideHex(-3.95,z,.35)) g.add(box(.05,.01,.45,mat.white,-3.95,.03,z,false)); }
    // 植栽帶（灌木 + 小樹），正門前留出入口
    const strip = (x1,z1,x2,z2) => {
      ground(g,x1,z1,x2,z2,mat.curb,.1);
      ground(g,x1+.025,z1+.025,x2-.025,z2-.025,mat.soilDark,.105);
      const horiz = (x2-x1) > (z2-z1), len = horiz ? x2-x1 : z2-z1;
      for(let t=.1; t<len-.05; t+=.13){
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.1,0), Math.random()>.5?mat.leaf:mat.leafB);
        s.scale.set(1,.7,1); s.position.set(horiz ? x1+t : (x1+x2)/2, .16, horiz ? (z1+z2)/2 : z1+t); s.castShadow = true; g.add(s);
      }
    };
    strip(-2.2,2.9,-.05,3.12); strip(1.25,2.9,3.4,3.12); strip(-2.22,.2,-2.0,2.3);
    const plant = (x,z,s) => { const t = tree(x,z,s); t.position.y = .065; g.add(t); };
    [[-1.5,3.01],[2.5,3.01],[-2.11,2.0],[-2.11,.9]].forEach(([x,z]) => plant(x,z,.5));
    [[-.9,3.32],[2.0,3.32],[-2.42,2.4],[-2.42,.9],[-2.42,-2.0]].forEach(([x,z]) => plant(x,z,.85));
    // 路燈
    const lamp = (x,z,ry) => { const l = new THREE.Group();
      l.add(cyl(.03,.04,1.7,6,mat.metal,0,.85,0), box(.24,.04,.05,mat.metal,-.1,1.68,0), box(.15,.05,.1,mat.lamp,-.2,1.64,0));
      l.position.set(x,.065,z); l.rotation.y = ry; g.add(l); };
    lamp(-2.45,3.36,Math.PI/4); lamp(3.3,3.36,Math.PI/2); lamp(-2.45,-2.95,-Math.PI/4);
    // 白色圓缽植栽
    const bowl = (x,z) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.15,10,5,0,Math.PI*2,Math.PI/2,Math.PI/2), mat.white);
      b.position.set(x,.215,z); b.castShadow = true; g.add(b);
      g.add(cyl(.14,.14,.01,10,mat.soilDark,x,.205,z));
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.1,0), mat.leafB); s.position.set(x,.25,z); g.add(s);
    };
    [[-2.35,3.25],[-2.35,-2.85]].forEach(([x,z]) => bowl(x,z));
    // 西側汽車車道（由中北三街進出，柵欄機管制）
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(.72,3.7), M(0xffffff,{map:rampTexture()}));
    ramp.geometry.rotateX(-Math.PI/2); ramp.position.set(3.25,.07,-1.25); ramp.receiveShadow = true; g.add(ramp);
    g.add(tbox(.12,.26,2.8,tmat.brickLt,3.67,.19,-.8));
    g.add(tbox(.16,.34,.16,tmat.brickLt,3.75,.23,-2.75));
    g.add(box(.78,.035,.035,mat.stripe,3.3,.36,-2.75));
    // 大樓本體
    const b = makeBuilding(); b.position.set(BX,.06,BZ); g.add(b); g.userData.building = b;
    b.userData.mergeRoot = true; mergeStatic(b);
    // 公告欄與西側綠地
    const nb = noticeBoard(); nb.scale.setScalar(.7); nb.position.set(4.45,0,.8); nb.rotation.y = .9; g.add(nb);
    [[4.6,-1.6],[4.3,2.7],[4.1,-3.2]].forEach(([x,z]) => g.add(tree(x,z,.9+Math.random()*.3)));
    // 路名標籤
    const tagAt = (x,z,t) => { const o = new THREE.Object3D(); o.position.set(x,.1,z); g.add(o); ROAD_TAGS.push({o,t}); };
    tagAt(-1.2,4.25,'民享路'); tagAt(1.0,-4.4,'中北三街'); tagAt(-3.95,1.2,'中北三街176巷');
  },
  boxes(g){
    const piles = [[-1.8,1],[0,-1.2],[1.9,1.1]];
    piles.forEach(([x,z],k)=>{ for(let i=0;i<4-k%2;i++){
      const s = .55+Math.random()*.3; const b = box(s,s*.75,s,i%2?mat.box:mat.boxB,x+(Math.random()-.5)*.3,s*.375+i*s*.72,z+(Math.random()-.5)*.3);
      b.rotation.y = Math.random()*.6; g.add(b);} });
    g.add(tree(3.2,-2.4), tree(-3.4,-2));
  },
  gym(g){
    g.add(box(3.6,.08,2.6,mat.stone,0,.04,0));
    const bar = cyl(.06,.06,2.2,6,mat.metal,0,.55,0); bar.rotation.z = Math.PI/2; g.add(bar);
    g.add(cyl(.4,.4,.18,8,mat.red,-.95,.55,0).rotateZ(Math.PI/2), cyl(.4,.4,.18,8,mat.red,.95,.55,0).rotateZ(Math.PI/2));
    g.add(tree(3,2.5), tree(-3.2,2.2), tree(2.6,-3));
  },
  /* 電動車島：充電車位 ×3、充電樁；中間車位播放充電動畫 */
  ev(g){
    ground(g,-3.9,-2.55,3.9,1.65,mat.curb,.045);
    ground(g,-3.8,-2.45,3.8,1.55,mat.road,.05);
    const evGreen = M(0x3f9a68);
    const line = (w,d,x,z) => g.add(box(w,.008,d,mat.white,x,.062,z,false));
    const stalls = [-1.6,-.4,.8], chargers = [];
    stalls.forEach(x => {
      ground(g,x-.33,-1.95,x+.33,-.25,evGreen,.056);
      line(.025,1.7,x-.35,-1.1); line(.025,1.7,x+.35,-1.1);
      const ev = new THREE.Mesh(new THREE.PlaneGeometry(.36,.12), new THREE.MeshBasicMaterial({map:signTexture('EV','#3f9a68','#ffffff')}));
      ev.rotation.x = -Math.PI/2; ev.position.set(x,.063,-.45); g.add(ev);
      const c = makeCharger(x+.3,-2.15); g.add(c.g); chargers.push(c);
    });
    for(let x=-3.4; x<3.6; x+=.8) line(.4,.035,x,.9);
    // 左側車位：一台正在充電的深藍色轎車（靜態）
    const parked = sedan(M(0x2c3e5c,{metalness:.3,roughness:.45})); parked.rotation.y = Math.PI; parked.position.set(-1.6,.05,-1.0); g.add(parked);
    const c0 = chargers[0]; c0.coil.visible = false; c0.led.emissive.setHex(0x3ddc84);
    const pa = new THREE.Vector3(-1.26,.67,-2.12), pb = new THREE.Vector3(-1.45,.22,-1.52);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pa, new THREE.Vector3(-1.3,.1,-1.85), pb),14,.011,5,false), M(0x1d1d1f)));
    g.add(box(.04,.04,.08,bmat.black,pb.x,pb.y,pb.z));
    // 站牌、樹籬、樹
    g.add(cyl(.025,.025,1.1,6,mat.metal,3.2,.6,-1.9));
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(.8,.24), new THREE.MeshBasicMaterial({map:signTexture('EV 充電站','#3f9a68','#ffffff')}));
    sg.position.set(3.2,1.2,-1.87); sg.rotation.y = -.4; g.add(sg);
    for(let x=-3.6;x<=3.6;x+=.32){ if(insideHex(x,-2.8,.15)){ const h = new THREE.Mesh(new THREE.IcosahedronGeometry(.17,0), Math.random()>.5?mat.leaf:mat.leafB); h.scale.set(1,.75,1); h.position.set(x,.14,-2.8); h.castShadow = true; g.add(h); } }
    g.add(tree(-4.3,-.2,1), tree(4.3,-.7,.9), tree(3.4,2.7,.9), tree(-3.3,2.7,.8));
    // 動畫角色：白色 Model 3、駕駛、充電槍與纜線、充電進度標籤
    const T = makeModel3(); T.g.visible = false; g.add(T.g);
    const P = makePerson(); P.g.visible = false; g.add(P.g);
    const conn = box(.035,.035,.08,bmat.black); g.add(conn);
    const cable = new THREE.Mesh(new THREE.BufferGeometry(), M(0x1d1d1f)); cable.visible = false; g.add(cable);
    const label = makeChargeLabel(); g.add(label.sprite);
    [T.g, P.g, conn, cable].forEach(o => o.userData.dynamic = true);
    chargers.forEach(c => c.coil.userData.dynamic = true);
    g.userData.ev = {T, P, ch:chargers[1], conn, cable, label, stall:stalls[1], charging:false};
  },
  /* 停車場島：依管委會車位圖與住戶照片（2026-11-11）做的一樓後側露天停車場（平面圖見 scene/plans/1f-rear-parking.svg）
     汽車位 22、23（無障礙兼電動車位）＋斜線下車區；機車位 1–18（4、5 無障礙，18 自設）；北側大樓後牆與大門（在 11 號車位後方）、西側牆、東側植栽箱、兩支磚柱與樑。
     1 公尺 ＝ 0.45 單位；車頭朝南（+z，中北三街）。不顯示車牌、戶號。 */
  parking(g){
    const LOT = {"W":12.6,"D":7.8,"cars":[{"n":"23","x":0.15,"y":0,"w":2.5,"d":5.5,"acc":true,"ev":true},{"n":"22","x":4.15,"y":0,"w":2.5,"d":5.5,"acc":true,"ev":true}],"hatch":{"n":"","x":2.65,"y":0,"w":1.5,"d":5.5},"moto":[{"n":"4","x":9.75,"y":0,"w":2.25,"d":2.0,"acc":true},{"n":"5","x":9.75,"y":2.05,"w":2.25,"d":2.0,"acc":true},{"n":"3","x":8.75,"y":0,"w":1.0,"d":2.0},{"n":"2","x":7.75,"y":0,"w":1.0,"d":2.0},{"n":"1","x":6.75,"y":0,"w":1.0,"d":2.0},{"n":"6","x":9.0,"y":2.3,"w":0.75,"d":1.75},{"n":"7","x":8.25,"y":2.3,"w":0.75,"d":1.75},{"n":"8","x":7.25,"y":2.05,"w":1.0,"d":2.0},{"n":"9","x":10.8,"y":5.6,"w":1.0,"d":2.0},{"n":"10","x":9.8,"y":5.6,"w":1.0,"d":2.0},{"n":"11","x":8.25,"y":5.6,"w":1.0,"d":2.0},{"n":"12","x":7.25,"y":5.6,"w":1.0,"d":2.0},{"n":"13","x":6.25,"y":5.6,"w":1.0,"d":2.0},{"n":"14","x":5.25,"y":5.6,"w":1.0,"d":2.0},{"n":"15","x":4.25,"y":5.6,"w":1.0,"d":2.0},{"n":"16","x":3.5,"y":5.85,"w":0.75,"d":1.75},{"n":"17","x":2.75,"y":5.85,"w":0.75,"d":1.75},{"n":"18","x":2.0,"y":5.85,"w":0.75,"d":1.75,"own":true}],"pillars":[{"x":9.25,"y":1.95,"s":0.45},{"x":9.25,"y":6.6,"s":0.55}],"planters":{"x":12.05,"y":0.2,"w":0.5,"d":4.0},"door":{"x":8.25,"w":1.0}};
    const K = .45, W = LOT.W, D = LOT.D;
    const PX = x => (x - W/2)*K, PZ = y => (D/2 - y)*K;           // 平面圖座標（公尺）→ 島上座標
    // 地坪：灰色磁磚＋車格線、編號、無障礙標誌（畫在同一張貼圖上）
    const c = document.createElement('canvas'), SC = 60; c.width = W*SC; c.height = D*SC;
    const x = c.getContext('2d'), cx = v => v*SC, cy = v => (D - v)*SC;
    x.fillStyle = '#7f7d79'; x.fillRect(0,0,c.width,c.height);
    x.strokeStyle = 'rgba(60,58,55,.55)'; x.lineWidth = 1.2;
    for(let i=0;i<=W*4;i++){ x.beginPath(); x.moveTo(i*SC/4,0); x.lineTo(i*SC/4,c.height); x.stroke(); }
    for(let j=0;j<=D*2;j++){ x.beginPath(); x.moveTo(0,j*SC/2); x.lineTo(c.width,j*SC/2); x.stroke(); }
    const rect = (s, col) => { x.strokeStyle = col; x.lineWidth = 9; x.strokeRect(cx(s.x), cy(s.y+s.d), s.w*SC, s.d*SC); };
    const chair = (px, py, sz) => {
      x.fillStyle = '#3d7fc4'; x.fillRect(px-sz/2, py-sz/2, sz, sz);
      x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = sz*.08; x.lineCap = 'round';
      x.beginPath(); x.arc(px-sz*.05, py-sz*.3, sz*.08, 0, 7); x.fill();
      x.beginPath(); x.moveTo(px-sz*.08, py-sz*.18); x.lineTo(px-sz*.08, py+sz*.02); x.lineTo(px+sz*.18, py+sz*.02); x.lineTo(px+sz*.26, py+sz*.28); x.stroke();
      x.beginPath(); x.arc(px-sz*.05, py+sz*.15, sz*.2, Math.PI*.6, Math.PI*2.1); x.stroke();
    };
    // 編號從車道（南側）讀
    const num = (t, px, py, sz) => { x.fillStyle = '#f4f4f0'; x.font = `700 ${sz}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py); };
    const h = LOT.hatch;
    x.save(); x.beginPath(); x.rect(cx(h.x), cy(h.y+h.d), h.w*SC, h.d*SC); x.clip();
    x.strokeStyle = '#f4f4f0'; x.lineWidth = 10;
    for(let k=-30;k<40;k++){ x.beginPath(); x.moveTo(cx(h.x)+k*30, cy(h.y)); x.lineTo(cx(h.x)+k*30+160, cy(h.y+h.d)); x.stroke(); }
    x.restore(); rect(h, '#3d7fc4');
    LOT.cars.forEach(s => { rect(s, '#3d7fc4'); if(s.acc) chair(cx(s.x+s.w/2), cy(s.y+s.d*.45), 110); num(s.n, cx(s.x+s.w/2), cy(s.y)-40, 56); });
    LOT.moto.forEach(s => { rect(s, s.acc ? '#3d7fc4' : '#f4f4f0');
      if(s.acc){ chair(cx(s.x+s.w*.62), cy(s.y+s.d/2), 90); num(s.n, cx(s.x+.45), cy(s.y)-30, 40); }
      else num(s.n, cx(s.x+s.w/2), cy(s.y)-30, 40); });
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W*K, D*K), M(0xffffff,{map:tex}));
    floor.rotation.x = -Math.PI/2; floor.position.y = .07; floor.receiveShadow = true; g.add(floor);
    g.add(box(W*K+.1,.06,D*K+.1,mat.curb,0,.03,0));
    // 南側人行道（中北三街）
    g.add(tbox(W*K+.4,.06,.6,tmat.walk,0,.03,PZ(0)+.32));
    // 北側大樓後牆（深灰磁磚）＋銅色木門；西側牆＋防空避難指示
    const wallH = 1.35;
    g.add(tbox(W*K+.3,wallH,.2,tmat.brick,0,wallH/2,PZ(D)-.1));
    g.add(box(LOT.door.w*K,.95,.04,bmat.door,PX(LOT.door.x+LOT.door.w/2),.48,PZ(D)+.01,false));
    g.add(tbox(.2,wallH,D*K+.2,tmat.brick,PX(0)-.1,wallH/2,0));
    g.add(box(.02,.1,.14,mat.white,PX(0)+.005,.6,PZ(1.2),false));
    // 磚柱（淺灰混色磚；上方的樑省略，避免擋住俯視）
    LOT.pillars.forEach(pl => g.add(tbox(pl.s*K,1.45,pl.s*K,tmat.brickLt,PX(pl.x+pl.s/2),.73,PZ(pl.y+pl.s/2))));
    // 東側黑色植栽箱（羅漢松）
    const pl = LOT.planters;
    g.add(box(pl.w*K,.22,pl.d*K,bmat.black,PX(pl.x+pl.w/2),.11,PZ(pl.y+pl.d/2)));
    for(let y=pl.y+.4; y<pl.y+pl.d; y+=.75) g.add(columnShrub(PX(pl.x+pl.w/2),.22,PZ(y),.75+Math.random()*.15));
    // 汽車：23 白色休旅車、22 銀色轎車（車頭朝南，不顯示車牌與廠牌）
    const car = (s, mk, sc) => { const v = mk(); v.scale.setScalar(sc); v.rotation.y = Math.PI; v.position.set(PX(s.x+s.w/2),.07,PZ(s.y+s.d/2)); g.add(v); };
    car(LOT.cars[0], () => mpv(M(0xf3f1ec,{metalness:.2,roughness:.45})), 2.15);
    car(LOT.cars[1], () => sedan(bmat.silver), 2.1);
    // 斜線區北端的三角錐
    [[LOT.hatch.x+.3, LOT.hatch.y+LOT.hatch.d-.2],[LOT.cars[0].x+LOT.cars[0].w/2, LOT.cars[0].y+LOT.cars[0].d+.05]].forEach(([cx2,cy2]) => {
      g.add(cyl(.004,.07,.26,8,mat.orange,PX(cx2),.2,PZ(cy2)), cyl(.06,.06,.02,8,mat.white,PX(cx2),.19,PZ(cy2))); });
    // 機車（停在北牆那一排與中間區，車頭朝北）
    const byN = n => LOT.moto.find(m => m.n === n);
    [['10',M(0x2c55c8)],['11',mat.white],['12',bmat.black],['13',M(0x3d6fb0)],['16',mat.white],['8',mat.white]].forEach(([n,col]) => {
      const m = byN(n), sc2 = scooter(col); sc2.scale.setScalar(2.4); sc2.position.set(PX(m.x+m.w/2),.07,PZ(m.y+m.d/2)); g.add(sc2); });
    // 樹與路燈
    g.add(tree(-4.3,-1.6,.9), tree(4.5,1.2,.85), tree(-3.6,3.3,.8));
  },
  /* 工程島：施工中的住戶單元、鷹架與防護網、塔式起重機、廠商貨車、本週施工登記看板 */
  works(g){
    ground(g,-3.4,-2.6,1.7,2.4,mat.slab,.04);
    // 施工中的住戶單元
    g.add(box(2.2,1.5,1.6,mat.wall,-1.1,.79,.0));
    g.add(box(2.3,.08,1.7,mat.wallDark,-1.1,1.58,.0));
    [-1.7,-.5].forEach(x => { g.add(box(.6,.5,.04,mat.glass,x,1.05,.82,false)); g.add(box(.6,.06,.08,mat.wallDark,x,.78,.84,false)); });
    g.add(box(.5,.8,.04,mat.door,-1.1,.44,.82,false));
    // 鷹架（正面與東側）＋綠色防護網
    const pipe = (w,h,d,x,y,z) => g.add(box(w,h,d,mat.metal,x,y,z,false));
    const zf = 1.1, xf = .28;
    for(let x=-2.3; x<=.11; x+=.6) pipe(.03,2.0,.03,x,1.04,zf);
    for(let z=-.8; z<=1.11; z+=.63) pipe(.03,2.0,.03,xf,1.04,z);
    [.55,1.1,1.65,2.0].forEach(y => { pipe(2.45,.03,.03,-1.1,y+.04,zf); pipe(.03,.03,1.95,xf,y+.04,.15); pipe(2.45,.08,.22,-1.1,y,zf-.12); });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.5), new THREE.MeshStandardMaterial({color:0x3f9a5a, transparent:true, opacity:.5, side:THREE.DoubleSide, flatShading:true}));
    net.position.set(-1.65,1.25,zf+.04); g.add(net);
    const ladder = new THREE.Group();
    [-.1,.1].forEach(x => ladder.add(box(.03,1.15,.03,mat.trim,x,.57,0)));
    for(let y=.15;y<1.1;y+=.2) ladder.add(box(.2,.025,.025,mat.trim,0,y,0));
    ladder.position.set(-.3,.04,zf+.22); ladder.rotation.x = -.15; g.add(ladder);
    // 塔式起重機
    const yel = M(0xf2c230), mast = new THREE.Group();
    mast.add(box(.22,3.6,.22,yel,0,1.84,0), box(.5,.12,.5,mat.wallDark,0,.1,0));
    for(let y=.4;y<3.5;y+=.35){ const d = box(.03,.32,.03,mat.wallDark,0,y,.12,false); d.rotation.z = .6; mast.add(d); }
    mast.add(box(.36,.3,.36,yel,0,3.75,0), box(.2,.18,.24,mat.glass,.2,3.75,0,false));
    mast.add(box(3.2,.1,.12,yel,.95,3.98,0), box(.5,.3,.3,mat.wallDark,-.85,3.82,0));
    mast.add(box(.015,1.2,.015,mat.wallDark,1.9,3.35,0), box(.4,.25,.4,mat.box,1.9,2.65,0));
    mast.position.set(-2.8,.04,-1.7); mast.rotation.y = -.5; g.add(mast);
    g.userData.crane = mast; mast.userData.dynamic = true;
    // 黃黑警示圍籬
    const fence = (x,z,ry) => { const f = new THREE.Group();
      [-.38,.38].forEach(dx => f.add(box(.05,.42,.05,mat.metal,dx,.21,0)));
      f.add(box(.86,.12,.03,mat.hazard,0,.34,0), box(.86,.12,.03,mat.hazard,0,.16,0));
      f.position.set(x,.04,z); f.rotation.y = ry; g.add(f); };
    [[-2.9,2.35],[-2.0,2.35],[-1.1,2.35],[.7,2.35],[1.75,1.9]].forEach(([x,z],i) => fence(x,z,i===4?Math.PI/2:0));
    // 三角錐、A 字施工牌
    [[-.3,2.55],[.15,2.6],[2.2,2.2],[2.6,-.9]].forEach(([x,z]) => { g.add(cyl(.004,.09,.26,8,mat.orange,x,.17,z), cyl(.07,.07,.02,8,mat.white,x,.16,z)); });
    const sign = new THREE.Group(), face = new THREE.MeshBasicMaterial({map:signTexture('施工中','#f2c230','#2b2b2b')});
    [.18,-.18].forEach((dz,i) => { const pl = new THREE.Mesh(new THREE.PlaneGeometry(.72,.3), face); pl.position.set(0,.3,dz*.4); pl.rotation.x = i ? .35 : -.35; if(i) pl.rotation.y = Math.PI; sign.add(pl); });
    sign.position.set(.2,.04,2.95); g.add(sign);
    // 廠商貨車
    const van = new THREE.Group();
    van.add(box(.56,.5,1.2,mat.white,0,.36,0), box(.57,.08,1.21,M(0x2c6fb7),0,.3,0), box(.5,.2,.04,mat.glass,0,.48,.61,false));
    [[.27,.38],[-.27,.38],[.27,-.38],[-.27,-.38]].forEach(([x,z]) => van.add(cyl(.1,.1,.08,10,bmat.black,x,.1,z).rotateZ(Math.PI/2)));
    van.position.set(2.6,.0,.5); van.rotation.y = -.35; g.add(van);
    // 本週施工登記看板
    const board = new THREE.Group();
    [-.55,.55].forEach(x => board.add(box(.05,1.1,.05,mat.metal,x,.55,0)));
    board.add(box(1.3,.82,.05,mat.white,0,.95,0));
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(1.22,.74), new THREE.MeshBasicMaterial({map:calendarTexture()}));
    cal.position.set(0,.95,.03); board.add(cal);
    board.position.set(3.3,.0,2.0); board.rotation.y = .55; g.add(board);
    board.userData.dynamic = true; g.userData.calMesh = cal; g.userData.calBoard = board;   // props/works.js 會換上本週資料
    // 建材：木板、油漆桶、工具箱、安全帽
    for(let i=0;i<4;i++) g.add(box(1.0,.04,.16,mat.wood,.8,.06+i*.045,-1.6+i*.02));
    [[1.5,-1.0],[1.65,-1.2],[1.4,-1.25]].forEach(([x,z]) => g.add(cyl(.08,.08,.16,10,mat.white,x,.12,z)));
    g.add(box(.3,.14,.16,mat.red,.4,.11,-.95));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.07,10,5,0,Math.PI*2,0,Math.PI/2), yel); helmet.position.set(.75,.25,-1.6); g.add(helmet);
    g.add(tree(-4.2,1.2,1), tree(4.3,-1.6,.9), tree(-3.9,-3.0,.8));
  },
  office(g){
    g.add(box(2.6,1.4,2,mat.wall,0,.7,0), box(2.9,.15,2.3,mat.roof,0,1.48,0));
    g.add(box(.7,.9,.05,mat.door,0,.45,1.02), box(.6,.4,.05,mat.glass,-.85,.85,1.02), box(.6,.4,.05,mat.glass,.85,.85,1.02));
    g.add(tree(3.6,1.0), tree(-3.6,1.0), tree(2.6,-3));
    // 「財務」「公告」兩個入口標示（2026-11-09 美術）：只顯示名稱，不顯示金額、收支或公告內容。
    // 點擊時 scene 會把 userData.adminTab（'fee'／'notice'）交給 onIslandClick 的第二個參數。
    const signTex = (title, sub, bg, fg, icon) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 320;
      const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0,0,512,320);
      x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(14,14,484,292);
      x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '700 120px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'; x.fillText(title, 300, 150);
      x.font = '500 34px "Noto Sans TC","PingFang TC",sans-serif'; x.fillText(sub, 256, 262);
      icon(x); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
    };
    const entry = (tab, x, z, ry, tex, frameM) => {
      const s = new THREE.Group(); s.position.set(x,0,z); s.rotation.y = ry;
      s.add(box(.08,1.15,.08,mat.wood,-.62,.57,0), box(.08,1.15,.08,mat.wood,.62,.57,0));
      s.add(box(1.42,.92,.08,frameM,0,1.12,0));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3,.81), new THREE.MeshBasicMaterial({map:tex}));
      face.position.set(0,1.12,.045); s.add(face);
      s.add(box(1.6,.08,.32,mat.roof,0,1.62,0));
      s.userData.dynamic = true;                                    // 不合併，點擊時才找得到 adminTab
      s.traverse(o => { o.userData.adminTab = tab; });
      g.add(s); return s;
    };
    entry('fee', -1.75, 2.0, .35, signTex('財務', '本戶帳單・收支公布', '#2c4f7c', '#f6d38a', x => {
      x.fillStyle = '#f6d38a'; x.beginPath(); x.arc(110,150,52,0,7); x.fill();
      x.fillStyle = '#2c4f7c'; x.font = '900 64px sans-serif'; x.fillText('$', 110, 154); }), M(0x1f3a5e));
    entry('notice', 1.75, 2.0, -.35, signTex('公告', '管委會正式事項', '#fff6e6', '#3b2a1a', x => {
      x.fillStyle = '#d9542b'; x.fillRect(64,104,92,108); x.fillStyle = '#fffaf0'; x.fillRect(74,114,72,88);
      x.fillStyle = '#c9b9a0'; for(let i=0;i<4;i++) x.fillRect(84,128+i*18,52,6); }), mat.trim);
  }
};

/* =========================================================
   四、依設定表建立所有島嶼
   ========================================================= */
const islandObjs = [];
const hexToWorld = (q,r) => ({x:(R+GAP)*SQ3*(q + r/2), z:(R+GAP)*1.5*r});
ISLANDS.forEach((def, i) => {
  const g = hexBase(def.id === 'notice');
  const {x,z} = hexToWorld(def.q, def.r);
  g.position.set(x, 0, z);
  const ext = (window.SceneProps || {})[def.id];
  // ext.withBuiltin：保留本檔內建造景，只在上面加東西（例如停車場島的倒數看板）
  if(ext && ext.build){ if(ext.withBuiltin){ (PROPS[def.prop] || (()=>{}))(g); mergeStatic(g); } ext.build(g); g.userData.ext = ext; }
  else { (PROPS[def.prop] || (()=>{}))(g); mergeStatic(g); }
  g.userData = Object.assign(g.userData||{}, {def, phase:i*1.3});
  g.traverse(o => { if(o.isMesh) o.userData.island = def.id; });
  scene.add(g); islandObjs.push(g);
});

/* =========================================================
   四之二、柴犬：在公告島上隨機走動；點地面時跑向該位置
   ========================================================= */
const mainIsland = islandObjs.find(o => o.userData.def.id === 'notice');
const BLD = {x1:-1.85, x2:3.0, z1:-2.3, z2:2.7};            // 大樓占地（含外推 0.15）
const inBld = (x,z) => x > BLD.x1 && x < BLD.x2 && z > BLD.z1 && z < BLD.z2;
const walkable = (x,z) => insideHex(x,z,.35) && !inBld(x,z);
const groundY = (x,z) => (x > -2.66 && x < 3.65 && z > -3.16 && z < 3.56) ? .066 : (x >= 3.65 ? 0 : .023);

/* 柴犬（2026-11-08 美術：細一級＋關節骨架）
   近看用精細版（頭型、眉毛、雙色耳、捲尾、裏白、前後腳各兩節關節），遠看自動換回簡單版。
   動作：站立（呼吸、轉頭、搖尾）、走、跑、坐下。以公尺建模後縮放。 */
const shiba = (() => {
  const root = new THREE.Group();
  const fur = M(0xd4813c), furD = M(0xb8692c), cream = M(0xf6ead6), dark = M(0x231b16), pink = M(0xc98a86);
  const sh = (geo, m, x=0,y=0,z=0) => { const o = new THREE.Mesh(geo, m); o.position.set(x,y,z); o.castShadow = true; return o; };
  const joint = (parent, x,y,z) => { const j = new THREE.Group(); j.position.set(x,y,z); parent.add(j); return j; };
  /* ---- 精細版 ---- */
  const hd = new THREE.Group(); root.add(hd);
  const body = joint(hd, 0,.32,.13);                                   // 樞紐在肩膀（坐下時後半身下沉）
  const torso = new THREE.CylinderGeometry(.1,.108,.38,8); torso.rotateX(Math.PI/2);
  const t1 = sh(torso, fur, 0,.02,-.17); t1.scale.set(.9,1,1); body.add(t1);
  const belly = new THREE.CylinderGeometry(.08,.09,.3,8); belly.rotateX(Math.PI/2);
  const b1 = sh(belly, cream, 0,-.025,-.15); b1.scale.set(.8,.85,1); body.add(b1);
  const chest = sh(new THREE.IcosahedronGeometry(.08,1), cream, 0,-.01,.02); chest.scale.set(.95,1.05,.55); body.add(chest);       // 胸前白毛
  body.add(sh(new THREE.IcosahedronGeometry(.1,1), fur, 0,.025,-.32));           // 臀部
  // 脖子與頭
  const neck = joint(body, 0,.06,.04); neck.rotation.x = .55;
  const nk = new THREE.CylinderGeometry(.06,.075,.11,7); nk.translate(0,.055,0); neck.add(sh(nk, fur));
  const head = joint(neck, 0,.11,.0); head.rotation.x = -.55;
  const skull = sh(new THREE.IcosahedronGeometry(.085,1), fur, 0,.03,0); skull.scale.set(1.05,.9,1); head.add(skull);
  const mz = new THREE.CylinderGeometry(.026,.04,.075,7); mz.rotateX(Math.PI/2);
  head.add(sh(mz, cream, 0,-.012,.075));
  head.add(sh(new THREE.BoxGeometry(.03,.022,.02), dark, 0,.0,.114));           // 鼻頭
  head.add(sh(new THREE.BoxGeometry(.03,.006,.03), dark, 0,-.033,.09));         // 嘴線
  [-1,1].forEach(s => {
    head.add(sh(new THREE.BoxGeometry(.016,.018,.01), dark, s*.032,.03,.06));     // 眼睛
    head.add(sh(new THREE.BoxGeometry(.016,.008,.01), cream, s*.03,.05,.058));    // 麻呂眉
    const ck = sh(new THREE.IcosahedronGeometry(.032,0), cream, s*.045,-.022,.035); ck.scale.set(.8,.8,1); head.add(ck); // 臉頰白毛
    const ear = joint(head, s*.038,.07,-.015); ear.rotation.set(-.2,0,-s*.18);
    const eg = new THREE.ConeGeometry(.036,.085,3); eg.rotateY(Math.PI/6); eg.translate(0,.035,0);
    const eo = sh(eg, fur); eo.scale.set(1,1,.5); ear.add(eo);
    const ei = new THREE.ConeGeometry(.02,.05,3); ei.rotateY(Math.PI/6); ei.translate(0,.028,.008);
    const en = sh(ei, pink); en.scale.set(1,1,.4); ear.add(en);
  });
  // 捲尾：捲在背上，尾巴內側白色
  const tail = joint(body, 0,.07,-.38);
  const tg = new THREE.TorusGeometry(.052,.024,6,10,Math.PI*1.6); tg.rotateY(Math.PI/2);
  const tw = sh(tg, fur, 0,.05,.0); tw.rotation.x = -.6; tail.add(tw);
  tail.add(sh(new THREE.IcosahedronGeometry(.025,0), cream, 0,.075,.04));
  // 四肢：前腳（肩→肘）、後腳（髖→跗關節）
  const legs = [];
  const mkLeg = (x, z, hind) => {
    const up = joint(body, x, -.03, z);
    const ug = new THREE.BoxGeometry(hind ? .06 : .052, hind ? .14 : .13, hind ? .08 : .058); ug.translate(0,hind ? -.07 : -.065,0);
    up.add(sh(ug, fur));
    const lo = joint(up, 0, hind ? -.14 : -.13, hind ? -.01 : 0);
    const lg = new THREE.BoxGeometry(.044,.12,.046); lg.translate(0,-.06,0);
    lo.add(sh(lg, fur), sh(new THREE.IcosahedronGeometry(hind ? .034 : .03,0), fur));   // 關節處補一塊，彎曲時不露縫
    const paw = sh(new THREE.BoxGeometry(.052,.026,.064), cream, 0,-.122,.014); lo.add(paw);
    const L = {up, lo, hind, base: hind ? [-.3,.5] : [0,0]};
    up.rotation.x = L.base[0]; lo.rotation.x = L.base[1];
    legs.push(L); return L;
  };
  // 順序：左前、右前、左後、右後
  mkLeg(.058,.0,false); mkLeg(-.058,.0,false); mkLeg(.06,-.31,true); mkLeg(-.06,-.31,true);
  hd.scale.setScalar(.8);
  /* ---- 簡單版（遠看）---- */
  const lo = new THREE.Group(); root.add(lo);
  lo.add(box(.12,.1,.24,fur,0,.15,0), box(.1,.03,.2,cream,0,.1,0,false));
  lo.add(box(.11,.1,.1,fur,0,.23,.14), box(.065,.045,.06,cream,0,.205,.21));
  [-.035,.035].forEach(x => { const e = new THREE.Mesh(new THREE.ConeGeometry(.026,.055,4), fur); e.position.set(x,.305,.13); lo.add(e); });
  const loLegs = [];
  [[-.04,.08],[.04,.08],[-.04,-.08],[.04,-.08]].forEach(([x,z]) => { const p = new THREE.Group(); p.position.set(x,.11,z); p.add(box(.032,.1,.032,fur,0,-.05,0)); lo.add(p); loLegs.push(p); });
  lo.scale.setScalar(1.35); lo.visible = false;
  root.traverse(o => { if(o.isMesh) o.userData.island = 'notice'; });
  return {g:root, hd, lo, loLegs, body, neck, head, tail, legs, sit:0};
})();
mainIsland.add(shiba.g);
/* 柴犬骨架模型（精細版，2026-11-08 美術）：模型來源 CGTrader「Doggo」，依住戶提供的照片調整比例與毛色；讀 window.SHIBA_MODEL，建立 SkinnedMesh，並以程式驅動骨頭做動作。
   姿勢：stand（站）、walk（走）、run（跑）、sit（坐）、side（側躺睡）、belly（翻肚）。
   每幀呼叫 rig.update(dt, t, pose, gait 相位)，骨頭角度會平滑過渡到目標姿勢。 */
function makeShibaRig(D, M, height){
  const COL = [0xb5642b, 0x9a5224, 0xefdfc8, 0x1e1a19, 0xdcae9c];   // 毛色、背部深色、裏白、黑、耳內
  const mats = COL.map(c => M(c, {roughness:.95, skinning:true}));   // r128：骨架動畫的材質要開 skinning
  const raw = D.bones.map(b => b.xyz.map(v => v/10));
  // 原模型朝 +x、y 向上 → 場景朝 +z：X = -z、Z = x - 中心
  const hip = raw[D.bones.findIndex(b => b.n === 'spine004')], sho = raw[D.bones.findIndex(b => b.n === 'spine008')];
  const xc = (hip[0] + sho[0]) / 2;
  const top = Math.max(...raw.map(p => p[1]));
  const S = height / top;
  const T = (x,y,z) => [-z*S, y*S, (x - xc)*S];
  const W = raw.map(p => T(...p));
  // 骨頭（靜止姿勢無旋轉，所以 rotation.x 就是前後擺、rotation.z 是左右）
  const bones = D.bones.map(b => { const o = new THREE.Bone(); o.name = b.n; return o; });
  const roots = [];
  D.bones.forEach((b,i) => {
    const p = W[i], q = b.p >= 0 ? W[b.p] : [0,0,0];
    bones[i].position.set(p[0]-q[0], p[1]-q[1], p[2]-q[2]);
    if(b.p >= 0) bones[b.p].add(bones[i]); else roots.push(bones[i]);
  });
  const n = D.pos.length/3, pos = new Float32Array(n*3);
  for(let i=0;i<n;i++){ const v = T(D.pos[i*3]/10, D.pos[i*3+1]/10, D.pos[i*3+2]/10); pos[i*3]=v[0]; pos[i*3+1]=v[1]; pos[i*3+2]=v[2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(D.si,4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(D.sw.map(w => w/100),4));
  D.groups.forEach(([s,c,m]) => geo.addGroup(s,c,m));
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, mats);
  roots.forEach(r => mesh.add(r));
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  // 眼睛：兩個小方塊掛在頭骨上（一般網格不能用 skinning 材質）
  const eyeM = M(0x1e1a19);
  const B = {}; bones.forEach(b => B[b.name] = b);
  const head = B.spine011, hw = new THREE.Vector3(); mesh.updateMatrixWorld(true); head.getWorldPosition(hw);
  const ev = []; for(let i=0;i<D.eyes.length/3;i++) ev.push(T(D.eyes[i*3]/10, D.eyes[i*3+1]/10, D.eyes[i*3+2]/10));
  [1,-1].forEach(sg => {
    const pts = ev.filter(p => p[0]*sg > 0); if(!pts.length) return;
    const c = [0,1,2].map(k => pts.reduce((a,p) => a+p[k], 0)/pts.length);
    const e = new THREE.Mesh(new THREE.BoxGeometry(S*1.6, S*.9, S*1.4), eyeM);
    e.position.set(c[0]-hw.x, c[1]-hw.y, c[2]-hw.z); head.add(e);
  });
  // 舌頭（跑完、玩耍時吐舌）
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(S*2.2, S*.5, S*3), M(0xe0717a));
  let snw = new THREE.Vector3(0,0,-1e9); for(let i=0;i<n;i++) if(pos[i*3+2] > snw.z) snw.set(pos[i*3], pos[i*3+1], pos[i*3+2]);   // 鼻尖＝最前端的點
  tongue.position.set(0, (snw.y-hw.y) - S*3.5, (snw.z-hw.z) - S*2.5); tongue.rotation.x = .5; tongue.visible = false; head.add(tongue);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(mesh);
  // 翻身時以軀幹中心為軸
  const torsoY = W[D.bones.findIndex(b => b.n === 'spine006')][1] - 3*S, thighY = W[D.bones.findIndex(b => b.n === 'thighL')][1];
  mesh.position.y = -torsoY;
  // 目前角度與目標角度
  const cur = new Map(), tgt = new Map();
  bones.forEach(b => { cur.set(b, new THREE.Vector3()); tgt.set(b, new THREE.Vector3()); });
  const R = {roll:0, lift:0, drop:0}, Rt = {roll:0, lift:0, drop:0};
  const set = (name, x=0, y=0, z=0) => { const b = B[name]; if(b) tgt.get(b).set(x,y,z); };
  const LR = (f) => { f('L', 1); f('R', -1); };
  function pose(kind, ph, t){
    tgt.forEach(v => v.set(0,0,0)); Rt.roll = 0; Rt.lift = 0; Rt.drop = 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    if(kind === 'walk' || kind === 'run'){
      const run = kind === 'run', A = run ? .75 : .45;
      LR((sd, sg) => {
        // 走：對角線同步；跑：前後各一組（奔跑）
        const off = run ? (sd === 'L' ? .35 : 0) : (sd === 'L' ? Math.PI : 0);
        const offH = run ? Math.PI*.85 + (sd === 'L' ? .35 : 0) : (sd === 'L' ? 0 : Math.PI);
        const fs = Math.sin(ph+off), fc = Math.cos(ph+off), hs = Math.sin(ph+offH), hc = Math.cos(ph+offH);
        set('front_thigh'+sd, -A*fs);  set('front_foot'+sd, Math.max(0,-fc)*1.1*(run?1.2:1));
        set('thigh'+sd, -A*hs);        set('shin'+sd, Math.max(0,hc)*.5);   set('foot'+sd, -Math.max(0,hc)*.7);
      });
      set('spine006', run ? s*.12 : 0); set('spine009', run ? -c*.12 : 0);
      set('spine003', 0, 0, Math.sin(t*(run?9:7))*(run?.12:.25));
      Rt.lift = run ? Math.abs(c)*.02 : Math.abs(c)*.008;
    } else if(kind === 'sit'){
      set('spine004', -.65); set('spine006', -.15);             // 前身抬起（以臀部為軸）、背部微彎
      LR(sd => { set('front_thigh'+sd, .8); set('front_foot'+sd, -.05); set('thigh'+sd, -.82); set('shin'+sd, 3.0); set('foot'+sd, -1.3); });
      set('spine009', .45); set('spine011', Math.sin(t*.8)*.08, Math.sin(t*.6)*.35);
      set('spine003', 0, 0, Math.sin(t*10)*.25);
      Rt.drop = 1;
    } else if(kind === 'side'){                                // 側躺睡覺
      Rt.roll = Math.PI/2;
      LR((sd, sg) => { set('front_thigh'+sd, -.5 + sg*.08); set('front_foot'+sd, .15); set('thigh'+sd, -.35 + sg*.08); set('shin'+sd, .25); });
      set('spine009', -.15); set('spine011', .25 + Math.sin(t*1.2)*.02);
      set('spine003', -.4); set('spine006', Math.sin(t*1.2)*.03);   // 呼吸
    } else if(kind === 'belly'){                               // 翻肚
      Rt.roll = Math.PI;
      LR((sd, sg) => { set('front_thigh'+sd, -1.2 + Math.sin(t*1.5 + sg)*.08); set('front_foot'+sd, 1.6); set('thigh'+sd, -.9 + Math.sin(t*1.3 - sg)*.1); set('shin'+sd, .9); set('foot'+sd, -.6); set('spine'+'009', 0); });
      set('spine011', 0, .4); set('spine003', .3, 0, Math.sin(t*3)*.3);
    } else {                                                  // 站著：呼吸、張望、搖尾
      set('spine011', Math.sin(t*.7)*.06, Math.sin(t*.9)*.45, Math.sin(t*1.3)*.08);
      set('spine003', 0, 0, Math.sin(t*12)*.3);
      set('spine006', Math.sin(t*2.2)*.015);
    }
  }
  function update(dt, t, kind, ph, pant){
    pose(kind, ph, t);
    const k = Math.min(1, dt * (kind === 'walk' || kind === 'run' ? 18 : 5));
    bones.forEach(b => { const c = cur.get(b); c.lerp(tgt.get(b), k); b.rotation.set(c.x, c.y, c.z); });
    const kr = Math.min(1, dt*3);
    R.roll += (Rt.roll - R.roll)*kr; R.lift += (Rt.lift - R.lift)*k; R.drop += (Rt.drop - R.drop)*kr;
    body.rotation.z = R.roll;
    // 側躺、翻肚時把身體放到地面；坐下時臀部降到地面
    const lay = Math.abs(Math.sin(R.roll));
    const half = .055 + .03*Math.max(0, -Math.cos(R.roll));            // 側躺貼地約半個身寬，翻肚約半個身高
    body.position.y = torsoY + R.lift - R.drop*thighY*.95 - (1 - Math.cos(R.roll*0) )*0 - Math.min(1, lay + Math.max(0,-Math.cos(R.roll)))*(torsoY - half);
    tongue.visible = kind === 'run' || kind === 'belly' || !!pant;
  }
  return {g, mesh, B, update, S};
}

// 骨架模型資料在 scene/models/shiba.js；載入後換掉程式拼成的精細版（載入失敗就沿用程式版）
function attachShibaRig(){
  if(shiba.rig || !window.SHIBA_MODEL) return;
  try {
    const rig = makeShibaRig(window.SHIBA_MODEL, M, .42);
    rig.g.traverse(o => { if(o.isMesh) o.userData.island = 'notice'; });
    shiba.g.add(rig.g); shiba.rig = rig; shiba.hd.visible = false;
  } catch(e){ console.warn('柴犬模型載入失敗，改用簡易版', e); }
}
if(window.SHIBA_MODEL) attachShibaRig();
else { const sc = document.createElement('script'); sc.src = 'scene/models/shiba.js'; sc.onload = attachShibaRig; document.head.appendChild(sc); }

// 點擊位置標記（淡出的圓圈）
const pawRing = new THREE.Mesh(new THREE.RingGeometry(.12,.17,20), new THREE.MeshBasicMaterial({color:0xf2a516, transparent:true, opacity:0, depthWrite:false}));
pawRing.rotation.x = -Math.PI/2; mainIsland.add(pawRing);

const dog = {x:-2.3, z:-.8, target:null, wait:1.5, speed:.9, phase:0, heading:0, rest:'stand', pant:0, getUp:0};
function randomTarget(){
  for(let i=0;i<40;i++){
    const x = (Math.random()*2-1)*5, z = (Math.random()*2-1)*5.6;
    if(walkable(x,z) && Math.hypot(x-dog.x, z-dog.z) > 1.2) return {x,z};
  }
  return null;
}
function sendDog(x,z){
  if(inBld(x,z)){        // 點到大樓：改去最近的大樓邊緣
    const d = [[x-BLD.x1,'x1'],[BLD.x2-x,'x2'],[z-BLD.z1,'z1'],[BLD.z2-z,'z2']].sort((a,b)=>a[0]-b[0])[0][1];
    if(d==='x1') x = BLD.x1-.05; if(d==='x2') x = BLD.x2+.05; if(d==='z1') z = BLD.z1-.05; if(d==='z2') z = BLD.z2+.05;
  }
  if(!insideHex(x,z,.3)) return;
  if(dog.rest && dog.rest !== 'stand' && !dog.target) dog.getUp = dog.rest === 'sit' ? .25 : .6;
  dog.rest = 'stand'; dog.target = {x,z}; dog.speed = 1.7;
  pawRing.position.set(x, groundY(x,z)+.01, z); pawRing.material.opacity = .9;
}
const angLerp = (a,b,k) => { let d = ((b-a+Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI; return a + d*k; };
const _dogWorld = new THREE.Vector3();
// 依步態設定關節角度。gait：0＝站立、1＝走、2＝跑；sit：0–1
function poseDog(sh, t, gait, sit){
  const ph = dog.phase, k = gait === 2 ? 1 : gait === 1 ? .6 : 0;
  const sw = Math.sin(ph), cw = Math.cos(ph);
  sh.legs.forEach((L,i) => {
    // 走：對角線同步（左前＋右後）；跑：前腳一組、後腳一組（奔跑）
    const off = gait === 2 ? (L.hind ? Math.PI*.9 : 0) + (i%2 ? .35 : 0) : ((i===0||i===3) ? 0 : Math.PI);
    const s = Math.sin(ph + off), c = Math.cos(ph + off);
    let up = L.base[0] + s*.5*k, lo = L.base[1];
    if(L.hind) lo += -Math.max(0, c)*.5*k; else lo += Math.max(0, -c)*.9*k;
    if(L.hind){ up = up*(1-sit) + (-.82)*sit; lo = lo*(1-sit) + 2.9*sit; }    // 坐：大腿平放往前、小腿往後收
    else { up = up*(1-sit) + .75*sit; lo = lo*(1-sit); }                       // 前腳撐直（抵消身體後傾）
    L.up.rotation.x = up; L.lo.rotation.x = lo;
  });
  sh.body.rotation.x = -.75*sit + (gait === 2 ? sw*.08 : 0);
  sh.body.position.y = .32 - .035*sit + (gait ? Math.abs(cw)*.012*k : Math.sin(t*2.2)*.003);
  sh.neck.rotation.x = .55 + .55*sit + (gait === 2 ? -cw*.08 : 0);
  sh.tail.rotation.z = Math.sin(t*(gait ? 8 : 13))*(gait === 2 ? .15 : .35);
  // 簡單版
  const lsw = Math.sin(ph)*.7*k;
  sh.loLegs[0].rotation.x = lsw; sh.loLegs[3].rotation.x = lsw; sh.loLegs[1].rotation.x = -lsw; sh.loLegs[2].rotation.x = -lsw;
}
function updateDog(dt, t){
  const sh = shiba, rig = sh.rig;
  // 遠近切換：鏡頭距離柴犬 22 以內用精細版（骨架模型或程式版），較遠用簡單版
  sh.g.getWorldPosition(_dogWorld);
  const near = camera.position.distanceTo(_dogWorld) < 22;
  if(rig){ rig.g.visible = near; sh.hd.visible = false; } else sh.hd.visible = near;
  sh.lo.visible = !near;
  if(pawRing.material.opacity > 0) pawRing.material.opacity = Math.max(0, pawRing.material.opacity - dt*.5);
  if(dog.pant > 0) dog.pant -= dt;
  const pose = kind => { if(rig && near) rig.update(dt, t, kind, dog.phase, dog.pant > 0); };
  if(!dog.target){
    dog.wait -= dt;
    // 停下時的姿勢：站、坐、側躺睡、翻肚（照住戶提供的照片）；要走之前先站起來
    if(dog.wait <= 0 && dog.rest !== 'stand'){ dog.rest = 'stand'; dog.wait = .9; }
    const wantSit = dog.rest === 'sit' ? 1 : 0;
    sh.sit += (wantSit - sh.sit) * Math.min(1, dt*4);
    sh.head.rotation.y = Math.sin(t*.9)*.45; sh.head.rotation.z = Math.sin(t*1.3)*.12;
    poseDog(sh, t, 0, sh.sit); pose(dog.rest || 'stand');
    sh.g.position.set(dog.x, groundY(dog.x,dog.z), dog.z);
    if(dog.wait <= 0 && sh.sit < .05){ dog.target = randomTarget(); dog.speed = .9; if(!dog.target) dog.wait = 1; }
    return;
  }
  if(dog.getUp > 0){ dog.getUp -= dt; sh.sit = Math.max(0, sh.sit - dt*4); poseDog(sh, t, 0, sh.sit); pose('stand'); return; }
  if(sh.sit > .05){ sh.sit = Math.max(0, sh.sit - dt*4); poseDog(sh, t, 0, sh.sit); pose('stand'); return; }
  const dx = dog.target.x-dog.x, dz = dog.target.z-dog.z, d = Math.hypot(dx,dz);
  if(d < .06){
    if(dog.speed > 1.2) dog.pant = 4;                                     // 跑完吐舌頭
    const r = Math.random();
    dog.rest = r < .35 ? 'stand' : r < .7 ? 'sit' : r < .85 ? 'side' : 'belly';
    dog.wait = dog.rest === 'side' || dog.rest === 'belly' ? 6 + Math.random()*5 : 2 + Math.random()*3;
    dog.target = null; dog.sitter = dog.rest === 'sit'; return;
  }
  const step = Math.min(d, dog.speed*dt);
  let vx = dx/d, vz = dz/d;
  if(inBld(dog.x+vx*step, dog.z+vz*step)){
    // 碰到大樓：沿牆面繞行，往目標較近的一側
    if(dog.x > BLD.x1 && dog.x < BLD.x2){
      const dir = dog.target.x < BLD.x1 ? -1 : dog.target.x > BLD.x2 ? 1 : (dog.x-BLD.x1 < BLD.x2-dog.x ? -1 : 1);
      vx = dir; vz = 0;
    } else {
      const dir = dog.target.z < BLD.z1 ? -1 : dog.target.z > BLD.z2 ? 1 : (dog.z-BLD.z1 < BLD.z2-dog.z ? -1 : 1);
      vx = 0; vz = dir;
    }
  }
  const nx = dog.x+vx*step, nz = dog.z+vz*step;
  if(!insideHex(nx,nz,.3) || inBld(nx,nz)){ dog.target = null; dog.wait = .5; dog.rest = 'stand'; return; }
  dog.x = nx; dog.z = nz;
  dog.heading = angLerp(dog.heading, Math.atan2(vx,vz), Math.min(1, dt*10));
  const run = dog.speed > 1.2;
  dog.phase += dt * (run ? 15 : 10);
  sh.head.rotation.y *= .9; sh.head.rotation.z *= .9;
  poseDog(sh, t, reduced ? 0 : run ? 2 : 1, 0);
  pose(reduced ? 'stand' : run ? 'run' : 'walk');
  sh.g.rotation.y = dog.heading;
  sh.g.position.set(dog.x, groundY(dog.x,dog.z), dog.z);
}


/* =========================================================
   四之三、電動車充電動畫
   白色 Model 3 駛入 → 倒車入格 → 駕駛下車取槍插入充電口 → 回車上
   → 充電 3 秒 → 下車拔槍歸位 → 上車駛離 → 循環
   ========================================================= */
const EV = {dt:0};
function* evWait(s){ for(let t=0; t<s; t+=EV.dt) yield; }
function* evTween(s, fn){ for(let t=0; t<s;){ t += EV.dt; fn(Math.min(1,t/s)); yield; } }
const easeIO = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2, easeOut = t => 1-(1-t)*(1-t), easeIn = t => t*t;
const bez = (a,b,c,d,t) => { const u = 1-t; return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x, z:u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z}; };
function evRunner(isl){
  const S = isl.userData.ev, {T, P, ch, conn, cable, label} = S, tmp = new THREE.Vector3();
  const local = o => { o.getWorldPosition(tmp); return isl.worldToLocal(tmp.clone()); };
  const car = {x:0, z:0, h:0}, pp = {x:0, z:0, h:0};
  let connMode = 'holster', clock = 0;
  const placeCar = () => { T.g.position.set(car.x,.05,car.z); T.g.rotation.y = car.h; label.sprite.position.set(car.x,1.0,car.z); };
  const placeP = () => { P.g.position.set(pp.x,.05,pp.z); P.g.rotation.y = pp.h; };
  const carPt = (lx,lz) => ({x:car.x + lx*Math.cos(car.h) + lz*Math.sin(car.h), z:car.z - lx*Math.sin(car.h) + lz*Math.cos(car.h)});
  function* drive(path, dur, reverse, easing){
    let prev = path(0);
    yield* evTween(dur, k => {
      const t = easing(k), p = path(t), q = path(Math.min(1,t+.01)), r = path(Math.max(0,t-.01));
      if(Math.hypot(q.x-r.x, q.z-r.z) > 1e-5) car.h = Math.atan2(q.x-r.x, q.z-r.z) + (reverse ? Math.PI : 0);
      const d = Math.hypot(p.x-prev.x, p.z-prev.z); prev = p;
      T.wheels.forEach(w => w.rotation.x += (reverse ? -1 : 1) * d/.085);
      car.x = p.x; car.z = p.z; placeCar();
    });
  }
  function* door(open){ yield* evTween(.45, k => T.door.rotation.y = -1.1 * (open ? k : 1-k)); }
  function* walk(pt, holding){
    for(;;){
      const dx = pt.x-pp.x, dz = pt.z-pp.z, d = Math.hypot(dx,dz);
      if(d < .01) break;
      const st = Math.min(d, .5*EV.dt);
      pp.x += dx/d*st; pp.z += dz/d*st; pp.h = angLerp(pp.h, Math.atan2(dx,dz), Math.min(1, EV.dt*12));
      P.phase += EV.dt*11; const s = Math.sin(P.phase)*.6;
      P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s*.7; if(!holding) P.armR.rotation.x = s*.7;
      placeP(); yield;
    }
    P.legL.rotation.x = P.legR.rotation.x = P.armL.rotation.x = 0; if(!holding) P.armR.rotation.x = 0;
  }
  function* face(pt){ const h = Math.atan2(pt.x-pp.x, pt.z-pp.z); yield* evTween(.25, k => { pp.h = angLerp(pp.h, h, k); placeP(); }); }
  function* arm(from, to, s=.3){ yield* evTween(s, k => P.armR.rotation.x = from + (to-from)*k); }
  function* getOut(seat, out){
    yield* door(true);
    pp.x = seat.x; pp.z = seat.z; pp.h = Math.atan2(out.x-seat.x, out.z-seat.z); placeP(); P.g.visible = true;
    yield* walk(out); yield* door(false);
  }
  function* getIn(seat, out){
    yield* walk(out); yield* door(true); yield* walk(seat); P.g.visible = false; yield* door(false);
  }
  function* script(){
    const st = S.stall, E = {x:st, z:-.85};
    for(;;){
      T.g.visible = P.g.visible = label.sprite.visible = false; connMode = 'holster'; S.charging = false;
      yield* evWait(1.2);
      // 1. 駛入：沿車道由東往西
      car.x = 4.7; car.z = .9; car.h = -Math.PI/2; placeCar(); T.g.visible = true;
      yield* drive(t => ({x:4.7 + (st-.9-4.7)*t, z:.9}), 3.2, false, easeOut);
      yield* evWait(.4);
      // 2. 倒車入格，車尾朝充電樁
      yield* drive(t => bez({x:st-.9,z:.9}, {x:st-.2,z:.9}, {x:st,z:-.05}, E, t), 3.0, true, easeIO);
      yield* evWait(.5);
      const seat = carPt(.12,.05), out = carPt(.46,-.05), port = carPt(.46,-.5), chFront = local(ch.front), chPt = local(ch.holster);
      // 3. 下車取槍
      yield* getOut(seat, out);
      yield* walk(chFront); yield* face(chPt);
      yield* arm(0,-1.2); connMode = 'hand'; yield* arm(-1.2,-.7,.25);
      // 4. 插入充電口
      yield* walk(port, true); yield* face(local(T.port));
      yield* arm(-.7,-1.2,.25); connMode = 'port'; S.charging = true; yield* arm(-1.2,0);
      // 5. 回車上，充電 3 秒
      yield* getIn(seat, out);
      label.set(0); label.sprite.visible = true;
      yield* evTween(3, k => label.set(k));
      S.charging = false; label.set(1, true);
      yield* evWait(.7); label.sprite.visible = false;
      // 6. 下車拔槍、歸還
      yield* getOut(seat, out);
      yield* walk(port); yield* face(local(T.port));
      yield* arm(0,-1.2); connMode = 'hand'; yield* arm(-1.2,-.7,.25);
      yield* walk(chFront, true); yield* face(chPt);
      yield* arm(-.7,-1.2,.25); connMode = 'holster'; yield* arm(-1.2,0);
      // 7. 上車駛離
      yield* getIn(seat, out);
      yield* evWait(.4);
      yield* drive(t => bez(E, {x:st,z:-.05}, {x:st-.5,z:.9}, {x:st-1.2,z:.9}, t), 2.6, false, easeIO);
      yield* drive(t => ({x:st-1.2 + (-4.9-(st-1.2))*t, z:.9}), 2.6, false, easeIn);
      T.g.visible = false;
    }
  }
  const gen = script();
  return {
    step(t){
      clock = t; gen.next();
      isl.updateMatrixWorld(true);
      const cp = connMode === 'holster' ? local(ch.holster) : connMode === 'hand' ? local(P.hand) : local(T.port);
      conn.position.copy(cp);
      conn.rotation.y = connMode === 'port' ? car.h : connMode === 'hand' ? pp.h : 0;
      ch.coil.visible = connMode === 'holster'; cable.visible = !ch.coil.visible;
      if(cable.visible){
        const a = local(ch.top), mid = a.clone().lerp(cp,.5); mid.y = Math.max(.08, Math.min(a.y,cp.y) - .25);
        cable.geometry.dispose(); cable.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, cp), 16, .011, 5, false);
      }
      ch.led.emissive.setHex(S.charging ? 0x3ddc84 : 0x8fd3ff);
      ch.led.emissiveIntensity = S.charging ? .7 + .5*Math.sin(t*6) : .5;
      T.portGlow.visible = connMode === 'port';
    }
  };
}
const evIsland = islandObjs.find(o => o.userData.def.id === 'ev');
const evRun = evIsland && evIsland.userData.ev ? evRunner(evIsland) : null;

/* 雲 */
const clouds = [];
for(let i=0;i<7;i++){
  const c = new THREE.Group(), cm = M(0xffffff,{transparent:true,opacity:.9});
  for(let k=0;k<3;k++){ const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2+Math.random(),0), cm); p.position.set(k*1.6-1.6, Math.random()*.4, Math.random()*.6); c.add(p); }
  const a = i/7*Math.PI*2; c.position.set(Math.cos(a)*34, 10+Math.random()*6, Math.sin(a)*34);
  c.userData.a = a; scene.add(c); clouds.push(c); mergeStatic(c);
}

/* =========================================================
   五、時段（白天 / 黃昏 / 夜晚）
   ========================================================= */
const MODES = {
  day:  {sky:'linear-gradient(#ffd27a 0%,#ffe7b8 45%,#fff3dc 100%)', fog:0xffe6bd, sea:0x6fb7c9, sun:1.15, sunC:0xfff0d0, hemi:.75, lit:0,   pos:[30,45,20]},
  dusk: {sky:'linear-gradient(#e0703a 0%,#f2a24a 45%,#ffd59a 100%)', fog:0xf3b277, sea:0x5c93a6, sun:.85,  sunC:0xffb26b, hemi:.55, lit:.7,  pos:[45,18,10]},
  night:{sky:'linear-gradient(#141d3a 0%,#2b3460 55%,#4a4470 100%)', fog:0x2c3358, sea:0x23365a, sun:.28,  sunC:0x9fb4ff, hemi:.28, lit:1.4, pos:[-20,40,-10]}
};
function setMode(m){
  const s = MODES[m];
  document.getElementById('sky').style.background = s.sky;
  scene.fog.color.setHex(s.fog); mat.sea.color.setHex(s.sea);
  sun.intensity = s.sun; sun.color.setHex(s.sunC); sun.position.set(...s.pos); hemi.intensity = s.hemi;
  mat.glassLit.emissiveIntensity = s.lit;
  bmat.gymGlass.emissiveIntensity = s.lit * .6;
  mat.lamp.emissiveIntensity = s.lit * 1.3; mat.signRed.emissiveIntensity = s.lit * .6; mat.lampWood.emissiveIntensity = s.lit;
  mat.glow.emissiveIntensity = s.lit * .6; parkLights.forEach(l => l.intensity = s.lit * 1.1);
  document.querySelectorAll('.timebar button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode===m));
}
const h = new Date().getHours();
setMode(h>=6 && h<16 ? 'day' : h>=16 && h<18.5 ? 'dusk' : 'night');

/* =========================================================
   六、島名標籤與面板
   ========================================================= */
const labelsEl = document.getElementById('labels');
islandObjs.forEach(g => {
  const d = g.userData.def, b = document.createElement('button');
  b.className = 'tag' + (d.id==='notice' ? ' main' : '');
  b.innerHTML = d.name + (d.status!=='open' ? `<small>${STATUS_TEXT[d.status] || ''}</small>` : '');
  b.onclick = () => clickCb(d.id);
  labelsEl.appendChild(b); g.userData.tag = b;
});


/* 鏡頭聚焦 */
let focusTarget = null;
function focusOn(id){
  const g = islandObjs.find(o => o.userData.def.id===id);
  focusTarget = new THREE.Vector3(g.position.x, 1.5, g.position.z);
  controls.autoRotate = false;
}

/* 點選偵測（區分拖曳與點擊） */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; controls.autoRotate = false; });
renderer.domElement.addEventListener('pointerup', e => {
  if(!down || Math.hypot(e.clientX-down[0], e.clientY-down[1]) > 6) return;
  ptr.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(islandObjs, true)[0];
  if(hit){
    let o = hit.object, onBuilding = false;
    while(o){ if(o === mainIsland.userData.building){ onBuilding = true; break; } o = o.parent; }
    if(hit.object.userData.island === 'notice' && !onBuilding){
      const p = mainIsland.worldToLocal(hit.point.clone()); sendDog(p.x, p.z);
    } else if(hit.object.userData.island){
      // 管委會島的「財務」「公告」標示：第二個參數帶 {adminTab}
      const tab = hit.object.userData.adminTab;
      if(tab) clickCb(hit.object.userData.island, {adminTab:tab}); else clickCb(hit.object.userData.island);
    }
  }
  const hintEl = document.getElementById('hint'); if(hintEl) hintEl.hidden = true;
});


/* =========================================================
   六之二、周邊地景（依建案區位圖相對方位：北 = +z，東 = -x）
   ========================================================= */
const farItems = [], farGroups = [];
function landmass(x, z, r){
  const g = new THREE.Group();
  g.add(cyl(r, r*1.08, .8, 8, mat.grassAlt, 0, -.4, 0));
  g.position.set(x, -3.4, z); scene.add(g); farGroups.push(g); return g;
}
function farLabel(g, text, h, cls='far'){
  const b = document.createElement('div'); b.className = 'tag ' + cls; b.textContent = text;
  labelsEl.appendChild(b); farItems.push({g, b, h});
}
const winStrip = (g,w,h,x,y,z) => g.add(box(w,h,.05,Math.random()<.5?mat.glassLit:mat.glass,x,y,z,false));
{ // 一品公園（東）
  const g = landmass(-40, 4, 8);
  g.add(cyl(2.4,2.4,.06,10,mat.sea,1,.03,1));
  for(let i=0;i<16;i++){ const a=Math.random()*6.28, r=2.8+Math.random()*4; g.add(tree(Math.cos(a)*r, Math.sin(a)*r, 1+Math.random()*.6)); }
  farLabel(g,'一品公園',3);
}
{ // 林口國民運動中心（北）
  const g = landmass(-6, 46, 7.5);
  g.add(box(9,2.4,6,bmat.cream,0,1.2,0), box(4,.3,4,M(0xe9b93a),0,2.55,0));
  for(let i=-3;i<=3;i++) winStrip(g,.9,.8,i*1.2,1.3,-3.03);
  farLabel(g,'林口國民運動中心',4.4);
}
{ // 元智大學醫護學院（東北）
  const g = landmass(-38, 36, 7);
  [[-2.5,0,3.5],[1.5,-1,5],[3,2.5,2.6]].forEach(([x,z,h])=>{ g.add(box(3,h,2.6,mat.white,x,h/2,z)); for(let k=.6;k<h-.3;k+=.7) winStrip(g,2.4,.35,x,k,z-1.33); });
  g.add(tree(-4,3), tree(4.5,-3));
  farLabel(g,'元智大學醫護學院',6.4);
}
{ // 佳林國中（南）
  const g = landmass(4, -46, 8);
  g.add(cyl(4,4,.08,16,mat.red,-1.5,.04,1), cyl(3,3,.1,16,mat.grass,-1.5,.05,1));
  g.add(box(6,2,1.8,bmat.cream,2,1,-4.2), box(1.8,2,4.5,bmat.cream,4.6,1,-1.2));
  for(let i=-2;i<=2;i++) winStrip(g,.8,.5,2+i*1.1,1.1,-3.27);
  farLabel(g,'佳林國中',3.6);
}
{ // 星巴克（西北）
  const g = landmass(30, 16, 3.5);
  g.add(box(3,1.2,2.2,bmat.cream,0,.6,0), box(3.1,.25,2.3,M(0x1e6b4f),0,1.25,0));
  winStrip(g,2.2,.6,0,.55,-1.13);
  g.add(tree(2,1.5,.8));
  farLabel(g,'星巴克',2.6);
}
{ // 新北影視城・民視・TVBS（西）
  const g = landmass(48, -6, 9);
  g.add(box(7,3,5,mat.white,-1,1.5,2), box(2.4,9,2.4,bmat.char,3.5,4.5,-3), box(2,7,2,M(0x6b8fae),-4,3.5,-3.5));
  for(let k=1;k<9;k+=.9) winStrip(g,1.8,.35,3.5,k,-4.23);
  farLabel(g,'新北影視城・民視',10);
}
// 林口新市鎮天際線（合併成一組；低畫質時隱藏）
const skyline = new THREE.Group(), skyGrey = M(0xb9b2a8);
for(let i=0;i<26;i++){
  const a = Math.random()*Math.PI*2, r = 64+Math.random()*16, h = 5+Math.random()*12;
  const t = box(3+Math.random()*2, h, 3+Math.random()*2, Math.random()>.5?bmat.cream:skyGrey, Math.cos(a)*r, -4.2+h/2, Math.sin(a)*r);
  t.castShadow = false; skyline.add(t);
}
scene.add(skyline); mergeStatic(skyline);
farGroups.forEach(mergeStatic);
// 方位標記
{ const g = new THREE.Group(); g.position.set(0, -1, 16); scene.add(g); farLabel(g,'↑ 北',0,'compass'); }
ROAD_TAGS.forEach(({o,t}) => farLabel(o,t,0,'road'));

/* =========================================================
   六之三、畫質
   high：與設計稿相同；medium：解析度 1.5 倍、陰影較柔；low：關陰影、解析度 1 倍、隱藏雲與天際線
   ========================================================= */
let quality = 'high', qualityLocked = false;
function applyQuality(q){
  if(q === quality) return;
  const hadShadow = quality !== 'low'; quality = q;
  const low = q === 'low', mid = q === 'medium';
  renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, mid ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  const size = mid ? 512 : 1024;
  if(sun.shadow.mapSize.x !== size){ sun.shadow.mapSize.set(size,size); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.shadowMap.enabled = !low; sun.castShadow = !low;
  clouds.forEach(c => c.visible = !low); skyline.visible = !low;
  if(hadShadow !== !low) scene.traverse(o => { if(o.material) o.material.needsUpdate = true; });
}
// 自動調整：開場暖機 1.5 秒後量 2.5 秒；分頁在背景時重新量
const fpsProbe = {t0:0, n:0, rounds:0};
function probeQuality(t){
  if(qualityLocked || fpsProbe.rounds >= 2) return;
  if(document.hidden){ fpsProbe.t0 = 0; return; }
  if(!fpsProbe.t0){ fpsProbe.t0 = t + 1.5; fpsProbe.n = 0; return; }
  if(t < fpsProbe.t0){ return; }
  fpsProbe.n++;
  if(t - fpsProbe.t0 >= 2.5){
    const fps = fpsProbe.n / (t - fpsProbe.t0);
    fpsProbe.rounds++; fpsProbe.t0 = 0;
    if(fps < 28) applyQuality(quality === 'high' ? 'medium' : 'low');
    else if(fps < 45 && quality === 'high') applyQuality('medium');
    else fpsProbe.rounds = 2;
  }
}

/* =========================================================
   七、動畫迴圈
   ========================================================= */
const clock = new THREE.Clock(), v = new THREE.Vector3();
function loop(){
  const t = clock.getElapsedTime(), dt = Math.min(.05, t - (loop.last||t)); loop.last = t;
  probeQuality(t);
  updateDog(dt, t);
  islandObjs.forEach(g => { const x = g.userData.ext; if(x && x.tick) x.tick(g, dt, t); });
  if(evRun){ EV.dt = dt; evRun.step(t); }
  islandObjs.forEach(g => { const c = g.userData.crane; if(c && !reduced) c.rotation.y = -.5 + Math.sin(t*.25)*.9; });
  islandObjs.forEach(g => {
    if(!reduced) g.position.y = Math.sin(t*.6 + g.userData.phase)*.18;
    const b = g.userData.building;
    v.set(g.position.x, g.position.y + (g.userData.def.id==='notice' ? 7.6 : (g.userData.def.tagH || 2.6)), g.position.z).project(camera);
    const tag = g.userData.tag;
    tag.style.left = ((v.x+1)/2*innerWidth) + 'px';
    tag.style.top = ((1-v.y)/2*innerHeight) + 'px';
    tag.hidden = v.z > 1;
  });
  farItems.forEach(({g,b,h}) => {
    g.getWorldPosition(v); v.y += h; v.project(camera);
    b.style.left = ((v.x+1)/2*innerWidth) + 'px'; b.style.top = ((1-v.y)/2*innerHeight) + 'px'; b.hidden = v.z > 1;
  });
  if(!reduced) clouds.forEach(c => { c.userData.a += .0006; c.position.x = Math.cos(c.userData.a)*34; c.position.z = Math.sin(c.userData.a)*34; });
  if(focusTarget) controls.target.lerp(focusTarget, .06);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

    function groupOf(id){ return islandObjs.find(o => o.userData.def.id === id); }
    api = {
      focus(id){ if(groupOf(id)) focusOn(id); },
      unfocus(){ focusTarget = null; },
      setIslandData(id, data){
        const g = groupOf(id), x = g && g.userData.ext; if(!x) return;
        if(data == null){ x.empty && x.empty(g); } else { x.update && x.update(g, data); }
      },
      setLoading(id, on){ const g = groupOf(id), x = g && g.userData.ext; if(x && x.setLoading) x.setLoading(g, on); },
      setMode(m){ if(MODES[m]) setMode(m); },
      setQuality(q){ qualityLocked = true; applyQuality(q === 'low' ? 'low' : q === 'medium' ? 'medium' : 'high'); }
    };
    return api;
  }

  return {
    init,
    onIslandClick(fn){ clickCb = typeof fn === 'function' ? fn : () => {}; },
    focus(id){ api && api.focus(id); },
    unfocus(){ api && api.unfocus(); },
    setIslandData(id, data){ api && api.setIslandData(id, data); },
    setLoading(id, on){ api && api.setLoading(id, on); },
    setMode(m){ api && api.setMode(m); },
    setQuality(q){ api && api.setQuality(q); }
  };
})();
