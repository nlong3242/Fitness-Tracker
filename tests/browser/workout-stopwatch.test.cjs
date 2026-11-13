/* The live workout's stopwatch (components/workoutStopwatch.js): on the
   "Name - Workout" line, counting from the moment Start was tapped, kept
   across reloads before and after the first set, sent to the server with
   the session, hidden (but still recorded) when turned off in Settings. */
const { run, wait, toSec } = require("./harness.cjs");

run({ prefix: "stopwatch", workoutName: "Stopwatch Test" }, "#/workouts", async t => {
    const { page, check, workout } = t;
    await t.startWorkout();

    const watch = () => page.$("#workout-stopwatch:not([hidden])");
    const watchSec = async () => toSec(await page.$eval("#workout-stopwatch", el => el.textContent) || "0:00");
    const started = () => page.evaluate(() => JSON.parse(localStorage.getItem("fitness.startedWorkout")));
    const reopen = async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(".exercise-card.active");
        await wait(700);
    };
    const MIN = 60;

    // 1. Shows from Start, on the title line, at the right
    check("stopwatch shows", (await watch()) !== null);
    check("starts at 0:00-0:03", (await watchSec()) <= 3, await watchSec());
    const place = await page.evaluate(() => {
        const h = document.querySelector(".workout-title-row h2").getBoundingClientRect();
        const w = document.getElementById("workout-stopwatch").getBoundingClientRect();
        const content = document.getElementById("app-content").getBoundingClientRect();
        return { sameLine: w.top < h.bottom && w.bottom > h.top, right: Math.round(content.right - w.right), left: Math.round(w.left - h.right) };
    });
    check("on the same line as the name, at the right", place.sameLine && place.left >= 0 && place.right <= 24, JSON.stringify(place));
    await wait(2200);
    check("it counts", (await watchSec()) >= 2);
    await t.shot("stopwatch-01-live");

    // 2. Before any set: the Start time is on the device, and survives a reload
    const s = await started();
    check("the Start time is kept on the device", s && s.workoutId === workout.id && Math.abs(Date.now() - s.startedAt) < 10000);
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("fitness.startedWorkout"));
        s.startedAt = Date.now() - (12 * 60 + 5) * 1000; // "tapped Start 12:05 ago"
        localStorage.setItem("fitness.startedWorkout", JSON.stringify(s));
    });
    await reopen();
    let sec = await watchSec();
    check("after a reload it counts from the Start time", sec >= 12 * MIN + 5 && sec <= 12 * MIN + 9, sec);

    // 3. Leaving and coming back doesn't restart it
    await page.click('#bottom-nav [data-tab="home"]');
    await wait(500);
    await t.startWorkout();
    sec = await watchSec();
    check("reopening the workout keeps the time", sec >= 12 * MIN + 5, sec);

    // 4. The first set sends the Start time with the new session
    const created = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/workouts\/\d+\/sessions$/.test(r.url()), { timeout: 15000 });
    await page.click(".exercise-card.active > button");
    const row = (await page.$$(".exercise-card.active .set-input-row"))[0];
    const w = await row.$(".weight-input");
    const r = await row.$(".reps-input");
    await w.click({ clickCount: 3 });
    await w.type("20");
    await r.click({ clickCount: 3 });
    await r.type("8");
    await page.evaluate(() => document.activeElement.blur());
    const res = await created;
    const sent = JSON.parse(res.request().postData() || "{}");
    const session = await res.json();
    check("the new session gets the Start time", sent.startedAt
        && Math.abs(Date.parse(session.startedAt) - Date.parse(sent.startedAt)) < 1000
        && Date.now() - Date.parse(session.startedAt) >= 12 * MIN * 1000, `${sent.startedAt} → ${session.startedAt}`);
    await wait(700);
    sec = await watchSec();
    check("logging a set doesn't restart it", sec >= 12 * MIN + 5, sec);

    // 5. With a session: the time comes from the server after a reload
    await page.evaluate(() => localStorage.removeItem("fitness.startedWorkout"));
    await reopen();
    sec = await watchSec();
    check("after a reload it still counts from Start (server's time)", sec >= 12 * MIN + 5 && sec <= 12 * MIN + 30, sec);

    // 6. Turned off in Settings: hidden, name still there
    await t.api("PUT", "/profile/workout-timer", { show: false });
    await reopen();
    check("turned off: hidden", (await watch()) === null);
    check("the name is still there", (await page.$eval(".workout-title-row h2", h => h.textContent)).includes("Stopwatch Test - Workout"));
    await t.api("PUT", "/profile/workout-timer", { show: true });
    await reopen();
    check("turned back on: shows", (await watch()) !== null);

    // 7. Finishing records how long it took
    await page.click("#active-workout-finish-btn");
    await page.waitForSelector("#summary-finish-btn");
    // POST only: the browser's CORS check (OPTIONS) answers first.
    const finished = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url()), { timeout: 15000 });
    await page.click("#summary-finish-btn");
    await finished;
    const past = await t.api("GET", `/workouts/${workout.id}/sessions`);
    const took = past.content[0].durationSeconds;
    check("the finished session took ~12 min", took >= 12 * MIN + 5 && took <= 12 * MIN + 60, took);

    // 8. The summary shows the workout's time right of the date, as the
    //    stopwatch read it (12:05 + the seconds the test took)
    const summaryTime = () => page.waitForSelector("#summary-length .summary-length-time", { timeout: 10000 })
        .then(el => el.evaluate(e => e.textContent));
    const length = await summaryTime();
    check("summary: the workout time 12:xx", /^12:\d\d$/.test(length) && toSec(length) === took, `${length} vs ${took}s`);
    const side = await page.evaluate(() => {
        const d = document.querySelector(".summary-date").getBoundingClientRect();
        const l = document.getElementById("summary-length").getBoundingClientRect();
        const content = document.getElementById("app-content").getBoundingClientRect();
        return { sameLine: l.top < d.bottom && l.bottom > d.top, rightOfDate: l.left >= d.right,
                 atRight: Math.round(content.right - l.right) <= 24, icon: !!document.querySelector("#summary-length svg") };
    });
    check("summary: on the date's line, at the right, with the stopwatch icon",
        side.sameLine && side.rightOfDate && side.atRight && side.icon, JSON.stringify(side));
    await t.shot("stopwatch-02-summary");

    // 9. Past sessions list it on each row, on the right, without overflow
    await page.evaluate(id => { location.hash = `#/workouts/${id}/sessions`; }, workout.id);
    await page.reload({ waitUntil: "domcontentloaded" }); // the app routes on load, not on a hash change
    const rowLength = await page.waitForSelector(".session-row .session-length", { timeout: 10000 })
        .then(el => el.evaluate(e => e.textContent));
    check("past sessions: the same time on the row", rowLength === length, rowLength);
    const fits = await page.$eval(".session-row", row => {
        const r = row.getBoundingClientRect();
        const len = row.querySelector(".session-length").getBoundingClientRect();
        const more = row.querySelector(".more-btn").getBoundingClientRect();
        return len.right <= more.left && more.right <= r.right && row.scrollWidth <= row.clientWidth
            && document.documentElement.scrollWidth <= 390;
    });
    check("past sessions: fits beside the ⋮ at 390px", fits);
    await t.shot("stopwatch-03-past-sessions");

    // 10. Opening that session from the list shows it too
    await page.click(".session-row .session-date");
    const again = await summaryTime();
    check("opened from the list: same time", again === length, again);
});
