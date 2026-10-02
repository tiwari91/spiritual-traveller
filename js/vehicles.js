// How the traveller moves: a motorbike up to the Sahyadri, the train across the Deccan and the plains,
// a pilgrim jeep on the ghat and hill roads. Modelled in metres and scaled into the world by main.js.
import * as THREE from "three";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
const CHROME = mat(0xd8dde2, { metalness: 0.9, roughness: 0.2 });
const TYRE = mat(0x1c1c1e, { roughness: 0.9 });
const GLASS = mat(0x1d2a38, { metalness: 0.6, roughness: 0.15 });
const LIGHT = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 1.2 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0xb01010, emissive: 0x800000, emissiveIntensity: 0.8 });

function part(geo, m, x, y, z, parent) {
	const o = new THREE.Mesh(geo, m);
	o.position.set(x, y, z);
	o.castShadow = true;
	o.receiveShadow = true;
	parent.add(o);
	return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// A wheel turning about x; spun by setting rotation.x.
function wheel(parent, x, y, z, r, w, rim = CHROME) {
	const g = new THREE.Group();
	g.position.set(x, y, z);
	const t = part(new THREE.TorusGeometry(r * 0.8, r * 0.22, 10, 24), TYRE, 0, 0, 0, g);
	t.rotation.y = Math.PI / 2;
	t.scale.z = w / (r * 0.44);
	const hub = part(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 0.7, 14), rim, 0, 0, 0, g);
	hub.rotation.z = Math.PI / 2;
	// spokes so the spin reads
	for (let i = 0; i < 4; i++) {
		const s = part(box(w * 0.75, r * 1.15, r * 0.08), mat(0x2a2a2a), 0, 0, 0, g);
		s.rotation.x = (i / 4) * Math.PI;
	}
	parent.add(g);
	return g;
}

// Royal Enfield-style motorbike; the rider sits at about 0.8 m.
export function motorbike() {
	const g = new THREE.Group();
	const paint = mat(0x5a0f14, { metalness: 0.4, roughness: 0.35 });
	const black = mat(0x18181a, { roughness: 0.5 });
	const wheels = [wheel(g, 0, 0.33, 0.7, 0.33, 0.1), wheel(g, 0, 0.33, -0.68, 0.33, 0.12)];
	for (const z of [0.7, -0.68]) {
		const guard = part(new THREE.TorusGeometry(0.36, 0.05, 6, 16, Math.PI * 0.9), paint, 0, 0.33, z, g);
		guard.rotation.y = Math.PI / 2;
		guard.rotation.x = Math.PI * 0.05;
	}
	part(box(0.12, 0.3, 0.9), black, 0, 0.5, -0.02, g).rotation.x = -0.15; // frame and engine block
	part(box(0.22, 0.24, 0.3), CHROME, 0, 0.42, 0.12, g);
	const tank = part(new THREE.CapsuleGeometry(0.13, 0.32, 6, 12), paint, 0, 0.8, 0.22, g);
	tank.rotation.x = Math.PI / 2 + 0.1;
	tank.scale.x = 0.95;
	part(box(0.26, 0.08, 0.5), mat(0x2a1d16, { roughness: 0.8 }), 0, 0.8, -0.3, g); // seat
	part(box(0.3, 0.04, 0.32), CHROME, 0, 0.78, -0.72, g); // luggage carrier
	part(box(0.34, 0.18, 0.26), mat(0xc96a1e), 0, 0.9, -0.72, g); // a cloth bundle
	const fork = part(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), CHROME, 0, 0.62, 0.62, g);
	fork.rotation.x = -0.4;
	part(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), CHROME, 0, 1.0, 0.5, g).rotation.z = Math.PI / 2; // handlebar
	part(new THREE.CylinderGeometry(0.09, 0.07, 0.1, 16), CHROME, 0, 0.86, 0.66, g).rotation.x = Math.PI / 2;
	part(new THREE.CircleGeometry(0.075, 16), LIGHT, 0, 0.86, 0.715, g);
	part(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 10), CHROME, 0.14, 0.3, -0.25, g).rotation.x = Math.PI / 2 - 0.08; // exhaust
	part(box(0.1, 0.05, 0.03), TAIL, 0, 0.62, -1.0, g);
	return { group: g, wheels, seat: new THREE.Vector3(0, 0.84, -0.22), radius: 0.33 };
}

// A white pilgrim jeep with a roof rack and a saffron flag on the bonnet.
export function jeep() {
	const g = new THREE.Group();
	const body = mat(0xeeeeea, { metalness: 0.3, roughness: 0.35 });
	const trim = mat(0x2a2a2c, { roughness: 0.6 });
	part(box(1.75, 0.75, 4.1), body, 0, 0.8, 0, g);
	part(box(1.7, 0.75, 2.5), body, 0, 1.5, -0.55, g);
	// glass all round the cabin
	part(box(1.72, 0.5, 2.3), GLASS, 0, 1.55, -0.5, g);
	part(box(1.6, 0.48, 0.05), GLASS, 0, 1.53, 0.72, g).rotation.x = -0.18;
	part(box(1.78, 0.12, 4.15), trim, 0, 0.48, 0, g); // bumpers and sills
	part(box(1.4, 0.3, 0.05), trim, 0, 0.92, 2.06, g); // grille
	for (const x of [-0.62, 0.62]) {
		part(new THREE.CircleGeometry(0.11, 14), LIGHT, x, 0.95, 2.065, g);
		part(box(0.18, 0.1, 0.03), TAIL, x, 0.95, -2.06, g);
	}
	// roof rack with luggage
	part(box(1.5, 0.05, 2.0), trim, 0, 1.92, -0.55, g);
	part(box(1.2, 0.3, 0.8), mat(0x3a5f8a), -0.05, 2.1, -0.2, g);
	part(box(0.9, 0.26, 0.6), mat(0x8f3a1e), 0.1, 2.08, -1.0, g);
	part(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), CHROME, 0.75, 1.4, 1.95, g);
	part(new THREE.PlaneGeometry(0.32, 0.2), mat(0xff8a1e, { side: THREE.DoubleSide, emissive: 0x803000, emissiveIntensity: 0.3 }), 0.75, 1.55, 1.8, g).rotation.y = Math.PI / 2;
	const wheels = [];
	for (const x of [-0.82, 0.82]) for (const z of [1.3, -1.35]) wheels.push(wheel(g, x, 0.38, z, 0.38, 0.26, mat(0x9a9a9a, { metalness: 0.7, roughness: 0.3 })));
	return { group: g, wheels, radius: 0.38 };
}

// Carriage windows glow after dark; main.js sets emissiveIntensity from the hour.
export const WINDOW_GLOW = [];
function windowMask() {
	const c = document.createElement("canvas");
	c.width = 512;
	c.height = 64;
	const g = c.getContext("2d");
	g.fillStyle = "#000";
	g.fillRect(0, 0, 512, 64);
	g.fillStyle = "#fff";
	for (let x = 40; x < 470; x += 24) if ((x * 7) % 5 !== 0) g.fillRect(x, 22, 16, 16);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
function coachTexture(base, band, windows) {
	const c = document.createElement("canvas");
	c.width = 512;
	c.height = 64;
	const g = c.getContext("2d");
	g.fillStyle = base;
	g.fillRect(0, 0, 512, 64);
	g.fillStyle = band;
	g.fillRect(0, 18, 512, 26);
	if (windows) {
		g.fillStyle = "#1a2230";
		for (let x = 40; x < 470; x += 24) g.fillRect(x, 22, 16, 16);
		g.fillStyle = "#2a2a2a";
		g.fillRect(10, 14, 18, 44);
		g.fillRect(484, 14, 18, 44);
	} else {
		g.fillStyle = "#1a2230";
		g.fillRect(16, 20, 40, 20);
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}
// One railway carriage: body, curved roof, two bogies. Length along z, centred.
function carriage(len, base, band, windows, loco) {
	const g = new THREE.Group();
	const side = new THREE.MeshStandardMaterial({ map: coachTexture(base, band, windows), roughness: 0.55, metalness: 0.2 });
	if (windows) {
		side.emissive.set(0xffc46a);
		side.emissiveMap = windowMask();
		side.emissiveIntensity = 0;
		WINDOW_GLOW.push(side);
	}
	const plain = mat(base, { roughness: 0.55, metalness: 0.2 });
	const b = part(box(3.0, 3.0, len), [side, side, plain, plain, plain, plain], 0, 2.4, 0, g);
	b.material[0].map.repeat.set(1, 1);
	const roof = part(new THREE.CylinderGeometry(1.5, 1.5, len, 18, 1, false, -Math.PI / 2, Math.PI), mat(loco ? 0x6a6e72 : 0x8a8f94, { metalness: 0.3 }), 0, 3.9, 0, g);
	roof.rotation.x = -Math.PI / 2;
	roof.scale.z = 0.3;
	for (const z of [len * 0.36, -len * 0.36]) {
		part(box(2.6, 0.7, 3.2), mat(0x222326), 0, 0.75, z, g);
		for (const x of [-1.25, 1.25]) for (const dz of [-0.9, 0.9]) {
			const w = part(new THREE.CylinderGeometry(0.46, 0.46, 0.15, 14), mat(0x3a3a3c, { metalness: 0.6 }), x, 0.5, z + dz, g);
			w.rotation.z = Math.PI / 2;
		}
	}
	if (loco) {
		// cab windows and headlight at the front, a pantograph on the roof
		part(box(2.4, 0.9, 0.06), GLASS, 0, 3.0, len / 2 + 0.02, g);
		part(new THREE.CircleGeometry(0.2, 14), LIGHT, 0, 3.8, len / 2 + 0.03, g);
		for (const x of [-0.9, 0.9]) part(new THREE.CircleGeometry(0.14, 12), LIGHT, x, 1.4, len / 2 + 0.03, g);
		const pan = part(box(0.06, 1.0, 1.6), CHROME, 0, 4.6, len * 0.25, g);
		pan.rotation.x = 0.5;
		part(box(1.6, 0.05, 0.1), CHROME, 0, 5.05, len * 0.25 + 0.3, g);
	}
	return g;
}
// Indian Railways: a red and white electric locomotive and blue ICF coaches with a cream band.
export function train(coaches = 4) {
	const cars = [];
	const loco = carriage(20, "#b8291f", "#f2ead8", false, true);
	cars.push({ group: loco, len: 20 });
	for (let i = 0; i < coaches; i++) cars.push({ group: carriage(23, i === 1 ? "#a8251c" : "#1f4e9a", "#efe2c0", true, false), len: 23 });
	return cars;
}
