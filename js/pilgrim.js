// The traveller: a pilgrim in a saffron kurta and white dhoti, a staff in one hand and a clay diya
// in the other. Modelled in metres (about 1.7 m tall) and scaled down into the world by main.js.
// The same body, posed and merged into one mesh, fills the temple courtyards with other pilgrims.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glowTexture } from "./landmarks.js";
import { rand } from "./util.js";

const SKIN = [0x8d5a3b, 0x7a4a2f, 0xa06a46, 0x6b4029];
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, o));

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
const lathe = (pts, segs = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
// A limb hanging down from its joint.
const limb = (len, r0, r1) => {
	const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1);
	g.translate(0, -len / 2, 0);
	return g;
};

// Builds the body. opts: { skin, top, bottom, sash, head: "turban" | "hair" | "veil", sari, staff, diya, bag, beard }
function body(opts) {
	const M = {
		skin: mat(opts.skin, { roughness: 0.7 }),
		top: mat(opts.top),
		bottom: mat(opts.bottom),
		sash: mat(opts.sash),
		hair: mat(0x1b1612, { roughness: 0.6 }),
		head: mat(opts.headColor ?? opts.sash),
		wood: mat(0x6b4a2a, { roughness: 0.7 }),
		bag: mat(opts.bagColor ?? 0xc9b48a),
		sole: mat(0x3a2a1e),
	};
	const root = new THREE.Group();
	const hips = joint(0, 0.95, 0, root);
	const J = { root, hips };
	// legs: dhoti over the thighs, bare shins and sandals
	for (const side of [-1, 1]) {
		const hip = joint(side * 0.095, 0, 0, hips);
		part(limb(0.46, 0.1, 0.085), M.bottom, 0, 0, 0, hip);
		const knee = joint(0, -0.46, 0, hip);
		part(limb(0.22, 0.085, 0.07), M.bottom, 0, 0, 0, knee);
		part(limb(0.44, 0.05, 0.04), M.skin, 0, 0, 0, knee);
		const foot = part(new THREE.BoxGeometry(0.09, 0.04, 0.24), M.sole, 0, -0.45, 0.05, knee);
		foot.castShadow = true;
		J[side < 0 ? "hipL" : "hipR"] = hip;
		J[side < 0 ? "kneeL" : "kneeR"] = knee;
	}
	const torso = joint(0, 0, 0, hips);
	J.torso = torso;
	if (opts.sari) {
		// a sari falls to the ankles and hides the legs
		part(lathe([[0.0, -0.92], [0.24, -0.92], [0.22, -0.6], [0.18, -0.2], [0.16, 0.02], [0.0, 0.02]]), M.bottom, 0, 0, 0, torso);
	} else {
		// the kurta hem flares to the knee
		part(lathe([[0.25, -0.38], [0.2, -0.1], [0.17, 0.05], [0.0, 0.05]]), M.top, 0, 0, 0, torso);
	}
	part(lathe([[0.0, 0.0], [0.17, 0.0], [0.155, 0.16], [0.19, 0.36], [0.2, 0.48], [0.14, 0.53], [0.0, 0.54]]), M.top, 0, 0, 0, torso).scale.z = 0.72;
	// angavastram (shawl) across the left shoulder, or the sari's pallu
	const sash = part(new THREE.TorusGeometry(0.2, 0.032, 6, 22), M.sash, 0.0, 0.3, 0, torso);
	sash.rotation.set(Math.PI / 2, 0.75, 0);
	sash.scale.set(1, 0.72, 1.1);
	part(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), M.skin, 0, 0.58, 0, torso);
	const head = joint(0, 0.66, 0.01, torso);
	J.head = head;
	part(new THREE.SphereGeometry(0.105, 18, 14), M.skin, 0, 0, 0, head).scale.set(0.92, 1.08, 1);
	part(new THREE.SphereGeometry(0.022, 6, 4), M.skin, 0, -0.005, 0.1, head); // nose
	if (opts.head === "turban") {
		part(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.head, 0, 0.03, -0.005, head).scale.set(1.05, 0.95, 1.05);
		const band = part(new THREE.TorusGeometry(0.1, 0.03, 8, 20), M.head, 0, 0.04, 0, head);
		band.rotation.x = Math.PI / 2 - 0.15;
	} else if (opts.head === "veil") {
		part(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M.head, 0, 0.01, -0.012, head);
		part(lathe([[0.12, -0.02], [0.16, -0.2], [0.0, -0.2]], 14), M.head, 0, 0, -0.03, head).scale.z = 0.7;
	} else {
		part(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.012, -0.012, head);
	}
	if (opts.beard) part(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat(opts.beard, { roughness: 0.9 }), 0, -0.045, 0.045, head).scale.set(1.1, 1.3, 0.9);
	// tilak
	part(new THREE.BoxGeometry(0.012, 0.03, 0.004), mat(0xd23a1e, { emissive: 0x400800 }), 0, 0.055, 0.1, head);
	// arms
	for (const side of [-1, 1]) {
		const sh = joint(side * 0.21, 0.47, 0, torso);
		part(limb(0.3, 0.058, 0.05), M.top, 0, 0, 0, sh);
		const el = joint(0, -0.3, 0, sh);
		part(limb(0.25, 0.04, 0.032), M.skin, 0, 0, 0, el);
		const hand = joint(0, -0.27, 0, el);
		part(new THREE.SphereGeometry(0.042, 10, 8), M.skin, 0, 0, 0, hand).scale.set(0.8, 1.15, 0.6);
		J[side < 0 ? "shL" : "shR"] = sh;
		J[side < 0 ? "elL" : "elR"] = el;
		J[side < 0 ? "handL" : "handR"] = hand;
	}
	if (opts.bag) {
		const b = part(new THREE.BoxGeometry(0.06, 0.22, 0.2), M.bag, -0.2, -0.05, 0.02, torso);
		b.rotation.z = 0.1;
		const strap = part(new THREE.TorusGeometry(0.24, 0.012, 4, 24), M.bag, -0.02, 0.24, 0, torso);
		strap.rotation.set(Math.PI / 2, -0.85, Math.PI / 2);
		strap.scale.set(1, 1.35, 0.6);
	}
	if (opts.staff) {
		// the staff is held in the right hand, its foot near the ground
		const st = part(new THREE.CylinderGeometry(0.016, 0.02, 1.75, 8), M.wood, 0, -0.5, 0.0, J.handR);
		st.userData.staff = true;
		J.staff = st;
	}
	if (opts.diya) {
		const clay = mat(0xa9532a, { roughness: 0.8 });
		const d = joint(0, 0.0, 0.045, J.handL);
		const bowl = part(new THREE.SphereGeometry(0.06, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay, 0, 0.02, 0, d);
		bowl.scale.y = 0.55;
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
	return J;
}

// ---------- poses (angles in radians) ----------
function pose(J, p) {
	const set = (j, x = 0, y = 0, z = 0) => j && j.rotation.set(x, y, z);
	set(J.hipL, p.hipL ?? 0, 0, p.hipLz ?? 0);
	set(J.hipR, p.hipR ?? 0, 0, p.hipRz ?? 0);
	set(J.kneeL, p.kneeL ?? 0);
	set(J.kneeR, p.kneeR ?? 0);
	set(J.shL, p.shL ?? 0, p.shLy ?? 0, p.shLz ?? 0.08);
	set(J.shR, p.shR ?? 0, p.shRy ?? 0, p.shRz ?? -0.08);
	set(J.elL, p.elL ?? 0, p.elLy ?? 0);
	set(J.elR, p.elR ?? 0, p.elRy ?? 0);
	set(J.torso, p.lean ?? 0, p.twist ?? 0);
	set(J.head, p.nod ?? 0, p.look ?? 0);
	J.hips.position.y = 0.95 + (p.bob ?? 0);
}
const NAMASTE = { shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, elLy: 0, shR: -0.55, shRz: -0.25, shRy: -0.5, elR: -1.55, nod: 0.18 };
const STAND = { shL: 0.05, shR: 0.05, nod: 0.05 };

// ---------- the traveller ----------
export class Traveller {
	constructor() {
		this.J = body({ skin: SKIN[0], top: 0xe2761b, bottom: 0xf1ebdc, sash: 0xb8261c, head: "turban", headColor: 0xf08a1f, beard: 0x5d554e, staff: true, diya: true, bag: true });
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
		const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
		const w = this.w.walk;
		// walking: legs swing, knees fold on the way through, the staff arm plants, the diya arm stays up
		const walk = {
			hipL: s * 0.42, hipR: -s * 0.42,
			kneeL: Math.max(0, -Math.sin(ph - 0.9)) * 0.85 + 0.05, kneeR: Math.max(0, Math.sin(ph - 0.9)) * 0.85 + 0.05,
			shR: -0.35 + s * 0.22, shRz: -0.12, elR: -0.45 - s * 0.1,
			shL: -0.75 - s * 0.05, shLz: 0.18, shLy: 0.15, elL: -1.05, elLy: 0.2,
			lean: 0.08, twist: s * 0.06, nod: 0.06, bob: Math.abs(c) * 0.035 - 0.02,
		};
		// darshan: the staff rests, the diya circles in aarti before the shrine
		const a = t * 1.6, ar = mode === "darshan" ? 1 : 0.15;
		const aarti = {
			hipL: 0, hipR: 0, kneeL: 0.04, kneeR: 0.04,
			shR: -0.15, shRz: -0.1, elR: -0.35,
			shL: -0.95 + Math.sin(a) * 0.22 * ar, shLz: 0.1 + Math.cos(a) * 0.18 * ar, shLy: 0.35, elL: -0.9 + Math.cos(a) * 0.15 * ar, elLy: 0.25,
			lean: 0.05, twist: 0, nod: mode === "darshan" ? 0.22 : 0.05, bob: 0,
		};
		// riding: seated, knees up to the foot pegs, both hands on the bars
		const ride = {
			hipL: -1.35, hipR: -1.35, hipLz: 0.12, hipRz: -0.12, kneeL: 1.25, kneeR: 1.25,
			shL: -1.0, shLz: 0.25, shR: -1.0, shRz: -0.25, elL: -0.35, elR: -0.35,
			lean: 0.32, twist: 0, nod: -0.2, bob: -0.12 + Math.sin(t * 9) * 0.004,
		};
		const p = {};
		for (const key of new Set([...Object.keys(walk), ...Object.keys(ride)])) p[key] = (walk[key] ?? 0) * w + (aarti[key] ?? 0) * this.w.aarti + (ride[key] ?? 0) * this.w.ride;
		pose(J, p);
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
// A posed figure merged into one geometry with vertex colours: one draw call per pilgrim.
export function crowdFigure(seed) {
	const R = rand(seed);
	const woman = R() < 0.5;
	const pick = (a) => a[Math.floor(R() * a.length)];
	const sari = pick([0xc0262d, 0xe0457b, 0xf2b01e, 0x2f8a4a, 0x7b2fa0, 0xe86a1c, 0x1f5fb0]);
	const opts = woman
		? { skin: pick(SKIN), top: pick([0xb8261c, 0xf2c14e, 0x6a2a8a, 0x2a6aa0]), bottom: sari, sash: sari, head: R() < 0.7 ? "veil" : "hair", headColor: sari, sari: true }
		: { skin: pick(SKIN), top: pick([0xf3efe6, 0xd9d2c0, 0xf0c050, 0x8fa0b8, 0x6f8f6a, 0xe8e2d0]), bottom: pick([0xf1ebdc, 0xe8e0cc]), sash: pick([0xb8261c, 0xf3efe6, 0xd8b04a]), head: R() < 0.35 ? "turban" : "hair", headColor: pick([0xf3efe6, 0xd33a2c, 0xe8c85a]), beard: R() < 0.3 ? pick([0x3a3430, 0xcfcac2]) : 0, bag: R() < 0.3 };
	const J = body(opts);
	pose(J, R() < 0.55 ? NAMASTE : Object.assign({}, STAND, { look: (R() - 0.5) * 0.6 }));
	J.root.updateMatrixWorld(true);
	const geos = [];
	const col = new THREE.Color();
	J.root.traverse((o) => {
		if (!o.isMesh) return;
		let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
		g.applyMatrix4(o.matrixWorld);
		for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
		col.copy(o.material.color);
		const n = g.attributes.position.count, c = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
		g.setAttribute("color", new THREE.BufferAttribute(c, 3));
		geos.push(g);
		o.geometry.dispose();
	});
	const merged = mergeGeometries(geos);
	const k = 0.28 * (0.9 + R() * 0.14);
	merged.scale(k, k, k);
	const m = new THREE.Mesh(merged, CROWD);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}
const CROWD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
