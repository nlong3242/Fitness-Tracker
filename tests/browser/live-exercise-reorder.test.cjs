/* Reordering a live workout's exercises by dragging the pills: kept with
   today's list, so adding an exercise (which rebuilds the page) or a reload
   doesn't undo it, and on its own it counts as a change: Finish asks
   "today only or update the workout". Dragged away and back asks nothing. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "livereorder", workoutName: "Live Reorder", exercises: 3 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const original = (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    const [A, B, C] = original;
    const workoutNames = async () => (await t.api("GET", `/workouts/${workout.id}/exercises`)).map(e => e.name);
    const titles = () => page.$$eval(".exercise-card .exercise-card-title", els => els.map(e => e.textContent));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // Long-press pill `from` (1-based) and drag it onto pill `to`.
    async function dragPill(from, to) {
        const box = n => page.$eval(`#exercise-pills .exercise-pill:nth-child(${n})`, el => {
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        const a = await box(from);
        const b = await box(to);
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await wait(350); // long-press arms the drag
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            await page.mouse.move(a.x + (b.x - a.x + (b.x > a.x ? 10 : -10)) * i / steps, a.y);
            await wait(20);
        }
        await page.mouse.up();
        await wait(600);
    }
    async function toReview() {
        for (let i = 0; i < 6 && !(await page.$("#summary-finish-btn")); i++) {
            await page.click("#exercise-nav-next");
            await wait(400);
        }
    }
    const closed = () => page.waitForFunction(() => !document.querySelector(".exercise-card")
        && !document.getElementById("summary-finish-btn"), { timeout: 15000 });

    // 1. Drag the first to the end
    await t.startWorkout();
    await dragPill(1, 3);
    check("dragged: B, C, A", same(await titles(), [B, C, A]), (await titles()).join(", "));

    // 2. Adding an exercise keeps the new order
    await page.click(".workout-title-row .more-btn");
    await page.waitForSelector(".action-menu-item");
    await page.click(".action-menu-item:not(.danger)");
    await page.waitForSelector("#picker-list .picker-checkbox");
    await page.type("#picker-search", "dumbbell");
    await wait(300);
    const pick = await page.$("#picker-list .picker-select-row");
    const D = await pick.$eval(".picker-select-name", e => e.textContent.replace(/Custom$/, "").trim());
    await pick.click();
    await wait(400);
    await page.click("#picker-add-btn");
    await page.waitForFunction(() => document.querySelectorAll("#exercise-pills .exercise-pill").length === 4, { timeout: 15000 });
    await page.waitForSelector(".exercise-card.active");
    await wait(400);
    check("adding keeps the dragged order", same(await titles(), [B, C, A, D]), (await titles()).join(", "));

    // 3. So does a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".exercise-card.active");
    await wait(500);
    check("a reload keeps it", same(await titles(), [B, C, A, D]), (await titles()).join(", "));

    // 4. Finish → Update: the workout takes today's order (nothing logged)
    await toReview();
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    await page.click(".modal-choice:nth-child(2)"); // Update
    await closed();
    check("the workout has today's order", same(await workoutNames(), [B, C, A, D]), (await workoutNames()).join(", "));

    // 5. A reorder on its own asks; Today only leaves the workout alone
    await t.startWorkout();
    await dragPill(4, 1);
    check("dragged: D first", same(await titles(), [D, B, C, A]), (await titles()).join(", "));
    await toReview();
    await page.click("#summary-finish-btn");
    await page.waitForSelector(".modal-choice");
    check("a reorder on its own asks", (await page.$eval(".modal-message", e => e.textContent)).includes("changed the exercises"));
    await page.click(".modal-choice:nth-child(1)"); // Today only
    await closed();
    check("Today only: the workout keeps its order", same(await workoutNames(), [B, C, A, D]), (await workoutNames()).join(", "));

    // 6. Dragged away and back: nothing to ask
    await t.startWorkout();
    await dragPill(1, 2);
    check("dragged away", same(await titles(), [C, B, A, D]), (await titles()).join(", "));
    await dragPill(2, 1);
    check("and back", same(await titles(), [B, C, A, D]), (await titles()).join(", "));
    await toReview();
    await page.click("#summary-finish-btn");
    await closed();
    check("back as it was: no question", (await page.$(".modal-choice")) === null);
});
