export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

export function formatCategoryLabel(c) {
    if (!c) return "";
    return c.charAt(0) + c.slice(1).toLowerCase();
}

// " (+5)" after a number; format shows the size (e.g. formatDuration).
export function deltaSpan(delta, format = String) {
    if (delta === 0) return "";
    const sign = delta > 0 ? "+" : "-";
    const cls = delta > 0 ? "pos" : "neg";
    return ` <span class="delta ${cls}">(${sign}${format(Math.abs(delta))})</span>`;
}

// 90 → "1:30", 3900 → "1:05:00" (a time logged as seconds).
export function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds / 60) % 60;
    const s = String(seconds % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// 62.5 → "62.5", 0.30000000000000004 → "0.3": kg and km to 2 decimals.
export function formatDecimal(n) {
    return String(Math.round(n * 100) / 100);
}

export function formatSessionDate(yyyyMmDd) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
