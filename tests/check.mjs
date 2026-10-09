// Headless browser check for Spiritual Traveller.
// Usage: node tests/check.mjs            (writes screenshots to tests/shots/)
// Env:   CHROME_BIN=/path/to/chrome-headless-shell   PW_REQUIRE=/path/to/a/package.json that has playwright
//        ONLY=basic|scenarios|phone|kleh|kbasic|kscenarios|kphone   run some parts (default: all; the k parts are the
//                                       Kailash Mansarovar journey, kailash.html)
//        MODES=mixed,train,bike,car     LEGS=0,1,2,3,4   which journeys the scenarios ride (default: all)
// The scenarios ride every leg in every way of travelling, end to end, with tests/monitor.js watching each frame,
// and photograph each getting on and off, each leaving of a temple and the train; contact sheets of the photographs
// go to tests/shots/sheets/.
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

const ONLY = process.env.ONLY || "";
const KPAGE = "kailash.html";
const part = (p) => !ONLY || ONLY.split(",").includes(p);
const results = [];
const ok = (name, pass, info = "") => {
	results.push({ name, pass, info });
	console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`);
};
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"] });

async function open(opts = {}, query = "", pageName = "") {
	const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 }, opts));
	const page = await ctx.newPage();
	const errors = [];
	page.on("console", (m) => {
		if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text());
	});
	page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
	page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
	await page.goto(BASE + pageName + query);
	await page.waitForFunction(() => window.app && window.app.ready, null, { timeout: 120000 });
	return { ctx, page, errors };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });

try {
	if (part("basic")) await basic();
	if (part("scenarios")) {
		await scenarios({ width: 1280, height: 760 }, "desk");
		await sheets("desk");
	}
	if (part("phone")) {
		await scenarios({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "phone");
		await sheets("phone");
	}
	if (part("kleh")) await kailashLeh();
	if (part("kbasic")) await kailashBasic();
	if (part("kscenarios")) {
		await scenarios({ width: 1280, height: 760 }, "kailash-desk", KPAGE);
		await sheets("kailash-desk");
	}
	if (part("kphone")) {
		await scenarios({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "kailash-phone", KPAGE);
		await sheets("kailash-phone");
	}
} catch (e) {
	ok("Run completed", false, e.message);
}
await browser.close();
server.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

async function basic() {
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
	const names = ["Bhimashankar", "Shirdi", "Tirumala", "Kedarnath", "Badrinath"];
	const greet = ["Om Namah Shivaya", "Om Sai Ram", "Om Namo Venkatesaya", "Om Namah Shivaya", "Om Namo Narayanaya"];
	const N = names.length;
	ok("Five shrines on the route", (await page.evaluate(() => app.route.chapters.length)) === N);
	await page.evaluate(() => app.setSpeed(3));
	for (let i = 0; i < N; i++) {
		await page.waitForFunction((i) => app.state === "darshan" && app.at === i, i, { timeout: 120000 });
		await wait(page, 3500);
		const d = await page.evaluate(() => ({ name: document.getElementById("d-name").textContent, m: document.getElementById("d-mantra-latin").textContent, show: document.getElementById("darshan").classList.contains("show"), s: app.s }));
		ok(`Darshan at ${names[i]}`, d.show && d.name === names[i] && d.m === greet[i], `${d.name}: ${d.m}`);
		await shot(page, `1${i}-darshan-${names[i].toLowerCase()}`);
		await page.click("#continue");
		if (i < N - 1) {
			await wait(page, 1200);
			const st = await page.evaluate(() => ({ state: app.state, leg: app.leg }));
			ok(`Continue sets out on leg ${i + 2}`, st.state === "travel" && st.leg === i + 1);
			if (i === 2) {
				// a mid-journey frame through the night
				await page.evaluate(() => { app.s = app.route.chapters[3].s0 + (app.route.chapters[3].s1 - app.route.chapters[3].s0) * 0.45; });
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
	await page.keyboard.press("5");
	await wait(page, 600);
	ok("Key 5 jumps to Badrinath", await page.evaluate(() => app.state === "darshan" && app.at === 4));
	// the last shrine has nowhere to continue to, so Space is tried from Shirdi
	await page.keyboard.press("2");
	await wait(page, 600);
	ok("Key 2 jumps to Shirdi", await page.evaluate(() => app.state === "darshan" && app.at === 1));
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
	for (const [q, name] of [["?shrine=1&noenter=1", "40-bhimashankar-monsoon"], ["?shrine=4&noenter=1", "41-kedarnath-snow"], ["?shrine=3&h=20&noenter=1", "42-tirumala-night"], ["?shrine=5&h=17.8&noenter=1", "43-badrinath-dusk"], ["?shrine=2&noenter=1", "44-shirdi-noon"], ["?shrine=2&h=19.5&noenter=1", "45-shirdi-dhoop-aarti-dusk"]]) {
		const o = await open({}, q);
		await wait(o.page, 5000);
		await shot(o.page, name);
		ok(`${name} console clean`, o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}

	// ---------- inside the temple, by itself ----------
	for (const [q, key] of [["?shrine=1", "bhimashankar"], ["?shrine=2", "shirdi"]]) {
		const o = await open({}, q);
		await o.page.waitForFunction(() => app.sanctum && app.sanctum.active, null, { timeout: 15000 }).catch(() => {});
		ok("Goes inside the temple by itself", await o.page.evaluate(() => app.sanctum.active));
		await wait(o.page, 6000);
		const step = await o.page.evaluate(() => app.sanctum.idx);
		await wait(o.page, 20000);
		ok("Rituals move on by themselves", (await o.page.evaluate(() => app.sanctum.idx)) > step);
		await shot(o.page, `46-inside-${key}`);
		ok("Inside console clean", o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}

	// ---------- getting on and off ----------
	{
		const o = await open({}, "?noenter=1&s=0.9&go=mixed");
		const until = (fn, ms) => o.page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
		ok("Bike: walks to the motorbike on its stand and gets on", await until(() => app.journey.status().ep === "walk>bike", 15000));
		ok("Bike: kicks up the stand and rides off", await until(() => app.mode === "bike" && !app.journey.status().ep && app.ride.bike.stand.rotation.x < -1, 40000));
		// by auto to Sainagar Shirdi station, along the platform, into the coach, and away; then a halt with passengers
		await o.page.evaluate(() => {
			app.leg = 2;
			app.s = app.roads.trains[2].from - 3;
			app.setSpeed(3);
		});
		ok("Train: walks along the platform and climbs into the coach", await until(() => app.journey.status().ep === "auto>train" && app.journey.status().step >= 7, 60000));
		ok("Train: the doors close and it pulls out slowly", await until(() => app.journey.status().onTrain && app.journey.rake.state === "run" && app.journey.rake.v < 2, 30000));
		ok("Train: halts at the next station, passengers getting on and off", await until(() => app.journey.status().halt && app.journey.walkers.some((w) => w.group.visible), 60000));
		ok("Boarding console clean", o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
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
	await phone.page.tap(".node.shrine >> nth=3");
	await wait(phone.page, 4000);
	ok("Phone: tap node opens Kedarnath darshan", await phone.page.evaluate(() => app.state === "darshan" && app.at === 3));
	await shot(phone.page, "52-phone-darshan");
	const inView = await phone.page.evaluate(() => {
		const r = document.getElementById("continue").getBoundingClientRect();
		return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth;
	});
	ok("Phone: continue button visible", inView);
	ok("Phone console clean", phone.errors.length === 0, phone.errors.slice(0, 5).join(" | "));
	await phone.ctx.close();
}
// ---------- every way of travelling, every leg, end to end ----------
// Whatever is on screen must fit it: panels, captions, chips and dialogs inside the viewport and not on top of
// one another (the toast and the chapter card may sit over the scene, not over the controls).
async function uiIssues(page) {
	return page.evaluate(() => {
		const out = [];
		const vis = (el) => {
			if (!el) return null;
			const cs = getComputedStyle(el);
			if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05 || el.closest("[hidden]")) return null;
			const r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 ? r : null;
		};
		const W = innerWidth, H = innerHeight;
		const els = { top: document.querySelector(".top"), bottom: document.querySelector(".bottom"), card: document.querySelector("#card.show"), toast: document.querySelector("#toast.show"), darshan: document.querySelector("#darshan.show"), kd: document.querySelector(".kd-card, .kd-pill") };
		const R = {};
		for (const [k, el] of Object.entries(els)) R[k] = vis(el);
		for (const [k, r] of Object.entries(R)) if (r && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) out.push(`${k} off screen (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
		const hit = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
		for (const [a, b] of [["card", "top"], ["card", "bottom"], ["toast", "top"], ["toast", "bottom"], ["toast", "card"], ["kd", "bottom"], ["kd", "top"], ["darshan", "top"]]) if (hit(R[a], R[b])) out.push(`${a} overlaps ${b}`);
		// text cut off inside its own box
		for (const id of ["where", "card-title", "card-line", "card-kicker", "toast"]) {
			const el = document.getElementById(id);
			if (vis(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== "ellipsis") out.push(`#${id} text cut off`);
		}
		for (const b of document.querySelectorAll(".controls .chip, .icons .ic")) {
			const r = vis(b);
			if (r && (r.right > W + 1 || r.left < -1)) out.push(`chip ${b.id} off screen`);
		}
		return out;
	});
}
async function scenarios(viewport, tag, page = "") {
	const dir = path.join(OUT, "scenarios-" + tag);
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	const modes = (process.env.MODES || "mixed,train,bike,car").split(",");
	const legs = process.env.LEGS ? process.env.LEGS.split(",").map(Number) : null;
	const ui = new Map();
	for (const mode of modes) {
		const o = await open(Object.assign({}, viewport), `?noenter=1&go=${mode}&h=11`, page);
		const p = o.page;
		await p.addScriptTag({ type: "module", url: BASE + "tests/monitor.js" });
		await p.waitForFunction(() => window.__mon, null, { timeout: 20000 });
		const N = await p.evaluate(() => app.route.chapters.length);
		for (let leg = 0; leg < N; leg++) {
			if (legs && !legs.includes(leg)) continue;
			// set out as the yatra does: from Pune, or from the last darshan with Continue
			await p.evaluate((leg) => {
				if (leg === 0) app.begin();
				else app.jump(leg - 1);
			}, leg);
			if (leg > 0) {
				await wait(p, 1800);
				await p.evaluate(() => app.next());
			}
			await p.evaluate(() => {
				app.setSpeed(3);
				Object.assign(window.__mon, { on: true, issues: [], counts: {}, seen: new Set() });
			});
			let n = 0;
			const t0 = Date.now();
			let arrived = false;
			while (Date.now() - t0 < 300000) {
				const st = await p.evaluate((leg) => ({ want: window.__mon.want, done: app.state === "darshan" && app.at === leg }), leg);
				if (st.done) {
					arrived = true;
					break;
				}
				if (st.want) {
					await wait(p, 450);
					const name = `${mode}-L${leg}-${String(++n).padStart(2, "0")}-${st.want.replace(/[^a-z0-9-]+/gi, "_")}`;
					await p.screenshot({ path: path.join(dir, name + ".png") });
					for (const u of await uiIssues(p)) {
						if (!ui.has(u)) ui.set(u, name);
					}
					await p.evaluate(() => window.__mon.resume());
				} else await wait(p, 100);
			}
			// the issues, gathered into stretches of the route: kind, where (s), what was happening, how many frames
			const res = await p.evaluate(() => {
				const runs = [];
				for (const i of window.__mon.issues) {
					const r = runs.find((q) => q.kind === i.kind && Math.abs(q.s1 - i.s) < 1.5 && q.ep === i.ep);
					if (r) (r.s1 = i.s), r.n++;
					else runs.push({ kind: i.kind, s0: i.s, s1: i.s, ep: i.ep, step: i.step, mode: i.mode, n: 1, eg: Object.fromEntries(Object.entries(i).filter(([k]) => !["kind", "leg", "s", "mode", "transport", "ep", "step"].includes(k))) });
				}
				return { counts: window.__mon.counts, runs, frames: window.__mon.frames };
			});
			await p.evaluate(() => (window.__mon.on = false));
			ok(`${tag} ${mode} leg ${leg + 1}: arrives at the shrine`, arrived);
			const bad = Object.entries(res.counts).filter(([k, v]) => v > 0);
			ok(`${tag} ${mode} leg ${leg + 1}: traveller in view, on the ground, no jumps; camera clear`, !bad.length, bad.map(([k, v]) => `${k}×${v}`).join(", "));
			for (const r of res.runs) console.log(`      ${r.kind} s ${r.s0}–${r.s1} ${r.mode}${r.ep ? " " + r.ep + "#" + r.step : ""} ×${r.n} ${JSON.stringify(r.eg)}`);
			// the darshan panel on arrival
			await wait(p, 2500);
			await p.screenshot({ path: path.join(dir, `${mode}-L${leg}-99-darshan.png`) });
			for (const u of await uiIssues(p)) if (!ui.has(u)) ui.set(u, `${mode}-L${leg}-99-darshan`);
		}
		ok(`${tag} ${mode}: console clean`, o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}
	ok(`${tag}: nothing cut off or overlapping on screen`, ui.size === 0, [...ui].slice(0, 8).map(([u, n]) => `${u} @ ${n}`).join(" | "));
}
// Contact sheets of the scenario photographs, twelve to a page, for looking through by eye.
async function sheets(tag) {
	const dir = path.join(OUT, "scenarios-" + tag), to = path.join(OUT, "sheets");
	fs.mkdirSync(to, { recursive: true });
	for (const f of fs.readdirSync(to)) if (f.startsWith(tag + "-")) fs.rmSync(path.join(to, f));
	const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
	const per = /phone/.test(tag) ? 8 : 12, cols = /phone/.test(tag) ? 4 : 3;
	const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
	const page = await ctx.newPage();
	for (let i = 0; i < files.length; i += per) {
		const set = files.slice(i, i + per);
		const html = `<body style="margin:0;background:#111;color:#eee;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px">${set.map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString("base64")}"><figcaption>${f}</figcaption></figure>`).join("")}</body>`;
		await page.setContent(html);
		await page.screenshot({ path: path.join(to, `${tag}-${String(i / per + 1).padStart(2, "0")}.png`), fullPage: true });
	}
	await ctx.close();
}

// ---------- the Kailash Mansarovar journey (kailash.html) ----------
// The way from Leh: the stops and route in order, every point inside Ladakh or western Tibet, and the choice of way
// remembered across loads.
async function kailashLeh() {
	const geo = await import(new URL("../js/kailash-geo.js", import.meta.url).href);
	const { ctx, page } = await open({}, "?noenter=1&route=leh", KPAGE);
	await wait(page, 1500);
	const d = await page.evaluate(() => import("./js/kailash-geo.js").then((m) => ({ choice: m.ROUTE_CHOICE, keys: m.SHRINES.map((s) => s.key), legs: m.ROUTE.map((r) => r.pts), stops: m.SHRINES.map((s) => [s.lon, s.lat]) })));
	ok("Leh: the way from Leh is chosen", d.choice === "leh");
	ok("Leh: stops in order", d.keys.join() === "hemis,chumathang,hanle,demchok,mansarovar,yamdwar,dirapuk,dolmala,darchen", d.keys.join());
	ok("Leh: the route starts in Leh", Math.hypot(d.legs[0][0][0] - 77.585, d.legs[0][0][1] - 34.164) < 0.01);
	ok("Leh: each leg ends at its stop", d.legs.every((pts, i) => Math.hypot(pts.at(-1)[0] - d.stops[i][0], pts.at(-1)[1] - d.stops[i][1]) < 0.02));
	ok("Leh: each leg starts where the last ended", d.legs.every((pts, i) => !i || Math.hypot(pts[0][0] - d.legs[i - 1].at(-1)[0], pts[0][1] - d.legs[i - 1].at(-1)[1]) < 0.02));
	const ladakh = d.legs.slice(0, 4).flat(), tib = d.legs.slice(4).flat();
	ok("Leh: the Ladakh legs lie in Ladakh", ladakh.every(([lo, la]) => lo > 77.3 && lo < 79.5 && la > 32.6 && la < 34.4));
	ok("Leh: the Tibet legs lie in Ngari", tib.every(([lo, la]) => lo > 79.4 && lo < 81.8 && la > 30.4 && la < 32.8));
	ok("Leh: the way climbs south-east, Leh to Demchok", d.stops.slice(0, 4).every((p, i) => !i || p[0] > d.stops[i - 1][0]));
	ok("Leh: geo module defaults to Leh", geo.ROUTE_CHOICE === "leh" || geo.ROUTE_CHOICE === "lipulekh");
	// the choice is remembered without the address saying so, and changing it reloads on the other way
	await page.goto(BASE + KPAGE + "?noenter=1");
	await wait(page, 1200);
	ok("Leh: the choice persists", await page.evaluate(() => document.documentElement.dataset.route === "leh" && document.querySelector('.route-choice [data-route="leh"]').getAttribute("aria-checked") === "true"));
	await page.click('.route-choice [data-route="lipulekh"]');
	await page.waitForURL(/route=lipulekh/);
	await wait(page, 1200);
	await page.goto(BASE + KPAGE + "?noenter=1");
	await wait(page, 1200);
	ok("Leh: choosing the Lipulekh is remembered", await page.evaluate(() => document.documentElement.dataset.route === "lipulekh" && !document.querySelector('[data-for="lipulekh"]').hidden));
	await page.evaluate(() => localStorage.setItem("kailashRoute", "leh"));
	await ctx.close();
}
async function kailashBasic() {
	const { ctx, page, errors } = await open({}, "?noenter=1&route=lipulekh", KPAGE);
	await wait(page, 1500);
	await shot(page, "k01-intro");
	ok("Kailash: the page is the Kailash journey", await page.evaluate(() => document.documentElement.dataset.journey === "kailash" && document.getElementById("intro-title").textContent === "Kailash Mansarovar"));
	await page.click("#start");
	await wait(page, 2500);
	const gl = await page.evaluate(() => ({ tris: app.renderer.info.render.triangles, frames: app.frames }));
	ok("Kailash: WebGL renders", gl.tris > 50000 && gl.frames > 20, `${gl.tris} triangles`);
	await shot(page, "k02-leaving-delhi");
	// (the yatra's bus pulls up and the traveller gets on first, so give it a moment)
	const s0 = await page.evaluate(() => app.s);
	ok("Kailash: travel advances from Delhi", await page.waitForFunction((s0) => app.s > s0 + 0.5, s0, { timeout: 30000 }).then(() => true, () => false));
	ok("Kailash: chapter card on start", (await page.evaluate(() => app.lastCard)) === "Delhi to the Kumaon Himalaya");
	ok("Kailash: starts from Delhi", await page.evaluate(() => document.querySelector(".node.start span").textContent === "Delhi"));
	const names = ["Narayan Ashram", "Kalapani", "Om Parvat", "Mansarovar", "Yam Dwar", "Dirapuk", "Dolma La", "Darchen"];
	const mantras = ["Om Namo Narayanaya", "Om Krim Kalikayai Namah"];
	ok("Kailash: eight stops on the route", (await page.evaluate(() => app.route.chapters.length)) === names.length);
	// the lakes are drawn, and the Tibet side keeps to the right
	ok("Kailash: Mansarovar and Rakshas Tal are drawn", await page.evaluate(() => app.world.rivers.children.filter((m) => m.name === "lake").length === 2));
	ok("Kailash: the Tibet side keeps to the right", await page.evaluate(() => app.journey.keep(app.route.chapters[3].s1 - 10) === -1 && app.journey.keep(app.route.chapters[0].s0 + 10) === 1));
	await page.evaluate(() => app.setSpeed(3));
	for (let i = 0; i < names.length; i++) {
		await page.waitForFunction((i) => app.state === "darshan" && app.at === i, i, { timeout: 240000 });
		await wait(page, 3500);
		const d = await page.evaluate(() => ({ name: document.getElementById("d-name").textContent, m: document.getElementById("d-mantra-latin").textContent, show: document.getElementById("darshan").classList.contains("show") }));
		ok(`Kailash: darshan at ${names[i]}`, d.show && d.name === names[i] && d.m === (mantras[i] || "Om Namah Shivaya"), `${d.name}: ${d.m}`);
		await shot(page, `k1${i}-darshan-${names[i].toLowerCase().replace(/ /g, "-")}`);
		await page.click("#continue");
		if (i < names.length - 1) {
			await wait(page, 1200);
			const st = await page.evaluate(() => ({ state: app.state, leg: app.leg }));
			ok(`Kailash: continue sets out on leg ${i + 2}`, st.state === "travel" && st.leg === i + 1);
		}
	}
	await wait(page, 1500);
	ok("Kailash: finale after Darchen", await page.evaluate(() => app.state === "finale" && !document.getElementById("finale").hidden));
	await shot(page, "k30-finale");
	await page.keyboard.press("Escape");
	await page.keyboard.press("8");
	await wait(page, 600);
	ok("Kailash: key 8 jumps to Darchen", await page.evaluate(() => app.state === "darshan" && app.at === 7));
	ok("Kailash: desktop console clean", errors.length === 0, errors.slice(0, 5).join(" | "));
	await ctx.close();
	// each stop close up, at its own hour and in its own weather
	for (let i = 1; i <= names.length; i++) {
		const o = await open({}, `?shrine=${i}&noenter=1`, KPAGE);
		await wait(o.page, 5000);
		await shot(o.page, `k4${i}-${names[i - 1].toLowerCase().replace(/ /g, "-")}`);
		ok(`Kailash: ${names[i - 1]} close up, console clean`, o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}
	// the rituals at the stops that have them go on by themselves
	for (let i = 1; i <= names.length; i++) {
		const o = await open({}, `?shrine=${i}`, KPAGE);
		const has = await o.page.evaluate(() => app.sanctum.has(app.route.chapters[app.at].shrine.key));
		if (!has) {
			ok(`Kailash: ${names[i - 1]} has no rituals to go in for, and no button`, await o.page.evaluate(() => document.getElementById("enter").hidden));
			await o.ctx.close();
			continue;
		}
		await o.page.waitForFunction(() => app.sanctum && app.sanctum.active, null, { timeout: 15000 }).catch(() => {});
		ok(`Kailash: the rituals at ${names[i - 1]} begin by themselves`, await o.page.evaluate(() => app.sanctum.active));
		await wait(o.page, 6000);
		const step = await o.page.evaluate(() => app.sanctum.idx);
		await wait(o.page, 20000);
		ok(`Kailash: the rituals at ${names[i - 1]} move on`, (await o.page.evaluate(() => app.sanctum.idx)) > step);
		await shot(o.page, `k5${i}-rituals-${names[i - 1].toLowerCase().replace(/ /g, "-")}`);
		ok(`Kailash: rituals at ${names[i - 1]}, console clean`, o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}
	// getting on and off: the yatra's bus out of Delhi, jeeps at Dharchula, the Chinese bus beyond the Lipulekh
	{
		const o = await open({}, "?noenter=1&s=0.6&go=mixed", KPAGE);
		const until = (fn, ms) => o.page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
		ok("Kailash: the yatra's bus pulls up in Delhi and the traveller gets on", await until(() => app.journey.status().ep === "walk>bus", 20000));
		ok("Kailash: rides the bus", await until(() => app.mode === "bus" && !app.journey.status().ep, 40000));
		await o.page.evaluate(() => {
			app.leg = 0;
			app.s = app.roads.ways[0][1].s - 3;
			app.setSpeed(3);
		});
		ok("Kailash: changes from the bus to a jeep at Dharchula", await until(() => app.journey.status().ep === "bus>jeep", 40000));
		await o.page.evaluate(() => {
			app.leg = 3;
			app.s = app.roads.ways[3][1].s - 2;
			app.setSpeed(2);
		});
		ok("Kailash: over the Lipulekh on foot, onto the Chinese bus, door on the right", await until(() => app.journey.status().ep === "walk>coach" && app.journey.keep(app.s) === -1, 60000));
		ok("Kailash: boarding console clean", o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}
	// on the bike (the journey's starting choice) the ride goes on across the Tibet side, keeping to the right
	{
		const o = await open({}, "?noenter=1", KPAGE);
		ok("Kailash: starts out on the motorbike", await o.page.evaluate(() => document.getElementById("transport-label").textContent === "Bike"));
		await o.page.evaluate(() => {
			app.begin();
			app.leg = 3;
			app.s = app.roads.ways[3][1].s + 8;
			app.setSpeed(2);
		});
		const until = (fn, ms) => o.page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
		ok("Kailash: by bike across the Tibet side, on the right", await until(() => app.mode === "bike" && !app.journey.busy() && app.journey.keep(app.s) === -1, 40000), await o.page.evaluate(() => app.mode + " " + app.journey.keep(app.s)));
		ok("Kailash: bike across Tibet, console clean", o.errors.length === 0, o.errors.slice(0, 3).join(" | "));
		await o.ctx.close();
	}
	// phone: the intro, the stop menu, a darshan
	const phone = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "?noenter=1", KPAGE);
	await wait(phone.page, 1200);
	await shot(phone.page, "k60-phone-intro");
	ok("Kailash phone: begin button on screen", await phone.page.evaluate(() => {
		const r = document.getElementById("start").getBoundingClientRect();
		return r.bottom <= innerHeight && r.top >= 0;
	}));
	await phone.page.tap("#start");
	await wait(phone.page, 2500);
	ok("Kailash phone: no horizontal overflow", !(await phone.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
	await phone.page.tap(".node.shrine >> nth=5");
	await wait(phone.page, 4000);
	ok("Kailash phone: tap node opens Dirapuk", await phone.page.evaluate(() => app.state === "darshan" && app.at === 5));
	await shot(phone.page, "k61-phone-darshan");
	ok("Kailash phone: continue button visible", await phone.page.evaluate(() => {
		const r = document.getElementById("continue").getBoundingClientRect();
		return r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth;
	}));
	ok("Kailash phone console clean", phone.errors.length === 0, phone.errors.slice(0, 5).join(" | "));
	await phone.ctx.close();
}
