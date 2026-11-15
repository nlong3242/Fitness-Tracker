/* Editing a finished workout (views/editSession.js) on the set-logging
   page: its sets saved as they're typed, hints from the workout before it,
   nothing of a live workout (tab bar shown, no stopwatch, rest timer or ⋮),
   Next on the last exercise to its summary, and a live workout open at the
   same time left alone, even when every past set is deleted. */
const { run, wait } = require("./harness.cjs");

run({ prefix: "editses", workoutName: "Edit Past", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);
    const all = await t.api("GET", "/exercises");
    const extra = all.find(e => e.builtIn && /dumbbell/i.test(e.name) && e.id !== bench.id && !e.unilateral);
    await t.api("POST", `/workouts/${workout.id}/exercises/${extra.id}/link`);

    const done = async sets => {
        const s = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
        for (const [ex, weight, reps] of sets) await t.api("POST", `/sessions/${s.id}/sets?exerciseId=${ex.id}`, { weight, reps });
        await t.api("POST", `/sessions/${s.id}/finish`, {});
        return s;
    };
    await done([[bench, 70, 5]]);                                   // the time before
    const past = await done([[bench, 80, 5], [bench, 80, 5], [extra, 20, 10]]);
    // Today's workout, open while the past one is edited.
    const live = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${live.id}/sets?exerciseId=${bench.id}`, { weight: 90, reps: 3 });

    const base = page.url().split("#")[0];
    const editRoute = ex => `#/workouts/${workout.id}/sessions/${past.id}/edit?date=${past.date}&exercise=${ex.id}`;
    const open = async hash => {
        await page.goto(base + hash, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(".exercise-card.active");
        await wait(500);
    };
    const readRows = () => page.$$eval(".exercise-card.active .set-input-row", rs => rs.map(r => ({
        w: r.querySelector(".weight-input").value,
        r: r.querySelector(".reps-input").value,
        hint: `${r.querySelector(".weight-input").placeholder}x${r.querySelector(".reps-input").placeholder}`,
        dw: r.querySelector('[data-col="weight"] .set-input-delta').textContent,
        saved: r.classList.contains("saved")
    })));
    const pastSets = async () => (await t.api("GET", `/sessions/${past.id}/sets`))
        .map(s => `${s.exerciseId === bench.id ? "bench" : "extra"} ${s.weight}x${s.reps}`);
    const typeInto = async (i, box, text) => {
        const el = await (await page.$$(".exercise-card.active .set-input-row"))[i].$(box);
        // (the app puts the cursor at the end on a tap, so select-all clicks miss)
        await el.evaluate(e => { e.focus(); e.value = ""; });
        if (text) await el.type(text);
    };
    const leave = () => page.evaluate(() => document.activeElement.blur());

    // 1. Opens on the bench with the past workout's sets, hints from the time before
    await open(editRoute(bench));
    let r = await readRows();
    check("the past workout's sets, saved", r.length === 2 && r.every(x => x.saved && x.w === "80" && x.r === "5"), JSON.stringify(r));
    check("hints from the workout before it", r[0].hint === "70x5", r[0].hint);
    check("arrows against it", r[0].dw === "+10", r[0].dw);
    const title = await page.$eval(".workout-title-row h2", e => e.textContent);
    check("title is the workout and its day", title.startsWith(`${workout.name} - `), title);
    check("two pills, on 1", (await page.$$eval("#exercise-pills .exercise-pill", ps => ps.map(p => p.classList.contains("active")))).join() === "true,false");
    check("tab bar shown", await page.$eval("#bottom-nav", n => getComputedStyle(n).display !== "none" && !document.body.classList.contains("nav-hidden")));
    check("no stopwatch, rest timer or ⋮",
        !(await page.$("#workout-stopwatch")) && !(await page.$("#rest-timer-btn")) && !(await page.$(".exercise-card .more-btn, .workout-title-row .more-btn")));
    await t.shot("edit-session-01-open");

    // 2. Changing a set saves it into the past workout
    const put = page.waitForResponse(x => x.request().method() === "PUT" && /\/sets\/\d+$/.test(x.url()));
    await typeInto(1, ".weight-input", "82.5");
    await leave();
    check("a change saves", (await put).ok());
    await wait(300);
    check("into the past workout", (await pastSets()).includes("bench 82.5x5"), (await pastSets()).join(", "));

    // 3. Add Set saves into it too, and starts no rest
    await page.click(".exercise-card.active .add-set-btn");
    await wait(200);
    const posted = page.waitForResponse(x => x.request().method() === "POST" && /\/sets\?exerciseId=/.test(x.url()));
    await typeInto(2, ".weight-input", "75");
    await typeInto(2, ".reps-input", "8");
    await leave();
    const post = await posted;
    check("a new set saves", post.ok());
    check("to the past workout's session", post.url().includes(`/sessions/${past.id}/sets`), post.url());
    await wait(300);
    check("server has it", (await pastSets()).includes("bench 75x8"), (await pastSets()).join(", "));
    check("no rest started", (await page.evaluate(() => localStorage.getItem("restTimerEndsAt"))) === null);

    // 4. A reload stays on it
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".exercise-card.active .set-input-row");
    await wait(500);
    r = await readRows();
    check("after a reload: still editing, three sets", r.length === 3 && r.every(x => x.saved), JSON.stringify(r.map(x => `${x.w}x${x.r}`)));

    // 5. Every set deleted: the past workout stays, today's is untouched
    for (let i = 0; i < 3; i++) {
        const del = page.waitForResponse(x => x.request().method() === "DELETE" && /\/sets\/\d+$/.test(x.url()));
        await page.click(".exercise-card.active .set-input-row .set-input-cancel");
        await del;
        await wait(200);
    }
    await page.click("#exercise-nav-next");
    await wait(300);
    check("Next goes to the second exercise", (await page.$eval("#exercise-nav-counter", e => e.textContent)) === "2 / 2");
    const del = page.waitForResponse(x => x.request().method() === "DELETE" && /\/sets\/\d+$/.test(x.url()));
    await page.click(".exercise-card.active .set-input-row .set-input-cancel");
    await del;
    await wait(400);
    check("the past workout has no sets", (await pastSets()).length === 0, (await pastSets()).join(", "));
    const sessions = (await t.api("GET", `/workouts/${workout.id}/sessions?size=10`)).content.map(s => s.id);
    check("but it's still there", sessions.includes(past.id), JSON.stringify(sessions));
    const open2 = await t.api("GET", "/sessions/unfinished");
    check("today's workout is still open", open2 && open2.id === live.id, JSON.stringify(open2 && open2.id));
    const liveSets = await t.api("GET", `/sessions/${live.id}/sets`);
    check("with its set", liveSets.length === 1 && liveSets[0].weight === 90, JSON.stringify(liveSets));

    // 6. Next on the last exercise: its summary
    await page.click("#exercise-nav-next");
    await page.waitForSelector("#summary-back-btn");
    await wait(300);
    check("Next on the last goes to the summary",
        page.url().endsWith(`#/workouts/${workout.id}/sessions/${past.id}?date=${past.date}`), page.url());
    await t.shot("edit-session-02-summary");

    // 7. ‹ Back also goes to the summary (opened by address, as after a reload)
    await open(editRoute(extra));
    await page.click("#edit-session-back-btn");
    await page.waitForSelector("#summary-back-btn");
    check("‹ Back goes to the summary", page.url().includes(`/sessions/${past.id}?date=`), page.url());
});
