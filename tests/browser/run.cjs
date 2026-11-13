/* Browser tests for the front end: real Chrome clicking through the app.

     cd tests/browser
     npm install          (once: puppeteer-core, which uses your own Chrome)
     npm test             (every *.test.cjs)
     npm test -- settings (only files whose name contains "settings")

   Starts its own backend (port 8091, a new empty database in the temp
   folder, deleted afterwards) and serves the front end (port 5591), so
   the real backend on 8080 and its data are never touched and can keep
   running. The backend jar is rebuilt first if it's missing or older than
   the backend's source. Tests run side by side, each with its own account.
   Screenshots go to "test screenshots/" at the repo root.

   Needs Java (as for the backend) and Chrome or Edge (or set CHROME). */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const API_PORT = Number(process.env.TEST_API_PORT || 8091);
const APP_PORT = Number(process.env.TEST_APP_PORT || 5591);
if (API_PORT === 8080 || APP_PORT === 8080) throw new Error("8080 is the real backend; pick another port.");

const TESTS_DIR = __dirname;
// Kept out of frontend/: the iOS app ships that whole folder (webDir).
const FRONTEND = path.resolve(TESTS_DIR, "../../frontend");
const BACKEND = path.resolve(TESTS_DIR, "../../backend/fitness-tracker");
const JAR = path.join(BACKEND, "target/fitness-tracker-0.0.1-SNAPSHOT.jar");

function newestMtime(dir) {
    let newest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
    }
    return newest;
}

function buildJarIfStale() {
    const sourceTime = Math.max(newestMtime(path.join(BACKEND, "src/main")), fs.statSync(path.join(BACKEND, "pom.xml")).mtimeMs);
    if (fs.existsSync(JAR) && fs.statSync(JAR).mtimeMs >= sourceTime) return;
    console.log("Building the backend jar (it's missing or older than the source)…");
    const windows = process.platform === "win32";
    // By full path: cmd may be set not to run programs from the current
    // folder (NoDefaultCurrentDirectoryInExePath). One string, as shell needs.
    const result = windows
        ? spawnSync(`"${path.join(BACKEND, "mvnw.cmd")}" -q -B package -DskipTests`, { cwd: BACKEND, stdio: "inherit", shell: true })
        : spawnSync("sh", ["mvnw", "-q", "-B", "package", "-DskipTests"], { cwd: BACKEND, stdio: "inherit" });
    if (result.status !== 0) throw new Error("Backend build failed.");
}

// The front end as files, like the Live Server on 5500 but on APP_PORT.
const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2",
    ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json"
};
function serveFrontend() {
    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent(req.url.split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const file = path.join(FRONTEND, urlPath);
        if (!file.startsWith(FRONTEND)) {
            res.writeHead(403);
            return res.end();
        }
        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(data);
        });
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(APP_PORT, "127.0.0.1", () => resolve(server));
    });
}

// On Windows "java" is often a launcher that starts the real JVM as a
// child, so the whole tree must go or the backend keeps the port.
function stopBackend(backend) {
    if (backend.exitCode !== null) return Promise.resolve();
    const exited = new Promise(r => backend.once("exit", r));
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(backend.pid), "/T", "/F"], { stdio: "ignore" });
    else backend.kill();
    return exited;
}

async function portAnswers(port) {
    try {
        await fetch(`http://127.0.0.1:${port}/`);
        return true;
    } catch (e) {
        return false;
    }
}

async function startBackend(dbDir) {
    // Something already there would answer instead of the new backend, and
    // the tests would run against it (stale code, old data).
    if (await portAnswers(API_PORT)) {
        throw new Error(`Port ${API_PORT} is already in use. Stop whatever runs there, or set TEST_API_PORT.`);
    }
    const log = fs.openSync(path.join(dbDir, "backend.log"), "w");
    const backend = spawn("java", ["-jar", JAR], {
        cwd: BACKEND,
        env: {
            ...process.env,
            PORT: String(API_PORT),
            APP_DB_PATH: path.join(dbDir, "fitness"),
            APP_INVITE_CODE: "test",
            APP_CORS_ORIGINS: `http://127.0.0.1:${APP_PORT}`
        },
        stdio: ["ignore", log, log]
    });
    let exited = false;
    backend.on("exit", () => { exited = true; });
    // Up once it answers: 401 = running and asking for a login.
    for (let i = 0; i < 120; i++) {
        if (exited) break;
        try {
            const res = await fetch(`http://127.0.0.1:${API_PORT}/workouts`);
            if (res.status === 401) return backend;
        } catch (e) { /* not listening yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    await stopBackend(backend);
    const tail = fs.readFileSync(path.join(dbDir, "backend.log"), "utf8").split("\n").slice(-30).join("\n");
    throw new Error(`The test backend didn't start on ${API_PORT} (is the port in use?).\n${tail}`);
}

function runTest(file) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [path.join(TESTS_DIR, file)], {
            env: { ...process.env, API: `http://127.0.0.1:${API_PORT}`, APP: `http://127.0.0.1:${APP_PORT}/` }
        });
        let output = "";
        child.stdout.on("data", d => { output += d; });
        child.stderr.on("data", d => { output += d; });
        child.on("exit", code => resolve({ file, ok: code === 0, output }));
    });
}

(async () => {
    const filters = process.argv.slice(2);
    const files = fs.readdirSync(TESTS_DIR)
        .filter(f => f.endsWith(".test.cjs"))
        .filter(f => filters.length === 0 || filters.some(x => f.includes(x)));
    if (files.length === 0) throw new Error(`No test files match ${filters.join(", ")}.`);

    buildJarIfStale();
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-browser-tests-"));
    let backend;
    let server;
    let results = [];
    try {
        [backend, server] = await Promise.all([startBackend(dbDir), serveFrontend()]);
        console.log(`Running ${files.length} test file(s) against a throwaway backend on ${API_PORT}…\n`);
        const started = Date.now();
        results = await Promise.all(files.map(runTest));
        for (const r of results) {
            console.log(`=== ${r.file}`);
            console.log(r.output.trimEnd());
            console.log("");
        }
        const failed = results.filter(r => !r.ok);
        console.log(`${results.length - failed.length} of ${results.length} file(s) passed in ${Math.round((Date.now() - started) / 1000)} s.`);
        if (failed.length) console.log(`Failed: ${failed.map(r => r.file).join(", ")}`);
    } finally {
        if (server) server.close();
        if (backend) await stopBackend(backend);
        try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch (e) { /* temp folder; harmless */ }
    }
    process.exit(results.length && results.every(r => r.ok) ? 0 : 1);
})().catch(e => {
    console.error(e.message || e);
    process.exit(1);
});
