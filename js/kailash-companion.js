// On the parikrama the traveller does not walk alone: a yakman hired at Darchen walks a few steps ahead leading a
// pack yak with the bedding and the food, as the MEA batches hire yaks, ponies and porters for the three days.
// Both walk the path at the traveller's pace and stop when the traveller stops (main.js calls update each frame on
// the Kailash journey; it does nothing elsewhere on the route).
import * as THREE from "three";
import { NAMASTE, body, crowdOpts, mergeFigure, pose, stride } from "./pilgrim.js";
import { KNEEL, NAMASTE_ARMS, kneelDown, prostrate } from "./sanctum.js";
import { yak } from "./life.js";
import { lerp, rand } from "./util.js";

const M = 0.28;
const FIG = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const noRay = () => {};
// A pilgrim of the kora dressed as Tibetans walk it: a long chuba of dark wool, maroon, brown or charcoal, belted
// with a bright sash over trousers, felt boots and a fur-trimmed hat; the yakman's dress with the robe dark enough
// not to be mistaken for skin. With work: a prostrator's long leather apron, chest to knees, and the wooden boards
// strapped to the palms that slide on the ground ahead.
const CHUBA = [0x3e1a1c, 0x4a1e20, 0x33241a, 0x2b2826, 0x3a2a22];
function korapa(R, work) {
	const o = Object.assign(crowdOpts(R, "tibetan"), { lod: 0, gender: "m", hairStyle: undefined, pyjama: true, bag: false, sleeve: 1, head: "cap" });
	o.headColor = [0x6a5a3e, 0x2a2420, 0x8a6a3a][Math.floor(R() * 3)];
	o.capBand = R() < 0.5 ? 0xd8b04a : 0x8a1c1c;
	o.top = o.bottom = CHUBA[Math.floor(R() * CHUBA.length)];
	const J = body(o);
	const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
	const add = (geo, m, x, y, z, parent, rx = 0) => {
		const mesh = new THREE.Mesh(geo, m);
		mesh.position.set(x, y, z);
		mesh.rotation.x = rx;
		parent.add(mesh);
		return mesh;
	};
	const robe = mat(o.top), sash = mat(o.sash), boot = mat(0x241a14), trim = mat(0x7a1c1c);
	// the chuba's skirt, from the belt to below the knee, and the sash wound round over it
	add(new THREE.CylinderGeometry(0.175, 0.225, 0.52, 12), robe, 0, -0.22, 0.005, J.hips);
	add(new THREE.TorusGeometry(0.172, 0.022, 5, 14), sash, 0, 0.03, 0.005, J.hips, Math.PI / 2);
	for (const S of ["L", "R"]) {
		add(new THREE.CylinderGeometry(0.056, 0.06, 0.2, 9), boot, 0, 0.04, 0, J["ankle" + S]);
		add(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 9), trim, 0, 0.14, 0, J["ankle" + S]);
		add(new THREE.SphereGeometry(1, 9, 6), boot, 0, -0.035, 0.07, J["ankle" + S]).scale.set(0.06, 0.05, 0.13);
	}
	if (work) {
		const leather = mat(0x4e3220), wood = mat(0x6b4a2a);
		add(new THREE.BoxGeometry(0.29, 0.5, 0.016), leather, 0, -0.21, 0.212, J.hips, -0.1);
		add(new THREE.BoxGeometry(0.25, 0.38, 0.016), leather, 0, 0.24, 0.135, J.torso, 0.04);
		for (const [S, side] of [["L", -1], ["R", 1]]) add(new THREE.BoxGeometry(0.022, 0.14, 0.09), wood, -side * 0.028, -0.075, 0, J["hand" + S]);
	}
	return J;
}
// The yakman as a flipbook: eight poses of a stride and one standing, swapped as he walks. (A Bonpo pilgrim, chuba:
// the same, dressed for the kora.)
function walker(seed, chuba = false) {
	const R = rand(seed);
	const J = chuba ? korapa(R, false) : body(Object.assign(crowdOpts(R, "tibetan"), { lod: 0, gender: "m" }));
	const g = new THREE.Group();
	const frames = [];
	for (let i = 0; i <= 8; i++) {
		const s = i < 8 ? stride((i / 8) * Math.PI * 2) : null;
		const p = s ? { hipL: s.hipL, hipR: s.hipR, kneeL: s.kneeL, kneeR: s.kneeR, ankleL: s.footL - s.hipL - s.kneeL, ankleR: s.footR - s.hipR - s.kneeR, bob: s.bob, shL: 0.25 * Math.sin((i / 8) * Math.PI * 2), shR: -0.55, elR: -0.9, lean: 0.08, nod: 0.05 } : { shL: 0.04, shR: -0.55, elR: -0.9, nod: 0.05 };
		pose(J, p);
		const m = new THREE.Mesh(mergeFigure(J), FIG);
		m.scale.setScalar(M);
		m.castShadow = true;
		m.visible = false;
		m.raycast = noRay;
		frames.push(m);
		g.add(m);
	}
	return { g, frames, phase: 0 };
}
// A pack yak whose legs swing as it walks: the body without legs, and four legs on pivots at the hips.
function walkingYak() {
	const g = new THREE.Group();
	const col = 0x5c3c26;
	const bodyGeo = yak(col, "stand", true, false);
	const m = new THREE.Mesh(bodyGeo, FIG);
	m.castShadow = true;
	m.raycast = noRay;
	g.add(m);
	const legMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
	const legs = [];
	for (const [lx, lz] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.6], [0.2, -0.6]]) {
		const p = new THREE.Group();
		p.position.set(lx, 0.92, lz);
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.92, 7).translate(0, -0.46, 0), legMat);
		leg.castShadow = true;
		leg.raycast = noRay;
		p.add(leg);
		g.add(p);
		legs.push(p);
	}
	g.scale.setScalar(M);
	return { g, legs, phase: 0 };
}

export class Companions {
	constructor(scene) {
		this.man = walker(4211);
		this.yak = walkingYak();
		this.group = new THREE.Group();
		this.group.add(this.man.g, this.yak.g);
		this.group.visible = false;
		scene.add(this.group);
		this.last = null;
	}
	// on: whether they walk with the traveller now; s: the traveller's distance along the route; end: where the leg
	// ends (they stop short of the stop); point(s, lane): a point on the path; moving: whether the journey moves
	update(on, s, end, point, moving) {
		this.group.visible = on;
		if (!on) {
			this.last = null;
			return;
		}
		const place = (o, ds, lane, scale = 1) => {
			const sa = Math.min(s + ds, end), p = point(sa, lane), q = point(Math.min(sa + 0.25, end + 0.25), lane);
			const yaw = Math.atan2(q.x - p.x, q.z - p.z);
			o.position.set(p.x, p.y + 0.01, p.z);
			o.rotation.y = Number.isFinite(yaw) && Math.hypot(q.x - p.x, q.z - p.z) > 1e-4 ? yaw : o.rotation.y;
			void scale;
			return sa;
		};
		const sm = place(this.man.g, 1.25, 0.55);
		place(this.yak.g, 0.85, 0.75);
		// the stride follows the ground covered
		const d = this.last === null ? 0 : Math.max(0, sm - this.last);
		this.last = sm;
		const walking = moving && d > 1e-5;
		this.man.phase += d / (0.75 * M * 2) * 8;
		const f = walking ? Math.floor(this.man.phase) % 8 : 8;
		this.man.frames.forEach((m, i) => (m.visible = i === f));
		this.yak.phase += (d / (1.4 * M)) * Math.PI;
		this.yak.legs.forEach((p, i) => (p.rotation.x = walking ? Math.sin(this.yak.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 : 0));
	}
}

// Tibetan pilgrims who go round the mountain by full-body prostrations, as some do, taking two weeks or more over
// the circuit: palms joined, down on the knees, laid face down with the arms stretched out beyond the head, up
// again, and a step forward to where the hands reached, then again. And a few Bonpo pilgrims, who go round
// anticlockwise, the other way from everyone else, walking towards the traveller. Both on the far verge of the
// path, beyond the yakman, two of each to each day of the kora (placed by description, not at any recorded spot;
// none on the low setting, and standing still under reduced motion). main.js calls update each frame.
const OVERHEAD = { shL: -3.05, shR: -3.05, shLz: -0.2, shRz: 0.2, elL: -0.05, elR: -0.05, shLy: 0, shRy: 0 };
function prostrator(seed) {
	const J = korapa(rand(seed), true);
	const keys = [NAMASTE, { ...kneelDown(0.4), ...NAMASTE_ARMS }, { ...kneelDown(0.8), ...NAMASTE_ARMS }, { ...KNEEL, ...NAMASTE_ARMS }];
	for (const f of [0.35, 0.7, 1]) keys.push({ ...prostrate(f).pose, ...(f < 0.5 ? NAMASTE_ARMS : OVERHEAD) });
	for (const ph of [0, Math.PI]) {
		const st = stride(ph);
		keys.push({ hipL: st.hipL, hipR: st.hipR, kneeL: st.kneeL, kneeR: st.kneeR, ankleL: st.footL - st.hipL - st.kneeL, ankleR: st.footR - st.hipR - st.kneeR, bob: st.bob, ...NAMASTE_ARMS });
	}
	const g = new THREE.Group(), frames = keys.map((k) => {
		pose(J, k);
		const m = new THREE.Mesh(mergeFigure(J), FIG);
		m.scale.setScalar(M);
		m.castShadow = true;
		m.visible = false;
		m.raycast = noRay;
		g.add(m);
		return m;
	});
	return { g, frames };
}
// one round of a prostration, as [seconds, frame]: down, a moment flat, up; then two paces forward (frames 7, 8)
const ROUND = [[1, 0], [0.6, 1], [0.6, 2], [0.4, 3], [0.5, 4], [0.5, 5], [1.4, 6], [0.4, 5], [0.4, 4], [0.4, 3], [0.4, 2], [0.4, 1]];
const STEP_T = 1.0, ROUND_T = ROUND.reduce((a, r) => a + r[0], 0) + STEP_T;
function roundFrame(u) {
	for (const [d, f] of ROUND) {
		if (u < d) return [f, false];
		u -= d;
	}
	return [7 + (Math.floor(u * 3) % 2), true];
}
// lanes on the far side of the path from the traveller (before main.js turns them to the side the traffic keeps)
const PROSTRATE_LANE = 1.55, BON_LANE = 1.45;
export class KoraPilgrims {
	constructor(scene, low) {
		this.group = new THREE.Group();
		this.group.name = "kora-pilgrims";
		scene.add(this.group);
		this.low = low;
		this.list = null;
	}
	// chapters: the route's legs, each null unless it is a day of the kora; point(s, lane): a point on the path
	update(dt, camera, chapters, point) {
		if (this.low) return;
		if (!this.list) {
			this.list = [];
			let seed = 9100;
			for (const c of chapters) if (c) for (const f of [0.3, 0.7]) {
				const pr = prostrator(seed++);
				this.group.add(pr.g);
				this.list.push({ kind: "prostrate", o: pr, s: lerp(c.s0, c.s1, f), c, u: f * 5 });
				const w = walker(seed++, true);
				this.group.add(w.g);
				this.list.push({ kind: "bon", o: w, s: lerp(c.s0, c.s1, f + 0.12), c });
			}
		}
		const cp = camera.position;
		for (const p of this.list) {
			// (a Bonpo walker steps out round a prostrator lying on the verge, and back again)
			if (p.kind === "bon") {
				const by = this.list.some((o) => o.kind === "prostrate" && o.c === p.c && p.s > o.s - 0.35 && p.s < o.s + 1.0);
				p.lane = (p.lane ?? BON_LANE) + ((by ? BON_LANE + 0.6 : BON_LANE) - (p.lane ?? BON_LANE)) * Math.min(1, dt * 4);
			}
			const lane = p.kind === "bon" ? p.lane : PROSTRATE_LANE;
			const a = point(p.s, lane);
			const near = Math.abs(a.x - cp.x) < 30 && Math.abs(a.z - cp.z) < 30;
			p.o.g.visible = near;
			if (!near) continue;
			let f = p.kind === "bon" ? 8 : 0, ds = 0;
			if (RM) {
				// (standing still, palms joined or at rest)
			} else if (p.kind === "prostrate") {
				// round the mountain clockwise, with it on the right hand, a body's length at a time
				p.u += dt;
				const [fr, stepping] = roundFrame(p.u % ROUND_T);
				f = fr;
				if (stepping) ds = (2.2 * M * dt) / STEP_T;
			} else {
				// anticlockwise, at a walking pace; round again from the far end of the day's way
				ds = -0.75 * M * 1.2 * dt;
				p.o.phase += (-ds / (0.75 * M * 2)) * 8;
				f = Math.floor(p.o.phase) % 8;
			}
			p.s += ds;
			if (p.s < p.c.s0 + 1) p.s = p.c.s1 - 3;
			if (p.s > p.c.s1 - 3) p.s = p.c.s0 + 1;
			const q = point(p.s, lane), r = point(p.s + (p.kind === "bon" ? -0.25 : 0.25), lane);
			p.o.g.position.set(q.x, q.y + 0.01, q.z);
			p.o.g.rotation.y = Math.atan2(r.x - q.x, r.z - q.z);
			p.o.frames.forEach((m, i) => (m.visible = i === f));
		}
	}
}
