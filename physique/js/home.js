import { today, weekday, esc, fmtDate, addDays, weekStart, on, ICON } from './util.js';
import { phaseInfo } from './state.js';
import { streaks, weekDots, todayChecklist, streakMessage } from './streaks.js';
import { macroCard } from './food.js';
import { todayWorkoutCard } from './train.js';
import { coachNotes, noteHTML, summaryCard, weeklySummary } from './coach.js';
import { trainingFactCard, funFactCard } from './facts.js';

export function renderHome(view) {
  const st = streaks();
  const dots = weekDots();
  const chk = todayChecklist();
  const pi = phaseInfo();
  const notes = coachNotes();
  const top = notes.filter(n => n.area !== 'Phase').slice(0, 2);
  const wd = weekday(today());

  view.innerHTML = `
    <div class="card">
      <div class="streak-hero">
        <div class="streak-num ${st.consistency ? '' : 'zero'}">${st.consistency}</div>
        <div class="grow">
          <div class="streak-lbl">${st.consistency === 1 ? 'day' : 'days'} on plan</div>
          <div class="small muted">${esc(streakMessage(st))}</div>
        </div>
      </div>
      <div class="week-dots">${dots.map(d => `<div class="wd ${d.state} ${d.today ? 'today' : ''}">${d.letter}<b></b></div>`).join('')}</div>
      <ul class="todo">${chk.items.map(i => `<li class="${i.done ? 'done' : ''}">${esc(i.text)}</li>`).join('')}</ul>
      <div class="mini-streaks">
        <div><div class="n">${st.logging}</div><div class="t">logging</div></div>
        <div><div class="n">${st.protein}</div><div class="t">protein</div></div>
        <div><div class="n">${st.training}</div><div class="t">sessions</div></div>
      </div>
    </div>

    ${pi ? `<div class="card tight">
      <div class="spread"><div class="phase-strip"><span class="d">${pi.started ? `Day ${pi.day}` : 'Starts'}</span><span class="muted small">${pi.started ? `of ${pi.total} · ${esc(pi.p.name)}` : fmtDate(pi.p.start, { weekday: true })}</span></div>
      <span class="small ${pi.done ? 'good' : 'muted'}">${pi.done ? 'Complete' : `${pi.left} days left`}</span></div>
      <div class="phase-bar"><i style="width:${Math.min(100, (pi.day / pi.total) * 100)}%"></i></div>
    </div>` : ''}

    ${macroCard(today(), { compact: true })}
    <div class="btn-grid" style="margin-top:-2px">
      <button class="btn primary" data-act="food-scan">${ICON.scan} Scan food</button>
      <button class="btn" data-act="food-add">${ICON.search} Add food</button>
    </div>

    ${todayWorkoutCard()}

    ${wd === 0 ? summaryCard(weekStart(today())) : wd === 1 && weeklySummary(addDays(weekStart(today()), -7)).closed ? summaryCard(addDays(weekStart(today()), -7)) : ''}

    ${top.length ? `<div class="card"><div class="card-h"><h2>Coach</h2><button class="link-btn" data-act="goto" data-tab="coach">All notes</button></div>${top.map(noteHTML).join('')}</div>` : ''}

    ${trainingFactCard()}
    ${funFactCard()}
  `;
}

on('goto', el => { location.hash = '#' + el.dataset.tab; });
