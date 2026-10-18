// The wild life of the Kailash country, which moves (main.js builds it once on kailash.html and calls update each
// frame). All of it is what is really there in summer, placed by description, not from sightings at these spots:
// - Himalayan griffon vultures (Gyps himalayensis, wingspan about 2.6 to 3.1 m) and lammergeiers (Gypaetus barbatus,
//   about 2.8 m, flat-winged, with a long wedge tail) soaring in slow circles over the north face and the valleys of
//   the kora, where the sky-burial ground above the path draws them;
// - red-billed choughs (Pyrrhocorax pyrrhocorax), flocks wheeling and tumbling over the camps at Dirapuk and the
//   Dolma La;
// - bar-headed geese (Anser indicus) and ruddy shelducks (Tadorna ferruginea), which breed on Mansarovar, in rafts
//   and pairs on the water, and now and then a V of geese flying across the lake;
// - kiang (Equus kiang), the Tibetan wild ass, in small herds on the Barkha plain between the lakes and Darchen,
//   grazing and now and then trotting off together; bharal (blue sheep) on the slopes of the Lha Chu valley;
//   Himalayan marmots sitting up by their burrows on the grassy valley floors; a Tibetan fox on the steppe.
// Everything is drawn to the pilgrims' scale (M, world units to the metre); the birds fly a few units over the
// ground, as the relief is exaggerated many times. Nothing is solid: the camera's checks look through it all.
import * as THREE from "three";
import { haze, patch } from "./batch.js";
import { toWorld, toGeo } from "./geo.js";
import { KAILASH, KORA, LAKES, P } from "./kailash-geo.js";
import { wayDist } from "./kailash-landmarks.js";
import { lakeDist } from "./kailash-world.js";
import { FLAG_TIME } from "./kailash-scenery.js";
import { PLACED, bharal, fox, kiang, marmot, standable } from "./life.js";
import { lerp, rand } from "./util.js";

const M = 0.28;
const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const W = (pt) => toWorld(pt[0], pt[1]);
const noRay = () => {};

// ---------- birds ----------
// A bird as a few flat facets, facing +z, wings along x, in metres; aWing is how far out along the wing a vertex
// lies (m), which the shader lifts by the instance's flap (iFlap, -1..1) and the species' dihedral.
function birdGeo(o) {
	const P = [], C = [], A = [];
	const col = (h) => new THREE.Color(h);
	const tri = (a, b, c, h, wa = 0, wb = 0, wc = 0) => {
		const k = col(h);
		P.push(...a, ...b, ...c);
		for (let i = 0; i < 3; i++) C.push(k.r, k.g, k.b);
		A.push(wa, wb, wc);
	};
	const L = o.len, bw = o.bw || L * 0.12, bh = bw * 0.85;
	// the body: a rounded spindle of hexagonal rings from the breast to the vent
	const rings = [[L * 0.5, 0.15], [L * 0.3, 0.85], [0, 1], [-L * 0.25, 0.8], [-L * 0.42, 0.2]].map(([z, k]) => {
		const r = [];
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			r.push([Math.cos(a) * bw * k, Math.sin(a) * bh * k, z]);
		}
		return r;
	});
	for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < 6; i++) {
		const a = rings[j][i], b = rings[j][(i + 1) % 6], c = rings[j + 1][i], d = rings[j + 1][(i + 1) % 6];
		const h = a[1] + b[1] < 0 ? o.belly || o.body : o.body;
		tri(a, c, b, h);
		tri(b, c, d, h);
	}
	// the head: on a long neck held up for a bird on the water, held out ahead in flight
	const hs = bw * (o.upright ? 0.33 : 0.55), up = o.upright ? (o.neck || 0.1) : 0, hz = L * (o.upright ? 0.42 : 0.5) + (o.upright ? 0 : o.neck || 0), hy = up + (o.upright ? bh * 0.5 : 0);
	const base = [0, o.upright ? bh * 0.4 : 0, L * (o.upright ? 0.36 : 0.4)], top = [0, hy, hz], nw = bw * 0.2;
	// (a square prism, its sides across the neck's line: x, and up or forward as the neck runs)
	if (o.neck) {
		const sq = (c, u) => [[c[0] + nw, c[1], c[2]], [c[0], c[1] + u[0] * nw, c[2] + u[1] * nw], [c[0] - nw, c[1], c[2]], [c[0], c[1] - u[0] * nw, c[2] - u[1] * nw]];
		const u = o.upright ? [0, 1] : [1, 0], A0 = sq(base, u), A1 = sq(top, u);
		for (let i = 0; i < 4; i++) {
			tri(A0[i], A1[i], A0[(i + 1) % 4], o.neckCol || o.body);
			tri(A0[(i + 1) % 4], A1[i], A1[(i + 1) % 4], o.neckCol || o.body);
		}
	}
	for (const [a, b] of [[[hs, 0, 0], [0, hs, 0]], [[0, hs, 0], [-hs, 0, 0]], [[-hs, 0, 0], [0, -hs, 0]], [[0, -hs, 0], [hs, 0, 0]]]) {
		tri([a[0], hy + a[1], hz - hs], [b[0], hy + b[1], hz - hs], [0, hy, hz + hs], o.head || o.body);
		tri([b[0], hy + b[1], hz - hs], [a[0], hy + a[1], hz - hs], [0, hy, hz - hs * 1.6], o.head || o.body);
	}
	if (o.bill) for (const s of [1, -1]) tri([s * hs * 0.4, hy, hz + hs * 0.7], [0, hy - hs * 0.35, hz + hs * 0.7], [0, hy - hs * 0.15, hz + hs * 2.2], o.bill);
	// the tail: a wedge or a diamond
	const tl = o.tailLen || L * 0.3, tw = o.tailW || L * 0.18;
	if (o.diamond) {
		tri([tw, 0, -L * 0.3 - tl * 0.45], [0, 0, -L * 0.3 - tl], [0, 0, -L * 0.3], o.wingOut);
		tri([-tw, 0, -L * 0.3 - tl * 0.45], [0, 0, -L * 0.3], [0, 0, -L * 0.3 - tl], o.wingOut);
	} else tri([tw, 0, -L * 0.3 - tl], [-tw, 0, -L * 0.3 - tl], [0, 0, -L * 0.25], o.tail || o.body);
	// the wings: an inner panel to the wrist and the hand beyond, swept back a little, in two colours
	if (o.span) for (const s of [-1, 1]) {
		const h = o.span / 2, c = o.chord || L * 0.38, wr = h * 0.48, sw = o.sweep || 0.08;
		const r0 = [s * bw * 0.8, 0, c * 0.45], r1 = [s * bw * 0.8, 0, -c * 0.55];
		const w0 = [s * wr, 0, c * 0.45 - sw * h], w1 = [s * wr, 0, -c * 0.6 - sw * h];
		const t0 = [s * h, 0, c * 0.05 - sw * h * 2], t1 = [s * h * 0.96, 0, -c * (o.fingers ? 0.45 : 0.15) - sw * h * 2];
		tri(r0, w0, r1, o.wingIn, bw * 0.8, wr, bw * 0.8);
		tri(r1, w0, w1, o.wingIn, bw * 0.8, wr, wr);
		tri(w0, t0, w1, o.wingOut, wr, h, wr);
		tri(w1, t0, t1, o.wingOut, wr, h, h * 0.96);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
	g.setAttribute("aWing", new THREE.Float32BufferAttribute(A, 1));
	g.computeVertexNormals();
	return g;
}
const SPECIES = {
	// the griffon: pale buff body and coverts, dark flight feathers and tail, a pale ruff; soars on wings held a little up
	griffon: { len: 1.05, span: 2.8, chord: 0.62, body: 0xcdb187, belly: 0xd8c09a, head: 0xe8dcc4, wingIn: 0xc8a878, wingOut: 0x2e2620, tail: 0x2e2620, dih: 0.12, fingers: true },
	// the lammergeier: dark slate wings and long diamond tail, rusty-orange underparts and head; flat wings
	lammergeier: { len: 1.1, span: 2.75, chord: 0.5, body: 0xc8783a, belly: 0xd88a48, head: 0xe8c8a0, wingIn: 0x3a3836, wingOut: 0x2e2c2a, diamond: true, tailLen: 0.55, tailW: 0.16, dih: 0.0, sweep: 0.14 },
	// the chough: all black, a red bill, broad fingered wings
	chough: { len: 0.4, span: 0.8, chord: 0.18, body: 0x141414, wingIn: 0x161616, wingOut: 0x101010, bill: 0xc8261c, dih: 0.04, fingers: true },
	// the bar-headed goose in flight: pale grey, a white head, long neck
	gooseFly: { len: 0.75, span: 1.5, chord: 0.26, neck: 0.18, body: 0xb8b6b0, belly: 0xd0cec8, neckCol: 0x5a5a58, head: 0xf0efe8, bill: 0xe0a020, wingIn: 0xb0aea8, wingOut: 0x4a4a48, dih: 0.03 },
	// on the water, wings folded: the goose, and the ruddy shelduck, orange-chestnut with a pale head
	goose: { len: 0.75, bw: 0.17, neck: 0.3, upright: true, body: 0xb8b6b0, belly: 0x9a9894, neckCol: 0x5a5a58, head: 0xf0efe8, bill: 0xe0a020, tail: 0x9a9894 },
	shelduck: { len: 0.62, bw: 0.15, neck: 0.14, upright: true, body: 0xc0622a, belly: 0xa8522a, head: 0xe8c8a0, bill: 0x1a1a1a, tail: 0x1a1a1a },
};
function birdMat(dih) {
	const m = haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
	return patch(m, `bird${dih}`, (s) => {
		s.vertexShader = "attribute float aWing;\nattribute float iFlap;\n" + s.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
			transformed.y += aWing * (iFlap * 0.62 + ${dih.toFixed(3)});`);
	});
}
class Flock {
	constructor(scene, kind, n) {
		const g = birdGeo(SPECIES[kind]);
		this.flap = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
		this.flap.setUsage(THREE.DynamicDrawUsage);
		g.setAttribute("iFlap", this.flap);
		this.mesh = new THREE.InstancedMesh(g, birdMat(SPECIES[kind].dih || 0), n);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.frustumCulled = false;
		this.mesh.raycast = noRay;
		this.mesh.name = `bird-${kind}`;
		this.mesh.count = 0;
		this.n = n;
		scene.add(this.mesh);
	}
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function setBird(f, i, x, y, z, yaw, bank, pitch, flap, size = M) {
	_e.set(pitch, yaw, bank, "YXZ");
	_m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(size, size, size));
	f.mesh.setMatrixAt(i, _m);
	f.flap.array[i] = flap;
}

// ---------- the animals that move ----------
const AMAT = haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
function mesh(geo, group) {
	const m = new THREE.Mesh(geo, AMAT);
	m.raycast = noRay;
	m.scale.setScalar(M);
	group.add(m);
	return m;
}

export class Wildlife {
	constructor(scene, world, low = false) {
		this.world = world;
		this.low = low;
		this.t = 0;
		const R = rand(8128);
		const H = (x, z) => world.height(x, z);
		const stands = (x, z, r) => standable(H, x, z, r);
		const inLake = (x, z) => {
			const g = toGeo(x, z);
			return Math.min(...LAKES.map((L) => lakeDist(L, g.lon, g.lat)));
		};
		this.group = new THREE.Group();
		this.group.name = "wildlife";
		scene.add(this.group);
		// the highest ground under a circle, so a soaring bird never flies into the hillside
		const top = (cx, cz, r) => {
			let h = -Infinity;
			for (let a = 0; a < 16; a++) for (const k of [0.5, 1]) h = Math.max(h, H(cx + Math.cos(a / 2.55) * r * k, cz + Math.sin(a / 2.55) * r * k));
			return h;
		};

		// --- the soaring birds: each circles its centre on its own radius and height, two to four to a thermal ---
		this.soar = [];
		const K = W(KAILASH), D = W(P.dirapuk), DL = W(P.dolmaLa);
		const thermals = [
			// over the north face, between Dirapuk and the mountain, in the darshan's view
			[lerp(D.x, K.x, 0.32), lerp(D.z, K.z, 0.32), 3, "griffon"],
			[lerp(D.x, K.x, 0.2) + 1.5, lerp(D.z, K.z, 0.2) - 1, 2, "lammergeier"],
			// up the Lha Chu valley and over the Dolma La
			[W(KORA.west[2]).x, W(KORA.west[2]).z, 3, "griffon"],
			[W(KORA.west[4]).x, W(KORA.west[4]).z, 2, "lammergeier"],
			[lerp(DL.x, K.x, 0.15), lerp(DL.z, K.z, 0.15), 2, "griffon"],
			[W(KORA.east[4]).x, W(KORA.east[4]).z, 2, "griffon"],
			[W(P.darchen).x, W(P.darchen).z - 3, 2, "griffon"],
		].slice(0, low ? 4 : 99);
		const nOf = (k) => thermals.filter((t) => t[3] === k).reduce((a, t) => a + t[2], 0);
		this.raptors = { griffon: new Flock(scene, "griffon", nOf("griffon")), lammergeier: new Flock(scene, "lammergeier", nOf("lammergeier")) };
		for (const [cx, cz, n, kind] of thermals) for (let i = 0; i < n; i++) {
			const r = 1.2 + R() * 1.8;
			this.soar.push({ f: this.raptors[kind], cx, cz, r, y: top(cx, cz, r + 0.5) + 1.6 + R() * 2.2 + i * 0.4, w: (0.12 + R() * 0.08) / r * (R() < 0.5 ? 1 : -1), a: R() * 6.3, ph: R() * 50 });
		}

		// --- the choughs: flocks wheeling over the camp, each bird on its own loop round the flock ---
		this.chough = [];
		const cn = low ? 8 : 18;
		const flocks = [[D.x, D.z], [DL.x, DL.z]].slice(0, low ? 1 : 2);
		this.choughs = new Flock(scene, "chough", cn * flocks.length);
		for (const [x, z] of flocks) {
			const base = top(x, z, 2.2) + 0.8;
			const fl = { x, z, y: base, a: R() * 6, birds: [] };
			for (let i = 0; i < cn; i++) fl.birds.push({ r: 0.3 + R() * 0.9, w: (1.4 + R() * 0.8) * (R() < 0.8 ? 1 : -1), a: R() * 6.3, dy: (R() - 0.5) * 0.8, ph: R() * 20 });
			this.chough.push(fl);
		}

		// --- Mansarovar: rafts of geese and pairs of shelducks on the water near the shore, a V of geese crossing ---
		const man = LAKES.find((L) => L.name === "Mansarovar");
		this.level = man.level;
		this.swim = [];
		const onWater = (ax, az, spread, tries = 60) => {
			for (let t = 0; t < tries; t++) {
				const x = ax + (R() - 0.5) * spread, z = az + (R() - 0.5) * spread, d = inLake(x, z);
				if (d < -0.35 && d > -2.5) return [x, z];
			}
			return null;
		};
		const geese = new Flock(scene, "goose", low ? 14 : 30), ducks = new Flock(scene, "shelduck", low ? 8 : 16);
		this.swimmers = [geese, ducks];
		for (const anchor of [P.qugu, P.chiu, P.hor, [81.36, 30.6]].slice(0, low ? 2 : 4)) {
			const w = W(anchor), c = onWater(w.x, w.z, 4);
			if (!c) continue;
			for (let i = 0; i < (low ? 6 : 8) && geese.mesh.count < geese.n; i++) {
				const q = onWater(c[0], c[1], 0.9);
				if (q) this.swim.push({ f: geese, i: geese.mesh.count++, x: q[0], z: q[1], yaw: R() * 6.3, ph: R() * 9 });
			}
			for (let k = 0; k < (low ? 2 : 4) && ducks.mesh.count < ducks.n - 1; k++) {
				const q = onWater(c[0], c[1], 3);
				if (q) for (let j = 0; j < 2; j++) this.swim.push({ f: ducks, i: ducks.mesh.count++, x: q[0] + j * 0.12, z: q[1] + j * 0.05, yaw: R() * 6.3, ph: R() * 9 });
			}
		}
		this.vee = new Flock(scene, "gooseFly", 9);
		this.veeAt = 6; // seconds until the next V crosses
		const mc = man.pts.reduce((a, p) => [a[0] + p[0] / man.pts.length, a[1] + p[1] / man.pts.length], [0, 0]);
		this.lakeC = W(mc);

		// --- the kiang herds on the Barkha plain ---
		this.herds = [];
		const kFrames = { graze: kiang("graze"), stand: kiang("stand"), trot: [0, 1, 2, 3, 4, 5].map((i) => kiang("stand", (i / 6) * Math.PI * 2)) };
		this.kFrames = kFrames;
		const plain = (x, z) => {
			const g = toGeo(x, z);
			return Math.hypot(x - W(P.darchen).x, z - W(P.darchen).z) > 5 && Math.hypot(x - W(P.tarboche).x, z - W(P.tarboche).z) > 5 && g.lat > 30.8 && g.lat < 30.95 && g.lon > 81.16 && g.lon < 81.45 && inLake(x, z) > 1.2 && wayDist(x, z) > 1.6 && stands(x, z, 0.5);
		};
		for (let h = 0, tries = 0; h < (low ? 2 : 3) && tries < 200; tries++) {
			const g = W([81.18 + R() * 0.25, 30.81 + R() * 0.13]);
			if (!plain(g.x, g.z)) continue;
			const herd = { x: g.x, z: g.z, plain, animals: [], wait: 8 + R() * 30, tx: 0, tz: 0, moving: false };
			for (let i = 0, n = 4 + Math.floor(R() * 4); i < n; i++) {
				const ox = (R() - 0.5) * 1.4, oz = (R() - 0.5) * 1.4;
				if (!stands(g.x + ox, g.z + oz, 0.3)) continue;
				const m = mesh(R() < 0.6 ? kFrames.graze : kFrames.stand, this.group);
				m.position.set(g.x + ox, H(g.x + ox, g.z + oz), g.z + oz);
				m.rotation.y = R() * 6.3;
				m.scale.setScalar(M * (0.95 + R() * 0.1));
				herd.animals.push({ m, ox, oz, ph: R() * 6, swap: R() * 8 });
				PLACED.push({ x: m.position.x, y: m.position.y, z: m.position.z, kind: "kiang" });
			}
			this.herds.push(herd);
			h++;
		}

		// --- bharal on the slopes either side of the Lha Chu, a little above the path ---
		this.bharal = [];
		const bFrames = { graze: [bharal("graze", true), bharal("graze", false)], stand: [bharal("stand", true), bharal("stand", false)] };
		this.bFrames = bFrames;
		const west = KORA.west.map(W);
		for (let gI = 0; gI < (low ? 2 : 4); gI++) {
			const seg = 1 + Math.floor(R() * (west.length - 2)), a = west[seg], b = west[seg + 1];
			const t = R(), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, side = R() < 0.5 ? -1 : 1, off = 1.6 + R() * 1.6;
			const cx = lerp(a.x, b.x, t) - (dz / l) * side * off, cz = lerp(a.z, b.z, t) + (dx / l) * side * off;
			for (let i = 0, n = 3 + Math.floor(R() * 4); i < n; i++) {
				const x = cx + (R() - 0.5) * 1.0, z = cz + (R() - 0.5) * 1.0;
				if (!stands(x, z, 0.2) || wayDist(x, z) < 0.9) continue;
				const ram = R() < 0.4 ? 0 : 1;
				const m = mesh(bFrames.graze[ram], this.group);
				m.position.set(x, H(x, z), z);
				m.rotation.y = R() * 6.3;
				this.bharal.push({ m, ram, swap: R() * 10 });
				PLACED.push({ x, y: m.position.y, z, kind: "bharal" });
			}
		}

		// --- marmots by their burrows on the valley floors, up the Lha Chu, near Dirapuk and down the Lham Chu ---
		this.marmots = [];
		const mUp = marmot("up"), mDown = marmot("down");
		this.mGeo = { up: mUp, down: mDown };
		const mounds = new THREE.Group();
		const moundGeo = new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), holeGeo = new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2);
		const moundMat = haze(new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 })), holeMat = new THREE.MeshBasicMaterial({ color: 0x14100c });
		const kora = [...KORA.west.slice(3), ...KORA.north.slice(0, 2), ...KORA.east.slice(4, 9)].map(W);
		for (let i = 0, tries = 0; i < (low ? 6 : 16) && tries < 300; tries++) {
			const a = kora[Math.floor(R() * (kora.length - 1))], side = R() < 0.5 ? -1 : 1;
			const x = a.x + side * (0.8 + R() * 1.8) * (R() < 0.5 ? 1 : 0.6), z = a.z + (R() - 0.5) * 2.5;
			if (!stands(x, z, 0.25) || wayDist(x, z) < 0.7) continue;
			const y = H(x, z);
			const md = new THREE.Mesh(moundGeo, moundMat);
			md.position.set(x, y - 0.01, z);
			md.scale.set(0.5 * M, 0.12 * M, 0.5 * M);
			md.raycast = noRay;
			const hole = new THREE.Mesh(holeGeo, holeMat);
			hole.position.set(x + 0.02, y + 0.022 * M, z);
			hole.scale.setScalar(0.18 * M);
			hole.raycast = noRay;
			mounds.add(md, hole);
			const m = mesh(mUp, this.group);
			m.position.set(x, y, z);
			m.rotation.y = R() * 6.3;
			this.marmots.push({ m, x, y, z, t: R() * 12, up: 4 + R() * 8, down: 3 + R() * 9 });
			PLACED.push({ x, y, z, kind: "marmot" });
			i++;
		}
		this.group.add(mounds);

		// --- a Tibetan fox or two, trotting a wandering loop over the steppe and sitting now and then ---
		this.foxes = [];
		const fFrames = { sit: fox(null), trot: [0, 1, 2, 3, 4, 5].map((i) => fox((i / 6) * Math.PI * 2)) };
		this.fFrames = fFrames;
		for (const anchor of (low ? [] : [[81.22, 30.9], [81.3, 30.86], KORA.west[1], KORA.west[3]])) {
			if (this.foxes.length >= 2) break;
			const c = W(anchor);
			for (let tries = 0; tries < 60; tries++) {
				const x = c.x + (R() - 0.5) * 6, z = c.z + (R() - 0.5) * 6, r = 0.7 + R() * 0.5;
				const loop = [];
				for (let k = 0; k < 24; k++) {
					const a = (k / 24) * Math.PI * 2, rr = r * (1 + 0.25 * Math.sin(a * 3));
					loop.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
				}
				if (!loop.every(([u, v]) => stands(u, v, 0.15) && wayDist(u, v) > 0.6 && inLake(u, v) > 0.5)) continue;
				const m = mesh(fFrames.sit, this.group);
				m.position.set(loop[0][0], H(loop[0][0], loop[0][1]), loop[0][1]);
				this.foxes.push({ m, loop, s: 0, sit: 3 + R() * 5, ph: 0 });
				PLACED.push({ x: m.position.x, y: m.position.y, z: m.position.z, kind: "fox" });
				break;
			}
		}
		this.R = R;
	}

	// counts, for the checks
	get census() {
		return {
			birds: this.soar.length + this.chough.reduce((a, f) => a + f.birds.length, 0) + this.swim.length + this.vee.n,
			kiang: this.herds.reduce((a, h) => a + h.animals.length, 0), bharal: this.bharal.length, marmots: this.marmots.length, foxes: this.foxes.length,
		};
	}

	update(dt, camera) {
		const t = (this.t += dt), R = this.R, H = (x, z) => this.world.height(x, z);
		// the prayer flags flap in the wind (held still for those who ask for less motion)
		FLAG_TIME.value = RM ? 0 : t;
		const cp = camera.position;
		// the group of animals is only looked at near the camera: far off, the world goes on without them
		const near = (x, z, d = 45) => Math.abs(x - cp.x) < d && Math.abs(z - cp.z) < d;

		// soaring: a slow circle, banked into the turn, now and then a few deep beats
		const used = new Map();
		for (const b of this.soar) {
			const i = used.get(b.f) || 0;
			used.set(b.f, i + 1);
			const a = b.a + b.w * t, x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
			const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w));
			const beat = (t + b.ph) % 24 < 2.2 ? Math.sin((t + b.ph) * 5) : 0.04 * Math.sin(t * 0.8 + b.ph);
			setBird(b.f, i, x, b.y + 0.15 * Math.sin(t * 0.3 + b.ph), z, yaw, -0.32 * Math.sign(b.w), 0, beat);
		}
		for (const [f, n] of used) {
			f.mesh.count = n;
			f.mesh.instanceMatrix.needsUpdate = f.flap.needsUpdate = true;
		}
		// choughs: the flock drifts round the camp, each bird looping round it, flapping hard then tumbling
		let ci = 0;
		for (const fl of this.chough) {
			const fx = fl.x + Math.cos(t * 0.11 + fl.a) * 1.4, fz = fl.z + Math.sin(t * 0.11 + fl.a) * 1.4;
			for (const b of fl.birds) {
				const a = b.a + b.w * t, r = b.r * (1 + 0.3 * Math.sin(t * 0.7 + b.ph));
				const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, y = fl.y + b.dy + 0.25 * Math.sin(t * 1.3 + b.ph);
				const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w));
				const flap = (t + b.ph) % 5 < 3 ? Math.sin((t + b.ph) * 16) : 0.25;
				setBird(this.choughs, ci++, x, y, z, yaw, -0.6 * Math.sign(b.w), 0.25 * Math.sin(t * 2 + b.ph), flap);
			}
		}
		this.choughs.mesh.count = ci;
		this.choughs.mesh.instanceMatrix.needsUpdate = this.choughs.flap.needsUpdate = true;
		// the birds on the lake drift and turn slowly, riding the ripples
		for (const s of this.swim) {
			const x = s.x + Math.cos(t * 0.03 + s.ph) * 0.25, z = s.z + Math.sin(t * 0.03 + s.ph) * 0.25;
			setBird(s.f, s.i, x, this.level + 0.012 + 0.006 * Math.sin(t * 1.4 + s.ph), z, s.yaw + t * 0.03 + Math.PI / 2, 0, 0, 0);
		}
		for (const f of this.swimmers) f.mesh.instanceMatrix.needsUpdate = true;
		// a V of geese across the lake, every minute or so
		this.veeAt -= dt;
		if (this.veeAt < 0 && !this.veeOn) {
			const a = R() * 6.3;
			this.veeOn = { t: 0, a, x: this.lakeC.x - Math.cos(a) * 7, z: this.lakeC.z - Math.sin(a) * 7, y: this.level + 2.2 + R() * 1.2 };
		}
		if (this.veeOn) {
			const v = this.veeOn, sp = 0.55;
			v.t += dt;
			const fx = Math.cos(v.a), fz = Math.sin(v.a), d = v.t * sp, yaw = Math.atan2(fx, fz);
			for (let i = 0; i < this.vee.n; i++) {
				const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1, back = k * 0.32, out = k * 0.36 * side;
				setBird(this.vee, i, v.x + fx * (d - back) + fz * out, v.y, v.z + fz * (d - back) - fx * out, yaw, 0, 0, Math.sin(t * 6.5 - k * 0.6));
			}
			this.vee.mesh.count = this.vee.n;
			this.vee.mesh.instanceMatrix.needsUpdate = this.vee.flap.needsUpdate = true;
			if (d > 15) {
				this.veeOn = null;
				this.vee.mesh.count = 0;
				this.veeAt = 40 + R() * 40;
			}
		}

		// kiang: grazing, heads up and down; then the herd trots off together a little way
		for (const h of this.herds) {
			if (!near(h.x, h.z)) continue;
			if (!h.moving) {
				h.wait -= dt;
				for (const a of h.animals) if ((a.swap -= dt) < 0) {
					a.m.geometry = a.m.geometry === this.kFrames.graze ? this.kFrames.stand : this.kFrames.graze;
					a.swap = 3 + R() * 9;
				}
				if (h.wait < 0 && !this.low && !RM) {
					const ang = R() * 6.3, d = 1.5 + R() * 2;
					const tx = h.x + Math.cos(ang) * d, tz = h.z + Math.sin(ang) * d;
					// (only where the whole herd can go: never onto a slope, a road or the shore)
					let ok = true;
					for (let k = 1; k <= 6 && ok; k++) ok = h.plain(lerp(h.x, tx, k / 6), lerp(h.z, tz, k / 6));
					if (ok) Object.assign(h, { moving: true, tx, tz, yaw: Math.atan2(tx - h.x, tz - h.z) });
					h.wait = 20 + R() * 40;
				}
				continue;
			}
			const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz), step = Math.min(d, 0.45 * dt);
			h.x += (dx / d) * step;
			h.z += (dz / d) * step;
			for (const a of h.animals) {
				a.ph += (step / (0.62 * M * 2.2)) * 6;
				a.m.geometry = this.kFrames.trot[Math.floor(a.ph) % 6];
				a.m.rotation.y = h.yaw + (a.ox - 0.5) * 0.1;
				const x = h.x + a.ox, z = h.z + a.oz;
				a.m.position.set(x, H(x, z), z);
			}
			if (d < 0.02) {
				h.moving = false;
				for (const a of h.animals) a.m.geometry = this.kFrames.graze;
			}
		}
		// bharal: heads down to graze, up to look round
		for (const b of this.bharal) if ((b.swap -= dt) < 0) {
			b.m.geometry = b.m.geometry === this.bFrames.graze[b.ram] ? this.bFrames.stand[b.ram] : this.bFrames.graze[b.ram];
			b.m.rotation.y += (R() - 0.5) * 0.8;
			b.swap = 4 + R() * 10;
		}
		// marmots: up on the mound keeping watch, then down into the burrow, and up again
		for (const mm of this.marmots) {
			if (!near(mm.x, mm.z)) continue;
			if (RM) continue;
			mm.t += dt;
			const cyc = mm.up + mm.down, u = mm.t % cyc;
			// rising out over half a second, sinking back as quick
			const k = u < 0.5 ? u / 0.5 : u < mm.up ? 1 : u < mm.up + 0.4 ? 1 - (u - mm.up) / 0.4 : 0;
			mm.m.visible = k > 0.02;
			mm.m.position.y = mm.y - (1 - k) * 0.5 * M;
			mm.m.geometry = u < mm.up * 0.6 ? this.mGeo.up : this.mGeo.down;
		}
		// the fox: trots its loop, sits a while, trots on
		for (const f of this.foxes) {
			if (!near(f.m.position.x, f.m.position.z)) continue;
			if (f.sit > 0) {
				f.sit -= dt;
				f.m.geometry = this.fFrames.sit;
				if (f.sit <= 0) f.go = 6 + R() * 10;
				continue;
			}
			if (RM) continue;
			f.go -= dt;
			f.s = (f.s + dt * 0.25) % f.loop.length;
			const i = Math.floor(f.s), a = f.loop[i], b = f.loop[(i + 1) % f.loop.length], k = f.s - i;
			const x = lerp(a[0], b[0], k), z = lerp(a[1], b[1], k);
			f.m.position.set(x, H(x, z), z);
			f.m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
			f.ph += dt * 9;
			f.m.geometry = this.fFrames.trot[Math.floor(f.ph) % 6];
			if (f.go < 0) f.sit = 4 + R() * 8;
		}
	}
}
