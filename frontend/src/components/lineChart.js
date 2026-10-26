/* A line chart over dates, as HTML: a head line, the chart, then the first
   and last date. Used by the bodyweight page and an exercise's History tab.
   Each line gets one square on its latest point (one on every point ran
   together: daily ones on 1M sit ~10px apart), and a dashed line marks the
   highest and lowest value. Labels are HTML outside the SVG so the pixel
   font isn't stretched with it.

   head: { left, right } HTML for above the chart.
   lines: [{ cls, points: [{ date, value }] }], points oldest first; cls is
          added to the line and its square (for a second colour).
   minSpan: the smallest value range drawn (a flat line sits mid-height).
   label: the SVG's aria-label. */
export function lineChartHtml({ head, lines, fromIso, toIso, minSpan, label }) {
    const W = 300, H = 120, PAD = 8;
    const values = lines.flatMap(l => l.points.map(p => p.value));
    const max = Math.max(...values), min = Math.min(...values);
    let lo = min, hi = max;
    if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const span = Math.max(1, daysBetween(fromIso, toIso));
    const x = iso => PAD + (daysBetween(fromIso, iso) / span) * (W - 2 * PAD);
    const y = v => PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD);
    const guide = v => `<line class="chart-guide" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;

    const drawn = lines.filter(l => l.points.length > 0).map(function(l) {
        const cls = l.cls ? ` ${l.cls}` : "";
        const coords = l.points.map(p => [x(p.date), y(p.value)]);
        const [lastX, lastY] = coords[coords.length - 1];
        // A single point has no line, just its square.
        const line = coords.length > 1
            ? `<polyline class="chart-line${cls}" points="${coords.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ")}"/>`
            : "";
        return { line, mark: `<rect class="chart-mark${cls}" x="${(lastX - 2.5).toFixed(1)}" y="${(lastY - 2.5).toFixed(1)}" width="5" height="5"/>` };
    });
    return `
        <div class="chart-head">
            <span class="chart-sub">${head.left}</span>
            ${head.right}
        </div>
        <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}">
            ${guide(max)}
            ${guide(min)}
            ${drawn.map(d => d.line).join("")}
            ${drawn.map(d => d.mark).join("")}
        </svg>
        <div class="chart-axis"><span>${shortDate(fromIso)}</span><span>${shortDate(toIso)}</span></div>
    `;
}

function daysBetween(fromIso, toIso) {
    const [fy, fm, fd] = fromIso.split("-").map(Number);
    const [ty, tm, td] = toIso.split("-").map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// "25 Oct", with the year added when it isn't this year.
function shortDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const opts = { day: "numeric", month: "short" };
    if (y !== new Date().getFullYear()) opts.year = "numeric";
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", opts);
}
