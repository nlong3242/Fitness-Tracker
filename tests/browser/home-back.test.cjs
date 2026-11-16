/* Back to Home keeps the day that was selected (views/home.js backToHome):
   from a summary, an exercise's History tab and the Bodyweight page, and
   after a reload on the summary too. The Home tab starts on today. */
const { run, wait, monday } = require("./harness.cjs");

function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

run({ prefix: "homeback", workoutName: "Back Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const lastMon = addDays(monday(), -7);
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${bench.id}`, { weight: 60, reps: 5 });
    await t.api("POST", `/sessions/${s.id}/finish`, {});

    const openHome = () => t.openHome();
    // The selected day and the week shown, once Home has its data.
    async function shown() {
        await page.waitForSelector(".home-day.selected");
        await page.waitForFunction(() => document.getElementById("home-week-foot").textContent.trim() !== "");
        await wait(200);
        return page.evaluate(() => ({
            selected: document.querySelector(".home-day.selected").dataset.date,
            monday: document.querySelector(".home-day").dataset.date,
            title: document.querySelector("#home-day-card .home-tile-title").textContent
        }));
    }
    async function pickLastMonday() {
        const fetched = page.waitForResponse(r => r.url().includes(`/sessions/week?weekStart=${lastMon}`));
        await page.click("#home-week-prev");
        await fetched;
        await wait(200);
        await page.click(`.home-day[data-date="${lastMon}"]`);
        await wait(150);
    }

    // 1. Summary (Last session row) → Back: last week's Monday again
    await openHome();
    await pickLastMonday();
    await page.click("#home-last-row");
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(300);
    await page.click("#summary-back-btn");
    let v = await shown();
    check("Back from a summary: the same day", v.selected === lastMon && v.monday === lastMon, JSON.stringify(v));
    check("…its card, not today's", v.title !== "Today", v.title);

    // 2. Reload on the summary, then Back: still that day
    await page.click("#home-last-row");
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#summary-back-btn", { visible: true });
    await wait(300);
    await page.click("#summary-back-btn");
    v = await shown();
    check("after a reload on the summary, Back: the same day", v.selected === lastMon, JSON.stringify(v));
    check("…and the address is Home's", page.url().endsWith("#/home"), page.url());

    // 3. Latest PR → History tab → Back
    await page.click("#home-pr-row");
    await page.waitForSelector("#exp-back-btn", { visible: true });
    await wait(300);
    await page.click("#exp-back-btn");
    v = await shown();
    check("Back from an exercise's History: the same day", v.selected === lastMon, JSON.stringify(v));

    // 4. Bodyweight tile → Back
    await page.click("#home-weight-tile .home-tile-title");
    await page.waitForSelector("#bw-back-btn", { visible: true });
    await wait(300);
    await page.click("#bw-back-btn");
    v = await shown();
    check("Back from Bodyweight: the same day", v.selected === lastMon, JSON.stringify(v));

    // 5. The Home tab starts on today
    await page.click('#bottom-nav [data-tab="workouts"]');
    await wait(400);
    await page.click('#bottom-nav [data-tab="home"]');
    v = await shown();
    check("the Home tab: today", v.selected === today && v.title === "Today", JSON.stringify(v));

    // 6. Opening the app fresh starts on today too
    await pickLastMonday();
    await openHome();
    v = await shown();
    check("opening Home fresh: today", v.selected === today, JSON.stringify(v));
});
