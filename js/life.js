// Life in the countryside: zebu cattle, buffaloes, goats and dogs, people (the pilgrim crowd figures),
// parked two-wheelers, and the small things of a village: hand pumps, wells, laundry lines, haystacks.
// Each model is built once in metres as one vertex-coloured geometry and merged into a chunk's batch.
import * as THREE from "three";
import { T, place } from "./batch.js";
import { crowdFigure } from "./pilgrim.js";

const M = 0.28;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const unit = (g) => {
	const n = g.index ? g.toNonIndexed() : g;
	for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
	n.computeVertexNormals();
	return n;
};
const SPH = unit(new THREE.SphereGeometry(0.5, 12, 8));
const SPH_LO = unit(new THREE.SphereGeometry(0.5, 8, 6));
const CYL = unit(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).translate(0, 0.5, 0));
const TAPER = unit(new THREE.CylinderGeometry(0.3, 0.5, 1, 8, 1).translate(0, 0.5, 0));
const CONE = unit(new THREE.ConeGeometry(0.5, 1, 8, 1).translate(0, 0.5, 0));
const BOX = unit(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));

// Collects coloured parts into one geometry (non-indexed: position, normal, color).
class Parts {
	constructor() {
		this.P = [];
		this.N = [];
		this.C = [];
	}
	add(geo, m, hex) {
		const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
		const nm = new THREE.Matrix3().getNormalMatrix(m);
		const P = geo.attributes.position.array, N = geo.attributes.normal.array;
		const v = new THREE.Vector3();
		for (let i = 0; i < P.length; i += 3) {
			v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m);
			this.P.push(v.x, v.y, v.z);
			v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize();
			this.N.push(v.x, v.y, v.z);
			this.C.push(c.r, c.g, c.b);
		}
	}
	// an ellipsoid centred at x,y,z with radii, pitched about x
	blob(x, y, z, rx, ry, rz, hex, pitch = 0, yaw = 0, roll = 0, lo = false) {
		_e.set(pitch, yaw, roll, "YXZ");
		_q.setFromEuler(_e);
		this.add(lo ? SPH_LO : SPH, _m.compose(_p.set(x, y, z), _q, _s.set(rx * 2, ry * 2, rz * 2)), hex);
	}
	// a limb from a to b with radii ra (at a) and rb (at b)
	limb(a, b, ra, rb, hex) {
		_d.subVectors(b, a);
		const len = _d.length() || 1e-6;
		_q.setFromUnitVectors(_up, _d.divideScalar(len));
		// the taper template is 0.5 at the bottom and 0.3 at the top
		const geo = rb < ra * 0.8 ? TAPER : CYL;
		const r = geo === TAPER ? ra : (ra + rb) / 2;
		this.add(geo, _m.compose(_p.copy(a), _q, _s.set(r * 2, len, r * 2)), hex);
	}
	box(x, y, z, w, h, d, hex, yaw = 0, pitch = 0, roll = 0) {
		_e.set(pitch, yaw, roll, "YXZ");
		_q.setFromEuler(_e);
		this.add(BOX, _m.compose(_p.set(x, y, z), _q, _s.set(w, h, d)), hex);
	}
	cone(x, y, z, r, h, hex, pitch = 0, yaw = 0, roll = 0) {
		_e.set(pitch, yaw, roll, "YXZ");
		_q.setFromEuler(_e);
		this.add(CONE, _m.compose(_p.set(x, y, z), _q, _s.set(r * 2, h, r * 2)), hex);
	}
	build() {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
		g.setAttribute("normal", new THREE.Float32BufferAttribute(this.N, 3));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.C, 3));
		return g;
	}
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- animals ----------
// Zebu cattle (Khillari and Ongole types: white or grey, a hump, a dewlap and long horns), buffaloes,
// goats and pariah dogs. Built facing +z with the feet on y = 0, in metres. Poses: stand, graze, lie.
function zebu(col, pose, horns = "up") {
	const p = new Parts();
	const c = new THREE.Color(col), dark = c.clone().multiplyScalar(0.62), hoof = 0x2a2420, horn = 0xb9ae98;
	const lie = pose === "lie", graze = pose === "graze";
	const by = lie ? 0.55 : 1.02;
	p.blob(0, by, 0, 0.3, 0.36, 0.78, c);
	p.blob(0, by + 0.03, -0.5, 0.29, 0.34, 0.36, c);
	p.blob(0, by, 0.48, 0.28, 0.35, 0.34, c);
	p.blob(0, by + 0.36, 0.42, 0.16, 0.17, 0.2, dark); // hump
	p.blob(0, by - 0.28, 0.72, 0.07, 0.2, 0.25, c); // dewlap
	// neck and head
	const neckA = V(0, by + 0.12, 0.72), head = graze ? V(0, 0.42, 1.25) : lie ? V(0, by + 0.42, 1.08) : V(0, by + 0.25, 1.3);
	p.limb(neckA, head, 0.17, 0.13, c);
	const hp = graze ? 1.2 : 0.55;
	p.blob(head.x, head.y, head.z, 0.12, 0.14, 0.28, c, hp);
	const mz = head.z + Math.sin(hp) * 0.24, my = head.y - Math.cos(hp) * 0.0 - Math.sin(hp) * 0.0 - (graze ? 0.22 : 0.12);
	p.blob(0, my, mz, 0.09, 0.08, 0.09, 0x3a3430); // muzzle
	for (const sx of [-1, 1]) {
		p.blob(head.x + sx * 0.15, head.y + 0.08, head.z - 0.08, 0.09, 0.03, 0.05, c, 0, 0, sx * 0.6); // drooping ears
		const hb = V(head.x + sx * 0.07, head.y + 0.12, head.z - 0.12);
		if (horns === "up") p.limb(hb, V(hb.x + sx * 0.12, hb.y + 0.28, hb.z - 0.14), 0.035, 0.012, horn);
		else p.limb(hb, V(hb.x + sx * 0.16, hb.y + 0.08, hb.z - 0.06), 0.035, 0.015, horn);
	}
	if (!lie) {
		for (const [lx, lz] of [[-0.15, 0.52], [0.15, 0.52], [-0.15, -0.55], [0.15, -0.55]]) {
			p.limb(V(lx, by - 0.08, lz), V(lx, 0.06, lz + (lz > 0 ? 0.02 : -0.02)), 0.075, 0.045, c);
			p.box(lx, 0, lz, 0.09, 0.07, 0.11, hoof);
		}
	} else {
		for (const [lx, lz] of [[-0.25, 0.45], [0.25, 0.3]]) p.box(lx, 0.04, lz, 0.12, 0.12, 0.5, c);
	}
	p.limb(V(0, by + 0.2, -0.82), V(0.02, lie ? 0.2 : 0.4, -0.92), 0.025, 0.02, c);
	p.blob(0.02, lie ? 0.17 : 0.36, -0.93, 0.05, 0.09, 0.05, 0x2a2622);
	return p.build();
}
function buffalo(pose) {
	const p = new Parts();
	const c = 0x1f1e1c, horn = 0x2e2b28;
	const lie = pose === "lie", graze = pose === "graze";
	const by = lie ? 0.55 : 0.95;
	p.blob(0, by, 0, 0.38, 0.4, 0.82, c);
	p.blob(0, by + 0.04, -0.5, 0.36, 0.38, 0.4, c);
	p.blob(0, by, 0.5, 0.35, 0.38, 0.36, c);
	const head = graze ? V(0, 0.4, 1.15) : V(0, by - 0.05, 1.2);
	p.limb(V(0, by + 0.05, 0.7), head, 0.22, 0.16, c);
	p.blob(head.x, head.y, head.z, 0.15, 0.17, 0.3, c, graze ? 1.2 : 0.9);
	for (const sx of [-1, 1]) {
		// swept-back curled horns
		const a = V(sx * 0.1, head.y + 0.14, head.z - 0.1), b = V(sx * 0.32, head.y + 0.1, head.z - 0.32), e = V(sx * 0.3, head.y - 0.06, head.z - 0.42);
		p.limb(a, b, 0.05, 0.035, horn);
		p.limb(b, e, 0.035, 0.015, horn);
	}
	if (!lie) {
		for (const [lx, lz] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.55], [0.2, -0.55]]) p.limb(V(lx, by - 0.1, lz), V(lx, 0.02, lz), 0.09, 0.06, c);
	}
	p.limb(V(0, by + 0.2, -0.85), V(0, 0.35, -0.95), 0.025, 0.02, c);
	return p.build();
}
function goat(col, pose) {
	const p = new Parts();
	const c = new THREE.Color(col);
	const graze = pose === "graze";
	const by = 0.55;
	p.blob(0, by, 0, 0.16, 0.19, 0.38, c);
	const head = graze ? V(0, 0.22, 0.48) : V(0, by + 0.25, 0.42);
	p.limb(V(0, by + 0.05, 0.28), head, 0.08, 0.06, c);
	p.blob(head.x, head.y, head.z + 0.05, 0.06, 0.07, 0.13, c, graze ? 1.1 : 0.5);
	for (const sx of [-1, 1]) {
		p.blob(sx * 0.08, head.y - 0.02, head.z, 0.08, 0.02, 0.035, c, 0, 0, sx * 1.1); // long drooping ears
		p.limb(V(sx * 0.03, head.y + 0.07, head.z - 0.03), V(sx * 0.06, head.y + 0.16, head.z - 0.12), 0.015, 0.006, 0x8a8070);
	}
	for (const [lx, lz] of [[-0.08, 0.25], [0.08, 0.25], [-0.08, -0.25], [0.08, -0.25]]) p.limb(V(lx, by - 0.05, lz), V(lx, 0, lz), 0.03, 0.02, c);
	p.limb(V(0, by + 0.12, -0.36), V(0, by + 0.25, -0.42), 0.02, 0.01, c);
	return p.build();
}
function dog(col, pose) {
	const p = new Parts();
	const c = new THREE.Color(col);
	const lie = pose === "lie";
	const by = lie ? 0.16 : 0.45;
	p.blob(0, by, 0, 0.12, 0.13, 0.33, c);
	const head = lie ? V(0, 0.2, 0.42) : V(0, by + 0.17, 0.36);
	p.limb(V(0, by + 0.04, 0.22), head, 0.07, 0.06, c);
	p.blob(head.x, head.y, head.z + 0.04, 0.07, 0.07, 0.1, c);
	p.limb(V(0, head.y - 0.01, head.z + 0.1), V(0, head.y - 0.03, head.z + 0.2), 0.035, 0.025, c);
	for (const sx of [-1, 1]) p.cone(sx * 0.04, head.y + 0.05, head.z, 0.025, 0.08, c, -0.2, 0, sx * 0.3);
	if (!lie) for (const [lx, lz] of [[-0.06, 0.2], [0.06, 0.2], [-0.06, -0.2], [0.06, -0.2]]) p.limb(V(lx, by - 0.04, lz), V(lx, 0, lz), 0.025, 0.02, c);
	// curled tail
	p.limb(V(0, by + 0.06, -0.3), V(0, by + 0.2, -0.36), 0.02, 0.018, c);
	p.limb(V(0, by + 0.2, -0.36), V(0.04, by + 0.2, -0.26), 0.018, 0.012, c);
	return p.build();
}
// The yak of the Tibetan plateau and the high Byans valley: a big, low, dark body under a long shaggy skirt of
// hair, a hump at the shoulders, the head carried low, upswept horns, a bushy tail; some piebald with white. A
// pack yak carries a load roped on either side, a red tassel in its ear.
export function yak(col, pose, pack = false, legs = true) {
	const p = new Parts();
	const c = new THREE.Color(col), hair = c.clone().multiplyScalar(0.8), white = 0xe8e2d6, horn = 0xcfc4ae, hoof = 0x1a1612;
	const lie = pose === "lie", graze = pose === "graze";
	const by = lie ? 0.6 : 1.12;
	p.blob(0, by, 0, 0.42, 0.44, 0.92, c);
	p.blob(0, by + 0.12, 0.48, 0.4, 0.5, 0.42, c);
	p.blob(0, by + 0.5, 0.42, 0.24, 0.22, 0.3, hair); // the hump
	p.blob(0, by + 0.02, -0.55, 0.4, 0.42, 0.42, c);
	if (col === 0x2a2420) p.blob(0.12, by + 0.1, 0.2, 0.3, 0.32, 0.55, white); // a white patch
	// the long hair hanging from the flanks and belly to the knees
	for (const z of [-0.6, -0.25, 0.1, 0.45]) for (const sx of [-1, 1]) p.blob(sx * 0.32, by - 0.32, z, 0.14, lie ? 0.22 : 0.38, 0.24, hair, 0, 0, sx * 0.15);
	p.blob(0, by - 0.38, 0, 0.3, lie ? 0.2 : 0.32, 0.75, hair);
	const head = graze ? V(0, 0.45, 1.25) : lie ? V(0, by + 0.25, 1.0) : V(0, by - 0.05, 1.25);
	p.limb(V(0, by + 0.1, 0.8), head, 0.22, 0.16, c);
	p.blob(head.x, head.y, head.z, 0.15, 0.17, 0.26, c, graze ? 1.2 : 0.7);
	p.blob(0, head.y - (graze ? 0.22 : 0.12), head.z + (graze ? 0.12 : 0.2), 0.1, 0.09, 0.09, 0x2a2420);
	p.blob(0, head.y - 0.18, head.z - 0.05, 0.12, 0.2, 0.12, hair); // the beard of hair under the chin
	for (const sx of [-1, 1]) {
		const a = V(sx * 0.1, head.y + 0.12, head.z - 0.12), b = V(sx * 0.3, head.y + 0.18, head.z - 0.12), e = V(sx * 0.32, head.y + 0.38, head.z - 0.2);
		p.limb(a, b, 0.045, 0.03, horn);
		p.limb(b, e, 0.03, 0.01, horn);
		p.blob(sx * 0.18, head.y + 0.05, head.z - 0.16, 0.07, 0.03, 0.05, c, 0, 0, sx * 0.5);
	}
	if (pack) {
		p.blob(0.2, head.y + 0.07, head.z - 0.14, 0.05, 0.05, 0.05, 0xd8261c); // a red tassel in the ear
		for (const sx of [-1, 1]) p.box(sx * 0.5, by - 0.05, 0, 0.32, 0.5, 0.8, sx > 0 ? 0x3a5a8a : 0x8a3a1e);
		p.box(0, by + 0.42, -0.05, 0.75, 0.12, 0.75, 0x5a4a3a); // the saddle blanket and ropes
		p.box(0, by + 0.5, -0.05, 0.85, 0.03, 0.06, 0xd8c8a0);
	}
	if (!lie && legs) for (const [lx, lz] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.6], [0.2, -0.6]]) {
		p.limb(V(lx, by - 0.2, lz), V(lx, 0.05, lz), 0.09, 0.06, c);
		p.box(lx, 0, lz, 0.11, 0.07, 0.13, hoof);
	}
	p.limb(V(0, by + 0.15, -0.95), V(0, by - 0.1, -1.05), 0.04, 0.03, c);
	p.blob(0, by - 0.42, -1.07, 0.1, 0.3, 0.1, hair); // the bushy tail
	return p.build();
}
// Sheep of the Changtang: white or cream, a black face on some.
function sheep(col, pose) {
	const p = new Parts();
	const c = new THREE.Color(col);
	const graze = pose === "graze";
	const by = 0.5;
	p.blob(0, by, 0, 0.22, 0.24, 0.42, c);
	const head = graze ? V(0, 0.2, 0.5) : V(0, by + 0.18, 0.46);
	p.limb(V(0, by + 0.05, 0.3), head, 0.08, 0.06, c);
	p.blob(head.x, head.y, head.z + 0.04, 0.07, 0.08, 0.13, R0() < 0.5 ? 0x2a2420 : c, graze ? 1.1 : 0.5);
	for (const [lx, lz] of [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]]) p.limb(V(lx, by - 0.1, lz), V(lx, 0, lz), 0.03, 0.02, 0x2a2420);
	return p.build();
}
let _r0 = 7;
const R0 = () => ((_r0 = (_r0 * 16807) % 2147483647) / 2147483647);
const ANIMALS = {};
export function animal(kind, R) {
	const pose = R() < 0.45 ? "graze" : R() < 0.5 ? "lie" : "stand";
	let key, make;
	if (kind === "cow") {
		const col = [0xf0ece2, 0xe4ded2, 0xc9c2b4, 0x9a9890, 0xb08a64][Math.floor(R() * 5)];
		key = `cow${col}${pose}`;
		make = () => zebu(col, pose, R() < 0.7 ? "up" : "out");
	} else if (kind === "buffalo") {
		key = `buf${pose}`;
		make = () => buffalo(pose);
	} else if (kind === "goat") {
		const col = [0xf0ece2, 0x2a2622, 0x8a6a4a, 0x5a4434][Math.floor(R() * 4)];
		const gp = pose === "lie" ? "stand" : pose;
		key = `goat${col}${gp}`;
		make = () => goat(col, gp);
	} else if (kind === "yak" || kind === "packyak") {
		const col = [0x1e1a17, 0x2a2420, 0x3a2e26, 0x1e1a17][Math.floor(R() * 4)];
		const yp = kind === "packyak" ? "stand" : pose;
		key = `${kind}${col}${yp}`;
		make = () => yak(col, yp, kind === "packyak");
	} else if (kind === "sheep") {
		const col = [0xece6d8, 0xe0d6c0, 0xd8ccb4][Math.floor(R() * 3)];
		const sp = pose === "lie" ? "stand" : pose;
		key = `sheep${col}${sp}`;
		make = () => sheep(col, sp);
	} else {
		const col = [0xc49a62, 0xb88a52, 0xd8c09a, 0x3a3028][Math.floor(R() * 4)];
		const dp = pose === "graze" ? "stand" : pose;
		key = `dog${col}${dp}`;
		make = () => dog(col, dp);
	}
	return ANIMALS[key] || (ANIMALS[key] = make());
}
// Put an animal into a batch at x, z (world), turned by yaw, at the ground height y.
export function addAnimal(b, kind, R, x, y, z, yaw) {
	const g = animal(kind, R);
	const k = M * (0.9 + R() * 0.2) * (kind === "goat" ? 1 : 1);
	b.addColored(g, place(x, y, z, yaw, k, k, k), 1);
}

// ---------- people ----------
const FIG = [], FIG_AT = {};
// dress: dress the people as those of a region (pilgrim.js crowdOpts), e.g. "tibetan"; by default the plains' mix
export function figure(R, dress) {
	const n = 10;
	const i = Math.floor(R() * n);
	const F = dress ? (FIG_AT[dress] ||= []) : FIG;
	if (!F[i]) {
		try {
			const m = crowdFigure(9000 + i * 37, dress);
			let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
			for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
			if (!g.attributes.normal) g.computeVertexNormals();
			if (!g.attributes.color) g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.7), 3));
			F[i] = g;
		} catch (e) {
			F[i] = null;
		}
	}
	return F[i];
}
export function addPerson(b, R, x, y, z, yaw, dress) {
	const g = figure(R, dress);
	if (g) b.addColored(g, place(x, y, z, yaw, 1, 1, 1), 1);
}

// ---------- two-wheelers ----------
const BIKES = {};
function bikeGeo(col) {
	const p = new Parts();
	const black = 0x1a1a1a, chrome = 0xb8bcc0;
	for (const z of [-0.62, 0.66]) {
		p.add(CYL, new THREE.Matrix4().compose(V(-0.05, 0.31, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(0.62, 0.1, 0.62)), black);
		p.add(CYL, new THREE.Matrix4().compose(V(-0.055, 0.31, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(0.3, 0.11, 0.3)), chrome);
	}
	p.box(0, 0.42, 0.0, 0.2, 0.25, 0.7, 0x2a2a2a); // engine
	p.box(0, 0.62, 0.15, 0.24, 0.2, 0.45, col, 0, 0.1); // tank
	p.box(0, 0.7, -0.35, 0.24, 0.1, 0.6, black); // seat
	p.box(0, 0.62, -0.62, 0.2, 0.08, 0.35, col); // tail
	p.limb(V(0, 0.33, 0.66), V(0, 0.88, 0.5), 0.03, 0.03, chrome); // fork
	p.box(0, 0.9, 0.5, 0.7, 0.03, 0.03, black); // handlebar
	p.blob(0, 0.8, 0.6, 0.08, 0.08, 0.06, 0xf2eedc); // headlamp
	p.limb(V(0.12, 0.35, -0.2), V(0.12, 0.38, -0.85), 0.03, 0.03, chrome); // silencer
	p.limb(V(-0.1, 0.4, -0.15), V(-0.25, 0.0, -0.1), 0.012, 0.012, 0x3a3a3a); // side stand
	return p.build();
}
export function addBike(b, R, x, y, z, yaw) {
	const col = [0xb01e1e, 0x1d1d1d, 0x1f3f8a, 0x6a6e72, 0x7a1f6a][Math.floor(R() * 5)];
	const g = BIKES[col] || (BIKES[col] = bikeGeo(col));
	// parked on its side stand, leaning a little
	b.addColored(g, place(x, y, z, yaw, M, M, M, 0, -0.12), 1);
}

// ---------- village things ----------
// India Mark II hand pump on its concrete apron.
export function handPump(b, x, y, z, yaw) {
	b.add(T.cyl12, place(x, y - 0.05, z, 0, 1.6 * M, 0.17 * M, 1.6 * M), 0x9a968e);
	b.add(T.cyl12, place(x, y + 0.03 * M, z, 0, 1.25 * M, 0.06 * M, 1.25 * M), 0x5d5a55); // wet ring
	const px = x + Math.sin(yaw) * 0.25 * M, pz = z + Math.cos(yaw) * 0.25 * M;
	b.add(T.cyl, place(px, y, pz, 0, 0.13 * M, 0.85 * M, 0.13 * M), 0x2f5a8a);
	b.add(T.box, place(px, y + 0.85 * M, pz, yaw, 0.18 * M, 0.22 * M, 0.3 * M), 0x2f5a8a);
	b.add(T.box, place(px - Math.cos(yaw) * 0.2 * M, y + 0.98 * M, pz + Math.sin(yaw) * 0.2 * M, yaw, 0.04 * M, 0.04 * M, 1.1 * M, -0.35), 0x2a2a2a); // handle
	b.add(T.box, place(px + Math.sin(yaw) * 0.18 * M, y + 0.62 * M, pz + Math.cos(yaw) * 0.18 * M, yaw, 0.06 * M, 0.06 * M, 0.3 * M), 0x2a2a2a); // spout
	b.add(T.box, place(x + Math.sin(yaw) * 0.55 * M, y + 0.02, z + Math.cos(yaw) * 0.55 * M, yaw, 0.4 * M, 0.3 * M, 0.3 * M), 0x8a3a2a); // a pot waiting
}
// A dug well: a whitewashed round parapet, dark water and a pulley frame.
export function well(b, x, y, z, yaw, R) {
	b.add(T.cyl12, place(x, y - 0.1, z, 0, 2.6 * M, 0.9 * M + 0.1, 2.6 * M), R() < 0.5 ? 0xd8d2c4 : 0x8a8276);
	b.add(T.cyl12, place(x, y - 0.1, z, 0, 2.1 * M, 0.9 * M + 0.11, 2.1 * M), 0x1c2a2a);
	for (const sg of [-1, 1]) b.add(T.box, place(x + Math.cos(yaw) * sg * 1.2 * M, y, z - Math.sin(yaw) * sg * 1.2 * M, yaw, 0.1 * M, 2.1 * M, 0.1 * M), 0x5a4434);
	b.add(T.box, place(x, y + 2.1 * M, z, yaw + Math.PI / 2, 0.08 * M, 0.08 * M, 2.5 * M), 0x5a4434);
	b.add(T.cyl, place(x, y + 1.95 * M, z, 0, 0.18 * M, 0.12 * M, 0.18 * M, Math.PI / 2), 0x3a3a3a);
}
// A laundry line between two bamboo poles, with saris and shirts drying.
export function laundry(b, R, ax, ay, az, bx, by, bz) {
	const h = 1.8 * M;
	b.add(T.cyl, place(ax, ay, az, 0, 0.05 * M, h, 0.05 * M), 0xa08a5a);
	b.add(T.cyl, place(bx, by, bz, 0, 0.05 * M, h, 0.05 * M), 0xa08a5a);
	const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
	const top = Math.max(ay, by) + h - 0.02;
	b.add(T.box, place((ax + bx) / 2, top - 0.01, (az + bz) / 2, yaw, 0.01, 0.01, len), 0x2a2a2a);
	const cols = [0xd8261c, 0xf2c14e, 0x2f8a4a, 0x1f5aa8, 0xe86aa0, 0xf4f1ea, 0x7a2a8a, 0xff8a1e];
	let t = 0.08;
	while (t < 0.92) {
		const w = (0.4 + R() * 0.9) * M, drop = (0.5 + R() * 0.7) * M;
		const x = ax + dx * t, z = az + dz * t;
		b.add(T.box, place(x, top - drop, z, yaw, 0.012, drop, w), cols[Math.floor(R() * cols.length)]);
		t += w / len + 0.03;
	}
}
// A haystack of jowar stalks or paddy straw, or a stack of dung cakes in the north.
export function haystack(b, R, x, y, z, north) {
	if (north && R() < 0.5) {
		// a bitaura: a dung-cake store plastered over, with a little thatched cap
		b.add(T.cyl12, place(x, y - 0.05, z, 0, 2.2 * M, 1.4 * M, 2.2 * M), 0x6e5440);
		b.add(T.cone, place(x, y + 1.35 * M, z, 0, 2.5 * M, 1.2 * M, 2.5 * M), 0xb09a62);
		return;
	}
	const r = (1.6 + R() * 1.4) * M;
	b.add(T.cyl12, place(x, y - 0.05, z, R(), r * 2, r * 0.9, r * 2), 0xc4a462);
	b.add(T.dome, place(x, y + r * 0.85, z, R(), r * 2.05, r * 1.4, r * 2.05), 0xcfae66);
	b.add(T.cone, place(x, y + r * 1.5, z, 0, r * 0.5, r * 0.6, r * 0.5), 0xa88a4a);
}
// A small village shrine: a whitewashed cell with a curved shikhara, a kalash and a saffron flag.
export function shrine(b, x, y, z, yaw, style) {
	const s = M;
	const lime = 0xf1ece0, saffron = 0xe8761e, red = 0xb3261e;
	b.add(T.box, place(x, y - 0.1, z, yaw, 3.4 * s, 0.6 * s + 0.1, 3.4 * s), 0x9a948a); // plinth
	b.add(T.box, place(x, y + 0.5 * s, z, yaw, 2.4 * s, 2.2 * s, 2.4 * s), style === "garhwal" ? 0x9a948a : lime);
	b.add(T.box, place(x + Math.sin(yaw) * 1.21 * s, y + 0.55 * s, z + Math.cos(yaw) * 1.21 * s, yaw, 0.9 * s, 1.6 * s, 0.03), 0x2a1a12); // door
	let h = y + 2.7 * s;
	for (let i = 0; i < 4; i++) {
		const w = (2.3 - i * 0.45) * s;
		b.add(T.taper, place(x, h, z, yaw + Math.PI / 4, w * 1.2, 0.75 * s, w * 1.2), i % 2 ? lime : style === "south" ? red : saffron);
		h += 0.72 * s;
	}
	b.add(T.cyl, place(x, h, z, 0, 0.6 * s, 0.2 * s, 0.6 * s), lime);
	b.add(T.ball, place(x, h + 0.2 * s, z, 0, 0.35 * s, 0.5 * s, 0.35 * s), 0xd9a33a); // kalash
	b.add(T.box, place(x - Math.cos(yaw) * 1.4 * s, y, z + Math.sin(yaw) * 1.4 * s, 0, 0.05 * s, 5 * s, 0.05 * s), 0x5a4434);
	b.add(T.box, place(x - Math.cos(yaw) * 1.4 * s + 0.12, y + 4.4 * s, z + Math.sin(yaw) * 1.4 * s, 0, 0.9 * s, 0.6 * s, 0.01), saffron);
	// a bell and a lamp niche by the door
	b.add(T.ball, place(x + Math.sin(yaw) * 1.4 * s, y + 2 * s, z + Math.cos(yaw) * 1.4 * s, 0, 0.2 * s, 0.25 * s, 0.2 * s), 0xb88a3a);
}
// A peepal katta: a round plastered platform around a tree, where the village sits in the evening.
export function katta(b, x, y, z, R) {
	b.add(T.cyl12, place(x, y - 0.12, z, 0, 5.2 * M, 0.55 * M + 0.12, 5.2 * M), 0xd9d2c2);
	b.add(T.cyl12, place(x, y + 0.42 * M, z, 0, 5.3 * M, 0.08 * M, 5.3 * M), 0xb8321e); // a painted rim
	// stones daubed with sindoor at the foot of the tree
	for (let i = 0; i < 3; i++) b.add(T.ball, place(x + 0.5 * M + i * 0.25 * M, y + 0.5 * M, z + 0.6 * M, 0, 0.3 * M, 0.4 * M, 0.25 * M), 0xe0601e);
	void R;
}
export { Parts };
