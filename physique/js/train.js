import { S, save, remove, uid, getKV, setKV } from './db.js';
import {
  today, addDays, weekStart, range, relDay, fmtDate, dayName, esc, r0, r1, num, sum, toast, openSheet, confirmSheet, on, ICON, changed, $, $$, plural,
} from './util.js';
import {
  exercises, exInfo, sessions, saveSessions, schedule, sessionFor, SESSION_ORDER, MUSCLES, VOLUME_RANGE,
  lastPerformance, setBeats, exerciseBeats, exerciseStats, validSets, currentBodyweight, cardioOn, settings,
} from './state.js';
import { lineChart } from './charts.js';

let sub = 'today';
let activeId = null; // workout being edited
let editMode = false;

export function activeWorkout() {
  if (activeId) { const w = S.workouts.find(x => x.id === activeId); if (w) return w; }
  return S.workouts.find(w => !w.done && w.date === today()) || null;
}
export function openWorkoutTab(id) { activeId = id; sub = 'today'; }

// ---------- week stats ----------
export function weekPlan(refKey = today()) {
  const ws = weekStart(refKey);
  const days = range(ws, addDays(ws, 6));
  const planned = days.filter(k => sessionFor(k)).map(k => ({ k, sid: sessionFor(k) }));
  const done = S.workouts.filter(w => w.done && w.date >= ws && w.date <= addDays(ws, 6));
  const doneIds = new Set(done.map(w => w.sessionId));
  const t = today();
  const sched = planned.map(p => ({ ...p, done: doneIds.has(p.sid), past: p.k < t, isToday: p.k === t }));
  return { ws, planned: sched, done, missed: sched.filter(p => p.past && !p.done) };
}

export function weeklyVolume(ws) {
  const we = addDays(ws, 6);
  const vol = Object.fromEntries(MUSCLES.map(m => [m, 0]));
  for (const w of S.workouts) {
    if (!w.done || w.date < ws || w.date > we) continue;
    for (const ex of w.exercises) {
      const n = validSets(ex).length;
      if (!n) continue;
      for (const [m, f] of Object.entries(exInfo(ex.exId).muscles || {})) vol[m] = (vol[m] || 0) + n * f;
    }
  }
  return vol;
}

// ---------- render ----------
export function renderTrain(view) {
  const w = activeWorkout();
  const pills = [['today', w ? 'Workout' : 'Today'], ['lifts', 'Lifts'], ['volume', 'Volume'], ['cardio', 'Cardio'], ['history', 'History']];
  view.innerHTML = `<div class="pill-nav">${pills.map(([id, n]) => `<button class="chip ${sub === id ? 'on' : ''}" data-act="train-sub" data-sub="${id}">${n}</button>`).join('')}</div><div data-pane></div>`;
  const pane = $('[data-pane]', view);
  if (sub === 'today') { if (w) renderWorkout(pane, w); else renderTodayPlan(pane); }
  if (sub === 'lifts') renderLifts(pane);
  if (sub === 'volume') renderVolume(pane);
  if (sub === 'cardio') renderCardio(pane);
  if (sub === 'history') renderHistory(pane);
}

export function todayWorkoutCard() {
  const t = today();
  const sid = sessionFor(t);
  const w = activeWorkout();
  const doneToday = S.workouts.filter(x => x.date === t && x.done);
  const ss = sessions();
  const plan = weekPlan();
  const wk = `${plan.planned.filter(p => p.done).length}/${plan.planned.length} sessions this week`;
  if (w) return `<div class="card"><div class="card-h"><h2>${esc(w.name)} in progress</h2><span class="meta">${wk}</span></div>
    <div class="small muted" style="margin-bottom:12px">${w.exercises.filter(e => validSets(e).length).length} of ${w.exercises.length} exercises logged</div>
    <button class="btn primary block" data-act="goto-workout">Continue workout</button></div>`;
  if (doneToday.length) {
    const d = doneToday[0];
    const beats = d.exercises.filter(e => exerciseBeats(e, lastPerformance(e.exId, d.date, d.id))).length;
    return `<div class="card"><div class="card-h"><h2>${esc(d.name)} done</h2><span class="meta">${wk}</span></div>
      <div class="small muted">Beat last session on ${beats} of ${d.exercises.filter(e => validSets(e).length).length} exercises.${d.bike ? ` Bike ${d.bike} min.` : ' No bike logged.'}</div></div>`;
  }
  if (!sid) return `<div class="card"><div class="card-h"><h2>Rest day</h2><span class="meta">${wk}</span></div>
    <div class="small muted" style="margin-bottom:12px">Growth happens now, not in the gym. Eat to target and sleep 8 hours.</div>
    <button class="btn block" data-act="goto-train">Train anyway / log cardio</button></div>`;
  const s = ss[sid];
  return `<div class="card"><div class="card-h"><h2>${esc(s.name)}</h2><span class="meta">${wk}</span></div>
    <div class="small muted" style="margin-bottom:12px">${s.ex.map(id => esc(exInfo(id).name)).join(' · ')}</div>
    <button class="btn primary block" data-act="start-session" data-sid="${sid}">Start ${esc(s.name)}</button></div>`;
}

function renderTodayPlan(pane) {
  const t = today();
  const sid = sessionFor(t);
  const ss = sessions();
  const plan = weekPlan();
  const doneToday = S.workouts.filter(x => x.date === t && x.done);
  pane.innerHTML = `
    ${todayWorkoutCard()}
    <div class="section-title">This week</div>
    <div class="card tight">${plan.planned.map(p => `<div class="spread" style="padding:6px 0">
      <span>${dayName(p.k)} · ${esc((ss[p.sid] || {}).name || p.sid)}</span>
      ${p.done ? '<span class="tag good">Done</span>' : p.past ? '<span class="tag bad">Missed</span>' : p.isToday ? '<span class="tag accent">Today</span>' : '<span class="tag">Planned</span>'}
    </div>`).join('')}</div>
    <div class="section-title">Start any session</div>
    <div class="session-pick">${SESSION_ORDER.filter(id => ss[id]).concat(Object.keys(ss).filter(id => !SESSION_ORDER.includes(id))).map(id => `
      <button data-act="start-session" data-sid="${id}" class="${id === sid ? 'today' : ''}"><b>${esc(ss[id].name)}</b><span>${ss[id].ex.length} exercises${id === sid ? ' · today' : ''}</span></button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="link-btn" data-act="edit-template">Edit session templates</button></div>
    ${doneToday.length ? `<div class="section-title">Done today</div>${doneToday.map(w => `<button class="btn block" data-act="open-workout" data-id="${w.id}" style="margin-bottom:8px">Edit ${esc(w.name)}</button>`).join('')}` : ''}
  `;
}

// ---------- workout editor ----------
function newWorkout(sid) {
  const s = sessions()[sid];
  return {
    id: uid(), date: today(), sessionId: sid, name: s.name, startedAt: Date.now(), done: false, bike: 0, notes: '',
    exercises: s.ex.map(exId => ({ exId, sets: Array.from({ length: exInfo(exId).sets || 3 }, () => ({ w: '', r: '' })) })),
  };
}

let saveTimer;
function queueSave(w) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('workouts', w), 400); }

function lastLine(last) {
  if (!last) return 'No previous session — set your baseline.';
  return `Last (${relDay(last.date)}): ${last.sets.map(s => `${r1(num(s.w))}×${r0(num(s.r))}`).join(', ')}`;
}

function exCard(w, ex, i) {
  const info = exInfo(ex.exId);
  const last = lastPerformance(ex.exId, w.date, w.id);
  const beat = exerciseBeats(ex, last);
  const rows = ex.sets.map((s, j) => {
    const prev = last && last.sets[j];
    const b = setBeats(s, prev);
    return `<div class="set-row ${b ? 'beat' : ''}" data-ex="${i}" data-set="${j}">
      <span class="n">${j + 1}</span>
      <input class="input" inputmode="decimal" data-f="w" value="${esc(s.w)}" placeholder="${prev ? r1(num(prev.w)) : 'kg'}" aria-label="Set ${j + 1} weight">
      <input class="input" inputmode="numeric" data-f="r" value="${esc(s.r)}" placeholder="${prev ? r0(num(prev.r)) : 'reps'}" aria-label="Set ${j + 1} reps">
      <button class="prev" data-act="copy-prev-set" style="background:none;border:0;text-align:left;padding:0">${prev ? `<b>${r1(num(prev.w))} × ${r0(num(prev.r))}</b>${b ? 'beaten' : 'tap to copy'}` : '<span class="faint">—</span>'}</button>
    </div>`;
  }).join('');
  return `<div class="card ex-card" data-exi="${i}">
    <div class="ex-h"><h3>${esc(info.name)}</h3>
      ${beat ? '<span class="beat-flag">BEAT LAST</span>' : ''}
      ${editMode ? `<div class="ex-edit"><button data-act="ex-move" data-i="${i}" data-d="-1" aria-label="Move up">↑</button><button data-act="ex-move" data-i="${i}" data-d="1" aria-label="Move down">↓</button><button data-act="ex-remove" data-i="${i}" aria-label="Remove">✕</button></div>` : ''}
    </div>
    <div class="ex-last">${info.sets || 3} × ${esc(info.reps || '')}${info.bw ? ' · weight = added load' : ''}<br>${esc(lastLine(last))}</div>
    <div class="set-head"><span>#</span><span>kg</span><span>reps</span><span>last</span></div>
    ${rows}
    <div class="ex-tools">
      ${last ? `<button class="btn sm" data-act="same-as-last" data-i="${i}">Same as last time</button>` : ''}
      <button class="btn sm ghost" data-act="set-add" data-i="${i}">+ Set</button>
      ${ex.sets.length > 1 ? `<button class="btn sm ghost" data-act="set-del" data-i="${i}">− Set</button>` : ''}
      <span class="grow"></span>
      <button class="btn sm ghost" data-act="ex-chart" data-ex="${ex.exId}">Chart</button>
    </div>
  </div>`;
}

function renderWorkout(pane, w) {
  activeId = w.id;
  const bikeTarget = 10;
  pane.innerHTML = `
    <div class="spread" style="margin:8px 0 4px">
      <div><div class="eyebrow">${relDay(w.date)}${w.done ? ' · completed' : ''}</div><h2 style="font-size:24px">${esc(w.name)}</h2></div>
      <button class="btn sm ${editMode ? 'primary' : ''}" data-act="toggle-edit">${editMode ? 'Done editing' : 'Edit exercises'}</button>
    </div>
    ${editMode ? `<div class="card tight small muted">Reorder or remove below, or add an exercise. <button class="link-btn" data-act="save-template">Save this list as the ${esc(w.name)} template</button></div>` : ''}
    <div data-exlist>${w.exercises.map((ex, i) => exCard(w, ex, i)).join('')}</div>
    ${editMode ? `<button class="btn block" data-act="ex-add">${ICON.plus} Add exercise</button>` : ''}
    <div class="card">
      <div class="card-h"><h2>Bike finisher</h2><span class="meta">10-15 min</span></div>
      <div class="chips">${[0, 10, 12, 15].map(m => `<button class="chip ${num(w.bike) === m ? 'on' : ''}" data-act="bike" data-m="${m}">${m ? m + ' min' : 'Skipped'}</button>`).join('')}</div>
      ${num(w.bike) && num(w.bike) < bikeTarget ? '' : ''}
    </div>
    <label class="field"><span>Notes</span><textarea class="input" rows="2" data-notes placeholder="Sleep, pain, anything worth remembering">${esc(w.notes || '')}</textarea></label>
    <button class="btn primary block" data-act="finish-workout">${w.done ? 'Save changes' : 'Finish workout'}</button>
    <button class="btn danger ghost block" data-act="discard-workout" style="margin-top:8px">${w.done ? 'Delete this workout' : 'Discard workout'}</button>
  `;
  const list = $('[data-exlist]', pane);
  list.addEventListener('input', e => {
    const inp = e.target.closest('input[data-f]');
    if (!inp) return;
    const row = inp.closest('.set-row');
    const i = +row.dataset.ex, j = +row.dataset.set;
    w.exercises[i].sets[j][inp.dataset.f] = inp.value.replace(',', '.');
    queueSave(w);
    refreshBeat(w, i);
  });
  list.addEventListener('change', e => {
    const inp = e.target.closest('input[data-f="r"]');
    if (!inp) return;
    const row = inp.closest('.set-row');
    const s = w.exercises[+row.dataset.ex].sets[+row.dataset.set];
    if (num(s.r) > 0) startRest();
  });
  $('[data-notes]', pane).addEventListener('input', e => { w.notes = e.target.value; queueSave(w); });
}

function refreshBeat(w, i) {
  const card = $(`.ex-card[data-exi="${i}"]`);
  if (!card) return;
  const ex = w.exercises[i];
  const last = lastPerformance(ex.exId, w.date, w.id);
  $$('.set-row', card).forEach((row, j) => {
    const prev = last && last.sets[j];
    const b = setBeats(ex.sets[j], prev);
    row.classList.toggle('beat', b);
    const pb = $('.prev', row);
    if (prev) pb.innerHTML = `<b>${r1(num(prev.w))} × ${r0(num(prev.r))}</b>${b ? 'beaten' : 'tap to copy'}`;
  });
  const h = $('.ex-h', card);
  const flag = $('.beat-flag', h);
  const beat = exerciseBeats(ex, last);
  if (beat && !flag) $('h3', h).insertAdjacentHTML('afterend', '<span class="beat-flag">BEAT LAST</span>');
  if (!beat && flag) flag.remove();
}

// ---------- rest timer ----------
let restEnd = 0, restInt = null;
function startRest(secs) {
  const st = settings();
  const s = secs || (st && st.restSeconds) || 120;
  restEnd = Date.now() + s * 1000;
  let el = document.getElementById('rest');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest'; el.className = 'rest-timer';
    el.innerHTML = '<span data-t></span><button data-a="add">+30s</button><button data-a="x">Close</button>';
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'add') { restEnd = Math.max(restEnd, Date.now()) + 30000; tick(); }
      if (a === 'x') stopRest();
    });
  }
  clearInterval(restInt);
  restInt = setInterval(tick, 250);
  tick();
}
function tick() {
  const el = document.getElementById('rest');
  if (!el) return;
  const left = Math.round((restEnd - Date.now()) / 1000);
  el.classList.toggle('done', left <= 0);
  const a = Math.abs(left);
  $('[data-t]', el).textContent = left > 0 ? `Rest ${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}` : `Go · +${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
  if (left === 0 && navigator.vibrate) navigator.vibrate(200);
}
export function stopRest() { clearInterval(restInt); const el = document.getElementById('rest'); if (el) el.remove(); }

// ---------- exercise picker / templates ----------
function openExercisePicker(onPick) {
  const s = openSheet({ title: 'Add exercise', full: true });
  const lib = exercises();
  const render = q => {
    const ids = Object.keys(lib).filter(id => lib[id].name.toLowerCase().includes((q || '').toLowerCase())).sort((a, b) => lib[a].name.localeCompare(lib[b].name));
    $('[data-res]', s.body).innerHTML = ids.map(id => `<li><button class="item" data-pick="${id}"><div class="grow"><div class="t">${esc(lib[id].name)}</div><div class="s">${Object.keys(lib[id].muscles || {}).join(', ')}</div></div></button></li>`).join('');
  };
  s.body.innerHTML = `<input class="input" type="search" placeholder="Search exercises" data-q>
    <ul class="list" data-res style="margin-top:8px"></ul>
    <div class="section-title">Not listed?</div>
    <div class="card tight">
      <label class="field"><span>Name</span><input class="input" data-cn placeholder="e.g. Pendulum squat"></label>
      <div class="grid2"><label class="field"><span>Main muscle</span><select class="input" data-cm>${MUSCLES.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="field"><span>Sets × reps</span><input class="input" data-cr value="3 × 8-12"></label></div>
      <button class="btn block" data-create>Create and add</button>
    </div>`;
  render('');
  $('[data-q]', s.body).addEventListener('input', e => render(e.target.value));
  s.body.addEventListener('click', async e => {
    const p = e.target.closest('[data-pick]');
    if (p) { s.close(); onPick(p.dataset.pick); return; }
    if (e.target.closest('[data-create]')) {
      const name = $('[data-cn]', s.body).value.trim();
      if (!name) { toast('Name it'); return; }
      const [setsStr, reps] = $('[data-cr]', s.body).value.split('×').map(x => x.trim());
      const id = 'c_' + uid();
      const custom = getKV('customExercises', {});
      custom[id] = { name, muscles: { [$('[data-cm]', s.body).value]: 1 }, sets: parseInt(setsStr, 10) || 3, reps: reps || '8-12', custom: true };
      await setKV('customExercises', custom);
      s.close(); onPick(id);
    }
  });
}

function openTemplateEditor() {
  const ss = JSON.parse(JSON.stringify(sessions()));
  let cur = SESSION_ORDER.find(id => ss[id]) || Object.keys(ss)[0];
  const s = openSheet({ title: 'Session templates', full: true });
  const render = () => {
    const t = ss[cur];
    s.body.innerHTML = `
      <div class="chips" style="margin-bottom:12px">${Object.keys(ss).map(id => `<button class="chip ${id === cur ? 'on' : ''}" data-sel="${id}">${esc(ss[id].name)}</button>`).join('')}</div>
      <ul class="list">${t.ex.map((id, i) => `<li class="row" style="padding:8px 0"><div class="grow"><div style="font-weight:600">${esc(exInfo(id).name)}</div><div class="small muted">${exInfo(id).sets} × ${esc(exInfo(id).reps)}</div></div>
        <div class="ex-edit"><button data-mv="${i}" data-d="-1">↑</button><button data-mv="${i}" data-d="1">↓</button><button data-rm="${i}">✕</button></div></li>`).join('')}</ul>
      <button class="btn block" data-add style="margin-top:10px">${ICON.plus} Add exercise</button>
      <button class="btn primary block" data-save style="margin-top:10px">Save templates</button>
      <button class="btn ghost block" data-reset style="margin-top:8px">Restore original program</button>`;
  };
  render();
  s.body.addEventListener('click', async e => {
    const sel = e.target.closest('[data-sel]'); if (sel) { cur = sel.dataset.sel; render(); return; }
    const mv = e.target.closest('[data-mv]');
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d, a = ss[cur].ex; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; render(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { ss[cur].ex.splice(+rm.dataset.rm, 1); render(); return; }
    if (e.target.closest('[data-add]')) { openExercisePicker(id => { ss[cur].ex.push(id); render(); }); return; }
    if (e.target.closest('[data-save]')) { await saveSessions(ss); toast('Templates saved'); s.close(); changed(); return; }
    if (e.target.closest('[data-reset]')) {
      if (await confirmSheet({ title: 'Restore original program?', message: 'All six sessions go back to the default exercise lists. Logged workouts are not affected.', ok: 'Restore' })) {
        await setKV('sessions', null); s.close(); changed(); toast('Restored');
      }
    }
  });
}

// ---------- lifts / charts ----------
function exerciseHistory(exId) {
  const bw = currentBodyweight();
  return S.workouts.filter(w => w.done).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(w => { const ex = w.exercises.find(e => e.exId === exId); if (!ex || !validSets(ex).length) return null; return { date: w.date, ex, st: exerciseStats(ex, bw) }; })
    .filter(Boolean);
}

function renderLifts(pane) {
  const ids = [...new Set(S.workouts.filter(w => w.done).flatMap(w => w.exercises.filter(e => validSets(e).length).map(e => e.exId)))];
  if (!ids.length) { pane.innerHTML = '<div class="card empty">Finish a workout and each lift gets its own progression chart here.</div>'; return; }
  const rows = ids.map(id => {
    const h = exerciseHistory(id);
    const last = h[h.length - 1], first = h[0];
    const ch = first && last && h.length > 1 ? ((last.st.best - first.st.best) / (first.st.best || 1)) * 100 : 0;
    return { id, name: exInfo(id).name, n: h.length, last, ch };
  }).sort((a, b) => a.name.localeCompare(b.name));
  pane.innerHTML = `<div class="small muted" style="margin:6px 2px">Estimated 1-rep max (Epley) from your best set each session. Tap a lift for its chart.</div>
    <div class="card tight"><ul class="list">${rows.map(r => `<li><button class="item" data-act="ex-chart" data-ex="${r.id}">
      <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${plural(r.n, 'session')} · last ${relDay(r.last.date)}</div></div>
      <div class="r"><b>${r1(r.last.st.best)} kg</b><span class="${r.ch > 0.5 ? 'good' : r.ch < -0.5 ? 'bad' : 'muted'}">${r.n > 1 ? (r.ch >= 0 ? '+' : '') + r1(r.ch) + '%' : 'new'}</span></div></button></li>`).join('')}</ul></div>`;
}

export function openExerciseChart(exId) {
  const h = exerciseHistory(exId);
  const info = exInfo(exId);
  const s = openSheet({ title: info.name, full: true });
  if (!h.length) { s.body.innerHTML = '<div class="empty">No completed sessions for this lift yet.</div>'; return; }
  const e1 = h.map(x => ({ x: x.date, y: x.st.best }));
  const top = h.map(x => ({ x: x.date, y: x.st.topW }));
  s.body.innerHTML = `
    <div class="card">${lineChart({ series: [{ points: e1, color: 'var(--accent)' }, { points: top, color: 'var(--protein)', dashed: true }], yFmt: v => r0(v) })}
      <div class="legend"><span><i style="background:var(--accent)"></i>Estimated 1RM</span><span><i style="background:var(--protein)"></i>Top set weight</span></div></div>
    <div class="card tight"><ul class="list">${[...h].reverse().map(x => `<li class="spread" style="padding:10px 0"><span>${fmtDate(x.date, { weekday: true })}</span><span class="small muted tnum">${validSets(x.ex).map(st => `${r1(num(st.w))}×${r0(num(st.r))}`).join(', ')}</span></li>`).join('')}</ul></div>`;
}

// ---------- volume ----------
let volWeekOffset = 0;
function renderVolume(pane) {
  const ws = addDays(weekStart(today()), volWeekOffset * 7);
  const vol = weeklyVolume(ws);
  const max = Math.max(24, ...Object.values(vol));
  const shown = MUSCLES.filter(m => vol[m] > 0 || (VOLUME_RANGE[m] && VOLUME_RANGE[m][0] > 0));
  pane.innerHTML = `
    <div class="datebar"><button class="icon-btn" data-act="vol-week" data-n="-1">${ICON.back}</button><b>Week of ${fmtDate(ws)}</b><button class="icon-btn" data-act="vol-week" data-n="1" ${volWeekOffset >= 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.fwd}</button></div>
    <div class="card">
      <div class="small muted" style="margin-bottom:8px">Hard sets per muscle (secondary muscles count as half). Shaded band = a typical productive range.</div>
      ${shown.map(m => {
        const v = vol[m], [lo, hi] = VOLUME_RANGE[m] || [0, 0];
        const cls = lo && v < lo ? 'bad' : hi && v > hi ? 'warn' : 'good';
        return `<div class="vol-row"><span>${m}</span><div class="bar"><span class="band" style="left:${(lo / max) * 100}%;width:${((hi - lo) / max) * 100}%"></span><i style="width:${Math.min(100, (v / max) * 100)}%;background:var(--${cls === 'good' ? 'accent' : cls})"></i></div><span class="tnum ${cls}" style="text-align:right">${r1(v)}</span></div>`;
      }).join('')}
    </div>`;
}

// ---------- cardio ----------
export function weekCardio(ws = weekStart(today())) {
  const we = addDays(ws, 6);
  const c = S.cardio.filter(x => x.date >= ws && x.date <= we);
  const sessionsDone = S.workouts.filter(w => w.done && w.date >= ws && w.date <= we);
  return {
    runs: c.filter(x => x.type === 'run').length,
    sprints: c.filter(x => x.type === 'sprint').length,
    bikeAfter: sessionsDone.filter(w => num(w.bike) >= 10).length,
    sessions: sessionsDone.length,
    items: c,
  };
}
function renderCardio(pane) {
  const wc = weekCardio();
  const recent = [...S.cardio].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15);
  const names = { run: 'Easy run', sprint: 'Sprints', bike: 'Bike', walk: 'Walk', other: 'Other' };
  pane.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>This week</h2></div>
      <dl class="kv">
        <dt>Easy runs</dt><dd class="${wc.runs >= 2 ? 'good' : ''}">${wc.runs} / 2</dd>
        <dt>Sprint sessions</dt><dd class="${wc.sprints >= 1 ? 'good' : ''}">${wc.sprints} / 1</dd>
        <dt>Bike after lifting</dt><dd class="${wc.sessions && wc.bikeAfter >= wc.sessions ? 'good' : ''}">${wc.bikeAfter} / ${wc.sessions} sessions</dd>
      </dl>
    </div>
    <div class="card">
      <div class="card-h"><h2>Log cardio</h2></div>
      <div class="seg" data-ctype><button class="on" data-t="run">Easy run</button><button data-t="sprint">Sprints</button><button data-t="bike">Bike</button><button data-t="walk">Walk</button></div>
      <div class="grid2"><label class="field"><span>Minutes</span><input class="input" data-cmin inputmode="numeric" value="30"></label>
      <label class="field"><span>Distance km (optional)</span><input class="input" data-ckm inputmode="decimal"></label></div>
      <label class="field"><span>Date</span><input class="input" type="date" data-cdate value="${today()}" max="${today()}"></label>
      <button class="btn primary block" data-act="cardio-log">Log</button>
    </div>
    <div class="section-title">Recent</div>
    <div class="card tight"><ul class="list">${recent.length ? recent.map(c => `<li class="spread" style="padding:10px 0"><span>${relDay(c.date)} · ${names[c.type] || c.type}</span><span class="row small muted">${c.min} min${c.km ? ` · ${c.km} km` : ''}<button class="link-btn" style="color:var(--bad)" data-act="cardio-del" data-id="${c.id}">Delete</button></span></li>`).join('') : '<li class="empty">Nothing logged yet.</li>'}</ul></div>`;
  $('[data-ctype]', pane).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('[data-ctype] button', pane).forEach(x => x.classList.toggle('on', x === b));
    $('[data-cmin]', pane).value = { run: 30, sprint: 20, bike: 15, walk: 40 }[b.dataset.t];
  });
}

// ---------- history ----------
function renderHistory(pane) {
  const ws = S.workouts.filter(w => w.done).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  pane.innerHTML = ws.length ? `<div class="card tight"><ul class="list">${ws.map(w => {
    const beats = w.exercises.filter(e => exerciseBeats(e, lastPerformance(e.exId, w.date, w.id))).length;
    const sets = sum(w.exercises, e => validSets(e).length);
    return `<li><button class="item" data-act="open-workout" data-id="${w.id}"><div class="grow"><div class="t">${esc(w.name)}</div><div class="s">${fmtDate(w.date, { weekday: true })} · ${sets} sets${w.bike ? ` · bike ${w.bike}m` : ''}</div></div>
      <div class="r">${beats ? `<span class="tag good">${beats} beat</span>` : ''}</div></button></li>`;
  }).join('')}</ul></div>` : '<div class="card empty">No finished workouts yet.</div>';
}

// ---------- actions ----------
on('train-sub', el => { sub = el.dataset.sub; editMode = false; changed(); });
on('goto-workout', () => { sub = 'today'; location.hash = '#train'; changed(); });
on('goto-train', () => { sub = 'today'; location.hash = '#train'; });
on('start-session', async el => {
  const existing = S.workouts.find(w => !w.done);
  if (existing && existing.date === today()) {
    if (!(await confirmSheet({ title: 'Replace workout in progress?', message: `${esc(existing.name)} is still open. Starting a new session discards it.`, ok: 'Discard and start', danger: true }))) return;
    await remove('workouts', existing.id);
  } else if (existing) {
    // stale unfinished draft from a previous day: close it out if anything was logged, else drop it
    if (existing.exercises.some(e => validSets(e).length)) await save('workouts', { ...existing, done: true, finishedAt: Date.now() });
    else await remove('workouts', existing.id);
  }
  const w = newWorkout(el.dataset.sid);
  await save('workouts', w);
  activeId = w.id; sub = 'today'; editMode = false;
  if (location.hash !== '#train') location.hash = '#train'; else changed();
});
on('open-workout', el => { activeId = el.dataset.id; sub = 'today'; editMode = false; location.hash = '#train'; changed(); });
on('toggle-edit', () => { editMode = !editMode; changed(); });
on('same-as-last', el => {
  const w = activeWorkout(); const i = +el.dataset.i; const ex = w.exercises[i];
  const last = lastPerformance(ex.exId, w.date, w.id);
  if (!last) return;
  ex.sets = last.sets.map(s => ({ w: String(num(s.w)), r: String(num(s.r)) }));
  save('workouts', w); changed();
});
on('copy-prev-set', el => {
  const row = el.closest('.set-row'); const w = activeWorkout();
  const i = +row.dataset.ex, j = +row.dataset.set; const ex = w.exercises[i];
  const last = lastPerformance(ex.exId, w.date, w.id);
  const p = last && last.sets[j]; if (!p) return;
  ex.sets[j] = { w: String(num(p.w)), r: String(num(p.r)) };
  $('input[data-f="w"]', row).value = ex.sets[j].w; $('input[data-f="r"]', row).value = ex.sets[j].r;
  save('workouts', w); refreshBeat(w, i);
});
on('set-add', el => { const w = activeWorkout(); const ex = w.exercises[+el.dataset.i]; const l = ex.sets[ex.sets.length - 1] || {}; ex.sets.push({ w: l.w || '', r: '' }); save('workouts', w); changed(); });
on('set-del', el => { const w = activeWorkout(); const ex = w.exercises[+el.dataset.i]; if (ex.sets.length > 1) ex.sets.pop(); save('workouts', w); changed(); });
on('ex-move', el => { const w = activeWorkout(); const i = +el.dataset.i, j = i + +el.dataset.d; const a = w.exercises; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save('workouts', w); changed(); });
on('ex-remove', el => { const w = activeWorkout(); w.exercises.splice(+el.dataset.i, 1); save('workouts', w); changed(); });
on('ex-add', () => { const w = activeWorkout(); openExercisePicker(id => { w.exercises.push({ exId: id, sets: Array.from({ length: exInfo(id).sets || 3 }, () => ({ w: '', r: '' })) }); save('workouts', w); changed(); }); });
on('save-template', async () => {
  const w = activeWorkout(); const ss = JSON.parse(JSON.stringify(sessions()));
  if (!ss[w.sessionId]) return;
  ss[w.sessionId].ex = w.exercises.map(e => e.exId);
  await saveSessions(ss); toast(`${w.name} template updated`);
});
on('edit-template', openTemplateEditor);
on('bike', el => { const w = activeWorkout(); w.bike = +el.dataset.m; save('workouts', w); changed(); });
on('finish-workout', async () => {
  const w = activeWorkout(); clearTimeout(saveTimer);
  const logged = w.exercises.filter(e => validSets(e).length);
  if (!logged.length) { toast('Log at least one set first'); return; }
  const wasDone = w.done;
  w.done = true; w.finishedAt = w.finishedAt || Date.now();
  await save('workouts', w);
  stopRest();
  const beats = logged.filter(e => exerciseBeats(e, lastPerformance(e.exId, w.date, w.id))).length;
  activeId = null; editMode = false;
  toast(wasDone ? 'Workout updated' : `${w.name} done. Beat last time on ${beats} of ${logged.length}.${num(w.bike) ? '' : ' Bike not logged.'}`, 3500);
  changed();
});
on('discard-workout', async () => {
  const w = activeWorkout();
  if (!(await confirmSheet({ title: w.done ? 'Delete workout?' : 'Discard workout?', message: 'This removes it permanently.', ok: 'Delete', danger: true }))) return;
  await remove('workouts', w.id); activeId = null; editMode = false; stopRest(); changed();
});
on('ex-chart', el => openExerciseChart(el.dataset.ex));
on('vol-week', el => { volWeekOffset = Math.min(0, volWeekOffset + +el.dataset.n); changed(); });
on('cardio-log', async el => {
  const pane = el.closest('[data-pane]');
  const type = $('[data-ctype] .on', pane).dataset.t;
  const min = num($('[data-cmin]', pane).value);
  if (min <= 0) { toast('Enter minutes'); return; }
  await save('cardio', { id: uid(), date: $('[data-cdate]', pane).value || today(), type, min, km: num($('[data-ckm]', pane).value) || null });
  toast('Cardio logged'); changed();
});
on('cardio-del', async el => { await remove('cardio', el.dataset.id); changed(); });
