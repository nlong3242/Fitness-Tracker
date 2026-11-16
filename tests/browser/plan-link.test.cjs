/* A workout started from a calendar plan remembers that plan (session.js
   workoutPlanId; the server keeps it on the session, V20), so Finish ticks
   off that plan by its id even after leaving, reloading and resuming,
   instead of guessing by date (which missed it past midnight). */
const { run, wait } = require("./harness.cjs");

run({ prefix: "planlink", workoutName: "Linked Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const plan = await t.api("POST", "/scheduled-workouts", { date: today, workoutId: workout.id });
    const base = page.url().split("#")[0];

    // ‹ Home, reload (as iOS does), then Resume from Home's card
    async function leaveReloadResume() {
        await page.click("#workout-home-btn");
        await page.waitForSelector("#home-day-card");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("#home-day-card .home-card-btn.live", { timeout: 15000 });
        await wait(400);
        await page.click("#home-day-card .home-card-btn.live");
        await page.waitForSelector(".exercise-card.active > .add-set-btn", { timeout: 15000 });
        await wait(600);
    }

    // Start from today's plan in the calendar
    await page.goto(base + `#/calendar/${today}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('.schedule-row [data-action="start"]:not([disabled])');
    await wait(300);
    await page.click('.schedule-row [data-action="start"]');
    await page.waitForSelector(".exercise-card.active > .add-set-btn", { timeout: 15000 });
    await wait(600);

    // 1. Before the first set (only this device knows it's started)
    await leaveReloadResume();
    await page.click(".exercise-card.active > .add-set-btn");
    const set = (await page.$$(".exercise-card.active .set-input-row")).pop();
    const created = page.waitForResponse(r => r.request().method() === "POST" && /\/workouts\/\d+\/sessions$/.test(r.url()));
    await (await set.$(".weight-input")).type("50");
    await (await set.$(".reps-input")).type("5");
    await page.evaluate(() => document.activeElement.blur());
    const session = await (await created).json();
    await wait(400);
    check("the first set's session carries the plan, after a reload before it",
        session.scheduledWorkoutId === plan.id, JSON.stringify({ sent: (await created).request().postData(), got: session.scheduledWorkoutId }));

    // 2. After it (the server knows): leave, reload, resume, Finish
    await leaveReloadResume();
    const calendarCalls = [];
    page.on("request", r => {
        if (/scheduled-workouts/.test(r.url()) && r.method() !== "OPTIONS") calendarCalls.push(`${r.method()} ${r.url().replace(/^.*scheduled-workouts/, "")}`);
    });
    for (let i = 0; i < 4 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }
    const finished = page.waitForResponse(r => r.request().method() === "POST" && /\/finish$/.test(r.url()));
    await page.click("#summary-finish-btn");
    const choice = await page.waitForSelector(".modal-choice", { timeout: 1500 }).catch(() => null);
    if (choice) await choice.click();
    await finished;
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(1200);
    check("Finish ticks off that plan by its id, without searching the day",
        calendarCalls.join() === `PATCH /${plan.id}`, calendarCalls.join(" | "));
    const rows = await t.api("GET", `/scheduled-workouts/by-date/${today}`);
    check("…so the plan is done and linked, with no second entry",
        rows.length === 1 && rows[0].id === plan.id && rows[0].status === "COMPLETED" && rows[0].sessionId === session.id, JSON.stringify(rows));

    // 3. A workout started on its own has no plan
    const lone = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    check("started on its own: no plan", lone.scheduledWorkoutId === null, JSON.stringify(lone));
});
