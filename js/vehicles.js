// How the traveller moves: a motorbike up to the Sahyadri, a taxi or a pilgrim jeep on the ghat and hill
// roads, an autorickshaw across town, and the train across the Deccan and the plains. Everything is modelled
// in metres, facing +z, with the ground (or, for the train, the top of the rail) at y = 0; main.js and
// boarding.js scale it into the world. Each model says where its doors, seats and hull are, so the traveller
// can get in and out of it.
import * as THREE from "three";
import { body, crowdOpts, mergeFigure, pose } from "./pilgrim.js";
import { rand } from "./util.js";
import { Batch } from "./batch.js";
import { hull, sidePanel } from "./traffic.js";
import { BOX, CYL, DISC, Kit, LAMPS, Outline, QUAD, SPH, archFlare, arc, at, carDressing, carSkin, lathe, longSlab, loft, planWidth, prep, rbox, section, stations, wheel } from "./carkit.js";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
const LIGHT = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 1.2 });

function part(geo, m, x, y, z, parent) {
	const o = new THREE.Mesh(geo, m);
	o.position.set(x, y, z);
	o.castShadow = true;
	o.receiveShadow = true;
	parent.add(o);
	return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// A road wheel turning about x, as its own mesh in a group; spun by setting rotation.x.
function roadWheel(parent, x, y, z, r, w, side, style, rim) {
	const g = new THREE.Group();
	g.position.set(x, y, z);
	const k = new Kit();
	wheel(k, 0, 0, 0, r, w, side, style, rim, 24);
	g.add(k.build());
	parent.add(g);
	return g;
}
// A figure seated at the wheel, merged into one mesh: knees up, hands forward to the wheel or the bars.
const FIGURE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
function seatedFigure(seed, { reach = 0.9, knee = 1.35 } = {}) {
	const R = rand(seed);
	let o;
	do o = crowdOpts(R);
	while (o.sari);
	o.lod = 0;
	o.bag = false;
	const J = body(o);
	pose(J, { hipL: -1.45, hipR: -1.45, hipLz: 0.1, hipRz: -0.1, kneeL: knee, kneeR: knee, ankleL: 0.15, ankleR: 0.15, shL: -reach, shR: -reach, shLz: 0.18, shRz: -0.18, elL: -0.5, elR: -0.5, lean: 0.05, nod: 0.05 });
	return new THREE.Mesh(mergeFigure(J), FIGURE);
}
// A door that swings open on its front hinge: `pivot` turns about y; open(k) with k from 0 (shut) to 1.
function hinged(parent, x, z0, z1, side, angle = 1.15) {
	const pivot = new THREE.Group();
	pivot.position.set(x, 0, z1);
	parent.add(pivot);
	return { pivot, side, z0, z1, k: 0, open(k) {
		this.k = k;
		pivot.rotation.y = -side * angle * k; // the rear edge swings out
	} };
}
// The lamps of every road vehicle light up after dark with the carriage windows (main.js sets them from
// the hour). VEHICLE_GLOW is the same list, for anything that wants only the road vehicles' lamps.
export const VEHICLE_GLOW = LAMPS;

// ---------- the motorbike ----------
// A Royal Enfield Classic 350 in maroon: spoked wheels under deep mudguards, the teardrop tank with its
// badge and gold lines, the sprung saddle, the finned single and its long chrome silencer, the headlamp in
// its casquette with the two pilot lamps. The rider sits at about 0.8 m. The frame leans on its side stand
// (on the left, +x) when parked; the staff rides strapped along the carrier.
function spokedWheel(parent, z, r, w) {
	const g = new THREE.Group();
	g.position.set(0, r, z);
	const k = new Kit();
	const tyre = lathe([[r * 0.76, -w * 0.4], [r * 0.86, -w * 0.5], [r * 0.97, -w * 0.4], [r, 0], [r * 0.97, w * 0.4], [r * 0.86, w * 0.5], [r * 0.76, w * 0.4], [r * 0.74, 0], [r * 0.76, -w * 0.4]], 28);
	k.add(tyre, at(0, 0, 0, 0, 0, -Math.PI / 2), 0x1e1e20, "matte");
	// the chrome rim, the hub drum and two sets of spokes crossing to it
	k.add(prep(new THREE.TorusGeometry(r * 0.75, 0.012, 6, 36)), at(0, 0, 0, 0, Math.PI / 2, 0), 0xdadde0, "chrome");
	k.cyl(0, 0, 0, 0.13, w * 1.1, 0x9a9ea2, "chrome", "x", 16);
	k.cyl(0, 0, 0, 0.16, 0.035, 0x2a2a2c, "matte", "x", 16);
	for (let i = 0; i < 20; i++) {
		const a = (i / 20) * Math.PI * 2, s = i % 2 ? 1 : -1;
		const x0 = s * 0.04, h0 = 0.055, h1 = r * 0.74;
		const a1 = a + s * 0.28;
		const p0 = new THREE.Vector3(x0, Math.cos(a) * h0, Math.sin(a) * h0), p1 = new THREE.Vector3(0, Math.cos(a1) * h1, Math.sin(a1) * h1);
		const d = p1.clone().sub(p0);
		const m = new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(0.004, d.length(), 0.004));
		k.add(BOX, m, 0xc8ccd0, "chrome");
	}
	g.add(k.build());
	parent.add(g);
	return g;
}
export function motorbike() {
	const g = new THREE.Group();
	const frame = new THREE.Group(); // leans about the line where the tyres touch the ground
	g.add(frame);
	const maroon = 0x5a0f14, gold = 0xc9a24a, black = 0x151517, steel = 0xb8bcc0;
	const wheels = [spokedWheel(frame, 0.7, 0.33, 0.09), spokedWheel(frame, -0.68, 0.33, 0.11)];
	const k = new Kit();
	// deep mudguards, front and rear, on chrome stays
	const guard = (z, r, w, a0, a1) => {
		const s = new THREE.Shape();
		s.absarc(0, 0, r + 0.012, a0, a1, false);
		s.absarc(0, 0, r, a1, a0, true);
		const e = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 18 });
		e.rotateY(-Math.PI / 2);
		k.add(prep(e), at(w / 2, 0.33, z), maroon, "paint");
		for (const sx of [-1, 1]) k.cyl(sx * (w / 2 + 0.012), 0.33 + r * 0.6, z + (z > 0 ? -0.1 : 0.12), 0.012, r * 0.9, 0xdadde0, "chrome", "y", 6);
	};
	guard(0.7, 0.37, 0.12, 0.35, 2.75);
	guard(-0.68, 0.37, 0.14, 0.15, 2.0);
	// the frame: down tube, top tube under the tank, the seat rails down to the rear axle
	const tube = (a, b, d = 0.032, c = black) => {
		const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), D = B.clone().sub(A);
		k.add(CYL(10), new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), D.clone().normalize()), new THREE.Vector3(d, D.length(), d)), c, "matte");
	};
	tube([0, 0.86, 0.5], [0, 0.32, 0.26], 0.04);
	tube([0, 0.86, 0.5], [0, 0.74, -0.25], 0.035);
	for (const sx of [-1, 1]) {
		tube([sx * 0.09, 0.74, -0.22], [sx * 0.09, 0.4, -0.68], 0.025);
		tube([sx * 0.09, 0.74, -0.22], [sx * 0.1, 0.78, -0.72], 0.022);
		tube([sx * 0.09, 0.33, -0.68], [sx * 0.07, 0.3, -0.08], 0.03); // swing arm
		tube([sx * 0.1, 0.36, -0.66], [sx * 0.1, 0.75, -0.55], 0.04, 0xd8dade); // rear shock in chrome
	}
	// the engine: crankcase, the finned cylinder leaning forward, the rocker box, the round side covers
	k.rbox(0, 0.38, 0.0, 0.22, 0.24, 0.36, 0.07, 0x9a9ea4, "chrome");
	for (let i = 0; i < 8; i++) k.add(rbox(0.2 - i * 0.004, 0.012, 0.17 - i * 0.003, 0.02), at(0, 0.53 + i * 0.026, 0.12 + i * 0.006, -0.18, 0, 0), 0x6a6e72, "matte");
	k.rbox(0, 0.76, 0.16, 0.16, 0.06, 0.14, 0.03, 0xd8dade, "chrome", -0.18);
	k.add(CYL(20), at(-0.12, 0.38, 0.02, 0, 0, Math.PI / 2, 0.22, 0.03, 0.22), 0xc8ccd0, "chrome"); // the timing cover, right
	k.add(CYL(20), at(0.12, 0.36, -0.08, 0, 0, Math.PI / 2, 0.26, 0.03, 0.26), 0x8a8e92, "chrome"); // the primary cover, left
	k.rbox(0, 0.42, -0.25, 0.18, 0.18, 0.2, 0.05, 0x2a2a2c, "matte"); // gearbox
	// the exhaust: the header pipe down from the port and the long peashooter silencer along the right
	tube([-0.02, 0.62, 0.24], [-0.1, 0.32, 0.3], 0.04, 0xe0e2e4);
	tube([-0.1, 0.32, 0.3], [-0.14, 0.26, -0.1], 0.04, 0xe0e2e4);
	k.add(lathe([[0.001, -0.42], [0.03, -0.42], [0.042, -0.3], [0.042, 0.25], [0.025, 0.42], [0.001, 0.42]], 16), at(-0.15, 0.28, -0.5, Math.PI / 2 - 0.08, 0, 0), 0xe4e6e8, "chrome");
	// the teardrop tank with its knee pads, the badge and the gold coachlines
	k.add(SPH(20), at(0, 0.84, 0.25, -0.1, 0, 0, 0.27, 0.22, 0.56), maroon, "paint");
	for (const sx of [-1, 1]) {
		k.add(SPH(12), at(sx * 0.115, 0.82, 0.12, -0.1, 0, 0, 0.04, 0.1, 0.16), black, "matte");
		k.add(DISC(16), at(sx * 0.133, 0.86, 0.3, 0, (sx * Math.PI) / 2, 0, 0.07), 0xe6c86a, "chrome");
		k.add(BOX, at(sx * 0.126, 0.9, 0.26, -0.1, 0, 0, 0.004, 0.006, 0.4), gold, "paint");
	}
	k.cyl(0, 0.96, 0.3, 0.07, 0.03, 0xdadde0, "chrome", "y", 14); // the filler cap
	// the sprung saddle and the pillion behind, and the side boxes under them
	k.rbox(0, 0.83, -0.24, 0.26, 0.07, 0.32, 0.03, 0x3a2418, "matte");
	k.rbox(0, 0.84, -0.54, 0.24, 0.06, 0.22, 0.03, 0x3a2418, "matte");
	for (const sx of [-1, 1]) {
		k.cyl(sx * 0.07, 0.77, -0.36, 0.035, 0.08, 0xdadde0, "chrome", "y", 8);
		k.rbox(sx * 0.11, 0.6, -0.26, 0.05, 0.16, 0.24, 0.025, maroon, "paint");
		k.add(BOX, at(sx * 0.136, 0.6, -0.26, 0, 0, 0, 0.004, 0.006, 0.2), gold, "paint");
	}
	// the luggage carrier and a cloth bundle tied on
	k.rbox(0, 0.79, -0.76, 0.3, 0.025, 0.32, 0.01, 0xd8dade, "chrome");
	k.rbox(0, 0.88, -0.8, 0.3, 0.15, 0.22, 0.05, 0xc96a1e, "matte");
	// the forks, the headlamp in its casquette with the two pilot lamps, the bars, grips, levers and mirrors
	for (const sx of [-1, 1]) {
		tube([sx * 0.075, 0.38, 0.72], [sx * 0.075, 0.86, 0.56], 0.034, 0xd8dade);
		tube([sx * 0.075, 0.7, 0.62], [sx * 0.075, 0.9, 0.55], 0.05, maroon);
	}
	k.add(lathe([[0.001, -0.1], [0.09, -0.08], [0.1, 0.0], [0.095, 0.05], [0.001, 0.06]], 20), at(0, 0.88, 0.66, Math.PI / 2, 0, 0), 0xd8dade, "chrome");
	k.lamp(0, 0.88, 0.72, 0.15, 0.15, "head", false, 0xf4f2ea, true);
	for (const sx of [-1, 1]) {
		k.cyl(sx * 0.15, 0.86, 0.66, 0.05, 0.05, 0xd8dade, "chrome", "z", 12);
		k.lamp(sx * 0.15, 0.86, 0.69, 0.035, 0.035, "head", false, 0xf4f2ea, true);
	}
	k.cyl(0, 0.96, 0.6, 0.08, 0.04, 0x1a1a1a, "matte", "y", 16); // the speedometer
	k.add(DISC(16), at(0, 0.982, 0.6, -Math.PI / 2, 0, 0, 0.07), 0xf2f0e6, "matte");
	k.cyl(0, 1.0, 0.5, 0.022, 0.7, 0xdadde0, "chrome", "x", 8); // the handlebar
	for (const sx of [-1, 1]) {
		k.cyl(sx * 0.31, 1.0, 0.5, 0.034, 0.11, black, "matte", "x", 10); // grips
		k.add(BOX, at(sx * 0.24, 1.0, 0.56, 0, sx * 0.4, 0, 0.012, 0.012, 0.16), 0xc8ccd0, "chrome"); // levers
		tube([sx * 0.22, 1.0, 0.5], [sx * 0.28, 1.2, 0.48], 0.012, 0xdadde0);
		k.cyl(sx * 0.28, 1.22, 0.48, 0.09, 0.02, 0xdadde0, "chrome", "z", 16); // the round mirrors
		k.add(DISC(16), at(sx * 0.28, 1.22, 0.468, 0, Math.PI, 0, 0.08), 0xc8d4dc, "chrome");
	}
	// tail lamp, plates, foot pegs and the brake pedal
	k.rbox(0, 0.62, -1.0, 0.1, 0.06, 0.05, 0.015, 0x1a1a1a, "matte");
	k.lamp(0, 0.62, -1.03, 0.08, 0.045, "tail", true);
	k.plate("mh", 0, 0.52, -1.02, 0.24, 0.06, true);
	for (const x of [-0.17, 0.17]) k.rbox(x, 0.3, 0.12, 0.12, 0.03, 0.05, 0.01, black, "matte");
	frame.add(k.build());
	// the side stand: a leg hinged under the left foot peg, swung down to the ground or folded up behind
	const stand = new THREE.Group();
	stand.position.set(0.12, 0.3, 0.02);
	frame.add(stand);
	const sk = new Kit();
	sk.cyl(0, -0.17, 0, 0.026, 0.34, black, "matte", "y", 8);
	sk.rbox(0, -0.34, 0, 0.05, 0.015, 0.06, 0.005, black, "matte");
	stand.add(sk.build());
	// the staff, strapped along the right of the carrier, and its two straps
	const staff = new THREE.Group();
	staff.position.set(-0.13, 0.86, -0.6);
	staff.rotation.x = -0.12;
	frame.add(staff);
	const rod = part(new THREE.CylinderGeometry(0.02, 0.022, 1.75, 8), mat(0x6b4a2a, { roughness: 0.7 }), 0, 0, 0.12, staff);
	rod.rotation.x = Math.PI / 2;
	for (const z of [-0.12, 0.2]) part(box(0.05, 0.05, 0.03), mat(0x2a1d16), 0, 0, z, staff);
	staff.visible = false;
	return {
		kind: "bike", group: g, frame, wheels, stand, staff, radius: 0.33,
		seat: new THREE.Vector3(0, 0.84, -0.22),
		// parked: leaning about 9 degrees onto the stand; standUp: 0 down, 1 folded
		park(lean, standUp) {
			frame.rotation.z = -lean;
			stand.rotation.set(0.35 - standUp * 1.9, 0, -0.55 * (1 - standUp));
		},
		hull: { x: 0.36, y0: 0.05, y1: 1.05, z0: -1.05, z1: 1.05 },
	};
}

// ---------- cars ----------
// A car the traveller rides in: the lofted body of carkit.js, opened up over the cabin, with four doors that
// open, see-through tinted glass, seats, the dashboard and the steering wheel on the right, so the traveller
// can be seen sitting inside. S is the body (as carkit.js has it), o the cabin and the doors.
function rideCar(S, o, look) {
	const g = new THREE.Group();
	const shell = new THREE.Group();
	g.add(shell);
	const hw = S.W / 2;
	const defs = [["front", o.frontDoor], ["rear", o.rearDoor]];
	const gap = 0.008;
	const cuts = defs.flatMap(([, [z0, z1]]) => [z0, z0 + gap, z1 - gap, z1]);
	const inDoor = (z) => defs.find(([, [z0, z1]]) => z > z0 + gap && z < z1 - gap);
	const seam = (z) => defs.some(([, [z0, z1]]) => (z > z0 && z < z0 + gap) || (z > z1 - gap && z < z1));
	const [cab0, cab1] = [o.cabin, S.zA - 0.05];
	const sk = carSkin(S, { paintSlot: "paint2", cuts, cladding: look.cladding, step: 0.05 }, (z, j, side, which, slot) => {
		const d = inDoor(z), name = d && (side > 0 ? "L" : "R") + d[0];
		if (which === "lower") {
			if (z > cab0 && z < cab1 && j >= 13) return null; // open over the cabin, under the glass
			if (j >= 4 && j < 13) {
				if (d) return `door|${name}|${slot}`;
				if (seam(z)) return "matte2";
			}
			return slot;
		}
		if (j < 4 && d && (slot === "glass" || slot === "matte")) return `door|${name}|${slot}`;
		return slot;
	});
	const paint = look.paint;
	const colour = (slot) => (slot === "glass" ? 0xffffff : slot.startsWith("matte") ? look.clad ?? 0x1c1c1e : paint);
	const kit = new Kit({ see: true });
	const doorKits = {};
	for (const m of [sk.lower, sk.green]) for (const [key, geo] of m) {
		if (!key.startsWith("door|")) {
			kit.add(geo, at(), colour(key), key === "matte" ? "matte2" : key);
			continue;
		}
		const [, name, slot] = key.split("|");
		(doorKits[name] ||= []).push([geo, slot]);
	}
	carDressing(kit, S, sk, Object.assign({ noWheels: true }, look));
	// the cabin: carpet, dashboard, seats and the steering wheel on the right
	const trim = 0x2a2a2c, seatC = 0x4a4038;
	kit.rbox(0, S.sill + 0.06, (cab0 + S.zA) / 2, S.W - 0.2, 0.06, S.zA - cab0, 0.02, 0x262422, "matte");
	kit.rbox(0, S.waist - 0.1, S.zA - 0.2, S.W - 0.22, 0.24, 0.34, 0.06, trim, "matte");
	kit.rbox(0, S.waist + 0.01, S.zA - 0.12, S.W - 0.3, 0.04, 0.3, 0.02, 0x1a1a1c, "matte");
	const seatY = o.seatY;
	for (const [z, w] of [[o.frontSeat, 0.5], [o.rearSeat, S.W - 0.32]]) {
		for (const x of w > 1 ? [0] : [-0.38, 0.38]) {
			kit.rbox(x, seatY - 0.06, z, w, 0.13, 0.5, 0.05, seatC, "matte");
			kit.rbox(x, seatY + 0.3, z - 0.3, w, 0.62, 0.11, 0.05, seatC, "matte", -0.12);
			if (w < 1) kit.rbox(x, seatY + 0.68, z - 0.33, 0.26, 0.15, 0.09, 0.04, seatC, "matte", -0.12);
		}
	}
	kit.add(prep(new THREE.TorusGeometry(0.18, 0.02, 8, 24)), at(-0.38, S.waist + 0.08, S.zA - 0.4, -0.9, 0, 0), 0x1a1a1c, "matte");
	kit.cyl(-0.38, S.waist - 0.02, S.zA - 0.3, 0.05, 0.3, trim, "matte", "z", 8);
	shell.add(kit.build());
	// the doors, each a panel of the skin with its window, hinged at the front edge
	const doors = {};
	for (const [name, [z0, z1]] of defs) {
		for (const sx of [-1, 1]) {
			const key = (sx > 0 ? "L" : "R") + name;
			const d = hinged(shell, sx * hw, z0, z1, sx, 1.1);
			const dk = new Kit({ see: true });
			const off = at(-sx * hw, 0, -z1);
			for (const [geo, slot] of doorKits[key] || []) dk.add(geo, off, colour(slot), slot === "matte" ? "matte2" : slot);
			// the trim panel inside and the handle outside
			const zm = (z0 + z1) / 2, ym = (S.sill + S.waist) / 2 + 0.05;
			dk.rbox(sx * (sk.sideX(zm, ym) - 0.07 - hw), ym, zm - z1, 0.025, S.waist - S.sill - 0.22, z1 - z0 - 0.1, 0.01, 0x3a3634, "matte");
			const hy = S.waist - 0.085, hz = z0 + 0.16;
			dk.rbox(sx * (sk.sideX(hz, hy) + 0.01 - hw), hy, hz - z1, 0.024, 0.032, 0.16, 0.012, look.chromeHandles ? 0xd8dade : paint, look.chromeHandles ? "chrome" : "paint");
			d.pivot.add(dk.build());
			doors[key] = d;
		}
	}
	const wheels = [];
	for (const sx of [-1, 1]) for (const z of S.axles) wheels.push(roadWheel(g, sx * (hw - (S.tyreW ?? 0.2) / 2 - 0.03), S.r, z, S.r, S.tyreW ?? 0.2, sx, look.wheel ?? "alloy", look.rim ?? 0xb8bcc0));
	return { g, shell, doors, wheels, sk };
}
const SEATED = { hipL: -1.5, hipR: -1.5, hipLz: 0.06, hipRz: -0.06, kneeL: 1.45, kneeR: 1.45, ankleL: 0.05, ankleR: 0.05, shL: -0.5, shR: -0.45, shLz: 0.12, shRz: -0.1, elL: -0.95, elR: -0.9, lean: -0.04, nod: 0.02 };
export { SEATED };

// A white Toyota Innova Crysta-like taxi with yellow commercial plates, as at the Tirupati and Pune taxi
// stands: the long bonnet and big chrome grille, swept headlamps, the people-carrier's long glasshouse.
export function taxi() {
	const o = { L: 4.58, W: 1.78, H: 1.74, waist: 1.0, sill: 0.32, r: 0.33, frontDoor: [0.42, 1.04], rearDoor: [-0.62, 0.38], frontSeat: 0.72, rearSeat: -0.24, seatY: 0.66, cabin: -0.62 };
	const S = { L: o.L, W: o.W, H: o.H, sill: 0.3, waist: o.waist, nose: 0.86, cowl: 1.02, noseBack: 0.22, frontR: 0.16, zA: 1.34, zW: 0.6, zR: -1.98, tail: "hatch", axles: [1.425, -1.325], r: o.r, tyreW: 0.22, gi: 0.07, cornerF: 0.36, cornerR: 0.2, pillars: [[0.37, 0.45, "matte"], [-0.7, -0.6, "matte"], [-9, -1.9, "paint"]] };
	const c = rideCar(S, o, { paint: 0xf4f4f0, plate: "taxi", grille: "innova", plateY: 0.44, lampW: 0.36, lampH: 0.12, lampIn: 0.27, tailW: 0.2, tailH: 0.24, tailY: 0.9, chromeHandles: true, rim: 0xc4c8cc });
	// the TAXI light on the roof
	const k = new Kit();
	k.rbox(0, o.H + 0.05, -0.2, 0.5, 0.11, 0.17, 0.03, 0xf3c623, "paint");
	for (const s of [1, -1]) k.sign("taxisign", 0, o.H + 0.05, -0.2 + s * 0.087, 0.44, 0.08, s < 0 ? Math.PI : 0);
	c.shell.add(k.build());
	const driver = seatedFigure(41);
	driver.position.set(-0.38, o.seatY - 0.95 + 0.08, o.frontSeat + 0.08);
	c.shell.add(driver);
	return { kind: "car", group: c.g, wheels: c.wheels, doors: c.doors, radius: o.r, len: o.L, door: "Lrear", doorR: "Rrear", seat: new THREE.Vector3(0.42, o.seatY + 0.08, o.rearSeat + 0.08), driver,
		hull: { x: o.W / 2, y0: o.sill, y1: o.H, z0: -o.L / 2, z1: o.L / 2 }, roof: o.H, waist: o.waist };
}

// A white Mahindra Bolero-like pilgrim jeep: the upright box, flat bonnet and chrome slatted grille, black
// cladding and wheel arches, roof rails with luggage, the spare wheel on the tailgate, a saffron flag.
export function jeep() {
	const o = { L: 3.99, W: 1.75, H: 1.9, waist: 1.08, sill: 0.42, r: 0.37, frontDoor: [0.66, 0.98], rearDoor: [-0.5, 0.62], frontSeat: 0.78, rearSeat: -0.05, seatY: 0.78, cabin: -0.48 };
	const S = { L: o.L, W: o.W, H: o.H, sill: 0.4, waist: o.waist, nose: 1.1, cowl: 1.13, noseBack: 0.06, frontR: 0.07, zA: 0.995, zW: 0.74, zR: -1.9, tail: "box", axles: [1.44, -1.24], r: o.r, tyreW: 0.23, arch: 0.08, gi: 0.05, cornerF: 0.14, cornerR: 0.1, nLow: 10, nTop: 8, shoulder: 0.58, tumble: 0.04, railR: 0.04, crown: 0.012, screenR: 0.05, rearR: 0.05, pillars: [[0.58, 0.68, "matte"], [-0.56, -0.46, "matte"], [-9, -1.84, "paint"]] };
	const c = rideCar(S, o, { paint: 0xeeeeea, plate: "jeep", grille: "bolero", lampW: 0.25, lampH: 0.19, lampIn: 0.2, lampY: 0.98, grilleY: 0.97, tailW: 0.16, tailH: 0.34, tailY: 1.0, cladding: true, clad: 0x1c1c1e, wheel: "steel", rim: 0xd0d2d4, mirrorBlack: true });
	const k = new Kit();
	const black = 0x1c1c1e;
	const hw = o.W / 2;
	// black arch flares and the side steps
	for (const sx of [-1, 1]) {
		for (const z of S.axles) archFlare(k, sx * (hw - 0.02), S.r + 0.03, z, c.sk.ra, 0.08, black, "matte", Math.PI * 1.06);
		k.rbox(sx * (hw - 0.04), S.sill - 0.03, 0.12, 0.14, 0.04, 1.3, 0.015, 0x2a2a2c, "matte");
	}
	// a heavy black bumper with the fog lamps, and the bull bar's two uprights
	k.rbox(0, S.sill + 0.12, o.L / 2 + 0.05, o.W - 0.04, 0.2, 0.14, 0.05, black, "matte");
	k.rbox(0, S.sill + 0.12, -o.L / 2 - 0.04, o.W - 0.06, 0.18, 0.1, 0.05, black, "matte");
	// roof rails and the luggage on them, the spare wheel on the tailgate, the flag on the bonnet
	for (const sx of [-1, 1]) k.rbox(sx * 0.66, o.H + 0.05, -0.6, 0.04, 0.04, 2.3, 0.015, black, "matte");
	for (const z of [-1.6, -0.6, 0.4]) k.rbox(0, o.H + 0.07, z, 1.36, 0.025, 0.04, 0.01, black, "matte");
	k.rbox(-0.05, o.H + 0.24, -0.2, 1.2, 0.3, 0.8, 0.06, 0x3a5f8a, "matte");
	k.rbox(0.1, o.H + 0.22, -1.0, 0.9, 0.26, 0.6, 0.06, 0x8f3a1e, "matte");
	k.cyl(0.75, o.waist + 0.3, o.L / 2 - 0.12, 0.016, 0.5, 0xd8dade, "chrome", "y", 6);
	k.add(QUAD, at(0.75, o.waist + 0.45, o.L / 2 - 0.28, 0, Math.PI / 2, 0, 0.32, 0.2, 1), 0xff8a1e, "matte");
	k.add(QUAD, at(0.75, o.waist + 0.45, o.L / 2 - 0.28, 0, -Math.PI / 2, 0, 0.32, 0.2, 1), 0xff8a1e, "matte");
	c.shell.add(k.build());
	const sp = new Kit();
	wheel(sp, 0, 0, 0, 0.35, 0.2, 1, "steel", 0xd0d2d4, 22);
	sp.cyl(0, 0, 0, 0.6, 0.16, black, "matte", "x", 22); // its cover
	const spare = sp.build();
	spare.position.set(0, 0.98, -o.L / 2 - 0.15);
	spare.rotation.y = -Math.PI / 2;
	c.shell.add(spare);
	const driver = seatedFigure(77);
	driver.position.set(-0.38, o.seatY - 0.95 + 0.08, o.frontSeat + 0.08);
	c.shell.add(driver);
	return { kind: "jeep", group: c.g, wheels: c.wheels, doors: c.doors, radius: o.r, len: o.L, door: "Lrear", doorR: "Rrear", seat: new THREE.Vector3(0.4, o.seatY + 0.08, o.rearSeat + 0.08), driver,
		hull: { x: o.W / 2, y0: o.sill, y1: o.H, z0: -o.L / 2, z1: o.L / 2 }, roof: o.H, waist: o.waist };
}

// ---------- the autorickshaw ----------
// A Bajaj RE three-wheeler, in metres: the rounded front cowl with its single headlamp over the front wheel
// and its mudguard, the windscreen, the black canvas hood on its frame with the side curtains rolled up, the
// handlebar and the meters, the driver's seat on the centre line and the open passenger bench behind, and
// the rear body over the engine with the spare wheel. Colours: Pune's black and yellow, or Delhi's green and
// yellow. `see` makes the windscreen see-through (the traveller's own ride).
export function autoBody(kit, look = {}) {
	const [lowC, upC] = look.colours || [0x18181a, 0xf2c11c];
	const black = 0x161618, canvasC = 0x1c1c1e, steel = 0x2a2a2c;
	// the rear body: a lofted tub from the tail to the cowl, notched over the rear wheels, dipping to the
	// footwell and the passengers' step, up again behind the bench over the engine
	const tub = new Outline([[-1.22, 0.42, 0.1], [-1.1, 0.3, 0.06], ...arc(-0.72, 0.25, 0.3, Math.PI, 0, 10).map((p) => [p[0], Math.max(0.3, p[1]), 0]), [0.62, 0.3, 0.04], [0.66, 0.44, 0.03], [-0.3, 0.44, 0.04], [-0.36, 0.6, 0.05], [-0.96, 0.62, 0.05], [-1.02, 0.96, 0.08], [-1.22, 0.94, 0.1]]);
	const plan = planWidth(0.65, tub.zmin, tub.zmax, 0.15, 0.28);
	const body = loft(stations(tub.zmin, tub.zmax, 0.05, [-0.42, -1.02]), (z) => {
		const [yb, yt] = tub.span(z) || [0.3, 0.31];
		return section(plan(z), yb, yt, yb + (yt - yb) * 0.55, 8, 5, 16);
	}, (z, j) => (j < 8 || (j >= 13 && z > -0.98) ? "lo" : "up"), { front: "lo", rear: "lo" });
	for (const [k, geo] of body) kit.add(geo, at(), k === "lo" ? lowC : upC, "paint");
	// a coloured band along the tub, and the low side panels by the bench
	for (const sx of [-1, 1]) {
		kit.rbox(sx * 0.645, 0.72, -0.66, 0.035, 0.22, 0.62, 0.015, upC, "paint");
		kit.rbox(sx * 0.645, 0.84, -0.66, 0.04, 0.03, 0.64, 0.012, black, "matte");
	}
	// the cowl: a U of panel round the front, from the footwell up to the dash, and its top
	const cowlShape = (r1, r0) => {
		const s = new THREE.Shape();
		s.moveTo(-0.46, 0.0);
		s.lineTo(-0.46, -0.3);
		s.absellipse(0, -0.3, 0.46, r1, Math.PI, 2 * Math.PI, false);
		s.lineTo(0.46, 0.0);
		s.lineTo(0.43, 0.0);
		s.lineTo(0.43, -0.3);
		s.absellipse(0, -0.3, 0.43, r0, 0, Math.PI, true);
		s.lineTo(-0.43, 0.0);
		return s;
	};
	const wall = (y0, y1, c) => {
		const e = new THREE.ExtrudeGeometry(cowlShape(0.27, 0.24), { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 2, curveSegments: 20 });
		e.rotateX(-Math.PI / 2); // shape y -> -z, depth -> +y
		kit.add(prep(e), at(0, y0, 0.62), c, "paint");
	};
	wall(0.36, 0.72, lowC);
	wall(0.72, 0.98, upC);
	const lid = new THREE.Shape();
	lid.moveTo(-0.46, 0);
	lid.lineTo(-0.46, -0.3);
	lid.absellipse(0, -0.3, 0.46, 0.27, Math.PI, 2 * Math.PI, false);
	lid.lineTo(0.46, 0);
	const top = new THREE.ExtrudeGeometry(lid, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelOffset: -0.015, bevelSegments: 2, curveSegments: 20 });
	top.rotateX(-Math.PI / 2);
	kit.add(prep(top), at(0, 0.98, 0.62), upC, "paint");
	// the headlamp in its chrome ring on the nose, the indicators, the horn grille, the plate
	const nz = 0.62 + 0.3 + 0.27;
	kit.add(CYL(20), at(0, 0.84, nz - 0.01, Math.PI / 2, 0, 0, 0.19, 0.05, 0.19), 0xd8dade, "chrome");
	kit.lamp(0, 0.84, nz + 0.012, 0.15, 0.15, "head", false, 0xf4f2ea, true);
	for (const sx of [-1, 1]) kit.rbox(sx * 0.36, 0.94, 0.62 + 0.3 + 0.17, 0.07, 0.04, 0.05, 0.015, 0xf08a1e, "matte", 0, sx * 0.7);
	kit.plate(look.plate || "auto", 0, 0.6, nz + 0.012, 0.3, 0.08);
	kit.rbox(0, 0.48, nz - 0.03, 0.3, 0.05, 0.04, 0.015, black, "matte");
	// the windscreen in its black frame, with the wiper
	const sy0 = 1.0, sy1 = 1.5, sz0 = 1.0, sz1 = 0.92;
	kit.add(QUAD, at(0, (sy0 + sy1) / 2, (sz0 + sz1) / 2, -Math.atan2(sz0 - sz1, sy1 - sy0), 0, 0, 0.84, Math.hypot(sy1 - sy0, sz0 - sz1), 1), 0xffffff, "glass");
	for (const sx of [-1, 1]) kit.add(BOX, at(sx * 0.43, (sy0 + sy1) / 2, (sz0 + sz1) / 2, -Math.atan2(sz0 - sz1, sy1 - sy0), 0, 0, 0.04, 0.52, 0.04), black, "matte");
	kit.add(BOX, at(0, sy1, sz1, 0, 0, 0, 0.9, 0.04, 0.05), black, "matte");
	kit.add(BOX, at(0.08, 1.12, 0.985, -0.16, 0, 0.5, 0.012, 0.32, 0.012), 0x111111, "matte");
	// the hood: black canvas over a steel frame, its sides part way down, the side curtains rolled up
	const hood = new THREE.Shape();
	const hx = 0.66, yb = 1.26, yt = 1.72, rr = 0.16;
	hood.moveTo(-hx, yb);
	hood.lineTo(-hx, yt - rr);
	hood.quadraticCurveTo(-hx, yt, -hx + rr, yt);
	hood.lineTo(hx - rr, yt);
	hood.quadraticCurveTo(hx, yt, hx, yt - rr);
	hood.lineTo(hx, yb);
	hood.lineTo(hx - 0.02, yb);
	hood.lineTo(hx - 0.02, yt - rr);
	hood.quadraticCurveTo(hx - 0.02, yt - 0.02, hx - rr, yt - 0.02);
	hood.lineTo(-hx + rr, yt - 0.02);
	hood.quadraticCurveTo(-hx + 0.02, yt - 0.02, -hx + 0.02, yt - rr);
	hood.lineTo(-hx + 0.02, yb);
	kit.add(longSlab(hood, -1.16, 0.95, 0.04, 8), at(), canvasC, "matte");
	// the back of the hood, down to the rear body, with its little window
	kit.rbox(0, 1.33, -1.13, 1.3, 0.78, 0.03, 0.02, canvasC, "matte");
	kit.add(QUAD, at(0, 1.42, -1.15, 0, Math.PI, 0, 0.5, 0.16, 1), 0xffffff, "glass");
	for (const sx of [-1, 1]) {
		kit.cyl(sx * 0.65, yb, -0.1, 0.07, 2.0, canvasC, "matte", "z", 10); // the rolled-up curtain
		// the frame: the posts by the driver and at the back, the grab rail
		kit.cyl(sx * 0.6, 1.17, 0.12, 0.03, 0.62, steel, "matte", "y", 8);
		kit.cyl(sx * 0.62, 1.1, -1.08, 0.03, 0.4, steel, "matte", "y", 8);
		kit.cyl(sx * 0.42, 1.2, 0.86, 0.03, 0.5, steel, "matte", "y", 8);
	}
	kit.cyl(0, 1.24, -0.2, 0.025, 0.8, 0xd8dade, "chrome", "z", 8);
	// the handlebar, the speedometer and the fare meter on its bracket at the driver's left
	kit.cyl(0, 1.05, 0.66, 0.025, 0.66, 0xd8dade, "chrome", "x", 8);
	for (const sx of [-1, 1]) kit.cyl(sx * 0.3, 1.05, 0.66, 0.035, 0.1, black, "matte", "x", 10);
	kit.cyl(0, 1.0, 0.86, 0.06, 0.14, black, "matte", "y", 8);
	kit.add(DISC(16), at(0, 1.02, 0.8, -0.9, 0, 0, 0.11), 0xf2f0e6, "matte");
	kit.rbox(0.36, 1.1, 0.78, 0.16, 0.08, 0.06, 0.012, 0x1a1a1a, "matte");
	kit.sign("meter", 0.36, 1.1, 0.75, 0.13, 0.05, Math.PI);
	kit.cyl(0.36, 1.02, 0.78, 0.015, 0.14, steel, "matte", "y", 6);
	// the seats: the driver's on the centre line, the passengers' bench and its back
	kit.rbox(0, 0.72, 0.36, 0.44, 0.1, 0.36, 0.04, 0x2a2420, "matte");
	kit.rbox(0, 0.67, -0.6, 1.1, 0.12, 0.44, 0.05, 0x3a2f28, "matte");
	kit.rbox(0, 0.92, -0.86, 1.1, 0.44, 0.1, 0.05, 0x3a2f28, "matte", 0.12);
	kit.rbox(0, 0.86, 0.17, 0.5, 0.26, 0.06, 0.03, 0x2a2420, "matte", 0.1);
	// tail lamps, the plate, the spare wheel on the back, the silencer
	for (const sx of [-1, 1]) {
		kit.rbox(sx * 0.48, 0.74, -1.218, 0.14, 0.09, 0.03, 0.02, 0x1a1a1a, "matte");
		kit.lamp(sx * 0.48, 0.74, -1.235, 0.11, 0.065, "tail", true);
	}
	kit.plate(look.plate || "auto", 0, 0.56, -1.235, 0.3, 0.08, true);
	kit.cyl(-0.4, 0.36, -1.0, 0.07, 0.5, 0x7a7a7c, "chrome", "z", 10);
	return kit;
}
export function autorickshaw() {
	const g = new THREE.Group();
	const k = autoBody(new Kit({ see: true }), { colours: [0x18181a, 0xf2c11c], plate: "auto" });
	// the front wheel's mudguard and fork, under the cowl
	const fk = new Kit();
	archFlare(fk, 0, 0.23, 1.0, 0.27, 0.16, 0x18181a, "paint", Math.PI * 0.95);
	for (const sx of [-1, 1]) fk.add(CYL(8), at(sx * 0.08, 0.5, 0.98, 0.25, 0, 0, 0.04, 0.55, 0.04), 0xb8bcc0, "chrome");
	k.parts.push(...fk.parts);
	g.add(k.build());
	const wheels = [roadWheel(g, 0, 0.23, 1.0, 0.23, 0.11, 1, "auto", 0xc8ccd0), roadWheel(g, -0.56, 0.23, -0.72, 0.23, 0.12, -1, "auto", 0xc8ccd0), roadWheel(g, 0.56, 0.23, -0.72, 0.23, 0.12, 1, "auto", 0xc8ccd0)];
	const driver = seatedFigure(23, { reach: 1.0, knee: 1.2 });
	driver.position.set(0, 0.78 - 0.95 + 0.05, 0.42);
	g.add(driver);
	return { kind: "auto", group: g, wheels, doors: {}, radius: 0.23, len: 2.63, door: null, seat: new THREE.Vector3(0.28, 0.68 + 0.08, -0.62 + 0.06), driver,
		hull: { x: 0.65, y0: 0.3, y1: 1.72, z0: -1.2, z1: 1.2 }, roof: 1.62, waist: 0.6, opening: { z0: -1.0, z1: 0.15 } };
}

// ---------- the train ----------
// Carriage windows glow after dark; main.js sets emissiveIntensity from the hour.
export const WINDOW_GLOW = [...LAMPS];
// Indian Railways rolling stock, in metres along the coupled length (pitch), with the body's own length,
// the bogie centres, the wheelbase, wheel radius, floor height, and where the doors are.
export const STOCK = {
	icf: { pitch: 22.3, body: 21.34, bogies: 14.78, wb: 2.9, r: 0.457, floor: 1.27, H: 4.02, W: 3.25, doors: [9.95, -9.95], doorW: 0.76 },
	lhb: { pitch: 24.0, body: 23.54, bogies: 14.9, wb: 2.56, r: 0.457, floor: 1.3, H: 4.04, W: 3.24, doors: [10.9, -10.9], doorW: 0.8 },
	wap7: { pitch: 20.56, body: 19.6, bogies: 10.6, wb: 3.9, axles: 3, r: 0.546, floor: 1.4, H: 4.24, W: 3.15, doors: [] },
};
function canvas(w, h, draw) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}
// The coach side in its livery, from the sole bar (v = 0) to the cant rail (v = 1), end to end along u:
// windows with their bars, the doors at each end, the coach's class and number, a few passengers inside.
function coachSide(kind, cls, n, seed) {
	const R = rand(seed);
	const S = STOCK[kind];
	const W = 1024, H = 128, mpp = S.body / W; // metres per pixel along
	const y = (m) => H - (m / 2.45) * H; // height above the sole bar in metres to pixels
	const px = (m) => m / mpp;
	const icf = kind === "icf";
	const base = icf ? "#1d3f86" : "#a8262a", band = icf ? "#efe3c2" : "#c9cdd2", line = icf ? "#f2c81e" : "#efe3c2";
	const win = [];
	const glowWin = [];
	const tex = canvas(W, H, (g) => {
		g.fillStyle = base;
		g.fillRect(0, 0, W, H);
		// the band at window height, with thin lines above and below
		g.fillStyle = band;
		g.fillRect(0, y(1.62), W, y(0.62) - y(1.62));
		g.fillStyle = line;
		g.fillRect(0, y(1.66), W, 2);
		g.fillRect(0, y(0.58), W, 2);
		// panel seams
		g.fillStyle = "rgba(0,0,0,0.18)";
		for (let x = px(1.2); x < W; x += px(1.0)) g.fillRect(x, 0, 1, H);
		// the doors at either end, each with its small barred window and a grab rail
		for (const dz of S.doors) {
			const cx = W / 2 + px(dz);
			const dw = px(S.doorW);
			g.fillStyle = icf ? "#173670" : "#8e1f22";
			g.fillRect(cx - dw / 2, y(2.05), dw, y(0) - y(2.05));
			g.strokeStyle = "rgba(0,0,0,0.6)";
			g.lineWidth = 2;
			g.strokeRect(cx - dw / 2, y(2.05), dw, y(0) - y(2.05));
			g.fillStyle = "#151a22";
			g.fillRect(cx - dw * 0.3, y(1.75), dw * 0.6, y(1.25) - y(1.75));
			g.fillStyle = "#9aa0a6";
			for (const k of [0.33, 0.66]) g.fillRect(cx - dw * 0.3, y(1.75) + (y(1.25) - y(1.75)) * k, dw * 0.6, 2);
			for (const s of [-1, 1]) g.fillRect(cx + s * (dw / 2 + 3), y(1.9), 3, y(0.3) - y(1.9));
		}
		// windows between the doors: barred and open in second class and sleeper, sealed and tinted in AC
		const ac = cls === "3A" || cls === "2A";
		const span = (S.doors[0] - S.doorW / 2 - 0.9) * 2;
		const pitch = ac ? 2.1 : cls === "SLR" ? 0 : 1.65;
		if (pitch) {
			const nW = Math.floor(span / pitch);
			const x0 = W / 2 - px((nW * pitch) / 2);
			for (let i = 0; i < nW; i++) {
				const wx = x0 + px(i * pitch + (pitch - (ac ? 1.7 : 1.15)) / 2), ww = px(ac ? 1.7 : 1.15);
				const wy = y(1.55), wh = y(0.75) - y(1.55);
				g.fillStyle = ac ? "#22303c" : "#141922";
				g.fillRect(wx, wy, ww, wh);
				if (!ac && R() < 0.55) {
					// someone at the window: a head and shoulders behind the bars
					g.fillStyle = ["#3a2a20", "#5a3a2a", "#2a1e18"][Math.floor(R() * 3)];
					const hx = wx + ww * (0.3 + R() * 0.4);
					g.beginPath();
					g.arc(hx, wy + wh * 0.45, wh * 0.16, 0, Math.PI * 2);
					g.fill();
					g.fillStyle = ["#c8562a", "#e8e2d0", "#2a6aa0", "#b8261c", "#f2c14e"][Math.floor(R() * 5)];
					g.fillRect(hx - wh * 0.3, wy + wh * 0.62, wh * 0.6, wh * 0.38);
				}
				g.strokeStyle = ac ? "#5a646c" : "#c9cdd2";
				g.lineWidth = 3;
				g.strokeRect(wx, wy, ww, wh);
				if (!ac) {
					g.fillStyle = "#b9bec4";
					for (let k = 1; k < 4; k++) g.fillRect(wx, wy + (wh * k) / 4 - 1, ww, 2);
				} else {
					g.fillStyle = "rgba(255,255,255,0.12)";
					g.fillRect(wx + 3, wy + 3, ww * 0.3, wh - 6);
				}
				win.push([wx, wy, ww, wh]);
				glowWin.push([wx, wy, ww, wh]);
			}
		} else {
			// the guard and luggage van: two big sliding doors and a small guard's window
			for (const k of [-0.22, 0.12]) {
				const cx = W / 2 + px(k * S.body);
				g.fillStyle = icf ? "#173670" : "#8e1f22";
				g.fillRect(cx - px(0.9), y(2.0), px(1.8), y(0) - y(2.0));
				g.strokeStyle = "rgba(0,0,0,0.55)";
				g.strokeRect(cx - px(0.9), y(2.0), px(1.8), y(0) - y(2.0));
			}
			g.fillStyle = "#141922";
			g.fillRect(W / 2 + px(0.36 * S.body), y(1.55), px(0.8), y(0.8) - y(1.55));
			glowWin.push([W / 2 + px(0.36 * S.body), y(1.55), px(0.8), y(0.8) - y(1.55)]);
		}
		// the coach's marks: its class and number by each door, and Indian Railways in the middle
		g.fillStyle = icf ? "#f2f2ea" : "#f6f0e0";
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = "700 15px Inter, Arial, sans-serif";
		for (const dz of S.doors) g.fillText(cls === "SLR" ? "SLR" : `${cls === "SL" ? "S" + n : cls === "3A" ? "B" + n : cls}`, W / 2 + px(dz) - Math.sign(dz) * px(1.4), y(0.32));
		g.font = "600 11px Inter, Arial, sans-serif";
		g.fillText(`भारतीय रेल  INDIAN RAILWAYS  ${icf ? "ICF" : "LHB"} ${cls} ${String(10000 + Math.floor(R() * 89999))}`, W / 2, y(0.3));
		// grime along the bottom
		const gr = g.createLinearGradient(0, H * 0.82, 0, H);
		gr.addColorStop(0, "rgba(40,30,20,0)");
		gr.addColorStop(1, "rgba(40,30,20,0.45)");
		g.fillStyle = gr;
		g.fillRect(0, H * 0.82, W, H * 0.18);
	});
	// the night glow: lit windows only
	const glow = canvas(W, H, (g) => {
		g.fillStyle = "#000";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#fff";
		for (const [x, yy, w, h] of glowWin) if (R() < 0.85) g.fillRect(x + 2, yy + 2, w - 4, h - 4);
	});
	return { tex, glow };
}
// The cross-section of a coach body, half of it (x >= 0), from the sole bar up the side and over the roof.
function profile(S) {
	const hw = S.W / 2, pts = [];
	const top = S.H, eave = S.H - 0.42;
	pts.push([hw - 0.02, 1.0], [hw, 1.08], [hw, eave - 0.18]);
	for (let k = 0; k <= 4; k++) {
		const a = (k / 4) * (Math.PI / 2);
		pts.push([hw - 0.18 + Math.cos(a) * 0.18, eave - 0.18 + Math.sin(a) * 0.18]);
	}
	for (let k = 1; k <= 8; k++) {
		const x = (hw - 0.18) * (1 - k / 8);
		const t = x / (hw - 0.18);
		pts.push([x, eave + (top - eave) * Math.sqrt(1 - t * t)]);
	}
	return pts;
}
// The body shell: sides textured in the livery, the roof grey, closed ends; length along z, centred.
function shell(S, len, sideMat, roofMat) {
	const half = profile(S);
	const ring = [...half.map(([x, y]) => [x, y]), ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
	const n = ring.length;
	const pos = [], uv = [], idx = [], groups = [];
	const sideTop = half.findIndex((p) => p[1] >= S.H - 0.6);
	// each face strip between ring points k and k+1 runs the length of the body
	const strips = { side: [], roof: [] };
	for (let k = 0; k < n - 1; k++) {
		const [x0, y0] = ring[k], [x1, y1] = ring[k + 1];
		const isSide = (k < sideTop && x0 > 0) || (k >= n - 1 - sideTop && x0 < 0);
		const base = pos.length / 3;
		for (const [x, yy] of [[x0, y0], [x1, y1]]) for (const z of [-len / 2, len / 2]) {
			pos.push(x, yy, z);
			// the side texture spans 1.0 m to 3.45 m up; u runs so writing reads from outside on both sides
			const u = x > 0 ? 0.5 - z / S.body : 0.5 + z / S.body;
			uv.push(u, (yy - 1.0) / 2.45);
		}
		(isSide ? strips.side : strips.roof).push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
	}
	for (const [k, list] of [["side", strips.side], ["roof", strips.roof]]) {
		groups.push([idx.length, list.length, k === "side" ? 0 : 1]);
		idx.push(...list);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
	g.setIndex(idx);
	for (const [s, c, m] of groups) g.addGroup(s, c, m);
	g.computeVertexNormals();
	const m = new THREE.Mesh(g, [sideMat, roofMat]);
	m.castShadow = m.receiveShadow = true;
	// the end walls
	const shape = new THREE.Shape(ring.map(([x, yy]) => new THREE.Vector2(x, yy)));
	const endG = new THREE.ShapeGeometry(shape, 2);
	const endM = mat(0x2a2c30, { roughness: 0.7 });
	for (const s of [-1, 1]) {
		const e = new THREE.Mesh(endG, endM);
		e.position.z = (s * len) / 2;
		if (s < 0) e.rotation.y = Math.PI;
		m.add(e);
	}
	return m;
}
// Shapes merged into one vertex-coloured mesh per piece (a bogie frame, a wheelset, a coach's under-frame),
// so a train is a few dozen draw calls rather than hundreds.
const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
function tpl(g) {
	const n = g.index ? g.toNonIndexed() : g;
	for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
	return n;
}
const TB = tpl(new THREE.BoxGeometry(1, 1, 1)), TC = tpl(new THREE.CylinderGeometry(0.5, 0.5, 1, 20)), TC8 = tpl(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const atT = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
class Pieces {
	constructor() {
		this.b = new Batch();
	}
	box(x, y, z, w, h, d, c, rx, ry, rz) {
		this.b.add(TB, atT(x, y, z, w, h, d, rx, ry, rz), c);
		return this;
	}
	// a cylinder of diameter dm and length l, along x ("x"), y or z
	cyl(x, y, z, dm, l, c, axis = "y", fine = true) {
		const r = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
		this.b.add(fine ? TC : TC8, atT(x, y, z, dm, l, dm, ...r), c);
		return this;
	}
	mesh(m = METAL) {
		const o = this.b.build(m);
		o.castShadow = o.receiveShadow = true;
		return o;
	}
}
// A bogie: its frame, axle boxes and springs in one mesh, and each wheelset (axle, two wheels with their
// treads and flanges) a mesh of its own that turns. Origin at rail level, midway between the end axles.
function bogie(S, kind) {
	const g = new THREE.Group();
	const n = S.axles || 2;
	const g1 = 1.676 / 2;
	const frame = new Pieces();
	const axles = [];
	for (let i = 0; i < n; i++) {
		const z = n === 3 ? (i - 1) * (S.wb / 2) : (i - 0.5) * S.wb;
		const w = new Pieces();
		w.cyl(0, 0, 0, 0.16, 2.0, 0x2b2d31, "x");
		for (const sx of [-1, 1]) {
			w.cyl(sx * g1, 0, 0, S.r * 2, 0.13, 0x47494d, "x");
			w.cyl(sx * g1, 0, 0, S.r * 2 + 0.008, 0.1, 0xa9adb1, "x"); // the bright tread on the rail
			w.cyl(sx * (g1 - 0.075), 0, 0, S.r * 2 + 0.06, 0.025, 0x3a3c40, "x"); // the flange, inside the rail
			w.box(sx * (g1 + 0.072), 0, 0, 0.02, S.r * 1.5, 0.07, 0x26282b); // a mark so the turning shows
			w.cyl(sx * (g1 + 0.07), 0, 0, 0.24, 0.03, 0x606468, "x"); // hub
		}
		const ax = w.mesh();
		ax.position.set(0, S.r, z);
		g.add(ax);
		axles.push(ax);
		for (const sx of [-1, 1]) {
			frame.box(sx * 1.05, S.r, z, 0.24, 0.26, 0.34, 0x2b2d31); // axle box
			frame.cyl(sx * 1.05, S.r + 0.3, z, 0.18, 0.3, 0x7a6a2a, "y", false); // primary spring
		}
		if (kind === "wap7") frame.box(0, S.r + 0.05, z + 0.32, 1.1, 0.55, 0.7, 0x2b2d31); // traction motor
	}
	const span = n === 3 ? S.wb + 1.0 : S.wb + 0.8;
	for (const sx of [-1, 1]) {
		frame.box(sx * 1.05, S.r + 0.55, 0, 0.18, 0.3, span, 0x26282b); // side frames
		frame.box(sx * 1.05, S.r + 0.38, 0, 0.12, 0.12, span * 0.7, 0x26282b);
		if (kind !== "wap7") frame.cyl(sx * 0.85, S.r + 0.82, 0, 0.26, 0.3, 0x7a6a2a, "y", false); // secondary springs
		frame.box(sx * 1.16, S.r + 0.1, 0, 0.06, 0.24, 0.5, 0x5a5e62); // brake gear
	}
	frame.box(0, S.r + 0.55, 0, 2.3, 0.26, 0.45, 0x26282b); // bolster
	g.add(frame.mesh());
	return { group: g, axles, r: S.r, wb: S.wb, n };
}
// Under-frame, gangways, buffers, footsteps and roof fittings of a coach, as one mesh.
function fittings(S, len, kind, cls) {
	const p = new Pieces();
	const steel = 0x232427, dark = 0x2a2c30, rubber = 0x141416;
	p.box(0, 0.98, 0, S.W - 0.1, 0.2, len - 0.3, steel); // sole bars and the floor
	if (kind !== "wap7") {
		p.cyl(0.6, 0.6, 3.6, 0.76, 2.6, dark, "z"); // water tanks
		p.cyl(-0.6, 0.6, -3.6, 0.76, 2.6, dark, "z");
		p.box(-0.7, 0.62, 1.6, 1.2, 0.45, 1.4, steel); // battery box
		p.box(0.9, 0.7, -1.2, 0.5, 0.35, 0.6, steel); // brake cylinder
		p.box(0.4, 0.72, -0.2, 0.8, 0.3, 0.9, steel);
		p.box(0, 0.86, 0, 0.12, 0.08, len - 2, 0x3a3a3a); // brake pipe
		for (let z = -len / 2 + 2; z < len / 2 - 1.5; z += 2.2) p.cyl(0, S.H + 0.06, z, 0.4, 0.14, 0x6e7378, "y", false); // roof ventilators
		if (cls === "3A") for (const z of [-len * 0.3, len * 0.3]) p.box(0, S.H + 0.08, z, 1.8, 0.32, 2.4, 0xb8bcc0); // the AC units
		const out = (S.pitch - len) / 2;
		for (const s of [-1, 1]) {
			const z = (s * len) / 2;
			// the vestibule bellows reach out to meet the next coach's; the coupler and, on ICF stock, side buffers
			p.box(0, 2.3, z + (s * out) / 2, 1.25, 2.25, out + 0.02, rubber);
			p.box(0, 1.05, z + (s * out) / 2, 0.26, 0.22, out + 0.05, steel);
			if (kind === "icf") for (const x of [-0.95, 0.95]) {
				p.cyl(x, 1.05, z + (s * (out - 0.04)) / 2, 0.34, out - 0.04, steel, "z");
				p.cyl(x, 1.05, z + s * (out - 0.03), 0.42, 0.04, 0x4a4c50, "z");
			}
			// footsteps under the doors at this end, both sides
			for (const dz of S.doors) if (Math.sign(dz) === s) for (const sx of [-1, 1]) for (const k of [0, 1]) p.box(sx * (S.W / 2 - 0.05 - k * 0.12), 0.72 + k * 0.28, dz, 0.12, 0.03, S.doorW * 0.9, 0x3a3c40);
		}
	} else {
		p.box(0, 0.5, 0, 2.4, 0.7, 4.5, steel); // the transformer tank between the bogies
		p.box(0, 0.6, 3.3, 1.6, 0.5, 1.6, dark); // compressor and battery boxes
		p.box(0, 0.6, -3.3, 1.6, 0.5, 1.6, dark);
	}
	return p.mesh();
}
// A coach: its shell in the livery, fittings, the two bogies and its doors (the left-side doors, on the
// platform side, are panels that swing in to show the dark doorway).
function coach(kind, cls, n, seed) {
	const S = STOCK[kind];
	const g = new THREE.Group();
	const { tex, glow } = coachSide(kind, cls, n, seed);
	const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.25, emissive: 0xffc46a, emissiveMap: glow, emissiveIntensity: 0 });
	WINDOW_GLOW.push(side);
	const roof = mat(kind === "icf" ? 0x7c8288 : 0x9aa0a6, { roughness: 0.6, metalness: 0.3 });
	g.add(shell(S, S.body, side, roof));
	g.add(fittings(S, S.body, kind, cls));
	const holeM = mat(0x16130f, { roughness: 1 });
	const doors = [];
	for (const dz of S.doors) {
		const x = S.W / 2, s = Math.sign(dz);
		const hole = part(new THREE.PlaneGeometry(S.doorW, 1.95), holeM, x + 0.004, 1.98, dz, g);
		hole.rotation.y = Math.PI / 2;
		// the door, hinged at its edge towards the end of the coach
		const pivot = new THREE.Group();
		pivot.position.set(x + 0.008, 0, dz + s * (S.doorW / 2));
		g.add(pivot);
		const d = new Pieces();
		d.box(-0.012, 1.98, -s * (S.doorW / 2), 0.03, 1.95, S.doorW - 0.02, kind === "icf" ? 0x173670 : 0x8e1f22);
		d.box(-0.01, 2.35, -s * (S.doorW / 2), 0.034, 0.42, S.doorW * 0.5, 0x161c26);
		d.box(-0.008, 2.35, -s * (S.doorW / 2), 0.036, 0.02, S.doorW * 0.5, 0xb9bec4);
		pivot.add(d.mesh());
		doors.push({ z: dz, x, pivot, k: 0, open(k) {
			this.k = k;
			pivot.rotation.y = s * 1.45 * k; // swings in
		} });
	}
	return { group: g, kind, cls, S, len: S.pitch, doors, bogies: [bogie(S, kind), bogie(S, kind)] };
}
// The WAP-7: a red and white Co-Co electric with a cab at each end and two pantographs, the rear one raised.
function locomotive() {
	const S = STOCK.wap7;
	const g = new THREE.Group();
	const sideTex = canvas(1024, 128, (c, W, H) => {
		const y = (m) => H - (m / 2.85) * H;
		c.fillStyle = "#f1efe8";
		c.fillRect(0, 0, W, H);
		c.fillStyle = "#c0262d";
		c.fillRect(0, y(1.15), W, H - y(1.15));
		c.fillStyle = "#1f3f86";
		c.fillRect(0, y(1.2), W, 4);
		// louvres along the machine room
		for (let x = W * 0.16; x < W * 0.82; x += 46) {
			c.fillStyle = "#b9b7b0";
			c.fillRect(x, y(2.55), 34, y(1.55) - y(2.55));
			c.fillStyle = "#8a8a86";
			for (let k = 0; k < 8; k++) c.fillRect(x, y(2.55) + k * 6, 34, 2);
		}
		// the cab doors at each end with their windows
		for (const s of [-1, 1]) {
			const cx = W / 2 + s * (W * 0.455);
			c.fillStyle = "#c0262d";
			c.fillRect(cx - 18, y(2.5), 36, y(0.05) - y(2.5));
			c.strokeStyle = "rgba(0,0,0,0.5)";
			c.lineWidth = 2;
			c.strokeRect(cx - 18, y(2.5), 36, y(0.05) - y(2.5));
			c.fillStyle = "#1a2230";
			c.fillRect(cx - 13, y(2.35), 26, 22);
		}
		c.fillStyle = "#f6f2e6";
		c.textAlign = "center";
		c.textBaseline = "middle";
		c.font = "700 22px Inter, Arial, sans-serif";
		c.fillText("WAP-7  30612", W / 2, y(0.6));
		c.font = "600 13px Inter, Arial, sans-serif";
		c.fillText("भारतीय रेल", W * 0.3, y(0.6));
		c.fillText("GZB", W * 0.7, y(0.6));
	});
	const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.45, metalness: 0.25 });
	const roofM = mat(0x8a8e92, { roughness: 0.5, metalness: 0.4 });
	const bodyLen = S.body - 2.2;
	g.add(shell(Object.assign({}, S, { body: bodyLen }), bodyLen, side, roofM));
	// the two cabs: sloping noses with the windscreens, the headlight and marker lights
	const faceTex = canvas(256, 256, (c, W, H) => {
		c.fillStyle = "#f1efe8";
		c.fillRect(0, 0, W, H);
		c.fillStyle = "#c0262d";
		c.fillRect(0, H * 0.48, W, H * 0.52);
		c.fillStyle = "#1f3f86";
		c.fillRect(0, H * 0.46, W, 6);
		c.fillStyle = "#151c26";
		c.fillRect(W * 0.08, H * 0.1, W * 0.38, H * 0.27);
		c.fillRect(W * 0.54, H * 0.1, W * 0.38, H * 0.27);
		c.fillStyle = "#f2c81e";
		for (let x = 0; x < W; x += 28) c.fillRect(x, H * 0.86, 14, H * 0.08);
	});
	const faceM = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.45, metalness: 0.2 });
	const ends = new Pieces();
	for (const s of [-1, 1]) {
		const cab = new THREE.Group();
		cab.position.z = (s * bodyLen) / 2;
		if (s < 0) cab.rotation.y = Math.PI;
		g.add(cab);
		const nose = part(box(S.W - 0.06, 3.0, 1.1), [faceM, faceM, roofM, mat(0x222222), faceM, faceM], 0, 2.5, 0.55, cab);
		// rake the nose back: the top front edge comes in
		const p = nose.geometry.attributes.position;
		for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) > 0) p.setZ(i, p.getZ(i) - 0.35);
		p.needsUpdate = true;
		nose.geometry.computeVertexNormals();
		part(new THREE.CircleGeometry(0.2, 16), LIGHT, 0, 3.72, 0.81, cab).rotation.x = -0.11;
		for (const x of [-1.05, 1.05]) part(new THREE.CircleGeometry(0.11, 12), LIGHT, x, 1.55, 1.05, cab);
		const z0 = (s * bodyLen) / 2;
		ends.box(0, 1.05, z0 + s * 1.3, S.W - 0.3, 0.3, 0.45, 0x2a2a2c); // buffer beam
		ends.box(0, 1.05, z0 + s * 1.6, 0.26, 0.22, 0.3, 0x2a2a2c); // coupler
		ends.box(0, 0.55, z0 + s * 1.25, 1.6, 0.3, 0.25, 0x3a3a3c); // cattle guard
	}
	g.add(ends.mesh());
	g.add(fittings(S, bodyLen, "wap7"));
	// roof: insulators, the main circuit breaker, the two pantographs
	const roof = new Pieces();
	for (const z of [-3.2, 3.2]) for (const x of [-0.5, 0.5]) for (const dz of [-0.6, 0.6]) roof.cyl(x, S.H + 0.15, z + dz, 0.13, 0.3, 0x8a3a2a, "y", false);
	roof.box(0, S.H + 0.1, 0, 0.6, 0.35, 1.4, 0x6a6e72);
	roof.box(0, S.H + 0.05, 0, 0.2, 0.1, 6.0, 0x50555a); // the roof bus bar
	g.add(roof.mesh());
	const pans = [pantograph(g, -3.2, S.H + 0.32), pantograph(g, 3.2, S.H + 0.32)];
	return { group: g, kind: "wap7", S, len: S.pitch, doors: [], bogies: [bogie(S, "wap7"), bogie(S, "wap7")], pans };
}
// A single-arm pantograph on its base: set(h) raises the head to h metres above the base.
function pantograph(parent, z, y) {
	const g = new THREE.Group();
	g.position.set(0, y, z);
	parent.add(g);
	const steel = mat(0x50555a, { metalness: 0.7, roughness: 0.3 });
	part(box(1.4, 0.06, 1.0), steel, 0, 0, 0, g);
	const lower = new THREE.Group(), upper = new THREE.Group(), head = new THREE.Group();
	g.add(lower);
	lower.position.set(0, 0.05, -0.5);
	const L1 = 1.6, L2 = 1.75;
	part(box(0.9, 0.05, 0.06), steel, 0, 0, 0, lower);
	const la = part(box(0.06, L1, 0.06), steel, 0, L1 / 2, 0, lower);
	upper.position.set(0, L1, 0);
	lower.add(upper);
	part(box(0.05, L2, 0.05), steel, 0, L2 / 2, 0, upper);
	g.add(head);
	part(box(1.95, 0.05, 0.12), mat(0x2a2a2a, { metalness: 0.4 }), 0, 0, 0, head); // the carbon strip
	for (const x of [-0.95, 0.95]) part(box(0.08, 0.04, 0.12), steel, x, -0.05, 0, head).rotation.z = x > 0 ? -0.6 : 0.6;
	void la;
	return {
		group: g, raised: z < 0,
		// raise the head to height h (metres above the base), the knee folding forwards
		set(h) {
			const tz = 0.55; // the head stands this far forward of the hinge
			const dx = tz, dy = Math.max(0.15, h - 0.05);
			const d = Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy));
			const a = Math.atan2(dx, dy), b = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
			const th1 = a + b; // lower arm, leaning forwards from the vertical
			lower.rotation.x = th1;
			const kx = Math.sin(th1) * L1, ky = Math.cos(th1) * L1;
			const th2 = Math.atan2(dx - kx, dy - ky);
			upper.rotation.x = th2 - th1;
			head.position.set(0, 0.05 + dy, -0.5 + dx);
		},
	};
}
// Indian Railways: a WAP-7 and five coaches. "icf": blue ICF stock with a cream band (general, sleeper,
// sleeper, AC three-tier, guard's van); "lhb": red and silver LHB stock.
export function train(kind = "icf") {
	const cars = [locomotive()];
	const rake = [["GS", 1], ["SL", 3], ["SL", 4], ["3A", 1], ["SLR", 1]];
	rake.forEach(([cls, n], i) => cars.push(coach(kind, cls, n, 100 + i * 17 + (kind === "lhb" ? 7 : 0))));
	return cars;
}

// ---------- the yatra's coaches (the Kailash journey) ----------
// A touring coach, in metres, facing +z: the long box with a rounded nose and a deep one-piece windscreen,
// big sealed side windows (see-through, so the traveller can be seen in a window seat), the door at the front on
// the kerb side, seats in pairs either side of the aisle with a few passengers in them, the luggage boot, a
// banner across the front. look: { paint, band, band2, roof, door: +1 (left, India) or -1 (right, Tibet),
// banner: a canvas texture or null }.
function bannerTex(lines, bg, fg) {
	return canvas(512, 96, (g, W, H) => {
		g.fillStyle = bg;
		g.fillRect(0, 0, W, H);
		g.fillStyle = fg;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = `600 ${lines.length > 1 ? 34 : 46}px "Tiro Devanagari Hindi", "Noto Sans Devanagari", Inter, sans-serif`;
		lines.forEach((t, i) => g.fillText(t, W / 2, H * (lines.length > 1 ? 0.3 + i * 0.42 : 0.52), W - 20));
	});
}
function coachBody(look) {
	const g = new THREE.Group();
	const k = new Kit({ see: true });
	const hw = 1.25, zF = 5.6, zR = -5.6, af = 3.7, ar = -2.9, ra = 0.55, H = 3.45, black = 0x161618, floor = 1.05;
	const ds = look.door ?? 1;
	hull(k, [[zR, 0.45, 0.08], [ar - ra, 0.4, 0.02], ...arc(ar, 0.5, ra, Math.PI, 0, 10), [af - ra, 0.4, 0.02], ...arc(af, 0.5, ra, Math.PI, 0, 10), [af + ra, 0.4, 0.02], [zF, 0.45, 0.14], [zF + 0.06, 1.3, 0.2], [zF - 0.05, H - 0.2, 0.42], [zF - 0.55, H, 0.3], [zR + 0.25, H, 0.22], [zR, H - 0.35, 0.18]], hw, {
		cf: 0.18, cr: 0.12, nLow: 14, nTop: 5, ym: 0.42, n: 14, step: 0.25, extra: [af - ra, af + ra, ar - ra, ar + ra],
		classify: (z, j) => (j >= 12 ? "roof" : "body"), colours: { body: look.paint, roof: look.roof }, slots: { body: "paint", roof: "paint" },
	});
	for (const sx of [-1, 1]) {
		const x = hw + 0.004;
		// the window band, dark glass from the door back to the tail; the livery's stripes below it
		sidePanel(k, sx, x, 2.45, -0.55, 9.4, 1.15, 0xffffff, "glass");
		for (let z = -4.9; z <= 3.6; z += 1.4) k.box(sx * (x + 0.004), 2.45, z, 0.012, 1.18, 0.07, black, "matte");
		k.box(sx * (x + 0.004), 1.62, -0.1, 0.014, 0.12, 10.6, look.band, "paint");
		k.box(sx * (x + 0.004), 1.42, -0.1, 0.014, 0.06, 10.6, look.band2, "paint");
		k.box(sx * (x + 0.006), 0.6, -0.4, 0.014, 0.05, 10.4, black, "matte");
		// the boot doors under the floor
		for (const z of [-1.9, -0.4, 1.1]) k.box(sx * (x + 0.005), 0.98, z, 0.01, 0.62, 1.3, 0xb8bcc0, "chrome");
	}
	// the door opening at the front on the kerb side, and the driver's window opposite
	k.box(ds * (hw + 0.01), 1.6, 4.55, 0.012, 2.6, 1.0, 0x1a1a1c, "matte");
	sidePanel(k, -ds, hw + 0.01, 2.3, 4.6, 0.95, 1.3, 0xffffff, "glass");
	// the steps up inside the door, the floor, the seats and the people in them
	for (let i = 0; i < 3; i++) k.rbox(ds * (hw - 0.3), 0.35 + i * 0.25, 4.55, 0.5, 0.06, 0.9, 0.01, 0x3a3a3c, "matte");
	k.box(0, floor - 0.03, -0.3, 2.3, 0.06, 9.6, 0x2a2a2c, "matte");
	const seatC = look.seat ?? 0x3a4a6a;
	const rows = [];
	for (let z = 3.3; z > -4.9; z -= 0.86) rows.push(z);
	for (const z of rows) for (const sx of [-1, 1]) {
		k.rbox(sx * 0.7, floor + 0.42, z, 0.9, 0.12, 0.48, 0.04, seatC, "matte");
		k.rbox(sx * 0.7, floor + 0.85, z - 0.24, 0.9, 0.78, 0.1, 0.04, seatC, "matte", -0.12);
		k.rbox(sx * 0.7, floor + 1.25, z - 0.29, 0.9, 0.12, 0.06, 0.02, 0xe8e4da, "matte", -0.12); // the white headrest cloth
	}
	// the dash, the steering wheel and the driver
	k.rbox(0, floor + 0.65, zF - 0.45, 2.2, 0.5, 0.5, 0.06, black, "matte");
	k.add(prep(new THREE.TorusGeometry(0.24, 0.025, 6, 20)), at(-ds * 0.62, floor + 0.95, zF - 0.85, -1.0, 0, 0), black, "matte");
	// the front: the windscreen, the banner above it, the lamps, grille, bumper and plate
	k.add(QUAD, at(0, 2.35, zF + 0.0, -0.1, 0, 0, 2.3, 1.75, 1), 0xffffff, "glass");
	k.rbox(0, 1.05, zF + 0.1, 2.3, 0.55, 0.1, 0.05, black, "matte");
	for (let i = 0; i < 4; i++) k.box(0, 0.88 + i * 0.1, zF + 0.16, 1.5, 0.025, 0.02, 0xc8ccd0, "chrome");
	for (const sx of [-1, 1]) {
		k.lamp(sx * 0.92, 1.05, zF + 0.16, 0.36, 0.16, "head");
		k.lamp(sx * 1.0, 1.35, zR - 0.02, 0.14, 0.5, "tail", true);
		k.box(sx * (hw + 0.25), 2.75, zF - 0.1, 0.45, 0.03, 0.03, black, "matte");
		k.rbox(sx * (hw + 0.45), 2.45, zF + 0.0, 0.06, 0.5, 0.22, 0.02, black, "matte");
	}
	k.rbox(0, 0.55, zF + 0.16, 2.5, 0.22, 0.14, 0.04, 0x2a2a2c, "matte");
	k.plate(look.plate || "bus3", 0, 0.58, zF + 0.24, 0.5, 0.11);
	k.add(QUAD, at(0, 2.5, zR - 0.01, 0, Math.PI, 0, 2.1, 0.9, 1), 0xffffff, "glass");
	k.rbox(0, 0.55, zR - 0.08, 2.5, 0.22, 0.12, 0.04, 0x2a2a2c, "matte");
	k.plate(look.plate || "bus3", 0, 1.0, zR - 0.02, 0.5, 0.11, true);
	for (const sx of [-1, 1]) for (const z of [af, ar]) archFlare(k, sx * (hw - 0.04), 0.5, z, ra - 0.02, 0.3, 0x121214, "matte");
	g.add(k.build());
	// a few passengers in their seats, wrapped up against the cold
	const R = rand(look.seed ?? 5);
	const taken = new Set();
	for (let i = 0; i < 9; i++) {
		const zi = 1 + Math.floor(R() * (rows.length - 1)), sx = R() < 0.5 ? -1 : 1, xi = R() < 0.5 ? 0.42 : 0.98;
		const key = zi + "," + sx + "," + xi;
		if (taken.has(key) || (zi === 0 && sx === ds)) continue;
		taken.add(key);
		const f = seatedFigure(300 + i * 13 + (look.seed ?? 0), { reach: 0.35, knee: 1.45 });
		f.position.set(sx * xi, floor + 0.42 - 0.95 + 0.06, rows[zi] + 0.06);
		g.add(f);
	}
	const driver = seatedFigure(look.seed ? 91 : 93);
	driver.position.set(-ds * 0.62, floor + 0.42 - 0.95 + 0.08, zF - 1.1);
	g.add(driver);
	if (look.banner) {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), new THREE.MeshStandardMaterial({ map: look.banner, roughness: 0.6, emissive: 0x111111 }));
		m.position.set(0, H - 0.32, zF - 0.02);
		m.rotation.x = -0.32;
		g.add(m);
	}
	// the folding door: two leaves that fold back into the doorway
	const leaves = [];
	for (const z of [4.32, 4.78]) {
		const p = new THREE.Group();
		p.position.set(ds * (hw + 0.005), 0, z);
		const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.5, 0.46), mat(0x1a1d22, { roughness: 0.3, metalness: 0.4 }));
		m.position.y = 1.6;
		m.castShadow = true;
		p.add(m);
		g.add(p);
		leaves.push(p);
	}
	const door = { z0: 4.1, z1: 5.0, k: 0, open(k) {
		this.k = k;
		leaves.forEach((p, i) => {
			p.position.x = ds * (hw + 0.005 - 0.18 * k);
			p.rotation.y = ds * (i ? -1 : 1) * 1.3 * k;
		});
	} };
	const wheels = [];
	for (const sx of [-1, 1]) for (const z of [af, ar]) wheels.push(roadWheel(g, sx * (hw - 0.17), 0.5, z, 0.5, 0.3, sx, "steel", 0xc8ccd0));
	const seatX = ds * 0.98, seatZ = rows[0] + 0.06;
	return { group: g, wheels, doors: { front: door }, radius: 0.5, len: zF - zR, door: ds > 0 ? "front" : null, doorR: ds < 0 ? "front" : null, seat: new THREE.Vector3(seatX, floor + 0.42 + 0.08, seatZ), driver, floor, tall: true,
		hull: { x: hw, y0: 0.4, y1: H, z0: zR, z1: zF }, roof: H, waist: 1.5 };
}
// The yatra's coach from Delhi to Dharchula: white, with the saffron and green bands and the banner of the yatra.
export function yatraBus() {
	const c = coachBody({ paint: 0xf2f1ec, band: 0xe8741a, band2: 0x2f8a4a, roof: 0xe6e4dc, door: 1, plate: "bus3", seed: 3, banner: bannerTex(["कैलाश मानसरोवर यात्रा", "KAILASH MANSAROVAR YATRA"], "#f6efe0", "#8a2a10") });
	return Object.assign(c, { kind: "bus" });
}
// The Chinese coach on the Tibet side: white with a blue band, the door on the right (China drives on the right).
export function tibetBus() {
	const c = coachBody({ paint: 0xf4f4f2, band: 0x2a5ab0, band2: 0x8ab4e0, roof: 0xe8e8e6, door: -1, plate: "bus2", seed: 7, seat: 0x6a2a2a, banner: bannerTex(["神山圣湖 · KAILASH MANASAROVAR"], "#1f3f7a", "#f4f0e0") });
	return Object.assign(c, { kind: "coach" });
}
