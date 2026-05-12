/* Solo Level — Solo Leveling web tracker */

const STORAGE_KEY = 'solo_level_data';

const STAT_COLORS = {
  strength: '#ff6b6b',
  wisdom: '#a855f7',
  focus: '#67e8f9',
  confidence: '#f472b6',
  discipline: '#fbbf24',
};
const STAT_ICONS = {
  strength: '💪',
  wisdom: '🧠',
  focus: '🎯',
  confidence: '🗣',
  discipline: '🔥',
};

const RANKS = ['e','d','c','b','a','s'];
const RANK_LABELS = { e:'E-Rank', d:'D-Rank', c:'C-Rank', b:'B-Rank', a:'A-Rank', s:'S-Rank' };
const XP_MULTIPLIERS = { e:1, d:2, c:3, b:5, a:8, s:12 };

const ACH_DEFS = [
  { id:'first_steps',   title:'First Steps',       desc:'Complete your first quest',                      icon:'1️⃣',  stat:'discipline', val:1,      tier:1 },
  { id:'consistent',    title:'Consistent',         desc:'Reach a 7-day streak',                            icon:'🔥',   stat:'discipline', val:7,      tier:1 },
  { id:'dedicated',     title:'Dedicated',          desc:'Reach a 30-day streak',                          icon:'🔥',   stat:'discipline', val:30,     tier:2 },
  { id:'unbreakable',   title:'Unbreakable',        desc:'Reach a 66-day streak',                          icon:'🛡',   stat:'discipline', val:66,     tier:3 },
  { id:'iron_body',     title:'Iron Body',          desc:'Reach Strength level 5',                         icon:'💪',   stat:'strength',   val:5,      tier:1 },
  { id:'titans_might',  title:"Titan's Might",      desc:'Reach Strength level 15',                        icon:'🏋',   stat:'strength',   val:15,     tier:3 },
  { id:'sages_mind',    title:"Sage's Mind",         desc:'Reach Wisdom level 10',                          icon:'📖',   stat:'wisdom',     val:10,     tier:2 },
  { id:'infinite',       title:'Infinite Insight',   desc:'Reach Wisdom level 25',                          icon:'🌌',   stat:'wisdom',     val:25,     tier:3 },
  { id:'laser_focus',   title:'Laser Focus',        desc:'Reach Focus level 10',                            icon:'🎯',   stat:'focus',      val:10,     tier:2 },
  { id:'flow_state',    title:'Flow State',         desc:'Reach Focus level 20',                           icon:'⚡',   stat:'focus',      val:20,     tier:3 },
  { id:'social_butter', title:'Social Butterfly',   desc:'Reach Confidence level 5',                       icon:'🦋',   stat:'confidence', val:5,      tier:1 },
  { id:'alpha_pres',    title:'Alpha Presence',     desc:'Reach Confidence level 15',                      icon:'👑',   stat:'confidence', val:15,     tier:3 },
  { id:'grinder',       title:'Grinder',             desc:'Complete 100 quests',                            icon:'⚙',    stat:'discipline', val:100,    tier:2 },
  { id:'shadow_monarch',title:'Shadow Monarch',      desc:'Reach S-Rank rise rating (3000)',                icon:'🌙',   stat:'discipline', val:3000,   tier:3 },
  { id:'nat_level',      title:'National Level',      desc:'Reach National Level rating (6000)',              icon:'⭐',   stat:'discipline', val:6000,   tier:3 },
  { id:'scholar',       title:'Scholar',             desc:'Complete 10 learning articles',                  icon:'📚',   stat:'wisdom',     val:10,     tier:1 },
];

function safeJson(v, f) { try { return JSON.parse(v); } catch { return f; } }
function $(id) { return document.getElementById(id); }
function clamp(n,a,b) { return Math.max(a, Math.min(b, n)); }
function escapeHtml(s) {
  return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function todayKey(d=new Date()) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ===== DATA =====
function defaultUser() {
  return {
    name: 'Hunter', level: 1, totalXP: 0,
    strengthXP: 0, wisdomXP: 0, focusXP: 0, confidenceXP: 0, disciplineXP: 0,
    currentStreak: 0, bestStreak: 0, lastActiveDate: null,
    totalQuestsCompleted: 0, joinDate: todayKey(),
    achievements: {}, titlesUnlocked: [],
  };
}
function defaultQuests() {
  return [
    { id:1, title:'Wake up at 7:30 AM',       category:'daily',   difficulty:'c', xpReward:50,  stat:'discipline', streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:2, title:'Drink 3L of Water',        category:'daily',   difficulty:'d', xpReward:30,  stat:'discipline', streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:3, title:'Run 3km / Cardio',          category:'fitness', difficulty:'b', xpReward:120, stat:'strength',   streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:4, title:'30 Push-ups + 20 Pull-ups',  category:'fitness', difficulty:'c', xpReward:80,  stat:'strength',   streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:5, title:'Read for 30 minutes',        category:'mind',    difficulty:'c', xpReward:70,  stat:'wisdom',     streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:6, title:'Meditate for 10 minutes',    category:'mind',    difficulty:'d', xpReward:40,  stat:'focus',      streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:7, title:'2 Hours of Deep Work',       category:'mind',    difficulty:'a', xpReward:150, stat:'focus',      streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:8, title:'Journal / Reflect',          category:'daily',  difficulty:'e', xpReward:25,  stat:'wisdom',     streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:9, title:'No Social Media Before Noon',category:'daily',  difficulty:'b', xpReward:100, stat:'focus',      streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:10,title:'Have a Meaningful Conversation',category:'social',difficulty:'d', xpReward:45,  stat:'confidence', streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:11,title:'Stretch / Mobility',         category:'fitness', difficulty:'e', xpReward:30,  stat:'strength',   streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
    { id:12,title:"Plan Tomorrow's Tasks",      category:'daily',  difficulty:'e', xpReward:25,  stat:'discipline', streak:0, bestStreak:0, done:false, lastDone:null, totalDone:0 },
  ];
}
function defaultAchs() {
  return ACH_DEFS.map(a => ({ ...a, unlocked: false, unlockedDate: null }));
}

function loadData() {
  const raw = safeJson(localStorage.getItem(STORAGE_KEY)||'null', null);
  if (!raw) return { user: defaultUser(), quests: defaultQuests(), achs: defaultAchs() };
  return {
    user: { ...defaultUser(), ...raw.user, achievements: raw.user?.achievements||{} },
    quests: (raw.quests||[]).length ? raw.quests : defaultQuests(),
    achs: raw.achs && raw.achs.length ? raw.achs : defaultAchs(),
  };
}
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = loadData();

// ===== STATS =====
function statXP(user, stat) { return user[stat+'XP'] || 0; }
function statLevel(user, stat) { return max(1, Math.floor(Math.sqrt((statXP(user,stat)||0) / 10))) + 1; }
function userStatLevel(user, stat) { return max(1, Math.floor(Math.sqrt(statXP(user,stat) / 10)) + 1); }
function totalStatXP(user) {
  return (user.strengthXP||0) + (user.wisdomXP||0) + (user.focusXP||0) + (user.confidenceXP||0) + (user.disciplineXP||0);
}
function riseRating(user) {
  const avg = Math.floor(totalStatXP(user) / 5);
  const streakMult = Math.min(user.currentStreak, 66) / 66 * 0.5 + 1.0;
  const lvlBonus = user.level * 10;
  return Math.floor((avg + lvlBonus) * streakMult);
}
function potentialRating(user) {
  const proj = Math.max(user.totalQuestsCompleted, 1) * 66 * 50;
  const projBase = Math.floor(proj / 5);
  return Math.floor((projBase + (user.level + 10) * 10) * 1.5);
}
function rankTitle(rating) {
  if (rating >= 6000) return "Monarch's Vessel";
  if (rating >= 3000) return 'National Level Hunter';
  if (rating >= 1500) return 'S-Rank Hunter';
  if (rating >= 700)  return 'B-Rank Hunter';
  if (rating >= 300)  return 'C-Rank Hunter';
  if (rating >= 100)  return 'D-Rank Hunter';
  return 'E-Rank Hunter';
}
function xpToNextLevel(lv) { return Math.floor(Math.pow(lv, 2) * 100); }
function userLevel(user) { return max(1, Math.floor(Math.sqrt((user.totalXP||0) / 100))) + 1; }

function updateStreak() {
  const user = state.user;
  const today = todayKey();
  if (user.lastActiveDate === today) return;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yKey = todayKey(yesterday);
  if (!user.lastActiveDate) { user.currentStreak = 1; }
  else if (user.lastActiveDate === yKey) { user.currentStreak += 1; }
  else { user.currentStreak = 1; }
  user.lastActiveDate = today;
  user.bestStreak = max(user.bestStreak, user.currentStreak);
}

function checkQuestStreaks() {
  const today = todayKey();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yKey = todayKey(yesterday);
  for (const q of state.quests) {
    if (!q.lastDone) { q.streak = 0; continue; }
    if (q.lastDone === yKey) { q.streak = (q.streak||0) + 1; }
    else if (q.lastDone !== today) { q.streak = 1; }
  }
}

function resetDailyQuests() {
  const today = todayKey();
  for (const q of state.quests) {
    if (q.lastDone && q.lastDone !== today) q.done = false;
  }
}

function completeQuest(q) {
  if (q.done) return;
  const user = state.user;
  const today = todayKey();
  const mult = XP_MULTIPLIERS[q.difficulty] || 1;
  const streakBonus = min(q.streak||0, 30);
  const earned = q.xpReward * mult + streakBonus;

  q.done = true;
  q.lastDone = today;
  q.totalDone += 1;
  q.streak = (q.streak||0) + 1;
  q.bestStreak = max(q.bestStreak||0, q.streak);

  user[q.stat+'XP'] = (user[q.stat+'XP']||0) + earned;
  user.totalXP += earned;
  user.totalQuestsCompleted += 1;

  const oldLevel = userLevel(user);
  // Level up check
  while (user.totalXP >= xpToNextLevel(userLevel(user))) {
    user.level = userLevel(user);
  }
  user.level = userLevel(user);

  updateStreak();
  checkAchievements();
  saveData(state);
  refreshHUD();

  return earned;
}

function uncompleteQuest(q) {
  if (!q.done) return;
  const user = state.user;
  const mult = XP_MULTIPLIERS[q.difficulty] || 1;
  const streakBonus = min(q.streak||0, 30);
  const earned = q.xpReward * mult + streakBonus;
  user[q.stat+'XP'] = max(0, (user[q.stat+'XP']||0) - earned);
  user.totalXP = max(0, (user.totalXP||0) - earned);
  user.totalQuestsCompleted = max(0, (user.totalQuestsCompleted||0) - 1);
  user.level = userLevel(user);
  q.done = false;
  q.streak = max(0, (q.streak||0) - 1);
  saveData(state);
  refreshHUD();
}

function deleteQuest(id) {
  state.quests = state.quests.filter(q => q.id !== id);
  saveData(state);
  renderAll();
}

function addQuest(data) {
  const id = Date.now();
  state.quests.push({ id, ...data, done:false, lastDone:null, totalDone:0, streak:0, bestStreak:0 });
  saveData(state);
  renderAll();
}

function updateQuest(id, data) {
  const q = state.quests.find(q=>q.id===id);
  if (!q) return;
  Object.assign(q, data);
  saveData(state);
  renderAll();
}

function checkAchievements() {
  const user = state.user;
  let changed = false;
  for (const a of state.achs) {
    if (a.unlocked) continue;
    let cur = 0;
    if (a.stat === 'discipline' && (a.val===7||a.val===30||a.val===66)) cur = user.currentStreak;
    else if (a.stat === 'discipline' && a.val===1) cur = user.totalQuestsCompleted > 0 ? 1 : 0;
    else if (a.stat === 'discipline' && a.val===100) cur = user.totalQuestsCompleted;
    else if (a.stat === 'discipline' && a.val>=3000) cur = riseRating(user);
    else cur = userStatLevel(user, a.stat);
    if (cur >= a.val) {
      a.unlocked = true;
      a.unlockedDate = todayKey();
      changed = true;
      toast('Achievement Unlocked', a.title, 'xp');
    }
  }
  if (changed) saveData(state);
}

// ===== UI =====
function toast(title, desc, type='default') {
  const host = $('toasts'); if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type?'toast-'+type:''}`;
  el.innerHTML = `<div class="t">${escapeHtml(title)}</div><div class="d">${escapeHtml(desc)}</div>`;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; }, 2800);
  setTimeout(()=>el.remove(), 3200);
}

function refreshHUD() {
  const user = state.user;
  const lv = userLevel(user);
  const rr = riseRating(user);
  const rating = rankTitle(rr);
  const need = xpToNextLevel(lv);
  const prev = Math.floor(Math.pow(lv-1,2)*100);
  const pct = clamp(Math.round(((user.totalXP||0)-prev)/(need-prev)*100),0,100);

  $('hudRank').textContent = rating.split(' ')[0];
  $('hudLevel').textContent = String(lv);
  $('hudStreak').textContent = String(user.currentStreak||0);
  $('hudXp').textContent = `${user.totalXP||0}/${need}`;
  $('hudXpBar').style.width = pct+'%';
  $('brandSub').textContent = rating;
  $('sideRise').textContent = String(rr);
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.dataset.view === view);
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const inner = document.querySelector(`[data-view="${view}"] .view-inner`);
  if (inner) {
    inner.classList.remove('fade-up');
    void inner.offsetWidth;
    inner.classList.add('fade-up');
  }
  if (view==='dashboard') renderDashboard();
  if (view==='quests') renderQuestList();
  if (view==='stats') renderStats();
  if (view==='profile') renderProfile();
  if (view==='achievements') renderAchievements();
}

function setSidebarOpen(open) { $('sidebar').classList.toggle('open', !!open); }

// ===== DASHBOARD =====
function renderDashboard() {
  const user = state.user;
  const quests = state.quests;
  const done = quests.filter(q=>q.done).length;
  const total = quests.length;
  const pct = total ? Math.round(done/total*100) : 0;
  const dailyXP = quests.filter(q=>q.done).reduce((s,q) => {
    const mult = XP_MULTIPLIERS[q.difficulty]||1;
    return s + q.xpReward * mult + min(q.streak||0, 30);
  }, 0);
  $('dashPercent').textContent = pct+'%';
  $('dashQuestCount').textContent = `${done}/${total} complete`;
  $('dashDailyXP').textContent = String(dailyXP);
  $('dashProgBar').style.width = pct+'%';
  $('dashStreak').textContent = `🔥 ${user.currentStreak||0} day streak`;
  $('dashBestStreak').textContent = `Best: ${user.bestStreak||0} days`;

  const list = $('dashQuestList');
  list.innerHTML = quests.filter(q=>q.isActive!==false).length ? quests.filter(q=>q.isActive!==false).map(q => buildQuestRow(q)).join('') : '<div class="empty-state"><div class="es-icon">📜</div>No active quests. Add some.</div>';
  attachQuestRowHandlers(list);
}

function buildQuestRow(q) {
  const mult = XP_MULTIPLIERS[q.difficulty]||1;
  const streakBonus = min(q.streak||0, 30);
  const earned = q.xpReward * mult + streakBonus;
  const catColors = { daily:'#fbbf24', fitness:'#ff6b6b', mind:'#a855f7', social:'#f472b6', custom:'#67e8f9' };
  const catColor = catColors[q.category]||'#67e8f9';
  const rankClass = q.difficulty+'-rank';
  return `<div class="quest-row ${q.done?'done':''}" data-id="${q.id}">
    <div class="quest-check">${q.done?'✓':''}</div>
    <div class="quest-body">
      <div class="q-title">${escapeHtml(q.title)}</div>
      <div class="q-meta">
        <span class="q-rank ${rankClass}">${RANK_LABELS[q.difficulty]}</span>
        <span class="q-xp">+${earned} XP</span>
        ${(q.streak||0)>0?`<span class="q-streak">🔥 ${q.streak}d</span>`:''}
        <span class="q-cat" style="border-color:${catColor}30;color:${catColor}">${q.category}</span>
      </div>
    </div>
    <div class="quest-actions">
      <button class="q-edit" data-id="${q.id}" title="Edit">✎</button>
      <button class="q-del" data-id="${q.id}" title="Delete">×</button>
    </div>
  </div>`;
}

function attachQuestRowHandlers(container) {
  container.onclick = e => {
    const row = e.target.closest('.quest-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    const q = state.quests.find(q=>q.id===id);
    if (!q) return;
    if (e.target.classList.contains('q-del')) { deleteQuest(id); return; }
    if (e.target.classList.contains('q-edit')) { openQuestModal(id); return; }
    if (e.target.closest('.quest-check') || e.target.closest('.quest-row')) {
      if (q.done) { uncompleteQuest(q); renderDashboard(); refreshHUD(); }
      else { const earned = completeQuest(q); showLevelUpIfNeeded(); toast('Quest Complete', `+${earned} XP`, 'reward'); renderDashboard(); refreshHUD(); }
    }
  };
}

function showLevelUpIfNeeded() {
  const user = state.user;
  const lv = userLevel(user);
  if (lv > 1) {
    $('levelUpNum').textContent = String(lv);
    $('levelUpMsg').textContent = `You are now Level ${lv}`;
    $('levelUpOverlay').classList.add('active');
  }
}

// ===== QUEST LIST =====
let activeFilter = 'all';
function renderQuestList() {
  const quests = activeFilter==='all' ? state.quests : state.quests.filter(q=>q.category===activeFilter);
  const list = $('questList');
  list.innerHTML = quests.length ? quests.map(q => buildQuestRow(q)).join('') : '<div class="empty-state"><div class="es-icon">📜</div>No quests in this category.</div>';
  attachQuestRowHandlers(list);
  $('questListSub').textContent = `${state.quests.length} total quests`;
}

function attachFilterHandlers() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      activeFilter = btn.dataset.cat;
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active', b.dataset.cat===activeFilter));
      renderQuestList();
    };
  });
}

// ===== STATS =====
function renderStats() {
  const user = state.user;
  const stats = ['strength','wisdom','focus','confidence','discipline'];
  const grid = $('statsGrid');
  grid.innerHTML = stats.map(stat => {
    const xp = statXP(user, stat);
    const lv = userStatLevel(user, stat);
    const nextXP = Math.floor(Math.pow(lv,2)*10);
    const color = STAT_COLORS[stat];
    const pct = clamp(Math.round(xp/nextXP*100),0,100);
    return `<div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-label" style="color:${color}">${STAT_ICONS[stat]} ${stat.toUpperCase()}</div>
        <div class="stat-card-level" style="color:${color}">Lv.${lv}</div>
      </div>
      <div class="stat-card-bar"><div class="stat-card-bar-fill" style="width:${pct}%;background:${color};box-shadow:0 0 8px ${color}60;"></div></div>
      <div class="stat-card-xp">${xp} XP total</div>
      <div class="stat-card-next">Next level: ${nextXP} XP</div>
    </div>`;
  }).join('');

  const bd = $('dailyBreakdown');
  const todayDone = state.quests.filter(q=>q.done);
  bd.innerHTML = [
    { label:'Quests Done Today', val: todayDone.length, color:'var(--neon-cyan)' },
    { label:'Fitness Quests', val: todayDone.filter(q=>q.category==='fitness').length, color:'var(--stat-str)' },
    { label:'Mind Quests', val: todayDone.filter(q=>q.category==='mind').length, color:'var(--stat-wis)' },
    { label:'Daily Quests', val: todayDone.filter(q=>q.category==='daily').length, color:'var(--stat-dis)' },
    { label:'Social Quests', val: todayDone.filter(q=>q.category==='social').length, color:'var(--stat-con)' },
  ].map(d => `<div class="day-stat"><div class="day-stat-label">${d.label}</div><div class="day-stat-val" style="color:${d.color}">${d.val}</div></div>`).join('');
}

// ===== PROFILE =====
function renderProfile() {
  const user = state.user;
  const lv = userLevel(user);
  const rr = riseRating(user);
  const rating = rankTitle(rr);
  const pot = potentialRating(user);
  const need = xpToNextLevel(lv);
  const prev = Math.floor(Math.pow(lv-1,2)*100);
  const pct = clamp(Math.round(((user.totalXP||0)-prev)/(need-prev)*100),0,100);

  $('profileRank').textContent = rating.split(' ')[0];
  $('profileName').value = user.name||'Hunter';
  $('profileTitle').textContent = rating;
  $('profileRiseRating').textContent = String(rr);
  $('profilePotential').textContent = String(pot);
  $('profileLevel').textContent = String(lv);
  $('profileTotalXP').textContent = String(user.totalXP||0);
  $('levelProgBar').style.width = pct+'%';
  $('levelProgLabel').textContent = `${user.totalXP||0}/${need} XP to next level`;
  $('profileStreak').textContent = String(user.currentStreak||0);
  $('profileBestStreak').textContent = String(user.bestStreak||0);
  $('profileTotalQuests').textContent = String(user.totalQuestsCompleted||0);
}

// ===== ACHIEVEMENTS =====
function renderAchievements() {
  const user = state.user;
  const total = state.achs.length;
  const unlocked = state.achs.filter(a=>a.unlocked).length;
  $('achSub').textContent = `${unlocked}/${total} unlocked`;
  const grid = $('achGrid');
  grid.innerHTML = state.achs.map(a => {
    let cur = 0;
    if (a.stat==='discipline'&&(a.val===7||a.val===30||a.val===66)) cur = user.currentStreak;
    else if (a.stat==='discipline'&&a.val===1) cur = user.totalQuestsCompleted>0?1:0;
    else if (a.stat==='discipline'&&a.val===100) cur = user.totalQuestsCompleted;
    else if (a.stat==='discipline'&&a.val>=3000) cur = riseRating(user);
    else cur = userStatLevel(user, a.stat);
    const pct = clamp(Math.round(min(cur,a.val)/a.val*100),0,100);
    return `<div class="ach-card ${a.unlocked?'unlocked':'locked'}">
      <div class="ach-header">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-badge ${a.unlocked?'unlocked':''}">${a.unlocked?'UNLOCKED':'LOCKED'}</div>
      </div>
      <div class="ach-name">${a.unlocked?escapeHtml(a.title):'???'}</div>
      <div class="ach-desc">${a.unlocked?escapeHtml(a.desc):'Keep progressing to reveal.'}</div>
      <div class="ach-bar"><span style="width:${pct}%"></span></div>
      <div class="ach-meta">${min(cur,a.val)}/${a.val} ${a.stat}</div>
    </div>`;
  }).join('');
}

// ===== QUEST MODAL =====
function openQuestModal(id=null) {
  const q = id ? state.quests.find(q=>q.id===id) : null;
  $('questModalId').value = id||'';
  $('qTitle').value = q?.title||'';
  $('qCategory').value = q?.category||'daily';
  $('qRank').value = q?.difficulty||'e';
  $('qXP').value = q?.xpReward||50;
  $('qStat').value = q?.stat||'discipline';
  $('qDelete').style.display = q ? 'inline-flex' : 'none';
  $('questModalTitle').textContent = q ? 'Edit Quest' : 'New Quest';
  $('questModal').classList.add('active');
  $('qTitle').focus();
}
function closeQuestModal() { $('questModal').classList.remove('active'); }
function saveQuestFromModal() {
  const id = $('questModalId').value;
  const data = {
    title: $('qTitle').value.trim(),
    category: $('qCategory').value,
    difficulty: $('qRank').value,
    xpReward: parseInt($('qXP').value)||50,
    stat: $('qStat').value,
  };
  if (!data.title) { toast('Error', 'Quest title required.'); return; }
  if (id) updateQuest(Number(id), data);
  else addQuest(data);
  closeQuestModal();
}

// ===== WIRING =====
function wire() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => {
      showView(b.dataset.view);
      if (window.matchMedia('(max-width:980px)').matches) setSidebarOpen(false);
    });
  });
  $('menuBtn').addEventListener('click', () => setSidebarOpen(true));
  $('closeSidebarBtn').addEventListener('click', () => setSidebarOpen(false));

  // Add quest buttons
  $('addQuestDashBtn')?.addEventListener('click', () => openQuestModal());
  $('addQuestBtn')?.addEventListener('click', () => openQuestModal());

  // Quest modal
  $('qCancel').addEventListener('click', closeQuestModal);
  $('qSave').addEventListener('click', saveQuestFromModal);
  $('qDelete').addEventListener('click', () => {
    const id = Number($('questModalId').value);
    if (id) { deleteQuest(id); closeQuestModal(); }
  });
  $('qTitle').addEventListener('keydown', e => { if(e.key==='Enter') saveQuestFromModal(); });
  $('questModal').addEventListener('click', e => { if(e.target.id==='questModal') closeQuestModal(); });

  // Level up dismiss
  $('levelUpDismiss').addEventListener('click', () => $('levelUpOverlay').classList.remove('active'));

  // Profile name edit
  $('profileName').addEventListener('change', e => {
    state.user.name = e.target.value.slice(0,20)||'Hunter';
    saveData(state);
  });

  // Filter buttons
  attachFilterHandlers();
}

function renderAll() {
  renderDashboard();
  renderQuestList();
  renderStats();
  renderProfile();
  renderAchievements();
}

function init() {
  checkQuestStreaks();
  resetDailyQuests();
  updateStreak();
  checkAchievements();
  refreshHUD();
  showView('dashboard');
  setSidebarOpen(false);
  wire();
  if (localStorage.getItem(STORAGE_KEY)) {
    setTimeout(() => toast('Welcome back', `Streak: ${state.user.currentStreak} days`, 'default'), 600);
  } else {
    setTimeout(() => toast('Welcome, Hunter', 'Complete quests. Rise through the ranks.', 'xp'), 600);
  }
}

init();
