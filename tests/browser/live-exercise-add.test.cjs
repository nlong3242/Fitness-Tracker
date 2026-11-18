/* Adding exercises during a live workout (views/activeWorkout.js): the
   workout's ⋮ on the title line has Add exercise, which opens the picker
   without today's exercises. The new ones go at the end, today only, and
   survive a reload; Finish records them while the workout stays as it was. */
const { run } = require("./harness.cjs");
const { pickerStrip } = require("./pickerStrip.cjs");

run({ prefix: "liveadd", workoutName: "Live Add", exercises: 2 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const original = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    await t.startWorkout();

    const titles = () => page.$$eval(".exercise-card .exercise-card-title", els => els.map(e => e.textContent));
    const activeTitle = () => page.$eval(".exercise-card.active .exercise-card-title", e => e.textContent);
    const menuLabels = () => page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    async function openAdd() {
        await page.click(".workout-title-row .more-btn");
        await page.waitForSelector(".action-menu-item");
        await page.click(".action-menu-item:not(.danger)");
        await page.waitForSelector("#picker-list .picker-checkbox");
    }
    const pickerNames = () => page.$$eval(".picker-select-name", els =>
        els.map(e => e.textContent.replace(/Custom$/, "").trim()));
    // The live page drawn again, showing `name`.
    const showing = name => page.waitForFunction(n => {
        const title = document.querySelector(".exercise-card.active .exercise-card-title");
        return title && title.textContent === n;
    }, { timeout: 15000 }, name).then(() => t.settle());
    const finishPost = () => t.response("POST", /\/sessions\/\d+\/finish$/);

    // 1. The workout's ⋮: Add exercise, Reset, then Discard
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item");
    check("menu has Add exercise, Reset, then Discard", JSON.stringify(await menuLabels()) === JSON.stringify(["Add exercise", "Reset workout", "Discard workout"]),
        (await menuLabels()).join(", "));
    await t.shot("live-add-01-menu");
    await t.closeMenu();

    // 2. Cancel goes back to the same exercise, nothing added
    await t.goToPill(2);
    await openAdd();
    check("the picker leaves out today's exercises", !(await pickerNames()).some(n => original.includes(n)));
    await page.click("#picker-cancel-btn");
    await showing(original[1]);
    check("Cancel adds nothing", (await titles()).length === 2);
    check("Cancel returns to the same exercise", (await activeTitle()) === original[1], await activeTitle());

    // 3. Add two: they go at the end, the first of them showing
    await openAdd();
    await t.searchPicker("dumbbell");
    const rows = await page.$$("#picker-list .picker-select-row");
    const added = [];
    for (const row of rows.slice(0, 2)) {
        added.push(await row.$eval(".picker-select-name", e => e.textContent.replace(/Custom$/, "").trim()));
        await row.click();
    }
    check("the button says Add 2 exercises",
        await t.waitFor(() => document.getElementById("picker-add-btn").textContent === "Add 2 exercises"),
        await page.$eval("#picker-add-btn", b => b.textContent));
    // The Add bar slides up; measure it once it has stopped.
    await t.waitFor(() => document.getAnimations().every(a => a.playState !== "running" || a.effect.getTiming().iterations === Infinity));
    const strip = await pickerStrip(page);
    check("Add floats on a page-like strip from its top edge to the tab bar, grid lined up, nothing showing through",
        strip.shown && strip.pageLike && strip.fromBarTop && strip.toNav && strip.gridOk && strip.covered, JSON.stringify(strip));
    await page.evaluate(() => document.getElementById("app-scroll").scrollBy(0, 300));
    await t.settle();
    await t.shot("live-add-02-picker");
    await page.click("#picker-add-btn");
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 4, { timeout: 15000 });
    await showing(added[0]);
    check("added at the end", JSON.stringify(await titles()) === JSON.stringify([...original, ...added]), (await titles()).join(", "));
    check("the first added one is showing", (await activeTitle()) === added[0], await activeTitle());
    await t.shot("live-add-03-added");

    // 4. Survives a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.appStarted();
    await page.waitForSelector(".exercise-card.active");
    await t.settle();
    check("still there after a reload", JSON.stringify(await titles()) === JSON.stringify([...original, ...added]), (await titles()).join(", "));

    // 5. An added exercise logs sets like any other (logSet waits for the save)
    await t.logSet(12, 10);
    check("a set on an added exercise saves",
        (await page.$$(".exercise-card.active .set-input-row.saved")).length === 1);

    // 6. Finish → "Update Live Add": history and the workout both get all four
    await t.toReview();
    const finished = finishPost();
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(2)"); // Update Live Add
    const body = JSON.parse((await finished).request().postData());
    check("Finish sends update the workout", body.updateWorkout === true && body.exerciseIds.length === 4, JSON.stringify(body));
    // The finished summary (not the review, which also has a Back) is up.
    await page.waitForFunction(() => /\/sessions\/\d+/.test(location.hash)
        && !document.getElementById("summary-finish-btn")
        && document.getElementById("summary-back-btn"), { timeout: 15000 });
    await t.settle();
    const past = await t.api("GET", `/workouts/${workout.id}/sessions`);
    const last = (past.content || past)[0];
    const recorded = (await t.api("GET", `/sessions/${last.id}/exercises`)).map(e => e.name);
    check("history has today's four", JSON.stringify(recorded) === JSON.stringify([...original, ...added]), recorded.join(", "));
    const after = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    check("the workout now has all four", JSON.stringify(after) === JSON.stringify([...original, ...added]), after.join(", "));

    // 7. Next time it starts with all four, and Finish asks nothing (no changes)
    await t.startWorkout();
    await t.settle();
    check("the next workout has all four", JSON.stringify(await titles()) === JSON.stringify([...original, ...added]), (await titles()).join(", "));
    await t.logSet(30, 5);
    await t.toReview();
    const finished2 = finishPost();
    await page.click("#summary-finish-btn");
    const body2 = JSON.parse((await finished2).request().postData());
    check("no changes: no question, finished as before", (await page.$(".modal-choice")) === null && !("exerciseIds" in body2),
        JSON.stringify(body2));
});
