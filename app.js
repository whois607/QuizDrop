/* QuizDrop screens. Everything is kept on this device in localStorage; nothing is sent anywhere. */
(function () {
  'use strict';
  const C = window.QuizCore, esc = C.esc, fmt = C.fmt;
  const app = document.getElementById('app');
  const enc = encodeURIComponent;
  const LET = 'abcdefghijklmnopqrstuvwxyz';
  let live = null;      // the attempt being sat, if that screen is showing
  let timer = null;
  let saveTimer = null;

  /* ---------- storage ---------- */
  const mem = {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { mem[k] = v; return false; } }
  };
  function loadKey(k) {
    const raw = ls.get(k);
    if (!raw) return {};
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (e) { /* fall through */ }
    ls.set(k + '.damaged-' + Date.now(), raw);   // never throw unreadable data away
    return {};
  }
  /* Quizzes and attempts live in IndexedDB (plenty of room for images). localStorage is the fallback where
     IndexedDB is unavailable, and is where versions before images kept everything, so it is read once to
     carry that data over. The old localStorage copy is left alone. */
  const quizzes = {}, attempts = {};
  let idb = null;
  function idbOpen() {
    return new Promise(res => {
      try {
        const rq = indexedDB.open('quizdrop', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
  }
  function idbDo(mode, fn) {
    return new Promise(res => {
      try {
        const tx = idb.transaction('kv', mode), rq = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res({ ok: true, value: rq.result });
        tx.onerror = tx.onabort = () => res({ ok: false });
      } catch (e) { res({ ok: false }); }
    });
  }
  function persist(name, obj) {
    const fail = () => toast('Could not save on this device - storage is full or blocked');
    if (idb) idbDo('readwrite', s => s.put(obj, name)).then(r => { if (!r.ok) fail(); });
    else if (!ls.set('qd.' + name, JSON.stringify(obj))) fail();
  }
  async function loadAll() {
    idb = await idbOpen();
    let q, a;
    if (idb) {
      const rq = await idbDo('readonly', s => s.get('quizzes')), ra = await idbDo('readonly', s => s.get('attempts'));
      if (rq.ok && ra.ok) { q = rq.value; a = ra.value; } else idb = null;
    }
    if (!q && !a) {
      q = loadKey('qd.quizzes'); a = loadKey('qd.attempts');
      if (idb && (Object.keys(q).length || Object.keys(a).length)) {
        await idbDo('readwrite', s => s.put(q, 'quizzes'));
        await idbDo('readwrite', s => s.put(a, 'attempts'));
      }
    }
    Object.assign(quizzes, q || {});
    Object.assign(attempts, a || {});
  }
  function saveQuizzes() { persist('quizzes', quizzes); }
  function saveAttempts() { clearTimeout(saveTimer); saveTimer = null; persist('attempts', attempts); }
  function saveAttemptsSoon() { if (!saveTimer) saveTimer = setTimeout(saveAttempts, 400); }
  function flush() { if (saveTimer) saveAttempts(); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  /* ---------- helpers ---------- */
  const p2 = n => String(n).padStart(2, '0');
  function fmtDate(ts) { const d = new Date(ts); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtDur(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? h + ' h ' + m + ' min' : (m ? m + ' min ' + (s % 60) + ' s' : s + ' s');
  }
  const num = n => String(C.round2(n));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const quizMarks = q => C.round2(q.questions.reduce((s, x) => s + x.marks, 0));
  const attemptsFor = id => Object.values(attempts).filter(a => a.quizId === id).sort((a, b) => b.startedAt - a.startedAt);
  const words = s => (String(s || '').trim().match(/\S+/g) || []).length;

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* older browsers / no permission */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------- images and maths ---------- */
  function imageHtml(im, small) {
    if (!im) return '';
    const w = im.width || (small ? 260 : 0);
    return '<span class="qimg' + (small ? ' small' : '') + '"><img src="' + esc(im.src) + '" alt="' + esc(im.alt) + '" loading="lazy"' + (w ? ' style="max-width:min(100%,' + w + 'px)"' : '') + '></span>';
  }
  const optBody = o => fmt(o.text) + imageHtml(o.image, true);

  /* fmt() leaves LaTeX in .math spans. KaTeX is fetched the first time a screen contains one (then kept for
     offline use by the service worker). Until it arrives, or if it never does, the LaTeX source shows. */
  const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  let katexAsked = false;
  function typeset() {
    if (!window.katex) return;
    document.querySelectorAll('.math:not(.done)').forEach(el => {
      el.classList.add('done');
      try { window.katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('display'), throwOnError: false }); } catch (e) { /* source stays */ }
    });
  }
  function needMath() {
    if (window.katex) { typeset(); return; }
    if (katexAsked || !document.querySelector('.math')) return;
    katexAsked = true;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = KATEX + 'katex.min.css'; css.crossOrigin = 'anonymous';
    const js = document.createElement('script');
    js.src = KATEX + 'katex.min.js'; js.crossOrigin = 'anonymous';
    js.onload = typeset;
    js.onerror = () => { katexAsked = false; js.remove(); css.remove(); };
    document.head.appendChild(css); document.head.appendChild(js);
  }
  new MutationObserver(needMath).observe(app, { childList: true, subtree: true });

  /* ---------- routing ---------- */
  function go(path) { if (location.hash === '#/' + path) route(); else location.hash = '#/' + path; }
  function route() {
    flush(); clearInterval(timer); timer = null; live = null;
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const a = parts[0], b = parts[1];
    let nav = 'home';
    window.scrollTo(0, 0);
    if (a === 'install') { nav = ''; viewInstall(b); }
    else if (a === 'import') { nav = 'import'; viewImport(); }
    else if (a === 'help') { nav = 'help'; viewHelp(); }
    else if (a === 'quiz' && quizzes[b]) viewQuiz(quizzes[b]);
    else if (a === 'attempt' && attempts[b] && !attempts[b].finishedAt) viewAttempt(attempts[b]);
    else if ((a === 'attempt' || a === 'review') && attempts[b] && attempts[b].finishedAt) viewReview(attempts[b]);
    else viewHome();
    document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('on', el.dataset.nav === nav));
  }
  window.addEventListener('hashchange', route);

  /* ---------- home ---------- */
  function statusChip(q) {
    const at = attemptsFor(q.id), done = at.filter(a => a.finishedAt);
    if (at.some(a => !a.finishedAt)) return '<span class="chip part">In progress</span>';
    if (!done.length) return '<span class="chip">Not attempted</span>';
    if (done.some(a => C.totals(a).pending)) return '<span class="chip pend">Awaiting marking</span>';
    const best = Math.max.apply(null, done.map(a => C.totals(a).percent));
    return '<span class="chip ' + (best >= q.settings.passMark ? 'ok' : 'bad') + '">Best ' + best + '%</span>';
  }
  function viewHome() {
    const list = Object.values(quizzes).sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
    let h = '<div class="pagehead"><h1>My quizzes</h1><span class="btnrow" style="margin:0">' +
      (standalone() ? '' : '<a class="btn" href="#/install">Install app</a>') + '<a class="btn primary" href="#/import">Import quiz</a></span></div>';
    if (!list.length) {
      h += '<div class="card empty"><h2 style="margin-top:0">No quizzes yet</h2>' +
        '<p class="muted">Ask Claude to write a quiz, then paste it in here. It is checked and ready to sit straight away.</p>' +
        '<div class="btnrow" style="justify-content:center"><a class="btn primary" href="#/help">How to make a quiz with Claude</a>' +
        '<button class="btn" data-act="sample">Try the sample quiz</button></div></div>';
    } else {
      h += '<div class="cards">' + list.map(q =>
        '<a class="card quizcard" href="#/quiz/' + enc(q.id) + '">' +
        (q.subject ? '<span class="muted small">' + esc(q.subject) + '</span>' : '') +
        '<span class="t">' + esc(q.title) + '</span>' +
        '<span class="muted small">' + plural(q.questions.length, 'question') + ' · ' + plural(quizMarks(q), 'mark') + '</span>' +
        statusChip(q) + '</a>').join('') + '</div>' +
        '<div class="btnrow"><button class="btn" data-act="backup">Back up everything</button></div>' +
        '<p class="muted small">Quizzes and results are stored only on this device. Use a backup file to move them to another device (Import reads it).</p>';
    }
    app.innerHTML = h;
  }

  /* ---------- quiz page ---------- */
  function viewQuiz(q) {
    const at = attemptsFor(q.id), open = at.find(a => !a.finishedAt), done = at.filter(a => a.finishedAt);
    const types = Array.from(new Set(q.questions.map(x => C.TYPE_LABELS[x.type]))).join(', ');
    let h = '<div class="crumbs"><a href="#/">My quizzes</a></div>' +
      '<div class="pagehead"><h1>' + esc(q.title) + '</h1></div>' +
      (q.description ? '<p>' + fmt(q.description) + '</p>' : '') +
      '<table class="tbl kv">' +
      (q.subject ? '<tr><th>Subject</th><td>' + esc(q.subject) + '</td></tr>' : '') +
      '<tr><th>Questions</th><td>' + q.questions.length + ' <span class="muted">(' + esc(types) + ')</span></td></tr>' +
      '<tr><th>Total marks</th><td>' + num(quizMarks(q)) + '</td></tr>' +
      '<tr><th>Time limit</th><td>' + (q.settings.timeLimitMinutes ? q.settings.timeLimitMinutes + ' minutes' : 'None') + '</td></tr>' +
      '<tr><th>Pass mark</th><td>' + q.settings.passMark + '%</td></tr></table>' +
      '<div class="btnrow">' +
      (open ? '<a class="btn primary" href="#/attempt/' + enc(open.id) + '">Continue attempt</a>'
        : '<button class="btn primary" data-act="start" data-id="' + esc(q.id) + '">' + (done.length ? 'Re-attempt quiz' : 'Attempt quiz now') + '</button>') +
      '<button class="btn" data-act="export" data-id="' + esc(q.id) + '">Share quiz file</button>' +
      (q.questions.some(x => x.type === 'code' && x.language === 'python' && x.solution.trim()) ? '<button class="btn" data-act="verify" data-id="' + esc(q.id) + '">Test the model solutions</button>' : '') +
      '<button class="btn danger" data-act="delete" data-id="' + esc(q.id) + '">Delete</button></div><div id="verifyres"></div>';
    if (done.length) {
      h += '<h2>Your attempts</h2><div class="scroll"><table class="tbl"><tr><th>Finished</th><th>Marks</th><th>Grade</th><th></th></tr>' +
        done.map(a => {
          const t = C.totals(a);
          return '<tr><td>' + fmtDate(a.finishedAt) + '</td><td>' + num(t.score) + ' / ' + num(t.max) + '</td><td>' +
            (t.pending ? '<span class="chip pend">Awaiting marking</span>' : '<span class="chip ' + (t.percent >= a.settings.passMark ? 'ok' : 'bad') + '">' + t.percent + '%</span>') +
            '</td><td><a href="#/review/' + enc(a.id) + '">Review</a></td></tr>';
        }).join('') + '</table></div>';
    }
    app.innerHTML = h;
  }

  /* ---------- sitting an attempt ---------- */
  function stateText(at, i) { return C.isAnswered(at.questions[i], at.responses[i]) ? 'Answer saved' : 'Not yet answered'; }

  function inputs(q, r) {
    switch (q.type) {
      case 'multichoice':
        return '<div class="prompt">Select one:</div>' + q.options.map((o, j) =>
          '<label class="opt"><input type="radio" name="ans" value="' + j + '"' + (r === j ? ' checked' : '') + '><span class="ltr">' + LET[j] + '.</span><span>' + optBody(o) + '</span></label>').join('') +
          '<button class="link" data-act="clear">Clear my choice</button>';
      case 'multiselect':
        return '<div class="prompt">Select one or more:</div>' + q.options.map((o, j) =>
          '<label class="opt"><input type="checkbox" value="' + j + '"' + (Array.isArray(r) && r.includes(j) ? ' checked' : '') + '><span class="ltr">' + LET[j] + '.</span><span>' + optBody(o) + '</span></label>').join('');
      case 'truefalse':
        return '<div class="prompt">Select one:</div>' + [true, false].map(v =>
          '<label class="opt"><input type="radio" name="ans" value="' + v + '"' + (r === v ? ' checked' : '') + '><span>' + (v ? 'True' : 'False') + '</span></label>').join('');
      case 'shortanswer':
        return '<label class="prompt" for="ans">Answer:</label><input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(r || '') + '">';
      case 'numerical':
        return '<label class="prompt" for="ans">Answer:</label><div class="withunit"><input type="text" id="ans" inputmode="decimal" autocomplete="off" value="' + esc(r || '') + '">' + (q.unit ? '<span>' + esc(q.unit) + '</span>' : '') + '</div>';
      case 'matching':
        return q.pairs.map((p, j) => '<div class="mrow"><div>' + fmt(p.left) + '</div><select aria-label="Match for ' + esc(p.left) + '"><option value="">Choose...</option>' +
          q.choices.map(c => '<option value="' + esc(c) + '"' + (r && r[j] === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>').join('');
      case 'ordering': {
        const cur = r || q.start;
        return '<div class="prompt">Use the arrows to put these in the correct order:</div>' + cur.map((it, j) =>
          '<div class="orow"><span class="n">' + (j + 1) + '.</span><span class="x">' + fmt(it) + '</span>' +
          '<button data-act="ord" data-j="' + j + '" data-d="-1" aria-label="Move up"' + (j === 0 ? ' disabled' : '') + '>&#9650;</button>' +
          '<button data-act="ord" data-j="' + j + '" data-d="1" aria-label="Move down"' + (j === cur.length - 1 ? ' disabled' : '') + '>&#9660;</button></div>').join('') +
          (r ? '' : '<button class="link" data-act="ordkeep">This order is already correct</button>');
      }
      case 'essay':
        return '<label class="prompt" for="ans">Your answer' + (q.wordLimit ? ' (aim for about ' + q.wordLimit + ' words)' : '') + ':</label>' +
          '<textarea id="ans" rows="8">' + esc(r || '') + '</textarea><div class="muted small" id="wc">' + plural(words(r), 'word') + '</div>';
      case 'code': {
        const ml = q.language === 'matlab', code = r ? r.code : q.starter, show = q.tests.filter(t => !t.hidden);
        const cell = s => '<td><pre>' + esc(s) + '</pre></td>';
        const hasCode = show.some(t => t.code.trim()), hasIn = show.some(t => t.input.trim());
        let h = ml
          ? '<div class="note">This one runs outside the app. Write and run your code in MATLAB or Octave, run each test below after it, and paste in what it prints.</div>'
          : '<div class="prompt">For example:</div><div class="scroll"><table class="tbl res"><tr>' + (hasCode ? '<th>Test</th>' : '') + (hasIn ? '<th>Input</th>' : '') + '<th>Result</th></tr>' +
            show.map(t => '<tr>' + (hasCode ? cell(t.code) : '') + (hasIn ? cell(t.input) : '') + cell(t.expected) + '</tr>').join('') + '</table></div>';
        h += '<label class="prompt" for="code" style="display:block;margin-top:.8rem">' + (ml ? 'Your code (kept with your attempt):' : 'Your Python answer:') + '</label>' +
          '<textarea id="code" class="code" rows="' + (ml ? 6 : 12) + '" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">' + esc(code) + '</textarea>';
        if (ml) h += q.tests.map((t, j) => {
          const out = r && r.outputs ? r.outputs[j] || '' : '';
          return '<div class="prompt" style="margin-top:.8rem">Test ' + (j + 1) + (t.code.trim() ? ' - run this:' : ' - run your code:') +
            (live && live.showMl ? mark(C.outputMatches(t.expected, out, t.tolerance, true)) : '') + '</div>' +
            (t.code.trim() ? '<pre>' + esc(t.code) + '</pre>' : '') + (t.input.trim() ? '<div class="prompt">and type this when it asks for input:</div><pre>' + esc(t.input) + '</pre>' : '') +
            '<textarea class="code out" rows="3" spellcheck="false" autocapitalize="off" placeholder="Paste the output here" aria-label="Output of test ' + (j + 1) + '">' + esc(out) + '</textarea>';
        }).join('');
        h += '<div class="btnrow" style="margin-bottom:0"><button class="btn primary" data-act="check">Check</button><span class="muted small pystatus" style="align-self:center"></span></div>';
        if (!ml && r && r.run) h += resultsTable(q, r.run, r.run.code !== r.code);
        return h;
      }
    }
    return '';
  }

  function resultsTable(q, run, stale) {
    const pre = s => '<pre>' + esc(s) + '</pre>';
    return '<div class="scroll" style="margin-top:.8rem"><table class="tbl res"><tr><th></th><th>Test</th><th>Expected</th><th>Got</th></tr>' +
      q.tests.map((t, j) => {
        const x = run.tests[j] || { ok: false, out: '', err: 'Not run' };
        return '<tr><td>' + mark(x.ok) + '</td>' + (t.hidden ? '<td colspan="3" class="muted">Hidden test</td>'
          : '<td>' + pre(t.code + (t.input.trim() ? (t.code.trim() ? '\n' : '') + 'Input:\n' + t.input : '')) + '</td><td>' + pre(t.expected) + '</td><td>' +
            pre(x.out) + (x.err ? '<pre class="err">' + esc(x.err) + '</pre>' : '') + '</td>') + '</tr>';
      }).join('') + '</table></div><div class="note ' + (run.passed ? 'ok' : 'bad') + '">' +
      (run.passed ? 'Passed all tests.' : 'Not all tests passed. Marks are given only when every test passes.') + '</div>' +
      '<div class="note warn stale"' + (stale ? '' : ' hidden') + '>Your code has changed since this check.</div>';
  }

  function queBlock(at, i, review) {
    const q = at.questions[i], r = at.responses[i], res = review ? at.results[i] : null;
    const labels = { correct: 'Correct', partial: 'Partially correct', incorrect: 'Incorrect', unanswered: 'Not answered', needsmarking: 'Requires marking', marked: 'Marked' };
    return '<div class="que" id="q' + i + '"><div class="info"><div class="no">Question <b>' + (i + 1) + '</b></div>' +
      '<div class="state" id="qstate">' + (review ? (q.type === 'code' && res.state === 'needsmarking' ? 'Not tested yet' : labels[res.state]) : stateText(at, i)) + '</div>' +
      '<div>' + (review && res.awarded !== null ? 'Mark ' + num(res.awarded) + ' out of ' + num(q.marks) : 'Marked out of ' + num(q.marks)) + '</div>' +
      (review ? (at.flags[i] ? '<div>Flagged</div>' : '') : '<button class="link" data-act="flag">' + (at.flags[i] ? 'Remove flag' : 'Flag question') + '</button>') +
      '</div><div class="content"><div class="formulation"><div class="qtext">' + fmt(q.text) + '</div>' + imageHtml(q.image) + '<div class="ablock">' +
      (review ? reviewAnswer(q, r, i) : inputs(q, r)) + '</div></div>' + (review ? outcome(at, i) : '') + '</div></div>';
  }

  function navBlock(at, review) {
    const n = at.questions.length;
    const btns = at.questions.map((q, i) => {
      let cls = 'qb';
      if (review) {
        const s = at.results[i].state;
        cls += s === 'correct' ? ' correct' : s === 'partial' ? ' partial' : s === 'needsmarking' ? ' pending' : s === 'marked' ? (at.results[i].awarded >= q.marks ? ' correct' : at.results[i].awarded > 0 ? ' partial' : ' incorrect') : ' incorrect';
      } else {
        if (C.isAnswered(q, at.responses[i])) cls += ' answered';
        if (i === at.pos) cls += ' cur';
      }
      if (at.flags[i]) cls += ' flag';
      return '<button class="' + cls + '" data-act="' + (review ? 'jump' : 'goto') + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + '</button>';
    }).join('');
    return '<aside class="card navblock"><h3>Quiz navigation</h3>' +
      (!review && at.settings.timeLimitMinutes ? '<div class="timer" id="timer"></div>' : '') +
      '<div class="navgrid">' + btns + '</div>' +
      (review ? '<a href="#/quiz/' + enc(at.quizId) + '">Finish review</a>' : '<button class="link" data-act="goto" data-i="' + n + '">Finish attempt...</button>') + '</aside>';
  }

  function viewAttempt(at, showMl) {
    live = { at, showMl: !!showMl };
    const n = at.questions.length;
    if (!(at.pos >= 0 && at.pos <= n)) at.pos = 0;
    const i = at.pos;
    let main;
    if (i === n) {
      const blank = at.questions.filter((q, k) => !C.isAnswered(q, at.responses[k])).length;
      main = '<h1>Summary of attempt</h1><table class="tbl" style="margin:1rem 0"><tr><th>Question</th><th>Status</th></tr>' +
        at.questions.map((q, k) => '<tr><td><button class="link" data-act="goto" data-i="' + k + '">' + (k + 1) + '</button>' + (at.flags[k] ? ' <span class="chip bad">Flagged</span>' : '') +
          '</td><td>' + stateText(at, k) + '</td></tr>').join('') + '</table>' +
        (blank ? '<div class="note warn">' + plural(blank, 'question') + ' not answered yet.</div>' : '') +
        '<div class="btnrow"><button class="btn" data-act="goto" data-i="0">Return to attempt</button>' +
        '<button class="btn primary" data-act="submit">Submit all and finish</button></div>';
    } else {
      main = queBlock(at, i, false) + '<div class="pager">' +
        (i > 0 ? '<button class="btn" data-act="goto" data-i="' + (i - 1) + '">Previous</button>' : '<span></span>') +
        '<button class="btn primary" data-act="goto" data-i="' + (i + 1) + '">' + (i === n - 1 ? 'Finish attempt...' : 'Next') + '</button></div>';
    }
    app.innerHTML = '<div class="crumbs"><a href="#/quiz/' + enc(at.quizId) + '">' + esc(at.quizTitle) + '</a></div>' +
      '<div class="attempt"><div class="qcol">' + main + '</div>' + navBlock(at, false) + '</div>';
    clearInterval(timer); timer = null;
    if (at.settings.timeLimitMinutes) { tick(); timer = setInterval(tick, 1000); }
  }

  function tick() {
    if (!live) return;
    const at = live.at, left = at.startedAt + at.settings.timeLimitMinutes * 60000 - Date.now();
    if (left <= 0) { if (!submitting) { toast('Time is up - your attempt has been submitted'); submit(at); } return; }
    const el = document.getElementById('timer');
    if (!el) return;
    const s = Math.ceil(left / 1000);
    el.textContent = 'Time left ' + (s >= 3600 ? Math.floor(s / 3600) + ':' + p2(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + p2(s % 60);
    el.classList.toggle('low', s <= 60);
  }

  function collect(q) {
    const box = app.querySelector('.ablock');
    if (!box) return undefined;
    switch (q.type) {
      case 'multichoice': { const c = box.querySelector('input:checked'); return c ? +c.value : null; }
      case 'multiselect': { const a = Array.from(box.querySelectorAll('input:checked')).map(x => +x.value); return a.length ? a : null; }
      case 'truefalse': { const c = box.querySelector('input:checked'); return c ? c.value === 'true' : null; }
      case 'shortanswer': case 'numerical': case 'essay': { const v = box.querySelector('input,textarea').value; return v.trim() ? v : null; }
      case 'matching': { const a = Array.from(box.querySelectorAll('select')).map(s => s.value || null); return a.some(Boolean) ? a : null; }
      case 'code': {
        const prev = live.at.responses[live.at.pos] || {}, code = box.querySelector('#code').value;
        const outs = Array.from(box.querySelectorAll('textarea.out')).map(t => t.value);
        if (!code.trim() && !outs.some(o => o.trim())) return null;
        const resp = { code };
        if (prev.run) resp.run = prev.run;
        if (q.language === 'matlab') resp.outputs = outs;
        return resp;
      }
    }
    return undefined;
  }
  function refreshStatus(at, i) {
    const st = document.getElementById('qstate'); if (st) st.textContent = stateText(at, i);
    const b = app.querySelector('.qb[data-i="' + i + '"]'); if (b) b.classList.toggle('answered', C.isAnswered(at.questions[i], at.responses[i]));
    const wc = document.getElementById('wc'); if (wc) wc.textContent = plural(words(at.responses[i]), 'word');
    const r = at.responses[i], stale = app.querySelector('.stale'); if (stale) stale.hidden = !(r && r.run && r.run.code !== r.code);
  }
  function onInput() {
    if (!live) return;
    const at = live.at, i = at.pos, q = at.questions[i];
    if (!q) return;
    const v = collect(q);
    if (v === undefined) return;
    at.responses[i] = v;
    saveAttemptsSoon();
    refreshStatus(at, i);
  }
  app.addEventListener('input', onInput);
  app.addEventListener('change', onInput);

  /* Code editor comforts: Tab indents, Enter keeps the indent (and adds one after a line ending in a colon). */
  app.addEventListener('keydown', e => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('textarea.code') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
    } else if (e.key === 'Enter' && ta.id === 'code') {
      const before = ta.value.slice(0, ta.selectionStart), line = before.slice(before.lastIndexOf('\n') + 1);
      const ind = line.match(/^[ \t]*/)[0] + (/:\s*$/.test(line) ? '    ' : '');
      if (!ind) return;
      e.preventDefault(); ta.setRangeText('\n' + ind, ta.selectionStart, ta.selectionEnd, 'end');
    } else return;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ---------- running Python ---------- */
  let pyWorker = null, pyBusy = false, pyStatusEl = null, submitting = false;
  const PY_STATUS = { loading: 'Loading Python (the first time downloads about 10 MB)...', packages: 'Loading any packages the code imports...', running: 'Running tests...' };
  function setPyStatus(msg) { if (pyStatusEl && pyStatusEl.isConnected) pyStatusEl.textContent = msg || ''; }
  function runPython(job, seconds) {
    return new Promise(resolve => {
      if (!pyWorker) {
        try { pyWorker = new Worker('py-worker.js'); } catch (e) { resolve({ error: 'This browser cannot run Python here.' }); return; }
      }
      const w = pyWorker, results = [];
      let t = null;
      const stop = () => { clearTimeout(t); w.onmessage = w.onerror = null; };
      const kill = () => { stop(); w.terminate(); pyWorker = null; };
      const arm = () => {
        clearTimeout(t);
        t = setTimeout(() => { kill(); resolve({ results, note: 'Stopped after ' + seconds + ' seconds - is there an infinite loop?' }); }, seconds * 1000);
      };
      w.onmessage = e => {
        const m = e.data;
        if (m.status) { setPyStatus(PY_STATUS[m.status]); if (m.status === 'running') arm(); }
        else if (m.result) { results.push(m.result); arm(); }
        else if (m.done) { stop(); resolve({ results }); }
        else if (m.error) { if (m.fatal) kill(); else stop(); resolve({ error: m.error }); }
      };
      w.onerror = () => { kill(); resolve({ error: 'Could not start Python. The first use needs an internet connection; after that it works offline.' }); };
      w.postMessage(job);
    });
  }
  const pyJob = (q, code) => ({ code, tests: q.tests.map(t => ({ code: t.code, input: t.input })) });
  /* Runs the answer to question i against its tests and stores the outcome on the response. */
  async function checkCode(at, i) {
    const q = at.questions[i], r = at.responses[i];
    if (!r || !r.code || !r.code.trim()) return false;
    if (pyBusy) { toast('Python is already running - try again in a moment'); return false; }
    pyBusy = true; setPyStatus('Starting Python...');
    const code = r.code, res = await runPython(pyJob(q, code), q.timeLimitSeconds);
    pyBusy = false;
    if (res.error) { setPyStatus(res.error); return false; }
    const cur = at.responses[i];   // may be a newer object if they kept typing
    if (cur) { cur.run = C.judgeRun(q, code, res.results, res.note); saveAttempts(); }
    setPyStatus('');
    return true;
  }

  async function submit(at) {
    if (submitting) return;
    submitting = true; clearInterval(timer); timer = null;
    try {
      for (let i = 0; i < at.questions.length; i++) {
        const q = at.questions[i], r = at.responses[i];
        if (q.type === 'code' && q.language === 'python' && C.isAnswered(q, r) && !(r.run && r.run.code === r.code)) {
          toast('Testing your code...');
          await checkCode(at, i);
        }
      }
    } finally { submitting = false; }
    C.finishAttempt(at, Date.now());
    saveAttempts();
    go('review/' + enc(at.id));
  }

  /* ---------- review ---------- */
  const mark = ok => ok ? ' <span class="tick" aria-label="correct">&#10003;</span>' : ' <span class="cross" aria-label="incorrect">&#10007;</span>';

  function reviewAnswer(q, r, i) {
    const none = '<div class="muted">No answer given.</div>';
    switch (q.type) {
      case 'multichoice': case 'multiselect': {
        const multi = q.type === 'multiselect';
        return q.options.map((o, j) => {
          const on = multi ? Array.isArray(r) && r.includes(j) : r === j;
          return '<div class="opt review' + (on ? (o.correct ? ' right' : ' wrong') : '') + '"><input type="' + (multi ? 'checkbox' : 'radio') + '" disabled' + (on ? ' checked' : '') + '>' +
            '<span class="ltr">' + LET[j] + '.</span><span>' + optBody(o) + (on ? mark(o.correct) : '') +
            (on && o.feedback ? '<br><span class="small">' + fmt(o.feedback) + '</span>' : '') + '</span></div>';
        }).join('');
      }
      case 'truefalse':
        return [true, false].map(v => '<div class="opt review' + (r === v ? (v === q.answer ? ' right' : ' wrong') : '') + '"><input type="radio" disabled' + (r === v ? ' checked' : '') + '><span>' +
          (v ? 'True' : 'False') + (r === v ? mark(v === q.answer) : '') + '</span></div>').join('');
      case 'shortanswer': case 'numerical':
        if (!C.isAnswered(q, r)) return none;
        return '<div class="prompt">Your answer:</div><div class="answerbox">' + esc(r) + (q.unit ? ' ' + esc(q.unit) : '') + mark(C.grade(q, r).state === 'correct') + '</div>';
      case 'matching':
        return q.pairs.map((p, j) => '<div class="mrow"><div>' + fmt(p.left) + '</div><div class="answerbox">' +
          (r && r[j] ? esc(r[j]) + mark(r[j] === p.right) : '<span class="muted">Not matched</span>') + '</div></div>').join('');
      case 'ordering':
        if (!r) return none;
        return r.map((it, j) => '<div class="orow"><span class="n">' + (j + 1) + '.</span><span class="x">' + fmt(it) + mark(it === q.items[j]) + '</span></div>').join('');
      case 'essay':
        return C.isAnswered(q, r) ? '<div class="prompt">Your answer (' + plural(words(r), 'word') + '):</div><div class="answerbox">' + esc(r) + '</div>' : none;
      case 'code': {
        if (!C.isAnswered(q, r)) return none;
        const h = '<div class="prompt">Your code:</div><pre>' + esc(r.code && r.code.trim() ? r.code : '(none pasted)') + '</pre>';
        if (q.language === 'matlab') return h + q.tests.map((t, j) => {
          const out = (r.outputs || [])[j] || '';
          return '<div class="prompt" style="margin-top:.8rem">Test ' + (j + 1) + mark(C.outputMatches(t.expected, out, t.tolerance, true)) + '</div>' + (t.code.trim() ? '<pre>' + esc(t.code) + '</pre>' : '') +
            '<div class="prompt">Your pasted output:</div><pre>' + esc(out.trim() ? out : '(nothing pasted)') + '</pre><div class="prompt">Expected:</div><pre>' + esc(t.expected) + '</pre>';
        }).join('');
        if (r.run && r.run.code === r.code) return h + resultsTable(q, r.run, false);
        return h + '<div class="note warn">This answer has not been tested yet, so it has no mark.</div><div class="btnrow" style="margin-bottom:0">' +
          '<button class="btn primary" data-act="runtests" data-i="' + i + '">Run tests</button><span class="muted small pystatus" style="align-self:center"></span></div>';
      }
    }
    return '';
  }

  function outcome(at, i) {
    const q = at.questions[i], res = at.results[i];
    let h = '';
    if (q.feedback) h += '<p>' + fmt(q.feedback) + '</p>';
    switch (q.type) {
      case 'multichoice': h += '<p>The correct answer is: ' + fmt(q.options.find(o => o.correct).text) + '</p>'; break;
      case 'multiselect': h += '<p>The correct answers are: ' + q.options.filter(o => o.correct).map(o => fmt(o.text)).join('; ') + '</p>'; break;
      case 'truefalse': h += '<p>The correct answer is: ' + (q.answer ? 'True' : 'False') + '</p>'; break;
      case 'shortanswer': h += '<p>The correct answer is: ' + esc(q.answers[0]) + '</p>'; break;
      case 'numerical': h += '<p>The correct answer is: ' + num(q.answer) + (q.unit ? ' ' + esc(q.unit) : '') + (q.tolerance ? ' (accepted within &plusmn;' + num(q.tolerance) + ')' : '') + '</p>'; break;
      case 'matching': h += '<p>The correct matches are:</p><ul>' + q.pairs.map(p => '<li>' + fmt(p.left) + ' &rarr; ' + fmt(p.right) + '</li>').join('') + '</ul>'; break;
      case 'ordering': h += '<p>The correct order is: ' + q.items.map(fmt).join(' &rarr; ') + '</p>'; break;
      case 'code': if (q.solution.trim()) h += '<p><strong>Model solution:</strong></p><pre>' + esc(q.solution) + '</pre>'; break;
      case 'essay':
        if (res.state === 'marked') h += '<p><strong>Mark: ' + num(res.awarded) + ' / ' + num(q.marks) + '</strong> <span class="small">(' + (res.markedBy === 'claude' ? 'marked by Claude' : 'marked by you') + ')</span></p>' + (res.comment ? '<p>' + fmt(res.comment) + '</p>' : '');
        if (q.modelAnswer) h += '<p><strong>Model answer:</strong> ' + fmt(q.modelAnswer) + '</p>';
        if (q.markingGuide.length) h += '<p><strong>Marking guide:</strong></p><ul>' + q.markingGuide.map(g => '<li>' + fmt(g) + '</li>').join('') + '</ul>';
        if (res.state !== 'unanswered') h += '<div class="manual"><label for="mm' + i + '" class="small">' + (res.state === 'marked' ? 'Change mark:' : 'Or mark it yourself:') + '</label>' +
          '<input type="number" id="mm' + i + '" min="0" max="' + q.marks + '" step="0.5" value="' + (res.awarded === null ? '' : res.awarded) + '"><span class="small">/ ' + num(q.marks) + '</span>' +
          '<button class="btn" data-act="manual" data-i="' + i + '">Save mark</button></div>';
        break;
    }
    return h ? '<div class="outcome">' + h + '</div>' : '';
  }

  function viewReview(at) {
    const t = C.totals(at), pass = t.percent >= at.settings.passMark;
    let h = '<div class="crumbs"><a href="#/quiz/' + enc(at.quizId) + '">' + esc(at.quizTitle) + '</a></div>' +
      '<div class="attempt"><div class="qcol"><table class="tbl kv" style="margin-bottom:1rem">' +
      '<tr><th>Started</th><td>' + fmtDate(at.startedAt) + '</td></tr>' +
      '<tr><th>Completed</th><td>' + fmtDate(at.finishedAt) + '</td></tr>' +
      '<tr><th>Time taken</th><td>' + fmtDur(at.finishedAt - at.startedAt) + '</td></tr>' +
      '<tr><th>Marks</th><td>' + num(t.score) + ' / ' + num(t.max) + (t.pending ? ' <span class="muted">so far</span>' : '') + '</td></tr>' +
      '<tr><th>Grade</th><td>' + (t.pending ? '<span class="chip pend">Awaiting marking</span>' : '<strong>' + t.percent + '%</strong> <span class="chip ' + (pass ? 'ok' : 'bad') + '">' + (pass ? 'Pass' : 'Below pass mark') + '</span>') + '</td></tr></table>';
    const pe = at.questions.filter((q, i) => q.type === 'essay' && at.results[i].state === 'needsmarking').length;
    if (t.pending - pe) h += '<div class="note warn"><strong>' + plural(t.pending - pe, 'code answer') + ' not tested yet.</strong> Python could not run when you submitted. Press Run tests on ' + (t.pending - pe === 1 ? 'that question' : 'those questions') + ' below.</div>';
    if (pe) {
      h += '<div class="note pend"><strong>' + plural(pe, 'written answer') + ' to be marked by Claude.</strong>' +
        '<ol class="steps"><li>Copy the marking request and paste it into a Claude chat.</li><li>Copy the json block Claude replies with.</li><li>Paste it on the Import screen. The marks land on this attempt.</li></ol>' +
        '<div class="btnrow" style="margin-bottom:0"><button class="btn primary" data-act="copyreq" data-id="' + esc(at.id) + '">Copy marking request</button>' +
        '<a class="btn" href="#/import">Paste marks from Claude</a></div>' +
        '<details class="small" style="margin-top:.6rem"><summary>Show the request text</summary><textarea class="mono" readonly rows="10">' + esc(C.buildMarkingRequest(at)) + '</textarea></details></div>';
    }
    h += at.questions.map((q, i) => queBlock(at, i, true)).join('') +
      '<div class="btnrow"><a class="btn primary" href="#/quiz/' + enc(at.quizId) + '">Finish review</a></div></div>' + navBlock(at, true) + '</div>';
    app.innerHTML = h;
  }

  /* ---------- import ---------- */
  function viewImport() {
    app.innerHTML = '<div class="pagehead"><h1>Import</h1></div>' +
      '<p class="muted">Paste what Claude gave you (the whole reply is fine) or choose the file. Works for quizzes, marks for written answers, and backup files.</p>' +
      '<textarea id="imp" class="mono" rows="10" placeholder=\'{ "format": "quizdrop", ... }\' aria-label="Quiz text"></textarea>' +
      '<div class="btnrow"><button class="btn primary" data-act="import">Import</button>' +
      '<label class="btn">Choose file<input type="file" id="impfile" accept=".json,.txt,application/json,text/plain" multiple hidden></label>' +
      '<button class="btn" data-act="paste">Paste from clipboard</button></div><div id="impres"></div>';
    document.getElementById('impfile').addEventListener('change', async e => {
      const texts = await Promise.all(Array.from(e.target.files).map(f => f.text()));
      e.target.value = '';
      runImport(texts);
    });
  }

  function addQuiz(quiz, out) {
    const old = quizzes[quiz.id];
    if (old) {
      if (JSON.stringify(old.questions) === JSON.stringify(quiz.questions) && old.title === quiz.title) {
        out.done.push('"' + esc(quiz.title) + '" is already here. <a href="#/quiz/' + enc(quiz.id) + '">Open it</a>');
        return;
      }
      if (!confirm('A quiz called "' + old.title + '" is already here.\n\nOK = replace it with this version (past attempts are kept).\nCancel = keep both.')) {
        let k = 2;
        while (quizzes[quiz.id + '-' + k]) k++;
        quiz.id += '-' + k;
      }
    }
    quiz.importedAt = Date.now();
    quizzes[quiz.id] = quiz;
    out.done.push('Added "' + esc(quiz.title) + '" (' + plural(quiz.questions.length, 'question') + '). <a href="#/quiz/' + enc(quiz.id) + '">Open it</a>');
    out.lastQuiz = quiz.id; out.quizCount++;
  }

  function runImport(texts) {
    const out = { errors: [], warnings: [], done: [], quizCount: 0, lastQuiz: null, lastAttempt: null };
    const jobs = [];
    texts.forEach(text => {
      let data;
      try { data = C.extractJson(text); } catch (e) { out.errors.push(esc(e.message)); return; }
      (Array.isArray(data) ? data : [data]).forEach(it => {
        if (it && it.format === C.MARKS_FORMAT) {
          const at = attempts[String(it.attemptId || '')];
          if (!at) out.errors.push('These marks are for an attempt that is not on this device (attempt ID ' + esc(it.attemptId || 'missing') + ').');
          else jobs.push(() => {
            const r = C.applyMarks(at, it);
            r.warnings.forEach(w => out.warnings.push(esc(w)));
            if (r.applied) { out.done.push('Marked ' + plural(r.applied, 'written answer') + ' in "' + esc(at.quizTitle) + '". <a href="#/review/' + enc(at.id) + '">See the review</a>'); out.lastAttempt = at.id; }
            else out.errors.push('No marks could be applied.');
          });
        } else if (it && it.format === C.BACKUP_FORMAT) {
          jobs.push(() => {
            let nq = 0, na = 0;
            Object.values(it.quizzes || {}).forEach(q => { if (q && q.id && Array.isArray(q.questions) && !quizzes[q.id]) { quizzes[q.id] = q; nq++; } });
            Object.values(it.attempts || {}).forEach(a => { if (a && a.id && Array.isArray(a.questions) && !attempts[a.id]) { attempts[a.id] = a; na++; } });
            out.done.push('Backup read: added ' + plural(nq, 'quiz').replace('quizs', 'quizzes') + ' and ' + plural(na, 'attempt') + '. Anything already on this device was left untouched.');
          });
        } else {
          const r = C.normaliseQuiz(it);
          const tag = r.errors.length && it && it.title ? '"' + esc(it.title) + '": ' : '';
          r.errors.forEach(e => out.errors.push(tag + esc(e)));
          if (r.quiz) jobs.push(() => { r.warnings.forEach(w => out.warnings.push(esc(w))); addQuiz(r.quiz, out); });
        }
      });
    });
    if (!out.errors.length) { jobs.forEach(j => j()); saveQuizzes(); saveAttempts(); }
    const el = document.getElementById('impres');
    if (!out.errors.length && out.done.length === 1 && out.quizCount === 1 && !out.warnings.length) { toast('Quiz imported'); go('quiz/' + enc(out.lastQuiz)); return; }
    if (!out.errors.length && out.done.length === 1 && out.lastAttempt && !out.warnings.length) { toast('Marks added'); go('review/' + enc(out.lastAttempt)); return; }
    const box = (cls, title, items) => items.length ? '<div class="note ' + cls + '"><strong>' + title + '</strong><ul>' + items.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' : '';
    if (el) {
      el.innerHTML = box('bad', 'Nothing was imported. Fix these and try again (you can paste this list back to Claude):', out.errors) +
        (out.errors.length ? '' : box('ok', 'Done', out.done) + box('warn', 'Notes', out.warnings));
      if (!out.errors.length) { const ta = document.getElementById('imp'); if (ta) ta.value = ''; }
    }
  }

  /* ---------- install ---------- */
  let installEvt = null;   // Chrome/Edge hand us this when the app can be installed with one click
  const onInstallScreen = () => /^#\/install/.test(location.hash);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (onInstallScreen()) route(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('QuizDrop installed'); if (onInstallScreen()) route(); });
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function thisDevice() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'windows';   // any other computer installs the same way as Windows
  }
  function viewInstall(want) {
    const names = { windows: 'Windows', android: 'Android', ios: 'iPhone / iPad' };
    const mine = thisDevice(), dev = names[want] ? want : mine, here = dev === mine;
    const url = location.origin + location.pathname + '#/install/' + dev;
    let h = '<div class="pagehead"><h1>Install QuizDrop</h1></div><div class="btnrow">' +
      Object.keys(names).map(k => '<a class="btn' + (k === dev ? ' primary' : '') + '" href="#/install/' + k + '">' + names[k] + '</a>').join('') + '</div><div class="card">';
    if (standalone()) {
      h += '<h3>Already installed</h3><p>You are using the installed app on this device.</p>';
    } else if (!here) {
      h += '<h3>Open this on your ' + names[dev] + ' device</h3><p>This device is ' + names[mine] + '. Open the link below on the ' + names[dev] + ' device and it will take you through installing there.</p>' +
        '<p class="answerbox small">' + esc(url) + '</p><div class="btnrow" style="margin-bottom:0"><button class="btn primary" data-act="copylink" data-url="' + esc(url) + '">Copy link</button></div>';
    } else if (dev === 'ios') {
      h += '<h3>Add it to your Home Screen</h3><ol class="steps"><li>Open this page in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button (the square with an arrow).</li>' +
        '<li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol><p class="muted small">QuizDrop then opens from its own icon and works offline.</p>';
    } else if (installEvt) {
      h += '<h3>Ready to install on this device</h3><div class="btnrow"><button class="btn primary" data-act="install">Install QuizDrop</button></div>' +
        '<p class="muted small" style="margin-bottom:0">It gets its own icon and window, and works offline.</p>';
    } else {
      h += '<h3>Install from the browser menu</h3><ol class="steps">' + (dev === 'android'
        ? '<li>Open this page in <strong>Chrome</strong>.</li><li>Tap the <strong>&#8942;</strong> menu.</li><li>Choose <strong>Add to Home screen</strong>, then <strong>Install</strong>.</li>'
        : '<li>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.</li><li>Click the install icon at the right-hand end of the address bar, or open the browser menu.</li>' +
          '<li>Choose <strong>Install QuizDrop</strong> (in Edge: Apps &rarr; Install this site as an app).</li>') +
        '</ol><p class="muted small" style="margin-bottom:0">An Install button appears here when the browser allows one-click install. If it never does, the app may already be installed, or this browser cannot install apps.</p>';
    }
    h += '</div><div class="btnrow"><a class="btn" href="#/">' + (standalone() ? 'Go to my quizzes' : 'Or just use it in the browser') + '</a></div>';
    app.innerHTML = h;
  }

  /* ---------- help ---------- */
  function viewHelp() {
    app.innerHTML = '<div class="pagehead"><h1>Make quizzes with Claude</h1></div>' +
      '<div class="card"><h3>Set up once</h3><p>Give Claude the QuizDrop format one of these two ways:</p>' +
      '<ol class="steps"><li><strong>Skill (best):</strong> download the skill, then in Claude go to Settings &rarr; Capabilities &rarr; Skills and upload the zip. Claude will then use it whenever you ask for a QuizDrop quiz.<br>' +
      '<a class="btn" style="margin-top:.4rem" href="claude-package/quizdrop-quiz-maker.zip" download>Download the Claude skill (.zip)</a></li>' +
      '<li><strong>Paste-in (works anywhere):</strong> copy the instructions and paste them as your first message in a chat, or into a Project\'s instructions.<br>' +
      '<button class="btn" style="margin-top:.4rem" data-act="copyinstr">Copy the instructions</button> ' +
      '<a class="btn" style="margin-top:.4rem" href="claude-package/PASTE-INTO-CLAUDE.md" download>Download as a file</a></li></ol></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Each time you want a quiz</h3><ol class="steps">' +
      '<li>Ask Claude, for example: <em>"Make a QuizDrop quiz of 15 questions on chapter 3 of these notes, mostly multiple choice with two written questions."</em></li>' +
      '<li>Copy Claude\'s reply (or download the <code>.quiz.json</code> file it makes).</li>' +
      '<li>Open <a href="#/import">Import</a>, paste or choose the file, and press Import. The quiz is checked and added.</li></ol></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Code questions</h3><p><strong>Python</strong> answers run right here on your device and are checked against test cases, like CodeRunner in Moodle. ' +
      'Press Check as often as you like; marks are given when every test passes. The first Python question downloads Python itself (about 10 MB, needs internet once); after that it works offline. ' +
      'NumPy, SciPy, SymPy, pandas and Matplotlib are available and download the first time your code imports them.</p>' +
      '<p><strong>MATLAB</strong> cannot run inside the app. For MATLAB questions you run your code in MATLAB or Octave yourself and paste in what each test prints; the app checks it against the expected output.</p></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Maths and images</h3><p>Ask for maths and Claude writes it in LaTeX, which is typeset properly in questions, options and feedback. ' +
      'Claude can also draw diagrams straight into the quiz, or embed a picture you give it. Images always show on a white panel.</p></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Written answers</h3><p>Multiple choice, true/false, short answer, numerical, matching and ordering questions are marked instantly. ' +
      'Written answers are marked by Claude: after you submit, the review screen gives you a marking request to copy into a chat, and you paste Claude\'s reply into Import.</p></div>' +
      '<div class="card" style="margin-top:1rem"><h3>Install the app</h3><p><strong>Windows / Android (Chrome or Edge):</strong> open the browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>. ' +
      '<strong>iPhone / iPad (Safari):</strong> Share &rarr; <em>Add to Home Screen</em>. Once installed it works offline. <a href="#/install">Install on this device</a></p>' +
      '<p class="muted small">Quizzes and results stay on the device you use. To share a quiz with someone, open it and choose Share quiz file.</p></div>';
  }

  /* ---------- actions ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, at = live && live.at;
    switch (act) {
      case 'sample':
        try {
          const res = await fetch('samples/solar-system.quiz.json');
          if (!res.ok) throw new Error('missing');
          const r = C.normaliseQuiz(await res.json());
          r.quiz.importedAt = Date.now(); quizzes[r.quiz.id] = r.quiz; saveQuizzes(); go('quiz/' + enc(r.quiz.id));
        } catch (err) { toast('Could not load the sample quiz'); }
        break;
      case 'backup':
        flush();
        download('quizdrop-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ format: C.BACKUP_FORMAT, version: C.VERSION, exportedAt: Date.now(), quizzes, attempts }));
        break;
      case 'start': {
        const q = quizzes[el.dataset.id]; if (!q) break;
        const a = C.startAttempt(q, Date.now());
        attempts[a.id] = a; saveAttempts(); go('attempt/' + enc(a.id));
        break;
      }
      case 'export': {
        const q = quizzes[el.dataset.id]; if (!q) break;
        const copy = Object.assign({}, q); delete copy.importedAt;
        download(q.id + '.quiz.json', JSON.stringify(copy, null, 2));
        break;
      }
      case 'delete': {
        const q = quizzes[el.dataset.id]; if (!q) break;
        const n = attemptsFor(q.id).length;
        if (!confirm('Delete "' + q.title + '"' + (n ? ' and its ' + plural(n, 'attempt') : '') + ' from this device? This cannot be undone.')) break;
        attemptsFor(q.id).forEach(a => delete attempts[a.id]);
        delete quizzes[q.id]; saveQuizzes(); saveAttempts(); go('');
        break;
      }
      case 'goto': if (at) { at.pos = +el.dataset.i; saveAttemptsSoon(); viewAttempt(at); window.scrollTo(0, 0); } break;
      case 'flag': if (at) { at.flags[at.pos] = !at.flags[at.pos]; saveAttemptsSoon(); viewAttempt(at); } break;
      case 'clear': if (at) { at.responses[at.pos] = null; saveAttemptsSoon(); viewAttempt(at); } break;
      case 'ord': case 'ordkeep': if (at) {
        const q = at.questions[at.pos], cur = (at.responses[at.pos] || q.start).slice();
        if (act === 'ord') { const j = +el.dataset.j, k = j + (+el.dataset.d); if (k < 0 || k >= cur.length) break; [cur[j], cur[k]] = [cur[k], cur[j]]; }
        at.responses[at.pos] = cur; saveAttemptsSoon(); viewAttempt(at);
        break;
      }
      case 'check': if (at) {
        const i = at.pos, q = at.questions[i];
        onInput();
        if (q.language === 'matlab') { viewAttempt(at, true); break; }
        if (!C.isAnswered(q, at.responses[i])) { toast('Write your code first'); break; }
        pyStatusEl = el.parentNode.querySelector('.pystatus');
        el.disabled = true;
        const ok = await checkCode(at, i);
        el.disabled = false;
        if (ok && live && live.at === at && at.pos === i) viewAttempt(at);
        break;
      }
      case 'runtests': {
        const a = attempts[location.hash.split('/')[2] || ''], i = +el.dataset.i;
        if (!a || !a.results) break;
        pyStatusEl = el.parentNode.querySelector('.pystatus');
        el.disabled = true;
        const ok = await checkCode(a, i);
        el.disabled = false;
        if (!ok) break;
        a.results[i] = C.grade(a.questions[i], a.responses[i]); saveAttempts();
        if (location.hash === '#/review/' + enc(a.id)) { viewReview(a); const t = document.getElementById('q' + i); if (t) t.scrollIntoView({ block: 'start' }); }
        break;
      }
      case 'verify': {
        const q = quizzes[el.dataset.id], box = document.getElementById('verifyres');
        if (!q || !box) break;
        if (pyBusy) { toast('Python is already running - try again in a moment'); break; }
        const todo = q.questions.map((x, k) => [x, k]).filter(p => p[0].type === 'code' && p[0].language === 'python' && p[0].solution.trim());
        const bad = [];
        let err = '';
        pyBusy = true; el.disabled = true;
        box.innerHTML = '<p class="muted small pystatus">Starting Python...</p>';
        pyStatusEl = box.firstChild;
        for (const [x, k] of todo) {
          const res = await runPython(pyJob(x, x.solution), x.timeLimitSeconds);
          if (res.error) { err = res.error; break; }
          const run = C.judgeRun(x, x.solution, res.results, res.note), fails = run.tests.filter(t => !t.ok).length;
          if (fails) bad.push('Question ' + (k + 1) + ': the model solution fails ' + fails + ' of its ' + plural(run.tests.length, 'test') + '.');
        }
        pyBusy = false; el.disabled = false;
        if (box.isConnected) box.innerHTML = err ? '<div class="note bad">' + esc(err) + '</div>'
          : bad.length ? '<div class="note bad"><strong>These questions need fixing (you can paste this list back to Claude):</strong><ul>' + bad.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul></div>'
          : '<div class="note ok">' + (todo.length === 1 ? 'The model solution passes its tests.' : 'All ' + todo.length + ' model solutions pass their tests.') + '</div>';
        break;
      }
      case 'submit': if (at) {
        const blank = at.questions.filter((q, k) => !C.isAnswered(q, at.responses[k])).length;
        if (confirm((blank ? plural(blank, 'question') + ' not answered. ' : '') + 'Submit all and finish? You will not be able to change your answers.')) submit(at);
        break;
      }
      case 'jump': { const t = document.getElementById('q' + el.dataset.i); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
      case 'copyreq': {
        const a = attempts[el.dataset.id]; if (!a) break;
        toast(await copyText(C.buildMarkingRequest(a)) ? 'Marking request copied - paste it into a Claude chat' : 'Could not copy - use "Show the request text" below');
        break;
      }
      case 'manual': {
        const a = attempts[(location.hash.split('/')[2] || '')], i = +el.dataset.i, inp = document.getElementById('mm' + i);
        if (!a || !inp) break;
        const v = Number(inp.value);
        if (inp.value === '' || !Number.isFinite(v) || v < 0 || v > a.questions[i].marks) { toast('Enter a mark from 0 to ' + a.questions[i].marks); break; }
        C.setMark(a, i, v, a.results[i].comment || '', 'manual'); saveAttempts(); viewReview(a);
        const t = document.getElementById('q' + i); if (t) t.scrollIntoView({ block: 'start' });
        toast('Mark saved');
        break;
      }
      case 'install':
        if (installEvt) { const ev = installEvt; installEvt = null; ev.prompt(); try { await ev.userChoice; } catch (err) { /* dismissed */ } }
        route();
        break;
      case 'copylink': toast(await copyText(el.dataset.url) ? 'Link copied' : 'Could not copy - select the link above instead'); break;
      case 'import': runImport([document.getElementById('imp').value]); break;
      case 'paste':
        try { const t = await navigator.clipboard.readText(); document.getElementById('imp').value = t; if (t.trim()) runImport([t]); }
        catch (err) { toast('Clipboard not available - paste into the box instead'); }
        break;
      case 'copyinstr':
        try {
          const res = await fetch('claude-package/PASTE-INTO-CLAUDE.md');
          if (!res.ok) throw new Error('missing');
          toast(await copyText(await res.text()) ? 'Instructions copied - paste them into a Claude chat' : 'Could not copy - download the file instead');
        } catch (err) { toast('Could not load the instructions - download the file instead'); }
        break;
    }
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  loadAll().then(route);
})();
