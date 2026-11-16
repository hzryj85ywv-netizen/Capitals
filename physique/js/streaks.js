import { S, getKV } from './db.js';
import { today, addDays, range, dayLetter, weekStart, diffDays } from './util.js';
import { dayTotals, isLoggedDay, proteinFloor, sessionFor, sessions, targets } from './state.js';

// A "consistent day" = food logged (>= half the calorie target), protein floor hit,
// and the planned session completed (rest days only need the first two).

export function firstDay() {
  const install = getKV('installDate', today());
  const dates = S.entries.map(e => e.date).concat(S.workouts.map(w => w.date));
  const earliest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : install;
  return earliest < install ? earliest : install;
}

export function dayStatus(k) {
  const t = dayTotals(k);
  const logged = isLoggedDay(t);
  const protein = t.protein >= proteinFloor();
  const sid = sessionFor(k);
  const trainingDay = !!sid;
  const trained = S.workouts.some(w => w.date === k && w.done);
  const trainOk = !trainingDay || trained;
  const consistent = logged && protein && trainOk;
  const anything = t.count > 0 || trained;
  return { k, t, logged, protein, trainingDay, trained, trainOk, consistent, anything, sessionId: sid };
}

function streakBack(test, opts = {}) {
  const start = firstDay();
  let k = today();
  let n = 0;
  const st = dayStatus(k);
  // Today only counts once satisfied; an unfinished today never breaks a streak.
  if (!test(st)) k = addDays(k, -1);
  while (k >= start) {
    const s = dayStatus(k);
    if (opts.skip && opts.skip(s)) { k = addDays(k, -1); continue; }
    if (!test(s)) break;
    n++;
    k = addDays(k, -1);
  }
  return n;
}

function bestRun(test, opts = {}) {
  const days = range(firstDay(), today());
  let best = 0, cur = 0;
  for (const k of days) {
    const s = dayStatus(k);
    if (opts.skip && opts.skip(s)) continue;
    if (test(s)) { cur++; best = Math.max(best, cur); } else if (k !== today()) cur = 0;
  }
  return best;
}

export function streaks() {
  const consistency = streakBack(s => s.consistent);
  const logging = streakBack(s => s.logged);
  const protein = streakBack(s => s.protein);
  const training = streakBack(s => s.trained, { skip: s => !s.trainingDay && !s.trained });
  const best = Math.max(bestRun(s => s.consistent), consistency);
  return { consistency, logging, protein, training, best };
}

export function weekDots(refKey = today()) {
  const ws = weekStart(refKey);
  const t = today();
  return range(ws, addDays(ws, 6)).map(k => {
    if (k > t) return { k, letter: dayLetter(k), state: 'future' };
    const s = dayStatus(k);
    let state = s.consistent ? 'hit' : (s.anything ? 'partial' : 'miss');
    if (k === t && !s.consistent) state = s.anything ? 'partial' : '';
    if (k < firstDay()) state = '';
    return { k, letter: dayLetter(k), state, today: k === t };
  });
}

// What's left today to keep the streak alive.
export function todayChecklist() {
  const s = dayStatus(today());
  const tg = targets();
  const items = [
    { done: s.logged, text: s.logged ? 'Food logged' : `Log a full day (${Math.round(tg.kcal * 0.5).toLocaleString()}+ kcal)` },
    { done: s.protein, text: s.protein ? `Protein ${Math.round(s.t.protein)}g — hit` : `Protein ${Math.round(s.t.protein)} / ${proteinFloor()}g` },
  ];
  if (s.trainingDay) {
    const name = (sessions()[s.sessionId] || {}).name || 'Session';
    items.push({ done: s.trained, text: s.trained ? `${name} done` : `Complete ${name}` });
  } else {
    items.push({ done: true, text: s.trained ? 'Extra session done' : 'Rest day — no session needed' });
  }
  return { items, consistent: s.consistent };
}

const MILESTONES = {
  3: 'Three days. Small, but this is how it starts.',
  7: 'One full week on plan. Most people never string one together.',
  14: 'Two weeks straight. The habit is starting to run itself.',
  21: 'Three weeks. This is the point where results stop being luck.',
  28: 'Four weeks without a gap. That is a real block of training and eating.',
  42: 'Six weeks. Keep the standard exactly where it is.',
  56: 'Eight weeks. A full phase, done properly.',
  84: 'Twelve weeks unbroken.',
  100: '100 days. This is now just how you live.',
};
export function streakMessage(st) {
  const n = st.consistency;
  if (MILESTONES[n]) return MILESTONES[n];
  if (n === 0) {
    const y = dayStatus(addDays(today(), -1));
    if (y.k >= firstDay() && y.anything && !y.consistent) {
      const why = [];
      if (!y.logged) why.push('food not fully logged');
      if (!y.protein) why.push(`protein ${Math.round(y.t.protein)}g`);
      if (!y.trainOk) why.push('session missed');
      return `Streak broke yesterday: ${why.join(', ')}. Start again today.`;
    }
    return 'Log your food, hit protein, train if scheduled. That is one day.';
  }
  const next = Object.keys(MILESTONES).map(Number).find(m => m > n);
  return next ? `${next - n} more ${next - n === 1 ? 'day' : 'days'} to ${next}. Best: ${st.best}.` : `Best: ${st.best}.`;
}

export function daysTracked() { return diffDays(today(), firstDay()) + 1; }
