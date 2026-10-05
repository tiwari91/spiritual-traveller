// Traffic on the road around the traveller: goods trucks, state transport buses, autorickshaws,
// tractors with trolleys and cars. India drives on the left: slower traffic keeps to the left edge,
// oncoming traffic passes on the right, and the traveller runs near the middle to overtake.
import * as THREE from "three";
import { VCOL } from "./batch.js";
import { BOX, CYL, Kit, Outline, QUAD, SPH, arc, archFlare, at, carBody, loft, longSlab, planWidth, prep, section, stations, wheel } from "./carkit.js";
import { autoBody } from "./vehicles.js";
import { M } from "./roads.js";
import { rand } from "./util.js";

// Each model is built in metres, facing +z, wheels on y = 0, as a Kit: one mesh, a group per material.
const pick = (R, list) => list[Math.floor(R() * list.length)];
// A body loft from a side outline: rounded sections, corners rounded in plan.
function hull(kit, pts, hw, o = {}) {
	const out = new Outline(pts);
	const plan = planWidth(hw, out.zmin, out.zmax, o.cf ?? 0.2, o.cr ?? 0.15);
	const parts = loft(stations(out.zmin, out.zmax, o.step ?? 0.1, o.extra || []), (z) => {
		const [yb, yt] = out.span(z) || [0, 0.01];
		return section(plan(z), yb, yt, yb + (yt - yb) * (o.ym ?? 0.5), o.nLow ?? 10, o.nTop ?? 6, o.n ?? 12);
	}, o.classify || (() => "paint"), { front: o.capF ?? "paint", rear: o.capR ?? "paint" });
	for (const [k, g] of parts) kit.add(g, at(), (o.colours && o.colours[k]) ?? o.colour ?? 0xffffff, o.slots ? o.slots[k] ?? k : k);
	return { out, plan };
}
// A flat panel (glass, a sign) on the side of a body, x outwards, centred at (z, y), w along z, h up.
function sidePanel(kit, sx, x, y, z, w, h, c, slot, uv) {
	kit.add(QUAD, at(sx * x, y, z, 0, (sx * Math.PI) / 2, 0, w, h, 1), c, slot, uv);
}

// The goods truck: a Tata LPT-like semi-forward cab, painted, with the wooden crown over the windscreen,
// the big chrome grille and twin round lamps, and the tall wooden body behind, painted in bands with flowers,
// the transporter's name, and HORN OK PLEASE on the tailgate. A tarpaulin over the load.
function truck(R) {
	const k = new Kit();
	const v = Math.floor(R() * 2);
	const cab = pick(R, [0xe8761a, 0xf2c11c, 0x2a7ac0, 0xd8261c, 0x2f8a4a, 0xf2f0e8]);
	const base = v ? 0x2a62b8 : 0xf0b81e;
	const black = 0x161618, steel = 0x2a2a2c, wood = 0x6a4428;
	const zF = 3.75, hw = 1.17;
	// chassis rails, the cross members, the fuel tank and battery box
	for (const sx of [-1, 1]) k.box(sx * 0.45, 0.88, -0.2, 0.12, 0.24, 7.0, steel, "matte");
	for (let z = -3.4; z < 1.8; z += 0.9) k.box(0, 1.05, z, 2.0, 0.1, 0.12, steel, "matte");
	k.cyl(0.85, 0.82, 0.9, 0.5, 0.9, 0xb8bcc0, "chrome", "z", 16);
	k.rbox(-0.85, 0.8, 1.0, 0.36, 0.38, 0.5, 0.03, black, "matte");
	// the cab: lofted, notched over the front wheel, with the windscreen raked a little
	const af = 2.55, ra = 0.6;
	hull(k, [[1.75, 0.68, 0.04], [af - ra, 0.68, 0.02], ...arc(af, 0.52, ra, Math.PI, 0, 10), [af + ra, 0.66, 0.02], [zF - 0.05, 0.66, 0.06], [zF, 1.5, 0.08], [zF - 0.1, 1.62, 0.05], [zF - 0.26, 2.58, 0.14], [1.75, 2.6, 0.1]], hw, {
		cf: 0.28, cr: 0.08, nLow: 12, nTop: 7, ym: 0.5, extra: [af - ra, af + ra, 2.2, 3.35], colour: cab,
		classify: (z, j) => (j >= 7 && z > zF - 0.27 && z < zF - 0.09 ? "glass" : "paint"),
	});
	// the side windows and the door seams, the chrome strip under the windscreen
	for (const sx of [-1, 1]) {
		sidePanel(k, sx, hw + 0.004, 2.1, 2.75, 1.0, 0.62, 0xffffff, "glass");
		k.box(sx * (hw + 0.006), 2.1, 2.75, 0.01, 0.66, 0.05, black, "matte");
		for (const z of [2.2, 3.35]) k.box(sx * (hw + 0.004), 1.6, z, 0.008, 1.6, 0.012, 0x101010, "matte");
		k.rbox(sx * (hw + 0.01), 1.55, 2.4, 0.03, 0.04, 0.2, 0.01, 0xd8dade, "chrome");
		// the big mirror on its stalk
		k.box(sx * (hw + 0.18), 2.1, zF - 0.25, 0.36, 0.03, 0.03, black, "matte");
		k.rbox(sx * (hw + 0.36), 2.0, zF - 0.27, 0.06, 0.34, 0.2, 0.02, black, "matte");
		// the steps up to the door
		for (const y of [0.55, 0.85]) k.rbox(sx * (hw - 0.05), y, 2.0, 0.24, 0.04, 0.34, 0.01, 0x3a3a3c, "matte");
	}
	k.box(0, 2.1, zF - 0.17, 0.05, 0.95, 0.04, black, "matte"); // the windscreen's centre pillar
	k.rbox(0, 1.6, zF - 0.06, 2.1, 0.04, 0.04, 0.015, 0xd8dade, "chrome");
	for (const sx of [-1, 1]) k.add(BOX, at(sx * 0.4, 1.78, zF - 0.06, -0.18, 0, sx * 0.6, 0.012, 0.5, 0.012), 0x111111, "matte"); // wipers
	// the crown over the cab, painted, with marker lamps
	k.rbox(0, 2.78, 2.85, 2.38, 0.36, 2.3, 0.05, v ? 0x1f7a3a : 0xc4241c, "paint");
	k.sign(v ? "crown2" : "crown", 0, 2.78, 4.003, 2.3, 0.34);
	for (const sx of [-1, 1]) k.lamp(sx * 1.05, 2.98, 3.99, 0.07, 0.05, "head", false, 0xf2a020);
	// the front: grille, twin round lamps each side, the bumper, the plate, the mudflaps
	k.rbox(0, 1.18, zF + 0.01, 1.0, 0.46, 0.06, 0.04, 0x1a1a1c, "matte");
	for (let i = 0; i < 6; i++) k.rbox(0, 1.0 + i * 0.075, zF + 0.04, 0.96, 0.025, 0.03, 0.01, 0xdadde0, "chrome");
	for (const sx of [-1, 1]) for (const dx of [0.68, 0.92]) {
		k.cyl(sx * dx, 1.1, zF + 0.0, 0.2, 0.06, 0xd8dade, "chrome", "z", 18);
		k.lamp(sx * dx, 1.1, zF + 0.035, 0.16, 0.16, "head", false, 0xf4f2ea, true);
	}
	for (const sx of [-1, 1]) k.rbox(sx * 0.8, 1.3, zF + 0.0, 0.1, 0.05, 0.04, 0.015, 0xf08a1e, "matte");
	k.rbox(0, 0.72, zF + 0.08, 2.4, 0.2, 0.16, 0.04, black, "paint");
	k.plate(v ? "truck2" : "truck", 0, 0.72, zF + 0.165, 0.5, 0.11);
	for (const sx of [-1, 1]) archFlare(k, sx * (hw - 0.05), 0.52, af, ra - 0.04, 0.3, black, "matte");
	// the cargo body: floor, sides of painted planks with the art on them, the tall headboard, the tailgate
	const zb0 = -3.72, zb1 = 1.66, yb = 1.12, yt = 2.56, bw = 1.2;
	k.box(0, yb, (zb0 + zb1) / 2, 2.42, 0.1, zb1 - zb0, wood, "matte");
	for (const sx of [-1, 1]) {
		k.rbox(sx * bw, (yb + yt) / 2, (zb0 + zb1) / 2, 0.06, yt - yb, zb1 - zb0, 0.02, base, "paint");
		sidePanel(k, sx, bw + 0.032, yb + 0.42, (zb0 + zb1) / 2, zb1 - zb0 - 0.1, 0.72, 0xffffff, "decal", v ? [512, 576, 512, 128] : [0, 576, 512, 128]);
		k.rbox(sx * (bw + 0.035), yt - 0.06, (zb0 + zb1) / 2, 0.02, 0.06, zb1 - zb0, 0.01, 0xd8dade, "chrome");
		for (let z = zb0 + 0.3; z < zb1; z += 0.9) k.box(sx * (bw + 0.03), yt - 0.4, z, 0.02, 0.5, 0.05, v ? 0xe8a21c : 0xc4241c, "paint");
	}
	// the headboard over the cab roof, arched, and the tailgate with HORN OK PLEASE
	const head = new THREE.Shape();
	head.moveTo(-1.2, 0);
	head.lineTo(1.2, 0);
	head.lineTo(1.2, 1.55);
	head.quadraticCurveTo(0, 2.05, -1.2, 1.55);
	head.closePath();
	k.add(longSlab(head, zb1 - 0.08, zb1, 0.02, 10), at(0, yb, 0), base, "paint");
	k.add(QUAD, at(0, yb + 1.25, zb1 + 0.003, 0, 0, 0, 2.3, 0.5, 1), 0xffffff, "decal", v ? [512, 704, 512, 96] : [0, 704, 512, 96]);
	k.rbox(0, (yb + yt) / 2, zb0, 2.42, yt - yb, 0.06, 0.02, base, "paint");
	k.add(QUAD, at(0, (yb + yt) / 2 + 0.05, zb0 - 0.033, 0, Math.PI, 0, 2.32, 1.18, 1), 0xffffff, "decal", v ? [512, 320, 512, 256] : [0, 320, 512, 256]);
	// the load under a tarpaulin, roped down
	const tarp = pick(R, [0x2a5ab0, 0x3a6a3a, 0x8a8a8a, 0xc8462a]);
	k.add(SPH(16), at(0, yt - 0.1, (zb0 + zb1) / 2 - 0.05, 0, 0, 0, 2.36, 1.1, 5.3), tarp, "matte");
	// the rear: bumper, the tail lamps, reflectors, the plate, the mudflaps
	k.rbox(0, 0.85, zb0 - 0.05, 2.3, 0.14, 0.1, 0.02, black, "matte");
	for (const sx of [-1, 1]) {
		k.lamp(sx * 0.95, 0.86, zb0 - 0.105, 0.2, 0.1, "tail", true);
		k.rbox(sx * 0.85, 0.55, -2.25, 0.36, 0.5, 0.02, 0.01, black, "matte");
		k.add(QUAD, at(sx * 0.85, 0.65, -2.262, 0, Math.PI, 0, 0.2, 0.06, 1), 0xd81818, "tail");
	}
	k.plate(v ? "truck2" : "truck", 0, 1.35, zb0 - 0.04, 0.5, 0.11, true);
	// wheels: one axle in front, twin wheels at the back
	for (const sx of [-1, 1]) {
		wheel(k, sx * 1.0, 0.52, af, 0.52, 0.28, sx, "steel", 0xc8ccd0, 20);
		wheel(k, sx * 1.04, 0.52, -1.6, 0.52, 0.28, sx, "steel", 0xc8ccd0, 20);
		wheel(k, sx * 0.74, 0.52, -1.6, 0.52, 0.28, -sx, "steel", 0x8a8e92, 16);
	}
	return k;
}

// The state transport bus: an MSRTC "Lal Pari" in red with its yellow band, an APSRTC express in white and
// green, or Uttarakhand's white and blue; the route board over the two-piece windscreen, the door at the front
// on the left, sliding windows, the luggage carrier on the roof and the ladder up to it at the back.
function bus(R) {
	const k = new Kit();
	const v = Math.floor(R() * 3);
	const [lower, upper, band, roof] = [[0xb81c22, 0xb81c22, 0xf2c11c, 0xd6d2c8], [0xf2f0e8, 0xf2f0e8, 0x1f8a4a, 0xe0ded6], [0xf2f0e8, 0xf2f0e8, 0x2a5ab0, 0xe0ded6]][v];
	const black = 0x161618, hw = 1.25, zF = 5.25, zR = -5.25, af = 3.15, ar = -2.6, ra = 0.62;
	hull(k, [[zR, 0.5, 0.06], [ar - ra, 0.45, 0.02], ...arc(ar, 0.52, ra, Math.PI, 0, 10), [af - ra, 0.45, 0.02], ...arc(af, 0.52, ra, Math.PI, 0, 10), [af + ra, 0.45, 0.02], [zF, 0.5, 0.08], [zF + 0.02, 2.75, 0.3], [zF - 0.25, 3.15, 0.25], [zR + 0.2, 3.15, 0.2], [zR, 2.8, 0.15]], hw, {
		cf: 0.12, cr: 0.1, nLow: 14, nTop: 5, ym: 0.45, n: 14, step: 0.25, extra: [af - ra, af + ra, ar - ra, ar + ra],
		classify: (z, j) => (j >= 12 ? "roof" : "body"), colours: { body: upper, roof }, slots: { body: "paint", roof: "paint" },
	});
	// the window band on each side: glass between the pillars, the sliding sashes, the band of livery below
	for (const sx of [-1, 1]) {
		const x = hw + 0.004;
		sidePanel(k, sx, x, 2.12, -0.15, 9.6, 0.95, 0xffffff, "glass");
		for (let z = -4.85; z <= 4.4; z += 1.12) k.box(sx * (x + 0.004), 2.12, z, 0.012, 0.98, 0.1, upper, "paint");
		k.box(sx * (x + 0.006), 2.2, -0.15, 0.012, 0.025, 9.6, 0xb8bcc0, "chrome");
		k.box(sx * (x + 0.004), 1.48, 0, 0.014, 0.16, 10.4, band, "paint");
		k.box(sx * (x + 0.004), 1.0, 0, 0.012, 0.95, 10.45, lower, "paint");
		k.box(sx * (x + 0.006), 0.56, 0, 0.014, 0.06, 10.4, black, "matte");
	}
	// the corporation's name along the sides
	const name = ["msrtc", "apsrtc", "uktc"][v];
	const rect = { msrtc: [512, 864, 512, 48], apsrtc: [0, 928, 512, 48], uktc: [512, 928, 512, 48] }[name];
	for (const sx of [-1, 1]) sidePanel(k, sx, hw + 0.02, 1.15, 0.2, 4.2, 0.4, 0xffffff, "decal", rect);
	// the door, front left, and the driver's window, front right
	k.box(hw + 0.012, 1.45, 4.2, 0.012, 2.1, 0.9, 0x1a1a1c, "matte");
	sidePanel(k, 1, hw + 0.02, 1.85, 4.2, 0.36, 1.2, 0xffffff, "glass");
	k.add(QUAD, at(hw + 0.02, 1.85, 4.43, 0, Math.PI / 2, 0, 0.36, 1.2, 1), 0xffffff, "glass");
	k.add(QUAD, at(hw + 0.02, 1.85, 3.97, 0, Math.PI / 2, 0, 0.36, 1.2, 1), 0xffffff, "glass");
	k.rbox(hw - 0.1, 0.42, 4.2, 0.3, 0.05, 0.85, 0.01, 0x3a3a3c, "matte");
	sidePanel(k, -1, hw + 0.01, 2.0, 4.6, 0.9, 0.9, 0xffffff, "glass");
	// the front: the two-piece windscreen, the route board over it, lamps, grille, bumper, plate
	k.add(QUAD, at(0, 2.05, zF + 0.035, -0.04, 0, 0, 2.26, 1.15, 1), 0xffffff, "glass");
	k.box(0, 2.05, zF + 0.04, 0.06, 1.18, 0.02, black, "matte");
	k.box(0, 1.46, zF + 0.04, 2.3, 0.05, 0.02, black, "matte");
	const board = ["board", "board2", "board3"][v];
	k.rbox(0, 2.86, zF - 0.02, 1.9, 0.3, 0.06, 0.02, black, "matte");
	k.sign(board, 0, 2.86, zF + 0.015, 1.84, 0.24);
	for (const sx of [-1, 1]) {
		k.add(BOX, at(sx * 0.5, 1.75, zF + 0.05, 0, 0, sx * 0.5, 0.015, 0.75, 0.015), 0x111111, "matte"); // wipers
		for (const dx of [0.82, 1.03]) {
			k.cyl(sx * dx, 0.95, zF + 0.02, 0.19, 0.05, 0xd8dade, "chrome", "z", 16);
			k.lamp(sx * dx, 0.95, zF + 0.05, 0.15, 0.15, "head", false, 0xf4f2ea, true);
		}
		k.rbox(sx * 0.92, 1.18, zF + 0.04, 0.12, 0.06, 0.03, 0.015, 0xf08a1e, "matte");
		// the mirrors on long arms
		k.box(sx * (hw + 0.2), 2.5, zF - 0.1, 0.4, 0.03, 0.03, black, "matte");
		k.rbox(sx * (hw + 0.4), 2.2, zF - 0.05, 0.05, 0.4, 0.2, 0.02, black, "matte");
		// the tail lamps, tall at the back corners
		k.lamp(sx * 1.05, 1.0, zR - 0.01, 0.18, 0.4, "tail", true);
	}
	k.rbox(0, 1.0, zF + 0.04, 1.1, 0.3, 0.04, 0.03, 0x1a1a1c, "matte");
	for (let i = 0; i < 4; i++) k.box(0, 0.9 + i * 0.07, zF + 0.065, 1.04, 0.02, 0.02, 0xc8ccd0, "chrome");
	k.rbox(0, 0.6, zF + 0.1, 2.5, 0.2, 0.14, 0.04, black, "matte");
	k.plate(["bus", "bus2", "bus3"][v], 0, 0.62, zF + 0.175, 0.5, 0.11);
	// the back: the rear glass, the emergency door, the ladder, bumper and plate
	k.add(QUAD, at(0, 2.2, zR - 0.01, 0, Math.PI, 0, 2.1, 0.75, 1), 0xffffff, "glass");
	k.box(0.75, 1.5, zR - 0.012, 0.7, 1.7, 0.01, 0x101010, "matte");
	k.rbox(0, 0.62, zR - 0.08, 2.5, 0.2, 0.12, 0.04, black, "matte");
	k.plate(["bus", "bus2", "bus3"][v], 0, 1.25, zR - 0.02, 0.5, 0.11, true);
	for (const x of [-1.0, -0.65]) k.box(x, 2.3, zR - 0.06, 0.04, 1.8, 0.04, 0x8a8e92, "chrome");
	for (let y = 1.55; y < 3.2; y += 0.28) k.box(-0.82, y, zR - 0.06, 0.36, 0.03, 0.03, 0x8a8e92, "chrome");
	// the roof carrier with luggage and bundles, and the roof vents
	for (const sx of [-1, 1]) k.box(sx * 0.95, 3.32, -1.2, 0.04, 0.2, 5.4, 0x8a8e92, "chrome");
	for (let z = -3.9; z <= 1.5; z += 0.9) k.box(0, 3.24, z, 1.94, 0.03, 0.04, 0x8a8e92, "chrome");
	k.rbox(-0.3, 3.38, -2.2, 1.1, 0.34, 1.6, 0.08, 0x5a4a3a, "matte");
	k.rbox(0.45, 3.32, -0.6, 0.7, 0.26, 0.9, 0.08, 0x2a5a8a, "matte");
	k.rbox(0.2, 3.3, 0.6, 0.9, 0.22, 0.7, 0.06, 0xc8462a, "matte");
	for (const z of [2.6, 3.9]) k.rbox(0, 3.2, z, 0.6, 0.08, 0.6, 0.02, 0xc8ccd0, "paint");
	// wheels: steel discs, twin at the back
	for (const sx of [-1, 1]) {
		wheel(k, sx * 1.04, 0.52, af, 0.52, 0.3, sx, "steel", 0xc8ccd0, 20);
		wheel(k, sx * 1.04, 0.52, ar, 0.52, 0.28, sx, "steel", 0xc8ccd0, 20);
		wheel(k, sx * 0.74, 0.52, ar, 0.52, 0.28, -sx, "steel", 0x8a8e92, 16);
		for (const z of [af, ar]) archFlare(k, sx * (hw - 0.04), 0.52, z, ra - 0.03, 0.3, 0x121214, "matte");
	}
	return k;
}

// An autorickshaw in the traffic: the same Bajaj RE as the traveller's (vehicles.js), black and yellow or
// green and yellow.
function auto(R) {
	const k = new Kit();
	const green = R() < 0.4;
	autoBody(k, { colours: green ? [0x1f7a3a, 0xf2c11c] : [0x18181a, 0xf2c11c], plate: green ? "auto2" : "auto" });
	archFlare(k, 0, 0.23, 1.0, 0.27, 0.16, green ? 0x1f7a3a : 0x18181a, "paint", Math.PI * 0.95);
	for (const sx of [-1, 1]) k.add(CYL(8), at(sx * 0.08, 0.5, 0.98, 0.25, 0, 0, 0.04, 0.55, 0.04), 0xb8bcc0, "chrome");
	wheel(k, 0, 0.23, 1.0, 0.23, 0.11, 1, "auto", 0xc8ccd0, 16);
	for (const sx of [-1, 1]) wheel(k, sx * 0.56, 0.23, -0.72, 0.23, 0.12, sx, "auto", 0xc8ccd0, 16);
	return k;
}

// A Mahindra-like tractor, red or blue: the narrow bonnet and grille, the big lugged rear wheels under their
// mudguards, the seat and steering wheel, the exhaust stack; towing a trolley heaped with fodder.
function tractor(R) {
	const k = new Kit();
	const paint = R() < 0.65 ? 0xc0262d : 0x2a5ab0;
	const grey = 0x4a4c50, black = 0x161618;
	const o = 1.6; // the tractor's own origin, ahead of the middle of the whole rig
	// the bonnet over the engine, lofted, with the grille and the lamps in it
	hull(k, [[o + 0.2, 0.7, 0.02], [o + 1.86, 0.72, 0.04], [o + 1.92, 1.18, 0.1], [o + 1.8, 1.3, 0.08], [o + 0.2, 1.36, 0.04]], 0.34, { cf: 0.16, cr: 0.02, nLow: 6, nTop: 4, ym: 0.45, colour: paint, step: 0.1 });
	k.rbox(0, 1.0, o + 1.9, 0.5, 0.42, 0.04, 0.04, black, "matte");
	for (let i = 0; i < 5; i++) k.box(0, 0.86 + i * 0.07, o + 1.925, 0.46, 0.02, 0.02, 0xb8bcc0, "chrome");
	for (const sx of [-1, 1]) {
		k.cyl(sx * 0.2, 1.18, o + 1.88, 0.13, 0.05, 0xd8dade, "chrome", "z", 14);
		k.lamp(sx * 0.2, 1.18, o + 1.91, 0.1, 0.1, "head", false, 0xf4f2ea, true);
		k.add(BOX, at(sx * 0.345, 1.02, o + 1.0, 0, 0, 0, 0.01, 0.12, 1.2), 0x1a1a1a, "matte"); // the side louvres
	}
	// the engine, the front axle and its weight frame, the gearbox and the rear axle housing
	k.rbox(0, 0.55, o + 1.0, 0.5, 0.36, 1.5, 0.05, grey, "matte");
	k.rbox(0, 0.48, o + 1.42, 1.25, 0.12, 0.16, 0.03, grey, "matte");
	k.rbox(0, 0.62, o + 2.05, 0.6, 0.3, 0.2, 0.04, black, "matte");
	k.rbox(0, 0.68, o - 0.25, 0.6, 0.5, 0.95, 0.08, grey, "matte");
	k.cyl(0, 0.68, o - 0.6, 0.32, 1.6, grey, "matte", "x", 14);
	// mudguards over the rear wheels, the seat, the steering wheel and the dash
	for (const sx of [-1, 1]) {
		archFlare(k, sx * 0.86, 0.68, o - 0.6, 0.74, 0.46, paint, "paint", Math.PI * 0.7);
		k.rbox(sx * 0.6, 1.14, o - 0.6, 0.06, 0.04, 0.9, 0.01, paint, "paint");
		k.lamp(sx * 0.85, 1.48, o - 1.13, 0.08, 0.05, "tail", true);
	}
	k.rbox(0, 1.26, o - 0.75, 0.46, 0.08, 0.4, 0.04, black, "matte");
	k.rbox(0, 1.48, o - 0.98, 0.42, 0.34, 0.06, 0.04, black, "matte", 0.15);
	k.cyl(0, 1.3, o + 0.15, 0.05, 0.55, grey, "matte", "y", 8);
	k.add(prep(new THREE.TorusGeometry(0.19, 0.02, 6, 20)), at(0, 1.6, o + 0.05, -1.1, 0, 0), black, "matte");
	k.rbox(0, 1.3, o + 0.25, 0.5, 0.3, 0.2, 0.05, paint, "paint");
	// the exhaust stack, up the front right, and the air cleaner on the left
	k.cyl(-0.22, 1.7, o + 1.5, 0.08, 0.9, 0x2a2a2a, "matte", "y", 10);
	k.cyl(-0.22, 1.95, o + 1.5, 0.11, 0.4, 0xc8ccd0, "chrome", "y", 10);
	k.cyl(0.22, 1.5, o + 1.55, 0.13, 0.4, black, "matte", "y", 10);
	k.plate("tractor", 0, 0.7, o + 2.16, 0.36, 0.08);
	// wheels
	for (const sx of [-1, 1]) {
		wheel(k, sx * 0.72, 0.36, o + 1.45, 0.36, 0.17, sx, "steel", 0xd8b83a, 18);
		wheel(k, sx * 0.86, 0.68, o - 0.6, 0.68, 0.4, sx, "lug", 0xd8b83a, 22);
	}
	// the drawbar and the trolley: a steel box on one axle, heaped with fodder, reflectors at the back
	k.box(0, 0.75, o - 1.55, 0.12, 0.1, 1.1, black, "matte");
	const tc = R() < 0.5 ? 0x2f5a9a : 0x3a7a3a, z0 = -3.6, z1 = -0.9, tw = 1.1;
	k.box(0, 1.0, (z0 + z1) / 2, 2.2, 0.08, z1 - z0, tc, "paint");
	for (const sx of [-1, 1]) k.rbox(sx * tw, 1.3, (z0 + z1) / 2, 0.05, 0.55, z1 - z0, 0.01, tc, "paint");
	for (const z of [z0, z1]) k.rbox(0, 1.3, z, 2.2, 0.55, 0.05, 0.01, tc, "paint");
	for (let z = z0 + 0.4; z < z1; z += 0.6) for (const sx of [-1, 1]) k.box(sx * (tw + 0.03), 1.3, z, 0.02, 0.55, 0.04, 0x1a1a1a, "matte");
	k.add(SPH(14), at(0, 1.5, (z0 + z1) / 2, 0, 0, 0, 2.4, 1.5, z1 - z0 + 0.2), 0xc8b05a, "matte");
	for (let i = 0; i < 9; i++) k.add(BOX, at(-0.9 + i * 0.22, 1.9 + Math.sin(i) * 0.1, (z0 + z1) / 2, 0.1 * Math.sin(i * 3), 0, 0, 0.03, 0.03, z1 - z0 + 0.3), 0x8a9a3a, "matte");
	for (const sx of [-1, 1]) {
		k.add(QUAD, at(sx * 0.8, 1.2, z0 - 0.03, 0, Math.PI, 0, 0.16, 0.08, 1), 0xd81818, "tail");
		wheel(k, sx * 0.95, 0.45, -2.35, 0.45, 0.26, sx, "steel", 0xc8ccd0, 18);
	}
	return k;
}

// Cars: a Swift-like hatchback, a Dzire-like sedan or an Ertiga-like people carrier, in the colours you
// see on Indian roads, mostly white and silver.
const CARS = {
	hatch: { L: 3.85, W: 1.735, H: 1.53, sill: 0.22, waist: 0.95, nose: 0.8, cowl: 0.93, noseBack: 0.16, zA: 0.92, zW: 0.18, zR: -1.55, tail: "hatch", axles: [1.2, -1.25], r: 0.3, pillars: [[-0.25, -0.15, "matte"], [-9, -1.0, "paint"]], seams: [0.84, -0.18, -0.86], handles: [-0.32, -1.02] },
	sedan: { L: 3.99, W: 1.735, H: 1.515, sill: 0.22, waist: 0.95, nose: 0.8, cowl: 0.93, noseBack: 0.16, zA: 0.98, zW: 0.22, zR: -0.95, zT: -1.42, tail: "notch", axles: [1.24, -1.21], r: 0.3, pillars: [[-0.2, -0.1, "matte"], [-9, -0.84, "paint"]], seams: [0.88, -0.13, -0.84], handles: [-0.27, -0.98] },
	mpv: { L: 4.4, W: 1.735, H: 1.69, sill: 0.25, waist: 1.02, nose: 0.86, cowl: 1.0, noseBack: 0.2, zA: 1.16, zW: 0.38, zR: -2.02, tail: "hatch", axles: [1.42, -1.32], r: 0.31, pillars: [[-0.03, 0.07, "matte"], [-0.88, -0.78, "matte"], [-9, -1.66, "paint"]], seams: [1.0, 0.04, -0.82], handles: [-0.12, -0.9] },
};
function car(R) {
	const k = new Kit();
	const type = ["hatch", "hatch", "sedan", "sedan", "mpv"][Math.floor(R() * 5)];
	const paint = [0xf2f2ee, 0xf2f2ee, 0xc6cacd, 0xc6cacd, 0x9a1a1e, 0x4a4e54, 0x1e3a6a, 0xe8e2d0][Math.floor(R() * 8)];
	const plate = ["mh", "mh2", "ka", "ap", "ts", "uk"][Math.floor(R() * 6)];
	carBody(k, CARS[type], { paint, plate, grille: type === "sedan" ? "chrome" : "mouth", wheel: R() < 0.5 ? "alloy" : "cover", chromeHandles: type === "sedan", n: 12, step: 0.1, gstep: 0.09, wheelN: 16 });
	return k;
}
export const MAKERS = { truck, bus, auto, tractor, car };
// What you meet on each kind of road.
const MIX = {
	nh: ["truck", "truck", "truck", "bus", "car", "car", "auto", "tractor"],
	ghat: ["bus", "car", "truck", "car", "auto"],
	hill: ["car", "bus", "car", "truck"],
};
const MIX_TIBET = ["car", "car", "bus"];
const LEN = { truck: 7.6, bus: 10.6, auto: 2.6, tractor: 7.4, car: 4.2 };
// half widths in metres, for keeping lanes apart
const HALF = { truck: 1.25, bus: 1.3, auto: 0.7, tractor: 1.15, car: 0.85 };

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
		// on the Tibet side of the Kailash journey: few vehicles, cars and buses (no autos, tractors or painted trucks)
		const types = s >= this.roads.tibetFrom ? MIX_TIBET : MIX[kind] || MIX.nh;
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
		// a fresh vehicle comes in from out of sight: oncoming ones from far ahead, the quicker ones in the
		// traveller's direction from behind the camera, so none appears out of nowhere in the middle of the view
		if (ahead) c.s = s + (c.dir < 0 ? 40 + this.R() * 7 : -(19 + this.R() * 5));
		else c.s = s + (this.R() * 2 - 0.6) * (18 + this.R() * 22);
		// same-direction traffic is a little quicker than the traveller and overtakes on the right
		c.k = 1.25 + this.R() * 0.5; // fraction of the traveller's pace
		c.live = true;
	}
	// s: where the traveller is; pace: the traveller's speed along the route (units a second);
	// on: whether traffic should show; scale: world units per metre; me: the traveller's half width (m)
	// me: { x, z, r } the traveller's footprint (world units); nothing may ever overlap it
	update(dt, s, pace, on, scale, me = null) {
		this.frame = (this.frame || 0) + 1;
		if (!on) {
			for (const c of this.cars) if (c.mesh) c.mesh.visible = false;
			return;
		}
		const p = this.p, q0 = {}, q1 = {};
		const here = this.roads.road(s, 0, p);
		const kind = here ? here.kind : null;
		// 1. move everyone, and recycle vehicles that have dropped too far behind or ahead
		for (const c of this.cars) {
			if (!c.live && kind && kind !== "trek") this.spawn(c, s, false, kind);
			if (!c.live) continue;
			c.s += (c.dir > 0 ? pace * (c.k - 1) + 0.6 : -(pace * 0.8 + 1.4)) * dt;
			const rel = c.s - s;
			if (rel < -26 || rel > 48) this.spawn(c, s, true, kind || "nh");
		}
		const live = this.cars.filter((c) => c.live);
		const gap = (a, b) => ((LEN[a.type] + LEN[b.type]) / 2 + 3) * scale;
		// 2. same-direction traffic either overtakes the traveller (only with the oncoming lane clear) or waits behind
		for (const c of live) {
			if (c.dir < 0) continue;
			const span = (LEN[c.type] / 2 + 4) * scale + 8 * scale;
			const busy = live.some((o) => o.dir < 0 && o.s > s - span - 12 * scale && o.s < s + span + 30 * scale);
			const rel = c.s - s;
			if (busy && rel > -span && rel < span && !(c.passing > 0.5)) c.s = Math.min(c.s, s - span);
			const want = Math.abs(c.s - s) < span && (!busy || c.passing > 0.5) ? 1 : 0;
			c.passing = (c.passing || 0) + (want - (c.passing || 0)) * Math.min(1, dt * 1.5);
		}
		// 3. in each direction, nobody drives through the vehicle in front: walk the queue and space it out
		for (const dir of [1, -1]) {
			const q = live.filter((c) => c.dir === dir).sort((a, b) => (b.s - a.s) * dir);
			for (let i = 1; i < q.length; i++) {
				const front = q[i - 1], c = q[i];
				// vehicles in different lanes (one overtaking) may pass each other
				if (Math.abs((front.passing || 0) - (c.passing || 0)) > 0.5) continue;
				const need = gap(front, c);
				if ((front.s - c.s) * dir < need) c.s = front.s - need * dir;
			}
		}
		// 4. lanes and placement
		for (const c of this.cars) {
			if (!c.live) {
				if (c.mesh) c.mesh.visible = false;
				continue;
			}
			const m = c.mesh;
			// each vehicle keeps to its own road, whatever the traveller's is (hiding those on another kind of
			// road made them vanish where a highway became a ghat road); none on footpaths or treks
			const r = this.roads.road(c.s, 0, p);
			if (!r || !PAVED[r.kind]) {
				m.visible = false;
				continue;
			}
			const paved = PAVED[r.kind];
			const half = HALF[c.type], len = LEN[c.type];
			// lanes in metres from the centre: oncoming keeps right of the centre line, same-direction keeps
			// to the left edge and swings out right to pass the traveller, who rides just left of centre
			const right = Math.min(paved / 2 - half - 0.1, half + 0.35);
			const left = -(paved / 2 - half - 0.1);
			// (on the Kailash journey's Tibet side everyone keeps to the right: the same lanes, mirrored)
			const lane = (c.dir < 0 ? right : left + (right - left) * (c.passing || 0)) * (scale / M) * (c.s >= this.roads.tibetFrom ? -1 : 1);
			// set the vehicle on its two axles, so a long bus follows the bend instead of cutting across it
			const ax = len * 0.32 * scale;
			const a = this.roads.road(c.s - ax * c.dir, lane, q0), b = this.roads.road(c.s + ax * c.dir, lane, q1);
			if (!a || !b) {
				m.visible = false;
				continue;
			}
			const px = (a.x + b.x) / 2, pz = (a.z + b.z) / 2, yaw = Math.atan2(b.x - a.x, b.z - a.z);
			// where roads meet (a junction, a bus stand) another road's traffic can cross the traveller's path:
			// never drive through them, send the vehicle on its way out of sight instead
			if (me) {
				const dx = me.x - px, dz = me.z - pz, fx = Math.sin(yaw), fz = Math.cos(yaw);
				const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
				if (Math.abs(along) < (len / 2 + 0.6) * scale + me.r && Math.abs(across) < (half + 0.4) * scale + me.r) {
					m.visible = false;
					this.spawn(c, s, true, kind || "nh");
					continue;
				}
			}
			// stand it on the road surface itself (the tarmac rides above the bare ground, and on embankments
			// well above it), pitched to the slope between the axles and rolled to the camber under the wheels
			const tr = TRACK[c.type] * (scale / M);
			const sa = c.s - ax * c.dir, sb = c.s + ax * c.dir;
			const hRL = roadSurface(this.roads, sa, lane - tr * c.dir), hRR = roadSurface(this.roads, sa, lane + tr * c.dir);
			const hFL = roadSurface(this.roads, sb, lane - tr * c.dir), hFR = roadSurface(this.roads, sb, lane + tr * c.dir);
			const hr = (hRL + hRR) / 2, hf = (hFL + hFR) / 2;
			const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
			// the camber is held to a few degrees (where the ribbon climbs a canyon wall at its edge, a vehicle in
			// the outer lane would otherwise lie on its side), and a held roll lifts the body so the high side's
			// wheels stay on the road, not in it
			const hHigh = Math.max(hRL + hFL, hRR + hFR) / 2;
			const roll = Math.max(-0.12, Math.min(0.12, Math.atan2((hRL + hFL - hRR - hFR) / 2, 2 * tr * M)));
			m.visible = true;
			m.position.set(px, Math.max((hr + hf) / 2, hHigh - tr * M * Math.tan(Math.abs(roll))) + 0.004, pz);
			m.rotation.order = "YXZ";
			m.rotation.set(-Math.atan2(hf - hr, l), yaw, roll);
			m.scale.setScalar(scale);
		}
	}
}
// the paved width of each kind of road (m), and half the track of each vehicle (m), for the wheels
const PAVED = { nh: 7.5, ghat: 7, hill: 5.5 };
const TRACK = { truck: 1.0, bus: 1.04, auto: 0.56, tractor: 0.86, car: 0.75 };
// The height of the road's own surface at s, lane metres (at M) right of the centre: the tarmac ribbon of
// roads.js, five vertices across and one row per path point, interpolated over its triangles as drawn; off the
// ribbon, or on no road, the ground.
const RIB = { nh: 7.5 + 2 * 2.4, ghat: 7 + 2 * 1.2, hill: 5.5 + 2 * 1.2 }, LIFT = 0.05, COLS = 5;
export function roadSurface(roads, s, lane) {
	const world = roads.world;
	for (const pts of roads.roads) {
		if (!(pts.length > 1) || s < pts[0].s || s > pts[pts.length - 1].s) continue;
		let lo = 0, hi = pts.length - 2;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (pts[mid].s <= s) lo = mid;
			else hi = mid - 1;
		}
		const A = pts[lo], B = pts[lo + 1];
		const t = Math.min(1, Math.max(0, (s - A.s) / (B.s - A.s || 1)));
		const width = (RIB[A.kind] || RIB.hill) * M;
		const u = (lane * M) / width + 0.5;
		const vy = (p, c) => {
			const o = (c / (COLS - 1) - 0.5) * width;
			const x = p.x - p.dz * o, z = p.z + p.dx * o;
			const g = world.height(x, z);
			const br = p.bridge || 0, y = Math.max(g, p.y - 0.4) * (1 - br) + p.y * br + LIFT;
			return Math.max(y, g + LIFT);
		};
		if (u < 0 || u > 1) break;
		const fc = u * (COLS - 1), c = Math.min(COLS - 2, Math.floor(fc)), tu = fc - c;
		const ha = vy(A, c), hb = vy(A, c + 1), hd = vy(B, c), he = vy(B, c + 1);
		// the ribbon's triangles split on the b-d diagonal
		return tu + t <= 1 ? ha + (hb - ha) * tu + (hd - ha) * t : he + (hd - he) * (1 - tu) + (hb - he) * (1 - t);
	}
	const r = roads.road(s, lane, {});
	return r ? surfaceAt(roads, r.x, r.z) : 0;
}
// The same by position: the tarmac under (x, z) if a road is there, whatever stretch of the route it was laid
// for (coming back down from Gaurikund the route runs on the road laid on the way up, which roads.road(s)
// knows only by the outward s), else the ground.
const GRID = new WeakMap(), CELL = 2;
function grid(roads) {
	let g = GRID.get(roads);
	if (g) return g;
	g = new Map();
	roads.roads.forEach((pts, k) => pts.forEach((p, i) => {
		const key = Math.floor(p.x / CELL) * 100003 + Math.floor(p.z / CELL);
		if (!g.has(key)) g.set(key, []);
		g.get(key).push(k, i);
	}));
	GRID.set(roads, g);
	return g;
}
export function surfaceAt(roads, x, z) {
	const world = roads.world, g = grid(roads);
	const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
	let best = null;
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		const cell = g.get((cx + i) * 100003 + (cz + j));
		if (!cell) continue;
		for (let n = 0; n < cell.length; n += 2) {
			const pts = roads.roads[cell[n]], q = cell[n + 1];
			// the segment on either side of this point: where (x, z) falls along it and how far across
			for (const a of [q - 1, q]) {
				if (a < 0 || a >= pts.length - 1) continue;
				const A = pts[a], B = pts[a + 1];
				const ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez || 1e-9;
				const t = ((x - A.x) * ex + (z - A.z) * ez) / l2;
				if (t < -0.01 || t > 1.01) continue;
				const px = A.x + ex * t, pz = A.z + ez * t;
				const l = Math.sqrt(l2), o = ((x - px) * -ez + (z - pz) * ex) / l; // right of the road positive
				const width = (RIB[A.kind] || RIB.hill) * M;
				const u = o / width + 0.5;
				if (u < 0 || u > 1) continue;
				if (!best || Math.abs(o) < best.d) best = { d: Math.abs(o), A, B, t: Math.min(1, Math.max(0, t)), u, width };
			}
		}
	}
	if (!best) return world.height(x, z);
	const { A, B, t, u, width } = best;
	const vy = (p, c) => {
		const o = (c / (COLS - 1) - 0.5) * width;
		const gx = p.x - p.dz * o, gz = p.z + p.dx * o;
		const gy = world.height(gx, gz), br = p.bridge || 0;
		return Math.max(Math.max(gy, p.y - 0.4) * (1 - br) + p.y * br + LIFT, gy + LIFT);
	};
	const fc = u * (COLS - 1), c = Math.min(COLS - 2, Math.floor(fc)), tu = fc - c;
	const ha = vy(A, c), hb = vy(A, c + 1), hd = vy(B, c), he = vy(B, c + 1);
	return tu + t <= 1 ? ha + (hb - ha) * tu + (hd - ha) * t : he + (hd - he) * (1 - tu) + (hb - he) * (1 - t);
}
export { LEN };
// A parked vehicle of the given type, as a Batch in metres, for bus stands and dhabas.
// Parked, the lamps are off and there is no glow; and since scenery.js merges the parts as flat colours into
// its own batch, the glass and the painted signs get colours of their own.
export function parkedVehicle(type, R) {
	const k = MAKERS[type](R);
	k.parts = k.parts.filter((p) => p.slot !== "halo");
	for (const p of k.parts) {
		if (p.slot === "head" || p.slot === "tail") p.slot = "matte";
		else if (p.slot === "glass") p.c.setHex(0x1a222a);
		else if (p.slot === "decal") p.c.setHex(0xd2b45a);
	}
	k.count = k.parts.reduce((n, p) => n + p.geo.attributes.position.count, 0);
	return k;
}
// for the coaches the traveller rides (vehicles.js)
export { hull, sidePanel };
