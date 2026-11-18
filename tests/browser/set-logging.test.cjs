/* Plain set logging on a live workout card (components/setInputRow.js):
   last time's numbers as hints, typing a set saves it when you leave the
   row, the green/red arrows against last time, tapping "Set 01" logs last
   time's numbers, editing and emptying a saved set, a failed save turning
   the row red with a retry, a row's ✕, and typed values surviving a
   reload. Checked against the server each time. */
const { run } = require("./harness.cjs");

run({ prefix: "setlog", workoutName: "Set Logging", exercises: 1 }, "#/workouts", async t => {
    const { page, check, workout } = t;
    const [bench] = await t.api("GET", `/workouts/${workout.id}/exercises`);

    // Last time: 80 × 5, then 85 × 4.
    const before = await t.api("POST", `/workouts/${workout.id}/sessions`, {});
    await t.api("POST", `/sessions/${before.id}/sets?exerciseId=${bench.id}`, { weight: 80, reps: 5 });
    await t.api("POST", `/sessions/${before.id}/sets?exerciseId=${bench.id}`, { weight: 85, reps: 4 });
    await t.api("POST", `/sessions/${before.id}/finish`, {});

    // Fail the next set POST on request (the "no signal" case).
    let failNextSetPost = false;
    t.setOnRequest(function(req, url) {
        if (failNextSetPost && req.method() === "POST" && /\/sets\?exerciseId=/.test(url)) {
            failNextSetPost = false;
            req.abort();
            return true;
        }
        return false;
    });

    const rows = () => page.$$(".exercise-card.active .set-input-row");
    const rowAt = async i => (await rows())[i];
    const readRows = () => page.$$eval(".exercise-card.active .set-input-row", rs => rs.map(r => {
        const box = sel => r.querySelector(sel);
        const delta = col => {
            const d = r.querySelector(`[data-col="${col}"] .set-input-delta`);
            return d.textContent + (d.classList.contains("pos") ? "(green)" : d.classList.contains("neg") ? "(red)" : "");
        };
        return {
            label: r.querySelector(".set-input-num").textContent,
            hasHint: r.querySelector(".set-input-num").classList.contains("has-hint"),
            w: box(".weight-input").value, r: box(".reps-input").value,
            hint: `${box(".weight-input").placeholder}x${box(".reps-input").placeholder}`,
            dw: delta("weight"), dr: delta("reps"),
            saved: r.classList.contains("saved"),
            failed: r.classList.contains("save-failed"),
            error: r.querySelector(".set-input-error").textContent
        };
    }));
    const serverSets = async () => {
        const live = await t.api("GET", "/sessions/unfinished");
        if (!live) return [];
        return (await t.api("GET", `/sessions/${live.id}/sets`)).map(s => `${s.weight}x${s.reps}`);
    };
    const setRequest = method => page.waitForResponse(r => r.request().method() === method && /\/sets/.test(r.url()));
    // Types into a row's box, replacing what's there.
    const typeInto = async (i, box, text) => {
        const el = await (await rowAt(i)).$(box);
        await el.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        if (text) await el.type(text);
    };
    const leave = () => page.evaluate(() => document.activeElement.blur());

    // The page was open while that session was briefly in progress and may
    // have noticed it; a reload makes it start from what the server says.
    await page.reload({ waitUntil: "domcontentloaded" });
    await t.appStarted();
    await t.settle();

    // 1. One row per set last time, its numbers as hints
    await t.startWorkout();
    await t.settle();
    let r = await readRows();
    check("one row per set last time", r.length === 2, r.length);
    check("labelled Set 01, Set 02", r.map(x => x.label).join(",") === "Set 01,Set 02", r.map(x => x.label).join(","));
    check("hints are last time's numbers", r.map(x => x.hint).join(",") === "80x5,85x4", r.map(x => x.hint).join(","));
    check("labels are tappable (has a hint)", r.every(x => x.hasHint));
    await t.shot("set-logging-01-hints");

    // 2. Typing a set saves it once the row is left; arrows against last time
    let posted = setRequest("POST");
    await typeInto(0, ".weight-input", "82.5");
    await typeInto(0, ".reps-input", "5");
    await leave();
    check("leaving the row saves the set", (await posted).ok());
    await t.settle();
    r = await readRows();
    check("the row shows as saved", r[0].saved);
    check("weight up 2.5: green +2.5", r[0].dw === "+2.5(green)", r[0].dw);
    check("same reps: no arrow", r[0].dr === "", r[0].dr);
    check("server has 82.5x5", JSON.stringify(await serverSets()) === JSON.stringify(["82.5x5"]), (await serverSets()).join(","));

    // 3. Tapping "Set 02" logs last time's 85 × 4 in one go
    posted = setRequest("POST");
    await (await (await rowAt(1)).$(".set-input-num")).click();
    check("tapping the label saves", (await posted).ok());
    await t.settle();
    r = await readRows();
    check("filled with last time's numbers", r[1].w === "85" && r[1].r === "4", `${r[1].w}x${r[1].r}`);
    check("same as last time: no arrows", r[1].dw === "" && r[1].dr === "", `${r[1].dw}|${r[1].dr}`);
    check("server has both sets", JSON.stringify(await serverSets()) === JSON.stringify(["82.5x5", "85x4"]), (await serverSets()).join(","));
    // A second tap on a full row does nothing
    await (await (await rowAt(1)).$(".set-input-num")).click();
    await t.settle();
    check("a tap on a full row adds nothing", (await serverSets()).length === 2);

    // 4. Editing a saved set updates it; fewer reps: red arrow
    const put = setRequest("PUT");
    await typeInto(0, ".reps-input", "3");
    await leave();
    check("editing a saved set updates it", (await put).ok());
    await t.settle();
    r = await readRows();
    check("reps down 2: red -2", r[0].dr === "-2(red)", r[0].dr);
    check("server has 82.5x3", (await serverSets())[0] === "82.5x3", (await serverSets()).join(","));
    await t.shot("set-logging-02-arrows");

    // 5. Emptying a box un-logs the set (the row keeps what's left); refilling logs it again
    let deleted = setRequest("DELETE");
    await typeInto(1, ".reps-input", "");
    await leave();
    check("emptying reps deletes the set", (await deleted).ok());
    await t.settle();
    r = await readRows();
    check("the row stays, unsaved, with its weight", !r[1].saved && r[1].w === "85", JSON.stringify(r[1]));
    check("server has one set", (await serverSets()).length === 1, (await serverSets()).join(","));
    posted = setRequest("POST");
    await typeInto(1, ".reps-input", "6");
    await leave();
    check("refilling logs it again", (await posted).ok());
    await t.settle();
    check("server has 85x6", JSON.stringify(await serverSets()) === JSON.stringify(["82.5x3", "85x6"]), (await serverSets()).join(","));

    // 6. Add Set: a row with no hint; a comma counts as a decimal point
    await page.click(".exercise-card.active .add-set-btn");
    await t.settle();
    r = await readRows();
    check("Add Set adds Set 03", r.length === 3 && r[2].label === "Set 03", r.map(x => x.label).join(","));
    check("no last time for Set 03: no hint", !r[2].hasHint && r[2].hint === "x", r[2].hint);
    await typeInto(2, ".weight-input", "72,5");
    r = await readRows();
    check("72,5 becomes 72.5", r[2].w === "72.5", r[2].w);
    await typeInto(2, ".reps-input", "8a");
    r = await readRows();
    check("letters are dropped from reps", r[2].r === "8", r[2].r);

    // 7. A failed save: the row turns red with a retry, which saves it
    failNextSetPost = true;
    await leave();
    await page.waitForSelector(".exercise-card.active .set-input-row.save-failed");
    r = await readRows();
    check("failed save: the row is red", r[2].failed && !r[2].saved);
    check("and says so", r[2].error === "Not saved — tap ↻ to retry", r[2].error);
    await t.shot("set-logging-03-failed");
    posted = setRequest("POST");
    await (await (await rowAt(2)).$(".set-input-retry")).click();
    check("↻ saves it", (await posted).ok());
    await t.settle();
    r = await readRows();
    check("the row is saved, no longer red", r[2].saved && !r[2].failed && r[2].error === "");
    check("server has 72.5x8", (await serverSets())[2] === "72.5x8", (await serverSets()).join(","));

    // 8. A row's ✕ deletes its set and the row; the rest renumber
    deleted = setRequest("DELETE");
    await (await (await rowAt(0)).$(".set-input-cancel")).click();
    check("✕ deletes the set", (await deleted).ok());
    await t.settle();
    r = await readRows();
    check("the row goes; the rest renumber", r.length === 2 && r.map(x => x.label).join(",") === "Set 01,Set 02",
        r.map(x => `${x.label} ${x.w}x${x.r}`).join(", "));
    check("renumbered rows compare with their new place", r[0].dw === "+5(green)" && r[0].dr === "+1(green)", `${r[0].dw}|${r[0].dr}`);
    check("server has 85x6, 72.5x8", JSON.stringify(await serverSets()) === JSON.stringify(["85x6", "72.5x8"]), (await serverSets()).join(","));

    // 9. A half-typed row survives a reload (not saved: reps missing)
    await page.click(".exercise-card.active .add-set-btn");
    await t.settle();
    await typeInto(2, ".weight-input", "100");
    await leave();
    await t.settle();
    check("half a set isn't saved", (await serverSets()).length === 2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".exercise-card.active .set-input-row");
    await t.appStarted();
    await t.settle();
    r = await readRows();
    check("after a reload: saved sets come back", r[0].saved && r[1].saved && `${r[0].w}x${r[0].r},${r[1].w}x${r[1].r}` === "85x6,72.5x8",
        r.map(x => `${x.w}x${x.r}`).join(","));
    check("and the half-typed 100 is still there, unsaved", r.length === 3 && r[2].w === "100" && r[2].r === "" && !r[2].saved,
        JSON.stringify(r[2]));
    await t.shot("set-logging-04-reloaded");
});
