/* A later day's plan can't be started (views/calendar.js renderScheduleRow):
   every workout is saved on the day it's done, so starting Friday's plan on
   Tuesday logged it on Tuesday and ticked Friday off. Start is greyed out
   there with one note above the plans; today's plan still starts. */
const { run } = require("./harness.cjs");

run({ prefix: "calfuture", workoutName: "Later Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
    const plan = await t.api("POST", "/scheduled-workouts", { date: tomorrow, workoutId: workout.id });
    await t.api("POST", "/scheduled-workouts", { date: today, workoutId: workout.id });
    const base = page.url().split("#")[0];
    async function openDay(day) {
        await page.goto(base + `#/calendar/${day}`, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await t.appStarted();
        await page.waitForSelector('.schedule-row [data-action="start"]');
        await t.settle();
        return page.evaluate(() => ({
            start: !document.querySelector('.schedule-row [data-action="start"]').disabled,
            skip: !document.querySelector('.schedule-row [data-action="skip"]').disabled,
            reschedule: !document.querySelector('.schedule-row [data-action="reschedule"]').disabled,
            note: (document.querySelector(".day-detail-note") || {}).textContent || null
        }));
    }

    // Tomorrow: no Start, the note, the rest as before
    let d = await openDay(tomorrow);
    check("tomorrow's plan: Start greyed out", !d.start, JSON.stringify(d));
    check("…with the note", d.note === "Future scheduled workouts can't be started.", d.note);
    check("…Skip and Reschedule still there", d.skip && d.reschedule, JSON.stringify(d));
    await t.shot("calendar-future-start");
    await page.$eval('.schedule-row [data-action="start"]', b => b.click());   // even forced
    await t.settle(); // anything it set off has run
    check("tapping it starts nothing", !(await page.$(".exercise-card.active")) && (await t.api("GET", "/sessions/unfinished")) == null);
    const still = await t.api("GET", `/scheduled-workouts/by-date/${tomorrow}`);
    check("…and the plan stays planned", still.length === 1 && still[0].id === plan.id && still[0].status === "PLANNED", JSON.stringify(still));

    // Today: Start works, no note
    d = await openDay(today);
    check("today's plan: Start, no note", d.start && d.note === null, JSON.stringify(d));

    /* The bug the block closes: the link to the plan is only held while
       the page is open, so after ‹ Home and Resume (or iOS reloading the
       app) Finish ticked off nothing and added a new entry on today. For
       today's plans the fallback (same workout planned on the workout's
       day) finds the plan. Checked for a plain plan and a repeat's day. */
    async function startLeaveResumeFinish(rowName) {
        const rows = await page.$$(".schedule-row");
        let target = rows[0];
        for (const r of rows) if ((await r.$eval(".schedule-row-name", n => n.textContent)).startsWith(rowName)) target = r;
        await (await target.$('[data-action="start"]')).click();
        await page.waitForSelector(".exercise-card.active > .add-set-btn", { timeout: 15000 });
        await t.settle();
        await t.tap("#workout-home-btn");
        await page.waitForSelector("#home-day-card .home-card-btn.live");
        await t.settle();
        await t.tap("#home-day-card .home-card-btn.live");
        await page.waitForSelector(".exercise-card.active > .add-set-btn");
        await t.settle();
        // Add Set, then the new row (not one that was already there).
        const before = (await page.$$(".exercise-card.active .set-input-row")).length;
        await page.click(".exercise-card.active > .add-set-btn");
        await page.waitForFunction(n => document.querySelectorAll(".exercise-card.active .set-input-row").length === n + 1, {}, before);
        const set = (await page.$$(".exercise-card.active .set-input-row")).pop();
        const posted = t.response("POST", /\/sets\?exerciseId=/);
        await (await set.$(".weight-input")).type("50");
        await (await set.$(".reps-input")).type("5");
        await page.evaluate(() => document.activeElement.blur());
        await posted;
        await t.settle();
        for (let i = 0; i < 4 && !(await page.$("#summary-finish-btn")); i++) {
            await page.click("#exercise-nav-next");
            await t.settle();
        }
        const finished = t.response("POST", /\/finish$/);
        await page.click("#summary-finish-btn");
        // Finish may ask "today only or update the workout" first; wait for
        // whichever comes: the question, or the finished summary.
        await page.waitForFunction(() => document.querySelector(".modal-choice")
            || /\/sessions\/\d+/.test(location.hash) && document.getElementById("summary-back-btn"), { timeout: 15000 });
        const choice = await page.$(".modal-choice");
        if (choice) await choice.click();
        await finished;
        await page.waitForSelector("#summary-back-btn", { visible: true });
        await t.settle(); // the plan's tick-off has gone through too
    }
    await startLeaveResumeFinish("Later Day");
    let rows = (await t.api("GET", `/scheduled-workouts/by-date/${today}`)).filter(r => r.workoutId === workout.id);
    check("today's plan, left and resumed: ticked off, no second entry",
        rows.length === 1 && rows[0].status === "COMPLETED" && rows[0].sessionId != null, JSON.stringify(rows));

    // A repeating plan's day (saved when started)
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const daily = await t.api("POST", "/workouts", { name: "Daily Repeat" });
    await t.api("POST", `/workouts/${daily.id}/exercises/${bench.id}/link`);
    await t.api("PUT", `/workouts/${daily.id}/repeat`, { everyDays: 1 });
    await openDay(today);
    await startLeaveResumeFinish("Daily Repeat");
    rows = (await t.api("GET", `/scheduled-workouts/by-date/${today}`)).filter(r => r.workoutId === daily.id);
    check("a repeat's day, left and resumed: ticked off, no second entry",
        rows.length === 1 && rows[0].status === "COMPLETED" && rows[0].sessionId != null && rows[0].repeatDate === today, JSON.stringify(rows));
});
