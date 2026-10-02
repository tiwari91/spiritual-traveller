// Trees of the Indian countryside, built procedurally: branching trunks with bark, crowns of alpha-tested
// leaf-cluster cards with normals bent outward, palms with real fronds, conifers in tiers. Each species
// has two variants, drawn as instanced meshes near the camera and as baked impostor billboards (albedo
// and normals rendered once into an atlas) further out, with a dithered cross-fade between the two.
import * as THREE from "three";
import { DITHER, NO_FLIP, SHARED, haze, patch } from "./batch.js";
import { BARK, LEAF, barkAtlas, leafAtlas, leafCell } from "./textures.js";
import { clamp, lerp, rand } from "./util.js";

const M = 0.28; // world units per metre
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const smooth = (a, b, x) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};

// ---------- geometry builder ----------
class Geo {
	constructor() {
		this.p = [];
		this.n = [];
		this.uv = [];
		this.c = [];
		this.w = [];
		this.idx = [];
	}
	get count() {
		return this.p.length / 3;
	}
	vert(p, n, u, v, c, w) {
		this.p.push(p.x, p.y, p.z);
		this.n.push(n.x, n.y, n.z);
		this.uv.push(u, v);
		if (typeof c === "number") this.c.push(c, c, c);
		else this.c.push(c[0], c[1], c[2]);
		this.w.push(w);
		return this.p.length / 3 - 1;
	}
	build() {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
		g.setAttribute("aSway", new THREE.Float32BufferAttribute(this.w, 1));
		g.setIndex(this.idx);
		g.computeBoundingSphere();
		return g;
	}
}
// A tube along a polyline, for trunks, limbs, roots and twigs. Bark column `col` of the atlas.
function tube(g, pts, radii, sides, col, H, ao = 1, sway = null) {
	const n = pts.length;
	if (n < 2) return;
	const T = [], N = [], B = [];
	for (let i = 0; i < n; i++) {
		const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
		T.push(V().subVectors(b, a).normalize());
	}
	// parallel transport frame
	let nn = Math.abs(T[0].y) < 0.9 ? V().crossVectors(T[0], UP).normalize() : V(1, 0, 0);
	for (let i = 0; i < n; i++) {
		if (i > 0) {
			const ax = V().crossVectors(T[i - 1], T[i]);
			const s = ax.length();
			if (s > 1e-5) nn.applyAxisAngle(ax.divideScalar(s), Math.asin(Math.min(1, s)));
		}
		N.push(nn.clone());
		B.push(V().crossVectors(T[i], nn).normalize());
	}
	const u0 = col * 0.25 + 0.012, du = 0.25 - 0.024;
	let len = 0;
	const base = g.count;
	for (let i = 0; i < n; i++) {
		if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
		const r = radii[i];
		const circ = Math.max(0.05, 2 * Math.PI * r);
		const v = len / (circ * 4);
		const w = sway ? sway(pts[i]) : Math.pow(clamp(pts[i].y / H, 0, 1), 2);
		const a = typeof ao === "function" ? ao(pts[i]) : ao;
		for (let k = 0; k <= sides; k++) {
			const th = (k / sides) * Math.PI * 2;
			const dir = V().addScaledVector(N[i], Math.cos(th)).addScaledVector(B[i], Math.sin(th));
			g.vert(V().copy(pts[i]).addScaledVector(dir, r), dir, u0 + (k / sides) * du, v, a, w);
		}
	}
	for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
		const a = base + i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
		g.idx.push(a, c, b, b, c, d);
	}
}
// Points along a quadratic bezier.
function curve(a, ctrl, b, segs) {
	const out = [];
	for (let i = 0; i <= segs; i++) {
		const t = i / segs, u = 1 - t;
		out.push(V(u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y, u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z));
	}
	return out;
}
// A leaf card: a quad facing `nrm`, rotated by `rot`, with the given atlas cell and a bent normal for lighting.
function card(g, c, nrm, w, h, cell, ao, bent, sway, rot = 0, anchorBottom = false, upHint = null) {
	const n = nrm.clone().normalize();
	let up = upHint ? upHint.clone() : Math.abs(n.y) > 0.95 ? V(1, 0, 0) : UP.clone();
	up.addScaledVector(n, -up.dot(n)).normalize();
	const right = V().crossVectors(up, n).normalize();
	if (rot) {
		up.applyAxisAngle(n, rot);
		right.applyAxisAngle(n, rot);
	}
	const [u0, v0, du, dv] = cell;
	const iu = du * 0.015, iv = dv * 0.015;
	const base = g.count;
	const yb = anchorBottom ? 0 : -h / 2, yt = anchorBottom ? h : h / 2;
	const corners = [[-w / 2, yb, u0 + iu, v0 + dv - iv], [w / 2, yb, u0 + du - iu, v0 + dv - iv], [w / 2, yt, u0 + du - iu, v0 + iv], [-w / 2, yt, u0 + iu, v0 + iv]];
	for (const [x, y, u, v] of corners) {
		const p = V().copy(c).addScaledVector(right, x).addScaledVector(up, y);
		g.vert(p, bent, u, v, typeof ao === "function" ? ao(p) : ao, typeof sway === "function" ? sway(p) : sway);
	}
	g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function randUnit(R) {
	const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
	return V(r * Math.cos(a), z, r * Math.sin(a));
}

// ---------- species ----------
// Heights in metres; crown sizes as fractions of the height.
const SPECIES = {
	mango: { gen: "broad", h: [9, 13], bole: 0.2, trunkR: 0.32, cy: 0.55, rx: 0.5, ry: 0.4, lobes: [5, 7], lobeR: [0.2, 0.26], density: 1.35, card: 2.0, leaf: LEAF.mango, bark: BARK.furrow, leafTint: 0x2f5a1f, barkTint: 0x5a4838, lean: 0.8, limbUp: 0.25 },
	neem: { gen: "broad", h: [9, 13], bole: 0.3, trunkR: 0.26, cy: 0.62, rx: 0.42, ry: 0.36, lobes: [5, 8], lobeR: [0.15, 0.21], density: 1.05, card: 1.8, leaf: LEAF.neem, bark: BARK.furrow, leafTint: 0x5f8a30, barkTint: 0x4c3f36, lean: 1.2, limbUp: 0.35 },
	tamarind: { gen: "broad", h: [12, 16], bole: 0.25, trunkR: 0.36, cy: 0.6, rx: 0.46, ry: 0.36, lobes: [6, 9], lobeR: [0.15, 0.21], density: 1.2, card: 2.0, leaf: LEAF.neem, bark: BARK.furrow, leafTint: 0x46702a, barkTint: 0x463a33, lean: 1.4, limbUp: 0.3 },
	jamun: { gen: "broad", h: [10, 14], bole: 0.28, trunkR: 0.3, cy: 0.6, rx: 0.38, ry: 0.4, lobes: [5, 7], lobeR: [0.17, 0.22], density: 1.25, card: 1.8, leaf: LEAF.banyan, bark: BARK.smooth, leafTint: 0x2f5426, barkTint: 0x7a7066, lean: 0.8, limbUp: 0.4 },
	banyan: { gen: "broad", h: [11, 15], bole: 0.3, trunkR: 0.7, cy: 0.62, rx: 0.95, ry: 0.3, flat: 0.62, lobes: [10, 14], lobeR: [0.18, 0.24], density: 1.1, card: 2.2, leaf: LEAF.banyan, bark: BARK.smooth, leafTint: 0x3c6528, barkTint: 0x857c70, lean: 0.4, limbUp: 0.12, roots: true },
	peepal: { gen: "broad", h: [12, 16], bole: 0.32, trunkR: 0.5, cy: 0.62, rx: 0.5, ry: 0.42, lobes: [6, 9], lobeR: [0.13, 0.19], density: 0.85, card: 1.8, leaf: LEAF.peepal, bark: BARK.smooth, leafTint: 0x5d8f36, barkTint: 0x938d83, lean: 1.0, limbUp: 0.35 },
	sal: { gen: "broad", h: [18, 26], bole: 0.45, trunkR: 0.3, cy: 0.72, rx: 0.22, ry: 0.27, lobes: [4, 6], lobeR: [0.1, 0.14], density: 1.0, card: 2.0, leaf: LEAF.mango, bark: BARK.furrow, leafTint: 0x5e8c36, barkTint: 0x584a3e, lean: 0.5, limbUp: 0.6 },
	eucalyptus: { gen: "broad", h: [18, 26], bole: 0.55, trunkR: 0.22, cy: 0.77, rx: 0.17, ry: 0.22, lobes: [3, 5], lobeR: [0.07, 0.1], density: 0.75, card: 1.7, leaf: LEAF.euc, bark: BARK.smooth, leafTint: 0x77906a, barkTint: 0xe6e0d4, lean: 1.0, limbUp: 0.8 },
	acacia: { gen: "broad", h: [5, 8], bole: 0.4, trunkR: 0.14, cy: 0.78, rx: 0.6, ry: 0.16, flat: 0.45, lobes: [4, 7], lobeR: [0.16, 0.22], density: 0.85, card: 1.3, leaf: LEAF.acacia, bark: BARK.furrow, leafTint: 0x667d34, barkTint: 0x3a302a, lean: 2.0, limbUp: 0.2 },
	bush: { gen: "broad", h: [1.2, 2.2], bole: 0, trunkR: 0.04, cy: 0.48, rx: 0.6, ry: 0.42, lobes: [2, 4], lobeR: [0.3, 0.4], density: 1.0, card: 0.7, leaf: LEAF.shrub, bark: BARK.furrow, leafTint: 0x587a30, barkTint: 0x5a4a3a, lean: 0.2, limbUp: 0.5, stems: 4 },
	coconut: { gen: "palm", h: [12, 19], leaf: LEAF.frond, bark: BARK.palm, leafTint: 0x7a9a3c, barkTint: 0x9a9284, trunkR: 0.17 },
	toddy: { gen: "fan", h: [12, 17], leaf: LEAF.fan, bark: BARK.palm, leafTint: 0x5b7a3c, barkTint: 0x4a4744, trunkR: 0.28 },
	deodar: { gen: "deodar", h: [20, 30], leaf: LEAF.deodar, bark: BARK.furrow, leafTint: 0x3a5c48, barkTint: 0x5a4c42, trunkR: 0.4 },
	pine: { gen: "pine", h: [16, 25], leaf: LEAF.pine, bark: BARK.plates, leafTint: 0x6a8c3a, barkTint: 0xa06c50, trunkR: 0.3 },
	thor: { gen: "thor", h: [1.4, 2.4], leaf: LEAF.shrub, bark: BARK.smooth, leafTint: 0x587a30, barkTint: 0x5f8a44, trunkR: 0.08 },
};
export const SPECIES_NAMES = Object.keys(SPECIES);
const VARIANTS = 2;

function broadleaf(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const hs = H / P.h[1];
	const bole = H * P.bole * (0.85 + R() * 0.3);
	const tr = P.trunkR * (0.8 + R() * 0.3) * Math.sqrt(hs) * (P.h[1] / 13) ** 0.3;
	const rx = H * P.rx * (0.85 + R() * 0.3), ry = H * P.ry * (0.9 + R() * 0.2), cy = H * P.cy;
	const flat = P.flat || 1;
	const lean = V((R() - 0.5) * P.lean, 0, (R() - 0.5) * P.lean);
	const C = V(lean.x * 0.6, cy, lean.z * 0.6);
	const sides = low ? 5 : 7;
	const aoWood = (p) => (p.y > cy - ry ? 0.65 : 1);
	// the trunk, with a slight lean and bend, up to where the limbs fork
	const top = V(lean.x, Math.max(bole, 0.05), lean.z);
	if (P.stems) {
		for (let i = 0; i < P.stems; i++) {
			const a = R() * 6.3, e = V(Math.cos(a) * rx * 0.5, cy, Math.sin(a) * rx * 0.5);
			tube(wood, curve(V(0, 0, 0), V(e.x * 0.3, cy * 0.5, e.z * 0.3), e, 3), [tr, tr * 0.8, tr * 0.6, tr * 0.4], 3, P.bark, H, 0.6);
		}
	} else {
		const pts = curve(V(0, 0, 0), V(lean.x * 0.2 + (R() - 0.5) * 0.3, bole * 0.5, lean.z * 0.2 + (R() - 0.5) * 0.3), top, 4);
		const radii = pts.map((p, i) => tr * (1.25 - (i / (pts.length - 1)) * 0.35) * (i === 0 ? 1.15 : 1));
		tube(wood, pts, radii, sides, P.bark, H, aoWood);
		// the leader on up into the crown
		tube(wood, curve(top, V(top.x, (top.y + cy) / 2, top.z), V(C.x, cy + ry * 0.35, C.z), 3), [tr * 0.85, tr * 0.6, tr * 0.4, tr * 0.2], Math.max(4, sides - 2), P.bark, H, aoWood);
		if (P.roots) {
			// the banyan's trunk is a braid of fused stems
			for (let k = 0; k < 3; k++) {
				const a = k * 2.1 + R(), r0 = tr * 0.8;
				const b0 = V(Math.cos(a) * r0, 0, Math.sin(a) * r0);
				tube(wood, curve(b0, V(b0.x * 0.4, bole * 0.5, b0.z * 0.4), V(top.x + b0.x * 0.5, bole * 1.05, top.z + b0.z * 0.5), 3), [tr * 0.55, tr * 0.45, tr * 0.42, tr * 0.38], sides - 2, P.bark, H, aoWood);
			}
		}
	}
	// crown lobes
	const nl = Math.floor(lerp(P.lobes[0], P.lobes[1] + 0.99, R()));
	const lobes = [];
	let rmax = 0;
	for (let i = 0; i < nl; i++) {
		const th = (i / nl) * Math.PI * 2 + (R() - 0.5) * 0.9;
		const el = lerp(-0.25, 0.85, R());
		const r = H * lerp(P.lobeR[0], P.lobeR[1], R());
		const d = V(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el));
		const k = 1 - (r / Math.max(rx, ry)) * 0.55;
		lobes.push({ c: V(C.x + d.x * rx * k, cy + d.y * ry * k, C.z + d.z * rx * k), r });
		rmax = Math.max(rmax, r);
	}
	lobes.push({ c: V(C.x, cy + ry * 0.45, C.z), r: H * P.lobeR[1] * (0.9 + R() * 0.2) });
	const limbR = Math.max(0.03, tr * 0.6);
	for (const L of lobes) {
		// a limb from the fork (or partway up the leader) out to each lobe, then twigs into the foliage
		const s = top.clone().lerp(V(C.x, cy, C.z), R() * 0.5);
		const mid = V().addVectors(s, L.c).multiplyScalar(0.5).addScaledVector(UP, s.distanceTo(L.c) * P.limbUp);
		const pts = curve(s, mid, L.c, 4);
		const rr = limbR * Math.sqrt(L.r / rmax);
		if (!P.stems) tube(wood, pts, pts.map((p, i) => rr * (1 - (i / 4) * 0.75)), Math.max(3, sides - 3), P.bark, H, aoWood);
		const nt = low ? 2 : 4;
		for (let t = 0; t < nt; t++) {
			const e = randUnit(R).multiplyScalar(L.r * 0.8);
			e.y *= flat;
			tube(wood, [L.c.clone(), V().addVectors(L.c, e)], [rr * 0.3, rr * 0.08], 3, P.bark, H, 0.6);
		}
	}
	// leaf cards over the lobes' outer shell; cards buried inside a neighbour are dropped
	const dens = P.density * (low ? 0.62 : 1);
	const cell = leafCell(P.leaf);
	const swayL = (p) => 0.4 + Math.pow(clamp(p.y / H, 0, 1), 2) * 0.9;
	for (const L of lobes) {
		const n = Math.max(5, Math.round(dens * (4 * Math.PI * L.r * L.r * flat) / (P.card * P.card) * 1.25));
		for (let k = 0; k < n; k++) {
			const dir = randUnit(R);
			const p = V().copy(dir).multiplyScalar(L.r * (0.6 + 0.4 * Math.sqrt(R())));
			p.y *= flat;
			p.add(L.c);
			let hidden = false;
			for (const o of lobes) if (o !== L && p.distanceTo(o.c) < o.r * 0.7) hidden = true;
			if (hidden && R() < 0.85) continue;
			const rel = V((p.x - C.x) / rx, (p.y - cy) / (ry * 1.2), (p.z - C.z) / rx);
			const out = rel.clone().normalize();
			const d = rel.length();
			const nrm = V().copy(dir).multiplyScalar(0.6).add(randUnit(R).multiplyScalar(0.45)).addScaledVector(UP, 0.25);
			const bent = V().copy(out).multiplyScalar(0.8).addScaledVector(nrm.clone().normalize(), 0.25).addScaledVector(UP, 0.2).normalize();
			const ao = (0.42 + 0.58 * smooth(0.25, 1.05, d)) * (0.78 + 0.22 * clamp((p.y - (cy - ry)) / (2 * ry), 0, 1));
			const sz = P.card * (0.8 + R() * 0.45);
			card(leaf, p, nrm, sz, sz, cell, ao, bent, swayL, R() * 6.3);
		}
	}
	// the banyan's aerial roots, some reaching the ground as pillars, some still hanging
	if (P.roots) {
		const nr = low ? 8 : 16;
		for (let i = 0; i < nr; i++) {
			const L = lobes[Math.floor(R() * (lobes.length - 1))];
			const a = R() * 6.3, d = Math.sqrt(R()) * L.r * 0.8;
			const x = L.c.x + Math.cos(a) * d, z = L.c.z + Math.sin(a) * d;
			const yTop = L.c.y - L.r * flat * 0.4;
			const pillar = R() < 0.14;
			const yBot = pillar || R() < 0.45 ? 0 : yTop - (1 + R() * 3);
			const r = pillar ? 0.07 + R() * 0.1 : 0.012 + R() * 0.015;
			tube(wood, [V(x, yTop, z), V(x + (R() - 0.5) * 0.3, (yTop + yBot) / 2, z + (R() - 0.5) * 0.3), V(x, yBot, z)], [r * 0.7, r, r * (yBot ? 0.4 : 1.4)], pillar ? 5 : 3, P.bark, H, 0.75, () => 0.05);
		}
	}
	return { wood, leaf, H };
}

// Coconut: a curved ringed trunk and a crown of arching pinnate fronds with a cluster of nuts.
function palm(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const lean = 0.05 + R() * 0.25, az = R() * 6.3;
	const dx = Math.cos(az), dz = Math.sin(az);
	const topP = V(dx * Math.sin(lean) * H, H * Math.cos(lean * 0.6), dz * Math.sin(lean) * H);
	const ctrl = V(dx * Math.sin(lean) * H * 0.2, H * 0.5, dz * Math.sin(lean) * H * 0.2);
	const pts = curve(V(0, 0, 0), ctrl, topP, 8);
	const r0 = P.trunkR * (0.9 + R() * 0.2);
	tube(wood, pts, pts.map((p, i) => r0 * (i === 0 ? 1.6 : i === 1 ? 1.15 : 1 - (i / 8) * 0.25)), low ? 5 : 7, P.bark, H, 1);
	const T = topP;
	// nuts under the crown
	for (let i = 0; i < (low ? 5 : 9); i++) {
		const a = R() * 6.3, p = V(T.x + Math.cos(a) * 0.25, T.y - 0.3 - R() * 0.3, T.z + Math.sin(a) * 0.25);
		const g = new THREE.IcosahedronGeometry(0.13, 0);
		const pp = g.attributes.position, nn = g.attributes.normal;
		const base = wood.count;
		const col = R() < 0.6 ? [0.45, 0.6, 0.25] : [0.7, 0.55, 0.25];
		for (let k = 0; k < pp.count; k++) wood.vert(V(pp.getX(k) + p.x, pp.getY(k) + p.y, pp.getZ(k) + p.z), V(nn.getX(k), nn.getY(k), nn.getZ(k)), 0.3, 0.5, col, 0.8);
		for (let k = 0; k < pp.count; k++) wood.idx.push(base + k);
	}
	const nf = low ? 16 : 24;
	const cellF = leafCell(LEAF.frond), cellD = leafCell(LEAF.frondDead);
	for (let i = 0; i < nf + 3; i++) {
		const dead = i >= nf;
		const a = (i / nf) * Math.PI * 2 * 2.618 + R() * 0.3;
		const el = dead ? -1.1 - R() * 0.3 : lerp(0.95, -0.35, Math.pow(R(), 0.8));
		const L = dead ? 3 + R() : 4.2 + R() * 1.4;
		const droop = dead ? 0.1 : 0.55 + R() * 0.3;
		frond(leaf, T, a, el, L, droop, dead ? cellD : cellF, 1.5, dead ? [1.3, 1.1, 0.9] : 1, low ? 5 : 7);
	}
	return { wood, leaf, H: H + 2 };
}
// One frond: a V-shaped ribbon arching out and down, rachis along the cell's middle.
function frond(g, T, az, el, L, droop, cell, span, ao, segs) {
	const dirH = V(Math.cos(az), 0, Math.sin(az));
	const side = V(-dirH.z, 0, dirH.x);
	const [u0, v0, du, dv] = cell;
	const pts = [];
	for (let i = 0; i <= segs; i++) {
		const t = i / segs;
		pts.push(V().copy(T).addScaledVector(dirH, Math.cos(el) * t * L).addScaledVector(UP, Math.sin(el) * t * L - droop * t * t * L));
	}
	for (const half of [-1, 1]) {
		const base = g.count;
		for (let i = 0; i <= segs; i++) {
			const t = i / segs;
			const w = span * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.5 + 0.05;
			const p = pts[i];
			const edge = V().copy(p).addScaledVector(side, half * w).addScaledVector(UP, w * 0.35);
			const bent = V().copy(dirH).multiplyScalar(0.5).addScaledVector(UP, 0.8).addScaledVector(side, half * 0.3).normalize();
			const u = u0 + du * (0.015 + t * 0.97);
			const sw = 0.4 + t * t * 1.2;
			g.vert(p, bent, u, v0 + dv * 0.5, ao, sw);
			g.vert(edge, bent, u, v0 + dv * (half < 0 ? 0.02 : 0.98), ao, sw);
		}
		for (let i = 0; i < segs; i++) {
			const a = base + i * 2;
			g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
}
// Palmyra (toddy) palm: a straight dark trunk and a ball of stiff fan leaves, dead leaves hanging below.
function fanPalm(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const T = V((R() - 0.5) * 0.4, H, (R() - 0.5) * 0.4);
	const pts = curve(V(0, 0, 0), V(0, H * 0.5, 0), T, 6);
	const r0 = P.trunkR * (0.9 + R() * 0.2);
	tube(wood, pts, pts.map((p, i) => r0 * (i === 0 ? 1.5 : 1 + Math.sin((i / 6) * Math.PI) * 0.12)), low ? 5 : 7, P.bark, H, 1);
	const cell = leafCell(LEAF.fan);
	const n = low ? 18 : 30;
	for (let i = 0; i < n + 8; i++) {
		const dead = i >= n;
		const a = R() * 6.3;
		const el = dead ? -1.2 - R() * 0.3 : lerp(-0.4, 1.3, Math.pow(R(), 0.7));
		const d = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
		const stalk = dead ? 0.6 : 1.1 + R() * 0.5;
		const s = V().copy(T).addScaledVector(d, stalk);
		tube(wood, [T.clone(), s], [0.05, 0.035], 3, BARK.smooth, H, 0.8, () => 0.6);
		const sz = dead ? 1.6 : 2 + R() * 0.5;
		const c = V().copy(s).addScaledVector(d, sz * 0.45);
		const nrm = V().copy(d).multiplyScalar(0.3).add(randUnit(R).multiplyScalar(0.3)).addScaledVector(V().crossVectors(d, UP).normalize(), 0.8);
		const bent = V().copy(d).addScaledVector(UP, 0.3).normalize();
		card(leaf, c, nrm, sz, sz, cell, dead ? [2.2, 1.5, 1.3] : 0.7 + R() * 0.35, bent, 0.9, 0, false, d);
	}
	return { wood, leaf, H: H + 2.5 };
}
// Deodar: a straight trunk and whorls of drooping branches, shorter towards the top, with flat needle sprays.
function deodar(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const r0 = P.trunkR * (H / 25);
	tube(wood, curve(V(0, 0, 0), V((R() - 0.5) * 0.4, H * 0.5, (R() - 0.5) * 0.4), V(0, H, 0), 5), [r0 * 1.2, r0, r0 * 0.75, r0 * 0.5, r0 * 0.25, 0.03], low ? 5 : 7, P.bark, H, (p) => 0.6 + 0.4 * (p.y / H));
	const cell = leafCell(LEAF.deodar);
	const y0 = H * (0.08 + R() * 0.1);
	const step = (low ? 0.95 : 0.7) * (H / 25);
	for (let y = y0; y < H * 0.97; y += step * (0.85 + R() * 0.3)) {
		const t = (y - y0) / (H - y0);
		const L = Math.pow(1 - t, 0.85) * H * 0.27 + 0.5;
		const nb = 4 + Math.floor(R() * 3), a0 = R() * 6.3;
		for (let j = 0; j < nb; j++) {
			if (R() < 0.15) continue;
			const az = a0 + (j / nb) * Math.PI * 2 + (R() - 0.5) * 0.5;
			const pitch = -0.12 - R() * 0.22 + t * 0.35;
			const dir = V(Math.cos(az) * Math.cos(pitch), Math.sin(pitch), Math.sin(az) * Math.cos(pitch));
			const s = V(0, y, 0), e = V().copy(s).addScaledVector(dir, L).addScaledVector(UP, -L * 0.15);
			const mid = V().addVectors(s, e).multiplyScalar(0.5).addScaledVector(UP, L * 0.06);
			const pts = curve(s, mid, e, 3);
			if (!low || L > 2) tube(wood, pts, [0.05 * L, 0.035 * L, 0.02 * L, 0.01], 3, P.bark, H, 0.55);
			const ns = Math.max(1, Math.ceil(L / 0.85));
			for (let k = 0; k < ns; k++) {
				const f = 0.3 + 0.7 * ((k + 0.5) / ns);
				const p = V().lerpVectors(s, e, f);
				p.y += Math.sin(f * Math.PI) * L * 0.06;
				const out = V(p.x, 0, p.z).normalize();
				const nrm = V().copy(UP).addScaledVector(out, 0.25).add(randUnit(R).multiplyScalar(0.25));
				const bent = V().copy(out).multiplyScalar(0.55).addScaledVector(UP, 0.7).normalize();
				const ao = (0.45 + 0.55 * f) * (0.75 + 0.25 * t);
				const w = 1.3 + R() * 0.5;
				card(leaf, p, nrm, w * 1.1, w * 0.75, cell, ao, bent, 0.3 + f * 0.7 + t * 0.5, 0, false, dir);
				if (!low && R() < 0.5) card(leaf, p.clone().addScaledVector(UP, -0.12), V().copy(dir).cross(UP).add(UP), w, w * 0.7, cell, ao * 0.85, bent, 0.3 + f, 0, false, dir);
			}
		}
	}
	// the drooping leader
	card(leaf, V(0.2, H - 0.3, 0), V(1, 0.2, 0), 0.9, 1.2, cell, 1, V(0, 1, 0), 1.4);
	return { wood, leaf, H };
}
// Chir pine: a tall straight trunk with plated bark and an open crown of upturned branches with needle tufts.
function pine(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const r0 = P.trunkR * (H / 22);
	const wob = () => (R() - 0.5) * 0.5;
	const trunk = curve(V(0, 0, 0), V(wob(), H * 0.5, wob()), V(wob() * 0.6, H * 0.94, wob() * 0.6), 6);
	tube(wood, trunk, trunk.map((p, i) => r0 * (i === 0 ? 1.3 : 1 - (i / 6) * 0.8)), low ? 5 : 7, P.bark, H, 1);
	const cell = leafCell(LEAF.pine);
	const tuft = (p, out, ao, sw) => {
		const n = low ? 3 : 5;
		for (let k = 0; k < n; k++) {
			const nrm = V().copy(out).multiplyScalar(0.5).add(randUnit(R)).addScaledVector(UP, 0.3);
			const bent = V().copy(out).multiplyScalar(0.7).addScaledVector(UP, 0.5).normalize();
			const sz = 1.0 + R() * 0.5;
			card(leaf, V().copy(p).add(randUnit(R).multiplyScalar(0.3)), nrm, sz, sz, cell, ao, bent, sw, R() * 6.3);
		}
	};
	const trunkAt = (y) => {
		const t = clamp(y / (H * 0.94), 0, 1) * 6;
		const i = Math.min(5, Math.floor(t));
		return V().lerpVectors(trunk[i], trunk[i + 1], t - i);
	};
	for (let y = H * (0.45 + R() * 0.1); y < H * 0.95; y += 0.9 + R() * 0.6) {
		const t = (y - H * 0.45) / (H * 0.55);
		const nb = 3 + Math.floor(R() * 3), a0 = R() * 6.3;
		for (let j = 0; j < nb; j++) {
			if (R() < 0.28) continue;
			const az = a0 + (j / nb) * Math.PI * 2 + (R() - 0.5) * 0.7;
			const L = (0.35 + 0.65 * (1 - t)) * H * 0.17 * (0.7 + R() * 0.6);
			const pitch = 0.2 + R() * 0.4;
			const s = trunkAt(y), dir = V(Math.cos(az) * Math.cos(pitch), Math.sin(pitch), Math.sin(az) * Math.cos(pitch));
			const e = V().copy(s).addScaledVector(dir, L).addScaledVector(UP, L * 0.15);
			const mid = V().lerpVectors(s, e, 0.5).addScaledVector(UP, -L * 0.08);
			tube(wood, curve(s, mid, e, 2), [0.05 * L, 0.03 * L, 0.01], 3, P.bark, H, 0.7);
			const out = V(dir.x, 0, dir.z).normalize();
			tuft(e, out, 0.65 + 0.35 * t, 0.6 + t * 0.6);
			if (L > 1.5 && R() < 0.7) tuft(V().lerpVectors(s, e, 0.6), out, 0.55 + 0.3 * t, 0.5 + t * 0.5);
		}
	}
	tuft(V(trunk[6].x, H, trunk[6].z), V(0, 1, 0), 1, 1.3);
	// dead stubs lower down the bole
	for (let i = 0; i < 6; i++) {
		const y = H * (0.2 + R() * 0.25), az = R() * 6.3, s = trunkAt(y);
		tube(wood, [s, V(s.x + Math.cos(az) * 0.5, y + 0.1, s.z + Math.sin(az) * 0.5)], [0.04, 0.01], 3, P.bark, H, 0.7);
	}
	return { wood, leaf, H: H + 0.6 };
}
// Thor (Euphorbia): the candelabra cactus of Deccan hedges, green stems and no leaves.
function thor(R, P, low) {
	const wood = new Geo(), leaf = new Geo();
	const H = lerp(P.h[0], P.h[1], R());
	const n = low ? 5 : 9;
	for (let i = 0; i < n; i++) {
		const a = R() * 6.3, d = R() * 0.4, h = H * (0.6 + R() * 0.4);
		const b = V(Math.cos(a) * d, 0, Math.sin(a) * d);
		const arm = R() < 0.5 ? 0.3 + R() * 0.3 : 0;
		const pts = arm ? [b, V(b.x, h * 0.3, b.z), V(b.x + Math.cos(a) * arm, h * 0.38, b.z + Math.sin(a) * arm), V(b.x + Math.cos(a) * arm, h, b.z + Math.sin(a) * arm)] : [b, V(b.x, h * 0.5, b.z), V(b.x + (R() - 0.5) * 0.1, h, b.z)];
		tube(wood, pts, pts.map(() => 0.06 + R() * 0.02), 6, BARK.smooth, H, [0.55, 0.85, 0.45]);
	}
	return { wood, leaf, H };
}
const GEN = { broad: broadleaf, palm, fan: fanPalm, deodar, pine, thor };

// ---------- materials ----------
const SWAY_VERT = `
	vec3 stIP = vec3( instanceMatrix[ 3 ] );
	float stPh = stIP.x * 0.37 + stIP.z * 0.21;
	float stW = aSway * uWind;
	transformed.x += ( sin( uTime * 1.3 + stPh ) * 0.6 + sin( uTime * 2.7 + stPh * 1.7 ) * 0.25 ) * stW * 0.11;
	transformed.z += cos( uTime * 1.1 + stPh * 1.3 ) * 0.5 * stW * 0.09;
	vStFade = 1.0 - smoothstep( uNear, uNear + uBand, distance( stIP, uCam ) );
`;
function lodMaterial(mat, near, band, leafy) {
	mat.userData.u = { uNear: { value: near }, uBand: { value: band } };
	return patch(mat, "lod" + (leafy ? "L" : "W"), (s) => {
		Object.assign(s.uniforms, SHARED, mat.userData.u);
		s.vertexShader = "attribute float aSway;\nuniform float uTime, uWind, uNear, uBand;\nuniform vec3 uCam;\nvarying float vStFade;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + (leafy ? SWAY_VERT + "\ttransformed += normal * sin( uTime * 5.0 + position.x * 3.0 + position.y * 2.0 + stPh ) * 0.03 * stW;\n" : SWAY_VERT));
		s.fragmentShader = "varying float vStFade;\n" + DITHER + s.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\tif ( vStFade < 0.999 && stDither( gl_FragCoord.xy ) > vStFade ) discard;").replace("#include <normal_fragment_begin>", leafy ? NO_FLIP : "#include <normal_fragment_begin>");
	});
}
function depthMaterial(mat, leafy) {
	const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafy ? mat.map : null, alphaTest: leafy ? mat.alphaTest : 0, side: THREE.DoubleSide });
	return patch(d, "lodD" + (leafy ? "L" : "W"), (s) => {
		Object.assign(s.uniforms, SHARED, mat.userData.u);
		s.vertexShader = "attribute float aSway;\nuniform float uTime, uWind, uNear, uBand;\nuniform vec3 uCam;\nvarying float vStFade;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + SWAY_VERT);
		s.fragmentShader = "varying float vStFade;\n" + s.fragmentShader;
	});
}
// Impostor: a quad turned to the camera and tilted back by the bake angle, lit with the baked normals.
const IMP_BASIS = `
	vec3 stBase = vec3( instanceMatrix[ 3 ] );
	vec3 stToC = uCam - stBase;
	float stDist = length( stToC );
	stToC.y = 0.0;
	vec3 stFH = length( stToC ) > 1e-4 ? normalize( stToC ) : vec3( 0.0, 0.0, 1.0 );
	vec3 stR = vec3( stFH.z, 0.0, - stFH.x );
	vec3 stU = vec3( 0.0, cos( uTilt ), 0.0 ) - stFH * sin( uTilt );
	vec3 stF = vec3( 0.0, sin( uTilt ), 0.0 ) + stFH * cos( uTilt );
`;
const IMP_POS = `
	float stSw = sin( uTime * 1.3 + stBase.x * 0.37 + stBase.z * 0.21 ) * 0.015 * position.y * position.y * uWind;
	vec3 transformed = stBase + stR * ( position.x * aImp.y + stSw * abs( aImp.w ) ) + stU * ( aImp.z + position.y * aImp.w );
	vec2 stCell = vec2( mod( aImp.x, uGrid.x ), floor( aImp.x / uGrid.x ) );
	vStUv = ( stCell + vec2( position.x + 0.5, position.y ) ) / uGrid;
	vStFade = smoothstep( uNear, uNear + uBand, stDist );
`;
const IMP_HEAD = "attribute vec4 aImp;\nuniform float uTime, uWind, uNear, uBand, uTilt;\nuniform vec3 uCam;\nuniform vec2 uGrid;\nvarying vec2 vStUv;\nvarying float vStFade;\nvarying vec3 vStR, vStU, vStF;\n";
function impostorMaterial(alb, nrm, grid, tilt, near, band) {
	const m = haze(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide }));
	m.shadowSide = THREE.DoubleSide;
	const u = { uAlb: { value: alb }, uNrm: { value: nrm }, uGrid: { value: grid }, uTilt: { value: tilt }, uNear: { value: near }, uBand: { value: band } };
	m.userData.u = u;
	patch(m, "imp", (s) => {
		Object.assign(s.uniforms, SHARED, u);
		s.vertexShader = IMP_HEAD + s.vertexShader
			.replace("#include <beginnormal_vertex>", IMP_BASIS + "\tvec3 objectNormal = stF;\n\tvStR = stR * sign( aImp.y ); vStU = stU; vStF = stF;")
			.replace("#include <defaultnormal_vertex>", "vec3 transformedNormal = normalMatrix * objectNormal;")
			.replace("#include <begin_vertex>", IMP_POS)
			.replace("#include <project_vertex>", "vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 );\n\tgl_Position = projectionMatrix * mvPosition;")
			.replace("#include <worldpos_vertex>", "vec4 worldPosition = vec4( transformed, 1.0 );");
		s.fragmentShader = "uniform sampler2D uAlb, uNrm;\nvarying vec2 vStUv;\nvarying float vStFade;\nvarying vec3 vStR, vStU, vStF;\n" + DITHER + s.fragmentShader
			.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\tif ( vStFade < 0.999 && stDither( gl_FragCoord.xy ) < 1.0 - vStFade ) discard;")
			.replace("#include <map_fragment>", "vec4 stA = texture2D( uAlb, vStUv );\n\tdiffuseColor.rgb *= stA.rgb;\n\tdiffuseColor.a = stA.a;")
			.replace("#include <normal_fragment_maps>", "vec3 stN = texture2D( uNrm, vStUv ).xyz * 2.0 - 1.0;\n\tnormal = normalize( ( viewMatrix * vec4( normalize( vStR * stN.x + vStU * stN.y + vStF * stN.z ), 0.0 ) ).xyz );");
	});
	const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide });
	patch(d, "impD", (s) => {
		Object.assign(s.uniforms, SHARED, u);
		s.vertexShader = IMP_HEAD + s.vertexShader
			.replace("#include <begin_vertex>", IMP_BASIS + IMP_POS)
			.replace("#include <project_vertex>", "vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 );\n\tgl_Position = projectionMatrix * mvPosition;");
		s.fragmentShader = "uniform sampler2D uAlb;\nvarying vec2 vStUv;\nvarying float vStFade;\nvarying vec3 vStR, vStU, vStF;\n" + s.fragmentShader.replace("#include <map_fragment>", "diffuseColor.a = texture2D( uAlb, vStUv ).a;");
	});
	return [m, d];
}
// Unlit bake: albedo (texture x vertex AO x tint) or view-space normals.
const BAKE_VS = `
attribute vec3 color;
varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() { vUv = uv; vCol = color; vN = normalize( normalMatrix * normal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const BAKE_FS = `
uniform sampler2D map; uniform vec3 tint; uniform float mode, cut;
varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() {
	vec4 t = texture2D( map, vUv );
	if ( t.a < cut ) discard;
	if ( mode < 0.5 ) gl_FragColor = vec4( t.rgb * vCol * tint, 1.0 );
	else gl_FragColor = vec4( normalize( vN ) * 0.5 + 0.5, 1.0 );
}`;

// ---------- the system ----------
const STRIDE = 11; // x, y, z, yaw, sxz, sy, kind, r, g, b, painted
export const TREE_STRIDE = STRIDE;
const LEAF_GAIN = 1.6, BARK_GAIN = 1.7;

export class Trees {
	constructor(scene, low = false) {
		Trees.instance = this;
		this.low = low;
		this.near = low ? 15 : 26;
		this.band = low ? 3 : 4;
		this.group = new THREE.Group();
		this.group.name = "trees";
		scene.add(this.group);
		this.sets = new Map();
		this.dirty = true;
		this.lastCam = new THREE.Vector3(1e9, 0, 0);
		const leafTex = leafAtlas(low), barkTex = barkAtlas();
		this.leafMat = haze(lodMaterial(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, color: new THREE.Color(LEAF_GAIN, LEAF_GAIN, LEAF_GAIN) }), this.near, this.band, true));
		this.woodMat = haze(lodMaterial(new THREE.MeshStandardMaterial({ map: barkTex, vertexColors: true, roughness: 0.95, color: new THREE.Color(BARK_GAIN, BARK_GAIN, BARK_GAIN) }), this.near, this.band, false));
		const leafDepth = depthMaterial(this.leafMat, true), woodDepth = depthMaterial(this.woodMat, false);
		// species x variants
		this.kinds = [];
		const cap = low ? 260 : 700;
		SPECIES_NAMES.forEach((name, si) => {
			const P = SPECIES[name];
			for (let v = 0; v < VARIANTS; v++) {
				const R = rand(si * 977 + v * 131 + 7);
				const t = GEN[P.gen](R, P, low);
				const wood = t.wood.build(), leaf = t.leaf.count ? t.leaf.build() : null;
				const k = { name, P, wood, leaf, H: t.H, cell: this.kinds.length, leafTint: new THREE.Color(P.leafTint), barkTint: new THREE.Color(P.barkTint) };
				k.wim = this.instanced(wood, this.woodMat, woodDepth, cap);
				k.lim = leaf ? this.instanced(leaf, this.leafMat, leafDepth, cap) : null;
				// crown radius for spacing and contact shadows
				wood.computeBoundingBox();
				const bb = leaf ? (leaf.computeBoundingBox(), leaf.boundingBox.clone().union(wood.boundingBox)) : wood.boundingBox.clone();
				k.radius = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
				k.trunkR = (P.trunkR || 0.2) * (name === "banyan" ? 1.3 : 1);
				this.kinds.push(k);
			}
		});
		this.byName = {};
		this.kinds.forEach((k, i) => (this.byName[k.name] ||= []).push(i));
		// impostors
		this.cols = 8;
		this.rows = Math.ceil(this.kinds.length / this.cols);
		this.cellPx = low ? 128 : 256;
		this.tilt = 0.42;
		const W = this.cols * this.cellPx, H = this.rows * this.cellPx;
		const rt = () => {
			const r = new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
			return r;
		};
		this.rtA = rt();
		this.rtN = rt();
		const [im, imd] = impostorMaterial(this.rtA.texture, this.rtN.texture, new THREE.Vector2(this.cols, this.rows), this.tilt, this.near, this.band);
		const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
		this.impCap = low ? 9000 : 16000;
		this.imp = new THREE.InstancedMesh(quad, im, this.impCap);
		this.imp.customDepthMaterial = imd;
		this.impAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.impCap * 4), 4);
		this.impAttr.setUsage(THREE.DynamicDrawUsage);
		quad.setAttribute("aImp", this.impAttr);
		this.imp.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.imp.setColorAt(0, new THREE.Color(1, 1, 1));
		this.imp.count = 0;
		this.imp.frustumCulled = false;
		this.imp.castShadow = true;
		this.imp.receiveShadow = true;
		this.imp.visible = false;
		this.group.add(this.imp);
		// white and red bands painted on highway trees: white to a metre, a red ring above
		const band = new THREE.BufferGeometry();
		{
			const parts = [[0, 0.77, [0.92, 0.9, 0.86]], [0.77, 1, [0.62, 0.05, 0.04]]];
			const P = [], N = [], Cc = [];
			for (const [y0, y1, col] of parts) {
				const g = new THREE.CylinderGeometry(1, 1, y1 - y0, 10, 1, true).translate(0, (y0 + y1) / 2, 0).toNonIndexed();
				P.push(...g.attributes.position.array);
				N.push(...g.attributes.normal.array);
				for (let i = 0; i < g.attributes.position.count; i++) Cc.push(...col);
			}
			band.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
			band.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
			band.setAttribute("color", new THREE.Float32BufferAttribute(Cc, 3));
		}
		this.paint = new THREE.InstancedMesh(band, haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })), low ? 600 : 1500);
		this.paint.count = 0;
		this.paint.frustumCulled = false;
		this.paint.receiveShadow = true;
		this.group.add(this.paint);
		this.baked = false;
		// bake the impostors on the first frame, when the renderer is at hand
		const prev = scene.onBeforeRender;
		scene.onBeforeRender = (renderer, sc, cam, target) => {
			if (!this.baked) {
				this.bake(renderer);
				scene.onBeforeRender = prev;
			}
			prev.call(scene, renderer, sc, cam, target);
		};
	}
	instanced(geo, mat, depth, cap) {
		const m = new THREE.InstancedMesh(geo, mat, cap);
		m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		m.setColorAt(0, new THREE.Color(1, 1, 1));
		m.instanceColor.setUsage(THREE.DynamicDrawUsage);
		m.count = 0;
		m.visible = false;
		m.frustumCulled = false;
		m.castShadow = true;
		m.receiveShadow = true;
		m.customDepthMaterial = depth;
		this.group.add(m);
		return m;
	}
	// A kind index for a species: one of its variants.
	kind(name, R) {
		const a = this.byName[name] || this.byName.neem;
		return a[Math.floor(R() * a.length)];
	}
	radius(kind) {
		return this.kinds[kind].radius * M;
	}
	add(id, data, n, opts = {}) {
		this.sets.set(id, { data, n, visible: opts.visible !== false });
		this.dirty = true;
	}
	remove(id) {
		if (this.sets.delete(id)) this.dirty = true;
	}
	setVisible(id, v) {
		const s = this.sets.get(id);
		if (s && s.visible !== v) {
			s.visible = v;
			this.dirty = true;
		}
	}
	bake(renderer) {
		this.baked = true;
		const scene = new THREE.Scene();
		const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
		const prevShadow = renderer.shadowMap.enabled;
		renderer.shadowMap.enabled = false;
		const mk = (map, cut, side) => new THREE.ShaderMaterial({ uniforms: { map: { value: map }, tint: { value: new THREE.Color() }, mode: { value: 0 }, cut: { value: cut } }, vertexShader: BAKE_VS, fragmentShader: BAKE_FS, side });
		const lm = mk(leafAtlas(this.low), 0.45, THREE.DoubleSide), wm = mk(barkAtlas(), -1, THREE.FrontSide);
		const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
		const e = this.tilt;
		cam.position.set(0, Math.sin(e) * 50, Math.cos(e) * 50);
		cam.up.set(0, 1, 0);
		cam.lookAt(0, 0, 0);
		const px = this.cellPx;
		const v = new THREE.Vector3();
		for (const k of this.kinds) {
			// frame the tree as seen from the bake angle
			let minY = Infinity, maxY = -Infinity, maxX = 0;
			for (const g of [k.wood, k.leaf]) {
				if (!g) continue;
				const p = g.attributes.position;
				for (let i = 0; i < p.count; i++) {
					v.fromBufferAttribute(p, i);
					const py = v.y * Math.cos(e) - v.z * Math.sin(e);
					minY = Math.min(minY, py);
					maxY = Math.max(maxY, py);
					maxX = Math.max(maxX, Math.abs(v.x));
				}
			}
			const S = Math.max(maxX * 2, maxY - minY) * 1.04;
			k.S = S;
			k.y0 = minY - S * 0.01;
			cam.left = -S / 2;
			cam.right = S / 2;
			cam.bottom = k.y0;
			cam.top = k.y0 + S;
			cam.updateProjectionMatrix();
			const cx = (k.cell % this.cols) * px, cy = Math.floor(k.cell / this.cols) * px;
			scene.clear();
			const mw = new THREE.Mesh(k.wood, wm);
			scene.add(mw);
			let ml = null;
			if (k.leaf) scene.add((ml = new THREE.Mesh(k.leaf, lm)));
			for (const [rt, mode] of [[this.rtA, 0], [this.rtN, 1]]) {
				lm.uniforms.mode.value = wm.uniforms.mode.value = mode;
				lm.uniforms.tint.value.copy(k.leafTint).multiplyScalar(LEAF_GAIN);
				wm.uniforms.tint.value.copy(k.barkTint).multiplyScalar(BARK_GAIN);
				rt.viewport.set(cx, cy, px, px);
				rt.scissor.set(cx, cy, px, px);
				rt.scissorTest = true;
				renderer.setRenderTarget(rt);
				renderer.setClearColor(mode ? 0x8080ff : 0x2a3a1c, 0);
				renderer.autoClear = false;
				renderer.clear(true, true, false);
				renderer.render(scene, cam);
			}
			void ml;
		}
		for (const rt of [this.rtA, this.rtN]) {
			rt.scissorTest = false;
			rt.viewport.set(0, 0, rt.width, rt.height);
		}
		lm.dispose();
		wm.dispose();
		renderer.setRenderTarget(prevTarget);
		renderer.autoClear = prevAuto;
		renderer.setClearColor(prevClear, prevAlpha);
		renderer.shadowMap.enabled = prevShadow;
		this.dirty = true;
	}
	update(camera) {
		SHARED.uCam.value.copy(camera.position);
		SHARED.uTime.value = performance.now() / 1000;
		if (!this.baked) return;
		const cp = camera.position;
		const moved = cp.distanceToSquared(this.lastCam) > 0.25;
		if (!this.dirty && !moved) return;
		this.lastCam.copy(cp);
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
		const r2 = (this.near + this.band + 1) ** 2;
		const counts = this.kinds.map(() => 0);
		const cap = this.kinds[0].wim.instanceMatrix.count;
		let ni = 0, np = 0;
		const impM = this.imp.instanceMatrix.array, impA = this.impAttr.array, impC = this.imp.instanceColor.array;
		const pm = this.paint.instanceMatrix.array;
		const full = this.dirty;
		for (const set of this.sets.values()) {
			if (!set.visible) continue;
			const d = set.data;
			for (let i = 0; i < set.n; i++) {
				const o = i * STRIDE;
				const x = d[o], y = d[o + 1], z = d[o + 2];
				const ki = d[o + 6], k = this.kinds[ki];
				const dd = (x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2;
				if (dd < r2 && counts[ki] < cap) {
					const j = counts[ki]++;
					e.set(0, d[o + 3], 0);
					q.setFromEuler(e);
					m.compose(p.set(x, y, z), q, s.set(d[o + 4] * M, d[o + 5] * M, d[o + 4] * M));
					m.toArray(k.wim.instanceMatrix.array, j * 16);
					c.setRGB(d[o + 7], d[o + 8], d[o + 9]);
					k.wim.instanceColor.setXYZ(j, k.barkTint.r * (0.75 + c.r * 0.25), k.barkTint.g * (0.75 + c.g * 0.25), k.barkTint.b * (0.75 + c.b * 0.25));
					if (k.lim) {
						m.toArray(k.lim.instanceMatrix.array, j * 16);
						k.lim.instanceColor.setXYZ(j, k.leafTint.r * c.r, k.leafTint.g * c.g, k.leafTint.b * c.b);
					}
				}
				if (full && ni < this.impCap) {
					// translation only; the shader builds the billboard
					const b = ni * 16;
					impM.fill(0, b, b + 16);
					impM[b] = impM[b + 5] = impM[b + 10] = impM[b + 15] = 1;
					impM[b + 12] = x;
					impM[b + 13] = y;
					impM[b + 14] = z;
					const flip = (i * 7919) % 2 ? -1 : 1;
					impA[ni * 4] = k.cell;
					impA[ni * 4 + 1] = k.S * d[o + 4] * M * flip;
					impA[ni * 4 + 2] = k.y0 * d[o + 5] * M;
					impA[ni * 4 + 3] = k.S * d[o + 5] * M;
					impC[ni * 3] = d[o + 7];
					impC[ni * 3 + 1] = d[o + 8];
					impC[ni * 3 + 2] = d[o + 9];
					ni++;
				}
				if (full && d[o + 10] > 0 && np < this.paint.instanceMatrix.count) {
					const r = k.trunkR * d[o + 4] * M * 1.12;
					m.compose(p.set(x, y - 0.02, z), q.identity(), s.set(r, 1.3 * M, r));
					m.toArray(pm, np * 16);
					np++;
				}
			}
		}
		this.kinds.forEach((k, i) => {
			for (const im of [k.wim, k.lim]) {
				if (!im) continue;
				im.count = counts[i];
				im.visible = counts[i] > 0;
				if (counts[i]) {
					im.instanceMatrix.clearUpdateRanges();
					im.instanceMatrix.addUpdateRange(0, counts[i] * 16);
					im.instanceMatrix.needsUpdate = true;
					im.instanceColor.clearUpdateRanges();
					im.instanceColor.addUpdateRange(0, counts[i] * 3);
					im.instanceColor.needsUpdate = true;
				}
			}
		});
		if (full) {
			this.imp.count = ni;
			this.imp.visible = ni > 0;
			for (const [a, n] of [[this.imp.instanceMatrix, 16], [this.impAttr, 4], [this.imp.instanceColor, 3]]) {
				a.clearUpdateRanges();
				a.addUpdateRange(0, Math.max(1, ni) * n);
				a.needsUpdate = true;
			}
			this.paint.count = np;
			this.paint.visible = np > 0;
			this.paint.instanceMatrix.needsUpdate = true;
		}
		this.dirty = false;
	}
}
