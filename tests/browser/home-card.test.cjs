/* Home's selected-day card (views/home.js renderDayCard): nothing planned
   (Next up, Start a Workout), today's plan (Start <name>, "+1 more", none
   with no exercises), a workout in progress (Resume with its details),
   done today (alone, beside a plan, two), and other days (planned: View in
   Calendar; empty: muted). Always the same height. Sessions always take
   today's date, so done days are today. */
const { run, wait } = require("./harness.cjs");

function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

run({ prefix: "homecard", workoutName: "Card Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const empty = await t.api("POST", "/workouts", { name: "Empty One" });
    const plan = (date, workoutId) => t.api("POST", "/scheduled-workouts", { date, workoutId });

    // Reload Home so the app also has the workouts made through the API.
    const openHome = () => t.openHome();
    const card = () => page.evaluate(() => {
        const el = document.getElementById("home-day-card");
        const q = s => { const n = el.querySelector(s); return n ? n.textContent.replace(/\s+/g, " ").trim() : null; };
        return {
            title: q(".home-tile-title"), badge: q(".home-tile-badge"), name: q(".home-card-name"),
            sub: q(".home-card-sub"), btn: q(".home-card-btn"), btnLive: !!el.querySelector(".home-card-btn.live"),
            lines: [...el.querySelectorAll(".home-card-line")].map(l => l.textContent.replace(/\s+/g, " ").trim()),
            muted: el.classList.contains("muted"), height: Math.round(el.getBoundingClientRect().height)
        };
    });
    async function selectDay(date) {
        for (let i = 0; i < 2 && !(await page.$(`.home-day[data-date="${date}"]`)); i++) {
            // (this week comes back from memory, other weeks are fetched)
            await page.click(date > today ? "#home-week-next" : "#home-week-prev");
            await page.waitForSelector(`.home-day[data-date="${date}"]`).catch(() => {});
            await page.waitForFunction(() => document.getElementById("home-week-foot").textContent.trim() !== "");
            await wait(150);
        }
        await page.click(`.home-day[data-date="${date}"]`);
        await wait(100);
    }
    const heights = [];

    // 1. Nothing planned today, nothing ahead
    await openHome();
    let c = await card();
    heights.push(c.height);
    check("nothing planned: title Today, no badge", c.title === "Today" && c.badge === null, JSON.stringify(c));
    check("nothing planned: the words", c.name === "Nothing planned today" && /^Pick a workout/.test(c.sub), c.sub);
    check("nothing planned: Start a Workout", c.btn === "Start a Workout");
    await t.shot("home-card-01-nothing");

    // 2. A plan tomorrow: Next up
    const tomorrowPlan = await plan(tomorrow, workout.id);
    await openHome();
    c = await card();
    check("Next up names the plan and its day", /^Next up: Card Day · \w{3} \d+ \w{3}/.test(c.sub), c.sub);
    await page.click("#home-day-card .home-card-btn");
    await wait(400);
    check("Start a Workout opens the workout list", await page.$eval('#bottom-nav [data-tab="workouts"]', b => b.classList.contains("active")));

    // 3. An empty workout planned today: no Start
    const emptyPlan = await plan(today, empty.id);
    await openHome();
    c = await card();
    heights.push(c.height);
    check("empty workout planned: its name, Planned", c.name === "Empty One" && c.badge === "Planned", JSON.stringify(c));
    check("empty workout: no Start, View in Calendar instead", c.sub === "No exercises yet" && c.btn === "View in Calendar", JSON.stringify(c));

    // 4. Today's plan, plus a second one. The earliest added leads, so
    //    Empty One's plan moves to after Card Day's.
    await t.api("DELETE", `/scheduled-workouts/${emptyPlan.id}`);
    await plan(today, workout.id);
    await plan(today, empty.id);
    await openHome();
    c = await card();
    heights.push(c.height);
    check("planned today: Start <name>", c.name === "Card Day" && c.btn === "Start Card Day" && c.badge === "Planned", JSON.stringify(c));
    check("planned today: exercises and +1 more", c.sub === "1 exercise · +1 more ›", c.sub);
    await t.shot("home-card-02-planned");
    await page.click("#home-day-card .home-card-more");
    await wait(500);
    check("+1 more opens today in the calendar", page.url().includes(`#/calendar/${today}`), page.url());

    // 5. Start it: Resume with its details
    await openHome();
    await page.click("#home-day-card .home-card-btn");
    await page.waitForSelector("#workout-home-btn", { visible: true });
    await wait(600);   // let the page finish drawing before leaving it
    await page.click("#workout-home-btn");
    await page.waitForSelector("#home-day-card .home-card-btn.live");
    await wait(300);
    c = await card();
    heights.push(c.height);
    check("open workout: Resume, green, In progress", c.btn === "Resume Card Day" && c.btnLive && c.badge === "In progress", JSON.stringify(c));
    check("open workout: its details", /^Nothing logged yet · started just now$/.test(c.sub), c.sub);
    await t.shot("home-card-03-live");
    await page.click("#home-day-card .home-card-btn");
    await page.waitForSelector("#workout-home-btn", { visible: true });
    await wait(600);
    check("Resume goes back into the workout", true);
    await page.click(".workout-title-row .more-btn");
    await page.click(".action-menu-item.danger:last-child");
    await page.waitForSelector(".modal-confirm");
    await page.click(".modal-confirm");
    await wait(800);

    // 6. Done today beside the plans still to do
    const finishOne = async () => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 50, reps: 5 });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
        return s;
    };
    const first = await finishOne();
    await openHome();
    c = await card();
    heights.push(c.height);
    check("done + a plan: the plan leads", c.btn === "Start Card Day", JSON.stringify(c));
    check("done + a plan: the ✓ line in place of the details", /^Card Day done earlier · 1 set › · \+1 more ›$/.test(c.sub), c.sub);
    await t.shot("home-card-04-done-and-plan");
    await page.click("#home-day-card .home-card-done");
    await page.waitForFunction(() => location.hash.includes("/sessions/"));
    await wait(400);
    check("the ✓ line opens that summary, back to Home", page.url().includes(`/sessions/${first.id}?date=${today}&back=home`), page.url());

    // 7. Plans gone: done today. (Finished through the API in an instant,
    //    so there's no length to show; "· n min" is unit-tested server-side.)
    for (const p of await t.api("GET", `/scheduled-workouts/by-date/${today}`)) {
        await t.api("DELETE", `/scheduled-workouts/${p.id}`);
    }
    await openHome();
    c = await card();
    heights.push(c.height);
    check("done today: name, sets, Done", c.name === "Card Day" && /^1 set( · \d+ min)?$/.test(c.sub) && c.badge === "Done", JSON.stringify(c));
    check("done today: View Summary, no Start", c.btn === "View Summary");
    await t.shot("home-card-05-done");
    await page.click("#home-day-card .home-card-btn");
    await page.waitForFunction(() => location.hash.includes("/sessions/"));
    await wait(400);
    check("View Summary opens it", page.url().includes(`/sessions/${first.id}`), page.url());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(300);
    await page.click("#summary-back-btn");
    await page.waitForSelector("#home-day-card", { timeout: 5000 }).catch(() => {});
    check("after a reload, Back still goes to Home", !!(await page.$("#home-day-card")), page.url());

    // 8. Two done: a line each
    await finishOne();
    await openHome();
    c = await card();
    heights.push(c.height);
    check("two done: a line each, no button", c.lines.length === 2 && c.btn === null && c.badge === "Done", JSON.stringify(c));
    check("each line has its sets", c.lines.every(l => /^Card Day 1 set( · \d+ min)? ?›$/.test(l)), c.lines.join(" | "));
    await t.shot("home-card-06-two-done");

    // 9. Other days: tomorrow planned, yesterday's plan never done and a
    //    day marked skipped (both Skipped, like the calendar), empty days.
    await plan(yesterday, workout.id);
    const laterSkip = await plan(addDays(today, 2), workout.id);
    await t.api("PATCH", `/scheduled-workouts/${laterSkip.id}`, { status: "SKIPPED" });
    await openHome();
    await selectDay(tomorrow);
    c = await card();
    heights.push(c.height);
    check("tomorrow: Planned, View in Calendar, no Start",
        c.title === "Tomorrow" && c.badge === "Planned" && c.name === "Card Day" && c.btn === "View in Calendar", JSON.stringify(c));
    await t.shot("home-card-07-tomorrow");
    await selectDay(yesterday);
    c = await card();
    heights.push(c.height);
    check("yesterday's plan never done: Skipped, View in Calendar",
        c.title === "Yesterday" && c.badge === "Skipped" && c.name === "Card Day" && c.sub === "Not done" && c.btn === "View in Calendar", JSON.stringify(c));
    const yesterdayCls = await page.$eval(`.home-day[data-date="${yesterday}"]`, d => d.className);
    check("…and grey dashed in the strip, not rose", /\bskipped\b/.test(yesterdayCls) && !/\bplanned\b/.test(yesterdayCls), yesterdayCls);
    await t.shot("home-card-08-skipped");
    await selectDay(addDays(today, 2));
    c = await card();
    check("a plan marked skipped: Skipped", c.badge === "Skipped" && c.name === "Card Day", JSON.stringify(c));
    await selectDay(addDays(today, -2));
    c = await card();
    heights.push(c.height);
    check("an empty past day: muted Nothing logged", c.muted && c.name === "Nothing logged" && c.btn === null, JSON.stringify(c));
    await selectDay(addDays(today, 3));
    c = await card();
    check("a later day: weekday title, Nothing planned",
        c.title === new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-GB", { weekday: "long" }) && c.name === "Nothing planned", JSON.stringify(c));

    check("the card is the same height every time", new Set(heights).size === 1, heights.join(","));
    void tomorrowPlan;
});
