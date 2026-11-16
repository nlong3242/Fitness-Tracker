/* The floating glass tab bar (components/bottomNav.js, bottom-nav.css):
   a frosted pill 24px in from each side and clear of the bottom edge,
   icons only (each tab still named for screen readers), the lit tab a
   rose pill, the live light on Home while a workout is open. Pages keep
   their last content clear of it, and it still switches tabs. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "tabbar", workoutName: "Bar Day", exercises: 1 }, "#/home", async t => {
    const { page, check } = t;
    await page.waitForSelector("#home-day-card");
    await wait(400);

    const bar = await page.evaluate(() => {
        const nav = document.getElementById("bottom-nav").getBoundingClientRect();
        const pill = document.querySelector("#bottom-nav .nav-bar");
        const st = getComputedStyle(pill);
        const tabs = [...document.querySelectorAll("#bottom-nav .nav-tab")];
        return {
            glass: document.body.classList.contains("nav-glass"),
            left: Math.round(nav.left), right: Math.round(window.innerWidth - nav.right),
            bottom: Math.round(window.innerHeight - nav.bottom), height: Math.round(nav.height),
            blur: (st.backdropFilter || st.webkitBackdropFilter || "").includes("blur"),
            radius: parseFloat(st.borderTopLeftRadius),
            names: tabs.map(b => b.getAttribute("aria-label")),
            labelsShown: tabs.some(b => b.querySelector(".nav-label").getBoundingClientRect().width > 2),
            navHeight: getComputedStyle(document.body).getPropertyValue("--nav-height").trim(),
            lit: tabs.filter(b => b.classList.contains("active")).map(b => b.dataset.tab),
            litBg: getComputedStyle(document.querySelector("#bottom-nav .nav-tab.active")).backgroundColor
        };
    });
    check("glass look", bar.glass && bar.blur && bar.radius >= 30, JSON.stringify(bar));
    check("floats: 24px in from each side, clear of the bottom", bar.left === 24 && bar.right === 24 && bar.bottom >= 10, JSON.stringify(bar));
    check("58px tall", bar.height === 58, bar.height);
    check("icons only on screen", !bar.labelsShown);
    check("each tab still named", bar.names.join() === "Home,Workouts,Calendar,Exercises", bar.names.join());
    check("Home lit, as a rose pill", bar.lit.join() === "home" && bar.litBg !== "rgba(0, 0, 0, 0)", bar.litBg);
    await t.shot("tab-bar-01-home");

    // Tabs switch, and a long page's end stays clear of the bar
    for (const tab of ["workouts", "calendar", "exercises"]) {
        await page.click(`#bottom-nav [data-tab="${tab}"]`);
        await wait(700);
        const lit = await page.$eval(`#bottom-nav [data-tab="${tab}"]`, b => b.classList.contains("active"));
        check(`${tab}: switches and lights up`, lit);
    }
    await page.waitForSelector(".library-row, #library-list li, .exercise-row").catch(() => {});
    await page.evaluate(() => document.getElementById("app-scroll").scrollTo(0, 1e6));
    await wait(300);
    const clear = await page.evaluate(() => {
        const content = document.getElementById("app-content");
        const last = content.lastElementChild;
        let bottom = 0;
        for (const el of content.querySelectorAll("*")) {
            const r = el.getBoundingClientRect();
            if (r.height > 0 && r.bottom > bottom) bottom = r.bottom;
        }
        return Math.round(document.getElementById("bottom-nav").getBoundingClientRect().top - bottom) + (last ? 0 : 0);
    });
    check("scrolled to the end, the last thing clears the bar", clear >= 0, `${clear}px`);
    await t.shot("tab-bar-02-exercises-end");

    // A workout open: the live light on Home
    await t.startWorkout();
    await page.click("#workout-home-btn");
    await page.waitForSelector("#home-day-card");
    await wait(400);
    const dot = await page.evaluate(() => {
        const d = document.querySelector('#bottom-nav [data-tab="home"] .nav-live-dot').getBoundingClientRect();
        const pill = document.querySelector("#bottom-nav .nav-bar").getBoundingClientRect();
        return { shown: d.width > 0, inside: d.top >= pill.top && d.right <= pill.right,
            name: document.querySelector('#bottom-nav [data-tab="home"]').getAttribute("aria-label") };
    });
    check("live light on Home, inside the pill", dot.shown && dot.inside, JSON.stringify(dot));
    check("…and Home's name says so", /in progress/.test(dot.name), dot.name);
    await t.shot("tab-bar-03-live");
});
