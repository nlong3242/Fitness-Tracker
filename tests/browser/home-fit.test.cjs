/* Home as a whole (views/home.js): one screen at 390×844 with everything
   filled; on a short phone (375×667) it scrolls and the last row clears
   the tab bar. A slow overview doesn't move anything when it lands; a
   failed one leaves placeholders (Start a Workout still works). Back on
   screen after a minute away, Home fetches its data again in place. */
const { run } = require("./harness.cjs");

run({ prefix: "homefit", workoutName: "Fit Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const finish = async () => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 60, reps: 5 });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
    };
    await finish();
    await t.api("PUT", `/bodyweight/${today}`, { weightKg: 70 });

    /* The overview can be held back until the test lets it go (rather than
       for a set time: a slow machine can take longer than that just to open
       Home), or made to fail. */
    let holdOverview = false, overviewFail = false;
    const held = [];
    const releaseOverview = () => { holdOverview = false; held.splice(0).forEach(go => go()); };
    t.setOnRequest((req, url) => {
        if (req.method() !== "GET" || !url.includes("/sessions/overview")) return false;
        if (overviewFail) { req.abort(); return true; }
        if (!holdOverview) return false;
        held.push(() => req.continue(url !== req.url() ? { url } : undefined).catch(() => {}));
        return true;
    });
    const openHome = (data = true) => t.openHome({ data });
    const layout = () => page.evaluate(() => {
        const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; };
        return {
            strip: box("#home-strip"), foot: box("#home-week-foot"), card: box("#home-day-card"),
            tiles: box(".home-tile-row"), pr: box("#home-pr-row"), last: box("#home-last-row")
        };
    });
    const scroll = () => page.evaluate(() => {
        const sc = document.getElementById("app-scroll");
        return { overflow: sc.scrollHeight - sc.clientHeight };
    });

    // 1. One screen at 390×844, everything filled
    await openHome();
    let s = await scroll();
    check("390×844: no scrolling", s.overflow <= 0, `${s.overflow}px over`);
    const settled = await layout();
    await t.shot("home-fit-01-filled");

    // 2. A slow overview: nothing moves when it lands
    holdOverview = true;
    await openHome(false);
    const early = await layout();
    const card = await page.$eval("#home-day-card .home-card-name", n => n.textContent);
    check("while loading: placeholders", card === "–", card);
    check("while loading: Start waits", await page.$eval("#home-day-card .home-card-btn", b => b.disabled));
    await t.shot("home-fit-02-loading");
    releaseOverview();
    await page.waitForFunction(() => document.getElementById("home-week-foot").textContent.trim() !== "", { timeout: 15000 });
    await t.settle();
    const late = await layout();
    const moved = Object.keys(early).filter(k => early[k][0] !== late[k][0] || early[k][1] !== late[k][1]);
    check("nothing jumps when the data lands", moved.length === 0, moved.map(k => `${k} ${early[k]}→${late[k]}`).join(", ") || "all still");
    check("…and it's laid out as when loaded straight away", JSON.stringify(late) === JSON.stringify(settled));

    // 3. A failed overview: placeholders stay, Start a Workout still works
    overviewFail = true;
    await openHome(false);
    await t.settle(); // the failure and everything else have come back
    const failed = await page.evaluate(() => ({
        name: document.querySelector("#home-day-card .home-card-name").textContent,
        btn: document.querySelector("#home-day-card .home-card-btn").textContent,
        btnDisabled: document.querySelector("#home-day-card .home-card-btn").disabled,
        pr: document.getElementById("home-pr-row").disabled,
        weight: document.getElementById("home-weight-value").textContent
    }));
    check("failed: placeholders, rows not pressable", failed.name === "–" && failed.pr, JSON.stringify(failed));
    check("failed: the rest still loads (weight)", failed.weight === "70.0", failed.weight);
    check("failed: Start a Workout still offered, and pressable", failed.btn === "Start a Workout" && !failed.btnDisabled, JSON.stringify(failed));
    await t.shot("home-fit-03-failed");
    overviewFail = false;

    // 4. Back on screen after a minute away: fresh data, same day selected
    await openHome();
    const thisWeek = await page.$eval(".home-day", d => d.dataset.date);
    await t.tap("#home-week-prev");
    await page.waitForFunction(w => document.querySelector(".home-day").dataset.date !== w, {}, thisWeek);
    await t.settle();
    const shownWeek = await page.$eval(".home-day", d => d.dataset.date);
    await t.tap("#home-week-next");
    await page.waitForFunction(w => document.querySelector(".home-day").dataset.date === w, {}, thisWeek);
    await t.settle();
    const before = await page.$eval("#home-week-foot", f => f.textContent.replace(/\s+/g, " ").trim());
    await finish();
    const refreshed = page.waitForResponse(r => r.url().includes("/sessions/overview"));
    await page.evaluate(() => {
        let state = "hidden";
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
        document.dispatchEvent(new Event("visibilitychange"));
        const real = Date.now;
        Date.now = () => real() + 61 * 1000;   // a minute later
        state = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await refreshed;
    await t.waitFor(() => /^2 \//.test(document.getElementById("home-week-foot").textContent.trim()));
    const after = await page.$eval("#home-week-foot", f => f.textContent.replace(/\s+/g, " ").trim());
    check("back after a minute: the new session counts", /^1 \//.test(before) && /^2 \//.test(after), `${before} → ${after}`);
    check("still on this week, today selected", (await page.$eval(".home-day", d => d.dataset.date)) !== shownWeek
        && (await page.$eval(`.home-day[data-date="${today}"]`, d => d.classList.contains("selected"))));

    // 5. A short phone: it scrolls, and the last row clears the tab bar
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1 });
    await openHome();
    s = await scroll();
    check("375×667: Home scrolls", s.overflow > 0, `${s.overflow}px to scroll`);
    await page.evaluate(() => document.getElementById("app-scroll").scrollTo(0, 99999));
    await t.settle();
    const clear = await page.evaluate(() => Math.round(document.getElementById("bottom-nav").getBoundingClientRect().top
        - document.getElementById("home-last-row").getBoundingClientRect().bottom));
    check("scrolled down, the last row clears the tab bar", clear >= 0, `${clear}px`);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("no sideways overflow at 375", overflowX <= 0, overflowX);
    await t.shot("home-fit-04-short-phone");
});
