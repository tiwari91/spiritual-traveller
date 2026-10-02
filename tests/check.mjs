// Headless browser check for Spiritual Traveller.
// Usage: node tests/check.mjs            (writes screenshots to tests/shots/)
// Env:   CHROME_BIN=/path/to/chrome-headless-shell   PW_REQUIRE=/path/to/a/package.json that has playwright
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(process.env.PW_REQUIRE || import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tests", "shots");
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_BIN || undefined;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const server = http.createServer((req, res) => {
	let p = decodeURIComponent(req.url.split("?")[0]);
	if (p.endsWith("/")) p += "index.html";
	const f = path.join(ROOT, p);
	if (!f.startsWith(ROOT)) {
		res.writeHead(403);
		res.end();
		return;
	}
	fs.readFile(f, (e, d) => {
		if (e) {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
		res.end(d);
	});
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = process.env.BASE || `http://127.0.0.1:${server.address().port}/`;

const results = [];
const ok = (name, pass, info = "") => {
	results.push({ name, pass, info });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`);
};
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] });

async function open(opts = {}, query = "") {
	const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 }, opts));
	const page = await ctx.newPage();
	const errors = [];
	page.on("console", (m) => {
		if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text());
	});
	page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
	page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
	await page.goto(BASE + query);
	await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 120000 });
	return { ctx, page, errors };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });

try {
	// ---------- desktop ----------
	// the main run stays at the door (?noenter=1); going inside by itself is checked further down
	const { ctx, page, errors } = await open({}, "?noenter=1");
	await wait(page, 1500);
	await shot(page, "01-intro");
	await page.click("#start");
	await wait(page, 2500);
	const gl = await page.evaluate(() => ({ tris: app.renderer.info.render.triangles, calls: app.renderer.info.render.calls, frames: app.frames }));
	ok("WebGL renders", gl.tris > 50000 && gl.frames > 20, `${gl.tris} triangles, ${gl.calls} calls`);
	await shot(page, "02-leaving-pune");
	const s0 = await page.evaluate(() => app.s);
	await wait(page, 2000);
	const s1 = await page.evaluate(() => app.s);
	ok("Travel advances along the route", s1 > s0, `${(s1 - s0).toFixed(2)} units in 2 s`);
	ok("Chapter card on start", (await page.evaluate(() => app.lastCard)) === "Pune to the Sahyadri");

	// Travel to every shrine by running the clock fast, then continue on.
	const names = ["Bhimashankar", "Tirumala", "Kedarnath", "Badrinath"];
	const greet = ["Om Namah Shivaya", "Om Namo Venkatesaya", "Om Namah Shivaya", "Om Namo Narayanaya"];
	await page.evaluate(() => app.setSpeed(3));
	for (let i = 0; i < 4; i++) {
		await page.waitForFunction((i) => app.state === "darshan" && app.at === i, i, { timeout: 120000 });
		await wait(page, 3500);
		const d = await page.evaluate(() => ({ name: document.getElementById("d-name").textContent, m: document.getElementById("d-mantra-latin").textContent, show: document.getElementById("darshan").classList.contains("show"), s: app.s }));
		ok(`Darshan at ${names[i]}`, d.show && d.name === names[i] && d.m === greet[i], `${d.name}: ${d.m}`);
		await shot(page, `1${i}-darshan-${names[i].toLowerCase()}`);
		await page.click("#continue");
		if (i < 3) {
			await wait(page, 1200);
			const st = await page.evaluate(() => ({ state: app.state, leg: app.leg }));
			ok(`Continue sets out on leg ${i + 2}`, st.state === "travel" && st.leg === i + 1);
			if (i === 1) {
				// a mid-journey frame through the night
				await page.evaluate(() => { app.s = app.route.chapters[2].s0 + (app.route.chapters[2].s1 - app.route.chapters[2].s0) * 0.45; });
				await wait(page, 2500);
				await shot(page, "20-night-plains");
				ok("Night falls on the long leg north", (await page.evaluate(() => app.night)) > 0.5);
			}
		}
	}
	await wait(page, 1500);
	ok("Finale after Badrinath", await page.evaluate(() => app.state === "finale" && !document.getElementById("finale").hidden));
	await shot(page, "30-finale");

	// keyboard: jump and pause
	await page.keyboard.press("Escape");
	await page.keyboard.press("2");
	await wait(page, 600);
	ok("Key 2 jumps to Tirumala", await page.evaluate(() => app.state === "darshan" && app.at === 1));
	await page.keyboard.press("Space");
	await wait(page, 400);
	await page.keyboard.press("Space");
	await wait(page, 400);
	ok("Space continues then pauses", await page.evaluate(() => app.state === "travel" && app.playing === false));
	await page.keyboard.press("t");
	await page.keyboard.press("w");
	ok("Time and weather cycle", await page.evaluate(() => app.time === 1 && app.weather === 1));
	ok("Desktop console clean", errors.length === 0, errors.slice(0, 5).join(" | "));
	await ctx.close();

	// ---------- weather close-ups ----------
	for (const [q, name] of [["?shrine=1&noenter=1", "40-bhimashankar-monsoon"], ["?shrine=3&noenter=1", "41-kedarnath-snow"], ["?shrine=2&h=20&noenter=1", "42-tirumala-night"], ["?shrine=4&h=17.8&noenter=1", "43-badrinath-dusk"]]) {
		const o = await open({}, q);
		await wait(o.page, 5000);
		await shot(o.page, name);
		ok(`${name} console clean`, o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}

	// ---------- inside the temple, by itself ----------
	{
		const o = await open({}, "?shrine=1");
		await o.page.waitForFunction(() => app.sanctum && app.sanctum.active, null, { timeout: 15000 }).catch(() => {});
		ok("Goes inside the temple by itself", await o.page.evaluate(() => app.sanctum.active));
		await wait(o.page, 6000);
		const step = await o.page.evaluate(() => app.sanctum.idx);
		await wait(o.page, 20000);
		ok("Rituals move on by themselves", (await o.page.evaluate(() => app.sanctum.idx)) > step);
		await shot(o.page, "44-inside-bhimashankar");
		ok("Inside console clean", o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}

	// ---------- phone ----------
	const phone = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "?noenter=1");
	await wait(phone.page, 1200);
	await shot(phone.page, "50-phone-intro");
	await phone.page.tap("#start");
	await wait(phone.page, 2500);
	await shot(phone.page, "51-phone-travel");
	const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
	ok("Phone: no horizontal overflow", !overflow);
	await phone.page.tap(".node.shrine >> nth=2");
	await wait(phone.page, 4000);
	ok("Phone: tap node opens Kedarnath darshan", await phone.page.evaluate(() => app.state === "darshan" && app.at === 2));
	await shot(phone.page, "52-phone-darshan");
	const inView = await phone.page.evaluate(() => {
		const r = document.getElementById("continue").getBoundingClientRect();
		return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth;
	});
	ok("Phone: continue button visible", inView);
	ok("Phone console clean", phone.errors.length === 0, phone.errors.slice(0, 5).join(" | "));
	await phone.ctx.close();
} catch (e) {
	ok("Run completed", false, e.message);
}
await browser.close();
server.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
