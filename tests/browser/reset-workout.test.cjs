/* Reset workout (views/workouts.js workoutMenu): the workout's ⋮, on its
   page and on the list, has Reset workout, which says how much goes,
   always asks, and then deletes every finished session of it. The workout
   and its exercises stay. */
const { run } = require("./harness.cjs");

run({ prefix: "resetwk", workoutName: "Reset Workout Test", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);

    // Two finished workouts: 2 sets, then 1.
    const done = async weights => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        for (const w of weights) await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: w, reps: 5 });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
    };
    await done([60, 65]);
    await done([70]);

    const openPage = async () => {
        await page.goto(page.url().split("#")[0] + `#/workouts/${workout.id}`, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await t.appStarted();
        await page.waitForSelector(".page-top .more-btn");
        await t.settle();
    };
    const menu = async selector => {
        await page.click(selector);
        await page.waitForSelector(".action-menu-item");
        return page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    };
    const pickReset = async items => {
        await page.click(`.action-menu-item:nth-child(${items.indexOf("Reset workout") + 1})`);
        await page.waitForSelector(".modal-confirm");
    };
    const message = () => page.$eval(".modal-message", e => e.textContent);

    // 1. On the workout's page: in the ⋮, red, just before Delete
    await openPage();
    let items = await menu(".page-top .more-btn");
    const at = items.indexOf("Reset workout");
    check("⋮ has Reset workout just before Delete", at >= 0 && items[at + 1] === "Delete workout", items.join(", "));
    check("Reset is red", await page.$$eval(".action-menu-item", (els, i) => els[i].classList.contains("danger"), at));
    await t.shot("reset-workout-01-menu");

    // 2. Asks, with the count; Cancel keeps everything
    await pickReset(items);
    const asked = await message();
    check("asks with how much goes",
        asked === `Reset ${workout.name}? All 2 workouts you've done of it are deleted, with their 3 sets. This can't be undone.`, asked);
    check("the button says Reset", (await page.$eval(".modal-confirm", b => b.textContent)) === "Reset");
    await t.shot("reset-workout-02-confirm");
    await page.click(".modal-cancel");
    await t.settle();
    check("Cancel keeps the history", (await t.api("GET", `/workouts/${workout.id}/history/count`)).sessions === 2);

    // 3. Reset: sessions gone, still on the workout's page
    items = await menu(".page-top .more-btn");
    await pickReset(items);
    const reset = page.waitForResponse(r => r.request().method() === "DELETE" && /\/workouts\/\d+\/history$/.test(r.url()));
    await page.click(".modal-confirm");
    check("Reset sends the delete", (await reset).ok());
    await page.waitForSelector(".page-top .more-btn");
    await t.settle();
    check("still on the workout's page", page.url().endsWith(`#/workouts/${workout.id}`), page.url());
    check("no sessions left", (await t.api("GET", `/workouts/${workout.id}/sessions`)).content.length === 0);
    check("the bench's history is gone too", (await t.api("GET", `/exercises/${bench.id}/history/count`)).sets === 0);
    await t.shot("reset-workout-03-after");

    // 4. What stays
    const workouts = await t.api("GET", "/workouts");
    check("the workout stays", workouts.some(w => w.id === workout.id));
    const still = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.id);
    check("its exercise stays", still.length === 1 && still[0] === bench.id);

    // 5. From the list's ⋮, with nothing left: says so
    await page.goto(page.url().split("#")[0] + "#/workouts", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.appStarted();
    await page.waitForSelector(".workout-row .more-btn");
    await t.settle();
    items = await menu(".workout-row .more-btn");
    await pickReset(items);
    check("nothing left: says so", (await message()) === `${workout.name} has no history to reset.`, await message());
    await page.click(".modal-confirm");
    await t.settle();
});
