/* =========================================================
   網站/panels/help.js — 網站導覽與使用說明（整合維護）
   入口：頂列「使用說明」按鈕、簡易模式清單最上方、網址 #help（可貼到 LINE 群組）。
   內容是靜態文字，不呼叫後端、不含任何住戶資料。
   - 住戶看到的章節人人可見；「管理員」「管委會」章節只在登入且有該權限時顯示。
   - 各島功能有變動時，請一起更新這裡（各島說明在 ISLAND_HELP）。
   ========================================================= */
window.Help = (function(){
  /* 各島說明：who＝誰可以看；pub＝免登入看得到的；res＝住戶登入後 */
  const ISLAND_HELP = {
    notice:  {who:'住戶登入後', res:['管委會公告', '社區共同規範', '各島規範總目錄（點一下會跳到那座島）', '近期公共工程']},
    package: {who:'免登入可看數量', pub:['各類待領包裹的數量：綠色正常、橘色需注意、紅色即將處理'],
              res:['本戶的待領包裹：種類（大／小／冷藏、掛號信會標示）、收件人（姓名第 2 個字以 * 遮住）、簽收時間、已存放天數、保管費', '領取時向管理員出示本戶頁面並簽收', '夜間到管理室自行取件時，請在紙本登記本寫下戶號、件數、時間並簽名', '屋主可在這裡管理家人帳號']},
    gym:     {who:'免登入可看開放狀態', pub:['現在是否開放、本時段借出數、維修中的器材', '使用辦法'],
              res:['「本戶」：本週免費額度還剩多少、本月清潔費、近期使用紀錄', '「報修」：器材或環境有問題，選器材、寫問題、可附照片（請不要拍到人）', '「夜間預約」：尚未開放；夜間使用請於管理員值勤時間到管理中心登記', '日間 09:00–18:00 請到管理中心登記借感應扣']},
    ev:      {who:'免登入可看辦法', pub:['已啟用戶數、申請進行中的件數', '申裝規格、施工驗收與電費原則'],
              res:['「本戶」：本戶充電設備的申裝進度、近 12 期電費分攤']},
    parking: {who:'免登入可看平面圖', pub:['機車位抽籤倒數、車位總數與已分配數', '機車位平面圖、停車規範'],
              res:['「我的車位」：本戶登記的機車、車位編號、每月費用', '「抽籤結果」：只列戶號與車位編號，不含車牌；可展開「怎麼確認抽籤公平？」自行驗證', '資料有誤或要換車牌，請洽管委會']},
    works:   {who:'住戶登入後', res:['施工行事曆：哪一天、哪一戶（樓層）在施工、是否有噪音或電梯停用', '要裝修請先向管委會提出紙本申請，由管委會登記']},
    admin:   {who:'住戶登入後', res:['「財務」：本戶每月帳單（管理費與各島費用）、社區收支公布', '「公告」：管委會公告、決議、會議紀錄']}
  };

  function fold(title, html, open){
    return `<details class="fold help-sec"${open ? ' open' : ''}><summary>${title}</summary><div class="fold-body">${html}</div></details>`;
  }
  const ul = xs => `<ul class="help-ul">${xs.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const ol = xs => `<ol class="help-ol">${xs.map(x => `<li>${x}</li>`).join('')}</ol>`;

  function render(el, ui, opt = {}){
    const {esc} = ui, use3D = !!opt.use3D;
    const guard = Auth.can('pkg:sign') || Auth.can('gym:guard') || Auth.can('works:guard') || Auth.can('park:guard');
    const admin = Auth.can('*:admin');
    const html = [];

    html.push(`<p class="lead">這個網站把社區的公告、規範和各項服務做成一座座「小島」。點小島就能看內容；有些內容要住戶登入後才看得到。</p>`);

    /* 1. 三步驟開始 */
    html.push(fold('第一次來？三個步驟', ol([
      '<b>看地圖</b>：畫面上每一座小島是一項服務（包裹、健身房、停車場…）。',
      '<b>點小島</b>：會滑出一張面板，裡面是那座島的資訊與規範。按面板右上角的 ✕ 關閉。',
      '<b>登入</b>：按右上角「登入」，就能看到自己這一戶的資料（包裹、帳單、車位…）。第一次使用請看下面「登入與帳號」。'
    ]), true));

    /* 2. 操作地圖 */
    html.push(fold('怎麼操作地圖', (use3D ? '' : `<p class="hintbox">您現在用的是「簡易模式」（清單畫面），直接點清單上的小島即可。以下是 3D 地圖的操作方式。</p>`) + ul([
      '<b>旋轉</b>：手指（或滑鼠按住）在畫面上拖曳。',
      '<b>放大縮小</b>：手機用兩指開合，電腦用滑鼠滾輪。',
      '<b>進入小島</b>：點小島或它的名牌。',
      '<b>白天／黃昏／夜晚</b>：右上角可以切換景色，不影響任何功能。',
      '<b>柴犬</b>：點公告島的地面，柴犬會跑過去。',
      '手機比較舊、畫面跑不動時，網站會自動改用「簡易模式」（清單畫面），功能完全一樣。'
    ])));

    /* 3. 登入與帳號 */
    html.push(fold('登入與帳號', `
      <h4>屋主第一次設定</h4>${ol([
        '按右上角「登入」→ 下方的「屋主第一次設定」。',
        '輸入戶號（例如 2A）和您留給管委會的 Email，按「寄出設定信」。',
        '到信箱打開設定信，點裡面的連結。',
        '閱讀個資告知並勾選同意，填電話、設定密碼（至少 8 個字），按「完成設定」。之後會自動登入。'
      ])}
      <h4>之後每次登入</h4>${ul([
        '屋主與家人：帳號是收驗證信的 Email。',
        '管委會代建的長輩帳號：帳號是戶號（例如 3B）。',
        '管理員、管委會：輸入工作帳號。'
      ])}
      <h4>幫家人、租客開帳號（屋主才可以）</h4>${ol([
        '登入後按右上角「家人帳號」。',
        '輸入家人的姓名和 Email，按「寄出邀請」。',
        '家人收信、點連結、設定自己的密碼就完成。每戶最多 6 個帳號（含屋主）。'
      ])}
      <h4>忘記密碼</h4>${ul([
        '登入畫面下方按「忘記密碼」，輸入登入用的 Email，照信裡的連結重設。',
        '長輩帳號（用戶號登入的）請洽管委會重設。',
        '信裡的連結只能用一次；失效了就重新寄一次。收不到信請先看垃圾信件匣。'
      ])}
      <p class="hintbox">密碼只輸入在這個網站的登入畫面。管委會和管理員不會用 LINE 或電話問您的密碼。</p>`));

    /* 4. 各島 */
    const isl = ISLANDS.map(d => {
      const h = ISLAND_HELP[d.id]; if(!h) return '';
      return `<div class="help-isl"><div class="row"><b>${esc(d.name)}</b><span class="tag-s">${esc(h.who)}</span></div>
        ${h.pub ? `<div class="small muted">不用登入</div>${ul(h.pub)}` : ''}
        ${h.res ? `<div class="small muted">住戶登入後</div>${ul(h.res)}` : ''}
        <button class="btn small" data-go="${esc(d.id)}">前往${esc(d.name)}</button></div>`;
    }).join('');
    html.push(fold('每座島可以做什麼', isl + `<p class="muted small">島名旁標示「建置中」，表示這座島還在試用階段，功能會陸續開放。</p>`));

    /* 5. 常見問題 */
    html.push(fold('常見問題', `
      <h4>為什麼有些島點進去要我登入？</h4><p>戶號、帳單、車位這類資料只給住戶本人看，所以要登入。包裹數量、健身房開放狀態這類不涉及個人的資訊，不用登入就看得到。</p>
      <h4>登入後還是看不到？</h4><p>畫面寫「您的帳號沒有這座島的權限」時，請洽管委會。</p>
      <h4>出現「登入已過期」？</h4><p>一段時間沒使用會自動登出，重新登入即可。</p>
      <h4>出現「系統已更新，請重新整理網頁」？</h4><p>把網頁重新整理一次（手機：往下拉；電腦：按重新整理鈕）。</p>
      <h4>出現「個資告知事項已更新」？</h4><p>個資告知內容有修改時，需要重新閱讀並勾選同意才能繼續使用線上服務。不同意仍可到管理室領包裹。</p>
      <h4>怎麼把網站放到手機桌面？</h4>${ul([
        'iPhone（Safari）：按下方「分享」鈕 → 「加入主畫面」。',
        'Android（Chrome）：按右上角「⋮」→「加到主畫面」。'
      ])}
      <h4>資料有錯、要改 Email 或電話？</h4><p>請洽管委會。</p>`));

    /* 6. 工作人員（有權限才顯示） */
    if(guard && !admin) html.push(fold('管理員值勤', ul([
      '<b>包裹島</b>：「今日待辦」看今天要通知或處理的包裹；「簽收」登記新到包裹：按「大包裹／小包裹／冷藏包裹」，用兩個下拉選門牌號與樓層組成戶號，可填收件人，掛號信要勾選並可記郵件編號末 4 碼；「待領清單」登記住戶領取（掛號信須填領取人姓名）或補記夜間紙本，掛號信會置頂標紅，第 1 天起請個別電話通知。',
      '<b>健身房島</b>：「值勤」登記日間使用、感應扣借還；「夜間」看夜間預約名單與投遞；「報修」處理報修、改器材狀態。',
      '<b>工程島</b>：「今日施工」看今天、明天的施工（含廠商與電話）；「公告」可複製施工公告文字貼到 LINE 群組。',
      '<b>停車場島</b>：「車位對照」用車位查車牌（查違停用）。',
      '畫面上的戶號、車牌、電話請勿拍照或轉傳。'
    ])));
    if(admin) html.push(fold('管委會', ul([
      '各島面板會多出管理用的分頁：包裹島「保管費月結」、健身房島與充電車位島「管理」、工程島「登記管理」、停車場島「抽籤／名單／租用／車位」。',
      '<b>管委會島</b>：「財務」看帳單總表、登打收支、產生收支報告；「後台」做系統檢查、帳號管理、屋主名單與各島參數。',
      '會改動資料的按鈕（抽籤、作廢、刪除等）按第一次會變成「再按一次確認」，再按才會執行。',
      '戶號、姓名、電話、金額只在登入後的面板顯示，請勿截圖貼到公開群組。'
    ])));

    html.push(`<p class="muted small">把這份說明傳給鄰居：複製下面的網址貼到 LINE。</p>
      <div class="help-share"><code>${esc((CONFIG.FRONT_URL || location.origin + location.pathname) + '#help')}</code><button class="btn small" data-copy>複製網址</button></div>
      <p class="muted small">還有問題請洽管委會或管理中心。</p>`);

    el.innerHTML = html.join('');
    // 同一時間只展開一節，手機上比較好讀
    const secs = [...el.querySelectorAll('.help-sec')];
    secs.forEach(s => s.addEventListener('toggle', () => { if(!s.open) return; secs.forEach(o => { if(o !== s) o.open = false; }); s.scrollIntoView({block:'start'}); }));
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ui.openIsland(b.dataset.go));
    const cp = el.querySelector('[data-copy]');
    cp.onclick = async () => {
      const code = el.querySelector('.help-share code');
      try{ await navigator.clipboard.writeText(code.textContent); ui.toast('已複製網址'); }
      catch(e){ const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(rg); ui.toast('請長按選取的網址複製'); }
    };
  }
  return {render};
})();
