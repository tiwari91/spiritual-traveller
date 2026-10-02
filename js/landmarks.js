// Stylised shrines. Each is built facing local +z, then turned to face its real direction.
// One world unit is about 2.6 km, so the temples are drawn far larger than life to read on the map.
import * as THREE from "three";
import { SHRINES, toWorld } from "./geo.js";
import { rand } from "./util.js";

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o));
export const GOLD = std(0xe2a93a, { metalness: 0.55, roughness: 0.32, emissive: 0x6b4508, emissiveIntensity: 0.45 });
// Lamps glow at night; main.js sets emissiveIntensity from the hour.
export const LAMP = std(0xffd28a, { emissive: 0xffa640, emissiveIntensity: 0.2, roughness: 0.5 });

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	m.castShadow = true;
	m.receiveShadow = true;
	if (parent) parent.add(m);
	return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// A tower surface of revolution with a shaped plan. profile(t) gives radius at height t (0..1);
// plan(theta, t) scales that radius around the ring.
function tower(H, profile, plan, segs = 96, rings = 48) {
	const pos = [], idx = [];
	for (let r = 0; r <= rings; r++) {
		const t = r / rings;
		const rad = profile(t);
		for (let s = 0; s <= segs; s++) {
			const th = (s / segs) * Math.PI * 2;
			const k = plan(th, t) * rad;
			pos.push(Math.sin(th) * k, t * H, Math.cos(th) * k);
		}
	}
	const row = segs + 1;
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segs; s++) {
			const a = r * row + s, b = a + 1, c = a + row, d = c + 1;
			idx.push(a, b, c, b, d, c);
		}
	}
	// cap
	const top = pos.length / 3;
	pos.push(0, H, 0);
	for (let s = 0; s < segs; s++) idx.push(rings * row + s, rings * row + s + 1, top);
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}
// Square plan: radius to the middle of each side is 1.
const square = (th) => 1 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
// Square plan with stepped projections (rathas), as on a Nagara temple.
function ratha(th) {
	const c = Math.cos(th), s = Math.sin(th);
	const m = Math.max(Math.abs(c), Math.abs(s));
	const u = (Math.abs(c) > Math.abs(s) ? s : c) / m; // position along the side, -1..1
	const off = Math.abs(u) < 0.3 ? 0.14 : Math.abs(u) < 0.62 ? 0.07 : 0;
	return (1 / m) * (1 + off);
}
const round = () => 1;

function kalash(parent, y, s = 1, mat = GOLD) {
	const pts = [[0, 0], [0.12, 0], [0.16, 0.06], [0.14, 0.14], [0.06, 0.2], [0.05, 0.26], [0.09, 0.3], [0.03, 0.36], [0.01, 0.46], [0, 0.48]].map((p) => new THREE.Vector2(p[0] * s, p[1] * s));
	return mesh(new THREE.LatheGeometry(pts, 20), mat, 0, y, 0, parent);
}
function amalaka(parent, y, r, mat) {
	const g = tower(r * 0.55, (t) => r * (0.62 + 0.38 * Math.sin(t * Math.PI)), (th) => 1 + 0.07 * Math.cos(th * 28), 112, 10);
	return mesh(g, mat, 0, y, 0, parent);
}
function flag(parent, x, y, z, color = 0xff8a1e) {
	mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), std(0x6b4a2a), x, y + 0.3, z, parent);
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.6, 0, 0, 0.36, 0, 0.42, 0.5, 0], 3));
	g.computeVertexNormals();
	const f = mesh(g, std(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }), x, y, z, parent);
	f.userData.flag = true;
	return f;
}
function lamp(parent, x, y, z, r = 0.06) {
	return mesh(new THREE.SphereGeometry(r, 10, 8), LAMP, x, y, z, parent);
}

// Mountain with snow above a line, drawn with vertex colours.
function peak(r, h, seed, snowLine = 0.45, rock = 0x6b6259) {
	const g = new THREE.ConeGeometry(r, h, 9, 6);
	const R = rand(seed);
	const p = g.attributes.position;
	const col = [];
	const rc = new THREE.Color(rock), sc = new THREE.Color(0xf4f7fb), gc = new THREE.Color(0x56603f);
	for (let i = 0; i < p.count; i++) {
		const y = p.getY(i);
		const t = (y + h / 2) / h;
		if (t < 0.99) {
			const j = (1 - t) * 0.22 * r;
			p.setX(i, p.getX(i) + (R() - 0.5) * j);
			p.setZ(i, p.getZ(i) + (R() - 0.5) * j);
			p.setY(i, y + (R() - 0.5) * h * 0.05);
		}
		const c = t > snowLine + (R() - 0.5) * 0.12 ? sc : t < 0.12 ? gc : rc;
		col.push(c.r, c.g, c.b);
	}
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.computeVertexNormals();
	g.translate(0, h / 2, 0);
	const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
	m.receiveShadow = true;
	return m;
}

function canvasTex(w, h, draw) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}
export const glowTexture = (() => {
	let t;
	return () => {
		if (t) return t;
		t = canvasTex(64, 64, (g, w) => {
			const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
			gr.addColorStop(0, "rgba(255,255,255,1)");
			gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
			gr.addColorStop(1, "rgba(255,255,255,0)");
			g.fillStyle = gr;
			g.fillRect(0, 0, w, w);
		});
		return t;
	};
})();
function arch(g, x, y, w, h) {
	g.beginPath();
	g.moveTo(x, y + h);
	g.lineTo(x, y + w / 2);
	g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
	g.lineTo(x + w, y + h);
	g.closePath();
}
// The Badrinath facade: a tall front painted in bands of red, blue, green and yellow around arched openings.
function badriFacade() {
	return canvasTex(448, 512, (g, W, H) => {
		g.fillStyle = "#f4ead4";
		g.fillRect(0, 0, W, H);
		const bands = ["#c8302b", "#2459b8", "#f0c02e", "#2f8a4a"];
		// pilasters
		for (let i = 0; i < 6; i++) {
			const x = [0, 34, 130, 290, 386, 420][i];
			for (let k = 0; k < 4; k++) {
				g.fillStyle = bands[(k + i) % 4];
				g.fillRect(x + k * 7, 40, 7, H - 40);
			}
		}
		// cornices
		for (let k = 0; k < 4; k++) {
			g.fillStyle = bands[k];
			g.fillRect(0, k * 9, W, 9);
			g.fillRect(0, 150 + k * 7, W, 7);
			g.fillRect(0, 330 + k * 7, W, 7);
		}
		// row of small arches under the top cornice
		for (let i = 0; i < 12; i++) {
			arch(g, 10 + i * 36, 48, 26, 70);
			g.fillStyle = i % 2 ? "#2f8a4a" : "#c8302b";
			g.fill();
			arch(g, 15 + i * 36, 56, 16, 56);
			g.fillStyle = "#f0c02e";
			g.fill();
		}
		// side windows
		for (const x of [66, 322]) {
			for (const y of [190, 360]) {
				arch(g, x - 6, y - 6, 72, 130);
				g.fillStyle = "#c8302b";
				g.fill();
				arch(g, x, y, 60, 118);
				g.fillStyle = "#2459b8";
				g.fill();
				arch(g, x + 14, y + 18, 32, 92);
				g.fillStyle = "#1d2440";
				g.fill();
			}
		}
		// central gateway
		arch(g, 160, 180, 128, 332);
		g.fillStyle = "#e0a530";
		g.fill();
		arch(g, 170, 192, 108, 320);
		g.fillStyle = "#c8302b";
		g.fill();
		arch(g, 184, 210, 80, 302);
		g.fillStyle = "#2a1a12";
		g.fill();
		g.fillStyle = "#f0c02e";
		for (let i = 0; i < 9; i++) g.fillRect(150 + i * 17, 168, 8, 8);
	});
}
// Gopuram tier: rows of niches with pilasters in lime white.
function gopuramTier() {
	return canvasTex(256, 64, (g, W, H) => {
		g.fillStyle = "#f2ecdf";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#d9cfbb";
		g.fillRect(0, 0, W, 8);
		g.fillRect(0, H - 6, W, 6);
		for (let i = 0; i < 8; i++) {
			const x = 6 + i * 32;
			arch(g, x + 6, 14, 18, 40);
			g.fillStyle = "#8f8473";
			g.fill();
			g.fillStyle = "#c4b8a2";
			g.fillRect(x, 12, 3, 44);
		}
	});
}

function kedarnath(world) {
	const g = new THREE.Group();
	const stone = std(0x8d8b86), stoneL = std(0xa3a19b), dark = std(0x403c38);
	mesh(box(2.3, 0.3, 3.4), stoneL, 0, 0.15, 0, g);
	// sanctum and its stepped shikhara
	mesh(box(1.4, 1.3, 1.4), stone, 0, 0.95, -0.85, g);
	const sh = tower(1.7, (t) => 0.74 * (1 - 0.62 * (Math.floor(t * 8) / 8)) * (t * 8 - Math.floor(t * 8) > 0.75 ? 0.95 : 1), square, 64, 64);
	mesh(sh, stone, 0, 1.6, -0.85, g);
	mesh(box(0.42, 0.08, 0.42), stoneL, 0, 3.32, -0.85, g);
	amalaka(g, 3.35, 0.2, stoneL).position.z = -0.85;
	kalash(g, 3.46, 0.7).position.z = -0.85;
	flag(g, 0.18, 3.4, -0.85);
	// mandapa with pyramidal slate roof
	mesh(box(1.9, 1.05, 1.7), stone, 0, 0.82, 0.55, g);
	const roof = mesh(new THREE.ConeGeometry(1.42, 0.7, 4, 1), std(0x6d6a66), 0, 1.7, 0.55, g);
	roof.rotation.y = Math.PI / 4;
	roof.scale.z = 0.9;
	// front portico with a gable over the door
	const tri = new THREE.Shape([new THREE.Vector2(-0.62, 0), new THREE.Vector2(0.62, 0), new THREE.Vector2(0, 0.5)]);
	mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false }), stoneL, 0, 1.35, 1.3, g);
	mesh(box(1.3, 1.05, 0.32), stoneL, 0, 0.82, 1.45, g);
	mesh(box(0.42, 0.72, 0.05), dark, 0, 0.66, 1.62, g);
	// Nandi faces the door
	const nandi = new THREE.Group();
	mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), dark, 0, 0.18, 0, nandi).rotation.x = Math.PI / 2;
	mesh(new THREE.SphereGeometry(0.11, 12, 10), dark, 0, 0.32, -0.26, nandi);
	nandi.position.set(0, 0.3, 2.45);
	g.add(nandi);
	mesh(box(0.7, 0.12, 0.9), stoneL, 0, 0.36, 2.45, g).position.y = 0.06;
	// Bhim Shila, the boulder behind the temple
	const rock = mesh(new THREE.IcosahedronGeometry(0.55, 0), std(0x6f675e, { flatShading: true }), 0.1, 0.35, -2.5, g);
	rock.scale.set(1.3, 0.75, 0.9);
	for (const x of [-0.75, 0.75]) lamp(g, x, 1.0, 1.66, 0.05);
	lamp(g, 0, 1.25, 1.66, 0.05);
	// snow peaks: Kedarnath and Kedar Dome behind, ridges on both sides
	const peaks = [[-5, -30, 10, 22, 1], [10, -38, 13, 26, 2], [24, -26, 9, 17, 3], [-22, -22, 9, 16, 4], [-30, -6, 8, 13, 5], [30, -8, 8, 13, 6]];
	return { g, peaks, snowLine: 0.42 };
}

function badrinath(world) {
	const g = new THREE.Group();
	const cream = std(0xeadfc6), red = std(0xc0392b), white = std(0xf1ebde);
	mesh(box(3.2, 0.3, 3.4), std(0xcfc5b2), 0, 0.15, 0, g);
	// painted facade, the face the pilgrim sees from the bridge
	const fm = std(0xffffff, { map: badriFacade(), roughness: 0.7 });
	const side = std(0xe7d7b8);
	const facade = new THREE.Mesh(box(2.6, 3.0, 0.5), [side, side, red, side, fm, side]);
	facade.position.set(0, 1.8, 1.15);
	facade.castShadow = facade.receiveShadow = true;
	g.add(facade);
	mesh(box(2.8, 0.14, 0.62), red, 0, 3.36, 1.15, g);
	for (const x of [-1.0, 0, 1.0]) {
		const s = x === 0 ? 1.25 : 1;
		const dome = mesh(new THREE.SphereGeometry(0.2 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, x, 3.43, 1.15, g);
		dome.scale.y = 1.3;
		mesh(new THREE.ConeGeometry(0.035 * s, 0.32 * s, 8), GOLD, x, 3.43 + 0.26 * s + 0.16 * s, 1.15, g);
	}
	// hall and sanctum behind, under a gilded roof
	mesh(box(2.2, 1.8, 2.2), white, 0, 1.2, -0.45, g);
	mesh(box(2.24, 0.16, 2.24), red, 0, 2.1, -0.45, g);
	const roof = mesh(new THREE.ConeGeometry(1.7, 0.8, 4, 1), GOLD, 0, 2.58, -0.45, g);
	roof.rotation.y = Math.PI / 4;
	const cup = mesh(new THREE.SphereGeometry(0.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, 0, 2.95, -0.45, g);
	cup.scale.y = 1.4;
	kalash(g, 3.38, 0.9).position.z = -0.45;
	flag(g, 0.25, 3.3, -0.45);
	// Tapt Kund: a steaming pool between the temple and the river
	mesh(box(1.1, 0.12, 0.8), std(0x9fb8b0, { roughness: 0.2 }), -0.6, 0.06, 2.55, g);
	const steam = [];
	for (let i = 0; i < 5; i++) {
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
		sp.position.set(-0.6 + (i - 2) * 0.18, 0.4 + i * 0.15, 2.55);
		sp.scale.setScalar(0.7);
		sp.userData.steam = i;
		g.add(sp);
		steam.push(sp);
	}
	g.userData.steam = steam;
	for (const x of [-1.15, 1.15]) lamp(g, x, 0.6, 1.45, 0.06);
	// Neelkanth behind, Narayan range behind the temple, Nar across the river
	const peaks = [[-12, -34, 10, 25, 11], [8, -22, 10, 17, 12], [-20, -14, 9, 15, 13], [6, 30, 10, 20, 14], [-14, 27, 8, 15, 15], [25, -12, 8, 16, 16]];
	return { g, peaks, snowLine: 0.5, river: { z: 3.6, w: 1.3 } };
}

function tirumala(world) {
	const g = new THREE.Group();
	const lime = std(0xf0eadc), stone = std(0xbdb3a1);
	mesh(box(6.2, 0.2, 6.2), std(0xd8ccb4), 0, 0.1, 0, g);
	// prakara wall
	for (const [x, z, w, d] of [[0, -3, 6.2, 0.25], [0, 3, 6.2, 0.25], [-3, 0, 0.25, 6.2], [3, 0, 0.25, 6.2]]) mesh(box(w, 0.55, d), lime, x, 0.45, z, g);
	// Mahadwaram gopuram at the east gate
	const tierMat = std(0xffffff, { map: gopuramTier() });
	const gp = new THREE.Group();
	mesh(box(1.7, 0.9, 1.0), lime, 0, 0.65, 0, gp);
	mesh(box(0.42, 0.7, 0.04), std(0x3b2a1e), 0, 0.55, 0.51, gp);
	let y = 1.1;
	for (let i = 0; i < 5; i++) {
		const w = 1.5 - i * 0.2, d = 0.86 - i * 0.1, h = 0.32;
		mesh(box(w, h, d), tierMat, 0, y + h / 2, 0, gp);
		y += h;
	}
	const vault = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.66, 16, 1, false, 0, Math.PI), lime, 0, y, 0, gp);
	vault.rotation.z = Math.PI / 2;
	for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.035, 0.16, 8), GOLD, -0.26 + i * 0.13, y + 0.25, 0, gp);
	gp.position.set(0, 0, 3);
	g.add(gp);
	// golden dhvajastambha before the sanctum
	mesh(box(0.3, 0.2, 0.3), GOLD, 0, 0.3, 1.6, g);
	mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.5, 10), GOLD, 0, 1.6, 1.6, g);
	mesh(box(0.22, 0.05, 0.12), GOLD, 0, 2.86, 1.6, g);
	// Ananda Nilayam: gold vimana over the sanctum
	mesh(box(1.4, 0.8, 1.4), stone, 0, 0.6, -0.6, g);
	let vy = 1.0;
	for (const [w, h] of [[1.25, 0.36], [0.98, 0.32], [0.72, 0.3]]) {
		mesh(box(w, h, w), GOLD, 0, vy + h / 2, -0.6, g);
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.ConeGeometry(0.04, 0.14, 6), GOLD, (sx * w) / 2.3, vy + h + 0.06, -0.6 + (sz * w) / 2.3, g);
		vy += h;
	}
	mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 8), GOLD, 0, vy + 0.08, -0.6, g);
	const dome = mesh(new THREE.SphereGeometry(0.4, 8, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), GOLD, 0, vy + 0.16, -0.6, g);
	dome.scale.y = 1.15;
	kalash(g, vy + 0.6, 0.85).position.z = -0.6;
	for (const x of [-2.4, -1.2, 1.2, 2.4]) lamp(g, x, 0.8, 2.85, 0.06);
	lamp(g, 0, 1.3, 3.52, 0.05);
	return { g, hills: true, peaks: [] };
}

function bhimashankar(world) {
	const g = new THREE.Group();
	const basalt = std(0x45413d), basaltL = std(0x5a5550);
	mesh(box(2.5, 0.28, 3.8), std(0x6a645c), 0, 0.14, 0, g);
	mesh(box(1.25, 1.0, 1.25), basalt, 0, 0.78, -0.85, g);
	// curvilinear Nagara shikhara with ribbed tiers
	const sh = tower(2.15, (t) => 0.72 * (1 - 0.7 * Math.pow(t, 1.6)) * (((t * 10) % 1) < 0.22 ? 0.965 : 1), ratha, 128, 80);
	mesh(sh, basalt, 0, 1.28, -0.85, g);
	amalaka(g, 3.4, 0.3, basaltL).position.z = -0.85;
	kalash(g, 3.56, 0.85).position.z = -0.85;
	flag(g, 0.16, 3.6, -0.85);
	// mandapa with a low stepped roof
	mesh(box(1.7, 0.85, 1.7), basalt, 0, 0.7, 0.65, g);
	const mr = tower(0.75, (t) => 0.9 * (1 - 0.78 * (Math.floor(t * 5) / 5)), square, 64, 40);
	mesh(mr, basaltL, 0, 1.12, 0.65, g);
	kalash(g, 1.87, 0.5).position.z = 0.65;
	mesh(box(0.4, 0.6, 0.05), std(0x241c16), 0, 0.58, 1.52, g);
	// the great bell under its arch
	const bronze = std(0x9a6b33, { metalness: 0.6, roughness: 0.35 });
	for (const x of [-0.45, 0.45]) mesh(box(0.1, 1.0, 0.1), basaltL, x, 0.78, 2.45, g);
	mesh(box(1.1, 0.1, 0.14), basaltL, 0, 1.3, 2.45, g);
	const bell = mesh(new THREE.LatheGeometry([[0, 0.3], [0.05, 0.3], [0.09, 0.22], [0.11, 0.08], [0.16, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 20), bronze, 0, 0.92, 2.45, g);
	bell.userData.bell = true;
	for (const x of [-0.6, 0.6]) lamp(g, x, 0.75, 1.55, 0.05);
	return { g, forest: true, peaks: [] };
}

const BUILDERS = { kedarnath, badrinath, tirupati: tirumala, bhimashankar };

export function buildLandmarks(world, scene) {
	const out = [];
	for (const s of SHRINES) {
		const w = toWorld(s.lon, s.lat);
		const y = world.height(w.x, w.z);
		const spec = BUILDERS[s.key](world);
		const root = new THREE.Group();
		root.position.set(w.x, y - 0.05, w.z);
		root.rotation.y = s.facing;
		root.add(spec.g);
		scene.add(root);
		// Local-to-world helper for set dressing that must follow the terrain.
		const toW = (lx, lz) => {
			const c = Math.cos(s.facing), sn = Math.sin(s.facing);
			return { x: w.x + lx * c + lz * sn, z: w.z - lx * sn + lz * c };
		};
		const decor = new THREE.Group();
		scene.add(decor);
		for (const [lx, lz, r, h, seed] of spec.peaks) {
			const p = toW(lx, lz);
			const m = peak(r, h, seed, spec.snowLine);
			m.position.set(p.x, Math.min(world.height(p.x, p.z), y + 2) - 3, p.z);
			decor.add(m);
		}
		if (spec.river) {
			const pts = [];
			for (let lx = 14; lx >= -14; lx -= 0.7) {
				const p = toW(lx, spec.river.z + Math.sin(lx * 0.4) * 0.3);
				pts.push(new THREE.Vector3(p.x, world.height(p.x, p.z) + 0.06, p.z));
			}
			decor.add(ribbonMesh(pts, spec.river.w, std(0x5f9fa6, { roughness: 0.25, metalness: 0.1, emissive: 0x0d2a30, emissiveIntensity: 0.4 })));
			// a footbridge across to the temple
			const b = toW(0.2, spec.river.z);
			const bridge = mesh(box(0.35, 0.12, spec.river.w + 1.4), std(0x7a6a58), b.x, world.height(b.x, b.z) + 0.25, b.z, decor);
			bridge.rotation.y = s.facing;
		}
		if (spec.hills) {
			// the seven hills of Tirumala, rounded and forested
			const R = rand(77);
			const hm = std(0x416f3a, { roughness: 0.95, flatShading: true });
			for (let i = 0; i < 7; i++) {
				const a = Math.PI * 0.35 + (i / 6) * Math.PI * 1.3;
				const d = 13 + R() * 6;
				const p = toW(Math.cos(a) * d, -Math.sin(a) * d);
				const r = 6 + R() * 3, h = 4 + R() * 2.5;
				const m = mesh(new THREE.IcosahedronGeometry(1, 2), hm, p.x, world.height(p.x, p.z) - h * 0.35, p.z, decor);
				m.scale.set(r, h, r * (0.8 + R() * 0.4));
				m.castShadow = false;
			}
		}
		if (spec.forest || spec.hills) decor.add(forest(world, w, spec.forest ? 520 : 200, spec.forest ? 3.2 : 4.2, spec.forest ? 15 : 12, spec.forest ? 91 : 92, spec.forest));
		// a tall soft beacon so each shrine can be found from the air
		const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 16, 1, true), beaconMaterial());
		beacon.position.set(w.x, y + 30, w.z);
		beacon.renderOrder = 5;
		scene.add(beacon);
		out.push({ shrine: s, root, decor, pos: new THREE.Vector3(w.x, y, w.z), beacon, steam: spec.g.userData.steam || [] });
	}
	return out;
}

function forest(world, c, n, r0, r1, seed, monsoon) {
	const R = rand(seed);
	const geo = new THREE.IcosahedronGeometry(1, 0);
	const mat = std(0xffffff, { flatShading: true, roughness: 0.9 });
	const im = new THREE.InstancedMesh(geo, mat, n);
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
	const col = new THREE.Color();
	let k = 0;
	for (let i = 0; i < n * 3 && k < n; i++) {
		const a = R() * Math.PI * 2, d = Math.sqrt(R() * (r1 * r1 - r0 * r0) + r0 * r0);
		const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
		// keep the approach in front of the temple open
		if (Math.abs(z - c.z) < 1.2 && x > c.x) continue;
		const s = 0.28 + R() * 0.32;
		p.set(x, world.height(x, z) + s * 0.8, z);
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
		sc.set(s, s * (1.2 + R() * 0.6), s);
		m.compose(p, q, sc);
		im.setMatrixAt(k, m);
		col.setHSL(monsoon ? 0.28 + R() * 0.06 : 0.25 + R() * 0.05, 0.5 + R() * 0.2, monsoon ? 0.22 + R() * 0.12 : 0.2 + R() * 0.08);
		im.setColorAt(k, col);
		k++;
	}
	im.count = k;
	im.castShadow = true;
	im.receiveShadow = true;
	return im;
}

let _beacon;
function beaconMaterial() {
	if (_beacon) return _beacon;
	_beacon = new THREE.ShaderMaterial({
		uniforms: { uColor: { value: new THREE.Color(0xffb04a) }, uOpacity: { value: 0.5 } },
		vertexShader: "varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
		fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vY; void main(){ gl_FragColor = vec4(uColor, uOpacity * pow(1.0 - vY, 2.0)); }",
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
	});
	return _beacon;
}
export { beaconMaterial };

export function ribbonMesh(pts, width, mat) {
	const n = pts.length;
	const pos = new Float32Array(n * 6);
	const idx = [];
	const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), side = new THREE.Vector3();
	for (let i = 0; i < n; i++) {
		const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
		dir.subVectors(b, a).setY(0).normalize();
		side.crossVectors(up, dir).multiplyScalar(width / 2);
		const p = pts[i];
		pos.set([p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z], i * 6);
		if (i < n - 1) {
			const k = i * 2;
			idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const m = new THREE.Mesh(g, mat);
	m.receiveShadow = true;
	return m;
}
