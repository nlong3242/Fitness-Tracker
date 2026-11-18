const { run } = require("./harness.cjs");

/* Every page's Back is the same "‹ Back" link (styles/base/buttons.css
   .back-link): no boxed Back buttons left, each 44px tall. */
run({ prefix: "backlink", workoutName: "Link Day", exercises: 1 }, "#/home", async t => {
    const { page, check, workout } = t;
    const base = page.url().split("#")[0];
    const pages = [
        ["#/workouts", "#workouts-back-btn"], [`#/workouts/${workout.id}`, "#workout-back-btn"],
        [`#/workouts/${workout.id}/sessions`, "#past-sessions-back-btn"], ["#/bodyweight", "#bw-back-btn"],
        ["#/settings", "#settings-back-btn"], ["#/settings/rest", "#rest-back-btn"],
        ["#/settings/password", "#password-back-btn"], ["#/exercises", "#library-back-btn"],
        [`#/calendar/${new Date().toLocaleDateString("en-CA")}`, "#day-back"]
    ];
    /* Where the pixels actually are: a screenshot of the link, read back
       through a canvas. The vertical middle of the ‹'s dark pixels and of
       the word's. (Box sizes can't tell: fonts leave uneven room above
       and below their letters.) */
    async function inkCentres(sel) {
        const box = await page.$eval(sel, el => {
            const r = el.getBoundingClientRect(), g = el.querySelector(".back-glyph").getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height, split: g.right - r.left + 2 };
        });
        const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h }, encoding: "base64" });
        return page.evaluate(async (png, split) => {
            const img = new Image();
            img.src = "data:image/png;base64," + png;
            await img.decode();
            const c = document.createElement("canvas");
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
            const scale = width / img.naturalWidth || 1;
            const rows = (from, to) => {
                let top = null, bottom = null;
                for (let y = 0; y < height; y++) {
                    for (let x = from; x < to; x++) {
                        const i = (y * width + x) * 4;
                        if (data[i] + data[i + 1] + data[i + 2] < 300) { if (top === null) top = y; bottom = y; break; }
                    }
                }
                return { top, bottom };
            };
            const cut = Math.round(split * scale);
            const g = rows(0, cut), w = rows(cut, width);
            return { glyph: (g.top + g.bottom) / 2, word: (w.top + w.bottom) / 2, glyphRows: [g.top, g.bottom], wordRows: [w.top, w.bottom], wordHeight: w.bottom - w.top + 1 };
        }, png, box.split);
    }
    for (const [hash, sel] of pages) {
        await page.goto(base + hash, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector(sel, { visible: true });
        await page.evaluate(() => document.fonts.ready);
        const b = await page.$eval(sel, el => {
            const r = el.getBoundingClientRect();
            return { link: el.classList.contains("back-link"), boxed: el.classList.contains("btn-secondary"),
                glyph: !!el.querySelector(".back-glyph"), h: Math.round(r.height), left: Math.round(r.left) };
        });
        check(`${hash}: ‹ Back link, top left, 44px`, b.link && !b.boxed && b.glyph && b.h >= 44 && b.left <= 24, JSON.stringify(b));
        if (hash === "#/bodyweight") {
            await t.shot("back-link-bodyweight");
            const ink = await inkCentres(sel);
            check("the ‹ and the word are centred on each other (±1px)", Math.abs(ink.glyph - ink.word) <= 1, JSON.stringify(ink));
            // Linux (CI) draws the same font about 1px shorter in ink.
            const minHeight = process.platform === "linux" ? 12 : 13;
            check(`…and bigger: the word's letters ≥ ${minHeight}px tall`, ink.wordHeight >= minHeight, JSON.stringify(ink));
        }
    }
});
