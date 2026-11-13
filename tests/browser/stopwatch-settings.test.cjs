/* Settings → Timers → Workout stopwatch (views/settings.js): an on/off
   switch, on by default, saved with the account at once; a failed save
   puts it back; the live workout hides or shows its stopwatch to match. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "swset", workoutName: "Switch Test" }, "#/settings", async t => {
    const { page, check, api } = t;
    let failNextPut = false;
    t.setOnRequest(function(req, url) {
        if (failNextPut && req.method() === "PUT" && url.includes("/profile/workout-timer")) {
            failNextPut = false;
            req.abort();
            return true;
        }
        return false;
    });
    const accountShows = async () => (await api("GET", "/profile")).showWorkoutTimer;
    const on = () => page.$eval("#stopwatch-switch", b => b.getAttribute("aria-checked") === "true");
    const status = () => page.$eval("#stopwatch-status", e => e.textContent);
    const put = () => page.waitForResponse(r =>
        r.request().method() === "PUT" && r.url().includes("/profile/workout-timer"), { timeout: 10000 });
    const openTimers = async () => {
        await page.waitForSelector("#settings-rest-btn");
        await page.click("#settings-rest-btn");
        await page.waitForSelector("#stopwatch-switch");
    };

    // 1. On the Timers page, on by default, above the rest time
    await openTimers();
    check("switch is on by default", await on());
    check("account says on", (await accountShows()) === true);
    const order = await page.evaluate(() =>
        document.getElementById("stopwatch-settings").compareDocumentPosition(document.getElementById("rest-settings"))
        & Node.DOCUMENT_POSITION_FOLLOWING);
    check("stopwatch comes before the rest time", order !== 0);
    check("labelled Workout stopwatch", (await page.$eval("#stopwatch-switch-label", e => e.textContent)) === "Workout stopwatch");
    check("no horizontal scroll at 390px", await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    // Knob gaps to the switch's outer edge: the same on top, bottom and the
    // near side, on or off.
    const knobGaps = () => page.$eval("#stopwatch-switch", b => {
        const t = b.getBoundingClientRect(), k = b.firstElementChild.getBoundingClientRect();
        return { l: Math.round(k.left - t.left), r: Math.round(t.right - k.right),
                 t: Math.round(k.top - t.top), b: Math.round(t.bottom - k.bottom) };
    });
    let gaps = await knobGaps();
    check("on: knob on the right, evenly inset", gaps.r < gaps.l && gaps.t === gaps.b && gaps.r === gaps.t, JSON.stringify(gaps));
    await t.shot("timers-01-on");

    // 2. Turning it off saves at once
    let saved = put();
    await page.click("#stopwatch-switch");
    check("tap turns it off", !(await on()));
    await wait(300); // the knob slides
    gaps = await knobGaps();
    check("off: knob on the left, evenly inset", gaps.l < gaps.r && gaps.t === gaps.b && gaps.l === gaps.t, JSON.stringify(gaps));
    await saved;
    await wait(200);
    check("shows Saved", (await status()) === "Saved", await status());
    check("account says off", (await accountShows()) === false);
    await t.shot("timers-02-off");

    // 3. Reload keeps it off
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#stopwatch-switch");
    await wait(500);
    check("reload: still off", !(await on()));

    // 4. A failed save puts it back
    failNextPut = true;
    await page.click("#stopwatch-switch");
    await wait(800);
    check("failed save: back to off", !(await on()));
    check("failed save: says so", (await status()).startsWith("Couldn't save"), await status());
    check("failed save: account unchanged", (await accountShows()) === false);

    // 5. Off: the live workout has no stopwatch
    await page.click("#rest-back-btn");
    await t.startWorkout();
    await wait(700);
    check("off: no stopwatch in the workout", (await page.$("#workout-stopwatch:not([hidden])")) === null);

    // 6. Back on from Settings: it shows again
    await page.click('#bottom-nav [data-tab="home"]');
    await (await page.waitForSelector("#home-settings-btn")).click();
    await openTimers();
    saved = put();
    await page.click("#stopwatch-switch");
    await saved;
    check("on again", await on());
    check("account says on", (await accountShows()) === true);
    await t.startWorkout();
    await wait(700);
    check("on: the workout shows the stopwatch", (await page.$("#workout-stopwatch:not([hidden])")) !== null);
});
