/* An exercise page's History tab: tapping a session opens that workout for
   editing on that exercise (views/exercisePage.js → views/editSession.js).
   Back returns to the History tab, showing the change; Next past the last
   exercise shows the workout's summary, whose Back also returns there.
   A reload on either page keeps that way back (router.js, "back"). */
const { run } = require("./harness.cjs");

run({ prefix: "histedit", workoutName: "History Edit", exercises: 2 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [first, second] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const base = page.url().split("#")[0];

    const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${first.id}`, { weight: 80, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${second.id}`, second.logType === "REPS" ? { reps: 10 } : { weight: 40, reps: 10 });
    await t.api("POST", `/sessions/${s.id}/finish`, {});

    const historyHash = `#/exercises/${first.id}/history`;
    const onEditPage = () => page.$("#edit-session-back-btn").then(Boolean);
    const navHidden = () => page.evaluate(() => document.body.classList.contains("nav-hidden"));
    const activeTitle = () => page.$eval(".exercise-card.active .exercise-card-title", e => e.textContent);
    const firstSet = () => page.$eval(".exh-session .exh-set", e => e.textContent.replace("★", "").replace(/\s+/g, " ").trim());
    const goTo = async hash => {
        await page.goto(base + hash, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await t.appStarted();
    };
    const waitHistory = async () => {
        await page.waitForSelector(".exh-session");
        await t.settle();
    };
    const openRow = async () => {
        await page.click(".exh-session-open");
        await page.waitForSelector("#edit-session-back-btn");
        await t.settle();
    };
    const changeWeight = async text => {
        const el = await page.$(".exercise-card.active .set-input-row .weight-input");
        await el.evaluate(e => { e.focus(); e.value = ""; });
        await el.type(text);
    };
    const backSaving = async () => {
        const put = page.waitForResponse(r => r.request().method() === "PUT" && /\/sets\/\d+$/.test(r.url()));
        await page.click("#edit-session-back-btn");   // leaving the row saves it
        await put;
    };

    // 1. From the Exercises tab: the row opens the editing page on that exercise
    await goTo(historyHash);
    await waitHistory();
    check("the session row looks tappable", (await page.$(".exh-session-open")) !== null);
    check("it shows 80 kg × 5", (await firstSet()) === "80 kg × 5", await firstSet());
    await t.shot("history-edit-00-history");
    await openRow();
    check("the row opens the editing page", await onEditPage());
    check("on that exercise", (await activeTitle()) === first.name, await activeTitle());
    check("no tab bar while editing", await navHidden());
    check("its route keeps the way back", page.url().includes(`&back=exercises/${first.id}/history`), page.url());
    await t.shot("history-edit-01-editing");

    // 2. Back: the History tab, showing the change, tab bar back
    await changeWeight("85");
    await backSaving();
    await waitHistory();
    check("Back: the History tab", page.url().endsWith(historyHash), page.url());
    check("showing the change", (await firstSet()) === "85 kg × 5", await firstSet());
    check("the tab bar is back", !(await navHidden()));

    // 3. A reload on the editing page: Back still goes to the History tab
    await openRow();
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.appStarted();
    await page.waitForSelector("#edit-session-back-btn");
    await t.settle();
    check("after a reload: still editing that exercise", (await activeTitle()) === first.name, await activeTitle());
    await page.click("#edit-session-back-btn");
    await waitHistory();
    check("after a reload: Back to the History tab", page.url().endsWith(historyHash), page.url());

    // 4. Next past the last exercise: the summary; its Back to the History tab
    await openRow();
    await page.click("#exercise-nav-next");
    await t.settle();
    check("Next: the workout's other exercise", (await activeTitle()) === second.name, await activeTitle());
    await page.click("#exercise-nav-next");
    await page.waitForSelector(".summary-exercise-card");
    await t.settle();
    check("Next on the last: the summary", page.url().includes(`/sessions/${s.id}?date=`), page.url());
    check("its route keeps the way back", page.url().includes(`&back=exercises/${first.id}/history`), page.url());
    check("the tab bar is back on the summary", !(await navHidden()));
    await t.shot("history-edit-02-summary");
    await page.click("#summary-top-back-btn, #summary-back-btn");
    await waitHistory();
    check("the summary's Back: the History tab", page.url().endsWith(historyHash), page.url());

    // 5. A reload on that summary: Back still goes to the History tab
    await openRow();
    await page.click("#exercise-nav-next");
    await t.settle();
    await page.click("#exercise-nav-next");
    await page.waitForSelector(".summary-exercise-card");
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.appStarted();
    await page.waitForSelector(".summary-exercise-card");
    await t.settle();
    await page.click("#summary-top-back-btn, #summary-back-btn");
    await waitHistory();
    check("after a reload: the summary's Back to the History tab", page.url().endsWith(historyHash), page.url());

    // 6. From a workout's page: Back returns to that page's History tab
    const workoutHistory = `#/workouts/${workout.id}/exercises/${first.id}/history`;
    await goTo(workoutHistory);
    await waitHistory();
    await openRow();
    check("from a workout: on that exercise", (await activeTitle()) === first.name, await activeTitle());
    await changeWeight("42.5");
    await backSaving();
    await waitHistory();
    check("from a workout: Back to its History tab", page.url().endsWith(workoutHistory), page.url());
    check("from a workout: showing the change", (await firstSet()) === "42.5 kg × 5", await firstSet());
});
