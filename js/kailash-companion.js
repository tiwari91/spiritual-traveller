// On the parikrama the traveller does not walk alone: a yakman hired at Darchen walks a few steps ahead leading a
// pack yak with the bedding and the food, as the MEA batches hire yaks, ponies and porters for the three days.
// Both walk the path at the traveller's pace and stop when the traveller stops (main.js calls update each frame on
// the Kailash journey; it does nothing elsewhere on the route).
import * as THREE from "three";
import { body, crowdOpts, mergeFigure, pose, stride } from "./pilgrim.js";
import { yak } from "./life.js";
import { rand } from "./util.js";

const M = 0.28;
const FIG = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
// The yakman as a flipbook: eight poses of a stride and one standing, swapped as he walks.
function walker(seed) {
	const R = rand(seed);
	const J = body(Object.assign(crowdOpts(R, "tibetan"), { lod: 0, gender: "m" }));
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
		frames.push(m);
		g.add(m);
	}
	return { g, frames, phase: 0 };
}
// A pack yak whose legs swing as it walks: the body without legs, and four legs on pivots at the hips.
function walkingYak() {
	const g = new THREE.Group();
	const col = 0x2a2420;
	const bodyGeo = yak(col, "stand", true, false);
	const m = new THREE.Mesh(bodyGeo, FIG);
	m.castShadow = true;
	g.add(m);
	const legMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
	const legs = [];
	for (const [lx, lz] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.6], [0.2, -0.6]]) {
		const p = new THREE.Group();
		p.position.set(lx, 0.92, lz);
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.92, 7).translate(0, -0.46, 0), legMat);
		leg.castShadow = true;
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
