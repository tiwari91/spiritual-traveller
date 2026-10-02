// Spiritual Traveller: entry point. Builds India, the route and the shrines, then runs the yatra.
import * as THREE from "three";
import { World } from "./world.js";
import { Route } from "./route.js";
import { Sky } from "./sky.js";
import { buildLandmarks, GOLD, LAMP, beaconMaterial } from "./landmarks.js";
import { routeLine, cityLights, Weather, Petals } from "./effects.js";
import { Traveller, crowdFigure } from "./pilgrim.js";
import { WINDOW_GLOW, jeep, motorbike, train } from "./vehicles.js";
import { M, Roads } from "./roads.js";
import { Scenery } from "./scenery.js";
import { Traffic } from "./traffic.js";
import { Sanctum } from "./sanctum.js";
import { Music } from "./music.js";
import { Aarti } from "./aarti.js";
import { MapView } from "./map3d.js";
import { Audio } from "./audio.js";
import { CITIES, GAURIKUND, INDIA, LANKA, SHRINES, toWorld } from "./geo.js";
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
// Where the traveller stands for darshan, in each shrine's local frame (x across, z out from the door),
// clear of Nandi and the crowd, and the floor height there.
const REST = { bhimashankar: [0.5, 3.45], tirupati: [0.15, 4.1], kedarnath: [0.55, 3.75], badrinath: [0.25, 2.85] };
const FLOOR = { bhimashankar: 0.03, tirupati: 0.15, kedarnath: 0.05, badrinath: 0 };
// How each stretch is travelled, and what the HUD calls it.
const MODES = { walk: "On foot", bike: "By motorbike", train: "By train", jeep: "By jeep", car: "By taxi" };

const app = { transport: 0, inside: [false, false, false, false], ready: false, frames: 0, t: 0, state: "loading", s: 0, leg: 0, at: -1, playing: true, speed: 0, time: 0, weather: 0, visited: [false, false, false, false], params };
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

let world, route, sky, landmarks, line, traveller, ride, lights, weather, petals, roads, scenery, traffic, sanctum, music, aarti;
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
	line = routeLine(route);
	scene.add(line);
	traveller = new Traveller();
	scene.add(traveller.group);
	// the aarti at the door, with each shrine's own music
	music = new Music(audio);
	aarti = new Aarti({ scene, landmarks, music, traveller, low: LOW });
	ride = { bike: motorbike(), jeep: jeep(), car: jeep(), train: train(4) };
	ride.car.group.children[0].material = ride.car.group.children[0].material.clone();
	ride.car.group.children[0].material.color.set(0xf2c230); // a yellow-roofed Tirupati taxi
	ride.car.group.children[1].material = ride.car.group.children[0].material;
	for (const k of ["bike", "jeep", "car"]) scene.add(ride[k].group);
	for (const c of ride.train) scene.add(c.group);
	lights = cityLights(world);
	scene.add(lights);
	weather = new Weather(scene);
	petals = new Petals(scene);
	sky = new Sky(scene);
	if (LOW) sky.sun.shadow.mapSize.set(1024, 1024);
	Object.assign(app, { world, route, sky, landmarks, scene, roads, scenery, traffic });
	// where the road gives way to the footpath below Kedarnath
	const gk = toWorld(GAURIKUND[0], GAURIKUND[1]);
	const c2 = route.chapters[2];
	let best = Infinity;
	for (const p of route.pts) if (p.s >= c2.s0 && p.s <= c2.s1) {
		const d = (p.x - gk.x) ** 2 + (p.z - gk.z) ** 2;
		if (d < best) { best = d; app.sGauri = p.s; }
	}
	// where the traveller changes from one kind of transport to the next
	// where the traveller changes from one kind of transport to the next
	app.sPune = roads.at.pune;
	app.sTirupatiIn = roads.at.tirupatiIn;
	app.sTirupatiOut = roads.at.tirupatiOut;
	app.sRishikesh = roads.at.rishikesh;
	app.sGauri = roads.at.gauri;
	app.sGauriBack = roads.at.gauriBack;
	app.transport = clamp(store.get("transport", 0), 0, TRANSPORT.length - 1);
	if (params.has("go")) app.transport = Math.max(0, TRANSPORT.findIndex((t) => t.toLowerCase() === params.get("go")));
	scenery.prebuild(params.has("s") ? parseFloat(params.get("s")) || 0 : 0);
	// inside each temple: the shrine's own rituals, step by step
	sanctum = new Sanctum({ renderer, container: document.body, audio, low: LOW, onStep: (i, step, key) => {
		// the music of the temple follows the rituals inside
		if (/aarti/i.test(step.title) && !/take/i.test(step.title)) music.aarti(key);
		else if (i === 0) music.ambient(key);
	}, onExit: (key) => {
		music.ambient(key);
		renderer.setSize(innerWidth, innerHeight, false);
		$("enter").innerHTML = "Go inside again <span>the rituals play by themselves (E)</span>";
		$("continue").focus();
	} });
	Object.assign(app, { sanctum, music, aarti });
	// the 3D satellite map, opened from the minimap or with G
	app.mapView = new MapView({ opener: $("map-wrap"), hotkey: "g", onOpen: () => (app.mapOpen = true), onClose: () => (app.mapOpen = false) });
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
	$("enter").innerHTML = app.inside[i] ? "Go inside again <span>the rituals play by themselves (E)</span>" : "Enter the temple <span>the traveller goes in by themselves in a moment (E)</span>";
	$("darshan").querySelector(".d-scroll").scrollTop = 0;
	$("darshan").classList.add("show");
	document.body.classList.add("darshan-open");
	hideCard();
	toast(`${s.mantraLatin}`);
	audio.bell(3);
	app.aartiDone = false;
	aarti.start(i).then(() => {
		if (app.state === "darshan" && app.at === i) app.aartiDone = true;
	});
	rig.userYaw = 0;
	rig.userPitch = 0;
	refreshMarks();
}
function enterTemple(auto = false) {
	if (app.state !== "darshan" || sanctum.active) return;
	app.inside[app.at] = true;
	aarti.stop();
	sanctum.enter(SHRINES[app.at].key, { auto: auto === true });
	sanctum.resize(innerWidth, innerHeight);
}
function closeDarshan() {
	aarti.stop();
	music.stop(1.2);
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
	app.inside = [false, false, false, false];
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
		// look over the traveller's shoulder at the shrine
		// aim between the traveller and the door, so the pilgrim stands in the foreground before the shrine
		g.target.copy(l.pos).lerp(traveller.group.position, 0.55);
		if (aarti.active && aarti.focus) g.target.lerp(aarti.focus, 0.35);
		g.target.y = l.pos.y + (high ? 1.55 : 1.05);
		g.yaw = l.shrine.facing + 0.32 + Math.sin(app.darshanT * 0.1) * 0.25;
		g.pitch = high ? 0.16 : 0.26;
		g.dist = innerWidth < innerHeight ? 12 : 6.2;
		return g;
	}
	const p = route.at(app.s, tmp);
	const c = route.chapters[app.leg];
	const near = smoothstep(26, 3, Math.min(c.s1 - app.s, app.s - c.s0));
	// close enough to see the road, the railway and the villages go by
	const far = [24, 62, 72, 28][app.leg];
	// for a few seconds after the traveller changes transport, the camera comes down alongside
	const vehicle = ["bike", "train", "jeep", "car"].includes(app.travelMode);
	const chase = vehicle ? smoothstep(7, 3, app.modeT || 0) : 0;
	const close = Math.max(near, chase);
	g.target.set(p.x, p.y + 0.6, p.z);
	// on the train, follow the train on its own line beside the road
	if (app.travelMode === "train") {
		const r = roads.rail(app.s - 4, {});
		if (r) g.target.set(r.x, r.y + 0.6, r.z);
	}
	g.yaw = Math.atan2(-p.dx, -p.dz) + 0.55 * close;
	g.pitch = lerp(app.leg === 1 || app.leg === 2 ? 0.62 : 0.72, 0.5, close);
	g.dist = lerp(lerp(far, 16, near), app.travelMode === "train" ? 34 : 14, chase) * (innerWidth < innerHeight ? 1.35 : 1);
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
	// rise over any ridge that would hide the traveller (outside darshan, where the shrine frames the view)
	if (app.state === "travel") {
		let lift = 0;
		for (let k = 0.15; k < 1; k += 0.085) {
			const x = lerp(rig.target.x, camera.position.x, k), z = lerp(rig.target.z, camera.position.z, k);
			const need = world.height(x, z) + 1.5 - lerp(rig.target.y, camera.position.y, k);
			if (need > 0) lift = Math.max(lift, need / k);
		}
		rig.lift = lerp(rig.lift || 0, lift, 1 - Math.exp(-dt * 4));
		camera.position.y += rig.lift;
	} else rig.lift = 0;
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
		const c = route.chapters[app.leg];
		let ease = 0.22 + 0.78 * smoothstep(0, 10, Math.min(c.s1 - app.s, app.s - c.s0));
		ease *= trainPace(dt);
		const before = app.s;
		app.s += route.legSpeed[app.leg] * SPEEDS[app.speed] * ease * dt;
		if (app.travelMode === "train") for (const st of roads.stations) {
			// the train halts at each station on the way
			if (before < st.s && app.s >= st.s && st.s > trainSpan()[0] + 4 && st.s < trainSpan()[1] - 4) {
				app.s = st.s;
				app.dwell = 3.2;
				toast(`${st.name.replace(/ JN$/, " JUNCTION").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}: the train halts`);
			}
		}
		if (app.s >= c.s1) arrive(app.leg);
	}
	if (app.state === "darshan") {
		app.darshanT += dt;
		// after a few moments at the door, the traveller goes in and does the rituals by themselves
		if (!app.inside[app.at] && (app.aartiDone || !aarti.active) && app.darshanT > 6 && !sanctum.active && !app.params.has("noenter")) {
			app.inside[app.at] = true;
			enterTemple(true);
		}
		if (params.get("auto") === "1" && app.darshanT > 14) next();
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
	updateTraveller(dt);
	aarti.update(dt, app.t, camera);
	// sky, light and weather
	focus.copy(rig.target);
	const hour = currentHour();
	const wx = currentWeather(focus);
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
	if (!app.mapOpen) renderer.render(scene, camera);
	if (app.frames % 6 === 0 && app.state !== "loading") {
		const tp = traveller.group.position, p = route.at(app.s, {});
		app.mapView.setProgressWorld({ x: tp.x, z: tp.z, dx: p.dx, dz: p.dz, mode: app.mode, leg: app.state === "finale" ? 4 : app.leg, doneFraction: progressFraction(), state: app.state === "intro" ? "intro" : undefined, label: $("where").textContent });
	}
	if (app.frames % 2 === 0) updateLabels();
	if (app.frames % 4 === 0) updateHud(hour);
}

// ---------- the train ----------
function trainSpan() {
	return app.leg === 1 ? [roads.at.trainFrom, roads.at.trainTo] : [roads.at.trainFrom2, roads.at.trainTo2];
}
// A train pulls out slowly, runs at line speed, brakes into each station and stands there a moment.
function trainPace(dt) {
	if (app.dwell > 0) {
		app.dwell -= dt;
		return 0;
	}
	if (app.travelMode !== "train") return 1;
	const [a, b] = trainSpan();
	let k = Math.min(0.06 + 0.94 * smoothstep(0, 16, app.s - a), 0.06 + 0.94 * smoothstep(0, 16, b - app.s));
	for (const st of roads.stations) {
		const d = st.s - app.s;
		if (d > 0 && d < 16 && st.s > a + 4 && st.s < b - 4) k = Math.min(k, 0.05 + 0.95 * smoothstep(0, 16, d));
		if (d <= 0 && d > -14) k = Math.min(k, 0.08 + 0.92 * smoothstep(0, 14, -d));
	}
	return k;
}

// ---------- the traveller ----------
// Motorbike up to Bhimashankar; a taxi back down to Pune station and between Tirupati and the hill; the train
// across the Deccan, and across India to Rishikesh;
// a jeep up the Garhwal valleys to Gaurikund and on to Badrinath; on foot up to Kedarnath and for the
// last stretch to every temple door.
function modeAt(s) {
	const c = route.chapters[app.leg];
	if (s > c.s1 - 2.6 || s < c.s0 + 1.2) return "walk";
	// no vehicle goes near a temple: from the bus stand it is the pilgrim path on foot
	const here = route.at(s, {});
	if (roads.shrinePos.some((w, i) => Math.hypot(here.x - w.x, here.z - w.z) < roads.clearR[i] + 0.3)) return "walk";
	// the 16 km up to Kedarnath, and back down, are on foot whatever else you choose
	if (app.leg === 2 && s > app.sGauri) return "walk";
	if (app.leg === 3 && s < app.sGauriBack) return "walk";
	const choice = TRANSPORT[app.transport];
	if (choice === "Bike") return "bike";
	if (choice === "Car") return "jeep";
	// no railway climbs to Bhimashankar, so even by train it starts by road
	if (app.leg === 0) return choice === "Train" ? "car" : "bike";
	if (app.leg === 1) return s < roads.at.trainFrom ? "car" : s < roads.at.trainTo ? "train" : "car";
	if (app.leg === 2) return s < roads.at.trainFrom2 ? "car" : s < roads.at.trainTo2 ? "train" : "jeep";
	return "jeep";
}
const travPos = new THREE.Vector3(), tp = {}, rp = {};
// Where a vehicle runs: on the road in its lane (metres from the centre, negative = left), else the route.
function roadPoint(s, lane) {
	s = clamp(s, 0, route.length - 0.01);
	const r = roads.road(s, lane, rp);
	if (r) return r;
	const p = route.at(s, tp);
	p.x += -p.dz * lane * M;
	p.z += p.dx * lane * M;
	p.y = world.height(p.x, p.z);
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
	const half = onRoad ? (onRoad.kind === "nh" ? 3.75 : onRoad.kind === "ghat" ? 3.5 : onRoad.kind === "hill" ? 2.75 : 0) : 0;
	const p = pre === "walk" ? roadPoint(app.s, -(half + 0.6)) : roadPoint(app.s, -0.7);
	let yaw = Math.atan2(p.dx, p.dz);
	travPos.set(p.x, p.y, p.z);
	let atShrine = false;
	for (const l of landmarks) {
		const d = Math.hypot(p.x - l.pos.x, p.z - l.pos.z);
		const [rx, rz] = REST[l.shrine.key];
		const R = Math.hypot(rx, rz);
		if (d > R + 2) continue;
		// walk off the road to the spot before the door, then turn to face the shrine
		const f = l.shrine.facing, c = Math.cos(f), sn = Math.sin(f);
		const wx = l.pos.x + rx * c + rz * sn, wz = l.pos.z - rx * sn + rz * c;
		const k = app.state === "darshan" ? 1 : smoothstep(R + 2, R * 0.55, d);
		travPos.x = lerp(p.x, wx, k);
		travPos.z = lerp(p.z, wz, k);
		travPos.y = world.height(travPos.x, travPos.z) + FLOOR[l.shrine.key] * k;
		// the door is at about z = 1.9 in front of the sanctum
		const door = { x: l.pos.x + 1.9 * sn, z: l.pos.z + 1.9 * c };
		const face = Math.atan2(door.x - travPos.x, door.z - travPos.z);
		const tf = smoothstep(0.5, 0.95, k);
		yaw = Math.atan2(lerp(Math.sin(yaw), Math.sin(face), tf), lerp(Math.cos(yaw), Math.cos(face), tf));
		atShrine = k > 0.02;
	}
	const moving = app.state === "travel" && app.playing;
	let mode = app.state === "darshan" ? "darshan" : app.state === "travel" ? modeAt(app.s) : "walk";
	if (atShrine && mode !== "darshan") mode = "walk";
	app.mode = mode;
	const dist = camera.position.distanceTo(travPos);
	const ls = Math.max(app.state === "darshan" ? 1.15 : 1, dist * 0.03);
	// world units per metre for a vehicle: true to the figure up close, grown with distance so a bike or
	// a jeep still reads from high above; the train is long already, so it grows less
	// the train is always life size, so it runs under its wires and between its masts
	const vs = clamp(dist * 0.009, 0.28, 0.42), vt = M;
	const speed = SPEEDS[app.speed];
	const spin = moving ? dt * 22 * Math.sqrt(speed) : 0;
	for (const k of ["bike", "jeep", "car"]) {
		const v = ride[k];
		v.group.visible = mode === k && app.state === "travel";
		if (!v.group.visible) continue;
		setOn(v.group, roadPoint(app.s, -0.7 * (vs / M)), vs);
		for (const w of v.wheels) w.rotation.x += spin;
	}
	const onTrain = mode === "train" && app.state === "travel";
	let off = 0;
	// the train leaves from Pune, or from Tirupati on the way north; carriages still in the station stay hidden
	const station = app.leg === 1 ? roads.at.trainFrom : roads.at.trainFrom2;
	ride.train.forEach((c) => {
		const half = (c.len * vt) / 2;
		const at = onTrain && app.s - off - half > station ? roads.rail(app.s - off - half, {}) : null;
		c.group.visible = !!at;
		off += half * 2 + 0.8 * vt;
		// each carriage follows the line on its own, so the train bends through curves, with a slight rock
		if (at) {
			setOn(c.group, at, vt);
			c.group.rotation.z = Math.sin(app.t * 2.3 + off * 0.7) * 0.012 * (moving ? 1 : 0);
		}
	});
	traveller.group.visible = app.state !== "intro" && app.state !== "finale" && (mode === "walk" || mode === "darshan" || mode === "bike");
	if (mode === "bike") {
		const b = ride.bike;
		traveller.group.position.copy(b.group.position).add(new THREE.Vector3(0, b.seat.y * vs - 0.85 * vs + 0.0, 0)).addScaledVector(new THREE.Vector3(Math.sin(b.group.rotation.y), 0, Math.cos(b.group.rotation.y)), b.seat.z * vs);
		traveller.group.scale.setScalar(vs / 0.28);
		traveller.update(dt, app.t, { mode: "ride", yaw: b.group.rotation.y, distance: dist });
	} else {
		traveller.group.position.copy(travPos);
		traveller.group.scale.setScalar(ls);
		traveller.update(dt, app.t, { mode: mode === "walk" && !moving ? "idle" : mode, rate: Math.min(2, 0.85 + Math.log2(speed) * 0.35), yaw, distance: dist });
	}
	// the road around the traveller: scenery chunks and traffic
	scenery.update(app.state === "darshan" ? route.chapters[app.at].s1 : app.s, camera);
	const pace = moving ? route.legSpeed[app.leg] * speed : 0;
	traffic.update(dt, app.s, pace, app.state === "travel" && mode !== "train" && dist < 70, vs);
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
	store.set("transport", app.transport);
	const say = ["The usual way: motorbike, train and jeep, on foot to Kedarnath", "By train wherever the line goes, taxis and jeeps for the rest", "By motorbike the whole way, on foot to Kedarnath", "By car the whole way, on foot to Kedarnath"];
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
		let mode = MODES[app.mode] || c.mode;
		if (app.leg === 2 && app.s > app.sGauri) mode = "On foot from Gaurikund, 16 km";
		else if (app.mode === "train") mode = app.leg === 2 ? "By train to Rishikesh" : "By train to Tirupati";
		else if (app.mode === "jeep" && TRANSPORT[app.transport] === "Car") mode = "By car";
		else if (app.mode === "jeep" && app.leg === 2) mode = "By jeep up the Mandakini to Gaurikund";
		else if (app.mode === "bike") mode = app.leg === 0 ? "By motorbike, 110 km" : "By motorbike";
		else if (app.mode === "car" && TRANSPORT[app.transport] === "Car") mode = "By car";
		else if (app.mode === "car" && app.leg === 0) mode = "By taxi; no railway climbs to Bhimashankar";
		else if (app.mode === "car") mode = app.leg === 1 ? (app.s < app.sPune ? "By taxi down to Pune station" : "By taxi up the ghat road to Tirumala") : "By taxi down to Tirupati station";
		else if (app.mode === "walk" && app.leg === 3 && app.s < app.sGauriBack) mode = "On foot down to Gaurikund";
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
		} else if (k.length === 1 && k >= "1" && k <= "4") jump(+k - 1);
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
const ZMIN = 0.12, ZMAX = 8;
function zoomBy(k) {
	rig.zoom = clamp(rig.zoom * k, ZMIN, ZMAX);
}
function resetView() {
	rig.userYaw = 0;
	rig.userPitch = 0;
	rig.zoom = 1;
}

app.THREE = THREE;
Object.assign(app, { begin, next, jump, restart, setSpeed, cycleTime, cycleWeather, cycleTransport, enterTemple, rig });
init().catch((e) => {
	console.error(e);
	$("loader-msg").textContent = "Sorry, this needs WebGL. " + (e && e.message ? e.message : "");
});
