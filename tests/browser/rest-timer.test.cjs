/* Rest timer in the live workout (components/restTimer.js): the â± button
   and quick times, the page dimmed behind the panel, the small and big
   rings, âˆ’ / +, Stop, a reload mid-rest, the "Rest over" pop-up, and
   Discard. */
const { run, wait, toSec } = require("./harness.cjs");

run({ prefix: "timer", workoutName: "Timer Test", exercises: 2 }, "#/workouts", async t => {
    const { page, check, api } = t;
    await t.startWorkout();

    const btnTime = () => page.$eval("#rest-timer-btn .rest-ring-time", el => el.textContent);
    const ls = key => page.evaluate(k => localStorage.getItem(k), key);
    const panelShown = () => page.$eval("#rest-timer-panel", el => !el.hidden);
    const popup = () => page.$("#rest-timer-popup");
    const openPanel = async () => { if (!(await panelShown())) await page.click("#rest-timer-btn"); };
    const clickChip = async s => {
        await openPanel();
        await page.click(`.rest-timer-chip[data-seconds="${s}"]`);
    };
    const restart = async sec => {
        await openPanel();
        if (await page.$(".rest-timer-stop")) await page.click(".rest-timer-stop");
        await clickChip(sec);
    };
    const step = async d => {
        await openPanel();
        await page.click(`.rest-timer-step[data-step="${d}"]`);
    };
    /* Where the pop-up is, against the highest of the bottom elements: the
       given bar and the timer panel when it's open. Gap 8â€“16 px, 12â€“20 px
       from the right edge, and not on top of anything below. Waits out its
       slide first. */
    const popupPlace = async barId => { await wait(350); return page.evaluate(id => {
        const p = document.getElementById("rest-timer-popup").getBoundingClientRect();
        let top = document.getElementById(id).getBoundingClientRect().top;
        const panel = document.getElementById("rest-timer-panel");
        if (panel && panel.getBoundingClientRect().height > 0) top = Math.min(top, panel.getBoundingClientRect().top);
        const gap = Math.round(top - p.bottom);
        const right = Math.round(innerWidth - p.right);
        return { gap, right, above: gap >= 8 && gap <= 16, onRight: right >= 12 && right <= 20 && p.left > innerWidth / 3 };
    }, barId); };
    // Somewhere on the dimmed page, away from the panel and the bar.
    const tapOutside = () => page.mouse.click(195, 150);

    // 1. Idle bar and quick times
    check("bar: no time while idle", (await btnTime()) === "");
    check("panel starts closed", !(await panelShown()));
    await t.shot("timer-01-bar-idle");
    await page.click("#rest-timer-btn");
    check("panel opens", await panelShown());
    const chips = await page.$$eval(".rest-timer-chip", els => els.map(e => e.textContent.trim()));
    check("8 quick times", chips.join(" ") === "0:30 0:45 1:00 1:30 2:00 3:00 4:00 5:00", chips.join(" "));
    check("my time is the account default, 3:00",
        await page.$eval(".rest-timer-chip.mine", e => e.textContent.trim()) === "3:00");
    check("no horizontal scroll at 390px",
        await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    await t.shot("timer-02-panel-idle");

    // 2. Dimmed page while the panel is open: only the bar can be used
    const tapTarget = sel => page.evaluate(s => {
        const r = document.querySelector(s).getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit.closest("#rest-timer-backdrop") || hit.id === "bottom-nav" ? "backdrop"
            : hit.closest("#exercise-nav-next") ? "next"
            : hit.closest("#exercise-nav-prev") ? "prev"
            : hit.closest("#rest-timer-btn") ? "timer" : hit.tagName;
    }, sel);
    const blockedChecks = async label => {
        check(`${label}: page is dimmed`, await page.$eval("#rest-timer-backdrop", b => !b.hidden));
        check(`${label}: Add Set can't be tapped`, (await tapTarget(".exercise-card.active button")) === "backdrop");
        check(`${label}: ‹ Home can't be tapped`, (await tapTarget("#workout-home-btn")) === "backdrop");
        check(`${label}: Next can be tapped`, (await tapTarget("#exercise-nav-next")) === "next");
        check(`${label}: â± can be tapped`, (await tapTarget("#rest-timer-btn")) === "timer");
    };
    await blockedChecks("quick times");
    await tapOutside();
    check("tap outside closes the quick times", !(await panelShown()));
    check("backdrop goes with it", await page.$eval("#rest-timer-backdrop", b => b.hidden));
    check("closed: Add Set can be tapped again", (await tapTarget(".exercise-card.active button")) !== "backdrop");
    check("closed: ‹ Home can be tapped again", (await tapTarget('#workout-home-btn')) !== "backdrop");
    await page.click("#rest-timer-btn");
    const homeTab = await page.$eval('#workout-home-btn', el => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(homeTab.x, homeTab.y);
    await wait(300);
    check("tap on the dimmed ‹ Home closes the panel", !(await panelShown()));
    check("â€¦and stays on the workout", (await page.$("#rest-timer-btn")) !== null);

    // 3. A quick time starts rest at once, in the small ring only
    await clickChip(60);
    await wait(300);
    let left = toSec(await btnTime());
    check("1:00 starts rest, shown on the bar", left >= 58 && left <= 60, await btnTime());
    check("a quick time doesn't change the account's rest time", (await api("GET", "/profile")).restSeconds === 180);
    check("starting a rest closes the panel", !(await panelShown()));
    await t.shot("timer-03-started-closed");
    await page.click("#rest-timer-btn");
    check("tapping the small ring opens the big one",
        (await panelShown()) && (await page.$(".rest-ring-big")) !== null);
    await t.shot("timer-03-panel-running");
    await blockedChecks("big ring");
    await tapOutside();
    check("tap outside closes the big ring", !(await panelShown()));
    check("rest keeps running after closing", (await btnTime()) !== "");

    // 4. âˆ’ / + in 15 s steps
    await step(15);
    await wait(300);
    left = toSec(await btnTime());
    check("+ adds 15 s", left >= 73 && left <= 75, await btnTime());
    await step(-15);
    await wait(300);
    left = toSec(await btnTime());
    check("âˆ’ takes 15 s off", left >= 58 && left <= 60, await btnTime());
    check("time reads like a clock", /^\d\d:\d\d$/.test(await btnTime()), await btnTime());
    const barLooks = await page.$eval("#rest-timer-btn", b => ({
        icon: getComputedStyle(b.querySelector(".rest-timer-icon")).display,
        ring: getComputedStyle(b.querySelector(".rest-ring-small")).display
    }));
    check("bar shows the small ring, not the icon, while resting",
        barLooks.icon === "none" && barLooks.ring !== "none", JSON.stringify(barLooks));

    // 5. The rings empty as time passes: 0:30 rest, 10 s in â†’ about a third gone
    const ringGone = sel => page.$eval(`${sel} .rest-ring-arc`, a =>
        Number(a.getAttribute("stroke-dashoffset")) / Number(a.getAttribute("stroke-dasharray")));
    await restart(30);
    await openPanel();
    await wait(300);
    check("ring full at the start", (await ringGone(".rest-ring-big")) < 0.05);
    await wait(10000);
    const gone = await ringGone(".rest-ring-big");
    check("big ring a third empty after 10 s of 30", gone > 0.28 && gone < 0.42, gone.toFixed(2));
    const goneSmall = await ringGone("#rest-timer-btn");
    check("small ring matches", Math.abs(goneSmall - gone) < 0.05, goneSmall.toFixed(2));
    await t.shot("timer-03b-ring-running");
    await restart(60);
    await wait(300);

    // 6. Closing the panel, changing exercise
    await openPanel();
    await page.click("#rest-timer-btn");
    check("â± closes the panel again", !(await panelShown()));
    await t.shot("timer-04-bar-countdown");
    await page.click("#rest-timer-btn");
    await page.click("#exercise-nav-next");
    check("changing exercise closes the panel", !(await panelShown()));

    // 7. A reload mid-rest keeps counting
    const before = toSec(await btnTime());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#rest-timer-btn");
    await wait(400);
    left = toSec((await btnTime()) || "0:00");
    check("reload keeps the countdown", left > 0 && left <= before, `${before}s â†’ ${left}s`);

    // 8. Stop
    await page.click("#rest-timer-btn");
    await page.click(".rest-timer-stop");
    await wait(300);
    check("Stop clears the bar", (await btnTime()) === "");
    check("Stop clears storage", (await ls("restTimerEndsAt")) === null);
    check("Stop shows no pop-up", (await popup()) === null);
    check("panel back to quick times", (await page.$(".rest-ring-big")) === null);

    // 9. Running out shows the pop-up; a tap closes it
    await clickChip(30);
    await step(-15);
    await step(-15);
    await wait(400);
    check("rest over shows the pop-up", (await popup()) !== null);
    check("rest ended with the panel open", await panelShown());
    let place = await popupPlace("exercise-nav-row");
    check("pop-up sits just above the open panel, on the right", place.above && place.onRight, JSON.stringify(place));
    await tapOutside();
    check("panel closed", !(await panelShown()));
    place = await popupPlace("exercise-nav-row");
    check("closing the panel moves the pop-up down to the Prev/Next bar", place.above && place.onRight, JSON.stringify(place));
    await openPanel();
    place = await popupPlace("exercise-nav-row");
    check("opening the panel moves it back up above the panel", place.above && place.onRight, JSON.stringify(place));
    check("pop-up still showing", (await popup()) !== null);
    check("bar back to idle", (await btnTime()) === "");
    check("panel back to quick times, my time still 3:00",
        await page.$eval(".rest-timer-chip.mine", e => e.textContent.trim()) === "3:00");
    await t.shot("timer-05-popup");
    await page.click("#rest-timer-popup");
    check("tapping the pop-up closes it", (await popup()) === null);

    // 10. The pop-up leaves by itself after 10 s
    await clickChip(30);
    await step(-15);
    await step(-15);
    await wait(400);
    check("pop-up again", (await popup()) !== null);
    await wait(9000);
    check("still there at 9 s", (await popup()) !== null);
    await wait(1500);
    check("gone after 10 s", (await popup()) === null);

    // 11. The pop-up shows on another page (Home)
    await clickChip(30);
    await step(-15); // 15 s left
    await tapOutside(); // ‹ Home is covered while the panel is open
    await page.click('#workout-home-btn');
    await page.waitForSelector("#home-greeting");
    await wait(16000);
    check("pop-up shows on Home", (await popup()) !== null);
    place = await popupPlace("bottom-nav");
    check("on Home it sits just above the tab bar, on the right", place.above && place.onRight, JSON.stringify(place));
    await t.shot("timer-06-popup-home");
    await page.click("#rest-timer-popup");

    // 12. Ran out while the app was closed: pop-up if recent, nothing if long ago
    await page.evaluate(() => localStorage.setItem("restTimerEndsAt", String(Date.now() - 2000)));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#bottom-nav");
    await wait(600);
    check("recently ended rest shows the pop-up on reopen", (await popup()) !== null);
    await page.evaluate(() => localStorage.setItem("restTimerEndsAt", String(Date.now() - 10 * 60 * 1000)));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#bottom-nav");
    await wait(600);
    check("long-ended rest shows nothing", (await popup()) === null);
    check("long-ended rest is cleared", (await ls("restTimerEndsAt")) === null);

    // 13. Discard stops it
    await t.startWorkout();
    await clickChip(90);
    await page.click(".workout-title-row .more-btn");
    await page.click(".action-menu-item.danger");
    await page.waitForSelector(".modal-confirm");
    await page.click(".modal-confirm");
    await wait(500);
    check("Discard clears the timer", (await ls("restTimerEndsAt")) === null);
    await wait(400);
    check("no pop-up after Discard", (await popup()) === null);
});
