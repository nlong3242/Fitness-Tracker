/* Settings → Timers (views/settings.js): its own page with the 8 quick
   times and − / + in 15 s steps (0:15 to 10:00), saved with the account
   after the last tap; a failed save; and a logged set resting for it. */
const { run } = require("./harness.cjs");

run({ prefix: "restset", workoutName: "Settings Rest" }, "#/settings", async t => {
    const { page, check, api } = t;
    let failNextRestPut = false;
    t.setOnRequest(function(req, url) {
        if (failNextRestPut && req.method() === "PUT" && url.includes("/profile/rest-seconds")) {
            failNextRestPut = false;
            req.abort();
            return true;
        }
        return false;
    });
    const accountRest = async () => (await api("GET", "/profile")).restSeconds;
    const hash = () => page.evaluate(() => location.hash);

    // 1. Settings has a button; the controls are on their own page
    await page.waitForSelector("#settings-rest-btn");
    check("Settings itself has no rest controls", (await page.$("#rest-settings")) === null);
    const order = await page.$$eval(".settings-actions button", bs => bs.map(b => b.textContent.trim()).join(" | "));
    check("Timers button after Profile", order.startsWith("Profile | Timers"), order);
    await t.shot("rest-settings-00-settings");
    await page.click("#settings-rest-btn");
    await page.waitForSelector("#rest-settings-value");
    check("opens its own page", (await hash()) === "#/settings/rest", await hash());
    check("page title Timers", (await page.$eval(".page-title", e => e.textContent)) === "Timers");

    const value = () => page.$eval("#rest-settings-value", e => e.textContent);
    const mine = () => page.$$eval("#rest-settings-chips .rest-timer-chip.mine",
        els => els.map(e => e.textContent.trim()).join(","));
    const status = () => page.$eval("#rest-settings-status", e => e.textContent);
    /* The save of `seconds`. By value: on a slow machine two quick taps can
       be far enough apart to save twice, and the first save isn't the one
       the test is waiting for. */
    const restPut = seconds => page.waitForResponse(r => r.request().method() === "PUT"
        && r.url().includes("/profile/rest-seconds")
        && JSON.parse(r.request().postData() || "{}").seconds === seconds, { timeout: 15000 });
    const statusSays = text => t.waitFor(x => document.getElementById("rest-settings-status").textContent.startsWith(x), text);
    const chip = s => page.click(`#rest-settings-chips .rest-timer-chip[data-seconds="${s}"]`);

    // 2. Default
    check("shows 3:00 by default", (await value()) === "3:00", await value());
    check("3:00 quick time is highlighted", (await mine()) === "3:00", await mine());
    const chips = await page.$$eval("#rest-settings-chips .rest-timer-chip",
        els => els.map(e => e.textContent.trim()).join(" "));
    check("the 8 quick times", chips === "0:30 0:45 1:00 1:30 2:00 3:00 4:00 5:00", chips);
    check("no horizontal scroll at 390px",
        await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    await t.shot("rest-settings-01-default");

    // 3. + adjusts in 15 s steps; quick taps make one save
    let saves = 0;
    const countSaves = r => {
        if (r.request().method() === "PUT" && r.url().includes("/profile/rest-seconds")) saves++;
    };
    page.on("response", countSaves);
    let put = restPut(210);
    // Two quick taps, in one go: two separate clicks from the test can be
    // more than the 600 ms save delay apart on a slow machine.
    await page.$eval("#rest-settings-plus", b => { b.click(); b.click(); });
    check("+ twice shows 3:30", (await value()) === "3:30", await value());
    check("no quick time highlighted for 3:30", (await mine()) === "", await mine());
    await put;
    check("shows Saved", await statusSays("Saved"), await status());
    await t.settle(); // a second save would have gone by now
    check("saved once for two taps", saves === 1, `${saves} saves`);
    check("account has 3:30", (await accountRest()) === 210, await accountRest());
    page.off("response", countSaves);
    await t.shot("rest-settings-02-adjusted");

    // 4. A quick time picks it
    put = restPut(90);
    await chip(90);
    await put;
    check("quick time 1:30 shows and highlights", (await value()) === "1:30" && (await mine()) === "1:30");
    check("account has 1:30", (await accountRest()) === 90);

    // 5. − from a quick time
    put = restPut(75);
    await page.click("#rest-settings-minus");
    await put;
    check("− gives 1:15", (await value()) === "1:15");
    check("account has 1:15", (await accountRest()) === 75);

    // 6. Lower limit 0:15 (the two taps save together, after the last)
    put = restPut(15);
    await chip(30);
    await page.click("#rest-settings-minus");
    check("0:15 is the lowest", (await value()) === "0:15");
    check("− is disabled at 0:15", await page.$eval("#rest-settings-minus", b => b.disabled));
    await put;
    check("account has 0:15", (await accountRest()) === 15);

    // 7. Upper limit 10:00 (9:45 set on the account, read on reload)
    await api("PUT", "/profile/rest-seconds", { seconds: 585 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#rest-settings-value");
    check("reload stays on the Timers page", (await hash()) === "#/settings/rest");
    check("reload shows the account's 9:45", (await value()) === "9:45", await value());
    put = restPut(600);
    await page.click("#rest-settings-plus");
    check("10:00 is the highest", (await value()) === "10:00");
    check("+ is disabled at 10:00", await page.$eval("#rest-settings-plus", b => b.disabled));
    await put;
    check("account has 10:00", (await accountRest()) === 600);

    // 8. A failed save goes back to what the account has
    failNextRestPut = true;
    await chip(60);
    check("failed save: says so", await statusSays("Couldn't save"), await status());
    check("failed save: back to 10:00", (await value()) === "10:00", await value());
    check("failed save: account unchanged", (await accountRest()) === 600);
    await t.shot("rest-settings-03-failed");

    // 9. Back to Settings
    await chip(120);
    put = restPut(135);
    await page.click("#rest-settings-plus");
    await put;
    check("account has 2:15", (await accountRest()) === 135);
    await page.click("#rest-back-btn");
    await page.waitForSelector("#settings-rest-btn");
    check("Back returns to Settings", (await hash()) === "#/settings");

    // 10. The live timer uses it: a logged set rests 2:15 (on the test's
    //     clock, so it reads exactly that)
    await t.startWorkout();
    await t.clock.install();
    await page.click("#rest-timer-btn");
    check("timer panel highlights no quick time for 2:15",
        (await page.$$eval("#rest-timer-panel .rest-timer-chip.mine", els => els.length)) === 0);
    await page.mouse.click(195, 150); // close the panel
    await page.click(".exercise-card.active > button");
    const created = t.response("POST", /\/sets\?exerciseId=/);
    const row = (await page.$$(".exercise-card.active .set-input-row"))[0];
    await (await row.$(".weight-input")).type("40");
    await (await row.$(".reps-input")).type("5");
    await page.evaluate(() => document.activeElement.blur());
    await created;
    const rests = await t.waitFor(() => document.querySelector("#rest-timer-btn .rest-ring-time").textContent === "02:15");
    check("a logged set rests for the Settings time (2:15)", rests,
        await page.$eval("#rest-timer-btn .rest-ring-time", e => e.textContent));
});
