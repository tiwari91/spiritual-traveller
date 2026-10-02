// The parts box for road vehicles: rounded body panels extruded from side profiles, tyres and rims turned on
// a lathe, tinted glass, chrome, lamps that light up after dark, and Indian number plates painted on a canvas.
// Everything is in metres. A Kit gathers shapes by material slot and builds them into one mesh with a group
// per material, so a whole truck or bus is a single object of a few draw calls. A Kit is also a Batch: its
// parts can still be merged, as flat colours, into a bigger roadside batch (scenery.js, roads.js).
import * as THREE from "three";
import { Batch, haze } from "./batch.js";

// ---------- materials ----------
// A soft sky above a bright horizon and dark ground, for the paint, the chrome and the glass to reflect.
function skyEnv() {
	const c = document.createElement("canvas");
	c.width = 256;
	c.height = 128;
	const g = c.getContext("2d");
	const gr = g.createLinearGradient(0, 0, 0, 128);
	gr.addColorStop(0, "#6f93b8");
	gr.addColorStop(0.36, "#b9cde0");
	gr.addColorStop(0.49, "#f4f1e8");
	gr.addColorStop(0.53, "#8d8577");
	gr.addColorStop(0.7, "#4a4036");
	gr.addColorStop(1, "#2a241e");
	g.fillStyle = gr;
	g.fillRect(0, 0, 256, 128);
	// a few soft clouds and a line of trees on the horizon, so a moving body shows the reflections move
	g.fillStyle = "rgba(255,255,255,0.35)";
	for (let i = 0; i < 9; i++) {
		g.beginPath();
		g.ellipse((i * 61) % 256, 22 + ((i * 37) % 30), 24, 6, 0, 0, Math.PI * 2);
		g.fill();
	}
	g.fillStyle = "rgba(60,72,52,0.55)";
	for (let x = 0; x < 256; x += 7) g.fillRect(x, 58 - ((x * 13) % 6), 6, 8 + ((x * 7) % 5));
	const t = new THREE.CanvasTexture(c);
	t.mapping = THREE.EquirectangularReflectionMapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
const ENV = typeof document !== "undefined" ? skyEnv() : null;
const std = (o) => haze(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, envMap: ENV }, o)));
// paint with a clear coat; dull plastics, rubber and canvas; chrome; dark tinted glass
export const PAINT = haze(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, envMap: ENV, envMapIntensity: 0.85 }));
// the same paint seen from inside too, for the traveller's own rides whose doors open
export const PAINT2 = haze(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, envMap: ENV, envMapIntensity: 0.85, side: THREE.DoubleSide }));
export const MATTE2 = std({ roughness: 0.85, envMapIntensity: 0.25, side: THREE.DoubleSide });
export const MATTE = std({ roughness: 0.85, envMapIntensity: 0.25 });
export const CHROME = std({ roughness: 0.16, metalness: 1, envMapIntensity: 1.1 });
export const GLASS = std({ vertexColors: false, color: 0x0d151d, roughness: 0.04, metalness: 0.55, envMapIntensity: 1.3 });
// see-through glass for the traveller's own rides, so the seats and the people inside show
export const GLASS_SEE = std({ vertexColors: false, color: 0x1a2731, roughness: 0.04, metalness: 0.4, envMapIntensity: 1.2, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
// lamps: lenses by day, lit after dark (emissiveIntensity, from 0 by day to about 2 at night)
export const HEAD = std({ roughness: 0.15, metalness: 0.3, envMapIntensity: 1.2, emissive: 0xfff0c8, emissiveIntensity: 0 });
export const TAIL = std({ roughness: 0.25, emissive: 0xff2a14, emissiveIntensity: 0 });
// The lamp materials, for main.js to light with the hour (vehicles.js adds them to WINDOW_GLOW).
export const LAMPS = [HEAD, TAIL];
// a soft glow round each lit lamp, seen from in front (or behind, for the tail lights)
function glowTex() {
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const g = c.getContext("2d");
	const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	gr.addColorStop(0, "rgba(255,255,255,1)");
	gr.addColorStop(0.25, "rgba(255,255,255,0.45)");
	gr.addColorStop(1, "rgba(255,255,255,0)");
	g.fillStyle = gr;
	g.fillRect(0, 0, 64, 64);
	return new THREE.CanvasTexture(c);
}
export const HALO = new THREE.MeshBasicMaterial({ vertexColors: true, map: ENV ? glowTex() : null, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
// After dark the sky in the paint fades and the glow round the lamps comes up, following the lamps.
let lastGlow = -1;
export function syncNight() {
	const k = Math.min(1, HEAD.emissiveIntensity / 2);
	if (k === lastGlow) return;
	lastGlow = k;
	const d = 1 - 0.85 * k;
	PAINT.envMapIntensity = PAINT2.envMapIntensity = 0.85 * d;
	CHROME.envMapIntensity = 1.1 * d;
	GLASS.envMapIntensity = 1.3 * d;
	GLASS_SEE.envMapIntensity = 1.2 * d;
	MATTE.envMapIntensity = 0.25 * d;
	HALO.opacity = k * 0.9;
	HALO.visible = k > 0.02;
}

// ---------- the plates and the painted signs: one canvas ----------
const AT = 1024;
export const PLATES = {
	// private cars: black on white
	mh: ["MH 12 AB 1234", 0], mh2: ["MH 14 CK 5821", 0], ka: ["KA 05 MN 2207", 0], ap: ["AP 39 BQ 7310", 0], ts: ["TS 09 EA 4471", 0], uk: ["UK 07 AE 3315", 0],
	// commercial: black on yellow
	taxi: ["AP 03 TX 4567", 1], jeep: ["UK 13 TA 2045", 1], auto: ["MH 12 RN 6602", 1], auto2: ["AP 03 TA 1196", 1],
	truck: ["MH 43 U 7781", 1], truck2: ["AP 21 Y 5502", 1], bus: ["MH 14 BT 3290", 1], bus2: ["AP 29 Z 0418", 1], bus3: ["UK 07 PA 1182", 1], tractor: ["MH 16 AJ 9087", 1],
};
const RECT = {}; // name -> [x, y, w, h] in canvas pixels
function plateCells() {
	let i = 0;
	for (const k of Object.keys(PLATES)) {
		RECT["plate:" + k] = [(i % 4) * 256, Math.floor(i / 4) * 64, 256, 64];
		i++;
	}
}
plateCells();
// signs: the truck's tailgate and side boards, the buses' route boards and side lettering, the taxi light
Object.assign(RECT, {
	tailgate: [0, 320, 512, 256], tailgate2: [512, 320, 512, 256],
	tside: [0, 576, 512, 128], tside2: [512, 576, 512, 128],
	crown: [0, 704, 512, 96], crown2: [512, 704, 512, 96],
	board: [0, 800, 512, 64], board2: [512, 800, 512, 64], board3: [0, 864, 512, 64],
	msrtc: [512, 864, 512, 48], apsrtc: [0, 928, 512, 48], uktc: [512, 928, 512, 48],
	taxisign: [0, 976, 256, 48], meter: [256, 976, 128, 48],
});
function paintAtlas(g) {
	g.fillStyle = "#808080";
	g.fillRect(0, 0, AT, AT);
	const font = (w, px, fam = "Arial, Helvetica, sans-serif") => `${w} ${px}px ${fam}`;
	// number plates, as the high-security plates are: a blue IND strip, a black border, block letters
	for (const [k, [text, yellow]] of Object.entries(PLATES)) {
		const [x, y, w, h] = RECT["plate:" + k];
		g.fillStyle = "#151515";
		g.fillRect(x, y, w, h);
		g.fillStyle = yellow ? "#f3c623" : "#f7f7f2";
		g.fillRect(x + 4, y + 4, w - 8, h - 8);
		g.fillStyle = "#1f4fa8";
		g.fillRect(x + 8, y + 8, 22, h - 16);
		g.fillStyle = "#fff";
		g.font = font(700, 9);
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillText("IND", x + 19, y + h - 16);
		g.beginPath();
		g.arc(x + 19, y + 22, 6, 0, Math.PI * 2);
		g.strokeStyle = "#e8e8e8";
		g.lineWidth = 1.5;
		g.stroke();
		g.fillStyle = "#111";
		g.font = font(700, 34, "'Arial Narrow', Arial, sans-serif");
		g.save();
		g.translate(x + w / 2 + 14, y + h / 2 + 2);
		g.scale(0.92, 1);
		g.fillText(text, 0, 0);
		g.restore();
	}
	// the tailgate: HORN OK PLEASE, USE DIPPER AT NIGHT, a lotus, the bands and the two painted lamps
	const tail = (rect, base, band, ink) => {
		const [x, y, w, h] = rect;
		g.fillStyle = base;
		g.fillRect(x, y, w, h);
		// plank seams
		g.fillStyle = "rgba(0,0,0,0.18)";
		for (let k = 1; k < 6; k++) g.fillRect(x, y + (h * k) / 6, w, 2);
		g.fillStyle = band;
		g.fillRect(x, y, w, 26);
		g.fillRect(x, y + h - 30, w, 30);
		g.fillStyle = "#f2f2ea";
		for (let i = 0; i < 16; i++) g.fillRect(x + i * 32 + 4, y + 8, 16, 10);
		// HORN OK PLEASE, in the painted lettering of the truck art
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillStyle = ink;
		g.font = font(900, 54, "Impact, 'Arial Black', Arial, sans-serif");
		g.fillText("HORN", x + w * 0.22, y + h * 0.42);
		g.fillText("PLEASE", x + w * 0.78, y + h * 0.42);
		// OK in a red circle, as painted
		g.fillStyle = "#d41f1f";
		g.beginPath();
		g.arc(x + w / 2, y + h * 0.42, 40, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = "#fff6c8";
		g.font = font(900, 40, "Impact, 'Arial Black', Arial, sans-serif");
		g.fillText("OK", x + w / 2, y + h * 0.43);
		g.fillStyle = ink;
		g.font = font(800, 24, "Arial, sans-serif");
		g.fillText("USE DIPPER AT NIGHT", x + w / 2, y + h * 0.68);
		g.font = font(700, 20, "Arial, sans-serif");
		g.fillText("बुरी नज़र वाले तेरा मुँह काला", x + w / 2, y + h * 0.8);
		// a lotus each side and the painted tail-lamp roundels
		for (const s of [0.07, 0.93]) {
			g.fillStyle = "#e0407a";
			for (let p = -2; p <= 2; p++) {
				g.beginPath();
				g.ellipse(x + w * s + p * 7, y + h * 0.68, 5, 16, p * 0.35, 0, Math.PI * 2);
				g.fill();
			}
			g.fillStyle = "#2a8a3a";
			g.fillRect(x + w * s - 14, y + h * 0.75, 28, 4);
		}
	};
	tail(RECT.tailgate, "#f0b81e", "#c4241c", "#1a2a7a");
	tail(RECT.tailgate2, "#2a62b8", "#e8a21c", "#fff2c8");
	// side boards: bands, a row of painted flowers and the transporter's name
	const side = (rect, base, band, ink, name) => {
		const [x, y, w, h] = rect;
		g.fillStyle = base;
		g.fillRect(x, y, w, h);
		g.fillStyle = "rgba(0,0,0,0.16)";
		for (let k = 1; k < 4; k++) g.fillRect(x, y + (h * k) / 4, w, 2);
		g.fillStyle = band;
		g.fillRect(x, y, w, 16);
		g.fillRect(x, y + h - 18, w, 18);
		for (let i = 0; i < 14; i++) {
			g.fillStyle = ["#e0407a", "#f2f2ea", "#2a8a3a", "#f08a1e"][i % 4];
			g.beginPath();
			g.arc(x + 18 + i * 37, y + h - 9, 5, 0, Math.PI * 2);
			g.fill();
		}
		g.fillStyle = ink;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = font(800, 30, "Arial, sans-serif");
		g.fillText(name, x + w / 2, y + h * 0.48);
	};
	side(RECT.tside, "#f0b81e", "#c4241c", "#1a2a7a", "SHREE GANESH ROADLINES");
	side(RECT.tside2, "#2a62b8", "#e8a21c", "#fff2c8", "JAI MATA DI TRANSPORT");
	// the crown over the cab: a painted panel with a mirror-work border
	const crown = (rect, base, ink, text) => {
		const [x, y, w, h] = rect;
		g.fillStyle = base;
		g.fillRect(x, y, w, h);
		g.fillStyle = "#f2f2ea";
		for (let i = 0; i < 24; i++) {
			g.beginPath();
			g.arc(x + 12 + i * 21.4, y + 9, 4, 0, Math.PI * 2);
			g.fill();
		}
		g.fillStyle = ink;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = font(800, 34, "Arial, sans-serif");
		g.fillText(text, x + w / 2, y + h * 0.6);
	};
	crown(RECT.crown, "#c4241c", "#fff2c8", "॥ जय माता दी ॥");
	crown(RECT.crown2, "#1f7a3a", "#fff2c8", "SHUBH YATRA");
	// the route boards over the windscreens
	const board = (rect, bg, ink, text) => {
		const [x, y, w, h] = rect;
		g.fillStyle = "#151515";
		g.fillRect(x, y, w, h);
		g.fillStyle = bg;
		g.fillRect(x + 4, y + 4, w - 8, h - 8);
		g.fillStyle = ink;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = font(800, 36, "Arial, sans-serif");
		g.fillText(text, x + w / 2, y + h / 2 + 2);
	};
	board(RECT.board, "#f6f2e6", "#151515", "पुणे  -  भीमाशंकर");
	board(RECT.board2, "#101010", "#ff9a1e", "TIRUPATI - TIRUMALA");
	board(RECT.board3, "#f6f2e6", "#151515", "ऋषिकेश - गौरीकुंड");
	const letter = (rect, ink, text) => {
		const [x, y, w, h] = rect;
		g.clearRect(x, y, w, h);
		g.fillStyle = "rgba(0,0,0,0)";
		g.fillRect(x, y, w, h);
		g.fillStyle = ink;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = font(800, 30, "Arial, sans-serif");
		g.fillText(text, x + w / 2, y + h / 2 + 2);
	};
	letter(RECT.msrtc, "#fff2c8", "महाराष्ट्र राज्य मार्ग परिवहन");
	letter(RECT.apsrtc, "#1a3a8a", "APSRTC  ఆంధ్ర ప్రదేశ్");
	letter(RECT.uktc, "#1a3a8a", "उत्तराखण्ड परिवहन निगम");
	// the taxi's roof light, and the fare meter's red digits
	{
		const [x, y, w, h] = RECT.taxisign;
		g.fillStyle = "#f3c623";
		g.fillRect(x, y, w, h);
		g.fillStyle = "#111";
		g.font = font(900, 34, "Arial, sans-serif");
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillText("TAXI", x + w / 2, y + h / 2 + 2);
		const [mx, my, mw, mh] = RECT.meter;
		g.fillStyle = "#1a1a1a";
		g.fillRect(mx, my, mw, mh);
		g.fillStyle = "#ff3a2a";
		g.font = font(700, 28, "'Courier New', monospace");
		g.fillText("23.00", mx + mw / 2, my + mh / 2 + 2);
	}
}
let ATLAS = null;
function atlas() {
	if (ATLAS) return ATLAS;
	const c = document.createElement("canvas");
	c.width = c.height = AT;
	paintAtlas(c.getContext("2d"));
	ATLAS = new THREE.CanvasTexture(c);
	ATLAS.colorSpace = THREE.SRGBColorSpace;
	ATLAS.anisotropy = 8;
	return ATLAS;
}
export const DECAL = haze(new THREE.MeshStandardMaterial({ map: typeof document !== "undefined" ? atlas() : null, roughness: 0.6, metalness: 0.05, alphaTest: 0.3 }));

// ---------- geometry helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// position, rotation (x, y, z, applied in YXZ order) and scale as one matrix
export function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
	_e.set(rx, ry, rz, "YXZ");
	return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}
// non-indexed, with normals; uv kept for the textured slots
export function prep(g) {
	const n = g.index ? g.toNonIndexed() : g;
	for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
	if (!n.attributes.normal) n.computeVertexNormals();
	return n;
}
// A shape from corner points [u, v, r]: each corner rounded with radius r (0 for a sharp one).
export function roundShape(pts, rDefault = 0) {
	const s = new THREE.Shape(), n = pts.length;
	for (let i = 0; i < n; i++) {
		const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
		let r = p[2] ?? rDefault;
		const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
		r = Math.min(r, la * 0.48, lb * 0.48);
		if (r < 1e-4) {
			if (i === 0) s.moveTo(p[0], p[1]);
			else s.lineTo(p[0], p[1]);
			continue;
		}
		const p0 = [p[0] + ((a[0] - p[0]) / la) * r, p[1] + ((a[1] - p[1]) / la) * r];
		const p1 = [p[0] + ((b[0] - p[0]) / lb) * r, p[1] + ((b[1] - p[1]) / lb) * r];
		if (i === 0) s.moveTo(p0[0], p0[1]);
		else s.lineTo(p0[0], p0[1]);
		s.quadraticCurveTo(p[0], p[1], p1[0], p1[1]);
	}
	s.closePath();
	return s;
}
// Points round an arc, centre (cu, cv), radius r, from angle a0 to a1, as sharp corners.
export function arc(cu, cv, r, a0, a1, n = 8) {
	const out = [];
	for (let k = 0; k <= n; k++) {
		const a = a0 + ((a1 - a0) * k) / n;
		out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r, 0]);
	}
	return out;
}
// Clip a polygon of [z, y, r] points to z0 <= z <= z1 (new corners sharp).
export function clipZ(pts, z0, z1) {
	const cut = (poly, keep, zc) => {
		const out = [];
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i], q = poly[(i + 1) % poly.length];
			const ip = keep(p[0]), iq = keep(q[0]);
			if (ip) out.push(p);
			if (ip !== iq) {
				const t = (zc - p[0]) / (q[0] - p[0]);
				out.push([zc, p[1] + (q[1] - p[1]) * t, 0]);
			}
		}
		return out;
	};
	return cut(cut(pts, (z) => z >= z0, z0), (z) => z <= z1, z1);
}
// A side profile in (z, y) extruded across x, centred on x = cx, `width` wide overall, edges rounded by `bevel`.
export function sideSlab(pts, width, bevel = 0.04, cx = 0, curve = 6) {
	const shape = pts instanceof THREE.Shape ? pts : roundShape(pts);
	const b = Math.min(bevel, width * 0.45);
	const depth = Math.max(0.001, width - 2 * b);
	const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: b > 0 ? 3 : 0, curveSegments: curve });
	g.rotateY(-Math.PI / 2);
	g.translate(cx + depth / 2, 0, 0);
	return prep(g);
}
// A cross-section in (x, y) extruded along z from z0 to z1, ends rounded by `bevel`.
export function longSlab(pts, z0, z1, bevel = 0.04, curve = 6, segs = 3) {
	const shape = pts instanceof THREE.Shape ? pts : roundShape(pts);
	const len = z1 - z0, b = Math.min(bevel, len * 0.45);
	const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, len - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: b > 0 ? segs : 0, curveSegments: curve });
	g.translate(0, 0, z0 + b);
	return prep(g);
}
// A rounded box: w by h by d, centred, edges rounded by r.
const RBOX = new Map();
export function rbox(w, h, d, r = 0.02) {
	const key = [w, h, d, r].map((x) => x.toFixed(3)).join();
	if (RBOX.has(key)) return RBOX.get(key);
	const g = longSlab([[-w / 2, -h / 2, r], [w / 2, -h / 2, r], [w / 2, h / 2, r], [-w / 2, h / 2, r]], -d / 2, d / 2, r, 2, 2);
	RBOX.set(key, g);
	return g;
}
// Turned about the y axis from [radius, y] points.
export const lathe = (pts, n = 20, a0 = 0, a = Math.PI * 2) => prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n, a0, a));
const CACHE = new Map();
const cached = (key, f) => (CACHE.has(key) ? CACHE.get(key) : (CACHE.set(key, f()), CACHE.get(key)));
export const BOX = prep(new THREE.BoxGeometry(1, 1, 1));
export const CYL = (n = 12) => cached("cyl" + n, () => prep(new THREE.CylinderGeometry(0.5, 0.5, 1, n)));
export const SPH = (n = 12) => cached("sph" + n, () => prep(new THREE.SphereGeometry(0.5, n, Math.max(4, n >> 1))));
export const DISC = (n = 16) => cached("disc" + n, () => prep(new THREE.CircleGeometry(0.5, n)));
export const QUAD = prep(new THREE.PlaneGeometry(1, 1));
// a domed lamp lens, turned: radius 0.5, its face towards +y
const LENS = lathe([[0.5, -0.3], [0.5, -0.1], [0.36, -0.02], [0, 0.04]], 18);

// ---------- the kit ----------
const SLOTS = ["paint", "paint2", "matte", "matte2", "chrome", "glass", "head", "tail", "decal", "halo"];
const MATS = { paint: PAINT, paint2: PAINT2, matte: MATTE, matte2: MATTE2, chrome: CHROME, glass: GLASS, see: GLASS_SEE, head: HEAD, tail: TAIL, decal: DECAL, halo: HALO };
export class Kit extends Batch {
	constructor(o = {}) {
		super();
		this.see = !!o.see; // see-through glass
	}
	// geo: a prepared geometry; m: a Matrix4; c: colour; slot: which material; uv: an atlas rect to map into
	add(geo, m, c = 0xffffff, slot = "paint", uv = null) {
		super.add(geo, m, c);
		const p = this.parts[this.parts.length - 1];
		p.slot = slot;
		p.uv = uv;
		return this;
	}
	box(x, y, z, w, h, d, c, slot = "paint", rx = 0, ry = 0, rz = 0) {
		return this.add(BOX, at(x, y, z, rx, ry, rz, w, h, d), c, slot);
	}
	rbox(x, y, z, w, h, d, r, c, slot = "paint", rx = 0, ry = 0, rz = 0) {
		return this.add(rbox(w, h, d, r), at(x, y, z, rx, ry, rz), c, slot);
	}
	// a cylinder of diameter dm and length l along "x", "y" or "z"
	cyl(x, y, z, dm, l, c, slot = "matte", axis = "y", n = 12) {
		const r = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
		return this.add(CYL(n), at(x, y, z, ...r, dm, l, dm), c, slot);
	}
	// a number plate, w by h, facing +z (or -z when back), from the atlas
	plate(name, x, y, z, w = 0.5, h = 0.12, back = false, ry = 0) {
		this.add(QUAD, at(x, y, z, 0, ry + (back ? Math.PI : 0), 0, w, h, 1), 0xffffff, "decal", RECT["plate:" + name] || RECT["plate:mh"]);
		return this;
	}
	sign(name, x, y, z, w, h, ry = 0, rx = 0) {
		return this.add(QUAD, at(x, y, z, rx, ry, 0, w, h, 1), 0xffffff, "decal", RECT[name]);
	}
	// a lamp facing +z (or -z when back): a round domed lens (w across) or a rounded oblong one (w by h),
	// and the glow round it after dark
	lamp(x, y, z, w, h, slot = "head", back = false, c = slot === "head" ? 0xf4f2ea : 0xc81810, round = false) {
		const d = back ? -1 : 1;
		if (round) this.add(LENS, at(x, y, z, (d * Math.PI) / 2, 0, 0, w, w * 0.5, w), c, slot);
		else this.add(rbox(w, h, 0.04, Math.min(w, h) * 0.3), at(x, y, z - d * 0.012), c, slot);
		const s = Math.max(w, h) * (slot === "head" ? 3.4 : 2.6);
		this.add(QUAD, at(x, y, z + d * 0.04, 0, back ? Math.PI : 0, 0, s, s, 1), slot === "head" ? 0xfff0c0 : 0xff3018, "halo");
		return this;
	}
	// One mesh, one group per material slot; the lamp glow is a child mesh of its own that casts no shadow.
	build() {
		const groups = new Map();
		for (const p of this.parts) {
			let s = p.slot || "paint";
			if (s === "glass" && this.see) s = "see";
			if (!groups.has(s)) groups.set(s, []);
			groups.get(s).push(p);
		}
		const halo = groups.get("halo");
		groups.delete("halo");
		const mesh = merge(groups, [...SLOTS, "see"]);
		mesh.castShadow = mesh.receiveShadow = true;
		mesh.onBeforeRender = syncNight;
		if (halo) {
			const h = merge(new Map([["halo", halo]]), ["halo"]);
			h.castShadow = h.receiveShadow = false;
			h.renderOrder = 2;
			mesh.add(h);
		}
		this.parts = [];
		this.count = 0;
		return mesh;
	}
}
function merge(groups, order) {
	let n = 0;
	for (const ps of groups.values()) for (const p of ps) n += p.geo.attributes.position.count;
	const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
	const g = new THREE.BufferGeometry();
	const mats = [];
	const v = new THREE.Vector3(), nm = new THREE.Matrix3();
	let o = 0;
	for (const s of order) {
		const ps = groups.get(s);
		if (!ps) continue;
		const start = o;
		for (const { geo, m, c, uv: rect } of ps) {
			nm.getNormalMatrix(m);
			const flip = m.determinant() < 0; // mirrored: keep the faces facing out
			const P = geo.attributes.position.array, N = geo.attributes.normal.array, U = geo.attributes.uv ? geo.attributes.uv.array : null;
			const nv = P.length / 3;
			for (let t = 0; t < nv; t++) {
				const k = flip ? t - (t % 3) + [0, 2, 1][t % 3] : t;
				const i = k * 3, j = k * 2;
				v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m);
				pos[o * 3] = v.x;
				pos[o * 3 + 1] = v.y;
				pos[o * 3 + 2] = v.z;
				v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize();
				nor[o * 3] = v.x;
				nor[o * 3 + 1] = v.y;
				nor[o * 3 + 2] = v.z;
				col[o * 3] = c.r;
				col[o * 3 + 1] = c.g;
				col[o * 3 + 2] = c.b;
				if (U) {
					if (rect) {
						uv[o * 2] = (rect[0] + U[j] * rect[2]) / AT;
						uv[o * 2 + 1] = 1 - (rect[1] + (1 - U[j + 1]) * rect[3]) / AT;
					} else {
						uv[o * 2] = U[j];
						uv[o * 2 + 1] = U[j + 1];
					}
				}
				o++;
			}
		}
		g.addGroup(start, o - start, mats.length);
		mats.push(MATS[s]);
	}
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
	g.setAttribute("color", new THREE.BufferAttribute(col, 3));
	g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	g.computeBoundingSphere();
	return new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats);
}

// ---------- wheels ----------
// A wheel about the x axis, centred on (x, y, z), radius r (to the tread), tyre width w; side +1 or -1 is
// the outward face. style: "alloy" (car), "steel" (truck and bus, a deep dish with nuts), "cover" (a plain
// hubcap), "auto" (small split rim), "lug" (tractor tread).
export function wheel(kit, x, y, z, r, w, side = 1, style = "alloy", rimC = 0xb8bcc0, n = 22) {
	const rb = r * (style === "lug" ? 0.66 : style === "steel" ? 0.6 : 0.68); // the bead: where tyre meets rim
	const hw = w / 2;
	const tyre = cached(`tyre${r.toFixed(3)}|${w.toFixed(3)}|${rb.toFixed(3)}|${n}`, () =>
		lathe([[rb, -hw * 0.92], [r * 0.9, -hw], [r * 0.975, -hw * 0.9], [r, -hw * 0.6], [r, hw * 0.6], [r * 0.975, hw * 0.9], [r * 0.9, hw], [rb, hw * 0.92], [rb * 0.98, 0], [rb, -hw * 0.92]], n));
	// lathe turns about y: lay it on its side so the axle runs along x
	const M0 = (dx = 0, sx = 1) => at(x + dx, y, z, 0, 0, -Math.PI / 2, 1, sx, 1);
	kit.add(tyre, M0(), 0x1e1e20, "matte");
	const out = side;
	if (style === "lug") {
		// the chevron lugs of a tractor tyre
		for (let k = 0; k < 18; k++) {
			const a = (k / 18) * Math.PI * 2;
			for (const s of [-1, 1]) kit.add(BOX, at(x + s * hw * 0.42, y + Math.cos(a) * r, z + Math.sin(a) * r, a, 0, 0, hw * 0.75, 0.05, 0.08).multiply(new THREE.Matrix4().makeRotationY(s * 0.5)), 0x1a1a1c, "matte");
		}
	}
	// the rim: a dish from the bead in to the hub, and a lip
	const dish = style === "steel" ? 0.32 : style === "auto" ? 0.1 : 0.18;
	const rim = cached(`rim${rb.toFixed(3)}|${hw.toFixed(3)}|${dish}|${n}`, () =>
		lathe([[0.001, hw * (0.62 - dish)], [rb * 0.3, hw * (0.62 - dish)], [rb * 0.42, hw * (0.6 - dish * 0.7)], [rb * 0.85, hw * 0.55], [rb * 1.02, hw * 0.75], [rb * 1.02, hw * 0.62], [rb * 0.98, -hw * 0.8], [rb * 0.7, -hw * 0.7], [0.001, -hw * 0.6]].reverse(), n));
	kit.add(rim, M0(0, out), style === "steel" ? rimC : rimC, style === "alloy" ? "chrome" : "paint");
	if (style === "alloy") {
		// five spokes over a dark centre
		kit.add(DISC(n), at(x + out * hw * (0.62 - dish) + out * 0.003, y, z, 0, (out * Math.PI) / 2, 0, rb * 1.9), 0x2a2c30, "matte");
		for (let k = 0; k < 5; k++) {
			const a = (k / 5) * Math.PI * 2;
			kit.add(BOX, at(x + out * hw * (0.64 - dish), y + Math.cos(a) * rb * 0.5, z + Math.sin(a) * rb * 0.5, a, 0, 0, 0.02, rb * 0.9, rb * 0.22), rimC, "chrome");
		}
		kit.add(CYL(14), at(x + out * hw * (0.64 - dish), y, z, 0, 0, Math.PI / 2, rb * 0.42, 0.03, rb * 0.42), 0xd8dade, "chrome");
	} else if (style === "cover") {
		kit.add(lathe([[0, 0.02], [rb * 0.5, 0.015], [rb * 0.95, 0]], n), at(x + out * hw * 0.5, y, z, 0, 0, -out * Math.PI / 2), 0xc4c8cc, "chrome");
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * Math.PI * 2;
			kit.add(BOX, at(x + out * (hw * 0.5 + 0.012), y + Math.cos(a) * rb * 0.68, z + Math.sin(a) * rb * 0.68, a, 0, 0, 0.004, rb * 0.22, rb * 0.08), 0x2a2c30, "matte");
		}
	} else {
		// the hub, and the wheel nuts round it
		const hz = x + out * hw * (0.64 - dish);
		kit.cyl(hz, y, z, rb * (style === "auto" ? 0.5 : 0.62), 0.05, style === "lug" ? rimC : 0x4a4c50, style === "lug" ? "paint" : "matte", "x", 14);
		const nn = style === "auto" ? 4 : 8;
		for (let k = 0; k < nn; k++) {
			const a = (k / nn) * Math.PI * 2;
			kit.cyl(hz + out * 0.03, y + Math.cos(a) * rb * 0.24, z + Math.sin(a) * rb * 0.24, 0.035, 0.03, 0xd0d2d4, "chrome", "x", 6);
		}
		if (style === "steel") for (let k = 0; k < 8; k++) {
			const a = ((k + 0.5) / 8) * Math.PI * 2;
			kit.add(DISC(10), at(x + out * hw * 0.42, y + Math.cos(a) * rb * 0.62, z + Math.sin(a) * rb * 0.62, 0, (out * Math.PI) / 2, 0, rb * 0.16), 0x18181a, "matte");
		}
	}
	return kit;
}
// A wheel arch: a black half ring over the wheel, standing proud of the body side, (x on the outer face).
export function archFlare(kit, x, y, z, r, w, c = 0x1c1c1e, slot = "matte", a = Math.PI) {
	const g = cached(`arch${r.toFixed(3)}|${w.toFixed(3)}|${a.toFixed(2)}`, () => {
		const s = new THREE.Shape();
		const t = 0.05;
		s.absarc(0, 0, r + t, 0, a, false);
		s.absarc(0, 0, r, a, 0, true);
		const e = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 10 });
		e.rotateY(-Math.PI / 2);
		return prep(e);
	});
	kit.add(g, at(x + w / 2, y, z, 0, 0, 0).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI - a) / 2)), c, slot);
	return kit;
}

// ---------- lofted bodies ----------
// A side outline in (z, y), sampled: span(z) is the lowest and highest y at z; ends(y) the rearmost and
// frontmost z at height y.
export class Outline {
	constructor(pts) {
		this.p = roundShape(pts).getPoints(10);
		this.zmin = Math.min(...this.p.map((q) => q.x));
		this.zmax = Math.max(...this.p.map((q) => q.x));
	}
	span(z) {
		let lo = Infinity, hi = -Infinity;
		const p = this.p;
		for (let i = 0; i < p.length; i++) {
			const a = p[i], b = p[(i + 1) % p.length];
			if ((a.x - z) * (b.x - z) > 0 || a.x === b.x) continue;
			const y = a.y + ((b.y - a.y) * (z - a.x)) / (b.x - a.x);
			lo = Math.min(lo, y);
			hi = Math.max(hi, y);
		}
		return lo <= hi ? [lo, hi] : null;
	}
	ends(y) {
		let lo = Infinity, hi = -Infinity;
		const p = this.p;
		for (let i = 0; i < p.length; i++) {
			const a = p[i], b = p[(i + 1) % p.length];
			if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
			const z = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
			lo = Math.min(lo, z);
			hi = Math.max(hi, z);
		}
		return lo <= hi ? [lo, hi] : null;
	}
}
// Stations along z for a loft: evenly every `step`, closer together near the ends, plus any given.
export function stations(z0, z1, step = 0.08, extra = []) {
	const zs = [];
	const n = Math.max(2, Math.ceil((z1 - z0) / step));
	for (let i = 0; i <= n; i++) zs.push(z0 + ((z1 - z0) * i) / n);
	for (const d of [0.004, 0.012, 0.025, 0.045, 0.07, 0.1, 0.14]) zs.push(z0 + d, z1 - d);
	for (const z of extra) if (z > z0 && z < z1) zs.push(z);
	zs.sort((a, b) => a - b);
	const out = [];
	for (const z of zs) if (!out.length || z - out[out.length - 1] > 0.003) out.push(z);
	out[0] = z0 + 0.002;
	out[out.length - 1] = z1 - 0.002;
	return out;
}
// A loft through cross-sections: ring(z) gives the half section (x >= 0) as [x, y] points, mirrored for the
// other side; classify(z, j, side) names the slot for the strip between half-section points j and j + 1 at
// the middle of each step (or null to leave it open); caps: { front, rear } slots to close the ends.
// Returns a Map of slot -> geometry, with smooth normals across the whole skin.
export function loft(zs, ring, classify, caps = {}) {
	const rows = zs.map((z) => ring(z));
	const N = rows[0].length - 1, C = 2 * N + 1;
	const pos = new Float32Array(zs.length * C * 3);
	for (let i = 0; i < zs.length; i++) for (let j = 0; j < C; j++) {
		const h = rows[i][j <= N ? j : 2 * N - j];
		pos.set([j <= N ? h[0] : -h[0], h[1], zs[i]], (i * C + j) * 3);
	}
	const idx = [], keys = [];
	for (let i = 0; i < zs.length - 1; i++) {
		const zm = (zs[i] + zs[i + 1]) / 2;
		for (let j = 0; j < C - 1; j++) {
			const hj = j < N ? j : 2 * N - j - 1;
			const key = classify(zm, hj, j < N ? 1 : -1);
			if (key == null) continue;
			const a = i * C + j, b = a + 1, c = a + C, d = c + 1;
			// mirrored half runs the other way round, so both wind outwards
			if (j < N) idx.push(a, b, c, b, d, c);
			else idx.push(a, b, c, b, d, c);
			keys.push(key, key);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const nor = g.attributes.normal.array;
	const out = new Map();
	const put = (key, P, Nn) => {
		if (!out.has(key)) out.set(key, { P: [], N: [] });
		const o = out.get(key);
		for (const v of P) o.P.push(v);
		for (const v of Nn) o.N.push(v);
	};
	for (let t = 0; t < keys.length; t++) {
		const P = [], Nn = [];
		for (let k = 0; k < 3; k++) {
			const v = idx[t * 3 + k];
			P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
			Nn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
		}
		put(keys[t], P, Nn);
	}
	// the end caps: a fan from the middle of the end ring, facing out along z
	for (const [end, key] of [["front", caps.front], ["rear", caps.rear]]) {
		if (!key) continue;
		const i = end === "front" ? zs.length - 1 : 0, want = end === "front" ? 1 : -1;
		let cx = 0, cy = 0;
		for (let j = 0; j < C; j++) {
			cx += pos[(i * C + j) * 3];
			cy += pos[(i * C + j) * 3 + 1];
		}
		cx /= C;
		cy /= C;
		const z = zs[i];
		for (let j = 0; j < C - 1; j++) {
			const p0 = [pos[(i * C + j) * 3], pos[(i * C + j) * 3 + 1], z], p1 = [pos[(i * C + j + 1) * 3], pos[(i * C + j + 1) * 3 + 1], z];
			const nz = (p0[0] - cx) * (p1[1] - cy) - (p0[1] - cy) * (p1[0] - cx);
			const tri = nz * want > 0 ? [cx, cy, z, ...p0, ...p1] : [cx, cy, z, ...p1, ...p0];
			put(key, tri, [0, 0, want, 0, 0, want, 0, 0, want]);
		}
	}
	const res = new Map();
	for (const [k, o] of out) {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.Float32BufferAttribute(o.P, 3));
		geo.setAttribute("normal", new THREE.Float32BufferAttribute(o.N, 3));
		res.set(k, geo);
	}
	return res;
}
// Half a cross-section: a superellipse from the bottom centre round the side (widest at ym) to the top centre.
// nLow and nTop set how square the lower and upper corners are.
export function section(hw, yb, yt, ym, nLow = 4.5, nTop = 3.2, n = 16) {
	const pts = [];
	for (let k = 0; k <= n; k++) {
		const th = -Math.PI / 2 + (Math.PI * k) / n;
		const c = Math.max(0, Math.cos(th)), s = Math.sin(th);
		const e = s < 0 ? nLow : nTop;
		const x = k === 0 || k === n ? 0 : hw * Math.pow(c, 2 / e);
		const y = s < 0 ? ym - (ym - yb) * Math.pow(-s, 2 / e) : ym + (yt - ym) * Math.pow(s, 2 / e);
		pts.push([x, y]);
	}
	return pts;
}
// The half-width of a body in plan at z: full width, with the corners rounded to radius rc at each end.
export function planWidth(hw, z0, z1, rcF = 0.3, rcR = 0.25) {
	return (z) => {
		const df = z1 - z, dr = z - z0;
		let w = hw;
		if (df < rcF) w = hw - rcF + Math.sqrt(Math.max(0, rcF * rcF - (rcF - df) ** 2));
		if (dr < rcR) w = Math.min(w, hw - rcR + Math.sqrt(Math.max(0, rcR * rcR - (rcR - dr) ** 2)));
		return w;
	};
}

// ---------- car bodies ----------
// The side profiles of a car, in (z, y) metres, from a few dimensions:
// L, W, H; sill (bottom of the body), waist (bottom of the side glass), nose (top of the front, where the
// bonnet starts), cowl (the bonnet at the windscreen), zA (foot of the windscreen), zW (top of it), zR (back
// of the roof), zT (foot of the rear glass), tail ("hatch", "notch" for a sedan's boot, "box" for upright),
// axles [front z, rear z], r (wheel radius), gi (how far the glass sits in from the body side).
export function carProfiles(S) {
	const zf = S.L / 2, zr = -S.L / 2, ra = S.r + (S.arch ?? 0.07);
	const [af, ar] = S.axles;
	const archAt = (zc) => [[zc - ra, S.sill, 0.03], ...arc(zc, S.r + 0.03, ra, Math.PI, 0, 14).slice(1, -1), [zc + ra, S.sill, 0.03]];
	const fr = S.frontR ?? 0.14, top = S.tail === "box" ? S.waist + 0.02 : S.waist + (S.tail === "notch" ? 0.06 : 0.02);
	const lower = [
		[zr + 0.02, S.sill + 0.14, 0.1],
		[zr + 0.2, S.sill, 0.06],
		...archAt(ar),
		...archAt(af),
		[zf - 0.16, S.sill, 0.08],
		[zf, S.sill + 0.16, 0.1],
		[zf + 0.01, S.nose - 0.18, fr],
		[zf - (S.noseBack ?? 0.1), S.nose, fr],
		[S.zA, S.cowl, 0.05],
		...(S.tail === "notch" ? [[S.zT, S.waist + 0.01, 0.05], [zr + 0.06, top, 0.08]] : [[zr + 0.04, top, 0.04]]),
		[zr, S.waist - 0.22, 0.1],
	];
	const rearFoot = S.tail === "notch" ? S.zT : zr + (S.tail === "box" ? 0.035 : 0.1);
	const green = [
		[S.zA + 0.03, S.waist - 0.1, 0],
		[S.zA, S.cowl - 0.02, 0],
		[S.zW, S.H, S.screenR ?? 0.1],
		[S.zR, S.H, S.rearR ?? 0.12],
		[rearFoot, S.waist - 0.02, 0],
		[rearFoot + 0.03, S.waist - 0.1, 0],
	];
	return { lower, green, zf, zr, ra, rearFoot };
}
// The lofted skin of a car: the lower body and the greenhouse, sorted into slots. part(z, j, side, which,
// slot) may rename a slot (which is "lower" or "green") or open a hole (null), for doors and open cabins.
export function carSkin(S, o = {}, part = null) {
	const P = carProfiles(S);
	const lo = new Outline(P.lower), gr = new Outline(P.green);
	const hw = S.W / 2, gi = S.gi ?? 0.07, N = o.n ?? 16, Ng = 4, Nc = 4, Nt = 6;
	const plan = planWidth(hw, lo.zmin, lo.zmax, S.cornerF ?? 0.32, S.cornerR ?? 0.24);
	const paint = o.paintSlot ?? "paint";
	const extra = [...S.axles.flatMap((z) => [-0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85].map((k) => z + k * P.ra)), ...S.axles.flatMap((z) => [z - P.ra - 0.005, z + P.ra + 0.005]), S.zA, ...(o.cuts || [])];
	const lowerRing = (z) => {
		const [yb, yt] = lo.span(z) || [S.sill, S.sill + 0.01];
		const ym = yb + (yt - yb) * (S.shoulder ?? 0.68);
		return section(plan(z), yb, yt, ym, S.nLow ?? 6, S.nTop ?? 3.6, N);
	};
	const nb = Math.round(N * 0.22); // the bottom strips: the sills, black on a jeep
	const lower = loft(stations(lo.zmin, lo.zmax, o.step ?? 0.07, extra), lowerRing, (z, j, side) => {
		const def = o.cladding && j < nb ? "matte" : paint;
		return part ? part(z, j, side, "lower", def) : def;
	}, { front: paint, rear: paint });
	// the greenhouse: the side glass leaning in, round the roof rail, across the roof
	const rr = S.railR ?? 0.07, tumble = S.tumble ?? 0.1;
	const greenRing = (z) => {
		const [gb, gt] = gr.span(z) || [S.waist, S.waist + 0.001];
		const xb = plan(Math.min(z, S.zA)) - gi;
		const h = Math.max(0.002, gt - gb);
		const xt = xb - tumble * Math.min(1, h / Math.max(0.01, S.H - S.waist));
		const r = Math.min(rr, h * 0.45, xt * 0.5);
		const pts = [];
		for (let k = 0; k <= Ng; k++) {
			const t = k / Ng;
			pts.push([xb + (xt - xb) * t, gb + (gt - r - gb) * t]);
		}
		for (let k = 1; k <= Nc; k++) {
			const a = (k / Nc) * (Math.PI / 2);
			pts.push([xt - r + Math.cos(a) * r, gt - r + Math.sin(a) * r]);
		}
		for (let k = 1; k <= Nt; k++) {
			const t = k / Nt;
			const x = (xt - r) * (1 - t);
			pts.push([x, gt + (S.crown ?? 0.025) * (1 - (x / Math.max(0.01, xt)) ** 2)]);
		}
		return pts;
	};
	const pillars = S.pillars || [];
	const green = loft(stations(gr.zmin, gr.zmax, o.gstep ?? 0.05, [S.zW, S.zR, ...pillars.flatMap((p) => [p[0], p[1]]), ...(o.cuts || [])]), greenRing, (z, j, side) => {
		let k;
		if (j >= Ng && j < Ng + Nc) k = z > S.zW - 0.02 || z < S.zR + 0.02 ? (S.blackPillars ? "matte" : paint) : S.roofSlot ?? paint; // roof rail, A- and D-pillars
		else if (j >= Ng + Nc) k = z > S.zW || z < S.zR ? "glass" : S.roofSlot ?? paint; // windscreen, roof, rear glass
		else {
			k = "glass";
			if (z > S.zA - 0.1) k = paint; // the foot of the A-pillar
			for (const [z0, z1, slot] of pillars) if (z > z0 && z < z1) k = slot === "paint" ? paint : slot;
		}
		return part ? part(z, j, side, "green", k) : k;
	}, S.tail === "box" ? { rear: "glass" } : {});
	// where the skin is: the side at (z, y), and the front and back faces at (x, y)
	const sideX = (z, y) => {
		const r = lowerRing(z);
		for (let k = 0; k < r.length - 1; k++) if (r[k][1] <= y && r[k + 1][1] >= y) return r[k][0] + ((r[k + 1][0] - r[k][0]) * (y - r[k][1])) / (r[k + 1][1] - r[k][1] || 1);
		return plan(z);
	};
	const endZ = (x, y, front) => {
		const e = lo.ends(y) || [lo.zmin, lo.zmax];
		const rc = front ? S.cornerF ?? 0.32 : S.cornerR ?? 0.24, ax = Math.abs(x) - (hw - rc);
		const back = ax > 0 ? rc - Math.sqrt(Math.max(0, rc * rc - ax * ax)) : 0;
		return front ? e[1] - back : e[0] + back;
	};
	return { P, lo, gr, plan, lower, green, Ng, Nc, Nt, zf: P.zf, zr: P.zr, ra: P.ra, sideX, endZ, lowerRing };
}
// A whole car, solid (for traffic and parked cars): lofted body, greenhouse with tinted glass and pillars,
// lights, grille, bumpers, mirrors, door seams, handles, plates and wheels.
export function carBody(kit, S, o = {}) {
	const sk = carSkin(S, o);
	const paint = o.paint ?? 0xf2f2ee;
	for (const m of [sk.lower, sk.green]) for (const [slot, g] of m) kit.add(g, at(), slot === "glass" ? 0xffffff : slot === "matte" ? o.clad ?? 0x1c1c1e : paint, slot);
	carDressing(kit, S, sk, o);
	return sk;
}
// Everything but the skin, shared by the traffic cars and the traveller's taxi and jeep: lamps, grille,
// bumpers, mirrors, door seams, handles, plates, arch liners and wheels.
// o: { paint, plate, grille: "mouth" | "chrome" | "bolero" | "innova", lampW, lampH, lampY, roundLamps,
// tailW, tailH, tailY, wheel, rim, noWheels, noMirrors }
export function carDressing(kit, S, sk, o = {}) {
	const hw = S.W / 2, paint = o.paint ?? 0xf2f2ee;
	const black = 0x161618;
	const front = (x, y) => sk.endZ(x, y, true), back = (x, y) => sk.endZ(x, y, false);
	for (const sx of [-1, 1]) {
		// door seams, following the curve of the side, and the handles
		for (const zs of S.seams || []) {
			const y0 = S.sill + 0.07, y1 = S.waist - 0.03, n = 5;
			for (let k = 0; k < n; k++) {
				const ya = y0 + ((y1 - y0) * k) / n, yb = y0 + ((y1 - y0) * (k + 1)) / n;
				const xa = sk.sideX(zs, ya), xb = sk.sideX(zs, yb);
				const sp = sk.lo.span(zs);
				if (sp && ya < sp[0] + 0.02) continue; // not across a wheel arch
				kit.add(BOX, at(sx * ((xa + xb) / 2 + 0.002), (ya + yb) / 2, zs, 0, 0, -sx * Math.atan2(xb - xa, yb - ya), 0.006, Math.hypot(xb - xa, yb - ya) + 0.004, 0.008), 0x0a0a0b, "matte");
			}
		}
		for (const zh of S.handles || []) {
			const y = S.waist - 0.085;
			kit.add(rbox(0.024, 0.032, 0.16, 0.012), at(sx * (sk.sideX(zh, y) + 0.01), y, zh), o.chromeHandles ? 0xd8dade : paint, o.chromeHandles ? "chrome" : "paint");
		}
		// the mirror on its stalk at the foot of the A-pillar
		if (!o.noMirrors) {
			const mz = S.zA - 0.17, my = S.waist + 0.09, mx = sk.plan(mz) - 0.06;
			kit.add(rbox(0.08, 0.035, 0.07, 0.012), at(sx * (mx + 0.02), my - 0.04, mz), black, "matte");
			kit.add(rbox(0.07, 0.13, 0.19, 0.035), at(sx * (mx + 0.09), my + 0.02, mz, 0, sx * 0.14, 0), o.mirrorBlack ? black : paint, o.mirrorBlack ? "matte" : "paint");
			kit.add(QUAD, at(sx * (mx + 0.09), my + 0.02, mz - 0.098, 0, Math.PI + sx * 0.14, 0, 0.15, 0.1, 1), 0xb8c4cc, "chrome");
		}
		// the headlamp in its dark housing, and the amber indicator beside it
		const ly = o.lampY ?? S.nose - 0.1, lx = sx * (hw - (o.lampIn ?? 0.25));
		const lz = front(lx, ly);
		const yaw = sx * Math.min(0.5, Math.max(0, (Math.abs(lx) - (hw - (S.cornerF ?? 0.32))) * 2.2));
		if (o.roundLamps) {
			kit.add(CYL(20), at(lx, ly, lz - 0.02, Math.PI / 2, 0, 0, 0.22, 0.05, 0.22), 0xd0d4d8, "chrome");
			kit.lamp(lx, ly, lz + 0.006, 0.18, 0.18, "head", false, undefined, true);
		} else {
			const w = o.lampW ?? 0.32, h = o.lampH ?? 0.11;
			kit.add(rbox(w + 0.03, h + 0.03, 0.06, Math.min(w, h) * 0.4), at(lx, ly, lz - 0.025, 0, yaw, 0), black, "matte");
			kit.add(rbox(w, h, 0.03, Math.min(w, h) * 0.35), at(lx, ly, lz - 0.004, 0, yaw, 0), 0xc9d2da, "head");
			kit.add(DISC(16), at(lx - sx * w * 0.22, ly + h * 0.05, lz + 0.016, 0, yaw, 0, h * 0.62), 0xc4ccd4, "chrome"); // the projector
			kit.add(QUAD, at(lx, ly, lz + 0.05, 0, 0, 0, w * 2.6, w * 2.6, 1), 0xfff0c0, "halo");
			kit.add(rbox(w * 0.85, 0.018, 0.02, 0.008), at(lx + sx * 0.02, ly - h * 0.38, lz + 0.01, 0, yaw, 0), 0xf6f6ff, "head"); // the daytime running strip
		}
		const iy = ly - (o.roundLamps ? 0.16 : 0.12), ix = lx + sx * 0.06;
		kit.add(rbox(0.07, 0.035, 0.03, 0.012), at(ix, iy, front(ix, iy) - 0.005, 0, yaw, 0), 0xf08a1e, "matte");
		// the tail lamp, wrapped round the corner
		const ty = o.tailY ?? S.waist - 0.1, tx = sx * (hw - 0.13), tw = o.tailW ?? 0.26, th = o.tailH ?? 0.14;
		const tz = back(tx, ty);
		const tyaw = sx * Math.min(0.6, Math.max(0, (Math.abs(tx) - (hw - (S.cornerR ?? 0.24))) * 2.5));
		kit.add(rbox(tw, th, 0.04, 0.03), at(tx, ty, tz + 0.006, 0, -tyaw, 0), 0xc01810, "tail");
		kit.add(rbox(tw * 0.35, th * 0.4, 0.02, 0.01), at(tx - sx * tw * 0.2, ty - th * 0.15, tz - 0.012, 0, -tyaw, 0), 0xf2f2f2, "matte");
		kit.add(QUAD, at(tx, ty, tz - 0.04, 0, Math.PI, 0, tw * 2.2, tw * 2.2, 1), 0xff3018, "halo");
		// black liners in the wheel arches
		for (const z of S.axles) archFlare(kit, sx * (hw - 0.16), S.r + 0.03, z, sk.ra - 0.015, 0.26, 0x101012);
	}
	// the grille
	const gy = o.grilleY ?? S.nose - 0.14, gz = front(0, gy);
	if (o.grille === "chrome") {
		kit.add(rbox(S.W * 0.42, 0.16, 0.05, 0.05), at(0, gy, gz - 0.02), black, "matte");
		for (let k = 0; k < 3; k++) kit.add(rbox(S.W * 0.4, 0.016, 0.03, 0.007), at(0, gy + 0.05 - k * 0.05, gz + 0.004), 0xdadde0, "chrome");
	} else if (o.grille === "innova") {
		// the big trapezoid grille of the Crysta, in chrome bars
		kit.add(rbox(S.W * 0.5, 0.26, 0.05, 0.06), at(0, gy - 0.04, gz - 0.02), black, "matte");
		for (let k = 0; k < 5; k++) kit.add(rbox(S.W * (0.48 - k * 0.02), 0.022, 0.03, 0.009), at(0, gy + 0.06 - k * 0.05, front(0, gy + 0.06 - k * 0.05) + 0.002), 0xdadde0, "chrome");
	} else if (o.grille === "bolero") {
		kit.add(rbox(S.W * 0.44, 0.2, 0.04, 0.02), at(0, gy, gz - 0.012), 0xc8ccd0, "chrome");
		for (let k = -6; k <= 6; k++) kit.add(BOX, at(k * 0.055, gy, gz + 0.01, 0, 0, 0, 0.022, 0.16, 0.01), 0x161618, "matte");
	} else {
		kit.add(rbox(S.W * 0.4, 0.09, 0.05, 0.04), at(0, gy, gz - 0.02), black, "matte");
		kit.add(rbox(S.W * 0.34, 0.012, 0.02, 0.005), at(0, gy + 0.03, gz + 0.003), 0xdadde0, "chrome");
	}
	// the lower air intake, the bumpers' black lips, the plates
	const ay = S.sill + 0.13;
	kit.add(rbox(S.W * 0.5, 0.1, 0.05, 0.04), at(0, ay, front(0, ay) - 0.018), black, "matte");
	for (const sx of [-1, 1]) kit.add(DISC(14), at(sx * (hw - 0.3), ay, front(sx * (hw - 0.3), ay) + 0.003, 0, 0, 0, 0.07), 0xdfe2e4, "chrome"); // fog lamps
	kit.add(rbox(S.W - 0.16, 0.05, 0.1, 0.025), at(0, S.sill + 0.03, front(0, S.sill + 0.05) - 0.06), black, "matte");
	kit.add(rbox(S.W - 0.16, 0.06, 0.1, 0.025), at(0, S.sill + 0.05, back(0, S.sill + 0.07) + 0.06), black, "matte");
	const py = o.plateY ?? S.sill + 0.25, ry = o.rearPlateY ?? S.sill + 0.34;
	kit.plate(o.plate ?? "mh", 0, py, front(0, py) + 0.006, 0.5, 0.11);
	kit.plate(o.plate ?? "mh", 0, ry, back(0, ry) - 0.006, 0.5, 0.11, true);
	// the wheels (left off when the wheels turn on their own)
	if (!o.noWheels) for (const sx of [-1, 1]) for (const z of S.axles) wheel(kit, sx * (hw - (S.tyreW ?? 0.2) / 2 - 0.03), S.r, z, S.r, S.tyreW ?? 0.2, sx, o.wheel ?? "alloy", o.rim ?? 0xb8bcc0, o.wheelN ?? 22);
}
