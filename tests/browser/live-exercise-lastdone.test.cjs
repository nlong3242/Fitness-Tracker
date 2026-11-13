/* "Last time" hints for an exercise never done in the workout being done
   (added or swapped in, or new to it): they come from the last time it was
   done in any workout, and the card says where ("Last time: from Push Day,
   3 Nov"). Once it has history in this workout, that wins and the note goes. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "lastdone", workoutName: "Upper A", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;

    // Push Day: the bench (also in Upper A) and a dumbbell exercise, done
    // and finished earlier.
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const all = await t.api("GET", "/exercises");
    const extra = all.find(e => e.builtIn && /dumbbell/i.test(e.name) && e.id !== bench.id);
    const pushDay = await t.api("POST", "/workouts", { name: "Push Day" });
    for (const ex of [bench, extra]) await t.api("POST", `/workouts/${pushDay.id}/exercises/${ex.id}/link`);
    const s = await t.api("POST", `/workouts/${pushDay.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 50, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${extra.id}`, { weight: 22.5, reps: 7 });
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${extra.id}`, { weight: 25, reps: 6 });
    await t.api("POST", `/sessions/${s.id}/finish`, {});
    const day = new Date(s.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    const note = () => page.$eval(".exercise-card.active", c => {
        const n = c.querySelector(".last-done-note");
        return n ? n.textContent : null;
    });
    const hints = () => page.$$eval(".exercise-card.active .set-input-row", rows => rows.map(r =>
        `${r.querySelector(".weight-input").placeholder}x${r.querySelector(".reps-input").placeholder}`));

    // 1. The bench was never done in Upper A: hints from Push Day, and it says so
    await t.startWorkout();
    check("never done here: says where the hints are from", (await note()) === `Last time: from Push Day, ${day}`, await note());
    check("and shows them", JSON.stringify(await hints()) === JSON.stringify(["50x5"]), (await hints()).join(", "));

    // 2. An exercise added today gets the same
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item");
    await page.click(".action-menu-item:not(.danger)");
    await page.waitForSelector("#picker-search");
    await page.type("#picker-search", extra.name);
    await wait(300);
    const rows = await page.$$("#picker-list .picker-select-row");
    for (const row of rows) {
        if ((await row.$eval(".picker-select-name", e => e.textContent.replace(/Custom$/, "").trim())) === extra.name) {
            await row.click();
            break;
        }
    }
    await wait(400);
    await page.click("#picker-add-btn");
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 2, { timeout: 15000 });
    await page.waitForSelector(".exercise-card.active");
    await wait(400);
    check("added exercise: says where the hints are from", (await note()) === `Last time: from Push Day, ${day}`, await note());
    check("one row per set from last time, with its numbers", JSON.stringify(await hints()) === JSON.stringify(["22.5x7", "25x6"]),
        (await hints()).join(", "));
    await t.shot("live-lastdone-01-added");

    // 3. Tapping "Set 01" logs those numbers, as with this workout's own
    const posted = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()), { timeout: 15000 });
    await page.click(".exercise-card.active .set-input-row .set-input-num");
    await posted;
    await wait(300);
    const firstRow = await page.$eval(".exercise-card.active .set-input-row", r =>
        `${r.querySelector(".weight-input").value}x${r.querySelector(".reps-input").value}`);
    check("Set 01 fills last time's numbers", firstRow === "22.5x7", firstRow);

    // 4. Log the bench here too, finish; next time the bench uses Upper A's own
    await page.click("#exercise-pills .exercise-pill:nth-child(1)");
    await wait(300);
    const posted2 = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sets\?exerciseId=/.test(r.url()), { timeout: 15000 });
    const w = await page.$(".exercise-card.active .set-input-row .weight-input");
    await w.type("55");
    await (await page.$(".exercise-card.active .set-input-row .reps-input")).type("5");
    await page.evaluate(() => document.activeElement.blur());
    await posted2;
    await wait(300);
    for (let i = 0; i < 4 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }

    // The summary compares with Push Day too, and says so, on the review
    // and once finished.
    const summaryCards = () => page.$$eval(".summary-exercise-card", cards => cards.map(c => ({
        name: c.querySelector(".summary-exercise-name").textContent,
        note: c.querySelector(".last-done-note") ? c.querySelector(".last-done-note").textContent : null,
        arrows: Array.from(c.querySelectorAll(".delta")).map(d => d.textContent)
    })));
    await page.waitForSelector(".summary-exercise-card .summary-set-header");
    let cards = await summaryCards();
    let benchCard = cards.find(c => c.name === bench.name);
    check("review: says it compares with Push Day", benchCard && benchCard.note === `Compared with Push Day, ${day}`, JSON.stringify(benchCard));
    check("review: the arrow compares with Push Day (55 vs 50)", benchCard && benchCard.arrows.includes("(+5)"), JSON.stringify(benchCard));

    const finished = page.waitForResponse(r =>
        r.request().method() === "POST" && /\/sessions\/\d+\/finish$/.test(r.url()), { timeout: 15000 });
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(1)"); // Today only
    await finished;
    await page.waitForFunction(() => /\/sessions\/\d+/.test(location.hash)
        && !document.getElementById("summary-finish-btn") && document.getElementById("summary-back-btn"), { timeout: 15000 });
    await page.waitForSelector(".summary-exercise-card .summary-set-header");
    await wait(300);
    cards = await summaryCards();
    benchCard = cards.find(c => c.name === bench.name);
    const extraCard = cards.find(c => c.name === extra.name);
    check("summary: both say they compare with Push Day",
        benchCard && extraCard && benchCard.note === `Compared with Push Day, ${day}` && extraCard.note === benchCard.note,
        JSON.stringify(cards));
    check("summary: the bench arrow is against Push Day", benchCard && benchCard.arrows.includes("(+5)"), JSON.stringify(benchCard));
    await t.shot("live-lastdone-02-summary");

    await t.startWorkout();
    check("done here now: no note", (await note()) === null, await note());
    check("and this workout's own numbers", JSON.stringify(await hints()) === JSON.stringify(["55x5"]), (await hints()).join(", "));
});
