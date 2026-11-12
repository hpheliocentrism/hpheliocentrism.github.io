/* =========================================================
   網站/mock/mock.js — 假資料後端（整合維護，僅供驗證階段）
   config.js 設 MOCK = true 時，api.js 改呼叫這裡，不連任何伺服器。
   資料只存在記憶體，重新整理就回到初始狀態。全部是假資料，沒有真實個資。
   回應格式比照後端 API.md（v2.1.0 起；停車場 park 為 v2.9.0）與 mock/samples.json。

   測試帳號（密碼一律 test1234，只在假資料模式有效）：
     chair               管委會
     guard1              管理員
     owner@example.com   屋主（2A）
     3b                  長輩帳號（3B，管委會代建）
   驗證頁測試連結：?mode=verify&t=demo-setup（屋主首次設定）、demo-family、demo-reset

   notice.* 是暫定格式：後端公告島模組完成前，前端先用這裡的假資料開發。
   2.8.0：這裡沒寫的動作（gym／works／ev／fee 等）改回傳 mock/samples.js 的後端範例回應（不會真的改資料）。
   測試開關（網址參數，只在假資料模式有效）：
     ?consent=v2   模擬管委會把同意版本改成 v2：登入後要求重新同意，其他動作回 CONSENT_REQUIRED
     ?night=1      模擬夜間；?self=1 模擬管委會開放夜間自助領取（兩者都有才顯示「我已領取」）
   ========================================================= */
window.MockBackend = (function(){
  const V = '2.8.0', PW = 'test1234';
  const Q = new URLSearchParams(location.search);
  const CV = Q.get('consent') || 'v1';                       // 「設定」表目前的同意版本
  const SELF = Q.get('self') === '1';
  const UNITS = []; for(let f=2; f<=8; f++) ['A','B','C'].forEach(u => { if(!(f===8 && u==='C')) UNITS.push(f+u); });
  const PERMS = {
    owner:['pkg:resident','gym:resident','works:resident','ev:resident','fee:resident','park:resident'],
    member:['pkg:resident','gym:resident','works:resident','ev:resident','fee:resident','park:resident'],
    admin:['pkg:sign','gym:guard','works:guard','park:guard'],
    committee:['pkg:admin','acct:admin','sys:admin','gym:admin','works:admin','ev:admin','fee:admin','park:admin']
  };
  const LABEL = {owner:'屋主', member:'住戶', admin:'管理員', committee:'管委會'};
  const now = () => { const d = new Date(Date.now() + 8*3600e3); return d.toISOString().slice(0,16).replace('T',' '); };

  const accounts = [
    {id:'A-0001', login:'chair',             name:'王主委',   role:'committee', unit:'',   email:'',                  phone:'',           status:'啟用'},
    {id:'A-0002', login:'owner@example.com', name:'測試A',    role:'owner',     unit:'2A', email:'owner@example.com', phone:'0912345678', status:'啟用', extra:['ev:agent']},
    {id:'A-0003', login:'kid@example.com',   name:'小明',     role:'member',    unit:'2A', email:'kid@example.com',   phone:'',           status:'待驗證'},
    {id:'A-0004', login:'3b',                name:'王奶奶',   role:'member',    unit:'3B', email:'',                  phone:'0223456789', status:'啟用', must:true},
    {id:'A-0005', login:'guard1',            name:'管理員甲', role:'admin',     unit:'',   email:'',                  phone:'',           status:'啟用', must:true}
  ];
  const P = (id,cls,time,stage,days,countdown,fee,unit,temp,note) => ({id,cls,time,status:'待領',stage,days,countdown,cdUnit:'天',fee,note:note||'',unit,hasPhoto:false,temp});
  let packages = [
    P('P-20261104-001','小型','2026-11-04 10:20','正常',1,9,0,'2A','常溫','範例'),
    P('P-20261101-002','小型','2026-11-01 14:00','已催告',4,6,0,'3B','常溫'),
    P('P-20261024-003','小型','2026-10-24 09:30','可處理',12,0,0,'5C','常溫'),
    P('P-20261030-004','大型','2026-10-30 16:40','計費中',6,24,400,'4A','常溫'),
    P('P-20261104-005','大型','2026-11-04 09:00','逾期',1,29,0,'6B','常溫'),
    P('P-20261104-006','大型','2026-11-04 11:05','逾期',1,29,0,'3A','常溫','管理員改判'),
    P('P-20261103-007','冷藏','2026-11-03 20:00','已催領',2,2,0,'7A','冷藏'),
    P('P-20261102-008','冷藏','2026-11-02 08:00','已催領',3,1,0,'8B','冷藏'),
    P('P-20261105-001','小型','2026-11-05 10:00','正常',0,10,0,'5A','常溫','外箱完好')
  ];
  let announcedToday = false, seq = 1;
  const notices = [
    {id:'N-001', date:'2026-11-10', tag:'設施', title:'電梯年度保養', body:'09:00–12:00 電梯暫停使用，請改走樓梯，行動不便住戶可洽管理員協助。', pinned:false},
    {id:'N-002', date:'2026-11-15', tag:'會議', title:'區分所有權人會議', body:'19:30 於一樓大廳召開，議程與委託書請至管理室領取。', pinned:true},
    {id:'N-003', date:'2026-11-18', tag:'規範', title:'包裹領取規範更新', body:'逾期計算改以天數為準，簽收日為第 0 天，詳細條文見包裹島。', pinned:false},
    {id:'N-004', date:'2026-11-22', tag:'安全', title:'消防安全設備檢查', body:'廠商將入戶檢查偵煙器，當日 10:00–16:00 請留人在家。', pinned:false}
  ];
  const LINKS = {
    'demo-setup': {purpose:'setup',  acct:'A-0002', needConsent:true,  needPhone:true},
    'demo-family':{purpose:'family', acct:'A-0003', needConsent:true,  needPhone:true},
    'demo-reset': {purpose:'reset',  acct:'A-0002', needConsent:false, needPhone:false}
  };
  const CONSENT = '【個人資料蒐集告知（測試文字）】宏樸日心說社區管理委員會為辦理包裹收發、領取通知與逾期處置，蒐集您的姓名、戶號、Email、電話、登入紀錄，以及包裹簽收照片。資料僅供社區管理與聯絡使用，由管理員與管委會依職務查閱，不對外提供。正式文字由管委會確認後由後端提供。';

  const ok = data => ({v:V, ok:true, data});
  const err = (code, error, field) => Object.assign({v:V, ok:false, code, error}, field ? {field} : {});
  const userView = a => ({id:a.id, name:a.name, role:a.role, roleLabel:LABEL[a.role], unit:a.unit, email:a.email, phone:a.phone,
    perms:PERMS[a.role].concat(a.extra || []), mustChangePassword:!!a.must});
  const needRe = a => (a.cv || 'v1') !== CV;
  const consentInfo = a => needRe(a) ? {needReconsent:true, consentVersion:CV, consentText:CONSENT.replace('（測試文字）', `（測試文字 ${CV}）`)} : {needReconsent:false};
  const issue = a => ({token:'mock.' + a.id, expiresAt:new Date(Date.now() + ((a.role==='admin'||a.role==='committee') ? 12 : 168)*3600e3).toISOString(), user:userView(a)});
  const night = () => { if(api.forceNight != null) return api.forceNight; const h = (new Date().getUTCHours() + 8) % 24; return h >= 18 || h < 6; };
  const bucket = st => st === '正常' ? 'normal' : (st === '可處理' || st === '可退件') ? 'soon' : 'attention';
  const LEVELS = {pkg:['resident','sign','admin'], gym:['resident','guard','admin'], works:['resident','guard','admin'], ev:['resident','agent','admin'], fee:['resident','admin'], park:['resident','guard','admin']};
  function can(a, perm){
    const [isl, lv] = perm.split(':');
    return PERMS[a.role].concat(a.extra || []).some(p => { const [pi,pl] = p.split(':'); if(pi !== isl) return false;
      const o = LEVELS[pi] || ['resident','admin']; return o.indexOf(pl) >= o.indexOf(lv); });
  }

  function stats(){
    const rows = ['小型','大型','冷藏'].map(cls => {
      const r = {cls, normal:0, attention:0, soon:0, total:0};
      packages.filter(p => p.cls === cls).forEach(p => { r[bucket(p.stage)]++; r.total++; });
      return r;
    });
    return {updated:now(), rules:{side:100, sum:200}, rows, total:rows.reduce((s,r)=>s+r.total,0)};
  }
  function announceText(){
    const s = stats(), c = {}; s.rows.forEach(r => c[r.cls] = r);
    const over = cls => c[cls].attention + c[cls].soon;
    const soon = s.rows.reduce((a,r)=>a+r.soon,0);
    return `【宏樸日心說 包裹公告】${now().slice(5,10).replace('-','月')}日\n目前社區待領包裹共 ${s.total} 件（大件 ${c['大型'].total}、小件 ${c['小型'].total}、冷藏 ${c['冷藏'].total}）。\n其中逾期未領（含催告中）：大件 ${over('大型')} 件、小件 ${over('小型')} 件、冷藏 ${over('冷藏')} 件。\n依規範，${soon} 件已達處理期限。\n請住戶登入包裹系統查看自己的包裹，並盡速領取。`;
  }
  function todo(){
    const byUnit = {};
    packages.filter(p => p.stage !== '正常').forEach(p => {
      const o = byUnit[p.unit] || (byUnit[p.unit] = {unit:p.unit, counts:{'小型':0,'大型':0,'冷藏':0}, maxDays:0, worst:p.stage, fee:0, contacts:[]});
      o.counts[p.cls]++; o.maxDays = Math.max(o.maxDays, p.days); o.fee += p.fee;
      if(bucket(p.stage) === 'soon') o.worst = p.stage;
    });
    Object.values(byUnit).forEach(o => o.contacts = accounts.filter(a => a.unit === o.unit && a.phone && a.status === '啟用')
      .map(a => ({name:a.name, roleLabel:LABEL[a.role], phone:a.phone})));
    const hits = packages.filter(p => p.countdown <= 1 && p.stage !== '可處理' && p.stage !== '可退件').map(p => ({
      unit:p.unit, items:[{id:p.id, cls:p.cls, days:p.days, stage:p.stage, msg:'明日起可依規範處理', fee:p.fee}],
      contacts:accounts.filter(a => a.unit === p.unit && a.phone).map(a => ({name:a.name, roleLabel:LABEL[a.role], phone:a.phone}))}));
    const s = stats();
    return {date:now().slice(0,10), announce:{needed:!announcedToday && hits.length > 0, doneToday:announcedToday, missed:false, text:announceText()},
      hits, overdue:Object.values(byUnit).sort((a,b)=>a.unit.localeCompare(b.unit)),
      summary:{total:s.total, cls:Object.fromEntries(s.rows.map(r=>[r.cls,r.total]))}};
  }
  function classify(b){
    if(b.temp === '冷藏') return '冷藏';
    const l = +b.l, w = +b.w, h = +b.h;
    if(!(l > 0 && w > 0 && h > 0)) throw err('VALIDATION', '常溫包裹請填長寬高（公分）', 'l');
    return (Math.max(l,w,h) > 100 || l+w+h > 200) ? '大型' : '小型';
  }

  const R = {
    'sys.ping': () => ok({version:V, time:now()}),
    'sys.check': () => ok({errors:0, warnings:1, checks:[
      {name:'工作表', ok:true, level:'ok', detail:'假資料模式'},
      {name:'排程', ok:true, level:'ok', detail:'假資料模式不執行排程'},
      {name:'前端網址', ok:false, level:'warn', detail:'尚未設定（正式部署時填入）'}]}),
    'auth.login': b => {
      const a = accounts.find(x => x.login === String(b.account||'').trim().toLowerCase());
      if(!a || b.password !== PW) return err('AUTH_FAILED', '帳號或密碼錯誤');
      if(a.status !== '啟用') return err('AUTH_FAILED', '帳號尚未啟用或已停用');
      return ok(Object.assign(issue(a), consentInfo(a)));
    },
    'auth.ownerStart': () => ok({message:'若資料相符，信件已寄出，請到信箱收信（也請看一下垃圾郵件匣）。（假資料模式：請改開 ?mode=verify&t=demo-setup）'}),
    'auth.forgot': () => ok({message:'若資料相符，信件已寄出，請到信箱收信（也請看一下垃圾郵件匣）。（假資料模式：請改開 ?mode=verify&t=demo-reset）'}),
    'auth.verifyInfo': b => {
      const L = LINKS[b.t]; if(!L) return err('LINK_INVALID', '連結已失效，請重新取得');
      const a = accounts.find(x => x.id === L.acct);
      return ok({purpose:L.purpose, name:a.name, unit:a.unit, email:a.email, needConsent:L.needConsent, needPhone:L.needPhone,
        consentVersion:'v1', consentText:L.needConsent ? CONSENT : ''});
    },
    'auth.complete': b => {
      const L = LINKS[b.t]; if(!L) return err('LINK_INVALID', '連結已失效，請重新取得');
      if(String(b.password||'').length < 8) return err('VALIDATION', '密碼至少 8 個字', 'password');
      if(L.needConsent && b.consent !== true) return err('VALIDATION', '請先閱讀並勾選同意', 'consent');
      if(L.needPhone && !/^\+?[0-9]{8,15}$/.test(String(b.phone||'').replace(/[\s\-()]/g,''))) return err('VALIDATION', '請填寫正確的電話號碼', 'phone');
      const a = accounts.find(x => x.id === L.acct); a.status = '啟用'; if(L.needConsent) a.cv = CV;
      return ok(Object.assign(issue(a), consentInfo(a)));
    },
    'auth.me': (b, a) => ok(Object.assign({user:userView(a)}, consentInfo(a))),
    'auth.consent': (b, a) => {
      if(b.consent !== true) return err('VALIDATION', '請勾選同意', 'consent');
      if(b.version !== CV) return err('VALIDATION', '告知事項剛更新，請重新閱讀', 'version');
      a.cv = CV; return ok({user:userView(a), needReconsent:false});
    },
    'auth.changePassword': (b, a) => {
      if(b.oldPassword !== PW) return err('AUTH_FAILED', '目前的密碼不正確');
      if(String(b.newPassword||'').length < 8) return err('VALIDATION', '新密碼至少 8 個字', 'newPassword');
      a.must = false; return ok(issue(a));
    },
    'auth.logoutAll': () => ok({}),
    'acct.family': (b, a) => {
      if(a.role !== 'owner') return err('FORBIDDEN', '只有屋主可以管理家人帳號');
      return ok({accounts:accounts.filter(x => x.unit === a.unit).map(x => Object.assign(userView(x), {status:x.status, login:x.login})), limit:6});
    },
    'acct.familyAdd': (b, a) => {
      if(a.role !== 'owner') return err('FORBIDDEN', '只有屋主可以新增家人');
      if(!b.name) return err('VALIDATION', '請填姓名', 'name');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||'')) return err('VALIDATION', 'Email 格式不正確', 'email');
      const id = 'A-' + String(100 + seq++).padStart(4,'0');
      accounts.push({id, login:b.email.toLowerCase(), name:b.name, role:'member', unit:a.unit, email:b.email, phone:b.phone||'', status:'待驗證'});
      return ok({id, status:'待驗證'});
    },
    'acct.list': () => ok({accounts:accounts.map(a => Object.assign(userView(a), {status:a.status, login:a.login, extra:(a.extra || []).join(','), consentVersion:a.cv || 'v1', consentAt:'2026-11-05 10:00', needReconsent:needRe(a)}))}),
    'acct.update': b => { const a = accounts.find(x => x.id === b.id); if(!a) return err('NOT_FOUND', '找不到帳號');
      if(b.consentVersion) a.cv = b.consentVersion; return ok({account:Object.assign(userView(a), {status:a.status, login:a.login, consentVersion:a.cv})}); },
    'owners.list': () => ok({owners:UNITS.map(u => {
      const o = accounts.find(a => a.unit === u && a.role === 'owner');
      return {unit:u, name:o ? o.name : '', email:o ? o.email : '', note:'', updatedAt:'', accountStatus:o ? o.status : '尚未設定'};
    })}),
    'pkg.stats': () => ok(stats()),
    'pkg.mine': (b, a) => ok({unit:a.unit, packages:packages.filter(p => p.unit === a.unit).map(p => { const c = Object.assign({}, p); delete c.unit; delete c.temp; delete c.hasPhoto; return c; }), night:night(), selfCollect:SELF}),
    'pkg.collect': (b, a) => {
      const p = packages.find(x => x.id === b.id); if(!p) return err('NOT_FOUND', '找不到這件包裹');
      const staff = can(a, 'pkg:sign');
      if(!staff){ if(b.how || b.gotAt) return err('FORBIDDEN', '您沒有此操作的權限');
        if(p.unit !== a.unit) return err('FORBIDDEN', '只能領取本戶的包裹'); if(!SELF) return err('FEATURE_OFF', '夜間自助領取目前未開放，請至管理室紙本登記');
        if(!night()) return err('NIGHT_ONLY', '白天請向管理員出示通知並簽收'); }
      if(b.gotAt && b.how !== '夜間紙本') return err('VALIDATION', '補記領取時間時，領取方式必須是「夜間紙本」', 'how');
      if(b.gotAt && !(b.gotAt > p.time && b.gotAt <= now())) return err('VALIDATION', '領取時間須晚於簽收時間、且不得在未來', 'gotAt');
      packages = packages.filter(x => x !== p);
      return ok({id:p.id, how:staff ? (b.how || '值勤簽收') : '夜間自助', fee:p.fee});
    },
    'pkg.pending': () => ok({packages:packages.slice(), night:night()}),
    'pkg.create': b => {
      const unit = String(b.unit||'').toUpperCase();
      if(!UNITS.includes(unit)) return err('NOT_FOUND', '沒有這個戶號', 'unit');
      if(b.temp !== '常溫' && b.temp !== '冷藏') return err('VALIDATION', '請選擇常溫或冷藏', 'temp');
      let cls; try{ cls = classify(b); }catch(e){ return e; }
      if(b.finalClass && b.finalClass !== cls){
        if(!String(b.reason||'').trim()) return err('VALIDATION', '改判類別時必須填寫改判原因', 'reason');
        cls = b.finalClass;
      }
      if(b.photoBase64 && b.photoBase64.length * .75 > 1500000) return err('VALIDATION', '照片太大，請重新拍攝', 'photo');
      const id = 'P-' + now().slice(0,10).replace(/-/g,'') + '-' + String(100 + seq++).slice(-3);
      const cd = {'小型':10, '大型':30, '冷藏':4}[cls];
      packages.push({id, cls, time:now(), status:'待領', stage:'正常', days:0, countdown:cd, cdUnit:'天', fee:0, note:b.note||'', unit, hasPhoto:!!b.photoBase64, temp:b.temp});
      return ok({id, cls, unit, hasPhoto:!!b.photoBase64});
    },
    'pkg.todo': () => ok(todo()),
    'pkg.announce': () => { announcedToday = true; return ok({logged:true, text:announceText()}); },
    'pkg.params': () => ok({params:[
      {index:0, group:'大型判定', name:'任一邊超過', value:100, unit:'cm', note:''},
      {index:1, group:'大型判定', name:'三邊相加超過', value:200, unit:'cm', note:''},
      {index:2, group:'小型', name:'催告：第幾天起', value:3, unit:'天', note:''},
      {index:3, group:'小型', name:'可處理：第幾天起', value:10, unit:'天', note:''},
      {index:6, group:'大型', name:'每日保管費', value:100, unit:'元', note:''},
      {index:10, group:'冷藏', name:'可處理：第幾天起', value:4, unit:'天', note:''}]}),
    'pkg.dataInfo': () => ok({used:packages.length + 3, capacity:500, pending:packages.length, eligible:1, keepDays:14, photoDays:30, hasArchive:false}),
    'notice.list': () => ok({notices:notices.slice().sort((a,b) => (b.pinned - a.pinned) || a.date.localeCompare(b.date))})
  };
  // 每個動作的最低權限（null＝免登入、'login'＝任何登入者）
  const NEED = {
    'sys.ping':null, 'pkg.stats':null, 'auth.login':null, 'auth.ownerStart':null, 'auth.forgot':null, 'auth.verifyInfo':null, 'auth.complete':null,
    'auth.me':'login', 'auth.changePassword':'login', 'auth.logoutAll':'login',
    'sys.check':'sys:admin', 'acct.family':'pkg:resident', 'acct.familyAdd':'pkg:resident', 'acct.list':'acct:admin', 'owners.list':'acct:admin',
    'pkg.mine':'pkg:resident', 'pkg.collect':'pkg:resident', 'pkg.pending':'pkg:sign', 'pkg.create':'pkg:sign', 'pkg.todo':'pkg:sign',
    'pkg.announce':'pkg:sign', 'pkg.params':'pkg:admin', 'pkg.dataInfo':'pkg:admin', 'notice.list':'notice:resident'
  };

  Object.assign(NEED, {'auth.consent':'login', 'acct.update':'acct:admin', 'pkg.fees':'pkg:admin', 'pkg.feesClose':'pkg:admin'});
  /* samples.js 的動作：依前綴給最低權限（管理動作的細部權限以後端為準） */
  const SAMPLE_NEED = act => /\.stats$/.test(act) || act === 'sys.ping' ? null
    : act.startsWith('fee.') ? (/^fee\.(mine|reports|report)$/.test(act) ? 'fee:resident' : 'fee:admin')
    : act.startsWith('gym.') ? 'gym:resident' : act.startsWith('works.') ? (act === 'works.calendar' ? 'works:resident' : /^works\.(today|announce)$/.test(act) ? 'works:guard' : 'works:admin')
    : act.startsWith('park.') ? (/^park\.(mine|result)$/.test(act) ? 'park:resident' : /^park\.(slots|list)$/.test(act) ? 'park:guard' : 'park:admin')
    : act.startsWith('ev.') ? (act === 'ev.mine' ? 'ev:resident' : /^ev\.(devices|calc|publish|correct|periods)$/.test(act) ? 'ev:agent' : 'ev:admin') : 'login';
  const FIX = {'ev.stats': d => Object.assign({}, d, {installed:1}), 'fee.mine': (d, a) => Object.assign({}, d, {unit:a.unit})};
  /* 停車場：只記「抽了沒」，讓抽籤 → 結果 → 作廢的畫面走得通；名單、車位仍是固定範例（完整流程請接測試後端） */
  let parkDrawn = false;
  const PS = k => JSON.parse(JSON.stringify((window.MOCK_SAMPLES || {})[k]));
  Object.assign(R, {
    'park.draw': b => { if(parkDrawn) return err('CONFLICT', '已有正式抽籤結果。要重抽須先作廢並填原因'); if(b.confirm !== true) return ok(PS('park.draw')); parkDrawn = true; return ok(PS('park.draw:done')); },
    'park.result': () => ok(PS(parkDrawn ? 'park.result:done' : 'park.result')),
    'park.drawVoid': b => { if(!String(b.reason || '').trim()) return err('VALIDATION', '作廢須填原因', 'reason'); parkDrawn = false; return ok(PS('park.drawVoid')); },
    'park.stats': () => ok(Object.assign(PS('park.stats'), parkDrawn ? {drawn:true, assignedSlots:3, assignedCars:3} : {}))
  });
  Object.assign(NEED, {'park.draw':'park:admin', 'park.drawVoid':'park:admin', 'park.result':'park:resident', 'park.stats':null});
  function handle(b){
    let fn = R[b.action], need = NEED[b.action];
    const S = window.MOCK_SAMPLES || {};
    if(!fn && S[b.action]){ need = SAMPLE_NEED(b.action); fn = (q, a) => ok(FIX[b.action] ? FIX[b.action](JSON.parse(JSON.stringify(S[b.action])), a) : JSON.parse(JSON.stringify(S[b.action]))); }
    if(!fn) return err('UNKNOWN_ACTION', '未知的操作');
    let a = null;
    if(need !== null && need !== undefined){
      if(!b.token) return err('AUTH_REQUIRED', '請先登入');
      a = accounts.find(x => 'mock.' + x.id === b.token && x.status === '啟用');
      if(!a) return err('AUTH_EXPIRED', '登入已過期，請重新登入');
      if(needRe(a) && !['auth.me','auth.consent','auth.logoutAll'].includes(b.action)) return err('CONSENT_REQUIRED', '個人資料告知事項已更新，請先閱讀並勾選同意');
      if(need !== 'login' && !can(a, need)) return err('FORBIDDEN', '您沒有此操作的權限');
    }
    try{ return fn(b, a); }catch(e){ return e && e.code ? e : err('INTERNAL', '假資料後端錯誤：' + e.message); }
  }

  const api = {handle, forceNight:Q.get('night') === '1' ? true : Q.get('night') === '0' ? false : null, PASSWORD:PW};
  return api;
})();
