/* Reset workout from the live workout's ⋮ (views/activeWorkout.js
   resetThisWorkout): asks, saying today's sets stay; then the workout's
   finished sessions go and the page is rebuilt, so the "last time" hints
   are fetched again. An exercise also done in another workout then hints
   from there; one only ever done here has none. Today's set stays. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "resetlive", workoutName: "Reset Live", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const all = await t.api("GET", "/exercises");
    const extra = all.find(e => e.builtIn && /dumbbell/i.test(e.name) && e.id !== bench.id);
    await t.api("POST", `/workouts/${workout.id}/exercises/${extra.id}/link`);

    const done = async (workoutId, sets) => {
        const s = await t.api("POST", `/workouts/${workoutId}/sessions`, {});
        for (const [ex, weight, reps] of sets) await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${ex.id}`, { weight, reps });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
        return s;
    };
    // Done here: the bench and the dumbbell one. Done elsewhere: the bench only.
    await done(workout.id, [[bench, 80, 5], [extra, 22.5, 7]]);
    const otherDay = await t.api("POST", "/workouts", { name: "Other Day" });
    await t.api("POST", `/workouts/${otherDay.id}/exercises/${bench.id}/link`);
    const elsewhere = await done(otherDay.id, [[bench, 50, 5]]);
    const day = new Date(elsewhere.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    const note = () => page.$eval(".exercise-card.active", c => {
        const n = c.querySelector(".last-done-note");
        return n ? n.textContent : null;
    });
    const hints = () => page.$$eval(".exercise-card.active .set-input-row", rows => rows.map(r =>
        `${r.querySelector(".weight-input").placeholder}x${r.querySelector(".reps-input").placeholder}`));
    const message = () => page.$eval(".modal-message", e => e.textContent);

    // 1. Before: this workout's own last time
    await t.startWorkout();
    await wait(500);
    check("before: the bench hints from this workout", JSON.stringify(await hints()) === JSON.stringify(["80x5"]),
        (await hints()).join(", "));
    check("before: no 'from another workout' note", (await note()) === null, await note());

    // Today's set on the bench
    const posted = page.waitForResponse(r => r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()));
    const row = (await page.$$(".exercise-card.active .set-input-row"))[0];
    await (await row.$(".weight-input")).type("90");
    await (await row.$(".reps-input")).type("3");
    await page.evaluate(() => document.activeElement.blur());
    await posted;
    await wait(300);

    // 2. The workout's ⋮: Reset workout, red, between Add and Discard
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item");
    const items = await page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    check("⋮ is Add, Reset, Discard",
        JSON.stringify(items) === JSON.stringify(["Add exercise", "Reset workout", "Discard workout"]), items.join(", "));
    check("Reset is red", await page.$$eval(".action-menu-item", els => els[1].classList.contains("danger")));

    // 3. Asks, saying today's sets stay
    await page.click(".action-menu-item:nth-child(2)");
    await page.waitForSelector(".modal-confirm");
    const asked = await message();
    check("asks, saying today's sets stay",
        asked === `Reset ${workout.name}? The workout you've done of it is deleted, with its 2 sets. Today's sets stay. This can't be undone.`,
        asked);
    await t.shot("reset-workout-live-01-confirm");

    // 4. Reset: rebuilt on the bench, hints now from Other Day
    const reset = page.waitForResponse(r => r.request().method() === "DELETE" && /\/workouts\/\d+\/history$/.test(r.url()));
    await page.click(".modal-confirm");
    check("Reset sends the delete", (await reset).ok());
    await page.waitForFunction(() => !document.querySelector(".modal-confirm"));
    await page.waitForFunction(() => document.querySelector(".exercise-card.active .last-done-note"), { timeout: 15000 });
    await wait(400);
    check("after: the bench says its hints are from Other Day", (await note()) === `Last time: from Other Day, ${day}`, await note());
    check("after: and shows Other Day's numbers", (await hints())[0] === "50x5", (await hints()).join(", "));
    check("after: today's set is still on screen",
        (await page.$eval(".exercise-card.active .set-input-row .weight-input", i => i.value)) === "90");
    await t.shot("reset-workout-live-02-after");

    // 5. The dumbbell one was only done here: no hints left
    await page.click("#exercise-nav-next");
    await wait(500);
    check("after: the other exercise has no note", (await note()) === null, await note());
    const extraHints = await hints();
    check("after: and none of last time's numbers", !extraHints.some(h => /22\.5|x7/.test(h)), extraHints.join(", "));

    // 6. The server agrees
    check("this workout has no history left", (await t.api("GET", `/workouts/${workout.id}/history/count`)).sessions === 0);
    check("Other Day keeps its session", (await t.api("GET", `/workouts/${otherDay.id}/sessions`)).content.length === 1);
    const live = await t.api("GET", "/sessions/unfinished");
    const todays = await t.api("GET", `/sessions/${live.id}/sets`);
    check("today's set is still saved", todays.length === 1 && todays[0].weight === 90, JSON.stringify(todays));
});
