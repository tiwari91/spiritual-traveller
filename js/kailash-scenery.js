// The country of the Kailash journey above the trees (scenery.js hands its chunks here on kailash.html): the high
// Byans valley below the Lipulekh, with juniper scrub, stone houses and goats; and the Tibetan plateau, bare and
// tawny, with mani walls and white chortens by the road, cairns hung with prayer flags on every rise, herds of yak
// and flocks of sheep with a herder and a black tent, the flat-roofed whitewashed houses of Taklakot and Darchen,
// and on the parikrama Tibetan pilgrims and pack yaks on the path. Built in the chunk's batch, in metres (M).
import * as THREE from "three";
import { T, beam, place } from "./batch.js";
import { addAnimal, addPerson } from "./life.js";
import { LAKES, LEH, P } from "./kailash-geo.js";
import { lakeDist } from "./kailash-world.js";
import { toGeo, toWorld } from "./geo.js";
import { region } from "./roads.js";

const M = 0.28;
// prayer flags (lungta) always run in this order: blue sky, white air, red fire, green water, yellow earth
export const FLAGS = [0x2a5ab8, 0xf2f0e8, 0xc8261c, 0x2a8a4a, 0xf0c419];
const WHITE = 0xf1eee6, RED = 0x8a2a22, GOLD = 0xc8962a, STONE = [0x8a8278, 0x7a7268, 0x9a9288, 0x6a645c];
const pick = (R, a) => a[Math.floor(R() * a.length)];
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// A sadhu's things, by a cave or an ashram: the trishul planted in the ground, the saffron flag on its pole, and the
// dhuni, the fire kept in a ring of stones, with a log laid across its embers.
export function trishul(b, x, y, z, h = 0.5) {
	b.add(T.box, place(x, y, z, 0, 0.014, h, 0.014), 0x9aa0a6);
	for (const [dx, hh] of [[-0.05, 0.1], [0, 0.14], [0.05, 0.1]]) b.add(T.cone, place(x + dx, y + h - (dx ? 0.02 : 0), z, 0, 0.02, hh, 0.014), 0x9aa0a6);
	b.add(T.box, place(x, y + h - 0.02, z, 0, 0.12, 0.012, 0.012), 0x9aa0a6);
}
export function saffronFlag(b, x, y, z, h = 0.7) {
	b.add(T.box, place(x, y, z, 0, 0.012, h, 0.012), 0x5a4434);
	b.add(T.box, place(x + 0.08, y + h - 0.12, z, 0, 0.16, 0.1, 0.006), 0xff8a1e);
}
export function dhuni(b, x, y, z, R = Math.random) {
	for (let k = 0; k < 7; k++) {
		const a = (k / 7) * Math.PI * 2 + R() * 0.3;
		b.add(T.ball, place(x + Math.cos(a) * 0.14, y - 0.02, z + Math.sin(a) * 0.14, a, 0.08, 0.06, 0.07), 0x6a645c);
	}
	b.add(T.ball, place(x, y - 0.03, z, 0, 0.16, 0.07, 0.16), 0x2a2420);
	b.add(T.ball, place(x, y + 0.01, z, 0, 0.09, 0.06, 0.09), 0xff7a1a);
	b.add(T.box, place(x - 0.08, y + 0.02, z + 0.05, 0.4, 0.22, 0.03, 0.03, 0, 0.2), 0x3a2a20);
}
// A hermit's cave: a mass of rock in the hillside with a dark mouth towards yaw, a trishul and a flag at the entrance.
export function cave(b, x, y, z, yaw, s = 1) {
	const c = Math.cos(yaw), sn = Math.sin(yaw);
	b.add(T.ball, place(x, y - 0.35 * s, z, yaw, 1.7 * s, 1.1 * s, 1.3 * s), 0x6a645c);
	b.add(T.ball, place(x - sn * 0.3 * s, y - 0.3 * s, z - c * 0.3 * s, yaw + 0.7, 1.1 * s, 0.9 * s, 1.0 * s), 0x7a7268);
	b.add(T.ball, place(x + sn * 0.55 * s, y - 0.02, z + c * 0.55 * s, yaw, 0.5 * s, 0.42 * s, 0.4 * s), 0x0e0c0a);
	trishul(b, x + sn * 0.9 * s + c * 0.35 * s, y, z + c * 0.9 * s - sn * 0.35 * s, 0.5 * s);
	saffronFlag(b, x + sn * 0.95 * s - c * 0.4 * s, y, z + c * 0.95 * s + sn * 0.4 * s, 0.7 * s);
}
// By the Kumaon and Kali valley roads (the Kailash journey's hill country below the tree line): now and then a
// hermit's cave in the bank above the road with a sadhu at his dhuni before it, and a sadhu walking the road. (The
// caves and the sadhus are the journey's own dressing: travellers' accounts say the old pilgrims slept in villages and
// caves on the walk up, but no particular cave or hermit by this road is on record.)
export function* kumaonWayside(sc, ctx) {
	const { R, s0, s1, world, b } = ctx;
	if (R() < 0.45) return;
	const okAt = (x, z, m) => ctx.ok(x, z, m) && !ctx.taken(x, z, m);
	const tallOk = (x, z, r) => okAt(x, z, r) && sc.roads.footDist(x, z) > r + 1.9 && sc.roads.clearance(x, z) > r + 1.6;
	if (R() < 0.7) {
		// the cave on the uphill side of the road, its mouth to the way
		for (let t = 0; t < 6; t++) {
			const side = R() < 0.5 ? -1 : 1, s = s0 + 3 + R() * (s1 - s0 - 6);
			const c = ctx.frame(s, side * (4.0 + R() * 2.5), {});
			const r = ctx.frame(s, side * 1.0, {});
			if (world.height(c.x, c.z) < world.height(r.x, r.z) + 0.3 || !tallOk(c.x, c.z, 1.1)) continue;
			const yaw = Math.atan2(r.x - c.x, r.z - c.z);
			const y = world.height(c.x, c.z);
			cave(b, c.x, y, c.z, yaw, 0.9 + R() * 0.3);
			const fx = c.x + Math.sin(yaw) * 1.5, fz = c.z + Math.cos(yaw) * 1.5;
			if (okAt(fx, fz, 0.3)) {
				dhuni(b, fx, world.height(fx, fz), fz, R);
				addPerson(b, R, fx + Math.cos(yaw) * 0.35, world.height(fx + Math.cos(yaw) * 0.35, fz - Math.sin(yaw) * 0.35), fz - Math.sin(yaw) * 0.35, yaw + Math.PI + 0.4, "sadhu");
			}
			ctx.claimCircle(c.x, c.z, 1.3);
			break;
		}
	}
	yield;
	if (R() < 0.6) {
		// a sadhu on the road, with his staff, walking the verge the way the traveller goes or the other way
		const side = R() < 0.5 ? -1 : 1, c = ctx.frame(s0 + R() * (s1 - s0), side * (0.65 + R() * 0.3), {});
		if (okAt(c.x, c.z, 0.08) && sc.roads.footDist(c.x, c.z) > 1.2) {
			addPerson(ctx.soft, R, c.x, world.height(c.x, c.z), c.z, Math.atan2(c.dx, c.dz) + (R() < 0.6 ? 0 : Math.PI), "sadhu");
			ctx.claimCircle(c.x, c.z, 0.15);
		}
	}
}
// A string of prayer flags from a to b (world points), sagging, n flags along it.
export function prayerFlags(b, a, c, sag = 0.18, n = 0, R = Math.random) {
	const len = a.distanceTo(c);
	n = n || Math.max(4, Math.round(len / (0.55 * M)));
	let prev = a.clone();
	for (let i = 1; i <= n; i++) {
		const t = i / n;
		const q = a.clone().lerp(c, t);
		q.y -= Math.sin(t * Math.PI) * sag * len;
		b.add(T.box, beam(prev, q, 0.006, 0.006), 0xd8d0c0);
		// the flag hangs below the string, turned along it, a little ruffled
		const yaw = Math.atan2(c.x - a.x, c.z - a.z);
		b.add(T.box, place(q.x, q.y - 0.36 * M, q.z, yaw + Math.PI / 2 + (R() - 0.5) * 0.4, 0.42 * M, 0.34 * M, 0.01, (R() - 0.5) * 0.3), FLAGS[i % 5]);
		prev = q;
	}
}
// A white chorten: three stepped plinths, the dome (bumpa), the square harmika, the tapering spire of thirteen
// rings, the moon and sun at the top. s: its height in world units.
export function chorten(b, x, y, z, s, yaw = 0) {
	const u = s / 1.0;
	b.add(T.box, place(x, y - 0.02, z, yaw, 0.62 * u, 0.12 * u, 0.62 * u), WHITE);
	b.add(T.box, place(x, y + 0.1 * u, z, yaw, 0.5 * u, 0.1 * u, 0.5 * u), WHITE);
	b.add(T.box, place(x, y + 0.2 * u, z, yaw, 0.4 * u, 0.08 * u, 0.4 * u), WHITE);
	b.add(T.box, place(x, y + 0.205 * u, z, yaw, 0.405 * u, 0.012 * u, 0.405 * u), RED);
	b.add(T.ball, place(x, y + 0.27 * u, z, yaw, 0.34 * u, 0.3 * u, 0.34 * u), WHITE);
	b.add(T.box, place(x, y + 0.56 * u, z, yaw, 0.14 * u, 0.08 * u, 0.14 * u), RED);
	b.add(T.taper, place(x, y + 0.64 * u, z, yaw, 0.1 * u, 0.26 * u, 0.1 * u), GOLD);
	b.add(T.ball, place(x, y + 0.9 * u, z, 0, 0.05 * u, 0.05 * u, 0.05 * u), GOLD);
}
// A mani wall: a long low wall of stones, its top laid with stones carved with Om mani padme hum, painted.
export function maniWall(b, x, y, z, yaw, len, R) {
	b.add(T.box, place(x, y - 0.02, z, yaw, 0.28, 0.22, len), pick(R, STONE));
	const fx = Math.sin(yaw), fz = Math.cos(yaw);
	for (let t = -len / 2 + 0.06; t < len / 2 - 0.05; t += 0.07 + R() * 0.04) b.add(T.box, place(x + fx * t, y + 0.2, z + fz * t, yaw + (R() - 0.5) * 0.4, 0.2, 0.025 + R() * 0.02, 0.05), R() < 0.55 ? 0xe8e4da : pick(R, [0x3a6ab0, 0xb83a2a, 0x3a8a4a, 0xd8b02a]));
	// a little chorten at each end
	chorten(b, x + fx * (len / 2 + 0.14), y, z + fz * (len / 2 + 0.14), 0.42, yaw);
	chorten(b, x - fx * (len / 2 + 0.14), y, z - fz * (len / 2 + 0.14), 0.42, yaw);
}
// A cairn of stones (lhatse) with a pole of flags; strings of flags run out from it to the ground.
export function cairn(b, world, x, z, s, R, strings = 3) {
	const y = world.height(x, z);
	for (let i = 0; i < 9; i++) {
		const a = R() * 6.3, d = (1 - i / 9) * 0.18 * s;
		b.add(T.ball, place(x + Math.cos(a) * d, y + (i / 9) * 0.28 * s - 0.03, z + Math.sin(a) * d, R() * 6, (0.16 - i * 0.012) * s, (0.1 - i * 0.006) * s, (0.14 - i * 0.01) * s), pick(R, STONE));
	}
	const top = new THREE.Vector3(x, y + 0.85 * s, z);
	b.add(T.cyl, place(x, y + 0.2 * s, z, 0, 0.025 * s, 0.68 * s, 0.025 * s), 0x6a4a2e);
	for (let k = 0; k < strings; k++) {
		const a = (k / strings) * Math.PI * 2 + R(), d = (1.3 + R()) * s;
		const ex = x + Math.cos(a) * d, ez = z + Math.sin(a) * d;
		prayerFlags(b, top, new THREE.Vector3(ex, world.height(ex, ez) + 0.04, ez), 0.08, 0, R);
	}
}
// A drokpa's black tent of yak hair, low and wide, smoke-hole along the ridge.
function tent(b, x, y, z, yaw) {
	b.add(T.pyramid, place(x, y - 0.02, z, yaw, 1.6 * M * 2, 1.7 * M, 1.1 * M * 2), 0x1e1a16);
	b.add(T.box, place(x, y, z, yaw, 1.5 * M * 2, 0.5 * M, 1.0 * M * 2), 0x2a241e);
	// guy ropes to pegs, and a string of flags on the ridge
	const fx = Math.sin(yaw), fz = Math.cos(yaw);
	for (const s of [-1, 1]) b.add(T.box, beam(_a.set(x + fx * s * 1.4 * M, y + 1.6 * M, z + fz * s * 1.4 * M), _b.set(x + fx * s * 3 * M, y, z + fz * s * 3 * M), 0.008, 0.008), 0x3a3026);
}
// A Tibetan house: whitewashed stone walls battered inwards, a flat roof with a parapet edged in dark red,
// black-framed windows, prayer flags on the roof corners. w, d in metres.
function house(b, x, y, z, yaw, w, d, R, floors = 1) {
	const h = (2.8 + (floors - 1) * 2.6) * M;
	b.add(T.box, place(x, y - 0.05, z, yaw, w * M, h + 0.05, d * M), WHITE);
	b.add(T.box, place(x, y + h, z, yaw, w * M + 0.03, 0.22 * M, d * M + 0.03), 0x5a1a16);
	b.add(T.box, place(x, y + h + 0.22 * M, z, yaw, w * M + 0.04, 0.05 * M, d * M + 0.04), 0x2a2420);
	const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
	for (let f = 0; f < floors; f++) for (let i = 0; i < Math.max(1, Math.round(w / 2.5)); i++) {
		const u = (i - (Math.max(1, Math.round(w / 2.5)) - 1) / 2) * 2.3 * M, yy = y + (1.0 + f * 2.6) * M;
		b.add(T.box, place(x + rx * u + fx * (d / 2) * M, yy, z + rz * u + fz * (d / 2) * M, yaw, 0.9 * M, 1.0 * M, 0.06), 0x161412);
		b.add(T.box, place(x + rx * u + fx * (d / 2 + 0.02) * M, yy + 1.05 * M, z + rz * u + fz * (d / 2 + 0.02) * M, yaw, 1.2 * M, 0.12 * M, 0.04), 0x8a2a22);
	}
	// the door, and flags on a stick at two corners of the roof
	b.add(T.box, place(x - rx * (w / 2 - 0.9) * M + fx * (d / 2) * M, y, z - rz * (w / 2 - 0.9) * M + fz * (d / 2) * M, yaw, 0.9 * M, 1.9 * M, 0.06), 0x3a2418);
	for (const s of [-1, 1]) {
		const cx = x + rx * s * (w / 2) * M + fx * (d / 2) * M, cz = z + rz * s * (w / 2) * M + fz * (d / 2) * M;
		b.add(T.cyl, place(cx, y + h, cz, 0, 0.02, 0.5, 0.02), 0x6a4a2e);
		for (let k = 0; k < 3; k++) b.add(T.box, place(cx + 0.03, y + h + 0.42 - k * 0.07, cz, yaw, 0.08, 0.06, 0.008), FLAGS[(k + (s > 0 ? 2 : 0)) % 5]);
	}
	void R;
}
// A stone house of the Byans valley: grey stone, a slate roof, a carved wooden door frame.
function stoneHouse(b, x, y, z, yaw, w, d, R) {
	const h = 2.6 * M;
	b.add(T.box, place(x, y - 0.05, z, yaw, w * M, h + 0.05, d * M), pick(R, [0x7a7268, 0x8a8278, 0x6e665e]));
	b.add(T.gable, place(x, y + h, z, yaw + Math.PI / 2, d * M + 0.06, 1.0 * M, w * M + 0.06), 0x4a4a4e);
	const fx = Math.sin(yaw), fz = Math.cos(yaw);
	b.add(T.box, place(x + fx * (d / 2) * M, y, z + fz * (d / 2) * M, yaw, 0.9 * M, 1.8 * M, 0.06), 0x5a3a22);
}

// Where a building of radius r (world units) can stand: the ground under it near enough level, and the height of its
// lowest corner so it is set into the slope rather than hanging over it; null on a slope too steep to build on.
function seat(world, x, z, r, most = 0.22) {
	let lo = Infinity, hi = -Infinity;
	for (const [u, v] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
		const y = world.height(x + u, z + v);
		lo = Math.min(lo, y);
		hi = Math.max(hi, y);
	}
	return hi - lo <= most ? lo : null;
}

// The plateau's chunk. ctx is scenery.js's chunk context; sc the Scenery.
export function* kailashCountry(sc, ctx, reg) {
	const { R, s0, s1, world, b } = ctx;
	const tib = reg === "tibet";
	const clearOfLakes = (x, z, m) => {
		const g = toGeo(x, z);
		return LAKES.every((L) => lakeDist(L, g.lon, g.lat) > m + 0.4);
	};
	const okAt = (x, z, m) => ctx.ok(x, z, m) && !ctx.taken(x, z, m) && clearOfLakes(x, z, m);
	// whether a point is on the Tibetan side (a chunk can straddle the pass)
	const inTibet = (x, z) => {
		const g = toGeo(x, z);
		return region(g.lon, g.lat) === "tibet";
	};
	// anything taller than a stone keeps well back from the way, so the camera following the traveller (or riding
	// beside the coach) never has it in the shot's line: back from the road's centre, and from any path on foot
	const tallOk = (x, z, r) => okAt(x, z, r) && sc.roads.footDist(x, z) > r + 1.9 && sc.roads.clearance(x, z) > r + 1.6;
	const trail = (s) => {
		const r = sc.roads.road(s, 0, {});
		return r && r.kind === "trail";
	};
	const near = (pt, d) => {
		const w = toWorld(pt[0], pt[1]);
		let m = Infinity;
		for (let s = s0; s <= s1; s += 1) {
			const p = sc.route.at(s, {});
			m = Math.min(m, Math.hypot(p.x - w.x, p.z - w.z));
		}
		return m < d;
	};
	if (!tib) {
		// ---------- the Byans valley: juniper and wild rose scrub, a few stone houses, goats ----------
		// (the scrub thins out above Garbyang and is gone by Gunji: the high gorge to Nabhidhang is bare rock and scree)
		for (let i = 0; i < 70 * (sc.low ? 0.55 : 1); i++) {
			const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (1.6 + Math.pow(R(), 0.8) * 14), {});
			const g = toGeo(c.x, c.z);
			if (R() > 1 - (g.lon - 80.76) / 0.1) continue;
			if (okAt(c.x, c.z, 0.4)) ctx.tree(c.x, c.z, "bush", 0.7 + R() * 0.5);
		}
		for (let v = 0; v < 2; v++) {
			const side = R() < 0.5 ? -1 : 1, sc0 = s0 + 3 + R() * (s1 - s0 - 6);
			for (let k = 0; k < 4 + Math.floor(R() * 4); k++) {
				const c = ctx.frame(sc0 + (R() - 0.5) * 4, side * (3.0 + R() * 3), {});
				if (!tallOk(c.x, c.z, 0.9)) continue;
				const yaw = Math.atan2(c.dx, c.dz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), hw = 5 + R() * 3, hd = 4 + R() * 2;
				const y = seat(world, c.x, c.z, (Math.max(hw, hd) * M) / 2);
				if (y === null) continue;
				stoneHouse(b, c.x, y, c.z, yaw, hw, hd, R);
				ctx.claimCircle(c.x, c.z, 0.9);
			}
		}
		for (let h = 0; h < 2; h++) {
			const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (4 + R() * 10), {});
			if (!okAt(c.x, c.z, 1)) continue;
			for (let q = 0; q < 6 + Math.floor(R() * 6); q++) {
				const x = c.x + (R() - 0.5) * 2.5, z = c.z + (R() - 0.5) * 2.5;
				if (okAt(x, z, 0.1)) addAnimal(b, "goat", R, x, world.height(x, z), z, R() * 6.3);
			}
			if (okAt(c.x + 1, c.z, 0.2)) addPerson(b, R, c.x + 1, world.height(c.x + 1, c.z), c.z, R() * 6.3, "yatri");
		}
		yield;
		return;
	}
	// ---------- the plateau ----------
	// mani walls and chortens beside the road
	for (let i = 0; i < 2; i++) {
		if (R() < 0.35) continue;
		const s = s0 + R() * (s1 - s0), side = R() < 0.5 ? -1 : 1;
		const c = ctx.frame(s, side * (3.3 + R() * 1.2), {});
		const len = 1.2 + R() * 2.2, yaw = Math.atan2(c.dx, c.dz);
		const e1 = { x: c.x + Math.sin(yaw) * len / 2, z: c.z + Math.cos(yaw) * len / 2 }, e2 = { x: c.x - Math.sin(yaw) * len / 2, z: c.z - Math.cos(yaw) * len / 2 };
		if (!inTibet(c.x, c.z) || !tallOk(c.x, c.z, 0.3) || !tallOk(e1.x, e1.z, 0.3) || !tallOk(e2.x, e2.z, 0.3)) continue;
		maniWall(b, c.x, world.height(c.x, c.z), c.z, yaw, len, R);
		ctx.claim([[e1.x - 0.2, e1.z - 0.2], [e1.x + 0.2, e1.z + 0.2], [e2.x + 0.2, e2.z + 0.2], [e2.x - 0.2, e2.z - 0.2]]);
		ctx.claimCircle(c.x, c.z, len / 2 + 0.3);
	}
	if (R() < 0.6) {
		const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (3.4 + R() * 3), {});
		if (inTibet(c.x, c.z) && tallOk(c.x, c.z, 0.6)) {
			chorten(b, c.x, world.height(c.x, c.z), c.z, 1.0 + R() * 0.6, R() * 6);
			ctx.claimCircle(c.x, c.z, 0.6);
		}
	}
	yield;
	// cairns hung with flags on the rises beside the way, more of them on the parikrama and at the passes
	const nc = 2 + (trail((s0 + s1) / 2) ? 4 : 0) + (near(P.lipulekh, 6) || near(P.gurlaLa, 6) || near(P.dolmaLa, 6) ? 4 : 0);
	for (let i = 0; i < nc; i++) {
		const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (3.3 + R() * 4), {});
		const cs = 0.7 + R() * 0.6;
		// (its strings of flags reach out about twice its size)
		if (!inTibet(c.x, c.z) || !tallOk(c.x, c.z, 2.4 * cs)) continue;
		cairn(b, world, c.x, c.z, cs, R, 2 + Math.floor(R() * 3));
		ctx.claimCircle(c.x, c.z, 0.5);
	}
	yield;
	// a herd of yak grazing, the herder, the black tent and its mastiff; or a flock of sheep
	for (let h = 0; h < 2; h++) {
		if (R() < 0.35) continue;
		const sheep = R() < 0.4;
		const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (4.5 + R() * 16), {});
		if (!inTibet(c.x, c.z) || !tallOk(c.x, c.z, 1.5)) continue;
		const n = sheep ? 12 + Math.floor(R() * 14) : 4 + Math.floor(R() * 7);
		for (let q = 0; q < n; q++) {
			const x = c.x + (R() - 0.5) * (sheep ? 3 : 4), z = c.z + (R() - 0.5) * (sheep ? 3 : 4);
			if (okAt(x, z, 0.1)) addAnimal(b, sheep ? "sheep" : "yak", R, x, world.height(x, z), z, R() * 6.3);
		}
		const hx = c.x + 1.2, hz = c.z - 0.6;
		if (okAt(hx, hz, 0.1)) addPerson(b, R, hx, world.height(hx, hz), hz, R() * 6.3, "tibetan");
		if (R() < 0.6) {
			const tx = c.x - 2.2, tz = c.z + 1.4;
			const ty = tallOk(tx, tz, 0.8) ? seat(world, tx, tz, 0.5) : null;
			if (ty !== null) {
				tent(b, tx, ty, tz, R() * 6.3);
				addAnimal(b, "dog", R, tx + 0.6, world.height(tx + 0.6, tz), tz + 0.3, R() * 6.3);
				ctx.claimCircle(tx, tz, 0.8);
			}
		}
		ctx.claimCircle(c.x, c.z, 1.5);
	}
	yield;
	// the parikrama: Tibetan pilgrims on the path (walking the other way round, as Bonpo pilgrims do, or resting),
	// pack yaks with their yakmen, mani stones heaped by the way
	if (trail((s0 + s1) / 2)) {
		for (let i = 0; i < 9; i++) {
			const s = s0 + R() * (s1 - s0);
			if (!trail(s)) continue;
			const side = R() < 0.5 ? -1 : 1, c = ctx.frame(s, side * (0.62 + R() * 0.3), {});
			if (!okAt(c.x, c.z, 0.05)) continue;
			const yaw = Math.atan2(c.dx, c.dz) + (R() < 0.75 ? 0 : Math.PI);
			if (R() < 0.3) {
				const yx = c.x - c.dz * side * 0.25, yz = c.z + c.dx * side * 0.25;
				if (okAt(yx, yz, 0.15)) {
					addAnimal(ctx.soft, "packyak", R, yx, world.height(yx, yz), yz, yaw);
					ctx.claimCircle(yx, yz, 0.4);
				}
			}
			addPerson(ctx.soft, R, c.x, world.height(c.x, c.z), c.z, yaw, R() < 0.7 ? "tibetan" : "yatri");
			ctx.claimCircle(c.x, c.z, 0.15);
		}
		for (let i = 0; i < 4; i++) {
			const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (0.95 + R() * 0.5), {});
			if (!okAt(c.x, c.z, 0.2)) continue;
			const y = world.height(c.x, c.z);
			for (let k = 0; k < 14; k++) b.add(T.box, place(c.x + (R() - 0.5) * 0.3, y + R() * 0.12, c.z + (R() - 0.5) * 0.3, R() * 6, 0.12, 0.03, 0.08), R() < 0.5 ? 0xe8e4da : pick(R, STONE));
		}
	}
	// boulders and stones strewn over the plateau
	for (let i = 0; i < 18; i++) {
		const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * (1.6 + Math.pow(R(), 0.7) * 20), {});
		const sz = 0.15 + R() * 0.5;
		if (!(sz < 0.3 ? okAt(c.x, c.z, 0.3) : tallOk(c.x, c.z, sz))) continue;
		b.add(T.ball, place(c.x, world.height(c.x, c.z) - sz * 0.25, c.z, R() * 6, sz, sz * (0.5 + R() * 0.3), sz * (0.7 + R() * 0.4)), pick(R, STONE));
	}
	yield;
	// the towns: Taklakot (Purang) on its terraces above the Karnali, and Darchen under Kailash
	for (const [pt, n] of [[P.taklakot, 18], [P.darchen, 10], ...(LEH ? [[P.leh, 26], [P.shey, 6], [P.nyoma, 8], [P.hanle, 7], [P.ali, 18], [P.chumathang, 5]] : [])]) {
		if (!near(pt, 5)) continue;
		const w = toWorld(pt[0], pt[1]);
		for (let k = 0; k < n; k++) {
			const a = R() * Math.PI * 2, d = 2.2 + R() * 4;
			const x = w.x + Math.cos(a) * d, z = w.z + Math.sin(a) * d;
			if (!tallOk(x, z, 1.0)) continue;
			const yaw = Math.round((a + Math.PI) / (Math.PI / 2)) * (Math.PI / 2) + (R() - 0.5) * 0.2, hw = 6 + R() * 6, hd = 5 + R() * 4, fl = R() < 0.25 ? 2 : 1;
			const y = seat(world, x, z, (Math.max(hw, hd) * M) / 2);
			if (y === null) continue;
			house(b, x, y, z, yaw, hw, hd, R, fl);
			ctx.claimCircle(x, z, 1.2);
		}
	}
	if (LEH) yield* ladakhExtras(sc, ctx, okAt);

}

// From Leh: the yellow Border Roads boards (Project Himank) by the road through Ladakh, now and then, well clear of
// the way. (The gompas are the stops' own, kailash-landmarks.js.)
function* ladakhExtras(sc, ctx, okAt) {
	const { R, s0, s1, world, b } = ctx;
	const f0 = ctx.frame(s0, 0, {}), g = toGeo(f0.x, f0.z);
	if (g.lon < 79.45 && g.lat > 32.6) for (let i = 0; i < 2; i++) {
		const c = ctx.frame(s0 + R() * (s1 - s0), (R() < 0.5 ? -1 : 1) * 1.4, {});
		if (!okAt(c.x, c.z, 0.25) || sc.roads.clearance(c.x, c.z) < 0.5) continue;
		const y = world.height(c.x, c.z), yaw = R() * 6.3;
		for (const sd of [-0.09, 0.09]) b.add(T.box, place(c.x + Math.cos(yaw) * sd, y, c.z - Math.sin(yaw) * sd, yaw, 0.02, 0.32, 0.02), 0x2a2a2a);
		b.add(T.box, place(c.x, y + 0.26, c.z, yaw, 0.26, 0.16, 0.015), 0xf2c200);
		b.add(T.box, place(c.x, y + 0.31, c.z, yaw, 0.2, 0.025, 0.018), 0x1a1a1a);
		b.add(T.box, place(c.x, y + 0.25, c.z, yaw, 0.17, 0.02, 0.018), 0x1a1a1a);
	}
	yield;
}
