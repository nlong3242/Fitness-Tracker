/* One workout in progress per account (the server answers 409). A workout
   opened on another device, after this page loaded, shows up at this
   page's first set as a question (session.js resolveOtherInProgress): go
   to it, discard it and log here, or cancel (the set isn't saved). */
const { run, wait } = require("./harness.cjs");

run({ prefix: "twodev", workoutName: "Here Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const other = await t.api("POST", "/workouts", { name: "Phone Day" });
    await t.api("POST", `/workouts/${other.id}/exercises/${bench.id}/link`);
    await t.openHome();   // this page now knows both workouts, and nothing in progress

    // "The other device" opens Phone Day and logs a set
    async function openElsewhere() {
        const s = await t.api("POST", `/workouts/${other.id}/sessions`, {});
        await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 40, reps: 10 });
        return s;
    }
    // Here: start Here Day and log its first set; returns the question asked
    async function logFirstSetHere() {
        await t.startWorkout();
        await page.waitForSelector(".exercise-card.active > .add-set-btn");
        await wait(500);
        await page.click(".exercise-card.active > .add-set-btn");
        const row = (await page.$$(".exercise-card.active .set-input-row")).pop();
        await (await row.$(".weight-input")).type("60");
        await (await row.$(".reps-input")).type("5");
        await page.evaluate(() => document.activeElement.blur());
        await page.waitForSelector(".modal-overlay", { timeout: 15000 });
        await wait(200);
        return page.evaluate(() => ({
            message: document.querySelector(".modal-message").textContent,
            choices: [...document.querySelectorAll(".modal-overlay button")].map(b => b.textContent.trim())
        }));
    }
    const pick = label => page.evaluate(l => [...document.querySelectorAll(".modal-overlay button")]
        .find(b => b.textContent.trim() === l).click(), label);
    const unfinished = () => t.api("GET", "/sessions/unfinished");

    // 1. Cancel: nothing changes, the set isn't saved
    const first = await openElsewhere();
    let q = await logFirstSetHere();
    check("the question names the other workout", q.message === '"Phone Day" is in progress on another device.', q.message);
    check("…go to it, discard it, or cancel", q.choices.join("|") === "Go to Phone Day|Discard it & log here|Cancel", q.choices.join("|"));
    await t.shot("two-devices-question");
    await pick("Cancel");
    await wait(600);
    check("Cancel: the set says Not saved", await page.$eval(".exercise-card.active .set-input-row:last-child", r => /Not saved/.test(r.closest(".exercise-card").textContent)));
    check("…and the other workout is untouched", (await unfinished()).id === first.id);

    // 2. Go to it: that workout opens here, with its set
    await page.reload({ waitUntil: "domcontentloaded" });   // (this page now knows it's open, as after a reload)
    await page.waitForSelector("#app-content");
    await wait(800);
    await t.api("DELETE", `/sessions/${first.id}`);
    await t.openHome();
    const second = await openElsewhere();
    await logFirstSetHere();
    await pick("Go to Phone Day");
    await page.waitForFunction(() => {
        const t = document.querySelector(".workout-title-row h2, .workout-title-row .workout-title");
        return t && /Phone Day/.test(t.textContent);
    }, { timeout: 15000 });
    await wait(600);
    const sets = await page.$$eval(".exercise-card.active .set-input-row.saved", rs => rs.length);
    check("Go to: Phone Day opens here with its logged set", sets === 1, `${sets} saved rows`);
    check("…still the same workout in progress", (await unfinished()).id === second.id);

    // 3. Discard it & log here: the other goes, the set saves here
    await t.api("DELETE", `/sessions/${second.id}`);
    await t.openHome();
    await openElsewhere();
    await logFirstSetHere();
    const created = page.waitForResponse(r => r.request().method() === "POST" && /\/workouts\/\d+\/sessions$/.test(r.url()) && r.status() === 200);
    await pick("Discard it & log here");
    await created;
    await page.waitForSelector(".exercise-card.active .set-input-row.saved", { timeout: 15000 });
    const now = await unfinished();
    check("Discard: Here Day is now the workout in progress", now && now.workoutId === workout.id, JSON.stringify(now));
    const otherSessions = await t.api("GET", `/workouts/${other.id}/sessions`);
    check("…Phone Day's open workout is gone", otherSessions.content.every(s => s.finished), JSON.stringify(otherSessions.content));
});
