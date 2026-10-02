// The aarti outside each shrine's door. A pujari steps out and blows the shankh, sets it down, takes up the lamp of
// many wicks and the bell, and waves the flame in slow clockwise circles before the deity while the bell rings;
// then he brings the flame to the traveller, who passes a palm over it and touches the eyes, and petals fall.
// Everything is built in the shrine's local frame (door toward +z at about z = 1.9) and follows music.aarti's clock.
//
//   const aarti = new Aarti({ scene, landmarks, music, traveller, low });
//       // build it at init, before the first render: it adds one PointLight to the scene for good
//   aarti.start(i)      → Promise<boolean>: true when the aarti plays out, false if stopped first
//   aarti.update(dt, t, camera)  // every frame, after traveller.update(), since it can take over the traveller's arm;
//                       // camera is optional: given it, the lamp's glow grows with distance so it still reads from afar
//   aarti.focus         // world position of the lamp's flame (a Vector3, or null), for framing the camera
//   aarti.stop()        // removes and disposes everything at once (also hands back the traveller's staff)
//   aarti.active        // true while running;  aarti.phase: "enter" | "conch" | "aarti" | "peal" | "offer" | "leave"
//   aarti.poseTraveller = false   // leave the traveller alone; aarti.onPose(J, w) is called after it is posed
//   aarti.dispose()     // when done with it for good: removes the light and the smoke texture
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { body, pose, SKIN } from "./pilgrim.js";
import { GOLD, glowTexture } from "./landmarks.js";
import { aartiSchedule } from "./music.js";

const FIG = 0.296; // world units per metre for the pujari, a touch over the crowd's 0.28
const smooth = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
function mesh(geo, mat, x, y, z, parent) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	m.castShadow = true;
	parent.add(m);
	return m;
}
const lathe = (pts, segs = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
function lcg(seed) {
	let s = seed >>> 0 || 1;
	return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Where things stand, in each shrine's local frame (x across, z out from the door).
// door: where the pujari appears; spot: where he performs; stand: the brass stand with the lamp and bell;
// incense: the dhoop stand; via: his way down to the traveller; devotees: pilgrims who raise their hands.
const PLACES = {
	bhimashankar: {
		door: [0, 1.66], spot: [0, 1.92], stand: [-0.3, 1.8], incense: [0.3, 1.78], via: [[0.42, 2.3], [0.56, 2.75]],
		devotees: [[0.1, 3.9], [1.35, 2.8], [-0.45, 2.55]], lamp: "pancha",
		priests: [{ skin: SKIN[1], bare: true, shawl: 0x8a1c1c, mark: "tripundra" }],
	},
	tirupati: {
		door: [-0.15, 3.53], spot: [-0.15, 3.76], stand: [-0.5, 3.64], incense: [0.58, 3.6], via: [],
		devotees: [[-0.55, 4.3], [0.85, 4.45], [0.0, 4.75]], lamp: "camphor",
		priests: [{ skin: SKIN[3], bare: true, shawl: 0xe2b23a, dhoti: 0xf7f1df, mark: "namam" }, { skin: SKIN[2], bare: true, shawl: 0xd2a031, dhoti: 0xf7f1df, mark: "namam", at: [0.32, 3.68] }],
	},
	kedarnath: {
		door: [0, 1.96], spot: [0, 2.12], stand: [-0.33, 2.02], incense: [0.34, 2.0], via: [[0.5, 2.45], [0.64, 3.0]],
		devotees: [[0.05, 3.92], [-0.62, 2.62], [1.0, 2.7]], lamp: "kumbha",
		priests: [{ skin: SKIN[2], top: 0xefe8d8, shawl: 0x7a1d18, mark: "tripundra", beard: 0x3a3430 }],
	},
	badrinath: {
		door: [0, 1.44], spot: [0, 1.56], stand: [-0.3, 1.47], incense: [0.32, 1.46], via: [[0.1, 2.1]],
		devotees: [[0.75, 2.7], [-0.3, 2.35], [1.5, 2.3]], lamp: "pancha5",
		priests: [{ skin: SKIN[0], top: 0xf4efe2, shawl: 0xd8661c, mark: "urdhva" }],
	},
};

// ---------- figures ----------
// A pujari from the shared body: white dhoti, a bare chest (or a vest), the sacred thread, a shawl and the forehead marks.
function priest(o) {
	const J = body({ skin: o.skin, top: o.top ?? o.skin, bottom: o.dhoti ?? 0xf5f1e6, sash: o.shawl, head: "hair", beard: o.beard || 0 });
	const torso = J.torso, head = J.head;
	// with a bare chest the dhoti comes up to the waist instead of a kurta's hem
	if (!o.top) torso.children[0].material = J.hipL.children[0].material;
	// the angavastram over both shoulders
	const shawl = torso.children[2];
	shawl.position.set(0, 0.46, -0.01);
	shawl.rotation.set(Math.PI / 2 + 0.22, 0, 0);
	shawl.scale.set(1.04, 0.74, 1);
	// the sacred thread from the left shoulder across the chest
	const thread = mesh(new THREE.TorusGeometry(0.2, 0.0055, 4, 40), std(0xf2e6c4), 0, 0.3, 0, torso);
	thread.rotation.set(Math.PI / 2, 0.75, 0);
	thread.scale.set(1.05, 0.75, 1.16);
	const white = std(0xf1ede4, { roughness: 0.9 });
	const box = (w, h, x, y, m = white) => mesh(new THREE.BoxGeometry(w, h, 0.004), m, x, y, 0.097, head);
	if (o.mark === "tripundra") {
		// three lines of sacred ash
		for (const y of [0.046, 0.058, 0.07]) box(0.07, 0.0045, 0, y).position.z = 0.094;
	} else {
		// the namam (or urdhva pundra): two upright lines joined below, the red line between them
		const m = o.mark === "urdhva" ? std(0xf0d68a, { roughness: 0.9 }) : white;
		for (const x of [-0.013, 0.013]) box(0.007, 0.05, x, 0.063, m);
		box(0.033, 0.006, 0, 0.037, m);
	}
	return J;
}
// A pilgrim merged into three meshes (body and two arms on shoulder pivots) so the arms can rise for the aarti.
function devotee(seed, material) {
	const R = lcg(seed * 977 + 13);
	const pick = (a) => a[Math.floor(R() * a.length)];
	const woman = R() < 0.5, sari = pick([0xc0262d, 0xe0457b, 0xf2b01e, 0x2f8a4a, 0x7b2fa0, 0xe86a1c, 0x1f5fb0]);
	const J = body(woman
		? { skin: pick(SKIN), top: pick([0xb8261c, 0xf2c14e, 0x6a2a8a, 0x2a6aa0]), bottom: sari, sash: sari, head: R() < 0.7 ? "veil" : "hair", headColor: sari, sari: true }
		: { skin: pick(SKIN), top: pick([0xf3efe6, 0xd9d2c0, 0xf0c050, 0x8fa0b8, 0x6f8f6a]), bottom: 0xf1ebdc, sash: pick([0xb8261c, 0xf3efe6, 0xd8b04a]), head: R() < 0.4 ? "turban" : "hair", headColor: pick([0xf3efe6, 0xd33a2c, 0xe8c85a]), beard: R() < 0.3 ? 0x3a3430 : 0 });
	pose(J, { elL: -0.75, elR: -0.75, shLz: 0, shRz: 0, nod: 0.08 });
	J.root.updateMatrixWorld(true);
	const parts = { body: [], L: [], R: [] };
	const inv = { L: J.shL.matrixWorld.clone().invert(), R: J.shR.matrixWorld.clone().invert() };
	const mats = new Set();
	J.root.traverse((m) => {
		if (!m.isMesh) return;
		let side = "body";
		for (let p = m; p; p = p.parent) if (p === J.shL || p === J.shR) side = p === J.shL ? "L" : "R";
		const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
		g.applyMatrix4(side === "body" ? m.matrixWorld : new THREE.Matrix4().multiplyMatrices(inv[side], m.matrixWorld));
		for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
		const n = g.attributes.position.count, c = new Float32Array(n * 3), col = m.material.color;
		for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
		g.setAttribute("color", new THREE.BufferAttribute(c, 3));
		parts[side].push(g);
		m.geometry.dispose();
		mats.add(m.material);
	});
	for (const m of mats) m.dispose();
	const root = new THREE.Group();
	const add = (geos, parent) => {
		const mm = new THREE.Mesh(mergeGeometries(geos), material);
		mm.castShadow = true;
		parent.add(mm);
		for (const g of geos) g.dispose();
		return mm;
	};
	add(parts.body, root);
	const arms = {};
	for (const s of ["L", "R"]) {
		const piv = new THREE.Group();
		J["sh" + s].getWorldPosition(piv.position);
		root.add(piv);
		add(parts[s], piv);
		arms[s] = piv;
	}
	root.scale.setScalar(0.28 * (0.92 + R() * 0.1));
	return { root, arms, ph: R() * 6 };
}

// ---------- props, in metres ----------
function conchShell() {
	const geo = lathe([[0, -0.07], [0.022, -0.06], [0.04, -0.03], [0.048, 0.0], [0.042, 0.03], [0.026, 0.06], [0.01, 0.085], [0.004, 0.1], [0, 0.1]], 16);
	const p = geo.attributes.position;
	for (let i = 0; i < p.count; i++) {
		// twist it into a spiral and flatten one side, so it reads as a shell rather than a vase
		const y = p.getY(i), a = (y + 0.07) * 22, x = p.getX(i), z = p.getZ(i);
		p.setXYZ(i, (x * Math.cos(a) - z * Math.sin(a)) * 1.1, y, (x * Math.sin(a) + z * Math.cos(a)) * 0.78);
	}
	geo.computeVertexNormals();
	geo.scale(1.35, 1.35, 1.35);
	const m = new THREE.Mesh(geo, std(0xf6efe0, { roughness: 0.35, emissive: 0x2a2620 }));
	m.castShadow = true;
	return m;
}
function handBell() {
	const g = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.07, 8), GOLD, 0, 0.0, 0, g);
	mesh(new THREE.SphereGeometry(0.011, 8, 6), GOLD, 0, 0.04, 0, g);
	const swing = new THREE.Group();
	swing.position.y = -0.035;
	g.add(swing);
	mesh(lathe([[0.004, 0], [0.018, -0.008], [0.026, -0.03], [0.034, -0.055], [0.0, -0.05]], 16), GOLD, 0, 0, 0, swing);
	g.userData.swing = swing;
	return g;
}
// The lamp, its grip at the origin. kind: "pancha" five wicks, "pancha5" five and a centre, "kumbha" tiered, "camphor" a plate.
function lampOf(kind) {
	const g = new THREE.Group();
	const flames = [];
	mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.13, 8), GOLD, 0, 0.06, 0, g);
	const cups = (n, r, y, s = 1) => {
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			mesh(lathe([[0, 0], [0.016 * s, 0.004], [0.02 * s, 0.016], [0, 0.01]], 10), GOLD, Math.cos(a) * r, y, Math.sin(a) * r, g);
			flames.push([Math.cos(a) * r, y + 0.018, Math.sin(a) * r, s]);
		}
	};
	if (kind === "camphor") {
		mesh(lathe([[0, 0], [0.1, 0.004], [0.112, 0.02], [0.104, 0.022], [0, 0.009]], 24), GOLD, 0, 0.125, 0, g);
		mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), std(0xf6f3ec), 0, 0.14, 0, g);
		flames.push([0, 0.146, 0, 2.3]);
	} else if (kind === "kumbha") {
		mesh(lathe([[0, 0], [0.085, 0.006], [0.09, 0.016], [0, 0.01]], 20), GOLD, 0, 0.12, 0, g);
		mesh(lathe([[0.02, 0], [0.014, 0.05], [0.022, 0.08], [0.01, 0.13], [0, 0.13]], 14), GOLD, 0, 0.12, 0, g);
		cups(8, 0.07, 0.128);
		mesh(lathe([[0, 0], [0.05, 0.004], [0.054, 0.012], [0, 0.008]], 16), GOLD, 0, 0.18, 0, g);
		cups(5, 0.042, 0.186, 0.85);
		cups(1, 0, 0.25, 1.1);
	} else {
		mesh(lathe([[0, 0], [0.08, 0.005], [0.085, 0.018], [0, 0.01]], 20), GOLD, 0, 0.12, 0, g);
		cups(5, 0.056, 0.128);
		if (kind === "pancha5") cups(1, 0, 0.14, 1.1);
	}
	const c = new THREE.Vector3();
	for (const f of flames) c.add(new THREE.Vector3(f[0], f[1], f[2]));
	c.divideScalar(flames.length);
	const geos = flames.map(([x, y, z, s]) => {
		const cone = new THREE.ConeGeometry(0.011 * s, 0.042 * s, 8);
		cone.translate(x - c.x, y - c.y + 0.021 * s, z - c.z);
		return cone;
	});
	const fl = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffcf6a }));
	for (const x of geos) x.dispose();
	fl.position.copy(c);
	g.add(fl);
	const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa947, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
	glow.position.copy(c).add(new THREE.Vector3(0, 0.03, 0));
	glow.scale.setScalar(kind === "kumbha" ? 0.62 : 0.52);
	glow.renderOrder = 8;
	g.add(glow);
	g.userData = { flames: fl, glow, top: glow.position.clone() };
	return g;
}
function smokeTexture() {
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const x = c.getContext("2d"), R = lcg(3);
	const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
	gr.addColorStop(0, "rgba(255,255,255,0.55)");
	gr.addColorStop(0.5, "rgba(255,255,255,0.22)");
	gr.addColorStop(1, "rgba(255,255,255,0)");
	x.fillStyle = gr;
	x.fillRect(0, 0, 64, 64);
	x.globalCompositeOperation = "destination-out";
	for (let i = 0; i < 26; i++) {
		x.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.12})`;
		x.beginPath();
		x.arc(R() * 64, R() * 64, 3 + R() * 9, 0, Math.PI * 2);
		x.fill();
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

// ---------- two-bone reach ----------
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _t = new THREE.Quaternion();
const L1 = 0.3, L2 = 0.27, POLE = new THREE.Vector3(0, -1, -0.25).normalize();
// Point the arm from shoulder sh (elbow el) at a world-space target, bending the elbow forward and keeping it low.
function reach(sh, el, target) {
	sh.parent.updateWorldMatrix(true, false);
	_m.copy(sh.parent.matrixWorld).invert();
	const d = _v.copy(target).applyMatrix4(_m).sub(sh.position);
	const D = Math.min(L1 + L2 - 0.004, Math.max(0.1, d.length()));
	const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
	el.rotation.set(-bend, 0, 0);
	_u.set(0, -L1 - L2 * Math.cos(bend), L2 * Math.sin(bend)).normalize();
	d.normalize();
	_q.setFromUnitVectors(_u, d);
	// swing the elbow round the shoulder-to-hand line until it points as near the pole (down, a little back) as it can
	_e.set(0, -1, 0).applyQuaternion(_q).projectOnPlane(d);
	_p.copy(POLE).projectOnPlane(d);
	if (_e.lengthSq() > 1e-6 && _p.lengthSq() > 1e-6) {
		_e.normalize();
		_p.normalize();
		const a = Math.atan2(_e.clone().cross(_p).dot(d), _e.dot(_p));
		_q.premultiply(_t.setFromAxisAngle(d, a));
	}
	sh.quaternion.copy(_q);
}
// Keep a held object upright in the world whatever the hand is doing.
function level(obj, ref) {
	obj.parent.updateWorldMatrix(true, false);
	obj.parent.getWorldQuaternion(_q).invert();
	const g = new THREE.Quaternion();
	ref.getWorldQuaternion(g);
	obj.quaternion.copy(_q.multiply(g));
}
function walkPose(ph, k) {
	const s = Math.sin(ph);
	return { hipL: s * 0.36 * k, hipR: -s * 0.36 * k, kneeL: (Math.max(0, -Math.sin(ph - 0.9)) * 0.7) * k + 0.04, kneeR: (Math.max(0, Math.sin(ph - 0.9)) * 0.7) * k + 0.04, bob: Math.abs(Math.cos(ph)) * 0.03 * k - 0.015 * k, twist: s * 0.05 * k };
}
// a path of [x, z] points, sampled by fraction of its length
function along(pts, f) {
	let total = 0;
	const seg = [];
	for (let i = 1; i < pts.length; i++) {
		const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
		seg.push(l);
		total += l;
	}
	let d = Math.min(1, Math.max(0, f)) * total;
	for (let i = 0; i < seg.length; i++) {
		if (d <= seg[i] || i === seg.length - 1) {
			const k = seg[i] ? Math.min(1, d / seg[i]) : 1, a = pts[i], b = pts[i + 1];
			return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), len: total };
		}
		d -= seg[i];
	}
	return { x: pts[0][0], z: pts[0][1], yaw: 0, len: 0 };
}

const DOWN = new THREE.Vector3(0, -1, 0);
const FLOORS = new Map();

export class Aarti {
	constructor({ scene, landmarks, music = null, traveller = null, low = false }) {
		Object.assign(this, { scene, landmarks, music, traveller, low });
		this.poseTraveller = true;
		this.onPose = null;
		this.active = false;
		this.phase = null;
		// one warm light for the lamp, added once so the scene's shaders never need rebuilding mid-darshan
		this.light = new THREE.PointLight(0xffa04a, 0, 2.6, 2);
		scene.add(this.light);
		this.smokeTex = smokeTexture();
		this.ray = new THREE.Raycaster();
	}
	// Floor height under a point of the shrine's local frame, from the temple's own geometry.
	floor(lm, x, z, fallback = 0) {
		const key = lm.shrine.key + ":" + x.toFixed(2) + ":" + z.toFixed(2);
		if (FLOORS.has(key)) return FLOORS.get(key);
		if (!lm.solids) {
			// opaque temple meshes only: no pilgrims, sprites or glows
			lm.solids = [];
			lm.root.traverse((m) => {
				if (m.isMesh && !m.isInstancedMesh && !m.material.vertexColors && !m.material.transparent && !(m.userData && m.userData.aarti)) lm.solids.push(m);
			});
		}
		lm.root.updateMatrixWorld(true);
		const o = lm.root.localToWorld(new THREE.Vector3(x, 1.0, z));
		this.ray.set(o, DOWN);
		this.ray.far = 3;
		const h = this.ray.intersectObjects(lm.solids, false)[0];
		const y = h ? lm.root.worldToLocal(h.point.clone()).y : fallback;
		FLOORS.set(key, y);
		return y;
	}
	start(i) {
		this.stop();
		const lm = this.landmarks[i];
		if (!lm) return Promise.resolve(false);
		const key = lm.shrine.key, L = PLACES[key];
		this.lm = lm;
		this.L = L;
		this.sched = this.music ? this.music.aarti(key) : Object.assign({ id: -1 }, aartiSchedule(key));
		this.p = 0;
		this.meet = this.trav = this.lampH = this.bellH = null;
		const fl = (xz) => this.floor(lm, xz[0], xz[1]);
		this.y = { door: fl(L.door), spot: fl(L.spot), stand: fl(L.stand), incense: fl(L.incense) };
		const root = (this.root = new THREE.Group());
		root.userData.aarti = true;
		// the pujari (and at Tirumala a second archaka beside him)
		this.priests = L.priests.map((o) => {
			const J = priest(o);
			const fig = new THREE.Group();
			J.root.scale.setScalar(FIG);
			fig.add(J.root);
			const at = o.at || L.door;
			fig.position.set(at[0], o.at ? fl(o.at) : this.y.door, at[1]);
			fig.rotation.y = o.at ? Math.PI : 0;
			root.add(fig);
			return { J, fig, o, yaw: fig.rotation.y, ph: 0 };
		});
		this.pj = this.priests[0];
		// the brass stand with the lit lamp, the bell and later the conch
		const stand = (this.stand = new THREE.Group());
		const wood = std(0x5a3b22, { roughness: 0.8 });
		mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12), wood, 0, 0.25, 0, stand);
		mesh(lathe([[0, 0], [0.16, 0.004], [0.17, 0.022], [0, 0.012]], 20), GOLD, 0, 0.5, 0, stand);
		stand.scale.setScalar(FIG);
		stand.position.set(L.stand[0], this.y.stand, L.stand[1]);
		root.add(stand);
		this.lamp = lampOf(L.lamp);
		this.lamp.position.set(0.04, 0.505 + 0.0, 0.02);
		stand.add(this.lamp);
		this.bell = handBell();
		this.bell.position.set(-0.09, 0.56, -0.04);
		stand.add(this.bell);
		this.conch = conchShell();
		this.pj.J.root.add(this.conch);
		this.held = false;
		// the dhoop stand with three sticks of incense
		const inc = new THREE.Group();
		mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.36, 10), GOLD, 0, 0.18, 0, inc);
		const ember = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
		for (const a of [-0.25, 0, 0.25]) {
			const s = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.24, 4), std(0x6b3a22), Math.sin(a) * 0.12, 0.47, 0, inc);
			s.rotation.z = a;
			mesh(new THREE.SphereGeometry(0.007, 6, 4), ember, Math.sin(a) * 0.24, 0.585, 0, inc);
		}
		inc.scale.setScalar(FIG);
		inc.position.set(L.incense[0], this.y.incense, L.incense[1]);
		root.add(inc);
		this.incenseTip = new THREE.Vector3(L.incense[0], this.y.incense + 0.6 * FIG, L.incense[1]);
		// pilgrims who join in
		this.devMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
		this.devotees = L.devotees.map(([x, z], k) => {
			const d = devotee(i * 10 + k + 1, this.devMat);
			d.root.position.set(x, fl([x, z]), z);
			d.root.rotation.y = Math.atan2(L.door[0] - x, L.door[1] - z) + Math.sin(k * 2.3) * 0.2;
			root.add(d.root);
			return d;
		});
		// incense and camphor smoke
		this.smoke = [];
		for (let k = 0; k < (this.low ? 10 : 18); k++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xd6d2ca, transparent: true, depthWrite: false, opacity: 0 }));
			s.visible = false;
			root.add(s);
			this.smoke.push({ s, age: 1, life: 1, vx: 0, vz: 0, k: 0 });
		}
		this.emit = { lamp: 0, incense: 0 };
		// petals, one draw call
		const N = this.low ? 48 : 84;
		const pm = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: 0x2a0c00 });
		this.petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.03, 0.022), pm, N);
		this.petals.frustumCulled = false;
		this.petals.visible = false;
		const col = new THREE.Color(), R = lcg(31);
		this.pet = [];
		for (let k = 0; k < N; k++) {
			this.petals.setColorAt(k, col.set([0xff9a12, 0xffc21e, 0xe8452c, 0xff7b00, 0xd81e3a][k % 5]));
			this.pet.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(R() * 6, R() * 6, R() * 6), w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(9), ph: R() * 6, down: false });
		}
		root.add(this.petals);
		lm.root.add(root);
		this.active = true;
		this.restStaff = null;
		return new Promise((res) => (this.resolve = res));
	}
	stop() {
		if (!this.root) return;
		this.handBack();
		this.root.parent && this.root.parent.remove(this.root);
		this.root.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
			for (const m of ms) if (m !== GOLD) m.dispose();
		});
		this.devMat.dispose();
		this.root = null;
		this.light.intensity = 0;
		this.active = false;
		this.phase = null;
		if (this.music && this.sched && this.music.position(this.sched.id) >= 0) this.music.stop(1.2);
		const r = this.resolve;
		this.resolve = null;
		if (r) r(false);
	}
	dispose() {
		this.stop();
		this.scene.remove(this.light);
		this.smokeTex.dispose();
	}
	finish() {
		const r = this.resolve;
		this.resolve = null;
		this.sched = null; // the music goes on into the ambient bed by itself
		this.stop();
		if (r) r(true);
	}
	// the traveller's staff, rested on the ground while a hand is busy, comes back
	handBack() {
		if (!this.restStaff) return;
		this.restStaff.parent.remove(this.restStaff);
		this.restStaff = null;
		if (this.traveller && this.traveller.J.staff) this.traveller.J.staff.visible = true;
	}
	get focus() {
		return this.active ? this.lamp.localToWorld(this.lamp.userData.top.clone()) : null;
	}
	update(dt, t, camera) {
		if (!this.active) return;
		const mp = this.music && this.sched ? this.music.position(this.sched.id) : -1;
		this.p = mp >= 0 ? mp : this.p + dt;
		const p = this.p, c = this.sched.cues, L = this.L, pj = this.pj, J = pj.J;
		if (p >= c.end) return this.finish();
		this.phase = p < c.enter[1] ? "enter" : p < c.pick + 0.7 ? "conch" : p < c.peal[0] ? "aarti" : p < c.offer[0] ? "peal" : p < c.offer[1] ? "offer" : "leave";
		const lmRoot = this.lm.root;
		// where the pujari walks to meet the traveller
		if (!this.meet) {
			let tl = { x: L.spot[0], z: L.spot[1] + 0.9 };
			if (this.traveller) {
				const w = lmRoot.worldToLocal(this.traveller.group.getWorldPosition(new THREE.Vector3()));
				tl = { x: w.x, z: w.z };
			}
			const last = L.via.length ? L.via[L.via.length - 1] : L.spot;
			const dx = last[0] - tl.x, dz = last[1] - tl.z, d = Math.hypot(dx, dz) || 1;
			const end = [tl.x + (dx / d) * 0.3, tl.z + (dz / d) * 0.3];
			this.trav = tl;
			this.meet = [L.spot, ...L.via, end];
			this.meetY = [this.y.spot, ...L.via.map((v) => this.floor(this.lm, v[0], v[1])), this.floor(this.lm, end[0], end[1])];
		}
		// ---- the pujari's place and bearing ----
		let x, z, yaw = pj.yaw, walk = 0, lean = 0.04, nod = 0.1;
		const offerWalk = 3.0, back = c.offer[1];
		if (p < c.enter[1]) {
			const k = smooth(0, c.enter[1], p);
			x = L.door[0] + (L.spot[0] - L.door[0]) * k;
			z = L.door[1] + (L.spot[1] - L.door[1]) * k;
			yaw = 0;
			walk = p < c.enter[1] - 0.2 ? 1 : 0;
		} else if (p < c.offer[0]) {
			x = L.spot[0];
			z = L.spot[1];
			const toStand = Math.atan2(L.stand[0] - x, L.stand[1] - z);
			if (p < c.conch[1] + 0.2) yaw = 0;
			else if (p < c.pick + 0.1) yaw = angLerp(0, toStand, smooth(c.conch[1] + 0.2, c.pick - 0.2, p));
			else if (p < c.peal[1] - 1.2) yaw = angLerp(toStand, Math.PI, smooth(c.pick + 0.1, c.pick + 0.8, p));
			else yaw = angLerp(Math.PI, 0, smooth(c.peal[1] - 1.2, c.offer[0], p));
			lean += smooth(c.conch[1] + 0.3, c.pick, p) * 0.3 * (1 - smooth(c.pick, c.pick + 0.6, p));
		} else if (p < back) {
			const f = (p - c.offer[0]) / offerWalk;
			const a = along(this.meet, f);
			x = a.x;
			z = a.z;
			yaw = f < 1 ? a.yaw : Math.atan2(this.trav.x - x, this.trav.z - z);
			walk = f < 0.97 ? 1 : 0;
			lean = 0.08;
		} else {
			const f = (p - back) / (c.end - 0.8 - back);
			const pts = [...this.meet].reverse().concat([L.door]);
			const a = along(pts, f);
			x = a.x;
			z = a.z;
			yaw = a.yaw;
			walk = f < 0.98 ? 1 : 0;
			pj.fig.visible = p < c.end - 0.3;
		}
		// floor under him, from the cached heights along his way
		const yAt = (px, pz) => {
			const pts = [L.door, ...this.meet], ys = [this.y.door, ...this.meetY];
			let best = 0, bd = Infinity;
			pts.forEach((q, k) => {
				const d = Math.hypot(q[0] - px, q[1] - pz);
				if (d < bd) (bd = d), (best = k);
			});
			return ys[best];
		};
		const fy = yAt(x, z);
		pj.fig.position.x = x;
		pj.fig.position.z = z;
		pj.fig.position.y += (fy - pj.fig.position.y) * Math.min(1, dt * 8);
		pj.yaw = yaw;
		pj.fig.rotation.y = yaw;
		pj.ph += dt * 6.5 * walk;
		// the conch at the lips: head up, a slight lean back
		const blowing = p > c.conch[0] - 0.4 && p < c.conch[1];
		if (blowing) (nod = -0.18), (lean = -0.05);
		if (this.phase === "aarti") {
			const turn = Math.floor(this.sched.circle(p));
			const stage = turn % 14;
			// four circles at the feet, two at the navel, one at the face and seven over the whole form
			lean = stage < 4 ? 0.28 : stage < 6 ? 0.14 : 0.05;
		}
		pose(J, Object.assign({ lean, nod, shLz: 0, shRz: 0 }, walkPose(pj.ph, walk)));
		pj.fig.updateMatrixWorld(true);
		// ---- the hands ----
		const loc = (lx, ly, lz) => J.root.localToWorld(new THREE.Vector3(lx, ly, lz));
		const conchAt = p < c.enter[1] + 0.1 ? 0 : smooth(c.enter[1] + 0.1, c.conch[0], p) * (1 - smooth(c.conch[1], c.conch[1] + 0.4, p));
		let lampT, bellT;
		if (!this.held) {
			// carrying the conch, raising it, then reaching to the stand
			// held at the chest, then raised with its tip at the lips and the shell out in front
			this.conch.position.set(0, 1.25 + conchAt * 0.3, 0.27 + conchAt * 0.02);
			this.conch.rotation.set(-Math.PI / 2 + conchAt * 0.12, 0, 0.3);
			const cw = this.conch.getWorldPosition(new THREE.Vector3());
			const reachK = smooth(c.conch[1] + 0.3, c.pick - 0.1, p);
			const st = this.stand.localToWorld(new THREE.Vector3(0, 0.58, 0));
			const o0 = J.root.localToWorld(new THREE.Vector3());
			lampT = cw.clone().add(J.root.localToWorld(new THREE.Vector3(-0.055, -0.05, -0.03)).sub(o0));
			bellT = cw.clone().add(J.root.localToWorld(new THREE.Vector3(0.05, -0.055, 0.05)).sub(o0));
			lampT.lerp(st, reachK);
			bellT.lerp(st, reachK);
			if (p >= c.pick) {
				// set the conch down; take up the lamp and the bell
				this.held = true;
				this.stand.add(this.conch);
				this.conch.position.set(0.06, 0.53, -0.08);
				this.conch.rotation.set(0, 0.6, Math.PI / 2);
				J.handL.add(this.lamp);
				this.lamp.position.set(0, -0.01, 0.025);
				J.handR.add(this.bell);
				this.bell.position.set(0, -0.005, 0.02);
			}
		} else if (this.phase === "aarti" || this.phase === "peal" || this.phase === "conch") {
			const turn = this.sched.circle(p), th = turn * Math.PI * 2, stage = Math.floor(turn) % 14;
			let cy = stage < 4 ? 1.02 : stage < 6 ? 1.15 : stage < 7 ? 1.45 : 1.28;
			let r = stage < 7 ? 0.12 : 0.22;
			if (this.phase === "peal") (cy = 1.5), (r = 0.2);
			if (this.phase === "conch") (cy = 1.25), (r = 0);
			lampT = loc(-0.08 - r * Math.sin(th), cy + r * Math.cos(th), 0.42);
			const rg = this.sched.ring(p);
			bellT = loc(0.2, 1.2 + (rg >= 0 ? Math.sin(rg * Math.PI) * 0.012 : 0), 0.28);
		} else if (this.phase === "offer" && p > c.offer[0] + offerWalk && this.traveller) {
			// hold the flame out to the traveller at chest height
			const tw = this.traveller.J.torso.getWorldPosition(new THREE.Vector3());
			const me = J.torso.getWorldPosition(new THREE.Vector3());
			lampT = tw.clone().lerp(me, 0.5);
			lampT.y = tw.y + 0.03;
			const up = p > c.petals - 0.5 && p < c.petals + 0.4;
			bellT = up ? loc(0.25, 1.75, 0.25) : loc(0.22, 1.15, 0.22);
		} else {
			lampT = loc(-0.1, 1.2, 0.34);
			bellT = loc(0.22, 1.12, 0.22);
		}
		// ease the hands toward their marks so changes of phase never snap
		const k = 1 - Math.exp(-dt * 14);
		if (!this.lampH) this.lampH = lampT.clone(), (this.bellH = bellT.clone());
		this.lampH.lerp(lampT, k);
		this.bellH.lerp(bellT, k);
		reach(J.shL, J.elL, this.lampH);
		reach(J.shR, J.elR, this.bellH);
		pj.fig.updateMatrixWorld(true);
		if (this.held) {
			level(this.lamp, pj.fig.parent);
			level(this.bell, pj.fig.parent);
			const rg = this.sched.ring(p);
			this.bell.userData.swing.rotation.x = rg >= 0 ? Math.sin(rg * Math.PI) * 0.6 : 0;
		}
		// the second archaka stands by with folded hands
		for (const q of this.priests.slice(1)) {
			pose(q.J, { shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, shR: -0.55, shRz: -0.25, shRy: -0.5, elR: -1.55, nod: 0.18 + Math.sin(t * 0.7) * 0.04 });
			q.fig.rotation.y = this.phase === "offer" || this.phase === "leave" ? angLerp(q.fig.rotation.y, 0, dt * 2) : q.fig.rotation.y;
		}
		// ---- flames, light, smoke ----
		const ud = this.lamp.userData;
		ud.flames.scale.set(1, 1 + Math.sin(t * 13) * 0.1 + Math.sin(t * 7.7) * 0.07, 1);
		ud.glow.material.opacity = 0.82 + Math.sin(t * 5.3) * 0.1;
		const flame = this.lamp.localToWorld(ud.top.clone());
		const far = camera ? Math.min(3, Math.max(1, camera.position.distanceTo(flame) / 4)) : 1;
		ud.glow.scale.setScalar((ud.glowBase || (ud.glowBase = ud.glow.scale.x)) * far);
		this.light.position.copy(flame);
		this.light.intensity = (this.low ? 0.9 : 1.1) * (0.85 + Math.sin(t * 17) * 0.07 + Math.sin(t * 29 + 1.3) * 0.05 + Math.sin(t * 6.1) * 0.05) * (pj.fig.visible ? 1 : smooth(c.end, c.end - 0.3, p));
		this.updateSmoke(dt, p, lmRoot.worldToLocal(flame.clone()));
		// ---- the pilgrims join in ----
		const raise = Math.max(smooth(c.song[1] - 7, c.song[1] - 5.5, p) * (1 - smooth(c.peal[1] - 0.5, c.peal[1] + 0.6, p)), 0);
		this.devotees.forEach((d, n) => {
			const r = n === 1 ? raise * 0.6 + smooth(c.aarti[0] + 6, c.aarti[0] + 8, p) * 0.4 * (1 - smooth(c.offer[0], c.offer[0] + 1, p)) : raise;
			const sway = Math.sin(t * 2.2 + d.ph) * 0.12 * r;
			d.arms.L.rotation.set(-0.5 - 2.1 * r + sway, 0, 0.32 - 0.62 * r);
			d.arms.R.rotation.set(-0.5 - 2.1 * r - sway, 0, -0.32 + 0.62 * r);
		});
		this.updatePetals(dt, p, c);
		if (this.traveller && this.poseTraveller) this.takeFlame(p, c, flame, offerWalk);
	}
	updateSmoke(dt, p, flameL) {
		const c = this.sched.cues;
		const lampOn = this.held && p < c.offer[1];
		this.emit.lamp += dt * (lampOn ? 2.6 : 0.6);
		this.emit.incense += dt * 1.1;
		for (const src of ["lamp", "incense"]) {
			while (this.emit[src] >= 1) {
				this.emit[src] -= 1;
				const q = this.smoke.find((s) => s.age >= s.life);
				if (!q) break;
				const o = src === "lamp" ? flameL : this.incenseTip;
				q.s.position.copy(o);
				q.age = 0;
				q.life = 2.4 + Math.random() * 1.6;
				q.vx = (Math.random() - 0.5) * 0.05 + 0.02;
				q.vz = (Math.random() - 0.5) * 0.05;
				q.k = src === "lamp" ? 1 : 0.7;
				q.s.material.color.set(src === "lamp" ? 0xcfcac2 : 0xbcc0c8);
				q.s.visible = true;
			}
		}
		for (const q of this.smoke) {
			if (q.age >= q.life) {
				q.s.visible = false;
				continue;
			}
			q.age += dt;
			const f = q.age / q.life;
			q.s.position.x += q.vx * dt;
			q.s.position.z += q.vz * dt;
			q.s.position.y += (0.13 - f * 0.05) * dt;
			q.s.scale.setScalar(0.05 + f * 0.32);
			q.s.material.opacity = Math.sin(Math.PI * f) * 0.3 * q.k;
			q.s.material.rotation += dt * 0.3;
		}
	}
	updatePetals(dt, p, c) {
		const pm = this.petals;
		if (p < c.petals) return;
		const _o = new THREE.Object3D();
		if (!pm.visible) {
			pm.visible = true;
			const hand = this.lm.root.worldToLocal(this.pj.J.handR.getWorldPosition(new THREE.Vector3()));
			const R = lcg(77);
			this.petY = this.trav ? this.floor(this.lm, this.trav.x, this.trav.z) : this.y.spot;
			for (const q of this.pet) {
				const a = R() * Math.PI * 2, s = 0.15 + R() * 0.35;
				q.p.copy(hand).add(new THREE.Vector3((R() - 0.5) * 0.08, R() * 0.06, (R() - 0.5) * 0.08));
				q.v.set(Math.cos(a) * s, 0.35 + R() * 0.45, Math.sin(a) * s);
				q.down = false;
			}
		}
		for (let k = 0; k < this.pet.length; k++) {
			const q = this.pet[k];
			if (!q.down) {
				q.v.y -= 0.9 * dt;
				q.v.multiplyScalar(1 - Math.min(0.9, dt * 1.6));
				if (q.v.y < -0.16) q.v.y = -0.16;
				q.ph += dt * 4;
				q.p.addScaledVector(q.v, dt);
				q.p.x += Math.sin(q.ph) * 0.03 * dt;
				q.r.x += q.w.x * dt;
				q.r.y += q.w.y * dt;
				q.r.z += q.w.z * dt;
				if (q.p.y <= this.petY + 0.004 && q.v.y < 0) {
					q.p.y = this.petY + 0.004;
					q.down = true;
					q.r.set(-Math.PI / 2, 0, q.r.z);
				}
			}
			_o.position.copy(q.p);
			_o.rotation.copy(q.r);
			_o.updateMatrix();
			pm.setMatrixAt(k, _o.matrix);
		}
		pm.instanceMatrix.needsUpdate = true;
	}
	// The traveller rests the staff, passes a palm over the flame and touches the eyes, twice.
	takeFlame(p, c, flame, offerWalk) {
		const T = this.traveller, J = T.J;
		const g0 = c.offer[0] + offerWalk + 0.4, g1 = c.petals - 0.6;
		const w = smooth(g0, g0 + 0.6, p) * (1 - smooth(g1 - 0.6, g1, p));
		if (w <= 0.001) {
			if (p > g1) this.handBack();
			return;
		}
		T.group.updateWorldMatrix(true, true);
		if (!this.restStaff && J.staff) {
			// leave the staff standing where it is
			const s = new THREE.Mesh(J.staff.geometry, J.staff.material);
			J.staff.matrixWorld.decompose(s.position, s.quaternion, s.scale);
			this.scene.add(s);
			this.restStaff = s;
		}
		if (J.staff) J.staff.visible = false;
		const sc = T.group.getWorldScale(new THREE.Vector3()).x * 0.28;
		const hand = J.handR.getWorldPosition(new THREE.Vector3());
		const head = J.head.getWorldPosition(new THREE.Vector3());
		const fwd = new THREE.Vector3(Math.sin(T.yaw), 0, Math.cos(T.yaw)).applyQuaternion(T.group.getWorldQuaternion(new THREE.Quaternion()));
		const eyes = head.addScaledVector(fwd, 0.13 * sc).add(new THREE.Vector3(0, -0.01 * sc, 0));
		const n = 2, span = (g1 - 0.6 - (g0 + 0.5)) / n;
		const s = Math.max(0, p - g0 - 0.5) / span, pass = Math.min(n - 1, Math.floor(s)), f = s - pass;
		const a = f * Math.PI * 4;
		const over = flame.clone().add(new THREE.Vector3(Math.cos(a) * 0.03 * sc, 0.09 * sc, Math.sin(a) * 0.03 * sc));
		// over the flame, up to the eyes, and (but for the last pass) back down to the flame
		const toEyes = p < g0 + 0.5 ? 0 : smooth(0.42, 0.62, f) * (pass === n - 1 ? 1 : 1 - smooth(0.9, 1, f));
		const target = over.lerp(eyes, toEyes);
		reach(J.shR, J.elR, hand.lerp(target, w));
		J.head.rotation.x += 0.22 * toEyes * w;
		if (this.onPose) this.onPose(J, w);
	}
}
