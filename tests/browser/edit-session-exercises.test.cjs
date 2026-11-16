/* Whole exercises in a finished workout (views/editSession.js): the title's
   ⋮ has Add exercise, each card's ⋮ Replace / Remove / Reset exercise, as
   live. Changes are that day's only: the workout's own list stays. Logged
   sets that go are asked about first; Remove isn't offered on the last
   exercise; Reset of the only exercise logged deletes the workout and
   goes to its Past sessions. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "edexer", workoutName: "Past Exercises", exercises: 2 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [first, second] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    // Custom weight × reps ones to add, easy to find in the picker.
    const fly = await t.api("POST", "/exercises", { name: "Edexer Fly", category: "CHEST" });
    const dip = await t.api("POST", "/exercises", { name: "Edexer Dip", category: "CHEST" });

    const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${first.id}`, { weight: 80, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${first.id}`, { weight: 80, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${second.id}`,
        second.logType === "REPS" ? { reps: 10 } : { weight: 40, reps: 10 });
    await t.api("POST", `/sessions/${s.id}/finish`, {});

    const base = page.url().split("#")[0];
    const titles = () => page.$$eval(".exercise-card .exercise-card-title", els => els.map(e => e.textContent));
    const activeTitle = () => page.$eval(".exercise-card.active .exercise-card-title", e => e.textContent);
    const snapshot = async () => (await t.api("GET", `/sessions/${s.id}/exercises`)).map(e => e.exerciseId);
    const setsOf = async id => (await t.api("GET", `/sessions/${s.id}/sets`)).filter(x => x.exerciseId === id).length;
    const workoutList = async () => (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.id);
    const menuLabels = () => page.$$eval(".action-menu-item", els => els.map(e => e.textContent));
    const openMenu = async selector => {
        await page.click(selector);
        await page.waitForSelector(".action-menu-item");
    };
    const cardMenu = () => openMenu(".exercise-card.active .exercise-card-head .more-btn");
    const closeMenu = async () => {
        await page.click(".action-menu-backdrop");
        await wait(200);
    };
    const choose = async label => {
        for (const item of await page.$$(".action-menu-item")) {
            if ((await item.evaluate(e => e.textContent)) === label) return item.click();
        }
        throw new Error(`no menu item ${label}`);
    };
    const confirmText = async () => {
        await page.waitForSelector(".modal-confirm");
        return page.$eval(".modal-message", e => e.textContent);
    };
    // The page after a change: rebuilt on `name`.
    const onExercise = async name => {
        await page.waitForFunction(n => {
            const t = document.querySelector(".exercise-card.active .exercise-card-title");
            return t && t.textContent === n && document.querySelector("#edit-session-back-btn");
        }, { timeout: 15000 }, name);
        await wait(400);
    };
    const pick = async name => {
        await page.waitForSelector("#picker-list .picker-checkbox");
        await page.type("#picker-search", name);
        await wait(300);
        await page.click("#picker-list .picker-select-row");
        await wait(400);
        await page.click("#picker-add-btn");
    };
    const logSet = async (weight, reps) => {
        await page.click(".exercise-card.active > .add-set-btn");
        const row = (await page.$$(".exercise-card.active .set-input-row")).pop();
        const posted = page.waitForResponse(r =>
            r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()), { timeout: 15000 });
        await (await row.$(".weight-input")).type(String(weight));
        await (await row.$(".reps-input")).type(String(reps));
        await page.evaluate(() => document.activeElement.blur());
        await posted;
        await wait(300);
    };

    await page.goto(base + `#/workouts/${workout.id}/sessions/${s.id}/edit?date=${s.date}&exercise=${first.id}`,
        { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await onExercise(first.name);

    // 1. The menus
    await openMenu(".workout-title-row .more-btn");
    check("title ⋮: Add exercise only", JSON.stringify(await menuLabels()) === JSON.stringify(["Add exercise"]),
        (await menuLabels()).join(", "));
    await closeMenu();
    await cardMenu();
    check("card ⋮: Replace, Remove, Reset",
        JSON.stringify(await menuLabels()) === JSON.stringify(["Replace exercise", "Remove exercise", "Reset exercise"]),
        (await menuLabels()).join(", "));
    await t.shot("edit-exercises-01-menu");
    await closeMenu();

    // 2. Add: Cancel comes back; then the picked one goes at the end and takes sets
    await openMenu(".workout-title-row .more-btn");
    await choose("Add exercise");
    await page.waitForSelector("#picker-list .picker-checkbox");
    const pickerNames = await page.$$eval(".picker-select-name", els => els.map(e => e.textContent));
    check("the picker leaves out the workout's exercises",
        !pickerNames.some(n => n.startsWith(first.name) || n.startsWith(second.name)));
    await page.click("#picker-cancel-btn");
    await onExercise(first.name);
    check("Cancel: back on the same exercise", (await activeTitle()) === first.name);

    await openMenu(".workout-title-row .more-btn");
    await choose("Add exercise");
    await pick("Edexer Fly");
    await onExercise(fly.name);
    check("added at the end, showing", JSON.stringify(await titles()) === JSON.stringify([first.name, second.name, fly.name]),
        (await titles()).join(", "));
    check("the route follows", page.url().includes(`exercise=${fly.id}`), page.url());
    check("no tab bar", await page.evaluate(() => document.body.classList.contains("nav-hidden")));
    await logSet(20, 12);
    check("its set saved to that workout", (await setsOf(fly.id)) === 1);
    check("the workout's own list stays", JSON.stringify(await workoutList()) === JSON.stringify([first.id, second.id]));

    // 3. Replace it (a set logged): asks, then the new one takes its place
    await cardMenu();
    await choose("Replace exercise");
    await pick("Edexer Dip");
    let msg = await confirmText();
    check("replacing asks about the logged set", msg.includes("The set you logged for Edexer Fly") && msg.includes("Edexer Dip"), msg);
    await page.click(".modal-confirm");
    await onExercise(dip.name);
    check("the replacement takes its place", JSON.stringify(await snapshot()) === JSON.stringify([first.id, second.id, dip.id]),
        JSON.stringify(await snapshot()));
    check("the old one's set is gone", (await setsOf(fly.id)) === 0);
    await logSet(15, 8);

    // 4. Remove the second (a set logged): asks, the next one shows
    await page.click("#exercise-pills .exercise-pill:nth-child(2)");
    await wait(300);
    await cardMenu();
    await choose("Remove exercise");
    msg = await confirmText();
    check("removing asks about the logged set", msg.startsWith(`Remove ${second.name}?`) && msg.includes("The set you logged for it"), msg);
    await t.shot("edit-exercises-02-remove-confirm");
    await page.click(".modal-confirm");
    await onExercise(dip.name);
    check("removed; the next one shows", JSON.stringify(await titles()) === JSON.stringify([first.name, dip.name]),
        (await titles()).join(", "));
    check("its set is gone", (await setsOf(second.id)) === 0);

    // 5. Back: the summary shows the change
    const put = page.waitForResponse(r => r.url().includes(`/sessions/${s.id}/exercises`) && r.request().method() === "GET");
    await page.click("#edit-session-back-btn");
    await put;
    await page.waitForSelector(".summary-exercise-card");
    await wait(500);
    const summaryNames = await page.$$eval(".summary-exercise-card .summary-exercise-name", els => els.map(e => e.textContent.trim()));
    check("Back: the summary shows the change", summaryNames.length === 2 && summaryNames[1].startsWith(dip.name), summaryNames.join(", "));
    await (await page.$$(".summary-exercise-card .summary-exercise-count"))[1].click();
    await onExercise(dip.name);

    // 6. Reset the Dip (logged here, the Bench too): it leaves this workout
    await cardMenu();
    await choose("Reset exercise");
    msg = await confirmText();
    check("Reset says it leaves this workout", msg.includes("taken out of this workout too"), msg);
    await page.click(".modal-confirm");
    await onExercise(first.name);
    check("reset: gone from the workout", JSON.stringify(await titles()) === JSON.stringify([first.name]), (await titles()).join(", "));
    await cardMenu();
    check("one left: no Remove", JSON.stringify(await menuLabels()) === JSON.stringify(["Replace exercise", "Reset exercise"]),
        (await menuLabels()).join(", "));

    // 7. Reset the only one logged: the workout goes, so does the page
    await choose("Reset exercise");
    msg = await confirmText();
    check("Reset says the workout goes too", msg.includes("so it's deleted too"), msg);
    await page.click(".modal-confirm");
    await page.waitForFunction(() => location.hash.endsWith("/sessions") && !document.querySelector("#edit-session-back-btn"),
        { timeout: 15000 });
    await wait(400);
    check("then its Past sessions", page.url().endsWith(`#/workouts/${workout.id}/sessions`), page.url());
    check("the tab bar is back", !(await page.evaluate(() => document.body.classList.contains("nav-hidden"))));
    const left = await t.api("GET", `/workouts/${workout.id}/sessions`);
    check("the workout is deleted", left.content.length === 0, JSON.stringify(left.content.map(x => x.id)));
    check("the workout's own list still stays", JSON.stringify(await workoutList()) === JSON.stringify([first.id, second.id]));
    await t.shot("edit-exercises-03-gone");
});
