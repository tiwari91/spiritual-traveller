// The roads and railways under the traveller, built to life scale (0.28 world units per metre, as the
// figures are): national highways with painted lines, ghat roads with crash barriers and kerbs, narrow
// Garhwal hill roads with parapets, the stone trek to Kedarnath, and broad-gauge electrified track with
// stations and bridges. The road follows the route; the railway runs alongside it on the long legs.
import * as THREE from "three";
import { Batch, T, VCOL, beam, place } from "./batch.js";
import { GAURIKUND, RIVERS, toGeo, toWorld } from "./geo.js";
import { clamp, lerp, rand, segDist, smoothstep } from "./util.js";

export const M = 0.28; // world units per metre
const STEP = 0.35;
// Paved width and shoulder, in metres.
const KIND = {
	nh: { paved: 7.5, shoulder: 2.4, lift: 0.05 },
	ghat: { paved: 7, shoulder: 1.2, lift: 0.05 },
	hill: { paved: 5.5, shoulder: 1.2, lift: 0.05 },
	trek: { paved: 2.6, shoulder: 0.3, lift: 0.04 },
};
const RAIL_OFFSET = 3.4; // world units to the right of the road
const RAIL_BED = 5.6; // metres

// Which landscape a point is in.
export function region(lon, lat) {
	if (lat > 29.95 && lon > 78.25) return "garhwal";
	if (lat > 29.6) return "doon";
	if (lat > 18.3 && lon < 74.3) return "sahyadri";
	if (lat > 25) return "gangetic";
	if (lat > 19.5) return "central";
	if (lat > 14.4) return "deccan";
	return "south";
}
function roadKind(lon, lat) {
	const r = region(lon, lat);
	if (r === "garhwal") return "hill";
	if ((lat > 18.85 && lon < 74.0) || Math.hypot(lon - 79.38, lat - 13.66) < 0.09) return "ghat";
	return "nh";
}
const SOIL = { sahyadri: "#8a4a2c", deccan: "#9a7a52", south: "#8e6a48", central: "#8c7656", gangetic: "#9b8a68", doon: "#7d7360", garhwal: "#7c776e" };

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
		if (kind === "ghat") {
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
				// the same meander world.js draws
				pts.push(toWorld(lerp(a[0], b[0], t) + Math.sin(t * 9 + i) * 0.03, lerp(a[1], b[1], t) + Math.cos(t * 7 + i) * 0.03));
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
		for (let i = 0; i < pts.length; i++) {
			const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
			const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
			pts[i].dx = (q.x - p.x) / l;
			pts[i].dz = (q.z - p.z) / l;
		}
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
function bridges(pts, rivers, world, halfW) {
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
				spans.push({ s: lerp(p.s, q.s, t), half: Math.min(4, r.w / 2 / Math.max(0.35, sin) + 0.5), deck: world.height(a.x, a.z) + 0.25 + 0.55 });
			}
		}
	}
	for (const p of pts) {
		p.bridge = 0;
		p.y = p.ground;
		for (const sp of spans) {
			const d = Math.abs(p.s - sp.s);
			const k = smoothstep(sp.half + halfW + 1.6, sp.half, d);
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
		// where the traveller can change from one kind of transport to the next
		this.at = {
			pune: near(73.86, 18.52, ch[1]),
			tirupatiIn: near(79.42, 13.63, ch[1]),
			tirupatiOut: near(79.42, 13.63, ch[2]),
			rishikesh: near(78.29, 30.09, ch[2]),
			gauri: near(GAURIKUND[0], GAURIKUND[1], ch[2]),
			gauriBack: near(GAURIKUND[0], GAURIKUND[1], ch[3]),
			rudraBack: near(78.98, 30.28, ch[3]),
		};
		const A = this.at;
		// stretches of road and rail; the return legs reuse the road they came up, so it is not drawn twice
		this.roadRuns = [[0.4, ch[0].s1 - 2.8], [ch[1].s0 + 2.8, ch[1].s1 - 3.2], [A.tirupatiOut, A.gauri], [A.rudraBack, ch[3].s1 - 2.6]];
		this.trekRun = [A.gauri, ch[2].s1 - 3.2];
		this.railRuns = [[A.pune, A.tirupatiIn], [A.tirupatiOut, A.rishikesh]];
		this.rivers = riverLines();
		this.roads = this.roadRuns.map(([a, b]) => bridges(samplePath(route, world, a, b, 0), this.rivers, world, 1.8));
		this.trek = bridges(samplePath(route, world, this.trekRun[0], this.trekRun[1], 0, { kind: "trek" }), this.rivers, world, 0.5);
		// keep the line well away from the shrines (Tirupati station is only a few units below Tirumala here)
		const shrines = route.chapters.map((c) => route.at(c.s1, {}));
		const clear = (p) => shrines.every((w) => Math.hypot(p.x - w.x, p.z - w.z) > 9);
		this.rails = this.railRuns.map(([a, b]) => bridges(samplePath(route, world, a, b, RAIL_OFFSET, { kind: "nh" }).filter(clear), this.rivers, world, 0.9));
		for (const p of this.roads) this.buildRoad(p);
		this.buildRoad(this.trek);
		for (const p of this.rails) this.buildRail(p);
		this.buildStations();
	}

	// ---------- queries ----------
	static lookup(paths, s) {
		for (const pts of paths) {
			if (!(pts.length > 1) || !(s >= pts[0].s - 1e-6 && s <= pts[pts.length - 1].s + 1e-6)) continue;
			const i = clamp(Math.floor((s - pts[0].s) / STEP), 0, pts.length - 2);
			const a = pts[i], b = pts[i + 1];
			const t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
			return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), dx: lerp(a.dx, b.dx, t), dz: lerp(a.dz, b.dz, t), kind: a.kind, region: a.region, bridge: a.bridge };
		}
		return null;
	}
	// A point on the road (lane in metres from the centre, positive to the right; India drives on the left).
	road(s, lane = 0, out = {}) {
		const p = Roads.lookup(this.roads, s) || Roads.lookup([this.trek], s);
		if (!p) return null;
		const l = Math.hypot(p.dx, p.dz) || 1;
		p.dx /= l;
		p.dz /= l;
		p.x += -p.dz * lane * M;
		p.z += p.dx * lane * M;
		if (!p.bridge) p.y = this.world.height(p.x, p.z);
		return Object.assign(out, p);
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
	index() {
		this.hash = new Map();
		const put = (x, z, half) => {
			const key = Math.floor(x / 4) * 100003 + Math.floor(z / 4);
			let c = this.hash.get(key);
			if (!c) this.hash.set(key, (c = []));
			c.push(x, z, half);
		};
		for (const pts of this.roads) for (const p of pts) put(p.x, p.z, ((KIND[p.kind].paved / 2 + KIND[p.kind].shoulder) * M) + 0.15);
		for (const p of this.trek) put(p.x, p.z, 0.4);
		for (const pts of this.rails) for (const p of pts) put(p.x, p.z, (RAIL_BED / 2) * M + 0.3);
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
					b.add(T.box, place(q.x, p.y + k.lift, q.z, yaw, 0.12, 0.3, STEP * 1.02), i % 6 < 3 ? 0xe8e4da : 0x2a2a2a);
				}
				if (p.onDeck && i % 5 === 0) {
					const g = world.height(p.x, p.z) - 0.5;
					b.add(T.box, place(p.x, g, p.z, yaw, outer * 1.6, p.y - g, 0.3), 0x9a958b);
				}
				continue;
			}
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
			if (p.kind === "nh" && i % 12 === 0) {
				const q = side(p, -(outer + 0.4));
				const y = world.height(q.x, q.z);
				b.add(T.taper, place(q.x, y, q.z, yaw, 0.07, 2.5, 0.07), 0xb5b0a6);
				b.add(T.box, place(q.x, y + 2.35, q.z, yaw + Math.PI / 2, 0.04, 0.04, 0.5), 0x8a857c);
				const top = new THREE.Vector3(q.x, y + 2.38, q.z);
				if (lastPole && lastPole.distanceTo(top) < STEP * 14) wires.push([lastPole.clone(), top.clone()]);
				lastPole = top;
			}
			// a milestone on the left verge every so often
			if (p.kind !== "trek" && p.s - lastMile > 22 && i > 4 && i < pts.length - 6) {
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
	buildRail(pts) {
		const bedW = RAIL_BED * M;
		const tex = ballastTexture();
		const bed = new THREE.Mesh(ribbon(pts, bedW, this.world, 0.07, tex.userData.len, 3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
		bed.receiveShadow = true;
		this.group.add(bed);
		// the two rails, 1,676 mm apart, as thin steel strips standing on the sleepers
		const steel = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.85, roughness: 0.3 });
		for (const sg of [-1, 1]) {
			const off = (sg * 1.676 * M) / 2;
			const shifted = pts.map((p) => {
				const x = p.x - p.dz * off, z = p.z + p.dx * off;
				return Object.assign({}, p, { x, z });
			});
			const m = new THREE.Mesh(ribbon(shifted, 0.075 * M * 2, this.world, 0.11, 1, 2), steel);
			this.group.add(m);
		}
		// overhead electrification: masts, cantilevers, the contact wire; steel trusses on bridges
		const b = new Batch();
		const wire = [];
		let prev = null;
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];
			const yaw = Math.atan2(p.dx, p.dz);
			const ground = p.bridge > 0.5 ? p.y : this.world.height(p.x, p.z);
			if (p.onDeck) {
				for (const sg of [-1, 1]) {
					const q = { x: p.x - p.dz * sg * bedW * 0.5, z: p.z + p.dx * sg * bedW * 0.5 };
					b.add(T.box, place(q.x, p.y + 0.07, q.z, yaw, 0.08, 0.12, STEP * 1.02), 0x5e6d74);
					b.add(T.box, place(q.x, p.y + 1.25, q.z, yaw, 0.06, 0.06, STEP * 1.02), 0x5e6d74);
					b.add(T.box, place(q.x, p.y + 0.1, q.z, yaw, 0.05, 1.2, 0.05), 0x5e6d74);
					if (i % 2 === 0) b.add(T.box, place(q.x, p.y + 0.12, q.z, yaw, 0.03, 1.5, 0.03, sg * 0.0, 0.6), 0x6e7d84);
				}
				if (i % 5 === 0) {
					const g = this.world.height(p.x, p.z) - 0.5;
					b.add(T.box, place(p.x, g, p.z, yaw, bedW * 0.9, p.y - g, 0.35), 0x8f8a80);
				}
			}
			if (i % 17 === 0) {
				const q = { x: p.x + p.dz * (bedW * 0.5 + 0.12), z: p.z - p.dx * (bedW * 0.5 + 0.12) };
				const y = p.bridge > 0.5 ? p.y : this.world.height(q.x, q.z);
				b.add(T.box, place(q.x, y, q.z, yaw, 0.09, 2.6, 0.09), 0x6b7378);
				const top = new THREE.Vector3(q.x, y + 2.25, q.z);
				const tip = new THREE.Vector3(p.x, ground + 1.65, p.z);
				b.add(T.box, beam(top, tip, 0.04, 0.04), 0x6b7378);
				b.add(T.box, beam(new THREE.Vector3(q.x, y + 2.55, q.z), tip, 0.025, 0.025), 0x6b7378);
				if (prev && prev.distanceTo(tip) < STEP * 19) wire.push(prev.x, prev.y, prev.z, tip.x, tip.y, tip.z);
				prev = tip;
			}
		}
		this.group.add(b.build(VCOL));
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
		this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.8 })));
	}
	// Stations where the line passes the towns, with platforms, shelters and yellow name boards.
	buildStations() {
		const STATIONS = [
			[73.86, 18.52, "पुणे जंक्शन", "PUNE JN"], [75.91, 17.68, "सोलापुर", "SOLAPUR"], [78.49, 17.39, "सिकंदराबाद जंक्शन", "SECUNDERABAD JN"],
			[78.04, 15.83, "कर्नूल सिटी", "KURNOOL CITY"], [79.42, 13.63, "तिरुपति", "TIRUPATI"], [79.09, 21.15, "नागपुर", "NAGPUR"],
			[78.57, 25.45, "झाँसी जंक्शन", "JHANSI JN"], [77.21, 28.61, "नई दिल्ली", "NEW DELHI"], [78.16, 29.95, "हरिद्वार जंक्शन", "HARIDWAR JN"],
			[78.29, 30.09, "योग नगरी ऋषिकेश", "YOG NAGARI RISHIKESH"],
		];
		this.stations = [];
		for (const [lon, lat, hi, en] of STATIONS) {
			const t = toWorld(lon, lat);
			let best = null, bd = 6;
			for (const pts of this.rails) for (const p of pts) {
				const d = Math.hypot(p.x - t.x, p.z - t.z);
				if (d < bd && !p.bridge) {
					bd = d;
					best = p;
				}
			}
			if (!best || this.stations.some((s) => Math.abs(s.s - best.s) < 20)) continue;
			this.stations.push({ s: best.s, name: en });
			this.station(best, hi, en);
		}
	}
	station(p, hi, en) {
		const g = new THREE.Group();
		const b = new Batch();
		const len = 22, bedW = RAIL_BED * M;
		const y0 = this.world.height(p.x, p.z);
		// lay the station out in the track's own frame: x across (positive away from the road), z along
		const off = bedW / 2 + 0.75;
		b.add(T.box, place(off, 0, 0, 0, 1.4, 0.3, len), 0xb9b2a4); // platform
		b.add(T.box, place(off - 0.66, 0.3, 0, 0, 0.08, 0.01, len), 0xf0c419); // yellow edge
		for (let z = -len * 0.3; z <= len * 0.3; z += 1.8) {
			b.add(T.cyl, place(off + 0.2, 0.3, z, 0, 0.06, 1.0, 0.06), 0x7a2a22);
			b.add(T.box, place(off + 0.2, 1.3, z, 0, 0.9, 0.04, 0.4), 0x8a3a2c);
		}
		b.add(T.box, place(off + 0.2, 1.3, 0, 0, 1.25, 0.06, len * 0.65), 0x6d6a64); // shelter roof
		b.add(T.box, place(off + 1.9, 0, 0, 0, 1.8, 1.1, 6), 0xefe3c8); // station building
		b.add(T.box, place(off + 1.9, 1.1, 0, 0, 1.9, 0.12, 6.1), 0x8a2a22);
		b.add(T.box, place(off + 1.9, 0.75, 0, 0, 1.85, 0.08, 6.05), 0x8a2a22);
		for (const z of [-2, -0.7, 0.7, 2]) b.add(T.box, place(off + 0.99, 0.15, z, 0, 0.02, 0.6, 0.35), 0x2b2620);
		for (const z of [-4, -2, 2, 4]) b.add(T.box, place(off + 0.35, 0.3, z, 0, 0.18, 0.12, 0.5), 0x50565c); // benches
		g.add(b.build(VCOL));
		const board = new THREE.MeshStandardMaterial({ map: boardTexture(hi, en), roughness: 0.6 });
		for (const z of [-len * 0.42, len * 0.42]) {
			for (const x of [-0.25, 0.25]) {
				const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: 0x222222 }));
				post.position.set(off + 0.1 + x, 0.75, z);
				g.add(post);
			}
			const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 1.0), [board, board, board, board, board, board]);
			// the board runs along the platform, readable from the train
			s.position.set(off + 0.1, 1.2, z);
			g.add(s);
		}
		g.traverse((o) => (o.castShadow = o.receiveShadow = true));
		// track frame: z along the line, x away from the road (the rail is right of the road)
		const yaw = Math.atan2(p.dx, p.dz);
		g.position.set(p.x, y0 + 0.02, p.z);
		g.rotation.y = yaw + Math.PI;
		this.group.add(g);
	}
}
