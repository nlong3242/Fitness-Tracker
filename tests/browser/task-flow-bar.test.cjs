/* The tab bar hides in task flows (bottom-nav.css .task-flow): creating a
   workout and its exercise picker, creating an exercise, and the summary
   right after Finish (Back → Home, also after a reload). It stays on
   browsing pages, and comes back as soon as a flow is left. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "taskbar", workoutName: "Flow Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    await t.openHome();
    const barShown = () => page.evaluate(() => {
        const nav = document.getElementById("bottom-nav");
        return nav.getBoundingClientRect().height > 0;
    });
    const navHeight = () => page.evaluate(() =>
        parseFloat(getComputedStyle(document.getElementById("app-content")).paddingBottom));

    check("Home: bar shown", await barShown());
    const browsingPad = await navHeight();

    // 1. Create Workout, then its exercise picker, then Back
    await page.click('#bottom-nav [data-tab="workouts"]');
    await page.waitForSelector("#workouts-create-btn", { visible: true });
    await wait(300);
    check("Workouts: bar shown", await barShown());
    await page.click("#workouts-create-btn");
    await page.waitForSelector("#new-workout-name");
    await wait(200);
    check("Create Workout: no bar", !(await barShown()));
    check("…and no space kept for it", await navHeight() < browsingPad, `${await navHeight()} vs ${browsingPad}`);
    await page.click("#add-exercise-btn");
    await page.waitForSelector("#picker-cancel-btn", { visible: true });
    await wait(300);
    check("its exercise picker: no bar", !(await barShown()));
    await t.shot("task-flow-01-picker");
    await page.click("#picker-cancel-btn");
    await page.waitForSelector("#new-workout-name");
    await page.click("#back-btn");
    await page.waitForSelector("#workouts-create-btn", { visible: true });
    await wait(200);
    check("Back to Workouts: bar again", await barShown());

    // 2. Create Exercise from the library, then Cancel
    await page.click('#bottom-nav [data-tab="exercises"]');
    await page.waitForSelector("#library-create-btn", { visible: true });
    await wait(300);
    await page.click("#library-create-btn");
    await page.waitForSelector("#exe-cancel-btn", { visible: true });
    await wait(200);
    check("Create Exercise: no bar", !(await barShown()));
    await page.click("#exe-cancel-btn");
    await page.waitForSelector("#library-create-btn", { visible: true });
    await wait(200);
    check("Cancel: bar again", await barShown());

    // 3. Finish a workout: its summary has no bar, and Done
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 40, reps: 8 });
    await t.openHome();
    await t.startWorkout();
    for (let i = 0; i < 4 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }
    const finished = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url()), { timeout: 15000 });
    await page.click("#summary-finish-btn");
    const choice = await page.waitForSelector(".modal-choice", { timeout: 1500 }).catch(() => null);
    if (choice) await choice.click();
    await finished;
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(400);
    let label = await page.$eval("#summary-back-btn", b => b.textContent.replace("‹", "").trim());
    check("just finished: no bar", !(await barShown()));
    check("…its way out: ‹ Back", label === "Back", label);
    check("…its address says so", page.url().includes("&done=1"), page.url());
    await t.shot("task-flow-02-finished");

    // A reload keeps it that way; Back goes Home with the bar
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(400);
    label = await page.$eval("#summary-back-btn", b => b.textContent.replace("‹", "").trim());
    check("after a reload: still no bar", !(await barShown()) && label === "Back", label);
    await page.click("#summary-back-btn");
    await page.waitForSelector("#home-day-card");
    await wait(300);
    check("Back: Home, bar back", await barShown());

    // 4. The same summary opened from Home (browsing): bar shown
    await page.waitForFunction(() => document.querySelector("#home-last-row:not([disabled])"));
    await page.click("#home-last-row");
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(400);
    label = await page.$eval("#summary-back-btn", b => b.textContent.replace("‹", "").trim());
    check("a summary opened later: bar shown", (await barShown()) && label === "Back", label);
});
