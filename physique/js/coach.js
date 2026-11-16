import { S } from './db.js';
import { today, addDays, range, weekStart, weekday, fmtDate, dayName, r0, r1, sum, plural, esc, on, changed, ICON, sign } from './util.js';
import {
  dayTotals, isLoggedDay, targets, proteinFloor, phaseInfo, phase, sessions, sessionFor, exInfo, validSets, exerciseStats,
  exerciseBeats, lastPerformance, currentBodyweight,
} from './state.js';
import { firstDay } from './streaks.js';
import { weekPlan, weekCardio } from './train.js';
import { weightAnalysis, weighInState } from './progress.js';

const LEVEL_ORDER = { high: 0, med: 1, info: 2, good: 3 };
const yesterday = () => addDays(today(), -1);

// Logged days walking back from yesterday (unlogged days stop the walk).
function consecutive(pred, max = 21) {
  let c = 0;
  const vals = [];
  for (let k = yesterday(), i = 0; i < max && k >= firstDay(); k = addDays(k, -1), i++) {
    const t = dayTotals(k);
    if (!isLoggedDay(t) || !pred(t)) break;
    c++; vals.push(t);
  }
  return { c, vals };
}
function recentLogged(n, within = 10) {
  const out = [];
  for (let k = yesterday(), i = 0; i < within && out.length < n && k >= firstDay(); k = addDays(k, -1), i++) {
    const t = dayTotals(k);
    if (isLoggedDay(t)) out.push({ k, t });
  }
  return out;
}
const avg = (arr, f) => (arr.length ? sum(arr, f) / arr.length : 0);

// ---------- nutrition ----------
function nutritionNotes() {
  const N = [];
  const tg = targets();
  const floor = proteinFloor();
  const p = phase();
  const deficitPerDay = p && p.rateTarget < 0 ? (Math.abs(p.rateTarget) * 7700) / 7 : 0;

  const lowP = consecutive(t => t.protein < floor);
  if (lowP.c >= 2) {
    N.push({ level: 'high', area: 'Nutrition', title: `Protein under ${floor}g for ${lowP.c} days running`,
      body: `Averaging ${r0(avg(lowP.vals, t => t.protein))}g against a ${tg.protein}g target. In a deficit this is the biggest risk to the muscle you are trying to keep — more than missing a session. Get 40–50g at each of 4–5 meals: a 50g breakfast and a shake makes the rest easy.`,
      fix: `Hit ${floor}g+ protein every day: 4–5 feedings of 40–50g, starting at breakfast.` });
  }

  const under = consecutive(t => t.kcal < tg.kcal - 300);
  if (under.c >= 3) {
    N.push({ level: 'high', area: 'Nutrition', title: `Under ${fmtK(tg.kcal - 300)} kcal for ${under.c} days`,
      body: `Averaging ${fmtK(avg(under.vals, t => t.kcal))} kcal on a ${fmtK(tg.kcal)} target. Eating under the plan does not speed up the cut in a useful way: it costs training performance and muscle, and it usually ends in a rebound. If the log is incomplete, log properly; if it is accurate, eat the food.`,
      fix: `Eat to ${fmtK(tg.kcal)} kcal. Under-eating is not extra progress.` });
  }

  const last7 = recentLogged(7, 7);
  if (last7.length >= 4) {
    const over = last7.filter(d => d.t.kcal > tg.kcal + 100);
    const drift = avg(last7, d => d.t.kcal) - tg.kcal;
    if (over.length >= 4 && drift > 75) {
      const pct = deficitPerDay ? Math.min(100, (drift / deficitPerDay) * 100) : 0;
      const newRate = p && p.rateTarget < 0 ? Math.max(0, Math.abs(p.rateTarget) - (drift * 7) / 7700) : null;
      N.push({ level: drift > 200 ? 'high' : 'med', area: 'Nutrition', title: `Calories drifting +${r0(drift)} per day`,
        body: `Over target on ${over.length} of the last ${last7.length} logged days, averaging +${r0(drift)} kcal/day (about ${fmtK(drift * 7)} a week).${deficitPerDay ? ` That cancels roughly ${r0(pct)}% of the planned deficit, so expect about ${r1(newRate)} kg/week instead of ${Math.abs(p.rateTarget)}.` : ''} Find the one or two items doing it — usually oils, sauces, snacks or drinks — rather than cutting meals.`,
        fix: `Pull calories back to ${fmtK(tg.kcal)}: find the ${r0(drift)} kcal/day of drift and remove it.` });
    }
  }

  const last5 = recentLogged(5, 7);
  const lowFat = last5.filter(d => d.t.fat < 60);
  if (lowFat.length >= 3) {
    N.push({ level: 'med', area: 'Nutrition', title: `Fat under 60g on ${lowFat.length} of the last ${last5.length} days`,
      body: `Your target is ${tg.fat}g. Diets that sit very low in fat for long stretches are associated with lower testosterone, and a cut already pushes hormones the wrong way. Keep fat at or near target and take the calories from carbs if something has to give: eggs, oily fish, olive oil, nuts.`,
      fix: `Keep fat at ${tg.fat}g; take calorie cuts from carbs, not fat.` });
  }

  const noFV = consecutive(t => t.fv === 0);
  if (noFV.c >= 3) {
    N.push({ level: 'med', area: 'Nutrition', title: `No fruit or veg logged for ${noFV.c} days`,
      body: `Fibre keeps you fuller on fewer calories, and fruit and veg cover potassium, magnesium, folate and vitamin C that protein foods don't. Two pieces of fruit and a fist of veg at two meals costs about 200 kcal.`,
      fix: 'Two pieces of fruit and veg at two meals, every day.' });
  }

  const timed = last5.filter(d => d.t.timedKcal > 0);
  const late = timed.filter(d => d.t.lateKcal / d.t.timedKcal >= 0.6);
  if (late.length >= 3) {
    N.push({ level: 'info', area: 'Nutrition', title: `Most food logged after 6pm on ${late.length} of the last ${timed.length} days`,
      body: 'Either you eat most of your food late, or you log it all at night from memory. Late-heavy eating makes the 4–5 protein feedings impossible and leaves you training underfed; end-of-day logging misses things. Front-load: a big breakfast and lunch, and log as you eat.',
      fix: 'Front-load the day: at least half your calories and protein before 3pm, logged as you eat.' });
  }

  // gaps in logging
  const from = addDays(today(), -7) < firstDay() ? firstDay() : addDays(today(), -7);
  const span = from <= yesterday() ? range(from, yesterday()) : [];
  const unlogged = span.filter(k => !isLoggedDay(dayTotals(k)));
  if (span.length >= 3 && unlogged.length >= 2) {
    N.push({ level: 'med', area: 'Nutrition', title: `${unlogged.length} of the last ${span.length} days not fully logged`,
      body: `${unlogged.map(k => dayName(k)).join(', ')}. The coach can only judge what you log, and unlogged days are where cuts quietly stall. Saved meals and Copy yesterday make a full day under a minute.`,
      fix: 'Log every day, including weekends. Use saved meals for anything you eat twice.' });
  }

  // live, today
  const t = dayTotals(today());
  const h = new Date().getHours();
  if (h >= 15 && t.count && tg.protein - t.protein > 100) {
    N.push({ level: 'info', area: 'Today', title: `${r0(tg.protein - t.protein)}g protein still to go`,
      body: `It's ${h}:00 and you're at ${r0(t.protein)}g. That needs two or three proper feedings before bed — plan them now rather than finding out at 10pm.` });
  }
  if (h >= 20 && t.count && tg.kcal - t.kcal > 700) {
    N.push({ level: 'info', area: 'Today', title: `${fmtK(tg.kcal - t.kcal)} kcal left at ${h}:00`,
      body: 'If that is real, eat a proper meal — a big shortfall today costs tomorrow’s session. If you just haven’t logged yet, log it now while you remember.' });
  }

  const good5 = recentLogged(5, 6);
  if (good5.length >= 5 && good5.every(d => d.t.protein >= floor)) {
    N.push({ level: 'good', area: 'Nutrition', title: 'Protein hit five days straight', body: 'This is the single most protective habit in a cut. Keep it boring and keep it daily.' });
  }
  return N;
}
const fmtK = n => r0(n).toLocaleString('en-IE');

// ---------- training ----------
function weekHistory(weeks = 4) {
  // planned vs done per session over complete past weeks plus current week to date
  const out = [];
  const ws0 = weekStart(today());
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(ws0, -7 * i);
    if (addDays(ws, 6) < firstDay()) break;
    const days = range(ws, addDays(ws, 6)).filter(k => k >= firstDay() && k < today());
    const done = S.workouts.filter(w => w.done && w.date >= ws && w.date <= addDays(ws, 6));
    const doneIds = new Set(done.map(w => w.sessionId));
    for (const k of days) {
      const sid = sessionFor(k);
      if (sid) out.push({ k, sid, done: doneIds.has(sid), legs: !!(sessions()[sid] || {}).legs || /leg/i.test(sid) });
    }
  }
  return out;
}

function plateaus() {
  const bw = currentBodyweight();
  const byEx = {};
  for (const w of S.workouts) {
    if (!w.done) continue;
    for (const ex of w.exercises) {
      if (!validSets(ex).length) continue;
      (byEx[ex.exId] = byEx[ex.exId] || []).push({ date: w.date, best: exerciseStats(ex, bw).best });
    }
  }
  const flat = [];
  for (const [id, hist] of Object.entries(byEx)) {
    hist.sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = hist[hist.length - 1];
    if (latest.date < addDays(today(), -10)) continue; // not trained recently
    const cutoff = addDays(latest.date, -14);
    const older = hist.filter(x => x.date <= cutoff);
    if (!older.length) continue;
    const ref = older[older.length - 1];
    const recentBest = Math.max(...hist.filter(x => x.date > cutoff).map(x => x.best));
    if (recentBest <= ref.best * 1.005) flat.push({ id, name: exInfo(id).name, change: ((latest.best - ref.best) / ref.best) * 100 });
  }
  return flat;
}

function trainingNotes() {
  const N = [];
  const ss = sessions();
  const plan = weekPlan();
  const doneN = plan.planned.filter(p => p.done).length;
  if (plan.missed.length) {
    N.push({ level: 'med', area: 'Training', title: `Missed this week: ${plan.missed.map(m => `${dayName(m.k)} ${(ss[m.sid] || {}).name || m.sid}`).join(', ')}`,
      body: `${doneN} of ${plan.planned.length} planned sessions done so far. If you can, fit the missed one into the rest day rather than doubling up — and don't drop the leg day if it's the one missed.`,
      fix: 'Complete all six sessions. If a day is lost, slot it into Sunday.' });
  }

  const hist = weekHistory(4);
  const legs = hist.filter(h => h.legs), other = hist.filter(h => !h.legs);
  if (legs.length >= 2 && other.length >= 4) {
    const lr = legs.filter(h => h.done).length / legs.length, or = other.filter(h => h.done).length / other.length;
    const missedLegs = legs.filter(h => !h.done).length;
    if (missedLegs >= 1 && lr < or - 0.1) {
      N.push({ level: 'high', area: 'Training', title: 'You skip leg days more than anything else',
        body: `Last ${Math.ceil(hist.length / 6) || 1} weeks: ${r0(lr * 100)}% of leg sessions done vs ${r0(or * 100)}% of upper sessions (${plural(missedLegs, 'leg day')} missed). Legs are your lagging body part and you're giving them the least work. Train legs first in the week if that's what it takes.`,
        fix: 'Do both leg sessions every week, no exceptions — move one to Monday if needed.' });
    }
  }
  if (hist.length >= 6) {
    const rate = hist.filter(h => h.done).length / hist.length;
    N.push({ level: rate >= 0.9 ? 'good' : rate >= 0.75 ? 'info' : 'med', area: 'Training', title: `${r0(rate * 100)}% of planned sessions completed`,
      body: `${hist.filter(h => h.done).length} of ${hist.length} planned sessions over the last ${Math.min(4, Math.ceil(hist.length / 6))} weeks.${rate < 0.85 ? ' Consistency beats any program detail; a missed session is a week without that stimulus.' : ''}` });
  }

  const flat = plateaus();
  if (flat.length) {
    const last5 = recentLogged(5, 7);
    const tg = targets();
    N.push({ level: 'med', area: 'Training', title: `Flat or down 2+ weeks: ${flat.slice(0, 4).map(f => f.name).join(', ')}${flat.length > 4 ? ` +${flat.length - 4} more` : ''}`,
      body: `This means eat more, not train harder. ${last5.length ? `Last ${last5.length} logged days: ${fmtK(avg(last5, d => d.t.kcal))} kcal and ${r0(avg(last5, d => d.t.protein))}g protein against ${fmtK(tg.kcal)} / ${tg.protein}g. ` : ''}If you're under either, fix that first. If both are on target, some stalling is the cut doing its job — hold the weights and rep quality, sleep more, and don't add sets.`,
      fix: 'Eat the full target and sleep 8 hours before changing anything in training.' });
  }

  // calves & BSS
  const recent = S.workouts.filter(w => w.done && w.date >= addDays(today(), -8));
  const legsDone = recent.filter(w => (ss[w.sessionId] || {}).legs);
  if (legsDone.length) {
    const calfSets = sum(recent, w => sum(w.exercises.filter(e => (exInfo(e.exId).muscles || {}).Calves), e => validSets(e).length));
    if (!calfSets) N.push({ level: 'med', area: 'Training', title: 'No calf work in the last week',
      body: 'Calves respond slowly and genetics set a lot of their ceiling, which is exactly why skipping them guarantees nothing happens. 4 sets, full stretch at the bottom with a pause, every leg day.',
      fix: 'Don’t skip calves: 4 hard sets with a paused stretch each leg day.' });
    const legsA = recent.filter(w => w.sessionId === 'legsA');
    const bssSets = sum(legsA, w => sum(w.exercises.filter(e => e.exId === 'bss'), e => validSets(e).length));
    if (legsA.length && !bssSets) N.push({ level: 'med', area: 'Training', title: 'Bulgarian split squats skipped',
      body: 'They are the exercise people drop because they are unpleasant, and that is exactly why they work: a deep stretch on the quads and glutes under load, one leg at a time. They stay in.',
      fix: 'Do the Bulgarian split squats on Legs A, every time.' });
  }
  if (!(ss.legsA && ss.legsA.ex.includes('bss'))) N.push({ level: 'med', area: 'Training', title: 'Bulgarian split squats removed from Legs A', body: 'For a lagging lower body, removing your best unilateral quad and glute movement is the wrong call. Put it back in the template.' });

  // cardio
  const wd = weekday(today());
  const wc = weekCardio();
  if ((wd === 0 || wd >= 4) && (wc.runs < 2 || wc.sprints < 1)) {
    const need = [wc.runs < 2 ? `${2 - wc.runs} easy run${2 - wc.runs > 1 ? 's' : ''}` : '', wc.sprints < 1 ? 'the sprint session' : ''].filter(Boolean).join(' and ');
    N.push({ level: 'info', area: 'Training', title: `Cardio behind: ${need} still to do`, body: `${wc.runs}/2 runs and ${wc.sprints}/1 sprints this week. Keep easy runs genuinely easy (you can talk in full sentences) so they don't eat into leg recovery.` });
  }
  if (wc.sessions >= 2 && wc.bikeAfter < wc.sessions) {
    N.push({ level: 'info', area: 'Training', title: `Bike skipped after ${wc.sessions - wc.bikeAfter} of ${wc.sessions} sessions`, body: '10–15 easy minutes after lifting is cheap extra energy expenditure and cardio fitness without touching recovery. Log it on the workout screen.' });
  }

  const beats = recent.filter(w => w.date >= weekStart(today())).flatMap(w => w.exercises.map(e => exerciseBeats(e, lastPerformance(e.exId, w.date, w.id))));
  const nb = beats.filter(Boolean).length;
  if (beats.length >= 6 && nb / beats.length >= 0.4) N.push({ level: 'good', area: 'Training', title: `Beat last session on ${nb} of ${beats.length} lifts this week`, body: 'In a deficit, holding strength is the goal and beating it is a bonus. The food and sleep are working.' });
  return N;
}

// ---------- weight & phase ----------
function phaseNotes() {
  const N = [];
  const pi = phaseInfo();
  if (!pi) return N;
  const a = weightAnalysis();
  if (a.status && a.n >= 2) {
    const level = a.status === 'on track' ? 'good' : 'med';
    const what = a.status === 'on track' ? 'On track' : a.status === 'behind' ? 'Behind' : 'Ahead';
    const dir = a.target < 0 ? 'losing' : 'gaining';
    N.push({ level, area: 'Weight', title: `${what}: ${dir} ${r1(Math.abs(a.rate))} kg/week (target ${Math.abs(a.target)})`,
      body: `${a.rec}${a.delta ? ` That takes you to ${phase().kcal + a.delta} kcal.` : ''}${a.projected != null ? ` At this rate you finish the phase around ${r1(a.projected)} kg.` : ''}${a.status === 'ahead' && a.target < 0 ? ' Losing faster than planned costs muscle; slower is the point.' : ''}`,
      fix: a.delta ? `${a.delta > 0 ? 'Add' : 'Cut'} 150 kcal/day (Progress tab) and hold it for two weeks.` : null });
  }
  const wi = weighInState();
  if (wi.isDay && !wi.todays) N.push({ level: 'info', area: 'Weight', title: 'Weigh-in day', body: 'Weigh in this morning: after the toilet, before food, same scale. It is the only weigh-in that counts this week.' });

  if (pi.done) {
    N.push({ level: 'info', area: 'Phase', title: `${pi.p.name} complete`, body: 'The phase is finished. Set up the next phase in Settings — a lean bulk starts at roughly your current maintenance plus 150–250 kcal.' });
  } else if (pi.started) {
    const pct = r0((pi.day / pi.total) * 100);
    N.push({ level: 'info', area: 'Phase', title: `Day ${pi.day} of ${pi.total} — ${pi.left} days left`,
      body: `${pct}% through the ${pi.p.name.toLowerCase()}. Ends ${fmtDate(pi.end, { weekday: true })}.` });
    if (pi.left > 14) {
      const msgs = [
        `There are ${pi.left} days left in this phase. Do not change the plan before the last two weeks. You have switched plans every few weeks before; that is why progress reset. If the numbers are off, the fix is a 150 kcal adjustment, not a new plan.`,
        `${pi.left} days to go. Every new plan restarts the clock, and a cut only works if it is long enough for the trend to show. The plan is fine. Run it to ${fmtDate(pi.end)}.`,
        `Week ${pi.week} of ${pi.p.weeks}. If you feel the pull to switch, that is the plan working: hunger and flat days are what a deficit feels like. Switching now throws away ${pi.day} days of data the calorie adjustments depend on.`,
        `You are ${pi.day} days in with ${pi.left} left. The mirror and the scale will look the same for days at a time — that is normal and not a reason to change anything.`,
      ];
      N.push({ level: 'info', area: 'Phase', title: 'Stay on this plan', body: msgs[pi.day % msgs.length] });
    }
  } else {
    N.push({ level: 'info', area: 'Phase', title: `Phase starts ${fmtDate(pi.p.start, { weekday: true })}`, body: 'Use the days before it to get logging habits in place.' });
  }
  return N;
}

export function coachNotes() {
  return [...nutritionNotes(), ...trainingNotes(), ...phaseNotes()].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

// ---------- weekly summary ----------
export function weeklySummary(ws) {
  const we = addDays(ws, 6);
  const end = we < today() ? we : today();
  const days = range(ws < firstDay() ? firstDay() : ws, end).filter(k => k <= today());
  const closed = days.filter(k => k < today() || weekday(today()) === 0);
  const tg = targets();
  const floor = proteinFloor();
  const tots = closed.map(k => ({ k, t: dayTotals(k) }));
  const logged = tots.filter(d => isLoggedDay(d.t));
  const pHit = logged.filter(d => d.t.protein >= floor).length;
  const onCal = logged.filter(d => Math.abs(d.t.kcal - tg.kcal) <= 150).length;
  const avgK = avg(logged, d => d.t.kcal), avgP = avg(logged, d => d.t.protein);
  const fvDays = logged.filter(d => d.t.fv > 0).length;
  const plan = weekPlan(ws);
  const planned = plan.planned.filter(p => p.k <= end && p.k >= firstDay() && (p.k < today() || p.done));
  const done = planned.filter(p => p.done).length;
  const legsPlanned = planned.filter(p => (sessions()[p.sid] || {}).legs);
  const legsDone = legsPlanned.filter(p => p.done).length;
  const wos = S.workouts.filter(w => w.done && w.date >= ws && w.date <= we);
  const exs = wos.flatMap(w => w.exercises.filter(e => validSets(e).length).map(e => exerciseBeats(e, lastPerformance(e.exId, w.date, w.id))));
  const beats = exs.filter(Boolean).length;
  const wc = weekCardio(ws);
  const wgt = S.weights.filter(w => w.date >= ws && w.date <= we)[0];
  const prevW = [...S.weights].filter(w => w.date < ws).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  const well = [], slipped = [];
  const n = closed.length || 1;
  if (logged.length >= n - 0) well.push(`Logged every day (${logged.length}/${n}).`); else slipped.push({ p: 2, t: `Logged ${logged.length} of ${n} days.`, fix: 'Log every day, weekends included — use Copy yesterday and saved meals.' });
  if (logged.length) {
    if (pHit >= logged.length - 0 && pHit >= 4) well.push(`Protein hit on all ${pHit} logged days (avg ${r0(avgP)}g).`);
    else if (pHit < logged.length) slipped.push({ p: 0, t: `Protein hit on ${pHit} of ${logged.length} logged days (avg ${r0(avgP)}g).`, fix: `Hit ${floor}g every day: 40–50g at each of 4–5 meals.` });
    const drift = avgK - tg.kcal;
    if (Math.abs(drift) <= 100) well.push(`Calories on target: average ${fmtK(avgK)} kcal.`);
    else if (drift > 100) slipped.push({ p: 1, t: `Calories averaged ${fmtK(avgK)} (+${r0(drift)}/day, about ${fmtK(drift * 7)} over for the week).`, fix: `Cut the ${r0(drift)} kcal/day drift — find the extras, don't skip meals.` });
    else slipped.push({ p: 1, t: `Calories averaged ${fmtK(avgK)} (${r0(drift)}/day under).`, fix: `Eat the full ${fmtK(tg.kcal)}. Under-eating costs muscle and performance.` });
    if (fvDays < logged.length - 1) slipped.push({ p: 5, t: `Fruit or veg on only ${fvDays} of ${logged.length} days.`, fix: 'Two fruit and two veg portions daily.' });
  }
  if (planned.length) {
    if (done === planned.length) well.push(`All ${done} planned sessions done.`);
    else slipped.push({ p: legsDone < legsPlanned.length ? 0.5 : 1.5, t: `${done} of ${planned.length} sessions done${legsDone < legsPlanned.length ? `, including ${legsPlanned.length - legsDone} missed leg day${legsPlanned.length - legsDone > 1 ? 's' : ''}` : ''}.`, fix: legsDone < legsPlanned.length ? 'Both leg days, every week. Train them first if the week gets busy.' : 'All six sessions — slot any missed one into Sunday.' });
  }
  if (exs.length >= 5) {
    if (beats / exs.length >= 0.35) well.push(`Beat last session on ${beats} of ${exs.length} lifts.`);
    else if (beats / exs.length < 0.15) slipped.push({ p: 3, t: `Beat last session on only ${beats} of ${exs.length} lifts.`, fix: 'Eat the full target and protect sleep; use “same as last time” and add one rep.' });
  }
  if (wc.runs >= 2 && wc.sprints >= 1) well.push('Cardio done: both runs and the sprint session.');
  else if (closed.length >= 6) slipped.push({ p: 4, t: `Cardio: ${wc.runs}/2 runs, ${wc.sprints}/1 sprints.`, fix: 'Book the two easy runs and the sprint session into specific days.' });
  if (wgt && prevW) {
    const ch = wgt.kg - prevW.kg;
    const p = phase();
    const msg = `Weight ${sign(r1(ch))} kg (${prevW.kg} → ${wgt.kg}).`;
    if (p && Math.abs(ch - p.rateTarget) <= 0.15) well.push(msg); else slipped.push({ p: 3.5, t: `${msg} One week is noisy; read the trend on the Progress tab.`, fix: null });
  }
  slipped.sort((a, b) => a.p - b.p);
  const fix = (slipped.find(s => s.fix) || {}).fix || 'Nothing to fix. Repeat the week exactly.';
  return { ws, we, closed: closed.length, well, slipped: slipped.map(s => s.t), fix };
}

export function summaryCard(ws) {
  const s = weeklySummary(ws);
  if (!s.closed) return '<div class="card empty">No complete days in that week yet.</div>';
  return `<div class="card">
    <div class="card-h"><h2>Week of ${fmtDate(s.ws)}</h2><span class="meta">${s.we < today() || weekday(today()) === 0 ? 'Weekly summary' : 'So far'}</span></div>
    <div class="eyebrow good" style="margin-top:4px">What went well</div>
    <ul style="margin:6px 0 12px;padding-left:18px;font-size:14px">${s.well.length ? s.well.map(x => `<li>${esc(x)}</li>`).join('') : '<li class="muted">Nothing stood out. Be honest about why.</li>'}</ul>
    <div class="eyebrow bad">What slipped</div>
    <ul style="margin:6px 0 12px;padding-left:18px;font-size:14px">${s.slipped.length ? s.slipped.map(x => `<li>${esc(x)}</li>`).join('') : '<li class="muted">Nothing. That is a complete week.</li>'}</ul>
    <div class="eyebrow">One fix for next week</div>
    <p style="margin-top:6px;font-weight:600">${esc(s.fix)}</p>
  </div>`;
}

export function noteHTML(n) {
  return `<div class="note ${n.level}"><div class="eyebrow" style="margin-bottom:2px">${esc(n.area)}</div><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></div>`;
}

let sumOffset = null;
export function renderCoach(view) {
  const notes = coachNotes();
  const isSun = weekday(today()) === 0;
  if (sumOffset === null) sumOffset = isSun ? 0 : -1;
  const ws = addDays(weekStart(today()), 7 * sumOffset);
  const groups = ['Today', 'Nutrition', 'Training', 'Weight', 'Phase'];
  view.innerHTML = `
    <div class="datebar"><button class="icon-btn" data-act="sum-week" data-n="-1">${ICON.back}</button><b>${sumOffset === 0 ? 'This week' : sumOffset === -1 ? 'Last week' : `${-sumOffset} weeks ago`}</b><button class="icon-btn" data-act="sum-week" data-n="1" ${sumOffset >= 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.fwd}</button></div>
    ${ws < weekStart(firstDay()) ? '<div class="card empty">No data for that week.</div>' : summaryCard(ws)}
    <div class="section-title">Daily notes</div>
    <div class="card">${groups.map(g => notes.filter(n => n.area === g)).filter(a => a.length).map(a => a.map(noteHTML).join('')).join('') || '<div class="empty">Log a few days of food and training and the notes start here.</div>'}</div>`;
}
on('sum-week', el => { sumOffset = Math.min(0, (sumOffset || 0) + +el.dataset.n); changed(); });
