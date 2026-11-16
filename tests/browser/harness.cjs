/* Shared parts of the browser tests (run with `npm test` in this folder;
   see run.cjs, which starts the throwaway backend and front end).

   Each test file calls run(async t => { ... }) and gets:
   - t.page: a 390 × 844 Chrome page (an iPhone-sized screen) whose calls
     to the backend on :8080 are sent to the throwaway one (API) instead,
   - t.check(name, ok, detail): one PASS / FAIL line,
   - t.api(method, path, body): the backend as the test's own account,
   - helpers below (wait, toSec, shot, startWorkout...).

   A test never talks to :8080: that's the real backend with real data. */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const API = process.env.API;
const APP = process.env.APP || "http://127.0.0.1:5591/";
if (!API || /:8080\b/.test(API)) {
    throw new Error("API must point at a throwaway backend, never :8080. Run the tests with `npm test`.");
}

const SHOTS = path.resolve(__dirname, "../../test screenshots");
const INVITE_CODE = "test";

const CHROME_PATHS = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome"
].filter(Boolean);

function findChrome() {
    const found = CHROME_PATHS.find(p => fs.existsSync(p));
    if (!found) throw new Error("No Chrome or Edge found. Set CHROME to its path.");
    return found;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// "01:30" or "1:30" → 90.
function toSec(text) {
    const [m, s] = text.split(":").map(Number);
    return m * 60 + s;
}

// The Monday of this week (YYYY-MM-DD), as the app sends it with a profile.
function monday() {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toLocaleDateString("en-CA");
}

async function request(method, urlPath, token, body) {
    const res = await fetch(API + urlPath, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
}

/* A new account with a profile, and a workout of `exercises` built-in
   weight & reps exercises (two-sided ones, so a set is one row). */
async function seedAccount({ prefix, workoutName, exercises = 1, restSeconds }) {
    const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@test.dev`;
    const { token } = await request("POST", "/auth/signup", null,
        { email, password: "password123", inviteCode: INVITE_CODE });
    await request("PUT", `/profile?weekStart=${monday()}`, token, { name: "Tester", weeklyGoal: 3 });
    if (restSeconds !== undefined) await request("PUT", "/profile/rest-seconds", token, { seconds: restSeconds });
    const workout = await request("POST", "/workouts", token, { name: workoutName });
    const all = await request("GET", "/exercises", token);
    const usable = all.filter(e => (e.logType || "WEIGHT_REPS") === "WEIGHT_REPS" && !e.unilateral);
    const picks = [usable.find(e => /bench press/i.test(e.name)) || usable[0],
        ...usable.filter(e => !/bench press/i.test(e.name))].slice(0, exercises);
    for (const e of picks) await request("POST", `/workouts/${workout.id}/exercises/${e.id}/link`, token);
    return { token, workout };
}

/* Runs one test file: seeds the account, opens the app logged in on
   `hash`, hands over to body(t), then prints the result and exits.
   onRequest(req, url) may answer a request itself (e.g. abort it to
   fake a lost connection) by returning true. */
/* Resolves when a request matching test() has finished (or failed): unlike
   waitForResponse, its body has arrived, so the page is about to use it. */
function untilRequestDone(page, test) {
    return new Promise(resolve => {
        const done = req => {
            if (!test(req)) return;
            page.off("requestfinished", done);
            page.off("requestfailed", done);
            resolve();
        };
        page.on("requestfinished", done);
        page.on("requestfailed", done);
    });
}

/* Waits until the app has finished starting up, i.e. its one check for a
   workout in progress (main.js restoreInProgressSession, the last call
   before it opens the page) has come back. Seeding data any earlier can
   race it: a session the test opens and finishes through the API could be
   seen open, and Start then asks to discard it (a test that hangs). The
   page's own resource timings are per page load, so a reload starts over. */
async function appStarted(page) {
    await page.waitForFunction(() => performance.getEntriesByType("resource")
        .some(e => e.name.includes("/sessions/unfinished") && e.responseEnd > 0), { timeout: 15000 });
}

function run(seed, hash, body) {
    let failures = 0;
    let checks = 0;
    let onRequest = null;
    let browser;
    let page;

    function check(name, ok, detail) {
        checks++;
        console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? `  (${detail})` : ""}`);
        if (!ok) failures++;
    }

    (async () => {
        const { token, workout } = await seedAccount(seed);
        browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
        page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on("request", req => {
            let url = req.url();
            if (url.startsWith("http://127.0.0.1:8080")) url = url.replace("http://127.0.0.1:8080", API);
            if (onRequest && onRequest(req, url)) return;
            req.continue(url !== req.url() ? { url } : undefined);
        });
        page.on("pageerror", e => check(`no page error (${e.message})`, false));

        // Log in by token, then load the page fresh so the app starts with it.
        await page.goto(APP, { waitUntil: "domcontentloaded" });
        await page.evaluate(t => { localStorage.clear(); localStorage.setItem("fitness.authToken", t); }, token);
        await page.goto(APP + hash, { waitUntil: "domcontentloaded" });
        await page.reload({ waitUntil: "domcontentloaded" });
        await appStarted(page);

        fs.mkdirSync(SHOTS, { recursive: true });
        const t = {
            page,
            check,
            workout,
            api: (method, urlPath, reqBody) => request(method, urlPath, token, reqBody),
            setOnRequest: fn => { onRequest = fn; },
            // Windows can briefly lock a just-written image (a preview pane,
            // a virus scan), so a failed save is tried again before giving up.
            async shot(name) {
                for (let tries = 1; ; tries++) {
                    try {
                        return await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
                    } catch (e) {
                        if (tries >= 5 || !/UNKNOWN|EBUSY|EPERM/.test(e.message)) throw e;
                        await wait(500);
                    }
                }
            },
            /* Home, freshly loaded (so the app also has workouts made through
               the API). Waits for the reloaded page's own data: the week line
               and the Bodyweight tile filled. Waiting on the requests instead
               can catch the answer meant for the page before the reload.
               data: false returns as soon as Home is drawn. */
            async openHome({ data = true } = {}) {
                await page.goto(page.url().split("#")[0] + "#/home", { waitUntil: "domcontentloaded" });
                await page.reload({ waitUntil: "domcontentloaded" });
                await page.waitForSelector("#home-day-card");
                if (data) {
                    await page.waitForFunction(() => {
                        const foot = document.getElementById("home-week-foot");
                        const badge = document.getElementById("home-weight-badge");
                        const note = document.getElementById("home-weight-note");
                        return foot && foot.textContent.trim() !== "" && badge && (!badge.hidden || !note.hidden);
                    }, { timeout: 15000 });
                }
                // Sizes are only right once the pixel font is in (a busy
                // machine can measure with the fallback font first).
                await page.evaluate(() => document.fonts.ready);
                await wait(250);
            },
            // Starts (or resumes) the seeded workout from the Workouts tab.
            async startWorkout() {
                const name = workout.name;
                const selector = `[aria-label="Start ${name}"], [aria-label="Resume ${name}"]`;
                // In a live workout there's no tab bar: ‹ Home first.
                const home = await page.$("#workout-home-btn");
                if (home && await home.isVisible()) {
                    await home.click();
                    await page.waitForSelector("#home-greeting");
                }
                const tab = await page.waitForSelector('#bottom-nav [data-tab="workouts"]', { visible: true });
                // The list draws twice (cache, then server): click once the
                // server's list is in, or the click can land on a button
                // that's about to be replaced and do nothing.
                const fresh = untilRequestDone(page, r => r.method() === "GET" && /\/workouts$/.test(r.url()));
                await tab.click();
                await fresh;
                await wait(150);
                await page.waitForSelector(selector);
                await page.evaluate(s => document.querySelector(s).click(), selector);
                // The bar (with ⏱) comes first; the exercise cards once
                // last time's sets have loaded.
                await page.waitForSelector("#rest-timer-btn");
                await page.waitForSelector(".exercise-card.active");
            }
        };
        await body(t);
    })().catch(async e => {
        console.log(`FAIL  test stopped: ${e.stack || e.message}`);
        failures++;
        // What was on screen, to tell a slow page from an unexpected one.
        if (page) {
            const seen = await page.evaluate(() => ({
                route: location.hash,
                dialog: (document.querySelector(".modal-message") || {}).textContent || null,
                title: (document.querySelector("h1, h2") || {}).textContent || null
            })).catch(() => null);
            console.log(`      on screen: ${JSON.stringify(seen)}`);
            await page.screenshot({ path: path.join(SHOTS, `FAILED-${seed.prefix}.png`) }).catch(() => {});
        }
    }).finally(async () => {
        if (browser) await browser.close().catch(() => {});
        console.log(failures === 0 ? `\nALL PASS (${checks} checks)` : `\n${failures} FAILED of ${checks}`);
        process.exit(failures === 0 ? 0 : 1);
    });
}

module.exports = { run, wait, toSec, monday, API, APP };
