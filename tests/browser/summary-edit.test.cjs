/* A finished summary's exercise box opens it for editing (views/summary.js
   → views/editSession.js); its name still opens the details and its notes
   still work. Back returns to the same summary, showing the change: from
   Past sessions, right after Finish, and from a calendar day. */
const { run } = require("./harness.cjs");

run({ prefix: "sumedit", workoutName: "Summary Edit", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const base = page.url().split("#")[0];

    const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 80, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/finish`, {});

    const openSummary = async hash => {
        await page.goto(base + hash, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await t.appStarted();
        await page.waitForSelector(".summary-exercise-card");
        await t.settle();
    };
    const firstWeight = () => page.$eval(".summary-exercise-card .summary-set-row .summary-set-cell",
        c => c.firstChild.textContent.trim());
    const onEditPage = () => page.$("#edit-session-back-btn").then(Boolean);
    const changeWeight = async text => {
        const el = await page.$(".exercise-card.active .set-input-row .weight-input");
        await el.evaluate(e => { e.focus(); e.value = ""; });
        await el.type(text);
    };
    const backToSummary = async () => {
        const put = page.waitForResponse(r => r.request().method() === "PUT" && /\/sets\/\d+$/.test(r.url()));
        await page.click("#edit-session-back-btn");   // leaving the row saves it
        await put;
        await page.waitForSelector(".summary-exercise-card");
        await t.settle();
    };

    // 1. From Past sessions: the name opens the details, not the editing page
    await openSummary(`#/workouts/${workout.id}/sessions/${s.id}?date=${s.date}`);
    check("the box looks tappable", await page.$eval(".summary-exercise-card", c => c.classList.contains("clickable")));
    await page.click(".summary-exercise-card .summary-exercise-name");
    await page.waitForSelector(".modal-overlay");
    check("the name opens the details", (await page.$eval(".modal-form-title", e => e.textContent)) === bench.name);
    check("and not the editing page", !(await onEditPage()));
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelectorAll(".modal-overlay").forEach(o => o.remove()));
    await t.settle();

    // The notes button opens notes, not the editing page
    await page.click(".summary-exercise-card .notes-toggle-btn");
    await t.settle();
    check("Add Notes stays on the summary", !(await onEditPage()));

    // 2. The box opens the editing page on that exercise; Back shows the change
    await page.click(".summary-exercise-card .summary-exercise-count");
    await page.waitForSelector("#edit-session-back-btn");
    await t.settle();
    check("the box opens the editing page", await onEditPage());
    check("on that exercise", (await page.$eval(".exercise-card.active .exercise-card-title", e => e.textContent)) === bench.name);
    await t.shot("summary-edit-01-editing");
    await changeWeight("85");
    await backToSummary();
    check("Back: the same summary", page.url().endsWith(`#/workouts/${workout.id}/sessions/${s.id}?date=${s.date}`), page.url());
    check("showing the change", (await firstWeight()) === "85", await firstWeight());

    // 3. Right after Finish
    await t.startWorkout();
    await t.settle();
    const posted = page.waitForResponse(r => r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()));
    const row = await page.$(".exercise-card.active .set-input-row");
    await (await row.$(".weight-input")).type("90");
    await (await row.$(".reps-input")).type("3");
    await page.evaluate(() => document.activeElement.blur());
    await posted;
    await page.click("#exercise-nav-next");
    await page.waitForSelector("#summary-finish-btn");
    await t.settle();
    await page.click("#summary-finish-btn");
    await page.waitForFunction(() => /#\/workouts\/\d+\/sessions\/\d+\?date=/.test(location.hash) && !document.querySelector("#summary-finish-btn"));
    await page.waitForSelector(".summary-exercise-card");
    await t.settle();
    const finished = page.url().split("#")[1];
    check("after Finish: the box is tappable", await page.$eval(".summary-exercise-card", c => c.classList.contains("clickable")));
    await page.click(".summary-exercise-card .summary-exercise-count");
    await page.waitForSelector("#edit-session-back-btn");
    await t.settle();
    check("after Finish: the box opens the editing page", await onEditPage());
    await changeWeight("92.5");
    await backToSummary();
    check("after Finish: Back to that summary", page.url().endsWith("#" + finished), page.url());
    check("after Finish: showing the change", (await firstWeight()) === "92.5", await firstWeight());

    // 4. From a calendar day (finishing in the app put the workout on it)
    const sessionId = Number(finished.match(/sessions\/(\d+)/)[1]);
    const date = finished.match(/date=([\d-]+)/)[1];
    const calendarHash = `#/calendar/${date}/sessions/${sessionId}?workout=${workout.id}`;
    await openSummary(calendarHash);
    await page.click(".summary-exercise-card .summary-exercise-count");
    await page.waitForSelector("#edit-session-back-btn");
    await t.settle();
    await changeWeight("95");
    await backToSummary();
    check("from the calendar: Back to the calendar's summary", page.url().endsWith(calendarHash), page.url());
    check("from the calendar: showing the change", (await firstWeight()) === "95", await firstWeight());
    await t.shot("summary-edit-02-calendar");

    // 5. The live review keeps its own box tap (back to that exercise)
    await t.startWorkout();
    await t.settle();
    await page.click("#exercise-nav-next");
    await page.waitForSelector("#summary-finish-btn");
    await t.settle();
    await page.click("#preview-summary .summary-exercise-card");
    await t.settle();
    check("review: the box goes back to the live exercise", !(await onEditPage()) && (await page.$(".exercise-card.active")) !== null);
});
