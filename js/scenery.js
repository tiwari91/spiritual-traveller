// The country beside the road, built in chunks a little ahead of the traveller: fields of the season's
// crop, villages of the region's houses, roadside trees, haystacks, cattle, dhabas, brick kilns, palms,
// Deccan boulders and Garhwal pines. Everything is life scale and merged into a few meshes per chunk.
import * as THREE from "three";
import { Batch, T, VCOL, place } from "./batch.js";
import { CITIES, SHRINES, toGeo, toWorld } from "./geo.js";
import { M, region } from "./roads.js";
import { clamp, rand } from "./util.js";

const CHUNK = 24; // route units per chunk
const C = (h) => new THREE.Color(h);
const pick = (R, a) => a[Math.floor(R() * a.length)];

// Crops by region: [colour, stripe strength]; the stripes are the furrows or rows.
const CROPS = {
	sahyadri: [[0x5f9d34, 0.25], [0x76ad3a, 0.25], [0x4f8a2e, 0.3], [0x8a5634, 0.5]],
	deccan: [[0xa58a55, 0.45], [0xc9b46a, 0.35], [0xe6cf4a, 0.3], [0x7f9a48, 0.3], [0xc9ccb0, 0.35], [0x8e6a48, 0.5]],
	south: [[0x6fa83a, 0.25], [0x86b347, 0.25], [0xa38458, 0.45]],
	central: [[0x96a048, 0.35], [0xc6b05a, 0.35], [0xc9ccb0, 0.3], [0x8e7552, 0.5], [0x7f9a48, 0.3]],
	gangetic: [[0x7aa83e, 0.35], [0xe0c53a, 0.3], [0x9fb04c, 0.35], [0xc8a85a, 0.35], [0x3f7a35, 0.2], [0x8a7254, 0.5]],
	doon: [[0x6f9e3a, 0.3], [0x9db04c, 0.3], [0x8a7254, 0.5]],
	garhwal: [[0x88a042, 0.5], [0xc0a855, 0.5], [0x6f8f3a, 0.5], [0x9c7f55, 0.55]],
};
const WALLS = {
	plains: [0xe8c9a8, 0xd9e2e6, 0xf0e0b0, 0xe6b8b8, 0xc8dcc0, 0xf2efe6, 0xb5583e, 0xa8513a, 0xc9a37a],
	sahyadri: [0xf2efe6, 0xdfe8ee, 0xe9d7b0, 0xb5583e, 0xc8dcc0],
	garhwal: [0x8f8a80, 0x9a948a, 0xe6dfd2, 0xd9e2ee, 0xeacdb8, 0x837d73],
};
function furrows() {
	const c = document.createElement("canvas");
	c.width = c.height = 64;
	const g = c.getContext("2d");
	g.fillStyle = "#fff";
	g.fillRect(0, 0, 64, 64);
	for (let y = 0; y < 64; y += 8) {
		g.fillStyle = "rgba(0,0,0,0.55)";
		g.fillRect(0, y, 64, 3);
	}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	return t;
}

export class Scenery {
	constructor(route, world, roads, scene, low = false) {
		this.route = route;
		this.world = world;
		this.roads = roads;
		this.low = low;
		this.group = new THREE.Group();
		scene.add(this.group);
		this.chunks = new Map();
		const tex = furrows();
		this.fieldMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
		this.shrines = SHRINES.map((s) => toWorld(s.lon, s.lat));
		this.cities = CITIES.map((c) => Object.assign({ w: toWorld(c.lon, c.lat) }, c));
	}
	// Keep the chunks around the traveller built; show the ones near the camera.
	update(s, camera) {
		const k0 = Math.floor((s - CHUNK * 1.5) / CHUNK), k1 = Math.floor((s + CHUNK * 3) / CHUNK);
		let built = 0;
		for (let k = k0; k <= k1; k++) {
			if (k < 0 || k * CHUNK > this.route.length || this.chunks.has(k)) continue;
			if (built++ > 0) break; // at most one new chunk a frame
			this.chunks.set(k, this.build(k));
		}
		for (const [k, g] of this.chunks) {
			const d = camera.position.distanceTo(g.userData.centre);
			g.visible = d < 260 && k >= k0 - 4 && k <= k1 + 4;
		}
	}
	prebuild(s) {
		const k0 = Math.floor((s - CHUNK * 1.5) / CHUNK), k1 = Math.floor((s + CHUNK * 3) / CHUNK);
		for (let k = Math.max(0, k0); k <= k1; k++) if (!this.chunks.has(k) && k * CHUNK <= this.route.length) this.chunks.set(k, this.build(k));
	}
	ok(x, z, margin = 0.3) {
		for (const w of this.shrines) if (Math.hypot(x - w.x, z - w.z) < 12) return false;
		const h = this.world.height(x, z);
		if (h < 0.3) return false;
		return this.roads.clearance(x, z) > margin;
	}
	build(k) {
		const R = rand(k * 7919 + 17);
		const route = this.route, world = this.world;
		const s0 = k * CHUNK, s1 = Math.min(route.length, s0 + CHUNK);
		const b = new Batch();
		const fields = { pos: [], col: [], uv: [], idx: [] };
		const mid = route.at((s0 + s1) / 2, {});
		const geo = toGeo(mid.x, mid.z);
		const reg = region(geo.lon, geo.lat);
		const plains = reg === "deccan" || reg === "central" || reg === "gangetic" || reg === "south";
		const dens = this.low ? 0.5 : 1;
		const p = {};
		const lateral = (s, off) => {
			route.at(s, p);
			return { x: p.x - p.dz * off, z: p.z + p.dx * off, dx: p.dx, dz: p.dz, yaw: Math.atan2(p.dx, p.dz) };
		};
		// a town nearby makes everything denser
		let town = 0;
		for (const c of this.cities) {
			const d = Math.hypot(c.w.x - mid.x, c.w.z - mid.z);
			town = Math.max(town, clamp(1 - d / (8 + c.size * 6), 0, 1) * c.size);
		}
		// ---------- fields ----------
		const crops = CROPS[reg];
		const placed = [];
		const nf = Math.round((reg === "garhwal" ? 26 : plains ? 70 : 45) * dens);
		for (let i = 0; i < nf; i++) {
			const s = s0 + R() * (s1 - s0), side = R() < 0.5 ? -1 : 1, off = side * (2.6 + Math.pow(R(), 0.8) * 26);
			const c = lateral(s, off);
			const [col, stripe] = pick(R, crops);
			const w = (reg === "garhwal" ? 1.2 : 2) + R() * 3.5, l = w * (0.8 + R() * 1.4);
			if (!this.ok(c.x, c.z, Math.hypot(w, l) / 2 + 0.2)) continue;
			// fields sit side by side, never on top of one another
			const rad = Math.hypot(w, l) / 2;
			if (placed.some((q) => Math.hypot(q[0] - c.x, q[1] - c.z) < (q[2] + rad) * 0.82)) continue;
			placed.push([c.x, c.z, rad]);
			// fields line up with the road, or with the slope in the hills
			let yaw = c.yaw + (R() - 0.5) * 0.3;
			if (reg === "garhwal") {
				const gx = world.height(c.x + 0.5, c.z) - world.height(c.x - 0.5, c.z), gz = world.height(c.x, c.z + 0.5) - world.height(c.x, c.z - 0.5);
				if (Math.hypot(gx, gz) > 0.02) yaw = Math.atan2(gz, -gx);
			}
			this.field(fields, c.x, c.z, w, l, yaw, C(col).offsetHSL(0, (R() - 0.5) * 0.08, (R() - 0.5) * 0.05), stripe, reg === "garhwal" ? 5 : 2 + R() * 4);
			if (reg === "garhwal" && R() < 0.7) {
				// a dry-stone terrace wall on the downhill edge
				const ex = c.x + Math.sin(yaw + Math.PI / 2) * w * 0.5, ez = c.z + Math.cos(yaw + Math.PI / 2) * w * 0.5;
				b.add(T.box, place(ex, world.height(ex, ez) - 0.12, ez, yaw, l, 0.24, 0.12), 0x8a8276);
			}
			if (plains && R() < 0.12) {
				// a haystack or a stack of dung cakes at the field's corner
				const hx = c.x + (R() - 0.5) * w, hz = c.z + (R() - 0.5) * l;
				if (this.ok(hx, hz)) b.add(T.dome, place(hx, world.height(hx, hz), hz, 0, 1.1 * M * 3, 1.6 * M * 2, 1.1 * M * 3), 0xc9a65a);
			}
		}
		// ---------- avenue trees with painted trunks along the highway ----------
		if (plains || reg === "doon") {
			for (let s = s0; s < s1; s += 1.5) {
				const r = this.roads.road(s);
				if (!r || r.kind !== "nh" || r.bridge > 0.1 || R() < 0.25) continue;
				for (const sg of [-1, 1]) {
					const off = sg * (2.05 + R() * 0.4);
					const x = r.x - r.dz * off, z = r.z + r.dx * off;
					if (!this.ok(x, z, 0.1)) continue;
					this.tree(b, R, x, z, R() < 0.5 ? "neem" : "mango", true);
				}
			}
		}
		// ---------- trees in the fields and on the hills ----------
		const nt = Math.round((reg === "garhwal" ? 150 : reg === "sahyadri" ? 140 : 80) * dens);
		for (let i = 0; i < nt; i++) {
			const s = s0 + R() * (s1 - s0), off = (R() < 0.5 ? -1 : 1) * (2.4 + Math.pow(R(), 0.7) * 30);
			const c = lateral(s, off);
			if (!this.ok(c.x, c.z, 0.4)) continue;
			// trees come in groves
			const n = 1 + Math.floor(R() * (reg === "garhwal" ? 6 : 3));
			for (let j = 0; j < n; j++) {
				const x = c.x + (R() - 0.5) * 2.5, z = c.z + (R() - 0.5) * 2.5;
				// crowns spread a metre or two; keep them off the line and the road
				if (!this.ok(x, z, 1.1)) continue;
				this.tree(b, R, x, z, this.species(R, reg));
			}
		}
		// ---------- villages ----------
		const nv = (plains ? 1.4 : 1) + town * 1.5;
		for (let v = 0; v < nv; v++) {
			if (R() > 0.85 + town * 0.1) continue;
			const s = s0 + R() * (s1 - s0), off = (R() < 0.5 ? -1 : 1) * (3.2 + R() * (town ? 8 : 16));
			const c = lateral(s, off);
			if (!this.ok(c.x, c.z, 1)) continue;
			this.village(b, R, c, reg, Math.round((8 + R() * 10 + town * 14) * dens));
		}
		// ---------- by the road: dhabas, cattle, kilns, boulders ----------
		if (R() < 0.55) {
			const s = s0 + R() * (s1 - s0);
			const r = this.roads.road(s);
			if (r && r.kind !== "trek" && !r.bridge) this.dhaba(b, R, r, reg);
		}
		const nc = Math.round((plains ? 8 : 4) * dens);
		for (let i = 0; i < nc; i++) {
			const s = s0 + R() * (s1 - s0), off = (R() < 0.5 ? -1 : 1) * (2.2 + R() * 6);
			const c = lateral(s, off);
			if (!this.ok(c.x, c.z, 0.2)) continue;
			const herd = 1 + Math.floor(R() * 3);
			for (let j = 0; j < herd; j++) this.cow(b, R, c.x + (R() - 0.5) * 1.6, c.z + (R() - 0.5) * 1.6, reg === "gangetic" && R() < 0.5 ? "buffalo" : reg === "garhwal" ? (R() < 0.6 ? "goat" : "cow") : "cow");
		}
		if (reg === "gangetic" && R() < 0.35) {
			const c = lateral(s0 + R() * CHUNK, (R() < 0.5 ? -1 : 1) * (8 + R() * 14));
			if (this.ok(c.x, c.z, 2)) {
				const y = world.height(c.x, c.z);
				b.add(T.box, place(c.x, y, c.z, c.yaw, 4 * M * 3, 1.2 * M * 2, 7 * M * 3), 0x9a5a3c); // kiln
				b.add(T.taper, place(c.x, y, c.z + 1.2, 0, 0.35, 7.5, 0.35), 0x7a3b28); // chimney
				for (let j = 0; j < 14; j++) b.add(T.box, place(c.x + (R() - 0.5) * 4, y, c.z + (R() - 0.5) * 4, R(), 0.6, 0.3, 0.25), 0xa8513a); // stacked bricks
			}
		}
		if ((reg === "deccan" || reg === "south") && R() < 0.8) {
			// the granite boulder piles of the Deccan
			for (let i = 0; i < 3; i++) {
				const c = lateral(s0 + R() * CHUNK, (R() < 0.5 ? -1 : 1) * (4 + R() * 22));
				if (!this.ok(c.x, c.z, 1)) continue;
				const y = world.height(c.x, c.z);
				for (let j = 0; j < 6; j++) {
					const sz = 0.6 + R() * 1.6;
					b.add(T.ball, place(c.x + (R() - 0.5) * 2, y - 0.2 + j * 0.25 * R(), c.z + (R() - 0.5) * 2, R() * 6, sz, sz * (0.6 + R() * 0.4), sz * (0.8 + R() * 0.3)), C(0x9a8f86).offsetHSL(0, 0, (R() - 0.5) * 0.08));
				}
			}
		}
		const g = new THREE.Group();
		if (!b.empty) g.add(b.build(VCOL));
		if (fields.pos.length) {
			const fg = new THREE.BufferGeometry();
			fg.setAttribute("position", new THREE.Float32BufferAttribute(fields.pos, 3));
			fg.setAttribute("color", new THREE.Float32BufferAttribute(fields.col, 3));
			fg.setAttribute("uv", new THREE.Float32BufferAttribute(fields.uv, 2));
			fg.setIndex(fields.idx);
			fg.computeVertexNormals();
			const m = new THREE.Mesh(fg, this.fieldMat);
			m.receiveShadow = true;
			g.add(m);
		}
		g.userData.centre = new THREE.Vector3(mid.x, mid.y, mid.z);
		this.group.add(g);
		return g;
	}
	// A field: a small grid laid on the ground, coloured by crop, with rows in the texture.
	field(f, cx, cz, w, l, yaw, col, stripe, rows) {
		const n = 4;
		const base = f.pos.length / 3;
		const cs = Math.cos(yaw), sn = Math.sin(yaw);
		for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
			const u = (i / n - 0.5) * w, v = (j / n - 0.5) * l;
			const x = cx + u * cs + v * sn, z = cz - u * sn + v * cs;
			f.pos.push(x, this.world.height(x, z) + 0.035, z);
			f.col.push(col.r, col.g, col.b);
			f.uv.push(i / n, (j / n) * rows);
		}
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
			const a = base + i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
			f.idx.push(a, b, c, b, d, c);
		}
		// weaker rows: lift the colour so the dark furrows read less
		if (stripe < 0.35) for (let k = base * 3; k < f.col.length; k++) f.col[k] = Math.min(1, f.col[k] * 1.06);
	}
	species(R, reg) {
		const r = R();
		switch (reg) {
			case "garhwal": return r < 0.75 ? "pine" : "deodar";
			case "doon": return r < 0.6 ? "sal" : r < 0.8 ? "mango" : "pine";
			case "sahyadri": return r < 0.5 ? "mango" : r < 0.85 ? "jamun" : "banyan";
			case "south": return r < 0.45 ? "coconut" : r < 0.65 ? "toddy" : r < 0.85 ? "neem" : "acacia";
			case "deccan": return r < 0.3 ? "neem" : r < 0.55 ? "acacia" : r < 0.75 ? "toddy" : r < 0.9 ? "banyan" : "eucalyptus";
			default: return r < 0.35 ? "mango" : r < 0.6 ? "neem" : r < 0.75 ? "eucalyptus" : r < 0.9 ? "banyan" : "acacia";
		}
	}
	tree(b, R, x, z, kind, painted = false) {
		const y = this.world.height(x, z);
		const s = (0.6 + R() * 0.4) * M;
		const yaw = R() * 6;
		const leaf = (h, sat, l) => new THREE.Color().setHSL(h + (R() - 0.5) * 0.03, sat, l + (R() - 0.5) * 0.06);
		const trunk = (h, r, c = 0x5a4434) => {
			b.add(T.taper, place(x, y, z, yaw, r * s, h * s, r * s), c);
			if (painted) {
				// the white and red bands painted on roadside trees
				b.add(T.cyl, place(x, y, z, yaw, r * s * 1.12, 1.0 * s, r * s * 1.12), 0xf4f1ea);
				b.add(T.cyl, place(x, y + 1.0 * s, z, yaw, r * s * 1.1, 0.25 * s, r * s * 1.1), 0xb8261c);
			}
		};
		switch (kind) {
			case "pine": case "deodar": {
				const h = (kind === "deodar" ? 16 : 13) * (0.8 + R() * 0.4);
				trunk(h * 0.6, 0.45, 0x4a3828);
				const col = kind === "deodar" ? leaf(0.38, 0.35, 0.2) : leaf(0.3, 0.4, 0.24);
				for (let i = 0; i < 4; i++) {
					const w = (kind === "deodar" ? 7 : 5) * (1 - i * 0.2);
					b.add(T.cone, place(x, y + h * (0.25 + i * 0.17) * s, z, yaw, w * s, h * 0.32 * s, w * s), col);
				}
				return;
			}
			case "coconut": case "toddy": {
				const h = kind === "coconut" ? 12 + R() * 6 : 10 + R() * 4;
				const lean = kind === "coconut" ? (R() - 0.5) * 0.25 : 0;
				b.add(T.cyl, place(x, y, z, yaw, 0.35 * s, h * s, 0.35 * s, lean, 0), 0x7a6a58);
				const tx = x + Math.sin(yaw) * Math.sin(lean) * h * s, tz = z + Math.cos(yaw) * Math.sin(lean) * h * s;
				const ty = y + h * s * Math.cos(lean);
				if (kind === "toddy") {
					b.add(T.ball, place(tx, ty - 1.5 * s, tz, 0, 4.2 * s, 3.6 * s, 4.2 * s), leaf(0.24, 0.35, 0.22));
				} else {
					for (let i = 0; i < 8; i++) {
						const a = (i / 8) * Math.PI * 2 + R() * 0.3;
						b.add(T.box, place(tx, ty, tz, a, 0.5 * s, 0.06 * s, 4.5 * s, 0.55 + R() * 0.3, 0), leaf(0.27, 0.5, 0.26));
					}
				}
				return;
			}
			case "eucalyptus": {
				const h = 14 + R() * 6;
				trunk(h * 0.75, 0.3, 0xd8d0c0);
				b.add(T.crown, place(x, y + h * 0.55 * s, z, yaw, 3.5 * s, h * 0.45 * s, 3.5 * s), leaf(0.25, 0.25, 0.3));
				return;
			}
			case "acacia": {
				const h = 5 + R() * 3;
				trunk(h * 0.8, 0.25);
				b.add(T.ball, place(x, y + h * 0.7 * s, z, yaw, 6 * s, 1.6 * s, 6 * s), leaf(0.22, 0.35, 0.28));
				return;
			}
			case "banyan": {
				const h = 9 + R() * 4;
				trunk(h * 0.45, 1.6, 0x6a5a4a);
				for (let i = 0; i < 4; i++) b.add(T.crown, place(x + (R() - 0.5) * 5 * s, y + h * (0.4 + R() * 0.2) * s, z + (R() - 0.5) * 5 * s, yaw, (8 + R() * 4) * s, h * 0.55 * s, (8 + R() * 4) * s), leaf(0.3, 0.45, 0.2));
				return;
			}
			default: {
				// neem, mango, jamun, sal: a stout trunk and a full rounded crown
				const h = kind === "sal" ? 14 + R() * 4 : 8 + R() * 4;
				trunk(h * 0.5, kind === "mango" ? 0.7 : 0.5);
				const [hu, sa, li] = kind === "neem" ? [0.25, 0.45, 0.3] : kind === "mango" ? [0.3, 0.5, 0.18] : kind === "sal" ? [0.27, 0.4, 0.24] : [0.31, 0.45, 0.2];
				const w = kind === "sal" ? 5 : kind === "mango" ? 8 : 6.5;
				b.add(T.crown, place(x, y + h * 0.35 * s, z, yaw, w * s, h * 0.7 * s, w * s), leaf(hu, sa, li));
				b.add(T.crown, place(x + (R() - 0.5) * 2 * s, y + h * 0.62 * s, z + (R() - 0.5) * 2 * s, yaw, w * 0.65 * s, h * 0.42 * s, w * 0.65 * s), leaf(hu, sa, li + 0.04));
			}
		}
	}
	// A cluster of houses in the local style, with a water tank and a small shrine.
	village(b, R, c, reg, n) {
		const world = this.world;
		const style = reg === "garhwal" ? "garhwal" : reg === "sahyadri" ? "sahyadri" : "plains";
		const walls = WALLS[style];
		const yaw0 = c.yaw;
		for (let i = 0; i < n; i++) {
			const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (2.2 + n * 0.12);
			const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
			const yaw = yaw0 + (R() < 0.7 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.2;
			const w = (5 + R() * 5) * M, dpt = (5 + R() * 5) * M;
			// the whole house, not just its middle, keeps clear of the road and the line
			if (!this.ok(x, z, Math.hypot(w, dpt) / 2 + 0.3)) continue;
			const y = world.height(x, z);
			const floors = style === "plains" ? (R() < 0.35 ? 2 : 1) : style === "garhwal" ? 1 + Math.floor(R() * 3) : 1;
			const h = floors * 3.1 * M;
			const wall = C(pick(R, walls));
			b.add(T.box, place(x, y - 0.1, z, yaw, w, h + 0.1, dpt), wall);
			// doors and windows as dark insets on the two long sides
			for (const sg of [-1, 1]) {
				const fx = x + Math.sin(yaw) * sg * dpt * 0.5, fz = z + Math.cos(yaw) * sg * dpt * 0.5;
				b.add(T.box, place(fx, y, fz, yaw, 0.9 * M, 2 * M, 0.04), 0x3a2a20);
				for (let f = 0; f < floors; f++) b.add(T.box, place(fx + Math.cos(yaw) * w * 0.28, y + (1.2 + f * 3.1) * M, fz - Math.sin(yaw) * w * 0.28, yaw, 0.9 * M, 0.9 * M, 0.04), 0x2a3440);
			}
			if (style === "plains") {
				if (R() < 0.15) {
					// a thatched hut
					b.add(T.gable, place(x, y + h, z, yaw, w * 1.15, 2.2 * M, dpt * 1.1), 0xb8995a);
				} else {
					// a flat concrete roof with a parapet, and often a stair room or a water tank on top
					b.add(T.box, place(x, y + h, z, yaw, w * 1.02, 0.5 * M, dpt * 1.02), C(wall).multiplyScalar(0.9));
					if (R() < 0.4) b.add(T.box, place(x + Math.cos(yaw) * w * 0.25, y + h, z - Math.sin(yaw) * w * 0.25, yaw, w * 0.3, 2.2 * M, dpt * 0.3), wall);
					if (R() < 0.35) b.add(T.cyl, place(x - Math.cos(yaw) * w * 0.25, y + h, z, 0, 1.0 * M, 1.1 * M, 1.0 * M), pick(R, [0x1f1f1f, 0x2a5a8a, 0xe6e2d6]));
				}
			} else if (style === "sahyadri") {
				// Mangalore tile roofs
				b.add(T.pyramid, place(x, y + h, z, yaw, w * 1.2, 2.2 * M, dpt * 1.2), pick(R, [0xa8442a, 0x9a3c26, 0xb5583e]));
			} else {
				// slate roofs, and wooden balconies on the upper floor
				b.add(T.gable, place(x, y + h, z, yaw, w * 1.2, 1.8 * M, dpt * 1.15), pick(R, [0x5d5a56, 0x6a6560, 0x7f8a8f, 0x8a3a2c]));
				if (floors > 1) b.add(T.box, place(x + Math.sin(yaw) * dpt * 0.55, y + 3.1 * M, z + Math.cos(yaw) * dpt * 0.55, yaw, w * 0.9, 0.9 * M, 0.8 * M), 0x6a4a2e);
			}
		}
		// the village water tank on its legs
		if (style !== "garhwal" && R() < 0.7) {
			const x = c.x + 2.5, z = c.z - 1.5;
			if (this.ok(x, z, 1.4)) {
				const y = world.height(x, z);
				for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(T.box, place(x + lx * 0.5, y, z + lz * 0.5, 0, 0.12, 3.2, 0.12), 0xb9b4aa);
				b.add(T.cyl12, place(x, y + 3.2, z, 0, 1.9, 1.2, 1.9), 0xd6d1c6);
				b.add(T.dome, place(x, y + 4.4, z, 0, 1.9, 0.5, 1.9), 0xc9c4b9);
			}
		}
		// a small whitewashed shrine with a saffron flag, under a peepal
		if (R() < 0.75) {
			const x = c.x - 2, z = c.z + 1.6;
			if (this.ok(x, z, 0.8)) {
				const y = world.height(x, z);
				b.add(T.box, place(x, y, z, yaw0, 0.7, 0.75, 0.7), 0xf4f1ea);
				b.add(T.pyramid, place(x, y + 0.75, z, yaw0, 0.55, 0.9, 0.55), style === "garhwal" ? 0x8a8378 : 0xe07a1e);
				b.add(T.box, place(x, y + 1.6, z, 0, 0.02, 0.7, 0.02), 0x5a4434);
				b.add(T.box, place(x + 0.12, y + 2.12, z, 0, 0.22, 0.14, 0.01), 0xff8a1e);
				if (this.ok(x + 1.6, z + 0.6, 2)) this.tree(b, R, x + 1.6, z + 0.6, "banyan");
			}
		}
	}
	// A dhaba: a tin-roofed shack, charpais out front, a painted board and a parked truck.
	dhaba(b, R, r, reg) {
		const sg = R() < 0.5 ? -1 : 1;
		const off = sg * 2.7;
		const x = r.x - r.dz * off, z = r.z + r.dx * off;
		if (!this.ok(x, z, 0.1)) return;
		const y = this.world.height(x, z);
		const yaw = Math.atan2(r.dx, r.dz);
		const bx = (u, v) => [x - r.dz * u + r.dx * v, z + r.dx * u + r.dz * v];
		let [px, pz] = bx(sg * 1.0, 0);
		b.add(T.box, place(px, y, pz, yaw, 1.5, 0.75, 2.2), pick(R, [0xe8c9a8, 0x9fc7d4, 0xf0d070]));
		b.add(T.box, place(px, y + 0.75, pz, yaw, 1.9, 0.04, 2.6, 0, sg * 0.08), 0x8e9aa0); // tin roof
		[px, pz] = bx(sg * 0.15, 0);
		for (const v of [-0.6, 0, 0.6]) {
			const [cx, cz] = bx(sg * 0.15, v);
			// charpai: a low string bed
			b.add(T.box, place(cx, y + 0.12, cz, yaw + Math.PI / 2, 0.55, 0.04, 0.3), 0xc9a870);
			for (const [a, c] of [[-0.25, -0.13], [0.25, -0.13], [-0.25, 0.13], [0.25, 0.13]]) {
				const [lx, lz] = bx(sg * 0.15 + c, v + a);
				b.add(T.box, place(lx, y, lz, yaw, 0.03, 0.12, 0.03), 0x6a4a2e);
			}
		}
		const [sx, sz] = bx(sg * 0.25, 1.3);
		b.add(T.box, place(sx, y, sz, yaw, 0.03, 0.9, 0.03), 0x3a3a3a);
		b.add(T.box, place(sx, y + 0.9, sz, yaw + Math.PI / 2, 0.9, 0.3, 0.03), pick(R, [0xd8261c, 0xf0c419, 0x2f8a4a]));
	}
	cow(b, R, x, z, kind) {
		if (!this.ok(x, z, 0.1)) return;
		const y = this.world.height(x, z);
		const yaw = R() * 6;
		const s = kind === "goat" ? 0.45 * M : M;
		const col = kind === "buffalo" ? 0x232322 : kind === "goat" ? pick(R, [0xf0ece2, 0x2a2622, 0x8a6a4a]) : pick(R, [0xf0ece2, 0xe6e0d4, 0xc8b8a0, 0x8a6a4a]);
		const fw = (u) => [x + Math.sin(yaw) * u, z + Math.cos(yaw) * u];
		b.add(T.box, place(x, y + 0.75 * s, z, yaw, 0.65 * s, 0.75 * s, 1.7 * s), col);
		for (const [lx, lz] of [[-0.22, -0.65], [0.22, -0.65], [-0.22, 0.6], [0.22, 0.6]]) {
			const [qx, qz] = [x + Math.cos(yaw) * lx * s + Math.sin(yaw) * lz * s, z - Math.sin(yaw) * lx * s + Math.cos(yaw) * lz * s];
			b.add(T.box, place(qx, y, qz, yaw, 0.12 * s, 0.78 * s, 0.12 * s), col);
		}
		let [hx, hz] = fw(1.0 * s);
		b.add(T.box, place(hx, y + 1.05 * s, hz, yaw, 0.3 * s, 0.35 * s, 0.5 * s, 0.4), col);
		if (kind === "cow") {
			[hx, hz] = fw(0.6 * s);
			b.add(T.ball, place(hx, y + 1.3 * s, hz, yaw, 0.4 * s, 0.35 * s, 0.4 * s), col); // the zebu hump
		}
		if (kind !== "goat") {
			[hx, hz] = fw(1.1 * s);
			b.add(T.box, place(hx, y + 1.3 * s, hz, yaw, 0.45 * s, 0.06 * s, 0.06 * s, 0, 0.3), kind === "buffalo" ? 0x3a3530 : 0xd8d0c0);
		}
	}
}
