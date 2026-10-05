// Map3D: a full-screen 3D satellite map of the yatra, built only from open data.
//
//   Engine    MapLibre GL JS 5.24.0 (BSD-3-Clause), lazy-loaded from cdnjs on the first open, unpkg as a fallback.
//   Imagery   Sentinel-2 cloudless 2016 by EOX IT Services GmbH, CC BY 4.0.
//   Terrain   Mapzen Terrain Tiles on AWS Open Data (terrarium encoding): SRTM, GMTED2010 and ETOPO1 for India.
//   Overlay   OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data, ODbL): roads, tracks, peaks, towns.
//
// ---------------------------------------------------------------------------------------------------------------
// INTEGRATION (main.js). Nothing here reads main.js internals; main.js pushes state in.
//
//   1. index.html, in <head> after css/sanctum.css:
//        <link rel="stylesheet" href="css/map3d.css">
//      (MapLibre's own stylesheet is injected on the first open, so nothing else is needed.)
//
//   2. main.js, with the other imports:
//        import { MapView } from "./map3d.js";
//
//   3. Once, after the DOM is ready (e.g. in init()):
//        const mapView = new MapView({
//        	opener: $("map-wrap"),          // the minimap panel: click / tap / Enter opens the 3D map
//        	hotkey: "g",                    // G toggles the map (M stays the sound toggle); null to disable
//        	onOpen: () => { app.mapOpen = true; },   // stop calling renderer.render() while true
//        	onClose: () => { app.mapOpen = false; },
//        });
//        app.mapView = mapView;
//      Optional constructor args: container (default document.body), exaggeration (default 1.4),
//      routeLegs (array of [[lon, lat], ...] per leg, default ROUTE[i].pts from geo.js), stations
//      (array of [lon, lat, hindi, english], default the list in roads.js buildStations), pixelRatioCap (default 2).
//
//   4. In the render loop:
//        if (!mapView.isOpen) renderer.render(scene, camera);
//      Keep updating the simulation if you like; the map only needs setProgress.
//
//   5. Every frame (or whenever the traveller moves; calls are throttled internally, so every frame is fine):
//        mapView.setProgressWorld({ x: travPos.x, z: travPos.z, dx: p.dx, dz: p.dz, mode: app.mode, leg: app.leg, doneFraction });
//      or, if you already have geographic values:
//        mapView.setProgress({ lon, lat, heading, mode, leg, doneFraction, label });
//      - lon, lat     traveller position in degrees.
//      - heading      compass degrees, 0 = north, 90 = east. headingFromWorld(dx, dz) converts a world direction.
//      - mode         "walk" | "bike" | "train" | "jeep" | "car" | "darshan" (anything else shows as "On the way").
//      - leg          0..N-1, the chapter index (ROUTE[leg] ends at SHRINES[leg]). N or more means the yatra is complete.
//      - doneFraction 0..1 of the current leg. Only used when lon/lat are missing; otherwise the position is snapped
//                     onto the leg so the done line always ends exactly at the traveller.
//      - label        optional text for the mode pill, e.g. the HUD's "By jeep up the Mandakini to Gaurikund".
//      - state        optional "intro" hides the traveller marker.
//
//   6. Other API:
//        mapView.open(shrineIndex?)  returns a Promise; resolves once the map is ready (or failed gracefully).
//                                    With an index 0..3 it flies to that shrine after opening.
//        mapView.close()
//        mapView.toggle()
//        mapView.isOpen              boolean
//        mapView.flyToShrine(i)      cinematic 3D fly-to (also keys 1 to the number of shrines while the map is open; 0 = all India)
//        mapView.setFollow(bool)     camera follows the traveller; any drag releases it (also key F)
//        mapView.set3D(bool)         3D terrain and tilt on or off (also key D)
//        mapView.setRoute(legs)      replace the drawn route, e.g. with the in-game road polyline per chapter
//        mapView.destroy()
//      Helpers exported alongside: worldToLonLat(x, z) -> [lon, lat], headingFromWorld(dx, dz) -> degrees.
//
//   Keys while the map is open are handled inside the overlay and do not reach main.js's window listener, as long as
//   focus is inside the overlay (it is focused on open). To be safe, start main.js's keydown handler with
//        if (app.mapView && app.mapView.isOpen) return;
//   Esc or the close button dismisses the map. If MapLibre, WebGL or the tile servers fail, the overlay says so and
//   the 2D minimap keeps working untouched.
// ---------------------------------------------------------------------------------------------------------------

import { KAILASH, ROUTE, SHRINES as DRAWN, CITIES, toGeo } from "./geo.js";
import { trueGeo } from "./kailash-geo.js";

// The satellite map shows the real ground: on the Kailash journey the parikrama, drawn larger than life and north
// of its place on the stylised map, is put back round the real mountain.
const real = (p) => (KAILASH ? trueGeo(p) : p);
const SHRINES = DRAWN.map((s) => (KAILASH ? Object.assign({}, s, { lon: real([s.lon, s.lat])[0], lat: real([s.lon, s.lat])[1] }) : s));

const ML_VERSION = "5.24.0";
const ML_SOURCES = [
	{ js: `https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${ML_VERSION}/maplibre-gl.js`, css: `https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${ML_VERSION}/maplibre-gl.css` },
	{ js: `https://unpkg.com/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.js`, css: `https://unpkg.com/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.css` },
];

const IMAGERY_URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const OVERLAY_URL = "https://tiles.openfreemap.org/planet";
const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
// MapLibre cannot drape terrain on the globe, so terrain starts only once the projection is fully Mercator.
const GLOBE_UNTIL = 6;
const TERRAIN_FROM = 6.15;

export const ATTRIBUTION = {
	imagery: "<a href=\"https://s2maps.eu\" target=\"_blank\" rel=\"noopener\">Sentinel-2 cloudless – https://s2maps.eu</a> by <a href=\"https://eox.at\" target=\"_blank\" rel=\"noopener\">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016), <a href=\"https://creativecommons.org/licenses/by/4.0/\" target=\"_blank\" rel=\"noopener\">CC BY 4.0</a>",
	terrain: "Terrain: <a href=\"https://github.com/tilezen/joerd/blob/master/docs/attribution.md\" target=\"_blank\" rel=\"noopener\">Mapzen Terrain Tiles</a> via <a href=\"https://registry.opendata.aws/terrain-tiles/\" target=\"_blank\" rel=\"noopener\">AWS Open Data</a>: SRTM (NASA), GMTED2010 (USGS), ETOPO1 (NOAA)",
	// the OpenFreeMap / OpenMapTiles / OpenStreetMap line comes from the overlay's own TileJSON
};

// The station list from roads.js buildStations (kept in step by hand; pass `stations` to override).
const STATIONS = [
	[74.48, 19.78, "साईनगर शिर्डी", "SAINAGAR SHIRDI"], [74.43, 20.25, "मनमाड जंक्शन", "MANMAD JN"], [77.3, 19.15, "हजूर साहिब नांदेड़", "H.S. NANDED"],
	[78.49, 17.39, "सिकंदराबाद जंक्शन", "SECUNDERABAD JN"], [77.37, 15.17, "गुंतकल जंक्शन", "GUNTAKAL JN"], [78.82, 14.47, "कडपा", "KADAPA"],
	[79.42, 13.63, "तिरुपति", "TIRUPATI"], [79.09, 21.15, "नागपुर", "NAGPUR"], [78.57, 25.45, "झाँसी जंक्शन", "JHANSI JN"],
	[77.21, 28.61, "नई दिल्ली", "NEW DELHI"], [78.16, 29.95, "हरिद्वार जंक्शन", "HARIDWAR JN"],
];

// Cinematic views. center is where the camera looks; bearing is the direction it faces.
const VIEWS = {
	india: { center: [80.2, 21.6], zoom: 3.9, pitch: 30, bearing: 0 },
	// Bhimashankar: from above the Konkan, looking east up the Sahyadri escarpment to the temple on the crest.
	bhimashankar: { center: [73.535, 19.072], zoom: 12.4, pitch: 66, bearing: 75, exaggeration: 1.6, offset: 0.08, alt: 950 },
	// Tirumala: low over the Alipiri foothills, looking north-north-west up onto the seven hills of the Seshachalam.
	// Their relief is only about 700 m, so it is exaggerated more than the Himalaya.
	// Shirdi: low over the flat cane country south of the town, looking north to the Samadhi Mandir.
	shirdi: { center: [74.477, 19.766], zoom: 15, pitch: 62, bearing: 10, exaggeration: 1.2, offset: 0.04, alt: 504 },
	tirupati: { center: [79.352, 13.672], zoom: 13, pitch: 72, bearing: -20, exaggeration: 1.8, offset: 0.06, alt: 840 },
	// Kedarnath: from down the Mandakini valley, looking north to the temple under the Kedarnath peaks.
	kedarnath: { center: [79.067, 30.735], zoom: 12.1, pitch: 64, bearing: -14, exaggeration: 1.4, offset: 0.04, alt: 3583 },
	// Badrinath: from the Alaknanda gorge, looking north-west between the Nar and Narayan ranges towards Mana.
	badrinath: { center: [79.493, 30.746], zoom: 12.7, pitch: 70, bearing: -22, exaggeration: 1.4, offset: 0.1, alt: 3150 },
};

const MODE_LABEL = { walk: "On foot", bike: "By motorbike", train: "By train", jeep: "By jeep", car: "By taxi", darshan: "At darshan" };
const MODE_ICON = {
	walk: "<path d=\"M13 4.5a1.6 1.6 0 1 0 0-.01M10 21l2-6 2.5 2.5V21M8.5 12.5l1.5-4 3-.5 2.5 3.5 2.5 1M11.5 8.5L10 15\"/>",
	bike: "<circle cx=\"6\" cy=\"16.5\" r=\"3\"/><circle cx=\"18\" cy=\"16.5\" r=\"3\"/><path d=\"M6 16.5l4-7h5l3 7M10 9.5L8.5 6.5H6.5M15 9.5l1-3h2\"/>",
	train: "<rect x=\"6\" y=\"3.5\" width=\"12\" height=\"13\" rx=\"3\"/><path d=\"M6 11h12M9 20l1.5-3.5M15 20l-1.5-3.5\"/><circle cx=\"9.5\" cy=\"13.8\" r=\".6\"/><circle cx=\"14.5\" cy=\"13.8\" r=\".6\"/>",
	jeep: "<path d=\"M3.5 15.5V11l2-4h9l2.5 4h3.5v4.5z\"/><circle cx=\"7.5\" cy=\"16\" r=\"2\"/><circle cx=\"16.5\" cy=\"16\" r=\"2\"/><path d=\"M10 7v4\"/>",
	car: "<path d=\"M3.5 15.5v-3l2-4.5h13l2 4.5v3z\"/><circle cx=\"7.5\" cy=\"16\" r=\"2\"/><circle cx=\"16.5\" cy=\"16\" r=\"2\"/><path d=\"M5 12.5h14\"/>",
	darshan: "<path d=\"M12 3c1.6 2.2 2.4 3.6 2.4 5a2.4 2.4 0 0 1-4.8 0c0-1.4.8-2.8 2.4-5zM5 14h14M7 14c0 3 2.2 5 5 5s5-2 5-5\"/>",
};

const SVG = (inner, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${inner}</svg>`;
const ICONS = {
	close: SVG("<path d=\"M6 6l12 12M18 6L6 18\"/>"),
	follow: SVG("<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4\"/><circle cx=\"12\" cy=\"12\" r=\"7.5\"/>"),
	india: SVG("<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5S14.6 18.1 12 20.5M12 3.5C9.4 5.9 8.2 8.7 8.2 12s1.2 6.1 3.8 8.5\"/>"),
	shrine: SVG("<path d=\"M12 2.5l1.6 3h-3.2zM9 6.5h6l1.5 5h-9zM6.5 12.5h11v8h-11zM10.5 20.5v-4h3v4\"/>"),
};

export function worldToLonLat(x, z) {
	const g = toGeo(x, z);
	return real([g.lon, g.lat]);
}
// World direction (x east, z south) to compass degrees (0 north, 90 east).
export function headingFromWorld(dx, dz) {
	return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

let libPromise = null;
function loadLibrary() {
	if (window.maplibregl) return Promise.resolve(window.maplibregl);
	if (libPromise) return libPromise;
	const tryOne = (src) => new Promise((resolve, reject) => {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = src.css;
		link.dataset.map3d = "";
		document.head.appendChild(link);
		const s = document.createElement("script");
		s.src = src.js;
		s.async = true;
		s.crossOrigin = "anonymous";
		s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre did not initialise")));
		s.onerror = () => {
			link.remove();
			s.remove();
			reject(new Error("Could not download MapLibre from " + new URL(src.js).host));
		};
		document.head.appendChild(s);
	});
	libPromise = ML_SOURCES.reduce((p, src) => p.catch(() => tryOne(src)), Promise.reject(new Error("start")))
		.catch((e) => {
			libPromise = null;
			throw e;
		});
	return libPromise;
}

function webglAvailable() {
	try {
		const c = document.createElement("canvas");
		return !!(c.getContext("webgl2") || c.getContext("webgl"));
	} catch (e) {
		return false;
	}
}

// Equirectangular metres-ish projection for snapping, good enough at the scale of one leg.
function snapToLine(pts, lon, lat) {
	const k = Math.cos((lat * Math.PI) / 180);
	let best = { d: Infinity, i: 0, t: 0 };
	for (let i = 0; i < pts.length - 1; i++) {
		const ax = pts[i][0] * k, ay = pts[i][1], bx = pts[i + 1][0] * k, by = pts[i + 1][1];
		const px = lon * k, py = lat;
		const vx = bx - ax, vy = by - ay;
		const l2 = vx * vx + vy * vy || 1e-12;
		const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
		const d = Math.hypot(ax + vx * t - px, ay + vy * t - py);
		if (d < best.d) best = { d, i, t };
	}
	const a = pts[best.i], b = pts[best.i + 1] || a;
	return { index: best.i, point: [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t] };
}
function prefixByFraction(pts, f) {
	const seg = [];
	let total = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
		seg.push(l);
		total += l;
	}
	let want = Math.max(0, Math.min(1, f)) * total;
	const out = [pts[0]];
	for (let i = 0; i < seg.length; i++) {
		if (want >= seg[i]) {
			out.push(pts[i + 1]);
			want -= seg[i];
			continue;
		}
		const t = seg[i] ? want / seg[i] : 0;
		out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
		break;
	}
	return out;
}
const line = (coords, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
const point = (coords, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: coords } });
const fc = (features) => ({ type: "FeatureCollection", features });

export class MapView {
	constructor(opts = {}) {
		this.opts = opts;
		this.container = opts.container || document.body;
		this.onOpen = opts.onOpen || null;
		this.onClose = opts.onClose || null;
		this.exaggeration = opts.exaggeration || 1.4;
		this.legs = (opts.routeLegs || ROUTE.map((r) => r.pts)).map((pts) => pts.map((p) => real([p[0], p[1]])));
		this.stations = opts.stations || STATIONS;
		this.pixelRatioCap = opts.pixelRatioCap || 2;
		this.isOpen = false;
		this.map = null;
		this.ready = null;
		this.follow = false;
		this.is3D = true;
		this.progress = { lon: ROUTE[0].pts[0][0], lat: ROUTE[0].pts[0][1], heading: 0, mode: "walk", leg: 0, doneFraction: 0, label: "", state: "" };
		this.lastLine = 0;
		this.lastFollow = 0;
		this.imagery = { ok: 0, err: 0 };
		this.buildDom();
		this.bindOpener(opts.opener);
		this.hotkey = opts.hotkey === undefined ? "g" : opts.hotkey;
		this.onWindowKey = (e) => this.windowKey(e);
		addEventListener("keydown", this.onWindowKey);
	}

	// ---------- DOM ----------
	buildDom() {
		const el = document.createElement("div");
		el.className = "m3d";
		el.hidden = true;
		el.setAttribute("role", "dialog");
		el.setAttribute("aria-modal", "true");
		el.setAttribute("aria-label", "3D map of the yatra");
		const shrineChips = SHRINES.map((s, i) => `<button class="m3d-chip" data-shrine="${i}" title="Fly to ${s.name} (${i + 1})"><span class="m3d-deva" lang="hi">${s.deva}</span><span>${s.name}</span></button>`).join("");
		el.innerHTML = `
			<div class="m3d-map" tabindex="-1"></div>
			<header class="m3d-head m3d-panel">
				<div class="m3d-kicker">Satellite · 3D terrain</div>
				<div class="m3d-title">Yatra map</div>
				<div class="m3d-status" aria-live="polite"></div>
			</header>
			<button class="m3d-close m3d-panel" aria-label="Close the map (Esc)" title="Close (Esc)">${ICONS.close}</button>
			<div class="m3d-msg m3d-panel" hidden role="alert"><div class="m3d-msg-text"></div><button class="m3d-chip m3d-retry" hidden>Try again</button></div>
			<div class="m3d-loading" aria-hidden="true"><span></span></div>
			<nav class="m3d-bar" aria-label="Map views">
				<div class="m3d-chips">
					<button class="m3d-chip" data-view="india" title="All of India (0)">${ICONS.india}<span>India</span></button>
					${shrineChips}
				</div>
				<div class="m3d-toggles">
					<button class="m3d-chip m3d-follow" aria-pressed="false" title="Follow the traveller (F)">${ICONS.follow}<span>Follow</span></button>
					<button class="m3d-chip m3d-dim" aria-pressed="true" title="3D terrain and tilt (D)"><b class="m3d-dim-3">3D</b><b class="m3d-dim-2">2D</b></button>
				</div>
			</nav>`;
		this.container.appendChild(el);
		this.el = el;
		this.mapEl = el.querySelector(".m3d-map");
		this.statusEl = el.querySelector(".m3d-status");
		this.msgEl = el.querySelector(".m3d-msg");
		this.followBtn = el.querySelector(".m3d-follow");
		this.dimBtn = el.querySelector(".m3d-dim");
		el.querySelector(".m3d-close").addEventListener("click", () => this.close());
		el.querySelector(".m3d-retry").addEventListener("click", () => {
			this.hideMessage();
			this.ready = null;
			this.ensureMap();
		});
		el.querySelector("[data-view=india]").addEventListener("click", () => this.flyToIndia());
		el.querySelectorAll("[data-shrine]").forEach((b) => b.addEventListener("click", () => this.flyToShrine(+b.dataset.shrine)));
		this.followBtn.addEventListener("click", () => this.setFollow(!this.follow));
		this.dimBtn.addEventListener("click", () => this.set3D(!this.is3D));
		el.addEventListener("keydown", (e) => this.overlayKey(e));
	}
	bindOpener(opener) {
		if (!opener) return;
		this.opener = opener;
		opener.classList.add("m3d-opener");
		if (!opener.hasAttribute("tabindex")) opener.tabIndex = 0;
		opener.setAttribute("role", "button");
		opener.setAttribute("aria-label", "Open the 3D satellite map (G)");
		opener.title = "Open the 3D map (G)";
		this.onOpenerClick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.open();
		};
		this.onOpenerKey = (e) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			e.stopPropagation();
			this.open();
		};
		opener.addEventListener("click", this.onOpenerClick);
		opener.addEventListener("keydown", this.onOpenerKey);
	}
	windowKey(e) {
		if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
		const t = e.target;
		if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
		if (this.isOpen) {
			// focus drifted out of the overlay (e.g. to <body>): still handle the map's keys
			if (!this.el.contains(t)) this.overlayKey(e);
			return;
		}
		if (this.hotkey && e.key.toLowerCase() === this.hotkey) {
			e.preventDefault();
			this.open();
		}
	}
	overlayKey(e) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const k = e.key;
		let handled = true;
		if (k === "Escape" || (this.hotkey && k.toLowerCase() === this.hotkey)) this.close();
		else if (k >= "1" && k <= String(Math.min(9, SHRINES.length)) && k.length === 1) this.flyToShrine(+k - 1);
		else if (k === "0") this.flyToIndia();
		else if (k === "f" || k === "F") this.setFollow(!this.follow);
		else if (k === "d" || k === "D") this.set3D(!this.is3D);
		else handled = false;
		if (handled) e.preventDefault();
		// never let the game's window listener see keys pressed inside the map (Space, arrows, digits...)
		e.stopPropagation();
	}

	showMessage(text, retry = false) {
		this.msgEl.hidden = false;
		this.msgEl.querySelector(".m3d-msg-text").textContent = text;
		this.msgEl.querySelector(".m3d-retry").hidden = !retry;
	}
	hideMessage() {
		this.msgEl.hidden = true;
	}

	// ---------- open / close ----------
	open(shrine) {
		if (!this.isOpen) {
			this.isOpen = true;
			this.lastFocus = document.activeElement;
			this.el.hidden = false;
			// let the display:none -> block flip land before the transition class
			requestAnimationFrame(() => this.el.classList.add("m3d-in"));
			document.documentElement.classList.add("m3d-open");
			if (this.onOpen) this.onOpen();
		}
		const p = this.ensureMap().then((ok) => {
			if (!ok || !this.isOpen) return ok;
			this.map.resize();
			this.map.getCanvas().focus({ preventScroll: true });
			if (typeof shrine === "number") this.flyToShrine(shrine);
			return ok;
		});
		if (!this.map) this.el.querySelector(".m3d-close").focus({ preventScroll: true });
		return p;
	}
	close() {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.el.classList.remove("m3d-in");
		document.documentElement.classList.remove("m3d-open");
		clearTimeout(this.hideTimer);
		this.hideTimer = setTimeout(() => {
			if (!this.isOpen) this.el.hidden = true;
		}, 260);
		if (this.map) this.map.stop();
		if (this.lastFocus && this.lastFocus.focus && document.contains(this.lastFocus)) this.lastFocus.focus({ preventScroll: true });
		if (this.onClose) this.onClose();
	}
	toggle() {
		return this.isOpen ? this.close() : this.open();
	}
	destroy() {
		removeEventListener("keydown", this.onWindowKey);
		if (this.opener) {
			this.opener.removeEventListener("click", this.onOpenerClick);
			this.opener.removeEventListener("keydown", this.onOpenerKey);
			this.opener.classList.remove("m3d-opener");
		}
		if (this.map) this.map.remove();
		this.el.remove();
	}

	// ---------- map ----------
	ensureMap() {
		if (this.ready) return this.ready;
		this.el.classList.add("m3d-busy");
		this.ready = (async () => {
			if (!webglAvailable()) {
				this.showMessage("This device can't show the 3D map (WebGL is unavailable). The minimap still shows your progress.");
				return false;
			}
			let lib;
			try {
				lib = await loadLibrary();
			} catch (e) {
				console.warn("[map3d]", e.message);
				this.showMessage("The 3D map couldn't be downloaded. Check your connection; the minimap still shows your progress.", true);
				return false;
			}
			try {
				await this.createMap(lib);
				return true;
			} catch (e) {
				console.warn("[map3d]", e);
				if (this.map) this.map.remove();
				this.map = null;
				this.showMessage("The 3D map couldn't start on this device. The minimap still shows your progress.", true);
				return false;
			}
		})().then((ok) => {
			this.el.classList.remove("m3d-busy");
			if (!ok) this.ready = null; // allow a retry
			return ok;
		});
		return this.ready;
	}

	createMap(lib) {
		const start = VIEWS.india;
		const map = new lib.Map({
			container: this.mapEl,
			style: this.style(),
			center: start.center,
			zoom: start.zoom,
			pitch: start.pitch,
			bearing: start.bearing,
			minZoom: 3,
			maxZoom: 18,
			maxPitch: 72,
			pixelRatio: Math.min(devicePixelRatio || 1, this.pixelRatioCap),
			attributionControl: false,
			maxTileCacheSize: 400,
			fadeDuration: 200,
			cooperativeGestures: false,
			canvasContextAttributes: { antialias: true },
		});
		this.map = map;
		this.lib = lib;
		map.addControl(new lib.AttributionControl({ compact: true, customAttribution: [ATTRIBUTION.imagery, ATTRIBUTION.terrain] }), "bottom-right");
		map.addControl(new lib.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), "top-right");
		map.addControl(new lib.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
		map.keyboard.enable();
		map.touchZoomRotate.enableRotation();
		map.touchPitch.enable();

		// tile health: errors are kept out of the console and summarised in one message instead
		map.on("error", (e) => {
			const id = e.sourceId || (e.source && e.source.id) || "";
			if (id === "s2") this.imagery.err++;
			else if (id === "dem" || id === "hs") this.demErr = (this.demErr || 0) + 1;
			else if (id === "ofm") this.ofmErr = (this.ofmErr || 0) + 1;
			else console.warn("[map3d]", e.error ? e.error.message : e);
			this.checkHealth();
		});
		map.on("sourcedata", (e) => {
			if (e.sourceId === "s2" && e.tile) this.imagery.ok++;
		});
		map.on("dragstart", () => this.setFollow(false, true));
		map.on("move", () => this.queueCull());
		map.on("zoom", () => {
			this.zoomClasses();
			this.updateTerrain();
		});
		map.on("webglcontextlost", () => this.showMessage("The map lost its graphics context. Close and reopen it to continue."));

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("map load timed out")), 30000);
			map.once("load", () => {
				clearTimeout(timer);
				// on phones the attribution starts folded behind its (i) button
				if ((this.mapEl.clientWidth || innerWidth) < 720) {
					const at = this.mapEl.querySelector(".maplibregl-ctrl-attrib");
					if (at) at.classList.remove("maplibregl-compact-show");
				}
				this.addMarkers();
				this.drawRoute(true);
				this.zoomClasses();
				this.updateTerrain();
				this.applyProgress(true);
				this.cull();
				setTimeout(() => this.checkHealth(true), 9000);
				resolve();
			});
		});
	}

	checkHealth(timeout = false) {
		if (!this.map) return;
		if (this.imagery.err > 4 && this.imagery.ok === 0) {
			this.showMessage("Satellite imagery isn't loading right now, so the terrain is shown without it. The minimap still shows your progress.");
		} else if (timeout && this.imagery.ok === 0) {
			this.showMessage("Satellite imagery is slow to arrive. It will fill in as it loads.");
		} else if (this.imagery.ok > 0 && !this.msgEl.hidden && this.imagery.err <= 4) {
			this.hideMessage();
		}
		if (this.demErr > 6 && this.is3D && !this.demWarned) {
			this.demWarned = true;
			console.warn("[map3d] terrain tiles failing; continuing with what has loaded");
		}
	}

	style() {
		const text = ["Noto Sans Regular"];
		const latin = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
		const legsFc = fc(this.legs.map((pts, i) => line(pts, { leg: i })));
		const shrineSites = fc(SHRINES.map((s, i) => point([s.lon, s.lat], { i })));
		const cities = fc(CITIES.filter((c) => !this.stations.some((s) => Math.hypot(s[0] - c.lon, s[1] - c.lat) < 0.05)).map((c) => point([c.lon, c.lat], { name: c.name, size: c.size })));
		return {
			version: 8,
			glyphs: GLYPHS_URL,
			// a globe for the all-India view, flat Mercator from zoom 6 where the 3D terrain takes over
			projection: { type: ["interpolate", ["linear"], ["zoom"], 4.6, "vertical-perspective", GLOBE_UNTIL, "mercator"] },
			sources: {
				s2: { type: "raster", tiles: [IMAGERY_URL], tileSize: 256, minzoom: 0, maxzoom: 14, attribution: "" },
				dem: { type: "raster-dem", tiles: [TERRAIN_URL], encoding: "terrarium", tileSize: 256, maxzoom: 13 },
				hs: { type: "raster-dem", tiles: [TERRAIN_URL], encoding: "terrarium", tileSize: 256, maxzoom: 12 },
				ofm: { type: "vector", url: OVERLAY_URL },
				legs: { type: "geojson", data: legsFc },
				done: { type: "geojson", data: fc([]) },
				sites: { type: "geojson", data: shrineSites },
				cities: { type: "geojson", data: cities },
			},
			sky: {
				"sky-color": "#5f93d0",
				"horizon-color": "#d6e2ec",
				"fog-color": "#c4d3e0",
				"sky-horizon-blend": 0.55,
				"horizon-fog-blend": 0.75,
				"fog-ground-blend": 0.82,
				"atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
			},
			layers: [
				{ id: "bg", type: "background", paint: { "background-color": "#0a1430" } },
				{ id: "s2", type: "raster", source: "s2", paint: { "raster-saturation": 0.12, "raster-contrast": 0.08, "raster-brightness-max": 0.97, "raster-fade-duration": 250 } },
				{ id: "hillshade", type: "hillshade", source: "hs", paint: { "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 9, 0.3, 14, 0.18], "hillshade-shadow-color": "rgba(20,14,6,0.6)", "hillshade-highlight-color": "rgba(255,246,222,0.22)", "hillshade-accent-color": "rgba(30,20,10,0.25)", "hillshade-illumination-anchor": "map", "hillshade-illumination-direction": 315 } },
				// --- OpenStreetMap overlay (OpenFreeMap) ---
				{ id: "osm-rail", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 8, filter: ["==", ["get", "class"], "rail"],
					paint: { "line-color": "rgba(255,240,215,0.5)", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.6], "line-dasharray": [3, 2] } },
				{ id: "osm-path", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 12, filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
					paint: { "line-color": "rgba(255,226,170,0.75)", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 16, 2], "line-dasharray": [2, 1.4] } },
				{ id: "osm-minor", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 11, filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary"]]],
					layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "rgba(255,248,232,0.42)", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 3] } },
				{ id: "osm-major", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 5, filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
					layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "rgba(255,244,222,0.5)", "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 9, 0.7], "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 10, 1.4, 16, 5] } },
				{ id: "osm-buildings", type: "fill-extrusion", source: "ofm", "source-layer": "building", minzoom: 15,
					paint: { "fill-extrusion-color": "#e9dcc4", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.75 } },
				// --- the yatra ---
				// widths peak around zoom 9; close in, terrain perspective magnifies lines and the waypoint route is only
				// approximate, so it thins and fades to let the real roads and footpaths in the imagery show through
				{ id: "route-todo-glow", type: "line", source: "legs", layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "#0a0602", "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 12, 0.3, 14, 0.12], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 5, 9, 7, 13, 4], "line-blur": 2 } },
				{ id: "route-todo", type: "line", source: "legs", layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "#fbe7bd", "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.95, 10, 0.85, 13, 0.4], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 9, 2.6, 13, 1.6], "line-dasharray": [2, 2] } },
				{ id: "route-done-glow", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "#ff8a1e", "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 10, 0.5, 13, 0.18], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 14, 13, 8], "line-blur": ["interpolate", ["linear"], ["zoom"], 3, 6, 13, 5] } },
				{ id: "route-done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "#ff9a33", "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 0.55], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 3, 9, 4, 13, 2.4] } },
				{ id: "route-done-core", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
					paint: { "line-color": "#ffe2b0", "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 0.45], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 9, 1.4, 13, 0.8] } },
				// --- labels ---
				{ id: "osm-peaks", type: "symbol", source: "ofm", "source-layer": "mountain_peak", minzoom: 10.5, filter: ["all", ["has", "name"], ["has", "ele"]],
					layout: { "text-field": ["concat", latin, "\n", ["to-string", ["get", "ele"]], " m"], "text-font": text, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.5], "text-max-width": 8 },
					paint: { "text-color": "#ffffff", "text-halo-color": "rgba(10,20,48,0.85)", "text-halo-width": 1.4 } },
				{ id: "osm-villages", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 12.6, filter: ["==", ["get", "class"], "village"],
					layout: { "text-field": latin, "text-font": text, "text-size": 11.5, "text-max-width": 8 },
					paint: { "text-color": "#fff6e4", "text-halo-color": "rgba(10,20,48,0.85)", "text-halo-width": 1.3 } },
				{ id: "osm-places", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 8, filter: ["in", ["get", "class"], ["literal", ["town", "city"]]],
					layout: { "text-field": latin, "text-font": text, "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10.5, 14, 13], "text-max-width": 8, "symbol-sort-key": ["coalesce", ["get", "rank"], 99] },
					paint: { "text-color": "#fff6e4", "text-halo-color": "rgba(10,20,48,0.85)", "text-halo-width": 1.3 } },
				{ id: "cities-dot", type: "circle", source: "cities", maxzoom: 11,
					paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["+", 1.5, ["*", 0.6, ["get", "size"]]], 9, ["+", 3, ["get", "size"]]], "circle-color": "#fff1c9", "circle-stroke-color": "#0a1430", "circle-stroke-width": 1.2, "circle-pitch-alignment": "map" } },
				{ id: "cities-label", type: "symbol", source: "cities", maxzoom: 11,
					layout: { "text-field": ["get", "name"], "text-font": text, "text-size": ["interpolate", ["linear"], ["zoom"], 3, ["+", 9, ["get", "size"]], 9, ["+", 12, ["get", "size"]]], "text-anchor": "left", "text-offset": [0.7, 0], "text-allow-overlap": false, "symbol-sort-key": ["-", 10, ["get", "size"]] },
					paint: { "text-color": "#fff6e4", "text-halo-color": "rgba(10,20,48,0.9)", "text-halo-width": 1.5, "text-opacity": ["interpolate", ["linear"], ["zoom"], 3, ["case", [">=", ["get", "size"], 3], 1, 0], 4.6, ["case", [">=", ["get", "size"], 2], 1, 0], 5.5, 1] } },
			],
		};
	}

	addMarkers() {
		const lib = this.lib;
		this.shrineMarkers = SHRINES.map((s, i) => {
			const el = document.createElement("button");
			el.className = "m3d-shrine";
			el.dataset.key = s.key;
			el.type = "button";
			el.title = `Fly to ${s.name}`;
			el.innerHTML = `<span class="m3d-shrine-label"><span class="m3d-deva" lang="hi">${s.deva}</span><span class="m3d-shrine-en">${s.name}</span></span><span class="m3d-shrine-pin">${ICONS.shrine}</span>`;
			el.addEventListener("click", (e) => {
				e.stopPropagation();
				this.flyToShrine(i);
			});
			return new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lon, s.lat]).addTo(this.map);
		});
		this.stationMarkers = this.stations.map(([lon, lat, hi, en]) => {
			const el = document.createElement("div");
			el.className = "m3d-station";
			el.innerHTML = `<span class="m3d-board"><span class="m3d-deva" lang="hi">${hi}</span><span>${en}</span></span><i></i>`;
			return new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(this.map);
		});
		const arrow = document.createElement("div");
		arrow.className = "m3d-trav";
		arrow.innerHTML = "<span class=\"m3d-trav-pulse\"></span><span class=\"m3d-trav-cone\"></span><span class=\"m3d-trav-dot\"></span>";
		this.travArrow = new lib.Marker({ element: arrow, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([this.progress.lon, this.progress.lat]).addTo(this.map);
		const pill = document.createElement("div");
		pill.className = "m3d-pill";
		this.travPill = new lib.Marker({ element: pill, anchor: "bottom", offset: [0, -16] }).setLngLat([this.progress.lon, this.progress.lat]).addTo(this.map);
		this.pillEl = pill;
		this.travEl = arrow;
	}

	// Markers are DOM elements, so in a steep pitched view the far ones would pile up on the horizon. Hide any that
	// are well beyond what the camera is looking at.
	queueCull() {
		if (this.cullQueued) return;
		this.cullQueued = true;
		requestAnimationFrame(() => {
			this.cullQueued = false;
			this.cull();
		});
	}
	cull() {
		const map = this.map;
		if (!map || !this.shrineMarkers) return;
		const z = map.getZoom(), pitch = map.getPitch();
		const c = map.getCenter();
		const maxKm = (120000 / Math.pow(2, z)) * (1 + pitch / 25);
		const k = Math.cos((c.lat * Math.PI) / 180);
		const far = (ll) => Math.hypot((ll.lng - c.lng) * k, ll.lat - c.lat) * 111.2 > maxKm;
		for (const m of this.shrineMarkers.concat(this.stationMarkers, [this.travArrow, this.travPill])) {
			m.getElement().classList.toggle("m3d-far", far(m.getLngLat()));
		}
	}
	zoomClasses() {
		if (!this.map) return;
		const z = this.map.getZoom();
		this.el.classList.toggle("m3d-z-far", z < 5.2);
		this.el.classList.toggle("m3d-z-fan", z < 7.4);
		this.el.classList.toggle("m3d-z-stations", z >= 6.4);
		this.el.classList.toggle("m3d-z-near", z >= 10.5);
	}

	// ---------- progress ----------
	setProgressWorld({ x, z, dx, dz, heading, ...rest } = {}) {
		const p = { ...rest };
		if (Number.isFinite(x) && Number.isFinite(z)) [p.lon, p.lat] = worldToLonLat(x, z);
		if (Number.isFinite(heading)) p.heading = heading;
		else if (Number.isFinite(dx) && Number.isFinite(dz) && (dx || dz)) p.heading = headingFromWorld(dx, dz);
		this.setProgress(p);
	}
	setProgress(p = {}) {
		const q = this.progress;
		const leg = Number.isFinite(p.leg) ? Math.max(0, Math.floor(p.leg)) : q.leg;
		const legChanged = leg !== q.leg;
		Object.assign(q, p, { leg });
		if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) {
			// no position: derive it from the fraction along the leg
			if (Number.isFinite(p.doneFraction) && this.legs[Math.min(leg, this.legs.length - 1)]) {
				const pre = prefixByFraction(this.legs[Math.min(leg, this.legs.length - 1)], leg >= this.legs.length ? 1 : p.doneFraction);
				[q.lon, q.lat] = pre[pre.length - 1];
				q.fromFraction = true;
			}
		} else q.fromFraction = false;
		if (this.isOpen && this.map) this.applyProgress(legChanged);
	}
	applyProgress(force = false) {
		if (!this.map || !this.travArrow) return;
		const q = this.progress;
		const now = performance.now();
		const ll = [q.lon, q.lat];
		if (Number.isFinite(q.lon) && Number.isFinite(q.lat)) {
			this.travArrow.setLngLat(ll);
			this.travPill.setLngLat(ll);
		}
		this.travArrow.setRotation(q.heading || 0);
		const hidden = q.state === "intro";
		this.travEl.classList.toggle("m3d-hide", hidden);
		this.pillEl.classList.toggle("m3d-hide", hidden);
		const mode = MODE_ICON[q.mode] ? q.mode : "walk";
		const label = q.label || MODE_LABEL[q.mode] || "On the way";
		if (this.pillKey !== mode + label) {
			this.pillKey = mode + label;
			this.pillEl.innerHTML = `${SVG(MODE_ICON[mode])}<span></span>`;
			this.pillEl.querySelector("span").textContent = label;
		}
		const done = q.leg >= this.legs.length;
		const target = SHRINES[Math.min(q.leg, SHRINES.length - 1)];
		this.statusEl.textContent = done ? `Yatra complete · ${SHRINES.length} darshans` : `Leg ${q.leg + 1} of ${this.legs.length} · ${label} · to ${target ? target.name : ""}`;
		this.shrineMarkers.forEach((m, i) => m.getElement().classList.toggle("m3d-visited", i < q.leg || (i === q.leg && q.mode === "darshan")));
		if (force || now - this.lastLine > 250) {
			this.lastLine = now;
			this.drawRoute();
		}
		if (this.follow && Number.isFinite(q.lon) && now - this.lastFollow > 450 && !this.map.isMoving()) {
			this.lastFollow = now;
			this.map.easeTo({ center: ll, duration: 450, easing: (t) => t, essential: true });
		}
	}
	setRoute(legs) {
		this.legs = legs.map((pts) => pts.map((p) => [p[0], p[1]]));
		this.drawRoute(true);
	}
	drawRoute(all = false) {
		if (!this.map) return;
		const q = this.progress;
		if (all) {
			const src = this.map.getSource("legs");
			if (src) src.setData(fc(this.legs.map((pts, i) => line(pts, { leg: i }))));
		}
		const feats = [];
		const n = this.legs.length;
		for (let i = 0; i < Math.min(q.leg, n); i++) feats.push(line(this.legs[i], { leg: i }));
		if (q.leg < n && q.state !== "intro") {
			const pts = this.legs[q.leg];
			let pre;
			if (!q.fromFraction && Number.isFinite(q.lon) && Number.isFinite(q.lat)) {
				const s = snapToLine(pts, q.lon, q.lat);
				pre = pts.slice(0, s.index + 1).concat([s.point]);
			} else pre = prefixByFraction(pts, q.doneFraction || 0);
			if (pre.length > 1) feats.push(line(pre, { leg: q.leg }));
		}
		const src = this.map.getSource("done");
		if (src) src.setData(fc(feats));
	}

	// ---------- camera ----------
	setFollow(on, fromUser = false) {
		if (this.follow === on) return;
		this.follow = on;
		this.followBtn.setAttribute("aria-pressed", String(on));
		this.followBtn.classList.toggle("m3d-on", on);
		if (on && this.map) {
			const q = this.progress;
			this.map.flyTo({ center: [q.lon, q.lat], zoom: Math.max(this.map.getZoom(), 10.5), pitch: this.is3D ? 62 : 0, duration: 1800, essential: true });
			this.lastFollow = performance.now() + 1800;
		}
		if (!on && fromUser) this.lastFollow = 0;
	}
	set3D(on) {
		this.is3D = on;
		this.dimBtn.setAttribute("aria-pressed", String(on));
		this.dimBtn.classList.toggle("m3d-flat", !on);
		const map = this.map;
		if (!map) return;
		if (on) {
			map.setMaxPitch(72);
			map.dragRotate.enable();
			map.touchPitch.enable();
			map.touchZoomRotate.enableRotation();
			this.updateTerrain();
			map.easeTo({ pitch: Math.max(map.getPitch(), map.getZoom() < TERRAIN_FROM ? 30 : 55), duration: 900 });
		} else {
			map.dragRotate.disable();
			map.touchPitch.disable();
			map.touchZoomRotate.disableRotation();
			map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
			map.once("moveend", () => {
				if (this.is3D) return;
				this.updateTerrain();
				map.setMaxPitch(0);
			});
		}
	}
	updateTerrain() {
		const map = this.map;
		if (!map) return;
		const want = this.is3D && map.getZoom() >= TERRAIN_FROM;
		const ex = this.currentExaggeration || this.exaggeration;
		const cur = map.getTerrain();
		if (want && (!cur || cur.exaggeration !== ex)) map.setTerrain({ source: "dem", exaggeration: ex });
		else if (!want && cur) map.setTerrain(null);
	}
	setExaggeration(x) {
		this.currentExaggeration = x;
		this.updateTerrain();
	}
	flyToIndia() {
		if (!this.map) return;
		this.setFollow(false);
		const v = VIEWS.india;
		this.setExaggeration(this.exaggeration);
		this.map.flyTo({ center: v.center, zoom: this.fitIndiaZoom(), pitch: this.is3D ? v.pitch : 0, bearing: 0, elevation: 0, duration: 2600, essential: true });
	}
	fitIndiaZoom() {
		// all of India (68E..97E, 6N..36N) in the current viewport
		const w = this.mapEl.clientWidth || innerWidth, h = this.mapEl.clientHeight || innerHeight;
		const zx = Math.log2((w / 256) * (360 / 31));
		const zy = Math.log2((h / 256) * (360 / 36));
		return Math.max(3, Math.min(5, Math.min(zx, zy) - 0.1));
	}
	flyToShrine(i) {
		const s = SHRINES[i];
		if (!s) return;
		if (!this.map) {
			if (this.isOpen) this.ensureMap().then((ok) => ok && this.flyToShrine(i));
			return;
		}
		this.setFollow(false);
		const v = VIEWS[s.key] || { center: [s.lon, s.lat], zoom: 12.5, pitch: 65, bearing: 0 };
		if (v.exaggeration) this.setExaggeration(v.exaggeration);
		const h = this.mapEl.clientHeight || innerHeight;
		const small = (this.mapEl.clientWidth || innerWidth) < 600;
		this.map.flyTo({
			center: v.center,
			zoom: v.zoom - (small ? 0.6 : 0),
			pitch: this.is3D ? v.pitch : 0,
			bearing: this.is3D ? v.bearing : 0,
			offset: [0, Math.round(h * (v.offset || 0))],
			// the camera orbits the shrine's ground, not sea level (terrain under the destination isn't loaded yet)
			elevation: this.is3D && v.alt ? v.alt * (v.exaggeration || this.exaggeration) : 0,
			duration: 6500,
			curve: 1.6,
			essential: true,
		});
	}
}
