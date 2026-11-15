/* The live workout's Add Set and Add Notes: full-width, big tap targets
   under the sets, and still doing their jobs. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "wbuttons", workoutName: "Buttons Test" }, "#/workouts", async t => {
    const { page, check } = t;
    await t.startWorkout();

    const box = () => page.evaluate(() => {
        const card = document.querySelector(".exercise-card.active");
        const inner = card.getBoundingClientRect();
        const cs = getComputedStyle(card);
        const contentW = inner.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
            - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        const r = sel => { const b = card.querySelector(sel).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
        return { contentW: Math.round(contentW), set: r(".add-set-btn"), notes: r(".notes-toggle-btn") };
    });

    const b = await box();
    check("Add Set spans the card", Math.abs(b.set.w - b.contentW) <= 1, JSON.stringify(b));
    check("Add Notes spans the card", Math.abs(b.notes.w - b.contentW) <= 1, JSON.stringify(b));
    check("Add Set is at least 52 px tall", b.set.h >= 52, b.set.h);
    check("Add Notes is at least 40 px tall", b.notes.h >= 40, b.notes.h);
    check("Add Notes is shorter than Add Set", b.notes.h < b.set.h, `${b.notes.h} < ${b.set.h}`);
    await t.shot("workout-buttons-01");

    // Add Set still adds a row
    const rows = () => page.$$eval(".exercise-card.active .set-input-row", els => els.length);
    const before = await rows();
    await page.click(".exercise-card.active .add-set-btn");
    await wait(200);
    check("Add Set adds a row", (await rows()) === before + 1, `${before} -> ${await rows()}`);

    // Add Notes still opens the editor
    await page.click(".exercise-card.active .notes-toggle-btn");
    await wait(200);
    check("Add Notes opens the note editor",
        await page.$eval(".exercise-card.active .notes-panel", el => getComputedStyle(el).display !== "none"));
    await t.shot("workout-buttons-02-notes-open");

    // No Review & Finish / Discard buttons under the card any more
    check("no Review & Finish button", (await page.$("#active-workout-finish-btn")) === null);
    check("no Discard button", (await page.$("#active-workout-discard-btn")) === null);

    // A ⋮ on the title line, right of the stopwatch
    const place = await page.evaluate(() => {
        const row = document.querySelector(".workout-title-row");
        const more = row && row.querySelector(".more-btn");
        if (!more) return null;
        const m = more.getBoundingClientRect(), w = document.getElementById("workout-stopwatch").getBoundingClientRect();
        return { afterWatch: m.left >= w.right - 1, inView: m.right <= window.innerWidth };
    });
    check("⋮ on the title line, after the stopwatch", place && place.afterWatch && place.inView, JSON.stringify(place));

    // Discard asks first; Cancel keeps the workout
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item.danger:last-child");
    check("menu item reads Discard workout", (await page.$eval(".action-menu-item.danger:last-child", b => b.textContent)) === "Discard workout");
    await t.shot("workout-buttons-03-menu");
    await page.click(".action-menu-item.danger:last-child");
    await page.waitForSelector(".modal-confirm");
    await t.shot("workout-buttons-04-confirm");
    await page.click(".modal-cancel");
    await wait(300);
    check("Cancel keeps the workout", (await page.$(".exercise-card.active")) !== null);

    // Review is still reachable: Next past the last exercise
    for (let i = 0; i < 10 && !(await page.$("#summary-finish-btn")); i++) {
        await page.click("#exercise-nav-next");
        await wait(400);
    }
    check("Next on the last exercise opens the review", (await page.$("#summary-finish-btn")) !== null);

    // The review's Finish Workout: the picker's pink bar, floating at the
    // bottom on a strip painted like the page itself (grid lined up), so
    // it looks like empty page but hides what scrolls under it
    await wait(300);
    const bar = await page.evaluate(() => {
        const f = document.querySelector(".summary-finish-footer");
        const b = f && f.querySelector(".summary-finish-bar");
        if (!b) return null;
        const fr = f.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        const fs = getComputedStyle(f), bs = getComputedStyle(document.body);
        const [px, py] = fs.backgroundPosition.split(" ").map(parseFloat);
        const mod = v => ((Math.round(v) % 28) + 28) % 28;
        return { position: fs.position, stripToEdge: Math.round(window.innerHeight - fr.bottom),
            stripWidth: Math.round(fr.width),
            pageColour: fs.backgroundColor === bs.backgroundColor, pageGrid: fs.backgroundImage === bs.backgroundImage,
            noBorder: fs.borderTopWidth === "0px",
            gridOffset: [mod(fr.left + px), mod(fr.top + py)],
            barHeight: Math.round(r.height), barWidth: Math.round(r.width), hasButton: !!b.querySelector("#summary-finish-btn") };
    });
    check("Finish floats on a strip down to the bottom edge",
        bar && bar.position === "fixed" && bar.stripToEdge === 0 && bar.stripWidth === 390, JSON.stringify(bar));
    check("the strip looks like the page: same colour and grid, no border",
        bar && bar.pageColour && bar.pageGrid && bar.noBorder, JSON.stringify(bar));
    check("the strip's grid lines meet the page's", bar && bar.gridOffset[0] === 0 && bar.gridOffset[1] === 0, JSON.stringify(bar));
    check("the strip starts at the button's top edge, no gap above",
        await page.evaluate(() => Math.round(document.querySelector(".summary-finish-bar").getBoundingClientRect().top)
            === Math.round(document.querySelector(".summary-finish-footer").getBoundingClientRect().top)));
    check("the button is the wide 58 px+ bar", bar && bar.barHeight >= 58 && bar.barWidth >= 350 && bar.hasButton, JSON.stringify(bar));
    // Content scrolled under the strip is hidden, above and below the button
    const covered = await page.evaluate(() => {
        const f = document.querySelector(".summary-finish-footer").getBoundingClientRect();
        const b = document.querySelector(".summary-finish-bar").getBoundingClientRect();
        const at = y => document.elementFromPoint(window.innerWidth / 2, y);
        return [f.top + 4, b.bottom + 10].every(y => at(y).closest(".summary-finish-footer"));
    });
    check("nothing shows through above or below the button", covered);
    const barTop = () => page.$eval("#summary-finish-btn", b => Math.round(b.getBoundingClientRect().top));
    const topBefore = await barTop();
    await page.evaluate(() => document.getElementById("app-scroll").scrollBy(0, 400));
    await wait(200);
    const topAfter = await barTop();
    check("it stays put when the page scrolls", topBefore === topAfter, `${topBefore} → ${topAfter}`);
    await t.shot("workout-buttons-05-finish-bar");
    // Back to the exercise, then Discard for real
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".exercise-card.active");
    await page.click(".workout-title-row .more-btn");
    await page.click(".action-menu-item.danger:last-child");
    await page.waitForSelector(".modal-confirm");
    await page.click(".modal-confirm");
    await wait(600);
    check("Discard leaves the workout", (await page.$(".exercise-card.active")) === null);
});
