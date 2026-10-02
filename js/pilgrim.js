// The traveller: a pilgrim in a saffron kurta and white dhoti, a staff in one hand and a clay diya
// in the other. Modelled in metres (about 1.7 m tall) and scaled down into the world by main.js.
// The same body, posed and merged into one mesh, fills the temple courtyards with other pilgrims.
//
// Every mesh's material colour is one of the colours passed to body() (or the HAIR, SOLE and TILAK
// constants below), so callers can find parts by colour and swap in their own materials. Small details
// that should vanish when that happens (eyes, lips, sari borders, jewellery) use the part's own
// material colour and paint the difference in vertex colours, which a swapped-in material ignores.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glowTexture } from "./landmarks.js";
import { rand } from "./util.js";

// Indian skin tones, wheatish to deep; the first four are the ones the interiors use by index.
const SKIN = [0x8d5a3b, 0x7a4a2f, 0xa06a46, 0x6b4029, 0xb37a55, 0x5a3523, 0x96603f];
const HAIR = 0x1b1612, SOLE = 0x3a2a1e, TILAK = 0xd23a1e;
const GOLD = 0xd9a441;
const TAU = Math.PI * 2;
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));

// ---------- small maths ----------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
const gs = (d, w) => Math.exp(-(d * d) / (w * w));
const frac = (x) => x - Math.floor(x);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
// Vertex-colour multiplier that turns a material of colour `base` into `target` (linear; above 1 is fine).
function ratio(target, base, k = 1) {
	_c1.set(target);
	_c2.set(base);
	return [(_c1.r / Math.max(_c2.r, 1e-4)) * k, (_c1.g / Math.max(_c2.g, 1e-4)) * k, (_c1.b / Math.max(_c2.b, 1e-4)) * k];
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ONE = [1, 1, 1];

// ---------- geometry ----------
// A grid of nt+1 rings, each of nth+1 points: f(t, u, i, j) -> [x, y, z, colour?] with t and u in [0, 1].
// Normals are smoothed across the u seam (and across t when closedT) and at collapsed rings (poles).
function loft(nt, nth, f, closedT = false) {
	const w = nth + 1, n = (nt + 1) * w;
	const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
	for (let i = 0, k = 0; i <= nt; i++) {
		for (let j = 0; j <= nth; j++, k++) {
			const p = f(i / nt, j / nth, i, j);
			pos[k * 3] = p[0];
			pos[k * 3 + 1] = p[1];
			pos[k * 3 + 2] = p[2];
			if (p[3]) col.set(p[3], k * 3);
			uv[k * 2] = j / nth;
			uv[k * 2 + 1] = i / nt;
		}
	}
	const idx = [];
	for (let i = 0; i < nt; i++) {
		for (let j = 0; j < nth; j++) {
			const a = i * w + j, b = a + w;
			idx.push(a, b, a + 1, b, b + 1, a + 1);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	g.setAttribute("color", new THREE.BufferAttribute(col, 3));
	g.setIndex(idx);
	orient(g);
	weldGrid(g, nt, nth, closedT);
	return g;
}
// Flip the winding if the surface faces inward (signed volume about its own centre).
function orient(g) {
	const p = g.attributes.position.array, ix = g.index.array;
	g.computeBoundingBox();
	const c = g.boundingBox.getCenter(V());
	let v = 0;
	for (let i = 0; i < ix.length; i += 3) {
		const a = ix[i] * 3, b = ix[i + 1] * 3, d = ix[i + 2] * 3;
		const ax = p[a] - c.x, ay = p[a + 1] - c.y, az = p[a + 2] - c.z;
		const bx = p[b] - c.x, by = p[b + 1] - c.y, bz = p[b + 2] - c.z;
		const dx = p[d] - c.x, dy = p[d + 1] - c.y, dz = p[d + 2] - c.z;
		v += ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx);
	}
	if (v < 0) {
		for (let i = 0; i < ix.length; i += 3) {
			const t = ix[i + 1];
			ix[i + 1] = ix[i + 2];
			ix[i + 2] = t;
		}
	}
}
// For open shells round the body's axis: make the faces point away from the y axis.
function outward(g) {
	const p = g.attributes.position.array, ix = g.index.array;
	let v = 0;
	for (let i = 0; i < ix.length; i += 3) {
		const a = ix[i] * 3, b = ix[i + 1] * 3, d = ix[i + 2] * 3;
		const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], wx = p[d] - p[a], wy = p[d + 1] - p[a + 1], wz = p[d + 2] - p[a + 2];
		const nx = uy * wz - uz * wy, nz = ux * wy - uy * wx;
		v += nx * (p[a] + p[b] + p[d]) + nz * (p[a + 2] + p[b + 2] + p[d + 2]);
	}
	if (v < 0) {
		for (let i = 0; i < ix.length; i += 3) {
			const t = ix[i + 1];
			ix[i + 1] = ix[i + 2];
			ix[i + 2] = t;
		}
		const n = g.attributes.normal.array;
		for (let i = 0; i < n.length; i++) n[i] = -n[i];
	}
	return g;
}
function weldGrid(g, nt, nth, closedT) {
	g.computeVertexNormals();
	const p = g.attributes.position.array, n = g.attributes.normal.array, w = nth + 1;
	const avg = (list) => {
		let x = 0, y = 0, z = 0;
		for (const k of list) (x += n[k * 3]), (y += n[k * 3 + 1]), (z += n[k * 3 + 2]);
		const l = Math.hypot(x, y, z) || 1;
		for (const k of list) (n[k * 3] = x / l), (n[k * 3 + 1] = y / l), (n[k * 3 + 2] = z / l);
	};
	for (let i = 0; i <= nt; i++) {
		const a = i * w;
		let pole = true;
		for (let j = 1; j <= nth && pole; j++) if (Math.abs(p[(a + j) * 3] - p[a * 3]) + Math.abs(p[(a + j) * 3 + 1] - p[a * 3 + 1]) + Math.abs(p[(a + j) * 3 + 2] - p[a * 3 + 2]) > 1e-6) pole = false;
		if (pole) avg(Array.from({ length: w }, (_, j) => a + j));
		else avg([a, a + nth]);
	}
	if (closedT) for (let j = 0; j <= nth; j++) avg([j, nt * w + j]);
}
// Smooth interpolation through key rows (each row a list of numbers), sub steps per span.
function rings(keys, sub) {
	const out = [], n = keys.length;
	for (let i = 0; i < n - 1; i++) {
		for (let s = 0; s < sub; s++) {
			const u = s / sub, a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(n - 1, i + 2)];
			out.push(b.map((_, k) => cr(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0, d[k] ?? 0, u)));
		}
	}
	out.push(keys[n - 1].map((v) => v));
	return out;
}
// A limb-like tube through keys [y, rx, rz, cx, cz]; fn(p, th, ring, t) may reshape each point.
function tube(keys, nth, sub, fn) {
	const R = rings(keys, sub);
	return loft(R.length - 1, nth, (t, u, i) => {
		const r = R[i], th = u * TAU;
		const p = [(r[3] || 0) + Math.max(0, r[1]) * Math.sin(th), r[0], (r[4] || 0) + Math.max(0, r[2]) * Math.cos(th)];
		return fn ? fn(p, th, r, t) : p;
	});
}
// A capsule from a to b, radius r0 to r1.
function capsule(a, b, r0, r1, nth, nc = 3) {
	const d = b.clone().sub(a), L = d.length();
	d.normalize();
	const e1 = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize(), e2 = d.clone().cross(e1);
	const R = [];
	for (let i = 0; i <= nc; i++) R.push([-r0 * Math.cos((i / nc) * Math.PI * 0.5), r0 * Math.sin((i / nc) * Math.PI * 0.5)]);
	for (let i = 0; i <= nc; i++) R.push([L + r1 * Math.sin((i / nc) * Math.PI * 0.5), r1 * Math.cos((i / nc) * Math.PI * 0.5)]);
	return loft(R.length - 1, nth, (t, u, i) => {
		const [o, r] = R[i], c = Math.cos(u * TAU) * r, s = Math.sin(u * TAU) * r;
		return [a.x + d.x * o + e1.x * c + e2.x * s, a.y + d.y * o + e1.y * c + e2.y * s, a.z + d.z * o + e1.z * c + e2.z * s];
	});
}
// A strip of cloth (or a cord) along pts: w(t) wide and th thick, lying against up(p, t).
// fold(t, s) lifts it across its width (s in -1..1); col(t, s) colours it; twist(t) turns the section.
// Flat strips get extra points near their edges so a border colour stays a crisp band.
const EDGE = [-1, -0.82, -0.78, -0.35, 0.35, 0.78, 0.82, 1];
const EDGE0 = [-1, -0.78, 0.78, 1];
function ribbon(pts, o) {
	const curve = new THREE.CatmullRomCurve3(pts, !!o.closed, "centripetal");
	const nt = o.nt, P = [], N = [], B = [];
	for (let i = 0; i <= nt; i++) {
		const t = i / nt, tt = o.closed ? t % 1 : t;
		const p = curve.getPointAt(tt), tg = curve.getTangentAt(tt);
		const n = o.up(p, t).clone().projectOnPlane(tg);
		if (n.lengthSq() < 1e-10) n.set(0, 1, 0).projectOnPlane(tg);
		n.normalize();
		P.push(p), N.push(n), B.push(V().crossVectors(tg, n));
	}
	const th = o.th ?? 0.004;
	// the section: round for cords, else a flat band (top edge, then back along the underside)
	let sec;
	if (o.round) sec = Array.from({ length: o.nth ?? 6 }, (_, j) => [Math.sin((j / (o.nth ?? 6)) * TAU), Math.cos((j / (o.nth ?? 6)) * TAU)]);
	else {
		const E = o.sec || (o.lod === 0 ? EDGE0 : EDGE);
		sec = [...E.map((s) => [s, Math.abs(s) === 1 ? 0 : 1]), ...E.slice(1, -1).reverse().map((s) => [s, -1])];
	}
	return loft(nt, sec.length, (t, u, i, j) => {
		const p = P[i], n = N[i], b = B[i];
		const [s, c] = sec[j % sec.length];
		const w = o.w(t) / 2;
		let x = s * w, y = c * th * 0.5 + (o.fold ? o.fold(t, s) : 0);
		if (o.twist) {
			const r = o.twist(t), cs = Math.cos(r), sn = Math.sin(r);
			[x, y] = [x * cs - y * sn, x * sn + y * cs];
		}
		const out = [p.x + b.x * x + n.x * y, p.y + b.y * x + n.y * y, p.z + b.z * x + n.z * y];
		if (o.col) out[3] = o.col(t, s, c);
		return out;
	}, !!o.closed);
}
const paint = (g, c) => {
	g.attributes.color.array.fill(1);
	if (c) for (let i = 0; i < g.attributes.color.count; i++) g.attributes.color.array.set(c, i * 3);
	return g;
};
// Built-in geometry, given a colour attribute so every part has the same attributes for merging.
function prim(g, c) {
	const n = g.attributes.position.count;
	g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
	return c ? paint(g, c) : g;
}
// Bakes the inverse of an object transform into a geometry, so the geometry can live under that transform.
function bakeUnder(g, pos, rot, scl) {
	const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scl).invert();
	g.applyMatrix4(m);
	g.computeVertexNormals();
	return g;
}
// The interiors find the sash as the torso's TorusGeometry child, so the drape keeps that type.
function asTorus(g) {
	const t = new THREE.TorusGeometry(0.2, 0.01, 3, 3);
	t.setIndex(g.index);
	for (const k of Object.keys(t.attributes)) t.deleteAttribute(k);
	for (const k of Object.keys(g.attributes)) t.setAttribute(k, g.attributes[k]);
	return t;
}

// ---------- textures ----------
let WEAVE;
// A cotton weave: fine warp and weft lines with a few slubs. Shared by every cloth.
function weave() {
	if (WEAVE) return WEAVE;
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const g = c.getContext("2d");
	g.fillStyle = "#f2f2f2";
	g.fillRect(0, 0, 64, 64);
	const R = rand(91);
	for (let i = 0; i < 64; i += 2) {
		g.fillStyle = `rgba(255,255,255,${0.5 + R() * 0.4})`;
		g.fillRect(0, i, 64, 1);
		g.fillStyle = `rgba(60,50,40,${0.05 + R() * 0.07})`;
		g.fillRect(i, 0, 1, 64);
	}
	for (let k = 0; k < 36; k++) {
		g.fillStyle = `rgba(${R() < 0.5 ? "255,255,255" : "80,70,60"},${0.12 + R() * 0.2})`;
		g.fillRect((R() * 64) | 0, (R() * 64) | 0, 2 + ((R() * 7) | 0), 1);
	}
	WEAVE = new THREE.CanvasTexture(c);
	WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping;
	WEAVE.repeat.set(14, 10);
	WEAVE.colorSpace = THREE.SRGBColorSpace;
	WEAVE.anisotropy = 4;
	return WEAVE;
}

// ---------- materials ----------
function skinMat(hex, lod, o = {}) {
	if (!lod) return new THREE.MeshStandardMaterial({ color: hex, vertexColors: true });
	const c = new THREE.Color(hex);
	return new THREE.MeshPhysicalMaterial(Object.assign({
		color: hex, roughness: 0.55, vertexColors: true, specularIntensity: 0.55,
		sheen: 0.4, sheenRoughness: 0.45, sheenColor: c.clone().lerp(new THREE.Color(0xff8a66), 0.55),
		emissive: c.clone().multiplyScalar(0.06),
	}, o));
}
function clothMat(hex, lod, o = {}) {
	if (!lod) return new THREE.MeshStandardMaterial({ color: hex, vertexColors: true, side: THREE.DoubleSide });
	const c = new THREE.Color(hex);
	return new THREE.MeshPhysicalMaterial(Object.assign({
		color: hex, roughness: 0.84, vertexColors: true, side: THREE.DoubleSide,
		sheen: 1, sheenRoughness: 0.65, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(0.5),
		map: weave(), bumpMap: weave(), bumpScale: 0.5,
	}, o));
}
function hairMat(hex, lod) {
	if (!lod) return new THREE.MeshStandardMaterial({ color: hex, vertexColors: true });
	return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.55, vertexColors: true, sheen: 0.7, sheenRoughness: 0.32, sheenColor: new THREE.Color(hex).lerp(new THREE.Color(0x8a6a50), 0.6), specularIntensity: 0.7 });
}

// ---------- the head ----------
// The skull keeps the radii of the old sphere head so the marks and crowns other modules add still fit.
const HR = [0.0966, 0.1134, 0.105];
function headPt(dx, dy, dz, out = [0, 0, 0]) {
	let x = dx * HR[0], y = dy * HR[1], z = dz * HR[2];
	const low = sstep(-0.004, -0.11, y), jaw = sstep(-0.035, -0.112, y), fr = sstep(-0.03, 0.07, z);
	// the jaw narrows to a broad chin; behind the jaw the head tucks into the neck
	x *= 1 - 0.07 * low - jaw * lerp(0.12, 0.36, fr * sstep(0.02, 0.08, z));
	if (z < 0.02) z = lerp(z, z * 0.5, low * sstep(0.02, -0.05, z));
	z += 0.012 * low * fr;
	y -= 0.012 * low * fr * sstep(0.03, 0.08, z);
	y += 0.007 * jaw;
	if (y > 0) y *= 0.985;
	if (z < 0) z *= 1 + 0.06 * sstep(-0.07, 0.03, y);
	let d = 0;
	for (const k of [-1, 1]) {
		d -= 0.0075 * gs(x - k * 0.034, 0.016) * gs(y - 0.017, 0.012) * fr; // eye sockets
		d += 0.0036 * gs(x - k * 0.056, 0.02) * gs(y + 0.008, 0.017) * fr; // cheekbones
		d -= 0.0024 * gs(x - k * 0.088, 0.018) * gs(y - 0.035, 0.025); // temples
		d -= 0.002 * gs(x - k * 0.04, 0.014) * gs(y + 0.03, 0.02) * fr; // under the cheekbones
	}
	d += 0.0028 * gs(y - 0.037, 0.009) * gs(x, 0.055) * fr; // brow ridge
	d += 0.0055 * gs(x, 0.03) * gs(y + 0.047, 0.02) * fr; // the mouth over the teeth
	d -= 0.0022 * gs(x, 0.025) * gs(y + 0.07, 0.007) * fr; // under the lower lip
	d += 0.0032 * gs(x, 0.02) * gs(y + 0.093, 0.012) * fr; // the point of the chin
	const nx = x / (HR[0] * HR[0]), ny = y / (HR[1] * HR[1]), nz = z / (HR[2] * HR[2]), nl = Math.hypot(nx, ny, nz) || 1;
	out[0] = x + (nx / nl) * d;
	out[1] = y + (ny / nl) * d;
	out[2] = z + (nz / nl) * d;
	return out;
}
const headN = (p) => V(p[0] / (HR[0] * HR[0]), p[1] / (HR[1] * HR[1]), p[2] / (HR[2] * HR[2])).normalize();
// The front of the face at (x, y).
function faceAt(x, y) {
	let dx = x / HR[0], dy = y / HR[1];
	const o = [0, 0, 0];
	for (let k = 0; k < 4; k++) {
		const dz = Math.sqrt(Math.max(1e-4, 1 - dx * dx - dy * dy)), l = Math.hypot(dx, dy, dz);
		headPt(dx / l, dy / l, dz / l, o);
		dx += (x - o[0]) / HR[0];
		dy += (y - o[1]) / HR[1];
	}
	return o;
}
function faceNormal(x, y) {
	const e = 0.002, a = faceAt(x - e, y), b = faceAt(x + e, y), c = faceAt(x, y - e), d = faceAt(x, y + e);
	return V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(V(d[0] - c[0], d[1] - c[1], d[2] - c[2])).normalize();
}
// The head surface at azimuth phi (0 = the face) and height y.
function headRing(phi, y) {
	let dy = clamp(y / HR[1], -0.99, 0.99);
	const o = [0, 0, 0];
	for (let k = 0; k < 4; k++) {
		const r = Math.sqrt(1 - dy * dy);
		headPt(Math.sin(phi) * r, dy, Math.cos(phi) * r, o);
		dy = clamp(dy + (y - o[1]) / HR[1], -0.99, 0.99);
	}
	return o;
}
// A line on the face, a lift above the skin: for brows, marks and the moustache.
function faceLine(pts, o) {
	const P = pts.map(([x, y]) => {
		const p = faceAt(x, y), n = faceNormal(x, y);
		return V(p[0], p[1], p[2]).addScaledVector(n, o.lift ?? 0.0012);
	});
	return ribbon(P, Object.assign({ up: (p) => headN([p.x, p.y, p.z]) }, o));
}
// The hairline (or the edge of a turban or a veil) as a height for each azimuth.
const lineAt = (K, phi) => {
	const a = Math.abs(phi);
	let i = 0;
	while (i < K.length - 2 && a > K[i + 1][0]) i++;
	return lerp(K[i][1], K[i + 1][1], sstep(K[i][0], K[i + 1][0], a));
};
const HAIRLINE = {
	m: [[0, 0.086], [0.42, 0.083], [0.72, 0.07], [0.98, 0.046], [1.14, 0.016], [1.24, -0.012], [1.36, -0.01], [1.46, 0.026], [1.95, 0.028], [2.3, -0.025], [2.75, -0.062], [3.2, -0.074]],
	f: [[0, 0.09], [0.45, 0.085], [0.85, 0.066], [1.15, 0.03], [1.35, 0.012], [1.5, 0.006], [1.95, 0.006], [2.4, -0.045], [3.2, -0.082]],
	turban: [[0, 0.064], [0.7, 0.06], [1.2, 0.038], [1.6, 0.03], [2.2, 0.014], [3.2, -0.01]],
	veil: [[0, 0.084], [0.6, 0.078], [0.95, 0.05], [1.12, 0.0], [1.22, -0.07], [1.3, -0.3], [3.2, -0.3]],
	beard: [[0, -0.061], [0.2, -0.056], [0.3, -0.044], [0.45, -0.03], [0.7, -0.018], [0.95, -0.006], [1.15, 0.01], [1.27, 0.02], [1.4, -0.05], [1.6, -0.2], [3.2, -0.2]],
};
// A shell over the head: off(p) above the skin where line says it covers. Below the line its vertices are
// drawn onto the line itself, just under the skin, so the edge follows the line cleanly and thins to it.
function headShell(nW, nH, th1, line, off, col, taper = 0.012, th0 = 0) {
	const below = th0 > 0;
	const g = prim(new THREE.SphereGeometry(1, nW, nH, 0, TAU, th0, th1 - th0));
	const a = g.attributes.position, c = g.attributes.color, p = [0, 0, 0];
	for (let i = 0; i < a.count; i++) {
		headPt(a.getX(i), a.getY(i), a.getZ(i), p);
		const phi = Math.atan2(p[0], p[2]), edge = lineAt(line, phi), dy = below ? edge - p[1] : p[1] - edge;
		let q = p, h;
		if (dy < 0) {
			q = headRing(phi, edge);
			h = -0.0025;
		} else h = off(p, phi) * Math.sqrt(sstep(0, taper, dy));
		const m = sstep(0, taper, dy);
		const n = headN(q);
		a.setXYZ(i, q[0] + n.x * h, q[1] + n.y * h, q[2] + n.z * h);
		if (col) c.setXYZ(i, ...col(q, phi, m, edge));
	}
	g.computeVertexNormals();
	weldGrid(g, nH, nW, false);
	return g;
}

// ---------- the torso ----------
// Rows: height above the hips, half width, front depth, back depth.
const TORSO_M = [
	[-0.08, 0.17, 0.108, 0.12], [0.0, 0.168, 0.106, 0.118], [0.08, 0.158, 0.1, 0.106], [0.16, 0.152, 0.104, 0.098], [0.26, 0.158, 0.116, 0.1],
	[0.34, 0.172, 0.128, 0.107], [0.4, 0.184, 0.132, 0.11], [0.45, 0.19, 0.12, 0.108], [0.485, 0.18, 0.1, 0.098], [0.515, 0.146, 0.078, 0.085],
	[0.54, 0.096, 0.058, 0.066], [0.556, 0.06, 0.047, 0.054], [0.568, 0.0, 0.0, 0.0],
];
const TORSO_F = [
	[-0.08, 0.182, 0.11, 0.128], [0.0, 0.178, 0.105, 0.126], [0.08, 0.158, 0.096, 0.106], [0.18, 0.134, 0.09, 0.09], [0.27, 0.142, 0.1, 0.094],
	[0.35, 0.156, 0.11, 0.1], [0.41, 0.166, 0.11, 0.102], [0.46, 0.172, 0.1, 0.099], [0.49, 0.165, 0.086, 0.09], [0.515, 0.134, 0.07, 0.08],
	[0.54, 0.088, 0.052, 0.06], [0.556, 0.054, 0.042, 0.048], [0.568, 0.0, 0.0, 0.0],
];
function sampler(K) {
	return (y) => {
		y = clamp(y, K[0][0], K[K.length - 1][0]);
		let i = 0;
		while (i < K.length - 2 && y > K[i + 1][0]) i++;
		const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(K.length - 1, i + 2)], u = (y - b[0]) / (c[0] - b[0]);
		return [Math.max(0, cr(a[1], b[1], c[1], d[1], u)), Math.max(0, cr(a[2], b[2], c[2], d[2], u)), Math.max(0, cr(a[3], b[3], c[3], d[3], u))];
	};
}
// surf(y, th, off, cloth) -> a point on the torso; cloth (0..1) softens the anatomy under a garment.
function torsoShape(fem, build) {
	const prof = sampler(fem ? TORSO_F : TORSO_M);
	const bw = build === "slim" ? 0.93 : build === "heavy" ? 1.07 : 1;
	const belly = build === "heavy" ? 0.032 : build === "slim" ? 0 : 0.008;
	return (y, th, off = 0, cloth = 0) => {
		const [W, Df, Db] = prof(y);
		const s = Math.sin(th), c = Math.cos(th);
		const e = 2 / lerp(2, 2.5, sstep(0.56, 0.42, y) * sstep(-0.1, 0.12, y));
		let x = W * bw * Math.sign(s) * Math.abs(s) ** e, z = (c > 0 ? Df : Db) * bw * Math.sign(c) * Math.abs(c) ** e;
		const fr = Math.max(0, c), bk = Math.max(0, -c);
		let d = off;
		for (const k of [-1, 1]) {
			if (fem) d += 0.034 * (1 - cloth * 0.25) * gs(x - k * 0.068, 0.042) * gs(y - 0.37, y < 0.37 ? 0.036 : 0.05) * fr;
			else d += 0.011 * (1 - cloth * 0.75) * gs(x - k * 0.066, 0.05) * gs(y - 0.385, y < 0.385 ? 0.028 : 0.06) * fr;
			d += 0.006 * (1 - cloth * 0.5) * gs(x - k * 0.075, 0.045) * gs(y - 0.41, 0.06) * bk;
		}
		d -= 0.004 * (1 - cloth) * gs(x, 0.014) * bk * sstep(0.05, 0.15, y) * sstep(0.5, 0.42, y);
		d -= 0.003 * (1 - cloth) * gs(x, 0.012) * fr * sstep(0.2, 0.3, y) * sstep(0.48, 0.42, y);
		d += belly * gs(y - 0.15, 0.1) * gs(x, 0.13) * fr;
		const l = Math.hypot(x, z) || 1, up = sstep(0.47, 0.565, y);
		return [x + (x / l) * d * (1 - up * 0.6), y + d * up * 0.9, z + (z / l) * d * (1 - up * 0.6)];
	};
}
// Projects v onto the body surface (along a ray from the spine), off above it.
function onBody(surf, v, off, yMin = -0.06) {
	const a = V(0, clamp(v.y, Math.max(0.0, yMin), 0.44), 0), d = v.clone().sub(a);
	if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
	d.normalize();
	let lo = 0, hi = 0.5;
	for (let k = 0; k < 16; k++) {
		const r = (lo + hi) / 2, q = a.clone().addScaledVector(d, r);
		const s = q.y > 0.567 ? [0, 0, 0] : surf(Math.max(q.y, yMin), Math.atan2(q.x, q.z), 0);
		if (Math.hypot(q.x, q.z) < Math.hypot(s[0], s[2]) && q.y < 0.567) lo = r;
		else hi = r;
	}
	return a.addScaledVector(d, lo + off);
}

// ---------- hands and feet ----------
// A hand in its joint's frame: palm towards the body's midline, thumb forward, fingers a little curled.
function handGeo(side, fem, nt, nth) {
	const m = -side, k = fem ? 0.9 : 1;
	const yw = 0.036 * k, yk = -0.03 * k, Lf = 0.074 * k, tk = 0.42;
	const len = (s) => {
		const q = clamp((s + 1) * 1.5, 0, 3), i = Math.min(2, Math.floor(q));
		return lerp([0.76, 0.94, 1.0, 0.9][i], [0.76, 0.94, 1.0, 0.9][i + 1], q - i);
	};
	const palm = loft(nt, nth, (t, u) => {
		const th = u * TAU, s = Math.sin(th), c = Math.cos(th);
		let y, w, h, cx = 0;
		if (t <= tk) {
			const a = t / tk;
			y = lerp(yw, yk, a);
			w = lerp(0.024, 0.041, sstep(0, 0.55, a)) * k;
			h = lerp(0.017, 0.0135, a) * k;
			const cap = Math.sqrt(sstep(0, 0.12, a));
			w *= cap;
			h *= cap;
			if (a < 0.02) y = yw + 0.004;
		} else {
			const a = (t - tk) / (1 - tk), end = Math.sqrt(Math.max(0, 1 - a ** 5));
			y = yk - Lf * a * len(s);
			w = 0.04 * k * lerp(1, 0.86, a) * end;
			h = lerp(0.0125, 0.0088, a) * k * end;
			cx = m * 0.03 * k * a * a;
			// grooves between the four fingers
			const q = (s + 1) * 2;
			h *= 0.66 + 0.34 * Math.sqrt(Math.abs(Math.sin(Math.PI * frac(q))));
		}
		// the back of the hand is rounder than the palm
		const hc = c * m > 0 ? h * 0.85 : h;
		return [cx + hc * c, y, w * Math.sign(s) * Math.abs(s) ** 0.85];
	});
	const thumb = capsule(V(m * 0.004 * k, 0.014 * k, 0.026 * k), V(m * 0.02 * k, -0.034 * k, 0.046 * k), 0.0118 * k, 0.0086 * k, Math.max(4, nth - 4), nt > 6 ? 3 : 2);
	const g = mergeGeometries([palm, thumb]);
	palm.dispose();
	thumb.dispose();
	return g;
}
// A foot in the ankle's frame: heel behind, toes forward (+z), the big toe on the inside.
const FOOT = [[-0.064, 0, 0.032], [-0.058, 0.021, 0.046], [-0.042, 0.028, 0.06], [-0.012, 0.031, 0.068], [0.03, 0.034, 0.058], [0.08, 0.039, 0.04], [0.125, 0.043, 0.027], [0.16, 0.041, 0.02], [0.186, 0.033, 0.014], [0.2, 0, 0.01]];
const SOLE_Y = -0.066;
function footGeo(side, nth, sub, grow = 0, sole = false) {
	const m = -side, R = rings(FOOT, sub);
	return loft(R.length - 1, nth, (t, u, i) => {
		const r = R[i], th = u * TAU, s = Math.sin(th), c = Math.cos(th);
		const z0 = r[0] + (i === 0 ? -grow : i === R.length - 1 ? grow : 0), W = Math.max(0, r[1]) + (r[1] > 0 ? grow : 0), H = Math.max(0.005, r[2]);
		const cx = m * 0.01 * sstep(0.04, 0.17, z0);
		const x = cx + W * Math.sign(s) * Math.abs(s) ** (sole ? 0.4 : 0.8);
		let y, z = z0;
		if (sole) y = SOLE_Y - 0.006 + 0.006 * Math.sign(c) * Math.abs(c) ** 0.4;
		else {
			y = c > 0 ? SOLE_Y + 0.005 + (H - 0.005) * c ** 0.9 : SOLE_Y + 0.005 + 0.005 * c;
			if (z0 > 0.12 && W > 0) {
				// the outer toes end sooner; small dips between them on top
				const lat = clamp(((x - cx) * -m) / W, -1, 1);
				z -= 0.032 * sstep(0.12, 0.2, z0) * clamp((lat + 0.35) / 1.35, 0, 1);
				if (c > 0.2) y -= 0.0022 * Math.abs(Math.sin((lat + 1) * 5.5)) * sstep(0.14, 0.18, z0);
			}
		}
		if (sole && Math.abs(z0) > 0) z = z0 * 1.02 + 0.002;
		return [x, y, z];
	});
}

// ---------- the body ----------
function part(geo, material, x, y, z, parent) {
	const m = new THREE.Mesh(geo, material);
	m.position.set(x, y, z);
	m.castShadow = true;
	parent.add(m);
	return m;
}
const joint = (x, y, z, parent) => {
	const g = new THREE.Group();
	g.position.set(x, y, z);
	parent.add(g);
	return g;
};
// Cloth that hangs: the kurta's skirt, the sari, the dhoti's pleats, the pallu's tail, the uparna's ends.
// Each point of the cloth is either held (it follows the waist, blending from the hips to the torso) or hangs
// from a point on the waist line (o.anchor), and is re-draped for every pose by drape() below.
// o: frame ("torso" | "hips", the joint the mesh hangs under), anchor(bH, k) -> rest point it hangs from (hips
// frame) or null when held, wT(y) -> how much a held point follows the torso, clear (gap kept from the body),
// gap (true: also kept off the fork of the legs, for an outer layer).
function drapeable(J, mesh, o) {
	const g = mesh.geometry, a = g.attributes.position, n = a.count;
	mesh.updateMatrix();
	const M = mesh.matrix.clone(), Mi = M.clone().invert();
	const bh = new Float32Array(n * 3), a0 = new Float32Array(n * 3), d0 = new Float32Array(n * 3), len = new Float32Array(n), wt = new Float32Array(n), wta = new Float32Array(n);
	const v = V(), w = V();
	for (let k = 0; k < n; k++) {
		v.fromBufferAttribute(a, k).applyMatrix4(M);
		bh.set([v.x, v.y, v.z], k * 3);
		wt[k] = o.wT ? o.wT(v.y) : 0;
		const an = o.anchor(v, k);
		if (!an) {
			len[k] = -1;
			continue;
		}
		a0.set([an.x, an.y, an.z], k * 3);
		w.subVectors(v, an);
		len[k] = w.length();
		w.multiplyScalar(1 / (len[k] || 1));
		if (len[k] < 1e-5) w.set(0, -1, 0);
		d0.set([w.x, w.y, w.z], k * 3);
		wta[k] = o.wT ? o.wT(an.y) : 0;
	}
	J.cloth.push({ mesh, geo: g, M, Mi, bh, a0, d0, len, wt, wta, frame: o.frame || "torso", clear: o.clear ?? 0.02, gap: !!o.gap, key: "" });
	g.computeBoundingSphere();
	g.boundingSphere.radius = Math.max(g.boundingSphere.radius * 1.4, 0.9);
}

// Builds the body. opts:
//   skin, top, bottom, sash, head: "turban" | "hair" | "veil", headColor, sari, staff, diya, bag, bagColor, beard
// and, new: lod (0 crowd, 1 default, 2 hero), gender ("m" | "f"), age ("young" | "adult" | "elder"),
//   build ("slim" | "average" | "heavy"), bare (bare chest), pujari (bare, sacred thread, shaven head with a
//   shikha, long dhoti, tripundra), janeu, shawl (a colour: an uparna over both shoulders), mark ("tilak" |
//   "tripundra" | "namam" | "urdhva" | "bindi" | "none"), moustache (a colour), hairColor, sleeve (0..1 of the
//   forearm), border (sari and shawl border colour), dhoti ("mid" | "long"), glasses, jewels (false for none).
function body(opts) {
	const lod = opts.lod ?? 1;
	const Q = [0.3, 0.56, 0.68][lod];
	const sg = (n, min = 3) => Math.max(min, Math.round(n * Q));
	const fem = opts.gender ? opts.gender === "f" : !!opts.sari;
	const pujari = !!opts.pujari;
	const bare = !!(opts.bare || pujari);
	const elder = opts.age === "elder" || opts.age === "old";
	const hairHex = opts.hairColor ?? (elder ? (fem ? 0x77726c : 0xb5afa6) : HAIR);
	const border = opts.border ?? GOLD;
	const skinHex = opts.skin;
	const M = {
		skin: skinMat(skinHex, lod),
		eye: lod ? skinMat(skinHex, lod, { roughness: 0.12, sheen: 0, emissive: 0x000000, specularIntensity: 1, clearcoat: 0.6, clearcoatRoughness: 0.1 }) : skinMat(skinHex, 0),
		top: clothMat(opts.top, lod),
		bottom: clothMat(opts.bottom, lod),
		sash: clothMat(opts.sash, lod),
		hair: hairMat(hairHex, lod),
		brow: new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.95, vertexColors: true }),
		head: clothMat(opts.headColor ?? opts.sash, lod),
		wood: mat(0x6b4a2a, { roughness: 0.7, vertexColors: true }),
		bag: clothMat(opts.bagColor ?? 0xc9b48a, lod),
		sole: mat(SOLE, { roughness: 0.75, vertexColors: true }),
	};
	const skinC = new THREE.Color(skinHex);
	const root = new THREE.Group();
	const hips = joint(0, 0.95, 0, root);
	const J = { root, hips, cloth: [], lod, fem };
	const surf = torsoShape(fem, opts.build);
	const longDhoti = pujari || opts.dhoti === "long";
	const k = fem ? 0.9 : 1; // limb girth
	// ---- legs: dhoti over the thighs, bare shins, chappals ----
	for (const side of [-1, 1]) {
		const S = side < 0 ? "L" : "R";
		const hip = joint(side * 0.095, 0, 0, hips);
		const loose = fem ? 0.92 : 1.1;
		// soft folds round the leg, the hollows a little darker so the cloth reads as cloth
		const fold = (p, th, r) => {
			const a = 1 + (fem ? 0.01 : 0.05) * Math.sin(5 * th + r[0] * 11 + side * 2) + (fem ? 0 : 0.03) * Math.sin(8 * th - r[0] * 19 + side);
			const k = fem ? 1 : 0.8 + 0.2 * clamp((a - 0.93) / 0.12, 0, 1);
			return [p[0] * a, p[1], p[2] * a, [k, k, k * 0.98]];
		};
		const ku = !opts.sari && !(opts.bare || pujari) ? 0.84 : 1;
		part(tube([[0.05, 0, 0, -side * 0.02], [0.035, 0.06 * ku, 0.07 * ku, -side * 0.02], [0.0, 0.082 * ku, 0.1 * loose * ku, -side * 0.018], [-0.14, 0.09 * loose * ku, 0.098 * loose * ku, -side * 0.008], [-0.3, 0.09 * loose, 0.09 * loose], [-0.44, 0.086 * loose, 0.084 * loose], [-0.5, 0.074, 0.074], [-0.53, 0, 0]], sg(fem ? 8 : 18), fem ? 1 : sg(3, 1), fold), M.bottom, 0, 0, 0, hip);
		const knee = joint(0, -0.46, 0, hip);
		// below the knee the dhoti falls loose: wider towards the hem, in soft vertical folds, the hem uneven and
		// turned in (open, not capped), hanging a little forward of the shin
		const dl = fem ? 0.2 : longDhoti ? 0.385 : 0.3, hw = longDhoti ? 0.118 : 0.106;
		const fall = (p, th, r) => {
			const y = p[1], f = sstep(0.0, -dl, y);
			const a = 1 + (0.03 + 0.07 * f) * (0.6 * Math.sin(5 * th + side * 1.3 + y * 6) + 0.4 * Math.sin(9 * th - side + y * 11)) * (fem ? 0.3 : 1);
			const hemDrop = (0.012 * Math.sin(2 * th + side) + 0.008 * Math.sin(5 * th + 1)) * sstep(-dl * 0.6, -dl, y);
			const k = 0.78 + 0.22 * clamp((a - 0.92 + 0.04 * (1 - f)) / (0.1 + 0.08 * f), 0, 1);
			return [p[0] * a, y + hemDrop, p[2] * a, [k, k, k * 0.98]];
		};
		const kt = fem
			? [[0.075, 0, 0], [0.055, 0.07, 0.07], [0.0, 0.086 * loose, 0.084 * loose], [-dl * 0.5, 0.084, 0.083], [-dl, 0.09, 0.088], [-dl + 0.006, 0, 0]]
			: [[0.08, 0, 0], [0.062, 0.066, 0.068], [0.03, 0.09, 0.094], [0.0, 0.096, 0.1, 0, 0.004], [-dl * 0.3, 0.094, 0.098, 0, 0.006], [-dl * 0.65, hw * 0.95, hw * 1.0, 0, 0.01], [-dl, hw, hw * 1.04, 0, 0.012], [-dl - 0.004, hw * 0.99, hw * 1.03, 0, 0.012], [-dl + 0.014, hw * 0.9, hw * 0.93, 0, 0.011]];
		part(tube(kt, sg(fem ? 8 : 26), fem ? 1 : sg(4, 1), fem ? fold : fall), M.bottom, 0, 0, 0, knee);
		J.legR = { thigh: fem ? 0.085 : 0.097, knee: fem ? 0.09 : hw * 0.9, dl };
		// the shin, with the calf behind
		part(tube([[0.032, 0, 0], [0.022, 0.04 * k, 0.04 * k], [0.0, 0.049 * k, 0.05 * k, 0, 0.003], [-0.06, 0.049 * k, 0.054 * k, 0, -0.004], [-0.13, 0.045 * k, 0.054 * k, 0, -0.011], [-0.24, 0.037 * k, 0.04 * k, 0, -0.005], [-0.34, 0.029 * k, 0.031 * k], [-0.39, 0.027 * k, 0.03 * k], [-0.41, 0.023, 0.026], [-0.425, 0, 0]], sg(fem ? 10 : 16), fem ? 1 : sg(3, 1)), M.skin, 0, 0, 0, knee);
		const ankle = joint(0, -0.4, 0, knee);
		const fs = (n) => footGeo(side, sg(n), sg(3, 1));
		part(fs(16), M.skin, 0, 0, 0, ankle);
		part(footGeo(side, lod ? 10 : 6, 1, 0.007, true), M.sole, 0, 0, 0, ankle);
		if (lod) {
			const m = -side, cx = m * 0.006, W = 0.038;
			const strap = ribbon([V(cx - W - 0.003, SOLE_Y + 0.001, 0.078), V(cx - W * 0.6, SOLE_Y + 0.03, 0.072), V(cx, SOLE_Y + 0.044, 0.068), V(cx + W * 0.6, SOLE_Y + 0.03, 0.072), V(cx + W + 0.003, SOLE_Y + 0.001, 0.078)], { nt: sg(10, 4), sec: [-1, -0.5, 0.5, 1], w: () => 0.022, th: 0.0035, up: (p) => V(p.x - cx, p.y - SOLE_Y + 0.01, 0) });
			part(strap, M.sole, 0, 0, 0, ankle);
		}
		J["hip" + S] = hip;
		J["knee" + S] = knee;
		J["ankle" + S] = ankle;
	}
	// ---- the dhoti's seat, front pleats and the kachha tucked between the legs ----
	if (!opts.sari) {
		const sk = bare ? 1 : 0.93;
		part(tube([[0.13, 0.15 * sk, 0.1 * sk], [0.06, 0.166 * sk, 0.11 * sk], [-0.02, 0.175 * sk, 0.116 * sk, 0, -0.004], [-0.09, 0.168 * sk, 0.114 * sk, 0, -0.008], [-0.15, 0.138, 0.1, 0, -0.006], [-0.19, 0.088, 0.07], [-0.205, 0, 0]], sg(bare ? 26 : 18), sg(bare ? 3 : 2, 1), (p, th, r) => {
			const fold = 1 + 0.02 * Math.sin(7 * th + r[0] * 30);
			const crease = 1 - 0.2 * gs(p[0], 0.028) * sstep(-0.08, -0.17, p[1]);
			return [p[0] * fold, p[1], p[2] * fold * crease];
		}), M.bottom, 0, 0, 0, hips);
		const pbot = longDhoti ? -0.8 : -0.66, pnt = sg(14), pnu = sg(16, 6);
		const plF = (t, u) => {
			const y = lerp(0.08, pbot, t), th = u * TAU, s = Math.sin(th), c = Math.cos(th);
			const w = lerp(0.034, 0.1, sstep(0.0, 0.85, t)), z0 = (bare ? 0.114 : 0.098) + 0.024 * sstep(0.25, 1, t);
			const x = s * w, tri = Math.abs(frac((x / 0.0145) + 0.5) - 0.5) * 2;
			return [x, y, z0 + 0.007 * tri * sstep(0, 0.25, t) + c * 0.003];
		};
		const panel = part(loft(pnt, pnu, plF), M.bottom, 0, 0, 0, hips);
		const tA = (0.08 - 0.03) / (0.08 - pbot);
		drapeable(J, panel, { frame: "hips", clear: 0.006, anchor: (v, k) => (v.y >= 0.03 ? null : V(...plF(tA, (k % (pnu + 1)) / pnu))) });
		J.pleats = panel;
		if (lod) {
			const kc = ribbon([V(0, 0.09, -0.118), V(0, -0.02, -0.128), V(0, -0.12, -0.105), V(0, -0.19, -0.04)], { nt: sg(10), nth: 6, w: (t) => lerp(0.05, 0.03, t), th: 0.014, up: () => V(0, 0, -1), fold: (t, s) => 0.004 * Math.sin(s * 4 + t * 9) });
			part(kc, M.bottom, 0, 0, 0, hips);
		}
	}
	// ---- the torso ----
	const torso = joint(0, 0, 0, hips);
	J.torso = torso;
	const skirtR = (y, th) => {
		const p = surf(Math.max(y, -0.08), th, 0.012, 1), f = sstep(-0.06, -0.92, y);
		return [p[0] * (1 + 0.24 * f), y, p[2] * (1 + 0.62 * f)];
	};
	if (opts.sari) {
		// the sari skirt to the ankles: front pleats, gentle folds, the zari border at the hem
		const bot = -0.92, bc = ratio(border, opts.bottom), dark = ratio(opts.bottom, opts.bottom, 0.72);
		const nth = sg(64, 16), nr = sg(20, 5);
		const ys = [...Array.from({ length: nr }, (_, i) => lerp(0.105, bot + 0.1, i / nr)), ...(lod ? [bot + 0.082, bot + 0.0785, bot + 0.0745, bot + 0.071, bot + 0.066, bot + 0.0625, bot + 0.03, bot + 0.006, bot + 0.002] : [bot + 0.066, bot + 0.062, bot + 0.004]), bot];
		const ths = [];
		const g = loft(ys.length - 1, nth, (t, u, i) => {
			const y = ys[i], th0 = u * TAU, th = th0 - 0.72 * Math.sin(th0);
			ths.push(th);
			const p = skirtR(y, th), f = sstep(0.05, -0.85, y);
			const a = Math.atan2(Math.sin(th - 0.08), Math.cos(th - 0.08));
			let d = 0.004 * Math.sin(th * 6 + 1) * f + 0.003 * Math.sin(th * 11) * f;
			if (lod) d += gs(a, 0.34) * (0.003 + 0.013 * f) * Math.abs(Math.sin(a * 24));
			const l = Math.hypot(p[0], p[2]) || 1;
			let col = null;
			if (y < bot + 0.064) col = bc;
			else if (y < bot + 0.08 && y > bot + 0.073) col = bc;
			if (y < bot + 0.004) col = dark;
			return [p[0] + (p[0] / l) * d, y, p[2] + (p[2] / l) * d, col];
		});
		const skirt = part(outward(g), M.bottom, 0, 0, 0, torso);
		drapeable(J, skirt, { frame: "torso", clear: 0.012, gap: true, wT: (y) => sstep(-0.02, 0.1, y), anchor: (v, k) => (v.y >= 0.06 ? null : V(...skirtR(0.06, ths[k]))) });
	} else if (bare) {
		// a bare chest: the dhoti's waist, rolled at the top
		const g = loft(sg(8, 4), sg(34, 10), (t, u) => {
			const th = u * TAU, y = lerp(0.135, -0.07, t), roll = gs(y - 0.12, 0.012) * 0.008;
			const p = surf(y, th, 0.012 + roll + 0.002 * Math.sin(th * 7), 1);
			return [p[0], y, p[2]];
		});
		part(outward(g), M.bottom, 0, 0, 0, torso);
	} else {
		// the kurta's skirt: flaring to above the knee, open in side slits, the hem rolled inside
		const top = 0.1, slit = -0.2, bot = -0.42;
		const nth = sg(40, 10);
		const ring = (y, th) => {
			const p = surf(Math.max(y, -0.08), th, 0.02, 1), f = sstep(-0.06, bot, y);
			const d = (0.006 * Math.sin(th * 7 + 0.6) + 0.004 * Math.sin(th * 13 + 2)) * f;
			const sx = 1 + 0.2 * f + d / 0.18, sz = 1 + 0.36 * f + d / 0.14;
			return [p[0] * sx, y, p[2] * sz];
		};
		const ths = [];
		const upper = loft(sg(8, 3), nth, (t, u) => (ths.push(u * TAU), ring(lerp(top, slit, t), u * TAU)));
		const pnl = (a0, a1) => loft(sg(10, 4), Math.round(nth * 0.46), (t, u) => {
			const y = t < 0.9 ? lerp(slit, bot, t / 0.9) : bot + (t - 0.9) * 0.08;
			ths.push(lerp(a0, a1, u));
			const p = ring(Math.max(y, bot), lerp(a0, a1, u));
			const inn = t < 0.9 ? 0 : 0.92;
			return [p[0] * (1 - 0.04 * inn), y, p[2] * (1 - 0.05 * inn)];
		});
		const s = 1.5;
		const front = outward(pnl(-s, s)), back = outward(pnl(Math.PI - s, Math.PI + s));
		outward(upper);
		const g = mergeGeometries([upper, front, back]);
		[upper, front, back].forEach((x) => x.dispose());
		const hem = part(g, M.top, 0, 0, 0, torso);
		drapeable(J, hem, { frame: "torso", clear: 0.024, gap: true, wT: (y) => sstep(-0.02, 0.1, y), anchor: (v, k) => (v.y >= 0.075 ? null : V(...ring(0.075, ths[k]))) });
	}
	// the chest: a kurta, or bare skin (also under the choli)
	const skinTorso = bare || fem;
	{
		const tg = loft(sg(36, 10), sg(44, 12), (t, u) => {
			const th = u * TAU, y = skinTorso ? lerp(0.568, -0.08, t ** 1.2) : lerp(0.568, 0.0, t ** 1.2);
			if (skinTorso) {
				const p = surf(y, th);
				let col = null;
				if (!fem) {
					const nip = Math.max(gs(p[0] - 0.072, 0.008), gs(p[0] + 0.072, 0.008)) * gs(y - 0.372, 0.008) * (p[2] > 0 ? 1 : 0);
					const navel = gs(p[0], 0.007) * gs(y - 0.13, 0.009) * (p[2] > 0 ? 1 : 0);
					if (nip + navel > 0.02) col = mixc(ONE, [0.62, 0.52, 0.5], Math.min(1, nip + navel));
				}
				return [p[0], p[1], p[2], col];
			}
			const p = surf(y, th, 0.013 + 0.0022 * Math.sin(th * 9 + y * 34) * sstep(0.3, 0.08, y), 1);
			return [p[0], p[1], p[2]];
		});
		J.chest = part(outward(tg), skinTorso ? M.skin : M.top, 0, 0, 0, torso);
	}
	// angavastram across the left shoulder, or the sari's pallu, under the old torus sash's transform
	const SASH_P = V(0, 0.3, 0), SASH_R = new THREE.Euler(Math.PI / 2, 0.75, 0), SASH_S = V(1, 0.72, 1.1);
	const clothOff = skinTorso ? 0.006 : 0.019;
	const up = (p) => V(p.x, p.y > 0.42 ? (p.y - 0.42) * 1.5 : 0, p.z);
	let sashGeo;
	const sashCol = (hex) => (t, s) => (Math.abs(s) > 0.78 ? ratio(border, hex) : null);
	if (opts.sari) {
		const raw = [V(-0.12, 0.07, 0.2), V(-0.05, 0.2, 0.2), V(0.03, 0.34, 0.2), V(0.1, 0.47, 0.15), V(0.13, 0.56, 0.0), V(0.12, 0.46, -0.2), V(0.11, 0.28, -0.2), V(0.1, 0.06, -0.2)];
		const pts = raw.map((v) => onBody(surf, v, (fem ? 0.012 : 0.006) + 0.004));
		for (const [y, z] of [[-0.22, -1], [-0.5, -1]]) {
			const r = skirtR(y, Math.PI - 0.55);
			pts.push(V(r[0] * 1.02 + 0.01, y, r[2] * 1.04 + z * 0.02));
		}
		const bc = ratio(border, opts.sash);
		sashGeo = ribbon(pts, {
			nt: sg(40, 10), lod, th: 0.005, up: (p) => (p.y < -0.05 ? V(p.x * 0.3, 0, -1) : up(p)),
			w: (t) => lerp(0.13, 0.11, sstep(0.2, 0.45, t)) + 0.2 * sstep(0.55, 1, t),
			fold: (t, s) => (0.006 * Math.sin(s * 5 + t * 3) * (1 - sstep(0.4, 0.6, t)) + 0.008 * Math.sin(s * 3.2 + t * 7) * sstep(0.6, 1, t)) * (lod ? 1 : 0.3),
			col: (t, s) => (Math.abs(s) > 0.79 || t > 0.86 ? bc : null),
		});
	} else {
		const raw = [V(0.13, 0.56, 0.02), V(0.08, 0.46, 0.2), V(0.01, 0.33, 0.2), V(-0.08, 0.2, 0.2), V(-0.155, 0.09, 0.2), V(-0.2, 0.05, 0.0), V(-0.12, 0.14, -0.2), V(-0.02, 0.3, -0.2), V(0.08, 0.45, -0.2), V(0.13, 0.54, -0.06)];
		const pts = raw.map((v) => onBody(surf, v, clothOff + 0.004));
		sashGeo = ribbon(pts, {
			closed: true, nt: sg(44, 12), lod, th: 0.007, up,
			w: (t) => 0.07 + 0.012 * Math.sin(t * TAU * 2),
			fold: (t, s) => (lod ? 0.0045 : 0.002) * Math.sin(s * 4.5 + t * 30),
			col: opts.shawl || pujari ? null : sashCol(opts.sash),
		});
	}
	const sash = part(asTorus(bakeUnder(sashGeo, SASH_P, SASH_R, SASH_S)), M.sash, 0, 0, 0, torso);
	sash.position.copy(SASH_P);
	sash.rotation.copy(SASH_R);
	sash.scale.copy(SASH_S);
	if ((opts.shawl || pujari) && !opts.sari) sash.visible = false;
	J.sash = sash;
	// ---- the neck ----
	const nk = fem ? 0.9 : 1;
	part(tube([[0.49, 0.05 * nk, 0.052 * nk, 0, -0.004], [0.55, 0.047 * nk, 0.05 * nk, 0, 0.0], [0.6, 0.043 * nk, 0.046 * nk, 0, 0.004], [0.64, 0.043 * nk, 0.046 * nk, 0, 0.002], [0.672, 0.04, 0.04, 0, -0.004], [0.69, 0, 0, 0, -0.006]], sg(16), sg(2, 1), (p, th) => {
		if (fem) return p;
		const ad = 0.0045 * gs(p[1] - 0.6, 0.012) * Math.max(0, Math.cos(th)) ** 6;
		return [p[0], p[1], p[2] + ad];
	}), M.skin, 0, 0, 0, torso);
	// ---- the head ----
	const head = joint(0, 0.66, 0.01, torso);
	J.head = head;
	buildHead(J, head, opts, M, { lod, sg, fem, pujari, elder, hairHex, skinHex, skinC, border });
	// ---- arms ----
	const sleeve = opts.sleeve ?? 0.55;
	for (const side of [-1, 1]) {
		const S = side < 0 ? "L" : "R";
		const sh = joint(side * 0.21, 0.47, 0, torso);
		const ak = fem ? 0.86 : opts.build === "heavy" ? 1.08 : 1;
		const kurta = !skinTorso;
		const up0 = [[0.026, 0, 0, -side * 0.03], [0.021, 0.026, 0.03, -side * 0.026], [0.008, 0.042, 0.046, -side * 0.018], [-0.02, 0.049, 0.051, -side * 0.01], [-0.06, 0.047, 0.05, -side * 0.006], [-0.12, 0.042, 0.046, -side * 0.004], [-0.19, 0.04, 0.045, -side * 0.002, 0.003], [-0.26, 0.036, 0.039], [-0.3, 0.034, 0.035], [-0.325, 0.022, 0.024], [-0.336, 0, 0]];
		const grow = kurta ? 0.009 : 0;
		const ug = tube(up0.map((r) => [r[0], r[1] > 0 ? r[1] * ak + grow : 0, r[2] > 0 ? r[2] * ak + grow : 0, r[3] || 0, 0]), sg(18), sg(3, 1), kurta ? (p, th) => {
			const wr = 1 + 0.03 * Math.sin(th * 5 + p[1] * 40) * sstep(-0.18, -0.3, p[1]);
			return [p[0] * wr, p[1], p[2] * wr];
		} : null);
		part(ug, kurta ? M.top : M.skin, 0, 0, 0, sh);
		if (fem && lod) {
			// the choli's short sleeve
			const cs = tube([[0.03, 0, 0, -side * 0.03], [0.025, 0.03, 0.034, -side * 0.026], [0.011, 0.047, 0.05, -side * 0.018], [-0.02, 0.051, 0.054, -side * 0.01], [-0.08, 0.046, 0.05, -side * 0.005], [-0.11, 0.045, 0.049, -side * 0.004], [-0.114, 0.038, 0.042, -side * 0.004], [-0.108, 0, 0, -side * 0.004]], sg(18), sg(2, 1));
			part(cs, M.top, 0, 0, 0, sh);
		}
		const el = joint(0, -0.3, 0, sh);
		const fa = tube([[0.036, 0, 0], [0.026, 0.03 * ak, 0.03 * ak], [0.0, 0.04 * ak, 0.04 * ak], [-0.05, 0.041 * ak, 0.04 * ak], [-0.12, 0.035 * ak, 0.036 * ak], [-0.2, 0.026 * ak, 0.03 * ak], [-0.245, 0.02 * ak, 0.027 * ak], [-0.262, 0.016, 0.02], [-0.272, 0, 0]], sg(16), sg(2, 1));
		part(fa, M.skin, 0, 0, 0, el);
		if (kurta && sleeve > 0) {
			const L = 0.04 + 0.2 * sleeve, cuff = sleeve < 0.9 ? 0.006 : 0;
			const sv = tube([[0.045, 0, 0], [0.032, 0.036, 0.036], [0.0, 0.049 * ak, 0.049 * ak], [-L * 0.5, 0.045 * ak, 0.046 * ak], [-L, 0.042 * ak + cuff, 0.043 * ak + cuff], [-L - 0.006, 0.04 * ak + cuff, 0.041 * ak + cuff], [-L + 0.004, 0, 0]], sg(16), sg(2, 1), (p, th) => {
				const wr = 1 + 0.03 * Math.sin(th * 4 + p[1] * 50) * sstep(0.0, -0.06, p[1]) * sstep(-L, -L * 0.6, p[1]);
				return [p[0] * wr, p[1], p[2] * wr];
			});
			part(sv, M.top, 0, 0, 0, el);
		}
		const hand = joint(0, -0.27, 0, el);
		J["palm" + S] = part(handGeo(side, fem, sg(14, 5), sg(14, 6)), M.skin, 0, 0, 0, hand);
		if (fem && opts.jewels !== false) {
			// glass and gold bangles
			const cols = [ratio(opts.sash, skinHex), ratio(GOLD, skinHex), ratio(0x1d6b3a, skinHex), ratio(GOLD, skinHex)];
			for (let b = 0; b < (lod ? 4 : 2); b++) {
				const g = prim(new THREE.TorusGeometry(0.03, 0.0026, sg(6, 3), sg(18, 8)), cols[b % 4]);
				g.rotateX(Math.PI / 2);
				g.scale(0.92, 1, 1.08);
				part(g, M.skin, 0, -0.215 - b * 0.0065, 0, el);
			}
		}
		J["sh" + S] = sh;
		J["el" + S] = el;
		J["hand" + S] = hand;
	}
	// ---- the rest of the dress ----
	if (fem) {
		// the choli: over the chest and shoulders, a scooped neck, ending above the midriff
		const g = loft(sg(16, 6), sg(44, 12), (t, u) => {
			const th = u * TAU, a = Math.atan2(Math.sin(th), Math.cos(th));
			const top = 0.548 - 0.085 * gs(a, 0.62) - 0.026 * gs(Math.abs(a) - Math.PI, 0.7);
			const y = lerp(top, 0.262, t), hem = t > 0.94 ? 1 : 0;
			const p = surf(y, th, 0.004 + 0.002 * hem);
			return [p[0], p[1], p[2]];
		});
		part(outward(g), M.top, 0, 0, 0, torso);
	}
	if (!skinTorso && lod) {
		// the band collar and the placket, embroidered
		const em = [ratio(border, opts.top), ratio(0x7a1d1a, opts.top)];
		const col = loft(2, sg(40, 10), (t, u) => {
			const th = lerp(0.32, TAU - 0.32, u), y = lerp(0.552, 0.584, t);
			const r = lerp(0.057, 0.054, t);
			return [Math.sin(th) * r, y, 0.004 + Math.cos(th) * r * 1.05, em[Math.floor(u * 40) % 2]];
		});
		part(col, M.top, 0, 0, 0, torso);
		const pk = ribbon([0.55, 0.47, 0.4, 0.33].map((y) => onBody(surf, V(0, y, 0.3), 0.0145)), {
			nt: sg(10, 4), nth: 4, w: () => 0.03, th: 0.002, up: (p) => V(0, 0, 1),
			col: (t, s) => (Math.abs(s) > 0.6 ? em[0] : Math.abs(s) > 0.45 ? em[1] : null),
		});
		part(pk, M.top, 0, 0, 0, torso);
		if (lod > 1) {
			for (const y of [0.52, 0.47, 0.42]) {
				const p = onBody(surf, V(0, y, 0.3), 0.017);
				part(prim(new THREE.SphereGeometry(0.0042, 8, 6), ratio(0xe9d9a8, opts.top)), M.top, p.x, p.y, p.z, torso);
			}
		}
	}
	if ((opts.shawl || pujari) && !opts.sari) {
		// the uparna over both shoulders, its ends hanging down the front
		const hex = opts.shawl ?? opts.sash;
		M.shawl = hex === opts.sash ? M.sash : clothMat(hex, lod);
		const bc = ratio(border, hex);
		const pts = [V(0.085, 0.1, 0.3), V(0.09, 0.3, 0.3), V(0.1, 0.46, 0.25), V(0.11, 0.565, 0.0), V(0.06, 0.55, -0.2), V(0, 0.53, -0.2), V(-0.06, 0.55, -0.2), V(-0.11, 0.565, 0.0), V(-0.1, 0.46, 0.25), V(-0.09, 0.3, 0.3), V(-0.085, 0.1, 0.3)].map((v) => onBody(surf, v, clothOff + 0.006));
		pts[0].z += 0.012;
		pts[pts.length - 1].z += 0.012;
		const g = ribbon(pts, {
			nt: sg(44, 12), lod, th: 0.007, up,
			w: (t) => 0.085 + 0.025 * (Math.abs(t - 0.5) * 2) ** 3,
			fold: (t, s) => (lod ? 0.005 : 0.002) * Math.sin(s * 4 + t * 25),
			col: (t, s) => (Math.abs(s) > 0.8 || t < 0.04 || t > 0.96 ? bc : null),
		});
		J.shawl = part(g, M.shawl, 0, 0, 0, torso);
	}
	if (opts.janeu ?? pujari) {
		// the sacred thread, over the left shoulder and under the right arm
		const pts = [V(0.11, 0.565, 0.0), V(0.06, 0.44, 0.2), V(-0.03, 0.3, 0.2), V(-0.12, 0.16, 0.2), V(-0.175, 0.07, 0.08), V(-0.17, 0.08, -0.1), V(-0.08, 0.24, -0.2), V(0.03, 0.42, -0.2), V(0.1, 0.54, -0.08)].map((v) => onBody(surf, v, (opts.shawl || pujari ? 0.004 : clothOff) + 0.0025));
		const g = ribbon(pts, { closed: true, round: true, nt: sg(48, 16), nth: 4, w: () => (lod ? 0.0045 : 0.007), th: lod ? 0.0035 : 0.006, up });
		J.janeu = part(g, new THREE.MeshStandardMaterial({ color: 0xf2e6c4, roughness: 0.9, vertexColors: true }), 0, 0, 0, torso);
	}
	if (!opts.sari && !(opts.shawl || pujari) && lod) {
		// the free end of the angavastram, down the back from the shoulder
		const end = joint(0.125, 0.54, -0.035, torso);
		const pts = [V(0.125, 0.54, -0.035), V(0.12, 0.44, -0.2), V(0.11, 0.26, -0.2), V(0.105, 0.08, -0.2)].map((v) => onBody(surf, v, clothOff + 0.012).sub(end.position));
		pts[3].z -= 0.01;
		const g = ribbon(pts, { nt: sg(16, 6), lod, th: 0.006, up: (p) => V(0, 0.2, -1), w: (t) => lerp(0.075, 0.09, t), fold: (t, s) => 0.004 * Math.sin(s * 4 + t * 8), col: (t, s) => (t > 0.93 || Math.abs(s) > 0.8 ? ratio(border, opts.sash) : null) });
		part(g, M.sash, 0, 0, 0, end);
		J.sashEnd = end;
	}
	if (opts.bag) {
		// a cloth jhola on the right hip, its strap over the right shoulder
		const bh = opts.bagColor ?? 0xc9b48a;
		const st = [ratio(bh, bh, 0.72), ratio(0x9a2a1e, bh), ratio(bh, bh, 1.12)];
		const bg = tube([[0.11, 0.0, 0.0], [0.105, 0.02, 0.08], [0.09, 0.028, 0.105], [-0.05, 0.032, 0.112], [-0.11, 0.03, 0.106], [-0.125, 0.018, 0.08], [-0.13, 0, 0]], sg(16, 6), sg(2, 1), (p, th, r) => {
			const yb = p[1];
			let c = null;
			if (yb > 0.06) c = st[1];
			else if (Math.abs(frac(yb * 22) - 0.5) < 0.12) c = st[0];
			else if (Math.abs(frac(yb * 22 + 0.3) - 0.5) < 0.06) c = st[2];
			return [p[0] * 1.15, p[1], p[2] * 1.05 + 0.004 * Math.sin(p[1] * 60), c];
		});
		const bag = part(bg, M.bag, -0.205, -0.08, 0.06, torso);
		bag.rotation.set(0.04, 0.75, 0.06);
		const a = V(-0.205, 0.03, 0.15), b = V(-0.205, 0.03, -0.02);
		const pts = [a, onBody(surf, V(-0.17, 0.32, 0.3), clothOff + 0.01), onBody(surf, V(-0.14, 0.565, 0.0), clothOff + 0.014), onBody(surf, V(-0.17, 0.32, -0.3), clothOff + 0.01), b];
		part(ribbon(pts, { nt: sg(26, 10), sec: lod ? [-1, -0.72, -0.66, 0.66, 0.72, 1] : [-1, 1], w: () => 0.03, th: 0.004, up: (p) => (p.y < 0.1 ? V(-1, 0, 0) : up(p)), col: (t, s) => (Math.abs(s) > 0.7 ? st[1] : null) }), M.bag, 0, 0, 0, torso);
	}
	if (opts.staff) {
		// the staff is held in the right hand, its foot near the ground
		const sg2 = tube([[0.875, 0, 0], [0.87, 0.021, 0.021], [0.85, 0.026, 0.026], [0.82, 0.019, 0.019], [0.6, 0.017, 0.017], [-0.6, 0.019, 0.019], [-0.84, 0.02, 0.02], [-0.86, 0.022, 0.022], [-0.875, 0.012, 0.012], [-0.878, 0, 0]], 10, 1, (p, th, r) => {
			const y = p[1], knot = 1 + 0.12 * gs(y - 0.3, 0.02) + 0.1 * gs(y + 0.2, 0.025);
			const c = y < -0.83 || (y > 0.79 && y < 0.81) ? ratio(0xb88a3e, 0x6b4a2a) : y > 0.81 ? [1.25, 1.2, 1.15] : null;
			return [p[0] * knot, y, p[2] * knot, c];
		});
		const st = part(sg2, M.wood, 0, -0.5, 0.0, J.handR);
		st.userData.staff = true;
		J.staff = st;
	}
	if (opts.diya) {
		const clay = mat(0xa9532a, { roughness: 0.8 });
		const d = joint(0, 0.0, 0.045, J.handL);
		const bowl = part(prim(new THREE.SphereGeometry(0.06, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), clay, 0, 0.02, 0, d);
		bowl.scale.y = 0.55;
		part(prim(new THREE.TorusGeometry(0.058, 0.006, 6, 24)), clay, 0, 0.02, 0, d).rotation.x = Math.PI / 2;
		const flame = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 10), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
		flame.position.y = 0.06;
		d.add(flame);
		const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb547, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
		halo.position.y = 0.06;
		halo.scale.setScalar(0.5);
		halo.renderOrder = 7;
		d.add(halo);
		J.diya = d;
		J.flame = flame;
		J.halo = halo;
	}
	J.hem = opts.sari ? null : torso.children[0];
	return J;
}

// The face, hair and headdress, with the marks on the forehead.
function buildHead(J, head, opts, M, c) {
	const { lod, sg, fem, pujari, elder, hairHex, skinHex } = c;
	const shaven = pujari;
	const hairline = HAIRLINE[fem ? "f" : "m"];
	// the skull and face; vertex colours warm the lips and cheeks and shade the sockets
	{
		const g = prim(new THREE.SphereGeometry(1, sg(44, 14), sg(34, 10)));
		const a = g.attributes.position, cl = g.attributes.color, p = [0, 0, 0];
		const lipC = ratio(new THREE.Color(skinHex).lerp(new THREE.Color(0x7a2a2c), 0.3).multiplyScalar(0.82), skinHex);
		const browC = ratio(hairHex, skinHex);
		const stub = ratio(new THREE.Color(skinHex).lerp(new THREE.Color(0x2a2a30), 0.42), skinHex);
		for (let i = 0; i < a.count; i++) {
			headPt(a.getX(i), a.getY(i), a.getZ(i), p);
			a.setXYZ(i, p[0], p[1], p[2]);
			const [x, y, z] = p, fr = z > 0 ? 1 : 0;
			let col = [1, 1, 1];
			for (const k of [-1, 1]) {
				col = mixc(col, [0.8, 0.74, 0.74], 0.7 * gs(x - k * 0.034, 0.014) * gs(y - 0.019, 0.011) * fr);
				col = mixc(col, [1.06, 0.95, 0.94], 0.6 * gs(x - k * 0.05, 0.022) * gs(y + 0.02, 0.02) * fr);
			}
			col = mixc(col, lipC, 0.9 * gs(x, 0.02) * gs(y + 0.049, 0.008) * fr);
			if (!lod) {
				for (const k of [-1, 1]) col = mixc(col, browC, 0.85 * gs(x - k * 0.034, 0.016) * gs(y - 0.037, 0.006) * fr);
				for (const k of [-1, 1]) col = mixc(col, [0.25, 0.22, 0.2], 0.9 * gs(x - k * 0.033, 0.009) * gs(y - 0.017, 0.006) * fr);
			}
			if (opts.beard) {
				const phi = Math.atan2(x, z), e = lineAt(HAIRLINE.beard, phi);
				col = mixc(col, ratio(new THREE.Color(skinHex).lerp(new THREE.Color(opts.beard), 0.45), skinHex), 0.7 * sstep(e + 0.014, e, y) * (Math.abs(phi) < 1.4 ? 1 : 0));
			}
			if (shaven) {
				const phi = Math.atan2(x, z), m = sstep(lineAt(hairline, phi) - 0.002, lineAt(hairline, phi) + 0.01, y);
				col = mixc(col, stub, m * 0.8);
			}
			cl.setXYZ(i, col[0], col[1], col[2]);
		}
		g.computeVertexNormals();
		weldGrid(g, sg(34, 10), sg(44, 14), false);
		part(g, M.skin, 0, 0, 0, head);
	}
	// nose: the bridge, the tip and the wings of the nostrils
	{
		const K = [[0.031, 0.0, 0.0], [0.027, 0.0058, 0.0028], [0.014, 0.0068, 0.0068], [-0.002, 0.0082, 0.0128], [-0.012, 0.0102, 0.0192], [-0.0185, 0.0118, 0.0226], [-0.024, 0.0158, 0.0168], [-0.0285, 0.012, 0.0078], [-0.0305, 0, 0.0]];
		const fk = fem ? 0.9 : 1;
		const R = rings(K, sg(3, 1));
		const nostril = [0.32, 0.26, 0.24];
		const g = loft(R.length - 1, sg(14, 6), (t, u, i) => {
			const r = R[i], th = u * TAU, s = Math.sin(th), co = Math.cos(th);
			const W = Math.max(0, r[1]) * fk, P = Math.max(0, r[2]) * fk, y = r[0];
			const x = W * s, zs = faceAt(x, y)[2];
			const z = co > 0 ? zs - 0.003 + (P + 0.003) * co ** 0.7 : zs - 0.003 + 0.003 * co;
			const nos = y < -0.022 && co < 0.55 && co > -0.2 && Math.abs(x) > 0.002 && Math.abs(x) < 0.012;
			return [x, y, z, nos ? nostril : null];
		});
		part(g, M.skin, 0, 0, 0, head);
	}
	// ears
	for (const k of [-1, 1]) {
		const g = prim(new THREE.SphereGeometry(1, sg(12, 6), sg(10, 5)));
		const a = g.attributes.position, cl = g.attributes.color;
		for (let i = 0; i < a.count; i++) {
			let x = a.getX(i), y = a.getY(i), z = a.getZ(i);
			const rim = 1 - Math.min(1, y * y + z * z);
			if (x > 0) x -= 0.55 * rim;
			x *= 0.011;
			y *= 0.03 * (fem ? 0.9 : 1);
			z *= 0.018;
			if (y < -0.015) z += 0.003;
			if (a.getX(i) > 0 && rim > 0.35) cl.setXYZ(i, 0.78, 0.7, 0.68);
			a.setXYZ(i, x * k, y, z);
		}
		orient(g);
		g.computeVertexNormals();
		const ear = part(g, M.skin, k * 0.0945, 0.006, -0.014, head);
		ear.rotation.set(0, -k * 0.42, k * -0.1);
		if (fem && opts.jewels !== false && lod) {
			const gc = ratio(GOLD, skinHex);
			part(prim(new THREE.SphereGeometry(0.0035, 6, 4), gc), M.skin, k * 0.1, -0.024, -0.008, head);
			const jh = prim(new THREE.ConeGeometry(0.0062, 0.009, 8, 1, true), gc);
			part(jh, M.skin, k * 0.1, -0.032, -0.008, head);
		}
	}
	// eyes: a white with a brown iris, set in under the lids
	const iris = elder ? 0x3a2c22 : 0x2c1a10;
	for (const k of [-1, 1]) {
		const f = faceAt(k * 0.0335, 0.017), n = faceNormal(k * 0.0335, 0.017);
		const re = 0.0128, cpos = V(f[0], f[1], f[2]).addScaledVector(n, -re * 0.5);
		const g = prim(new THREE.SphereGeometry(re, sg(16, 6), sg(12, 4)));
		g.rotateX(Math.PI / 2);
		const a = g.attributes.position, cl = g.attributes.color;
		const sc = ratio(0xe8dfd3, skinHex), ic = ratio(iris, skinHex), pc = ratio(0x070504, skinHex), lc = ratio(0x1a120c, skinHex), vein = ratio(0xd2b4a8, skinHex);
		const gaze = V(-k * 0.06, -0.04, 1).normalize();
		for (let i = 0; i < a.count; i++) {
			const ang = V(a.getX(i), a.getY(i), a.getZ(i)).normalize().angleTo(gaze);
			const col = ang > 1.1 ? vein : sc;
			cl.setXYZ(i, col[0], col[1], col[2]);
		}
		const eye = part(g, M.eye, cpos.x, cpos.y, cpos.z, head);
		eye.castShadow = false;
		// the iris and pupil: a cap on the front of the eye, turned to the gaze
		const ig = prim(new THREE.SphereGeometry(re * 1.012, sg(18, 8), lod ? 5 : 3, 0, TAU, 0, 0.44));
		const ia = ig.attributes.position, icl = ig.attributes.color;
		for (let i = 0; i < ia.count; i++) {
			const ang = Math.acos(clamp(ia.getY(i) / (re * 1.012), -1, 1));
			const col = ang < 0.18 ? pc : ang > 0.4 ? lc : mixc(ic, pc, 0.3 * (1 - (ang - 0.18) / 0.22));
			icl.setXYZ(i, col[0], col[1], col[2]);
		}
		ig.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), gaze));
		part(ig, M.eye, cpos.x, cpos.y, cpos.z, head).castShadow = false;
		if (lod) {
			// upper and lower lids; the lash line is dark
			const lid = (t0, t1, r, dark) => {
				const lg = prim(new THREE.SphereGeometry(r, sg(16, 6), sg(6, 3), 0, TAU, t0, t1 - t0));
				const la = lg.attributes.position, lc2 = lg.attributes.color;
				for (let i = 0; i < la.count; i++) {
					const v = V(la.getX(i), la.getY(i), la.getZ(i)).normalize();
					const edge = Math.abs(Math.acos(clamp(v.y, -1, 1)) - (dark > 0 ? t1 : t0));
					if (edge < 0.18) lc2.setXYZ(i, ...mixc(ONE, ratio(0x140e0a, skinHex), dark * (1 - edge / 0.18)));
				}
				return lg;
			};
			const ul = part(lid(0, 1.2, re * 1.1, 1), M.skin, cpos.x, cpos.y, cpos.z, head);
			ul.rotation.set(0.04, 0, k * 0.08);
			const ll = part(lid(2.2, Math.PI, re * 1.06, 0.3), M.skin, cpos.x, cpos.y, cpos.z, head);
			ll.rotation.set(0.1, 0, 0);
			// brows
			const bk = fem ? 0.75 : 1;
			const brow = faceLine([[k * 0.012, 0.0345], [k * 0.026, 0.0395], [k * 0.041, 0.0398], [k * 0.056, 0.0345]], { nt: sg(10, 4), w: (t) => lerp(0.0052, 0.0022, t) * bk, th: 0.001, lift: 0.0008, sec: [-1, -0.6, 0, 0.6, 1], col: (t, s) => (hairHex === HAIR ? [2.3, 2.0, 1.8] : null) });
			part(brow, M.brow, 0, 0, 0, head);
		}
	}
	// lips
	if (lod) {
		const lc = ratio(new THREE.Color(skinHex).lerp(new THREE.Color(0x7a2a2c), fem ? 0.42 : 0.26).multiplyScalar(fem ? 0.78 : 0.8), skinHex);
		for (const [y, w, h, d, bow] of [[-0.0435, 0.0182, 0.0046, 0.005, 1], [-0.0522, 0.0162, 0.0058, 0.0056, 0]]) {
			const f = faceAt(0, y), n = faceNormal(0, y);
			const g = prim(new THREE.SphereGeometry(1, sg(16, 6), sg(8, 4)), lc);
			const a = g.attributes.position;
			for (let i = 0; i < a.count; i++) {
				const x = a.getX(i), yy = a.getY(i), z = a.getZ(i);
				const back = 1 - 0.55 * (x * x);
				a.setXYZ(i, x * w, yy * h + (bow ? 0.0012 * gs(x * w, 0.004) * (yy > 0 ? 1 : 0) - 0.0012 * (x * x) : 0.0008 * (x * x)), z * d * back - 0.0055 * x * x);
			}
			g.computeVertexNormals();
			part(g, M.skin, f[0] - n.x * 0.0022, f[1], f[2] - n.z * 0.0022, head);
		}
	}
	// hair, a turban or the sari's veil
	const kind = opts.head || "hair";
	if (kind === "turban") {
		const off = (p) => 0.017 + 0.024 * sstep(0.02, 0.112, p[1]);
		const shade = (p, phi, m) => [1, 1, 1].map((v) => v * (0.82 + 0.18 * m));
		part(headShell(sg(36, 12), sg(22, 8), Math.PI * 0.62, HAIRLINE.turban, off, shade), M.head, 0, 0, 0, head);
		// the wraps: twisted bands climbing from the brow to the back of the head
		const n = lod ? 4 : 3;
		for (let w = 0; w < n; w++) {
			const yf = 0.064 + w * 0.0175, yb = 0.022 + w * 0.026, pts = [];
			for (let i = 0; i < 16; i++) {
				const phi = (i / 16) * TAU, y = lerp(yf, yb, (1 - Math.cos(phi)) / 2);
				const p = headRing(phi, y), nn = headN(p), o = off(p) + 0.003;
				pts.push(V(p[0], p[1], p[2]).addScaledVector(V(nn.x, nn.y * 0.3, nn.z).normalize(), o));
			}
			const sh = 0.86 + 0.14 * (w % 2);
			const g = ribbon(pts, { closed: true, round: true, nt: sg(40, 14), nth: sg(8, 5), th: 0.012, w: () => 0.024, up: (p) => V(p.x, 0, p.z), twist: (t) => t * TAU * 3 + w, col: (t, s, cc) => [sh * (0.86 + 0.14 * cc), sh * (0.86 + 0.14 * cc), sh * (0.86 + 0.14 * cc)] });
			part(g, M.head, 0, 0, 0, head);
		}
		// the fold where the wraps cross over the forehead
		const fp = [[-0.045, 0.072], [0, 0.095], [0.05, 0.13]].map(([x, y]) => {
			const p = headRing(Math.atan2(x, 0.09), y), nn = headN(p);
			return V(p[0], p[1], p[2]).addScaledVector(nn, off(p) + 0.01);
		});
		part(ribbon(fp, { nt: sg(10, 4), nth: 6, th: 0.01, w: () => 0.026, up: (p) => V(p.x, p.y * 0.5, p.z) }), M.head, 0, 0, 0, head);
	} else if (!shaven) {
		const fhl = hairline;
		const vol = fem ? (p) => 0.006 + 0.01 * sstep(0.0, 0.1, p[1]) - 0.003 * gs(p[0], 0.005) * (p[2] > 0 ? 1 : 0) * sstep(0.04, 0.09, p[1]) : (p) => 0.0045 + 0.008 * sstep(-0.02, 0.1, p[1]) + 0.002 * (p[2] < 0 ? 1 : 0);
		const R = rand(Math.round(skinHex / 7) + 3);
		const strand = (p, phi, m) => {
			const v = 0.86 + 0.14 * R() + (fem ? 0.1 * Math.sin(phi * 40) : 0);
			const parting = fem && p[2] > 0 && p[1] > 0.06 ? 1 - 0.5 * gs(p[0], 0.004) : 1;
			return [v * parting, v * parting, v * parting];
		};
		part(headShell(sg(40, 12), sg(26, 8), Math.PI * (fem ? 0.82 : 0.75), fhl, vol, strand), M.hair, 0, 0, 0, head);
		if (fem && kind !== "veil") {
			// a bun at the nape with a string of jasmine round it
			const bun = part(prim(new THREE.SphereGeometry(0.036, sg(16, 6), sg(12, 5))), M.hair, 0, -0.03, -0.112, head);
			bun.scale.set(1.08, 0.86, 0.78);
			if (lod) {
				const jas = ratio(0xf4f0e2, hairHex), leaf = ratio(0x4c7a32, hairHex);
				const g = prim(new THREE.TorusGeometry(0.037, 0.0055, 5, 30));
				const cl = g.attributes.color;
				for (let i = 0; i < cl.count; i++) cl.setXYZ(i, ...(Math.floor(i / 6) % 5 === 0 ? leaf : jas));
				const ring = part(g, M.hair, 0, -0.03, -0.122, head);
				ring.scale.set(1.05, 0.86, 1);
			}
		}
	} else {
		// a shaven head with the shikha at the crown
		const sp = headRing(Math.PI, 0.094), n = headN(sp);
		const base = V(sp[0], sp[1], sp[2]).addScaledVector(n, 0.004);
		part(capsule(base, base.clone().add(V(0, 0.012, -0.012)), 0.012, 0.009, sg(10, 5)), M.hair, 0, 0, 0, head);
		part(capsule(base.clone().add(V(0, 0.012, -0.012)), base.clone().add(V(0, -0.012, -0.04)), 0.006, 0.0025, sg(8, 4)), M.hair, 0, 0, 0, head);
	}
	if (kind === "veil") {
		// the pallu drawn over the head, framing the face, falling to the shoulders
		const bc = ratio(c.border, opts.headColor ?? opts.sash);
		const off = (p) => 0.02 + 0.012 * sstep(0.0, 0.11, p[1]) + 0.012 * sstep(-0.02, -0.11, p[1]);
		part(headShell(sg(36, 12), sg(26, 8), Math.PI * 0.96, HAIRLINE.veil, off, null, 0.02), M.head, 0, 0, 0, head);
		if (lod) {
			const ep = [];
			for (let i = 0; i <= 14; i++) {
				const phi = lerp(-1.2, 1.2, i / 14), y = lineAt(HAIRLINE.veil, phi) + 0.012, q = headRing(phi, y), n = headN(q);
				ep.push(V(q[0], q[1], q[2]).addScaledVector(n, off(q) * 0.75));
			}
			part(ribbon(ep, { nt: sg(30, 10), th: 0.003, w: () => 0.011, up: (p) => headN([p.x, p.y, p.z]), col: () => bc }), M.head, 0, 0, 0, head);
		}
		const dr = loft(sg(10, 4), sg(30, 10), (t, u) => {
			const a = lerp(-2.25, 2.25, u) + Math.PI, y = lerp(-0.04, -0.27, t);
			const r = lerp(0.105, 0.215, sstep(0, 1, t) ** 0.8), rz = lerp(0.112, 0.17, t);
			const fold = 1 + 0.04 * Math.sin(u * 30) * t;
			const x = Math.sin(a) * r * fold, z = Math.cos(a) * rz * fold - 0.025 - 0.01 * t;
			return [x, y, z];
		});
		part(outward(dr), M.head, 0, 0, 0, head);
	}
	// beard and moustache
	if (opts.beard) {
		M.beard = M.beard || hairMat(opts.beard, lod);
		const R = rand(17);
		const off = (p) => 0.004 + 0.007 * sstep(-0.05, -0.11, p[1]) * (p[2] > 0.02 ? 1 : 0.4) + 0.0015 * R();
		const fuzz = () => {
			const v = 0.82 + 0.3 * R();
			return [v, v, v];
		};
		part(headShell(sg(64, 12), sg(32, 8), Math.PI, HAIRLINE.beard, off, fuzz, 0.02, Math.PI * 0.38), M.beard, 0, 0, 0, head);
	}
	const mo = opts.moustache ?? opts.beard;
	if (mo && lod) {
		M.mo = M.beard && mo === opts.beard ? M.beard : hairMat(mo, lod);
		const g = faceLine([[-0.025, -0.047], [-0.015, -0.0395], [0, -0.037], [0.015, -0.0395], [0.025, -0.047]], { nt: sg(16, 6), w: (t) => 0.004 + 0.0068 * Math.sin(Math.PI * t), th: 0.005, lift: 0.0042, sec: [-1, -0.7, -0.3, 0, 0.3, 0.7, 1], fold: (t, s) => 0.0015 * Math.sin(s * 9 + t * 40) });
		part(g, M.mo, 0, 0, 0, head);
	}
	// marks on the forehead
	const mark = opts.mark ?? (pujari ? "tripundra" : fem ? "bindi" : "tilak");
	const tilakM = mat(TILAK, { emissive: 0x400800, vertexColors: true });
	const ash = () => new THREE.MeshStandardMaterial({ color: 0xebe6dc, roughness: 1, vertexColors: true });
	const line = (pts, w, m, lift = 0.0011) => part(faceLine(pts, { nt: sg(10, 4), nth: 4, w: typeof w === "function" ? w : () => w, th: 0.0012, lift }), m, 0, 0, 0, head);
	if (mark === "tilak") line([[0, 0.031], [0, 0.05], [0, 0.07]], (t) => lerp(0.0052, 0.0072, t), tilakM);
	else if (mark === "bindi") {
		const f = faceAt(0, 0.046), n = faceNormal(0, 0.046);
		const g = prim(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0012, sg(14, 6)));
		g.rotateX(Math.PI / 2);
		const b = part(g, tilakM, f[0] + n.x * 0.0008, f[1] + n.y * 0.0008, f[2] + n.z * 0.0008, head);
		b.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n));
	} else if (mark === "tripundra") {
		const a = ash();
		for (const y of [0.049, 0.06, 0.071]) line([[-0.04, y - 0.004], [-0.02, y], [0, y + 0.001], [0.02, y], [0.04, y - 0.004]], 0.0042, a);
		const f = faceAt(0, 0.06), n = faceNormal(0, 0.06);
		const d = part(prim(new THREE.SphereGeometry(0.0034, 8, 6)), tilakM, f[0] + n.x * 0.0012, f[1], f[2] + n.z * 0.0012, head);
		d.scale.set(1, 1, 0.35);
	} else if (mark === "namam" || mark === "urdhva") {
		const outer = mark === "urdhva" ? new THREE.MeshStandardMaterial({ color: 0xf0d68a, roughness: 0.9, vertexColors: true }) : ash();
		line([[-0.012, 0.088], [-0.0115, 0.06], [-0.009, 0.037], [0, 0.0325], [0.009, 0.037], [0.0115, 0.06], [0.012, 0.088]], 0.0055, outer);
		line([[0, 0.037], [0, 0.06], [0, 0.086]], 0.0042, mark === "urdhva" ? tilakM : mat(0xe03a1a, { emissive: 0x3a0800, vertexColors: true }), 0.0016);
	}
	if (opts.glasses && lod) {
		const metal = new THREE.MeshStandardMaterial({ color: 0x3a3028, metalness: 0.6, roughness: 0.35 });
		for (const k of [-1, 1]) {
			const f = faceAt(k * 0.034, 0.017);
			const r = part(new THREE.TorusGeometry(0.0165, 0.0011, 4, 24), metal, f[0], f[1], f[2] + 0.011, head);
			r.castShadow = false;
			const arm = capsule(V(k * 0.05, 0.019, f[2] + 0.009), V(k * 0.09, 0.02, -0.02), 0.0009, 0.0009, 4, 1);
			part(arm, metal, 0, 0, 0, head);
		}
		part(capsule(V(-0.018, 0.02, faceAt(0, 0.02)[2] + 0.009), V(0.018, 0.02, faceAt(0, 0.02)[2] + 0.009), 0.0009, 0.0009, 4, 1), metal, 0, 0, 0, head);
	}
	if (fem && opts.jewels !== false && lod) {
		// a small gold stud in the left nostril
		const f = faceAt(0.012, -0.022);
		part(prim(new THREE.SphereGeometry(0.0022, 6, 4), ratio(GOLD, skinHex)), M.skin, f[0] + 0.004, f[1], f[2] + 0.009, head);
	}
}

// ---------- poses (angles in radians) ----------
// Optional keys beyond the old ones: ankleL/R (the ankle's bend; by default the soles stay near level, and a foot
// under a kneeling or prone body rests on its tucked toes), footL/R (the foot's pitch to the ground instead: 0 sole
// level, positive toes down), pelvisX, pelvisY, pelvisZ (the hips' pitch forward, yaw and roll; pelvisX = PI/2 lays
// the body face down), shift (the hips forward of the spot where the feet stand, m), sway (hips sideways), tilt
// (torso roll), headTilt, hipLy/R (the thigh's turn about its own length, as when sitting cross-legged), and seat (the height under the hips of a seat the cloth rests on, m above the ground).
const TOE = 1.25; // the foot's pitch on tucked toes
const _pv = V();
function kneeHeight(J, S) {
	const hip = J["hip" + S];
	J.hips.updateMatrix();
	hip.updateMatrix();
	return _pv.set(0, -0.46, 0).applyMatrix4(hip.matrix).applyMatrix4(J.hips.matrix).y;
}
function pose(J, p) {
	const set = (j, x = 0, y = 0, z = 0) => j && j.rotation.set(x, y, z);
	set(J.hipL, p.hipL ?? 0, p.hipLy ?? 0, p.hipLz ?? 0);
	set(J.hipR, p.hipR ?? 0, p.hipRy ?? 0, p.hipRz ?? 0);
	set(J.kneeL, p.kneeL ?? 0);
	set(J.kneeR, p.kneeR ?? 0);
	set(J.shL, p.shL ?? 0, p.shLy ?? 0, p.shLz ?? 0.08);
	set(J.shR, p.shR ?? 0, p.shRy ?? 0, p.shRz ?? -0.08);
	set(J.elL, p.elL ?? 0, p.elLy ?? 0);
	set(J.elR, p.elR ?? 0, p.elRy ?? 0);
	set(J.torso, p.lean ?? 0, p.twist ?? 0, p.tilt ?? 0);
	set(J.head, p.nod ?? 0, p.look ?? 0, p.headTilt ?? 0);
	J.hips.position.set(p.sway ?? 0, 0.95 + (p.bob ?? 0), p.shift ?? 0);
	J.hips.rotation.set(p.pelvisX ?? 0, p.pelvisY ?? 0, p.pelvisZ ?? 0);
	for (const S of ["L", "R"]) {
		const a = J["ankle" + S];
		if (!a) continue;
		const sum = (p.pelvisX ?? 0) + (p["hip" + S] ?? 0) + (p["knee" + S] ?? 0);
		let x = p["ankle" + S];
		if (x === undefined && p["foot" + S] !== undefined) x = p["foot" + S] - sum;
		if (x === undefined) {
			x = -sum * (1 - sstep(0.55, 1.2, Math.abs(sum)));
			// a shin lying back along the floor: the foot stands on its tucked toes
			const w = sstep(1.1, 1.4, sum) * sstep(0.3, 0.15, kneeHeight(J, S));
			if (w > 0) x = lerp(x, TOE - sum, w);
		}
		a.rotation.set(x, 0, 0);
	}
	wrists(J);
	drape(J, p);
}
// When the hands meet (namaste, and the like) the wrists bend so the fingers point up, palm to palm.
const _qs = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _q0 = new THREE.Quaternion();
const WRIST = V(0, 0.036, 0), UPF = V(0, 1, 0.3).normalize();
function wrists(J) {
	if (!J.palmL || !J.palmR) return;
	const H = [];
	for (const S of ["L", "R"]) {
		const sh = J["sh" + S], el = J["el" + S], h = J["hand" + S];
		_qs.setFromEuler(sh.rotation);
		_qe.setFromEuler(el.rotation);
		const q = _qs.clone().multiply(_qe);
		const pos = h.position.clone().applyQuaternion(_qe).add(el.position).applyQuaternion(_qs).add(sh.position);
		H.push({ q, pos, el, m: J["palm" + S] });
	}
	const near = 1 - sstep(0.07, 0.16, H[0].pos.distanceTo(H[1].pos));
	for (const h of H) {
		const w = near * sstep(0.7, 1.3, -h.el.rotation.x);
		if (w < 1e-3) {
			h.m.quaternion.identity();
			h.m.position.set(0, 0, 0);
			continue;
		}
		const F = V(0, -1, 0).applyQuaternion(h.q);
		_qa.setFromUnitVectors(F, UPF);
		const local = h.q.clone().invert().multiply(_qa).multiply(h.q);
		h.m.quaternion.copy(_q0.identity().slerp(local, w));
		h.m.position.copy(WRIST).sub(WRIST.clone().applyQuaternion(h.m.quaternion));
	}
}

// ---------- the drape ----------
// Every hanging point of the cloth is laid out from the point on the waist it hangs from, in short steps: each
// step heads the way gravity pulls the cloth (its rest direction turned to the pose's down), slides over the thighs,
// shins, seat and chest instead of passing through them, and lies along the ground (or a seat) where it reaches
// it, spreading the way it fell. So a kurta lies over the lap when seated, over the backs of the legs when prone,
// and pools on the floor behind a kneeling body. Held points follow the waist, blending from the hips to the torso.
const DS = 0.035, BEND = 0.3;
const Y1 = V(0, 1, 0), DOWN = V(0, -1, 0);
const _qT = new THREE.Quaternion(), _qTi = new THREE.Quaternion(), _qH = new THREE.Quaternion(), _qG = new THREE.Quaternion(), _qk = new THREE.Quaternion();
const _A = V(), _P = V(), _Q = V(), _D = V(), _DP = V(), _DR = V(), _T = V(), _U = V(), _N = V(), _W = V(), _C = V();
const CAPS = Array.from({ length: 8 }, () => ({ a: V(), b: V(), r: 0, gap: false }));
const ELL = [{ c: V(), r: V(), q: null, qi: null }, { c: V(), r: V(), q: new THREE.Quaternion(), qi: new THREE.Quaternion() }];
const CS = { caps: CAPS, n: 0, ell: ELL, up: V(), floor: 0 };
function colliders(J, p) {
	const R = J.legR || { thigh: 0.095, knee: 0.092, dl: 0.24 };
	let n = 0;
	const kn = [];
	for (const S of ["L", "R"]) {
		const hip = J["hip" + S], knee = J["knee" + S];
		if (!hip) continue;
		_qk.setFromEuler(hip.rotation);
		const k = V(0, -0.46, 0).applyQuaternion(_qk).add(hip.position);
		kn.push(k);
		// thigh (starting a little down the leg: the joint itself is inside the seat), knee to the dhoti's hem, shin
		let c = CAPS[n++];
		c.a.set(0, -0.06, 0).applyQuaternion(_qk).add(hip.position);
		c.b.copy(k);
		c.r = R.thigh;
		c.gap = false;
		_qk.multiply(_q0.setFromEuler(knee.rotation));
		c = CAPS[n++];
		c.a.copy(k);
		c.b.set(0, -R.dl, 0).applyQuaternion(_qk).add(k);
		c.r = R.knee;
		c.gap = false;
		c = CAPS[n++];
		c.a.copy(CAPS[n - 2].b);
		c.b.set(0, -0.38, 0).applyQuaternion(_qk).add(k);
		c.r = 0.05;
		c.gap = false;
	}
	if (kn.length === 2) {
		// the fork of the legs, which an outer layer bridges rather than sinking into
		const c = CAPS[n++];
		c.a.set(0, -0.1, 0.02);
		c.b.copy(kn[0]).add(kn[1]).multiplyScalar(0.5);
		c.b.lerp(c.a, 0.25);
		c.r = 0.07;
		c.gap = true;
	}
	CS.n = n;
	// the seat of the dhoti (hips frame) and the chest (torso frame)
	const fem = !!J.fem;
	ELL[0].c.set(0, -0.03, -0.005);
	ELL[0].r.set(fem ? 0.175 : 0.165, 0.19, fem ? 0.122 : 0.112);
	ELL[1].q.copy(_qT);
	ELL[1].qi.copy(_qTi);
	ELL[1].c.set(0, 0.3, 0.0).applyQuaternion(_qT);
	ELL[1].r.set(0.16, 0.25, fem ? 0.115 : 0.105);
	// the ground, in the hips' frame
	CS.up.copy(Y1).applyQuaternion(_qH.clone().invert());
	const hy = J.hips.position.y;
	CS.floor = Math.max(-hy, p.seat !== undefined ? p.seat - hy : -1e9);
	// a seat or chest resting on the ground keeps the cloth under it
	for (const e of ELL) e.low = e.c.dot(CS.up) - CS.floor < Math.max(e.r.x, e.r.z) + 0.03;
}
function collide(q, clear, gap) {
	let hit = false;
	for (let i = 0; i < CS.n; i++) {
		const c = CAPS[i];
		if (c.gap && !gap) continue;
		_T.subVectors(c.b, c.a);
		const L2 = _T.lengthSq();
		const s = L2 > 0 ? clamp(_U.subVectors(q, c.a).dot(_T) / L2, 0, 1) : 0;
		_U.copy(c.a).addScaledVector(_T, s);
		_U.subVectors(q, _U);
		const d = _U.length(), R = c.r + clear;
		if (d < R) {
			if (d < 1e-6) _U.set(0, 0, 1);
			else _U.multiplyScalar(1 / d);
			// cloth caught between a limb and the ground stays there, under it, rather than squeezing out
			if (_U.dot(CS.up) < -0.35 && _C.copy(c.a).addScaledVector(_T, s).dot(CS.up) - CS.floor < R + 0.02) continue;
			q.addScaledVector(_U, R - d);
			_N.copy(_U);
			hit = true;
		}
	}
	for (const e of ELL) {
		_T.subVectors(q, e.c);
		if (e.q) _T.applyQuaternion(e.qi);
		const rx = e.r.x + clear, ry = e.r.y + clear, rz = e.r.z + clear;
		const k = Math.hypot(_T.x / rx, _T.y / ry, _T.z / rz);
		if (k < 1 && k > 1e-6 && !(e.low && _U.copy(q).sub(e.c).dot(CS.up) < 0)) {
			_T.multiplyScalar(1 / k);
			_U.set(_T.x / (rx * rx), _T.y / (ry * ry), _T.z / (rz * rz)).normalize();
			if (e.q) {
				_T.applyQuaternion(e.q);
				_U.applyQuaternion(e.q);
			}
			q.copy(e.c).add(_T);
			_N.copy(_U);
			hit = true;
		}
	}
	const h = q.dot(CS.up) - CS.floor - clear * 0.4;
	CS.fh = h < 0;
	if (h < 0) {
		q.addScaledVector(CS.up, -h);
		_N.copy(CS.up);
		hit = true;
	}
	return hit;
}
const DRAPE_KEYS = ["hipL", "hipR", "hipLy", "hipRy", "hipLz", "hipRz", "kneeL", "kneeR", "lean", "twist", "tilt", "pelvisX", "pelvisY", "pelvisZ", "bob", "shift", "sway", "seat"];
function drape(J, p) {
	if (!J.cloth || !J.cloth.length) return;
	let key = "";
	for (const k of DRAPE_KEYS) key += (p[k] ?? 0).toFixed(4) + ",";
	if (key === J.drapeKey) return;
	J.drapeKey = key;
	_qT.setFromEuler(J.torso.rotation);
	_qTi.copy(_qT).invert();
	_qH.setFromEuler(J.hips.rotation);
	colliders(J, p);
	const g = _W.copy(DOWN).applyQuaternion(_qH.clone().invert());
	_qG.setFromUnitVectors(DOWN, g);
	const tw = p.twist ?? 0;
	for (const c of J.cloth) {
		if (c.mesh.geometry !== c.geo) continue; // replaced by its owner
		const P = c.geo.attributes.position.array, n = c.len.length;
		for (let k = 0; k < n; k++) {
			const i = k * 3;
			if (c.len[k] < 0) {
				// held: hips to torso
				_Q.set(c.bh[i], c.bh[i + 1], c.bh[i + 2]);
				const w = c.wt[k];
				if (w > 0) _Q.lerp(_T.copy(_Q).applyQuaternion(_qT), w);
			} else {
				const w = c.wta[k];
				_A.set(c.a0[i], c.a0[i + 1], c.a0[i + 2]);
				if (w > 0) _A.lerp(_T.copy(_A).applyQuaternion(_qT), w);
				collide(_A, c.clear, c.gap);
				// the rest direction, turned with the waist; then turned to where down is now
				const r = tw * w, cs = Math.cos(r), sn = Math.sin(r), dx = c.d0[i], dz = c.d0[i + 2];
				_DR.set(dx * cs + dz * sn, c.d0[i + 1], -dx * sn + dz * cs);
				_DP.copy(_DR).applyQuaternion(_qG);
				_P.copy(_A);
				_D.copy(_DP);
				let left = c.len[k];
				while (left > 1e-6) {
					const st = Math.min(DS, left);
					_Q.copy(_P).addScaledVector(_D, st);
					for (let it = 0; it < 2; it++) {
						if (!collide(_Q, c.clear, c.gap)) break;
						_U.subVectors(_Q, _P);
						// along the ground the cloth carries on the way it hangs from the body, not just where it fell
						if (CS.fh) _U.addScaledVector(_T.copy(_DR).addScaledVector(CS.up, -_DR.dot(CS.up)), st * 1.5);
						let l = _U.length();
						if (l < st * 0.3) {
							// blocked head on: slide the way the cloth lies on the body
							_U.copy(_DR).addScaledVector(_N, -_DR.dot(_N));
							l = _U.length();
							if (l < 1e-4) break;
						}
						_Q.copy(_P).addScaledVector(_U, st / l);
					}
					collide(_Q, c.clear, c.gap);
					_U.subVectors(_Q, _P);
					const l = _U.length();
					if (l > 1e-6) _D.copy(_U).multiplyScalar(1 / l);
					_P.copy(_Q);
					left -= st;
					_D.lerp(_DP, BEND).normalize();
				}
				_Q.copy(_P);
			}
			if (c.frame === "torso") _Q.applyQuaternion(_qTi);
			_Q.applyMatrix4(c.Mi);
			P[i] = _Q.x;
			P[i + 1] = _Q.y;
			P[i + 2] = _Q.z;
		}
		c.geo.attributes.position.needsUpdate = true;
		c.geo.computeVertexNormals();
		// smooth the normals across seams where two points sit together at rest
		const N = c.geo.attributes.normal.array;
		if (!c.seams) {
			const m = new Map();
			c.seams = [];
			for (let k = 0; k < n; k++) {
				const h = `${Math.round(c.bh[k * 3] * 2e4)},${Math.round(c.bh[k * 3 + 1] * 2e4)},${Math.round(c.bh[k * 3 + 2] * 2e4)}`;
				if (m.has(h)) c.seams.push(m.get(h), k);
				else m.set(h, k);
			}
		}
		for (let s = 0; s < c.seams.length; s += 2) {
			const a = c.seams[s] * 3, b = c.seams[s + 1] * 3;
			const x = N[a] + N[b], y = N[a + 1] + N[b + 1], z = N[a + 2] + N[b + 2], l = Math.hypot(x, y, z) || 1;
			N[a] = N[b] = x / l;
			N[a + 1] = N[b + 1] = y / l;
			N[a + 2] = N[b + 2] = z / l;
		}
		c.geo.attributes.normal.needsUpdate = true;
	}
}
const NAMASTE = { shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, elLy: 0, shR: -0.55, shRz: -0.25, shRy: -0.5, elR: -1.55, nod: 0.18 };
const STAND = { shL: 0.05, shR: 0.05, nod: 0.05 };

// ---------- the gait ----------
// One leg through a stride; u = 0 at heel strike. pitch is the foot's angle to the ground (toe down positive).
const PITCH = [[0, -0.24], [0.08, 0], [0.4, 0], [0.6, 0.62], [0.72, 0.3], [0.88, -0.08], [1, -0.24]];
function legGait(ph) {
	const u = frac(ph / TAU);
	const hip = -0.06 - 0.33 * Math.cos(TAU * (u + 0.08));
	const knee = 0.05 + 0.2 * gs(u - 0.14, 0.07) + 1.0 * gs(u - 0.71, 0.115);
	let i = 0;
	while (u > PITCH[i + 1][0]) i++;
	const pitch = lerp(PITCH[i][1], PITCH[i + 1][1], sstep(PITCH[i][0], PITCH[i + 1][0], u));
	return { hip, knee, pitch, ankle: pitch - hip - knee, u };
}
// The lowest point of a foot below the hip, for a leg posed (hip, knee, foot pitch).
function footLow(hip, knee, pitch) {
	const ky = -0.46 * Math.cos(hip), kz = -0.46 * Math.sin(hip);
	const ay = ky - 0.4 * Math.cos(hip + knee), az = kz - 0.4 * Math.sin(hip + knee);
	const c = Math.cos(pitch), s = Math.sin(pitch), yb = SOLE_Y - 0.012;
	return Math.min(ay + yb * c - -0.062 * s, ay + yb * c - 0.19 * s, ay + yb * c - 0.125 * s);
}

// The legs through a stride at phase ph (one cycle every two steps), for figures walking on flat ground:
// hips, knees, the feet's pitch to the ground, and the bob that keeps the lower foot on the ground.
export function stride(ph) {
	const L = legGait(ph), R = legGait(ph + Math.PI);
	const low = Math.min(footLow(L.hip, L.knee, L.pitch), footLow(R.hip, R.knee, R.pitch));
	return { hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, footL: L.pitch, footR: R.pitch, bob: -0.95 - low + 0.003 };
}

// ---------- reaching ----------
// Turns an arm (side "L" or "R") so the point pt of its hand (in the hand's frame; the middle of the palm by
// default) reaches target (world). The rest of the pose must already be applied and the root's matrices current.
// Returns { sh, shz, el, err }: the shoulder's swing forward and out, the elbow's bend, and the miss in metres.
const PALM = V(0, -0.045, 0.004);
const _rm = new THREE.Matrix4(), _rt = V(), _rf = V(), _rj = [V(), V(), V()], _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _re = new THREE.Euler(), _rh = V();
export function reach(J, S, target, p = {}, pt = PALM) {
	const sh = J["sh" + S], el = J["el" + S], hand = J["hand" + S];
	sh.parent.updateWorldMatrix(true, false);
	_rt.copy(target).applyMatrix4(_rm.copy(sh.parent.matrixWorld).invert()).sub(sh.position);
	const shy = sh.rotation.y, ely = el.rotation.y, L1 = -el.position.y, L2 = -hand.position.y;
	const fk = (x, z, e, o) => {
		_rq2.setFromEuler(_re.set(e, ely, 0));
		o.copy(pt).add(_rh.set(0, -L2, 0)).applyQuaternion(_rq2).add(_rh.set(0, -L1, 0));
		return o.applyQuaternion(_rq.setFromEuler(_re.set(x, shy, z)));
	};
	const lim = S === "L" ? [-1.3, 1.1] : [-1.1, 1.3];
	let x = p["sh" + S] ?? sh.rotation.x, z = p["sh" + S + "z"] ?? sh.rotation.z, e = Math.min(-0.05, p["el" + S] ?? el.rotation.x);
	let err = 0;
	for (let it = 0; it < 14; it++) {
		const f0 = fk(x, z, e, _rf).clone();
		const r = _rt.clone().sub(f0);
		err = r.length();
		if (err < 0.002) break;
		const h = 1e-3;
		fk(x + h, z, e, _rj[0]).sub(f0).multiplyScalar(1 / h);
		fk(x, z + h, e, _rj[1]).sub(f0).multiplyScalar(1 / h);
		fk(x, z, e + h, _rj[2]).sub(f0).multiplyScalar(1 / h);
		// damped least squares: (A^T A + l I) d = A^T r
		const A = _rj, l = 0.004;
		const m = [[A[0].dot(A[0]) + l, A[0].dot(A[1]), A[0].dot(A[2])], [A[1].dot(A[0]), A[1].dot(A[1]) + l, A[1].dot(A[2])], [A[2].dot(A[0]), A[2].dot(A[1]), A[2].dot(A[2]) + l]];
		const b = [A[0].dot(r), A[1].dot(r), A[2].dot(r)];
		const det = (q) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
		const D = det(m);
		if (Math.abs(D) < 1e-12) break;
		const col = (k) => m.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
		const dx = det(col(0)) / D, dz = det(col(1)) / D, de = det(col(2)) / D;
		const s = Math.min(1, 0.6 / (Math.abs(dx) + Math.abs(dz) + Math.abs(de) + 1e-9));
		x = clamp(x + dx * s, -3.3, 1.2);
		z = clamp(z + dz * s, lim[0], lim[1]);
		e = clamp(e + de * s, -2.55, -0.03);
	}
	return { sh: x, shz: z, el: e, err };
}

// ---------- the traveller ----------
export class Traveller {
	constructor() {
		this.J = body({ skin: SKIN[0], top: 0xe2761b, bottom: 0xf1ebdc, sash: 0xb8261c, head: "turban", headColor: 0xf08a1f, beard: 0x5d554e, staff: true, diya: true, bag: true, lod: 2, sleeve: 0.6 });
		this.group = new THREE.Group();
		this.model = this.J.root;
		this.model.scale.setScalar(0.28);
		this.group.add(this.model);
		// a soft aura so the traveller can be found from high above
		this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb04a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
		this.aura.position.y = 0.3;
		this.aura.renderOrder = 6;
		this.group.add(this.aura);
		this.phase = 0;
		this.mode = "walk";
		this.blend = 0; // 0 walking, 1 at darshan
		this.yaw = 0;
		this.lag = 0;
	}
	// mode: "walk", "darshan" (aarti), "idle" (standing) or "ride" (astride the motorbike);
	// rate: walking cadence multiplier; yaw: facing (0 looks along +z)
	update(dt, t, { mode, rate = 1, yaw, distance }) {
		const J = this.J;
		const target = { walk: mode === "walk" ? 1 : 0, aarti: mode === "darshan" || mode === "idle" ? 1 : 0, ride: mode === "ride" ? 1 : 0 };
		this.w = this.w || { walk: 1, aarti: 0, ride: 0 };
		const k = mode === "ride" || this.w.ride > 0.5 ? 1 : Math.min(1, dt * 3);
		for (const n in target) this.w[n] += (target[n] - this.w[n]) * k;
		this.blend = 1 - this.w.walk;
		let d = yaw - this.yaw;
		d = Math.atan2(Math.sin(d), Math.cos(d));
		this.yaw += d * (mode === "ride" ? 1 : Math.min(1, dt * 6));
		this.model.rotation.y = this.yaw;
		this.phase += dt * 5.2 * rate * this.w.walk;
		const ph = this.phase, s = Math.sin(ph);
		const w = this.w.walk;
		// walking: heel strike and toe-off, the pelvis turning and rolling over the standing leg, the shoulders
		// turning against it; the staff arm swings and plants, the diya arm stays up and steady
		const L = legGait(ph), R = legGait(ph + Math.PI);
		const yawP = (R.hip - L.hip) * 0.11, st = Math.cos(TAU * (L.u - 0.3));
		const low = Math.min(footLow(L.hip, L.knee, L.pitch), footLow(R.hip, R.knee, R.pitch));
		const walk = {
			hipL: L.hip, hipR: R.hip, kneeL: L.knee, kneeR: R.knee, ankleL: L.ankle, ankleR: R.ankle,
			pelvisY: yawP, pelvisZ: -0.035 * st, sway: -0.017 * st,
			shR: -0.3 + L.hip * 0.42, shRz: -0.12, elR: -0.45 + L.hip * 0.2,
			shL: -0.75 + R.hip * 0.05, shLz: 0.18, shLy: 0.15, elL: -1.05, elLy: 0.2,
			lean: 0.07, twist: -yawP * 1.9, tilt: 0.028 * st, nod: 0.06 + (low + 0.937) * 0.6, look: yawP * 0.9, headTilt: -0.012 * st,
			bob: -0.95 - low + 0.003,
		};
		// darshan: the staff rests, the diya circles in aarti before the shrine
		const a = t * 1.6, ar = mode === "darshan" ? 1 : 0.15;
		const aarti = {
			hipL: 0, hipR: 0, kneeL: 0.04, kneeR: 0.04, ankleL: -0.04, ankleR: -0.04,
			shR: -0.15, shRz: -0.1, elR: -0.35,
			shL: -0.95 + Math.sin(a) * 0.22 * ar, shLz: 0.1 + Math.cos(a) * 0.18 * ar, shLy: 0.35, elL: -0.9 + Math.cos(a) * 0.15 * ar, elLy: 0.25,
			lean: 0.05, twist: 0, nod: mode === "darshan" ? 0.22 : 0.05, bob: 0,
		};
		// riding: seated, knees up to the foot pegs, both hands on the bars
		const ride = {
			hipL: -1.35, hipR: -1.35, hipLz: 0.12, hipRz: -0.12, kneeL: 1.25, kneeR: 1.25, ankleL: 0.22, ankleR: 0.22, seat: 0.63,
			shL: -1.0, shLz: 0.25, shR: -1.0, shRz: -0.25, elL: -0.35, elR: -0.35,
			lean: 0.32, twist: 0, nod: -0.2, bob: -0.12 + Math.sin(t * 9) * 0.004,
		};
		const p = {};
		for (const key of new Set([...Object.keys(walk), ...Object.keys(aarti), ...Object.keys(ride)])) p[key] = (walk[key] ?? 0) * w + (aarti[key] ?? 0) * this.w.aarti + (ride[key] ?? 0) * this.w.ride;
		if (this.w.ride < 0.5) delete p.seat;
		// breathing: the chest rises and the shoulders lift a little, more when still
		const br = Math.sin(t * 1.55), bw = 1 - w * 0.6;
		p.shLz += 0.012 * br * bw;
		p.shRz -= 0.012 * br * bw;
		p.nod -= 0.008 * br * bw;
		pose(J, p);
		if (J.chest) J.chest.scale.set(1 + 0.006 * br * bw, 1, 1 + 0.014 * br * bw);
		// the shawl's end lags behind the body (the kurta swings with the hips and legs in drape())
		this.lag += ((w * (0.12 + 0.05 * Math.sin(ph * 2 - 1.2)) + this.w.ride * 0.5) - this.lag) * Math.min(1, dt * 6);
		if (J.sashEnd) J.sashEnd.rotation.set(-this.lag * 0.6, 0, -yawP * 0.8 * w);
		const riding = this.w.ride > 0.5;
		if (J.staff) J.staff.visible = !riding;
		if (J.diya) J.diya.visible = !riding;
		// keep the staff upright in the world rather than swinging with the forearm
		if (J.staff) {
			J.staff.parent.updateWorldMatrix(true, false);
			const q = new THREE.Quaternion();
			J.staff.parent.getWorldQuaternion(q);
			const up = new THREE.Quaternion();
			this.group.getWorldQuaternion(up);
			up.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
			up.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12 + s * 0.1 * w));
			J.staff.quaternion.copy(q.invert().multiply(up));
			J.staff.position.set(0, 0.0, 0).add(new THREE.Vector3(0, -0.45, 0).applyQuaternion(J.staff.quaternion));
		}
		if (J.flame) {
			J.flame.scale.set(1, 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08, 1);
			J.halo.material.opacity = 0.8 + Math.sin(t * 5) * 0.12;
			// the diya stays level whatever the arm is doing
			J.diya.parent.updateWorldMatrix(true, false);
			const q = new THREE.Quaternion();
			J.diya.parent.getWorldQuaternion(q);
			const g = new THREE.Quaternion();
			this.group.getWorldQuaternion(g);
			J.diya.quaternion.copy(q.invert().multiply(g));
		}
		const far = THREE.MathUtils.clamp((distance - 30) / 90, 0, 1);
		this.aura.material.opacity = far * 0.75;
		this.aura.scale.setScalar(1.4 + far * 1.2);
	}
}

// ---------- the crowd ----------
// A pilgrim of many kinds, posed and merged into one geometry with vertex colours: one draw call each.
export function crowdOpts(R) {
	const pick = (a) => a[Math.floor(R() * a.length)];
	const woman = R() < 0.5;
	const age = R() < 0.22 ? "elder" : R() < 0.3 ? "young" : "adult";
	const build = R() < 0.2 ? "slim" : R() < 0.25 ? "heavy" : "average";
	if (woman) {
		const sari = pick([0xc0262d, 0xe0457b, 0xf2b01e, 0x2f8a4a, 0x7b2fa0, 0xe86a1c, 0x1f5fb0, 0x8a1538, 0x0f7a7a]);
		return { skin: pick(SKIN), top: pick([0xb8261c, 0xf2c14e, 0x6a2a8a, 0x2a6aa0, 0x2f6a3a, sari]), bottom: sari, sash: sari, head: R() < (age === "elder" ? 0.85 : 0.55) ? "veil" : "hair", headColor: sari, sari: true, age, build, border: pick([GOLD, GOLD, 0xb8261c, 0x1f3f8a, 0xf2c14e]) };
	}
	const kurta = pick([0xf3efe6, 0xd9d2c0, 0xf0c050, 0x8fa0b8, 0x6f8f6a, 0xe8e2d0, 0xc8562a, 0x9ab6c8]);
	const beard = R() < (age === "elder" ? 0.55 : 0.22) ? (age === "elder" ? 0xcfcac2 : 0x3a3430) : 0;
	return { skin: pick(SKIN), top: kurta, bottom: pick([0xf1ebdc, 0xe8e0cc]), sash: pick([0xb8261c, 0xf3efe6, 0xd8b04a, 0xe2761b]), head: R() < 0.35 ? "turban" : "hair", headColor: pick([0xf3efe6, 0xd33a2c, 0xe8c85a, 0xe2761b]), beard, moustache: beard || (R() < 0.6 ? (age === "elder" ? 0xbab4ab : 0x2a2420) : 0), bag: R() < 0.3, age, build, sleeve: R() < 0.5 ? 1 : 0.5, glasses: age === "elder" && R() < 0.4 };
}
export function crowdFigure(seed) {
	const R = rand(seed);
	const opts = Object.assign(crowdOpts(R), { lod: 0 });
	const J = body(opts);
	pose(J, R() < 0.55 ? NAMASTE : Object.assign({}, STAND, { look: (R() - 0.5) * 0.6 }));
	const merged = mergeFigure(J);
	const k = 0.28 * (0.9 + R() * 0.14) * (opts.sari ? 0.95 : 1);
	merged.scale(k, k, k);
	const m = new THREE.Mesh(merged, CROWD);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}
// Merges a posed body into one geometry: positions, normals and colours (material colour times vertex colour).
function mergeFigure(J) {
	J.root.updateMatrixWorld(true);
	const geos = [], mats = new Set();
	J.root.traverse((o) => {
		if (!o.isMesh) return;
		for (let p = o; p; p = p.parent) if (!p.visible) return;
		const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
		g.applyMatrix4(o.matrixWorld);
		const col = o.material.color, n = g.attributes.position.count;
		const c = g.attributes.color ? g.attributes.color.array : new Float32Array(n * 3).fill(1);
		for (let i = 0; i < n; i++) (c[i * 3] *= col.r), (c[i * 3 + 1] *= col.g), (c[i * 3 + 2] *= col.b);
		for (const key of Object.keys(g.attributes)) if (key !== "position" && key !== "normal") g.deleteAttribute(key);
		g.setAttribute("color", new THREE.BufferAttribute(c, 3));
		if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
		geos.push(g);
		mats.add(o.material);
	});
	J.root.traverse((o) => o.isMesh && o.geometry.dispose());
	for (const m of mats) m.dispose();
	const merged = mergeGeometries(geos);
	for (const g of geos) g.dispose();
	return merged;
}
const CROWD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

// Shared with the temple interiors (sanctum.js) and the outdoor aarti (aarti.js), which pose their own figures.
export { body, pose, SKIN, NAMASTE, STAND, mergeFigure };
