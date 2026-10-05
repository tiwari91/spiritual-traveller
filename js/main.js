// Spiritual Traveller: entry point. Builds India, the route and the shrines, then runs the yatra.
import * as THREE from "three";
import { World } from "./world.js";
import { Route } from "./route.js";
import { Sky } from "./sky.js";
import { buildLandmarks, GOLD, LAMP, beaconMaterial } from "./landmarks.js";
import { routeLine, cityLights, Weather, Petals } from "./effects.js";
import { Traveller, crowdFigure } from "./pilgrim.js";
import { WINDOW_GLOW } from "./vehicles.js";
import { Journey } from "./boarding.js";
import { M, Roads } from "./roads.js";
import { Scenery } from "./scenery.js";
import { TREE_STRIDE } from "./trees.js";
import { Traffic, roadSurface, surfaceAt } from "./traffic.js";
import { Sanctum } from "./sanctum.js";
import { Music } from "./music.js";
import { Aarti } from "./aarti.js";
import { KDMusic } from "./kdmusic.js";
import { MapView } from "./map3d.js";
import { Audio } from "./audio.js";
import { CITIES, INDIA, KAILASH, LANKA, ROUTE, SHRINES, toGeo, toWorld } from "./geo.js";
import { LAKES, PASSING, RIVERS as K_RIVERS } from "./kailash-geo.js";
import { Companions } from "./kailash-companion.js";
import { kRegion, tibet } from "./kailash-world.js";
import { clamp, lerp, nextFrame, segDist, smoothstep, store } from "./util.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const coarse = matchMedia("(pointer: coarse)").matches;
const small = Math.min(innerWidth, innerHeight) < 600;
const LOW = params.get("q") === "low" || (params.get("q") !== "high" && (coarse || small));
const SPEEDS = [1, 2, 4, 8];
const TIMES = [["Auto", null], ["Dawn", 6.4], ["Noon", 12.5], ["Dusk", 18.2], ["Night", 22.5]];
const WEATHERS = ["Auto", "Clear", "Monsoon", "Snow"];
// How to travel: the usual pilgrim's mix, as much by train as possible, or the whole way by motorbike or car.
const TRANSPORT = ["Mixed", "Train", "Bike", "Car"];
// How many shrines (and legs) the yatra has: each leg ends at its shrine.
const N = SHRINES.length;
// How each stretch is travelled, and what the HUD calls it.
const MODES = { walk: "On foot", bike: "By motorbike", train: "By train", jeep: "By jeep", car: "By taxi", auto: "By autorickshaw", bus: "By bus", coach: "By bus" };
// Where the journey starts: Pune for the five shrines, Delhi (where the MEA assembles each batch) for Kailash.
const START = KAILASH ? "Delhi" : "Pune";
// the transport chip is remembered for each journey on its own
const TRANSPORT_KEY = KAILASH ? "transportKailash" : "transport";
// the darshan card's button back into the rituals (at Kailash they are out of doors, at the lake, the pass, the camp)
const AGAIN = KAILASH ? "See the rituals again <span>they play by themselves (E)</span>" : "Go inside again <span>the rituals play by themselves (E)</span>";

const app = { transport: 0, inside: SHRINES.map(() => false), ready: false, frames: 0, t: 0, state: "loading", s: 0, leg: 0, at: -1, playing: true, speed: 0, time: 0, weather: 0, visited: SHRINES.map(() => false), params };
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

let world, route, sky, landmarks, line, traveller, ride, journey, lights, weather, petals, roads, scenery, traffic, sanctum, music, aarti, kd, companions;
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
	msg.textContent = "Laying the roads and the railway";
	await nextFrame();
	roads = new Roads(route, world, scene, LOW);
	scenery = new Scenery(route, world, roads, scene, LOW);
	traffic = new Traffic(roads, scene, LOW);
	msg.textContent = "Building the temples";
	await nextFrame();
	landmarks = buildLandmarks(world, scene, renderer, crowdFigure);
	clearForests();
	line = routeLine(route);
	scene.add(line);
	traveller = new Traveller({ warm: KAILASH });
	scene.add(traveller.group);
	// the yakman and his pack yak who walk the parikrama with the traveller
	if (KAILASH) companions = new Companions(scene);
	// the aarti at the door, with each shrine's own music
	music = new Music(audio);
	aarti = new Aarti({ scene, landmarks, music, traveller, low: LOW });
	// Krishna Das from his official YouTube channel at the aarti, over the synth music (which keeps the aarti's clock)
	kd = new KDMusic({ audio, music, onNotice: (t) => toast(t) });
	// the vehicles and the trains, and getting on and off them (boarding.js)
	journey = new Journey({ app, scene, roads, route, world, traveller, audio, modeAt, roadPoint, speeds: SPEEDS });
	ride = journey.v;
	app.toast = (t) => toast(t);
	lights = cityLights(world);
	scene.add(lights);
	weather = new Weather(scene);
	petals = new Petals(scene);
	sky = new Sky(scene);
	if (LOW) sky.sun.shadow.mapSize.set(1024, 1024);
	Object.assign(app, { world, route, sky, landmarks, scene, roads, scenery, traffic, ride, journey, traveller });
	// where the road gives way to the footpath below Kedarnath, going up and coming back down
	app.sGauri = roads.at.gauri;
	app.sGauriBack = roads.at.gauriBack;
	app.transport = clamp(store.get(TRANSPORT_KEY, 0), 0, TRANSPORT.length - 1);
	if (params.has("go")) app.transport = Math.max(0, TRANSPORT.findIndex((t) => t.toLowerCase() === params.get("go")));
	scenery.prebuild(params.has("s") ? parseFloat(params.get("s")) || 0 : 0);
	// inside each temple: the shrine's own rituals, step by step
	sanctum = new Sanctum({ renderer, container: document.body, audio, low: LOW, onStep: (i, step, key) => {
		// the music of the temple follows the rituals inside
		if (/aarti/i.test(step.title) && !/take/i.test(step.title)) {
			music.aarti(key);
			kd.play(key);
		}
		else if (i === 0) music.ambient(key);
	}, onExit: (key) => {
		// out of the temple, the rituals are over: Krishna Das fades out and the temple's quiet bed returns
		kd.stop(1.5);
		music.ambient(key);
		renderer.setSize(innerWidth, innerHeight, false);
		$("enter").innerHTML = AGAIN;
		$("continue").focus();
	} });
	Object.assign(app, { sanctum, music, aarti, kd });
	// the 3D satellite map, opened from the minimap or with G
	// the 3D map shows the stations the railway actually has
	const mapStations = roads.stations.filter((st, i, all) => Number.isFinite(st.s) && all.findIndex((o) => o.name === st.name) === i).map((st) => {
		const r = roads.rail(st.s, {}) || route.at(st.s, {});
		const g = toGeo(r.x, r.z);
		return [g.lon, g.lat, st.hi, st.name];
	});
	app.mapView = new MapView({ stations: mapStations.length ? mapStations : undefined, opener: $("map-wrap"), hotkey: "g", onOpen: () => (app.mapOpen = true), onClose: () => (app.mapOpen = false) });
	buildUI();
	app.ready = true;
	$("start").disabled = false;
	$("loader").classList.add("done");
	app.state = "intro";
	if (params.has("shrine")) {
		begin();
		jump(clamp(parseInt(params.get("shrine"), 10) - 1 || 0, 0, N - 1));
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
// The hour at each shrine, counted on from dawn at Pune: always later than the last, and a whole day on for a
// leg ridden through the night (Shirdi's noon to Tirumala's evening is the next day, by the overnight express).
let HOURS;
function autoHour(s) {
	if (!HOURS) {
		HOURS = [[0, 6.5]];
		route.chapters.forEach((c, i) => {
			const prev = HOURS[HOURS.length - 1][1];
			let h = c.shrine.hour;
			while (h <= prev) h += 24;
			if (ROUTE[i].overnight && h < prev + 20) h += 24;
			HOURS.push([c.s1, h]);
		});
	}
	const keys = HOURS;
	for (let k = 0; k < keys.length - 1; k++) {
		if (s <= keys[k + 1][0]) return lerp(keys[k][1], keys[k + 1][1], clamp((s - keys[k][0]) / (keys[k + 1][0] - keys[k][0] || 1), 0, 1)) % 24;
	}
	return keys[keys.length - 1][1] % 24;
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
	showCard(`Leg ${i + 1} of ${N} · ${c.kicker}`, c.title, `${c.mode} to ${c.shrine.name}`);
}
function arrive(i) {
	app.state = "darshan";
	app.at = i;
	app.leg = i;
	app.s = route.chapters[i].s1;
	app.visited[i] = true;
	app.darshanT = 0;
	const s = SHRINES[i];
	$("d-kicker").textContent = `Darshan ${i + 1} of ${N} · ${s.kind}`;
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
	$("continue").textContent = i === N - 1 ? "Complete the yatra" : `Continue to ${SHRINES[i + 1].name}`;
	$("enter").innerHTML = app.inside[i] ? AGAIN : KAILASH ? "To the rituals… <span>they play by themselves</span>" : "Going inside… <span>the rituals play by themselves</span>";
	// a Kailash stop with no rituals of its own has nothing to go in for
	$("enter").hidden = !!(KAILASH && sanctum.has && !sanctum.has(s.key));
	$("darshan").querySelector(".d-scroll").scrollTop = 0;
	$("darshan").classList.add("show");
	document.body.classList.add("darshan-open");
	hideCard();
	toast(`${s.mantraLatin}`);
	audio.bell(3);
	app.aartiDone = false;
	kd.play(s.key);
	aarti.start(i).then(() => {
		if (app.state === "darshan" && app.at === i) app.aartiDone = true;
	});
	rig.userYaw = 0;
	rig.userPitch = 0;
	refreshMarks();
}
function enterTemple(auto = false) {
	if (app.state !== "darshan" || sanctum.active) return;
	// a stop with no rituals of its own to go in for
	if (sanctum.has && !sanctum.has(SHRINES[app.at].key)) return;
	app.inside[app.at] = true;
	aarti.stop();
	sanctum.enter(SHRINES[app.at].key, { auto: auto === true });
	sanctum.resize(innerWidth, innerHeight);
}
function closeDarshan() {
	aarti.stop();
	music.stop(1.2);
	kd.stop(1.2);
	$("darshan").classList.remove("show");
	document.body.classList.remove("darshan-open");
}
function next() {
	if (app.state === "intro") return begin();
	if (app.state !== "darshan") return;
	closeDarshan();
	if (app.at === N - 1) {
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
	app.visited = SHRINES.map(() => false);
	app.inside = SHRINES.map(() => false);
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
	$("finale-km").textContent = KAILASH
		? `About ${Math.round(route.km(route.length) / 10) * 10} km along the drawn line from Delhi, up the Kali to the Lipulekh, round Mansarovar and round Kailash on foot. Om Namah Shivaya. Jai Mansarovar. Bam Bam Bhole. Jai Kailashpati.`
		: `About ${Math.round(route.km(route.length) / 10) * 10} km along the drawn line from Pune, through the Sahyadri, the Deccan and the Gangetic plain to the Garhwal Himalaya. Har Har Mahadev. Om Sai Ram. Govinda, Govinda. Jai Badri Vishal.`;
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
// The point the camera follows: the traveller, or the vehicle they are in.
function mover() {
	const k = app.travelMode;
	const v = ride && (k === "bike" || k === "car" || k === "jeep" || k === "auto" || k === "bus" || k === "coach") ? ride[k] : null;
	if (v && v.group && v.group.visible) return v.group.position;
	return traveller.group.position;
}
function cameraGoal() {
	const g = { target: new THREE.Vector3(), yaw: 0, pitch: 0.8, dist: 80 };
	if (KAILASH && (app.state === "intro" || app.state === "loading" || app.state === "finale")) {
		// over the Kumaon Himalaya, Tibet beyond: Delhi to the south-west, Kailash and the lakes to the north-east
		const c = toWorld(80.6, 30.1);
		g.target.set(c.x, 30, c.z);
		g.yaw = 0.35 + Math.sin(app.t * 0.05) * 0.25 + (app.state === "finale" ? app.t * 0.03 : 0);
		g.pitch = 0.62;
		g.dist = innerWidth < innerHeight ? 330 : 230;
		return g;
	}
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
		// look over the traveller's shoulder at the shrine
		// aim between the traveller and the door, so the pilgrim stands in the foreground before the shrine
		g.target.copy(l.pos).lerp(traveller.group.position, 0.55);
		if (aarti.active && aarti.focus) g.target.lerp(aarti.focus, 0.35);
		g.target.y = l.pos.y + (high ? 1.55 : 1.05);
		g.yaw = l.shrine.facing + 0.32 + Math.sin(app.darshanT * 0.1) * 0.25;
		g.pitch = high ? 0.16 : 0.26;
		g.dist = innerWidth < innerHeight ? 12 : 6.2;
		const v = l.shrine.view;
		if (v) {
			// at the Kailash stops the shot looks up past the traveller to the mountain
			g.target.y = l.pos.y + v.lift;
			g.yaw = l.shrine.facing + (v.yaw ?? 0.28) + Math.sin(app.darshanT * 0.1) * 0.16;
			g.pitch = v.pitch;
			g.dist = v.dist * (innerWidth < innerHeight ? 1.5 : 1);
		}
		return g;
	}
	const p = route.at(app.s, tmp);
	const c = route.chapters[app.leg];
	const near = smoothstep(26, 3, Math.min(c.s1 - app.s, app.s - c.s0));
	// for a few seconds after the traveller changes transport, the camera comes down alongside
	const vehicle = ["bike", "jeep", "car", "auto", "bus", "coach"].includes(app.travelMode);
	const chase = vehicle ? smoothstep(7, 3, app.modeT || 0) : 0;
	const close = Math.max(near, chase);
	// always close on the traveller, a little behind and to one side, so you can see them moving and what
	// they are doing: on foot, on the bike, or in the car; zoom out with the buttons or the wheel to see more
	const me = mover();
	const closeDist = { walk: 2.6, bike: 3.6, car: 5.2, jeep: 5.2, auto: 4.4, train: 9, bus: 7.2, coach: 7.2 }[app.travelMode] || 3.2;
	g.target.set(me.x, me.y + (app.travelMode === "walk" ? 0.3 : 0.35), me.z);
	// a little to one side: the right, unless a wall or a building stands that side (see updateCamera)
	g.yaw = Math.atan2(-p.dx, -p.dz) + 0.6 * (rig.side || 1);
	g.pitch = app.travelMode === "walk" ? 0.24 : 0.3;
	g.dist = closeDist * (innerWidth < innerHeight ? 1.45 : 1);
	void close;
	// getting on and off, close and low; on the train, alongside the line (boarding.js)
	const jc = app.debugCam || journey.camera();
	if (jc) {
		g.target.copy(jc.target);
		g.yaw = jc.yaw;
		g.pitch = jc.pitch;
		g.dist = jc.dist * (innerWidth < innerHeight ? 1.35 : 1);
	}
	return g;
}
// The shrine forests (Bhimashankar's, the Tirumala hills) keep back from the way on foot to and from each door,
// so the camera following a pilgrim along it is not in among the leaves.
function clearForests() {
	const T = scenery.trees, pts = [];
	route.chapters.forEach((c, i) => {
		for (let s = Math.max(c.s0, c.s1 - 30); s <= c.s1; s += 0.1) pts.push(route.at(s, {}));
		const n = route.chapters[i + 1];
		if (n) for (let s = n.s0; s <= Math.min(n.s1, n.s0 + 30); s += 0.1) pts.push(route.at(s, {}));
	});
	for (const [id, set] of [...T.sets]) {
		if (!String(id).startsWith("forest")) continue;
		const d = set.data, keep = [];
		for (let i = 0; i < set.n; i++) {
			const o = i * TREE_STRIDE, x = d[o], z = d[o + 2], room = T.radius(d[o + 6]) * d[o + 4] + 2.2;
			if (!pts.some((p) => Math.abs(p.x - x) < room && Math.abs(p.z - z) < room && Math.hypot(p.x - x, p.z - z) < room)) keep.push(...d.subarray(o, o + TREE_STRIDE));
		}
		if (keep.length < set.n * TREE_STRIDE) T.add(id, new Float32Array(keep), keep.length / TREE_STRIDE);
	}
}
const occRay = new THREE.Raycaster(), occDir = new THREE.Vector3();
// Distance from the traveller towards the camera to the first solid thing in the way, or null.
function occlusion(to, from = rig.target) {
	const d = to.distanceTo(from);
	// the roadside trees are instanced and streamed in and out: their bounds go stale unless refreshed now and then
	if (app.frames % 30 === 0) scenery.trees.group.traverse((o) => o.isInstancedMesh && (o.boundingSphere = null));
	occDir.subVectors(to, from).normalize();
	occRay.set(from, occDir);
	occRay.camera = camera; // sprites need it to be tested at all
	occRay.near = 0.25;
	occRay.far = d;
	for (const h of occRay.intersectObjects(solids(), true)) if (solidHit(h)) return h.distance - 0.3;
	return null;
}
// The roads and stations, the roadside, its trees and the temples with their forests, and the train (the taxi, jeep
// or auto the traveller is getting into is looked through, as through its windows, rather than come up against).
function solids() {
	const solid = [roads.group, scenery.group, scenery.trees.group, ...landmarks.map((l) => l.root), ...landmarks.map((l) => l.decor)];
	if (journey && journey.rake) for (const c of journey.rake.cars || []) solid.push(c.group);
	return solid;
}
function solidHit(h) {
	const o = h.object, m = o.material;
	if (!o.visible || o.isSprite || o.isPoints || o.isLine) return false;
	if (m && m.transparent && m.opacity < 0.6) return false;
	// not anything the traveller is standing in or on (the coach they ride, the vehicle)
	for (let p = o; p; p = p.parent) if (p === traveller.group) return false;
	return true;
}
// How much of the traveller a camera at `from` would see: of the sight lines to their feet, chest and head, how
// many something solid cuts. The chest line alone (occlusion) misses a stall counter or a parapet that hides the legs
// and a low awning that hides the head, and anything within a stride of them.
const bodyAt = new THREE.Vector3();
function bodyHidden(from) {
	const tr = traveller.group;
	if (!tr.visible) return 0;
	const solid = solids();
	let n = 0;
	for (const f of [0.08, 0.3, 0.55]) {
		bodyAt.copy(tr.position);
		bodyAt.y += f * tr.scale.x;
		const d = from.distanceTo(bodyAt);
		occDir.subVectors(bodyAt, from).normalize();
		occRay.set(from, occDir);
		occRay.camera = camera;
		occRay.near = 0.05;
		occRay.far = Math.max(0.06, d - 0.15);
		if (occRay.intersectObjects(solid, true).some(solidHit)) n++;
	}
	return n;
}
// How open the view is towards the two sides of the frame, from a camera at `from` looking at `to`: the nearer of
// the distances to whatever solid stands along the sight lines near the left and right edges (twice the distance
// to `to` when both are open).
const flankL = new THREE.Vector3(), flankUp = new THREE.Vector3(0, 1, 0);
function flank(from, to = rig.target) {
	const d = from.distanceTo(to);
	const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) * 0.75;
	let near = Infinity;
	for (const s of [-1, 1]) {
		flankL.subVectors(to, from).applyAxisAngle(flankUp, s * half).add(from);
		const c = occlusion(flankL, from);
		if (c != null) near = Math.min(near, c + 0.3);
	}
	return Math.min(near, d * 2);
}
function updateCamera(dt) {
	let g = cameraGoal();
	// following on foot or on the road: look over whichever shoulder has the open view. Leaving Tirumala the
	// prakara wall runs beside the path, and from its side the wall filled half the frame. Judged afresh at each
	// cut, and now and then on the way, swapping sides only for a clearly better view.
	// (Not while the camera has gone round or up to see past something: that is judged below, from the same side.)
	const avoiding = Math.abs(rig.swing || 0) > 0.1 || (rig.rise || 0) > 0.05;
	if (app.state === "travel" && !app.debugCam && !journey.camera() && (rig.snap || rig.camKey !== null || (app.frames % 20 === 0 && !avoiding))) {
		const side = rig.side || 1, at = (sg) => {
			const yw = g.yaw + 1.2 * (sg === side ? 0 : sg), cp = Math.cos(g.pitch);
			return flank(new THREE.Vector3(g.target.x + Math.sin(yw) * cp * g.dist, g.target.y + Math.sin(g.pitch) * g.dist, g.target.z + Math.cos(yw) * cp * g.dist), g.target);
		};
		const mine = at(side), other = at(-side);
		const fresh = rig.snap || rig.camKey !== null;
		if ((fresh && other > mine) || (mine < g.dist * 0.7 && other > mine + Math.max(0.6, g.dist * 0.3))) {
			rig.side = -side;
			g = cameraGoal();
		}
	}
	// a new shot (getting on or off, a new angle on the train, back to following): cut to it when it is far from
	// where the camera is, rather than swing through the coach, the bus or the bank in between
	const key = app.state === "travel" ? (journey.camera() || {}).key || null : undefined;
	if (key === undefined) rig.camKey = undefined;
	else if (key !== rig.camKey) {
		const cp = Math.cos(g.pitch + rig.userPitch), want = new THREE.Vector3(g.target.x + Math.sin(g.yaw + rig.userYaw) * cp * g.dist * rig.zoom, g.target.y + Math.sin(g.pitch + rig.userPitch) * g.dist * rig.zoom, g.target.z + Math.cos(g.yaw + rig.userYaw) * cp * g.dist * rig.zoom);
		if (rig.camKey !== undefined && want.distanceTo(camera.position) > Math.max(1.5, g.dist * rig.zoom * 0.6)) {
			rig.snap = true;
			rig.clear = undefined;
		}
		// each shot starts square: a framed shot is chosen to be clear, and following starts from behind
		rig.swing = rig.rise = 0;
		rig.camKey = key;
	}
	const yaw = g.yaw + rig.userYaw + (rig.swing || 0), pitch = clamp(g.pitch + rig.userPitch + (rig.rise || 0), -0.05, 1.45), dist = g.dist * rig.zoom;
	// a cut (a new shot, or round to a clear view when something has come between) lands at once; a small move
	// round something comes quickly, so the traveller is not lost behind it for long
	const cut = rig.snap || rig.cut;
	rig.cut = false;
	if (cut) rig.clear = undefined;
	rig.quick = Math.max(0, (rig.quick || 0) - dt);
	const k = cut ? 1 : 1 - Math.exp(-dt * (rig.quick ? 6 : 1.8)), ky = cut ? 1 : 1 - Math.exp(-dt * (rig.quick ? 6 : 1.1));
	// while travelling the camera stays locked on the moving traveller (a slow ease would fall behind a
	// train or a car and leave them at the edge of the frame); elsewhere it eases
	// while travelling the target rides with the traveller exactly (at 8x a train covers a body length a frame, and
	// any lag leaves them out of the shot); only a change of framing, from one shot to the next, is eased
	if (app.state === "travel") {
		const me = traveller.group.position;
		rig.off = rig.off || new THREE.Vector3();
		const want = g.target.clone().sub(me);
		if (rig.snap || !rig.offOk) rig.off.copy(want);
		else rig.off.lerp(want, 1 - Math.exp(-dt * 5));
		rig.offOk = true;
		rig.target.copy(me).add(rig.off);
	} else {
		rig.offOk = false;
		rig.target.lerp(g.target, rig.snap ? 1 : 1 - Math.exp(-dt * 4));
	}
	rig.yaw = angLerp(rig.yaw, yaw, ky);
	rig.pitch = lerp(rig.pitch, pitch, k);
	rig.dist = Math.exp(lerp(Math.log(rig.dist), Math.log(dist), k));
	rig.snap = false;
	const cp = Math.cos(rig.pitch);
	camera.position.set(rig.target.x + Math.sin(rig.yaw) * cp * rig.dist, rig.target.y + Math.sin(rig.pitch) * rig.dist, rig.target.z + Math.cos(rig.yaw) * cp * rig.dist);
	// close and low for getting on and off: the camera may come down to eye height
	const low = app.state === "travel" && journey && (app.debugCam || journey.camera());
	const ground = world.height(camera.position.x, camera.position.z) + (low ? 0.22 : 1.2);
	if (camera.position.y < ground) camera.position.y = ground;
	// rise over any ridge that would hide the traveller (outside darshan, where the shrine frames the view)
	if (app.state === "travel") {
		let lift = 0;
		for (let k = 0.15; k < 1; k += 0.085) {
			const x = lerp(rig.target.x, camera.position.x, k), z = lerp(rig.target.z, camera.position.z, k);
			// the follow camera is close, so it only needs to clear the ground itself, not a margin for far views
			const need = world.height(x, z) + (low || rig.dist < 12 ? 0.15 : 1.5) - lerp(rig.target.y, camera.position.y, k);
			if (need > 0) lift = Math.max(lift, need / k);
		}
		// close in, never climb more than a little: better to look past a bank than from above the trees
		if (rig.dist < 12) lift = Math.min(lift, 0.9);
		rig.lift = lerp(rig.lift || 0, lift, 1 - Math.exp(-dt * 4));
		camera.position.y += rig.lift;
	} else rig.lift = 0;
	// nothing solid between the camera and the traveller: if a wall, a coach side, a house or a tree is in
	// the way, the camera comes in to just in front of it (and eases back out once the view is clear)
	if (app.state === "travel" && rig.dist < 40) {
		const d = camera.position.distanceTo(rig.target);
		const jc = journey.camera();
		if (app.frames % 3 === 0 || cut) rig.block = occlusion(camera.position);
		// Hard against a wall, or with something within a body length of the traveller (a stall's awning or counter,
		// a parapet, a temple wall at a corner), coming in does not help: the camera would only stop just behind it.
		// Then it goes round or up to a view that sees them, chosen as an offset from the shot's own angle and kept
		// until that too is blocked. Following, when they are hidden it cuts there (or swings quickly, if it is near);
		// a framed shot (getting on or off) may swing round to the side, never up, and on a platform it holds.
		const hidden = !jc && rig.hid >= 2;
		if ((hidden && app.frames % 3 === 0) || (app.frames % 12 === 0 && rig.block != null && rig.block < d * 0.5 && !(jc || {}).fixed)) {
			const gy = g.yaw + rig.userYaw, gp = g.pitch + rig.userPitch, back = -(rig.side || 1) * 0.6;
			// following, straight behind (down a lane between stalls) comes first, then higher, then round
			const tries = jc
				? [[0, 0], [0.9, 0], [-0.9, 0], [1.8, 0], [-1.8, 0], [Math.PI, 0]]
				: [[0, 0], [back, 0], [back / 2, 0.35], [0, 0.35], [back, 0.6], [0, 0.7], [-back, 0], [-back, 0.5], [back * 2, 0], [back * 2, 0.5], [back, 1.0], [0, 1.0], [-back * 2, 0.4], [Math.PI, 0.3]];
			let pick = null, pickR = hidden ? -1 : rig.block + 0.5;
			for (const [a, up] of tries) {
				const yw = gy + a, pt = clamp(gp + up, -0.05, 1.4), cp = Math.cos(pt);
				const q = new THREE.Vector3(rig.target.x + Math.sin(yw) * cp * d, rig.target.y + Math.sin(pt) * d, rig.target.z + Math.cos(yw) * cp * d);
				q.y = Math.max(q.y, world.height(q.x, q.z) + (low ? 0.22 : 1.2));
				// where the camera would stand: brought in to just in front of whatever is on the line, but no nearer
				// than a body length; if that is still behind it, this way is no good
				const c = occlusion(q), r = c == null ? d : Math.max(Math.min(d, 1.1), c);
				if (c != null && c < Math.min(d, 1.1)) continue;
				const at = q.clone().sub(rig.target).multiplyScalar(r / q.distanceTo(rig.target)).add(rig.target);
				if (bodyHidden(at) > 0) continue;
				// following and hidden: the first clear view in order; otherwise the most open one, if clearly better
				if (r > pickR) {
					pick = [a, up];
					pickR = r;
					if (hidden) break;
				}
			}
			if (pick) {
				const turn = Math.abs(Math.atan2(Math.sin(gy + pick[0] - rig.yaw), Math.cos(gy + pick[0] - rig.yaw))) + Math.abs(clamp(gp + pick[1], -0.05, 1.45) - rig.pitch);
				rig.swing = pick[0];
				rig.rise = pick[1];
				if (hidden) {
					if (turn > 0.35) rig.cut = true;
					else rig.quick = 0.6;
				}
			}
			rig.hid = 0;
		} else if (app.frames % 12 === 0 && rig.block == null && !rig.hid) {
			rig.swing = (rig.swing || 0) * 0.98;
			rig.rise = (rig.rise || 0) * 0.94;
		}
		const want = rig.block ?? 1e6;
		const was = Number.isFinite(rig.clear) ? rig.clear : 1e6;
		rig.clear = want < was ? want : lerp(was, want, 1 - Math.exp(-dt * 2));
		// never closer than a little over a body length (the traveller is about 0.5 units tall): any nearer and
		// the lens is inside their clothes; when the wall is closer than that, the swing above finds another side
		if (rig.clear < d) camera.position.lerp(rig.target, 1 - Math.max(Math.min(d, 1.1), rig.clear) / d);
		// and from where the camera now is, can the traveller be seen? (twice running sends it round, above)
		if (!jc && app.frames % 3 === 0) rig.hid = bodyHidden(camera.position) >= 2 ? (rig.hid || 0) + 1 : 0;
	} else {
		rig.clear = undefined;
		rig.swing = 0;
		rig.rise = 0;
		rig.hid = 0;
	}
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
	if (sanctum && sanctum.active) {
		sanctum.update(dt, app.t);
		sanctum.render();
		return;
	}
	if (app.state === "travel" && app.playing) {
		// the journey moves the traveller on: on foot, by road, by train, and getting on and off between
		journey.advance(dt);
		if (KAILASH) passing();
		if (app.s >= route.chapters[app.leg].s1) arrive(app.leg);
	}
	if (app.state === "darshan") {
		app.darshanT += dt;
		// after a few moments at the door, the traveller goes in and does the rituals by themselves
		if (!app.inside[app.at] && app.darshanT > 3.5 && !sanctum.active && !app.params.has("noenter")) {
			app.inside[app.at] = true;
			enterTemple(true);
		}
		if (params.get("auto") === "1" && app.darshanT > 14) next();
	}
	// the traveller first, then the camera on them, so the shot never runs a frame behind
	updateTraveller(dt);
	if (KAILASH && app.frames % 30 === 0) travelSound();
	if (companions) {
		const c = route.chapters[app.leg];
		const on = app.state === "travel" && app.leg >= 3 && app.mode === "walk" && app.s > c.s0 + 0.8 && app.s < c.s1 - 2.2;
		// (on the other side of the path from the traveller)
		companions.update(on, app.s, c.s1 - 2.4, (s, lane) => Object.assign({}, roadPoint(s, lane * journey.keep(s))), app.playing);
	}
	updateCamera(dt);
	// a snow peak the camera has strayed into is hidden rather than filling the screen
	for (const l of landmarks) for (const m of l.decor.children) {
		const pk = m.userData.peak;
		if (!pk) continue;
		// hidden if any point on the line from the camera to the traveller passes inside the cone
		// or if the camera stands over its slopes, where it would fill the foreground
		const dc = Math.hypot(camera.position.x - m.position.x, camera.position.z - m.position.z) / (pk.r * 1.35);
		let blocks = dc < 1 && camera.position.y < m.position.y + pk.h * 1.2;
		for (let k = 0; k <= 1 && !blocks; k += 0.1) {
			const x = lerp(camera.position.x, rig.target.x, k), y = lerp(camera.position.y, rig.target.y, k), z = lerp(camera.position.z, rig.target.z, k);
			const d = Math.hypot(x - m.position.x, z - m.position.z) / (pk.r * 1.15);
			if (d < 1 && y < m.position.y + pk.h * (1 - d)) blocks = true;
		}
		m.visible = app.state === "darshan" || !blocks;
	}
	aarti.update(dt, app.t, camera);
	// sky, light and weather
	focus.copy(rig.target);
	const hour = currentHour();
	const wx = currentWeather(focus);
	if (KAILASH) {
		const fg = toGeo(focus.x, focus.z);
		wx.thin = tibet(fg.lon, fg.lat) * kRegion(fg.lon, fg.lat);
	}
	sky.update(hour, focus, dt, { overcast: wx.overcast, snow: wx.snow > 0.3 });
	scene.fog.density *= clamp(70 / rig.dist, 0.12, 1.2);
	const night = smoothstep(4, -8, sky.elev);
	app.night = night;
	LAMP.emissiveIntensity = 0.25 + night * 4;
	GOLD.emissiveIntensity = 0.12 + night * 1.0; // lamplight on the gilded roofs after dark
	for (const m of WINDOW_GLOW) m.emissiveIntensity = night * 2.2;
	lights.material.opacity = night * 0.8;
	lights.material.size = clamp(rig.dist * 0.007, 0.35, 1.6);
	line.material.uniforms.uWidth.value = clamp(rig.dist * 0.0055, 0.1, 1.1);
	// up close the real road takes over from the glowing route line
	line.material.uniforms.uAlpha.value = app.state === "intro" || app.state === "finale" ? 1 : smoothstep(40, 130, rig.dist) * 0.85 + 0.15;
	beaconMaterial().uniforms.uOpacity.value = clamp((rig.dist - 25) / 140, 0, 1) * 0.5;
	const wscale = clamp(rig.dist / 25, 1, 4);
	weather.update(dt, focus, wx.rain, wx.snow, wscale);
	const lm = app.state === "darshan" ? landmarks[app.at] : null;
	petals.update(dt, lm ? lm.pos : focus, !!lm && app.darshanT > 1 && lm.shrine.petals !== false);
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
	if (!app.mapOpen) renderer.render(scene, camera);
	if (app.frames % 6 === 0 && app.state !== "loading") {
		const tp = traveller.group.position, p = route.at(app.s, {});
		app.mapView.setProgressWorld({ x: tp.x, z: tp.z, dx: p.dx, dz: p.dz, mode: app.mode, leg: app.state === "finale" ? N : app.leg, doneFraction: progressFraction(), state: app.state === "intro" ? "intro" : undefined, label: $("where").textContent });
	}
	if (app.frames % 2 === 0) updateLabels();
	if (app.frames % 4 === 0) updateHud(hour);
}

// The sound of the way on the Kailash journey while travelling: the wind on the plateau, harder on the passes,
// the Kali roaring below in its gorge (music.js); the darshan's own beds take over at each stop.
function travelSound() {
	let kind = null;
	if (app.state === "travel") {
		const p = traveller.group.position, g = toGeo(p.x, p.z), h = world.height(p.x, p.z);
		if (tibet(g.lon, g.lat) > 0.5) kind = h > 51.5 ? "pass" : "plateau";
		else if (g.lat > 29.8 && g.lon > 80.45) kind = h > 50 ? "pass" : "gorge";
	}
	if (kind !== app.travelSound) {
		app.travelSound = kind;
		if (music.travel) music.travel(kind);
	}
}
// Places on the Kailash route, announced as the traveller passes them.
let passS = null;
function passing() {
	if (!passing.at) passing.at = PASSING.map(([lon, lat, text]) => ({ s: route.nearest(toWorld(lon, lat).x, toWorld(lon, lat).z), text }));
	// (not over a chapter card, which has the floor at the start of a leg)
	if (passS !== null && app.s > passS && app.s - passS < 3 && !$("card").classList.contains("show")) for (const p of passing.at) if (p.s > passS && p.s <= app.s) toast(p.text);
	passS = app.s;
}

// ---------- the traveller ----------
// Each leg by the shrine it ends at: a motorbike up to Bhimashankar; a taxi down the ghat and north to Shirdi; an
// auto to Sainagar Shirdi station, the express south to Tirupati, an auto to Alipiri and a taxi up the ghat; a taxi
// down to Tirupati station, the train north to Haridwar and a jeep up the Garhwal valleys to Gaurikund; and on to
// Badrinath by jeep. On foot up to Kedarnath, and for the last stretch to every temple door and the first away from it.
function modeAt(s) {
	if (KAILASH) return kModeAt(s);
	const c = route.chapters[app.leg], key = c.shrine.key, w = roads.legWalk[app.leg];
	if (s > c.s1 - 2.6 || s < c.s0 + 1.2) return "walk";
	// no vehicle goes near a temple: between the door and the bus stand it is the pilgrim path on foot
	if (s < w.out || s > w.in) return "walk";
	// the 16 km up to Kedarnath, and back down, are on foot whatever else you choose
	if (key === "kedarnath" && s > app.sGauri) return "walk";
	if (key === "badrinath" && s < app.sGauriBack) return "walk";
	const choice = TRANSPORT[app.transport];
	if (choice === "Bike") return "bike";
	if (choice === "Car") return "jeep";
	const T = roads.trains[app.leg];
	// no railway climbs to Bhimashankar, nor runs from there to Shirdi, so even by train those are by road
	if (key === "bhimashankar") return choice === "Train" ? "car" : "bike";
	if (key === "shirdi") return "car";
	// an auto to the station, the train, an auto to Alipiri, a taxi up the ghat
	if (key === "tirupati") return !T ? "car" : s < T.from ? "auto" : s < T.to ? "train" : s < roads.at.alipiri ? "auto" : "car";
	if (key === "kedarnath") return !T ? "jeep" : s < T.from ? "car" : s < T.to ? "train" : "jeep";
	return "jeep";
}
// The Kailash journey: each leg's stretches (kailash-geo.js, resolved by roads.js) say how it is travelled. On the
// Indian roads out of Delhi the transport chip chooses: the yatra's bus (as the MEA batches go), the train to
// Tanakpur, a motorbike or a car; up the Kali gorge the jeeps (or the bike or car); the Tibet side always by the
// yatra's Chinese bus, the Lipulekh and the parikrama always on foot.
function kWay(s) {
	const W = roads.ways[app.leg];
	let w = W[0];
	for (const q of W) if (q.s <= s + 1e-9) w = q;
	return w;
}
function kModeAt(s) {
	const c = route.chapters[app.leg], w = roads.legWalk[app.leg];
	if (s > c.s1 - 2.0 || s < c.s0 + 1.0) return "walk";
	if (s < w.out || s > w.in) return "walk";
	const way = kWay(s), choice = TRANSPORT[app.transport];
	if (way.kind === "walk") return "walk";
	if (way.kind === "tibet") return "coach";
	if (choice === "Bike") return "bike";
	if (choice === "Car") return "car";
	if (way.kind === "jeep") return "jeep";
	if (choice === "Train") {
		const T = roads.trains[app.leg];
		return !T ? "jeep" : s < T.from ? "auto" : s < T.to ? "train" : "jeep";
	}
	return "bus";
}
function kModeText() {
	const c = route.chapters[app.leg], way = kWay(app.s), w = roads.legWalk[app.leg], choice = TRANSPORT[app.transport];
	if (app.mode === "walk") {
		if (app.leg > 0 && app.s < w.out + 0.5 && way.kind !== "walk") return `On foot from ${SHRINES[app.leg - 1].name} to the road`;
		if (app.s > w.in - 0.5 && way.kind !== "walk") return `On foot to ${c.shrine.name}`;
		return way.label || "On foot";
	}
	if (app.mode === "train") return "By train to Tanakpur";
	if (app.mode === "auto") return "By auto to Delhi Junction";
	if (app.mode === "coach") return way.label || "By the yatra's bus";
	if (way.kind === "jeep") return choice === "Bike" ? "By motorbike up the Kali gorge" : choice === "Car" ? "By car up the Kali gorge" : way.label;
	if (app.mode === "bus") return "By the yatra's bus to Tanakpur and Dharchula";
	if (app.mode === "bike") return "By motorbike to Dharchula";
	if (app.mode === "car") return "By car to Dharchula";
	if (app.mode === "jeep") return "By jeep to Dharchula";
	return MODES[app.mode] || c.mode;
}
const travPos = new THREE.Vector3(), tp = {}, rp = {};
// Where a vehicle runs: on the road in its lane (metres from the centre, negative = left), else the route.
function roadPoint(s, lane) {
	s = clamp(s, 0, route.length - 0.01);
	const r = roads.road(s, lane, rp);
	// on the tarmac itself, not the bare ground under it, so wheels and feet are not sunk into the road (traffic.js)
	// or a footbridge's deck, where the path crosses a river beyond the end of the road
	if (r) return (r.y = Math.max(roadSurface(roads, s, lane), roads.deckAt(r.x, r.z))), r;
	const p = route.at(s, tp);
	p.x += -p.dz * lane * M;
	p.z += p.dx * lane * M;
	// on a road or a footbridge laid for another stretch of the route (the way back down), its tarmac or its deck
	p.y = Math.max(surfaceAt(roads, p.x, p.z), roads.deckAt(p.x, p.z));
	return p;
}
function setOn(obj, p, scale, yaw = Math.atan2(p.dx, p.dz)) {
	obj.position.set(p.x, p.y + 0.02, p.z);
	obj.rotation.set(0, yaw, 0);
	obj.scale.setScalar(scale);
}
function updateTraveller(dt) {
	const pre = app.state === "travel" ? modeAt(app.s) : "walk";
	// on foot the traveller keeps to the left verge; vehicles run near the middle of the road
	const onRoad = roads.road(app.s, 0, {});
	// vehicles ride just left of the centre line, clear of oncoming traffic on the right
	// on the narrow Garhwal roads keep further left, so an oncoming bus has room on a bend
	const narrow = onRoad && onRoad.kind === "hill";
	const myLane = (pre === "bike" ? (narrow ? -1.1 : -0.6) : narrow ? -1.55 : -1.15) * journey.keep(app.s);
	const p = pre === "walk" ? roadPoint(app.s, journey.walkLane(app.s)) : roadPoint(app.s, myLane);
	let yaw = Math.atan2(p.dx, p.dz);
	travPos.set(p.x, p.y, p.z);
	let atShrine = false;
	for (const l of landmarks) {
		const d = Math.hypot(p.x - l.pos.x, p.z - l.pos.z);
		const [rx, rz] = l.shrine.rest;
		const R = Math.hypot(rx, rz);
		if (d > R + 2) continue;
		// walk off the road to the spot before the door, then turn to face the shrine
		const f = l.shrine.facing, c = Math.cos(f), sn = Math.sin(f);
		const wx = l.pos.x + rx * c + rz * sn, wz = l.pos.z - rx * sn + rz * c;
		const k = app.state === "darshan" ? 1 : smoothstep(R + 2, R * 0.55, d);
		if (l.shrine.gate && k > 0 && k < 1) {
			// by way of the gate points, not through the temple's walls: from the path, round by each point, to the spot
			const Q = [[p.x, p.z], ...l.shrine.gate.map(([gx, gz]) => [l.pos.x + gx * c + gz * sn, l.pos.z - gx * sn + gz * c]), [wx, wz]];
			let L = 0;
			for (let i = 1; i < Q.length; i++) L += Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]);
			let u = k * L;
			for (let i = 1; i < Q.length; i++) {
				const l2 = Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]);
				if (u <= l2 || i === Q.length - 1) {
					const t = l2 ? Math.min(1, u / l2) : 1;
					travPos.x = lerp(Q[i - 1][0], Q[i][0], t);
					travPos.z = lerp(Q[i - 1][1], Q[i][1], t);
					break;
				}
				u -= l2;
			}
		} else {
			travPos.x = lerp(p.x, wx, k);
			travPos.z = lerp(p.z, wz, k);
		}
		// stepping down off a bridge deck as the way turns to the door (Kedarnath's, over the Mandakini), not dropping from it
		const base = world.height(travPos.x, travPos.z) + l.shrine.floor * k;
		travPos.y = Math.max(base, lerp(p.y, base, k));
		// the door is at about z = 1.9 in front of the sanctum
		const door = { x: l.pos.x + 1.9 * sn, z: l.pos.z + 1.9 * c };
		const face = Math.atan2(door.x - travPos.x, door.z - travPos.z);
		// facing the way they walk (round a gate, out and back), turning to the door at the end
		const mx = travPos.x - (app.lastTrav ? app.lastTrav.x : travPos.x), mz = travPos.z - (app.lastTrav ? app.lastTrav.z : travPos.z);
		if (Math.hypot(mx, mz) > 1e-4 && k > 0.02 && k < 0.98) app.walkYaw = Math.atan2(mx, mz);
		if (app.walkYaw !== undefined && k > 0.02) yaw = app.walkYaw;
		const tf = smoothstep(0.5, 0.95, k);
		yaw = Math.atan2(lerp(Math.sin(yaw), Math.sin(face), tf), lerp(Math.cos(yaw), Math.cos(face), tf));
		atShrine = k > 0.02;
	}
	app.lastTrav = { x: travPos.x, z: travPos.z };
	if (!atShrine) app.walkYaw = undefined;
	const moving = app.state === "travel" && app.playing;
	let mode = app.state === "darshan" ? "darshan" : app.state === "travel" ? modeAt(app.s) : "walk";
	if (atShrine && mode !== "darshan") mode = "walk";
	app.mode = mode;
	const dist = camera.position.distanceTo(travPos);
	const ls = Math.max(app.state === "darshan" ? 1.15 : 1, dist * 0.03);
	// world units per metre for a vehicle: true to the figure up close, grown with distance so a bike or
	// a jeep still reads from high above; the train is long already, so it grows less
	// the train is always life size, so it runs under its wires and between its masts
	const speed = SPEEDS[app.speed];
	// riding, seated in a taxi, at the train's door, or getting on and off: boarding.js places the traveller
	if (app.state === "travel" && mode !== "walk") mode = journey.mode();
	const placed = journey.place(dt, app.t, camera, dist);
	traveller.group.visible = app.state !== "intro" && app.state !== "finale" && (placed ? traveller.group.visible : true);
	if (!placed) {
		journey.release();
		// on foot along the route, where one path hands over to the next (a road's verge to the trek, a road deck
		// to a footbridge) the two can disagree by a hand's breadth: never step more than the walk carries, and let
		// the difference ease out over a moment instead
		const ds = Math.abs(app.s - (app.walkS ?? app.s));
		if (app.state === "travel" && mode === "walk" && moving && app.walkShown && ds < 0.5) {
			const lim = 0.015 + ds * Math.max(1, journey.groundPerS || 1) * 1.4;
			app.walkFix.multiplyScalar(Math.exp(-dt * 3));
			const want = travPos.clone().add(app.walkFix), step = want.clone().sub(app.walkShown);
			if (step.length() > lim) want.copy(app.walkShown).addScaledVector(step, lim / step.length());
			app.walkFix.copy(want).sub(travPos);
			travPos.copy(want);
		} else if (!moving && app.state === "travel" && mode === "walk" && app.walkFix) travPos.add(app.walkFix);
		else app.walkFix = new THREE.Vector3();
		app.walkShown = travPos.clone();
		app.walkS = app.s;
		traveller.group.position.copy(travPos);
		traveller.group.scale.setScalar(ls);
		// the stride's cadence follows the ground actually covered (rate 1 is about 1.3 m/s), scaled for the figure's size
		const v = journey.vWalk || 0, step = v / (1.3 * M * ls);
		const still = mode === "walk" && (!moving || step < 0.05);
		traveller.update(dt, app.t, { mode: still ? "idle" : mode === "darshan" ? "darshan" : "walk", rate: clamp(step, 0.4, 3.2), yaw, distance: dist });
	}
	app.mode = mode;
	const vs = clamp(dist * 0.009, 0.28, 0.42);
	// the road around the traveller: scenery chunks and traffic
	scenery.update(app.state === "darshan" ? route.chapters[app.at].s1 : app.s, camera);
	const pace = moving ? route.legSpeed[app.leg] * speed : 0;
	// the traveller's footprint: the bike, car or jeep they ride, or themselves on foot
	const mp = mover(), fr = { bike: 1.2, car: 2.3, jeep: 2.3, auto: 1.6, bus: 5.6, coach: 5.6 }[app.travelMode] || 0.5;
	traffic.update(dt, app.s, pace, app.state === "travel" && mode !== "train" && !journey.busy() && dist < 70, vs, { x: mp.x, z: mp.z, r: fr * vs });
	if (mode !== app.travelMode) app.modeT = 0;
	app.modeT = (app.modeT || 0) + dt;
	app.travelMode = mode;
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
		// a town at a shrine goes by the shrine's own label
		if (SHRINES.some((s) => Math.hypot(s.lon - c.lon, s.lat - c.lat) < 0.3)) continue;
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
	mk(0, START, "start", restart);
	SHRINES.forEach((s, i) => mk(((i + 1) / N) * 100, s.name, "shrine", () => jump(i)));
	if (coarse) $("hint").textContent = `Drag to look around · pinch to zoom · tap a ${KAILASH ? "stop" : "shrine"} on the progress bar to go there`;
	// minimap base
	drawMapBase();
	// buttons
	$("start").addEventListener("click", begin);
	$("continue").addEventListener("click", next);
	$("enter").addEventListener("click", () => enterTemple(true));
	$("btn-play").addEventListener("click", togglePlay);
	$("btn-speed").addEventListener("click", () => setSpeed((app.speed + 1) % SPEEDS.length));
	$("btn-time").addEventListener("click", () => cycleTime());
	$("btn-weather").addEventListener("click", () => cycleWeather());
	$("btn-transport").addEventListener("click", () => cycleTransport());
	$("btn-zin").addEventListener("click", () => zoomBy(0.7));
	$("btn-zout").addEventListener("click", () => zoomBy(1.45));
	$("transport-label").textContent = TRANSPORT[app.transport];
	$("btn-sound").addEventListener("click", toggleSound);
	kd.bind($("btn-aarti-music"));
	kd.bind($("help-aarti-music"));
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
function cycleTransport() {
	app.transport = (app.transport + 1) % TRANSPORT.length;
	$("transport-label").textContent = TRANSPORT[app.transport];
	store.set(TRANSPORT_KEY, app.transport);
	const say = KAILASH
		? ["The yatra's way: the bus from Delhi, jeeps up the Kali, on foot over the Lipulekh, the Chinese bus in Tibet", "By train from Delhi to Tanakpur, then jeeps; the Tibet side by bus, the parikrama on foot", "By motorbike to Nabhidhang; the Tibet side by bus, the parikrama on foot", "By car to Nabhidhang; the Tibet side by bus, the parikrama on foot"]
		: ["The usual way: motorbike, taxi, train and jeep, on foot to Kedarnath", "By train wherever the line goes, taxis and jeeps for the rest", "By motorbike the whole way, on foot to Kedarnath", "By car the whole way, on foot to Kedarnath"];
	toast(say[app.transport]);
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
		// close in on the traveller, a far shrine's name would float over whatever is in front (a coach, a bus)
		if (l.shrine !== undefined && app.state === "travel" && rig.dist < 30) on = false;
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
	return (app.leg + clamp((app.s - c.s0) / (c.s1 - c.s0), 0, 1)) / N;
}
function updateHud() {
	$("fill").style.width = (progressFraction() * 100).toFixed(2) + "%";
	let where = START;
	if (app.state === "darshan") where = `${SHRINES[app.at].name} · ${SHRINES[app.at].greeting}`;
	else if (app.state === "finale") where = "Yatra complete";
	else if (app.state === "travel") {
		const c = route.chapters[app.leg];
		let mode = MODES[app.mode] || c.mode;
		const key = c.shrine.key, T = roads.trains[app.leg], w = roads.legWalk[app.leg], own = TRANSPORT[app.transport] === "Car";
		if (KAILASH) mode = kModeText();
		else if (key === "kedarnath" && app.s > app.sGauri) mode = "On foot from Gaurikund, 16 km";
		else if (app.mode === "train") mode = key === "tirupati" ? "By the Sainagar Shirdi–Tirupati Express" : "By train to Haridwar";
		else if ((app.mode === "jeep" || app.mode === "car") && own) mode = "By car";
		else if (app.mode === "jeep" && key === "kedarnath") mode = "By jeep up the Mandakini to Gaurikund";
		else if (app.mode === "jeep" && key === "badrinath") mode = "By jeep up the Alaknanda to Badrinath";
		else if (app.mode === "bike") mode = key === "bhimashankar" ? "By motorbike, 110 km" : key === "shirdi" ? "By motorbike, about 180 km" : "By motorbike";
		else if (app.mode === "car" && key === "bhimashankar") mode = "By taxi; no railway climbs to Bhimashankar";
		else if (app.mode === "car" && key === "shirdi") mode = app.s < roads.at.mancharOut ? "By taxi down the ghat to Manchar" : TRANSPORT[app.transport] === "Train" ? "By taxi; no railway runs from here to Shirdi" : "By taxi up the Nashik highway to Shirdi";
		else if (app.mode === "auto") mode = T && app.s < T.from ? "By auto to Sainagar Shirdi station" : "By auto from Tirupati station to Alipiri";
		else if (app.mode === "car") mode = key === "tirupati" ? "By taxi up the ghat road to Tirumala" : "By taxi down to Tirupati station";
		else if (app.mode === "walk" && key === "badrinath" && app.s < app.sGauriBack) mode = "On foot down to Gaurikund";
		else if (app.mode === "walk" && app.leg > 0 && app.s < w.out + 0.5) mode = `On foot from the ${SHRINES[app.leg - 1].name} temple to the bus stand`;
		else if (app.mode === "walk" && app.s > w.in - 0.5) mode = "On foot up to the temple door";
		where = `To ${c.shrine.name} · ${mode}${app.playing ? "" : " · paused"}`;
	}
	const we = $("where");
	if (we.textContent !== where) we.textContent = where;
	$("map-meta").textContent = `≈ ${Math.round(route.km(app.state === "intro" ? 0 : app.s)).toLocaleString("en-IN")} km`;
	drawMap();
}

// ---------- minimap ----------
// the Kailash journey's minimap shows northern India and western Tibet: land and water only, no lines between
// countries (the Kalapani and Lipulekh area is disputed)
const MAP = KAILASH ? { lon0: 76.7, lon1: 82.3, lat0: 26.9, lat1: 32.5 } : { lon0: 67, lon1: 98, lat0: 6, lat1: 37 };
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
	if (KAILASH) {
		g.fillStyle = "#1c2f5e";
		g.fillRect(0, 0, W, W);
		// the plateau beyond the crest a shade paler
		g.fillStyle = "rgba(120,140,190,0.18)";
		g.beginPath();
		g.moveTo(...mapXY(76.7, 33.0, W));
		for (const [lo, la] of [[76.7, 32.6], [78.0, 32.0], [79.3, 31.0], [80.5, 30.35], [81.03, 30.24], [81.6, 30.1], [82.3, 29.95]]) g.lineTo(...mapXY(lo, la, W));
		g.lineTo(...mapXY(82.3, 33.0, W));
		g.fill();
		g.strokeStyle = "rgba(120,170,220,0.55)";
		g.lineWidth = 1;
		for (const r of K_RIVERS) {
			g.beginPath();
			r.pts.forEach(([lo, la], i) => (i ? g.lineTo(...mapXY(lo, la, W)) : g.moveTo(...mapXY(lo, la, W))));
			g.stroke();
		}
		g.fillStyle = "#3f9fb4";
		for (const L of LAKES) {
			g.beginPath();
			L.pts.forEach(([lo, la], i) => (i ? g.lineTo(...mapXY(lo, la, W)) : g.moveTo(...mapXY(lo, la, W))));
			g.closePath();
			g.fill();
		}
	}
	for (const poly of KAILASH ? [] : [INDIA, LANKA]) {
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
			if (pinch > 0) rig.zoom = clamp(rig.zoom * (pinch / d), ZMIN, ZMAX);
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
		rig.zoom = clamp(rig.zoom * Math.exp(e.deltaY * 0.0012), ZMIN, ZMAX);
	}, { passive: false });
	canvas.addEventListener("dblclick", resetView);
	addEventListener("keydown", (e) => {
		if (app.mapView && app.mapView.isOpen) return;
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
		} else if (k.length === 1 && k >= "1" && k <= String(Math.min(9, N))) jump(+k - 1);
		else if (k === "0") restart();
		else if (k === "+" || k === "=") setSpeed(app.speed + 1);
		else if (k === "-" || k === "_") setSpeed(app.speed - 1);
		else if (k === "t" || k === "T") cycleTime();
		else if (k === "w" || k === "W") cycleWeather();
		else if (k === "v" || k === "V") cycleTransport();
		else if ((k === "e" || k === "E") && app.state === "darshan") enterTemple(true);
		else if (k === "m" || k === "M") toggleSound();
		else if (k === "h" || k === "H") document.body.classList.toggle("hide-hud");
		else if (k === "c" || k === "C") resetView();
		else if (k === "?") $("help").hidden = false;
		else if (k === "Escape") { closeMenu(); $("finale").hidden = true; }
		else if (k === "ArrowLeft") rig.userYaw += 0.12;
		else if (k === "ArrowRight") rig.userYaw -= 0.12;
		else if (k === "ArrowUp") rig.userPitch = clamp(rig.userPitch + 0.08, -1.2, 1.2);
		else if (k === "ArrowDown") rig.userPitch = clamp(rig.userPitch - 0.08, -1.2, 1.2);
		else if (k === "PageUp" || k === "]") zoomBy(0.8);
		else if (k === "PageDown" || k === "[") zoomBy(1.25);
		else return;
	});
	addEventListener("resize", () => {
		renderer.setSize(innerWidth, innerHeight, false);
		if (sanctum && sanctum.active) sanctum.resize(innerWidth, innerHeight);
		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
	});
}
// from close enough to see faces to high enough to see half of India
const ZMIN = 0.42, ZMAX = 8; // the closest zoom still keeps the whole traveller in view
function zoomBy(k) {
	rig.zoom = clamp(rig.zoom * k, ZMIN, ZMAX);
}
function resetView() {
	rig.userYaw = 0;
	rig.userPitch = 0;
	rig.zoom = 1;
}

app.THREE = THREE;
Object.assign(app, { begin, next, jump, restart, setSpeed, cycleTime, cycleWeather, cycleTransport, enterTemple, rig, viewFrom: (from, to) => occlusion(to, from) });
init().catch((e) => {
	console.error(e);
	$("loader-msg").textContent = "Sorry, this needs WebGL. " + (e && e.message ? e.message : "");
});
