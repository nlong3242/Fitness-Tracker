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
});
