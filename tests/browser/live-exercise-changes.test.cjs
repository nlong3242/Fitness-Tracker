/* Changing exercises during a live workout (views/activeWorkout.js): each
   card's ⋮ has Replace and Remove, for today only. Logged sets of a
   removed or replaced exercise are deleted after asking. Today's list
   survives a reload, and Finish records exactly it while the workout
   itself stays as it was. */
const { run, wait } = require("./harness.cjs");
const { pickerStrip } = require("./pickerStrip.cjs");

run({ prefix: "livechg", workoutName: "Live Changes", exercises: 3 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const original = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    await t.startWorkout();

    const titles = () => page.$$eval(".exercise-card .exercise-card-title", els => els.map(e => e.textContent));
    const activeTitle = () => page.$eval(".exercise-card.active .exercise-card-title", e => e.textContent);
    const pillCount = n => page.waitForFunction(
        k => document.querySelectorAll("#exercise-pills .exercise-pill").length === k, { timeout: 15000 }, n);
    const menuLabels = () => page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    async function openMenu() {
        await page.click(".exercise-card.active .exercise-card-head .more-btn");
        await page.waitForSelector(".action-menu-item");
    }
    async function choose(label) {
        const items = await page.$$(".action-menu-item");
        for (const item of items) {
            if ((await item.evaluate(e => e.textContent)) === label) return item.click();
        }
        throw new Error(`no menu item ${label}`);
    }
    async function goTo(n) {
        await page.click(`#exercise-pills .exercise-pill:nth-child(${n})`);
        await wait(300);
    }
    async function logSet(weight, reps) {
        await page.click(".exercise-card.active > .add-set-btn");
        const row = (await page.$$(".exercise-card.active .set-input-row")).pop();
        const posted = page.waitForResponse(r =>
            r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()), { timeout: 15000 });
        await (await row.$(".weight-input")).type(String(weight));
        await (await row.$(".reps-input")).type(String(reps));
        await page.evaluate(() => document.activeElement.blur());
        await posted;
        await wait(300);
    }
    const confirmText = async () => {
        await page.waitForSelector(".modal-confirm");
        return page.$eval(".modal-message", e => e.textContent);
    };

    // 1. The ⋮ on each card: Replace and Remove
    check("starts with the workout's 3", JSON.stringify(await titles()) === JSON.stringify(original), (await titles()).join(", "));
    await openMenu();
    check("menu has Replace, Remove and Reset", JSON.stringify(await menuLabels()) === JSON.stringify(["Replace exercise", "Remove exercise", "Reset exercise"]),
        (await menuLabels()).join(", "));
    await t.shot("live-changes-01-menu");
    await page.click(".action-menu-backdrop");
    await wait(200);

    // 2. Remove an exercise with nothing logged: asks, then it's gone
    await goTo(2);
    await openMenu();
    await choose("Remove exercise");
    let msg = await confirmText();
    check("removing asks first", msg.includes(original[1]) && !msg.includes("deleted"), msg);
    await page.click(".modal-cancel");
    await wait(300);
    check("Cancel keeps it", (await titles()).length === 3);
    await openMenu();
    await choose("Remove exercise");
    await confirmText();
    await page.click(".modal-confirm");
    await pillCount(2);
    await page.waitForSelector(".exercise-card.active");
    check("it's gone from today", JSON.stringify(await titles()) === JSON.stringify([original[0], original[2]]), (await titles()).join(", "));
    check("the next one is showing", (await activeTitle()) === original[2], await activeTitle());

    // 3. Today's list survives a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".exercise-card.active");
    await wait(500);
    check("still removed after a reload", JSON.stringify(await titles()) === JSON.stringify([original[0], original[2]]), (await titles()).join(", "));

    // 4. Replace an exercise with a set logged: asks, deletes the set
    await goTo(1);
    await logSet(40, 8);
    const sessionId = (await t.api("GET", "/sessions/unfinished")).id;
    await openMenu();
    await choose("Replace exercise");
    await page.waitForSelector("#picker-search");
    await page.waitForSelector("#picker-list .picker-checkbox");
    const pickerNames = await page.$$eval(".picker-select-name", els => els.map(e => e.textContent));
    check("the picker leaves out today's exercises", !pickerNames.some(n => n.startsWith(original[0]) || n.startsWith(original[2])));
    await page.type("#picker-search", "dumbbell");
    await wait(300);
    const pick = await page.$("#picker-list .picker-select-row");
    const newName = await pick.$eval(".picker-select-name", e => e.textContent.replace(/Custom$/, "").trim());
    await pick.click();
    await wait(400);
    const strip = await pickerStrip(page);
    check("Replace floats on a page-like strip from its top edge to the tab bar, grid lined up, nothing showing through",
        strip.shown && strip.pageLike && strip.fromBarTop && strip.toNav && strip.gridOk && strip.covered, JSON.stringify(strip));
    await t.shot("live-changes-replace-bar");
    await page.click("#picker-add-btn");
    msg = await confirmText();
    check("replacing asks about the logged set", msg.includes("The set you logged") && msg.includes(newName), msg);
    await t.shot("live-changes-02-replace-confirm");
    await page.click(".modal-confirm");
    await page.waitForSelector(".exercise-card.active");
    await wait(500);
    check("the new one takes its place", JSON.stringify(await titles()) === JSON.stringify([newName, original[2]]), (await titles()).join(", "));
    check("and is showing", (await activeTitle()) === newName, await activeTitle());
    const left = await t.api("GET", `/sessions/${sessionId}/sets`).catch(() => []);
    check("the logged set is deleted", (left || []).length === 0, JSON.stringify(left));
    await t.shot("live-changes-03-replaced");

    // 5. With one exercise left there's no Remove
    await goTo(2);
    await openMenu();
    await choose("Remove exercise");
    await confirmText();
    await page.click(".modal-confirm");
    await pillCount(1);
    await page.waitForSelector(".exercise-card.active");
    await openMenu();
    check("last one: Replace and Reset, no Remove", JSON.stringify(await menuLabels()) === JSON.stringify(["Replace exercise", "Reset exercise"]), (await menuLabels()).join(", "));
    await page.click(".action-menu-backdrop");
    await wait(200);

    // 6. Finish records exactly today's list; the workout stays as it was
    await logSet(20, 10);
    for (let i = 0; i < 5 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }
    let finishPosts = 0;
    const countFinish = r => { if (r.method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url())) finishPosts++; };
    page.on("request", countFinish);
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    const question = await page.$eval(".modal-message", e => e.textContent);
    const choices = await page.$$eval(".modal-choices button", els => els.map(e => e.textContent));
    check("Finish asks: today only or update the workout", question.includes("changed the exercises")
        && JSON.stringify(choices) === JSON.stringify(["Today only", `Update ${workout.name}`, "Cancel"]), choices.join(" | "));
    await t.shot("live-changes-04-finish-question");
    await page.click(".modal-choices .modal-cancel");
    await wait(400);
    check("Cancel stays on the review, not finished", finishPosts === 0 && (await page.$("#summary-finish-btn")) !== null);
    page.off("request", countFinish);

    const finished = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url()), { timeout: 15000 });
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(1)"); // Today only
    const body = JSON.parse((await finished).request().postData());
    check("Finish sends today's list, today only", JSON.stringify(body.exerciseIds || []).length > 2 && body.updateWorkout === false,
        JSON.stringify(body));
    const past = await t.api("GET", `/workouts/${workout.id}/sessions`);
    const last = (past.content || past)[0];
    const recorded = (await t.api("GET", `/sessions/${last.id}/exercises`)).map(e => e.name);
    check("history has exactly today's exercise", JSON.stringify(recorded) === JSON.stringify([newName]), recorded.join(", "));
    const after = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    check("the workout itself is unchanged", JSON.stringify(after) === JSON.stringify(original), after.join(", "));
    check("today's list is cleared", await page.evaluate(() => localStorage.getItem("fitness.liveExercises") === null));
});
