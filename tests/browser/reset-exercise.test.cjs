/* Reset exercise (views/exercisePage.js): the exercise page's ⋮ has Reset
   exercise, which says how many sets go, always asks, and then deletes the
   exercise's finished history in every workout. Another exercise's history,
   a workout in progress and the exercise itself stay. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "resetex", workoutName: "Reset Test", exercises: 2 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench, other] = await t.api("GET", `/workouts/${workout.id}/exercises`);

    // Two finished workouts with the bench (3 sets), one also with the other exercise.
    const done = async sets => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        // (the other exercise is a reps-only one: no weight)
        for (const [ex, w] of sets) await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${ex.id}`,
            ex === bench ? { weight: w, reps: 5 } : { reps: w });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
        return s;
    };
    await done([[bench, 60], [bench, 65]]);
    const mixed = await done([[bench, 70], [other, 20]]);

    const open = async id => {
        await page.goto(page.url().split("#")[0] + `#/exercises/${id}/history`, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(".exh-sessions, .exh-empty:not(:empty)");
        await wait(500);
    };
    const menu = async () => {
        await page.click(".page-top .more-btn");
        await page.waitForSelector(".action-menu-item");
        return page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    };
    const message = () => page.$eval(".modal-message", e => e.textContent);

    // 1. In the ⋮, red, after Edit
    await open(bench.id);
    const items = await menu();
    check("⋮ has Reset exercise after Edit", items[0] === "Edit exercise" && items[1] === "Reset exercise", items.join(", "));
    check("Reset is red", await page.$$eval(".action-menu-item", els => els[1].classList.contains("danger")));
    await t.shot("reset-exercise-01-menu");

    // 2. Asks, with the count; Cancel keeps everything
    await page.click(".action-menu-item:nth-child(2)");
    await page.waitForSelector(".modal-confirm");
    const asked = await message();
    check("asks with how much goes",
        asked === `Reset ${bench.name}? All 3 sets you've logged for it, in 2 workouts, are deleted. This can't be undone.`, asked);
    check("the button says Reset", (await page.$eval(".modal-confirm", b => b.textContent)) === "Reset");
    await t.shot("reset-exercise-02-confirm");
    await page.click(".modal-cancel");
    await wait(300);
    check("Cancel keeps the history", (await t.api("GET", `/exercises/${bench.id}/history/count`)).sets === 3);

    // 3. Reset: history empty, page shows it
    await menu();
    await page.click(".action-menu-item:nth-child(2)");
    await page.waitForSelector(".modal-confirm");
    const reset = page.waitForResponse(r => r.request().method() === "DELETE" && /\/exercises\/\d+\/history$/.test(r.url()));
    await page.click(".modal-confirm");
    check("Reset sends the delete", (await reset).ok());
    await page.waitForSelector(".exh-empty");
    await wait(300);
    check("the History tab shows no history", /No finished sessions yet/.test(await page.$eval(".exh-empty", e => e.textContent)));
    check("the server has none left", (await t.api("GET", `/exercises/${bench.id}/history/count`)).sets === 0);
    await t.shot("reset-exercise-03-after");

    // 4. What stays
    const sessions = (await t.api("GET", `/workouts/${workout.id}/sessions`)).content.map(s => s.id);
    check("the session with only the bench is gone, the mixed one stays",
        sessions.length === 1 && sessions[0] === mixed.id, JSON.stringify(sessions));
    check("the other exercise keeps its history", (await t.api("GET", `/exercises/${other.id}/history/count`)).sets === 1);
    const still = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.id);
    check("the bench is still in the workout", still.includes(bench.id));

    // 5. Nothing to reset: says so
    await menu();
    await page.click(".action-menu-item:nth-child(2)");
    await page.waitForSelector(".modal-confirm");
    check("nothing left: says so", (await message()) === `${bench.name} has no history to reset.`, await message());
    await page.click(".modal-confirm");
});
