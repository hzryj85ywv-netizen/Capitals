import { S, getKV, setKV, save, uid } from './db.js';
import { today, addDays, diffDays, weekday, hourOf, sum, r0 } from './util.js';

// ---------- exercise library ----------
// muscles: primary = 1 set, secondary = 0.5 set for weekly volume.
export const MUSCLES = ['Chest', 'Back', 'Side delts', 'Rear delts', 'Front delts', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Traps', 'Neck', 'Forearms', 'Core'];
// Weekly hard-set ranges commonly used as a working target (roughly 10-20 for most muscles).
export const VOLUME_RANGE = {
  Chest: [10, 20], Back: [12, 22], 'Side delts': [10, 20], 'Rear delts': [8, 16], 'Front delts': [0, 12],
  Biceps: [8, 16], Triceps: [8, 16], Quads: [12, 20], Hamstrings: [10, 16], Glutes: [8, 16], Calves: [10, 16],
  Traps: [4, 12], Neck: [4, 10], Forearms: [0, 10], Core: [0, 10],
};

const E = (name, muscles, sets, reps, opts = {}) => ({ name, muscles, sets, reps, ...opts });
export const BUILTIN_EXERCISES = {
  bench: E('Flat barbell bench press', { Chest: 1, Triceps: 0.5, 'Front delts': 0.5 }, 3, '6-8'),
  inclineDb: E('Incline DB press', { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 }, 3, '8-10'),
  machineChest: E('Machine chest press', { Chest: 1, Triceps: 0.5 }, 3, '10-12'),
  cableLateral: E('Cable lateral raise', { 'Side delts': 1 }, 4, '12-15'),
  cableFly: E('Cable flye', { Chest: 1 }, 3, '12-15'),
  pushdown: E('Triceps pushdown', { Triceps: 1 }, 3, '10-12'),
  weightedPullup: E('Weighted pull-up', { Back: 1, Biceps: 0.5 }, 3, '6-8', { bw: true }),
  bbRow: E('Barbell row', { Back: 1, 'Rear delts': 0.5, Biceps: 0.5 }, 3, '8-10'),
  latPulldown: E('Lat pulldown', { Back: 1, Biceps: 0.5 }, 3, '10-12'),
  csRow: E('Chest-supported row', { Back: 1, 'Rear delts': 0.5 }, 3, '10-12'),
  facePull: E('Face pull', { 'Rear delts': 1, Traps: 0.5 }, 3, '15-20'),
  bbCurl: E('Barbell curl', { Biceps: 1, Forearms: 0.5 }, 3, '8-10'),
  hammerCurl: E('Hammer curl', { Biceps: 1, Forearms: 0.5 }, 3, '10-12'),
  hackSquat: E('Hack squat', { Quads: 1, Glutes: 0.5 }, 3, '6-10'),
  bss: E('Bulgarian split squat', { Quads: 1, Glutes: 1 }, 3, '8-10 /leg'),
  legPress: E('Leg press', { Quads: 1, Glutes: 0.5 }, 3, '10-12'),
  legExt: E('Leg extension', { Quads: 1 }, 3, '12-15'),
  standingCalf: E('Standing calf raise', { Calves: 1 }, 4, '10-15'),
  inclineBb: E('Incline barbell press', { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 }, 3, '6-8'),
  flatDb: E('Flat DB press', { Chest: 1, Triceps: 0.5 }, 3, '8-10'),
  dips: E('Dips', { Chest: 1, Triceps: 1 }, 3, '8-12', { bw: true }),
  lateralRaise: E('DB lateral raise', { 'Side delts': 1 }, 4, '12-15'),
  rearDeltFly: E('Rear delt flye', { 'Rear delts': 1 }, 3, '15-20'),
  skullCrusher: E('EZ-bar skull crusher', { Triceps: 1 }, 3, '10-12'),
  deadlift: E('Deadlift / rack pull', { Back: 1, Hamstrings: 0.5, Glutes: 0.5, Traps: 0.5 }, 3, '4-6'),
  shrug: E('Shrug', { Traps: 1 }, 3, '10-12'),
  rearDeltCable: E('Rear delt cable flye', { 'Rear delts': 1 }, 3, '15-20'),
  preacher: E('Preacher curl', { Biceps: 1 }, 3, '10-12'),
  neckCurl: E('Neck curl', { Neck: 1 }, 2, '15-20'),
  neckExt: E('Neck extension', { Neck: 1 }, 2, '15-20'),
  rdl: E('Romanian deadlift', { Hamstrings: 1, Glutes: 1 }, 3, '6-8'),
  frontSquat: E('Front squat', { Quads: 1, Glutes: 0.5, Core: 0.5 }, 3, '6-8'),
  hipThrust: E('Hip thrust', { Glutes: 1, Hamstrings: 0.5 }, 3, '8-10'),
  legCurl: E('Leg curl', { Hamstrings: 1 }, 3, '10-12'),
  walkingLunge: E('Walking lunge', { Quads: 1, Glutes: 1 }, 2, '10 /leg'),
  seatedCalf: E('Seated calf raise', { Calves: 1 }, 4, '12-15'),
};

export const DEFAULT_SESSIONS = {
  pushA: { name: 'Push A', ex: ['bench', 'inclineDb', 'machineChest', 'cableLateral', 'cableFly', 'pushdown'] },
  pullA: { name: 'Pull A', ex: ['weightedPullup', 'bbRow', 'latPulldown', 'csRow', 'facePull', 'bbCurl', 'hammerCurl'] },
  legsA: { name: 'Legs A', ex: ['hackSquat', 'bss', 'legPress', 'legExt', 'standingCalf'], legs: true },
  pushB: { name: 'Push B', ex: ['inclineBb', 'flatDb', 'dips', 'lateralRaise', 'rearDeltFly', 'skullCrusher'] },
  pullB: { name: 'Pull B', ex: ['deadlift', 'csRow', 'latPulldown', 'shrug', 'rearDeltCable', 'preacher', 'neckCurl', 'neckExt'] },
  legsB: { name: 'Legs B', ex: ['rdl', 'frontSquat', 'hipThrust', 'legCurl', 'walkingLunge', 'seatedCalf'], legs: true },
};
export const SESSION_ORDER = ['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'];

// weekday (0=Sun) -> session id
export const DEFAULT_SCHEDULE = { 1: 'pushA', 2: 'pullA', 3: 'legsA', 4: 'pushB', 5: 'pullB', 6: 'legsB', 0: null };

export function exercises() {
  return { ...BUILTIN_EXERCISES, ...getKV('customExercises', {}) };
}
export function exInfo(id) { return exercises()[id] || { name: id, muscles: {}, sets: 3, reps: '8-12' }; }
export function sessions() {
  const saved = getKV('sessions', null);
  return saved || DEFAULT_SESSIONS;
}
export async function saveSessions(s) { await setKV('sessions', s); }
export function schedule() { return getKV('schedule', DEFAULT_SCHEDULE); }
export function sessionFor(dateKey) { return schedule()[weekday(dateKey)] || null; }

// ---------- settings & phase ----------
export function settings() {
  return getKV('settings', null);
}
export async function saveSettings(s) { await setKV('settings', s); }

export function macrosFromKcal(kcal, protein, fat) {
  return Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
}

export function defaultCutPhase(start, startWeight) {
  return {
    id: uid(), type: 'cut', name: '8-week cut', start, weeks: 8,
    kcal: 2600, protein: 200, fat: 75, carbs: macrosFromKcal(2600, 200, 75),
    rateTarget: -0.3, goalWeight: 72, startWeight: startWeight || 74,
    adjustments: [],
  };
}

export function phase() { const s = settings(); return s ? s.phase : null; }
export function targets() {
  const p = phase();
  return p ? { kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs } : { kcal: 2600, protein: 200, fat: 75, carbs: 281 };
}
export function phaseInfo(dateKey = today()) {
  const p = phase();
  if (!p) return null;
  const total = p.weeks * 7;
  const dayN = diffDays(dateKey, p.start) + 1; // day 1 = start date
  const end = addDays(p.start, total - 1);
  const left = Math.max(0, diffDays(end, dateKey));
  return { p, total, day: Math.max(0, Math.min(dayN, total)), rawDay: dayN, end, left, week: Math.ceil(Math.max(dayN, 1) / 7), done: dayN > total, started: dayN >= 1 };
}
// Protein "hit" floor used across streaks and the coach (target minus 20g, i.e. 180g on a 200g target).
export function proteinFloor() { return Math.min(180, targets().protein - 20); }

// ---------- food helpers ----------
export const MEALS = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'dinner', name: 'Dinner' },
  { id: 'snacks', name: 'Snacks' },
];
export function defaultMeal(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 17) return 'snacks';
  if (h < 21.5) return 'dinner';
  return 'snacks';
}
export function entryMacros(e) {
  const f = (e.grams || 0) / 100;
  const p = e.per100 || {};
  return { kcal: (p.kcal || 0) * f, protein: (p.protein || 0) * f, carbs: (p.carbs || 0) * f, fat: (p.fat || 0) * f, fiber: (p.fiber || 0) * f };
}
export function entriesOn(dateKey) { return S.entries.filter(e => e.date === dateKey); }
export function dayTotals(dateKey) {
  const es = entriesOn(dateKey);
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, count: es.length, fv: 0, lateKcal: 0, timedKcal: 0 };
  for (const e of es) {
    const m = entryMacros(e);
    t.kcal += m.kcal; t.protein += m.protein; t.carbs += m.carbs; t.fat += m.fat; t.fiber += m.fiber;
    if (e.fv) t.fv++;
    if (!e.copied && e.createdAt) {
      t.timedKcal += m.kcal;
      if (hourOf(e.createdAt) >= 18) t.lateKcal += m.kcal;
    }
  }
  return t;
}
// A day counts as "logged" once a realistic day of food is in: at least half the calorie target.
export function isLoggedDay(t) { return t.kcal >= targets().kcal * 0.5; }

// ---------- training helpers ----------
export function workoutsOn(dateKey) { return S.workouts.filter(w => w.date === dateKey); }
export function completedWorkouts() { return S.workouts.filter(w => w.done); }
export function e1rm(w, r) { if (!r) return 0; const load = w || 0; return r === 1 ? load : load * (1 + r / 30); }
export function setScore(s) { return e1rm(num0(s.w), num0(s.r)); }
function num0(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
export function validSets(ex) { return (ex.sets || []).filter(s => num0(s.r) > 0); }
export function exerciseStats(ex, bodyweight = 0) {
  const sets = validSets(ex);
  const bw = exInfo(ex.exId).bw ? bodyweight : 0;
  let best = 0, vol = 0, topW = 0;
  for (const s of sets) {
    const w = num0(s.w) + bw, r = num0(s.r);
    best = Math.max(best, e1rm(w, r));
    vol += w * r;
    topW = Math.max(topW, num0(s.w));
  }
  return { best, vol, topW, sets: sets.length, reps: sum(sets, s => num0(s.r)) };
}
// Last completed performance of an exercise strictly before a date (or excluding a workout id).
export function lastPerformance(exId, beforeDate, excludeId) {
  const ws = S.workouts
    .filter(w => w.done && w.id !== excludeId && w.date <= beforeDate && w.exercises.some(e => e.exId === exId && validSets(e).length))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.finishedAt || 0) - (a.finishedAt || 0)));
  if (!ws.length) return null;
  const w = ws[0];
  const ex = w.exercises.find(e => e.exId === exId && validSets(e).length);
  return { date: w.date, sets: validSets(ex), workoutId: w.id };
}
export function currentBodyweight() {
  const ws = [...S.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (ws.length) return ws[0].kg;
  const p = phase();
  return p ? p.startWeight : 74;
}
// Did set beat the comparable set from last time? (more weight at >= reps, or more reps at >= weight)
export function setBeats(s, prev) {
  if (!prev) return false;
  const w = num0(s.w), r = num0(s.r), pw = num0(prev.w), pr = num0(prev.r);
  if (!r) return false;
  return (w > pw && r >= pr) || (w >= pw && r > pr);
}
export function exerciseBeats(ex, last) {
  if (!last) return false;
  const now = exerciseStats(ex), then = exerciseStats({ exId: ex.exId, sets: last.sets });
  if (!now.sets) return false;
  return now.best > then.best + 0.01 || (now.best >= then.best - 0.01 && now.vol > then.vol);
}

export function cardioOn(dateKey) { return S.cardio.filter(c => c.date === dateKey); }

export { r0 };
