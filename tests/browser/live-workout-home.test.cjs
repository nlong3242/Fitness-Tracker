/* No tab bar during a live workout (views/activeWorkout.js): a ‹ Home at
   the top, styled like the review's ‹ Back, leaves the workout running.
   Prev / Next sits at the screen's bottom edge; the picker opened from
   the workout has no tab bar either. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "livehome", workoutName: "Live Home", exercises: 2 }, "#/workouts", async t => {
    const { page, check } = t;
    await t.startWorkout();
    await wait(300);

    const navShown = () => page.$eval("#bottom-nav", n => getComputedStyle(n).display !== "none");
    const shown = sel => page.evaluate(s => {
        const el = document.querySelector(s);
        return !!el && el.getBoundingClientRect().height > 0;
    }, sel);

    // 1. Exercise page: no tab bar, ‹ Home above the title, Prev / Next at the bottom
    check("no tab bar in the workout", !(await navShown()));
    const home = await page.evaluate(() => {
        const b = document.getElementById("workout-home-btn");
        const title = document.querySelector(".workout-title-row").getBoundingClientRect();
        const r = b.getBoundingClientRect();
        return { text: b.textContent.replace(/\s+/g, " ").trim(), above: r.bottom <= title.top + 1,
            backStyle: b.classList.contains("summary-back-link") };
    });
    check("‹ Home above the title, in the review's Back style",
        home.text === "‹ Home" && home.above && home.backStyle, JSON.stringify(home));
    const rowGap = await page.$eval("#exercise-nav-row", r => Math.round(window.innerHeight - r.getBoundingClientRect().bottom));
    check("Prev / Next sits at the bottom edge", rowGap === 0, rowGap);
    await t.shot("live-home-01-exercise");

    // 2. Picker from the workout: no tab bar, Add bar strip to the bottom edge
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item");
    await page.click(".action-menu-item:not(.danger)");
    await page.waitForSelector("#picker-list .picker-checkbox");
    check("no tab bar in the picker", !(await navShown()));
    await page.click("#picker-list .picker-select-row");
    await wait(400);
    const stripGap = await page.$eval(".picker-action-footer", f => Math.round(window.innerHeight - f.getBoundingClientRect().bottom));
    check("the picker's Add strip runs to the bottom edge", stripGap === 0, stripGap);
    await t.shot("live-home-02-picker");
    await page.click("#picker-cancel-btn");
    await page.waitForSelector(".exercise-card.active");
    await wait(400);
    check("back in the workout, still no tab bar", !(await navShown()));

    // 3. Review: its own ‹ Back, no ‹ Home, no tab bar
    for (let i = 0; i < 4 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }
    check("review: ‹ Home hidden (it has its own Back)", !(await shown("#workout-home-btn")) && (await shown("#summary-top-back-btn")));
    check("review: no tab bar", !(await navShown()));
    await page.click("#summary-top-back-btn");
    await wait(400);
    check("Back from the review shows ‹ Home again", await shown("#workout-home-btn"));

    // 4. ‹ Home: Home page with the tab bar, the workout still running
    await page.click("#workout-home-btn");
    await page.waitForSelector("#home-greeting");
    await wait(400);
    check("‹ Home opens Home", (await page.$("#home-greeting")) !== null);
    check("tab bar is back", await navShown());
    check("Home lights its tab", await page.$eval('#bottom-nav [data-tab="home"]', b => b.classList.contains("active")));
    check("the workout is still running", (await page.evaluate(() => localStorage.getItem("fitness.startedWorkout"))) !== null);
    await t.shot("live-home-03-home");

    // 5. Back in, then Discard: the tab bar returns
    await t.startWorkout();
    check("reopened: no tab bar", !(await navShown()));
    await page.click(".workout-title-row .more-btn");
    await page.click(".action-menu-item.danger");
    await page.waitForSelector(".modal-confirm");
    await page.click(".modal-confirm");
    await wait(800);
    check("after Discard the tab bar is back", await navShown());
});
