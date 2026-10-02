// Spiritual Traveller: entry point. Builds India, the route and the shrines, then runs the yatra.
import * as THREE from "three";
import { World } from "./world.js";
import { Route } from "./route.js";
import { Sky } from "./sky.js";
import { buildLandmarks, GOLD, LAMP, beaconMaterial } from "./landmarks.js";
import { routeLine, pilgrimLamp, cityLights, Weather, Petals } from "./effects.js";
import { Audio } from "./audio.js";
import { CITIES, GAURIKUND, INDIA, LANKA, SHRINES, toWorld } from "./geo.js";
import { clamp, lerp, nextFrame, smoothstep, store } from "./util.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const coarse = matchMedia("(pointer: coarse)").matches;
const small = Math.min(innerWidth, innerHeight) < 600;
const LOW = params.get("q") === "low" || (params.get("q") !== "high" && (coarse || small));
const SPEEDS = [1, 2, 4, 8];
const TIMES = [["Auto", null], ["Dawn", 6.4], ["Noon", 12.5], ["Dusk", 18.2], ["Night", 22.5]];
const WEATHERS = ["Auto", "Clear", "Monsoon", "Snow"];
// Where the lamp rests in front of each shrine (local units in front of the door).
const REST = { bhimashankar: 3.2, tirupati: 4.1, kedarnath: 3.4, badrinath: 2.85 };

const app = { ready: false, frames: 0, t: 0, state: "loading", s: 0, leg: 0, at: -1, playing: true, speed: 0, time: 0, weather: 0, visited: [false, false, false, false], params };
window.app = app;

// ---------- renderer ----------
const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.renderer = renderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);
app.camera = camera;

let world, route, sky, landmarks, line, lamp, lights, weather, petals;
const audio = new Audio();

async function init() {
	const msg = $("loader-msg");
	msg.textContent = "Raising the Himalaya";
	await nextFrame();
	await nextFrame();
	world = new World({ step: LOW ? 0.12 : 0.09 });
	world.compute();
	msg.textContent = "Painting the plains";
	await nextFrame();
	world.buildMeshes();
	scene.add(world.mesh, world.sea, world.rivers);
	route = new Route(world);
	msg.textContent = "Building the temples";
	await nextFrame();
	landmarks = buildLandmarks(world, scene);
	line = routeLine(route);
	scene.add(line);
	lamp = pilgrimLamp();
	scene.add(lamp);
	lights = cityLights(world);
	scene.add(lights);
	weather = new Weather(scene);
	petals = new Petals(scene);
	sky = new Sky(scene);
	if (LOW) sky.sun.shadow.mapSize.set(1024, 1024);
	Object.assign(app, { world, route, sky, landmarks, scene });
	// where the road gives way to the footpath below Kedarnath
	const gk = toWorld(GAURIKUND[0], GAURIKUND[1]);
	const c2 = route.chapters[2];
	let best = Infinity;
	for (const p of route.pts) if (p.s >= c2.s0 && p.s <= c2.s1) {
		const d = (p.x - gk.x) ** 2 + (p.z - gk.z) ** 2;
		if (d < best) { best = d; app.sGauri = p.s; }
	}
	buildUI();
	app.ready = true;
	$("start").disabled = false;
	$("loader").classList.add("done");
	app.state = "intro";
	if (params.has("shrine")) {
		begin();
		jump(clamp(parseInt(params.get("shrine"), 10) - 1 || 0, 0, 3));
	} else if (params.has("s")) {
		begin();
		app.s = clamp(parseFloat(params.get("s")) || 0, 0, route.length - 0.01);
		app.leg = route.chapterAt(app.s).index;
	}
	if (params.has("h")) {
		const h = parseFloat(params.get("h"));
		app.fixedHour = h;
	}
	if (params.has("wx")) app.weather = clamp(WEATHERS.findIndex((w) => w.toLowerCase() === params.get("wx")), 0, 3);
	rig.snap = true;
	requestAnimationFrame(loop);
}

// ---------- time and weather ----------
function autoHour(s) {
	const c = route.chapters;
	const keys = [[0, 6.5], [c[0].s1, 8.6], [c[1].s1, 16.6], [c[2].s1, 30.7], [c[3].s1, 33.4]];
	for (let k = 0; k < keys.length - 1; k++) {
		if (s <= keys[k + 1][0]) return lerp(keys[k][1], keys[k + 1][1], clamp((s - keys[k][0]) / (keys[k + 1][0] - keys[k][0] || 1), 0, 1)) % 24;
	}
	return 9.4;
}
function currentHour() {
	if (app.fixedHour !== undefined) return app.fixedHour;
	if (TIMES[app.time][1] !== null) return TIMES[app.time][1];
	if (app.state === "intro") return 17.4;
	return autoHour(app.s);
}
function currentWeather(focus) {
	const w = { rain: 0, snow: 0, overcast: 0 };
	const mode = WEATHERS[app.weather];
	if (mode === "Clear") return w;
	if (mode === "Monsoon") return { rain: 1, snow: 0, overcast: 0.85 };
	if (mode === "Snow") return { rain: 0, snow: 1, overcast: 0.35 };
	if (app.state === "intro") return w;
	for (const l of landmarks) {
		const d = Math.hypot(focus.x - l.pos.x, focus.z - l.pos.z);
		if (l.shrine.weather === "monsoon") {
			const k = smoothstep(26, 8, d);
			w.rain = Math.max(w.rain, k);
			w.overcast = Math.max(w.overcast, 0.85 * k);
		} else if (l.shrine.weather === "snow") {
			const k = smoothstep(12, 4, d);
			w.snow = Math.max(w.snow, k);
			w.overcast = Math.max(w.overcast, 0.25 * k);
		}
	}
	return w;
}

// ---------- journey ----------
function begin() {
	if (app.state !== "intro" && app.state !== "restart") return;
	document.body.classList.add("started");
	app.state = "travel";
	app.s = 0;
	app.leg = 0;
	app.playing = true;
	chapterCard(0);
	updatePlay();
}
function chapterCard(i) {
	const c = route.chapters[i];
	showCard(`Leg ${i + 1} of 4 · ${c.kicker}`, c.title, `${c.mode} to ${c.shrine.name}`);
}
function arrive(i) {
	app.state = "darshan";
	app.at = i;
	app.leg = i;
	app.s = route.chapters[i].s1;
	app.visited[i] = true;
	app.darshanT = 0;
	const s = SHRINES[i];
	$("d-kicker").textContent = `Darshan ${i + 1} of 4 · ${s.kind}`;
	$("d-name").textContent = s.name;
	$("d-deva").textContent = s.deva;
	$("d-deity").textContent = s.deity;
	$("d-mantra").textContent = s.mantra;
	$("d-mantra-latin").textContent = s.mantraLatin;
	$("d-state").textContent = s.state;
	$("d-alt").textContent = s.altitude;
	$("d-season").textContent = s.season;
	$("d-access").textContent = s.access;
	$("d-note").textContent = s.note;
	$("d-greet").textContent = s.greeting;
	$("continue").textContent = i === 3 ? "Complete the yatra" : `Continue to ${SHRINES[i + 1].name}`;
	$("darshan").querySelector(".d-scroll").scrollTop = 0;
	$("darshan").classList.add("show");
	document.body.classList.add("darshan-open");
	hideCard();
	toast(`${s.mantraLatin}`);
	audio.bell(3);
	rig.userYaw = 0;
	rig.userPitch = 0;
	refreshMarks();
}
function closeDarshan() {
	$("darshan").classList.remove("show");
	document.body.classList.remove("darshan-open");
}
function next() {
	if (app.state === "intro") return begin();
	if (app.state !== "darshan") return;
	closeDarshan();
	if (app.at === 3) {
		app.state = "finale";
		showFinale();
		return;
	}
	app.state = "travel";
	app.leg = app.at + 1;
	app.at = -1;
	app.playing = true;
	updatePlay();
	chapterCard(app.leg);
}
function jump(i) {
	if (app.state === "intro") begin();
	$("finale").hidden = true;
	closeMenu();
	arrive(i);
	rig.snap = true;
}
function restart() {
	$("finale").hidden = true;
	closeDarshan();
	closeMenu();
	app.visited = [false, false, false, false];
	app.at = -1;
	app.state = "restart";
	begin();
	rig.snap = true;
	refreshMarks();
}
function showFinale() {
	const ul = $("finale-list");
	ul.innerHTML = "";
	for (const s of SHRINES) {
		const li = document.createElement("li");
		li.innerHTML = `<b></b><span></span>`;
		li.firstChild.textContent = s.name;
		li.lastChild.textContent = s.mantraLatin;
		ul.appendChild(li);
	}
	$("finale-km").textContent = `About ${Math.round(route.km(route.length) / 10) * 10} km along the drawn line from Pune, through the Sahyadri, the Deccan and the Gangetic plain to the Garhwal Himalaya. Har Har Mahadev. Govinda, Govinda. Jai Badri Vishal.`;
	$("finale").hidden = false;
	$("finale-again").focus();
}

// ---------- camera ----------
const rig = { target: new THREE.Vector3(), yaw: 0, pitch: 0.8, dist: 80, userYaw: 0, userPitch: 0, zoom: 1, snap: true, view: { x: 0, y: 0 } };
const tmp = {};
const angLerp = (a, b, t) => {
	let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
};
function cameraGoal() {
	const g = { target: new THREE.Vector3(), yaw: 0, pitch: 0.8, dist: 80 };
	if (app.state === "intro" || app.state === "loading") {
		const c = toWorld(79.5, 21.5);
		g.target.set(c.x, 6, c.z);
		g.yaw = 0.25 + Math.sin(app.t * 0.05) * 0.2;
		g.pitch = 0.95;
		g.dist = innerWidth < innerHeight ? 1350 : 900;
		return g;
	}
	if (app.state === "finale") {
		const a = toWorld(76.5, 23), b = toWorld(79.5, 23);
		g.target.set((a.x + b.x) / 2, 8, a.z);
		g.yaw = app.t * 0.03;
		g.pitch = 1.0;
		g.dist = innerWidth < innerHeight ? 1150 : 760;
		return g;
	}
	if (app.state === "darshan") {
		const l = landmarks[app.at];
		const high = l.pos.y > 30;
		// in the Himalaya the camera stands low and looks up the valley so the snow peaks fill the sky
		g.target.copy(l.pos).add(new THREE.Vector3(0, high ? 3.4 : 1.5, 0));
		g.yaw = l.shrine.facing + 0.25 + Math.sin(app.darshanT * 0.1) * 0.4;
		g.pitch = high ? 0.05 : 0.3;
		g.dist = innerWidth < innerHeight ? 18 : 10.5;
		return g;
	}
	const p = route.at(app.s, tmp);
	const c = route.chapters[app.leg];
	const near = smoothstep(26, 3, Math.min(c.s1 - app.s, app.s - c.s0));
	const far = [36, 190, 230, 50][app.leg];
	g.target.set(p.x, p.y + 0.6, p.z);
	g.yaw = Math.atan2(-p.dx, -p.dz);
	g.pitch = lerp(app.leg === 1 || app.leg === 2 ? 0.72 : 0.8, 0.42, near);
	g.dist = lerp(far, 16, near) * (innerWidth < innerHeight ? 1.35 : 1);
	return g;
}
function updateCamera(dt) {
	const g = cameraGoal();
	const yaw = g.yaw + rig.userYaw, pitch = clamp(g.pitch + rig.userPitch, -0.05, 1.45), dist = g.dist * rig.zoom;
	const k = rig.snap ? 1 : 1 - Math.exp(-dt * 1.8), ky = rig.snap ? 1 : 1 - Math.exp(-dt * 1.1);
	rig.target.lerp(g.target, rig.snap ? 1 : 1 - Math.exp(-dt * 4));
	rig.yaw = angLerp(rig.yaw, yaw, ky);
	rig.pitch = lerp(rig.pitch, pitch, k);
	rig.dist = Math.exp(lerp(Math.log(rig.dist), Math.log(dist), k));
	rig.snap = false;
	const cp = Math.cos(rig.pitch);
	camera.position.set(rig.target.x + Math.sin(rig.yaw) * cp * rig.dist, rig.target.y + Math.sin(rig.pitch) * rig.dist, rig.target.z + Math.cos(rig.yaw) * cp * rig.dist);
	const ground = world.height(camera.position.x, camera.position.z) + 1.2;
	if (camera.position.y < ground) camera.position.y = ground;
	camera.lookAt(rig.target);
	// keep the shrine clear of the darshan panel
	const open = app.state === "darshan";
	const wide = innerWidth > 720;
	const vx = open && wide ? Math.min(210, innerWidth * 0.17) : 0;
	const vy = open && !wide ? innerHeight * 0.27 : 0;
	rig.view.x = lerp(rig.view.x, vx, 1 - Math.exp(-dt * 3));
	rig.view.y = lerp(rig.view.y, vy, 1 - Math.exp(-dt * 3));
	if (Math.abs(rig.view.x) > 0.5 || Math.abs(rig.view.y) > 0.5) camera.setViewOffset(innerWidth, innerHeight, rig.view.x, rig.view.y, innerWidth, innerHeight);
	else camera.clearViewOffset();
}

// ---------- loop ----------
let last = performance.now();
const focus = new THREE.Vector3();
const lampPos = new THREE.Vector3();
function loop(now) {
	requestAnimationFrame(loop);
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	app.t += dt;
	app.frames++;
	if (app.state === "travel" && app.playing) {
		const c = route.chapters[app.leg];
		const ease = 0.22 + 0.78 * smoothstep(0, 10, Math.min(c.s1 - app.s, app.s - c.s0));
		app.s += route.legSpeed[app.leg] * SPEEDS[app.speed] * ease * dt;
		if (app.s >= c.s1) arrive(app.leg);
	}
	if (app.state === "darshan") {
		app.darshanT += dt;
		if (params.get("auto") === "1" && app.darshanT > 14) next();
	}
	updateCamera(dt);
	// pilgrim lamp
	const p = route.at(app.s, tmp);
	lampPos.set(p.x, p.y + 0.15, p.z);
	for (const l of landmarks) {
		const d = Math.hypot(p.x - l.pos.x, p.z - l.pos.z);
		const R = REST[l.shrine.key];
		if (d < R) {
			const f = l.shrine.facing;
			let dx = Math.sin(f), dz = Math.cos(f);
			if (d > 0.01) {
				const t = d / R;
				dx = lerp(dx, (p.x - l.pos.x) / d, t);
				dz = lerp(dz, (p.z - l.pos.z) / d, t);
				const n = Math.hypot(dx, dz) || 1;
				dx /= n;
				dz /= n;
			}
			lampPos.set(l.pos.x + dx * R, 0, l.pos.z + dz * R);
			lampPos.y = world.height(lampPos.x, lampPos.z) + 0.12;
		}
	}
	lamp.position.copy(lampPos);
	lamp.visible = app.state !== "intro";
	const ls = Math.max(1, camera.position.distanceTo(lampPos) * 0.028);
	lamp.scale.setScalar(ls);
	lamp.userData.flame.scale.set(1, 1 + Math.sin(app.t * 13) * 0.08 + Math.sin(app.t * 7.3) * 0.06, 1);
	lamp.userData.halo.material.opacity = 0.75 + Math.sin(app.t * 5) * 0.1;
	// sky, light and weather
	focus.copy(rig.target);
	const hour = currentHour();
	const wx = currentWeather(focus);
	sky.update(hour, focus, dt, { overcast: wx.overcast, snow: wx.snow > 0.3 });
	scene.fog.density *= clamp(70 / rig.dist, 0.12, 1.2);
	const night = smoothstep(4, -8, sky.elev);
	app.night = night;
	LAMP.emissiveIntensity = 0.25 + night * 4;
	GOLD.emissiveIntensity = 0.45 + night * 1.1; // lamplight on the gilded roofs after dark
	lights.material.opacity = night * 0.8;
	lights.material.size = clamp(rig.dist * 0.007, 0.35, 1.6);
	line.material.uniforms.uWidth.value = clamp(rig.dist * 0.0055, 0.1, 1.1);
	beaconMaterial().uniforms.uOpacity.value = clamp((rig.dist - 25) / 140, 0, 1) * 0.5;
	const wscale = clamp(rig.dist / 25, 1, 4);
	weather.update(dt, focus, wx.rain, wx.snow, wscale);
	const lm = app.state === "darshan" ? landmarks[app.at] : null;
	petals.update(dt, lm ? lm.pos : focus, !!lm && app.darshanT > 1);
	// in darshan only the shrine at hand is drawn, so no other temple peeks over a ridge
	landmarks.forEach((l, i) => (l.root.visible = app.state !== "darshan" || app.at === i));
	for (const l of landmarks) {
		l.steam.forEach((sp, i) => {
			const ph = (app.t * 0.25 + i / l.steam.length) % 1;
			sp.position.y = 0.3 + ph * 1.4;
			sp.material.opacity = 0.22 * Math.sin(ph * Math.PI);
			sp.scale.setScalar(0.5 + ph * 0.9);
		});
	}
	line.material.uniforms.uProg.value = app.state === "intro" ? -1 : app.s;
	line.material.uniforms.uTime.value = app.t;
	renderer.render(scene, camera);
	if (app.frames % 2 === 0) updateLabels();
	if (app.frames % 4 === 0) updateHud(hour);
}

// ---------- UI ----------
const labelEls = [];
function buildUI() {
	// labels
	const box = $("labels");
	const add = (text, x, y, z, cls, maxDist) => {
		const el = document.createElement("div");
		el.className = "label " + cls;
		el.textContent = text;
		box.appendChild(el);
		labelEls.push({ el, v: new THREE.Vector3(x, y, z), maxDist, cls });
		return el;
	};
	landmarks.forEach((l, i) => {
		const el = add(l.shrine.name, l.pos.x, l.pos.y + 5, l.pos.z, "shrine", 1e9);
		labelEls[labelEls.length - 1].shrine = i;
		el.dataset.i = i;
	});
	for (const c of CITIES) {
		if (c.name === "Tirupati") continue;
		const w = toWorld(c.lon, c.lat);
		add(c.name, w.x, world.height(w.x, w.z) + 1.5, w.z, "city", c.size >= 3 ? 320 : 150);
	}
	// shrine menu
	const ul = $("chapter-list");
	SHRINES.forEach((s, i) => {
		const li = document.createElement("li");
		const b = document.createElement("button");
		b.innerHTML = `<span class="n">${i + 1}</span><span><b></b><small></small></span>`;
		b.querySelector("b").textContent = s.name;
		b.querySelector("small").textContent = s.altitude.split(";")[0];
		b.addEventListener("click", () => jump(i));
		li.appendChild(b);
		ul.appendChild(li);
	});
	// progress nodes
	const nodes = $("nodes");
	const mk = (pct, label, cls, onClick) => {
		const b = document.createElement("button");
		b.className = "node " + cls;
		b.style.left = pct + "%";
		b.innerHTML = `<i></i><span></span>`;
		b.querySelector("span").textContent = label;
		b.setAttribute("aria-label", label);
		if (onClick) b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
		nodes.appendChild(b);
	};
	mk(0, "Pune", "start", restart);
	SHRINES.forEach((s, i) => mk(((i + 1) / 4) * 100, s.name, "shrine", () => jump(i)));
	if (coarse) $("hint").textContent = "Drag to look around · pinch to zoom · tap a shrine on the progress bar to go there";
	// minimap base
	drawMapBase();
	// buttons
	$("start").addEventListener("click", begin);
	$("continue").addEventListener("click", next);
	$("btn-play").addEventListener("click", togglePlay);
	$("btn-speed").addEventListener("click", () => setSpeed((app.speed + 1) % SPEEDS.length));
	$("btn-time").addEventListener("click", () => cycleTime());
	$("btn-weather").addEventListener("click", () => cycleWeather());
	$("btn-sound").addEventListener("click", toggleSound);
	$("btn-chapters").addEventListener("click", () => ($("chapters").hidden ? openMenu() : closeMenu()));
	$("btn-restart").addEventListener("click", restart);
	$("btn-help").addEventListener("click", () => { $("help").hidden = false; $("help-close").focus(); });
	$("help-close").addEventListener("click", () => ($("help").hidden = true));
	$("help").addEventListener("click", (e) => { if (e.target.id === "help") $("help").hidden = true; });
	$("finale-again").addEventListener("click", restart);
	$("finale-close").addEventListener("click", () => ($("finale").hidden = true));
	if (store.get("sound", false)) {
		// browsers need a gesture before audio; arm it for the first click
		addEventListener("pointerdown", () => { if (!audio.on) toggleSound(); }, { once: true });
	}
	installInput();
	refreshMarks();
	// mouse and touch clicks should not leave focus on a button that Space would press again
	addEventListener("pointerup", (e) => {
		const b = e.target.closest && e.target.closest("button");
		if (b) setTimeout(() => b.blur(), 0);
	});
}
function openMenu() {
	$("chapters").hidden = false;
	$("btn-chapters").setAttribute("aria-expanded", "true");
}
function closeMenu() {
	$("chapters").hidden = true;
	$("btn-chapters").setAttribute("aria-expanded", "false");
}
function togglePlay() {
	if (app.state === "darshan") return next();
	if (app.state !== "travel") return;
	app.playing = !app.playing;
	updatePlay();
	toast(app.playing ? "Travelling on" : "Paused. Space to continue");
}
function updatePlay() {
	const b = $("btn-play");
	const paused = !app.playing || app.state !== "travel";
	b.classList.toggle("paused", paused);
	b.setAttribute("aria-label", paused ? "Continue" : "Pause");
}
function setSpeed(i) {
	app.speed = clamp(i, 0, SPEEDS.length - 1);
	$("speed-label").textContent = SPEEDS[app.speed] + "×";
}
function cycleTime() {
	app.fixedHour = undefined;
	app.time = (app.time + 1) % TIMES.length;
	$("time-label").textContent = TIMES[app.time][0];
	toast(app.time ? `Time of day: ${TIMES[app.time][0]}` : "Time of day follows the journey");
}
function cycleWeather() {
	app.weather = (app.weather + 1) % WEATHERS.length;
	$("weather-label").textContent = WEATHERS[app.weather];
	toast(app.weather ? `Weather: ${WEATHERS[app.weather]}` : "Weather follows the season at each shrine");
}
function toggleSound() {
	const on = audio.toggle();
	$("btn-sound").classList.toggle("active", on);
	$("btn-sound").setAttribute("aria-pressed", String(on));
	store.set("sound", on);
	if (on && app.state === "darshan") audio.bell(1);
}
let toastTimer, cardTimer;
function toast(text) {
	const t = $("toast");
	t.textContent = text;
	t.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function showCard(k, title, line) {
	$("card-kicker").textContent = k;
	$("card-title").textContent = title;
	$("card-line").textContent = line;
	$("card").classList.add("show");
	clearTimeout(cardTimer);
	cardTimer = setTimeout(hideCard, 4200);
	app.lastCard = title;
}
function hideCard() {
	$("card").classList.remove("show");
}
function refreshMarks() {
	document.querySelectorAll("#chapter-list li").forEach((li, i) => li.classList.toggle("visited", app.visited[i]));
	document.querySelectorAll("#nodes .node.shrine").forEach((n, i) => n.classList.toggle("visited", app.visited[i]));
	labelEls.forEach((l) => { if (l.shrine !== undefined) l.el.classList.toggle("visited", app.visited[l.shrine]); });
}
const pv = new THREE.Vector3();
function updateLabels() {
	const w = innerWidth, h = innerHeight;
	for (const l of labelEls) {
		let on = app.state !== "intro" || l.shrine !== undefined;
		const d = camera.position.distanceTo(l.v);
		if (l.shrine === undefined && (d > l.maxDist || rig.dist < 30)) on = false;
		if (l.shrine !== undefined && app.state === "darshan") on = false;
		if (l.shrine !== undefined && d < 30 && app.state !== "darshan") on = false;
		if (on) {
			pv.copy(l.v).project(camera);
			if (pv.z > 1 || pv.x < -1.1 || pv.x > 1.1 || pv.y < -1.1 || pv.y > 1.1) on = false;
			else l.el.style.transform = `translate(${((pv.x + 1) / 2) * w}px, ${((1 - pv.y) / 2) * h}px) translate(-50%, -100%)`;
		}
		if (l.on !== on) {
			l.el.classList.toggle("on", on);
			l.on = on;
		}
	}
}
function progressFraction() {
	if (app.state === "intro") return 0;
	if (app.state === "finale") return 1;
	const c = route.chapters[app.leg];
	return (app.leg + clamp((app.s - c.s0) / (c.s1 - c.s0), 0, 1)) / 4;
}
function updateHud() {
	$("fill").style.width = (progressFraction() * 100).toFixed(2) + "%";
	let where = "Pune";
	if (app.state === "darshan") where = `${SHRINES[app.at].name} · ${SHRINES[app.at].greeting}`;
	else if (app.state === "finale") where = "Yatra complete";
	else if (app.state === "travel") {
		const c = route.chapters[app.leg];
		let mode = c.mode;
		if (app.leg === 2 && app.s > app.sGauri) mode = "On foot from Gaurikund, 16 km";
		else if (app.leg === 2 && app.s > app.sGauri - 30) mode = "By road into the Garhwal hills";
		where = `To ${c.shrine.name} · ${mode}${app.playing ? "" : " · paused"}`;
	}
	const we = $("where");
	if (we.textContent !== where) we.textContent = where;
	$("map-meta").textContent = `≈ ${Math.round(route.km(app.state === "intro" ? 0 : app.s)).toLocaleString("en-IN")} km`;
	drawMap();
}

// ---------- minimap ----------
const MAP = { lon0: 67, lon1: 98, lat0: 6, lat1: 37 };
let mapBase;
function mapXY(lon, lat, W) {
	return [((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * W, ((MAP.lat1 - lat) / (MAP.lat1 - MAP.lat0)) * W];
}
function drawMapBase() {
	const W = 240;
	mapBase = document.createElement("canvas");
	mapBase.width = mapBase.height = W;
	const g = mapBase.getContext("2d");
	g.fillStyle = "#0b1736";
	g.fillRect(0, 0, W, W);
	for (const poly of [INDIA, LANKA]) {
		g.beginPath();
		poly.forEach(([lo, la], i) => {
			const [x, y] = mapXY(lo, la, W);
			i ? g.lineTo(x, y) : g.moveTo(x, y);
		});
		g.closePath();
		g.fillStyle = "#1c2f5e";
		g.fill();
		g.strokeStyle = "rgba(232,182,76,0.55)";
		g.lineWidth = 1.2;
		g.stroke();
	}
	// the whole route, faint
	g.strokeStyle = "rgba(243,217,160,0.35)";
	g.lineWidth = 2;
	g.setLineDash([4, 4]);
	g.beginPath();
	route.pts.forEach((p, i) => {
		const lo = p.x / 40 + 82, la = -p.z / 40 + 22;
		const [x, y] = mapXY(lo, la, W);
		i ? g.lineTo(x, y) : g.moveTo(x, y);
	});
	g.stroke();
	g.setLineDash([]);
}
function drawMap() {
	const c = $("minimap");
	const g = c.getContext("2d");
	const W = c.width;
	g.drawImage(mapBase, 0, 0);
	const sNow = app.state === "intro" ? 0 : app.state === "finale" ? route.length : app.s;
	g.strokeStyle = "#ff9a33";
	g.lineWidth = 3;
	g.lineCap = "round";
	g.beginPath();
	let first = true;
	for (const p of route.pts) {
		if (p.s > sNow) break;
		const [x, y] = mapXY(p.x / 40 + 82, -p.z / 40 + 22, W);
		first ? g.moveTo(x, y) : g.lineTo(x, y);
		first = false;
	}
	g.stroke();
	SHRINES.forEach((s, i) => {
		const [x, y] = mapXY(s.lon, s.lat, W);
		g.beginPath();
		g.arc(x, y, 6, 0, Math.PI * 2);
		g.fillStyle = app.visited[i] ? "#ff9a33" : "#0b1736";
		g.fill();
		g.strokeStyle = "#e8b64c";
		g.lineWidth = 2;
		g.stroke();
	});
	if (app.state !== "intro") {
		const p = route.at(sNow, {});
		const [x, y] = mapXY(p.x / 40 + 82, -p.z / 40 + 22, W);
		g.beginPath();
		g.arc(x, y, 7 + Math.sin(app.t * 4) * 1.5, 0, Math.PI * 2);
		g.fillStyle = "rgba(255,210,120,0.35)";
		g.fill();
		g.beginPath();
		g.arc(x, y, 4, 0, Math.PI * 2);
		g.fillStyle = "#fff1c9";
		g.fill();
	}
}

// ---------- input ----------
function installInput() {
	const ptrs = new Map();
	let pinch = 0;
	canvas.addEventListener("pointerdown", (e) => {
		canvas.setPointerCapture(e.pointerId);
		ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (ptrs.size === 2) {
			const [a, b] = [...ptrs.values()];
			pinch = Math.hypot(a.x - b.x, a.y - b.y);
		}
		closeMenu();
	});
	canvas.addEventListener("pointermove", (e) => {
		const p = ptrs.get(e.pointerId);
		if (!p) return;
		const dx = e.clientX - p.x, dy = e.clientY - p.y;
		p.x = e.clientX;
		p.y = e.clientY;
		if (ptrs.size === 1) {
			rig.userYaw -= dx * 0.005;
			rig.userPitch = clamp(rig.userPitch + dy * 0.004, -1.2, 1.2);
		} else if (ptrs.size === 2) {
			const [a, b] = [...ptrs.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinch > 0) rig.zoom = clamp(rig.zoom * (pinch / d), 0.3, 3);
			pinch = d;
		}
	});
	const up = (e) => {
		ptrs.delete(e.pointerId);
		pinch = 0;
	};
	canvas.addEventListener("pointerup", up);
	canvas.addEventListener("pointercancel", up);
	canvas.addEventListener("wheel", (e) => {
		e.preventDefault();
		rig.zoom = clamp(rig.zoom * Math.exp(e.deltaY * 0.0012), 0.3, 3);
	}, { passive: false });
	canvas.addEventListener("dblclick", resetView);
	addEventListener("keydown", (e) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (!$("help").hidden) {
			if (e.key === "Escape" || e.key === "Enter") $("help").hidden = true;
			return;
		}
		const k = e.key;
		if (k === " " || k === "Enter") {
			if (e.target && e.target.tagName === "BUTTON") return;
			e.preventDefault();
			if (app.state === "intro") begin();
			else if (app.state === "finale") $("finale").hidden = true;
			else togglePlay();
		} else if (k.length === 1 && k >= "1" && k <= "4") jump(+k - 1);
		else if (k === "0") restart();
		else if (k === "+" || k === "=") setSpeed(app.speed + 1);
		else if (k === "-" || k === "_") setSpeed(app.speed - 1);
		else if (k === "t" || k === "T") cycleTime();
		else if (k === "w" || k === "W") cycleWeather();
		else if (k === "m" || k === "M") toggleSound();
		else if (k === "h" || k === "H") document.body.classList.toggle("hide-hud");
		else if (k === "c" || k === "C") resetView();
		else if (k === "?") $("help").hidden = false;
		else if (k === "Escape") { closeMenu(); $("finale").hidden = true; }
		else if (k === "ArrowLeft") rig.userYaw += 0.12;
		else if (k === "ArrowRight") rig.userYaw -= 0.12;
		else if (k === "ArrowUp") rig.userPitch = clamp(rig.userPitch + 0.08, -1.2, 1.2);
		else if (k === "ArrowDown") rig.userPitch = clamp(rig.userPitch - 0.08, -1.2, 1.2);
		else if (k === "PageUp") rig.zoom = clamp(rig.zoom * 0.85, 0.3, 3);
		else if (k === "PageDown") rig.zoom = clamp(rig.zoom / 0.85, 0.3, 3);
		else return;
	});
	addEventListener("resize", () => {
		renderer.setSize(innerWidth, innerHeight, false);
		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
	});
}
function resetView() {
	rig.userYaw = 0;
	rig.userPitch = 0;
	rig.zoom = 1;
}

Object.assign(app, { begin, next, jump, restart, setSpeed, cycleTime, cycleWeather, rig });
init().catch((e) => {
	console.error(e);
	$("loader-msg").textContent = "Sorry, this needs WebGL. " + (e && e.message ? e.message : "");
});
