// The country beside the road, built in chunks a little ahead of the traveller and spread over several
// frames: fields cut into real plots with bunds and crops in rows, villages along their lanes, roadside
// avenue trees with painted trunks, groves and scrub of the region's trees, dhabas, bus shelters, cattle,
// buffaloes, goats, dogs and people, Deccan boulders and Gangetic brick kilns. Trees are instanced with
// LOD (trees.js); grass and weeds are scattered near the camera; soft contact shadows sit under trees and
// houses. Everything keeps off roads, rails, rivers and the temple precincts, and sits on the ground.
import * as THREE from "three";
import { Batch, DITHER, HAZE_FOG, NO_FLIP, SHARED, T, VCOL, patch, place } from "./batch.js";
import { FieldGeo, StripGeo, cropMaterial, fieldMaterial, landOf, layFields } from "./fields.js";
import { CITIES, KAILASH, SHRINES, toGeo, toWorld } from "./geo.js";
import { kailashCountry, kumaonWayside } from "./kailash-scenery.js";
import { KAILASH as K_CENTRE, P as KP } from "./kailash-geo.js";
import { OM_DIR } from "./kailash-world.js";
import { addAnimal, addPerson, haystack } from "./life.js";
import { M, region } from "./roads.js";
import { LEAF, blobTexture, leafAtlas, leafCell, signCell } from "./textures.js";
import { parkedVehicle } from "./traffic.js";
import { TREE_STRIDE, Trees } from "./trees.js";
import { clamp, lerp, rand, smoothstep } from "./util.js";
import { HouseGeo, house, houseFits, houseMaterial, footprint, signMaterial, village } from "./village.js";
import { groundAt } from "./world.js";

const CHUNK = 24; // route units per chunk
const C = (h) => new THREE.Color(h);
const pick = (R, a) => a[Math.floor(R() * a.length)];

// Which script the shop signs are painted in.
function langAt(lon, lat) {
	if (lon > 77.25 && lat < 19.6) return "te";
	if (lat < 22.2 && lon < 80.6) return "mr";
	return "hi";
}
// Village style by landscape.
function styleOf(reg, lon) {
	if (reg === "deccan") return lon > 77.2 ? "telangana" : "deccan";
	return reg;
}

// ---------- footprints: what has been placed, so nothing overlaps ----------
const CELL = 2;
class Foot {
	constructor() {
		this.cells = new Map();
		this.owned = new Map();
	}
	key(i, j) {
		return (i + 2000) * 5000 + (j + 2000);
	}
	insert(owner, shape) {
		const pad = 0.8;
		const i0 = Math.floor((shape.x0 - pad) / CELL), i1 = Math.floor((shape.x1 + pad) / CELL);
		const j0 = Math.floor((shape.z0 - pad) / CELL), j1 = Math.floor((shape.z1 + pad) / CELL);
		shape.keys = [];
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const k = this.key(i, j);
			let c = this.cells.get(k);
			if (!c) this.cells.set(k, (c = []));
			c.push(shape);
			shape.keys.push(k);
		}
		let o = this.owned.get(owner);
		if (!o) this.owned.set(owner, (o = []));
		o.push(shape);
	}
	poly(owner, pts) {
		const P = pts.map((p) => (Array.isArray(p) ? p : [p.x, p.z]));
		let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
		for (const [x, z] of P) {
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			z0 = Math.min(z0, z);
			z1 = Math.max(z1, z);
		}
		this.insert(owner, { P, x0, x1, z0, z1 });
	}
	circle(owner, x, z, r) {
		this.insert(owner, { c: [x, z, r], x0: x - r, x1: x + r, z0: z - r, z1: z + r });
	}
	hits(x, z, r = 0) {
		const c = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
		if (!c) return false;
		for (const s of c) {
			if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
			if (s.c) {
				if (Math.hypot(x - s.c[0], z - s.c[1]) < s.c[2] + r) return true;
				continue;
			}
			const P = s.P;
			let inside = false;
			for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
				const [xi, zi] = P[i], [xj, zj] = P[j];
				if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
			}
			if (inside) return true;
			if (r > 0) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
				const [ax, az] = P[j], [bx, bz] = P[i];
				const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
				const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
				if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true;
			}
		}
		return false;
	}
	remove(owner) {
		const o = this.owned.get(owner);
		if (!o) return;
		for (const s of o) for (const k of s.keys) {
			const c = this.cells.get(k);
			if (!c) continue;
			const i = c.indexOf(s);
			if (i >= 0) c.splice(i, 1);
			if (!c.length) this.cells.delete(k);
		}
		this.owned.delete(owner);
	}
}

// ---------- contact shadows ----------
class BlobGeo {
	constructor() {
		this.p = [];
		this.uv = [];
		this.c = [];
		this.idx = [];
	}
	// a soft dark ellipse draped on the ground (3 x 3 grid)
	add(world, x, z, yaw, w, d, a) {
		const cs = Math.cos(yaw), sn = Math.sin(yaw);
		const base = this.p.length / 3;
		for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
			const u = (i / 2 - 0.5) * w, v = (j / 2 - 0.5) * d;
			const px = x + u * cs + v * sn, pz = z - u * sn + v * cs;
			this.p.push(px, world.height(px, pz) + 0.06, pz);
			this.uv.push(i / 2, j / 2);
			this.c.push(0, 0, 0, a);
		}
		for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
			const q = base + j * 3 + i;
			this.idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4);
		}
	}
	build(mat) {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
		g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 4));
		g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
		g.computeBoundingSphere();
		const m = new THREE.Mesh(g, mat);
		m.renderOrder = 1;
		return m;
	}
}
function blobMaterial() {
	const m = new THREE.MeshBasicMaterial({ map: blobTexture(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
	// fade the darkening out with the fog rather than tinting it
	return patch(m, "blob", (s) => {
		s.fragmentShader = s.fragmentShader.replace("#include <fog_fragment>", `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		fogF = max( fogF, ( 1.0 - exp( - fogDensity * 0.9 * vFogDepth ) ) * 0.66 );
	#else
		float fogF = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.a *= 1.0 - fogF;
#endif
	gl_FragColor.rgb = vec3( 0.0 );`);
	});
}

// ---------- grass and weeds near the camera ----------
class Clutter {
	constructor(scene, sc, low) {
		this.sc = sc;
		this.low = low;
		this.tiles = new Map();
		this.cap = low ? 2600 : 8000;
		this.focus = new THREE.Vector3(1e9, 0, 0);
		this.radius = { value: 20 };
		this.centre = { value: new THREE.Vector3() };
		const mat = new THREE.MeshStandardMaterial({ map: leafAtlas(low), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color(1.05, 1.05, 1.05) });
		patch(mat, "clutter", (s) => {
			Object.assign(s.uniforms, SHARED, { uRad: this.radius, uCtr: this.centre });
			s.vertexShader = "attribute float aSway;\nuniform float uTime, uWind, uRad;\nuniform vec3 uCtr;\nvarying float vStFade;\n" + s.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
	vec3 cIP = vec3( instanceMatrix[ 3 ] );
	float cPh = cIP.x * 1.7 + cIP.z * 1.3;
	transformed.x += sin( uTime * 2.1 + cPh ) * aSway * 0.08 * uWind;
	transformed.z += cos( uTime * 1.7 + cPh ) * aSway * 0.06 * uWind;
	vStFade = 1.0 - smoothstep( uRad * 0.7, uRad, length( cIP.xz - uCtr.xz ) );`);
			s.fragmentShader = "varying float vStFade;\n" + DITHER + s.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\tif ( stDither( gl_FragCoord.xy ) > vStFade ) discard;").replace("#include <normal_fragment_begin>", NO_FLIP).replace("#include <fog_fragment>", HAZE_FOG);
		});
		this.kinds = [LEAF.grass, LEAF.tallgrass, LEAF.weed, LEAF.flower].map((cell) => {
			const g = clump(leafCell(cell));
			const im = new THREE.InstancedMesh(g, mat, this.cap);
			im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			im.setColorAt(0, new THREE.Color(1, 1, 1));
			im.count = 0;
			im.visible = false;
			im.frustumCulled = false;
			im.receiveShadow = true;
			scene.add(im);
			return im;
		});
	}
	invalidate(x, z, r) {
		for (const [k, t] of this.tiles) if (Math.hypot(t.x - x, t.z - z) < r) this.tiles.delete(k);
		this.focus.set(1e9, 0, 0);
	}
	tile(i, j) {
		const key = i * 100003 + j;
		let t = this.tiles.get(key);
		if (t) return t;
		const S = 4, sc = this.sc, world = sc.world;
		const R = rand((i * 73856093) ^ (j * 19349663));
		const x0 = i * S, z0 = j * S;
		const g = toGeo(x0 + S / 2, z0 + S / 2);
		const reg = region(g.lon, g.lat);
		const gr = groundAt(g.lon, g.lat, world.height(x0 + S / 2, z0 + S / 2));
		const dry = clamp(gr[3] + 0.1, 0, 1), green = gr[2];
		// (above the trees on the Kailash journey: sparse tufts of dry grass, and nothing green)
		const high = KAILASH && (reg === "tibet" || reg === "byans");
		const n = Math.round((this.low ? 34 : 80) * (0.4 + green * 0.9) * (high ? 0.4 : 1));
		const data = [];
		for (let k = 0; k < n; k++) {
			const x = x0 + R() * S, z = z0 + R() * S;
			const y = world.height(x, z);
			if (y < 0.3 || sc.roads.clearance(x, z) < 0.12 || sc.foot.hits(x, z, 0.02) || sc.precinct(x, z)) continue;
			const r = R();
			const kind = high ? (r < 0.75 ? 0 : 1) : reg === "garhwal" || reg === "sahyadri" ? (r < 0.62 ? 0 : r < 0.8 ? 2 : r < 0.9 ? 3 : 1) : reg === "deccan" || reg === "nagar" || reg === "south" || reg === "central" ? (r < 0.35 ? 0 : r < 0.8 ? 1 : 2) : r < 0.6 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3;
			const w = ((kind === 1 ? 0.7 : 0.5) + R() * 0.5) * (high ? 0.8 : 1), h = (kind === 1 ? 0.6 + R() * 0.7 : kind === 3 ? 0.35 + R() * 0.2 : 0.3 + R() * 0.35) * (high ? 0.7 : 1);
			const c = high ? new THREE.Color().setRGB(0.6, 0.5, 0.3).multiplyScalar(0.8 + R() * 0.35) : new THREE.Color().setRGB(lerp(0.24, 0.5, dry), lerp(0.36, 0.42, dry), lerp(0.12, 0.2, dry)).multiplyScalar(0.8 + R() * 0.3);
			data.push(x, y - 0.01, z, R() * 6.3, w * M, h * M, kind, c.r, c.g, c.b);
		}
		t = { x: x0 + S / 2, z: z0 + S / 2, data };
		this.tiles.set(key, t);
		return t;
	}
	update(focus, camera) {
		const dist = camera.position.distanceTo(focus);
		const on = dist < 34;
		for (const im of this.kinds) im.visible = on && im.count > 0;
		if (!on) return;
		const R0 = clamp(dist * 0.8, 6, this.low ? 12 : 18);
		this.radius.value = R0;
		this.centre.value.copy(focus);
		if (focus.distanceTo(this.focus) < 0.8 && Math.abs(R0 - (this.lastR || 0)) < 1) return;
		this.focus.copy(focus);
		this.lastR = R0;
		const S = 4;
		const i0 = Math.floor((focus.x - R0) / S), i1 = Math.floor((focus.x + R0) / S);
		const j0 = Math.floor((focus.z - R0) / S), j1 = Math.floor((focus.z + R0) / S);
		const counts = [0, 0, 0, 0];
		const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
		let made = 0;
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const cx = i * S + S / 2, cz = j * S + S / 2;
			if (Math.hypot(cx - focus.x, cz - focus.z) > R0 + 3) continue;
			const key = i * 100003 + j;
			if (!this.tiles.has(key) && made++ > 8) {
				this.focus.set(1e9, 0, 0); // finish next frame
				continue;
			}
			const d = this.tile(i, j).data;
			for (let k = 0; k < d.length; k += 10) {
				const kind = d[k + 6], im = this.kinds[kind];
				if (counts[kind] >= this.cap) continue;
				e.set(0, d[k + 3], 0);
				q.setFromEuler(e);
				m.compose(p.set(d[k], d[k + 1], d[k + 2]), q, s.set(d[k + 4], d[k + 5], d[k + 4]));
				const n = counts[kind]++;
				m.toArray(im.instanceMatrix.array, n * 16);
				im.instanceColor.setXYZ(n, d[k + 7], d[k + 8], d[k + 9]);
			}
		}
		this.kinds.forEach((im, i) => {
			im.count = counts[i];
			im.visible = counts[i] > 0;
			im.instanceMatrix.needsUpdate = true;
			im.instanceColor.needsUpdate = true;
		});
		// forget tiles far away
		if (this.tiles.size > 900) for (const [k, t] of this.tiles) if (Math.hypot(t.x - focus.x, t.z - focus.z) > 60) this.tiles.delete(k);
	}
}
// Three crossed cards, bottom-anchored, 1 x 1 (scaled per instance), normals bent up.
function clump(cell) {
	const [u0, v0, du, dv] = cell;
	const P = [], N = [], UV = [], W = [], I = [];
	for (let k = 0; k < 3; k++) {
		const a = (k / 3) * Math.PI;
		const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
		const b = P.length / 3;
		for (const [x, y, z, u, v] of [[-cx, 0, -cz, u0, v0 + dv], [cx, 0, cz, u0 + du, v0 + dv], [cx, 1, cz, u0 + du, v0], [-cx, 1, -cz, u0, v0]]) {
			P.push(x, y, z);
			N.push(-Math.sin(a) * 0.3, 0.95, Math.cos(a) * 0.3);
			UV.push(u, v);
			W.push(y);
		}
		I.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
	g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
	g.setAttribute("aSway", new THREE.Float32BufferAttribute(W, 1));
	g.setIndex(I);
	return g;
}

// Trees for the landscape: [species, weight].
const FLORA = {
	garhwal: [["pine", 6], ["deodar", 3], ["bush", 1]],
	doon: [["sal", 5], ["mango", 2], ["eucalyptus", 1], ["pine", 1], ["peepal", 0.5]],
	sahyadri: [["mango", 3], ["jamun", 3], ["banyan", 1], ["neem", 1], ["tamarind", 1], ["bush", 1.5]],
	south: [["coconut", 4], ["toddy", 3], ["neem", 2], ["tamarind", 1.5], ["acacia", 1.5], ["mango", 1], ["banyan", 0.5]],
	deccan: [["neem", 3], ["acacia", 4], ["tamarind", 1.5], ["banyan", 1], ["peepal", 0.6], ["toddy", 0.8], ["eucalyptus", 1], ["bush", 2], ["thor", 1]],
	telangana: [["toddy", 4], ["neem", 3], ["acacia", 3], ["tamarind", 1.5], ["banyan", 0.8], ["bush", 1.5], ["thor", 0.8]],
	nagar: [["neem", 4], ["acacia", 3], ["tamarind", 1.5], ["banyan", 1], ["peepal", 0.8], ["mango", 0.8], ["eucalyptus", 1], ["bush", 2]],
	central: [["neem", 3], ["mango", 2], ["acacia", 2], ["tamarind", 1], ["eucalyptus", 1], ["peepal", 0.6], ["banyan", 0.6], ["bush", 1.5]],
	gangetic: [["mango", 3], ["eucalyptus", 3], ["neem", 2], ["peepal", 1], ["banyan", 0.7], ["sal", 0.6], ["bush", 1]],
};
const AVENUE = { deccan: ["neem", "tamarind", "banyan", "neem"], nagar: ["neem", "banyan", "tamarind", "neem"], telangana: ["neem", "tamarind", "neem"], south: ["tamarind", "neem", "banyan"], central: ["neem", "mango", "tamarind"], gangetic: ["mango", "neem", "eucalyptus", "peepal"], doon: ["sal", "mango"] };
function flora(R, key) {
	const L = FLORA[key] || FLORA.deccan;
	let t = 0;
	for (const [, w] of L) t += w;
	let x = R() * t;
	for (const [k, w] of L) if ((x -= w) <= 0) return k;
	return L[0][0];
}
// Leaf colour by landscape: dusty olive in the dry Deccan, deep green in the monsoon ghats.
const LEAF_TINT = { deccan: [1.0, 0.92, 0.78], nagar: [1.0, 0.93, 0.8], telangana: [1.0, 0.94, 0.8], central: [1.0, 0.95, 0.82], south: [0.95, 1.0, 0.85], sahyadri: [0.85, 1.05, 0.85], gangetic: [0.95, 1.0, 0.88], doon: [0.9, 1.0, 0.9], garhwal: [0.95, 1.0, 0.95] };

export class Scenery {
	constructor(route, world, roads, scene, low = false) {
		this.route = route;
		this.world = world;
		this.roads = roads;
		this.low = low;
		this.group = new THREE.Group();
		this.group.name = "scenery";
		scene.add(this.group);
		this.chunks = new Map();
		this.jobs = new Map();
		this.foot = new Foot();
		this.shrines = SHRINES.map((s) => toWorld(s.lon, s.lat));
		this.cities = CITIES.map((c) => Object.assign({ w: toWorld(c.lon, c.lat) }, c));
		this.trees = new Trees(scene, low);
		// the Kailash journey's great mountains are models standing on the ground: nothing grows on them
		if (KAILASH) {
			const nb = toWorld(KP.nabhidhang[0], KP.nabhidhang[1]), kc = toWorld(K_CENTRE[0], K_CENTRE[1]);
			this.peaks = [[nb.x + OM_DIR[0] * 8 * 1, nb.z - OM_DIR[1] * 8, 5.4], [kc.x, kc.z, 7.2]];
		}
		// people and animals on the paths of the Kailash journey: drawn, but not counted as something the camera must
		// keep clear of (it follows the traveller among them along the parikrama)
		if (KAILASH) {
			this.soft = new THREE.Group();
			this.soft.name = "scenery-soft";
			scene.add(this.soft);
		}
		this.clutter = new Clutter(scene, this, low);
		this.mats = { field: fieldMaterial(), crop: cropMaterial(low), house: houseMaterial(low), sign: signMaterial(), blob: blobMaterial() };
		// compile every countryside shader up front (with its shadow variant), so none stalls a frame later
		this.warm = new THREE.Group();
		const tri = new THREE.BufferGeometry();
		tri.setAttribute("position", new THREE.Float32BufferAttribute([0, -900, 0, 0.01, -900, 0, 0, -900, 0.01], 3));
		tri.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
		tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
		tri.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
		tri.setAttribute("aSoil", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
		tri.setAttribute("aField", new THREE.Float32BufferAttribute(new Array(12).fill(0.5), 4));
		tri.setAttribute("aRect", new THREE.Float32BufferAttribute(new Array(12).fill(0.25), 4));
		tri.setAttribute("aSway", new THREE.Float32BufferAttribute([0, 0, 0], 1));
		const tri4 = tri.clone();
		tri4.setAttribute("color", new THREE.Float32BufferAttribute(new Array(12).fill(0), 4));
		for (const [m, g] of [[VCOL, tri], [this.mats.field, tri], [this.mats.crop, tri], [this.mats.house, tri], [this.mats.sign, tri], [this.mats.blob, tri4]]) {
			const mesh = new THREE.Mesh(g, m);
			mesh.frustumCulled = false;
			mesh.castShadow = mesh.receiveShadow = m !== this.mats.blob;
			this.warm.add(mesh);
		}
		scene.add(this.warm);
		this.warmFrames = 3;
		// smoothed tangents along the route, so the lateral frame does not jump between route points
		const pts = route.pts, n = pts.length;
		this.tan = new Float32Array(n * 2);
		for (let i = 0; i < n; i++) {
			const a = pts[Math.max(0, i - 6)], b = pts[Math.min(n - 1, i + 6)];
			const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
			this.tan[i * 2] = dx / l;
			this.tan[i * 2 + 1] = dz / l;
		}
		this.focus = new THREE.Vector3();
	}
	// A point `off` to the side of the route at distance s (positive to the right of travel).
	frame(s, off, out = {}) {
		const route = this.route, pts = route.pts;
		s = clamp(s, 0, route.length);
		const i = route.indexAt(s), j = Math.min(i + 1, pts.length - 1);
		const a = pts[i], b = pts[j];
		const t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
		let dx = lerp(this.tan[i * 2], this.tan[j * 2], t), dz = lerp(this.tan[i * 2 + 1], this.tan[j * 2 + 1], t);
		const l = Math.hypot(dx, dz) || 1;
		dx /= l;
		dz /= l;
		out.x = lerp(a.x, b.x, t) - dz * off;
		out.z = lerp(a.z, b.z, t) + dx * off;
		out.dx = dx;
		out.dz = dz;
		return out;
	}
	// Keep the chunks around the traveller built, a little work each frame; show the ones near the camera.
	update(s, camera) {
		if (this.warm && --this.warmFrames < 0) {
			this.warm.parent.remove(this.warm);
			this.warm = null;
		}
		const k0 = Math.floor((s - CHUNK * 1.5) / CHUNK), k1 = Math.floor((s + CHUNK * 3) / CHUNK);
		const kc = Math.floor(s / CHUNK);
		const budget = this.low ? 5 : 7;
		const t0 = performance.now();
		// nearest missing chunk first
		const want = [];
		for (let k = Math.max(0, k0); k <= k1; k++) if (k * CHUNK <= this.route.length && !this.chunks.has(k)) want.push(k);
		want.sort((a, b) => Math.abs(a - kc) - Math.abs(b - kc));
		for (const k of want) {
			if (performance.now() - t0 > budget) break;
			if (!this.jobs.has(k)) this.jobs.set(k, this.job(k));
			const job = this.jobs.get(k);
			while (performance.now() - t0 < budget) {
				const r = job.next();
				if (r.done) {
					this.jobs.delete(k);
					break;
				}
			}
		}
		// drop chunks well behind or ahead
		for (const [k, g] of this.chunks) if (k < k0 - 8 || k > k1 + 8) this.dispose(k, g);
		for (const [k, g] of this.chunks) {
			const d = camera.position.distanceTo(g.userData.centre);
			g.visible = d < 260 && k >= k0 - 4 && k <= k1 + 4;
			if (g.userData.soft) g.userData.soft.visible = g.visible;
			this.trees.setVisible(k, g.visible);
		}
		this.trees.update(camera);
		const p = this.route.at(clamp(s, 0, this.route.length), {});
		this.focus.set(p.x, p.y, p.z);
		this.clutter.update(this.focus, camera);
	}
	prebuild(s) {
		const k0 = Math.floor((s - CHUNK * 1.5) / CHUNK), k1 = Math.floor((s + CHUNK * 3) / CHUNK);
		for (let k = Math.max(0, k0); k <= k1; k++) {
			if (this.chunks.has(k) || k * CHUNK > this.route.length) continue;
			const job = this.jobs.get(k) || this.job(k);
			while (!job.next().done);
			this.jobs.delete(k);
		}
	}
	dispose(k, g) {
		this.group.remove(g);
		if (g.userData.soft) {
			this.soft.remove(g.userData.soft);
			g.userData.soft.geometry.dispose();
		}
		g.traverse((o) => o.geometry && o.geometry.dispose());
		this.chunks.delete(k);
		this.trees.remove(k);
		this.foot.remove(k);
	}
	near(x, z, margin) {
		if (this.peaks) for (const [px, pz, r] of this.peaks) if (Math.hypot(x - px, z - pz) < r + margin) return true;
		// (the Kailash journey's stops are camps and cairns, not temple towns: they keep a smaller ground)
		for (const w of this.shrines) if (Math.hypot(x - w.x, z - w.z) < (KAILASH ? 4.6 : 12) + margin) return true;
		const sp = this.roads.shrinePos, cr = this.roads.clearR;
		if (sp) for (let i = 0; i < sp.length; i++) if (Math.hypot(x - sp[i].x, z - sp[i].z) < (cr[i] || 9) + 1 + margin) return true;
		return false;
	}
	// inside a temple's paved courtyard and approach
	precinct(x, z) {
		for (const w of this.shrines) if (Math.hypot(x - w.x, z - w.z) < (KAILASH ? 4.2 : 7.5)) return true;
		if (this.peaks) for (const [px, pz, r] of this.peaks) if (Math.hypot(x - px, z - pz) < r) return true;
		return false;
	}
	ok(x, z, margin = 0.3) {
		if (this.near(x, z, margin)) return false;
		if (this.world.height(x, z) < 0.3) return false;
		return this.roads.clearance(x, z) > margin;
	}
	// The chunk builder: a generator, so its work can be spread across frames.
	*job(k) {
		const R = rand(k * 7919 + 17);
		const route = this.route, world = this.world;
		const s0 = k * CHUNK, s1 = Math.min(route.length, s0 + CHUNK);
		const mid = route.at((s0 + s1) / 2, {});
		const geo = toGeo(mid.x, mid.z);
		const reg = region(geo.lon, geo.lat);
		const land = landOf(reg, geo.lon);
		const style = styleOf(reg, geo.lon);
		const lang = langAt(geo.lon, geo.lat);
		const plains = reg === "deccan" || reg === "nagar" || reg === "central" || reg === "gangetic" || reg === "south";
		const low = this.low;
		const dens = low ? 0.55 : 1;
		const tint = LEAF_TINT[style] || LEAF_TINT[reg] || [1, 1, 1];
		let town = 0;
		for (const c of this.cities) {
			const d = Math.hypot(c.w.x - mid.x, c.w.z - mid.z);
			town = Math.max(town, clamp(1 - d / (8 + c.size * 6), 0, 1) * c.size);
		}
		const trees = [];
		const blobs = new BlobGeo();
		const ctx = {
			R, k, s0, s1, world, lang,
			frame: (s, off, out) => this.frame(s, off, out),
			height: (x, z) => world.height(x, z),
			ok: (x, z, m) => this.ok(x, z, m),
			taken: (x, z, r) => this.foot.hits(x, z, r),
			claim: (pts) => this.foot.poly(k, pts),
			claimCircle: (x, z, r) => this.foot.circle(k, x, z, r),
			b: new Batch(),
			soft: new Batch(),
			hg: new HouseGeo(),
			sg: new HouseGeo(),
			fields: new FieldGeo(),
			strips: new StripGeo(),
			stripCap: low ? 2500 : 7000,
			blob: (x, z, r, a) => blobs.add(world, x, z, 0, r * 2, r * 2, a),
			blobRect: (x, z, yaw, w, d, a) => blobs.add(world, x, z, yaw, w, d, a),
			tree: (x, z, kind, sc = 1, painted = false) => {
				// above the tree line on the Kailash journey (the Byans valley, Tibet): scrub only; and on the drawn map
				// the lower Kali valley's pines stand a few units from the camps above, so the tree line is a height too
				if (KAILASH) {
					const yy = world.height(x, z);
					if (yy > (kind === "bush" ? 53 : 45.5)) return 0;
					if (kind !== "bush") {
						const g = toGeo(x, z), rg = region(g.lon, g.lat);
						if (rg === "byans" || rg === "tibet") return 0;
						// (nor up the Kali gorge above Malpa, whose sides are bare rock and scree under the camps)
						if (g.lat > 30.0 && g.lon > 80.6) return 0;
					}
				}
				const ki = this.trees.kind(kind, R);
				const s = sc * (0.75 + R() * 0.4);
				// the whole crown keeps clear of the road, the line and its wires, not just the trunk
				if (!painted && this.roads.clearance(x, z) < this.trees.radius(ki) * s * 1.05 + 0.15) return 0;
				// and a little more off a path on foot, so the camera following a pilgrim along it is not in the leaves
				if (this.roads.footDist(x, z) < this.trees.radius(ki) * s + 1.9) return 0;
				const v = 0.82 + R() * 0.3;
				const y = world.height(x, z);
				trees.push(x, y - 0.03, z, R() * 6.3, s, s * (0.88 + R() * 0.24), ki, v * tint[0], v * tint[1] * (0.95 + R() * 0.1), v * tint[2], painted ? 1 : 0);
				const r = this.trees.radius(ki) * s;
				const palm = kind === "coconut" || kind === "toddy";
				blobs.add(world, x, z, 0, r * (palm ? 0.9 : 1.5), r * (palm ? 0.9 : 1.5), palm ? 0.3 : kind === "bush" || kind === "thor" ? 0.45 : 0.38);
				return r;
			},
			lane: (pts, w, col) => this.lane(ctx, k, pts, w, col),
			yard: (x, z, yaw, w, d) => {
				const cs = Math.cos(yaw), sn = Math.sin(yaw);
				const corner = (u, v) => ({ x: x + u * cs + v * sn, z: z - u * sn + v * cs });
				const a = corner(-w / 2, -d / 2), b = corner(w / 2, -d / 2), c = corner(w / 2, d / 2), e = corner(-w / 2, d / 2);
				this.decal(ctx, [a, b, c, e], C(0xb4a184), 0.042);
				this.foot.poly(k, [a, b, c, e]);
			},
		};
		yield;
		// above the trees on the Kailash journey (the Byans valley and the Tibetan plateau): its own country
		if (KAILASH && (reg === "tibet" || reg === "byans")) yield* kailashCountry(this, ctx, reg);
		else {
		// ---------- villages first, so the fields make room for them ----------
		const nv = plains ? 1 + (R() < 0.5 ? 1 : 0) + (town > 0.3 ? 1 : 0) : reg === "garhwal" ? (R() < 0.55 ? 1 : 0) : 1;
		for (let v = 0; v < nv; v++) {
			const side = R() < 0.5 ? -1 : 1;
			const c = { s: s0 + 4 + R() * (s1 - s0 - 8), v: 7 + R() * (town ? 4 : 9), side };
			const n = Math.round((10 + R() * 12 + town * 12) * dens);
			village(ctx, c, n, style, { town, treeKind: (r) => flora(r, style) });
			yield;
		}
		// ---------- a dhaba on the highway ----------
		if (R() < 0.5) {
			this.dhaba(ctx, s0 + R() * (s1 - s0), R() < 0.5 ? -1 : 1, style);
			yield;
		}
		// ---------- fields ----------
		const plots = [];
		for (const side of [-1, 1]) {
			plots.push(...(yield* layFields(ctx, side, land)));
		}
		// field life: orchards in rows, people at work, cattle grazing the stubble, trees on the bunds
		let pi = 0;
		for (const P of plots) {
			if (++pi % 8 === 0) yield;
			if (P.orchard) {
				const sp = { bush: 1.6, mango: 3, coconut: 2.4 }[P.orchard] || 2.5;
				const kind = P.orchard === "bush" ? "bush" : P.orchard;
				const { G, na, nb } = P.grid;
				const step = Math.max(1, Math.round(sp / 1.4));
				for (let j = 1; j < nb; j += step) for (let i = 1; i < na; i += step) {
					const p = G[j * (na + 1) + i];
					if (this.ok(p.x, p.z, 0.3)) ctx.tree(p.x, p.z, kind, kind === "bush" ? 1.3 : kind === "mango" ? 0.85 : 1);
				}
				continue;
			}
			const r = R();
			const c = P.centre;
			const y = world.height(c.x, c.z);
			if (r < 0.14 && P.crop.cover > 0 && !P.crop.tall) {
				for (let q = 0; q < 1 + Math.floor(R() * 3); q++) {
					const x = c.x + (R() - 0.5) * 2, z = c.z + (R() - 0.5) * 2;
					addPerson(ctx.b, R, x, (P.flatY ?? world.height(x, z)) + 0.03, z, R() * 6.3);
				}
			} else if (r < 0.3 && (P.crop.cover < 0.5 || P.use === "stubble" || P.use === "fallow")) {
				const herd = 1 + Math.floor(R() * 4);
				const kind = reg === "garhwal" ? "goat" : reg === "gangetic" && R() < 0.5 ? "buffalo" : R() < 0.2 ? "goat" : "cow";
				for (let q = 0; q < herd; q++) {
					const x = c.x + (R() - 0.5) * 3, z = c.z + (R() - 0.5) * 3;
					addAnimal(ctx.b, kind, R, x, (P.flatY ?? world.height(x, z)) + 0.03, z, R() * 6.3);
					if (kind === "goat") for (let g = 0; g < 3; g++) addAnimal(ctx.b, "goat", R, x + (R() - 0.5), (P.flatY ?? world.height(x, z)) + 0.03, z + (R() - 0.5), R() * 6.3);
				}
				if (R() < 0.5) addPerson(ctx.b, R, c.x + 1.2, y, c.z + 0.8, R() * 6.3);
			} else if (r < 0.38 && plains && (P.use === "stubble" || P.use === "ploughed" || P.use === "jowar")) {
				// a haystack at the corner of the field
				const q = P.ring[Math.floor(R() * P.ring.length)];
				const x = lerp(q.x, c.x, 0.2), z = lerp(q.z, c.z, 0.2);
				if (this.ok(x, z, 0.5)) haystack(ctx.b, R, x, world.height(x, z), z, reg === "gangetic");
			}
			// a tree or two on the bund
			if (R() < (plains ? 0.35 : 0.2)) {
				const q = P.ring[Math.floor(R() * P.ring.length)];
				if (this.ok(q.x, q.z, 0.4)) ctx.tree(q.x, q.z, flora(R, style));
			}
		}
		yield;
		// ---------- avenue trees with painted trunks along the highway ----------
		if (plains || reg === "doon") {
			const av = AVENUE[style] || AVENUE[reg] || ["neem"];
			for (let s = s0; s < s1; s += 1.6) {
				const r = this.roads.road(s);
				if (!r || r.kind !== "nh" || r.bridge > 0.1 || R() < 0.3) continue;
				for (const sg of [-1, 1]) {
					if (R() < 0.2) continue;
					const off = sg * (2.0 + R() * 0.35);
					const x = r.x - r.dz * off, z = r.z + r.dx * off;
					if (!this.ok(x, z, 0.1) || this.foot.hits(x, z, 0.15)) continue;
					ctx.tree(x, z, pick(R, av), 0.9, true);
				}
			}
		}
		// ---------- groves, scrub and forest on the land left over ----------
		const nt = Math.round((reg === "garhwal" ? 150 : reg === "sahyadri" ? 160 : reg === "doon" ? 120 : 70) * dens);
		for (let i = 0; i < nt; i++) {
			const s = s0 + R() * (s1 - s0), off = (R() < 0.5 ? -1 : 1) * (2.4 + Math.pow(R(), 0.7) * 32);
			const c = this.frame(s, off, {});
			if (!this.ok(c.x, c.z, 0.5) || this.foot.hits(c.x, c.z, 0.5)) continue;
			const n = 1 + Math.floor(R() * (reg === "garhwal" || reg === "sahyadri" ? 6 : 3));
			const kind = flora(R, style);
			for (let j = 0; j < n; j++) {
				const x = c.x + (R() - 0.5) * 3, z = c.z + (R() - 0.5) * 3;
				if (!this.ok(x, z, 0.6) || this.foot.hits(x, z, 0.4)) continue;
				const r = ctx.tree(x, z, j && R() < 0.5 ? kind : flora(R, style));
				this.foot.circle(k, x, z, Math.min(r * 0.35, 0.8));
			}
		}
		// thor hedges along field edges on the Deccan
		if (style === "deccan" || style === "nagar" || style === "telangana" || style === "central") {
			for (const P of plots) {
				if (R() > 0.18 || !P.ring) continue;
				const a = Math.floor(R() * P.ring.length);
				for (let q = 0; q < 6; q++) {
					const p = P.ring[(a + q) % P.ring.length];
					if (this.ok(p.x, p.z, 0.25)) ctx.tree(p.x, p.z, R() < 0.6 ? "thor" : "bush", 0.9);
				}
			}
		}
		yield;
		// ---------- Deccan boulders, Gangetic brick kilns ----------
		if ((style === "telangana" || reg === "south" || (style === "deccan" && R() < 0.3)) && R() < 0.85) {
			for (let i = 0; i < 3; i++) {
				const c = this.frame(s0 + R() * CHUNK, (R() < 0.5 ? -1 : 1) * (4 + R() * 24), {});
				if (!this.ok(c.x, c.z, 1.5) || this.foot.hits(c.x, c.z, 1.5)) continue;
				this.boulders(ctx, c.x, c.z, R);
				this.foot.circle(k, c.x, c.z, 1.6);
			}
		}
		if (reg === "gangetic" && R() < 0.35) {
			const c = this.frame(s0 + R() * CHUNK, (R() < 0.5 ? -1 : 1) * (10 + R() * 14), {});
			if (this.ok(c.x, c.z, 3) && !this.foot.hits(c.x, c.z, 3)) {
				this.kiln(ctx, c.x, c.z, R);
				this.foot.circle(k, c.x, c.z, 3);
			}
		}
		// the Kailash journey's hill roads: a hermit's cave, a sadhu on the way
		if (KAILASH && reg === "garhwal") yield* kumaonWayside(this, ctx);
		}
		yield;
		// ---------- build the meshes ----------
		const g = new THREE.Group();
		if (!ctx.b.empty) g.add(yield* ctx.b.buildGen(VCOL, low ? 20000 : 40000));
		if (!ctx.soft.empty) {
			g.userData.soft = ctx.soft.build(VCOL);
			this.soft.add(g.userData.soft);
		}
		yield;
		if (!ctx.hg.empty) g.add(ctx.hg.build(this.mats.house));
		if (!ctx.sg.empty) g.add(ctx.sg.build(this.mats.sign, true));
		yield;
		if (!ctx.fields.empty) g.add(ctx.fields.build(this.mats.field));
		yield;
		if (!ctx.strips.empty) g.add(ctx.strips.build(this.mats.crop));
		if (blobs.idx.length) g.add(blobs.build(this.mats.blob));
		g.userData.centre = new THREE.Vector3(mid.x, mid.y, mid.z);
		this.group.add(g);
		this.chunks.set(k, g);
		this.trees.add(k, new Float32Array(trees), trees.length / TREE_STRIDE);
		this.clutter.invalidate(mid.x, mid.z, CHUNK * 0.75 + 36);
	}
	// A dirt lane: a draped strip, claimed so nothing else is built on it.
	lane(ctx, k, pts, w, col) {
		const n = pts.length;
		const L = [], Rr = [];
		for (let i = 0; i < n; i++) {
			const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
			let dx = b.x - a.x, dz = b.z - a.z;
			const l = Math.hypot(dx, dz) || 1;
			dx /= l;
			dz /= l;
			L.push({ x: pts[i].x - dz * w / 2, z: pts[i].z + dx * w / 2 });
			Rr.push({ x: pts[i].x + dz * w / 2, z: pts[i].z - dx * w / 2 });
		}
		const f = ctx.fields;
		const base = f.p.length / 3;
		const soil = col.clone();
		for (let i = 0; i < n; i++) {
			for (const q of [L[i], Rr[i]]) f.vert(q.x, this.world.height(q.x, q.z) + 0.045, q.z, soil, soil, 0, 1, 0, 0.5);
		}
		for (let i = 0; i < n - 1; i++) {
			const a = base + i * 2;
			// keep the winding facing up
			const cr = (Rr[i].x - L[i].x) * (L[i + 1].z - L[i].z) - (Rr[i].z - L[i].z) * (L[i + 1].x - L[i].x);
			if (cr < 0) f.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
			else f.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
			this.foot.poly(k, [L[i], Rr[i], Rr[i + 1], L[i + 1]]);
		}
	}
	// A flat draped quad of packed earth (a swept yard).
	decal(ctx, q, col, lift) {
		const f = ctx.fields;
		const base = f.p.length / 3;
		const N = 3;
		for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
			const u = i / N, v = j / N;
			const x = lerp(lerp(q[0].x, q[1].x, u), lerp(q[3].x, q[2].x, u), v), z = lerp(lerp(q[0].z, q[1].z, u), lerp(q[3].z, q[2].z, u), v);
			f.vert(x, this.world.height(x, z) + lift, z, col, col, 0, 1, 0, 0.5);
		}
		const cr = (q[1].x - q[0].x) * (q[3].z - q[0].z) - (q[1].z - q[0].z) * (q[3].x - q[0].x);
		for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
			const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
			if (cr < 0) f.idx.push(a, b, c, b, d, c);
			else f.idx.push(a, c, b, b, c, d);
		}
	}
	// A dhaba on the highway: a tin-roofed shop with its painted board, charpais out front and a truck.
	dhaba(ctx, s, side, style) {
		const R = ctx.R, world = this.world;
		const r = this.roads.road(s);
		if (!r || r.kind === "trek" || r.bridge) return;
		const v = 2.35 + 0.9;
		const p = this.frame(s, v * side, {}), q = this.frame(s, (v - 1) * side, {});
		const yaw = Math.atan2(q.x - p.x, q.z - p.z);
		const o = { x: p.x, z: p.z, yaw, W: 6 + R() * 2, D: 5 };
		for (const [x, z] of footprint(o, 0.3)) if (!this.ok(x, z, 0.1) || this.foot.hits(x, z, 0.1)) return;
		const fit = houseFits(world, o);
		if (!fit) return;
		Object.assign(o, { fit, wall: "plaster", floors: 1, roof: "tin", paint: pick(R, [0xf2d36a, 0x9fd3c0, 0xf2a7b8, 0xf0ece4]), shop: true, sign: signCell(ctx.lang, ctx.lang === "en" ? 0 : ctx.lang === "hi" ? 2 : 1) });
		if (!house(ctx.hg, ctx.sg, ctx.b, world, R, o)) return;
		this.foot.poly(ctx.k, footprint(o, 0.1));
		ctx.blobRect(o.x, o.z, yaw, (o.W + 2) * 0.28, (o.D + 2) * 0.28, 0.4);
		const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
		// charpais (string beds) and a bench out front
		for (let i = 0; i < 3; i++) {
			const u = (i - 1) * 1.9 * M, d = (o.D / 2 + 1.1) * M;
			const x = o.x + fx * d + rx * u, z = o.z + fz * d + rz * u;
			const y = world.height(x, z);
			ctx.b.add(T.box, place(x, y + 0.42 * M, z, yaw + Math.PI / 2, 1.9 * M, 0.08 * M, 0.95 * M), 0xc9a870);
			for (const [a, c] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) ctx.b.add(T.box, place(x + rx * a * M * 0 + fx * a * M + rx * c * M, y, z + rz * c * M + fz * a * M, yaw, 0.07 * M, 0.45 * M, 0.07 * M), 0x6a4a2e);
			if (R() < 0.6) addPerson(ctx.b, R, x + rx * 0.3, y + 0.1 * M, z + rz * 0.3, yaw + Math.PI);
		}
		// a truck pulled over
		if (R() < 0.7) {
			const d = (o.D / 2 + 3.2) * M;
			const tb = parkedVehicle("truck", R);
			const x = o.x + fx * d + rx * (o.W * 0.8) * M, z = o.z + fz * d + rz * (o.W * 0.8) * M;
			if (this.ok(x, z, 0.3)) {
				const wm = place(x, world.height(x, z), z, yaw + Math.PI / 2, M, M, M).clone();
				for (const part of tb.parts) ctx.b.add(part.geo, new THREE.Matrix4().multiplyMatrices(wm, part.m), part.c);
			}
		}
	}
	// A tor of rounded granite boulders, as round Hyderabad and Kurnool.
	boulders(ctx, x, z, R) {
		const y = this.world.height(x, z);
		const n = 4 + Math.floor(R() * 5);
		for (let j = 0; j < n; j++) {
			const sz = 0.5 + R() * 1.5;
			const a = R() * 6.3, d = R() * 1.2;
			const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
			const by = this.world.height(bx, bz) - sz * 0.25 + (j > n / 2 ? sz * 0.5 : 0);
			ctx.b.add(ROCK, place(bx, by, bz, R() * 6, sz, sz * (0.6 + R() * 0.35), sz * (0.75 + R() * 0.35), (R() - 0.5) * 0.4), C(0x9a8f86).offsetHSL(0, 0, (R() - 0.5) * 0.1));
		}
		ctx.blob(x, z, 2.2, 0.35);
		void y;
	}
	// A Bull's trench brick kiln: the long oval of stacked bricks and its tall tapering chimney.
	kiln(ctx, x, z, R) {
		const y = this.world.height(x, z);
		const yaw = R() * 3;
		const b = ctx.b;
		b.add(T.cyl12, place(x, y - 0.1, z, yaw, 9 * M * 2, 1.6 * M, 4 * M * 2), 0x8a4a32);
		b.add(T.cyl12, place(x, y + 1.5 * M - 0.1, z, yaw, 8 * M * 2, 0.3 * M, 3.2 * M * 2), 0x5a4a40);
		b.add(T.taper, place(x, y, z, 0, 2.6 * M, 28 * M, 2.6 * M), 0x8a3e2a);
		b.add(T.cyl, place(x, y + 28 * M, z, 0, 1.6 * M, 0.6 * M, 1.6 * M), 0x2a2420);
		// green bricks drying in rows
		for (let j = 0; j < 8; j++) {
			const u = (j - 3.5) * 1.6 * M;
			const px = x + Math.cos(yaw) * 0 + Math.sin(yaw + Math.PI / 2) * u + 3.5, pz = z + Math.cos(yaw + Math.PI / 2) * u;
			if (this.ok(px, pz, 0.2)) b.add(T.box, place(px, this.world.height(px, pz), pz, yaw, 6 * M, 0.9 * M, 0.5 * M), 0xa86a4a);
		}
		ctx.blob(x, z, 4, 0.3);
	}
}
// A lumpy rounded rock.
const ROCK = (() => {
	const g = new THREE.IcosahedronGeometry(0.5, 2);
	const p = g.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const k = 1 + Math.sin(x * 7 + y * 5) * 0.06 + Math.cos(z * 6 - x * 3) * 0.05;
		p.setXYZ(i, x * k, y * k, z * k);
	}
	g.translate(0, 0.5, 0);
	const n = g.index ? g.toNonIndexed() : g;
	n.deleteAttribute("uv");
	n.computeVertexNormals();
	return n;
})();
