/* Logging a set starts the rest timer (components/setInputRow.js): with the
   account's rest time, in the small ring only. Editing a saved set and a
   failed save don't start or restart it. */
const { run, wait, toSec } = require("./harness.cjs");

run({ prefix: "autorest", workoutName: "Auto Rest", restSeconds: 45 }, "#/workouts", async t => {
    const { page, check } = t;
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

    const btnTime = () => page.$eval("#rest-timer-btn .rest-ring-time", el => el.textContent);
    const panelShown = () => page.$eval("#rest-timer-panel", el => !el.hidden);
    const rows = () => page.$$(".exercise-card.active .set-input-row");
    const setPost = () => page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()), { timeout: 15000 });
    const setPut = () => page.waitForResponse(r =>
        r.request().method() === "PUT" && /\/sets\/\d+$/.test(r.url()), { timeout: 15000 });
    const addSet = () => page.click(".exercise-card.active > button");
    const stopRest = async () => {
        await page.click("#rest-timer-btn");
        await page.click(".rest-timer-stop");
        await page.mouse.click(195, 150); // close the panel
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
    await wait(400);
    let left = toSec((await btnTime()) || "0:00");
    check("logging a set starts rest with my time (0:45)", left >= 43 && left <= 45, await btnTime());
    check("the big ring stays closed", !(await panelShown()));
    check("the page isn't dimmed", await page.$eval("#rest-timer-backdrop", b => b.hidden));
    check("the row is saved",
        await page.$eval(".exercise-card.active .set-input-row", r => r.classList.contains("saved")));
    await t.shot("timer-07-after-logging");

    // 2. Editing the saved set doesn't start rest
    await stopRest();
    const updated = setPut();
    await fillRow(0, 22.5, 8);
    await updated;
    await wait(400);
    check("editing a saved set doesn't start rest", (await btnTime()) === "");

    // 3. Editing while resting doesn't restart it either
    await page.click("#rest-timer-btn");
    await page.click('.rest-timer-chip[data-seconds="45"]');
    await wait(3000);
    const before = toSec(await btnTime());
    const updated2 = setPut();
    await fillRow(0, 25, 8);
    await updated2;
    await wait(400);
    const after = toSec(await btnTime());
    check("editing during rest keeps the countdown going",
        after <= before && after >= before - 2, `${before}s → ${after}s`);
    await stopRest();

    // 4. The next new set starts it again
    await addSet();
    const created2 = setPost();
    await fillRow(1, 20, 6);
    await created2;
    await wait(400);
    left = toSec((await btnTime()) || "0:00");
    check("the next set starts rest again", left >= 43 && left <= 45, await btnTime());
    await stopRest();

    // 5. A failed save doesn't start rest
    await addSet();
    failNextSetPost = true;
    await fillRow(2, 20, 5);
    await wait(1500);
    const third = (await rows())[2];
    check("failed save: row not saved", !(await third.evaluate(r => r.classList.contains("saved"))));
    check("failed save: row shows the retry", await third.evaluate(r => r.textContent.includes("Not saved")));
    check("failed save doesn't start rest", (await btnTime()) === "");
});
