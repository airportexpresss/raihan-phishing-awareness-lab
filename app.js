(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const views = ['dashboard', 'simulation', 'quiz', 'login', 'report', 'privacy'];
  const FLAGS = {
    sender: 'Look-alike sender domain (faceb00k)',
    urgent: 'Artificial urgency in the subject',
    greet: 'Generic greeting instead of your name',
    threat: 'Threat of account deletion',
    link: 'Link goes to a non-official domain',
    pass: 'Asks for password and 2FA code (never share these)'
  };
  const QUIZ = [
    { q: 'An email says your account closes in 24 hours unless you click a link. What do you do?', o: ['Click quickly', 'Ignore the link and open the official site/app directly', 'Reply with your password'], a: 1, w: 'Urgency is a classic phishing tactic. Go to the site yourself.' },
    { q: 'Which URL is the official Facebook domain?', o: ['facebook.com', 'facebook.login-secure.net', 'faceb00k.com'], a: 0, w: 'Read the domain right before the first single slash, from right to left.' },
    { q: 'Who should ever receive your 2FA code?', o: ['Support staff', 'Nobody', 'Any site asking politely'], a: 1, w: 'Legitimate staff never ask for your 2FA code.' },
    { q: 'With "Continue with Facebook", where do you enter your password?', o: ['On the third-party site', 'Only on facebook.com', 'In a chat message'], a: 1, w: 'OAuth keeps your password on the official provider page.' },
    { q: 'What should you check on a permission screen?', o: ['Nothing, just accept', 'That the permissions match what the app needs', 'Only the logo'], a: 1, w: 'Grant the minimum necessary permissions.' }
  ];
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
  };
  let me = { authenticated: false, user: null, csrf: null };
  const found = new Set(store.get('pal_flags', []));

  function show(v) {
    if (!views.includes(v)) v = 'dashboard';
    views.forEach((x) => { $('#v-' + x).hidden = x !== v; });
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === v));
    $('#sidebar').classList.remove('open');
    if (v === 'report') renderReport();
    refreshStats();
  }
  const route = () => show(location.hash.slice(1));

  function refreshStats() {
    const qs = store.get('pal_quiz', null);
    $('#stQuiz').textContent = qs ? `${qs.score}/${qs.total}` : '--';
    $('#stFlags').textContent = `${found.size}/6`;
    $('#stSession').textContent = me.authenticated ? 'Signed in' : 'Guest';
    $('#sideUser').textContent = me.authenticated ? `Signed in: ${me.user.name}` : 'Not signed in';
  }

  function renderFlags() {
    const ul = $('#flagList');
    ul.replaceChildren();
    if (!found.size) { const li = document.createElement('li'); li.textContent = 'Click suspicious parts of the email.'; ul.append(li); }
    found.forEach((k) => { const li = document.createElement('li'); li.textContent = FLAGS[k]; ul.append(li); });
    $('#flagCount').textContent = `${found.size}/6`;
    document.querySelectorAll('.flag').forEach((b) => b.classList.toggle('found', found.has(b.dataset.f)));
  }
  document.querySelectorAll('.flag').forEach((b) => b.addEventListener('click', () => {
    found.add(b.dataset.f); store.set('pal_flags', [...found]); renderFlags(); refreshStats();
  }));

  let qi = 0, score = 0;
  function renderQuiz() {
    const box = $('#quizBox');
    box.replaceChildren();
    if (qi >= QUIZ.length) {
      store.set('pal_quiz', { score, total: QUIZ.length, date: new Date().toISOString() });
      const h = document.createElement('h2'); h.textContent = `Finished: ${score}/${QUIZ.length}`;
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Retake';
      b.onclick = () => { qi = 0; score = 0; renderQuiz(); };
      box.append(h, b); refreshStats(); return;
    }
    const item = QUIZ[qi];
    const h = document.createElement('h2'); h.textContent = `Q${qi + 1}. ${item.q}`; box.append(h);
    const note = document.createElement('p'); note.className = 'muted';
    item.o.forEach((t, i) => {
      const b = document.createElement('button'); b.className = 'opt'; b.textContent = t;
      b.onclick = () => {
        const all = box.querySelectorAll('.opt');
        all.forEach((x) => { x.disabled = true; });
        if (i === item.a) { score++; b.classList.add('ok'); } else { b.classList.add('bad'); all[item.a].classList.add('ok'); }
        note.textContent = item.w;
        const n = document.createElement('button'); n.className = 'btn'; n.textContent = 'Next';
        n.onclick = () => { qi++; renderQuiz(); }; box.append(note, n);
      };
      box.append(b);
    });
  }

  async function loadMe() {
    try { me = await (await fetch('/api/me', { credentials: 'same-origin' })).json(); } catch { /* offline */ }
    $('#loginGuest').hidden = me.authenticated;
    $('#loginUser').hidden = !me.authenticated;
    if (me.authenticated) {
      $('#pName').textContent = me.user.name;
      $('#pEmail').textContent = me.user.email ? `Email: ${me.user.email}` : 'Email: not shared';
      $('#pId').textContent = `App-scoped ID: ${me.user.id}`;
      const img = $('#pPic');
      if (me.user.picture) { img.src = me.user.picture; img.hidden = false; } else { img.hidden = true; }
    }
    refreshStats();
  }
  $('#consent').addEventListener('change', (e) => { $('#fbBtn').disabled = !e.target.checked; });
  $('#fbBtn').addEventListener('click', () => { if ($('#consent').checked) location.href = '/auth/facebook'; });
  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': me.csrf } });
    await loadMe(); location.hash = '#dashboard';
  });

  function renderReport() {
    const qs = store.get('pal_quiz', null);
    const items = [
      ['Phishing red flags identified', found.size === 6, `${found.size}/6`],
      ['Awareness quiz passed (80%+)', !!qs && qs.score / qs.total >= 0.8, qs ? `${qs.score}/${qs.total}` : 'Not taken'],
      ['Used official OAuth (no password shared)', me.authenticated, me.authenticated ? 'Yes' : 'Not yet']
    ];
    const box = $('#reportBox'); box.replaceChildren();
    const h = document.createElement('h2'); h.textContent = `Report generated ${new Date().toLocaleString()}`; box.append(h);
    items.forEach(([l, ok, v]) => {
      const r = document.createElement('div'); r.className = 'row';
      const a = document.createElement('span'); a.textContent = l;
      const b = document.createElement('span'); b.className = ok ? 'pass' : 'fail'; b.textContent = v;
      r.append(a, b); box.append(r);
    });
    const p = document.createElement('p'); p.className = 'muted';
    p.textContent = 'Recommendations: enable 2FA, use a password manager, verify domains, and report suspicious messages.';
    box.append(p);
  }
  $('#printBtn').addEventListener('click', () => window.print());
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', route);

  renderFlags(); renderQuiz();
  loadMe().then(route);
})();
