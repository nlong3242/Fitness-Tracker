/* Logging a set starts the rest timer (components/setInputRow.js): with the
   account's rest time, in the small ring only. Editing a saved set and a
   failed save don't start or restart it. */
const { run } = require("./harness.cjs");

run({ prefix: "autorest", workoutName: "Auto Rest", restSeconds: 45 }, "#/workouts", async t => {
    const { page, check, clock } = t;
    let failNextSetPost = false;
    t.setOnRequest(function(req, url) {
        if (failNextSetPost && req.method() === "POST" && /\/sets\?exerciseId=/.test(url)) {
            failNextSetPost = false;
            req.abort();
            return true;
        }
        return false;
    });
    await t.startWorkout();
    // The page's time only moves when the test says, so readings are exact.
    await clock.install();

    const btnTime = () => page.$eval("#rest-timer-btn .rest-ring-time", el => el.textContent);
    const barReads = text => t.waitFor(x => document.querySelector("#rest-timer-btn .rest-ring-time").textContent === x, text);
    const panelShown = () => page.$eval("#rest-timer-panel", el => !el.hidden);
    const rows = () => page.$$(".exercise-card.active .set-input-row");
    const setPost = () => t.response("POST", /\/sets\?exerciseId=/);
    const setPut = () => t.response("PUT", /\/sets\/\d+$/);
    const addSet = () => page.click(".exercise-card.active > button");
    const stopRest = async () => {
        await page.click("#rest-timer-btn");
        await page.click(".rest-timer-stop");
        await page.mouse.click(195, 150); // close the panel
        await barReads("");
    };
    // Types into a row's boxes and leaves it, which saves it.
    async function fillRow(index, weight, reps) {
        const row = (await rows())[index];
        const w = await row.$(".weight-input");
        const r = await row.$(".reps-input");
        await w.click({ clickCount: 3 });
        await w.type(String(weight));
        await r.click({ clickCount: 3 });
        await r.type(String(reps));
        await page.evaluate(() => document.activeElement.blur());
    }

    check("no rest before logging", (await btnTime()) === "");

    // 1. Logging a new set starts rest with my time (0:45 on the account)
    await addSet();
    const created = setPost();
    await fillRow(0, 20, 8);
    await created;
    check("logging a set starts rest with my time (0:45)", await barReads("00:45"), await btnTime());
    check("the big ring stays closed", !(await panelShown()));
    check("the page isn't dimmed", await page.$eval("#rest-timer-backdrop", b => b.hidden));
    check("the row is saved", await t.waitFor(() =>
        document.querySelector(".exercise-card.active .set-input-row").classList.contains("saved")));
    await t.shot("timer-07-after-logging");

    // 2. Editing the saved set doesn't start rest
    await stopRest();
    const updated = setPut();
    await fillRow(0, 22.5, 8);
    await updated;
    await t.settle();
    check("editing a saved set doesn't start rest", (await btnTime()) === "", await btnTime());

    // 3. Editing while resting doesn't restart it either: 3 s into a 0:45
    //    rest, the edit leaves it at 0:42
    await page.click("#rest-timer-btn");
    await page.click('.rest-timer-chip[data-seconds="45"]');
    await clock.tick(3000);
    await barReads("00:42");
    const updated2 = setPut();
    await fillRow(0, 25, 8);
    await updated2;
    await t.settle();
    check("editing during rest keeps the countdown going", (await btnTime()) === "00:42", await btnTime());
    await stopRest();

    // 4. The next new set starts it again
    await addSet();
    const created2 = setPost();
    await fillRow(1, 20, 6);
    await created2;
    check("the next set starts rest again", await barReads("00:45"), await btnTime());
    await stopRest();

    // 5. A failed save doesn't start rest
    await addSet();
    failNextSetPost = true;
    await fillRow(2, 20, 5);
    const retryShown = await t.waitFor(() =>
        document.querySelectorAll(".exercise-card.active .set-input-row")[2].textContent.includes("Not saved"));
    await t.settle();
    const third = (await rows())[2];
    check("failed save: row not saved", !(await third.evaluate(r => r.classList.contains("saved"))));
    check("failed save: row shows the retry", retryShown);
    check("failed save doesn't start rest", (await btnTime()) === "", await btnTime());
});
