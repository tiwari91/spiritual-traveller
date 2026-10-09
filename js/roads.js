// The roads and railways under the traveller, built to life scale (0.28 world units per metre, as the
// figures are): national highways with painted lines, ghat roads with crash barriers and kerbs, narrow
// Garhwal hill roads with parapets, the stone trek to Kedarnath, and broad-gauge electrified track with
// stations and bridges. The road follows the route; the railway runs alongside it on the long legs.
import * as THREE from "three";
import { Batch, T, VCOL, beam, place } from "./batch.js";
import { GAURIKUND, KAILASH, RIVERS, ROUTE, SHRINES, toGeo, toWorld } from "./geo.js";
import { LEH } from "./kailash-geo.js";
import { tibet } from "./kailash-world.js";
import { clamp, lerp, rand, segDist, smoothstep } from "./util.js";
import { parkedVehicle } from "./traffic.js";

export const M = 0.28; // world units per metre
const STEP = 0.35;
// Paved width and shoulder, in metres.
const KIND = {
	nh: { paved: 7.5, shoulder: 2.4, lift: 0.05 },
	ghat: { paved: 7, shoulder: 1.2, lift: 0.05 },
	hill: { paved: 5.5, shoulder: 1.2, lift: 0.05 },
	trek: { paved: 2.6, shoulder: 0.3, lift: 0.04 },
	// the parikrama path round Kailash and the way over the Lipulekh: a trodden track of grit and stones
	trail: { paved: 1.8, shoulder: 0.5, lift: 0.035 },
};
const RAIL_OFFSET = 3.9; // world units to the right of the road
const STATION_OFFSET = 6.5; // at a station, room for the platform, the building and its forecourt
const RAIL_BED = 5.6; // metres
// Broad gauge, 1,676 mm. Heights are above the formation (the line's own level, in world units): the rail
// head, a high-level platform 840 mm above the rail, the contact wire 5.5 m above it.
export const RAIL = {
	gauge: 1.676 * M,
	top: 0.12,
	platform: 0.12 + 0.84 * M,
	wire: 0.12 + 5.5 * M,
	edge: 1.75 * M, // platform edge from the track's centre
	platW: 1.3, // platform width
	platLen: 44, // platform length, room for a locomotive and five coaches
	bed: RAIL_BED * M,
};

// Which landscape a point is in.
export function region(lon, lat) {
	if (KAILASH) {
		// the Tibetan plateau; the Byans valley up from Gunji; Kumaon (hill country like Garhwal's); the Terai
		if (lat > 30.05 && lon > 80.9 && tibet(lon, lat) > 0.15) return "tibet";
		// (from Leh: Ladakh and Ngari, the same high cold desert of chortens, flags and stone)
		if (LEH && lat > 31.0 && lon < 81.0) return "tibet";
		if (lat > 30.08 && lon > 80.75) return "byans";
		if (lat > 29.15 && lon > 79.95) return "garhwal";
		if (lat > 28.8 && lon > 79.75) return "doon";
		return "gangetic";
	}
	if (lat > 29.95 && lon > 78.25) return "garhwal";
	if (lat > 29.6) return "doon";
	// the Ahmednagar Deccan round Sangamner, Rahata and Shirdi: black soil, cane and onion, flat-roofed villages
	if (lon >= 74.1 && lon < 75.2 && lat > 18.9 && lat < 20.35) return "nagar";
	if (lat > 18.3 && lon < 74.3) return "sahyadri";
	if (lat > 25) return "gangetic";
	if (lat > 19.5) return "central";
	if (lat > 14.4) return "deccan";
	return "south";
}
function roadKind(lon, lat) {
	const r = region(lon, lat);
	if (r === "garhwal" || r === "byans") return "hill";
	if ((lat > 18.85 && lon < 74.0) || Math.hypot(lon - 79.38, lat - 13.66) < 0.09) return "ghat";
	return "nh";
}
const SOIL = { sahyadri: "#8a4a2c", deccan: "#9a7a52", nagar: "#8c7454", south: "#8e6a48", central: "#8c7656", gangetic: "#9b8a68", doon: "#7d7360", garhwal: "#7c776e", byans: "#7a7068", tibet: "#9a8a72" };

const pick = (R, a) => a[Math.floor(R() * a.length)];

// ---------- textures ----------
function canvasTex(w, h, draw, srgb = true) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}
function speckle(g, W, H, R, n, dark = 0.18, light = 0.08) {
	for (let i = 0; i < n; i++) {
		g.fillStyle = R() < 0.6 ? `rgba(0,0,0,${dark * R()})` : `rgba(255,255,255,${light * R()})`;
		g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
	}
}
// The cross-section of a road across u, one tile of its length down v.
const _roadTex = {};
function roadTexture(kind, reg) {
	const key = kind + reg;
	if (_roadTex[key]) return _roadTex[key];
	const k = KIND[kind];
	const total = k.paved + 2 * k.shoulder;
	const R = rand(key.length * 31 + 7);
	const t = canvasTex(256, 512, (g, W, H) => {
		const sh = (k.shoulder / total) * W;
		g.fillStyle = SOIL[reg];
		g.fillRect(0, 0, W, H);
		speckle(g, W, H, R, 6000, 0.25, 0.1);
		if (kind === "trail") {
			// grit and small stones, two worn lines where the feet go, larger stones kicked to the sides
			g.fillStyle = reg === "tibet" ? "#8e8070" : "#7e746a";
			g.fillRect(sh * 0.5, 0, W - sh, H);
			for (const f of [0.38, 0.62]) {
				const gr = g.createLinearGradient(W * (f - 0.09), 0, W * (f + 0.09), 0);
				gr.addColorStop(0, "rgba(0,0,0,0)");
				gr.addColorStop(0.5, "rgba(60,50,40,0.22)");
				gr.addColorStop(1, "rgba(0,0,0,0)");
				g.fillStyle = gr;
				g.fillRect(0, 0, W, H);
			}
			for (let i = 0; i < 700; i++) {
				const x = R() < 0.5 ? R() * sh * 1.4 : W - R() * sh * 1.4, y = R() * H, r = 2 + R() * 5, v = 90 + R() * 70;
				g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
				g.beginPath();
				g.ellipse(x, y, r, r * 0.7, R() * 3, 0, Math.PI * 2);
				g.fill();
			}
			speckle(g, W, H, R, 9000, 0.28, 0.12);
			return;
		}
		if (kind === "trek") {
			// stone flags
			g.fillStyle = "#77736c";
			g.fillRect(sh, 0, W - 2 * sh, H);
			for (let y = 0; y < H; y += 26) {
				let x = sh;
				while (x < W - sh) {
					const w = 22 + R() * 40;
					const v = 100 + R() * 40;
					g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
					g.fillRect(x + 1.5, y + 1.5, Math.min(w, W - sh - x) - 3, 23);
					x += w;
				}
			}
			speckle(g, W, H, R, 3000);
			return;
		}
		// asphalt, darker where the wheels run
		const base = kind === "hill" ? 74 : 62;
		g.fillStyle = `rgb(${base},${base},${base + 3})`;
		g.fillRect(sh, 0, W - 2 * sh, H);
		for (const f of [0.3, 0.7]) {
			const gr = g.createLinearGradient(sh + (W - 2 * sh) * (f - 0.1), 0, sh + (W - 2 * sh) * (f + 0.1), 0);
			gr.addColorStop(0, "rgba(0,0,0,0)");
			gr.addColorStop(0.5, "rgba(0,0,0,0.18)");
			gr.addColorStop(1, "rgba(0,0,0,0)");
			g.fillStyle = gr;
			g.fillRect(sh, 0, W - 2 * sh, H);
		}
		speckle(g, W, H, R, 9000, 0.2, 0.12);
		// patches and cracks
		for (let i = 0; i < (kind === "hill" ? 14 : 5); i++) {
			const v = base + (R() - 0.5) * 30;
			g.fillStyle = `rgba(${v},${v},${v},0.7)`;
			g.fillRect(sh + R() * (W - 2 * sh - 40), R() * H, 20 + R() * 50, 14 + R() * 40);
		}
		g.strokeStyle = "rgba(20,20,20,0.5)";
		g.lineWidth = 1;
		for (let i = 0; i < 10; i++) {
			g.beginPath();
			let x = sh + R() * (W - 2 * sh), y = R() * H;
			g.moveTo(x, y);
			for (let j = 0; j < 6; j++) g.lineTo((x += (R() - 0.5) * 16), (y += R() * 14));
			g.stroke();
		}
		// dust blown onto the edge of the tarmac
		for (const x0 of [sh, W - sh]) {
			const gr = g.createLinearGradient(x0 - 14, 0, x0 + 14, 0);
			gr.addColorStop(0, "rgba(0,0,0,0)");
			gr.addColorStop(0.5, SOIL[reg] + "88");
			gr.addColorStop(1, "rgba(0,0,0,0)");
			g.fillStyle = gr;
			g.fillRect(x0 - 14, 0, 28, H);
		}
		if (kind === "hill") return; // Garhwal roads are mostly unmarked
		const lw = Math.max(3, W * 0.012);
		g.fillStyle = "#e9e6dc";
		g.fillRect(sh + lw, 0, lw, H);
		g.fillRect(W - sh - 2 * lw, 0, lw, H);
		if (reg === "tibet") {
			// a Chinese national road: white edge lines, a dashed yellow centre line
			g.fillStyle = "#e0b22a";
			for (let y = 0; y < H; y += H / 3) g.fillRect(W / 2 - lw * 0.75, y, lw * 1.5, H / 6);
		} else if (kind === "ghat") {
			// no overtaking on the ghats: a solid yellow centre line
			g.fillStyle = "#e3b62a";
			g.fillRect(W / 2 - lw, 0, lw * 2, H);
		} else {
			g.fillStyle = "#ece9df";
			for (let y = 0; y < H; y += H / 3) g.fillRect(W / 2 - lw / 2, y, lw, H / 7.5);
		}
	});
	t.userData = { len: total * M * 2 }; // one tile covers twice the width in length
	return (_roadTex[key] = t);
}
let _ballast;
function ballastTexture() {
	if (_ballast) return _ballast;
	const R = rand(91);
	_ballast = canvasTex(256, 256, (g, W, H) => {
		g.fillStyle = "#6d675f";
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 9000; i++) {
			const v = 70 + R() * 70;
			g.fillStyle = `rgb(${v},${v - 5},${v - 12})`;
			g.fillRect(R() * W, R() * H, 2 + R() * 3, 2 + R() * 3);
		}
		// rust from the rails stains the middle
		g.fillStyle = "rgba(110,60,30,0.25)";
		g.fillRect(W * 0.22, 0, W * 0.56, H);
		// concrete sleepers, about 0.6 m apart
		for (let y = 0; y < H; y += H / 9) {
			g.fillStyle = "#9c9890";
			g.fillRect(W * 0.12, y, W * 0.76, H / 22);
			g.fillStyle = "rgba(0,0,0,0.25)";
			g.fillRect(W * 0.12, y + H / 22, W * 0.76, 2);
		}
		speckle(g, W, H, R, 2000);
	});
	_ballast.userData = { len: RAIL_BED * M };
	return _ballast;
}
// A yellow Indian Railways station board: Hindi above English.
function boardTexture(hi, en) {
	return canvasTex(512, 160, (g, W, H) => {
		g.fillStyle = "#f2c81e";
		g.fillRect(0, 0, W, H);
		g.strokeStyle = "#111";
		g.lineWidth = 8;
		g.strokeRect(4, 4, W - 8, H - 8);
		g.fillStyle = "#111";
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = `600 56px "Tiro Devanagari Hindi", "Noto Sans Devanagari", serif`;
		g.fillText(hi, W / 2, H * 0.34, W - 30);
		g.font = `700 50px Inter, Arial, sans-serif`;
		g.fillText(en, W / 2, H * 0.74, W - 30);
	});
}
// An Indian milestone: white with a coloured cap, the next town and the distance.
function milestoneTexture(name, km, cap) {
	return canvasTex(128, 192, (g, W, H) => {
		g.fillStyle = "#f4f2ea";
		g.fillRect(0, 0, W, H);
		g.fillStyle = cap;
		g.fillRect(0, 0, W, H * 0.4);
		g.fillStyle = "#111";
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = `700 ${name.length > 9 ? 17 : 22}px Inter, Arial, sans-serif`;
		g.fillText(name.toUpperCase(), W / 2, H * 0.24, W - 8);
		g.font = "700 50px Inter, Arial, sans-serif";
		g.fillText(String(km), W / 2, H * 0.62);
		g.font = "600 20px Inter, Arial, sans-serif";
		g.fillText("km", W / 2, H * 0.83);
	});
}

// ---------- rivers, for bridges ----------
function riverLines() {
	const out = [];
	for (const r of RIVERS) {
		const pts = [];
		for (let i = 0; i < r.pts.length - 1; i++) {
			const a = r.pts[i], b = r.pts[i + 1];
			const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08));
			for (let k = 0; k < n; k++) {
				const t = k / n;
				// the same meander world.js draws, with the same gaps where the Himalayan shrines draw their own river
				// (on the Kailash journey the rivers lie in the valleys cut for them, so they are drawn without the meander)
				const mq = KAILASH ? 0 : 0.03;
				const lon = lerp(a[0], b[0], t) + Math.sin(t * 9 + i) * mq, lat = lerp(a[1], b[1], t) + Math.cos(t * 7 + i) * mq;
				if (SHRINES.some((sh) => sh.weather !== "monsoon" && sh.lat > 25 && Math.hypot(lon - sh.lon, lat - sh.lat) < 0.12)) {
					if (pts.length > 1) out.push({ w: r.w * 0.9, pts: pts.splice(0) });
					else pts.length = 0;
					continue;
				}
				pts.push(toWorld(lon, lat));
			}
		}
		out.push({ w: r.w * 0.9, pts });
	}
	return out;
}

// ---------- paths ----------
// A path sampled along the route between s0 and s1, offset sideways (positive = right of travel).
function samplePath(route, world, s0, s1, offset, opts = {}) {
	const pts = [];
	const a = {}, b = {};
	for (let s = s0; s <= s1 + 1e-6; s += STEP) {
		// a wide look-around gives a direction that does not kink at the waypoints
		route.at(Math.max(0, s - 2.5), a);
		route.at(Math.min(route.length, s + 2.5), b);
		let dx = b.x - a.x, dz = b.z - a.z;
		const l = Math.hypot(dx, dz) || 1;
		dx /= l;
		dz /= l;
		const c = route.at(s, {});
		pts.push({ s, x: c.x - dz * offset, z: c.z + dx * offset, dx, dz });
	}
	// smooth the offset line so it does not loop on the inside of bends
	if (offset) {
		for (let pass = 0; pass < 4; pass++) {
			for (let i = 1; i < pts.length - 1; i++) {
				pts[i].x = (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4;
				pts[i].z = (pts[i - 1].z + pts[i].z * 2 + pts[i + 1].z) / 4;
			}
		}
	}
	// the road's own direction at each point (not the wide look-around), so on a hairpin the road
	// and the vehicles on it turn with the bend instead of cutting across it
	for (let i = 0; i < pts.length; i++) {
		const p = pts[Math.max(0, i - 2)], q = pts[Math.min(pts.length - 1, i + 2)];
		const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
		pts[i].dx = (q.x - p.x) / l;
		pts[i].dz = (q.z - p.z) / l;
	}
	for (const p of pts) {
		const g = toGeo(p.x, p.z);
		p.lon = g.lon;
		p.lat = g.lat;
		p.ground = world.height(p.x, p.z);
		p.kind = opts.kind || roadKind(g.lon, g.lat);
		p.region = region(g.lon, g.lat);
	}
	return pts;
}
// Raise a path over the rivers it actually crosses (not the ones it runs beside), ramping up to a deck.
function cross(ax, az, bx, bz, cx, cz, dx, dz) {
	const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
	if (Math.abs(d) < 1e-9) return -1;
	const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
	const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
	return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}
// lines: rivers ({ pts, w }) and, for the railway, roads ({ pts, w, over: true }) to be carried over
function bridges(pts, rivers, world, halfW, ramp = 1.6) {
	const spans = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const p = pts[i], q = pts[i + 1];
		for (const r of rivers) {
			for (let k = 0; k < r.pts.length - 1; k++) {
				const a = r.pts[k], b = r.pts[k + 1];
				if (Math.abs(a.x - p.x) > 4 || Math.abs(a.z - p.z) > 4) continue;
				const t = cross(p.x, p.z, q.x, q.z, a.x, a.z, b.x, b.z);
				if (t < 0) continue;
				// the span grows as the crossing gets more oblique
				const rd = Math.hypot(b.x - a.x, b.z - a.z) || 1, pd = Math.hypot(q.x - p.x, q.z - p.z) || 1;
				const sin = Math.abs(((b.x - a.x) * (q.z - p.z) - (b.z - a.z) * (q.x - p.x)) / (rd * pd));
				// over a road the deck clears a truck (about 6 m); over a river it sits just above the water
				const deck = r.over ? Math.max(world.height(a.x, a.z), world.height(p.x, p.z)) + 6 * M : world.height(a.x, a.z) + 0.25 + 0.55;
				// (in the Kailash journey's gorges a river drawn on the valley side never lifts a deck high over the road)
				const deckK = KAILASH && !r.over ? Math.min(deck, Math.max(world.height(p.x, p.z), world.height(q.x, q.z)) + 0.8) : deck;
				spans.push({ s: lerp(p.s, q.s, t), half: Math.min(5, r.w / 2 / Math.max(0.35, sin) + 0.5), deck: deckK });
			}
		}
	}
	for (const p of pts) {
		p.bridge = 0;
		p.y = p.ground;
		for (const sp of spans) {
			const d = Math.abs(p.s - sp.s);
			const k = smoothstep(sp.half + halfW + ramp, sp.half, d);
			if (k > p.bridge) {
				p.bridge = k;
				p.y = lerp(p.ground, Math.max(sp.deck, p.ground), k);
			}
		}
		p.onDeck = p.bridge > 0.98;
	}
	return pts;
}

// A ribbon along a path: n columns across, heights from the terrain (or the bridge deck).
function ribbon(pts, width, world, lift, uvLen, cols = 5) {
	const n = pts.length;
	const pos = new Float32Array(n * cols * 3), uv = new Float32Array(n * cols * 2);
	const idx = [];
	for (let i = 0; i < n; i++) {
		const p = pts[i];
		const rx = -p.dz, rz = p.dx;
		for (let c = 0; c < cols; c++) {
			const u = c / (cols - 1);
			const o = (u - 0.5) * width;
			const x = p.x + rx * o, z = p.z + rz * o;
			const ground = world.height(x, z);
			const y = lerp(Math.max(ground, p.y - 0.4), p.y, p.bridge) + lift;
			pos.set([x, Math.max(y, ground + lift), z], (i * cols + c) * 3);
			uv.set([u, p.s / uvLen], (i * cols + c) * 2);
		}
		if (i < n - 1) {
			for (let c = 0; c < cols - 1; c++) {
				const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
				idx.push(a, b, d, b, e, d);
			}
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

// Push a path away from roads that run alongside it (not ones it crosses), then smooth it again.
function separate(pts, roads, need, world) {
	const hash = new Map();
	for (const r of roads) for (const q of r) {
		const k = Math.floor(q.x / 4) * 100003 + Math.floor(q.z / 4);
		if (!hash.has(k)) hash.set(k, []);
		hash.get(k).push(q);
	}
	const kind = (q) => (KIND[q.kind].paved / 2 + KIND[q.kind].shoulder) * M;
	for (let pass = 0; pass < 3; pass++) {
		for (const p of pts) {
			const cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4);
			for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
				for (const q of hash.get((cx + i) * 100003 + (cz + j)) || []) {
					const dx = p.x - q.x, dz = p.z - q.z;
					// distance across the road at q
					const across = -dx * q.dz + dz * q.dx;
					const along = dx * q.dx + dz * q.dz;
					const min = need + kind(q) - (RAIL_BED / 2) * M;
					if (Math.abs(along) > STEP * 1.5 || Math.abs(across) >= min) continue;
					if (Math.abs(p.dx * q.dx + p.dz * q.dz) < 0.6) continue; // a crossing: leave it for a bridge
					const sg = across >= 0 ? 1 : -1;
					const push = sg * min - across;
					p.x += -q.dz * push;
					p.z += q.dx * push;
				}
			}
		}
		for (let i = 1; i < pts.length - 1; i++) {
			pts[i].x = (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4;
			pts[i].z = (pts[i - 1].z + pts[i].z * 2 + pts[i + 1].z) / 4;
		}
	}
	for (let i = 0; i < pts.length; i++) {
		const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
		const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
		pts[i].dx = (b.x - a.x) / l;
		pts[i].dz = (b.z - a.z) / l;
	}
	for (const p of pts) {
		const g = toGeo(p.x, p.z);
		p.lon = g.lon;
		p.lat = g.lat;
		p.ground = world.height(p.x, p.z);
		p.region = region(g.lon, g.lat);
	}
	return pts;
}
// ---------- the railway line ----------
// Laplacian smoothing of a polyline (ends held), carrying the route distance s along so it stays monotonic.
function smoothLine(pts, passes, keepS = false) {
	const n = pts.length;
	if (n < 3) return;
	const X = new Float64Array(n), Z = new Float64Array(n), S = new Float64Array(n);
	for (let i = 0; i < n; i++) (X[i] = pts[i].x), (Z[i] = pts[i].z), (S[i] = pts[i].s);
	const x2 = new Float64Array(n), z2 = new Float64Array(n), s2 = new Float64Array(n);
	for (let k = 0; k < passes; k++) {
		x2[0] = X[0], z2[0] = Z[0], s2[0] = S[0], x2[n - 1] = X[n - 1], z2[n - 1] = Z[n - 1], s2[n - 1] = S[n - 1];
		for (let i = 1; i < n - 1; i++) {
			x2[i] = (X[i - 1] + 2 * X[i] + X[i + 1]) / 4;
			z2[i] = (Z[i - 1] + 2 * Z[i] + Z[i + 1]) / 4;
			s2[i] = (S[i - 1] + 2 * S[i] + S[i + 1]) / 4;
		}
		X.set(x2), Z.set(z2);
		if (!keepS) S.set(s2);
	}
	for (let i = 0; i < n; i++) (pts[i].x = X[i]), (pts[i].z = Z[i]), (pts[i].s = S[i]);
}
function tangents(pts, k = 1) {
	for (let i = 0; i < pts.length; i++) {
		const a = pts[Math.max(0, i - k)], b = pts[Math.min(pts.length - 1, i + k)];
		const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
		pts[i].dx = (b.x - a.x) / l;
		pts[i].dz = (b.z - a.z) / l;
	}
}
// Even spacing along the line, so the track's curvature (and the train on it) is smooth everywhere.
function resample(pts, step) {
	const out = [pts[0]];
	let acc = 0;
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i];
		let seg = Math.hypot(b.x - a.x, b.z - a.z), t0 = 0;
		while (acc + seg * (1 - t0) >= step) {
			const t = t0 + (step - acc) / seg;
			out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), s: lerp(a.s, b.s, t) });
			t0 = t;
			acc = 0;
		}
		acc += seg * (1 - t0);
	}
	const l = pts[pts.length - 1];
	if (acc > step * 0.3) out.push({ x: l.x, z: l.z, s: l.s });
	return out;
}
// The track's centre line: the route smoothed into wide curves, set off to the right of the road (further at a
// station, where `bump` is 1), then pushed clear of every road it runs beside and smoothed again.
function railLine(route, world, s0, s1, roads, bump) {
	let pts = [];
	for (let s = s0; s <= s1 + 1e-6; s += STEP) {
		const c = route.at(s, {});
		pts.push({ s, x: c.x, z: c.z });
	}
	const raw = pts.map((p) => ({ x: p.x, z: p.z }));
	smoothLine(pts, 700);
	tangents(pts, 2);
	// where the smoothing cut inside a corner that bulges towards the line's side, stand off further by as much,
	// so the line swings wide round the outside of the bend instead of hugging the road's corner
	const extra = pts.map((p, i) => Math.max(0, (raw[i].x - p.x) * -p.dz + (raw[i].z - p.z) * p.dx));
	for (let pass = 0; pass < 120; pass++) for (let i = 1; i < extra.length - 1; i++) extra[i] = Math.max(extra[i] * 0.98, (extra[i - 1] + 2 * extra[i] + extra[i + 1]) / 4);
	for (let pass = 0; pass < 60; pass++) for (let i = 1; i < extra.length - 1; i++) extra[i] = (extra[i - 1] + 2 * extra[i] + extra[i + 1]) / 4;
	pts.forEach((p, i) => {
		const o = RAIL_OFFSET + (STATION_OFFSET - RAIL_OFFSET) * bump(p.s) + extra[i];
		p.x += -p.dz * o;
		p.z += p.dx * o;
	});
	const hash = new Map();
	for (const r of roads) for (const q of r) {
		const k = Math.floor(q.x / 4) * 100003 + Math.floor(q.z / 4);
		if (!hash.has(k)) hash.set(k, []);
		hash.get(k).push(q);
	}
	const half = (q) => (KIND[q.kind].paved / 2 + KIND[q.kind].shoulder) * M;
	const push = (relax = 0) => {
		tangents(pts, 2);
		for (const p of pts) {
			const need = 2.1 - relax + (STATION_OFFSET - RAIL_OFFSET) * bump(p.s) * (1 - relax);
			const cx = Math.floor(p.x / 4), cz = Math.floor(p.z / 4);
			for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
				for (const q of hash.get((cx + i) * 100003 + (cz + j)) || []) {
					const dx = p.x - q.x, dz = p.z - q.z;
					const across = -dx * q.dz + dz * q.dx, along = dx * q.dx + dz * q.dz;
					const min = need + half(q);
					if (Math.abs(along) > STEP * 1.5 || Math.abs(across) >= min) continue;
					if (Math.abs(p.dx * q.dx + p.dz * q.dz) < 0.6) continue; // a crossing: leave it for a bridge
					// the line keeps to the right of its own road; any other road it is pushed off whichever side it is on
					const sg = Math.abs(q.s - p.s) < 25 ? 1 : across >= 0 ? 1 : -1;
					const d = sg * min - across;
					p.x += -q.dz * d;
					p.z += q.dx * d;
				}
			}
		}
	};
	for (let round = 0; round < 8; round++) {
		push();
		smoothLine(pts, 60);
	}
	// then ease out every curve still tighter than a coach can take (about 50 m), working only on those bends
	const RMIN = 16, n = pts.length;
	for (let iter = 0; iter < 80; iter++) {
		const flag = new Uint8Array(n);
		let any = false;
		for (let i = 5; i < n - 5; i++) {
			const a = pts[i - 5], b = pts[i], c = pts[i + 5];
			const ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
			const cr = Math.abs(ax * bz - az * bx), r = (Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(c.x - a.x, c.z - a.z)) / (2 * cr + 1e-12);
			if (r < RMIN) {
				any = true;
				for (let k = Math.max(1, i - 14); k <= Math.min(n - 2, i + 14); k++) flag[k] = 1;
			}
		}
		if (!any) break;
		for (let pass = 0; pass < 30; pass++) {
			for (let i = 1; i < n - 1; i++) {
				if (!flag[i]) continue;
				const p = pts[i];
				p.x = (pts[i - 1].x + 2 * p.x + pts[i + 1].x) / 4;
				p.z = (pts[i - 1].z + 2 * p.z + pts[i + 1].z) / 4;
			}
		}
		// the bends may come a little nearer the road than the straight runs do
		push(0.9);
	}
	smoothLine(pts, 3);
	pts = resample(pts, STEP);
	smoothLine(pts, 6, true);
	tangents(pts, 1);
	for (const p of pts) {
		const g = toGeo(p.x, p.z);
		p.lon = g.lon;
		p.lat = g.lat;
		p.ground = world.height(p.x, p.z);
		p.y = p.ground;
		p.kind = "nh";
		p.region = region(g.lon, g.lat);
	}
	return pts;
}
// Distance along the track (world units), the train's own measure.
function arcLength(pts) {
	let a = 0;
	pts[0].a = 0;
	for (let i = 1; i < pts.length; i++) {
		a += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
		pts[i].a = a;
	}
	pts.length && (pts.A = a);
}
function search(pts, key, v) {
	let lo = 0, hi = pts.length - 2;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (pts[mid][key] <= v) lo = mid;
		else hi = mid - 1;
	}
	return Math.max(0, lo);
}
export function sToA(pts, s) {
	const i = search(pts, "s", s), a = pts[i], b = pts[i + 1];
	return lerp(a.a, b.a, clamp((s - a.s) / (b.s - a.s || 1), 0, 1));
}
export function aToS(pts, x) {
	const i = search(pts, "a", x), a = pts[i], b = pts[i + 1];
	return lerp(a.s, b.s, clamp((x - a.a) / (b.a - a.a || 1), 0, 1));
}
// The formation level: a smooth gradient over the ground (on low embankments where the ground dips), up onto
// each bridge deck, never buried.
function railProfile(pts, world) {
	const n = pts.length;
	const base = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		const p = pts[i];
		const l = { x: p.x + p.dz * 0.6, z: p.z - p.dx * 0.6 }, r = { x: p.x - p.dz * 0.6, z: p.z + p.dx * 0.6 };
		const g = Math.max(p.ground, world.height(l.x, l.z) - 0.05, world.height(r.x, r.z) - 0.05);
		base[i] = p.bridge > 0.02 ? Math.max(p.y, g * (1 - p.bridge)) : g;
	}
	// no steeper than about 1 in 14 (the relief here is exaggerated many times): over a hill the line climbs on
	// an embankment from well back, rather than up the slope
	const G = 0.07;
	for (let i = 1; i < n; i++) base[i] = Math.max(base[i], base[i - 1] - G * (pts[i].a - pts[i - 1].a));
	for (let i = n - 2; i >= 0; i--) base[i] = Math.max(base[i], base[i + 1] - G * (pts[i + 1].a - pts[i].a));
	let y = Float64Array.from(base);
	const y2 = new Float64Array(n);
	for (let it = 0; it < 260; it++) {
		for (let i = 0; i < n; i++) y[i] = Math.max(y[i], base[i]);
		// free ends: the line runs level into its buffer stops rather than tipping up or down at them
		y2[0] = (y[0] + y[1]) / 2;
		y2[n - 1] = (y[n - 2] + y[n - 1]) / 2;
		for (let i = 1; i < n - 1; i++) y2[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
		y.set(y2);
	}
	// a last pure smoothing, so the gradient changes as gently as a railway's does (no kinks left by the envelope)
	for (let it = 0; it < 900; it++) {
		for (let i = 1; i < n - 1; i++) y2[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
		y2[0] = (y[0] + y[1]) / 2;
		y2[n - 1] = (y[n - 2] + y[n - 1]) / 2;
		y.set(y2);
	}
	// wherever the smoothing still dipped below the ground or a deck, lift the line gently over a wide stretch
	const d = new Float64Array(n), d2 = new Float64Array(n);
	for (let i = 0; i < n; i++) d[i] = Math.max(0, base[i] - y[i]);
	for (let i = 0; i < n; i++) {
		let m = 0;
		for (let k = Math.max(0, i - 40); k <= Math.min(n - 1, i + 40); k++) m = Math.max(m, d[k]);
		d2[i] = m;
	}
	for (let it = 0; it < 500; it++) {
		for (let i = 1; i < n - 1; i++) d[i] = (d2[i - 1] + 2 * d2[i] + d2[i + 1]) / 4;
		d[0] = (d2[0] + d2[1]) / 2;
		d[n - 1] = (d2[n - 2] + d2[n - 1]) / 2;
		d2.set(d);
	}
	for (let i = 0; i < n; i++) pts[i].y = y[i] + d2[i] + 0.01;
}

// Break a path into separate runs wherever ok(p) fails, so no straight piece jumps across the gap.
function split(pts, ok) {
	const runs = [];
	let cur = [];
	for (const p of pts) {
		if (ok(p)) cur.push(p);
		else if (cur.length) {
			runs.push(cur);
			cur = [];
		}
	}
	if (cur.length) runs.push(cur);
	return runs.filter((r) => r.length > 6);
}

export class Roads {
	constructor(route, world, scene, low = false) {
		this.route = route;
		this.world = world;
		this.low = low;
		this.group = new THREE.Group();
		scene.add(this.group);
		const ch = route.chapters;
		const near = (lon, lat, c) => {
			const t = toWorld(lon, lat);
			let bs = c.s0, bd = Infinity;
			for (const p of route.pts) if (p.s >= c.s0 && p.s <= c.s1) {
				const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2;
				if (d < bd) { bd = d; bs = p.s; }
			}
			return bs;
		};
		// legs by the shrine they end at, so nothing here depends on how many legs there are
		const leg = (key) => ch.find((c) => c.shrine.key === key);
		if (KAILASH) {
			this.kailash(near);
			return;
		}
		// where the traveller can change from one kind of transport to the next
		this.at = {
			mancharOut: near(73.93, 18.98, leg("shirdi")),
			tirupatiIn: near(79.42, 13.63, leg("tirupati")),
			tirupatiOut: near(79.42, 13.63, leg("kedarnath")),
			rishikesh: near(78.29, 30.09, leg("kedarnath")),
			gauri: near(GAURIKUND[0], GAURIKUND[1], leg("kedarnath")),
			gauriBack: near(GAURIKUND[0], GAURIKUND[1], leg("badrinath")),
			rudraBack: near(78.98, 30.28, leg("badrinath")),
		};
		const A = this.at;
		// stretches of road and rail; the return legs reuse the road they came up (down from Bhimashankar to Manchar,
		// Tirumala to Tirupati, Kedarnath to Rudraprayag), so it is not drawn twice
		this.roadRuns = [[0.4, ch[0].s1 - 2.8], [A.mancharOut, leg("shirdi").s1 - 3.2], [leg("tirupati").s0 + 2.8, leg("tirupati").s1 - 3.2], [A.tirupatiOut, A.gauri], [A.rudraBack, leg("badrinath").s1 - 2.6]];
		this.trekRun = [A.gauri, leg("kedarnath").s1 - 3.2];
		this.rivers = riverLines();
		// Roads stop well short of each temple, at a bus stand; the last stretch is a pilgrim path on foot.
		this.shrinePos = route.chapters.map((c) => route.at(c.s1, {}));
		this.clearR = route.chapters.map((c) => CLEAR[c.shrine.key] ?? 9);
		const offShrine = (p) => this.shrinePos.every((w, i) => Math.hypot(p.x - w.x, p.z - w.z) > this.clearR[i]);
		this.roads = [];
		// a road stops short of each temple, but never in the middle of a bridge: one cut off on its deck (Badrinath's,
		// over the Alaknanda) is carried on across it to the far bank, so nobody steps off the deck into the river
		for (const [a, b] of this.roadRuns) {
			const pts = bridges(samplePath(route, world, a, b, 0), this.rivers, world, 1.8);
			const keep = pts.map(offShrine);
			for (let i = 1; i < pts.length; i++) if (!keep[i] && keep[i - 1] && pts[i].bridge > 0.02) keep[i] = true;
			for (let i = pts.length - 2; i >= 0; i--) if (!keep[i] && keep[i + 1] && pts[i].bridge > 0.02) keep[i] = true;
			const kept = new Set(pts.filter((p, i) => keep[i]));
			for (const run of split(pts, (p) => kept.has(p))) this.roads.push(run);
		}
		// on foot near each end of a leg: from the temple door out to the bus stand, and from the bus stand in
		const dist = (s, w) => {
			const p = route.at(s, {});
			return Math.hypot(p.x - w.x, p.z - w.z);
		};
		this.legWalk = route.chapters.map((c, i) => {
			let out = c.s0, inn = c.s1;
			if (i > 0) while (out < c.s1 && dist(out, this.shrinePos[i - 1]) < this.clearR[i - 1] + 0.3) out += 0.05;
			while (inn > c.s0 && dist(inn, this.shrinePos[i]) < this.clearR[i] + 0.3) inn -= 0.05;
			return { out, in: inn };
		});
		// A pilgrim path on foot from a to b. Its bridges are found over a few units either side, so a path that
		// starts or ends where the road was cut off on a bridge (Badrinath's, over the Alaknanda) carries the same
		// deck on, rather than dropping from it to the ground below.
		const footPath = (a, b) => bridges(samplePath(route, world, Math.max(0, a - STEP * 17), Math.min(route.length, b + STEP * 17), 0, { kind: "trek" }), this.rivers, world, 0.5).filter((p) => p.s >= a - 1e-3 && p.s <= b + 1e-3);
		this.walks = [];
		this.stands = [];
		const kedar = ch.indexOf(leg("kedarnath"));
		route.chapters.forEach((c, i) => {
			const w = this.shrinePos[i];
			let sA = c.s1;
			for (let s = Math.max(c.s0, c.s1 - 40); s < c.s1; s += 0.25) {
				const p = route.at(s, {});
				if (Math.hypot(p.x - w.x, p.z - w.z) < this.clearR[i]) {
					sA = s;
					break;
				}
			}
			// at Kedarnath the path from the bus stand joins the trek at Gaurikund
			const end = i === kedar ? A.gauri : c.s1 - (COURT[c.shrine.key] ?? 3.0);
			if (end - sA < 0.8) return;
			const path = footPath(sA - 0.3, end + 0.2);
			if (path.length > 2) {
				this.walks.push(path);
				this.stands.push({ s: sA, shrine: i });
			}
		});
		// and where a leg sets out from a temple by a new road (not back the way it came), a path out to its own bus stand
		route.chapters.forEach((c, i) => {
			if (i === 0) return;
			const a = route.at(c.s0 + 4, {}), b = route.at(ch[i - 1].s1 - 4, {});
			if (Math.hypot(a.x - b.x, a.z - b.z) < 1.5) return;
			const out = this.legWalk[i].out;
			if (out - c.s0 < 4) return;
			const path = footPath(c.s0 + (COURT[ch[i - 1].shrine.key] ?? 2.8), out + 0.5);
			if (path.length > 2) {
				this.walks.push(path);
				this.stands.push({ s: out, shrine: i, out: true });
			}
		});
		// the trek from Gaurikund, bridged like the paths: where it starts just over the Mandakini it starts on the deck
		this.trek = footPath(this.trekRun[0], this.trekRun[1]);
		// The railway: a smooth line of gentle curves beside the road, kept off the roads it runs beside,
		// carried over the roads it crosses, clear of every shrine, and swung out from the road at each
		// station so the platform, the station building and its forecourt fit between the two.
		const shrines = this.shrinePos;
		const clear = (p) => shrines.every((w, i) => Math.hypot(p.x - w.x, p.z - w.z) > this.clearR[i] + 0.8);
		const roadLines = [...this.roads, this.trek, ...this.walks].map((pts) => ({ pts, w: (KIND[pts[0]?.kind || "nh"].paved + 2 * KIND[pts[0]?.kind || "nh"].shoulder) * M, over: true }));
		const alongside = [...this.roads, this.trek, ...this.walks];
		this.rails = [];
		for (const L of LINES) {
			const c = leg(L.to);
			if (!c) continue;
			const [a, b] = L.to === "tirupati" ? [c.s0, A.tirupatiIn] : [A.tirupatiOut, A.rishikesh + 4];
			// a first pass finds where the line can run and where its stations stand, the second swings it out at them
			let line = null, plan = null;
			for (let pass = 0; pass < 2; pass++) {
				const pts = railLine(route, world, a, b, alongside, plan ? (s) => plan.bump(s) : () => 0);
				line = split(pts, clear).sort((x, y) => y.length - x.length)[0];
				if (!line) break;
				arcLength(line);
				bridges(line, [...this.rivers, ...roadLines], world, 0.9, 16);
				if (!plan) plan = this.planStations(line, L);
			}
			if (!line) continue;
			// the line ends a little beyond each terminal's platform, at a buffer stop
			const first = plan.stops[0], end = plan.stops.at(-1);
			const sa = aToS(line, sToA(line, first.s) - RAIL.platLen / 2 - 3.2), sb = aToS(line, sToA(line, end.s) + RAIL.platLen / 2 + 3.2);
			line = line.filter((p) => p.s >= sa && p.s <= sb);
			arcLength(line);
			railProfile(line, world);
			line.chapter = c.index;
			line.stock = L.stock;
			line.stops = plan.stops.map((st) => this.layoutStation(line, Object.assign({}, st, { a: sToA(line, st.s) })));
			this.rails.push(line);
		}
		// where the traveller changes onto and off the train on each leg: at each terminal station's forecourt
		this.trains = {};
		for (const r of this.rails) this.trains[r.chapter] = { rail: r, from: r.stops[0].sRoad, to: r.stops.at(-1).sRoad };
		this.stations = this.rails.flatMap((r) => r.stops);
		// the short autorickshaw hop from Tirupati station to Alipiri, at the foot of the ghat road
		const tt = this.trains[ch.indexOf(leg("tirupati"))];
		this.at.alipiri = lerp(tt ? tt.to : A.tirupatiIn, leg("tirupati").s1 - 14, 0.5);
		for (const p of this.roads) this.buildRoad(p);
		this.buildRoad(this.trek);
		for (const p of this.walks) {
			this.buildRoad(p);
			this.bazaar(p);
		}
		for (const st of this.stands) this.busStand(st);
		for (const p of this.rails) this.buildRail(p);
		for (const st of this.stations) this.station(st);
	}

	// ---------- the Kailash journey ----------
	// Its roads, paths and railway come from the stretches each leg of kailash-geo.js lists: a road for every stretch
	// ridden (by bus, jeep, the transport chip's choice, or the Tibet side's bus), a trodden path for every stretch
	// walked (over the Lipulekh, and the parikrama), the railway from Delhi to Tanakpur for the Train choice, and at
	// each stop where a road ends a gravel yard with a short path on to the stop.
	kailash(near) {
		const route = this.route, world = this.world, ch = route.chapters;
		this.at = {};
		this.rivers = riverLines();
		// each leg's stretches, resolved to distances along the route
		this.ways = ch.map((c, i) => {
			const list = ROUTE[i].ways.map(([kind, pt, label, o], k) => ({ kind, label, shared: !!(o && o.shared), s: k === 0 ? c.s0 : near(pt[0], pt[1], c) }));
			list.forEach((w, k) => (w.e = k + 1 < list.length ? list[k + 1].s : c.s1));
			return list;
		});
		// from here on (the Tibet side) traffic keeps to the right
		this.tibetFrom = Math.min(...this.ways.flat().filter((w) => w.kind === "tibet").map((w) => w.s)) - 0.5;
		this.shrinePos = ch.map((c) => route.at(c.s1, {}));
		this.clearR = ch.map((c) => K_CLEAR[c.shrine.key] ?? 4.8);
		const footPath = (a, b, kind = "trail") => bridges(samplePath(route, world, Math.max(0, a - STEP * 17), Math.min(route.length, b + STEP * 17), 0, { kind }), this.rivers, world, 0.5).filter((p) => p.s >= a - 1e-3 && p.s <= b + 1e-3);
		// where the road at the start of a leg begins and the one at its end stops: clear of each stop
		const out = (i) => {
			const c = ch[i];
			let s = c.s0;
			if (i > 0) while (s < c.s1 && Math.hypot(route.at(s, {}).x - this.shrinePos[i - 1].x, route.at(s, {}).z - this.shrinePos[i - 1].z) < this.clearR[i - 1] + 0.3) s += 0.05;
			return s;
		};
		const inn = (i) => {
			const c = ch[i];
			let s = c.s1;
			while (s > c.s0 && Math.hypot(route.at(s, {}).x - this.shrinePos[i].x, route.at(s, {}).z - this.shrinePos[i].z) < this.clearR[i] + 0.3) s -= 0.05;
			return s;
		};
		this.legWalk = ch.map((c, i) => ({ out: out(i), in: inn(i) }));
		this.roads = [];
		this.treks = [];
		this.walks = [];
		this.stands = [];
		ch.forEach((c, i) => {
			const W = this.ways[i], lw = this.legWalk[i];
			W.forEach((w, k) => {
				if (w.shared) return;
				if (w.kind === "walk") {
					// a path on foot runs from just past the last stop (or from where the ride before it ends) to just short
					// of the next stop (or on to where the road after it begins)
					const pa = k === 0 ? c.s0 + 2.2 : w.s, pb = k === W.length - 1 ? c.s1 - 2.4 : Math.max(w.e, k === 0 ? lw.out : w.e);
					if (pb - pa < 0.6) return;
					const path = footPath(pa, pb);
					if (path.length > 2) this.treks.push(path);
					return;
				}
				const a = Math.max(w.s, lw.out), b = Math.min(w.e, lw.in);
				if (b - a < 0.6) return;
				const pts = bridges(samplePath(route, world, Math.max(0.4, a), b, 0), this.rivers, world, 1.8);
				// (a road passing another stop part way along its leg runs on past it: only its ends stop short)
				this.roads.push(pts);
			});
			// where a leg's last stretch is ridden, the road stops at a yard and a path goes on to the stop
			const last = W[W.length - 1];
			if (last.kind !== "walk") {
				const path = footPath(lw.in - 0.3, c.s1 - 2.0, "trail");
				if (path.length > 2) {
					this.walks.push(path);
					this.stands.push({ s: lw.in, shrine: i });
				}
			}
			// and where it sets out from a stop on wheels, a path out to the road
			if (i > 0 && W[0].kind !== "walk" && lw.out - c.s0 > 1.2) {
				const path = footPath(c.s0 + 1.6, lw.out + 0.5, "trail");
				if (path.length > 2) {
					this.walks.push(path);
					this.stands.push({ s: lw.out, shrine: i, out: true });
				}
			}
		});
		this.trek = this.treks[0] || [];
		// the railway for the Train choice: Delhi to Tanakpur
		const alongside = [...this.roads, ...this.treks, ...this.walks];
		const roadLines = alongside.map((pts) => ({ pts, w: (KIND[pts[0]?.kind || "nh"].paved + 2 * KIND[pts[0]?.kind || "nh"].shoulder) * M, over: true }));
		const shrines = this.shrinePos;
		const clear = (p) => shrines.every((w, i) => Math.hypot(p.x - w.x, p.z - w.z) > this.clearR[i] + 0.8);
		this.rails = [];
		for (const L of K_LINES) {
			const c = ch.find((q) => q.shrine.key === L.to);
			if (!c) continue;
			const a = c.s0, b = near(L.ends[1][0], L.ends[1][1], c) + (L.tail ?? 4);
			let line = null, plan = null;
			for (let pass = 0; pass < 2; pass++) {
				const pts = railLine(route, world, a, b, alongside, plan ? (q) => plan.bump(q) : () => 0);
				line = split(pts, clear).sort((x, y) => y.length - x.length)[0];
				if (!line) break;
				arcLength(line);
				bridges(line, [...this.rivers, ...roadLines], world, 0.9, 16);
				if (!plan) plan = this.planStations(line, L);
			}
			if (!line) continue;
			const first = plan.stops[0], end = plan.stops.at(-1);
			const sa = aToS(line, sToA(line, first.s) - RAIL.platLen / 2 - 3.2), sb = aToS(line, sToA(line, end.s) + RAIL.platLen / 2 + 3.2);
			line = line.filter((p) => p.s >= sa && p.s <= sb);
			arcLength(line);
			railProfile(line, world);
			line.chapter = c.index;
			line.stock = L.stock;
			line.stops = plan.stops.map((st) => this.layoutStation(line, Object.assign({}, st, { a: sToA(line, st.s) })));
			this.rails.push(line);
		}
		this.trains = {};
		for (const r of this.rails) this.trains[r.chapter] = { rail: r, from: r.stops[0].sRoad, to: r.stops.at(-1).sRoad };
		this.stations = this.rails.flatMap((r) => r.stops);
		for (const p of this.roads) this.buildRoad(p);
		for (const p of this.treks) this.buildRoad(p);
		for (const p of this.walks) this.buildRoad(p);
		for (const st of this.stands) this.yard(st);
		for (const p of this.rails) this.buildRail(p);
		for (const st of this.stations) this.station(st);
	}
	// The Kailash journey's stand where a road ends: a level yard of packed gravel, a jeep or two waiting on the
	// Indian side, prayer flags on a pole on the Tibetan.
	yard(st) {
		const sr = st.out ? st.s + 2.2 : st.s - 2.2;
		const r = Roads.lookup(this.roads, sr) || this.route.at(sr, {});
		const l = Math.hypot(r.dx, r.dz) || 1;
		const dx = r.dx / l, dz = r.dz / l, yaw = Math.atan2(dx, dz);
		const sd = sr >= this.tibetFrom ? -1 : 1; // on the kerb side: the right in Tibet
		const cx = r.x + dz * 1.9 * sd - dx * 0.5, cz = r.z - dx * 1.9 * sd - dz * 0.5;
		st.x = cx;
		st.z = cz;
		const y = this.world.height(cx, cz);
		const g = toGeo(cx, cz), tb = region(g.lon, g.lat) === "tibet";
		const b = new Batch();
		// packed gravel draped over the ground (a slab would stand proud of it on a slope)
		{
			const n = 6, P = [], N = [], C = [], col = new THREE.Color(tb ? 0x8f8474 : 0x77736c), cs = Math.cos(yaw), sn = Math.sin(yaw);
			const at = (u, v) => {
				const x = cx + u * cs + v * sn, z = cz - u * sn + v * cs;
				return [x, this.world.height(x, z) + 0.035, z];
			};
			for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
				const u0 = -1.2 + (2.4 * i) / n, u1 = -1.2 + (2.4 * (i + 1)) / n, v0 = -1.7 + (3.4 * j) / n, v1 = -1.7 + (3.4 * (j + 1)) / n;
				const A = at(u0, v0), B2 = at(u1, v0), Cc = at(u0, v1), D = at(u1, v1);
				for (const t of [[A, Cc, B2], [B2, Cc, D]]) {
					for (const q of t) P.push(...q), N.push(0, 1, 0), C.push(col.r, col.g, col.b);
				}
			}
			b.addTris(P, N, C);
		}
		const R = rand(st.shrine * 37 + 11);
		if (tb) {
			// a flag pole with strings of prayer flags run out to the ground
			b.add(T.cyl, place(cx + Math.cos(yaw) * 0.9, y, cz - Math.sin(yaw) * 0.9, 0, 0.05, 1.6, 0.05), 0x6a4a2e);
		}
		this.group.add(b.build(VCOL));
		void R;
	}

	// ---------- queries ----------
	static lookup(paths, s) {
		for (const pts of paths) {
			if (!(pts.length > 1) || !(s >= pts[0].s - 1e-6 && s <= pts[pts.length - 1].s + 1e-6)) continue;
			let lo = 0, hi = pts.length - 2;
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				if (pts[mid].s <= s) lo = mid;
				else hi = mid - 1;
			}
			const i = lo;
			const a = pts[i], b = pts[i + 1];
			const t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
			return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), dx: lerp(a.dx, b.dx, t), dz: lerp(a.dz, b.dz, t), kind: a.kind, region: a.region, bridge: a.bridge };
		}
		return null;
	}
	// A point on the road (lane in metres from the centre, positive to the right; India drives on the left).
	road(s, lane = 0, out = {}) {
		const p = Roads.lookup(this.roads, s) || Roads.lookup(this.treks || [this.trek], s) || Roads.lookup(this.walks, s);
		if (!p) return null;
		const l = Math.hypot(p.dx, p.dz) || 1;
		p.dx /= l;
		p.dz /= l;
		p.x += -p.dz * lane * M;
		p.z += p.dx * lane * M;
		if (!p.bridge) p.y = this.world.height(p.x, p.z);
		return Object.assign(out, p);
	}
	// The deck of a footbridge (on the trek or a pilgrim path) under x, z, or -Infinity: for a pilgrim on the way
	// back along a path laid for the way in, which the road surface by position does not cover.
	deckAt(x, z) {
		if (!this.decks) {
			this.decks = [];
			for (const pts of [...(this.treks || [this.trek]), ...this.walks]) for (let i = 0; i < pts.length - 1; i++) if (pts[i].bridge > 0.01 || pts[i + 1].bridge > 0.01) this.decks.push([pts[i], pts[i + 1]]);
		}
		// the path and the verge a pilgrim keeps to where a road has just ended beside it
		const half = (KIND.trek.paved / 2 + KIND.trek.shoulder + 3.5) * M;
		// on a segment of the deck; failing that, a little past the end of one (where the path from the bus stand
		// hands over to the trek, the deck runs on across the gap between them)
		for (const reach of [0, 0.6]) {
			let y = -Infinity;
			for (const [A, B] of this.decks) {
				if (Math.abs(A.x - x) > 2 || Math.abs(A.z - z) > 2) continue;
				const ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez || 1e-9;
				const t = ((x - A.x) * ex + (z - A.z) * ez) / l2;
				if (t < -reach || t > 1 + reach) continue;
				if (Math.abs((x - A.x) * ez - (z - A.z) * ex) / Math.sqrt(l2) > half) continue;
				const u = clamp(t, 0, 1), ground = this.world.height(x, z), br = lerp(A.bridge, B.bridge, u), py = lerp(A.y, B.y, u);
				y = Math.max(y, lerp(Math.max(ground, py - 0.4), py, br) + KIND.trek.lift);
			}
			if (y > -Infinity) return y;
		}
		return -Infinity;
	}
	rail(s, out = {}) {
		const p = Roads.lookup(this.rails, s);
		if (!p) return null;
		const l = Math.hypot(p.dx, p.dz) || 1;
		p.dx /= l;
		p.dz /= l;
		return Object.assign(out, p);
	}
	// Distance from x,z to the edge of the nearest road, railway or river, for keeping scenery off them.
	clearance(x, z) {
		if (!this.hash) this.index();
		let d = Infinity;
		const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
		for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
			const cell = this.hash.get((cx + i) * 100003 + (cz + j));
			if (!cell) continue;
			for (let k = 0; k < cell.length; k += 3) d = Math.min(d, Math.hypot(cell[k] - x, cell[k + 1] - z) - cell[k + 2]);
		}
		return d;
	}
	// Distance from x, z to the middle of the nearest path on foot (the trek, a temple's pilgrim path), Infinity
	// if none is near: the follow camera walks a body length or two to one side of the traveller, so a tree's
	// crown has to stand that much further off than the path's own edge.
	footDist(x, z) {
		if (!this.footHash) {
			this.footHash = new Map();
			for (const pts of [...(this.treks || [this.trek]), ...this.walks]) for (const p of pts) {
				const key = Math.floor(p.x / 4) * 100003 + Math.floor(p.z / 4);
				let c = this.footHash.get(key);
				if (!c) this.footHash.set(key, (c = []));
				c.push(p.x, p.z);
			}
		}
		let d = Infinity;
		const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
		for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
			const cell = this.footHash.get((cx + i) * 100003 + (cz + j));
			if (cell) for (let k = 0; k < cell.length; k += 2) d = Math.min(d, Math.hypot(cell[k] - x, cell[k + 1] - z));
		}
		return d;
	}
	index() {
		this.hash = new Map();
		const put = (x, z, half) => {
			const key = Math.floor(x / 4) * 100003 + Math.floor(z / 4);
			let c = this.hash.get(key);
			if (!c) this.hash.set(key, (c = []));
			c.push(x, z, half);
		};
		for (const pts of this.roads) for (const p of pts) put(p.x, p.z, ((KIND[p.kind].paved / 2 + KIND[p.kind].shoulder) * M) + 0.15);
		for (const t of this.treks || [this.trek]) for (const p of t) put(p.x, p.z, 0.4);
		for (const w of this.walks) for (const p of w) put(p.x, p.z, 1.3);
		for (const st of this.stands || []) put(st.x, st.z, KAILASH ? 2.2 : 3.2);
		for (const pts of this.rails) for (const p of pts) put(p.x, p.z, (RAIL_BED / 2) * M + 0.3);
		// each station: the platform, the building and the forecourt out to the road
		const q = {};
		for (const st of this.stations || []) {
			for (let v = -st.len / 2 - 1; v <= st.len / 2 + 1; v += 0.8) {
				st.at(RAIL.edge + RAIL.platW / 2, v, q);
				put(q.x, q.z, RAIL.platW / 2 + 0.5);
			}
			for (let v = -7; v <= 7; v += 0.8) for (const u of [2.4, 3.4, 4.3]) {
				st.at(u, v, q);
				put(q.x, q.z, 0.75);
			}
		}
		for (const r of this.rivers) for (let i = 0; i < r.pts.length - 1; i++) {
			const a = r.pts[i], b = r.pts[i + 1];
			for (let t = 0; t < 1; t += 0.34) put(lerp(a.x, b.x, t), lerp(a.z, b.z, t), r.w / 2 + 0.6);
		}
	}

	// ---------- building ----------
	buildRoad(pts) {
		// one mesh per run of the same kind of road through the same landscape
		let start = 0;
		for (let i = 1; i <= pts.length; i++) {
			if (i < pts.length && pts[i].kind === pts[start].kind && pts[i].region === pts[start].region) continue;
			const run = pts.slice(start, Math.min(i + 1, pts.length));
			if (run.length > 1) {
				const k = KIND[run[0].kind];
				const tex = roadTexture(run[0].kind, run[0].region);
				const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: run[0].kind === "trek" ? 0.95 : 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
				const m = new THREE.Mesh(ribbon(run, (k.paved + 2 * k.shoulder) * M, this.world, k.lift, tex.userData.len), mat);
				m.receiveShadow = true;
				this.group.add(m);
			}
			start = i;
		}
		this.furnish(pts);
	}
	// Kerbs, crash barriers, parapets, poles, milestones and bridge railings along a road.
	furnish(pts) {
		const b = new Batch();
		const R = rand(Math.round(pts[0].s * 13) + 5);
		const world = this.world;
		const side = (p, o) => ({ x: p.x - p.dz * o, z: p.z + p.dx * o });
		const yAt = (p, q) => (p.bridge > 0.5 ? p.y : world.height(q.x, q.z));
		let lastPole = null, lastMile = -1e9;
		const wires = [];
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];
			const k = KIND[p.kind];
			const half = (k.paved / 2) * M, outer = (k.paved / 2 + k.shoulder) * M;
			const yaw = Math.atan2(p.dx, p.dz);
			if (p.bridge > 0.5) {
				// concrete parapets, and piers down to the river bed
				for (const sg of [-1, 1]) {
					const q = side(p, sg * (outer - 0.06));
					// a footbridge has a low stone parapet; a road bridge the painted concrete one
					if (p.kind === "trek" || p.kind === "trail") b.add(T.box, place(q.x, p.y + k.lift, q.z, yaw, 0.05, 0.2, STEP * 1.02), 0x8a8378);
					else b.add(T.box, place(q.x, p.y + k.lift, q.z, yaw, 0.12, 0.3, STEP * 1.02), i % 6 < 3 ? 0xe8e4da : 0x2a2a2a);
				}
				if (p.onDeck && i % 5 === 0) {
					const g = world.height(p.x, p.z) - 0.5;
					b.add(T.box, place(p.x, g, p.z, yaw, outer * 1.6, p.y - g, 0.3), 0x9a958b);
				}
				continue;
			}
			if (p.kind === "trail") continue;
			if (p.kind === "trek") {
				// an iron railing on the valley side of the trek
				if (i % 3 === 0) {
					const l = side(p, -outer), r = side(p, outer);
					const q = world.height(l.x, l.z) < world.height(r.x, r.z) ? l : r;
					b.add(T.box, place(q.x, yAt(p, q), q.z, yaw, 0.03, 0.3, 0.03), 0x50565c);
					b.add(T.box, place(q.x, yAt(p, q) + 0.28, q.z, yaw, 0.02, 0.02, STEP * 3), 0x50565c);
				}
				continue;
			}
			if (p.kind === "ghat" || p.kind === "hill") {
				// black and white kerb stones at the edge of the tarmac
				if (i % 2 === 0) for (const sg of [-1, 1]) {
					const q = side(p, sg * half);
					b.add(T.box, place(q.x, yAt(p, q), q.z, yaw, 0.1, 0.07, 0.16), (i >> 1) % 2 ? 0xf1efe8 : 0x1c1c1c);
				}
				// the valley side gets a barrier; a steep uphill side gets a stone retaining wall
				const l = side(p, -outer - 0.5), r = side(p, outer + 0.5);
				const hl = world.height(l.x, l.z), hr = world.height(r.x, r.z);
				if (Math.abs(hl - hr) > 0.15) {
					const down = hl < hr ? -1 : 1;
					const q = side(p, down * (outer - 0.05));
					const y = yAt(p, q);
					if (p.kind === "ghat") {
						// W-beam crash barrier painted in yellow and black bands
						if (i % 2 === 0) b.add(T.box, place(q.x, y, q.z, yaw, 0.04, 0.22, 0.04), 0x3a3a3a);
						b.add(T.box, place(q.x, y + 0.16, q.z, yaw, 0.03, 0.09, STEP * 1.02), Math.floor(i / 2) % 2 ? 0xf0c419 : 0x161616);
					} else if (i % 2 === 0) {
						// BRO parapet blocks with gaps
						b.add(T.box, place(q.x, y, q.z, yaw, 0.14, 0.22, 0.2), Math.floor(i / 2) % 2 ? 0xf1efe8 : 0x2a2a2a);
					}
					const up = side(p, -down * (outer + 0.05));
					if (Math.abs(hl - hr) > 0.5) b.add(T.box, place(up.x, yAt(p, up) - 0.1, up.z, yaw, 0.18, 0.55, STEP * 1.02), 0x8a8378);
				}
			}
			// electricity poles with sagging wires on the plains
			if (p.kind === "nh" && i % 12 === 0 && p.region !== "tibet") {
				const q = side(p, -(outer + 0.4));
				const y = world.height(q.x, q.z);
				b.add(T.taper, place(q.x, y, q.z, yaw, 0.07, 2.5, 0.07), 0xb5b0a6);
				b.add(T.box, place(q.x, y + 2.35, q.z, yaw + Math.PI / 2, 0.04, 0.04, 0.5), 0x8a857c);
				const top = new THREE.Vector3(q.x, y + 2.38, q.z);
				if (lastPole && lastPole.distanceTo(top) < STEP * 14) wires.push([lastPole.clone(), top.clone()]);
				lastPole = top;
			}
			// a milestone on the left verge every so often
			if (p.kind !== "trek" && p.kind !== "trail" && !(KAILASH && p.region === "tibet") && p.s - lastMile > 22 && i > 4 && i < pts.length - 6) {
				lastMile = p.s;
				this.milestone(p, side(p, -(outer - 0.15)), yaw);
			}
		}
		if (!b.empty) this.group.add(b.build(VCOL));
		if (wires.length) {
			const pos = [];
			for (const [a, c] of wires) {
				let prev = a;
				for (let t = 1; t <= 6; t++) {
					const q = a.clone().lerp(c, t / 6);
					q.y -= Math.sin((t / 6) * Math.PI) * 0.25;
					for (const off of [-0.2, 0.2]) pos.push(prev.x + off * 0.3, prev.y, prev.z, q.x + off * 0.3, q.y, q.z);
					prev = q;
				}
			}
			const g = new THREE.BufferGeometry();
			g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
			this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 })));
		}
	}
	milestone(p, q, yaw) {
		const ch = this.route.chapterAt(p.s);
		const km = Math.max(1, Math.round(this.route.km(ch.s1 - p.s)));
		const name = ch.shrine.name;
		const cap = p.kind === "hill" ? "#f0c020" : p.kind === "ghat" ? "#2f8a4a" : "#f0c020";
		const tex = milestoneTexture(name, km, cap);
		const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
		const plain = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.8 });
		const g = new THREE.Group();
		const y = this.world.height(q.x, q.z);
		// face the traffic coming along the road
		const stone = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.08), [plain, plain, plain, plain, front, front]);
		stone.position.y = 0.13;
		const cap3 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: cap, roughness: 0.7 }));
		cap3.rotation.set(0, Math.PI / 2, Math.PI / 2);
		cap3.position.y = 0.26;
		g.add(stone, cap3);
		g.position.set(q.x, y, q.z);
		g.rotation.y = yaw + Math.PI / 2;
		g.traverse((o) => (o.castShadow = o.receiveShadow = true));
		this.group.add(g);
	}
	// Flower, coconut and prasad stalls under bright awnings, both sides of the path up to the temple.
	bazaar(pts) {
		const b = new Batch();
		const R = rand(Math.round(pts[0].s * 7) + 3);
		const awn = [0xe8541e, 0xd8261c, 0x2a6ac0, 0xf0c419, 0x2f8a4a, 0xe0457b];
		for (let i = 3; i < pts.length - 3; i += 3) {
			const p = pts[i];
			const yaw = Math.atan2(p.dx, p.dz);
			for (const sg of [-1, 1]) {
				if (R() < 0.25) continue;
				const off = sg * 0.95;
				const x = p.x - p.dz * off, z = p.z + p.dx * off;
				const y = this.world.height(x, z);
				const fx = (u) => [x - p.dz * sg * u, z + p.dx * sg * u];
				b.add(T.box, place(x, y, z, yaw, 0.55, 0.26, 0.85), pick(R, [0x8a6a4a, 0xb08a5a, 0x6a4a2e])); // counter
				let [ax, az] = fx(0.12);
				for (const [px, pz] of [[-0.24, -0.38], [0.24, -0.38], [-0.24, 0.38], [0.24, 0.38]]) {
					const qx = ax + Math.cos(yaw) * px + Math.sin(yaw) * pz, qz = az - Math.sin(yaw) * px + Math.cos(yaw) * pz;
					b.add(T.box, place(qx, y, qz, yaw, 0.025, 0.62, 0.025), 0x5a4434);
				}
				b.add(T.box, place(ax, y + 0.62, az, yaw, 0.68, 0.025, 0.95, 0, -sg * 0.18), pick(R, awn)); // tarp awning
				// what's on the counter: marigold garlands, coconuts, prasad boxes, brass lotas
				const goods = R();
				for (let k = 0; k < 6; k++) {
					const gx = x + Math.sin(yaw) * (k - 2.5) * 0.13, gz = z + Math.cos(yaw) * (k - 2.5) * 0.13;
					if (goods < 0.4) b.add(T.ball, place(gx, y + 0.26, gz, 0, 0.09, 0.07, 0.09), k % 2 ? 0xff9a12 : 0xf0c419);
					else if (goods < 0.65) b.add(T.ball, place(gx, y + 0.26, gz, 0, 0.08, 0.08, 0.08), 0x6a4a2e);
					else if (goods < 0.85) b.add(T.box, place(gx, y + 0.26, gz, yaw, 0.08, 0.06, 0.1), pick(R, [0xd8261c, 0xf0c419, 0xe8e2d0]));
					else b.add(T.cyl, place(gx, y + 0.26, gz, 0, 0.06, 0.07, 0.06), 0xc8902a);
				}
				// garlands strung from the awning
				for (let k = 0; k < 3; k++) {
					const gx = ax + Math.sin(yaw) * (k - 1) * 0.28, gz = az + Math.cos(yaw) * (k - 1) * 0.28;
					b.add(T.cyl, place(gx - p.dz * sg * -0.28, y + 0.36, gz + p.dx * sg * -0.28, 0, 0.03, 0.24, 0.03), 0xff8a12);
				}
			}
			// a bell or a saffron flag on a pole every so often
			if (i % 12 === 0) {
				const x = p.x - p.dz * 1.45, z = p.z + p.dx * 1.45, y = this.world.height(x, z);
				b.add(T.box, place(x, y, z, 0, 0.02, 1.3, 0.02), 0x5a4434);
				b.add(T.box, place(x + 0.11, y + 1.2, z, 0, 0.22, 0.13, 0.01), 0xff8a1e);
			}
		}
		if (!b.empty) this.group.add(b.build(VCOL));
	}
	// The bus stand where the road ends: a paved yard with buses, pilgrim jeeps and autos parked in rows.
	busStand(st) {
		// beside the end of the road coming in, or the start of the road going out
		// set back from where the road ends, so a taxi or auto stopping there for the traveller has the kerb to itself
		const sr = st.out ? st.s + 3.8 : st.s - 3.8;
		const r = Roads.lookup(this.roads, sr) || this.route.at(sr, {});
		const l = Math.hypot(r.dx, r.dz) || 1;
		const dx = r.dx / l, dz = r.dz / l;
		const yaw = Math.atan2(dx, dz);
		// the yard sits beside the end of the road, on the left
		const cx = r.x + dz * 2.9 - dx * 0.8, cz = r.z - dx * 2.9 - dz * 0.8;
		st.x = cx;
		st.z = cz;
		const y = this.world.height(cx, cz);
		const b = new Batch();
		b.add(T.box, place(cx, y - 0.1, cz, yaw, 3.6, 0.16, 5.2), 0x77736c);
		for (const u of [-1.75, 1.75]) b.add(T.box, place(cx + Math.cos(yaw) * u, y, cz - Math.sin(yaw) * u, yaw, 0.06, 0.1, 5.2), 0xe8e4da);
		const g = new THREE.Group();
		g.add(b.build(VCOL));
		const R = rand(st.shrine * 31 + 9);
		const rows = [["bus", -1.05], ["bus", -0.1], ["car", 0.8], ["car", 1.4]];
		for (const [type, u] of rows) {
			for (let k = 0; k < (type === "bus" ? 1 : 2); k++) {
				const t = type === "car" && R() < 0.4 ? "auto" : type;
				const m = parkedVehicle(t, R).build(VCOL);
				const v = (k - 0.5) * (type === "bus" ? 0 : 1.6) + (type === "bus" ? (R() - 0.5) * 0.6 : 0);
				m.position.set(cx + Math.cos(yaw) * u + Math.sin(yaw) * v, y + 0.0, cz - Math.sin(yaw) * u + Math.cos(yaw) * v);
				m.rotation.y = yaw + (R() < 0.5 ? 0 : Math.PI);
				m.scale.setScalar(M);
				g.add(m);
			}
		}
		this.group.add(g);
	}
	// ---------- the railway ----------
	// Where each line's stations stand: a terminal at each end, with the whole train on the platform and a buffer
	// stop behind it, and halts where the line passes the towns, each platform clear of any bridge.
	planStations(line, spec) {
		const L = RAIL.platLen, A = line.A;
		// a platform wants straight track and no bridge under it: the cost of standing one centred at ac
		const bend = line.map((p, i) => {
			const a = line[Math.max(0, i - 6)], c = line[Math.min(line.length - 1, i + 6)];
			const ax = p.x - a.x, az = p.z - a.z, bx = c.x - p.x, bz = c.z - p.z;
			const cr = Math.abs(ax * bz - az * bx);
			return cr < 1e-9 ? 0 : (2 * cr) / (Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(c.x - a.x, c.z - a.z));
		});
		const cost = (ac, ideal, w = 1.5) => {
			if (ac - L / 2 < 0.8 || ac + L / 2 > A - 0.8) return Infinity;
			// the station stands in its town: drifting along the line costs more than a slope or a bend
			let c = Math.abs(ac - ideal) * w, lo = Infinity, hi = -Infinity;
			for (let i = 0; i < line.length; i++) {
				const p = line[i];
				if (p.a < ac - L / 2 - 3 || p.a > ac + L / 2 + 3) continue;
				if (p.bridge > 0.01) return Infinity;
				c += Math.max(0, bend[i] - 1 / 45) * 40;
				lo = Math.min(lo, p.ground);
				hi = Math.max(hi, p.ground);
			}
			// and level ground, so the platform is not on a hillside
			return c + (hi - lo) * 150;
		};
		const best = (ideal, lo, hi, ok = () => true, w = 1.5) => {
			let bc = Infinity, ba = null;
			for (let x = lo; x <= hi; x += 0.5) {
				if (!ok(x)) continue;
				const c = cost(x, ideal, w);
				if (c < bc) (bc = c), (ba = x);
			}
			return ba;
		};
		const ends = spec.ends;
		const o = 1.2 + L / 2, e = A - 1.2 - L / 2;
		// the distance along the line nearest a town
		const nearA = (lon, lat) => {
			const t = toWorld(lon, lat);
			let bd = Infinity, ba = 0;
			for (const p of line) {
				const d = Math.hypot(p.x - t.x, p.z - t.z);
				if (d < bd) (bd = d), (ba = p.a);
			}
			return ba;
		};
		// each terminal as near its own town as the line comes, on the best straight, level stretch there
		const io = clamp(nearA(ends[0][0], ends[0][1]), o, e), ie = clamp(nearA(ends[1][0], ends[1][1]), o, e);
		const stops = [{ hi: ends[0][2], name: ends[0][3], kind: "origin", ac: best(io, Math.max(o, io - 25), Math.min(e, io + 45), undefined, 4) ?? io }];
		const last = { hi: ends[1][2], name: ends[1][3], kind: "end", ac: best(ie, Math.max(o, ie - 45), Math.min(e, ie + 25), undefined, 4) ?? ie };
		const room = L + 12;
		for (const [lon, lat, hi, en] of spec.halts) {
			const t = toWorld(lon, lat);
			let near = null, bd = 6;
			for (const p of line) {
				const d = Math.hypot(p.x - t.x, p.z - t.z);
				if (d < bd) (bd = d), (near = p);
			}
			if (!near) continue;
			// the best straight stretch near the town; a halt with no room between its neighbours is left out
			const ac = best(near.a, near.a - 40, near.a + 40, (x) => [...stops, last].every((q) => Math.abs(q.ac - x) >= room));
			if (ac === null) continue;
			stops.push({ hi, name: en, kind: "halt", ac });
		}
		stops.push(last);
		stops.sort((a, b) => a.ac - b.ac);
		for (const st of stops) {
			st.s = aToS(line, st.ac);
			st.s0 = aToS(line, st.ac - L / 2);
			st.s1 = aToS(line, st.ac + L / 2);
		}
		const bump = (s) => {
			let k = 0;
			for (const st of stops) k = Math.max(k, smoothstep(st.s0 - 16, st.s0 - 3, s) * (1 - smoothstep(st.s1 + 3, st.s1 + 16, s)));
			return k;
		};
		return { stops, bump };
	}
	// The station in the track's own frame: u across towards the road (the platform side), v along the line.
	layoutStation(line, st) {
		const ac = st.a;
		st.line = line;
		st.len = RAIL.platLen;
		st.at = (u, v, out = {}) => {
			const p = railAt(line, ac + v, {});
			out.x = p.x + p.dz * u;
			out.z = p.z - p.dx * u;
			out.dx = p.dx;
			out.dz = p.dz;
			out.rail = p.y; // formation
			out.plat = p.y + RAIL.platform;
			out.ground = this.world.height(out.x, out.z);
			out.yaw = Math.atan2(p.dx, p.dz);
			return out;
		};
		const c = st.at(0, 0);
		st.x = c.x;
		st.z = c.z;
		st.yaw = c.yaw;
		st.rail = c.rail;
		st.plat = c.plat;
		// the forecourt where a taxi or an auto stops, between the station building and the road
		const T = st.at(3.75, -1.2);
		let bs = st.s, bd = Infinity;
		for (let s = st.s - 12; s <= st.s + 12; s += 0.05) {
			const r = Roads.lookup(this.roads, s);
			if (!r) continue;
			const d = Math.hypot(r.x - T.x, r.z - T.z);
			if (d < bd) (bd = d), (bs = s);
		}
		const r = Roads.lookup(this.roads, bs) || this.route.at(bs, {});
		const l = Math.hypot(r.dx, r.dz) || 1;
		st.sRoad = bs;
		st.laneRoad = ((-(T.x - r.x) * r.dz + (T.z - r.z) * r.dx) / l) / M; // metres right of the road's centre
		st.forecourt = this.world.height(T.x, T.z);
		for (const [u, v] of [[3.3, -5], [3.3, 5], [4.4, -5], [4.4, 5], [3.75, 0]]) {
			const q = st.at(u, v);
			st.forecourt = Math.max(st.forecourt, q.ground);
		}
		st.forecourt += 0.03;
		return st;
	}
	buildRail(pts) {
		const bedW = RAIL.bed, world = this.world;
		const tex = ballastTexture();
		const n = pts.length;
		// the ballast on its formation: a low embankment where the ground falls away, plain deck over a bridge
		{
			const cols = [[-bedW / 2 - 0.45, 0, 0], [-bedW / 2, 0.035, 0.02], [-bedW * 0.3, 0.07, 0.15], [bedW * 0.3, 0.07, 0.85], [bedW / 2, 0.035, 0.98], [bedW / 2 + 0.45, 0, 1]];
			const C = cols.length;
			const pos = new Float32Array(n * C * 3), uv = new Float32Array(n * C * 2), idx = [];
			for (let i = 0; i < n; i++) {
				const p = pts[i];
				for (let c = 0; c < C; c++) {
					const [o, h, u] = cols[c];
					const x = p.x - p.dz * o, z = p.z + p.dx * o;
					let y = p.y + h;
					// a low embankment down to the ground; a bridge or a viaduct (high over a valley) has plain sides
					const tall = smoothstep(0.7, 1.1, p.y - p.ground);
					if (c === 0 || c === C - 1) y = lerp(Math.min(world.height(x, z) - 0.03, p.y), p.y - 0.06, Math.max(p.bridge, tall));
					pos.set([x, y, z], (i * C + c) * 3);
					uv.set([u, p.a / tex.userData.len], (i * C + c) * 2);
				}
				if (i < n - 1) for (let c = 0; c < C - 1; c++) {
					const a = i * C + c, b = a + 1, d = a + C, e = d + 1;
					idx.push(a, b, d, b, e, d);
				}
			}
			const g = new THREE.BufferGeometry();
			g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
			g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
			g.setIndex(idx);
			g.computeVertexNormals();
			const bed = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
			bed.receiveShadow = true;
			this.group.add(bed);
		}
		// the two rails, 1,676 mm apart: a steel head on a web, standing on the sleepers
		const steel = new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.8, roughness: 0.38 });
		for (const sg of [-1, 1]) {
			const w = 0.036 * M, prof = [[-w * 1.6, 0.07], [-w, RAIL.top - 0.012], [-w, RAIL.top], [w, RAIL.top], [w, RAIL.top - 0.012], [w * 1.6, 0.07]];
			const C = prof.length;
			const pos = new Float32Array(n * C * 3), idx = [];
			for (let i = 0; i < n; i++) {
				const p = pts[i];
				for (let c = 0; c < C; c++) {
					const o = (sg * RAIL.gauge) / 2 + prof[c][0];
					pos.set([p.x - p.dz * o, p.y + prof[c][1], p.z + p.dx * o], (i * C + c) * 3);
				}
				if (i < n - 1) for (let c = 0; c < C - 1; c++) {
					const a = i * C + c, b = a + 1, d = a + C, e = d + 1;
					idx.push(a, d, b, b, d, e);
				}
			}
			const g = new THREE.BufferGeometry();
			g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
			g.setIndex(idx);
			g.computeVertexNormals();
			const m = new THREE.Mesh(g, steel);
			m.receiveShadow = true;
			this.group.add(m);
		}
		// overhead electrification: masts on the far side from the road, cantilevers, the contact wire and the
		// catenary above it; steel trusses on the bridges
		const b = new Batch();
		const wire = [], cat = [];
		pts.masts = [];
		let prev = null, nextMast = 2;
		for (let i = 0; i < n; i++) {
			const p = pts[i];
			const yaw = Math.atan2(p.dx, p.dz);
			if (p.onDeck) {
				for (const sg of [-1, 1]) {
					const q = { x: p.x - p.dz * sg * bedW * 0.5, z: p.z + p.dx * sg * bedW * 0.5 };
					b.add(T.box, place(q.x, p.y + 0.07, q.z, yaw, 0.08, 0.12, STEP * 1.02), 0x5e6d74);
					b.add(T.box, place(q.x, p.y + 1.25, q.z, yaw, 0.06, 0.06, STEP * 1.02), 0x5e6d74);
					b.add(T.box, place(q.x, p.y + 0.1, q.z, yaw, 0.05, 1.2, 0.05), 0x5e6d74);
					if (i % 2 === 0) b.add(T.box, place(q.x, p.y + 0.12, q.z, yaw, 0.03, 1.5, 0.03, 0, 0.6), 0x6e7d84);
				}
				if (i % 5 === 0) {
					const g = this.world.height(p.x, p.z) - 0.5;
					b.add(T.box, place(p.x, g, p.z, yaw, bedW * 0.9, p.y - g, 0.35), 0x8f8a80);
				}
			}
			// a viaduct of concrete piers where the line runs high over a valley
			if (!p.onDeck && p.y - p.ground > 0.9 && i % 6 === 0) {
				const g = this.world.height(p.x, p.z) - 0.3;
				b.add(T.box, place(p.x, g, p.z, yaw, bedW * 0.7, p.y - g - 0.02, 0.45), 0x9a958b);
				b.add(T.box, place(p.x, p.y - 0.3, p.z, yaw, bedW * 1.02, 0.28, STEP * 6.05), 0x8f8a80);
			}
			if (p.a >= nextMast) {
				nextMast = p.a + 5.2;
				const off = bedW * 0.5 + 0.16;
				const q = { x: p.x - p.dz * off, z: p.z + p.dx * off };
				const y = p.bridge > 0.5 ? p.y : this.world.height(q.x, q.z);
				const wy = p.y + RAIL.wire;
				// the mast, its cantilever and the register arm holding the wire over the track's centre
				b.add(T.box, place(q.x, y - 0.1, q.z, yaw, 0.1, wy + 0.55 - y, 0.07), 0x6b7378);
				const tip = new THREE.Vector3(p.x, wy, p.z);
				b.add(T.box, beam(new THREE.Vector3(q.x, wy + 0.06, q.z), tip, 0.035, 0.035), 0x6b7378);
				b.add(T.box, beam(new THREE.Vector3(q.x, wy + 0.5, q.z), new THREE.Vector3(p.x, wy + 0.36, p.z), 0.025, 0.025), 0x6b7378);
				b.add(T.box, beam(new THREE.Vector3(p.x, wy + 0.36, p.z), tip, 0.012, 0.012), 0x6b7378);
				if (prev && prev.distanceTo(tip) < 9) {
					wire.push(prev.x, prev.y, prev.z, tip.x, tip.y, tip.z);
					// the catenary sags from mast to mast, with droppers down to the contact wire
					let c0 = prev.clone().setY(prev.y + 0.36);
					for (let k = 1; k <= 6; k++) {
						const t = k / 6;
						const c1 = prev.clone().lerp(tip, t);
						const sag = Math.sin(t * Math.PI) * 0.2;
						c1.y += 0.36 - sag;
						cat.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
						if (k < 6) {
							const w0 = prev.clone().lerp(tip, t);
							cat.push(c1.x, c1.y, c1.z, w0.x, w0.y, w0.z);
						}
						c0 = c1;
					}
				}
				pts.masts.push({ a: p.a, y: wy });
				prev = tip;
			}
		}
		// buffer stops at the ends of the line
		for (const at of [0.35, pts.A - 0.35]) {
			const p = railAt(pts, at, {});
			const yaw = Math.atan2(p.dx, p.dz);
			for (const sg of [-1, 1]) {
				const o = sg * RAIL.gauge * 0.5;
				b.add(T.box, place(p.x - p.dz * o, p.y + 0.07, p.z + p.dx * o, yaw, 0.06, 0.3, 0.3), 0x2a2a2a);
			}
			b.add(T.box, place(p.x, p.y + 0.3, p.z, yaw, 0.95, 0.12, 0.08), 0xc8261c);
			for (const sg of [-1, 1]) {
				const o = sg * 0.32;
				b.add(T.box, place(p.x - p.dz * o, p.y + 0.31, p.z + p.dx * o, yaw, 0.12, 0.08, 0.12), 0xf2f2ee);
			}
		}
		this.group.add(b.build(VCOL));
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
		this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2e2e2e, transparent: true, opacity: 0.85 })));
		const g2 = new THREE.BufferGeometry();
		g2.setAttribute("position", new THREE.Float32BufferAttribute(cat, 3));
		this.group.add(new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 })));
	}
	// A station: a high-level platform on the road side of the line with its canopy, benches and yellow name
	// boards, the station building with a passage through to the forecourt, and the forecourt itself.
	station(st) {
		const line = st.line, L = st.len, W = RAIL.platW, E = RAIL.edge;
		const world = this.world;
		// the platform: its face to the track, the paved top with the yellow line, its back down to the ground
		const rows = line.filter((p) => p.a >= st.a - L / 2 && p.a <= st.a + L / 2);
		const top = [], side = [], uv = [];
		const ti = [], si = [];
		rows.forEach((p, i) => {
			const lx = p.dz, lz = -p.dx, y = p.y + RAIL.platform;
			const e = [p.x + lx * E, p.z + lz * E], k = [p.x + lx * (E + W), p.z + lz * (E + W)];
			top.push(e[0], y, e[1], k[0], y, k[1]);
			uv.push(0, (p.a - st.a) / 2.2, 1, (p.a - st.a) / 2.2);
			side.push(e[0], p.y - 0.05, e[1], e[0], y, e[1], k[0], y, k[1], k[0], Math.min(world.height(k[0], k[1]), p.y) - 0.15, k[1]);
			if (i < rows.length - 1) {
				const a = i * 2;
				ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
				const s0 = i * 4, s1 = s0 + 4;
				si.push(s0, s1, s0 + 1, s0 + 1, s1, s1 + 1, s0 + 2, s1 + 2, s0 + 3, s0 + 3, s1 + 2, s1 + 3);
			}
		});
		const gt = new THREE.BufferGeometry();
		gt.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
		gt.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
		gt.setIndex(ti);
		gt.computeVertexNormals();
		const gs = new THREE.BufferGeometry();
		gs.setAttribute("position", new THREE.Float32BufferAttribute(side, 3));
		gs.setIndex(si);
		gs.computeVertexNormals();
		const grp = new THREE.Group();
		const topM = new THREE.Mesh(gt, new THREE.MeshStandardMaterial({ map: platformTexture(), roughness: 0.85, side: THREE.DoubleSide }));
		const sideM = new THREE.Mesh(gs, new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 0.9, side: THREE.DoubleSide }));
		topM.receiveShadow = sideM.receiveShadow = true;
		grp.add(topM, sideM);
		// along the platform, each in its own frame: canopy, benches, a tea stall, lamps and the name boards
		const b = new Batch();
		const q = {};
		for (let v = -L * 0.3; v <= L * 0.3 + 1e-6; v += 2.4) {
			st.at(E + W * 0.62, v, q);
			b.add(T.cyl, place(q.x, q.plat, q.z, q.yaw, 0.07, 0.98, 0.07), 0x6a2a22);
			st.at(E + W * 0.5, v, q);
			b.add(T.box, place(q.x, q.plat + 0.98, q.z, q.yaw, W * 0.95, 0.04, 2.45, 0, 0.08), 0x7d8288);
		}
		st.at(E + W * 0.55, 0, q);
		st.at(E + 0.05, 0, q);
		b.add(T.box, place(q.x, q.plat + 0.9, q.z, q.yaw, 0.04, 0.12, L * 0.6 + 2.4), 0x8a3a2c); // the canopy's fascia
		for (const v of [-11, -6.5, 3, 12.5, 16]) {
			st.at(E + W * 0.8, v, q);
			b.add(T.box, place(q.x, q.plat, q.z, q.yaw, 0.16, 0.12, 0.55), 0x50565c);
			b.add(T.box, place(q.x + q.dz * 0.07, q.plat + 0.12, q.z - q.dx * 0.07, q.yaw, 0.03, 0.12, 0.55), 0x50565c);
		}
		// a tea stall with its kettle and glasses
		st.at(E + W * 0.72, -3.4, q);
		b.add(T.box, place(q.x, q.plat, q.z, q.yaw, 0.42, 0.3, 0.75), 0x2f6a8a);
		b.add(T.box, place(q.x, q.plat + 0.3, q.z, q.yaw, 0.44, 0.03, 0.78), 0xe8e2d0);
		b.add(T.cyl, place(q.x, q.plat + 0.33, q.z + 0.15, 0, 0.09, 0.1, 0.09), 0xc8902a);
		// lamps beyond the canopy
		for (const v of [-L * 0.42, -L * 0.36, L * 0.36, L * 0.42]) {
			st.at(E + W * 0.85, v, q);
			b.add(T.box, place(q.x, q.plat, q.z, q.yaw, 0.04, 1.1, 0.04), 0x50565c);
			b.add(T.box, place(q.x - q.dz * 0.12, q.plat + 1.08, q.z + q.dx * 0.12, q.yaw, 0.28, 0.03, 0.06), 0x50565c);
		}
		const board = new THREE.MeshStandardMaterial({ map: boardTexture(st.hi, st.name), roughness: 0.6 });
		const postM = new THREE.MeshStandardMaterial({ color: 0x222222 });
		st.boards = [];
		for (const v of [-L * 0.43, -3.9, 3.9, L * 0.43]) {
			st.at(E + W * 0.72, v, q);
			for (const dv of [-0.42, 0.42]) {
				const p2 = st.at(E + W * 0.72, v + dv, {});
				b.add(T.box, place(p2.x, p2.plat, p2.z, q.yaw, 0.04, 0.95, 0.04), 0x222222);
			}
			const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 1.05), [board, board, board, board, board, board]);
			s.position.set(q.x, q.plat + 0.8, q.z);
			s.rotation.y = q.yaw;
			s.castShadow = true;
			grp.add(s);
			st.boards.push(v);
		}
		void postM;
		// the station building, cream with maroon bands, floored at platform level, a passage through the middle
		const yP = st.plat, B0 = E + W + 0.02, B1 = B0 + 1.25;
		let gMin = st.forecourt;
		for (const [u, v] of [[B0, -6], [B0, 6], [B1, -6], [B1, 6], [4.6, -6.5], [4.6, 6.5], [B1, 0]]) gMin = Math.min(gMin, st.at(u, v).ground);
		const yG = gMin - 0.12;
		const fr = st.at(0, 0);
		const lx = fr.dz, lz = -fr.dx, ax = fr.dx, az = fr.dz;
		const at = (u, v) => [fr.x + lx * u + ax * v, fr.z + lz * u + az * v];
		for (const [v0, v1] of [[-5.6, -0.48], [0.48, 5.6]]) {
			const [cx, cz] = at((B0 + B1) / 2, (v0 + v1) / 2);
			b.add(T.box, place(cx, yG, cz, fr.yaw, B1 - B0, yP + 1.12 - yG, v1 - v0), 0xefe3c8);
			b.add(T.box, place(cx, yP + 1.12, cz, fr.yaw, B1 - B0 + 0.08, 0.1, v1 - v0 + 0.08), 0x8a2a22); // parapet
			b.add(T.box, place(cx, yP + 0.72, cz, fr.yaw, B1 - B0 + 0.04, 0.06, v1 - v0 + 0.04), 0x8a2a22); // band
			b.add(T.box, place(cx, yG, cz, fr.yaw, B1 - B0 + 0.03, yP - yG + 0.02, v1 - v0 + 0.03), 0x9a8a72); // plinth
		}
		{
			const [cx, cz] = at((B0 + B1) / 2, 0);
			b.add(T.box, place(cx, yG, cz, fr.yaw, B1 - B0, yP - yG, 0.96), 0xb9b2a4); // the passage floor
			b.add(T.box, place(cx, yP + 1.0, cz, fr.yaw, B1 - B0 + 0.02, 0.22, 1.0), 0xefe3c8);
			b.add(T.box, place(cx, yP + 1.22, cz, fr.yaw, B1 - B0 + 0.1, 0.12, 1.2), 0x8a2a22); // a raised gable over the entrance
		}
		// steps down from the passage to the forecourt
		const rise = Math.max(0.05, yP - st.forecourt), nSteps = Math.max(2, Math.round(rise / 0.05));
		const run = Math.min(0.9, Math.max(0.35, rise * 1.4));
		for (let k = 0; k < nSteps; k++) {
			const u = B1 + (run * (k + 0.5)) / nSteps;
			const [cx, cz] = at(u, 0);
			b.add(T.box, place(cx, yG, cz, fr.yaw, run / nSteps + 0.01, yP - (rise * (k + 1)) / nSteps - yG + 0.01, 1.4), 0xa8a196);
		}
		st.steps = { u0: B1, u1: B1 + run, rise, n: nSteps, top: yP };
		st.building = { u0: B0, u1: B1 };
		// the forecourt, paved, with two autos waiting at the kerb
		{
			const u0 = B1 + run, u1 = 4.65;
			const [cx, cz] = at((u0 + u1) / 2, 0);
			b.add(T.box, place(cx, yG, cz, fr.yaw, u1 - u0, st.forecourt - yG, 13), 0x8a857c);
		}
		grp.add(b.build(VCOL));
		// facades: arched windows and doors in the cream walls, and the big name board over the entrance
		const fac = new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.8, transparent: true, alphaTest: 0.5 });
		for (const [u, flip] of [[B1 + 0.002, 1], [B0 - 0.002, -1]]) {
			for (const [v0, v1] of [[-5.6, -0.48], [0.48, 5.6]]) {
				const m = new THREE.Mesh(new THREE.PlaneGeometry(v1 - v0, 0.62), fac);
				const [cx, cz] = at(u, (v0 + v1) / 2);
				m.position.set(cx, yP + 0.36, cz);
				m.rotation.y = fr.yaw + (flip > 0 ? Math.PI / 2 : -Math.PI / 2);
				grp.add(m);
			}
		}
		const big = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshStandardMaterial({ map: boardTexture(st.hi, st.name), roughness: 0.6 }));
		const [bx, bz] = at(B1 + 0.05, 0);
		big.position.set(bx, yP + 1.5, bz);
		big.rotation.y = fr.yaw + Math.PI / 2;
		grp.add(big);
		const R = rand(Math.round(st.a * 13) + 7);
		for (const v of [3.2, 4.9]) {
			const m = parkedVehicle("auto", R).build(VCOL);
			const [cx, cz] = at(3.85, v);
			m.position.set(cx, st.forecourt, cz);
			m.rotation.y = fr.yaw + (v > 4 ? 0.3 : -0.2);
			m.scale.setScalar(M);
			grp.add(m);
		}
		grp.traverse((o) => (o.castShadow = o.receiveShadow = true));
		this.group.add(grp);
	}
}
// A point on a railway line at distance a along the track.
export function railAt(pts, x, out = {}) {
	x = clamp(x, 0, pts.A);
	const i = search(pts, "a", x), a = pts[i], b = pts[i + 1] || a;
	const t = clamp((x - a.a) / (b.a - a.a || 1), 0, 1);
	out.x = lerp(a.x, b.x, t);
	out.y = lerp(a.y, b.y, t);
	out.z = lerp(a.z, b.z, t);
	let dx = lerp(a.dx, b.dx, t), dz = lerp(a.dz, b.dz, t);
	const l = Math.hypot(dx, dz) || 1;
	out.dx = dx / l;
	out.dz = dz / l;
	out.s = lerp(a.s, b.s, t);
	out.bridge = Math.max(a.bridge, b.bridge);
	return out;
}
// The top of one rail (side -1 left, +1 right of the direction of travel), where a wheel's tread runs.
export function railHead(pts, x, side, out = {}) {
	railAt(pts, x, out);
	const o = (side * RAIL.gauge) / 2;
	out.x += -out.dz * o;
	out.z += out.dx * o;
	out.y += RAIL.top;
	return out;
}
// Height of the contact wire over the line at distance a: straight from mast to mast.
export function wireAt(pts, x) {
	const m = pts.masts;
	if (!m || m.length < 2) return railAt(pts, x).y + RAIL.wire;
	const i = search(m, "a", x), a = m[i], b = m[i + 1] || a;
	return lerp(a.y, b.y, clamp((x - a.a) / (b.a - a.a || 1), 0, 1));
}
// The lines the trains run on, by the shrine their leg ends at: the terminals' name boards (Hindi, English) and the
// halts where the line passes a town (left out where there is no room for a platform between its neighbours).
// To Tirupati, the line of the weekly Sainagar Shirdi–Tirupati Express (17418): Puntamba, Manmad, Aurangabad,
// Nanded, Secunderabad, then by Raichur and Guntakal to Kadapa and Tirupati (the drawn line sweeps past Manmad).
const LINES = [
	{
		to: "tirupati", stock: "icf", ends: [[74.48, 19.78, "साईनगर शिर्डी", "SAINAGAR SHIRDI"], [79.42, 13.63, "तिरुपति", "TIRUPATI"]],
		halts: [[77.3, 19.15, "हजूर साहिब नांदेड़", "H.S. NANDED"], [78.5, 17.44, "सिकंदराबाद जंक्शन", "SECUNDERABAD JN"], [77.37, 15.17, "गुंतकल जंक्शन", "GUNTAKAL JN"], [78.82, 14.47, "कडपा", "KADAPA"]],
	},
	{
		to: "kedarnath", stock: "lhb", ends: [[79.42, 13.63, "तिरुपति", "TIRUPATI"], [78.16, 29.95, "हरिद्वार जंक्शन", "HARIDWAR JN"]],
		halts: [[78.49, 17.39, "सिकंदराबाद जंक्शन", "SECUNDERABAD JN"], [79.09, 21.15, "नागपुर", "NAGPUR"], [78.57, 25.45, "झाँसी जंक्शन", "JHANSI JN"], [77.21, 28.61, "नई दिल्ली", "NEW DELHI"]],
	},
];
// The Kailash journey's railway, for the Train choice: Delhi to Tanakpur, as the Purnagiri Jan Shatabdi (12036) and
// the Delhi–Tanakpur Express run, by Moradabad and Bareilly (the drawn line keeps beside the road through Pilibhit).
const K_LINES = [
	{
		// (the line ends at Tanakpur, at the foot of the hills, not carried on up into them)
		to: "narayan", stock: "icf", tail: -7, ends: [[77.23, 28.66, "दिल्ली जंक्शन", "DELHI JN"], [80.109, 29.074, "टनकपुर", "TANAKPUR"]],
		halts: [[78.78, 28.84, "मुरादाबाद जंक्शन", "MORADABAD JN"], [79.43, 28.37, "बरेली जंक्शन", "BAREILLY JN"], [79.8, 28.63, "पीलीभीत जंक्शन", "PILIBHIT JN"]],
	},
];
// How far round each Kailash stop the road stops (world units): far enough that the walk from the road to the
// traveller's spot before the altar begins on the path, not straight out of the bus's door.
const K_CLEAR = { omparvat: 4.4 };
// How far around each shrine the roads stop, at a bus stand, and the last stretch is on foot (world units).
const CLEAR = { tirupati: 10.5, shirdi: 6.5 };
// Where the pilgrim path and its stalls stop short of the temple, leaving its courtyard open (world units).
const COURT = { shirdi: 4.8 };
// Platform paving: the white coping at the edge, the yellow line, then square pavers.
let _plat;
function platformTexture() {
	if (_plat) return _plat;
	const R = rand(57);
	_plat = canvasTex(128, 256, (g, W, H) => {
		g.fillStyle = "#b3ab9c";
		g.fillRect(0, 0, W, H);
		for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) {
			const v = 160 + R() * 26;
			g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
			g.fillRect(x + 1, y + 1, 14, 14);
		}
		g.fillStyle = "#d8d4cc";
		g.fillRect(0, 0, 8, H);
		g.fillStyle = "#e8c21e";
		g.fillRect(12, 0, 8, H);
		speckle(g, W, H, R, 1600, 0.2, 0.06);
	});
	return _plat;
}
let _fac;
function facadeTexture() {
	if (_fac) return _fac;
	_fac = canvasTex(256, 64, (g, W, H) => {
		g.clearRect(0, 0, W, H);
		for (let x = 10; x < W - 20; x += 34) {
			g.fillStyle = "#3a2a22";
			g.beginPath();
			g.moveTo(x, H - 6);
			g.lineTo(x, 26);
			g.arc(x + 9, 26, 9, Math.PI, 0);
			g.lineTo(x + 18, H - 6);
			g.closePath();
			g.fill();
			g.strokeStyle = "#8a2a22";
			g.lineWidth = 3;
			g.stroke();
			g.fillStyle = "rgba(255,220,150,0.35)";
			g.fillRect(x + 3, 30, 12, 10);
		}
	});
	_fac.wrapS = _fac.wrapT = THREE.ClampToEdgeWrapping;
	return _fac;
}
