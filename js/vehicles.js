// How the traveller moves: a motorbike up to the Sahyadri, a taxi or a pilgrim jeep on the ghat and hill
// roads, an autorickshaw across town, and the train across the Deccan and the plains. Everything is modelled
// in metres, facing +z, with the ground (or, for the train, the top of the rail) at y = 0; main.js and
// boarding.js scale it into the world. Each model says where its doors, seats and hull are, so the traveller
// can get in and out of it.
import * as THREE from "three";
import { body, crowdOpts, mergeFigure, pose } from "./pilgrim.js";
import { rand } from "./util.js";
import { Batch } from "./batch.js";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
const CHROME = mat(0xd8dde2, { metalness: 0.9, roughness: 0.2 });
const TYRE = mat(0x1c1c1e, { roughness: 0.9 });
const BLACK = mat(0x1a1a1c, { roughness: 0.55 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
const DARKGLASS = mat(0x1d2a38, { metalness: 0.6, roughness: 0.15 });
const LIGHT = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 1.2 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0xb01010, emissive: 0x800000, emissiveIntensity: 0.8 });
const SEAT = mat(0x3a3430, { roughness: 0.85 });
const PLATE = mat(0xf2c230, { roughness: 0.5 }); // commercial plates are yellow

function part(geo, m, x, y, z, parent) {
	const o = new THREE.Mesh(geo, m);
	o.position.set(x, y, z);
	o.castShadow = true;
	o.receiveShadow = true;
	parent.add(o);
	return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 14) => new THREE.CylinderGeometry(r0, r1, h, n);
// A wheel turning about x; spun by setting rotation.x.
function wheel(parent, x, y, z, r, w, rim = CHROME) {
	const g = new THREE.Group();
	g.position.set(x, y, z);
	const t = part(new THREE.TorusGeometry(r * 0.78, r * 0.22, 10, 24), TYRE, 0, 0, 0, g);
	t.rotation.y = Math.PI / 2;
	t.scale.z = w / (r * 0.44);
	const hub = part(cyl(r * 0.58, r * 0.58, w * 0.7), rim, 0, 0, 0, g);
	hub.rotation.z = Math.PI / 2;
	// spokes so the spin reads
	for (let i = 0; i < 4; i++) {
		const s = part(box(w * 0.75, r * 1.12, r * 0.08), mat(0x2a2a2a), 0, 0, 0, g);
		s.rotation.x = (i / 4) * Math.PI;
	}
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

// ---------- the motorbike ----------
// A Royal Enfield-style 350: the rider sits at about 0.8 m. The frame leans on its side stand (on the left,
// +x) when parked; the staff rides strapped along the carrier.
export function motorbike() {
	const g = new THREE.Group();
	const frame = new THREE.Group(); // leans about the line where the tyres touch the ground
	g.add(frame);
	const paint = mat(0x5a0f14, { metalness: 0.4, roughness: 0.35 });
	const wheels = [wheel(frame, 0, 0.33, 0.7, 0.33, 0.1), wheel(frame, 0, 0.33, -0.68, 0.33, 0.12)];
	for (const z of [0.7, -0.68]) {
		const guard = part(new THREE.TorusGeometry(0.36, 0.05, 6, 16, Math.PI * 0.9), paint, 0, 0.33, z, frame);
		guard.rotation.y = Math.PI / 2;
		guard.rotation.x = Math.PI * 0.05;
	}
	part(box(0.12, 0.3, 0.9), BLACK, 0, 0.5, -0.02, frame).rotation.x = -0.15; // frame and engine block
	part(box(0.22, 0.24, 0.3), CHROME, 0, 0.42, 0.12, frame);
	const tank = part(new THREE.CapsuleGeometry(0.13, 0.32, 6, 12), paint, 0, 0.8, 0.22, frame);
	tank.rotation.x = Math.PI / 2 + 0.1;
	tank.scale.x = 0.95;
	part(box(0.26, 0.08, 0.5), mat(0x2a1d16, { roughness: 0.8 }), 0, 0.8, -0.3, frame); // seat
	part(box(0.3, 0.04, 0.34), CHROME, 0, 0.78, -0.72, frame); // luggage carrier
	part(box(0.3, 0.14, 0.22), mat(0xc96a1e), 0, 0.87, -0.78, frame); // a cloth bundle
	const fork = part(cyl(0.025, 0.025, 0.7, 8), CHROME, 0, 0.62, 0.62, frame);
	fork.rotation.x = -0.4;
	part(cyl(0.018, 0.018, 0.7, 8), CHROME, 0, 1.0, 0.5, frame).rotation.z = Math.PI / 2; // handlebar
	part(cyl(0.09, 0.07, 0.1, 16), CHROME, 0, 0.86, 0.66, frame).rotation.x = Math.PI / 2;
	part(new THREE.CircleGeometry(0.075, 16), LIGHT, 0, 0.86, 0.715, frame);
	part(cyl(0.04, 0.05, 0.9, 10), CHROME, -0.14, 0.3, -0.25, frame).rotation.x = Math.PI / 2 - 0.08; // exhaust, on the right
	part(box(0.1, 0.05, 0.03), TAIL, 0, 0.62, -1.0, frame);
	for (const x of [-0.17, 0.17]) part(box(0.12, 0.03, 0.05), BLACK, x, 0.3, 0.12, frame); // foot pegs
	// the side stand: a leg hinged under the left foot peg, swung down to the ground or folded up behind
	const stand = new THREE.Group();
	stand.position.set(0.12, 0.3, 0.02);
	frame.add(stand);
	part(cyl(0.014, 0.012, 0.34, 6), BLACK, 0, -0.17, 0, stand);
	part(box(0.05, 0.015, 0.06), BLACK, 0, -0.34, 0, stand);
	// the staff, strapped along the right of the carrier, and its two straps
	const staff = new THREE.Group();
	staff.position.set(-0.13, 0.86, -0.6);
	staff.rotation.x = -0.12;
	frame.add(staff);
	const rod = part(cyl(0.02, 0.022, 1.75, 8), mat(0x6b4a2a, { roughness: 0.7 }), 0, 0, 0.12, staff);
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
// A car body in metres: lower body to the waist, pillars, a roof, glass all round and doors that open;
// the cabin is open inside, with seats, so the traveller can be seen sitting there.
function carBody(o) {
	const { L, W, H, waist, sill, bonnet, screen, wb, r, paint, trim } = o;
	const g = new THREE.Group();
	const shell = new THREE.Group();
	g.add(shell);
	const hw = W / 2, zf = L / 2, zr = -L / 2;
	const zA = zf - bonnet, zW = zA - screen; // foot and top of the windscreen
	const body = mat(paint, { metalness: 0.35, roughness: 0.32 });
	const dark = mat(trim, { roughness: 0.6 });
	// bonnet, front and rear ends below the waist
	part(box(W, waist - sill, bonnet), body, 0, (waist + sill) / 2, zf - bonnet / 2, shell);
	part(box(W - 0.06, 0.06, bonnet - 0.04), body, 0, waist + 0.02, zf - bonnet / 2 - 0.02, shell).rotation.x = 0.04;
	part(box(W, waist - sill, 0.3), body, 0, (waist + sill) / 2, zr + 0.15, shell);
	// the floor pan and the sills
	part(box(W - 0.1, 0.06, zA - zr - 0.3), dark, 0, sill + 0.08, (zA + zr + 0.3) / 2, shell);
	// roof and pillars
	const rz0 = zr + 0.12, rz1 = zW;
	part(box(W - 0.06, 0.07, rz1 - rz0), body, 0, H - 0.035, (rz0 + rz1) / 2, shell);
	for (const sx of [-1, 1]) {
		const x = sx * (hw - 0.05);
		// A-pillar raked back along the windscreen
		const a = part(box(0.07, Math.hypot(screen, H - waist) + 0.02, 0.07), body, x, (waist + H) / 2, (zA + zW) / 2, shell);
		a.rotation.x = -Math.atan2(screen, H - waist);
		part(box(0.08, H - waist, 0.1), body, x, (waist + H) / 2, o.bPillar, shell); // B-pillar
		part(box(0.08, H - waist, 0.18), body, x, (waist + H) / 2, rz0 + 0.09, shell); // C-pillar
	}
	// glass: windscreen, rear window, the fixed rear quarter lights
	const ws = part(new THREE.PlaneGeometry(W - 0.14, Math.hypot(screen, H - waist)), GLASS, 0, (waist + H) / 2, (zA + zW) / 2, shell);
	ws.rotation.set(-Math.atan2(screen, H - waist), 0, 0);
	part(new THREE.PlaneGeometry(W - 0.14, H - waist - 0.06), GLASS, 0, (waist + H) / 2, rz0 + 0.02, shell);
	for (const sx of [-1, 1]) {
		const q = part(new THREE.PlaneGeometry(o.rearDoor[0] - rz0 - 0.2, H - waist - 0.1), GLASS, sx * (hw - 0.02), (waist + H) / 2, (rz0 + 0.18 + o.rearDoor[0]) / 2, shell);
		q.rotation.y = Math.PI / 2;
	}
	// lights, grille, bumpers and plates
	part(box(W * 0.8, 0.22, 0.04), dark, 0, sill + 0.32, zf + 0.01, shell);
	part(box(W + 0.02, 0.14, 0.12), dark, 0, sill + 0.1, zf - 0.02, shell);
	part(box(W + 0.02, 0.14, 0.12), dark, 0, sill + 0.1, zr + 0.02, shell);
	for (const x of [-hw + 0.22, hw - 0.22]) {
		part(new THREE.CircleGeometry(0.1, 14), LIGHT, x, waist - 0.12, zf + 0.012, shell);
		const t = part(box(0.2, 0.12, 0.03), TAIL, x, waist - 0.1, zr - 0.005, shell);
		t.rotation.y = Math.PI;
	}
	part(box(0.5, 0.12, 0.02), PLATE, 0, sill + 0.24, zf + 0.04, shell);
	part(box(0.5, 0.12, 0.02), PLATE, 0, sill + 0.3, zr - 0.02, shell);
	// the cabin: seats, the dashboard and the steering wheel on the right
	const seatY = o.seatY;
	part(box(W - 0.2, 0.25, 0.25), dark, 0, waist - 0.12, zA - 0.12, shell);
	for (const [z, w] of [[o.frontSeat, 0.5], [o.rearSeat, W - 0.3]]) {
		for (const x of w > 1 ? [0] : [-0.38, 0.38]) {
			part(box(w, 0.12, 0.5), SEAT, x, seatY - 0.06, z, shell);
			const back = part(box(w, 0.6, 0.1), SEAT, x, seatY + 0.28, z - 0.3, shell);
			back.rotation.x = -0.12;
		}
	}
	const sw = part(new THREE.TorusGeometry(0.18, 0.02, 6, 18), dark, -0.38, waist + 0.08, zA - 0.36, shell);
	sw.rotation.x = -0.9;
	// four doors, each a painted panel with its window, hinged at the front edge
	const doors = {};
	for (const [name, [z0, z1]] of [["front", o.frontDoor], ["rear", o.rearDoor]]) {
		for (const sx of [-1, 1]) {
			const d = hinged(shell, sx * hw, z0, z1, sx, 1.1);
			const len = z1 - z0;
			part(box(0.05, waist - sill - 0.04, len - 0.02), body, -sx * 0.025, (waist + sill) / 2 + 0.02, -len / 2, d.pivot);
			part(box(0.03, 0.04, len - 0.04), body, -sx * 0.02, H - 0.08, -len / 2, d.pivot); // the window frame
			const gl = part(new THREE.PlaneGeometry(len - 0.08, H - waist - 0.12), GLASS, -sx * 0.02, (waist + H) / 2 - 0.02, -len / 2, d.pivot);
			gl.rotation.y = Math.PI / 2;
			part(box(0.02, 0.025, 0.14), CHROME, sx * 0.005, waist - 0.08, -len + 0.18, d.pivot); // the handle
			doors[(sx > 0 ? "L" : "R") + name] = d;
		}
	}
	const wheels = [];
	for (const x of [-(hw - 0.08), hw - 0.08]) for (const z of [wb / 2 + o.wbOff, -wb / 2 + o.wbOff]) wheels.push(wheel(g, x, r, z, r, 0.22, mat(0xa8a8a8, { metalness: 0.7, roughness: 0.3 })));
	// wheel arches in black so the tyres sit in the body
	for (const x of [-hw + 0.01, hw - 0.01]) for (const z of [wb / 2 + o.wbOff, -wb / 2 + o.wbOff]) part(box(0.02, r * 0.9, r * 2.3), dark, x, r + 0.1, z, shell);
	return { g, shell, doors, wheels, body };
}
const SEATED = { hipL: -1.5, hipR: -1.5, hipLz: 0.06, hipRz: -0.06, kneeL: 1.45, kneeR: 1.45, ankleL: 0.05, ankleR: 0.05, shL: -0.5, shR: -0.45, shLz: 0.12, shRz: -0.1, elL: -0.95, elR: -0.9, lean: -0.04, nod: 0.02 };
export { SEATED };

// A white Toyota Innova-like taxi, yellow plates, as at the Tirupati and Pune taxi stands.
export function taxi() {
	const o = { L: 4.58, W: 1.78, H: 1.74, waist: 1.0, sill: 0.32, bonnet: 0.95, screen: 0.75, wb: 2.75, wbOff: 0.05, r: 0.33, paint: 0xf2f2ee, trim: 0x2a2a2c, bPillar: 0.4, frontDoor: [0.42, 1.36], rearDoor: [-0.62, 0.38], frontSeat: 0.72, rearSeat: -0.24, seatY: 0.66 };
	const c = carBody(o);
	part(box(0.5, 0.12, 0.2), mat(0xf2c230, { emissive: 0x3a2a00, emissiveIntensity: 0.3 }), 0, o.H + 0.06, -0.2, c.shell); // the "TAXI" roof sign
	const driver = seatedFigure(41);
	driver.position.set(-0.38, o.seatY - 0.95 + 0.08, o.frontSeat + 0.08);
	c.shell.add(driver);
	return { kind: "car", group: c.g, wheels: c.wheels, doors: c.doors, radius: o.r, len: o.L, door: "Lrear", doorR: "Rrear", seat: new THREE.Vector3(0.42, o.seatY + 0.08, o.rearSeat + 0.08), driver,
		hull: { x: o.W / 2, y0: o.sill, y1: o.H, z0: -o.L / 2, z1: o.L / 2 }, roof: o.H, waist: o.waist };
}

// A white Mahindra Bolero-like pilgrim jeep with a roof rack, luggage and a saffron flag on the bonnet.
export function jeep() {
	const o = { L: 3.99, W: 1.75, H: 1.9, waist: 1.08, sill: 0.42, bonnet: 1.0, screen: 0.32, wb: 2.68, wbOff: 0.1, r: 0.37, paint: 0xeeeeea, trim: 0x2a2a2c, bPillar: 0.65, frontDoor: [0.68, 1.6], rearDoor: [-0.5, 0.62], frontSeat: 0.95, rearSeat: -0.05, seatY: 0.78 };
	const c = carBody(o);
	const trim = mat(0x2a2a2c, { roughness: 0.6 });
	// the roof rack with luggage, the spare wheel on the tailgate, the flag on the bonnet
	part(box(1.5, 0.05, 2.0), trim, 0, o.H + 0.08, -0.55, c.shell);
	part(box(1.2, 0.3, 0.8), mat(0x3a5f8a), -0.05, o.H + 0.26, -0.2, c.shell);
	part(box(0.9, 0.26, 0.6), mat(0x8f3a1e), 0.1, o.H + 0.24, -1.0, c.shell);
	const spare = wheel(c.shell, 0, 0.95, -o.L / 2 - 0.12, 0.33, 0.2);
	spare.rotation.y = Math.PI / 2;
	part(cyl(0.01, 0.01, 0.5, 6), CHROME, 0.75, o.waist + 0.25, o.L / 2 - 0.1, c.shell);
	part(new THREE.PlaneGeometry(0.32, 0.2), mat(0xff8a1e, { side: THREE.DoubleSide, emissive: 0x803000, emissiveIntensity: 0.3 }), 0.75, o.waist + 0.4, o.L / 2 - 0.26, c.shell).rotation.y = Math.PI / 2;
	const driver = seatedFigure(77);
	driver.position.set(-0.38, o.seatY - 0.95 + 0.08, o.frontSeat + 0.08);
	c.shell.add(driver);
	return { kind: "jeep", group: c.g, wheels: c.wheels, doors: c.doors, radius: o.r, len: o.L, door: "Lrear", doorR: "Rrear", seat: new THREE.Vector3(0.4, o.seatY + 0.08, o.rearSeat + 0.08), driver,
		hull: { x: o.W / 2, y0: o.sill, y1: o.H, z0: -o.L / 2, z1: o.L / 2 }, roof: o.H, waist: o.waist };
}

// A green and yellow Bajaj three-wheeler: a canvas hood on a frame, open sides, the driver up front on the
// centre line, a bench across the back for the passengers.
export function autorickshaw() {
	const g = new THREE.Group();
	const green = mat(0x2f8a3a, { metalness: 0.3, roughness: 0.4 }), yellow = mat(0xf0c419, { roughness: 0.7 }), dark = mat(0x222224);
	const wheels = [wheel(g, 0, 0.23, 1.0, 0.23, 0.11), wheel(g, -0.56, 0.23, -0.72, 0.23, 0.12), wheel(g, 0.56, 0.23, -0.72, 0.23, 0.12)];
	// the tub: floor, the low sides by the bench, the rear body over the engine, the front cowl and screen
	part(box(1.24, 0.08, 1.9), dark, 0, 0.36, -0.12, g);
	for (const x of [-0.6, 0.6]) part(box(0.06, 0.32, 0.75), green, x, 0.54, -0.68, g);
	part(box(1.28, 0.62, 0.3), green, 0, 0.62, -1.02, g);
	part(box(0.92, 0.66, 0.36), green, 0, 0.66, 0.98, g);
	part(box(0.92, 0.1, 0.36), yellow, 0, 1.0, 0.98, g);
	const ws = part(new THREE.PlaneGeometry(0.88, 0.48), GLASS, 0, 1.28, 0.86, g);
	ws.rotation.x = -0.12;
	part(cyl(0.012, 0.012, 0.6, 6), dark, 0, 1.06, 0.62, g).rotation.z = Math.PI / 2; // handlebar
	// the hood: a yellow canvas roof on a black frame, with its back curtain
	const hood = part(new THREE.CylinderGeometry(0.66, 0.66, 1.95, 16, 1, true, -Math.PI / 2, Math.PI), yellow, 0, 1.38, -0.12, g);
	hood.rotation.x = Math.PI / 2;
	hood.scale.set(1, 1, 0.42);
	hood.material = hood.material.clone();
	hood.material.side = THREE.DoubleSide;
	part(box(1.3, 0.06, 1.98), yellow, 0, 1.4, -0.12, g);
	for (const z of [0.82, -1.08]) for (const x of [-0.62, 0.62]) part(box(0.035, 1.05, 0.035), dark, x, 0.88, z, g);
	part(box(1.26, 0.7, 0.03), yellow, 0, 1.0, -1.15, g);
	// the passengers' bench and the driver's seat
	part(box(1.08, 0.12, 0.42), SEAT, 0, 0.62, -0.62, g);
	part(box(1.08, 0.42, 0.08), SEAT, 0, 0.88, -0.86, g);
	part(box(0.42, 0.1, 0.36), SEAT, 0, 0.72, 0.36, g);
	part(box(0.04, 0.04, 0.8), CHROME, 0, 1.24, -0.2, g); // the grab rail behind the driver
	part(new THREE.CircleGeometry(0.07, 12), LIGHT, 0, 0.82, 1.17, g);
	part(box(0.36, 0.1, 0.02), PLATE, 0, 0.5, -1.18, g);
	for (const x of [-0.5, 0.5]) part(box(0.1, 0.06, 0.03), TAIL, x, 0.62, -1.18, g);
	const driver = seatedFigure(23, { reach: 1.0, knee: 1.2 });
	driver.position.set(0, 0.78 - 0.95 + 0.05, 0.42);
	g.add(driver);
	return { kind: "auto", group: g, wheels, doors: {}, radius: 0.23, len: 2.63, door: null, seat: new THREE.Vector3(0.28, 0.68 + 0.08, -0.62 + 0.06), driver,
		hull: { x: 0.65, y0: 0.3, y1: 1.72, z0: -1.2, z1: 1.2 }, roof: 1.62, waist: 0.6, opening: { z0: -1.0, z1: 0.15 } };
}

// ---------- the train ----------
// Carriage windows glow after dark; main.js sets emissiveIntensity from the hour.
export const WINDOW_GLOW = [];
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
const at = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
class Pieces {
	constructor() {
		this.b = new Batch();
	}
	box(x, y, z, w, h, d, c, rx, ry, rz) {
		this.b.add(TB, at(x, y, z, w, h, d, rx, ry, rz), c);
		return this;
	}
	// a cylinder of diameter dm and length l, along x ("x"), y or z
	cyl(x, y, z, dm, l, c, axis = "y", fine = true) {
		const r = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
		this.b.add(fine ? TC : TC8, at(x, y, z, dm, l, dm, ...r), c);
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
