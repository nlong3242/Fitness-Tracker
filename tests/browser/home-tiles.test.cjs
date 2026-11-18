/* Home's Bodyweight and Steps tiles (views/home.js, pages/home.css): side
   by side, 168px tall in every Bodyweight state (no log, typing, today,
   days ago, an old weigh-in's note, a week's change), titles in full.
   Inline logging still works: Log Weight, type, Return saves; empty cancels;
   the rest of the tile opens the history page. */
const { run } = require("./harness.cjs");

function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

run({ prefix: "hometiles", workoutName: "Tile Day", exercises: 1 }, "#/home", async t => {
    const { page, check } = t;
    const today = new Date().toLocaleDateString("en-CA");

    const openHome = () => t.openHome();
    const tiles = () => page.evaluate(() => {
        const box = el => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top) }; };
        const shown = id => { const el = document.getElementById(id); return !!el && !el.hidden; };
        const [weight, steps] = document.querySelectorAll(".home-tile");
        const titleFits = [...document.querySelectorAll(".home-tile-title")].every(tl => tl.scrollWidth <= tl.clientWidth);
        return {
            weight: box(weight), steps: box(steps), titleFits,
            value: document.getElementById("home-weight-value").textContent,
            badge: shown("home-weight-badge") ? document.getElementById("home-weight-badge").textContent : null,
            note: shown("home-weight-note") ? document.getElementById("home-weight-note").textContent : null,
            trend: shown("home-weight-trend") ? document.getElementById("home-weight-trend").textContent : null,
            badgeFont: getComputedStyle(document.querySelector(".home-tile-badge")).fontSize,
            valueFont: getComputedStyle(document.querySelector(".home-tile-value")).fontSize,
            // nothing in a tile's number row spills past the tile
            fits: [...document.querySelectorAll(".home-tile-body")].every(b => b.scrollWidth <= b.clientWidth),
            stepsText: document.querySelectorAll(".home-tile-value")[1].textContent.replace(/\s+/g, " ").trim()
        };
    });
    const heights = [];

    // 1. No weigh-in yet
    await openHome();
    let s = await tiles();
    heights.push(s.weight.h, s.steps.h);
    check("side by side, same size", s.weight.top === s.steps.top && s.weight.h === s.steps.h && s.weight.w === s.steps.w, JSON.stringify(s));
    check("168px tall", s.weight.h === 168, s.weight.h);
    check("titles in full", s.titleFits);
    check("no weigh-in: – and No log", s.value === "–" && s.badge === "No log", JSON.stringify(s));
    check("big numbers", parseFloat(s.valueFont) >= 28, s.valueFont);
    check("small badges", parseFloat(s.badgeFont) < 12.5, s.badgeFont);
    check("steps: today's count over a short goal", s.stepsText === "6,379 / 10k", s.stepsText);
    check("the numbers fit inside their tiles", s.fits);
    await t.shot("home-tiles-01-no-log");

    // 2. Typing a weight: same height; empty cancels
    // Home ignores a tap within 400 ms of editing ending; on the test's
    // clock that's a tick rather than a real wait.
    await t.clock.install();
    const typing = () => t.waitFor(() => {
        const i = document.getElementById("home-weight-input");
        return !i.hidden && document.activeElement === i;
    });
    await t.tap("#home-log-weight-btn");
    check("typing: the input replaces the number", await typing());
    s = await tiles();
    heights.push(s.weight.h);
    await t.shot("home-tiles-02-typing");
    await page.keyboard.press("Enter");
    check("empty Return cancels", await t.waitFor(() =>
        document.getElementById("home-weight-input").hidden && document.getElementById("home-weight-value").textContent === "–"));
    await t.clock.tick(500);

    // 3. Log 72.5: Today
    await t.tap("#home-log-weight-btn");
    await typing();
    await page.keyboard.type("72.5");
    const saved = page.waitForResponse(r => r.url().includes(`/bodyweight/${today}`) && r.request().method() === "PUT");
    await page.keyboard.press("Enter");
    await saved;
    await page.waitForFunction(() => document.getElementById("home-weight-badge").textContent === "Today");
    s = await tiles();
    heights.push(s.weight.h);
    check("logged: 72.5, Today", s.value === "72.5" && s.badge === "Today", JSON.stringify(s));

    // 4. A week's change: the trend line fits too
    await t.api("PUT", `/bodyweight/${addDays(today, -7)}`, { weightKg: 73.1 });
    await openHome();
    s = await tiles();
    heights.push(s.weight.h);
    check("a week's change shows", /0\.6 kg this week/.test(s.trend || ""), s.trend);
    check("a logged weight fits its tile too", s.fits);
    await t.shot("home-tiles-03-today-trend");

    // 5. Only older weigh-ins: "2d ago", then the note
    await t.api("DELETE", `/bodyweight/${today}`);
    await t.api("PUT", `/bodyweight/${addDays(today, -2)}`, { weightKg: 72.9 });
    await openHome();
    s = await tiles();
    heights.push(s.weight.h);
    check("two days old: 2d ago", s.badge === "2d ago" && s.value === "72.9", JSON.stringify(s));
    check("…with the title still in full", s.titleFits);
    await t.api("DELETE", `/bodyweight/${addDays(today, -2)}`);
    await openHome();
    s = await tiles();
    heights.push(s.weight.h);
    check("a week old: Last logged note, no badge", s.badge === null && /^Last logged /.test(s.note || ""), JSON.stringify(s));
    await t.shot("home-tiles-04-old");

    check("168px in every state", heights.every(h => h === 168), heights.join(","));

    // 6. The rest of the tile opens the history page
    await t.tap("#home-weight-tile .home-tile-title");
    check("tapping the tile opens Bodyweight", await t.waitFor(() => location.hash.startsWith("#/bodyweight")), page.url());
});
