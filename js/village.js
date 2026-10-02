// Villages laid out along lanes: a lane in from the highway and one across it, houses shoulder to shoulder
// facing them, shops with painted signboards in the local script at the highway end, a bus shelter, a
// temple and a peepal katta at the crossing, a hand pump, a well, laundry lines, two-wheelers, people,
// cattle, goats and dogs. Houses are textured: plastered and painted walls with windows, doors and grime,
// Mangalore-tile and tin roofs with overhangs, flat concrete roofs with parapets and black water tanks,
// and unfinished brick houses with rebar standing out of the roof.
import * as THREE from "three";
import { HAZE_FOG, T, place, patch } from "./batch.js";
import { addAnimal, addBike, addPerson, handPump, haystack, katta, laundry, shrine, well } from "./life.js";
import { WALL, houseAtlas, signAtlas, signCell, wallCell } from "./textures.js";
import { clamp, lerp } from "./util.js";

const M = 0.28;
const C = (h) => new THREE.Color(h);
const pick = (R, a) => a[Math.floor(R() * a.length)];

// Wall paints by region: lime white, indigo-washed blue, pastel pinks and greens, ochre, cement grey.
const PAINTS = {
	deccan: [0xf0ece4, 0xb9d4e6, 0x9cc7d8, 0xe9c9cf, 0xc6dcb4, 0xf1d99a, 0xd6d0c4, 0xe8b88e, 0xa7c6a0],
	telangana: [0xf2a7b8, 0x9fd3c0, 0xf3e3a0, 0xc8b6e2, 0xf0ece4, 0x8fc3e0, 0xf2c08a, 0xd6d0c4],
	south: [0xf0ece4, 0xf2c08a, 0x9fd3c0, 0xf2a7b8, 0xf3e3a0, 0xe6e0d0, 0x8fc3e0],
	sahyadri: [0xf0ece4, 0xdfe8ee, 0xe9d7b0, 0xc8dcc0, 0xe6c8b0],
	central: [0xf0ece4, 0xe9d7b0, 0xb9d4e6, 0xd6d0c4, 0xe8c4a8, 0xc6dcb4],
	gangetic: [0xf0ece4, 0xe9d7b0, 0xd6d0c4, 0xf2d6b0, 0xc8d8e0],
	doon: [0xf0ece4, 0xdfe8ee, 0xe9d7b0, 0xd6d0c4],
	garhwal: [0xf0ece4, 0xe6dfd2, 0xd9e2ee, 0xeacdb8],
};
const STYLE = {
	sahyadri: { roofs: [["hip", 6], ["flat", 2], ["tin", 1]], brick: 0.05, floors: [0.85, 0.15], lane: 0x8a5a3a },
	deccan: { roofs: [["flat", 6], ["tin", 2], ["hip", 1.2]], brick: 0.16, floors: [0.6, 0.35], lane: 0x8a7a62 },
	telangana: { roofs: [["flat", 7], ["tin", 1.5], ["hip", 1]], brick: 0.14, floors: [0.55, 0.38], lane: 0x9a6a4a },
	south: { roofs: [["flat", 5], ["hip", 3], ["tin", 1]], brick: 0.1, floors: [0.6, 0.35], lane: 0x9a6a4a },
	central: { roofs: [["flat", 5], ["hip", 2], ["tin", 2]], brick: 0.15, floors: [0.65, 0.3], lane: 0x8a7860 },
	gangetic: { roofs: [["flat", 6], ["thatch", 1.2], ["tin", 1.5]], brick: 0.4, floors: [0.55, 0.38], lane: 0x9a8a6c },
	doon: { roofs: [["flat", 4], ["tin", 3], ["hip", 1]], brick: 0.15, floors: [0.6, 0.35], lane: 0x8a7a64 },
	garhwal: { roofs: [["slate", 6], ["flat", 2], ["tin", 2]], brick: 0.05, floors: [0.3, 0.5], stone: 0.6, lane: 0x7a7060 },
};
function choose(R, list) {
	let t = 0;
	for (const [, w] of list) t += w;
	let x = R() * t;
	for (const [k, w] of list) if ((x -= w) <= 0) return k;
	return list[0][0];
}

// ---------- materials ----------
export function houseMaterial(low) {
	const m = new THREE.MeshStandardMaterial({ map: houseAtlas(low), vertexColors: true, roughness: 0.88 });
	return patch(m, "house", (s) => {
		s.vertexShader = "attribute vec4 aRect;\nvarying vec4 vRect;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvRect = aRect;");
		s.fragmentShader = "varying vec4 vRect;\n" + s.fragmentShader
			.replace("#include <map_fragment>", `
	vec2 hIn = vRect.zw * 0.01;
	vec2 hA = vRect.xy + hIn + fract( vMapUv ) * ( vRect.zw - 2.0 * hIn );
	vec4 hT = textureGrad( map, hA, dFdx( vMapUv ) * vRect.zw, dFdy( vMapUv ) * vRect.zw );
	diffuseColor.rgb *= mix( hT.rgb, hT.rgb * vColor, hT.a );`)
			.replace("#include <color_fragment>", "")
			.replace("#include <fog_fragment>", HAZE_FOG);
	});
}
export function signMaterial() {
	const m = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.7 });
	return patch(m, "sign", (s) => {
		s.fragmentShader = s.fragmentShader.replace("#include <fog_fragment>", HAZE_FOG);
	});
}

// Textured quads for houses (atlas rect per quad, repeat count in uv), and a plain one for signs.
export class HouseGeo {
	constructor() {
		this.p = [];
		this.n = [];
		this.uv = [];
		this.c = [];
		this.r = [];
		this.idx = [];
	}
	get empty() {
		return this.idx.length === 0;
	}
	// corners A (bottom left), B (bottom right), C (top right), D (top left) seen from outside
	quad(A, B, Cc, D, rect, u1, v1, col, u0 = 0, v0 = 0, ref = null) {
		const ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z, bx = D.x - A.x, by = D.y - A.y, bz = D.z - A.z;
		let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
		// turn the face to the reference direction (mirroring it) if it was wound the other way
		if (ref && nx * ref.x + ny * ref.y + nz * ref.z < 0) return this.quad(B, A, D, Cc, rect, u0, v1, col, u1, v0);
		const l = Math.hypot(nx, ny, nz) || 1;
		nx /= l;
		ny /= l;
		nz /= l;
		const base = this.p.length / 3;
		const e = 0.003;
		const uvs = [[u0 + e, v1 - e], [u1 - e, v1 - e], [u1 - e, v0 + e], [u0 + e, v0 + e]];
		[A, B, Cc, D].forEach((q, i) => {
			this.p.push(q.x, q.y, q.z);
			this.n.push(nx, ny, nz);
			this.uv.push(uvs[i][0], uvs[i][1]);
			this.c.push(col.r, col.g, col.b);
			this.r.push(rect[0], rect[1], rect[2], rect[3]);
		});
		this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
	tri(A, B, Cc, rect, uvA, uvB, uvC, col, ref = null) {
		const ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z, bx = Cc.x - A.x, by = Cc.y - A.y, bz = Cc.z - A.z;
		let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
		if (ref && nx * ref.x + ny * ref.y + nz * ref.z < 0) return this.tri(B, A, Cc, rect, uvB, uvA, uvC, col);
		const l = Math.hypot(nx, ny, nz) || 1;
		const base = this.p.length / 3;
		[[A, uvA], [B, uvB], [Cc, uvC]].forEach(([q, uv]) => {
			this.p.push(q.x, q.y, q.z);
			this.n.push(nx / l, ny / l, nz / l);
			this.uv.push(uv[0], uv[1]);
			this.c.push(col.r, col.g, col.b);
			this.r.push(rect[0], rect[1], rect[2], rect[3]);
		});
		this.idx.push(base, base + 1, base + 2);
	}
	build(mat, plain = false) {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		if (!plain) {
			g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
			g.setAttribute("aRect", new THREE.Float32BufferAttribute(this.r, 4));
		}
		g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
		g.computeBoundingSphere();
		const m = new THREE.Mesh(g, mat);
		m.castShadow = true;
		m.receiveShadow = true;
		return m;
	}
}

// ---------- a house ----------
// o: { x, z, yaw (front faces +z rotated by yaw), W, D (metres), floors, roof, paint, wall, shop, sign, lang }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UPV = V(0, 1, 0), DOWNV = V(0, -1, 0);
export function houseFits(world, o) {
	const hs = cornersOf(o, 0.6);
	let lo = Infinity, hi = -Infinity;
	for (const [x, z] of hs) {
		const h = world.height(x, z);
		lo = Math.min(lo, h);
		hi = Math.max(hi, h);
	}
	return hi - lo < 0.75 ? [lo, hi] : null;
}
function cornersOf(o, pad = 0) {
	const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
	const hw = (o.W / 2 + pad) * M, hd = (o.D / 2 + pad) * M;
	return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]].map(([u, v]) => [o.x + u * cs + v * sn, o.z - u * sn + v * cs]);
}
export function footprint(o, pad = 0) {
	return cornersOf(o, pad).slice(0, 4);
}
export function house(hg, sg, b, world, R, o) {
	const fit = o.fit || houseFits(world, o);
	if (!fit) return false;
	const [lo, hi] = fit;
	const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
	// local (u across the front, v towards the front, metres) to world
	const P = (u, y, v) => V(o.x + u * M * cs + v * M * sn, y, o.z - u * M * sn + v * M * cs);
	const W = o.W, D = o.D, F = o.floors, FH = 3.0;
	const plinth = 0.45;
	const y0 = hi + plinth * M, yb = lo - 0.06;
	const paint = C(o.paint);
	const grey = C(0xc9c4ba).multiplyScalar(0.9 + R() * 0.15);
	const rect = (i) => wallCell(i);
	const kind = o.wall; // plaster | brick | stone
	const tiles = {
		plaster: { win: WALL.window, door: WALL.door, plain: WALL.plain },
		brick: { win: WALL.brickWin, door: WALL.brickWin, plain: WALL.brick },
		stone: { win: WALL.stoneWin, door: WALL.wood, plain: WALL.stone },
	}[kind];
	const wallCol = kind === "plaster" ? paint : C(0xffffff).multiplyScalar(0.85 + R() * 0.2);
	// plinth all round, from below the lowest corner to the floor
	const face = (u0, v0, u1, v1, ya, yb2, rectI, colr, uRep, vRep) => hg.quad(P(u0, ya, v0), P(u1, ya, v1), P(u1, yb2, v1), P(u0, yb2, v0), rect(rectI), uRep, vRep, colr);
	const sides = [
		// front, right, back, left: start and end corners going anticlockwise seen from above, outward normal
		[[-W / 2, D / 2], [W / 2, D / 2], W],
		[[W / 2, D / 2], [W / 2, -D / 2], D],
		[[W / 2, -D / 2], [-W / 2, -D / 2], W],
		[[-W / 2, -D / 2], [-W / 2, D / 2], D],
	];
	for (const [[ua, va], [ub, vb], len] of sides) face(ua * 1.02, va * 1.02, ub * 1.02, vb * 1.02, yb, y0, WALL.concrete, grey, len / 3, (y0 - yb) / M / 3);
	// walls: bays one tile wide, one floor tall
	const doorBay = Math.floor(R() * Math.max(1, Math.round(W / 3)));
	sides.forEach(([[ua, va], [ub, vb], len], si) => {
		const nb = Math.max(1, Math.round(len / 3));
		for (let f = 0; f < F; f++) {
			const ya = y0 + f * FH * M, yt = ya + FH * M;
			for (let i = 0; i < nb; i++) {
				const t0 = i / nb, t1 = (i + 1) / nb;
				let ti;
				if (si === 0) {
					if (f === 0 && o.shop) ti = WALL.shop;
					else if (f === 0 && i === doorBay) ti = tiles.door;
					else ti = R() < 0.8 ? tiles.win : tiles.plain;
				} else ti = R() < (si === 2 ? 0.3 : 0.45) ? tiles.win : tiles.plain;
				if (kind === "stone" && f > 0 && si === 0 && R() < 0.5) ti = WALL.wood;
				face(lerp(ua, ub, t0), lerp(va, vb, t0), lerp(ua, ub, t1), lerp(va, vb, t1), ya, yt, ti, wallCol, 1, 1);
			}
		}
	});
	const y1 = y0 + F * FH * M;
	// a step at the door
	const doorU = -W / 2 + (doorBay + 0.5) * (W / Math.max(1, Math.round(W / 3)));
	{
		const p = P(doorU, 0, D / 2 + 0.35);
		b.add(T.box, place(p.x, yb, p.z, o.yaw, 1.3 * M, y0 - yb - 0.2 * M, 0.7 * M), 0xa8a296);
	}
	// shop signboard over the shutter
	if (o.shop && o.sign) {
		const z = D / 2 + 0.06, ya = y0 + 2.25 * M, yt = y0 + 2.95 * M;
		const [u0, v0, du, dv] = o.sign;
		const hw = Math.min(W / 2 - 0.1, 1.6);
		const A = P(-hw, ya, z), B = P(hw, ya, z), Cq = P(hw, yt, z), Dq = P(-hw, yt, z);
		sg.quad(A, B, Cq, Dq, [0, 0, 1, 1], u0 + du, v0 + dv, C(0xffffff), u0, v0);
	}
	// roofs
	const roof = o.roof;
	if (roof === "flat") {
		const oh = 0.3, th = 0.18;
		const ys = y1 + th * M;
		// slab edge all round and its top
		for (const [[ua, va], [ub, vb], len] of sides) face(ua + Math.sign(ua) * oh, va + Math.sign(va) * oh, ub + Math.sign(ub) * oh, vb + Math.sign(vb) * oh, y1 - 0.02, ys, WALL.concrete, grey, len / 3, 0.1);
		hg.quad(P(-W / 2 - oh, ys, D / 2 + oh), P(W / 2 + oh, ys, D / 2 + oh), P(W / 2 + oh, ys, -D / 2 - oh), P(-W / 2 - oh, ys, -D / 2 - oh), rect(WALL.concrete), W / 3, D / 3, grey.clone().multiplyScalar(0.92));
		// underside of the overhang
		hg.quad(P(-W / 2 - oh, y1 - 0.02, -D / 2 - oh), P(W / 2 + oh, y1 - 0.02, -D / 2 - oh), P(W / 2 + oh, y1 - 0.02, D / 2 + oh), P(-W / 2 - oh, y1 - 0.02, D / 2 + oh), rect(WALL.concrete), W / 3, D / 3, grey.clone().multiplyScalar(0.6));
		if (o.unfinished) {
			// columns waiting for the next floor, rebar sticking out of them
			for (const [u, v] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [0, D / 2], [0, -D / 2]]) {
				const p = P(u * 0.94, 0, v * 0.94);
				b.add(T.box, place(p.x, ys, p.z, o.yaw, 0.3 * M, 0.5 * M, 0.3 * M), 0xa9a49a);
				for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add(T.box, place(p.x + (a * 0.08 * cs + c * 0.08 * sn) * M, ys + 0.5 * M, p.z + (-a * 0.08 * sn + c * 0.08 * cs) * M, o.yaw, 0.02 * M, (0.7 + R() * 0.5) * M, 0.02 * M, (R() - 0.5) * 0.15, (R() - 0.5) * 0.15), 0x4a3426);
			}
		} else {
			// parapet: low walls round the roof, plastered like the house
			const ph = 0.85, pt = 0.15;
			const pc = kind === "plaster" ? paint : grey;
			for (const [[ua, va], [ub, vb], len] of sides) {
				face(ua, va, ub, vb, ys, ys + ph * M, WALL.plain, pc, len / 3, ph / 3);
				// inner face
				const iu = (u) => u - Math.sign(u) * pt, iv = (v) => v - Math.sign(v) * pt;
				hg.quad(P(iu(ub), ys, iv(vb)), P(iu(ua), ys, iv(va)), P(iu(ua), ys + ph * M, iv(va)), P(iu(ub), ys + ph * M, iv(vb)), rect(WALL.plain), len / 3, ph / 3, pc.clone().multiplyScalar(0.92));
				hg.quad(P(iu(ua), ys + ph * M, iv(va)), P(iu(ub), ys + ph * M, iv(vb)), P(ub, ys + ph * M, vb), P(ua, ys + ph * M, va), rect(WALL.concrete), len / 3, 0.05, grey, 0, 0, UPV);
			}
			// black plastic water tank on a little stand, and often a stair room
			if (R() < 0.75) {
				const p = P((R() - 0.5) * (W - 2.2), 0, (R() - 0.5) * (D - 2.2));
				b.add(T.box, place(p.x, ys, p.z, o.yaw, 1.3 * M, 0.35 * M, 1.3 * M), 0x8f8a80);
				b.add(T.cyl12, place(p.x, ys + 0.35 * M, p.z, 0, 1.05 * M, 1.15 * M, 1.05 * M), R() < 0.8 ? 0x1b1b1c : 0xd8d2c4);
				b.add(T.dome, place(p.x, ys + 1.5 * M, p.z, 0, 1.05 * M, 0.25 * M, 1.05 * M), 0x1b1b1c);
			}
			if (R() < 0.4 && W > 5 && D > 5) {
				const mu = -W / 2 + 1.5, mv = -D / 2 + 1.5;
				const q = { x: P(mu, 0, mv).x, z: P(mu, 0, mv).z, yaw: o.yaw, W: 2.4, D: 2.4 };
				const mc = (u, y, v) => V(q.x + u * M * cs + v * M * sn, y, q.z - u * M * sn + v * M * cs);
				const mh = 2.4 * M;
				const ms = [[[-1.2, 1.2], [1.2, 1.2]], [[1.2, 1.2], [1.2, -1.2]], [[1.2, -1.2], [-1.2, -1.2]], [[-1.2, -1.2], [-1.2, 1.2]]];
				ms.forEach(([[ua, va], [ub, vb]], i) => hg.quad(mc(ua, ys, va), mc(ub, ys, vb), mc(ub, ys + mh, vb), mc(ua, ys + mh, va), rect(i === 0 ? tiles.door : tiles.plain), 0.8, 0.8, wallCol));
				hg.quad(mc(-1.4, ys + mh, 1.4), mc(1.4, ys + mh, 1.4), mc(1.4, ys + mh, -1.4), mc(-1.4, ys + mh, -1.4), rect(WALL.concrete), 1, 1, grey);
			}
			if (R() < 0.3) {
				const a = P(-W / 2 + 0.6, 0, D / 2 - 0.8), c = P(W / 2 - 0.6, 0, D / 2 - 0.8);
				laundry(b, R, a.x, ys, a.z, c.x, ys, c.z);
			}
		}
	} else {
		// pitched roofs: hip (tile, thatch) or gable (tin, slate), ridge along the longer side
		const hip = roof === "hip" || roof === "thatch";
		const slope = { hip: 0.42, thatch: 0.62, tin: 0.26, slate: 0.5 }[roof] || 0.4;
		const oh = roof === "thatch" ? 0.6 : roof === "tin" ? 0.35 : 0.55;
		const tile = { hip: WALL.tile, thatch: WALL.thatch, tin: WALL.tin, slate: WALL.slate }[roof];
		const along = W >= D; // ridge along u
		const A = (along ? W : D) / 2 + oh, Bh = (along ? D : W) / 2 + oh;
		const rise = Bh * slope;
		const ridgeHalf = hip ? Math.max(0.2, A - Bh) : A;
		const L = (a, b, y) => (along ? P(a, y, b) : P(b, y, a));
		const rc = C(0xffffff).multiplyScalar(0.85 + R() * 0.2);
		const slopeLen = Math.hypot(Bh, rise) / 3;
		const ye = y1 - 0.02, yr = y1 + rise * M;
		// the two long slopes
		for (const sgn of [1, -1]) {
			const e0 = L(-A * sgn, Bh * sgn, ye), e1 = L(A * sgn, Bh * sgn, ye), r1 = L(ridgeHalf * sgn, 0, yr), r0 = L(-ridgeHalf * sgn, 0, yr);
			hg.quad(e0, e1, r1, r0, rect(tile), (2 * A) / 3, slopeLen, rc, 0, 0, UPV);
		}
		if (hip) {
			for (const sgn of [1, -1]) {
				const e0 = L(A * sgn, -Bh, ye), e1 = L(A * sgn, Bh, ye), r = L(ridgeHalf * sgn, 0, yr);
				hg.tri(e0, e1, r, rect(tile), [0, slopeLen], [(2 * Bh) / 3, slopeLen], [Bh / 3, 0], rc, UPV);
			}
		} else {
			// gable ends, in the wall's finish
			for (const sgn of [1, -1]) {
				const e0 = L((A - oh) * sgn, -Bh + oh, y1), e1 = L((A - oh) * sgn, Bh - oh, y1), r = L((A - oh) * sgn, 0, y1 + (Bh - oh) * slope * M);
				const out = V(r.x - o.x, 0, r.z - o.z);
				hg.tri(e0, e1, r, rect(tiles.plain), [0, 0.5], [(Bh * 2) / 3, 0.5], [Bh / 3, 0], wallCol, out);
			}
		}
		// eave undersides, so the overhang reads from below
		hg.quad(L(-A, -Bh, ye - 0.005), L(-A, Bh, ye - 0.005), L(A, Bh, ye - 0.005), L(A, -Bh, ye - 0.005), rect(WALL.wood), (2 * A) / 3, (2 * Bh) / 3, C(0x8a7a6a), 0, 0, DOWNV);
		// ridge cap and fascia boards
		const rp = L(0, 0, yr);
		b.add(T.box, place(rp.x, yr - 0.03, rp.z, o.yaw + (along ? Math.PI / 2 : 0), 0.12, 0.08, (2 * ridgeHalf + 0.1) * M), roof === "thatch" ? 0x6a5a3a : roof === "tin" ? 0x6f777c : 0x7a3a24);
		// a verandah on wooden posts in front of tiled houses
		if (roof === "hip" && R() < 0.55) {
			const vd = 2.0, vy = y0 + 2.3 * M;
			const v0 = D / 2, v1 = D / 2 + vd;
			hg.quad(P(-W / 2, vy, v1), P(W / 2, vy, v1), P(W / 2, y1 - 0.1 * M, v0), P(-W / 2, y1 - 0.1 * M, v0), rect(WALL.tile), W / 3, 0.8, rc, 0, 0, UPV);
			hg.quad(P(W / 2, vy - 0.01, v1), P(-W / 2, vy - 0.01, v1), P(-W / 2, y1 - 0.11 * M, v0), P(W / 2, y1 - 0.11 * M, v0), rect(WALL.wood), W / 3, 0.8, C(0x8a7a6a), 0, 0, DOWNV);
			for (const u of [-W / 2 + 0.2, 0, W / 2 - 0.2]) {
				const p = P(u, 0, v1 - 0.2);
				b.add(T.box, place(p.x, y0, p.z, o.yaw, 0.15 * M, vy - y0, 0.15 * M), 0x5a3a24);
			}
			// the verandah floor
			const pf = P(0, 0, (v0 + v1) / 2);
			b.add(T.box, place(pf.x, yb, pf.z, o.yaw, W * M, y0 - yb, vd * M), 0xa8a296);
		}
	}
	return true;
}

// ---------- a village ----------
// ctx: frame, height, ok, taken, claim, b (batch), hg/sg (house/sign geometry), fields (for lanes), trees,
// R, lang, region style. c: { s, v, side } the crossing of the lanes.
export function village(ctx, c, n, styleKey, opts = {}) {
	const { R, world } = ctx;
	const st = STYLE[styleKey] || STYLE.deccan;
	const paints = PAINTS[styleKey] || PAINTS.deccan;
	const side = c.side;
	const vC = c.v, sC = c.s;
	const reach = 6 + n * 0.45; // lane length each way, world units
	const laneW = (styleKey === "garhwal" ? 2.4 : 3.6) * M;
	const laneCol = C(st.lane);
	const houses = [];
	const tmp = {};
	const F = (s, v, out = {}) => ctx.frame(s, v * side, out);
	// the lanes: one in from the highway (s fixed), one across it (v fixed); dirt strips
	const vStart = 2.05, vEnd = vC + reach * 0.7;
	const lanes = [];
	const laneStrip = (pts, w) => {
		const ok = pts.filter((p) => ctx.ok(p.x, p.z, 0.05));
		if (ok.length < pts.length * 0.8) return false;
		ctx.lane(pts, w, laneCol);
		lanes.push(pts);
		return true;
	};
	const main = [];
	for (let v = vStart; v <= vEnd; v += 0.7) main.push(F(sC + Math.sin(v * 0.3) * 0.25, v));
	if (!laneStrip(main, laneW)) return null;
	const crossL = [], crossR = [];
	for (let s = sC - reach; s <= sC - laneW / 2 - 0.02; s += 0.7) crossL.push(F(s, vC + Math.sin(s * 0.4) * 0.3));
	crossL.push(F(sC - laneW / 2 - 0.02, vC + Math.sin((sC - laneW / 2) * 0.4) * 0.3));
	const r0 = sC + laneW / 2 + 0.02;
	crossR.push(F(r0, vC + Math.sin(r0 * 0.4) * 0.3));
	for (let s = r0 + 0.7; s <= sC + reach; s += 0.7) crossR.push(F(s, vC + Math.sin(s * 0.4) * 0.3));
	const hasL = crossL.length > 3 && laneStrip(crossL, laneW), hasR = crossR.length > 3 && laneStrip(crossR, laneW);
	// houses along a lane: front to the lane, shoulder to shoulder with small gaps
	const along = (s0, s1, vLane, facing, maxN) => {
		// houses beside the cross lane: facing = +1 faces towards the road side (smaller v)
		let s = s0;
		let k = 0;
		while (s < s1 && k < maxN) {
			const W = 4.5 + R() * 4.5, D = 6 + R() * 5;
			const gap = R() < 0.45 ? 0.05 : 0.3 + R() * 2;
			const setback = 0.3 + R() * (R() < 0.3 ? 3.5 : 1.0);
			const sMid = s + (W * M) / 2;
			const v = vLane - facing * (laneW / 2 + (setback + D / 2) * M);
			const p = F(sMid, v, {});
			// face the lane: the house's +z points along -facing in v
			const n = F(sMid, v + 1, {});
			const fx = (n.x - p.x) * facing, fz = (n.z - p.z) * facing;
			const o = place0(p, Math.atan2(fx, fz), W, D);
			if (tryHouse(o, setback)) k++;
			s += W * M + gap * M;
		}
	};
	const across = (v0, v1, sLane, facing, maxN) => {
		// houses beside the main lane: facing = +1 faces towards +s
		let v = v0;
		let k = 0;
		while (v < v1 && k < maxN) {
			const W = 4.5 + R() * 4.5, D = 6 + R() * 5;
			const gap = R() < 0.45 ? 0.05 : 0.3 + R() * 2;
			const setback = 0.3 + R() * (R() < 0.3 ? 3.5 : 1.0);
			const vMid = v + (W * M) / 2;
			const s = sLane - facing * (laneW / 2 + (setback + D / 2) * M);
			const p = F(s, vMid, {});
			const q = F(s + 1, vMid, {});
			const fx = (q.x - p.x) * facing, fz = (q.z - p.z) * facing;
			const o = place0(p, Math.atan2(fx, fz), W, D);
			if (tryHouse(o, setback)) k++;
			v += W * M + gap * M;
		}
	};
	const place0 = (p, yaw, W, D) => ({ x: p.x, z: p.z, yaw, W, D });
	let houseCount = 0;
	const tryHouse = (o, setback, forced = {}) => {
		if (houseCount >= n) return false;
		const fp = footprint(o, 0.25);
		for (const [x, z] of fp) if (!ctx.ok(x, z, 0.12) || ctx.taken(x, z, 0.05)) return false;
		if (!ctx.ok(o.x, o.z, 0.2) || ctx.taken(o.x, o.z, 0.1)) return false;
		const fit = houseFits(world, o);
		if (!fit) return false;
		o.fit = fit;
		const u = R();
		const stone = st.stone && R() < st.stone;
		const brick = !stone && u < st.brick;
		o.wall = stone ? "stone" : brick ? "brick" : "plaster";
		o.floors = forced.floors || (R() < st.floors[0] ? 1 : R() < 0.85 ? 2 : 3);
		if (styleKey !== "garhwal" && o.floors > 2) o.floors = 2;
		o.roof = forced.roof || (brick && R() < 0.7 ? "flat" : choose(R, st.roofs));
		o.unfinished = brick && o.roof === "flat" && R() < 0.6;
		o.paint = forced.paint || pick(R, paints);
		o.shop = !!forced.shop;
		o.sign = forced.sign;
		if (!house(ctx.hg, ctx.sg, ctx.b, world, R, o)) return false;
		ctx.claim(footprint(o, 0.1));
		houses.push(o);
		houseCount++;
		ctx.blobRect(o.x, o.z, o.yaw, (o.W + 2.2) * M, (o.D + 2.2) * M, 0.42);
		// compound wall and gate round a front yard
		if (setback > 2.4 && o.wall !== "stone" && R() < 0.7) compound(ctx, o, setback, R);
		// a two-wheeler parked in front, a cow tied by the door
		const front = (d, u = 0) => ({ x: o.x + Math.sin(o.yaw) * (o.D / 2 + d) * M + Math.cos(o.yaw) * u * M, z: o.z + Math.cos(o.yaw) * (o.D / 2 + d) * M - Math.sin(o.yaw) * u * M });
		if (R() < 0.3) {
			const p = front(0.9, (R() - 0.5) * o.W * 0.6);
			if (ctx.ok(p.x, p.z, 0.05)) addBike(ctx.b, R, p.x, world.height(p.x, p.z), p.z, o.yaw + Math.PI / 2 + (R() - 0.5) * 0.4);
		}
		if (!o.shop && R() < 0.12) {
			const p = front(1.2, o.W / 2);
			if (ctx.ok(p.x, p.z, 0.05)) addAnimal(ctx.b, styleKey === "gangetic" && R() < 0.5 ? "buffalo" : "cow", R, p.x, world.height(p.x, p.z), p.z, o.yaw + Math.PI / 2);
		}
		return true;
	};
	// shops at the highway end of the main lane, facing the road, with signboards
	const nShops = Math.min(4, 1 + Math.floor(R() * 2 + (opts.town || 0) * 2));
	let sCur = sC + laneW / 2 + 0.25;
	for (let i = 0; i < nShops; i++) {
		const W = 3.2 + R() * 1.6, D = 5 + R() * 2;
		const v = 2.1 + (D / 2) * M + 0.05;
		const p = F(sCur + (W * M) / 2, v, {});
		const q = F(sCur + (W * M) / 2, v - 1, {});
		const o = place0(p, Math.atan2(q.x - p.x, q.z - p.z), W, D);
		const sign = signCell(R() < 0.75 ? ctx.lang : "en", Math.floor(R() * 4));
		tryHouse(o, 0.3, { shop: true, sign, roof: R() < 0.6 ? "flat" : "tin", floors: R() < 0.7 ? 1 : 2 });
		sCur += W * M + 0.03;
	}
	// a bus shelter on the highway at the lane mouth, on the other side of the lane from the shops
	busShelter(ctx, F, sC - laneW / 2 - 1.0, side, R);
	// houses along the lanes
	const per = Math.max(2, Math.round(n / 5));
	across(2.1 + 2.4, vC - laneW, sC, 1, per);
	across(2.1 + 2.4, vC - laneW, sC, -1, per);
	across(vC + laneW, vEnd, sC, 1, per);
	across(vC + laneW, vEnd, sC, -1, per);
	if (hasL) {
		along(sC - reach, sC - laneW * 1.2, vC, 1, per);
		along(sC - reach, sC - laneW * 1.2, vC, -1, per);
	}
	if (hasR) {
		along(sC + laneW * 1.2, sC + reach, vC, 1, per);
		along(sC + laneW * 1.2, sC + reach, vC, -1, per);
	}
	// the crossing: temple, peepal katta, hand pump, well
	const corner = (ds, dv) => F(sC + ds * (laneW / 2 + 0.9), vC + dv * (laneW / 2 + 0.9), {});
	const spots = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => R() - 0.5);
	let used = 0;
	for (const [ds, dv] of spots) {
		const p = corner(ds, dv);
		if (!ctx.ok(p.x, p.z, 0.6) || ctx.taken(p.x, p.z, 0.6)) continue;
		const y = world.height(p.x, p.z);
		const q = F(sC, vC, {});
		const yaw = Math.atan2(q.x - p.x, q.z - p.z);
		if (used === 0) {
			shrine(ctx.b, p.x, y, p.z, yaw, styleKey === "garhwal" ? "garhwal" : styleKey === "south" || styleKey === "telangana" ? "south" : "plains");
			ctx.claimCircle(p.x, p.z, 0.75);
			ctx.blob(p.x, p.z, 1.3, 0.4);
		} else if (used === 1) {
			katta(ctx.b, p.x, y, p.z, R);
			ctx.tree(p.x, p.z, "peepal", 0.85);
			ctx.claimCircle(p.x, p.z, 0.8);
			// people sitting out under the tree
			for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
				const a = R() * 6.3;
				const x = p.x + Math.cos(a) * 0.95, z = p.z + Math.sin(a) * 0.95;
				addPerson(ctx.b, R, x, world.height(x, z), z, a + Math.PI);
			}
		} else if (used === 2) {
			handPump(ctx.b, p.x, y, p.z, yaw);
			ctx.claimCircle(p.x, p.z, 0.3);
			if (R() < 0.8) addPerson(ctx.b, R, p.x + 0.3, y, p.z + 0.15, yaw);
		} else {
			if (styleKey !== "garhwal") well(ctx.b, p.x, y, p.z, yaw, R);
			ctx.claimCircle(p.x, p.z, 0.45);
		}
		used++;
	}
	// life on the lanes: people walking, dogs asleep, goats
	for (const pts of lanes) {
		for (let k = 0; k < pts.length; k += 3) {
			const p = pts[k];
			const r = R();
			const ox = (R() - 0.5) * laneW * 0.6, oz = (R() - 0.5) * laneW * 0.6;
			if (r < 0.12) addPerson(ctx.b, R, p.x + ox, world.height(p.x + ox, p.z + oz), p.z + oz, R() * 6.3);
			else if (r < 0.19) addAnimal(ctx.b, "dog", R, p.x + ox, world.height(p.x + ox, p.z + oz), p.z + oz, R() * 6.3);
			else if (r < 0.25) for (let g = 0; g < 2 + Math.floor(R() * 3); g++) {
				const gx = p.x + ox + (R() - 0.5) * 0.6, gz = p.z + oz + (R() - 0.5) * 0.6;
				addAnimal(ctx.b, "goat", R, gx, world.height(gx, gz), gz, R() * 6.3);
			}
		}
	}
	// haystacks and trees round the edge of the village
	for (let k = 0; k < 3 + Math.floor(R() * 3); k++) {
		const a = R() * 6.3, d = reach * (0.75 + R() * 0.3);
		const p = F(sC + Math.cos(a) * d, vC + Math.sin(a) * d * 0.6, {});
		if (!ctx.ok(p.x, p.z, 0.5) || ctx.taken(p.x, p.z, 0.5)) continue;
		if (R() < 0.5) {
			haystack(ctx.b, R, p.x, world.height(p.x, p.z), p.z, styleKey === "gangetic");
			ctx.claimCircle(p.x, p.z, 0.6);
		} else ctx.tree(p.x, p.z, opts.treeKind ? opts.treeKind(R) : "neem", 1);
	}
	return { houses, lanes, reach };
}
// A compound wall round the front yard, with an iron gate.
function compound(ctx, o, setback, R) {
	const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
	const P = (u, y, v) => V(o.x + u * M * cs + v * M * sn, y, o.z - u * M * sn + v * M * cs);
	const ya = (u, v) => {
		const p = P(u, 0, v);
		return ctx.world.height(p.x, p.z) - 0.05;
	};
	const h = 1.15 * M;
	const vF = o.D / 2 + setback - 0.4, hw = o.W / 2 + 0.05;
	const col = C(o.paint).lerp(C(0xffffff), 0.3);
	const gate = 2.4;
	const seg = (ua, va, ub, vb, tile = WALL.wallBase) => {
		const len = Math.hypot(ub - ua, vb - va);
		if (len < 0.2) return;
		const yA = ya(ua, va), yB = ya(ub, vb);
		const top = Math.max(yA, yB) + h;
		const A = P(ua, yA, va), B = P(ub, yB, vb);
		// outer and inner faces and a cap; thin enough to share an edge
		const nx = (vb - va) / len, nv = -(ub - ua) / len; // outward in local
		const t = 0.1;
		const A2 = P(ua - nx * t, yA, va - nv * t), B2 = P(ub - nx * t, yB, vb - nv * t);
		const mid = P((ua + ub) / 2, 0, (va + vb) / 2), cen = P(0, 0, (o.D / 2 + vF) / 2);
		const out = V(mid.x - cen.x, 0, mid.z - cen.z), inn = V(-out.x, 0, -out.z);
		ctx.hg.quad(A, B, V(B.x, top, B.z), V(A.x, top, A.z), wallCell(tile), len / 3, 1.15 / 3, col, 0, 0, out);
		ctx.hg.quad(B2, A2, V(A2.x, top, A2.z), V(B2.x, top, B2.z), wallCell(tile), len / 3, 1.15 / 3, col.clone().multiplyScalar(0.9), 0, 0, inn);
		ctx.hg.quad(V(A.x, top, A.z), V(B.x, top, B.z), V(B2.x, top, B2.z), V(A2.x, top, A2.z), wallCell(WALL.concrete), len / 3, 0.05, C(0xc8c2b6), 0, 0, UPV);
	};
	seg(hw, o.D / 2, hw, vF);
	seg(-hw, vF, -hw, o.D / 2);
	seg(hw, vF, gate / 2, vF);
	seg(-gate / 2, vF, -hw, vF);
	// the gate
	const gA = P(-gate / 2, ya(-gate / 2, vF), vF + 0.02), gB = P(gate / 2, ya(gate / 2, vF), vF + 0.02);
	const gt = Math.max(gA.y, gB.y) + h * 0.95;
	ctx.hg.quad(gB, gA, V(gA.x, gt, gA.z), V(gB.x, gt, gB.z), wallCell(WALL.gate), 1, 1, C(0xffffff));
	ctx.hg.quad(gA, gB, V(gB.x, gt, gB.z), V(gA.x, gt, gA.z), wallCell(WALL.gate), 1, 1, C(0xffffff));
	// the yard swept and plastered, sometimes a tulsi vrindavan in the middle
	const yc = P(0, 0, (o.D / 2 + vF) / 2);
	ctx.yard(yc.x, yc.z, o.yaw, o.W * M, (vF - o.D / 2) * M);
	if (R() < 0.5) {
		const t = P(R() - 0.5, 0, (o.D / 2 + vF) / 2);
		const y = ctx.world.height(t.x, t.z);
		ctx.b.add(T.box, place(t.x, y, t.z, o.yaw, 0.6 * M, 0.9 * M, 0.6 * M), 0xe0dccf);
		ctx.b.add(T.ball, place(t.x, y + 0.9 * M, t.z, 0, 0.6 * M, 0.5 * M, 0.6 * M), 0x3f6a2a);
	}
}
// A concrete bus shelter on the highway: a back wall, a sloping roof on two posts, a bench, a name board.
function busShelter(ctx, F, s, side, R) {
	const v = 2.15 + 0.35;
	const p = F(s, v, {}), q = F(s, v - 1, {});
	if (!ctx.ok(p.x, p.z, 0.05) || ctx.taken(p.x, p.z, 0.3)) return;
	const yaw = Math.atan2(q.x - p.x, q.z - p.z); // faces the road
	const y = ctx.world.height(p.x, p.z);
	const b = ctx.b;
	const cs = Math.cos(yaw), sn = Math.sin(yaw);
	const at = (u, w) => [p.x + u * M * cs + w * M * sn, p.z - u * M * sn + w * M * cs];
	const L = 4.2, Dd = 1.8;
	let [x, z] = at(0, -Dd / 2);
	b.add(T.box, place(...[p.x, y - 0.06, p.z], yaw, (L + 0.4) * M, 0.25 * M + 0.06, (Dd + 0.4) * M), 0xa8a296);
	b.add(T.box, place(x, y, z, yaw, L * M, 2.4 * M, 0.15 * M), 0xd9d2c2); // back wall
	for (const u of [-L / 2 + 0.1, L / 2 - 0.1]) {
		[x, z] = at(u, Dd / 2 - 0.1);
		b.add(T.box, place(x, y, z, yaw, 0.15 * M, 2.4 * M, 0.15 * M), 0xc9c2b4);
	}
	[x, z] = at(0, 0);
	b.add(T.box, place(x, y + 2.4 * M, z, yaw, (L + 0.5) * M, 0.12 * M, (Dd + 0.6) * M, 0.08), 0x9a9690); // roof slab
	[x, z] = at(0, -Dd / 2 + 0.4);
	b.add(T.box, place(x, y + 0.42 * M, z, yaw, (L - 0.6) * M, 0.06 * M, 0.4 * M), 0x8a8a84); // bench
	// the stop's name board on the roof edge, in the local script
	const [u0, v0, du, dv] = signCell(ctx.lang, 4);
	const P = (u, yy, w) => {
		const [xx, zz] = at(u, w);
		return V(xx, yy, zz);
	};
	const yt = y + 2.62 * M + 0.06, yl = y + 2.62 * M - 0.12;
	ctx.sg.quad(P(-1.2, yl, Dd / 2 + 0.32), P(1.2, yl, Dd / 2 + 0.32), P(1.2, yt + 0.12, Dd / 2 + 0.32), P(-1.2, yt + 0.12, Dd / 2 + 0.32), [0, 0, 1, 1], u0 + du, v0 + dv, C(0xffffff), u0, v0);
	ctx.claimCircle(p.x, p.z, 0.75);
	ctx.blobRect(p.x, p.z, yaw, (L + 1.5) * M, (Dd + 1.5) * M, 0.35);
	if (R() < 0.7) addPerson(b, R, ...[at(0.6, 0.2)[0], y, at(0.6, 0.2)[1]], yaw);
}
export { STYLE, PAINTS };
