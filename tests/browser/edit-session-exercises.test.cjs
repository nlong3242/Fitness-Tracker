/* Whole exercises in a finished workout (views/editSession.js): the title's
   ⋮ has Add exercise, each card's ⋮ Replace / Remove / Reset exercise, as
   live. Changes are that day's only: the workout's own list stays. Logged
   sets that go are asked about first; Remove isn't offered on the last
   exercise. Reset keeps the exercise here with empty rows. A workout left
   with no sets at all (Reset or ✕) is tidied away when the page is left,
   or at the next start if the app closed on it. */
const { run } = require("./harness.cjs");

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
        await page.mouse.click(4, 4); // outside the menu: the backdrop
        await page.waitForFunction(() => !document.querySelector(".action-menu-item"));
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
        await t.settle(); // its data in, the page drawn with it
    };
    const pick = async name => {
        await page.waitForSelector("#picker-list .picker-checkbox");
        await page.type("#picker-search", name);
        // The list has narrowed to it, then picking it enables Add.
        await page.waitForFunction(n => {
            const rows = document.querySelectorAll("#picker-list .picker-select-row");
            return rows.length > 0 && rows[0].textContent.includes(n);
        }, {}, name);
        await page.click("#picker-list .picker-select-row");
        await page.waitForSelector("#picker-add-btn:not([disabled])");
        await page.click("#picker-add-btn");
    };
    const logSet = async (weight, reps) => {
        await page.click(".exercise-card.active > .add-set-btn");
        const row = (await page.$$(".exercise-card.active .set-input-row")).pop();
        const posted = t.response("POST", /\/sets\?exerciseId=/);
        await (await row.$(".weight-input")).type(String(weight));
        await (await row.$(".reps-input")).type(String(reps));
        await page.evaluate(() => document.activeElement.blur());
        await posted;
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll(".exercise-card.active .set-input-row");
            return rows.length > 0 && rows[rows.length - 1].classList.contains("saved");
        });
    };
    // Waits for a Reset to finish and the page to be rebuilt on `name`.
    const afterReset = async (reset, name) => {
        await reset;
        await t.settle();
        await onExercise(name);
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
    await onExercise(second.name);
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
    const put = t.response("GET", new RegExp(`/sessions/${s.id}/exercises`));
    await page.click("#edit-session-back-btn");
    await put;
    await page.waitForSelector(".summary-exercise-card");
    await t.settle();
    const summaryNames = await page.$$eval(".summary-exercise-card .summary-exercise-name", els => els.map(e => e.textContent.trim()));
    check("Back: the summary shows the change", summaryNames.length === 2 && summaryNames[1].startsWith(dip.name), summaryNames.join(", "));
    await (await page.$$(".summary-exercise-card .summary-exercise-count"))[1].click();
    await onExercise(dip.name);

    // A Reset's request, to wait on before the page rebuilds.
    const resetDone = () => page.waitForResponse(r => r.request().method() === "DELETE" && r.url().includes("/history?keepSessionId="));

    // 6. Reset the Dip: it stays here with empty rows; logging again keeps the workout
    await cardMenu();
    await choose("Reset exercise");
    msg = await confirmText();
    check("Reset says it stays in this workout", msg.includes("It stays in this workout, with no sets"), msg);
    let reset = resetDone();
    await page.click(".modal-confirm");
    await afterReset(reset, dip.name);
    check("reset: still in the workout", JSON.stringify(await titles()) === JSON.stringify([first.name, dip.name]),
        (await titles()).join(", "));
    check("reset: its sets are gone", (await setsOf(dip.id)) === 0);
    check("reset: no saved rows", (await page.$$(".exercise-card.active .set-input-row.saved")).length === 0);
    await logSet(17.5, 6);
    await page.click("#edit-session-back-btn");
    await page.waitForSelector(".summary-exercise-card");
    await t.settle();
    check("logged again: Back to its summary, kept", page.url().includes(`/sessions/${s.id}?date=`), page.url());

    // 7. Reset it again and Remove it (no sets: the plain question); one left: no Remove
    await (await page.$$(".summary-exercise-card .summary-exercise-count"))[1].click();
    await onExercise(dip.name);
    await cardMenu();
    await choose("Reset exercise");
    await confirmText();
    reset = resetDone();
    await page.click(".modal-confirm");
    await afterReset(reset, dip.name);
    await cardMenu();
    await choose("Remove exercise");
    msg = await confirmText();
    check("removing one with no sets: the plain question", msg === `Remove ${dip.name} from this workout?`, msg);
    await page.click(".modal-confirm");
    await onExercise(first.name);
    await cardMenu();
    check("one left: no Remove", JSON.stringify(await menuLabels()) === JSON.stringify(["Replace exercise", "Reset exercise"]),
        (await menuLabels()).join(", "));

    // 8. Reset the Bench, the last sets: kept while here (even over a
    //    reload), tidied away on leaving with nothing logged
    await choose("Reset exercise");
    await confirmText();
    reset = resetDone();
    await page.click(".modal-confirm");
    await afterReset(reset, first.name);
    check("emptied but still here", (await t.api("GET", `/sessions/${s.id}/sets`)).length === 0
        && JSON.stringify(await snapshot()) === JSON.stringify([first.id]), JSON.stringify(await snapshot()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await onExercise(first.name);
    check("a reload: still there", (await t.api("GET", `/workouts/${workout.id}/sessions`)).content.length === 1);
    await page.click("#edit-session-back-btn");
    await page.waitForFunction(() => location.hash.endsWith("/sessions") && !document.querySelector("#edit-session-back-btn"),
        { timeout: 15000 });
    await t.settle();
    check("Back: its Past sessions", page.url().endsWith(`#/workouts/${workout.id}/sessions`), page.url());
    check("the tab bar is back", !(await page.evaluate(() => document.body.classList.contains("nav-hidden"))));
    let left = await t.api("GET", `/workouts/${workout.id}/sessions`);
    check("the emptied workout is tidied away", left.content.length === 0, JSON.stringify(left.content.map(x => x.id)));
    check("the workout's own list still stays", JSON.stringify(await workoutList()) === JSON.stringify([first.id, second.id]));
    await t.shot("edit-exercises-03-gone");

    // A finished workout with one bench set, its editing page open.
    const openOneSet = async () => {
        const one = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        await t.api("POST", `/sessions/${one.id}/sets?exerciseId=${first.id}`, { weight: 70, reps: 5 });
        await t.api("POST", `/sessions/${one.id}/finish`, {});
        await page.goto(base + `#/workouts/${workout.id}/sessions/${one.id}/edit?date=${one.date}&exercise=${first.id}`,
            { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await onExercise(first.name);
        const del = page.waitForResponse(r => r.request().method() === "DELETE" && /\/sets\/\d+$/.test(r.url()));
        await page.click(".exercise-card.active .set-input-row .set-input-cancel");
        await del;
        await t.settle();
        return one;
    };

    // 9. Every set deleted by hand (✕): tidied away on Back too
    await openOneSet();
    await page.click("#edit-session-back-btn");
    await page.waitForFunction(() => location.hash.endsWith("/sessions") && !document.querySelector("#edit-session-back-btn"),
        { timeout: 15000 });
    left = await t.api("GET", `/workouts/${workout.id}/sessions`);
    check("✕ every set, Back: tidied away", left.content.length === 0, JSON.stringify(left.content.map(x => x.id)));

    // 10. The app closed on the page instead: tidied at the next start
    const closed = await openOneSet();
    check("still there while the app is shut", (await t.api("GET", `/workouts/${workout.id}/sessions`)).content.length === 1);
    const tidied = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes(`/sessions/${closed.id}/remove-if-empty`));
    await page.goto(base + "#/home", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await tidied;
    left = await t.api("GET", `/workouts/${workout.id}/sessions`);
    check("next start: tidied away", left.content.length === 0, JSON.stringify(left.content.map(x => x.id)));
    // The note is cleared once the tidy's answer is in (the step that failed on a slow machine).
    const cleared = await t.waitFor(() => localStorage.getItem("fitness.tidyAfterEdit") === "[]");
    check("and no longer noted", cleared, await page.evaluate(() => localStorage.getItem("fitness.tidyAfterEdit")));
});
