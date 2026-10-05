// The ground of the Kailash journey, laid over the stylised map (world.js calls these only on kailash.html):
// the Kali gorge cut up from Dharchula to the Lipulekh Pass, the Himalayan crest, the bare Tibetan plateau beyond
// it with Gurla Mandhata, Mansarovar and Rakshas Tal sunk in it, the Barkha plain, and the Kailash range with the
// valleys of the parikrama cut round the mountain. Heights are in world units, as the rest of the map's (its
// relief exaggerated many times, and softened here so that the passes can be walked).
import { KAILASH, KORA, LAKES, P, RIVERS, ROUTE, SHRINES } from "./kailash-geo.js";
import { clamp, fbm, inPoly, lerp, smoothstep } from "./util.js";

const U = 40; // world units to the degree
// The crest of the Great Himalaya across the region (Lipulekh is a saddle on it).
const CREST = [[80.2, 30.52], [80.6, 30.38], [80.9, 30.28], [81.029, 30.236], [81.25, 30.185], [81.6, 30.12], [82.0, 30.04]];
// The ways cut through the ground, each point [lon, lat, floor]: the floor is the height of the valley bottom (or the
// road's bed) there. w: half the flat width (units); k, e: how the sides rise beyond it, k * d^e.
const GORGE = { w: 1.0, k: 1.5, e: 1.18 }, PLAIN = { w: 0.8, k: 0.55, e: 1.0 }, KORA_V = { w: 0.95, k: 1.15, e: 1.12 }, PASS = { w: 0.9, k: 1.2, e: 1.38 };
const WAYS = [
	// Pithoragarh down to the Kali at Jauljibi and up the gorge to Gunji, Kalapani and Nabhidhang
	{ ...GORGE, pts: [[80.36, 29.68, 24.6], [80.38, 29.75, 25.2], [80.47, 29.8, 26.2], [P.dharchula[0], P.dharchula[1], 27.4], [80.6, 29.95, 30.5], [80.67, 30.03, 34.4], [80.76, 30.11, 39.0], [80.83, 30.15, 43.4], [P.gunji[0], P.gunji[1], 45.4], [80.89, 30.197, 47.0], [P.kalapani[0], P.kalapani[1], 48.6], [80.958, 30.212, 49.5], [P.nabhidhang[0], P.nabhidhang[1], 49.9]] },
	// over the Lipulekh and down into the Karnali valley to Taklakot, then over the Gurla La to the lakes
	{ ...PASS, pts: [[P.nabhidhang[0], P.nabhidhang[1], 49.9], [80.995, 30.231, 50.5], [81.008, 30.226, 51.2], [P.roadHead[0], P.roadHead[1], 51.9], [81.022, 30.231, 52.6], [P.lipulekh[0], P.lipulekh[1], 53.2], [81.038, 30.239, 52.7], [P.busStand[0], P.busStand[1], 52.1], [81.06, 30.252, 51.4], [P.pala[0], P.pala[1], 50.4], [81.13, 30.27, 47.8], [P.taklakot[0], P.taklakot[1], 46.4], [81.18, 30.33, 47.1], [81.17, 30.39, 48.7], [P.gurlaLa[0], P.gurlaLa[1], 50.4], [81.2, 30.5, 48.2], [81.31, 30.548, 47.2], [81.335, 30.6, 47.0]] },
	// round Mansarovar and across the Barkha plain to Darchen, on the route's own line (kailash-geo.js)
	{ ...PLAIN, pts: lakeRing() },
	{ ...PLAIN, pts: toDarchen() },
	// the parikrama: up the Lha Chu, over the Dolma La, down the Lham Chu Khir
	{ ...KORA_V, pts: withFloors(KORA.west, [48.6, 48.9, 49.2, 49.5, 49.8, 50.1, 50.4]) },
	{ ...KORA_V, pts: withFloors(KORA.north, [50.4, 51.2, 52.3, 53.3, 54.0]) },
	{ ...KORA_V, pts: withFloors(KORA.east, [54.0, 53.0, 52.0, 51.0, 50.2, 49.6, 49.2, 48.9, 48.5, 48.3, 48.2]) },
];
// the road round the lake: leg 2 from the isthmus to Qugu and leg 3 from Qugu back to it, nearly level
function lakeRing() {
	const L2 = ROUTE[1].pts, L3 = ROUTE[2].pts;
	const i2 = L2.findIndex((p) => p[0] > 81.3 && p[1] > 30.55), i3 = L3.findIndex((p) => p === P.chiu);
	return [...L2.slice(i2), ...L3.slice(1, i3 + 1)].map((p) => [p[0], p[1], p === P.chiu ? 47.25 : 46.95]);
}
// from Chiu across the Barkha plain past Darchen to Tarboche, rising gently
function toDarchen() {
	const L3 = ROUTE[2].pts, i = L3.indexOf(P.chiu), pts = L3.slice(i);
	return pts.map((p, k) => [p[0], p[1], lerp(47.25, 48.6, k / (pts.length - 1))]);
}
function withFloors(pts, f) {
	return pts.map((p, i) => [p[0], p[1], f[i]]);
}
// Segments in units, with bounds, for quick distance queries.
function segs(list) {
	const out = [];
	for (const way of list) for (let i = 0; i < way.pts.length - 1; i++) {
		const a = way.pts[i], b = way.pts[i + 1];
		const ax = a[0] * U, ay = a[1] * U, bx = b[0] * U, by = b[1] * U;
		out.push({ ax, ay, bx, by, fa: a[2], fb: b[2], w: way.w, k: way.k, e: way.e, x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) });
	}
	return out;
}
const SEGS = segs(WAYS);
// The floor of the nearest way, and the distance to it (units).
function nearestWay(x, y, list = SEGS, reach = 14) {
	let best = Infinity, floor = 0, sg = null;
	for (const s of list) {
		if (x < s.x0 - reach || x > s.x1 + reach || y < s.y0 - reach || y > s.y1 + reach) continue;
		const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy || 1e-9;
		const t = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / l2, 0, 1);
		const d = Math.hypot(s.ax + dx * t - x, s.ay + dy * t - y);
		if (d < best) {
			best = d;
			floor = lerp(s.fa, s.fb, t);
			sg = s;
		}
	}
	return { d: best, floor, s: sg };
}
// The rivers of the region, cut a little below the way beside them so the water lies in the valley bottom.
const RIVER_WAYS = RIVERS.filter((r) => r.pts.some(([lo, la]) => lo > 80.35 && la > 29.7)).map((r) => ({
	w: 0.35, k: 2.6, e: 1.0,
	pts: r.pts.map(([lo, la]) => {
		const n = nearestWay(lo * U, la * U, SEGS, 30);
		return [lo, la, (n.d < 30 ? n.floor : 47) - 0.35];
	}),
}));
const RIVER_SEGS = segs(RIVER_WAYS);
// Signed distance to a lake's shore in units (negative inside).
function lakeDist(L, lon, lat) {
	let d = Infinity;
	const p = L.pts, n = p.length, x = lon * U, y = lat * U;
	for (let i = 0; i < n; i++) {
		const a = p[i], b = p[(i + 1) % n];
		const ax = a[0] * U, ay = a[1] * U, dx = b[0] * U - ax, dy = b[1] * U - ay, l2 = dx * dx + dy * dy || 1e-9;
		const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
		d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y));
	}
	return inPoly(p, lon, lat) ? -d : d;
}
export { lakeDist };
function crestLat(lon) {
	if (lon <= CREST[0][0]) return CREST[0][1];
	for (let i = 0; i < CREST.length - 1; i++) if (lon <= CREST[i + 1][0]) return lerp(CREST[i][1], CREST[i + 1][1], (lon - CREST[i][0]) / (CREST[i + 1][0] - CREST[i][0]));
	return CREST[CREST.length - 1][1];
}
const smin = (a, b, k) => {
	const h = Math.max(k - Math.abs(a - b), 0) / k;
	return Math.min(a, b) - h * h * k * 0.25;
};
// ridged noise, 0..1, sharp crests
function ridged(x, y, oct = 4) {
	let s = 0, a = 0.5, n = 0;
	for (let i = 0; i < oct; i++) {
		const v = 1 - Math.abs(fbm(x, y, 1) * 2 - 1);
		s += a * v * v;
		n += a;
		x = x * 2.1 + 5.3;
		y = y * 2.1 + 1.7;
		a *= 0.5;
	}
	return s / n;
}
const KX = KAILASH[0] * U, KY = KAILASH[1] * U;
// the direction from Nabhidhang to Om Parvat (on the map, x east and y north, as lon and lat)
const OM_DIR = (() => {
	const dx = P.omParvat[0] - P.nabhidhang[0], dy = P.omParvat[1] - P.nabhidhang[1], l = Math.hypot(dx, dy);
	return [dx / l, dy / l];
})();
export { OM_DIR };
// each stop's level shelf: flat out to r0 units, eased into the hillside by r1
const STOPS = SHRINES.map((s) => ({ x: s.lon * U, y: s.lat * U, r0: (s.shelf || [1.9, 3.4])[0], r1: (s.shelf || [1.9, 3.4])[1] }));
// How much of the map here is the region drawn by this module (1 inside, easing to 0 at its edges).
export function kRegion(lon, lat) {
	return smoothstep(80.12, 80.42, lon) * smoothstep(82.3, 82.0, lon) * smoothstep(29.5, 29.75, lat) * smoothstep(31.95, 31.75, lat);
}
// How much of a point is on the Tibetan side of the crest (0 south of it, 1 a little north).
export function tibet(lon, lat) {
	return smoothstep(-0.02, 0.1, lat - crestLat(lon));
}

// The road out of Delhi into the hills (before the gorge drawn above takes over) runs on a bench cut level across
// the slope, its floor the ground along the way smoothed to a road's gradient, so nothing on it lies on its side.
let BENCH = null;
// Tanakpur lies on the plain at the very foot of the hills, where the Sharda comes out of them: the plain runs up to it
function tanakpur(x, y, h) {
	const dt = Math.hypot(x - P.tanakpur[0] * U, y - P.tanakpur[1] * U);
	return dt < 6 ? lerp(h, Math.min(h, 4.2), smoothstep(6, 3, dt)) : h;
}
function bench(base) {
	const pts = ROUTE[0].pts, out = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const [a0, a1] = pts[i], [b0, b1] = pts[i + 1], n = Math.max(1, Math.ceil((Math.hypot(b0 - a0, b1 - a1) * U) / 0.25));
		for (let k = 0; k < n; k++) {
			const lo = lerp(a0, b0, k / n), la = lerp(a1, b1, k / n);
			// on the drawn gorge, the gorge's own floor, so the bench runs on into it without a step
			const w = nearestWay(lo * U, la * U, SEGS, 3);
			out.push({ x: lo * U, y: la * U, f: w.d < 1.2 ? w.floor : base(lo, la, true), fixed: w.d < 1.2 });
		}
	}
	// a running mean, then no steeper than a hill road
	const f = out.map((p) => p.f);
	for (let it = 0; it < 3; it++) for (let i = 0; i < f.length; i++) {
		let s = 0, c = 0;
		for (let j = Math.max(0, i - 6); j <= Math.min(f.length - 1, i + 6); j++) (s += f[j]), c++;
		out[i].f = s / c;
	}
	for (let i = 0; i < out.length; i++) if (out[i].fixed) out[i].f = f[i];
	for (let i = 1; i < out.length; i++) out[i].f = clamp(out[i].f, out[i - 1].f - 0.2, out[i - 1].f + 0.2);
	for (let i = out.length - 2; i >= 0; i--) out[i].f = clamp(out[i].f, out[i + 1].f - 0.2, out[i + 1].f + 0.2);
	const grid = new Map();
	for (const p of out) {
		const key = Math.floor(p.x / 2) * 100003 + Math.floor(p.y / 2);
		if (!grid.has(key)) grid.set(key, []);
		grid.get(key).push(p);
	}
	return grid;
}
// The height at lon, lat, given the map's own height h there (and base, the map's own height anywhere).
export function kHeight(lon, lat, h, base) {
	const m = kRegion(lon, lat);
	const x = lon * U, y = lat * U;

	if (m > 0) {
		const dN = lat - crestLat(lon);
		// the crest: a wall of snow peaks, falling away north to the plateau over about a third of a degree
		const rn = ridged(lon * 7 + 3, lat * 7, 4);
		const crest = 60.5 + rn * 7 - Math.abs(dN) * 38;
		// the plateau: a gently rolling floor at about 47, the lake basin a little lower
		let pl = 47.3 + (fbm(lon * 5 + 2, lat * 5 + 7, 4) - 0.5) * 2.2 + (fbm(lon * 19, lat * 19, 2) - 0.5) * 0.5;
		// the Barkha plain between the lakes and Darchen, flat and stony
		pl = lerp(pl, 47.3 + (fbm(lon * 9, lat * 9, 3) - 0.5) * 0.6, smoothstep(30.72, 30.8, lat) * smoothstep(30.97, 30.9, lat) * smoothstep(81.05, 81.15, lon) * smoothstep(81.75, 81.6, lon));
		// Gurla Mandhata: a great snow massif south of the lakes
		const dg = Math.hypot(x - P.gurla[0] * U, y - P.gurla[1] * U);
		if (dg < 9) pl += 21 * Math.pow(1 - dg / 9, 1.7) * (0.75 + 0.35 * ridged(lon * 11, lat * 11, 3));
		// the Kailash range: ridges rising north of Darchen, and the massif under the mountain itself
		const band = smoothstep(30.995, 31.12, lat) * smoothstep(80.85, 81.0, lon) * smoothstep(81.85, 81.7, lon) * smoothstep(31.85, 31.65, lat);
		const dk = Math.hypot(x - KX, y - KY);
		// (the ridges fall away round the mountain itself, which stands on a low massif of its own)
		pl += band * (4.5 + 8 * ridged(lon * 8 + 9, lat * 8 + 2, 4)) * smoothstep(5.5, 9.5, dk);
		pl += 4.2 * Math.pow(Math.max(0, 1 - dk / 8.6), 1.25);
		// lesser ranges across the plateau
		pl += smoothstep(0.55, 0.85, fbm(lon * 3.2 + 11, lat * 3.2 + 3, 3)) * 7 * ridged(lon * 9, lat * 9, 3);
		const north = tibet(lon, lat);
		const south = Math.max(h, crest);
		const plateau = Math.max(pl, crest);
		h = lerp(h, lerp(south, plateau, north), m);
	}
	h = tanakpur(x, y, h);
	if (base && lat > 28.95 && lon < 80.5) {
		// (the bench follows the ground as drawn here, less only the bench itself)
		BENCH ||= bench((lo, la) => tanakpur(lo * U, la * U, base(lo, la, true)));
		let best = Infinity, fl = 0;
		const cx = Math.floor(x / 2), cy = Math.floor(y / 2);
		for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of BENCH.get((cx + i) * 100003 + (cy + j)) || []) {
			const d = Math.hypot(p.x - x, p.y - y);
			if (d < best) (best = d), (fl = p.f);
		}
		if (best < 2.4) h = lerp(h, fl, smoothstep(2.4, 0.9, best));
	}
	// from the camp at Nabhidhang a side valley opens towards Om Parvat, so the mountain is seen whole from its foot
	{
		const ax = P.nabhidhang[0] * U, ay = P.nabhidhang[1] * U, dx = OM_DIR[0], dy = OM_DIR[1];
		const tr = (x - ax) * dx + (y - ay) * dy, t = clamp(tr, 0, 8.5), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
		if (d < 6 && tr > 0.6) h = smin(h, 49.9 + t * 0.12 + 1.4 * Math.pow(Math.max(0, d - 1.1), 1.15) + Math.max(0, 1.6 - tr) * 2, 0.8);
	}
	// Om Parvat above Nabhidhang
	const dom = Math.hypot(x - P.omParvat[0] * U, y - P.omParvat[1] * U);
	if (dom < 4.5) h += 11 * Math.pow(1 - dom / 4.5, 1.5);
	// the ways and rivers, cut into whatever is there
	for (const list of [SEGS, RIVER_SEGS]) {
		const n = nearestWay(x, y, list);
		if (n.s) {
			const e = Math.max(0, n.d - n.s.w);
			const cut = smin(h, n.floor + n.s.k * Math.pow(e, n.s.e), 0.8);
			// a way is a level bench across (built up on the valley side where the ground falls away); a river only cuts
			h = list === SEGS ? lerp(n.floor, cut, smoothstep(n.s.w * 0.6, n.s.w + 1.0, n.d)) : cut;
		}
	}
	// each stop stands on a level shelf
	for (const s of STOPS) {
		const d = Math.hypot(x - s.x, y - s.y);
		if (d < s.r1) {
			// level round the stop itself, easing out towards the floor of the way passing it (which may climb)
			const n = nearestWay(s.x, s.y), here = nearestWay(x, y);
			const fl = lerp(n.floor, here.s ? here.floor : n.floor, smoothstep(s.r0 * 0.45, s.r1, d));
			h = lerp(h, fl, smoothstep(s.r1, s.r0, d));
		}
	}
	// the lakes: flat water at their level, the shore shelving up from just above it
	for (const L of LAKES) {
		const sd = lakeDist(L, lon, lat);
		if (sd < 0) h = L.level - 0.45 - Math.min(0.5, -sd * 0.08);
		else if (sd < 2.5) h = Math.max(L.level + 0.07, lerp(L.level + 0.07, h, smoothstep(0, 2.5, sd)));
	}
	return h;
}

// Colour of the ground (sRGB 0..1) at lon, lat, height h, slope (0 flat .. 1 vertical), blended over the map's
// own colour c by how far into the region the point is.
const C = {
	steppe: [0.6, 0.52, 0.39], gravel: [0.55, 0.5, 0.43], grass: [0.5, 0.5, 0.31], meadow: [0.42, 0.47, 0.27], shore: [0.64, 0.6, 0.54],
	scree: [0.44, 0.38, 0.35], red: [0.55, 0.33, 0.25], dark: [0.3, 0.27, 0.26], snow: [0.92, 0.94, 0.97], ice: [0.8, 0.86, 0.92],
	pine: [0.17, 0.3, 0.16], alpine: [0.38, 0.43, 0.28],
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export function kColour(lon, lat, h, slope, c) {
	const m = kRegion(lon, lat);
	if (m <= 0) return c;
	const n = fbm(lon * 13 + 4, lat * 13, 3), n2 = fbm(lon * 41, lat * 41, 2);
	const tb = tibet(lon, lat);
	// the Tibetan side: tawny steppe and gravel, grass by the water, scree and red conglomerate on the slopes,
	// snow on the heights and the north faces
	let t = mix3(C.steppe, C.gravel, smoothstep(0.35, 0.7, n));
	let wet = 0;
	for (const L of LAKES) wet = Math.max(wet, smoothstep(5, 0.5, lakeDist(L, lon, lat)));
	const rv = nearestWay(lon * U, lat * U, RIVER_SEGS, 3);
	wet = Math.max(wet, smoothstep(2.2, 0.3, rv.d) * 0.8);
	t = mix3(t, C.grass, wet * (0.55 + 0.3 * n2));
	for (const L of LAKES) t = mix3(t, C.shore, smoothstep(1.2, 0.2, Math.abs(lakeDist(L, lon, lat))) * 0.8);
	const rocky = smoothstep(0.18, 0.5, slope + (n - 0.5) * 0.25);
	const redRock = smoothstep(0.45, 0.7, fbm(lon * 6 + 1, lat * 6 + 8, 3)) * smoothstep(30.98, 31.08, lat);
	t = mix3(t, mix3(C.scree, C.red, redRock), rocky);
	t = mix3(t, C.dark, smoothstep(0.55, 0.85, slope) * 0.5);
	const snowLine = 55.2 + n * 2.4 - slope * 2.5;
	t = mix3(t, slope > 0.75 ? C.ice : C.snow, smoothstep(snowLine, snowLine + 1.6, h) * (1 - smoothstep(0.82, 0.95, slope) * 0.6));
	// the Indian side keeps the map's colours, but the Byans valley above Gunji is alpine scrub and meadow
	let s = c.slice();
	const byans = smoothstep(80.78, 80.88, lon) * smoothstep(30.12, 30.17, lat);
	s = mix3(s, mix3(C.alpine, C.scree, rocky), byans * 0.8);
	s = mix3(s, C.snow, smoothstep(56 + n * 2, 58 + n * 2, h));
	const out = mix3(s, t, tb);
	return mix3(c, out, m);
}
// What the close-up ground is made of (see groundAt in world.js): the plateau is dry, grey-brown and stony.
export function kGround(lon, lat, h, g) {
	const m = kRegion(lon, lat) * tibet(lon, lat);
	if (m <= 0) return g;
	return [lerp(g[0], 0.12, m), lerp(g[1], 0.0, m), lerp(g[2], 0.12, m), lerp(g[3], 0.9, m)];
}
