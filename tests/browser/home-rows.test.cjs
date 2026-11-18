/* Home's Latest PR and Last session rows (views/home.js showLatestPr,
   showLastSession). Empty: muted words, no ›, nothing to press. Then the
   newest ★ ("Latest PR · Tue 17 Nov", "Bench Press · 80 kg × 5"; a
   one-sided exercise lists each side, L before R), its name giving way to
   "…" while the numbers stay whole; tapping opens that exercise's History
   tab, Back returns Home. Last session: "Name · date", "n sets", → its
   summary and back. */
const { run } = require("./harness.cjs");

run({ prefix: "homerows", workoutName: "Row Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const heading = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

    const openHome = () => t.openHome();
    const rows = () => page.evaluate(() => {
        const one = id => {
            const row = document.getElementById(id);
            const text = s => { const n = row.querySelector(s); return n ? n.textContent.replace(/\s+/g, " ").trim() : null; };
            const nums = row.querySelector(".home-row-nums");
            const rr = row.getBoundingClientRect();
            return {
                label: text(".home-row-label"), value: text(".home-row-value"), stats: text(".home-row-stats"),
                none: row.classList.contains("none"), disabled: row.disabled,
                chevron: getComputedStyle(row.querySelector(".home-chevron")).display !== "none",
                numsWhole: !nums || nums.getBoundingClientRect().right <= rr.right - 10,
                nameCut: (() => { const n = row.querySelector(".home-row-name"); return !!n && n.scrollWidth > n.clientWidth; })()
            };
        };
        return { pr: one("home-pr-row"), last: one("home-last-row") };
    });
    const finish = async sets => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        for (const [ex, body] of sets) await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${ex.id}`, body);
        await t.api("POST", `/sessions/${s.id}/finish`, {});
        return s;
    };

    // 1. Nothing yet
    await openHome();
    let r = await rows();
    check("no PR: muted words, no ›, not pressable",
        r.pr.value === "None yet: log a workout to set one" && r.pr.label === "Latest PR" && r.pr.none && r.pr.disabled && !r.pr.chevron, JSON.stringify(r.pr));
    check("no session: No workouts yet, no ›",
        r.last.value === "No workouts yet" && r.last.none && r.last.disabled && !r.last.chevron && r.last.stats === "", JSON.stringify(r.last));
    await t.shot("home-rows-01-empty");

    // 2. One workout: its best set and the session
    const first = await finish([[bench, { weight: 80, reps: 5 }], [bench, { weight: 70, reps: 8 }]]);
    await openHome();
    r = await rows();
    check("Latest PR: date by the label", r.pr.label === `Latest PR · ${heading}`, r.pr.label);
    check("Latest PR: name · best set", r.pr.value === `${bench.name} · 80 kg × 5` && r.pr.chevron && !r.pr.disabled, r.pr.value);
    check("Last session: name · date, sets", r.last.value === `Row Day · ${heading}` && /^2 sets( · \d+ min)?$/.test(r.last.stats) && r.last.chevron, JSON.stringify(r.last));
    await t.shot("home-rows-02-filled");

    // 3. PR → that exercise's History tab, Back → Home
    await t.tap("#home-pr-row");
    await page.waitForFunction(() => location.hash.endsWith("/history"));
    check("PR opens the exercise's History tab", page.url().endsWith(`#/exercises/${bench.id}/history`), page.url());
    check("…with the Exercises tab lit", await t.waitFor(() =>
        document.querySelector('#bottom-nav [data-tab="exercises"]').classList.contains("active")));
    await page.waitForSelector("#exp-back-btn", { visible: true });
    await t.settle();
    await t.tap("#exp-back-btn");
    await page.waitForSelector("#home-pr-row");
    check("Back returns Home", page.url().endsWith("#/home"), page.url());

    // 4. Last session → its summary, Back → Home
    await t.settle(); // Home has its data again
    await t.tap("#home-last-row");
    await page.waitForFunction(() => location.hash.includes("/sessions/"));
    check("Last session opens its summary", page.url().includes(`/sessions/${first.id}?date=`) && page.url().endsWith("&back=home"), page.url());
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await t.settle();
    await t.tap("#summary-back-btn");
    await page.waitForSelector("#home-pr-row");
    check("Back returns Home", page.url().endsWith("#/home"), page.url());

    // 5. A one-sided exercise with a long name: each side, the name gives way
    const long = await t.api("POST", `/workouts/${workout.id}/exercises`,
        { name: "Extraordinarily Long Single-Arm Cable Row Variation", category: "BACK", unilateral: true });
    await finish([
        [long, { weight: 20, reps: 8, side: "LEFT" }],
        [long, { weight: 18, reps: 8, side: "RIGHT" }]
    ]);
    await openHome();
    r = await rows();
    check("one-sided: L before R, each side's set", /· L 20 kg × 8 · R 18 kg × 8$/.test(r.pr.value), r.pr.value);
    check("only the name gives way", r.pr.nameCut && r.pr.numsWhole, JSON.stringify(r.pr));
    await t.shot("home-rows-03-sides");

    // 6. Still one screen with everything filled
    const fit = await page.evaluate(() => {
        const nav = document.getElementById("bottom-nav").getBoundingClientRect().top;
        return Math.round(nav - document.getElementById("home-last-row").getBoundingClientRect().bottom);
    });
    check("the last row clears the tab bar", fit >= 0, `${fit}px to spare`);
});
