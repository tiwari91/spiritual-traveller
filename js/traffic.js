// Traffic on the road around the traveller: goods trucks, state transport buses, autorickshaws,
// tractors with trolleys and cars. India drives on the left: slower traffic keeps to the left edge,
// oncoming traffic passes on the right, and the traveller runs near the middle to overtake.
import * as THREE from "three";
import { Batch, T, VCOL, place } from "./batch.js";
import { M } from "./roads.js";
import { rand } from "./util.js";

// Each model is built in metres, facing +z, wheels on y = 0.
function wheels(b, xs, zs, r, w) {
	for (const x of xs) for (const z of zs) {
		b.add(T.cyl, place(x, r, z, 0, r * 2, w, r * 2, 0, Math.PI / 2), 0x1b1b1d);
		b.add(T.cyl, place(x + Math.sign(x) * 0.01, r, z, 0, r * 1.1, w + 0.02, r * 1.1, 0, Math.PI / 2), 0x8a8a8a);
	}
}
function truck(R) {
	const b = new Batch();
	const cab = [0xf08a1e, 0xf0c419, 0x2a7ac0, 0xd8261c, 0x2f8a4a][Math.floor(R() * 5)];
	const body = [0x2a5ab0, 0xd8261c, 0xe0a020, 0x2f8a4a, 0x7a3a24][Math.floor(R() * 5)];
	wheels(b, [-1.05, 1.05], [2.3, -1.4, -2.6], 0.5, 0.35);
	b.add(T.box, place(0, 0.5, 0, 0, 2.2, 0.35, 7.2), 0x222222); // chassis
	b.add(T.box, place(0, 0.85, 2.7, 0, 2.3, 1.7, 1.7), cab); // cab
	b.add(T.box, place(0, 1.75, 3.45, 0, 2.1, 0.75, 0.05), 0x22303a); // windscreen
	b.add(T.box, place(0, 2.5, 2.9, 0, 2.35, 0.45, 1.5), body); // the painted crown over the cab
	b.add(T.box, place(0, 0.95, 3.62, 0, 2.1, 0.5, 0.1), 0xc0c0c0); // grille and bumper
	// the high wooden cargo body, painted in bands, with a tarp over the load
	b.add(T.box, place(0, 0.85, -1.0, 0, 2.4, 2.0, 5.0), body);
	b.add(T.box, place(0, 1.55, -1.0, 0, 2.42, 0.18, 5.02), 0xf0c419);
	b.add(T.box, place(0, 1.25, -1.0, 0, 2.42, 0.1, 5.02), 0xd8261c);
	b.add(T.dome, place(0, 2.85, -1.0, 0, 2.3, 0.7, 4.9), [0x2a5ab0, 0x3a6a3a, 0x8a8a8a][Math.floor(R() * 3)]);
	return b;
}
function bus(R) {
	const b = new Batch();
	// red and cream mofussil bus, as the state transport corporations run
	const main = [0xc0262d, 0xe0e0d6, 0x2a6aa0][Math.floor(R() * 3)];
	wheels(b, [-1.1, 1.1], [3.0, -2.9], 0.5, 0.32);
	b.add(T.box, place(0, 0.45, 0, 0, 2.5, 2.7, 10.5), main);
	b.add(T.box, place(0, 1.6, 0, 0, 2.52, 0.75, 10.0), 0x22303a); // window band
	for (let z = -4.6; z <= 4.6; z += 1.15) b.add(T.box, place(0, 1.6, z, 0, 2.54, 0.75, 0.12), main);
	b.add(T.box, place(0, 1.2, 0, 0, 2.53, 0.16, 10.52), 0xf0c050);
	b.add(T.box, place(0, 3.15, 0, 0, 2.3, 0.1, 9.8), 0xd8d4ca); // roof
	b.add(T.box, place(0, 3.25, -1.0, 0, 1.6, 0.35, 3.5), 0x5a4a3a); // luggage on the roof carrier
	return b;
}
function auto(R) {
	const b = new Batch();
	// green and yellow CNG autorickshaw, or the older black and yellow
	const [lower, top] = R() < 0.6 ? [0x2f8a3a, 0xf0c419] : [0xf0c419, 0x1b1b1b];
	b.add(T.cyl, place(0, 0.22, 1.05, 0, 0.44, 0.12, 0.44, 0, Math.PI / 2), 0x1b1b1d);
	wheels(b, [-0.6, 0.6], [-0.6], 0.22, 0.12);
	b.add(T.box, place(0, 0.2, -0.2, 0, 1.3, 0.75, 1.9), lower);
	b.add(T.box, place(0, 0.3, 0.95, 0, 0.9, 0.85, 0.35), lower);
	b.add(T.box, place(0, 1.0, -0.15, 0, 1.32, 0.05, 1.95), top);
	b.add(T.dome, place(0, 1.05, -0.15, 0, 1.32, 0.5, 1.95), top);
	b.add(T.box, place(0, 0.95, 0.85, 0, 0.9, 0.5, 0.04), 0x22303a);
	for (const x of [-0.62, 0.62]) b.add(T.box, place(x, 0.95, 0.55, 0, 0.04, 0.6, 0.04), top);
	return b;
}
function tractor(R) {
	const b = new Batch();
	const paint = R() < 0.6 ? 0xc0262d : 0x2a5ab0;
	b.add(T.cyl, place(-0.85, 0.75, -0.6, 0, 1.5, 0.45, 1.5, 0, Math.PI / 2), 0x1b1b1d);
	b.add(T.cyl, place(0.85, 0.75, -0.6, 0, 1.5, 0.45, 1.5, 0, Math.PI / 2), 0x1b1b1d);
	wheels(b, [-0.7, 0.7], [1.2], 0.4, 0.25);
	b.add(T.box, place(0, 0.6, 0.6, 0, 0.8, 0.8, 1.9), paint); // bonnet
	b.add(T.box, place(0, 0.6, -0.5, 0, 1.2, 0.7, 0.9), 0x333333);
	b.add(T.box, place(0, 1.3, -0.6, 0, 0.5, 0.2, 0.5), 0x2a2622); // seat
	b.add(T.cyl, place(0.25, 1.4, 1.2, 0, 0.1, 0.8, 0.1), 0x222222); // exhaust stack
	// a trolley heaped with fodder
	wheels(b, [-1.0, 1.0], [-3.4], 0.45, 0.3);
	b.add(T.box, place(0, 0.75, -3.4, 0, 2.2, 0.6, 3.2), 0x3a5a8a);
	b.add(T.dome, place(0, 1.35, -3.4, 0, 2.3, 1.3, 3.3), 0xd1b25e);
	return b;
}
function car(R) {
	const b = new Batch();
	const paint = [0xf2f2ee, 0xc8ccd0, 0x8a1a1a, 0x2a2a2e, 0xe8e2d0][Math.floor(R() * 5)];
	wheels(b, [-0.72, 0.72], [1.2, -1.2], 0.3, 0.2);
	b.add(T.box, place(0, 0.3, 0, 0, 1.6, 0.65, 3.9), paint);
	b.add(T.box, place(0, 0.95, -0.25, 0, 1.45, 0.55, 2.1), paint);
	b.add(T.box, place(0, 0.98, -0.25, 0, 1.47, 0.42, 1.9), 0x22303a);
	return b;
}
const MAKERS = { truck, bus, auto, tractor, car };
// What you meet on each kind of road.
const MIX = {
	nh: ["truck", "truck", "truck", "bus", "car", "car", "auto", "tractor"],
	ghat: ["bus", "car", "truck", "car", "auto"],
	hill: ["car", "bus", "car", "truck"],
};
const LEN = { truck: 7.5, bus: 10.5, auto: 2.6, tractor: 6, car: 4 };

export class Traffic {
	constructor(roads, scene, low = false) {
		this.roads = roads;
		this.group = new THREE.Group();
		scene.add(this.group);
		const R = rand(311);
		this.models = {};
		for (const k of Object.keys(MAKERS)) {
			this.models[k] = [];
			for (let i = 0; i < 3; i++) {
				const m = MAKERS[k](R).build(VCOL);
				m.visible = false;
				this.group.add(m);
				this.models[k].push(m);
			}
		}
		this.cars = [];
		const n = low ? 6 : 10;
		for (let i = 0; i < n; i++) this.cars.push({ mesh: null, s: 0, dir: 1, speed: 0, type: "car", live: false });
		this.R = R;
		this.p = {};
	}
	free(type) {
		return this.models[type].find((m) => !m.userData.used);
	}
	spawn(c, s, ahead, kind) {
		if (c.mesh) c.mesh.userData.used = false;
		const types = MIX[kind] || MIX.nh;
		let type = types[Math.floor(this.R() * types.length)], mesh = this.free(type);
		if (!mesh) {
			type = "car";
			mesh = this.free(type);
		}
		if (!mesh) return (c.live = false);
		mesh.userData.used = true;
		c.mesh = mesh;
		c.type = type;
		c.dir = this.R() < 0.55 ? -1 : 1; // -1 oncoming
		c.s = s + (ahead ? 1 : this.R() * 2 - 0.6) * (18 + this.R() * 22);
		c.k = 0.35 + this.R() * 0.35; // fraction of the traveller's pace
		c.live = true;
	}
	// s: where the traveller is; pace: the traveller's speed along the route (units a second);
	// on: whether traffic should show (the traveller is on the road and the camera is close)
	update(dt, s, pace, on, scale) {
		const p = this.p;
		// no vehicle drives through the one in front in its lane: it drops back to keep a gap
		for (const c of this.cars) {
			if (!c.live) continue;
			for (const o of this.cars) {
				if (o === c || !o.live || o.dir !== c.dir) continue;
				const gap = (o.s - c.s) * c.dir;
				const need = ((LEN[c.type] + LEN[o.type]) / 2 + 3) * scale;
				if (gap > 0 && gap < need) c.s = o.s - need * c.dir;
			}
		}
		for (const c of this.cars) {
			if (!on) {
				if (c.mesh) c.mesh.visible = false;
				continue;
			}
			const here = this.roads.road(s, 0, p);
			if (!c.live && here && here.kind !== "trek") this.spawn(c, s, false, here.kind);
			if (!c.live) continue;
			// same-direction traffic is slower than the traveller and is overtaken; oncoming closes fast
			c.s += (c.dir > 0 ? pace * c.k : -pace * (0.4 + c.k * 0.5)) * dt + (c.dir > 0 ? 1 : -1) * dt * 1.2;
			const rel = c.s - s;
			if (rel < -22 || rel > 48) {
				this.spawn(c, s, true, here ? here.kind : "nh");
				if (!c.live) continue;
			}
			const r = this.roads.road(c.s, 0, p);
			if (!r || r.kind === "trek") {
				c.mesh.visible = false;
				continue;
			}
			const paved = r.kind === "nh" ? 7.5 : r.kind === "ghat" ? 7 : 5.5;
			// lane offsets in metres from the centre; slow vehicles hug the left edge
			// lanes widen with the vehicles when they are drawn larger than life from far away
			const lane = (c.dir > 0 ? -(paved / 2 - 1.3) : paved / 2 - 1.25) * (scale / M);
			const q = this.roads.road(c.s, lane, p);
			const m = c.mesh;
			m.visible = true;
			m.position.set(q.x, q.y + 0.02, q.z);
			m.rotation.y = Math.atan2(q.dx, q.dz) + (c.dir > 0 ? 0 : Math.PI);
			m.scale.setScalar(scale);
		}
	}
}
export { LEN };
// A parked vehicle of the given type, as a Batch in metres, for bus stands and dhabas.
export const parkedVehicle = (type, R) => MAKERS[type](R);
