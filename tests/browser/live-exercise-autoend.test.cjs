/* Auto-end after exercises were changed during the workout (autoEnd.js):
   nobody's there to ask, so it records exactly today's list, for today
   only; the workout itself stays as it was. */
const { run } = require("./harness.cjs");

run({ prefix: "liveauto", workoutName: "Live Auto", exercises: 3 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const original = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    await t.startWorkout();

    // Log a set on the first, then remove the second.
    await t.logSet(40, 8);
    await t.goToPill(2);
    await page.click(".exercise-card.active .exercise-card-head .more-btn");
    await page.waitForSelector(".action-menu-item.danger");
    await page.click(".action-menu-item.danger");
    await page.waitForSelector(".modal-confirm");
    await page.click(".modal-confirm");
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 2, { timeout: 15000 });

    // Six hours pass with nothing logged; the app comes back to the screen.
    const finished = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url()), { timeout: 15000 });
    await page.evaluate(() => {
        const realNow = Date.now.bind(Date);
        Date.now = () => realNow() + 6 * 60 * 60 * 1000;
        document.dispatchEvent(new Event("visibilitychange"));
    });
    const body = JSON.parse((await finished).request().postData());
    check("auto-end sends today's list, today only",
        Array.isArray(body.exerciseIds) && body.exerciseIds.length === 2 && body.updateWorkout === false, JSON.stringify(body));
    await page.waitForSelector(".modal-confirm");
    check("it says it ended the workout", (await page.$eval(".modal-message", e => e.textContent)).includes("ended automatically"));

    const past = await t.api("GET", `/workouts/${workout.id}/sessions`);
    const last = (past.content || past)[0];
    const recorded = (await t.api("GET", `/sessions/${last.id}/exercises`)).map(e => e.name);
    check("history has today's two", JSON.stringify(recorded) === JSON.stringify([original[0], original[2]]), recorded.join(", "));
    const after = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    check("the workout itself is unchanged", JSON.stringify(after) === JSON.stringify(original), after.join(", "));
    check("today's list is cleared", await page.evaluate(() => localStorage.getItem("fitness.liveExercises") === null));
});
