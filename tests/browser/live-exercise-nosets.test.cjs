/* Finishing a live workout with nothing logged (no session yet) after
   changing its exercises: the same question as with sets. "Update" sets
   the workout's list (PUT /workouts/{id}/exercise-list); "Today only"
   changes nothing; with no changes nothing is asked. No session is ever
   saved. */
const { run } = require("./harness.cjs");

run({ prefix: "livenone", workoutName: "Live None", exercises: 3 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const original = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    const workoutNames = async () => (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    const titles = () => page.$$eval(".exercise-card .exercise-card-title", els => els.map(e => e.textContent));

    let listPuts = 0;
    page.on("request", r => { if (r.method() === "PUT" && /\/exercise-list$/.test(r.url())) listPuts++; });

    const toReview = () => t.toReview();
    async function removeShowing() {
        await page.click(".exercise-card.active .exercise-card-head .more-btn");
        await page.waitForSelector(".action-menu-item.danger");
        await page.click(".action-menu-item.danger");
        await page.waitForSelector(".modal-confirm");
        await page.click(".modal-confirm");
    }
    // Back on the Workouts list once the workout has closed.
    const closed = () => page.waitForFunction(() => !document.querySelector(".exercise-card")
        && !document.getElementById("summary-finish-btn"), { timeout: 15000 });

    // 1. Remove one, nothing logged, Finish: asked; Cancel stays
    await t.startWorkout();
    await t.goToPill(2);
    await removeShowing();
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 2, { timeout: 15000 });
    await page.waitForSelector(".exercise-card.active");
    await toReview();
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    check("nothing logged: Finish still asks", (await page.$eval(".modal-message", e => e.textContent)).includes("changed the exercises"));
    await t.shot("live-nosets-01-question");
    await page.click(".modal-choices .modal-cancel");
    await page.waitForFunction(() => !document.querySelector(".modal-choices"));
    await t.settle();
    check("Cancel stays on the review", (await page.$("#summary-finish-btn")) !== null);

    // 2. Update: the workout loses the removed one; no session is saved
    const put = page.waitForResponse(r => r.request().method() === "PUT" && /\/exercise-list$/.test(r.url()), { timeout: 15000 });
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(2)"); // Update Live None
    check("Update saves the list", (await put).status() === 204);
    await closed();
    check("the workout is updated", JSON.stringify(await workoutNames()) === JSON.stringify([original[0], original[2]]),
        (await workoutNames()).join(", "));
    const sessions = await t.api("GET", `/workouts/${workout.id}/sessions`);
    check("no session was saved", (sessions.content || sessions).length === 0);
    check("today's list is cleared", await page.evaluate(() => localStorage.getItem("fitness.liveExercises") === null));

    // 3. Next time: remove one again, Today only: the workout stays
    await t.startWorkout();
    check("starts with the updated list", JSON.stringify(await titles()) === JSON.stringify([original[0], original[2]]),
        (await titles()).join(", "));
    await removeShowing();
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 1, { timeout: 15000 });
    await page.waitForSelector(".exercise-card.active");
    await toReview();
    const putsBefore = listPuts;
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(1)"); // Today only
    await closed();
    check("Today only saves nothing", listPuts === putsBefore);
    check("the workout keeps its list", JSON.stringify(await workoutNames()) === JSON.stringify([original[0], original[2]]),
        (await workoutNames()).join(", "));

    // 4. No changes, nothing logged: nothing is asked
    await t.startWorkout();
    await toReview();
    await page.click("#summary-finish-btn");
    await closed();
    check("no changes: closes without asking", (await page.$(".modal-choice")) === null && listPuts === putsBefore);
});
