/* The live workout's stopwatch (components/workoutStopwatch.js): on the
   "Name - Workout" line, counting from the moment Start was tapped, kept
   across reloads before and after the first set, sent to the server with
   the session, hidden (but still recorded) when turned off in Settings. */
const { run, toSec } = require("./harness.cjs");

run({ prefix: "stopwatch", workoutName: "Stopwatch Test" }, "#/workouts", async t => {
    const { page, check, workout, clock } = t;
    await t.startWorkout();

    const watch = () => page.$("#workout-stopwatch:not([hidden])");
    const watchSec = async () => toSec(await page.$eval("#workout-stopwatch", el => el.textContent) || "0:00");
    // Waits until the stopwatch reads exactly `sec`; true if it did.
    const watchReads = sec => t.waitFor(s => {
        const el = document.getElementById("workout-stopwatch");
        return !el.hidden && el.textContent.split(":").reduce((a, b) => a * 60 + Number(b), 0) === s;
    }, sec);
    const started = () => page.evaluate(() => JSON.parse(localStorage.getItem("fitness.startedWorkout")));
    const reopen = async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await t.appStarted();
        await page.waitForSelector(".exercise-card.active");
    };
    const MIN = 60;

    // 1. Shows from Start, on the title line, at the right
    check("stopwatch shows", (await watch()) !== null);
    check("starts at 0:00-0:03", (await watchSec()) <= 3, await watchSec());
    const place = await page.evaluate(() => {
        const h = document.querySelector(".workout-title-row h2").getBoundingClientRect();
        const w = document.getElementById("workout-stopwatch").getBoundingClientRect();
        // Only the workout's ⋮ sits to its right.
        const more = document.querySelector(".workout-title-row .more-btn").getBoundingClientRect();
        return { sameLine: w.top < h.bottom && w.bottom > h.top, right: Math.round(more.left - w.right), left: Math.round(w.left - h.right) };
    });
    check("on the same line as the name, at the right (before the ⋮)", place.sameLine && place.left >= 0 && place.right >= 0 && place.right <= 24, JSON.stringify(place));
    // From here the page's time only moves when the test says.
    await clock.install();
    // Where the stopwatch stands, from the stopped clock and the Start time
    // (not its text, which only redraws every 500 ms and can be behind).
    const atInstall = await page.evaluate(() =>
        Math.floor((Date.now() - JSON.parse(localStorage.getItem("fitness.startedWorkout")).startedAt) / 1000));
    await clock.tick(2000);
    check("it counts", await watchReads(atInstall + 2), `${atInstall}s → ${await watchSec()}s`);
    await t.shot("stopwatch-01-live");

    // 2. Before any set: the Start time is on the device, and survives a reload
    const s = await started();
    check("the Start time is kept on the device", s && s.workoutId === workout.id && Math.abs((await clock.now()) - s.startedAt) < 10000);
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("fitness.startedWorkout"));
        s.startedAt = Date.now() - (12 * 60 + 5) * 1000; // "tapped Start 12:05 ago"
        localStorage.setItem("fitness.startedWorkout", JSON.stringify(s));
    });
    await reopen();
    const START = 12 * MIN + 5; // what the stopwatch reads from here on: the clock stands still
    check("after a reload it counts from the Start time", await watchReads(START), await watchSec());

    // 3. Leaving and coming back doesn't restart it
    await page.click("#workout-home-btn");
    await page.waitForSelector("#home-greeting");
    await t.startWorkout();
    check("reopening the workout keeps the time", await watchReads(START), await watchSec());

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
        && Math.abs((await clock.now()) - Date.parse(session.startedAt) - START * 1000) < 1000, `${sent.startedAt} → ${session.startedAt}`);
    check("logging a set doesn't restart it", await watchReads(START), await watchSec());

    // 5. With a session: the time comes from the server after a reload
    await page.evaluate(() => localStorage.removeItem("fitness.startedWorkout"));
    await reopen();
    check("after a reload it still counts from Start (server's time)", await watchReads(START), await watchSec());

    // 6. Turned off in Settings: hidden, name still there (reopen waits for
    //    the profile, so hidden then means the setting, not "not loaded yet")
    await t.api("PUT", "/profile/workout-timer", { show: false });
    await reopen();
    check("turned off: hidden", await t.waitFor(() => document.getElementById("workout-stopwatch").hidden));
    check("the name is still there", (await page.$eval(".workout-title-row h2", h => h.textContent)).includes("Stopwatch Test - Workout"));
    await t.api("PUT", "/profile/workout-timer", { show: true });
    await reopen();
    check("turned back on: shows", await watchReads(START));

    // 7. Finishing records how long it took. The server ends it on its own
    //    (real) clock, so it took 12:05 plus how far real time is ahead of
    //    the page's stopped clock.
    // Next past the last (only) exercise opens the review.
    await page.click("#exercise-nav-next");
    await page.waitForSelector("#summary-finish-btn", { visible: true });
    const finished = t.response("POST", /\/sessions\/\d+\/finish$/);
    await page.click("#summary-finish-btn");
    await finished;
    const ahead = Math.round((Date.now() - (await clock.now())) / 1000);
    const past = await t.api("GET", `/workouts/${workout.id}/sessions`);
    const took = past.content[0].durationSeconds;
    check("the finished session took ~12 min", Math.abs(took - (START + ahead)) <= 2, `${took}s, expected ${START + ahead}s`);

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
