export function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

export function formatCategoryLabel(c) {
    if (!c) return "";
    return c.charAt(0) + c.slice(1).toLowerCase();
}

export function deltaSpan(delta) {
    if (delta === 0) return "";
    const sign = delta > 0 ? "+" : "";
    const cls = delta > 0 ? "pos" : "neg";
    return ` <span class="delta ${cls}">(${sign}${delta})</span>`;
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
