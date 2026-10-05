// Getting on and off: the traveller walks to the motorbike on its stand, straps the staff on and swings a leg
// over; a taxi, jeep or auto pulls up, a door opens and the traveller ducks in and sits; at the station the
// train stands at the platform, the traveller walks past the name board, climbs in and the guard whistles.
// The train itself runs here too: on its bogies along the rails, pulling out slowly, braking into each halt,
// with other passengers getting on and off. main.js hands over the traveller, the vehicles and the camera
// while any of this is happening.
import * as THREE from "three";
import { M, RAIL, aToS, railAt, railHead, sToA, wireAt } from "./roads.js";
import { STOCK, SEATED, autorickshaw, jeep, motorbike, taxi, train } from "./vehicles.js";
import * as P from "./pilgrim.js";
import { clamp, lerp, rand, smoothstep } from "./util.js";

// ---------- poses ----------
const DEF = { shLz: 0.08, shRz: -0.08 };
function readPose(J) {
	const r = (j, k) => (j ? j.rotation[k] : 0);
	return {
		hipL: r(J.hipL, "x"), hipLz: r(J.hipL, "z"), hipR: r(J.hipR, "x"), hipRz: r(J.hipR, "z"), kneeL: r(J.kneeL, "x"), kneeR: r(J.kneeR, "x"),
		ankleL: r(J.ankleL, "x"), ankleR: r(J.ankleR, "x"), shL: r(J.shL, "x"), shLy: r(J.shL, "y"), shLz: r(J.shL, "z"), shR: r(J.shR, "x"), shRy: r(J.shR, "y"), shRz: r(J.shR, "z"),
		elL: r(J.elL, "x"), elLy: r(J.elL, "y"), elR: r(J.elR, "x"), elRy: r(J.elR, "y"), lean: r(J.torso, "x"), twist: r(J.torso, "y"), tilt: r(J.torso, "z"),
		nod: r(J.head, "x"), look: r(J.head, "y"), headTilt: r(J.head, "z"), bob: J.hips.position.y - 0.95, sway: J.hips.position.x, pelvisY: J.hips.rotation.y, pelvisZ: J.hips.rotation.z,
	};
}
function mix(a, b, w) {
	const o = {};
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp(a[k] ?? DEF[k] ?? 0, b[k] ?? DEF[k] ?? 0, w);
	return o;
}
const STAND = { hipL: 0, hipR: 0, kneeL: 0.04, kneeR: 0.04, ankleL: -0.04, ankleR: -0.04, shL: -0.75, shLz: 0.18, shLy: 0.15, elL: -1.05, elLy: 0.2, shR: -0.2, shRz: -0.12, elR: -0.4, lean: 0.05, nod: 0.05, bob: 0 };
const DUCK = { hipL: -0.75, hipR: -0.6, kneeL: 0.9, kneeR: 0.75, ankleL: -0.1, ankleR: -0.1, lean: 0.62, nod: -0.25, bob: -0.2, shL: -0.75, shLz: 0.2, elL: -1.0, shR: -0.5, elR: -0.5 };
const STEP_UP = { hipR: -1.0, kneeR: 1.15, ankleR: -0.1, hipL: 0.12, kneeL: 0.12, lean: 0.3, nod: -0.1, shL: -0.9, elL: -0.9, shR: -0.4, elR: -0.4, bob: -0.03 };
const REACH = { lean: 0.5, twist: -0.5, shR: -1.2, shRz: -0.3, elR: -0.3, shL: -0.8, elL: -1.0, nod: 0.35, hipL: -0.25, hipR: -0.25, kneeL: 0.35, kneeR: 0.35, bob: -0.07 };
const BARS = { shL: -1.1, shLz: 0.25, shR: -1.1, shRz: -0.25, elL: -0.3, elR: -0.3, lean: 0.25, nod: -0.05 };
const LEG_OVER = { hipL: 0.65, hipLz: -1.05, kneeL: 1.5, ankleL: 0.3, hipR: -0.15, kneeR: 0.25, lean: 0.62, shL: -1.2, shR: -1.2, shLz: 0.2, shRz: -0.2, elL: -0.3, elR: -0.3, nod: -0.3, bob: -0.06 };
const RIDE = { hipL: -1.35, hipR: -1.35, hipLz: 0.12, hipRz: -0.12, kneeL: 1.25, kneeR: 1.25, ankleL: 0.22, ankleR: 0.22, shL: -1.0, shLz: 0.25, shR: -1.0, shRz: -0.25, elL: -0.35, elR: -0.35, lean: 0.32, nod: -0.2, bob: -0.12 };
// astride, the left foot (the +x leg, "R" in the skeleton) down on the road
const FOOT = Object.assign({}, RIDE, { hipR: -0.45, hipRz: 0.32, kneeR: 0.4, ankleR: 0.05 });
const KICK = Object.assign({}, FOOT, { hipR: 0.35, hipRz: 0.4, kneeR: 0.3 });
const DOOR = { hipL: 0, hipR: -0.08, kneeL: 0.05, kneeR: 0.12, shR: -0.25, shRz: -0.14, elR: -0.45, lean: -0.03, twist: 0.15, nod: 0.02, look: 0.45, bob: 0 };

// keeps the staff upright and the diya level after a pose override (as Traveller.update does)
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(0, 1, 0), _ax2 = new THREE.Vector3(1, 0, 0);
function held(tr) {
	const J = tr.J;
	if (J.staff) {
		J.staff.parent.updateWorldMatrix(true, false);
		J.staff.parent.getWorldQuaternion(_q1);
		tr.group.getWorldQuaternion(_q2);
		_q2.multiply(new THREE.Quaternion().setFromAxisAngle(_ax, tr.yaw)).multiply(new THREE.Quaternion().setFromAxisAngle(_ax2, 0.12));
		J.staff.quaternion.copy(_q1.invert().multiply(_q2));
		J.staff.position.set(0, -0.45, 0).applyQuaternion(J.staff.quaternion);
	}
	if (J.diya) {
		J.diya.parent.updateWorldMatrix(true, false);
		J.diya.parent.getWorldQuaternion(_q1);
		tr.group.getWorldQuaternion(_q2);
		J.diya.quaternion.copy(_q1.invert().multiply(_q2));
	}
}

// ---------- sound: the guard's whistle, the horn, the wheels on the rail joints ----------
class TrainSound {
	constructor(audio) {
		this.audio = audio;
	}
	get ok() {
		return this.audio.on && this.audio.ctx;
	}
	noise() {
		const c = this.audio.ctx;
		if (!this._noise) {
			const b = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate), d = b.getChannelData(0);
			for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
			this._noise = b;
		}
		const s = c.createBufferSource();
		s.buffer = this._noise;
		return s;
	}
	whistle() {
		if (!this.ok) return;
		const c = this.audio.ctx, t0 = c.currentTime + 0.02;
		for (const [a, d] of [[0, 0.45], [0.6, 1.1]]) {
			const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
			o.frequency.value = 3050;
			lfo.frequency.value = 27; // the pea's trill
			lg.gain.value = 140;
			lfo.connect(lg).connect(o.frequency);
			g.gain.setValueAtTime(0, t0 + a);
			g.gain.linearRampToValueAtTime(0.03, t0 + a + 0.03);
			g.gain.setValueAtTime(0.03, t0 + a + d - 0.06);
			g.gain.linearRampToValueAtTime(0, t0 + a + d);
			o.connect(g).connect(this.audio.master);
			o.start(t0 + a);
			lfo.start(t0 + a);
			o.stop(t0 + a + d + 0.05);
			lfo.stop(t0 + a + d + 0.05);
		}
	}
	horn(len = 1.1) {
		if (!this.ok) return;
		const c = this.audio.ctx, t0 = c.currentTime + 0.02;
		const lp = c.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 1500;
		const g = c.createGain();
		g.gain.setValueAtTime(0, t0);
		g.gain.linearRampToValueAtTime(0.045, t0 + 0.06);
		g.gain.setValueAtTime(0.045, t0 + len - 0.15);
		g.gain.linearRampToValueAtTime(0, t0 + len);
		lp.connect(g).connect(this.audio.master);
		for (const f of [466, 587]) {
			const o = c.createOscillator();
			o.type = "sawtooth";
			o.frequency.value = f;
			o.connect(lp);
			o.start(t0);
			o.stop(t0 + len + 0.05);
		}
	}
	// one wheel over a rail joint, `delay` seconds from now
	clack(gain, delay = 0) {
		if (!this.ok || gain <= 0.001) return;
		const c = this.audio.ctx, t0 = c.currentTime + 0.01 + delay;
		const n = this.noise(), bp = c.createBiquadFilter(), g = c.createGain();
		bp.type = "bandpass";
		bp.frequency.value = 1400;
		bp.Q.value = 1.2;
		g.gain.setValueAtTime(gain * 0.05, t0);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
		n.connect(bp).connect(g).connect(this.audio.master);
		n.start(t0, Math.random() * 0.4, 0.08);
		const o = c.createOscillator(), og = c.createGain();
		o.frequency.value = 85;
		og.gain.setValueAtTime(gain * 0.05, t0);
		og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
		o.connect(og).connect(this.audio.master);
		o.start(t0);
		o.stop(t0 + 0.1);
	}
}

// ---------- passengers ----------
// A walking figure as a flipbook: eight merged poses of a stride and one standing, swapped as it walks,
// so a few people can get on and off the train for the cost of one draw call each.
const FIG = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
function gait(ph) {
	if (P.stride) return P.stride(ph);
	const s = Math.sin(ph);
	return { hipL: -0.35 * s, hipR: 0.35 * s, kneeL: 0.5 * Math.max(0, Math.cos(ph)), kneeR: 0.5 * Math.max(0, -Math.cos(ph)), bob: 0 };
}
class Walker {
	constructor(seed) {
		const R = rand(seed);
		const o = Object.assign(P.crowdOpts(R), { lod: 0 });
		const J = P.body(o);
		this.group = new THREE.Group();
		this.frames = [];
		const k = M * (0.92 + R() * 0.1);
		for (let i = 0; i <= 8; i++) {
			let p;
			if (i < 8) {
				const ph = (i / 8) * Math.PI * 2, s = gait(ph);
				p = { hipL: s.hipL, hipR: s.hipR, kneeL: s.kneeL, kneeR: s.kneeR, ankleL: s.footL !== undefined ? s.footL - s.hipL - s.kneeL : undefined, ankleR: s.footR !== undefined ? s.footR - s.hipR - s.kneeR : undefined, bob: s.bob, shL: 0.3 * Math.sin(ph), shR: -0.3 * Math.sin(ph), elL: -0.3, elR: -0.3, lean: 0.06, nod: 0.05 };
			} else p = { shL: 0.04, shR: 0.04, nod: 0.05, kneeL: 0.04, kneeR: 0.04 };
			P.pose(J, p);
			const m = new THREE.Mesh(P.mergeFigure(J), FIG);
			m.scale.setScalar(k);
			m.castShadow = true;
			m.visible = false;
			this.frames.push(m);
			this.group.add(m);
		}
		this.group.visible = false;
		this.phase = 0;
	}
	// moving: advance the stride by the distance walked; else stand
	show(on, moving, dist) {
		this.group.visible = on;
		if (!on) return;
		if (moving) this.phase += dist / (0.75 * M * 2) * 8;
		const f = moving ? Math.floor(this.phase) % 8 : 8;
		this.frames.forEach((m, i) => (m.visible = i === f));
	}
}
// A walk along a polyline of world points (with y), at a steady pace.
function pathLen(pts) {
	let L = 0;
	for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
	return L;
}
function along(pts, d, out = new THREE.Vector3()) {
	for (let i = 1; i < pts.length; i++) {
		const l = pts[i].distanceTo(pts[i - 1]);
		if (d <= l || i === pts.length - 1) {
			const t = clamp(l ? d / l : 1, 0, 1);
			out.lerpVectors(pts[i - 1], pts[i], t);
			out.yaw = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
			return out;
		}
		d -= l;
	}
	out.copy(pts[pts.length - 1]);
	out.yaw = 0;
	return out;
}
export const WALK = 1.3 * M; // a walking pace, world units a second

// ---------- the train ----------
// Line speed 120 km/h; starting at about 0.5 m/s² and braking the same, the rate growing as the train gets
// away from the platform (the long run between stations is told faster than life, the platforms are not).
const V_LINE = (120 / 3.6) * M, A0 = 0.5 * M, D0 = 12;
const prof = (d) => Math.sqrt(2 * A0 * (d + (d * d * d) / (3 * D0 * D0)));
const JOINT = 13 * M; // rail length between joints
const _a = {}, _b = {}, _c = {};
const _pf = new THREE.Vector3(), _pr = new THREE.Vector3(), _pm = new THREE.Vector3(), _d = new THREE.Vector3();
function orient(obj, front, rear, roll = 0) {
	_d.subVectors(front, rear);
	const l = _d.length() || 1;
	obj.rotation.set(-Math.asin(clamp(_d.y / l, -1, 1)), Math.atan2(_d.x, _d.z), roll);
}
export class Rake {
	constructor(kind, rail, scene, sound) {
		this.cars = train(kind);
		this.rail = rail;
		this.stops = rail.stops;
		this.sound = sound;
		this.offs = [];
		let o = 0;
		for (const c of this.cars) {
			this.offs.push(o + (c.len * M) / 2);
			o += c.len * M;
			c.group.scale.setScalar(M);
			c.group.rotation.order = "YXZ";
			scene.add(c.group);
			for (const b of c.bogies) {
				b.group.scale.setScalar(M);
				b.group.rotation.order = "YXZ";
				scene.add(b.group);
			}
		}
		this.L = o;
		this.spin = 0;
		// the flexible gangway between each pair of coaches, stretched from one coach's end to the next's
		this.links = this.cars.slice(1).map(() => {
			const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.9 }));
			m.castShadow = true;
			scene.add(m);
			return m;
		});
		this.home(0);
		// the traveller's door: on a sleeper coach, the platform-side door that stands just past the second name board
		let best = Infinity;
		for (let ci = 1; ci <= 3; ci++) for (const d of this.cars[ci].doors) {
			const v = this.stop(0) - this.offs[ci] + d.z * M - this.stops[0].a;
			if (v > 4.6 && v - 4.6 < best) (best = v - 4.6), (this.tc = ci), (this.td = d);
		}
	}
	stop(i) {
		return this.stops[i].a + this.L / 2;
	}
	// standing at a stop
	home(i) {
		this.k = i;
		this.a = this.stop(i);
		this.v = 0;
		this.state = "stand";
	}
	// running with the traveller's door at distance x along the line
	runAt(x) {
		this.a = clamp(x + this.offs[this.tc] - this.td.z * M, this.stop(0), this.stop(this.stops.length - 1));
		this.k = 0;
		while (this.k < this.stops.length - 1 && this.stop(this.k + 1) <= this.a + 1e-3) this.k++;
		this.state = this.k >= this.stops.length - 1 ? "stand" : "run";
		this.v = this.speedAt();
	}
	speedAt() {
		const next = this.stops[this.k + 1] ? this.stop(this.k + 1) : this.a;
		return Math.min(V_LINE, prof(Math.max(0, this.a - this.stop(this.k)) + 0.04), prof(Math.max(0, next - this.a)));
	}
	doorA() {
		return this.a - this.offs[this.tc] + this.td.z * M;
	}
	carA(i) {
		return this.a - this.offs[i];
	}
	// one step of the run; returns the stop it has just come to, if any
	step(dt, audible) {
		if (this.state !== "run") return null;
		const next = this.stop(this.k + 1);
		this.v = this.speedAt();
		const before = this.a;
		this.a += this.v * dt;
		this.spin += this.a - before;
		if (audible) {
			// ta-dum ta-dum: the wheels of the traveller's coach over each joint
			const c = this.cars[this.tc], ac = this.carA(this.tc), B = (c.S.bogies * M) / 2, w = (c.S.wb * M) / 2;
			const g = Math.min(1, this.v / V_LINE + 0.15);
			for (const x of [ac + B + w, ac + B - w, ac - B + w, ac - B - w]) if (Math.floor((x - (this.a - before)) / JOINT) !== Math.floor(x / JOINT)) this.sound.clack(g, 0);
		}
		if (this.a >= next - 1e-3) {
			this.a = next;
			this.v = 0;
			this.k++;
			this.state = "stand";
			return this.stops[this.k];
		}
		return null;
	}
	// Every carriage on its two bogies, every bogie on its axles, every axle on the two rails.
	place(camera, t) {
		const rail = this.rail;
		const mid = railAt(rail, this.a - this.L / 2, _c);
		const far = Math.hypot(camera.position.x - mid.x, camera.position.z - mid.z) > 330;
		const spin = this.spin / M;
		this.cars.forEach((c, i) => {
			c.group.visible = !far;
			for (const b of c.bogies) b.group.visible = !far;
			if (far) return;
			const ac = this.carA(i), B = (c.S.bogies * M) / 2;
			const piv = [];
			c.bogies.forEach((b, j) => {
				const ab = ac + (j === 0 ? B : -B), w = (b.wb * M) / 2;
				const ends = [];
				for (const x of [ab + w, ab - w]) {
					railHead(rail, x, -1, _a);
					railHead(rail, x, 1, _b);
					ends.push(new THREE.Vector3((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2));
				}
				_pm.addVectors(ends[0], ends[1]).multiplyScalar(0.5);
				b.group.position.copy(_pm);
				orient(b.group, ends[0], ends[1]);
				for (const ax of b.axles) ax.rotation.x = spin / b.r;
				if (b.n === 3) {
					// the middle wheelset floats sideways to stay on the rails through a curve
					railHead(rail, ab, -1, _a);
					railHead(rail, ab, 1, _b);
					b.group.updateMatrixWorld(true);
					const m = b.group.worldToLocal(new THREE.Vector3((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2));
					b.axles[1].position.set(m.x, m.y + b.r, m.z);
				}
				piv.push(_pm.clone());
			});
			c.group.position.addVectors(piv[0], piv[1]).multiplyScalar(0.5);
			orient(c.group, piv[0], piv[1], this.v > 0.01 ? Math.sin(t * 1.9 + i * 1.3) * 0.004 : 0);
			c.group.updateMatrixWorld(true);
		});
		this.links.forEach((m, i) => {
			m.visible = !far;
			if (far) return;
			const a = this.cars[i], b = this.cars[i + 1];
			const p = a.group.localToWorld(new THREE.Vector3(0, 2.3, -a.len / 2 + 0.25)), q = b.group.localToWorld(new THREE.Vector3(0, 2.3, b.len / 2 - 0.25));
			m.position.addVectors(p, q).multiplyScalar(0.5);
			orient(m, p, q);
			m.scale.set(1.15 * M, 2.1 * M, Math.max(0.01, p.distanceTo(q)));
		});
		// the raised pantograph presses up against the contact wire
		const loco = this.cars[0];
		if (!far && loco.pans) {
			loco.group.updateMatrixWorld(true);
			const pa = this.carA(0) - 3.2 * M, wy = wireAt(rail, pa);
			// the wire's height over the pantograph, in the pantograph's own (pitched) frame
			const pg = loco.pans[0].group, base = pg.getWorldPosition(new THREE.Vector3());
			const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pg.getWorldQuaternion(new THREE.Quaternion()));
			// the head rises along the pantograph's own up, which leans with the locomotive on a gradient
			const k = Math.max(0.5, up.y);
			railAt(rail, pa, _c);
			const along = (up.x * _c.dx + up.z * _c.dz) * ((wy - base.y) / k);
			loco.pans[0].set((wireAt(rail, pa + along) - base.y) / k / M - 0.03);
			loco.pans[1].set(0.25);
		}
	}
}

// ---------- the journey ----------
const HALT = 9; // seconds at a halt (at the animation's own pace)
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _rp = {};
export class Journey {
	// o: { app, scene, roads, route, world, traveller, audio, modeAt, roadPoint, speeds }
	constructor(o) {
		Object.assign(this, o);
		this.v = { bike: motorbike(), car: taxi(), jeep: jeep(), auto: autorickshaw() };
		for (const v of Object.values(this.v)) {
			v.group.visible = false;
			v.group.rotation.order = "YXZ";
			o.scene.add(v.group);
		}
		this.sound = new TrainSound(o.audio);
		this.rakes = o.roads.rails.map((r) => new Rake(r.stock, r, o.scene, this.sound));
		this.walkers = [0, 1, 2, 3].map((i) => new Walker(911 + i * 37));
		this.crowd = [0, 1, 2, 3, 4, 5].map((i) => P.crowdFigure(733 + i * 13));
		for (const w of this.walkers) o.scene.add(w.group);
		for (const c of this.crowd) {
			c.visible = false;
			o.scene.add(c);
		}
		this.ep = null;
		this.parked = null;
		this.leaving = [];
		this.onTrain = false;
		this.halt = null;
		this.tasks = [];
		this.cam = null;
		this.camW = 0;
		this.wob = 0;
		this.plans = new Map();
		this.lastS = null;
		this.lastKey = "";
	}
	get rake() {
		return this.rakes.find((r) => r.rail.chapter === this.app.leg) || null;
	}
	// ---------- the plan of the leg: where the traveller changes from one way of travelling to the next ----------
	plan() {
		const app = this.app, key = app.leg + "|" + app.transport;
		if (this.plans.has(key)) return this.plans.get(key);
		const c = this.route.chapters[app.leg];
		const out = [];
		let prev = this.modeAt(c.s0 + 0.01);
		for (let s = c.s0 + 0.1; s < c.s1; s += 0.1) {
			const m = this.modeAt(s);
			if (m === prev) continue;
			let lo = s - 0.1, hi = s;
			for (let k = 0; k < 14; k++) {
				const mid = (lo + hi) / 2;
				if (this.modeAt(mid) === prev) lo = mid;
				else hi = mid;
			}
			out.push({ s: hi, from: prev, to: m });
			prev = m;
		}
		this.plans.set(key, out);
		return out;
	}
	around(s) {
		const pl = this.plan();
		let prev = null, next = null;
		for (const T of pl) {
			if (T.s <= s + 1e-6) prev = T;
			else if (!next) next = T;
		}
		return { prev, next };
	}
	// ---------- lanes, in metres right of the road's centre ----------
	halfAt(s) {
		const r = this.roads.road(s, 0, _rp);
		// no road here (a path, or the open route), no verge to keep to
		return r ? (r.kind === "nh" ? 3.75 : r.kind === "ghat" ? 3.5 : r.kind === "hill" ? 2.75 : 0) : 0;
	}
	// half the road's width, eased over a few metres where a road begins or ends (at a bus stand, onto a path),
	// so someone walking along its verge drifts across rather than jumping sideways
	half(s) {
		let h = 0;
		for (let k = -4; k <= 4; k++) h += this.halfAt(s + k * 0.3);
		return h / 9;
	}
	walkLane(s) {
		return -(this.half(s) + 0.6);
	}
	myLane(kind, s) {
		const r = this.roads.road(s, 0, _rp), narrow = r && r.kind === "hill";
		return kind === "bike" ? (narrow ? -1.1 : -0.6) : narrow ? -1.55 : -1.15;
	}
	kerbLane(kind, s) {
		const v = this.v[kind];
		return this.walkLane(s) + (kind === "bike" ? 0.55 : v.hull.x + 0.45);
	}
	station(T) {
		const r = this.rake;
		if (!r) return null;
		return T.to === "train" ? r.stops[0] : T.from === "train" ? r.stops.at(-1) : null;
	}
	// where a vehicle runs at s: its lane, drifting to the kerb (or into a station forecourt) where it stops or starts
	laneAt(kind, s) {
		const { prev, next } = this.around(s);
		let lane = this.myLane(kind, s), yW = 0, yF = 0;
		if (prev && prev.to === kind) {
			const st = this.station(prev), w = 1 - smoothstep(prev.s, prev.s + 3.5, s);
			lane = lerp(lane, st ? st.laneRoad : this.kerbLane(kind, prev.s), w);
			if (st) (yW = w), (yF = st.forecourt);
		}
		if (next && next.from === kind) {
			const st = this.station(next), w = smoothstep(next.s - 3.5, next.s, s);
			lane = lerp(lane, st ? st.laneRoad : this.kerbLane(kind, next.s), w);
			if (st) (yW = Math.max(yW, w)), (yF = st.forecourt);
		}
		return { lane, yW, yF };
	}
	// a vehicle on its two axles at s, lane (metres), life size times vs/M
	putRoad(v, s, lane, vs, yW = 0, yF = 0, roll = 0) {
		const ax = (v.kind === "bike" ? 0.7 : v.len * 0.3) * vs;
		const a = this.roadPoint(s - ax, (lane * vs) / M), a0 = { x: a.x, y: a.y, z: a.z };
		const b = this.roadPoint(s + ax, (lane * vs) / M);
		const g = v.group;
		g.position.set((a0.x + b.x) / 2, lerp((a0.y + b.y) / 2, yF, yW) + 0.02, (a0.z + b.z) / 2);
		const l = Math.hypot(b.x - a0.x, b.z - a0.z) || 1;
		g.rotation.set(yW > 0.5 ? 0 : -Math.atan2(b.y - a0.y, l), Math.atan2(b.x - a0.x, b.z - a0.z), roll);
		g.scale.setScalar(vs);
		g.visible = true;
		g.updateMatrixWorld(true);
	}
	local(v, x, y, z, out = new THREE.Vector3()) {
		return v.group.localToWorld(out.set(x, y, z));
	}
	// ---------- keeping in step with main.js: a jump along the route, a new leg or a new choice of transport ----------
	sync() {
		const app = this.app, key = app.leg + "|" + app.transport + "|" + app.state;
		const jumped = this.lastS !== null && Math.abs(app.s - this.lastS) > 2;
		if (key === this.lastKey && !jumped) return;
		this.lastKey = key;
		this.ep = null;
		this.halt = null;
		this.tasks = [];
		this.leaving = [];
		this.parked = null;
		this.onTrain = false;
		this.dep = null;
		for (const v of Object.values(this.v)) v.group.visible = false;
		for (const r of this.rakes) {
			const ch = r.rail.chapter, T = this.roads.trains[ch];
			if (app.leg < ch || app.state !== "travel") r.home(app.leg > ch ? r.stops.length - 1 : 0);
			else if (app.leg > ch) r.home(r.stops.length - 1);
			else if (this.modeAt(app.s) === "train") {
				r.runAt(sToA(r.rail, app.s));
				this.onTrain = true;
				this.openT = 9;
			} else r.home(app.s < T.from ? 0 : r.stops.length - 1);
		}
		this.lastS = app.s;
	}
	mode() {
		if (this.ep) return this.ep.mode || "walk";
		if (this.onTrain) return "train";
		return this.modeAt(this.app.s);
	}
	busy() {
		return !!this.ep;
	}
	// ---------- moving on: the route distance, the train, the halts and the changes ----------
	advance(dt) {
		const app = this.app;
		this.sync();
		const sp = this.speeds[app.speed], ar = Math.pow(sp, 0.75);
		this.dtA = dt * ar;
		this.vWalk = 0;
		for (const L of this.leaving) {
			L.v0 = Math.min(L.v0 + dt * ar * 1.2, 4);
			L.s += L.v0 * dt * ar;
		}
		this.leaving = this.leaving.filter((L) => L.s - app.s < 16);
		if (this.ep) {
			this.runEp(dt * ar);
		} else if (this.onTrain) {
			this.trainAdvance(dt * sp, dt * ar);
		} else {
			const c = this.route.chapters[app.leg];
			const mode = this.modeAt(app.s);
			const { prev, next } = this.around(app.s);
			let pace = this.route.legSpeed[app.leg] * (0.22 + 0.78 * smoothstep(0, 10, Math.min(c.s1 - app.s, app.s - c.s0)));
			if (mode === "walk") {
				// on foot at a person's pace (a brisk 1.4 m/s at 1x), so the steps carry the body and nothing slides.
				// Where the footpath winds away from the road (a bus stand to a temple door), one unit along the route
				// can be several on the ground: measure that from the last frame and slow the route pace to match.
				const g = app.traveller && app.traveller.group.position;
				if (g && this.walkFrom && app.s - this.walkFrom.s > 1e-4) {
					const r = Math.hypot(g.x - this.walkFrom.x, g.z - this.walkFrom.z) / (app.s - this.walkFrom.s);
					this.groundPerS = (this.groundPerS || 1) + (Math.min(4, r) - (this.groundPerS || 1)) * 0.35;
				}
				if (g) this.walkFrom = { s: app.s, x: g.x, z: g.z };
				pace = Math.min(pace, (WALK * 1.08) / Math.max(1, this.groundPerS || 1));
			} else {
				this.walkFrom = null;
				this.groundPerS = 1;
				if (mode === "auto") pace = Math.min(pace, 2.0);
				// brake to a stop at the next change, pull away gently from the last
				const D = 2 + 0.9 * Math.min(pace, 6);
				if (next) pace *= 0.1 + 0.9 * smoothstep(0, D, next.s - app.s);
				if (prev) pace *= 0.12 + 0.88 * smoothstep(0, D, app.s - prev.s);
			}
			this.vWalk = mode === "walk" ? pace * sp : 0;
			let s = app.s + pace * sp * dt;
			if (next && s >= next.s) {
				s = next.s;
				app.s = s;
				this.lastS = s;
				this.change(next);
			} else app.s = s;
		}
		this.lastS = app.s;
	}
	trainAdvance(dtS, dtA) {
		const app = this.app, r = this.rake;
		if (!r) return (this.onTrain = false);
		this.openT = (this.openT || 0) + dtA;
		if (this.halt) {
			this.halt.t += dtA;
			if (this.halt.t > HALT && !this.halt.gone) {
				this.halt.gone = true;
				this.sound.whistle();
				this.sound.horn(0.8);
				r.state = "run";
				this.openT = 0;
			}
			if (this.halt.gone && this.halt.t > HALT + 4) this.halt = null;
		}
		const at = r.step(dtS, true);
		if (at) {
			if (at.kind === "end") this.change({ s: app.s, from: "train", to: this.modeAt(this.roads.trains[app.leg].to + 0.01), st: at });
			else {
				this.halt = { t: 0, st: at };
				this.passengers(r, at);
				this.app.toast && this.app.toast(`${at.name.replace(/ JN$/, " Junction").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}: the train halts`);
			}
		}
		app.s = aToS(r.rail, r.doorA());
	}
}

// ---------- getting on and off ----------
const veh = (m) => m === "car" || m === "jeep" || m === "auto" || m === "bike";
const sit = (v) => Object.assign({}, SEATED, { bob: v.seat.y - 0.95 });
const V3 = (p, y) => new THREE.Vector3(p.x, y ?? p.y, p.z);
Object.assign(Journey.prototype, {
	// the traveller, for the frame: where, facing which way (in the frame of quat), doing what
	tvSet(pos, yaw, mode = "idle", over = null, w = 0, o = {}) {
		this.tv = Object.assign({ pos: pos.clone(), quat: null, yaw, mode, over, w, staff: true, diya: true, vis: true }, o);
	},
	seated(v) {
		this.tvSet(this.local(v, v.seat.x, 0, v.seat.z), 0, "idle", sit(v), 1, { quat: v.group.quaternion, staff: false });
	},
	change(T) {
		let steps = [];
		if (T.from === "walk" && T.to === "bike") steps = this.epMount(T);
		else if (T.from === "bike" && T.to === "walk") steps = this.epDismount(T);
		else if (T.from === "train") steps = this.epTrainOff(T);
		else if (T.to === "train") steps = [...this.epAlight(T, T.from, true), ...this.epToTrain(T)];
		else {
			if (veh(T.from)) steps.push(...this.epAlight(T, T.from, false));
			if (veh(T.to)) steps.push(...this.epBoard(T, T.to, null));
		}
		if (!steps.length) return;
		this.ep = { steps, i: 0, t: 0, T, mode: "walk", id: (this.epN = (this.epN || 0) + 1) };
		if (steps[0].start) steps[0].start();
	},
	runEp(dtA) {
		const e = this.ep;
		e.t += dtA;
		while (this.ep === e && e.t >= e.steps[e.i].d) {
			e.t -= e.steps[e.i].d;
			if (e.steps[e.i].end) e.steps[e.i].end();
			e.i++;
			if (e.i >= e.steps.length) {
				this.ep = null;
				if (e.T.to === "train") {
					this.onTrain = true;
					this.rake.state = "run";
					this.openT = 0;
					this.app.s = aToS(this.rake.rail, this.rake.doorA());
				} else if (e.T.from === "train") {
					this.onTrain = false;
					this.app.s = e.T.s + 0.002;
				}
				if (e.T.to === "bike") this.wob = 1;
				this.lastS = this.app.s;
				return;
			}
			if (e.steps[e.i].start) e.steps[e.i].start();
		}
	},
	renderEp() {
		const e = this.ep, st = e.steps[e.i];
		st.f(clamp(e.t / st.d, 0, 1));
	},
	// a walk along world points
	// stairs are steps, not a ramp: on a flight the feet stand on the tread they have reached
	treadY(st, p) {
		const S = st && st.steps;
		if (!S || !S.n) return p.y;
		const dx = Math.sin(st.yaw), dz = Math.cos(st.yaw);
		const u = (p.x - st.x) * dz - (p.z - st.z) * dx, v = (p.x - st.x) * dx + (p.z - st.z) * dz;
		// only on the flight itself: it is 1.4 wide, and an auto can set down beside it, level with its treads
		if (u < S.u0 - 0.02 || u > S.u1 + 0.02 || Math.abs(v) > 0.72) return p.y;
		const k = Math.min(S.n - 1, Math.max(0, Math.floor(((u - S.u0) / (S.u1 - S.u0)) * S.n)));
		return S.top - (S.rise * (k + 1)) / S.n;
	},
	walkTo(get, cam, st0 = null) {
		let pts = null;
		const st = { d: 1, start: () => {
			pts = get();
			st.d = Math.max(0.3, pathLen(pts) / (WALK * 1.5));
		}, f: (k) => {
			if (!pts) st.start();
			const p = along(pts, k * pathLen(pts), new THREE.Vector3());
			if (st0) p.y = this.treadY(st0, p);
			this.tvSet(p, p.yaw, "walk");
			if (cam) cam(p);
		} };
		return st;
	},
	// the close, low framing of a getting-on or -off: from beside and a little ahead, at the traveller's height
	// on the road: from a few metres ahead and out over the carriageway, where no tree or bus stand is in the way
	// the side is chosen once for the whole getting on or off: the first of these with a clear view of the traveller
	// and not up a hillside (beside a bus stand on a slope, under a tree, behind a parked bus), else the clearest
	roadCam(p, heading, dist = 3.2, pitch = 0.24) {
		const target = new THREE.Vector3(p.x, p.y + 0.3, p.z);
		const e = this.ep;
		if (e && e.roadYaw === undefined && this.app.viewFrom) {
			let best = -0.55, bestScore = -Infinity;
			for (const a of [-0.55, 0.55, -1.25, 1.25, Math.PI - 0.6, Math.PI + 0.6]) {
				const yw = heading + a, cp = Math.cos(pitch);
				const q = new THREE.Vector3(target.x + Math.sin(yw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yw) * cp * dist);
				const clear = this.app.viewFrom(target, q) ?? Infinity;
				const hill = Math.max(0, this.world.height(q.x, q.z) + 0.3 - q.y);
				const score = Math.min(clear, dist) - hill * 4 - (a === -0.55 ? 0 : 0.05);
				if (clear === Infinity && hill === 0) {
					best = a;
					break;
				}
				if (score > bestScore) (bestScore = score), (best = a);
			}
			e.roadYaw = best;
		}
		this.cam = { target, yaw: heading + (e && e.roadYaw !== undefined ? e.roadYaw : -0.55), pitch, dist };
	},
	frame(p, yaw, side = 1, dist = 3.4, pitch = 0.2) {
		this.cam = { target: new THREE.Vector3(p.x, p.y + 0.32, p.z), yaw: yaw + side * 1.15, pitch, dist };
	},
	// out of a car, jeep or auto: the door opens, the traveller slides out, the door shuts and it drives on
	epAlight(T, kind, toStation) {
		const v = this.v[kind], st = toStation ? this.station(T) : null, side = st ? -1 : 1;
		const lane = st ? st.laneRoad : this.kerbLane(kind, T.s), yW = st ? 1 : 0, yF = st ? st.forecourt : 0;
		const door = v.door ? v.doors[side > 0 ? v.door : v.doorR] : null;
		const dz = door ? (door.z0 + door.z1) / 2 : v.seat.z, hw = v.hull.x;
		const sv = T.s - dz * M;
		const put = () => this.putRoad(v, sv, lane, M, yW, yF);
		const L = (x, z) => this.local(v, x, 0, z);
		const sx = Math.abs(v.seat.x), seat = [v.seat.x, v.seat.z], slide = [side * sx, v.seat.z], inn = [side * (hw - 0.28), dz], out = [side * (hw + 0.42), dz];
		const yawV = () => v.group.rotation.y;
		let outW = null;
		const cs = T.to === "walk" ? -1 : side; // at a bus stand, from the road side, clear of the parked buses
		const cam = () => (st ? this.frame(L(out[0], out[1]), yawV() + 0.9, 1, 4.6, 0.26) : this.roadCam(L(out[0], out[1]), yawV()));
		return [
			{ d: 0.5, f: () => (put(), this.seated(v), cam()) },
			{ d: 0.7, f: (k) => (put(), door && door.open(k), this.seated(v), cam()) },
			{ d: side < 0 ? 1.4 : 0.9, f: (k) => {
				put();
				door && door.open(1);
				const a = side < 0 ? (k < 0.5 ? [lerp(seat[0], slide[0], k * 2), seat[1]] : [lerp(slide[0], inn[0], k * 2 - 1), lerp(slide[1], inn[1], k * 2 - 1)]) : [lerp(seat[0], inn[0], k), lerp(seat[1], inn[1], k)];
				this.tvSet(L(a[0], a[1]), (side * Math.PI) / 2 * smoothstep(0, 0.6, k), "idle", mix(sit(v), DUCK, smoothstep(0, 1, k)), 1, { quat: v.group.quaternion, staff: false });
				cam();
			} },
			{ d: 1.0, f: (k) => {
				put();
				door && door.open(1);
				this.tvSet(L(lerp(inn[0], out[0], k), dz), (side * Math.PI) / 2, k < 0.9 ? "walk" : "idle", mix(DUCK, STAND, smoothstep(0.1, 1, k)), 1, { quat: v.group.quaternion, staff: k > 0.5 });
				cam();
			} },
			{ d: 0.6, start: () => (put(), (outW = L(out[0], out[1]))), f: (k) => {
				put();
				door && door.open(1 - k);
				this.tvSet(outW, yawV() + ((side * Math.PI) / 2) * (1 - k), "idle", STAND, 1);
				cam();
			}, end: () => {
				door && door.open(0);
				this.leaving.push({ v, s: sv, s0: sv, lane, yW, yF, v0: 0.2 });
			} },
			{ d: 1.4, f: (k) => {
				this.tvSet(outW, yawV(), "idle", Object.assign({}, STAND, { look: 0.5 * k }), 1);
				if (st) this.frame(outW, yawV() + 0.9, 1, 4.6, 0.26);
				else this.roadCam(outW, yawV(), 3.2 + k);
			} },
		];
	},
	// into a car, jeep or auto: it pulls up (or stands waiting), the door opens, in, sit, the door shuts
	epBoard(T, kind, st) {
		const v = this.v[kind], side = st ? -1 : 1;
		const lane = st ? st.laneRoad : this.kerbLane(kind, T.s), yW = st ? 1 : 0, yF = st ? st.forecourt : 0;
		const door = v.door ? v.doors[side > 0 ? v.door : v.doorR] : null;
		const dz = door ? (door.z0 + door.z1) / 2 : v.seat.z, hw = v.hull.x;
		const sv = T.s - dz * M;
		const put = (s = sv, ln = lane) => this.putRoad(v, s, ln, M, yW, yF);
		const L = (x, z) => this.local(v, x, 0, z);
		const sx = Math.abs(v.seat.x), seat = [v.seat.x, v.seat.z], slide = [side * sx, v.seat.z], inn = [side * (hw - 0.28), dz], out = [side * (hw + 0.42), dz];
		const yawV = () => v.group.rotation.y;
		const cam = () => (st ? this.frame(L(out[0], out[1]), yawV() + 0.9, 1, 4.6, 0.26) : this.roadCam(L(out[0], out[1]), yawV()));
		let P0 = null, prevS = sv - 9;
		const steps = [];
		if (!st) steps.push({ d: 2.6, start: () => (P0 = this.traveller.group.position.clone()), f: (k) => {
			const s = sv - 9 * (1 - k) * (1 - k);
			put(s, lerp(this.myLane(kind, s), lane, smoothstep(0, 1, k)));
			for (const w of v.wheels) w.rotation.x += (s - prevS) / (v.radius * M);
			prevS = s;
			const yaw = yawV();
			if (P0) this.tvSet(P0, yaw, "idle", Object.assign({}, STAND, { look: -0.7 * (1 - k) }), 1);
			if (st) this.frame(P0 || L(out[0], out[1]), yaw, side, 4.2, 0.24);
			else this.roadCam(P0 || L(out[0], out[1]), yaw, 3.6, 0.24);
		} });
		steps.push(
			{ d: 0.4, start: () => (P0 = P0 || this.traveller.group.position.clone()), f: () => (put(), P0 && this.tvSet(P0, yawV(), "idle", STAND, 1), cam()) },
			{ d: door ? 0.6 : 0.2, f: (k) => (put(), door && door.open(k), P0 && this.tvSet(P0, yawV(), "idle", STAND, 1), cam()) },
			{ d: 0.8, f: (k) => {
				put();
				door && door.open(1);
				const o = L(out[0], out[1]);
				const p = P0 ? P0.clone().lerp(o, k) : o;
				this.tvSet(p, Math.atan2(o.x - (P0 || o).x, o.z - (P0 || o).z) || yawV(), "walk");
				cam();
			} },
			{ d: 1.0, f: (k) => {
				put();
				door && door.open(1);
				this.tvSet(L(lerp(out[0], inn[0], k), dz), (-side * Math.PI) / 2, "idle", mix(STAND, DUCK, smoothstep(0, 0.8, k)), 1, { quat: v.group.quaternion, staff: k < 0.6 });
				cam();
			} },
			{ d: side < 0 ? 1.4 : 1.0, f: (k) => {
				put();
				door && door.open(1);
				const a = side < 0 ? (k < 0.5 ? [lerp(inn[0], slide[0], k * 2), lerp(inn[1], slide[1], k * 2)] : [lerp(slide[0], seat[0], k * 2 - 1), seat[1]]) : [lerp(inn[0], seat[0], k), lerp(inn[1], seat[1], k)];
				this.tvSet(L(a[0], a[1]), ((-side * Math.PI) / 2) * (1 - smoothstep(0.3, 1, k)), "idle", mix(DUCK, sit(v), smoothstep(0, 1, k)), 1, { quat: v.group.quaternion, staff: false });
				cam();
			} },
			{ d: door ? 0.6 : 0.2, f: (k) => (put(), door && door.open(1 - k), this.seated(v), cam()) },
			{ d: 0.3, f: () => (put(), door && door.open(0), this.seated(v), cam()) },
		);
		return steps;
	},
});

// ---------- the motorbike: on and off its stand ----------
Object.assign(Journey.prototype, {
	bikeSpot(T) {
		return { s: T.s + 0.2 * M, lane: this.kerbLane("bike", T.s) };
	},
	epMount(T) {
		const b = this.v.bike, sp = this.bikeSpot(T);
		const put = (lean, up) => (this.putRoad(b, sp.s, sp.lane, M), b.park(lean, up), b.frame.updateMatrixWorld(true));
		const L = (x, z) => this.local(b, x, 0, z);
		const F = (out = new THREE.Vector3()) => b.frame.localToWorld(out.set(0, -0.01, -0.22));
		const fq = () => b.frame.getWorldQuaternion(new THREE.Quaternion());
		const yawB = () => b.group.rotation.y;
		const cam = () => this.roadCam(L(0.3, 0), yawB(), 3.4, 0.2);
		let P0;
		return [
			{ d: 0.7, start: () => (P0 = this.traveller.group.position.clone()), f: (k) => {
				put(0.16, 0);
				b.staff.visible = false;
				this.tvSet(P0.clone().lerp(L(0.55, -0.2), k), yawB(), "walk");
				cam();
			} },
			// the staff goes onto the carrier and is strapped there
			{ d: 1.6, f: (k) => {
				put(0.16, 0);
				const turn = smoothstep(0, 0.3, k) * (1 - smoothstep(0.75, 1, k));
				b.staff.visible = k > 0.55;
				this.tvSet(L(0.55, -0.2), 2.3 * turn, "idle", REACH, Math.sin(Math.PI * Math.min(1, k * 1.1)), { quat: b.group.quaternion, staff: k <= 0.55 });
				cam();
			} },
			{ d: 0.5, f: (k) => (put(0.16, 0), this.tvSet(L(0.55, -0.2), 0, "idle", BARS, k, { quat: b.group.quaternion, staff: false }), cam()) },
			// a leg over the seat
			{ d: 1.3, f: (k) => {
				put(0.16, 0);
				const p = L(0.55, -0.2).lerp(F(), smoothstep(0.15, 0.85, k));
				const q = b.group.quaternion.clone().slerp(fq(), smoothstep(0.4, 1, k));
				this.tvSet(p, 0, "idle", k < 0.5 ? mix(BARS, LEG_OVER, smoothstep(0, 0.5, k)) : mix(LEG_OVER, FOOT, smoothstep(0.5, 1, k)), 1, { quat: q, staff: false });
				cam();
			} },
			// up off the stand, and the stand kicked up
			{ d: 0.8, f: (k) => (put(lerp(0.16, 0.035, smoothstep(0, 1, k)), 0), this.tvSet(F(), 0, "idle", FOOT, 1, { quat: fq(), staff: false }), cam()) },
			{ d: 0.6, f: (k) => (put(0.035, smoothstep(0.2, 0.8, k)), this.tvSet(F(), 0, "idle", mix(FOOT, KICK, Math.sin(Math.PI * k)), 1, { quat: fq(), staff: false }), cam()) },
			{ d: 0.4, f: (k) => (put(0.035 * (1 - k), 1), this.tvSet(F(), 0, "idle", mix(FOOT, RIDE, k), 1, { quat: fq(), staff: false }), cam()) },
		];
	},
	epDismount(T) {
		const b = this.v.bike, sp = this.bikeSpot(T);
		const put = (lean, up) => (this.putRoad(b, sp.s, sp.lane, M), b.park(lean, up), b.frame.updateMatrixWorld(true));
		const L = (x, z) => this.local(b, x, 0, z);
		const F = (out = new THREE.Vector3()) => b.frame.localToWorld(out.set(0, -0.01, -0.22));
		const fq = () => b.frame.getWorldQuaternion(new THREE.Quaternion());
		const yawB = () => b.group.rotation.y;
		const cam = () => this.roadCam(L(0.3, 0), yawB(), 3.4, 0.2);
		return [
			{ d: 0.6, f: (k) => (put(0.035 * k, 1), (b.staff.visible = true), this.tvSet(F(), 0, "idle", mix(RIDE, FOOT, k), 1, { quat: fq(), staff: false }), cam()) },
			{ d: 0.7, f: (k) => (put(0.035, 1 - smoothstep(0.2, 0.8, k)), this.tvSet(F(), 0, "idle", mix(FOOT, KICK, Math.sin(Math.PI * k)), 1, { quat: fq(), staff: false }), cam()) },
			{ d: 0.6, f: (k) => (put(lerp(0.035, 0.16, smoothstep(0, 1, k)), 0), this.tvSet(F(), 0, "idle", FOOT, 1, { quat: fq(), staff: false }), cam()) },
			{ d: 1.3, f: (k) => {
				put(0.16, 0);
				const p = F().lerp(L(0.55, -0.2), smoothstep(0.15, 0.85, k));
				const q = fq().slerp(b.group.quaternion, smoothstep(0, 0.6, k));
				this.tvSet(p, 0, "idle", k < 0.5 ? mix(FOOT, LEG_OVER, smoothstep(0, 0.5, k)) : mix(LEG_OVER, STAND, smoothstep(0.5, 1, k)), 1, { quat: q, staff: false });
				cam();
			} },
			// the staff comes off the carrier
			{ d: 1.5, f: (k) => {
				put(0.16, 0);
				const turn = smoothstep(0, 0.3, k) * (1 - smoothstep(0.75, 1, k));
				b.staff.visible = k < 0.45;
				this.tvSet(L(0.55, -0.2), 2.3 * turn, "idle", REACH, Math.sin(Math.PI * Math.min(1, k * 1.1)), { quat: b.group.quaternion, staff: k >= 0.45 });
				cam();
			}, end: () => (this.parked = sp) },
			{ d: 0.3, f: () => (put(0.16, 0), this.tvSet(L(0.55, -0.2), 0, "idle", STAND, 1, { quat: b.group.quaternion }), cam()) },
		];
	},
});

// ---------- the train: walking to the coach, climbing in, getting down at the other end ----------
// The walk through a station, from the forecourt up the steps, through the building and along the platform
// (past a name board) to a coach door at v along the platform.
function stationPath(st, vD) {
	const E = RAIL.edge, W = RAIL.platW, at = (u, v, y) => {
		const q = st.at(u, v);
		return new THREE.Vector3(q.x, y === undefined ? q.plat : y, q.z);
	};
	const sg = Math.sign(vD) || 1;
	return [at(st.steps.u1 + 0.3, 0, st.forecourt), at(st.steps.u0 - 0.05, 0), at(E + W * 0.55, 0), at(E + W * 0.5, vD - sg * 0.9), at(E + 0.13, vD)];
}
Object.assign(Journey.prototype, {
	// on a platform: from along the platform, a little above head height, the train on one side
	platformCam(st, p, dir) {
		const yawR = st.yaw, dx = Math.sin(yawR), dz = Math.cos(yawR);
		const u = (p.x - st.x) * dz - (p.z - st.z) * dx;
		const t = new THREE.Vector3(p.x, p.y + 0.38, p.z);
		// in the forecourt and on the steps: from the forecourt; on the platform: from behind along it, just
		// in from the edge, under the canopy, with the train standing alongside
		if (u > st.building.u1 - 0.1) this.cam = { target: t, yaw: yawR + Math.PI / 2 + 0.5 * dir, pitch: 0.16, dist: 4.4 };
		else this.cam = { target: t, yaw: yawR + (dir > 0 ? Math.PI + 0.16 : -0.16), pitch: 0.1, dist: 4.2 };
	},
	coachPt(r, x, y, z) {
		const c = r.cars[r.tc];
		c.group.updateMatrixWorld(true);
		return c.group.localToWorld(new THREE.Vector3(x, y, z));
	},
	epToTrain(T) {
		const r = this.rake, st = r.stops[0], c = r.cars[r.tc], d = r.td, S = c.S;
		const vD = () => r.doorA() - st.a;
		const face = () => {
			const q = st.at(0, vD());
			return Math.atan2(-q.dz, q.dx);
		};
		const step = () => this.coachPt(r, S.W / 2 - 0.02, S.floor, d.z), inside = () => this.coachPt(r, S.W / 2 - 0.8, S.floor, d.z);
		let P5;
		const cam = (p) => this.platformCam(st, p, 1);
		// where the traveller rides: in the open doorway, holding the grab rail, as renderRide has it
		const sg = Math.sign(d.z) || 1;
		const atDoor = () => this.coachPt(r, S.W / 2 - 0.17, S.floor, d.z - sg * 0.05), grip = () => this.coachPt(r, S.W / 2 + 0.07, S.floor + 1.08, d.z + S.doorW / 2 + 0.06);
		return [
			this.walkTo(() => (this.passengers(r, st), [this.traveller.group.position.clone(), ...stationPath(st, vD())]), (p) => this.platformCam(st, p, 1), st),
			{ d: 0.7, start: () => (P5 = this.traveller.group.position.clone()), f: (k) => (d.open(k), this.tvSet(P5, face(), "idle", STAND, 1), cam(P5)) },
			{ d: 1.1, f: (k) => {
				d.open(1);
				const p = P5.clone().lerp(step(), smoothstep(0.1, 0.9, k));
				this.tvSet(p, face(), "idle", mix(STAND, STEP_UP, Math.sin(Math.PI * k)), 1);
				cam(P5);
			} },
			{ d: 0.9, f: (k) => {
				d.open(1);
				this.tvSet(step().lerp(inside(), k), face(), "walk");
				cam(P5);
			} },
			// a look down the coach for the berth, a bag pushed under it, then back to stand in the doorway, the way
			// people ride in an Indian train, the door left open
			{ d: 1.2, f: (k) => {
				d.open(1);
				this.tvSet(inside(), face() + Math.PI / 2 * Math.sin(Math.PI * k), "idle", STAND, 1);
				cam(P5);
			} },
			{ d: 0.9, f: (k) => {
				d.open(1);
				// in the coach's own frame: from facing in (-x) round to facing out of the door, as renderRide stands
				this.tvSet(inside().lerp(atDoor(), smoothstep(0, 1, k)), lerp(-Math.PI / 2, 1.0, smoothstep(0, 1, k)), k < 0.9 ? "walk" : "idle", mix(STAND, DOOR, smoothstep(0.4, 1, k)), 1, { quat: r.cars[r.tc].group.quaternion, diya: false });
				cam(P5);
			} },
			// the guard's whistle, the horn, and away
			{ d: 1.8, start: () => (this.sound.whistle(), setTimeout(() => this.sound.horn(1.2), 900)), f: () => (d.open(1), this.tvSet(atDoor(), 1.0, "idle", DOOR, 1, { quat: r.cars[r.tc].group.quaternion, diya: false, reachL: grip() }), cam(P5)) },
		];
	},
	epTrainOff(T) {
		const r = this.rake, st = r.stops.at(-1), c = r.cars[r.tc], d = r.td, S = c.S;
		T.s = this.roads.trains[this.app.leg].to;
		const kind = T.to === "train" || !veh(T.to) ? "auto" : T.to;
		const v = this.v[kind];
		const door = v.door ? v.doors[v.doorR] : null;
		const dz = door ? (door.z0 + door.z1) / 2 : v.seat.z;
		const sv = T.s - dz * M;
		const wait = () => this.putRoad(v, sv, st.laneRoad, M, 1, st.forecourt);
		const vD = () => r.doorA() - st.a;
		const face = () => {
			const q = st.at(0, vD());
			return Math.atan2(-q.dz, q.dx);
		};
		const step = () => this.coachPt(r, S.W / 2 - 0.02, S.floor, d.z);
		let P5;
		const cam = () => this.platformCam(st, P5 || step(), -1);
		const walk = this.walkTo(() => {
			wait();
			const out = this.local(v, -(v.hull.x + 0.42), 0, dz);
			return [...stationPath(st, vD()).reverse(), out];
		}, (p) => (wait(), this.platformCam(st, p, -1)), st);
		const board = this.epBoard(T, kind, st);
		return [
			// from riding in the doorway (renderRide's spot and pose), a turn to face the platform, and down
			{ d: 0.8, start: () => ((P5 = stationPath(st, vD()).at(-1)), this.passengers(r, st)), f: (k) => {
				wait();
				d.open(1);
				const sg = Math.sign(d.z) || 1, at = this.coachPt(r, S.W / 2 - 0.17, S.floor, d.z - sg * 0.05);
				this.tvSet(at.lerp(step(), smoothstep(0, 1, k)), lerp(1.0, Math.PI / 2, smoothstep(0, 1, k)), "idle", mix(DOOR, STAND, smoothstep(0, 0.7, k)), 1, { quat: c.group.quaternion, diya: false });
				cam();
			} },
			{ d: 1.1, f: (k) => {
				wait();
				d.open(1);
				this.tvSet(step().lerp(P5, smoothstep(0.1, 0.9, k)), face() + Math.PI, "idle", mix(STAND, STEP_UP, Math.sin(Math.PI * k)), 1);
				cam();
			} },
			walk,
			...board,
		];
	},
	// other passengers: some get down and walk off through the station, others walk up and climb in
	passengers(r, st) {
		this.tasks = [];
		this.taskT = 0;
		this.taskSt = st;
		const doors = [];
		r.cars.forEach((c, ci) => c.doors.forEach((d) => ci && !(ci === r.tc && d === r.td) && doors.push([ci, d])));
		if (!doors.length) return;
		this.walkers.forEach((w, i) => {
			const [ci, d] = doors[(i * 3 + 1) % doors.length];
			this.tasks.push({ w, ci, d, off: st.kind !== "origin" && i % 2 === 0, t0: 0.6 + i * 1.4 });
		});
	},
	renderTasks(r) {
		const st = this.taskSt, E = RAIL.edge, W = RAIL.platW;
		const live = r && st && (this.halt || this.ep);
		for (const T of this.tasks) {
			const t = this.taskT - T.t0;
			if (!live || t < 0) {
				T.w.show(false);
				continue;
			}
			const c = r.cars[T.ci], S = c.S;
			c.group.updateMatrixWorld(true);
			const L = (x, y, z) => c.group.localToWorld(new THREE.Vector3(x, y, z));
			const a = r.carA(T.ci) + T.d.z * M, v = a - st.a;
			const plat = (u, vv) => {
				const q = st.at(u, vv);
				return new THREE.Vector3(q.x, q.plat, q.z);
			};
			const pts = [L(S.W / 2 - 0.6, S.floor, T.d.z), L(S.W / 2 - 0.02, S.floor, T.d.z), plat(E + 0.15, v), plat(E + W * 0.6, v * 0.6), plat(E + W * 0.6, 0), plat(st.building.u0 + 0.4, 0)];
			if (!T.off) {
				pts.length = 3;
				pts.reverse();
				pts.unshift(plat(E + W * 0.75, v + (T.ci % 2 ? 2.5 : -2.5)));
			}
			const len = pathLen(pts), d = t * WALK;
			T.d.open(clamp(t * 2, 0, 1) * (1 - clamp((d - len) * 3, 0, 1)));
			if (d > len) {
				T.w.show(false);
				continue;
			}
			const p = along(pts, d);
			T.w.group.position.copy(p);
			T.w.group.rotation.y = p.yaw;
			T.w.show(true, true, this.dtA || 0);
		}
	},
	// people waiting on the platform of the station at hand
	renderCrowd(r, camera) {
		let near = null;
		if (r) for (const st of r.stops) if (Math.hypot(camera.position.x - st.x, camera.position.z - st.z) < 70) near = st;
		const spots = [[0.62, -14], [0.8, -6.2], [0.55, -2.4], [0.75, 4.2], [0.6, 12.5], [0.82, 16.5]];
		this.crowd.forEach((m, i) => {
			m.visible = !!near;
			if (!near) return;
			const q = near.at(RAIL.edge + RAIL.platW * spots[i][0], spots[i][1]);
			m.position.set(q.x, q.plat, q.z);
			m.rotation.y = Math.atan2(-q.dz, q.dx) + (i % 3) * 0.4 - 0.4;
		});
	},
});

// ---------- each frame: the trains, the vehicles, the traveller, the camera ----------
Object.assign(Journey.prototype, {
	// Returns true when it has placed the traveller (riding, seated, on the train, or getting on or off).
	place(dt, t, camera, dist) {
		const app = this.app;
		this.sync();
		const playing = app.state === "travel" && app.playing;
		const dtA = playing ? dt * Math.pow(this.speeds[app.speed], 0.75) : 0;
		this.dtA = dtA;
		for (const r of this.rakes) r.place(camera, t);
		for (const v of Object.values(this.v)) v.group.visible = false;
		this.cam = null;
		this.tv = null;
		if (app.state !== "travel") {
			for (const w of this.walkers) w.show(false);
			this.renderCrowd(null, camera);
			return false;
		}
		const vsFar = clamp(dist * 0.009, 0.28, 0.42);
		const b = this.v.bike;
		// the motorbike on its stand: where it was left, or waiting ahead for the traveller
		const { next } = this.around(app.s);
		const wait = !this.ep && next && next.from === "walk" && next.to === "bike" && next.s - app.s < 25 ? this.bikeSpot(next) : null;
		const pk = this.parked && Math.abs(this.parked.s - app.s) < 30 ? this.parked : wait;
		if (pk && !(this.ep && this.ep.T.to === "bike")) {
			this.putRoad(b, pk.s, pk.lane, vsFar);
			b.park(0.16, 0);
			b.staff.visible = false;
		}
		for (const L of this.leaving) {
			const w = smoothstep(0, 4, L.s - L.s0);
			this.putRoad(L.v, L.s, lerp(L.lane, this.myLane(L.v.kind, L.s), w), M, L.yW * (1 - w), L.yF);
			for (const wh of L.v.wheels) wh.rotation.x += (L.v0 * dtA) / (L.v.radius * M);
		}
		let handled = true;
		if (this.ep) this.renderEp();
		else if (this.onTrain) this.renderRide(t);
		else {
			const mode = this.modeAt(app.s);
			if (veh(mode)) this.renderDrive(mode, t, vsFar);
			else handled = false;
		}
		this.prevS = app.s;
		this.taskT = (this.taskT || 0) + dtA;
		this.renderTasks(this.rake);
		this.renderCrowd(this.rake, camera);
		if (this.tv) this.drive(dt, t, dist);
		// which shot this is, so main.js cuts between shots rather than swinging the camera through a coach or a bus
		if (this.cam && !this.cam.key) this.cam.key = this.ep ? "ep" + this.ep.id : "train";
		return handled;
	},
	renderDrive(kind, t, vs) {
		const app = this.app, v = this.v[kind];
		const { lane, yW, yF } = this.laneAt(kind, app.s);
		this.wob = Math.max(0, this.wob - (this.dtA || 0) * 0.45);
		const roll = kind === "bike" ? this.wob * Math.sin(t * 6.5) * 0.06 : 0;
		this.putRoad(v, app.s, lane, vs, yW, yF, roll);
		const ds = this.prevS === undefined ? 0 : app.s - this.prevS;
		if (Math.abs(ds) < 2) for (const w of v.wheels) w.rotation.x += ds / (v.radius * vs);
		if (kind === "bike") {
			v.park(0, 1);
			v.staff.visible = true;
			v.frame.updateMatrixWorld(true);
			const p = v.frame.localToWorld(new THREE.Vector3(0, -0.01, -0.22));
			this.tvSet(p, 0, "ride", null, 0, { quat: v.frame.getWorldQuaternion(new THREE.Quaternion()), scale: vs / M, staff: false });
		} else {
			this.seated(v);
			this.tv.scale = vs / M;
		}
	},
	// on the train: standing at the open door, holding the rail, the country going by
	renderRide(t) {
		const r = this.rake, c = r.cars[r.tc], d = r.td, S = c.S, sg = Math.sign(d.z) || 1;
		// the door stays open: the traveller rides in it, as so many do on an Indian train
		d.open(1);
		const pos = this.coachPt(r, S.W / 2 - 0.17, S.floor, d.z - sg * 0.05);
		const grip = this.coachPt(r, S.W / 2 + 0.07, S.floor + 1.08, d.z + S.doorW / 2 + 0.06);
		// the traveller rides at the open door, always in view, holding the grab rail
		this.tvSet(pos, 1.0, "idle", DOOR, 1, { quat: c.group.quaternion, diya: false, vis: true, reachL: grip });
		// every shot is framed on the traveller in the doorway: close beside the door, from a little ahead
		// along the coach with the train curving behind, and from outside level with the door
		const h = c.group.rotation.y;
		const shot = this.halt ? 3 : Math.floor(this.app.t / 13) % 3;
		const me = pos.clone().add(new THREE.Vector3(0, 0.3, 0));
		// cameras sit outside the doorway, on the door's own side of the coach (local +x), so the open door
		// and the traveller standing in it face the lens
		const from = (out, along, up) => {
			const q = this.coachPt(r, S.W / 2 + out, S.floor + up, d.z + sg * along);
			const dx = q.x - me.x, dy = q.y - me.y, dz = q.z - me.z, dist = Math.hypot(dx, dy, dz);
			return { target: me, yaw: Math.atan2(dx, dz), pitch: Math.asin(dy / dist), dist };
		};
		if (shot === 0) this.cam = from(2.6, 1.6, 0.5);
		else if (shot === 1) this.cam = from(1.2, 0.9, 0.35);
		else if (shot === 2) this.cam = from(3.6, 4.5, 1.4);
		else this.cam = { target: pos.clone().add(new THREE.Vector3(0, 0.22, 0)), yaw: h + 0.16, pitch: 0.03, dist: 4.6 }; // at a halt, along the platform under the canopy
		this.cam.key = "ride" + shot;
	},
	drive(dt, t, dist) {
		const tv = this.tv, tr = this.traveller, J = tr.J;
		tr.group.visible = tv.vis;
		tr.group.position.copy(tv.pos);
		if (tv.quat) tr.group.quaternion.copy(tv.quat);
		else tr.group.quaternion.identity();
		tr.group.scale.setScalar(tv.scale || 1);
		tr.yaw = tv.yaw;
		tr.update(this.dtA || 0, t, { mode: tv.mode, rate: tv.mode === "walk" ? 1.45 : 1, yaw: tv.yaw, distance: dist });
		if (tv.over && tv.w > 0.001) {
			P.pose(J, mix(readPose(J), tv.over, tv.w));
			held(tr);
		}
		if (tv.reachL && P.reach) {
			tr.group.updateMatrixWorld(true);
			const r = P.reach(J, "L", tv.reachL);
			if (r && r.err < 0.25) {
				const p = readPose(J);
				Object.assign(p, { shL: r.sh, shLz: r.shz, elL: r.el });
				P.pose(J, p);
				held(tr);
			}
		}
		if (J.staff) J.staff.visible = tv.staff;
		// the lit diya is carried only on foot: never on the bike, in a vehicle or on the train (quat = riding in something)
		if (J.diya) J.diya.visible = tv.diya && tv.mode !== "ride" && !tv.quat;
		if (J.halo && J.diya) J.halo.visible = J.diya.visible;
	},
	// main.js lets go of the traveller: back upright and life-size in the world
	release() {
		const tr = this.traveller;
		tr.group.quaternion.identity();
		if (tr.J.staff) tr.J.staff.visible = true;
		if (tr.J.diya) tr.J.diya.visible = true;
	},
	// the camera's goal while getting on or off, or on the train; null leaves it to main.js
	camera() {
		return this.cam;
	},
	// for the checks: what the traveller is doing and with which vehicle
	status() {
		const e = this.ep;
		// "inside": in or astride a vehicle, or passing through its door (anything placed in the vehicle's own frame)
		return { ep: e ? e.T.from + ">" + e.T.to : null, step: e ? e.i : -1, onTrain: this.onTrain, halt: !!this.halt, inside: !!(this.tv && this.tv.quat), vis: !!(this.tv ? this.tv.vis : true) };
	},
});
