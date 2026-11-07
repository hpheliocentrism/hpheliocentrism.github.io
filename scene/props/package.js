/* =========================================================
   網站/scene/props/package.js — 包裹島造景（美術 3D）
   對外：{ build(group), update(group, data), empty(group) }
   選用：setLoading(group, on)、tick(group, dt, t)（載入中動畫，scene.js 若有就呼叫）
   data ＝ pkg.stats 的 data：{ updated, rules:{side,sum}, rows:[{cls,normal,attention,soon,total}], total }
   只顯示數量，不含任何戶號或個資。
   依賴：全域 THREE（r128）
   ========================================================= */
(function(){
  if(!window.THREE) return;                                  // three.js 載入失敗時不報錯（改用 2D 簡易模式）
  const THREE = window.THREE;
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  const CAP = 12;                                            // 一堆最多畫 12 箱，超過改顯示數字
  const STATUS = ['normal','attention','soon'];               // 由下往上：綠 → 橘 → 紅（紅色在最上面最醒目）
  const TAPE = {normal:0x4fa36b, attention:0xf08a24, soon:0xd9322a};
  const TAPE_CSS = {normal:'#4fa36b', attention:'#f08a24', soon:'#d9322a'};
  const LABEL = {normal:'正常', attention:'需注意', soon:'即將處理'};

  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({color:c, flatShading:true, roughness:.9, metalness:0}, o));
  const mat = {
    wood:M(0xb98a55), woodDark:M(0x8f6a3f), deck:M(0xe8d6b5), card:M(0xc99a5e),
    cooler:M(0xf3f6f8,{roughness:.6}), lid:M(0x4f8fc9),
    tape_normal:M(TAPE.normal,{emissive:TAPE.normal,emissiveIntensity:.25}), tape_attention:M(TAPE.attention,{emissive:TAPE.attention,emissiveIntensity:.25}), tape_soon:M(TAPE.soon,{emissive:TAPE.soon,emissiveIntensity:.25}), metal:M(0x8f9499,{metalness:.3,roughness:.6}),
    awning:M(0xf2a516), wall:M(0xf4ece0), leaf:M(0x6fa84a), leafB:M(0x8dbb4f), trunk:M(0x8a5a32), dark:M(0x3b2a1a)
  };
  const unitBox = new THREE.BoxGeometry(1,1,1);

  /* 把多個方塊合併成一個網格（同材質、不會動的零件 → 一次繪製） */
  function mergedBoxes(parts, m){
    const pos = [], nor = [];
    parts.forEach(([w,h,d,x,y,z,ry=0]) => {
      const g = new THREE.BoxGeometry(w,h,d).toNonIndexed();
      if(ry) g.rotateY(ry);
      g.translate(x,y,z);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function canvasPlane(w, h, cw, ch){
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({map:tex, transparent:true}));
    return {mesh, ctx:c.getContext('2d'), tex, cw, ch};
  }
  function canvasSprite(w, h, cw, ch){
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false}));
    sp.scale.set(w,h,1); sp.renderOrder = 10;
    return {sprite:sp, ctx:c.getContext('2d'), tex, cw, ch};
  }
  const rnd = i => { const x = Math.sin(i*12.9898+78.233)*43758.5453; return x - Math.floor(x); };   // 固定亂數：每次更新位置不跳動

  /* 三堆的設定：箱子大小、每層排法、棧板位置 */
  const HEAPS = {
    '小型': {x:-2.55, z:.15, w:.38, h:.27, cols:3, rows:3, cooler:false, pallet:[1.45,1.25]},
    '大型': {x:  .05, z:-.05, w:.62, h:.46, cols:2, rows:2, cooler:false, pallet:[1.5,1.5]},
    '冷藏': {x: 2.6, z:.15, w:.46, h:.34, cols:2, rows:2, cooler:true,  pallet:[1.25,1.25]}
  };

  function build(group){
    const S = {heaps:{}, loading:false, t:0};
    // 鋪面：淺色木棧平台
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.6,4.6,.06,6), mat.deck);
    deck.position.y = .03; deck.receiveShadow = true; group.add(deck);

    // 三個棧板（每個棧板合併成一個網格）
    const palletParts = [];
    Object.values(HEAPS).forEach(H => {
      const [pw,pd] = H.pallet;
      for(let i=0;i<3;i++) palletParts.push([pw,.06,.12, H.x,.09, H.z-pd/2+.08+i*(pd-.16)/2]);   // 底梁
      for(let i=0;i<5;i++) palletParts.push([pw*.18,.04,pd, H.x-pw/2+pw*.09+i*(pw-pw*.18)/4,.14,H.z]); // 面板
    });
    group.add(mergedBoxes(palletParts, mat.wood));

    // 收發亭（背後）、推車、樹（合併）
    group.add(mergedBoxes([[1.5,.9,1.0,-.2,.51,-2.55],[.5,.6,.02,-.55,.45,-2.04],[.5,.3,.02,.3,.6,-2.04]], mat.wall));
    group.add(mergedBoxes([[1.7,.08,1.3,-.2,1.0,-2.45,0]], mat.awning));
    group.add(mergedBoxes([[.05,.7,.05,1.05,.4,.95],[.05,.7,.05,1.3,.4,.95],[.3,.04,.3,1.18,.07,1.05],[.3,.03,.03,1.18,.75,.95]], mat.metal));
    group.add(mergedBoxes([[.12,.6,.12,-4.0,.33,1.3],[.12,.6,.12,3.9,.33,-1.9],[.1,.5,.1,-3.4,.28,-2.4]], mat.trunk));
    [[-4.0,1.3,.55],[3.9,-1.9,.6],[-3.4,-2.4,.45]].forEach(([x,z,r],i) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r,0), i%2?mat.leafB:mat.leaf);
      c.position.set(x, .6+r*.8, z); c.castShadow = true; group.add(c);
    });

    // 收發亭上的看板：總數、更新時間、大型判定門檻、顏色說明
    const board = canvasPlane(2.2,1.1,512,256);
    board.mesh.position.set(-.2,1.62,-1.8); group.add(board.mesh);
    group.add(mergedBoxes([[2.3,1.2,.05,-.2,1.62,-1.86,0],[.06,.5,.06,-1.2,1.15,-1.9],[.06,.5,.06,.8,1.15,-1.9]], mat.dark));
    S.board = board;

    Object.entries(HEAPS).forEach(([cls,H]) => {
      const hp = {H};
      // 箱體、膠帶、保冷箱蓋：每種一個 InstancedMesh（一堆只需 2～3 次繪製）
      hp.body = new THREE.InstancedMesh(unitBox, H.cooler ? mat.cooler : mat.card, CAP);
      hp.tapes = {}; STATUS.forEach(k => hp.tapes[k] = new THREE.InstancedMesh(unitBox, mat['tape_'+k], CAP));
      [hp.body, ...Object.values(hp.tapes)].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.count = 0; group.add(m); });
      if(H.cooler){ hp.lid = new THREE.InstancedMesh(unitBox, mat.lid, CAP); hp.lid.castShadow = true; hp.lid.count = 0; group.add(hp.lid); }
      // 前方立牌：類別、件數、三色小計
      const sign = canvasPlane(1.15,.61,256,136);
      sign.mesh.position.set(H.x, .7, H.z + H.pallet[1]/2 + .32); group.add(sign.mesh);
      group.add(mergedBoxes([[.04,.42,.04,H.x,.21,H.z+H.pallet[1]/2+.3]], mat.woodDark));
      hp.sign = sign;
      // 超過上限時的數字標示
      hp.more = canvasSprite(.8,.34,256,108); hp.more.sprite.visible = false; group.add(hp.more.sprite);
      S.heaps[cls] = hp;
    });

    // 載入中：一個紙箱在中央上下跳動旋轉
    const lb = new THREE.Group();
    const lbody = new THREE.Mesh(unitBox, mat.card); lbody.scale.set(.5,.38,.5); lbody.castShadow = true; lb.add(lbody);
    const ltape = new THREE.Mesh(unitBox, M(0xf2a516)); ltape.scale.set(.51,.385,.12); lb.add(ltape);
    lb.position.set(.05, 1.2, -.05); lb.visible = false; group.add(lb);
    S.loadBox = lb;

    group.userData.pkg = S;
    drawBoard(S, null);
    Object.entries(S.heaps).forEach(([cls,hp]) => drawSign(hp, cls, null));
    return group;
  }

  /* ---------- 畫布文字 ---------- */
  function drawSign(hp, cls, row){
    const {ctx:x, tex, cw, ch} = hp.sign;
    x.clearRect(0,0,cw,ch);
    x.fillStyle = '#fff8ec'; x.fillRect(0,0,cw,ch);
    x.fillStyle = '#f2a516'; x.fillRect(0,0,cw,10);
    x.fillStyle = '#3b2a1a'; x.font = `700 40px ${FONT}`; x.textBaseline = 'middle';
    x.fillText(cls, 16, 46);
    x.textAlign = 'right'; x.font = `700 44px ${FONT}`;
    x.fillText(row ? `${row.total} 件` : '…', cw-16, 46);
    x.textAlign = 'left';
    STATUS.forEach((k,i) => {
      const cx = 16 + i*80;
      x.fillStyle = TAPE_CSS[k]; x.fillRect(cx, 92, 22, 22);
      x.fillStyle = '#3b2a1a'; x.font = `700 28px ${FONT}`;
      x.fillText(row ? String(row[k]||0) : '–', cx+30, 104);
    });
    tex.needsUpdate = true;
  }
  function drawBoard(S, data, state){
    const {ctx:x, tex, cw, ch} = S.board;
    x.clearRect(0,0,cw,ch);
    x.fillStyle = '#3b2a1a'; x.fillRect(0,0,cw,ch);
    x.fillStyle = '#fff3dc'; x.textBaseline = 'middle';
    x.font = `700 40px ${FONT}`; x.fillText('待領包裹', 28, 48);
    x.textAlign = 'right';
    if(state === 'loading'){ x.font = `700 48px ${FONT}`; x.fillText('讀取中…', cw-28, 50); }
    else if(!data || !data.total){ x.font = `700 40px ${FONT}`; x.fillStyle = '#8fd6a0'; x.fillText(data ? '目前沒有待領包裹' : '—', cw-28, 50); }
    else { x.font = `700 64px ${FONT}`; x.fillText(`${data.total} 件`, cw-28, 52); }
    x.textAlign = 'left'; x.fillStyle = '#fff3dc';
    STATUS.forEach((k,i) => {
      const cx = 28 + i*160;
      x.fillStyle = TAPE_CSS[k]; x.fillRect(cx, 112, 26, 26);
      x.fillStyle = '#fff3dc'; x.font = `500 26px ${FONT}`; x.fillText(LABEL[k], cx+36, 126);
    });
    x.fillStyle = '#c4ab8e'; x.font = `500 22px ${FONT}`;
    if(data && data.rules) x.fillText(`大型：任一邊超過 ${data.rules.side} 公分，或三邊相加超過 ${data.rules.sum} 公分`, 28, 180);
    if(data && data.updated) x.fillText(`更新：${data.updated}`, 28, 222);
    tex.needsUpdate = true;
  }
  function drawMore(hp, n){
    const {ctx:x, tex, cw, ch} = hp.more;
    x.clearRect(0,0,cw,ch);
    x.fillStyle = 'rgba(59,42,26,.92)'; x.fillRect(6,6,cw-12,ch-12);
    x.fillStyle = '#fff3dc'; x.font = `700 52px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`共 ${n} 件`, cw/2, ch/2+2);
    tex.needsUpdate = true;
  }

  /* ---------- 依件數排箱子 ---------- */
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  function capCounts(row){
    const n = STATUS.map(k => Math.max(0, row[k]|0)), tot = n.reduce((a,b)=>a+b,0);
    if(tot <= CAP) return n;
    // 超過上限：依比例縮成 12 箱，且有件數的狀態至少留 1 箱
    let out = n.map(c => c ? Math.max(1, Math.round(c*CAP/tot)) : 0);
    while(out.reduce((a,b)=>a+b,0) > CAP){ const i = out.indexOf(Math.max(...out)); out[i]--; }
    while(out.reduce((a,b)=>a+b,0) < CAP){ const i = n.indexOf(Math.max(...n)); out[i]++; }
    return out;
  }
  function layHeap(hp, row){
    const H = hp.H, counts = row ? capCounts(row) : [0,0,0];
    const list = []; STATUS.forEach((k,i) => { for(let j=0;j<counts[i];j++) list.push(k); });
    const per = H.cols*H.rows, gap = H.w*1.06, tn = {normal:0, attention:0, soon:0};
    list.forEach((k,i) => {
      const layer = Math.floor(i/per), slot = i%per, cx = slot%H.cols, cz = Math.floor(slot/H.cols);
      const jx = (rnd(i+1)-.5)*.05, jz = (rnd(i+7)-.5)*.05, ry = (rnd(i+3)-.5)*.35;
      const px = H.x + (cx-(H.cols-1)/2)*gap + jx, pz = H.z + (cz-(H.rows-1)/2)*gap + jz;
      const py = .16 + H.h/2 + layer*H.h;
      const w = H.w*(.92+rnd(i+11)*.1), h = H.h*(.9+rnd(i+13)*.12);
      e.set(0,ry,0); q.setFromEuler(e);
      m4.compose(v.set(px,py,pz), q, s.set(w,h,w)); hp.body.setMatrixAt(i, m4);
      // 膠帶：繞過頂面與兩側的一圈色帶
      m4.compose(v.set(px,py,pz), q, s.set(w*1.015, h*1.015, w*.2)); hp.tapes[k].setMatrixAt(tn[k]++, m4);
      if(hp.lid){ m4.compose(v.set(px,py+h*.42,pz), q, s.set(w*1.03,h*.18,w*1.03)); hp.lid.setMatrixAt(i, m4); }
    });
    hp.body.count = list.length; if(hp.lid) hp.lid.count = list.length;
    STATUS.forEach(k => hp.tapes[k].count = tn[k]);
    [hp.body, hp.lid, ...Object.values(hp.tapes)].forEach(m => { if(m) m.instanceMatrix.needsUpdate = true; });
    // 超過上限：堆疊上方顯示「共 N 件」
    const over = row && row.total > CAP;
    hp.more.sprite.visible = !!over;
    if(over){ drawMore(hp, row.total); hp.more.sprite.position.set(H.x, .16 + Math.ceil(CAP/per)*H.h + .45, H.z); }
  }

  /* ---------- 對外函式 ---------- */
  function update(group, data){
    const S = group.userData.pkg; if(!S) return;
    if(!data || !data.total) return empty(group, data);
    S.loading = false; S.loadBox.visible = false;
    const byCls = {}; (data.rows||[]).forEach(r => byCls[r.cls] = r);
    Object.entries(S.heaps).forEach(([cls,hp]) => {
      const row = byCls[cls] || {cls, normal:0, attention:0, soon:0, total:0};
      layHeap(hp, row); drawSign(hp, cls, row);
    });
    drawBoard(S, data);
  }
  // 0 件：空棧板、立牌顯示 0、看板顯示「目前沒有待領包裹」
  function empty(group, data){
    const S = group.userData.pkg; if(!S) return;
    S.loading = false; S.loadBox.visible = false;
    const zero = cls => ({cls, normal:0, attention:0, soon:0, total:0});
    Object.entries(S.heaps).forEach(([cls,hp]) => { layHeap(hp, null); drawSign(hp, cls, zero(cls)); });
    drawBoard(S, Object.assign({total:0}, data||{}));
  }
  function setLoading(group, on){
    const S = group.userData.pkg; if(!S) return;
    S.loading = !!on; S.loadBox.visible = !!on;
    if(on) drawBoard(S, null, 'loading');
  }
  function tick(group, dt, t){
    const S = group.userData.pkg; if(!S || !S.loading) return;
    const b = S.loadBox, k = (t*1.6) % 1;
    b.position.y = 1.0 + Math.abs(Math.sin(k*Math.PI))*.6;
    b.rotation.y = t*2.2;
    const sq = k < .08 || k > .92 ? .85 : 1;            // 落地時壓扁一下
    b.scale.set(1/Math.sqrt(sq), sq, 1/Math.sqrt(sq));
  }

  const api = {build, update, empty, setLoading, tick};
  (window.SceneProps = window.SceneProps || {}).package = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
