/* 5 Level Up — lock in.
   Three worlds: Focus (pomodoro), Mind (tasks), Stats (screen-time + achievements).
   Everything lives in localStorage under KEY. No deps, no build. */
(() => {
  'use strict';

  const KEY = '5lu-v2';
  const MIN = 60_000;
  const DAY = 86_400_000;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- state ----------
  const DEFAULTS = {
    settings: { focus: 25, short: 5, long: 15, every: 4, goal: 8, autoBreak: true, autoFocus: false, sound: true, notify: false },
    tasks: [],      // {id, text, done, created, doneAt, poms, mins}
    sessions: [],   // {id, start, end, mins, taskId, locked}
    timer: { mode: 'focus', running: false, endAt: 0, remaining: 25 * MIN, firstStart: 0, cycle: 0, taskId: null, lockedUsed: false },
    unlocked: {},   // achievementId -> timestamp
    ui: { world: 'focus', filter: 'open', range: 'day', offset: 0 },
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw) return structuredClone(DEFAULTS);
      return {
        settings: { ...DEFAULTS.settings, ...raw.settings },
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
        timer: { ...DEFAULTS.timer, ...raw.timer },
        unlocked: raw.unlocked || {},
        ui: { ...DEFAULTS.ui, ...raw.ui, offset: 0 },
      };
    } catch { return structuredClone(DEFAULTS); }
  }
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

  // ---------- helpers ----------
  const dur = (m) => S.settings[m] * MIN;
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(r).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  const fmtDur = (mins) => {
    mins = Math.round(mins);
    const h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (t) => { const d = new Date(t); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

  /** Minutes of focus overlapping [a, b). Sessions are split across boundaries. */
  function focusIn(a, b, list = S.sessions) {
    let total = 0;
    for (const s of list) {
      const lo = Math.max(a, s.start), hi = Math.min(b, s.end);
      if (hi > lo) total += ((hi - lo) / (s.end - s.start)) * s.mins;
    }
    return total;
  }
  const sessionsIn = (a, b) => S.sessions.filter((s) => s.end >= a && s.end < b);
  const tasksDoneIn = (a, b) => S.tasks.filter((t) => t.done && t.doneAt >= a && t.doneAt < b);

  function streak() {
    const days = new Set(S.sessions.map((s) => dayKey(s.end)));
    let t = startOfDay(Date.now());
    if (!days.has(dayKey(t))) t = addDays(t, -1); // today not done yet: streak still alive from yesterday
    let n = 0;
    while (days.has(dayKey(t))) { n++; t = addDays(t, -1); }
    return n;
  }
  function bestStreak() {
    const days = [...new Set(S.sessions.map((s) => startOfDay(s.end)))].sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    for (const d of days) {
      run = prev !== null && dayKey(addDays(prev, 1)) === dayKey(d) ? run + 1 : 1;
      best = Math.max(best, run); prev = d;
    }
    return best;
  }

  // XP: 1 per focus minute, 10 per finished task. Level n needs 50·(n-1)² XP.
  function xpInfo() {
    const xp = Math.round(S.sessions.reduce((a, s) => a + s.mins, 0) + S.tasks.filter((t) => t.done).length * 10);
    const lvl = Math.floor(Math.sqrt(xp / 50)) + 1;
    const lo = 50 * (lvl - 1) ** 2, hi = 50 * lvl ** 2;
    return { xp, lvl, pct: (xp - lo) / (hi - lo), toNext: hi - xp };
  }

  // ---------- sound + notify ----------
  let actx;
  function chime(kind = 'end') {
    if (!S.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'ach' ? [659, 880, 1175, 1568] : kind === 'start' ? [523] : [784, 988, 1319];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        const t0 = actx.currentTime + i * (kind === 'ach' ? 0.09 : 0.16);
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(kind === 'start' ? 0.08 : 0.18, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'start' ? 0.25 : 1.1));
        o.connect(g).connect(actx.destination);
        o.start(t0); o.stop(t0 + 1.2);
      });
    } catch {}
  }
  function notify(title, body) {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: './favicon.svg', silent: true }); } catch {}
  }

  // ---------- toasts ----------
  function toast(html, cls = 'simple') {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // =====================================================================
  //  WORLDS
  // =====================================================================
  function go(world) {
    if (document.body.classList.contains('locked')) return;
    S.ui.world = world;
    document.body.dataset.world = world;
    $$('.world-btn').forEach((b) => b.classList.toggle('on', b.dataset.go === world));
    moveInk();
    if (world === 'stats') renderStats();
    if (world === 'mind') renderTasks();
    save();
  }
  function moveInk() {
    const on = $('.world-btn.on'), ink = $('.world-ink');
    if (!on) return;
    ink.style.width = on.offsetWidth + 'px';
    ink.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  // =====================================================================
  //  01 · FOCUS
  // =====================================================================
  const R = 168, CIRC = 2 * Math.PI * R, TICKS = 60;
  const MODE_LABEL = { focus: 'FOCUS · 集中', short: 'SHORT BREAK · 休憩', long: 'LONG BREAK · 休息' };

  function buildDial() {
    const g = $('#ticks');
    let html = '';
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r1 = 186, r2 = major ? 198 : 193;
      html += `<line class="tick${major ? ' major' : ''}" x1="${200 + r1 * Math.cos(a)}" y1="${200 + r1 * Math.sin(a)}" x2="${200 + r2 * Math.cos(a)}" y2="${200 + r2 * Math.sin(a)}"/>`;
    }
    g.innerHTML = html;
    const arc = $('#arc');
    arc.style.strokeDasharray = CIRC;
    arc.style.strokeDashoffset = CIRC;
  }
  const remaining = () => (S.timer.running ? Math.max(0, S.timer.endAt - Date.now()) : S.timer.remaining);

  let lastLit = -1;
  function paintTimer() {
    const T = S.timer, total = dur(T.mode), rem = remaining();
    const frac = Math.min(1, Math.max(0, 1 - rem / total));
    $('#time').textContent = fmtClock(rem);
    $('#arc').style.strokeDashoffset = CIRC * (1 - frac);
    const a = frac * Math.PI * 2 - Math.PI / 2;
    const head = $('#head');
    head.setAttribute('cx', 200 + R * Math.cos(a));
    head.setAttribute('cy', 200 + R * Math.sin(a));
    const lit = Math.floor(frac * TICKS);
    if (lit !== lastLit) {
      $$('#ticks .tick').forEach((t, i) => t.classList.toggle('lit', i < lit));
      lastLit = lit;
    }
    const started = T.running || rem < total;
    document.body.classList.toggle('running', T.running);
    document.body.classList.toggle('paused', !T.running && started);
    document.body.classList.toggle('started', started);
    $('#startLabel').textContent = T.running ? 'Pause' : started ? 'Resume' : T.mode === 'focus' ? 'Start focus' : 'Start break';
    document.title = started ? `${fmtClock(rem)} · ${T.mode === 'focus' ? 'Focus' : 'Break'} — 5LU` : '5 Level Up — lock in';
  }

  function paintMode() {
    const T = S.timer;
    document.body.dataset.mode = T.mode;
    $$('.mode-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === T.mode));
    $('#dialMode').textContent = MODE_LABEL[T.mode];
    const every = S.settings.every;
    $('#dialSub').textContent = T.mode === 'focus'
      ? `Session ${(T.cycle % every) + 1} of ${every}`
      : T.mode === 'long' ? 'Earned it. Step away.' : 'Breathe. Stand up.';
    lastLit = -1;
    paintTimer();
  }

  function paintGoal() {
    const today = sessionsIn(startOfDay(Date.now()), Date.now() + DAY).length;
    const goal = S.settings.goal;
    const n = Math.max(goal, today);
    $('#goalDots').innerHTML = Array.from({ length: Math.min(n, 16) }, (_, i) =>
      `<i class="${i < today ? (i >= goal ? 'on extra' : 'on') : ''}"></i>`).join('');
    $('#goalTxt').textContent = `${today} / ${goal} today`;
  }

  function paintTaskSelect() {
    const sel = $('#taskSelect');
    const open = S.tasks.filter((t) => !t.done);
    if (S.timer.taskId && !open.some((t) => t.id === S.timer.taskId)) S.timer.taskId = null;
    sel.innerHTML = `<option value="">— nothing specific —</option>` +
      open.map((t) => `<option value="${t.id}">${esc(t.text.length > 48 ? t.text.slice(0, 47) + '…' : t.text)}</option>`).join('') +
      `<option value="__new">+ add a task…</option>`;
    sel.value = S.timer.taskId || '';
    const cur = S.tasks.find((t) => t.id === S.timer.taskId);
    $('#lockedTask').innerHTML = cur ? `Locked in on <b>${esc(cur.text)}</b>` : 'Locked in.';
  }

  let tick = null;
  function loop() {
    clearInterval(tick);
    if (!S.timer.running) return;
    tick = setInterval(() => {
      if (remaining() <= 0) complete();
      else paintTimer();
    }, 250);
  }

  function start() {
    const T = S.timer;
    if (T.running) return;
    if (!T.firstStart) T.firstStart = Date.now();
    T.endAt = Date.now() + T.remaining;
    T.running = true;
    if (document.body.classList.contains('locked')) T.lockedUsed = true;
    chime('start');
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    save(); paintTimer(); loop();
  }
  function pause() {
    const T = S.timer;
    if (!T.running) return;
    T.remaining = Math.max(0, T.endAt - Date.now());
    T.running = false;
    save(); paintTimer(); loop();
  }
  const toggle = () => (S.timer.running ? pause() : start());

  function setMode(mode, { keepCycle = true } = {}) {
    const T = S.timer;
    T.mode = mode; T.running = false; T.remaining = dur(mode); T.endAt = 0; T.firstStart = 0; T.lockedUsed = document.body.classList.contains('locked');
    if (!keepCycle) T.cycle = 0;
    save(); paintMode(); loop();
  }
  function reset() { setMode(S.timer.mode); }

  /** Session finished naturally (or recovered after reload). */
  function complete(at = Date.now(), { boot = false } = {}) {
    const T = S.timer;
    const end = T.running ? Math.min(at, T.endAt) : at;
    clearInterval(tick);
    if (T.mode === 'focus') {
      const mins = S.settings.focus;
      const session = { id: uid(), start: end - mins * MIN, end, mins, taskId: T.taskId || null, locked: !!(T.lockedUsed || document.body.classList.contains('locked')) };
      S.sessions.push(session);
      const task = S.tasks.find((t) => t.id === T.taskId);
      if (task) { task.poms = (task.poms || 0) + 1; task.mins = (task.mins || 0) + mins; }
      T.cycle++;
      const isLong = T.cycle % S.settings.every === 0;
      chime('end');
      notify('Pomodoro done 🍅', isLong ? `Long break — ${S.settings.long} min.` : `Short break — ${S.settings.short} min.`);
      toast(`<span>🍅 Pomodoro locked. ${isLong ? 'Long break earned.' : 'Take five.'}</span>`);
      setMode(isLong ? 'long' : 'short');
      if (S.settings.autoBreak && !boot) start();
    } else {
      chime('end');
      notify('Break over', 'Back to it.');
      toast('<span>Break over — back to it.</span>');
      setMode('focus');
      if (S.settings.autoFocus && !boot) start();
    }
    paintGoal(); paintTaskSelect(); paintLevel(); checkAchievements();
    if (S.ui.world === 'stats') renderStats();
    if (S.ui.world === 'mind') renderTasks();
  }

  function skip() {
    const T = S.timer;
    if (T.mode === 'focus') {
      // skipping a focus doesn't log it, but it still advances to a break
      const isLong = (T.cycle + 1) % S.settings.every === 0;
      T.cycle++;
      setMode(isLong ? 'long' : 'short');
    } else setMode('focus');
  }

  // ---------- lock in ----------
  function lockIn() {
    if (S.ui.world !== 'focus') go('focus');
    document.body.classList.add('locked');
    S.timer.lockedUsed = true;
    document.documentElement.requestFullscreen?.().catch(() => {});
    if (!S.timer.running) start();
    paintTaskSelect();
  }
  function unlock() {
    document.body.classList.remove('locked');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    requestAnimationFrame(moveInk);
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('locked')) unlock(); });

  // =====================================================================
  //  02 · MIND
  // =====================================================================
  function addTask(text) {
    text = text.trim();
    if (!text) return;
    S.tasks.unshift({ id: uid(), text, done: false, created: Date.now(), doneAt: null, poms: 0, mins: 0 });
    save(); renderTasks(); paintTaskSelect();
  }
  function toggleTask(id) {
    const t = S.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done) { toast('<span>✓ Done. +10 XP</span>'); if (S.timer.taskId === id) S.timer.taskId = null; }
    save(); renderTasks(); paintTaskSelect(); paintLevel(); checkAchievements();
  }
  function deleteTask(id) {
    S.tasks = S.tasks.filter((t) => t.id !== id);
    if (S.timer.taskId === id) S.timer.taskId = null;
    save(); renderTasks(); paintTaskSelect();
  }
  function focusOn(id) {
    S.timer.taskId = id;
    if (S.timer.mode !== 'focus' && !S.timer.running) setMode('focus');
    save(); paintTaskSelect(); go('focus');
  }

  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#0b0b0c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function renderTasks() {
    const f = S.ui.filter;
    const open = S.tasks.filter((t) => !t.done), done = S.tasks.filter((t) => t.done && !t.archived);
    $('#cntOpen').textContent = open.length;
    $('#cntDone').textContent = done.length;
    $$('#taskFilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    const list = f === 'open' ? open : done.sort((a, b) => b.doneAt - a.doneAt);
    $('#taskList').innerHTML = list.map((t) => `
      <li class="task${t.done ? ' done' : ''}${S.timer.taskId === t.id ? ' current' : ''}" data-id="${t.id}">
        <button class="check" data-act="toggle" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}">${CHECK}</button>
        <div class="task-body">
          <div class="task-text" data-act="edit" title="Double-click to edit">${esc(t.text)}</div>
          ${t.poms || t.done ? `<div class="task-meta">${t.poms ? `<span class="poms">${'●'.repeat(Math.min(t.poms, 8))}${t.poms > 8 ? ' +' + (t.poms - 8) : ''}</span><span>${fmtDur(t.mins || 0)} focused</span>` : ''}${t.done ? `<span>done ${fmtDate(t.doneAt)}</span>` : ''}</div>` : ''}
        </div>
        <div class="task-actions">
          ${t.done ? '' : `<button class="go" data-act="focus" title="Focus on this">▶ Focus</button>`}
          <button data-act="del" aria-label="Delete">✕</button>
        </div>
      </li>`).join('');
    $('#taskEmpty').textContent = list.length ? '' :
      f === 'open' ? (done.length ? 'All clear. Nothing left on your mind. 🫡' : 'Mind is empty. Type the first thing you need to finish.') : 'Nothing finished yet. Go get one.';
    $('#clearDone').style.visibility = f === 'done' && done.length ? 'visible' : 'hidden';
  }

  function editTask(el) {
    const li = el.closest('.task'), t = S.tasks.find((x) => x.id === li.dataset.id);
    if (!t || t.done) return;
    el.contentEditable = 'true'; el.focus();
    document.getSelection().selectAllChildren(el);
    const finish = (commit) => {
      el.contentEditable = 'false';
      const v = el.textContent.trim();
      if (commit && v) t.text = v.slice(0, 160);
      save(); renderTasks(); paintTaskSelect();
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.onblur = null; finish(true); }
      if (e.key === 'Escape') { el.onblur = null; finish(false); }
    };
    el.onblur = () => finish(true);
  }

  // =====================================================================
  //  03 · STATS
  // =====================================================================
  function rangeBounds() {
    const today = startOfDay(Date.now());
    if (S.ui.range === 'day') {
      const a = addDays(today, -S.ui.offset);
      return { a, b: addDays(a, 1) };
    }
    const b = addDays(today, 1 - S.ui.offset * 7);
    return { a: addDays(b, -7), b };
  }

  function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

  function renderStats() {
    const { range, offset } = S.ui;
    const { a, b } = rangeBounds();
    const now = Date.now();
    $$('#rangeSeg button').forEach((x) => x.classList.toggle('on', x.dataset.r === range));
    $('#nextRange').disabled = offset === 0;
    $('#prevRange').disabled = S.sessions.length === 0 && S.tasks.length === 0;

    // label
    if (range === 'day') {
      $('#rangeLabel').textContent = offset === 0 ? 'Today' : offset === 1 ? 'Yesterday' : `${DOW_LONG[new Date(a).getDay()].slice(0, 3)}, ${fmtDate(a)}`;
    } else {
      $('#rangeLabel').textContent = offset === 0 ? 'Last 7 days' : `${fmtDate(a)} – ${fmtDate(b - 1)}`;
    }

    // hero
    const total = focusIn(a, b);
    $('#heroK').textContent = range === 'day' ? 'Focus time' : 'Focus time · daily average ' + fmtDur(total / 7);
    $('#heroV').textContent = fmtDur(total);
    let cmp, base;
    if (range === 'day') {
      // vs average of previous 7 days
      base = focusIn(addDays(a, -7), a) / 7;
      cmp = 'from your 7-day average';
    } else {
      base = focusIn(addDays(a, -7), a);
      cmp = 'from the previous 7 days';
    }
    let d = '';
    if (base > 0) {
      const pct = Math.round(((total - base) / base) * 100);
      d = pct === 0 ? `Same as ${cmp.replace('from ', '')}` : `<span class="up">${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%</span> ${cmp}`;
    } else if (total > 0) d = '<span class="up">First focus on the board.</span> Keep it going.';
    else d = range === 'day' && offset === 0 ? 'Nothing yet today. One pomodoro is enough to start.' : 'No focus logged.';
    $('#heroD').innerHTML = d;

    // chart buckets
    let buckets = [];
    if (range === 'day') {
      for (let h = 0; h < 24; h++) {
        const s = a + h * 3_600_000;
        buckets.push({ v: focusIn(s, s + 3_600_000), x: h % 6 === 0 ? hourLabel(h) : '', tip: `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`, now: offset === 0 && new Date().getHours() === h });
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const s = addDays(a, i), e = addDays(s, 1);
        const dt = new Date(s);
        buckets.push({ v: focusIn(s, e), x: DOW[dt.getDay()], tip: `${DOW_LONG[dt.getDay()].slice(0, 3)} ${fmtDate(s)}`, now: dayKey(s) === dayKey(now), n: sessionsIn(s, e).length });
      }
    }
    const maxV = Math.max(...buckets.map((x) => x.v));
    const top = range === 'day' ? niceMax(maxV, 15) : niceMax(maxV, 60);
    const grid = [top, top / 2].map((g) => `<div class="chart-grid" style="bottom:${(g / top) * 100}%"><span>${range === 'day' ? g + 'm' : fmtDur(g)}</span></div>`).join('') +
      '<div class="chart-grid" style="bottom:0"></div>';
    let avgLine = '';
    if (range === 'week' && total > 0) {
      const avg = total / 7;
      avgLine = `<div class="chart-grid dash" style="bottom:${(avg / top) * 100}%"><span>avg</span></div>`;
    }
    $('#chartPlot').innerHTML = grid + avgLine + buckets.map((x, i) => `
      <div class="col${x.now ? ' today' : ''}" data-i="${i}" tabindex="0" aria-label="${x.tip}: ${fmtDur(x.v)}">
        <div class="bar${x.v < 0.5 ? ' zero' : ''}" style="height:${(x.v / top) * 100}%"></div>
      </div>`).join('');
    $('#chartX').innerHTML = buckets.map((x) => `<span>${x.x || '&nbsp;'}</span>`).join('');
    $('#chart')._buckets = buckets;

    // tiles
    const sess = sessionsIn(a, b);
    const done = tasksDoneIn(a, b);
    const longest = (() => {
      // longest chain of back-to-back focus sessions (gap ≤ long break + 2 min)
      const list = [...sess].sort((x, y) => x.start - y.start);
      let best = 0, run = 0, last = null;
      for (const s of list) {
        run = last && s.start - last.end <= (S.settings.long + 2) * MIN ? run + s.mins : s.mins;
        best = Math.max(best, run); last = s;
      }
      return best;
    })();
    const st = streak();
    $('#tiles').innerHTML = [
      { k: '🍅 Pomodoros', v: sess.length, s: range === 'day' ? `goal ${S.settings.goal}` : `${(sess.length / 7).toFixed(1)} / day` },
      { k: '✓ Tasks done', v: done.length, s: `${S.tasks.filter((t) => !t.done).length} still open` },
      { k: '🔥 Streak', v: st, unit: st === 1 ? 'day' : 'days', s: `best ${Math.max(bestStreak(), st)}` },
      { k: '⏱ Longest run', v: fmtDur(longest), s: 'back-to-back focus' },
    ].map((t) => `<div class="tile"><div class="tile-k">${t.k}</div><div class="tile-v">${t.v}${t.unit ? `<small>${t.unit}</small>` : ''}</div><div class="tile-s">${t.s}</div></div>`).join('');

    // most focused on
    const by = new Map();
    for (const s of S.sessions) {
      const m = focusIn(a, b, [s]);
      if (m <= 0) continue;
      const k = s.taskId || '_';
      by.set(k, (by.get(k) || 0) + m);
    }
    const rows = [...by.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
    const maxRow = rows[0]?.[1] || 1;
    $('#mostSub').textContent = rows.length ? `${by.size} ${by.size === 1 ? 'thing' : 'things'}` : '';
    $('#usage').innerHTML = rows.length ? rows.map(([k, m]) => {
      const t = S.tasks.find((x) => x.id === k);
      const name = k === '_' ? 'Unassigned focus' : t ? t.text : 'Deleted task';
      const ic = k === '_' ? '·' : (name.match(/[a-z0-9]/i)?.[0] || '•').toUpperCase();
      return `<li><span class="u-ic">${esc(ic)}</span><div style="min-width:0"><div class="u-name">${esc(name)}${t?.done ? ' <span class="muted sm">✓</span>' : ''}</div><div class="u-track"><span style="width:${(m / maxRow) * 100}%"></span></div></div><span class="u-v">${fmtDur(m)}</span></li>`;
    }).join('') : '<li class="empty">No focus in this range. Pick a task in Mind and hit ▶ Focus.</li>';

    renderAchievements();
  }

  // chart tooltip
  function showTip(col) {
    const chart = $('#chart'), tip = $('#chartTip');
    const x = chart._buckets?.[+col.dataset.i];
    if (!x) return;
    tip.innerHTML = `<b>${fmtDur(x.v)}</b> · ${x.tip}${x.n != null ? ` · ${x.n} 🍅` : ''}`;
    const cr = chart.getBoundingClientRect(), r = col.getBoundingClientRect();
    const bar = col.firstElementChild.getBoundingClientRect();
    let left = r.left - cr.left + r.width / 2;
    tip.classList.add('show');
    const half = tip.offsetWidth / 2;
    left = Math.max(half, Math.min(cr.width - half, left));
    tip.style.left = left + 'px';
    tip.style.top = (bar.top - cr.top) + 'px';
  }
  const hideTip = () => $('#chartTip').classList.remove('show');

  // =====================================================================
  //  ACHIEVEMENTS
  // =====================================================================
  const maxDayPoms = () => {
    const c = {};
    for (const s of S.sessions) c[dayKey(s.end)] = (c[dayKey(s.end)] || 0) + 1;
    return Math.max(0, ...Object.values(c));
  };
  const totalPoms = () => S.sessions.length;
  const totalMins = () => S.sessions.reduce((a, s) => a + s.mins, 0);
  const tasksDone = () => S.tasks.filter((t) => t.done).length;
  const hourHit = (fn) => (S.sessions.some((s) => fn(new Date(s.start).getHours())) ? 1 : 0);
  const longestStreak = () => Math.max(bestStreak(), streak());

  const ACH = [
    { id: 'first',    ic: '🍅', name: 'First Blood',   desc: 'Finish your first pomodoro',          tier: 'bronze', goal: 1,    val: totalPoms },
    { id: 'warmup',   ic: '🔥', name: 'Warmed Up',     desc: '4 pomodoros in one day',              tier: 'bronze', goal: 4,    val: maxDayPoms },
    { id: 'deep',     ic: '🌊', name: 'Deep Diver',    desc: '8 pomodoros in one day',              tier: 'silver', goal: 8,    val: maxDayPoms },
    { id: 'monk',     ic: '🧘', name: 'Monk Mode',     desc: '12 pomodoros in one day',             tier: 'gold',   goal: 12,   val: maxDayPoms },
    { id: 'locked',   ic: '🔒', name: 'Locked In',     desc: 'Finish a pomodoro in lock-in mode',   tier: 'bronze', goal: 1,    val: () => (S.sessions.some((s) => s.locked) ? 1 : 0) },
    { id: 'closer',   ic: '✅', name: 'Closer',        desc: 'Finish 10 tasks',                      tier: 'bronze', goal: 10,   val: tasksDone },
    { id: 'finisher', ic: '🏁', name: 'Finisher',      desc: 'Finish 50 tasks',                      tier: 'silver', goal: 50,   val: tasksDone },
    { id: 'zero',     ic: '🫡', name: 'Clear Mind',    desc: 'Close every open task (5+ total)',     tier: 'silver', goal: 1,    val: () => (S.tasks.length >= 5 && S.tasks.every((t) => t.done) ? 1 : 0) },
    { id: 'streak3',  ic: '📅', name: 'Three-peat',    desc: '3-day focus streak',                   tier: 'bronze', goal: 3,    val: longestStreak },
    { id: 'streak7',  ic: '⚔️', name: 'Week Warrior',  desc: '7-day focus streak',                   tier: 'silver', goal: 7,    val: longestStreak },
    { id: 'streak30', ic: '👑', name: 'Unbroken',      desc: '30-day focus streak',                  tier: 'gold',   goal: 30,   val: longestStreak },
    { id: 'tenh',     ic: '⏳', name: 'Ten Hours',     desc: '10 hours of total focus',              tier: 'silver', goal: 600,  val: totalMins, fmt: (v) => fmtDur(v) },
    { id: 'century',  ic: '💯', name: 'Centurion',     desc: '100 pomodoros total',                  tier: 'gold',   goal: 100,  val: totalPoms },
    { id: 'early',    ic: '🌅', name: 'Early Bird',    desc: 'Start a focus before 7 am',            tier: 'bronze', goal: 1,    val: () => hourHit((h) => h >= 4 && h < 7) },
    { id: 'owl',      ic: '🦉', name: 'Night Owl',     desc: 'Start a focus after midnight',         tier: 'bronze', goal: 1,    val: () => hourHit((h) => h >= 0 && h < 4) },
    { id: 'lvl10',    ic: '⚡', name: 'Level 10',      desc: 'Reach level 10',                       tier: 'gold',   goal: 10,   val: () => xpInfo().lvl },
  ];

  function checkAchievements({ silent = false } = {}) {
    let fresh = 0;
    for (const a of ACH) {
      if (S.unlocked[a.id]) continue;
      if (a.val() >= a.goal) {
        S.unlocked[a.id] = Date.now();
        if (!silent) {
          setTimeout(() => {
            chime('ach');
            toast(`<div class="ach-badge" style="background:var(--${a.tier})"><span>${a.ic}</span></div><div><div class="toast-k">ACHIEVEMENT UNLOCKED</div><div class="toast-v">${a.name}</div></div>`, 'ach-toast');
          }, 700 + fresh * 900);
        }
        fresh++;
      }
    }
    if (fresh) save();
  }

  function renderAchievements() {
    const got = ACH.filter((a) => S.unlocked[a.id]).length;
    $('#achSub').textContent = `${got} / ${ACH.length} unlocked`;
    $('#achGrid').innerHTML = ACH.map((a) => {
      const on = !!S.unlocked[a.id];
      const v = Math.min(a.val(), a.goal);
      const f = a.fmt || ((x) => x);
      return `<div class="ach${on ? ' got' : ''}" data-tier="${a.tier}" title="${esc(a.desc)}">
        <div class="ach-badge"><span>${a.ic}</span></div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        ${on || a.goal === 1 ? '' : `<div class="ach-prog"><span style="width:${(v / a.goal) * 100}%"></span></div>`}
        <div class="ach-foot">${on ? `${a.tier.toUpperCase()} · ${fmtDate(S.unlocked[a.id])}` : a.goal > 1 ? `${f(v)} / ${f(a.goal)}` : 'LOCKED'}</div>
      </div>`;
    }).join('');
  }

  // ---------- level ----------
  let lastLvl = null;
  function paintLevel() {
    const { lvl, pct, xp, toNext } = xpInfo();
    $('#lvNum').textContent = lvl;
    $('#lvBar').style.width = `${pct * 100}%`;
    $('#lvChip').title = `Level ${lvl} · ${xp} XP · ${toNext} XP to next`;
    if (lastLvl !== null && lvl > lastLvl) {
      toast(`<div class="ach-badge" style="background:var(--focus)"><span>⚡</span></div><div><div class="toast-k" style="color:var(--focus)">LEVEL UP</div><div class="toast-v">You're level ${lvl}</div></div>`, 'ach-toast');
    }
    lastLvl = lvl;
  }

  // =====================================================================
  //  SETTINGS
  // =====================================================================
  const NUMS = ['focus', 'short', 'long', 'every', 'goal'];
  const BOOLS = ['autoBreak', 'autoFocus', 'sound', 'notify'];
  function openSettings() {
    const f = $('#settingsForm');
    NUMS.forEach((k) => (f.elements[k].value = S.settings[k]));
    BOOLS.forEach((k) => (f.elements[k].checked = S.settings[k]));
    $('#settings').showModal();
  }
  function readSettings() {
    const f = $('#settingsForm');
    const before = { ...S.settings };
    NUMS.forEach((k) => {
      const el = f.elements[k];
      const v = Math.round(+el.value);
      if (v >= +el.min && v <= +el.max) S.settings[k] = v;
    });
    BOOLS.forEach((k) => (S.settings[k] = f.elements[k].checked));
    if (S.settings.notify && !before.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    // if the current mode's length changed and the timer is idle, apply it
    const T = S.timer;
    if (!T.running && T.remaining === before[T.mode] * MIN) T.remaining = dur(T.mode);
    save(); paintMode(); paintGoal();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: '5-level-up', v: 2, exported: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `5lu-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.sessions) || !Array.isArray(d.tasks)) throw 0;
        localStorage.setItem(KEY, JSON.stringify(d));
        location.reload();
      } catch { toast('<span>That file isn\'t a 5LU export.</span>'); }
    };
    r.readAsText(file);
  }

  // =====================================================================
  //  EVENTS
  // =====================================================================
  $$('.world-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => {
    if (S.timer.mode === b.dataset.mode) return;
    if (S.timer.running && S.timer.mode === 'focus' && !confirm('Abandon this focus session?')) return;
    setMode(b.dataset.mode);
  }));
  $('#startBtn').addEventListener('click', toggle);
  $('#resetBtn').addEventListener('click', reset);
  $('#skipBtn').addEventListener('click', skip);
  $('#lockBtn').addEventListener('click', lockIn);
  $('#unlockBtn').addEventListener('click', unlock);
  $('#taskSelect').addEventListener('change', (e) => {
    if (e.target.value === '__new') { e.target.value = S.timer.taskId || ''; go('mind'); $('#captureInput').focus(); return; }
    S.timer.taskId = e.target.value || null;
    save(); paintTaskSelect();
  });

  $('#captureForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#captureInput');
    addTask(inp.value);
    inp.value = '';
    if (S.ui.filter !== 'open') { S.ui.filter = 'open'; renderTasks(); }
  });
  $('#taskList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'), li = e.target.closest('.task');
    if (!btn || !li) return;
    const id = li.dataset.id;
    if (btn.dataset.act === 'toggle') toggleTask(id);
    if (btn.dataset.act === 'del') deleteTask(id);
    if (btn.dataset.act === 'focus') focusOn(id);
  });
  $('#taskList').addEventListener('dblclick', (e) => {
    const el = e.target.closest('.task-text');
    if (el) editTask(el);
  });
  $$('#taskFilter button').forEach((b) => b.addEventListener('click', () => { S.ui.filter = b.dataset.f; save(); renderTasks(); }));
  $('#clearDone').addEventListener('click', () => {
    // archive instead of delete so stats keep the task names
    S.tasks.forEach((t) => { if (t.done) t.archived = true; });
    save(); renderTasks();
  });

  $$('#rangeSeg button').forEach((b) => b.addEventListener('click', () => { S.ui.range = b.dataset.r; S.ui.offset = 0; renderStats(); }));
  $('#prevRange').addEventListener('click', () => { S.ui.offset++; renderStats(); });
  $('#nextRange').addEventListener('click', () => { S.ui.offset = Math.max(0, S.ui.offset - 1); renderStats(); });
  const plot = $('#chartPlot');
  plot.addEventListener('pointerover', (e) => { const c = e.target.closest('.col'); if (c) showTip(c); });
  plot.addEventListener('pointerleave', hideTip);
  plot.addEventListener('focusin', (e) => { const c = e.target.closest('.col'); if (c) showTip(c); });
  plot.addEventListener('focusout', hideTip);

  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settings').addEventListener('close', readSettings);
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('Delete every session, task and achievement? This cannot be undone.')) return;
    localStorage.removeItem(KEY);
    location.reload();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('#settings').open) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && document.body.classList.contains('locked')) { unlock(); return; }
    if (k === '1') go('focus');
    else if (k === '2') go('mind');
    else if (k === '3') go('stats');
    else if (k === ' ' && S.ui.world === 'focus') { e.preventDefault(); toggle(); }
    else if (k === 'r' && S.ui.world === 'focus') reset();
    else if (k === 's' && S.ui.world === 'focus') skip();
    else if (k === 'l') document.body.classList.contains('locked') ? unlock() : lockIn();
    else if (k === 'n') { e.preventDefault(); go('mind'); $('#captureInput').focus(); }
    else return;
  });

  window.addEventListener('resize', moveInk);
  document.fonts?.ready.then(moveInk);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.timer.running) { if (remaining() <= 0) complete(); else paintTimer(); } });

  // =====================================================================
  //  BOOT
  // =====================================================================
  buildDial();
  // migrate stale timer: if it was running and the end passed while away, log it at its endAt
  if (S.timer.running && S.timer.endAt <= Date.now()) complete(S.timer.endAt, { boot: true });
  if (!S.timer.running && !S.timer.remaining) S.timer.remaining = dur(S.timer.mode);
  paintMode(); paintGoal(); paintTaskSelect(); paintLevel();
  checkAchievements({ silent: true });
  go(S.ui.world || 'focus');
  loop();
})();
