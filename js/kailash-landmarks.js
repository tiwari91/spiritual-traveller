// The stops of the Kailash journey, built like the shrines in landmarks.js: each in its own frame, facing local +z.
// The traveller stands in front at about z = 3.3 and looks towards -z, at the mountain beyond; an altar of stones,
// its front at about z = 1.9 and its top about 0.35 high, takes the aarti (aarti.js K_PLACES). Each builder returns
// { g, peaks, crowd, world }, where world(decor, h) puts the big pieces in place on the map: Kailash itself, Om
// Parvat, the snow summit of Gurla Mandhata, Chiu, Dirapuk and Zuthulphuk gompas and Gauri Kund.
// Everything at a stop keeps off the route (the way in and out, and the way across to where the traveller stands),
// so nobody walks through a hut and the camera following them is not stopped by a flag string.
import * as THREE from "three";
import { Batch, T, VCOL, place } from "./batch.js";
import { ROUTE, toWorld } from "./geo.js";
import { KAILASH, P } from "./kailash-geo.js";
import { addAnimal } from "./life.js";
import { cave, dhuni, saffronFlag } from "./kailash-scenery.js";
import { glowTexture, peak, terrainDetail } from "./landmarks.js";
import { clamp, fbm, lerp, rand, smoothstep } from "./util.js";

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0 }, o));
const M = 0.28; // world units per metre, as the figures
const U = 40; // world units to the degree
// A point at a bearing (degrees from north, clockwise) and distance (units) from the drawn Kailash.
const K = (b, d) => [KAILASH[0] + (d * Math.sin((b * Math.PI) / 180)) / U, KAILASH[1] + (d * Math.cos((b * Math.PI) / 180)) / U];
// the prayer flags' five colours, in their order: sky, cloud, fire, water, earth
const FLAG = [0x2a5fb8, 0xf2f0ea, 0xc8261e, 0x2f8a4a, 0xf2c21e];
const WHITE = 0xf1eee6, RED = 0x8a2a20, OCHRE = 0xb8862e, STONE = 0x8a8076, DARK = 0x1e1c1a;

// ---------- the route, to keep clear of ----------
// Every segment of the route in world units, for distance queries.
let _segs = null;
function segs() {
	if (_segs) return _segs;
	_segs = [];
	for (const leg of ROUTE) for (let i = 0; i < leg.pts.length - 1; i++) {
		const a = toWorld(leg.pts[i][0], leg.pts[i][1]), b = toWorld(leg.pts[i + 1][0], leg.pts[i + 1][1]);
		_segs.push([a.x, a.z, b.x, b.z]);
	}
	return _segs;
}
function segDist(px, pz, [ax, az, bx, bz]) {
	const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
	const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
	return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
// distance from a world point to the route
export function wayDist(x, z) {
	let d = Infinity;
	for (const s of segs()) {
		if (Math.abs(s[0] - x) > 30 && Math.abs(s[2] - x) > 30) continue;
		d = Math.min(d, segDist(x, z, s));
	}
	return d;
}

// ---------- a stop's frame ----------
// The helpers every builder uses: local to world and back, the ground height in the local frame, and whether a spot
// (radius r) is clear of the route, of the way from the route to where the traveller stands, and of what is already
// placed there.
function frame(ctx) {
	const { world, x: X, y: Y, z: Z, facing, shrine } = ctx;
	const c = Math.cos(facing), sn = Math.sin(facing);
	const toW = (lx, lz) => ({ x: X + lx * c + lz * sn, z: Z - lx * sn + lz * c });
	const ground = (lx, lz) => {
		const w = toW(lx, lz);
		return world.height(w.x, w.z) - Y + 0.05;
	};
	const rest = shrine.rest;
	// the way across from where the route passes the stop to the traveller's spot: from the route's points 3 to 6
	// units out, straight to the spot
	const rw = toW(rest[0], rest[1]);
	const ways = [];
	for (const s of segs()) {
		for (const t of [0, 0.25, 0.5, 0.75, 1]) {
			const px = lerp(s[0], s[2], t), pz = lerp(s[1], s[3], t), d = Math.hypot(px - X, pz - Z);
			if (d > 2.5 && d < 6.5) ways.push([px, pz, rw.x, rw.z]);
		}
	}
	const taken = [];
	const free = (lx, lz, r = 0.4) => {
		const w = toW(lx, lz);
		// the altar, the aarti, the traveller's spot and the way between them
		if (Math.abs(lx) < 0.95 + r && lz > 0.9 - r && lz < 4.0 + r) return false;
		if (Math.hypot(lx - rest[0], lz - rest[1]) < 0.7 + r) return false;
		for (const s of segs()) if (segDist(w.x, w.z, s) < 1.0 + r && Math.hypot(w.x - X, w.z - Z) > 1.2) return false;
		for (const s of ways) if (segDist(w.x, w.z, s) < 0.6 + r) return false;
		for (const [tx, tz, tr] of taken) if (Math.hypot(lx - tx, lz - tz) < tr + r) return false;
		return true;
	};
	const take = (lx, lz, r) => taken.push([lx, lz, r]);
	// the first of the candidate spots that is free (radius r), taken
	// how far the ground falls across a spot of radius r
	const tilt = (lx, lz, r) => {
		let lo = Infinity, hi = -Infinity;
		for (const [u, v] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
			const y = ground(lx + u, lz + v);
			lo = Math.min(lo, y);
			hi = Math.max(hi, y);
		}
		return hi - lo;
	};
	// (a building's spot also wants the ground near enough level: `most`, the fall across it it can be set into)
	const spot = (cands, r, most = Infinity) => {
		for (const [lx, lz] of cands) if (free(lx, lz, r) && Math.hypot(lx, lz) < 4.6 && tilt(lx, lz, r) <= most) {
			take(lx, lz, r);
			return [lx, lz];
		}
		return null;
	};
	// candidate spots on rings round the stop, in a fixed order
	const ring = (r0, r1, n = 24, seed = 1) => {
		const R = rand(seed), out = [];
		for (let k = 0; k < n; k++) {
			const a = R() * Math.PI * 2, d = lerp(r0, r1, R());
			out.push([Math.sin(a) * d, Math.cos(a) * d]);
		}
		return out;
	};
	// the lowest ground under a spot of radius r, to set a building into the slope
	const floor = (lx, lz, r) => Math.min(...[[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([u, v]) => ground(lx + u, lz + v)));
	return { toW, ground, free, take, spot, ring, rest, tilt, floor };
}

// ---------- pieces ----------
// The altar: a plinth of dressed stones, a slab on top, a cairn of stones behind it with a few prayer-flag
// bundles, a brass lamp and a dish of offerings.
function altar(b, F) {
	const y = F.ground(0, 1.55);
	b.add(T.box, place(0, y - 0.05, 1.6, 0, 1.0, 0.24, 0.56), STONE);
	b.add(T.box, place(0, y + 0.19, 1.6, 0, 1.08, 0.09, 0.62), 0xa09686);
	for (let i = 0; i < 6; i++) b.add(T.box, place(-0.42 + i * 0.17, y - 0.05, 1.89, 0, 0.15, 0.22, 0.02), [0x7a7068, 0x8e857a, 0x6e665e][i % 3]);
	const R = rand(17);
	for (let i = 0; i < 9; i++) {
		const s = 0.11 - i * 0.008;
		b.add(T.ball, place((R() - 0.5) * 0.08, y + 0.26 + i * 0.07, 1.42 + (R() - 0.5) * 0.06, R() * 6, s, s * 0.6, s * 0.9), [0x9a9086, 0xd8d2c6, 0x7a7068][i % 3]);
	}
	b.add(T.cyl, place(0.32, y + 0.28, 1.72, 0, 0.07, 0.03, 0.07), 0xc8902a);
	b.add(T.cyl, place(-0.3, y + 0.28, 1.74, 0, 0.12, 0.025, 0.12), 0xc8902a);
	for (let i = 0; i < 4; i++) b.add(T.ball, place(-0.3 + (i - 1.5) * 0.03, y + 0.31, 1.74, 0, 0.03, 0.03, 0.03), i % 2 ? 0xff9a12 : 0xf0c419);
}
// A string of prayer flags from a to b (local points with heights), sagging, one small cloth every so often.
function flagString(b, a, c, sag = 0.12, step = 0.11) {
	const L = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = Math.max(2, Math.floor(L / step));
	const yaw = Math.atan2(c[0] - a[0], c[2] - a[2]);
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const x = lerp(a[0], c[0], t), y = lerp(a[1], c[1], t) - Math.sin(t * Math.PI) * sag, z = lerp(a[2], c[2], t);
		if (i > 0 && i < n) b.add(T.box, place(x, y - 0.075, z, yaw + Math.PI / 2, 0.075, 0.07, 0.004, 0, Math.sin(i * 1.7) * 0.25), FLAG[i % 5]);
		if (i < n) {
			const x2 = lerp(a[0], c[0], (i + 1) / n), y2 = lerp(a[1], c[1], (i + 1) / n) - Math.sin(((i + 1) / n) * Math.PI) * sag, z2 = lerp(a[2], c[2], (i + 1) / n);
			const d = Math.hypot(x2 - x, y2 - y, z2 - z);
			b.add(T.box, place(x, y, z, Math.atan2(x2 - x, z2 - z), 0.006, 0.006, d, -Math.asin(clamp((y2 - y) / d, -1, 1))), 0xd8d0c0);
		}
	}
}
// A pole with strings of flags run out from its top to stones on the ground all round (a lhatse, or Tarboche).
function flagPole(b, F, x, z, h, r, strings, seed = 3, ground = F.ground) {
	const y = ground(x, z);
	b.add(T.taper, place(x, y - 0.05, z, 0, 0.09 * (h / 2), h, 0.09 * (h / 2)), 0x5a3a22);
	b.add(T.ball, place(x, y + h - 0.02, z, 0, 0.12, 0.16, 0.12), 0xd8a83a);
	// the pole wrapped in old flags at its foot
	b.add(T.cyl, place(x, y - 0.02, z, 0, 0.32, 0.5, 0.32), 0x6a5a4a);
	b.add(T.cyl, place(x, y, z, 0, 0.6, 0.14, 0.6), 0x8a8076);
	const R = rand(seed);
	for (let k = 0; k < strings; k++) {
		const a = (k / strings) * Math.PI * 2 + R() * 0.1, rr = r * (0.75 + R() * 0.3);
		const ex = x + Math.sin(a) * rr, ez = z + Math.cos(a) * rr;
		flagString(b, [x, y + h * (0.9 + R() * 0.08), z], [ex, ground(ex, ez) + 0.04, ez], 0.06, 0.1);
		b.add(T.ball, place(ex, ground(ex, ez) - 0.03, ez, R() * 6, 0.1, 0.08, 0.1), 0x8a8076);
	}
}
// A chorten: a whitewashed stupa on a stepped base, the dome, the spire of rings and a gilded top.
function chorten(b, x, y, z, s = 1, yaw = 0, gate = false) {
	if (gate) {
		// the gateway chorten: its base on two piers with a passage through
		for (const sx of [-1, 1]) b.add(T.box, place(x + Math.cos(yaw) * sx * 0.36 * s, y - 0.05, z - Math.sin(yaw) * sx * 0.36 * s, yaw, 0.28 * s, 0.6 * s, 0.7 * s), WHITE);
		b.add(T.box, place(x, y + 0.5 * s, z, yaw, 1.0 * s, 0.18 * s, 0.72 * s), WHITE);
		b.add(T.box, place(x, y + 0.4 * s, z, yaw, 0.46 * s, 0.1 * s, 0.73 * s), RED);
		y += 0.68 * s;
	} else {
		b.add(T.box, place(x, y - 0.05, z, yaw, 0.7 * s, 0.22 * s, 0.7 * s), WHITE);
		y += 0.17 * s;
	}
	b.add(T.box, place(x, y, z, yaw, 0.56 * s, 0.12 * s, 0.56 * s), WHITE);
	b.add(T.box, place(x, y + 0.12 * s, z, yaw, 0.46 * s, 0.1 * s, 0.46 * s), WHITE);
	b.add(T.box, place(x, y + 0.22 * s, z, yaw, 0.38 * s, 0.06 * s, 0.38 * s), RED);
	b.add(T.ball, place(x, y + 0.24 * s, z, 0, 0.42 * s, 0.4 * s, 0.42 * s), WHITE);
	b.add(T.box, place(x, y + 0.6 * s, z, yaw, 0.18 * s, 0.08 * s, 0.18 * s), WHITE);
	b.add(T.taper, place(x, y + 0.66 * s, z, 0, 0.14 * s, 0.34 * s, 0.14 * s), OCHRE);
	for (let i = 0; i < 4; i++) b.add(T.cyl, place(x, y + 0.7 * s + i * 0.07 * s, z, 0, (0.15 - i * 0.02) * s, 0.02 * s, (0.15 - i * 0.02) * s), 0xd8a83a);
	b.add(T.ball, place(x, y + 1.0 * s, z, 0, 0.07 * s, 0.07 * s, 0.07 * s), 0xe8b84a);
}
// A whitewashed, flat-roofed Tibetan house or gompa wing: walls that lean in a little, black-framed windows, the red
// band under the parapet, prayer flags on the roof corners.
function tibetHouse(b, x, y, z, w, d, h, yaw, o = {}) {
	const c = Math.cos(yaw), s = Math.sin(yaw), L = (u, v) => [x + u * c + v * s, z - u * s + v * c];
	b.add(T.box, place(x, y - 0.1, z, yaw, w, h + 0.1, d), o.wall ?? WHITE);
	b.add(T.box, place(x, y + h - 0.12, z, yaw, w + 0.03, 0.12, d + 0.03), o.band ?? RED);
	b.add(T.box, place(x, y + h, z, yaw, w + 0.05, 0.05, d + 0.05), 0x3a2e26);
	// windows: black frames wider at the foot, a lintel over each
	const nw = Math.max(1, Math.round(w / 0.32));
	for (const fv of [1, -1]) for (let i = 0; i < nw; i++) {
		const u = (i + 0.5) / nw * w - w / 2, [wx, wz] = L(u, fv * (d / 2 + 0.005));
		for (const fy of h > 0.6 ? [0.18, 0.5] : [0.22]) {
			b.add(T.box, place(wx, y + fy * (h / 0.75), wz, yaw, 0.13, 0.13, 0.012), DARK);
			b.add(T.box, place(wx, y + fy * (h / 0.75) + 0.135, wz, yaw, 0.16, 0.025, 0.02), 0x6a3a22);
		}
	}
	if (o.door) {
		const [dx, dz] = L(0, d / 2 + 0.01);
		b.add(T.box, place(dx, y - 0.02, dz, yaw, 0.16, 0.3, 0.02), 0x5a1e14);
		b.add(T.box, place(dx, y + 0.3, dz, yaw, 0.22, 0.04, 0.04), o.band ?? RED);
	}
	if (o.flags !== false) for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
		const [fx, fz] = L(u * 0.92, v * 0.92);
		b.add(T.box, place(fx, y + h, fz, 0, 0.012, 0.32, 0.012), 0x5a3a22);
		for (let k = 0; k < 3; k++) b.add(T.box, place(fx, y + h + 0.16 + k * 0.05, fz + 0.04, yaw, 0.004, 0.045, 0.07), FLAG[(((k + Math.round(u * 7 + v * 3)) % 5) + 5) % 5]);
	}
}
// A prefab hut of the camps on the Indian side: cream walls, a pitched roof of painted tin, a door and windows.
function hut(b, x, y, z, w, d, yaw, roof) {
	b.add(T.box, place(x, y - 0.1, z, yaw, w, 0.62, d), 0xe8e2d0);
	b.add(T.gable, place(x, y + 0.52, z, yaw + Math.PI / 2, d + 0.12, 0.28, w + 0.12), roof);
	const c = Math.cos(yaw), s = Math.sin(yaw);
	const fx = x + s * (d / 2 + 0.006), fz = z + c * (d / 2 + 0.006);
	b.add(T.box, place(fx, y - 0.02, fz, yaw, 0.14, 0.32, 0.01), 0x6a4a2e);
	for (const u of [-w * 0.3, w * 0.3]) b.add(T.box, place(fx + c * u, y + 0.2, fz - s * u, yaw, 0.14, 0.12, 0.012), 0x3a4a5a);
}
// A heap of mani stones: flat slabs carved with Om mani padme hum, some painted, a pile of horns on top of some.
function mani(b, x, y, z, n, R) {
	for (let i = 0; i < n; i++) {
		const a = R() * 6.3, d = Math.sqrt(R()) * 0.32;
		b.add(T.box, place(x + Math.cos(a) * d, y - 0.02 + R() * 0.05 * (1 - d), z + Math.sin(a) * d, R() * 6, 0.1 + R() * 0.08, 0.025, 0.07 + R() * 0.06, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5), R() < 0.2 ? [0x2a5fb8, 0xc8261e, 0xf2c21e, 0x2f8a4a][Math.floor(R() * 4)] : [0x9a9086, 0x8a8076, 0xb0a698, 0x7a7068][Math.floor(R() * 4)]);
	}
}
// Snow lying in patches.
function snowPatch(b, x, y, z, r, R) {
	for (let i = 0; i < 3; i++) b.add(T.cyl, place(x + (R() - 0.5) * r, y - 0.02, z + (R() - 0.5) * r, R() * 3, r * (0.6 + R() * 0.6), 0.025, r * (0.4 + R() * 0.5)), 0xeef2f6);
}
// A scatter of rocks and boulders, grey with lichen.
function rocks(b, F, n, r0, r1, R, col = STONE) {
	for (let i = 0; i < n; i++) {
		const a = R() * 6.3, d = lerp(r0, r1, R()), lx = Math.sin(a) * d, lz = Math.cos(a) * d, s = 0.04 + R() * 0.14;
		if (!F.free(lx, lz, s)) continue;
		b.add(T.ball, place(lx, F.ground(lx, lz) - s * 0.35, lz, R() * 6, s, s * (0.5 + R() * 0.4), s * (0.7 + R() * 0.5)), new THREE.Color(col).offsetHSL(0, 0, (R() - 0.5) * 0.12));
	}
}
// A spot for a flag pole whose strings run out to radius rim: the pole and the whole ring of its strings' feet clear.
function poleSpot(F, cands, rim) {
	for (const [x, z] of cands) {
		if (Math.hypot(x, z) > 4.6 || !F.free(x, z, 0.3)) continue;
		let ok = true;
		for (let k = 0; k < 16 && ok; k++) {
			const a = (k / 16) * Math.PI * 2;
			ok = F.free(x + Math.sin(a) * rim, z + Math.cos(a) * rim, 0.05);
		}
		if (ok) {
			F.take(x, z, rim + 0.1);
			return [x, z];
		}
	}
	return null;
}
// Places for the pilgrims standing about: free spots near the altar first, then further out.
function crowdAt(F, n, seed) {
	const R = rand(seed), out = [];
	const cands = [[-1.35, 2.2], [1.45, 2.05], [-1.7, 3.6], [1.8, 3.4], [-2.2, 1.1], [2.3, 1.3], [-0.9, 4.3], [1.0, 4.4], [-2.6, 2.6], [2.7, 2.7]];
	for (let k = 0; k < 20; k++) cands.push([(R() - 0.5) * 6, 0.5 + R() * 4]);
	for (const [x, z] of cands) {
		if (out.length >= n) break;
		// near the altar but not in the aarti's way
		if (Math.abs(x) < 1.15 && z > 0.9 && z < 4.2) continue;
		if (!F.free(x, z, 0.25)) continue;
		F.take(x, z, 0.25);
		out.push([x, z, F.ground(x, z)]);
	}
	return out;
}
function finish(b, g) {
	if (!b.empty) g.add(b.build(VCOL));
	return g;
}

// ---------- the mountains ----------
// Kailash: a great four-sided dome of dark rock in level strata, every ledge holding snow, the faces turned to the
// four quarters, the south face cut by the vertical gully of the 'stairway', snow thick towards the rounded summit.
function kailashMesh(H = 12, R0 = 6.2) {
	const NA = 220, NH = 140;
	const N = (NA + 1) * (NH + 1);
	const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
	const tt = new Float32Array(N), band = new Float32Array(N), gul = new Float32Array(N), face = new Float32Array(N);
	// strata of uneven thickness, each a ledge stepping back
	const R = rand(17), cuts = [0];
	while (cuts[cuts.length - 1] < 1) cuts.push(cuts[cuts.length - 1] + 0.042 + R() * 0.05);
	const bandAt = (t) => {
		let i = 0;
		while (cuts[i + 1] < t) i++;
		return [i, (t - cuts[i]) / (cuts[i + 1] - cuts[i])];
	};
	// each stratum its own: how much snow its ledge holds (some none), how broken that line is, its rock's tone
	const bandP = cuts.map(() => ({ w: R() < 0.22 ? 0 : 0.05 + R() * R() * 0.34, gap: 0.42 + R() * 0.22, fq: 2 + R() * 5, o: R() * 40, tone: R() }));
	const bidx = new Uint16Array(N);
	for (let j = 0; j <= NH; j++) {
		// the first ring is a skirt, straight down into the ground under the foot of the faces
		const t = Math.max(0, (j - 1) / (NH - 1));
		for (let i = 0; i <= NA; i++) {
			// round from the south-east corner, so the seam lies on a corner; 0 is south (+z)
			const th = (i / NA) * Math.PI * 2 + Math.PI / 4;
			const k = j * (NA + 1) + i;
			// the plan: nearly square, its sides to the four quarters, the corners a little rounded, rounder up high
			const p = lerp(7, 4.2, t * t);
			const cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
			const plan = 1 / Math.pow(Math.pow(cs, p) + Math.pow(sn, p), 1 / p);
			// the profile: a broad foot of scree, steep straight faces, the shoulders rolling over into the dome
			// the profile: a foot of scree, then four steep faces drawing in (a truncated pyramid), and the summit dome
			const u = Math.max(0, (t - 0.08) / 0.92);
			// (the north face, over Dirapuk, is a sheer wall: it keeps its width higher and then drops in steeply)
			const northy = smoothstep(0.3, 1, -Math.cos(th));
			let r = R0 * (t < 0.08 ? 1 - t * 1.6 : 0.872 * (1 - 0.76 * Math.pow(u, lerp(1.05, 2.3, northy))) * (u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1));
			// the strata dip gently to the west and wander a little
			const [bi, f] = bandAt(clamp(t + 0.035 * Math.sin(th) + 0.012 * Math.sin(th * 3 + 1) + 0.03 * (fbm(th * 1.6 + 5, t * 2.5, 3) - 0.5), 0, 0.999));
			const jag = fbm(th * 5 + bi, bi * 0.7, 2);
			// each ledge steps back by a little; some bands are cliffs, some shelves (the snowy ones the broader shelves)
			r *= 1 - (0.006 + 0.011 * jag) * (0.6 + bandP[bi].w * 3) * smoothstep(0.1, 0.9, f) * (t < 0.93 ? 1 : 0);
			// the gully down the middle of the south face (the 'stairway'), and a lesser one on the north
			const ds = Math.atan2(Math.sin(th), Math.cos(th)), dn = Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI));
			const gS = Math.exp(-((ds / (0.07 + 0.04 * fbm(t * 9, 3, 2))) ** 2)) * smoothstep(0.1, 0.22, t) * (1 - smoothstep(0.8, 0.92, t));
			const gN = Math.exp(-((dn / 0.045) ** 2)) * smoothstep(0.2, 0.3, t) * (1 - smoothstep(0.7, 0.8, t)) * 0.6;
			r *= 1 - 0.12 * (gS + gN);
			// buttresses and broken rock
			r *= 1 + (fbm(th * 7 + 3, t * 10, 3) - 0.5) * 0.07 * (1 - t);
			const x = Math.sin(th) * r * plan, z = Math.cos(th) * r * plan;
			let y = t * H;
			pos.set([x, j === 0 ? -5 : y, z], k * 3);
			tt[k] = t;
			band[k] = f;
			gul[k] = gS + gN;
			face[k] = jag;
			bidx[k] = bi;
		}
	}
	const idx = [];
	for (let j = 0; j < NH; j++) for (let i = 0; i < NA; i++) {
		const a = j * (NA + 1) + i, b2 = a + 1, c = a + NA + 1, d = c + 1;
		idx.push(a, b2, c, b2, d, c);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const nrm = g.attributes.normal;
	// A snow mountain (as it is seen from Dirapuk and Ashtapad, or from the Barkha plain in summer): the snow lies
	// over the whole of the pyramid and the dome, and the dark grey-brown rock shows through in horizontal bands
	// like steps, where each stratum's face is too steep to hold it, with more rock showing lower down and in the
	// broken ground round the foot. The gully down the south face is a dark cleft with snow banked in it; the north
	// face, in shadow, holds a little less and its snow is bluer.
	const rock = new THREE.Color(0x3a332d), rock2 = new THREE.Color(0x574a3e), rock3 = new THREE.Color(0x6d5e4e), snow = new THREE.Color(0xf2f4f7), blue = new THREE.Color(0xb8c6da), tmp = new THREE.Color();
	for (let k = 0; k < N; k++) {
		const t = tt[k], f = band[k], ny = nrm.getY(k), nz = nrm.getZ(k);
		const i = k % (NA + 1), th = (i / NA) * Math.PI * 2 + Math.PI / 4;
		const north = smoothstep(0.2, -0.8, nz);
		const broken = fbm(th * 22, t * 40, 2);
		const P = bandP[bidx[k]];
		// the stratum's face: bare rock through its lower, steeper part (f small), snow on the shelf at its top; the
		// line between them wanders along the band, and the bare band is wider where the band is a cliff (P.w small)
		const along = fbm(th * P.fq + P.o, t * 7 + P.o, 3) + 0.25 * (fbm(th * 17 + P.o, t * 30, 2) - 0.5);
		const edge = 0.42 + 0.3 * (1 - P.w) + 0.2 * (along - 0.5);
		const bare = (1 - smoothstep(edge - 0.07, edge + 0.07, f)) * smoothstep(0.04, 0.2, f + 0.1 * (broken - 0.5));
		// more rock lower down and where the slope is steepest; the flat shelves and the summit all snow
		const low = 1 - 0.4 * smoothstep(0.25, 0.75, t);
		const steep = 0.75 + 0.25 * (1 - smoothstep(0.25, 0.6, ny));
		let s = 1 - clamp(bare * (0.8 + 0.2 * low) * steep + 0.25 * low * smoothstep(0.55, 0.75, broken) * (1 - smoothstep(0.3, 0.6, ny)), 0, 1);
		// the north face, in shadow and sheer, is mostly dark rock with the snow in lines along its ledges
		s *= 1 - north * 0.5 * (1 - smoothstep(0.55, 0.8, f));
		s = Math.max(s, smoothstep(0.82, 0.95, ny) * 0.9); // the shelves
		s = Math.max(s, smoothstep(0.76, 0.86, t + (fbm(th * 4, t * 6, 3) - 0.5) * 0.1)); // the dome
		s *= smoothstep(0.05, 0.18, t); // the scree at the foot
		s *= 1 - north * 0.15;
		// the cleft: snow banked in the gully, a dark shadow line down its middle
		s = lerp(s, 0.95, smoothstep(0.2, 0.5, gul[k]) * (1 - smoothstep(0.2, 0.75, t) * 0.3));
		s *= 1 - 0.75 * smoothstep(0.55, 0.9, gul[k]);
		tmp.copy(rock).lerp(rock2, fbm(th * 3, t * 9, 2) * (0.5 + P.tone)).lerp(rock3, smoothstep(0.55, 0.8, face[k]) * 0.6 * P.tone);
		tmp.multiplyScalar(0.9 + 0.14 * (1 - f));
		if (t < 0.08) tmp.lerp(new THREE.Color(0x6a5e52), 0.6);
		tmp.lerp(snow, clamp(s, 0, 1)).lerp(blue, clamp(s, 0, 1) * north * 0.4);
		col.set([tmp.r, tmp.g, tmp.b], k * 3);
	}
	g.setAttribute("color", new THREE.BufferAttribute(col, 3));
	const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
	m.castShadow = true;
	m.receiveShadow = true;
	m.name = "kailash";
	return m;
}
// A snow massif: peak()'s ridged cone drawn out into a broad dome, its shoulders rounded and only a small summit.
function massif(r, h, seed, snowLine, rock) {
	const m = peak(r, h, seed, snowLine, rock), p = m.geometry.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const t = clamp(p.getY(i) / h, 0, 1);
		if (t >= 0.999) continue;
		const k = lerp(1, Math.sqrt(1 - t * t) / (1 - t), 0.65);
		p.setX(i, p.getX(i) * k);
		p.setZ(i, p.getZ(i) * k);
	}
	m.geometry.computeVertexNormals();
	// dark rock ribs and icefalls where the slopes are too steep to hold snow, between the white of the glaciers
	const n = m.geometry.attributes.normal, c = m.geometry.attributes.color, rk = new THREE.Color(0x4a423c), tmp = new THREE.Color();
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
		const rib = smoothstep(0.55, 0.75, fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + (y / h) * 4, 3));
		const steep = smoothstep(0.8, 0.5, n.getY(i));
		const k = clamp(steep * (0.4 + 0.6 * rib) + rib * 0.25 * (1 - y / h), 0, 0.85);
		tmp.setRGB(c.getX(i), c.getY(i), c.getZ(i)).lerp(rk, k);
		c.setXYZ(i, tmp.r, tmp.g, tmp.b);
	}
	return m;
}
// A collar of cloud round the mountain's flanks, drifting slowly.
function cloudCollar(cx, y0, cz, r, n, seed) {
	const g = new THREE.Group();
	g.position.set(cx, y0, cz);
	const R = rand(seed);
	const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe4e8ee, transparent: true, opacity: 0.32, depthWrite: false });
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2 + R() * 0.3, d = r * (0.9 + R() * 0.3);
		const s = new THREE.Sprite(mat);
		s.position.set(Math.sin(a) * d, (R() - 0.5) * 1.2, Math.cos(a) * d);
		s.scale.set(5 + R() * 4, 1.6 + R() * 1.2, 1);
		g.add(s);
	}
	// turned a little each frame as it is drawn
	const first = g.children[0];
	if (first) first.onBeforeRender = () => (g.rotation.y = performance.now() * 0.000006);
	return g;
}
// Om Parvat: a sharp snow pyramid, the face towards the camp marked with ॐ in the snow lying in its gullies.
function omTexture() {
	const c = document.createElement("canvas");
	c.width = c.height = 512;
	const g = c.getContext("2d");
	g.clearRect(0, 0, 512, 512);
	// the syllable in snow: thick soft strokes broken up by rock showing through
	g.fillStyle = "#f6f8fb";
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.font = `700 330px "Tiro Devanagari Hindi", "Noto Sans Devanagari", serif`;
	g.shadowColor = "rgba(246,248,251,0.9)";
	g.shadowBlur = 14;
	g.fillText("ॐ", 256, 270);
	g.shadowBlur = 0;
	const R = rand(23);
	g.globalCompositeOperation = "destination-out";
	for (let i = 0; i < 900; i++) {
		g.fillStyle = `rgba(0,0,0,${0.25 + R() * 0.5})`;
		g.fillRect(R() * 512, R() * 512, 2 + R() * 6, 1 + R() * 2);
	}
	g.globalCompositeOperation = "source-over";
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}
function omParvat(h = 10, r = 3.1, toward = [0, 1]) {
	const grp = new THREE.Group();
	const m = peak(r, h, 7, 0.62, 0x4a4440);
	grp.add(m);
	// the ॐ: a skin over the part of the face that looks towards the camp, a hair above it
	const src = m.geometry, p = src.attributes.position, n = src.attributes.normal;
	const [tx, tz] = toward, ux = tz, uz = -tx; // across the face
	const pos = [], uv = [], idx = [], map = new Map();
	const ix = src.index ? src.index.array : null;
	const vert = (i) => {
		if (map.has(i)) return map.get(i);
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const k = pos.length / 3;
		pos.push(x + n.getX(i) * 0.03, y + n.getY(i) * 0.03, z + n.getZ(i) * 0.03);
		// projected flat onto a plane facing the camp: across, and up the face
		uv.push(0.5 + (x * ux + z * uz) / (r * 1.1), (y / h - 0.22) / 0.62);
		map.set(i, k);
		return k;
	};
	const facing = (i) => (n.getX(i) * tx + n.getZ(i) * tz) > 0.25 && p.getY(i) > h * 0.18 && p.getY(i) < h * 0.88;
	const tri = (a, b, c) => {
		if (facing(a) && facing(b) && facing(c)) idx.push(vert(a), vert(b), vert(c));
	};
	if (ix) for (let i = 0; i < ix.length; i += 3) tri(ix[i], ix[i + 1], ix[i + 2]);
	else for (let i = 0; i < p.count; i += 3) tri(i, i + 1, i + 2);
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	const tex = omTexture();
	tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
	const om = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.75, depthWrite: true }));
	om.name = "om";
	grp.add(om);
	return grp;
}
// The ground height at a world point, and a place for a piece on the map set in the ground.
function wpos(h, lon, lat, sink = 0) {
	const w = toWorld(lon, lat);
	return new THREE.Vector3(w.x, h.world.height(w.x, w.z) - sink, w.z);
}
// A spot near (lon, lat) clear of the route by `clear` units, searched outward along the bearing `away` (radians from
// north) first, then round about.
function clearSpot(lon, lat, clear, away = null) {
	const w = toWorld(lon, lat);
	const tries = [];
	for (let d = 0; d <= 4; d += 0.4) for (let k = 0; k < 16; k++) {
		const a = away !== null ? away + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 8 : (k / 16) * Math.PI * 2;
		tries.push([w.x + Math.sin(a) * d, w.z - Math.cos(a) * d]);
		if (d === 0) break;
	}
	for (const [x, z] of tries) if (wayDist(x, z) >= clear) return { x, z };
	return { x: w.x, z: w.z };
}

// A gompa on its rock: a whitewashed hall with the red band of a temple, a smaller wing, a chorten, flags; the whole
// on an outcrop, in world units at (x, z).
function gompa(world, x, z, yaw, s = 1, seed = 1, rock = true) {
	const b = new Batch();
	const y = world.height(x, z);
	const R = rand(seed);
	if (rock) for (let i = 0; i < 7; i++) {
		const a = R() * 6.3, d = R() * 0.6 * s, r = (0.35 + R() * 0.35) * s;
		b.add(T.ball, place(x + Math.cos(a) * d, y - r * 0.5, z + Math.sin(a) * d, R() * 6, r * 1.2, r, r), new THREE.Color(0x7a6c62).offsetHSL(0, 0, (R() - 0.5) * 0.08));
	}
	const top = y + (rock ? 0.35 * s : 0);
	tibetHouse(b, x, top, z, 0.9 * s, 0.7 * s, 0.7 * s, yaw, { band: 0x7a1e18, door: true });
	const c = Math.cos(yaw), sn = Math.sin(yaw);
	tibetHouse(b, x + c * 0.7 * s, top - 0.05, z - sn * 0.7 * s, 0.5 * s, 0.6 * s, 0.45 * s, yaw, { band: RED, flags: false });
	// the gilded roof ornaments: the victory banners at the corners, the wheel and deer over the door
	for (const u of [-0.4, 0.4]) b.add(T.cyl, place(x + c * u * s, top + 0.72 * s, z - sn * u * s, 0, 0.06 * s, 0.16 * s, 0.06 * s), 0xd8a83a);
	b.add(T.cyl, place(x + sn * 0.3 * s, top + 0.75 * s, z + c * 0.3 * s, 0, 0.1 * s, 0.1 * s, 0.03 * s), 0xe8b84a);
	chorten(b, x - c * 0.8 * s, world.height(x - c * 0.8 * s, z + sn * 0.8 * s), z + sn * 0.8 * s, 0.6 * s, yaw);
	const F = { ground: (lx, lz) => world.height(lx, lz) };
	flagPole(b, F, x + sn * 0.9 * s - c * 0.3 * s, z + c * 0.9 * s + sn * 0.3 * s, 1.2 * s, 0.9 * s, 8, seed + 5, (px, pz) => world.height(px, pz));
	const m = b.build(VCOL);
	return m;
}

// A deodar for the ashram's grove: a trunk and three tiers of dark green.
function conifer(b, x, y, z, s = 1, seed = 1) {
	b.add(T.cyl, place(x, y - 0.05, z, 0, 0.06 * s, 0.5 * s, 0.06 * s), 0x4a3828);
	for (const [h, r, w] of [[0.3, 0.42, 0.5], [0.62, 0.34, 0.42], [0.9, 0.24, 0.36]]) b.add(T.cone, place(x, y + h * s, z, seed, r * s, w * s, r * s), seed % 2 ? 0x2e4a2a : 0x344f2c);
}

// ---------- the stops ----------
// Narayan Ashram, on its terraces above the Kali: the temple behind the altar, the long hall with its tin roof and
// verandah, the meditation hut and the swami's samadhi, beds of marigold, deodars round about, and sadhus.
function narayan(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(131);
	altar(b, F);
	const y0 = F.ground(0, 0.6);
	b.add(T.box, place(0, y0 - 0.06, 0.4, 0, 1.2, 0.16, 0.9), 0x9a9286);
	b.add(T.box, place(0, y0 + 0.1, 0.25, 0, 0.8, 0.62, 0.7), 0xf1eee6);
	b.add(T.box, place(0, y0 + 0.66, 0.25, 0, 0.86, 0.05, 0.76), 0x8a2a22);
	b.add(T.taper, place(0, y0 + 0.7, 0.25, 0, 0.5, 0.75, 0.5), 0xe8dcc0);
	b.add(T.ball, place(0, y0 + 1.43, 0.25, 0, 0.1, 0.1, 0.1), 0xc8962a);
	b.add(T.box, place(0, y0 + 0.14, 0.61, 0, 0.26, 0.4, 0.02), 0x5a3a24);
	saffronFlag(b, 0.5, y0 + 0.66, 0.0, 0.7);
	// the hall, set back on the hillside
	const H = F.floor(0, -1.9, 1.0);
	b.add(T.box, place(0, H - 0.1, -1.9, 0, 2.8, 0.72, 1.1), 0xf1eee6);
	b.add(T.box, place(0, H + 0.6, -1.9, 0, 2.86, 0.04, 1.16), 0x8a2a22);
	b.add(T.gable, place(0, H + 0.62, -1.9, Math.PI / 2, 1.22, 0.32, 2.92), 0x5a6a3a);
	for (const u of [-1.0, -0.5, 0, 0.5, 1.0]) b.add(T.box, place(u, H + 0.18, -1.34, 0, 0.18, 0.26, 0.012), 0x3a4a5a);
	for (const u of [-1.2, -0.6, 0.6, 1.2]) b.add(T.box, place(u, H - 0.1, -1.3, 0, 0.04, 0.7, 0.04), 0x6a4a2e);
	b.add(T.box, place(0, H - 0.1, -1.34, 0, 0.3, 0.46, 0.02), 0x5a3a24);
	// the meditation hut and the samadhi
	const k = F.spot([[2.2, -1.3], [-2.3, -1.4], [2.4, 0.2], [-2.4, 0.3]], 0.5, 0.25);
	if (k) {
		const y = F.floor(k[0], k[1], 0.4);
		b.add(T.box, place(k[0], y - 0.05, k[1], 0.3, 0.6, 0.42, 0.6), 0xe8e2d0);
		b.add(T.gable, place(k[0], y + 0.37, k[1], 0.3 + Math.PI / 2, 0.7, 0.2, 0.7), 0x6a2a22);
	}
	const sm = F.spot([[-1.6, 0.5], [1.7, 0.6], [-1.9, -0.4]], 0.4, 0.2);
	if (sm) {
		const y = F.ground(sm[0], sm[1]);
		b.add(T.box, place(sm[0], y - 0.03, sm[1], 0, 0.6, 0.1, 0.6), 0xd8d2c4);
		b.add(T.box, place(sm[0], y + 0.07, sm[1], 0, 0.4, 0.12, 0.4), 0xf1eee6);
		b.add(T.taper, place(sm[0], y + 0.19, sm[1], 0, 0.22, 0.26, 0.22), 0xe8dcc0);
	}
	// the gardens: beds of marigold and herbs either side of the way
	for (const [gx, gz] of [[-1.5, 1.6], [1.6, 1.5], [-1.9, 2.8], [2.0, 2.9]]) {
		if (!F.free(gx, gz, 0.5)) continue;
		F.take(gx, gz, 0.5);
		const y = F.ground(gx, gz);
		b.add(T.box, place(gx, y - 0.02, gz, 0, 1.0, 0.06, 0.7), 0x3f5a2e);
		for (let i = 0; i < 9; i++) b.add(T.ball, place(gx + (R() - 0.5) * 0.85, y + 0.05, gz + (R() - 0.5) * 0.55, 0, 0.06, 0.05, 0.06), R() < 0.6 ? 0xf2a01e : 0xd8261c);
	}
	// deodars round the ashram, kept off the way and out of the shot behind the traveller
	for (const [tx, tz] of [[-3.2, -2.4], [3.1, -2.2], [-3.6, -0.6], [3.5, -0.4], [-2.6, -3.4], [2.7, -3.3], [-4.0, 1.2], [4.0, 1.4]]) {
		if (!F.free(tx, tz, 0.45)) continue;
		F.take(tx, tz, 0.45);
		conifer(b, tx, F.ground(tx, tz), tz, 0.9 + R() * 0.5, Math.floor(R() * 7));
	}
	rocks(b, F, 10, 2.2, 4.4, R, 0x7a7268);
	const crowd = crowdAt(F, 5, 17);
	finish(b, g);
	return { g, peaks: [], crowd };
}
// Kalapani: the small Kali temple with its red band and bells, the ITBP post's olive huts, and the Vyas cave in the
// rock above with a flag at its mouth and a sadhu at his dhuni before it.
function kalapani(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(137);
	altar(b, F);
	const y0 = F.ground(0, 0.4);
	b.add(T.box, place(0, y0 - 0.06, 0.3, 0, 1.3, 0.14, 1.0), 0x8a8076);
	b.add(T.box, place(0, y0 + 0.08, 0.2, 0, 0.9, 0.6, 0.8), 0xf1eee6);
	b.add(T.box, place(0, y0 + 0.62, 0.2, 0, 0.96, 0.05, 0.86), 0xb8261c);
	b.add(T.taper, place(0, y0 + 0.66, 0.2, 0, 0.52, 0.7, 0.52), 0xd8261c);
	b.add(T.ball, place(0, y0 + 1.34, 0.2, 0, 0.09, 0.09, 0.09), 0xc8962a);
	b.add(T.box, place(0, y0 + 0.1, 0.61, 0, 0.28, 0.42, 0.02), 0x3a2a20);
	for (const sx of [-1, 1]) b.add(T.box, place(sx * 0.42, y0 + 0.08, 0.72, 0, 0.03, 0.62, 0.03), 0x5a4434);
	b.add(T.box, place(0, y0 + 0.7, 0.72, 0, 0.9, 0.03, 0.03), 0x5a4434);
	for (const x of [-0.25, -0.08, 0.08, 0.25]) b.add(T.cone, place(x, y0 + 0.56, 0.72, 0, 0.06, 0.09, 0.06), 0xc8902a);
	saffronFlag(b, 0.6, y0 + 0.1, 0.0, 0.9);
	for (const [w, d] of [[1.0, 0.55], [0.8, 0.5]]) {
		const s = F.spot(F.ring(2.2, 4.2, 40, R() * 1000 | 0), Math.max(w, d) * 0.65, 0.2);
		if (s) hut(b, s[0], F.floor(s[0], s[1], Math.max(w, d) * 0.5), s[1], w, d, Math.atan2(-s[0], -s[1]) + Math.PI, 0x5a6238);
	}
	const cv = [1.9, -2.6];
	cave(b, cv[0], F.ground(cv[0], cv[1]), cv[1], Math.atan2(-cv[0], -cv[1]) + Math.PI, 1.1);
	F.take(cv[0], cv[1], 1.3);
	dhuni(b, 1.1, F.ground(1.1, -1.6), -1.6, R);
	F.take(1.1, -1.6, 0.3);
	rocks(b, F, 24, 1.2, 4.4, R, 0x7a7068);
	const crowd = crowdAt(F, 5, 23);
	crowd.push([0.7, -1.5, F.ground(0.7, -1.5), "sadhu"]);
	finish(b, g);
	return { g, peaks: [], crowd };
}
// Om Parvat, from the camp at Nabhidhang: the huts of the camp, an ITBP tent, the open-air Shiva shrine with its
// trishul and bells, a railing along the viewpoint.
function omparvat(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(101);
	altar(b, F);
	// the shrine behind the altar: a stone platform, the trishul, a frame of bells, the saffron flag
	const y0 = F.ground(0, 0.8);
	b.add(T.box, place(0, y0 - 0.06, 0.85, 0, 1.3, 0.2, 0.8), 0x8a8076);
	b.add(T.box, place(0, y0 + 0.14, 0.85, 0, 1.36, 0.05, 0.86), 0xa09686);
	b.add(T.box, place(0, y0 + 0.19, 0.7, 0, 0.022, 0.95, 0.022), 0x9aa0a6);
	for (const [dx, hh] of [[-0.09, 0.16], [0, 0.22], [0.09, 0.16]]) b.add(T.cone, place(dx, y0 + 1.1 + (dx ? -0.02 : 0), 0.7, 0, 0.035, hh, 0.02), 0x9aa0a6);
	b.add(T.box, place(0, y0 + 1.06, 0.7, 0, 0.2, 0.02, 0.02), 0x9aa0a6);
	b.add(T.box, place(0, y0 + 0.92, 0.705, 0, 0.06, 0.05, 0.025), 0xd8261c); // the damaru tied on it
	for (const sx of [-1, 1]) b.add(T.box, place(sx * 0.5, y0 + 0.19, 1.05, 0, 0.03, 0.6, 0.03), 0x5a4434);
	b.add(T.box, place(0, y0 + 0.78, 1.05, 0, 1.06, 0.03, 0.03), 0x5a4434);
	for (const x of [-0.3, -0.1, 0.1, 0.3]) b.add(T.cone, place(x, y0 + 0.62, 1.05, 0, 0.07, 0.1, 0.07), 0xc8902a);
	b.add(T.box, place(0.55, y0 + 0.19, 0.6, 0, 0.02, 1.3, 0.02), 0x5a4434);
	b.add(T.box, place(0.66, y0 + 1.3, 0.6, 0, 0.22, 0.14, 0.006), 0xff8a1e);
	// the railing along the edge of the viewpoint, looking out to the mountain
	for (let x = -1.4; x <= 1.41; x += 0.35) {
		if (!F.free(x, -0.25, 0.05) && Math.abs(x) > 1.0) continue;
		const yy = F.ground(x, -0.25);
		b.add(T.box, place(x, yy - 0.04, -0.25, 0, 0.025, 0.3, 0.025), 0x50565c);
		if (x < 1.4) b.add(T.box, place(x + 0.175, yy + 0.24, -0.25, Math.PI / 2, 0.02, 0.02, 0.35), 0x50565c);
	}
	// the camp: prefab huts with green and red tin roofs, an olive ITBP tent, a water tank
	for (const [roof, w, d] of [[0x2f6a3a, 0.9, 0.55], [0xa8322a, 0.8, 0.5], [0x2f6a3a, 1.0, 0.55], [0x3a5a8a, 0.7, 0.5]]) {
		const s = F.spot(F.ring(2.0, 4.2, 40, R() * 1000 | 0), Math.max(w, d) * 0.65, 0.2);
		if (!s) continue;
		hut(b, s[0], F.floor(s[0], s[1], Math.max(w, d) * 0.5), s[1], w, d, Math.atan2(-s[0], -s[1]) + Math.PI, roof);
	}
	const t = F.spot(F.ring(2.2, 4.2, 40, 7), 0.45, 0.15);
	if (t) {
		const y = F.floor(t[0], t[1], 0.35);
		b.add(T.gable, place(t[0], y - 0.03, t[1], R() * 3, 0.6, 0.38, 0.7), 0x5a6238);
		b.add(T.box, place(t[0], y - 0.03, t[1], 0, 0.62, 0.05, 0.72), 0x4a5030);
	}
	const tk = F.spot(F.ring(1.6, 3.6, 20, 9), 0.2);
	if (tk) b.add(T.cyl12, place(tk[0], F.ground(tk[0], tk[1]), tk[1], 0, 0.28, 0.32, 0.28), 0x1a1a1a);
	rocks(b, F, 26, 1.0, 4.4, R, 0x7a7068);
	flagString(b, [0.55, y0 + 1.25, 0.6], [-0.9, F.ground(-0.9, 0.2) + 0.5, 0.2], 0.08);
	const crowd = crowdAt(F, 6, 11);
	finish(b, g);
	const world = (decor, h) => {
		// Om Parvat, set back beyond the foothill on the near side so the whole face shows from the camp
		const nb = toWorld(P.nabhidhang[0], P.nabhidhang[1]), om = toWorld(P.omParvat[0], P.omParvat[1]);
		let dx = om.x - nb.x, dz = om.z - nb.z;
		const l = Math.hypot(dx, dz) || 1;
		dx /= l;
		dz /= l;
		let x = nb.x + dx * 8, z = nb.z + dz * 8;
		for (let k = 0; k < 20 && wayDist(x, z) < 4.4; k++) (x += dx * 0.3), (z += dz * 0.3);
		// standing at the head of the side valley opened for it (kailash-world.js), its foot at the camp's level
		const yb = Math.min(h.world.height(x, z), h.y + 1.6);
		const peakG = omParvat(10, 4.6, [-dx, -dz]);
		peakG.name = "omparvat";
		peakG.position.set(x, yb - 1.4, z);
		decor.add(peakG);
	};
	return { g, peaks: [], crowd, world };
}

// Mansarovar at Qugu: the havan kund on the shore with its fire, the altar, flags on poles, pebbles to the water's
// edge, the camp's long low guest house, and Chugu gompa on the slope above.
function mansarovar(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(202);
	altar(b, F);
	// the havan kund: a square pit lined with stones, the fire of wood and ghee in it
	const k = F.spot([[1.75, 1.5], [-1.8, 1.45], [1.9, 0.6], [-1.9, 0.6], [2.1, 2.2]], 0.45) || [1.75, 1.5];
	const ky = F.ground(k[0], k[1]);
	for (const [u, v, w, d] of [[0, -0.22, 0.52, 0.08], [0, 0.22, 0.52, 0.08], [-0.22, 0, 0.08, 0.36], [0.22, 0, 0.08, 0.36]]) b.add(T.box, place(k[0] + u, ky - 0.04, k[1] + v, 0, w, 0.13, d), 0xa08a72);
	b.add(T.box, place(k[0], ky - 0.04, k[1], 0, 0.36, 0.05, 0.36), 0x2a2420);
	for (let i = 0; i < 5; i++) b.add(T.box, place(k[0] + (R() - 0.5) * 0.2, ky + 0.02, k[1] + (R() - 0.5) * 0.2, R() * 3, 0.24, 0.025, 0.03, 0, 0.3), 0x5a3a22);
	// pebbles of the shore, down to the water behind the altar
	for (let i = 0; i < 70; i++) {
		const lx = (R() - 0.5) * 6, lz = -1.2 + R() * 2.0, s = 0.02 + R() * 0.035;
		if (!F.free(lx, lz, s)) continue;
		b.add(T.ball, place(lx, F.ground(lx, lz) - s * 0.3, lz, R() * 6, s, s * 0.55, s * 0.8), [0xb0a898, 0x9a9488, 0xc8c0b0, 0x7a7470, 0xd0c4a8][Math.floor(R() * 5)]);
	}
	// flags on poles round the place of puja
	const poles = [];
	for (const c of [[-2.0, 0.4], [2.2, 0.2], [-2.6, 2.4], [2.6, 3.0]]) {
		const s = F.spot([c, [c[0] * 1.15, c[1] + 0.4], [c[0] * 0.85, c[1] - 0.4]], 0.15);
		if (!s) continue;
		const y = F.ground(s[0], s[1]);
		b.add(T.box, place(s[0], y - 0.05, s[1], 0, 0.025, 1.1, 0.025), 0x5a3a22);
		poles.push([s[0], y + 1.0, s[1]]);
	}
	for (let i = 0; i < poles.length - 1; i++) flagString(b, poles[i], poles[i + 1], 0.12);
	// the guest house of the camp: long, low, whitewashed, blue window frames
	const gh = F.spot([[-3.2, 1.4], [3.3, 1.2], [-3.4, 3.0], [3.4, 3.2], [-2.8, 4.0]], 0.9);
	if (gh) {
		const y = F.ground(gh[0], gh[1]), yaw = Math.atan2(-gh[0], -gh[1]) + Math.PI;
		tibetHouse(b, gh[0], y, gh[1], 1.5, 0.55, 0.42, yaw, { band: 0x2a5fb8, door: true });
	}
	// Chugu gompa on the slope behind
	const cg = F.spot([[0.6, 4.4], [-0.8, 4.4], [2.0, 4.0], [-2.2, 3.9], [3.0, 3.6]], 0.55);
	if (cg) {
		const y = F.ground(cg[0], cg[1]);
		tibetHouse(b, cg[0], y, cg[1], 0.75, 0.55, 0.55, 0, { band: 0x7a1e18, door: true });
		chorten(b, cg[0] + 0.7, F.ground(cg[0] + 0.7, cg[1]), cg[1], 0.5);
	}
	rocks(b, F, 18, 1.5, 4.3, R, 0x8a8076);
	const crowd = crowdAt(F, 7, 22);
	finish(b, g);
	// the havan fire: a flickering flame and its glow
	const fire = new THREE.Group();
	fire.position.set(k[0], ky + 0.04, k[1]);
	const flameM = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff7a1a, emissiveIntensity: 2.4, transparent: true, opacity: 0.9, depthWrite: false });
	const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8, 1, true).translate(0, 0.13, 0), flameM);
	fire.add(flame);
	const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
	glow.scale.setScalar(0.7);
	glow.position.y = 0.15;
	fire.add(glow);
	flame.onBeforeRender = () => {
		const t = performance.now() / 1000;
		flame.scale.set(1 + Math.sin(t * 11) * 0.12, 1 + Math.sin(t * 7.3) * 0.2 + Math.sin(t * 13) * 0.1, 1 + Math.cos(t * 9) * 0.12);
		glow.material.opacity = 0.55 + Math.sin(t * 8) * 0.12;
	};
	g.add(fire);
	const world = (decor, h) => {
		// Chiu Gompa on its rock above the lake's north-western shore, away from the water and off the road
		const chiu = clearSpot(P.chiu[0] - 0.035, P.chiu[1] + 0.022, 3.4, -Math.PI / 4);
		decor.add(gompa(h.world, chiu.x, chiu.z, Math.PI * 0.8, 1.1, 31));
		// the snows of Gurla Mandhata, south of the lakes, on the massif the ground already has: a broad glaciated
		// mass of rounded summits (seen from Nabhidhang and from the lakes, slender cones here read as needles), set
		// a little south of its place so the camera behind the traveller at Qugu does not stand at its foot
		const gw = toWorld(P.gurla[0], P.gurla[1]);
		const gy = h.world.height(gw.x, gw.z);
		for (const [ox, oz, r, hh, seed] of [[0, 1.2, 4.0, 8.5, 41], [2.6, 2.4, 3.2, 6, 42], [-2.4, 2.0, 3.0, 5.5, 43], [-3.4, -0.8, 2.8, 5, 44]]) {
			let px = gw.x + ox, pz = gw.z + oz;
			// (none of its summits at the camp's door: the shore at Qugu, the road beside it and the camera looking
			// back over them stand clear, the nearest pushed back south, away from the lake; one stood just behind
			// the camp and was the white spike in the foreground of the shots from the road)
			const ax = px - h.x, az = pz - h.z, al = Math.hypot(ax, az) || 1, room = r + 6;
			if (al < room) {
				px = h.x + (ax / al) * room;
				pz = h.z + (az / al) * room;
			}
			if (wayDist(px, pz) < r * 1.1 + 0.8) continue;
			const pk = massif(r, hh, seed, 0.42, 0x5a5048);
			pk.position.set(px, Math.min(gy, h.world.height(px, pz)) - 2.2, pz);
			pk.rotation.y = seed;
			decor.add(pk);
		}
	};
	return { g, peaks: [], crowd, world };
}

// Yam Dwar at Tarboche: the great flagpole with its cone of flag strings, the gateway chorten the parikrama passes
// through, mani stones, the altar. Kailash itself stands beyond.
function yamdwar(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(303);
	altar(b, F);
	// Tarboche: wherever around the stop its cone of strings (3 units across) keeps clear of every way
	const cands = [];
	for (let k = 0; k < 24; k++) {
		const a = (k / 24) * Math.PI * 2;
		for (const d of [2.6, 3.0, 3.4, 2.2]) cands.push([Math.sin(a) * d, Math.cos(a) * d]);
	}
	let pole = null;
	for (const [x, z] of cands) {
		if (!F.free(x, z, 0.3)) continue;
		// the whole cone clear: every point round its rim free of the ways and the altar
		let ok = true;
		for (let k = 0; k < 16 && ok; k++) {
			const a = (k / 16) * Math.PI * 2;
			ok = F.free(x + Math.sin(a) * 1.6, z + Math.cos(a) * 1.6, 0);
		}
		if (ok) {
			pole = [x, z];
			break;
		}
	}
	pole = pole || [-2.6, -0.6];
	F.take(pole[0], pole[1], 1.6);
	flagPole(b, F, pole[0], pole[1], 4.2, 1.55, 40, 7);
	// the gateway chorten
	const gc = F.spot([[1.9, 0.2], [-1.9, 0.3], [2.4, 1.6], [-2.4, 1.8], [1.6, -1.2], [-1.6, -1.2]], 0.6);
	if (gc) chorten(b, gc[0], F.ground(gc[0], gc[1]), gc[1], 1.2, Math.atan2(gc[0], gc[1]), true);
	for (let i = 0; i < 4; i++) {
		const s = F.spot(F.ring(1.4, 4.2, 20, 40 + i), 0.4);
		if (s) mani(b, s[0], F.ground(s[0], s[1]), s[1], 26, R);
	}
	for (let i = 0; i < 3; i++) {
		const s = F.spot(F.ring(2.0, 4.3, 20, 60 + i), 0.35);
		if (s) chorten(b, s[0], F.ground(s[0], s[1]), s[1], 0.55, R() * 3);
	}
	rocks(b, F, 22, 1.2, 4.4, R, 0x8a7a6a);
	const crowd = crowdAt(F, 8, 33);
	finish(b, g);
	const world = (decor, h) => {
		const kw = toWorld(KAILASH[0], KAILASH[1]);
		const base = Math.min(h.world.height(kw.x, kw.z), h.world.height(kw.x + 3, kw.z), h.world.height(kw.x - 3, kw.z), h.world.height(kw.x, kw.z + 3), h.world.height(kw.x, kw.z - 3));
		// standing on the lowest ground round its foot, its summit well clear of the massif under it
		let top = -Infinity, foot = Infinity;
		for (let a = 0; a < 48; a++) {
			const sa = Math.sin((a / 48) * Math.PI * 2), ca = Math.cos((a / 48) * Math.PI * 2);
			for (const r of [0, 1, 2]) top = Math.max(top, h.world.height(kw.x + sa * r, kw.z + ca * r));
			for (const r of [5, 6]) foot = Math.min(foot, h.world.height(kw.x + sa * r, kw.z + ca * r));
		}
		void base;
		const km = kailashMesh(Math.max(10.5, top + 5.5 - (foot - 0.6)), 6.3);
		km.position.set(kw.x, foot - 0.6, kw.z);
		decor.add(km);
		decor.add(cloudCollar(kw.x, base + 2.6, kw.z, 6.2, 16, 5));
	};
	return { g, peaks: [], crowd, world };
}

// Dirapuk: the camp's low buildings, a cairn altar facing Kailash's north face, flags, yaks resting with their
// loads, the porters' tents; the gompa on the slope across.
function dirapuk(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(404);
	altar(b, F);
	for (const [w, d] of [[1.3, 0.5], [1.0, 0.5], [0.8, 0.45]]) {
		const s = F.spot(F.ring(2.2, 4.3, 30, (R() * 1000) | 0), Math.max(w, d) * 0.62);
		if (!s) continue;
		const y = F.ground(s[0], s[1]);
		tibetHouse(b, s[0], y, s[1], w, d, 0.34, Math.atan2(-s[0], -s[1]) + Math.PI, { band: 0x3a5a8a, door: true, flags: false });
		b.add(T.box, place(s[0], y + 0.34, s[1], Math.atan2(-s[0], -s[1]), w + 0.08, 0.03, d + 0.1), 0x5a6a7a); // the tin roof
	}
	// the porters' tents
	for (let i = 0; i < 2; i++) {
		const s = F.spot(F.ring(2.0, 4.0, 20, 70 + i), 0.35);
		if (!s) continue;
		const y = F.ground(s[0], s[1]);
		b.add(T.gable, place(s[0], y - 0.02, s[1], R() * 3, 0.42, 0.3, 0.55), [0xd8a020, 0x2a5fb8][i]);
	}
	// yaks resting with their loads, and one still standing in its packs
	for (let i = 0; i < 4; i++) {
		const s = F.spot(F.ring(1.8, 4.0, 24, 80 + i), 0.45);
		if (!s) continue;
		addAnimal(b, i === 0 ? "packyak" : "yak", R, s[0], F.ground(s[0], s[1]), s[1], R() * 6.3);
	}
	// a lhatse: a cairn with a pole and its flags
	const lh = poleSpot(F, F.ring(1.6, 3.4, 40, 90), 1.05);
	if (lh) flagPole(b, F, lh[0], lh[1], 1.3, 0.95, 10, 13);
	for (let i = 0; i < 2; i++) {
		const s = F.spot(F.ring(1.5, 4.2, 20, 95 + i), 0.4);
		if (s) mani(b, s[0], F.ground(s[0], s[1]), s[1], 20, R);
	}
	rocks(b, F, 30, 1.2, 4.4, R, 0x7a6a62);
	const crowd = crowdAt(F, 7, 44);
	finish(b, g);
	const world = (decor, h) => {
		// the gompa built against a rock on the slope across the valley, outside the circuit
		const s = clearSpot(...K(316, 12.2), 3.2, (316 * Math.PI) / 180);
		decor.add(gompa(h.world, s.x, s.z, (136 * Math.PI) / 180, 1.0, 51));
	};
	return { g, peaks: [], crowd, world };
}

// The Dolma La: the great Dolma stone lost under prayer flags, cairns, clothes and tokens left on the rocks, snow
// lying about the pass; Gauri Kund below on the far side.
function dolmala(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(505);
	altar(b, F);
	const ds = poleSpot(F, [[-1.9, 0.0], [1.9, 0.0], [-2.1, -0.9], [2.1, -0.9], [-2.4, 1.0], [2.4, 1.0], [0, -1.6], [-2.6, -0.4], [2.6, -0.4], ...F.ring(1.8, 3.2, 40, 501)], 1.65) || [-2.0, 0.0];
	const dy = F.ground(ds[0], ds[1]);
	// the stone
	b.add(T.ball, place(ds[0], dy - 0.25, ds[1], 0.4, 1.0, 0.75, 0.85), 0x6a625a);
	b.add(T.ball, place(ds[0] + 0.3, dy - 0.15, ds[1] - 0.2, 1.1, 0.55, 0.45, 0.5), 0x7a7068);
	// flags heaped over it: strings from a pole on top down to the ground all round, and bundles on the rock
	flagPole(b, F, ds[0], ds[1], 1.15, 1.5, 34, 17);
	for (let i = 0; i < 60; i++) {
		const a = R() * 6.3, e = R() * 1.2, r = 0.42;
		const x = ds[0] + Math.cos(a) * Math.cos(e) * r, y = dy + 0.1 + Math.sin(e) * r * 0.85, z = ds[1] + Math.sin(a) * Math.cos(e) * r;
		b.add(T.box, place(x, y, z, R() * 6, 0.1, 0.07, 0.008, R() - 0.5, R() - 0.5), FLAG[i % 5]);
	}
	// cairns, tokens and clothes left on the rocks, snow lying between
	for (let i = 0; i < 6; i++) {
		const s = F.spot(F.ring(1.4, 4.3, 24, 110 + i), 0.25);
		if (!s) continue;
		const y = F.ground(s[0], s[1]);
		for (let j = 0; j < 5; j++) b.add(T.ball, place(s[0], y + j * 0.06, s[1], R() * 6, 0.12 - j * 0.018, 0.06, 0.1 - j * 0.015), [0x8a8076, 0xd0c8bc, 0x6a625a][j % 3]);
		if (R() < 0.7) b.add(T.box, place(s[0] + 0.08, y + 0.05, s[1], R() * 6, 0.16, 0.02, 0.12, 0, 0.3), [0xb8261c, 0x2a4a8a, 0xe8e2d0, 0x6a2a6a, 0x2f6a3a][i % 5]);
	}
	for (let i = 0; i < 9; i++) {
		const s = F.spot(F.ring(1.2, 4.4, 30, 130 + i), 0.3);
		if (s) snowPatch(b, s[0], F.ground(s[0], s[1]), s[1], 0.5 + R() * 0.4, R);
	}
	rocks(b, F, 40, 1.0, 4.4, R, 0x6e665e);
	const crowd = crowdAt(F, 6, 55);
	finish(b, g);
	const world = (decor, h) => {
		// Gauri Kund: an emerald tarn below the pass, on the outer side of the path, frozen white round its edge
		let best = null;
		for (let k = 0; k < 40; k++) {
			const a = ((40 + k * 3) * Math.PI) / 180, d = 12.0 + (k % 5) * 0.35;
			const p = K((a * 180) / Math.PI, d), w = toWorld(p[0], p[1]);
			if (wayDist(w.x, w.z) < 1.9) continue;
			let lo = Infinity, hi = -Infinity;
			for (let q = 0; q < 8; q++) {
				const y = h.world.height(w.x + Math.cos(q) * 0.7, w.z + Math.sin(q) * 0.7);
				lo = Math.min(lo, y);
				hi = Math.max(hi, y);
			}
			if (!best || hi - lo < best.slope) best = { x: w.x, z: w.z, y: lo, slope: hi - lo };
		}
		if (!best) return;
		const water = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2), std(0x1f7a64, { roughness: 0.12, metalness: 0.1, emissive: 0x06261c, emissiveIntensity: 0.35 }));
		water.position.set(best.x, best.y + 0.04, best.z);
		water.receiveShadow = true;
		decor.add(water);
		const ice = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.78, 40).rotateX(-Math.PI / 2), std(0xe8eef4, { roughness: 0.4 }));
		ice.position.set(best.x, best.y + 0.05, best.z);
		decor.add(ice);
		const bb = new Batch(), RR = rand(61);
		for (let i = 0; i < 18; i++) {
			const a = RR() * 6.3, r = 0.8 + RR() * 0.25, x = best.x + Math.cos(a) * r, z = best.z + Math.sin(a) * r, s = 0.06 + RR() * 0.1;
			bb.add(T.ball, place(x, h.world.height(x, z) - s * 0.3, z, RR() * 6, s, s * 0.6, s), 0x7a7068);
		}
		decor.add(bb.build(VCOL));
	};
	return { g, peaks: [], crowd, world };
}

// Darchen: the little Tibetan town at the foot of the south face: whitewashed flat-roofed houses with black window
// frames and red bands, flags on the roof corners, a chorten and a flagpole; Zuthulphuk gompa back up the valley.
function darchen(ctx) {
	const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(606);
	altar(b, F);
	for (let i = 0; i < 9; i++) {
		const w = 0.7 + R() * 0.6, d = 0.55 + R() * 0.35, h = R() < 0.3 ? 0.62 : 0.4;
		const s = F.spot(F.ring(2.1, 4.4, 40, 200 + i * 7), Math.max(w, d) * 0.62);
		if (!s) continue;
		tibetHouse(b, s[0], F.ground(s[0], s[1]), s[1], w, d, h, Math.atan2(-s[0], -s[1]) + Math.PI + (R() - 0.5) * 0.3, { band: R() < 0.7 ? RED : 0x3a5a8a, door: true });
	}
	const ch = F.spot(F.ring(1.6, 3.6, 24, 230), 0.4);
	if (ch) chorten(b, ch[0], F.ground(ch[0], ch[1]), ch[1], 0.8);
	const fp = poleSpot(F, F.ring(1.6, 3.6, 40, 240), 1.05);
	if (fp) flagPole(b, F, fp[0], fp[1], 1.8, 0.95, 16, 19);
	rocks(b, F, 14, 1.4, 4.4, R, 0x8a7a6a);
	const crowd = crowdAt(F, 8, 66);
	finish(b, g);
	const world = (decor, h) => {
		// Zuthulphuk: the gompa round Milarepa's cave, against the rock on the outer side of the valley
		const s = clearSpot(...K(108, 13.6), 3.2, (108 * Math.PI) / 180);
		decor.add(gompa(h.world, s.x, s.z, (288 * Math.PI) / 180, 1.0, 71));
		// the cave mouth in the rock behind it
		const cave = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x0e0c0a));
		cave.scale.set(1.2, 0.9, 0.4);
		const a = (108 * Math.PI) / 180;
		cave.position.set(s.x + Math.sin(a) * 0.7, h.world.height(s.x, s.z) + 0.15, s.z - Math.cos(a) * 0.7);
		decor.add(cave);
	};
	return { g, peaks: [], crowd, world };
}

// A soft puff for steam: no bright core, the edge feathered right out to nothing.
let _steamTex;
function steamTexture() {
	if (_steamTex) return _steamTex;
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
	gr.addColorStop(0, "rgba(255,255,255,0.75)");
	gr.addColorStop(0.4, "rgba(255,255,255,0.45)");
	gr.addColorStop(0.75, "rgba(255,255,255,0.12)");
	gr.addColorStop(1, "rgba(255,255,255,0)");
	x.fillStyle = gr;
	x.fillRect(0, 0, 64, 64);
	_steamTex = new THREE.CanvasTexture(c);
	_steamTex.colorSpace = THREE.SRGBColorSpace;
	return _steamTex;
}

// The stops on the way from Leh: a level spot with chortens, a flag pole and a few Ladakhi houses; at Hemis and
// Hanle the gompa on its rock nearby (decor), at Chumathang the steaming springs, at Demchok the Border Roads board.
// (Hemis builds the gompas of the Indus near Leh too: Thiksey, Shey, and the old palace over Leh)
const LADAKH_GOMPA = { hemis: [[77.692, 33.897, 1.25], [77.669, 34.061, 1.2], [77.638, 34.077, 0.7], [77.586, 34.168, 1.0]], hanle: [[78.982, 32.802, 1.1]] };
function ladakhStop(key, seed) {
	return (ctx) => {
		const g = new THREE.Group(), b = new Batch(), F = frame(ctx), R = rand(seed);
		for (let i = 0; i < 6; i++) {
			const w = 0.7 + R() * 0.6, d = 0.55 + R() * 0.35, h = R() < 0.3 ? 0.62 : 0.4;
			const sp = F.spot(F.ring(2.4, 4.4, 40, seed + i * 7), Math.max(w, d) * 0.62);
			if (sp) tibetHouse(b, sp[0], F.ground(sp[0], sp[1]), sp[1], w, d, h, Math.atan2(-sp[0], -sp[1]) + Math.PI + (R() - 0.5) * 0.3, { band: RED, door: true });
		}
		for (let i = 0; i < 3; i++) {
			const ch = F.spot(F.ring(1.4, 3.2, 24, seed + 50 + i * 3), 0.4);
			if (ch) chorten(b, ch[0], F.ground(ch[0], ch[1]), ch[1], 0.6 + R() * 0.3);
		}
		const fp = poleSpot(F, F.ring(1.6, 3.6, 40, seed + 90), 1.05);
		if (fp) flagPole(b, F, fp[0], fp[1], 1.6, 0.9, 12, seed % 17);
		rocks(b, F, 12, 1.4, 4.4, R, 0x8a7460);
		if (key === "chumathang") {
			// steam off the hot pools by the river
			// (thin wisps, soft-edged and see-through, rising, spreading and fading; main.js drifts them)
			const steam = [];
			for (let p = 0; p < 3; p++) {
				const px = -0.9 + p * 0.9 + (R() - 0.5) * 0.3, pz = 2.1 + R() * 1.0, py = F.ground(px, pz) + 0.05;
				b.add(T.ball, place(px, py - 0.04, pz, R() * 3, 0.3 + R() * 0.1, 0.02, 0.22 + R() * 0.08), 0x6f9c96); // the warm pool, milky green
				for (let i = 0; i < 4; i++) {
					const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTexture(), color: 0xf2f5f7, transparent: true, opacity: 0, depthWrite: false, fog: true }));
					sp.userData = { base: [px + (R() - 0.5) * 0.25, py, pz + (R() - 0.5) * 0.25], rise: 0.9 + R() * 0.5, size: 0.4 + R() * 0.2, peak: 0.26 + R() * 0.1, drift: 0.25 + R() * 0.2, ph: R() };
					sp.renderOrder = 2;
					g.add(sp);
					steam.push(sp);
				}
			}
			g.userData.steam = steam;
		}
		if (key === "demchok") {
			// the yellow Border Roads board
			const y = F.ground(1.4, 1.6);
			for (const sx of [1.15, 1.65]) b.add(T.box, place(sx, y, 1.6, 0, 0.04, 0.6, 0.04), 0x2a2a2a);
			b.add(T.box, place(1.4, y + 0.5, 1.6, 0, 0.62, 0.34, 0.03), 0xf2c200);
			b.add(T.box, place(1.4, y + 0.58, 1.62, 0, 0.48, 0.05, 0.03), 0x1a1a1a);
			b.add(T.box, place(1.4, y + 0.46, 1.62, 0, 0.4, 0.04, 0.03), 0x1a1a1a);
		}
		const crowd = crowdAt(F, 5, seed + 3);
		finish(b, g);
		const gp = LADAKH_GOMPA[key];
		const world = gp ? (decor, h) => {
			for (const [lo, la, sc] of gp) {
				const sp = clearSpot(lo, la, 3.0);
				decor.add(gompa(h.world, sp.x, sp.z, R() * 6.3, sc, seed + 11));
			}
		} : null;
		return { g, peaks: [], crowd, world };
	};
}
const hemis = ladakhStop("hemis", 701), chumathang = ladakhStop("chumathang", 733), hanle = ladakhStop("hanle", 761), demchok = ladakhStop("demchok", 787);

export const K_BUILDERS = { narayan, kalapani, omparvat, mansarovar, yamdwar, dirapuk, dolmala, darchen, hemis, chumathang, hanle, demchok };
