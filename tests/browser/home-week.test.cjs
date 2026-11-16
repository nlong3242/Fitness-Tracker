/* Home's header and week strip (views/home.js): wordmark + gear, "Hi,
   name" with the selected day and Today, seven days marked done (green, ✓
   badge), planned (dashed) and today (dark letter pill), a ring on the
   selected one. Tapping a day selects it; the arrows and a swipe step a
   week keeping the weekday; Today comes back. The line under the strip
   counts the shown week's sessions against this week's goal. */
const { run, wait, monday } = require("./harness.cjs");

function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

run({ prefix: "homeweek", workoutName: "Week Day", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const today = new Date().toLocaleDateString("en-CA");
    const thisMon = monday();
    const lastMon = addDays(thisMon, -7);
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);

    // One workout finished today (sessions always take today's date), a
    // plan on another day this week and one next week. Last week can't be
    // seeded through the API, so its answer is made up here: two sessions
    // on the Monday.
    const done = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${done.id}/sets?exerciseId=${bench.id}`, { weight: 50, reps: 5 });
    await t.api("POST", `/sessions/${done.id}/finish`, {});
    const session = id => ({ sessionId: id, workoutId: workout.id, workoutName: "Week Day", sets: 1, durationSeconds: 1800 });
    t.setOnRequest((req, url) => {
        if (req.method() !== "GET" || !url.includes(`/sessions/week?weekStart=${lastMon}`)) return false;
        req.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(i => ({ date: addDays(lastMon, i), done: i === 0, planned: false,
                sessions: i === 0 ? [session(1), session(2)] : [], plans: [] }))) });
        return true;
    });
    const plannedDay = today === addDays(thisMon, 6) ? addDays(thisMon, 5) : addDays(thisMon, 6);
    await t.api("POST", "/scheduled-workouts", { date: plannedDay, workoutId: workout.id });
    await t.api("POST", "/scheduled-workouts", { date: addDays(thisMon, 9), workoutId: workout.id });

    const overview = page.waitForResponse(r => r.url().includes("/sessions/overview"));
    await page.click('#bottom-nav [data-tab="home"]');
    await overview;
    await page.waitForFunction(() => document.getElementById("home-week-foot").textContent.trim() !== "");
    await wait(200);

    const strip = () => page.evaluate(() => ({
        days: [...document.querySelectorAll(".home-day")].map(d => ({
            date: d.dataset.date, cls: d.className, n: d.querySelector(".home-day-box").textContent.trim(),
            badge: !!d.querySelector(".home-day-badge")
        })),
        selDate: document.getElementById("home-sel-date").textContent,
        todayHere: document.getElementById("home-today-btn").classList.contains("here"),
        foot: document.getElementById("home-week-foot").textContent.replace(/\s+/g, " ").trim()
    }));
    const weekResponse = start => page.waitForResponse(r => r.url().includes(`/sessions/week?weekStart=${start}`));

    // 1. Opens on this week, today selected
    let s = await strip();
    check("header: wordmark, sprig and gear", await page.evaluate(() =>
        !!document.querySelector(".home-top .home-title") && !!document.querySelector(".home-top .home-sprig")
        && !!document.querySelector("#home-settings-btn .home-gear")));
    check("greeting says Hi, Tester", (await page.$eval("#home-greeting", g => g.textContent)) === "Hi, Tester");
    check("seven days, Monday first", s.days.length === 7 && s.days[0].date === thisMon, s.days.map(d => d.date).join());
    const todayDay = s.days.find(d => d.date === today);
    check("today is marked and selected", /\btoday\b/.test(todayDay.cls) && /\bselected\b/.test(todayDay.cls), todayDay.cls);
    check("only one day is selected", s.days.filter(d => /\bselected\b/.test(d.cls)).length === 1);
    check("Today is faded on today", s.todayHere);
    // (Run on a Sunday the plan falls on Saturday, already past: skipped.)
    check("the plan this week shows dashed",
        new RegExp(plannedDay < today ? "\\bskipped\\b" : "\\bplanned\\b").test(s.days.find(d => d.date === plannedDay).cls));
    check("the date by the greeting is today's",
        s.selDate === new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", ""), s.selDate);
    check("today is done: green with a ✓, number kept", /\bdone\b/.test(todayDay.cls) && todayDay.badge
        && todayDay.n === String(new Date().getDate()), JSON.stringify(todayDay));
    check("this week's line: count against the goal, then the streak",
        /^1 \/ 3 sessions done this week ?· ?no streak yet$/.test(s.foot), s.foot);
    const pill = await page.$eval(".home-day.today .home-day-letter", l => getComputedStyle(l).backgroundColor);
    check("today's letter sits in a dark pill", pill === "rgb(59, 39, 35)", pill);
    // Thumb-sized: Today, the arrows and the day boxes; the ring stays clear of the next box.
    const sizes = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        const boxes = [...document.querySelectorAll(".home-day-box")].map(b => b.getBoundingClientRect());
        return { today: Math.round(r("#home-today-btn").height), prevW: Math.round(r("#home-week-prev").width),
            prevH: Math.round(r("#home-week-prev").height), prevLeft: Math.round(r("#home-week-prev").left),
            nextRight: Math.round(window.innerWidth - r("#home-week-next").right),
            box: Math.round(boxes[0].width), gap: Math.round(boxes[1].left - boxes[0].right) };
    });
    check("Today button at least 34px tall", sizes.today >= 34, JSON.stringify(sizes));
    check("arrows: 30×44 tap areas, inside the screen", sizes.prevW >= 30 && sizes.prevH >= 44 && sizes.prevLeft >= 0 && sizes.nextRight >= 0, JSON.stringify(sizes));
    check("day boxes about 40px, ring clear of the next box", sizes.box >= 40 && sizes.gap >= 5, JSON.stringify(sizes));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("no sideways overflow", overflow <= 0, overflow);
    await t.shot("home-week-01-today");

    // 2. Tap another day: it's selected, Today wakes up
    await page.click(`.home-day[data-date="${plannedDay}"]`);
    s = await strip();
    const ring = await page.$eval(`.home-day[data-date="${plannedDay}"] .home-day-box`, b => getComputedStyle(b).outlineStyle);
    check("tapped day is selected with a ring", /\bselected\b/.test(s.days.find(d => d.date === plannedDay).cls) && ring === "solid", ring);
    check("today keeps its pill, not selected", !/\bselected\b/.test(s.days.find(d => d.date === today).cls)
        && /\btoday\b/.test(s.days.find(d => d.date === today).cls));
    check("Today is no longer faded", !s.todayHere);
    await t.shot("home-week-02-tapped");

    // 3. ‹ goes to last week, same weekday
    const weekday = (Date.UTC(...plannedDay.split("-").map((n, i) => i === 1 ? n - 1 : +n))
        - Date.UTC(...thisMon.split("-").map((n, i) => i === 1 ? n - 1 : +n))) / 86400000;
    let fetched = weekResponse(lastMon);
    await page.click("#home-week-prev");
    await fetched;
    await wait(150);
    s = await strip();
    check("‹ shows last week", s.days[0].date === lastMon, s.days[0].date);
    check("the weekday is kept", /\bselected\b/.test(s.days[weekday].cls), s.days.map(d => d.cls).join(" | "));
    check("last Monday is done: green with a ✓, number kept",
        /\bdone\b/.test(s.days[0].cls) && s.days[0].badge && s.days[0].n === String(Number(lastMon.slice(8))), JSON.stringify(s.days[0]));
    check("no today mark in another week", !s.days.some(d => /\btoday\b/.test(d.cls)));
    check("last week's line counts both sessions, no goal", /^2 sessions done that week/.test(s.foot), s.foot);
    await page.click(`.home-day[data-date="${lastMon}"]`);
    await t.shot("home-week-03-last-week");

    // 4. Swipe left twice: next week, with its plan
    const swipe = async dx => {
        const box = await page.$eval("#home-strip", el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.evaluate((x, y, dx) => {
            const el = document.getElementById("home-strip");
            const touch = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
            el.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(x)], changedTouches: [touch(x)], bubbles: true }));
            el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch(x + dx)], bubbles: true }));
        }, box.x, box.y, dx);
    };
    await swipe(-120);
    await wait(150);
    s = await strip();
    check("swipe left: this week again (no fetch needed)", s.days[0].date === thisMon, s.days[0].date);
    const nextMon = addDays(thisMon, 7);
    fetched = weekResponse(nextMon);
    await swipe(-120);
    await fetched;
    // (drawn just after the answer arrives; a busy machine can take longer)
    await page.waitForSelector(`.home-day[data-date="${addDays(nextMon, 2)}"].planned`, { timeout: 5000 }).catch(() => {});
    await wait(150);
    s = await strip();
    check("swipe left again: next week", s.days[0].date === nextMon, s.days[0].date);
    check("next week's plan shows dashed", /\bplanned\b/.test(s.days[2].cls), s.days[2].cls);
    check("a mostly-vertical drag doesn't step", await (async () => {
        await page.evaluate(() => {
            const el = document.getElementById("home-strip");
            const t1 = new Touch({ identifier: 2, target: el, clientX: 100, clientY: 100 });
            const t2 = new Touch({ identifier: 2, target: el, clientX: 160, clientY: 220 });
            el.dispatchEvent(new TouchEvent("touchstart", { touches: [t1], changedTouches: [t1], bubbles: true }));
            el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t2], bubbles: true }));
        });
        await wait(100);
        return (await strip()).days[0].date === nextMon;
    })());

    // 5. Today: back to this week, today selected
    await page.click("#home-today-btn");
    await wait(150);
    s = await strip();
    check("Today returns to this week with today selected",
        s.days[0].date === thisMon && /\bselected\b/.test(s.days.find(d => d.date === today).cls) && s.todayHere);
    check("this week's line is back", /^1 \/ 3 sessions done this week/.test(s.foot), s.foot);

    // 6. Leaving and coming back opens on today again
    await page.click("#home-week-prev");
    await wait(300);
    await page.click('#bottom-nav [data-tab="workouts"]');
    await wait(300);
    await page.click('#bottom-nav [data-tab="home"]');
    await page.waitForSelector(".home-day");
    s = await strip();
    check("Home reopens on today", s.days[0].date === thisMon && s.todayHere);
});
