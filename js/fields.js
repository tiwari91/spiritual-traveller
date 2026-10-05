// Fields as real plots: the land beside the road is cut into bands that follow it, and each band into
// plots with skewed ends, so neighbouring plots share their edges and never overlap. Each plot is draped
// on the ground with its crop drawn in rows by a shader (rows follow the plot), earth bunds along its
// edges, tall crops (sugarcane, jowar, cotton, banana) as rows of alpha-tested strips, paddy with
// standing water, and terraces with retaining walls in the hills.
import * as THREE from "three";
import { HAZE_FOG, SHARED, patch } from "./batch.js";
import { CROP as STRIP, cropAtlas, groundDetail } from "./textures.js";
import { clamp, lerp } from "./util.js";

const M = 0.28;
const lin = (hex) => new THREE.Color(hex);
const hash = (a, b, c = 0) => {
	let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + Math.floor(c) * 1442695041) | 0;
	h = (h ^ (h >>> 13)) * 1274126177;
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
};

// Soils, as seen in a ploughed field.
export const SOILS = {
	black: 0x4a4038, red: 0x8a4a2e, laterite: 0x7d3f26, alluvial: 0x9a8466, brown: 0x6e5a44, hill: 0x75654f,
};
// Crops: colour, row spacing (m), how much of each row the crop covers, standing water, and tall strips.
const C = {
	paddy: { col: 0x5e9a2c, row: 0.25, cover: 0.72, wet: 1 },
	paddyRipe: { col: 0xb3a043, row: 0.25, cover: 0.85, wet: 0.25 },
	ragi: { col: 0x627f34, row: 0.3, cover: 0.65 },
	jowar: { col: 0x7a9440, row: 0.45, cover: 0.75, tall: STRIP.jowar, h: 2.1, srow: 1.1 },
	cane: { col: 0x5c8c2c, row: 1.0, cover: 0.85, tall: STRIP.cane, h: 2.9, srow: 1.0 },
	cotton: { col: 0x536f2c, row: 0.9, cover: 0.6, tall: STRIP.cotton, h: 1.05, srow: 0.9 },
	banana: { col: 0x5d8a34, row: 1.8, cover: 0.7, tall: STRIP.banana, h: 2.7, srow: 1.8 },
	wheat: { col: 0x8ea446, row: 0.2, cover: 0.9 },
	wheatRipe: { col: 0xc9ad5c, row: 0.2, cover: 0.92 },
	mustard: { col: 0xdcc234, row: 0.3, cover: 0.88 },
	soybean: { col: 0x5f9432, row: 0.45, cover: 0.72 },
	groundnut: { col: 0x6a8f38, row: 0.3, cover: 0.6 },
	onion: { col: 0x7d9c52, row: 0.15, cover: 0.45 },
	sunflower: { col: 0xd4b42a, row: 0.6, cover: 0.7 },
	chilli: { col: 0x4d7a2a, row: 0.6, cover: 0.6, dots: 1 },
	potato: { col: 0x5a8a36, row: 0.65, cover: 0.55, ridge: 1 },
	amaranth: { col: 0x9a3a36, row: 0.3, cover: 0.7 },
	stubble: { col: 0xa8925e, row: 0.25, cover: 0.45 },
	ploughed: { col: 0, row: 0.5, cover: 0, ridge: 1 },
	fallow: { col: 0x8a8448, row: 0.3, cover: 0.0, weedy: 1 },
};
export const CROPS = C;
// What each landscape grows, with weights. Orchards and groves become rows of trees.
const LAND = {
	sahyadri: { soil: "laterite", w: [2.2, 4.2], l: [4, 9], terrace: true, crops: [["paddy", 5], ["paddyRipe", 1], ["ragi", 2], ["fallow", 1.5], ["ploughed", 0.8]] },
	deccan: { soil: "black", w: [5, 10], l: [5, 12], crops: [["jowar", 3], ["cane", 2], ["ploughed", 3], ["stubble", 1.5], ["onion", 1], ["sunflower", 1], ["cotton", 0.8], ["orchard:bush", 1], ["fallow", 1]] },
	// round Shirdi: sugarcane for the co-operative sugar mills, onion, rabi jowar and wheat, pomegranate orchards
	nagar: { soil: "black", w: [4, 9], l: [5, 12], crops: [["cane", 4], ["onion", 2.5], ["jowar", 2.5], ["wheat", 1], ["ploughed", 1.5], ["stubble", 1], ["orchard:bush", 1.2], ["fallow", 0.6]] },
	telangana: { soil: "red", w: [4, 9], l: [5, 11], crops: [["cotton", 3], ["paddy", 2], ["chilli", 1.2], ["ploughed", 2], ["groundnut", 1.2], ["jowar", 1], ["fallow", 1.2], ["orchard:mango", 0.8]] },
	south: { soil: "red", w: [3, 7], l: [4, 9], crops: [["paddy", 3], ["cane", 1], ["groundnut", 2], ["banana", 1], ["orchard:mango", 1], ["orchard:coconut", 1.2], ["ploughed", 1], ["fallow", 1]] },
	central: { soil: "black", w: [4, 9], l: [5, 11], crops: [["cotton", 3], ["soybean", 3], ["wheat", 1], ["ploughed", 2], ["orchard:bush", 0.8], ["fallow", 1], ["jowar", 1]] },
	gangetic: { soil: "alluvial", w: [2.5, 5.5], l: [6, 14], crops: [["wheat", 4], ["wheatRipe", 1.5], ["mustard", 3], ["cane", 2], ["potato", 1], ["paddy", 1], ["ploughed", 1], ["orchard:mango", 0.6]] },
	doon: { soil: "brown", w: [3, 6], l: [4, 9], crops: [["paddy", 2], ["wheat", 2], ["mustard", 1], ["orchard:mango", 1], ["fallow", 1]] },
	garhwal: { soil: "hill", w: [1.4, 2.6], l: [3, 7], terrace: true, stone: true, crops: [["wheat", 2], ["wheatRipe", 1], ["paddy", 0.8], ["amaranth", 1], ["potato", 1], ["fallow", 2]] },
};
export function landOf(reg, lon) {
	if (reg === "deccan" && lon > 77.2) return "telangana";
	return reg;
}
function pickCrop(L, r) {
	let tot = 0;
	for (const [, w] of L.crops) tot += w;
	let x = r * tot;
	for (const [k, w] of L.crops) if ((x -= w) <= 0) return k;
	return L.crops[0][0];
}

// ---------- materials ----------
const FIELD_VS = "attribute vec3 aSoil;\nattribute vec4 aField;\nvarying vec3 vSoil;\nvarying vec4 vField;\nvarying vec3 vFWPos;\n";
const FIELD_FS = `
uniform sampler2D uDetail;
varying vec3 vSoil;
varying vec4 vField;
varying vec3 vFWPos;
`;
export function fieldMaterial() {
	const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
	const uDetail = { value: groundDetail() };
	return patch(m, "field", (s) => {
		s.uniforms.uDetail = uDetail;
		s.vertexShader = FIELD_VS + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvSoil = aSoil;\n\tvField = aField;\n\tvFWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
		s.fragmentShader = FIELD_FS + s.fragmentShader
			.replace("#include <color_fragment>", `
	float rc = vField.x / max( vField.y, 0.05 );
	float aw = fwidth( rc );
	float fr = abs( fract( rc ) - 0.5 ) * 2.0;
	float cover = vField.z;
	float rowMask = 1.0 - smoothstep( cover - aw, cover + aw, fr );
	rowMask = mix( rowMask, cover, smoothstep( 0.3, 1.0, aw ) );
	vec4 dA = texture2D( uDetail, vFWPos.xz * 0.21 );
	vec4 dB = texture2D( uDetail, vFWPos.xz * 1.9 );
	vec4 dC = texture2D( uDetail, vFWPos.xz * 6.0 );
	// patchy crop: thinner and yellower in places
	float health = smoothstep( 0.25, 0.8, dA.a + ( dB.g - 0.5 ) * 0.3 );
	rowMask *= mix( 0.6, 1.0, health );
	vec3 crop = vColor * ( 0.78 + 0.32 * dB.a ) * ( 0.82 + 0.3 * dC.g );
	crop = mix( vec3( dot( crop, vec3( 0.3, 0.59, 0.11 ) ) ), crop, 0.62 ) * 0.68;
	crop = mix( crop * vec3( 1.15, 1.05, 0.6 ), crop, health );
	vec3 soil = vSoil * ( 0.72 + 0.45 * dB.r ) * ( 0.9 + 0.2 * dC.r );
	// ploughed ridges and furrows, or potato ridges
	float fBits = floor( vField.w );
	float ridged = mod( floor( fBits / 2.0 ), 2.0 );
	float rid = mix( 1.0, 0.72 + 0.4 * smoothstep( 0.2, 0.8, 1.0 - fr ), ridged * ( 1.0 - smoothstep( 0.4, 1.2, aw ) ) );
	soil *= rid;
	// weeds on fallow ground
	float weedy = mod( floor( fBits / 4.0 ), 2.0 );
	rowMask = max( rowMask, weedy * smoothstep( 0.45, 0.75, dB.g * 0.6 + dA.a * 0.5 ) * 0.9 );
	vec3 col = mix( soil, mix( crop, vec3( 0.2, 0.22, 0.08 ) * ( 0.8 + 0.4 * dC.g ), weedy ), rowMask );
	// paddy water between the rows, with the sky in it
	float water = mod( fBits, 2.0 ) * ( 1.0 - rowMask );
	#ifdef USE_FOG
		col = mix( col, vSoil * 0.22 + fogColor * 0.07, water * 0.8 );
	#else
		col = mix( col, vSoil * 0.4, water * 0.85 );
	#endif
	diffuseColor.rgb = col;
	float fieldWater = water;`)
			.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.5, fieldWater );")
			.replace("#include <fog_fragment>", HAZE_FOG);
	});
}
// field flags packed in aField.w as bits: 1 water, 2 ridges, 4 weeds
const packFlags = (wet, ridge, weedy) => (wet ? 1 : 0) + (ridge ? 2 : 0) + (weedy ? 4 : 0) + 0.5;

export function cropMaterial(low) {
	const m = new THREE.MeshStandardMaterial({ map: cropAtlas(low), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, color: new THREE.Color(1.6, 1.6, 1.6) });
	return patch(m, "crop", (s) => {
		Object.assign(s.uniforms, SHARED);
		s.vertexShader = "attribute float aSway;\nuniform float uTime, uWind;\n" + s.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
	float cPh = position.x * 0.9 + position.z * 0.7;
	transformed.x += sin( uTime * 1.7 + cPh ) * aSway * 0.05 * uWind;
	transformed.z += cos( uTime * 1.3 + cPh * 1.3 ) * aSway * 0.04 * uWind;`);
		s.fragmentShader = s.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "")).replace("#include <fog_fragment>", HAZE_FOG);
	});
}

// ---------- geometry ----------
export class FieldGeo {
	constructor() {
		this.p = [];
		this.c = [];
		this.s = [];
		this.f = [];
		this.idx = [];
	}
	vert(x, y, z, col, soil, rc, spacing, cover, fl) {
		this.p.push(x, y, z);
		this.c.push(col.r, col.g, col.b);
		this.s.push(soil.r, soil.g, soil.b);
		this.f.push(rc, spacing, cover, fl);
		return this.p.length / 3 - 1;
	}
	get empty() {
		return this.idx.length === 0;
	}
	build(mat) {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
		g.setAttribute("aSoil", new THREE.Float32BufferAttribute(this.s, 3));
		g.setAttribute("aField", new THREE.Float32BufferAttribute(this.f, 4));
		g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
		g.computeVertexNormals();
		g.computeBoundingSphere();
		const m = new THREE.Mesh(g, mat);
		m.receiveShadow = true;
		return m;
	}
}
export class StripGeo {
	constructor() {
		this.p = [];
		this.n = [];
		this.uv = [];
		this.c = [];
		this.w = [];
		this.idx = [];
		this.quads = 0;
	}
	get empty() {
		return this.idx.length === 0;
	}
	// a vertical strip along a polyline of base points, `h` tall, using crop band `band`
	strip(base, h, band, col, R) {
		const v0 = band / 4 + 0.006, v1 = (band + 1) / 4 - 0.006;
		let len = 0;
		const start = this.p.length / 3;
		for (let i = 0; i < base.length; i++) {
			const b = base[i];
			if (i) len += Math.hypot(b.x - base[i - 1].x, b.z - base[i - 1].z) / M;
			const a = base[Math.max(0, i - 1)], c = base[Math.min(base.length - 1, i + 1)];
			let sx = -(c.z - a.z), sz = c.x - a.x;
			const sl = Math.hypot(sx, sz) || 1;
			sx /= sl;
			sz /= sl;
			// normals bent up so the canopy reads lit from above
			const nx = sx * 0.35, ny = 0.94, nz = sz * 0.35;
			const hh = h * (0.85 + R() * 0.25);
			const u = len / 3.6;
			const k = 0.9 + R() * 0.2;
			this.p.push(b.x, b.y - 0.01, b.z, b.x, b.y + hh, b.z);
			this.n.push(nx, ny, nz, nx, ny, nz);
			this.uv.push(u, v1, u, v0);
			this.c.push(col.r * k * 0.8, col.g * k * 0.8, col.b * k * 0.8, col.r * k, col.g * k, col.b * k);
			this.w.push(0, 1);
		}
		for (let i = 0; i < base.length - 1; i++) {
			const a = start + i * 2;
			this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
			this.quads++;
		}
	}
	build(mat) {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
		g.setAttribute("aSway", new THREE.Float32BufferAttribute(this.w, 1));
		g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
		g.computeBoundingSphere();
		const m = new THREE.Mesh(g, mat);
		m.castShadow = true;
		m.receiveShadow = true;
		return m;
	}
}

// ---------- layout ----------
// The bands beside the road on one side: their lateral boundaries wander a little along the road.
function bandEdge(L, side, i, s) {
	let v = 2.35;
	for (let j = 0; j < i; j++) v += lerp(L.w[0], L.w[1], hash(j, side + 5, 11));
	return v + (i ? 0.55 * Math.sin(s * 0.19 + i * 1.7 + side) + 0.3 * Math.sin(s * 0.47 + i * 0.9) : 0);
}
// Plot ends along band i: the n-th break, its skew at the outer edge.
function breakAt(L, side, i, n) {
	const len = lerp(L.l[0], L.l[1], hash(i, side + 9, 3));
	return n * len + (hash(i * 31 + side, n, 5) - 0.5) * len * 0.55;
}
function skewAt(L, side, i, n) {
	const len = lerp(L.l[0], L.l[1], hash(i, side + 9, 3));
	return (hash(i * 17 + side, n, 8) - 0.5) * len * 0.5;
}
function bandLen(L, side, i) {
	return lerp(L.l[0], L.l[1], hash(i, side + 9, 3));
}

// Lay the plots of one side of the chunk [s0, s1). ctx supplies frame(s, v) -> {x, z}, height, the
// clearance tests and the output builders. A generator (one band per step); returns the plots made.
export function* layFields(ctx, side, land, opts = {}) {
	const L = LAND[land] || LAND.deccan;
	const { s0, s1, R } = ctx;
	const soil = lin(SOILS[L.soil]);
	const out = [];
	const vMax = opts.vMax || 34;
	for (let i = 0; i < 16; i++) {
		const vIn = bandEdge(L, side, i, (s0 + s1) / 2);
		if (vIn > vMax) break;
		const len = bandLen(L, side, i);
		const n0 = Math.floor(s0 / len) - 1, n1 = Math.ceil(s1 / len) + 1;
		for (let n = n0; n <= n1; n++) {
			const sa = breakAt(L, side, i, n), sb = breakAt(L, side, i, n + 1);
			if (sa < s0 || sa >= s1) continue;
			if (sb - sa < 1.5) continue;
			const ka = skewAt(L, side, i, n), kb = skewAt(L, side, i, n + 1);
			const plot = { i, n, sa, sb, ka, kb, side, land };
			const h = hash(i * 7 + side, n, 21);
			plot.use = pickCrop(L, h);
			if (makePlot(ctx, L, plot, soil)) out.push(plot);
		}
		yield;
	}
	return out;
}
// Param (a along, b across) to world.
function plotPoint(ctx, L, P, a, b, out = {}) {
	const sIn = lerp(P.sa, P.sb, a), sOut = lerp(P.sa + P.ka, P.sb + P.kb, a);
	const s = lerp(sIn, sOut, b);
	const v = lerp(bandEdge(L, P.side, P.i, sIn), bandEdge(L, P.side, P.i + 1, sOut), b);
	ctx.frame(s, v * P.side, out);
	out.s = s;
	out.v = v;
	return out;
}
function makePlot(ctx, L, P, soilCol) {
	const { R } = ctx;
	// test the outline against roads, rails, rivers, shrines and anything already placed
	let b0 = 0;
	const test = (bLo) => {
		for (const [a, b] of [[0, bLo], [0.5, bLo], [1, bLo], [0, 1], [0.5, 1], [1, 1], [0, (1 + bLo) / 2], [1, (1 + bLo) / 2], [0.5, (1 + bLo) / 2], [0.25, bLo], [0.75, bLo], [0.25, 1], [0.75, 1]]) {
			const p = plotPoint(ctx, L, P, a, b);
			if (!ctx.ok(p.x, p.z, 0.2) || ctx.taken(p.x, p.z, 0.15)) return false;
		}
		return true;
	};
	while (!test(b0)) {
		b0 += 0.2;
		if (b0 > 0.61) return false;
	}
	// grid resolution: about one vertex per 1.4 units
	const p00 = plotPoint(ctx, L, P, 0, b0), p10 = plotPoint(ctx, L, P, 1, b0), p01 = plotPoint(ctx, L, P, 0, 1);
	const lenA = Math.hypot(p10.x - p00.x, p10.z - p00.z), lenB = Math.hypot(p01.x - p00.x, p01.z - p00.z);
	const na = clamp(Math.ceil(lenA / 1.4), 2, 14), nb = clamp(Math.ceil(lenB / 1.4), 2, 10);
	const G = [];
	for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
		const p = plotPoint(ctx, L, P, i / na, lerp(b0, 1, j / nb));
		p.y = ctx.height(p.x, p.z);
		G.push(p);
	}
	// reject folded grids (tight bends on the inside of a curve)
	let orient = 0;
	for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
		const a = G[j * (na + 1) + i], b = G[j * (na + 1) + i + 1], c = G[(j + 1) * (na + 1) + i];
		const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
		if (!orient) orient = Math.sign(cr);
		if (cr * orient < 1e-5) return false;
	}
	// terraces: flat at the top of the slope, retaining walls down to the ground
	let flatY = null;
	if (L.terrace) {
		let lo = Infinity, hi = -Infinity;
		for (const p of G) {
			lo = Math.min(lo, p.y);
			hi = Math.max(hi, p.y);
		}
		if (hi - lo > 1.3) return false;
		if (hi - lo > 0.04) flatY = hi + 0.02;
	}
	const use = P.use;
	let crop = C[use] || C.fallow;
	let orchard = null;
	if (use.startsWith("orchard:")) {
		orchard = use.slice(8);
		crop = C.fallow;
	}
	const col = crop.col ? lin(crop.col).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.04) : soilCol;
	const soil = soilCol.clone().offsetHSL(0, (R() - 0.5) * 0.05, (R() - 0.5) * 0.04);
	if (crop.wet) soil.multiplyScalar(0.8);
	const along = (lenA > lenB * 1.3) !== (R() < 0.25); // rows mostly along the plot's long side
	const fl = packFlags(crop.wet, crop.ridge, crop.weedy);
	const fg = ctx.fields;
	const lift = 0.03;
	const base = fg.p.length / 3;
	for (const p of G) {
		// rows across the plot's short way follow its long edges
		const rcM = (along ? p.v : p.s) / M;
		fg.vert(p.x, (flatY ?? p.y) + lift, p.z, col, soil, rcM, crop.row, crop.cover, fl);
	}
	for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
		const a = base + j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
		// wound so the face looks up
		if (orient < 0) fg.idx.push(a, b, c, b, d, c);
		else fg.idx.push(a, c, b, b, c, d);
	}
	// outline for footprints, bunds and walls
	const ring = [];
	for (let i = 0; i <= na; i++) ring.push(G[i]);
	for (let j = 1; j <= nb; j++) ring.push(G[j * (na + 1) + na]);
	for (let i = na - 1; i >= 0; i--) ring.push(G[nb * (na + 1) + i]);
	for (let j = nb - 1; j > 0; j--) ring.push(G[j * (na + 1)]);
	P.ring = ring;
	P.grid = { G, na, nb };
	P.flatY = flatY;
	P.crop = crop;
	P.orchard = orchard;
	P.centre = plotPoint(ctx, L, P, 0.5, (1 + b0) / 2);
	P.area = lenA * lenB;
	ctx.claim(ring);
	// bunds: low earth ridges just inside each edge (the neighbour's sits beside it, so they never overlap)
	const cx = P.centre.x, cz = P.centre.z;
	const bw = (L.terrace ? 0.32 : 0.26) * M, bh = (L.terrace ? 0.22 : 0.2) * M;
	const bundCol = soilCol.clone().lerp(lin(0x7a7a40), crop.wet ? 0.45 : 0.3);
	const Y = (p) => (flatY ?? p.y) + lift;
	for (let k = 0; k < ring.length; k++) {
		const a = ring[k], b = ring[(k + 1) % ring.length];
		ridge(ctx.b, a, b, Y(a), Y(b), cx, cz, bw, bh, bundCol);
		if (flatY !== null) {
			// retaining wall: stone in the Garhwal, earth in the Sahyadri paddies
			const ga = ctx.height(a.x, a.z), gb = ctx.height(b.x, b.z);
			if (Y(a) - ga > 0.04 || Y(b) - gb > 0.04) wall(ctx.b, a, b, Y(a), Y(b), ga - 0.08, gb - 0.08, cx, cz, L.stone ? 0x8a8174 : 0x6e4a32, L.stone);
		}
	}
	// tall crops: rows of strips across the plot
	if (crop.tall !== undefined && ctx.strips.quads < ctx.stripCap) {
		const rs = (crop.srow * M) / Math.max(0.1, along ? lenB : lenA);
		const segA = clamp(Math.ceil(lenA / 0.75), 2, 40), segB = clamp(Math.ceil(lenB / 0.75), 2, 40);
		const lo = 0.04, hi = 0.96;
		const sCol = lin(crop.col);
		if (along) {
			for (let bb = lo; bb <= hi; bb += rs) {
				const pts = [];
				for (let i = 0; i <= segA; i++) {
					const p = plotPoint(ctx, L, P, lerp(0.03, 0.97, i / segA), lerp(b0, 1, bb));
					p.y = (flatY ?? ctx.height(p.x, p.z)) + lift;
					pts.push(p);
				}
				ctx.strips.strip(pts, crop.h * M, crop.tall, sCol, R);
			}
		} else {
			for (let aa = lo; aa <= hi; aa += rs) {
				const pts = [];
				for (let j = 0; j <= segB; j++) {
					const p = plotPoint(ctx, L, P, aa, lerp(b0 + 0.03, 0.97, j / segB));
					p.y = (flatY ?? ctx.height(p.x, p.z)) + lift;
					pts.push(p);
				}
				ctx.strips.strip(pts, crop.h * M, crop.tall, sCol, R);
			}
		}
	}
	return true;
}
// An earth ridge just inside the edge a-b (the plot centre is at cx, cz).
const _n = new THREE.Vector3();
function ridge(b, a, c, ya, yc, cx, cz, w, h, col) {
	const dx = c.x - a.x, dz = c.z - a.z;
	const l = Math.hypot(dx, dz);
	if (l < 1e-4) return;
	let nx = -dz / l, nz = dx / l;
	const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
	if ((cx - mx) * nx + (cz - mz) * nz < 0) {
		nx = -nx;
		nz = -nz;
	}
	// cross-section: outer foot (on the edge), crest, inner foot
	const P = [], N = [], Cc = [];
	const prof = [[0, 0], [w * 0.5, h], [w, 0]];
	const quad = (i) => {
		const [o0, h0] = prof[i], [o1, h1] = prof[i + 1];
		const A = [a.x + nx * o0, ya + h0, a.z + nz * o0], B = [c.x + nx * o0, yc + h0, c.z + nz * o0];
		const Cq = [c.x + nx * o1, yc + h1, c.z + nz * o1], D = [a.x + nx * o1, ya + h1, a.z + nz * o1];
		// face normal
		const sx = (o1 - o0), sy = h1 - h0;
		_n.set(-nx * sy, sx, -nz * sy).normalize();
		if (_n.y < 0) _n.negate();
		for (const v of [A, B, Cq, A, Cq, D]) {
			P.push(...v);
			N.push(_n.x, _n.y, _n.z);
			Cc.push(col.r, col.g, col.b);
		}
	};
	quad(0);
	quad(1);
	b.addTris(P, N, Cc);
}
// A retaining wall under a terrace edge, facing away from the plot.
function wall(b, a, c, ya, yc, ga, gc, cx, cz, hex, stone) {
	const dx = c.x - a.x, dz = c.z - a.z;
	const l = Math.hypot(dx, dz);
	if (l < 1e-4) return;
	let nx = -dz / l, nz = dx / l;
	const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
	if ((cx - mx) * nx + (cz - mz) * nz > 0) {
		nx = -nx;
		nz = -nz;
	}
	const col = new THREE.Color(hex);
	const P = [], N = [], Cc = [];
	const segs = Math.max(1, Math.round(l / 0.3));
	for (let k = 0; k < segs; k++) {
		const t0 = k / segs, t1 = (k + 1) / segs;
		const x0 = a.x + dx * t0, z0 = a.z + dz * t0, x1 = a.x + dx * t1, z1 = a.z + dz * t1;
		const top0 = lerp(ya, yc, t0), top1 = lerp(ya, yc, t1), bot0 = lerp(ga, gc, t0), bot1 = lerp(ga, gc, t1);
		const v = stone ? 0.8 + ((k * 7919) % 13) / 30 : 0.9 + ((k * 31) % 7) / 40;
		const cc = col.clone().multiplyScalar(v);
		const lean = 0.03;
		for (const p of [[x0, bot0, z0, lean], [x1, bot1, z1, lean], [x1, top1, z1, 0], [x0, bot0, z0, lean], [x1, top1, z1, 0], [x0, top0, z0, 0]]) {
			P.push(p[0] + nx * p[3], p[1], p[2] + nz * p[3]);
			N.push(nx, 0.15, nz);
			Cc.push(cc.r, cc.g, cc.b);
		}
	}
	b.addTris(P, N, Cc);
}
export { plotPoint, LAND };
