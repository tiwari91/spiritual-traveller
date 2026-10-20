// On the parikrama the traveller does not walk alone: a yakman hired at Darchen walks a few steps ahead leading a
// pack yak with the bedding and the food, as the MEA batches hire yaks, ponies and porters for the three days.
// Both walk the path at the traveller's pace and stop when the traveller stops (main.js calls update each frame on
// the Kailash journey; it does nothing elsewhere on the route).
import * as THREE from "three";
import { NAMASTE, body, crowdOpts, drapeable, mergeFigure, pose, stride } from "./pilgrim.js";
import { KNEEL, NAMASTE_ARMS, kneelDown, prostrate } from "./sanctum.js";
import { yak } from "./life.js";
import { lerp, rand } from "./util.js";

const M = 0.28;
const FIG = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const noRay = () => {};
// A pilgrim of the kora dressed as Tibetans walk it: a long chuba of dark wool, maroon, brown or charcoal, belted
// with a bright sash over trousers, felt boots and a fur-trimmed hat; the yakman's dress with the robe dark enough
// not to be mistaken for skin. About a third are women: the chuba to the ankle, the striped pangden apron of a married
// woman over it and the hair in braids. The chuba's skirt is cloth (pilgrim.js drapes it to the pose): it falls over
// the knees when kneeling and lies along the legs when prone. With work: a prostrator's leather apron, chest to knees
// (a woman's pangden instead below the waist), and the wooden boards strapped to the palms that slide on the ground.
const CHUBA = [0x3e1a1c, 0x4a1e20, 0x33241a, 0x2b2826, 0x3a2a22];
const PANGDEN = [0xc8282a, 0x2a6aa8, 0xe8b020, 0x2a8a4a, 0xe8e0cc, 0x8a2a6a, 0xd8641c];
// an apron hanging from the belt in front, cloth draped to the pose (pilgrim.js): w wide, from the belt down to
// bot (torso frame), stripes of colour across it or one colour
function apron(J, w, bot, z0, cols) {
	// (each band its own rows of points, so the colours meet in a sharp line, not a blend)
	const nx = 3, ny = 10, pos = [], col = [], idx = [], c = new THREE.Color(), W = nx + 1;
	for (let j = 0; j < ny; j++) {
		c.setHex(cols[j % cols.length]);
		for (const t of [j / ny, (j + 1) / ny]) for (let i = 0; i <= nx; i++) {
			const u = i / nx - 0.5, y = lerp(0.06, bot, t);
			// round the front of the skirt, which flares out below the hips
			pos.push(u * w, y, z0 + 0.16 * Math.min(1, -y / 0.5) - 0.06 * u * u);
			col.push(c.r, c.g, c.b);
		}
		for (let i = 0; i < nx; i++) {
			const a = j * 2 * W + i, b = a + W;
			idx.push(a, b, a + 1, a + 1, b, b + 1);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }));
	J.torso.add(m);
	const top = pos.slice(0, W * 3);
	drapeable(J, m, { frame: "torso", clear: 0.03, wT: (y) => Math.min(1, Math.max(0, (y + 0.02) / 0.12)), anchor: (v, k) => (k < W ? null : new THREE.Vector3(top[(k % W) * 3], top[1], top[(k % W) * 3 + 2])) });
	return m;
}
function korapa(R, work) {
	// (after the dress is drawn: the generator's first draws barely change between neighbouring seeds)
	const base = crowdOpts(R, "tibetan"), woman = R() < 0.4;
	const o = Object.assign(base, { lod: 0, gender: woman ? "f" : "m", hairStyle: woman ? "braid" : undefined, pyjama: true, bag: false, sleeve: 1, head: woman ? "hair" : "cap", beard: 0, mark: "none", hem: woman ? -0.86 : -0.74 });
	if (woman) o.moustache = 0;
	o.headColor = [0x6a5a3e, 0x2a2420, 0x8a6a3a][Math.floor(R() * 3)];
	o.capBand = R() < 0.5 ? 0xd8b04a : 0x8a1c1c;
	o.top = CHUBA[Math.floor(R() * CHUBA.length)];
	if (!woman) o.bottom = o.top;
	const J = body(o);
	J.woman = woman;
	if (woman) {
		// the plaits on a pivot at the nape, so that lying face down they can lie along the back
		const nape = new THREE.Vector3(0, -0.02, -0.098), braid = new THREE.Group();
		braid.position.copy(nape);
		for (const c of [...J.head.children]) if (c.isMesh && c.position.y < -0.05 && c.position.z < -0.09) {
			c.position.sub(nape);
			braid.add(c);
		}
		J.head.add(braid);
		J.braid = braid;
	}
	const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
	const add = (geo, m, x, y, z, parent, rx = 0) => {
		const mesh = new THREE.Mesh(geo, m);
		mesh.position.set(x, y, z);
		mesh.rotation.x = rx;
		parent.add(mesh);
		return mesh;
	};
	const sash = mat(o.sash), boot = mat(0x241a14), trim = mat(0x7a1c1c);
	// the sash wound round the waist over the chuba
	add(new THREE.TorusGeometry(0.172, 0.022, 5, 14), sash, 0, 0.03, 0.005, J.hips, Math.PI / 2);
	for (const S of ["L", "R"]) {
		add(new THREE.CylinderGeometry(0.056, 0.06, 0.2, 9), boot, 0, 0.04, 0, J["ankle" + S]);
		add(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 9), trim, 0, 0.14, 0, J["ankle" + S]);
		add(new THREE.SphereGeometry(1, 9, 6), boot, 0, -0.035, 0.07, J["ankle" + S]).scale.set(0.06, 0.05, 0.13);
	}
	if (woman) {
		// the pangden: narrow bands of bright colours, three or four repeated down its length
		const k = Math.floor(R() * PANGDEN.length), cols = [0, 2, 4, 1, 5].map((i) => PANGDEN[(k + i) % PANGDEN.length]);
		apron(J, 0.27, -0.66, 0.15, cols);
	}
	if (work) {
		const wood = mat(0x6b4a2a);
		if (!woman) apron(J, 0.29, -0.6, 0.16, [0x4e3220]);
		add(new THREE.BoxGeometry(0.25, 0.38, 0.016), mat(0x4e3220), 0, 0.24, 0.135, J.torso, 0.04);
		for (const [S, side] of [["L", -1], ["R", 1]]) add(new THREE.BoxGeometry(0.022, 0.14, 0.09), wood, -side * 0.028, -0.075, 0, J["hand" + S]);
	}
	return J;
}
// the joints a figure rests on the ground by in the pose it is in (those near the floor), in the figure's frame,
// and the head, hips and feet (for the check that a prostrator lies on the ground: tests/check.mjs)
const REST = ["ankleL", "ankleR", "kneeL", "kneeR", "hips", "head", "handL", "handR"];
function rests(J, m) {
	J.root.updateMatrixWorld(true);
	const at = (k) => J[k].getWorldPosition(new THREE.Vector3());
	m.userData.rest = REST.map(at).filter((v) => v.y < 0.3).map((v) => [v.x, v.z]);
	const a = at("ankleL").add(at("ankleR")).multiplyScalar(0.5);
	m.userData.body = { head: at("head"), hips: at("hips"), feet: a };
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
	return { g, frames, phase: 0, woman: !!J.woman };
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
	const g = new THREE.Group(), frames = keys.map((k, i) => {
		pose(J, k);
		if (J.braid) J.braid.rotation.x = TILT[i] > 0.5 ? -0.5 : 0;
		const m = new THREE.Mesh(mergeFigure(J), FIG);
		rests(J, m);
		m.scale.setScalar(M);
		m.castShadow = true;
		m.visible = false;
		m.raycast = noRay;
		g.add(m);
		return m;
	});
	// how far each frame lies along the ground's slope (standing and kneeling stay upright)
	TILT.forEach((t, i) => (frames[i].userData.tilt = t));
	return { g, frames, woman: J.woman };
}
const TILT = [0, 0, 0, 0, 0.35, 0.8, 1, 0, 0];
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
const LANES = [1.25, 1.4, 1.55, 1.7, 1.85];
const _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, "YXZ");
// How uneven the ground is where a prostrator would lie at s on the lane: the length of the body ahead and its
// breadth either side, the slope across it and along it and how far it is from a plane (on a lane's verge where the
// ground falls away, or a bank, it is large).
function rough(point, s, lane) {
	const h = [];
	for (const ds of [-0.05, 0.22, 0.5]) for (const dl of [-0.45, 0, 0.45]) h.push(point(s + ds, lane + dl).y);
	const across = Math.abs(h[2] + h[5] + h[8] - h[0] - h[3] - h[6]) / 3 / (0.9 * M), along = Math.abs(h[6] + h[7] + h[8] - h[0] - h[1] - h[2]) / 3 / 0.55;
	let bend = 0;
	for (let i = 0; i < 3; i++) bend = Math.max(bend, Math.abs(h[i * 3] + h[i * 3 + 2] - 2 * h[i * 3 + 1]), Math.abs(h[i] + h[i + 6] - 2 * h[i + 3]));
	return across + 0.5 * along + bend * 20;
}
export class KoraPilgrims {
	constructor(scene, low) {
		this.group = new THREE.Group();
		this.group.name = "kora-pilgrims";
		scene.add(this.group);
		this.low = low;
		this.list = null;
	}
	// a prostrator's place: the flattest stretch of the verge near s (from), and the lane there
	settle(p, point, from) {
		let best = Infinity;
		for (let ds = from === undefined ? 0 : -3; ds <= (from === undefined ? 0 : 3); ds += 0.25) {
			const s = Math.min(p.c.s1 - 3, Math.max(p.c.s0 + 1, (from ?? p.s) + ds));
			for (const l of LANES) {
				const r = rough(point, s, l) + Math.abs(ds) * 0.01 + Math.abs(l - PROSTRATE_LANE) * 0.05;
				if (r < best) (best = r), (p.s = s), (p.goal = l);
			}
		}
		if (from !== undefined || p.lane === undefined) p.lane = p.goal;
	}
	// A figure set down at s on the lane in its frame f, facing along the way (dir -1: the other way). It rests on the
	// ground at the joints it bears on in that frame; lying down, it takes the ground's slope under it, along and across.
	put(p, f, point, dir = 1) {
		const g = p.o.g, m = p.o.frames[f];
		const q = point(p.s, p.lane), r = point(p.s + dir * 0.25, p.lane), lv = point(p.s, p.lane + 1);
		let fx = r.x - q.x, fz = r.z - q.z;
		const fl = Math.hypot(fx, fz) || 1;
		(fx /= fl), (fz /= fl);
		const lx = lv.x - q.x, lz = lv.z - q.z, ll = lx * lx + lz * lz || 1;
		const yaw = Math.atan2(fx, fz);
		const pts = m.userData.rest || [[0, 0]], tilt = m.userData.tilt || 0;
		// the ground under each resting joint: (local x, local z, height)
		const gs = pts.map(([x, z]) => {
			const wx = (fz * x + fx * z) * M, wz = (-fx * x + fz * z) * M;
			return [x * M, z * M, point(p.s + dir * (wx * fx + wz * fz), p.lane + (wx * lx + wz * lz) / ll).y];
		});
		let pitch = 0, roll = 0, y = 0;
		if (tilt > 0 && gs.length >= 3) {
			// the plane through them, by least squares: h = a + bx x + bz z
			let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
			for (const [x, z, h] of gs) (n++), (sx += x), (sz += z), (sh += h), (sxx += x * x), (szz += z * z), (sxz += x * z), (sxh += x * h), (szh += z * h);
			const mx = sx / n, mz = sz / n, mh = sh / n;
			const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz, cxh = sxh / n - mx * mh, czh = szh / n - mz * mh;
			const det = cxx * czz - cxz * cxz;
			const bx = det > 1e-9 ? (cxh * czz - czh * cxz) / det : 0, bz = det > 1e-9 ? (czh * cxx - cxh * cxz) / det : czz > 1e-9 ? czh / czz : 0;
			pitch = -Math.atan(bz) * tilt;
			roll = Math.atan(bx) * tilt;
			_e.set(pitch, 0, roll);
			// down onto the ground: on the plane the ground makes under the joints, but where it bulges above that
			// plane, no more than a little sunk into it (and so no more than a little above it in a dip)
			let mean = 0, top = -Infinity;
			for (const [x, z, h] of gs) {
				// (tilted, the joint comes in nearer over the ground: the ground's height where it is now)
				_v.set(x, 0, z).applyEuler(_e);
				const d = h + bx * (_v.x - x) + bz * (_v.z - z) - _v.y;
				mean += d / gs.length;
				top = Math.max(top, d);
			}
			y = Math.max(mean, top - 0.012);
		} else {
			for (const [, , h] of gs) y += h / gs.length;
		}
		g.position.set(q.x, y + 0.005, q.z);
		g.rotation.set(pitch, yaw, roll, "YXZ");
		p.o.frames.forEach((o, i) => (o.visible = i === f));
	}
	// chapters: the route's legs, each null unless it is a day of the kora; point(s, lane): a point on the path
	update(dt, camera, chapters, point) {
		this.point = point;
		if (this.low) return;
		if (!this.list) {
			this.list = [];
			let seed = 9100;
			for (const c of chapters) if (c) for (const f of [0.3, 0.7]) {
				const pr = prostrator(seed++);
				this.group.add(pr.g);
				const p = { kind: "prostrate", o: pr, s: 0, c, u: f * 5 };
				this.settle(p, point, lerp(c.s0, c.s1, f));
				this.list.push(p);
				const w = walker(seed++, true);
				this.group.add(w.g);
				this.list.push({ kind: "bon", o: w, s: lerp(c.s0, c.s1, f + 0.12), c });
			}
		}
		const cp = camera.position;
		for (const p of this.list) {
			// (a Bonpo walker steps out round a prostrator lying on the verge, and back again)
			if (p.kind === "bon") {
				const by = this.list.find((o) => o.kind === "prostrate" && o.c === p.c && p.s > o.s - 0.35 && p.s < o.s + 1.0);
				const want = by ? Math.max(BON_LANE, by.lane) + 0.6 : BON_LANE;
				p.lane = (p.lane ?? BON_LANE) + (want - (p.lane ?? BON_LANE)) * Math.min(1, dt * 4);
			}
			const a = point(p.s, p.lane);
			const near = Math.abs(a.x - cp.x) < 30 && Math.abs(a.z - cp.z) < 30;
			p.o.g.visible = near;
			if (!near) continue;
			let f = p.kind === "bon" ? 8 : 0, ds = 0;
			if (RM) {
				// (standing still, palms joined or at rest)
			} else if (p.kind === "prostrate") {
				// round the mountain clockwise, with it on the right hand, a body's length at a time; on each step he
				// keeps to the flattest of the verge, out of the way of a bank or a drop at its edge
				p.u += dt;
				const [fr, stepping] = roundFrame(p.u % ROUND_T);
				f = fr;
				if (stepping) {
					ds = (2.2 * M * dt) / STEP_T;
					if (!p.stepping) this.settle(p, point);
					p.lane += (p.goal - p.lane) * Math.min(1, (dt * 3) / STEP_T);
				}
				p.stepping = stepping;
			} else {
				// anticlockwise, at a walking pace; round again from the far end of the day's way
				ds = -0.75 * M * 1.2 * dt;
				p.o.phase += (-ds / (0.75 * M * 2)) * 8;
				f = Math.floor(p.o.phase) % 8;
			}
			p.s += ds;
			if (p.s < p.c.s0 + 1) p.s = p.c.s1 - 3;
			if (p.s > p.c.s1 - 3) p.kind === "prostrate" ? this.settle(p, point, p.c.s0 + 4) : (p.s = p.c.s0 + 1);
			if (p.kind === "prostrate") this.put(p, f, point);
			else {
				const q = point(p.s, p.lane), r = point(p.s - 0.25, p.lane);
				p.o.g.position.set(q.x, q.y + 0.01, q.z);
				p.o.g.rotation.y = Math.atan2(r.x - q.x, r.z - q.z);
				p.o.frames.forEach((m, i) => (m.visible = i === f));
			}
		}
	}
}
