import { parseKey, fmtDate, r1 } from './util.js';

// Minimal SVG line chart. series: [{ points: [{x: 'YYYY-MM-DD', y}], color, dashed, dots, width }]
export function lineChart({ series, height = 180, yFmt = v => r1(v), yPad = 0.08, minRangeY = 1, xLabels = 4, band }) {
  const W = 340, H = height, L = 38, R = 10, T = 10, B = 22;
  const all = series.flatMap(s => s.points);
  if (!all.length) return '<div class="empty">No data yet.</div>';
  const xs = all.map(p => parseKey(p.x).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 === x0) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  let ys = all.map(p => p.y);
  if (band) ys = ys.concat([band.lo, band.hi]);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < minRangeY) { const m = (y0 + y1) / 2; y0 = m - minRangeY / 2; y1 = m + minRangeY / 2; }
  const pad = (y1 - y0) * yPad; y0 -= pad; y1 += pad;
  const X = t => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = y0 + ((y1 - y0) * i) / ticks;
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`;
  }
  for (let i = 0; i < xLabels; i++) {
    const t = x0 + ((x1 - x0) * i) / Math.max(1, xLabels - 1);
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    g += `<text x="${X(t)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === xLabels - 1 ? 'end' : 'middle'}">${fmtDate(key)}</text>`;
  }
  if (band) g += `<rect x="${L}" width="${W - L - R}" y="${Y(band.hi)}" height="${Math.max(0, Y(band.lo) - Y(band.hi))}" fill="rgba(255,255,255,0.05)"/>`;
  for (const s of series) {
    if (!s.points.length) continue;
    const pts = s.points.map(p => [X(parseKey(p.x).getTime()), Y(p.y)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" ${s.dashed ? 'stroke-dasharray="5 5"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
    if (s.dots !== false) g += pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${s.color}"/>`).join('');
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

// Least-squares slope/intercept with x in days.
export function linreg(points) {
  const n = points.length;
  if (n < 2) return null;
  const xs = points.map(p => parseKey(p.x).getTime() / 864e5), ys = points.map(p => p.y);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (!den) return null;
  const slope = num / den; // per day
  return { slope, at: key => my + slope * (parseKey(key).getTime() / 864e5 - mx) };
}
