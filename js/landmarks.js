// The four shrines. Each is built facing local +z, then turned to face its real direction.
// One world unit is about 2.6 km, so the temples are drawn far larger than life to read on the map.
// Surfaces are textured in the page: dressed stone courses, lime plaster, painted facades and gilding,
// projected in world space so every block on a temple is the same size.
import * as THREE from "three";
import { SHRINES, toWorld } from "./geo.js";
import { fbm, rand } from "./util.js";
import { TREE_STRIDE, Trees } from "./trees.js";
import { haze, patch } from "./batch.js";
import { groundDetail } from "./textures.js";

// World-space detail for mountains and hills: rock strata and scree on peaks, mottled scrub, red earth
// and outcrops on the Tirumala hills. Keeps the vertex/material colour as the base.
function terrainDetail(mat, mode) {
	const uDetail = { value: groundDetail() };
	return haze(patch(mat, "tdetail" + mode, (sh) => {
		sh.uniforms.uDetail = uDetail;
		sh.vertexShader = "varying vec3 vTdW;\nvarying vec3 vTdN;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n\tvTdW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvTdN = normalize( mat3( modelMatrix ) * objectNormal );");
		sh.fragmentShader = "uniform sampler2D uDetail;\nvarying vec3 vTdW;\nvarying vec3 vTdN;\n" + sh.fragmentShader.replace("#include <color_fragment>", mode === "peak" ? `#include <color_fragment>
	{
		vec4 a = texture2D( uDetail, vec2( vTdW.x * 0.02 + vTdW.z * 0.02, vTdW.y * 0.09 ) );
		vec4 b = texture2D( uDetail, vTdW.xz * 0.11 );
		vec4 c = texture2D( uDetail, vTdW.xz * 0.6 + vTdW.y * 0.1 );
		float snow = smoothstep( 0.55, 0.8, dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) );
		float steep = 1.0 - clamp( vTdN.y, 0.0, 1.0 );
		// rock: banded strata and scree; snow: wind crust and bare rock showing through on steep faces
		vec3 rock = diffuseColor.rgb * ( 0.62 + 0.55 * a.g ) * ( 0.8 + 0.4 * c.r );
		vec3 sn = diffuseColor.rgb * ( 0.9 + 0.12 * b.a );
		sn = mix( sn, vec3( 0.16, 0.15, 0.15 ) * ( 0.7 + 0.6 * a.g ), smoothstep( 0.62, 0.8, steep + ( b.r - 0.5 ) * 0.4 ) * 0.85 );
		diffuseColor.rgb = mix( rock, sn, snow );
	}` : `#include <color_fragment>
	{
		vec4 a = texture2D( uDetail, vTdW.xz * 0.07 );
		vec4 b = texture2D( uDetail, vTdW.xz * 0.35 );
		vec4 c = texture2D( uDetail, vTdW.xz * 1.6 );
		float steep = 1.0 - clamp( vTdN.y, 0.0, 1.0 );
		vec3 scrub = diffuseColor.rgb * ( 0.6 + 0.6 * b.a ) * ( 0.85 + 0.3 * c.g );
		vec3 earth = vec3( 0.2, 0.09, 0.045 ) * ( 0.7 + 0.5 * c.r );
		vec3 rk = vec3( 0.2, 0.18, 0.16 ) * ( 0.6 + 0.7 * b.r );
		vec3 col = mix( earth, scrub, smoothstep( 0.12, 0.42, a.a + ( b.g - 0.5 ) * 0.3 ) );
		diffuseColor.rgb = mix( col, rk, smoothstep( 0.35, 0.6, steep + ( a.r - 0.5 ) * 0.4 ) );
	}`);
	}));
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o));
export const GOLD = std(0xe0a83e, { metalness: 0.9, roughness: 0.3, emissive: 0x5a3a06, emissiveIntensity: 0.12 });
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

// ---------- textures ----------
function canvas(w, h, draw) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d"), w, h);
	return c;
}
function texOf(c, srgb = true) {
	const t = new THREE.CanvasTexture(c);
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}
const hexCss = (c, k = 1) => {
	const col = new THREE.Color(c);
	return `rgb(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0})`;
};
// Coursed ashlar: rows of blocks with mortar joints, grain, lichen and rain streaks. Returns colour and bump maps.
function masonry({ base, rows = 8, cols = 3, jitter = 0.16, mortar = 0.55, seed = 1, streaks = 0, moss = 0, size = 256 }) {
	const R = rand(seed);
	const blocks = [];
	const rh = size / rows;
	for (let r = 0; r < rows; r++) {
		let x = r % 2 ? -size / cols / 2 : 0;
		while (x < size) {
			const w = (size / cols) * (0.7 + R() * 0.6);
			blocks.push([x, r * rh, w, rh, 1 + (R() - 0.5) * 2 * jitter]);
			x += w;
		}
	}
	const col = canvas(size, size, (g, W, H) => {
		g.fillStyle = hexCss(base, mortar);
		g.fillRect(0, 0, W, H);
		for (const [x, y, w, h, k] of blocks) {
			g.fillStyle = hexCss(base, k);
			g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
			g.fillRect(x + 1.5 - W, y + 1.5, w - 3, h - 3);
		}
		for (let i = 0; i < size * 14; i++) {
			const v = R();
			g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.12 * R()})` : `rgba(255,255,255,${0.08 * R()})`;
			g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
		}
		for (let i = 0; i < streaks * 30; i++) {
			const x = R() * W, w = 2 + R() * 7, y0 = Math.floor(R() * rows) * rh;
			const gr = g.createLinearGradient(0, y0, 0, y0 + rh * (1 + R() * 3));
			gr.addColorStop(0, `rgba(10,12,10,${0.25 * streaks})`);
			gr.addColorStop(1, "rgba(10,12,10,0)");
			g.fillStyle = gr;
			g.fillRect(x, y0, w, rh * 4);
		}
		for (let i = 0; i < moss * 60; i++) {
			g.fillStyle = `rgba(${60 + R() * 30},${80 + R() * 40},${40 + R() * 20},${0.25 * R()})`;
			g.beginPath();
			g.arc(R() * W, R() * H, 2 + R() * 8, 0, Math.PI * 2);
			g.fill();
		}
	});
	const bump = canvas(size, size, (g, W, H) => {
		g.fillStyle = "#202020";
		g.fillRect(0, 0, W, H);
		for (const [x, y, w, h] of blocks) {
			const v = 170 + R() * 60;
			g.fillStyle = `rgb(${v},${v},${v})`;
			g.fillRect(x + 2, y + 2, w - 4, h - 4);
			g.fillRect(x + 2 - W, y + 2, w - 4, h - 4);
		}
		for (let i = 0; i < size * 10; i++) {
			g.fillStyle = `rgba(0,0,0,${0.3 * R()})`;
			g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
		}
	});
	return { map: texOf(col), bump: texOf(bump, false) };
}
// A material whose UVs are projected from world position, `scale` world units per texture tile.
function stone(base, opts = {}, scale = 1) {
	const t = masonry(Object.assign({ base }, opts));
	const m = std(0xffffff, { map: t.map, bumpMap: t.bump, bumpScale: opts.bumpScale ?? 2.2, roughness: opts.roughness ?? 0.88 });
	m.userData.tri = scale;
	return m;
}
// Lime plaster with faint patching.
function plaster(base, seed, scale = 1.5) {
	const R = rand(seed);
	const c = canvas(256, 256, (g, W, H) => {
		g.fillStyle = hexCss(base);
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 90; i++) {
			g.fillStyle = `rgba(${R() < 0.5 ? "120,100,80" : "255,255,250"},${0.05 * R()})`;
			g.beginPath();
			g.arc(R() * W, R() * H, 6 + R() * 30, 0, Math.PI * 2);
			g.fill();
		}
		for (let i = 0; i < 2500; i++) {
			g.fillStyle = `rgba(0,0,0,${0.05 * R()})`;
			g.fillRect(R() * W, R() * H, 1, 1);
		}
	});
	const m = std(0xffffff, { map: texOf(c), roughness: 0.92 });
	m.userData.tri = scale;
	return m;
}
// Box-project UVs from each vertex's position in the shrine's frame, by its dominant normal axis.
function projectUVs(group) {
	group.updateMatrixWorld(true);
	const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
	const v = new THREE.Vector3(), n = new THREE.Vector3(), mtx = new THREE.Matrix4(), nm = new THREE.Matrix3();
	group.traverse((o) => {
		if (!o.isMesh || Array.isArray(o.material) || !o.material.userData.tri) return;
		const s = 1 / o.material.userData.tri;
		const g = o.geometry;
		mtx.multiplyMatrices(inv, o.matrixWorld);
		nm.getNormalMatrix(mtx);
		const p = g.attributes.position, nr = g.attributes.normal;
		const uv = new Float32Array(p.count * 2);
		for (let i = 0; i < p.count; i++) {
			v.fromBufferAttribute(p, i).applyMatrix4(mtx);
			n.fromBufferAttribute(nr, i).applyMatrix3(nm);
			const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
			if (ay > ax && ay > az) uv.set([v.x * s, v.z * s], i * 2);
			else if (ax > az) uv.set([v.z * s, v.y * s], i * 2);
			else uv.set([v.x * s, v.y * s], i * 2);
		}
		g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	});
}

// ---------- shared forms ----------
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
	const u = (Math.abs(c) > Math.abs(s) ? s : c) / m;
	const off = Math.abs(u) < 0.28 ? 0.16 : Math.abs(u) < 0.6 ? 0.08 : 0;
	return (1 / m) * (1 + off);
}
// Wall mouldings: a heavy base (pitha), a plain body (jangha) and a cornice (varandika).
const mould = (t) => (t < 0.06 ? 1.12 : t < 0.11 ? 1.06 : t < 0.15 ? 1.09 : t > 0.93 ? 1.1 : t > 0.86 ? 1.04 : 1);
// Curvilinear Nagara spire with horizontal courses (bhumi amalakas).
const spire = (H, R0, taper, courses, plan = ratha, segs = 128) =>
	tower(H, (t) => R0 * (1 - taper * Math.pow(t, 1.45)) * (((t * courses) % 1) < 0.2 ? 0.95 : 1), plan, segs, courses * 5);

function kalash(parent, y, s = 1, mat = GOLD) {
	const pts = [[0, 0], [0.12, 0], [0.16, 0.06], [0.14, 0.14], [0.06, 0.2], [0.05, 0.26], [0.09, 0.3], [0.03, 0.36], [0.01, 0.46], [0, 0.48]].map((p) => new THREE.Vector2(p[0] * s, p[1] * s));
	return mesh(new THREE.LatheGeometry(pts, 24), mat, 0, y, 0, parent);
}
function amalaka(parent, y, r, mat) {
	const g = tower(r * 0.55, (t) => r * (0.62 + 0.38 * Math.sin(t * Math.PI)), (th) => 1 + 0.07 * Math.cos(th * 28), 112, 10);
	return mesh(g, mat, 0, y, 0, parent);
}
// An onion dome, as on the Badrinath facade.
function onion(parent, x, y, z, r, mat = GOLD) {
	const pts = [[0, 0], [r * 0.9, 0], [r, r * 0.5], [r * 0.8, r * 1.1], [r * 0.35, r * 1.5], [r * 0.12, r * 1.75], [r * 0.06, r * 2.3], [0, r * 2.35]].map((p) => new THREE.Vector2(p[0], p[1]));
	return mesh(new THREE.LatheGeometry(pts, 24), mat, x, y, z, parent);
}
function flag(parent, x, y, z, color = 0xff8a1e, s = 1) {
	mesh(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.6 * s, 6), std(0x6b4a2a), x, y + 0.3 * s, z, parent);
	const g = new THREE.PlaneGeometry(0.42 * s, 0.24 * s, 8, 3);
	const p = g.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const u = (p.getX(i) + 0.21 * s) / (0.42 * s);
		p.setY(i, p.getY(i) * (1 - u * 0.85)); // a swallow-ish pennant
		p.setZ(i, Math.sin(u * 5) * 0.03 * s * u);
	}
	g.translate(0.21 * s, 0.48 * s, 0);
	g.computeVertexNormals();
	const f = mesh(g, std(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }), x, y, z, parent);
	f.userData.flag = true;
	return f;
}
function lamp(parent, x, y, z, r = 0.06) {
	return mesh(new THREE.SphereGeometry(r, 10, 8), LAMP, x, y, z, parent);
}
// Flights of steps rising toward -z from (x, y0, z0).
function steps(parent, x, y0, z0, w, rise, run, n, mat) {
	for (let i = 0; i < n; i++) mesh(box(w, rise * (i + 1), run), mat, x, y0 + (rise * (i + 1)) / 2, z0 - run * (i + 0.5), parent);
}
// A temple pillar: square base, octagonal shaft, cushion capital and bracket.
function pillar(parent, x, y, z, h, r, mat) {
	mesh(box(r * 2.6, h * 0.12, r * 2.6), mat, x, y + h * 0.06, z, parent);
	mesh(new THREE.CylinderGeometry(r, r * 1.1, h * 0.74, 8), mat, x, y + h * 0.49, z, parent);
	mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.1, h * 0.08, 8), mat, x, y + h * 0.9, z, parent);
	mesh(box(r * 3, h * 0.06, r * 3), mat, x, y + h * 0.97, z, parent);
}
// A temple bell.
function bell(parent, x, y, z, s = 1, mat = GOLD) {
	const b = mesh(new THREE.LatheGeometry([[0, 0.3], [0.05, 0.3], [0.09, 0.22], [0.11, 0.08], [0.16, 0]].map((p) => new THREE.Vector2(p[0] * s, p[1] * s)), 20), mat, x, y, z, parent);
	b.userData.bell = true;
	return b;
}
// A marigold garland swagged between two points.
const MARIGOLD = std(0xff9a12, { roughness: 0.7, emissive: 0x6a2a00, emissiveIntensity: 0.2 });
function garland(parent, a, b, sag, r = 0.03) {
	const mid = a.clone().lerp(b, 0.5);
	mid.y -= sag;
	const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
	const m = mesh(new THREE.TubeGeometry(curve, 24, r, 6), MARIGOLD, 0, 0, 0, parent);
	m.castShadow = false;
	return m;
}
// A seated Nandi.
function nandi(parent, x, y, z, s, mat) {
	const n = new THREE.Group();
	mesh(new THREE.SphereGeometry(0.2, 16, 12), mat, 0, 0.16, 0.02, n).scale.set(0.8, 0.75, 1.5);
	mesh(new THREE.SphereGeometry(0.1, 12, 10), mat, 0, 0.32, -0.08, n).scale.set(0.9, 0.9, 1.1); // hump
	const head = new THREE.Group();
	head.position.set(0, 0.32, 0.3);
	head.rotation.x = 0.35;
	mesh(new THREE.CapsuleGeometry(0.065, 0.12, 4, 10), mat, 0, 0, 0.05, head).rotation.x = Math.PI / 2.4;
	for (const sx of [-1, 1]) {
		const horn = mesh(new THREE.ConeGeometry(0.018, 0.09, 6), mat, sx * 0.05, 0.08, -0.02, head);
		horn.rotation.z = -sx * 0.6;
		const ear = mesh(new THREE.SphereGeometry(0.025, 6, 4), mat, sx * 0.075, 0.04, 0.0, head);
		ear.scale.set(1.6, 0.6, 1);
	}
	n.add(head);
	for (const sx of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), mat, sx * 0.1, 0.06, 0.2, n).rotation.x = Math.PI / 2; // folded forelegs
	mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16), MARIGOLD, 0, 0.27, 0.22, n).rotation.x = 1.2;
	n.position.set(x, y, z);
	n.scale.setScalar(s);
	parent.add(n);
	return n;
}
// Small houses with pitched roofs, as in the bazaar at Badrinath.
function house(parent, x, z, w, h, d, wall, roof, ry = 0) {
	const g = new THREE.Group();
	mesh(box(w, h, d), wall, 0, h / 2, 0, g);
	const r = mesh(new THREE.CylinderGeometry(0.02, Math.max(w, d) * 0.75, h * 0.45, 4, 1), roof, 0, h + h * 0.22, 0, g);
	r.rotation.y = Math.PI / 4;
	r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
	g.position.set(x, 0, z);
	g.rotation.y = ry;
	parent.add(g);
	return g;
}
function windowsTex(base, trim, seed) {
	const R = rand(seed);
	const m = std(0xffffff, { map: texOf(canvas(128, 128, (g, W, H) => {
		g.fillStyle = hexCss(base);
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 400; i++) {
			g.fillStyle = `rgba(0,0,0,${0.06 * R()})`;
			g.fillRect(R() * W, R() * H, 2, 2);
		}
		for (const [x, y] of [[20, 24], [76, 24], [20, 80], [76, 80]]) {
			g.fillStyle = hexCss(trim);
			g.fillRect(x - 3, y - 3, 38, 34);
			g.fillStyle = "#2a2622";
			g.fillRect(x, y, 32, 28);
			g.fillStyle = hexCss(trim);
			g.fillRect(x + 15, y, 2, 28);
		}
	})), roughness: 0.9 });
	m.userData.tri = 0.55;
	return m;
}

// ---------- mountains and trees ----------
// A snow mountain: ridged noise on a fine cone, snow by height and slope, bare rock on the ridges.
function peak(r, h, seed, snowLine = 0.45, rock = 0x6b6259) {
	const g = new THREE.ConeGeometry(r, h, 64, 36);
	const p = g.attributes.position;
	const col = [];
	const rc = new THREE.Color(rock), rd = new THREE.Color(rock).multiplyScalar(0.62), sc = new THREE.Color(0xf4f7fb), sh = new THREE.Color(0xc9d4e4), gc = new THREE.Color(0x56603f);
	const tmp = new THREE.Color();
	const o = seed * 13.7;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const t = (y + h / 2) / h;
		const a = Math.atan2(z, x);
		// ridges and gullies run down the face
		const ridge = 1 - Math.abs(fbm(Math.cos(a) * 2.2 + o, Math.sin(a) * 2.2 + t * 1.4, 4) * 2 - 1);
		const bumpy = fbm(Math.cos(a) * 5 + o, t * 6 + Math.sin(a) * 5, 3);
		const k = t < 0.995 ? 1 + (ridge - 0.5) * 0.4 + (bumpy - 0.5) * 0.2 : 1;
		p.setX(i, x * k);
		p.setZ(i, z * k);
		p.setY(i, y + (bumpy - 0.5) * h * 0.06 * (1 - t));
		// snow fills the gullies lower down; wind-scoured rock shows on the ridges
		const line = snowLine + (bumpy - 0.5) * 0.2 + (ridge - 0.5) * 0.16;
		if (t > line) tmp.copy(sc).lerp(sh, THREE.MathUtils.clamp((bumpy - 0.35) * 1.5, 0, 1) * 0.6);
		else if (t > line - 0.08) tmp.copy(rc).lerp(sc, ((t - line + 0.08) / 0.08) * 0.7);
		else if (t < 0.1) tmp.copy(gc).lerp(rc, t * 10);
		else tmp.copy(rc).lerp(rd, ridge * 0.8);
		col.push(tmp.r, tmp.g, tmp.b);
	}
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.computeVertexNormals();
	g.translate(0, h / 2, 0);
	const m = new THREE.Mesh(g, peakMaterial());
	m.receiveShadow = true;
	return m;
}
let _peakMat;
function peakMaterial() {
	return (_peakMat ||= terrainDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), "peak"));
}
// Broadleaf trees: a trunk and a lumpy crown of two or three masses, instanced.
let _crown;
function crownGeometry() {
	if (_crown) return _crown;
	const parts = [];
	const R = rand(41);
	for (const [x, y, z, s] of [[0, 0, 0, 1], [0.45, 0.25, 0.1, 0.7], [-0.4, 0.35, -0.15, 0.65], [0.05, 0.7, 0.05, 0.6]]) {
		const g = new THREE.IcosahedronGeometry(s, 2);
		const p = g.attributes.position;
		for (let i = 0; i < p.count; i++) {
			const k = 1 + (R() - 0.5) * 0.18;
			p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.85 + y, p.getZ(i) * k + z);
		}
		parts.push(g);
	}
	// merge by hand: all non-indexed with the same attributes
	let n = 0;
	for (const g of parts) n += g.attributes.position.count;
	const pos = new Float32Array(n * 3);
	let o = 0;
	for (const g of parts) {
		pos.set(g.attributes.position.array, o);
		o += g.attributes.position.array.length;
	}
	_crown = new THREE.BufferGeometry();
	_crown.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	_crown.computeVertexNormals();
	return _crown;
}
// Shrine forests go into the countryside's instanced tree system (real species, LOD and impostors):
// monsoon evergreen round Bhimashankar, dry scrub forest of tamarind, neem and acacia on the Tirumala hills.
function forest(world, c, n, r0, r1, seed, monsoon, clear) {
	const T = Trees.instance;
	if (!T) return forestBlobs(world, c, n, r0, r1, seed, monsoon, clear);
	const R = rand(seed);
	const mix = monsoon ? [["mango", 3], ["jamun", 3], ["banyan", 0.6], ["tamarind", 1], ["bush", 2.5]] : [["tamarind", 2.5], ["neem", 2], ["acacia", 2.5], ["bush", 3], ["banyan", 0.4], ["toddy", 0.6]];
	let tot = 0;
	for (const [, w] of mix) tot += w;
	const data = [];
	for (let i = 0; i < n * 3 && data.length / TREE_STRIDE < n; i++) {
		const a = R() * Math.PI * 2, d = Math.sqrt(R() * (r1 * r1 - r0 * r0) + r0 * r0);
		const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
		if (clear(x, z)) continue;
		let q = R() * tot, kind = mix[0][0];
		for (const [k, w] of mix) if ((q -= w) <= 0) {
			kind = k;
			break;
		}
		// young trees, kept small so the shrine stays in view
		const s = (kind === "bush" ? 0.7 : 0.3) * (0.8 + R() * 0.5);
		const v = 0.8 + R() * 0.3;
		const t = monsoon ? [0.85, 1.05, 0.85] : [1.0, 0.95, 0.8];
		data.push(x, world.height(x, z) - 0.02, z, R() * 6.3, s, s * (0.9 + R() * 0.2), T.kind(kind, R), v * t[0], v * t[1], v * t[2], 0);
	}
	T.add("forest" + seed, new Float32Array(data), data.length / TREE_STRIDE);
	return new THREE.Group();
}
function forestBlobs(world, c, n, r0, r1, seed, monsoon, clear) {
	const R = rand(seed);
	const crowns = new THREE.InstancedMesh(crownGeometry(), std(0xffffff, { flatShading: true, roughness: 0.9 }), n);
	const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.1, 1, 6), std(0x4a3626, { roughness: 0.95 }), n);
	const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
	const col = new THREE.Color();
	let k = 0;
	for (let i = 0; i < n * 3 && k < n; i++) {
		const a = R() * Math.PI * 2, d = Math.sqrt(R() * (r1 * r1 - r0 * r0) + r0 * r0);
		const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
		if (clear(x, z)) continue;
		const s = 0.3 + R() * 0.32;
		const gy = world.height(x, z);
		const th = s * (1.1 + R() * 0.6);
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
		p.set(x, gy + th / 2, z);
		sc.set(s, th, s);
		m.compose(p, q, sc);
		trunks.setMatrixAt(k, m);
		p.set(x, gy + th + s * 0.4, z);
		sc.set(s * (0.9 + R() * 0.3), s * (0.8 + R() * 0.4), s * (0.9 + R() * 0.3));
		m.compose(p, q, sc);
		crowns.setMatrixAt(k, m);
		col.setHSL(monsoon ? 0.27 + R() * 0.07 : 0.22 + R() * 0.07, 0.45 + R() * 0.2, monsoon ? 0.2 + R() * 0.1 : 0.22 + R() * 0.08);
		crowns.setColorAt(k, col);
		k++;
	}
	crowns.count = trunks.count = k;
	const grp = new THREE.Group();
	for (const im of [crowns, trunks]) {
		im.castShadow = true;
		im.receiveShadow = true;
		grp.add(im);
	}
	return grp;
}

// ---------- painted textures ----------
function arch(g, x, y, w, h) {
	g.beginPath();
	g.moveTo(x, y + h);
	g.lineTo(x, y + w / 2);
	g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
	g.lineTo(x + w, y + h);
	g.closePath();
}
// Cusped arch outline, as on the painted facade.
function cusped(g, x, y, w, h) {
	g.beginPath();
	g.moveTo(x, y + h);
	g.lineTo(x, y + w * 0.5);
	const cx = x + w / 2, cy = y + w * 0.5, r = w / 2;
	const n = 5;
	for (let i = 0; i <= n; i++) {
		const a0 = Math.PI + (i / n) * Math.PI;
		g.lineTo(cx + Math.cos(a0) * r * (i % 2 ? 0.9 : 1), cy + Math.sin(a0) * r * (i % 2 ? 0.9 : 1));
	}
	g.lineTo(x + w, y + h);
	g.closePath();
}
function grime(g, W, H, R, n = 1500) {
	for (let i = 0; i < n; i++) {
		g.fillStyle = `rgba(0,0,0,${0.06 * R()})`;
		g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
	}
	const gr = g.createLinearGradient(0, H * 0.75, 0, H);
	gr.addColorStop(0, "rgba(40,30,20,0)");
	gr.addColorStop(1, "rgba(40,30,20,0.25)");
	g.fillStyle = gr;
	g.fillRect(0, 0, W, H);
}
// The Badrinath facade (Singhdwar): bands of red, blue, green and yellow around cusped arches.
function badriFacade() {
	const R = rand(17);
	return texOf(canvas(640, 740, (g, W, H) => {
		g.fillStyle = "#f2e6cc";
		g.fillRect(0, 0, W, H);
		const bands = ["#c8302b", "#2459b8", "#f0c02e", "#2f8a4a"];
		const pil = [0, 50, 186, 418, 554, 600];
		for (let i = 0; i < pil.length; i++) {
			for (let k = 0; k < 4; k++) {
				g.fillStyle = bands[(k + i) % 4];
				g.fillRect(pil[i] + k * 10, 50, 10, H - 50);
			}
			// floral dots down each pilaster
			g.fillStyle = "#f8f0dc";
			for (let y = 70; y < H; y += 26) g.fillRect(pil[i] + 18, y, 4, 4);
		}
		for (let k = 0; k < 5; k++) {
			g.fillStyle = bands[k % 4];
			g.fillRect(0, k * 10, W, 10);
			g.fillRect(0, 214 + k * 8, W, 8);
			g.fillRect(0, 470 + k * 8, W, 8);
		}
		// dentils under the cornices
		g.fillStyle = "#f0c02e";
		for (let x = 0; x < W; x += 14) {
			g.fillRect(x, 52, 8, 10);
			g.fillRect(x, 256, 8, 8);
		}
		// gallery of small arches under the crown
		for (let i = 0; i < 15; i++) {
			cusped(g, 14 + i * 41, 70, 30, 120);
			g.fillStyle = i % 2 ? "#2f8a4a" : "#c8302b";
			g.fill();
			cusped(g, 20 + i * 41, 80, 18, 104);
			g.fillStyle = "#1d2440";
			g.fill();
		}
		// side windows, two storeys
		for (const x of [94, 462]) {
			for (const y of [282, 514]) {
				cusped(g, x - 8, y - 8, 100, 190);
				g.fillStyle = "#c8302b";
				g.fill();
				cusped(g, x, y, 84, 174);
				g.fillStyle = "#2459b8";
				g.fill();
				cusped(g, x + 18, y + 22, 48, 140);
				g.fillStyle = "#1b1f33";
				g.fill();
				g.fillStyle = "#f0c02e";
				g.fillRect(x + 40, y + 22, 4, 140);
			}
		}
		// the central gateway
		cusped(g, 230, 270, 180, 470);
		g.fillStyle = "#e0a530";
		g.fill();
		cusped(g, 244, 286, 152, 454);
		g.fillStyle = "#c8302b";
		g.fill();
		cusped(g, 262, 310, 116, 430);
		g.fillStyle = "#2459b8";
		g.fill();
		cusped(g, 276, 330, 88, 410);
		g.fillStyle = "#24160f";
		g.fill();
		// a bell and toran over the gate
		g.fillStyle = "#f0c02e";
		for (let i = 0; i < 11; i++) {
			g.beginPath();
			g.arc(240 + i * 16, 262, 5, 0, Math.PI * 2);
			g.fill();
		}
		grime(g, W, H, R, 3000);
	}));
}
// Gopuram tier: rows of figure niches between pilasters in lime stucco, with painted accents.
function gopuramTier() {
	const R = rand(23);
	return texOf(canvas(512, 128, (g, W, H) => {
		g.fillStyle = "#efe7d6";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#d4c8b0";
		g.fillRect(0, 0, W, 14);
		g.fillRect(0, H - 12, W, 12);
		for (let i = 0; i < 12; i++) {
			const x = 6 + i * 42.5;
			g.fillStyle = "#c2b59c";
			g.fillRect(x, 18, 5, H - 32);
			arch(g, x + 11, 24, 24, 80);
			g.fillStyle = "#857862";
			g.fill();
			// a standing figure in the niche
			g.fillStyle = i % 3 === 0 ? "#d9a84a" : "#e8dcc4";
			g.beginPath();
			g.arc(x + 23, 46, 5, 0, Math.PI * 2);
			g.fill();
			g.fillRect(x + 18, 52, 10, 40);
		}
		grime(g, W, H, R, 1600);
	}));
}
// Prakara wall: the red and white vertical stripes of South Indian temple walls.
function stripes() {
	const R = rand(29);
	const m = std(0xffffff, { map: texOf(canvas(256, 128, (g, W, H) => {
		for (let i = 0; i < 16; i++) {
			g.fillStyle = i % 2 ? "#f3ece0" : "#a63a22";
			g.fillRect(i * 16, 0, 16, H);
		}
		g.fillStyle = "#e8dfcf";
		g.fillRect(0, 0, W, 14);
		grime(g, W, H, R, 1200);
	})), roughness: 0.9 });
	m.userData.tri = 1.6;
	return m;
}
// Carved tympanum for the Kedarnath gable: a seated figure in a ring of lotus petals, in relief.
function tympanum(base) {
	const R = rand(31);
	const draw = (g, W, H, relief) => {
		g.fillStyle = relief ? "#404040" : hexCss(base);
		g.fillRect(0, 0, W, H);
		const ink = (k) => (relief ? `rgb(${200 * k},${200 * k},${200 * k})` : hexCss(base, k));
		g.fillStyle = ink(0.75);
		g.beginPath();
		g.arc(W / 2, H * 0.62, H * 0.3, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = ink(1.08);
		for (let i = 0; i < 16; i++) {
			const a = (i / 16) * Math.PI * 2;
			g.beginPath();
			g.ellipse(W / 2 + Math.cos(a) * H * 0.3, H * 0.62 + Math.sin(a) * H * 0.3, 8, 4, a, 0, Math.PI * 2);
			g.fill();
		}
		g.fillStyle = ink(1.15);
		g.beginPath();
		g.arc(W / 2, H * 0.5, 12, 0, Math.PI * 2);
		g.fill();
		g.beginPath();
		g.ellipse(W / 2, H * 0.68, 26, 22, 0, 0, Math.PI * 2);
		g.fill();
		for (let i = 0; i < 1800; i++) {
			g.fillStyle = `rgba(0,0,0,${0.12 * R()})`;
			g.fillRect(R() * W, R() * H, 2, 2);
		}
	};
	const map = texOf(canvas(256, 128, (g, W, H) => draw(g, W, H, false)));
	const bump = texOf(canvas(256, 128, (g, W, H) => draw(g, W, H, true)), false);
	return std(0xffffff, { map, bumpMap: bump, bumpScale: 3, roughness: 0.9 });
}

// ---------- Kedarnath ----------
function kedarnath() {
	const g = new THREE.Group();
	const granite = stone(0x8b8780, { rows: 6, cols: 2, seed: 3, streaks: 0.6, moss: 0.3 }, 0.9);
	const graniteL = stone(0xa29e96, { rows: 6, cols: 2, seed: 4, streaks: 0.3 }, 0.9);
	const paving = stone(0x857f76, { rows: 4, cols: 3, seed: 5, jitter: 0.12 }, 1.4);
	const slate = stone(0x5d5a56, { rows: 10, cols: 4, seed: 6, jitter: 0.1 }, 0.8);
	const snow = std(0xf3f6fa, { roughness: 0.7 });
	const dark = std(0x241c16);
	// the paved courtyard and the stepped plinth
	mesh(box(6, 0.1, 7.6), paving, 0, 0.05, 0.8, g);
	mesh(box(2.6, 0.18, 3.9), graniteL, 0, 0.19, -0.1, g);
	mesh(box(2.4, 0.14, 3.7), granite, 0, 0.35, -0.1, g);
	steps(g, 0, 0.1, 2.35, 1.1, 0.1, 0.16, 3, graniteL);
	// sanctum walls and the curved, coursed shikhara
	const Z = -1.0;
	mesh(tower(1.2, (t) => 0.7 * mould(t), ratha, 96, 40), granite, 0, 0.42, Z, g);
	mesh(spire(1.95, 0.76, 0.62, 15), granite, 0, 1.62, Z, g);
	mesh(box(0.5, 0.1, 0.5), graniteL, 0, 3.6, Z, g);
	amalaka(g, 3.62, 0.26, graniteL).position.z = Z;
	mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.1, 12), GOLD, 0, 3.8, Z, g);
	kalash(g, 3.84, 0.8).position.z = Z;
	flag(g, 0.2, 3.7, Z);
	// snow lying on the lower courses of the spire
	for (const [y, r] of [[1.66, 0.82], [1.95, 0.76]]) mesh(tower(0.03, () => r, ratha, 96, 1), snow, 0, y, Z, g).castShadow = false;
	// the mandapa, with a pyramid of stone slabs carrying snow on every ledge
	mesh(box(2.0, 1.15, 1.9), granite, 0, 0.99, 0.55, g);
	mesh(box(2.12, 0.08, 2.02), graniteL, 0, 1.6, 0.55, g);
	for (let i = 0; i < 6; i++) {
		const w = 2.2 - i * 0.3, y = 1.68 + i * 0.13;
		mesh(box(w, 0.12, w * 0.92), slate, 0, y, 0.55, g);
		const sn = mesh(box(w - 0.12, 0.03, w * 0.92 - 0.12), snow, 0, y + 0.07, 0.55, g);
		sn.castShadow = false;
	}
	amalaka(g, 2.46, 0.18, graniteL).position.z = 0.55;
	kalash(g, 2.56, 0.45).position.z = 0.55;
	// the front portico under its carved gable
	mesh(box(1.45, 1.22, 0.4), graniteL, 0, 1.03, 1.68, g);
	const tri = new THREE.Shape([new THREE.Vector2(-0.8, 0), new THREE.Vector2(0.8, 0), new THREE.Vector2(0, 0.62)]);
	const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
	const gm = mesh(gable, [tympanum(0xa29e96), graniteL], 0, 1.64, 1.5, g);
	// map the face UVs to the carved panel
	const uv = gable.attributes.uv;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, (gable.attributes.position.getX(i) + 0.83) / 1.66, gable.attributes.position.getY(i) / 0.65);
	gm.castShadow = true;
	mesh(box(1.7, 0.07, 0.5), graniteL, 0, 1.64, 1.7, g);
	// doorway with a brass frame, bells and a marigold toran
	mesh(box(0.5, 0.82, 0.05), dark, 0, 0.83, 1.9, g);
	for (const x of [-0.29, 0.29]) mesh(box(0.06, 0.88, 0.06), GOLD, x, 0.86, 1.9, g);
	mesh(box(0.64, 0.06, 0.06), GOLD, 0, 1.3, 1.9, g);
	for (const x of [-0.18, 0, 0.18]) bell(g, x, 1.12, 1.95, 0.45);
	garland(g, new THREE.Vector3(-0.66, 1.55, 1.92), new THREE.Vector3(0.66, 1.55, 1.92), 0.22);
	garland(g, new THREE.Vector3(-0.4, 1.38, 1.93), new THREE.Vector3(0.4, 1.38, 1.93), 0.1, 0.022);
	// Nandi on his plinth, facing the door
	mesh(box(0.8, 0.22, 0.9), graniteL, 0, 0.21, 3.0, g);
	nandi(g, 0, 0.32, 3.0, 1.35, stone(0x3c3834, { rows: 12, cols: 1, mortar: 0.95, jitter: 0.05, seed: 7 }, 0.6));
	// Bhim Shila, the boulder that turned the 2013 flood
	const rock = mesh(new THREE.IcosahedronGeometry(0.6, 1), stone(0x6f675e, { rows: 3, cols: 2, mortar: 0.95, seed: 8, moss: 0.6 }, 1.2), 0.1, 0.38, -2.9, g);
	rock.scale.set(1.35, 0.75, 0.9);
	rock.geometry.attributes.position.array.forEach((v, i, a) => (a[i] = v * (1 + (Math.sin(i * 12.9) * 0.08))));
	rock.geometry.computeVertexNormals();
	for (const x of [-0.75, 0.75]) lamp(g, x, 1.05, 1.9, 0.05);
	lamp(g, 0, 1.45, 1.9, 0.04);
	// snow peaks: Kedarnath and Kedar Dome behind, ridges on both sides
	const peaks = [[-5, -30, 11, 22, 1], [10, -38, 14, 26, 2], [24, -26, 10, 17, 3], [-22, -22, 10, 16, 4], [-30, -6, 9, 13, 5], [30, -8, 9, 13, 6]];
	const crowd = [[-1.2, 2.3, 0.1], [1.2, 2.1, 0.1], [-0.75, 3.3, 0.1], [1.35, 3.1, 0.1], [-1.7, 3.8, 0.1], [0.9, 4.1, 0.1], [-2.1, 1.1, 0.1], [2.0, 1.3, 0.1], [1.7, 4.4, 0.1]];
	return { g, peaks, snowLine: 0.42, crowd };
}

// ---------- Badrinath ----------
function badrinath() {
	const g = new THREE.Group();
	const red = std(0xb8302a, { roughness: 0.75 });
	const white = plaster(0xf1ebde, 41);
	const side = plaster(0xe9d9b8, 42);
	const paving = stone(0x9a9085, { rows: 4, cols: 3, seed: 43 }, 1.3);
	const ghatStone = stone(0x7d7468, { rows: 6, cols: 2, seed: 44, moss: 0.4 }, 0.9);
	mesh(box(3.6, 0.3, 3.6), paving, 0, 0.15, -0.2, g);
	// the painted Singhdwar: deep facade, side towers with domes, a stepped crown
	const fm = std(0xffffff, { map: badriFacade(), roughness: 0.75 });
	const facade = new THREE.Mesh(box(2.4, 3.1, 0.55), [side, side, red, side, fm, side]);
	facade.position.set(0, 1.85, 1.12);
	facade.castShadow = facade.receiveShadow = true;
	g.add(facade);
	const band = (y, w, d) => mesh(box(w, 0.1, d), red, 0, y, 1.12, g);
	band(3.45, 2.6, 0.68);
	band(2.42, 2.5, 0.62);
	// the crown: a raised central parapet with the three gilded domes
	mesh(box(1.2, 0.36, 0.5), side, 0, 3.68, 1.12, g);
	mesh(box(1.3, 0.07, 0.56), red, 0, 3.88, 1.12, g);
	onion(g, 0, 3.9, 1.12, 0.2);
	kalash(g, 4.36, 0.45).position.z = 1.12;
	for (const x of [-0.9, 0.9]) {
		onion(g, x, 3.5, 1.12, 0.15);
		mesh(new THREE.ConeGeometry(0.02, 0.2, 6), GOLD, x, 3.95, 1.12, g);
	}
	// side towers, painted in the same bands
	const stripe = std(0xffffff, { map: texOf(canvas(64, 256, (c, W, H) => {
		const b = ["#c8302b", "#2459b8", "#f0c02e", "#2f8a4a"];
		for (let i = 0; i < 8; i++) {
			c.fillStyle = b[i % 4];
			c.fillRect(i * 8, 0, 8, H);
		}
		c.fillStyle = "#f2e6cc";
		for (let y = 20; y < H; y += 64) c.fillRect(0, y, W, 10);
	})), roughness: 0.75 });
	for (const x of [-1.38, 1.38]) {
		mesh(box(0.38, 3.3, 0.68), stripe, x, 1.95, 1.15, g);
		mesh(box(0.46, 0.08, 0.76), red, x, 3.62, 1.15, g);
		mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8), side, x, 3.75, 1.15, g);
		onion(g, x, 3.84, 1.15, 0.14);
	}
	// hall and sanctum behind, under the gilded curved roof
	mesh(box(2.3, 1.9, 2.3), white, 0, 1.25, -0.55, g);
	mesh(box(2.36, 0.14, 2.36), red, 0, 2.22, -0.55, g);
	mesh(tower(0.95, (t) => 1.05 * (1 - 0.75 * Math.pow(t, 1.3)) * (((t * 6) % 1) < 0.2 ? 0.96 : 1), square, 64, 30), GOLD, 0, 2.28, -0.55, g);
	const cup = mesh(new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, 0, 3.18, -0.55, g);
	cup.scale.y = 1.3;
	kalash(g, 3.52, 0.9).position.z = -0.55;
	flag(g, 0.3, 3.4, -0.55);
	// steps down from the gate to the ghat
	steps(g, 0, -0.02, 2.4, 1.3, 0.1, 0.25, 3, ghatStone);
	for (const x of [-0.18, 0, 0.18]) bell(g, x, 2.65, 1.42, 0.5);
	garland(g, new THREE.Vector3(-0.55, 2.3, 1.42), new THREE.Vector3(0.55, 2.3, 1.42), 0.25);
	// Tapt Kund: a stone tank of hot water, steaming in the cold
	mesh(box(1.3, 0.16, 1.0), ghatStone, -1.4, 0.08, 2.5, g);
	mesh(box(1.1, 0.04, 0.8), std(0x8fb0aa, { roughness: 0.15, metalness: 0.1 }), -1.4, 0.15, 2.5, g);
	const steam = [];
	for (let i = 0; i < 6; i++) {
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
		sp.position.set(-1.4 + (i - 2.5) * 0.16, 0.4 + i * 0.15, 2.5);
		sp.scale.setScalar(0.7);
		g.add(sp);
		steam.push(sp);
	}
	g.userData.steam = steam;
	for (const x of [-1.2, 1.2]) lamp(g, x, 0.7, 1.5, 0.06);
	// the bazaar: plastered houses with tin and slate roofs on both sides of the temple
	const walls = [0xe9dfc8, 0xd8e3ea, 0xeacdb8, 0xe8d39a, 0xdcd7cc, 0xf0e8e0];
	const roofs = [std(0x6f7a7f, { roughness: 0.5, metalness: 0.3 }), std(0x8f2e24, { roughness: 0.6, metalness: 0.2 }), std(0x3f6b55, { roughness: 0.6, metalness: 0.2 }), stone(0x5a5753, { rows: 10, cols: 4, seed: 45 }, 0.8)];
	const RH = rand(46);
	// kept behind and to the left of the temple so the view from the bridge stays open
	const spots = [[-3.1, -1.7], [-3.3, 0.1], [-4.5, -0.8], [-2.7, -3.1], [-4.3, 1.3], [-5.6, -2.4], [-1.0, -3.7], [1.2, -3.8], [2.9, -3.0], [4.2, -2.6], [-5.8, 0.4], [3.3, -4.4], [-3.8, -4.2]];
	spots.forEach(([x, z], i) => {
		const w = 0.75 + RH() * 0.4, d = 0.7 + RH() * 0.35, h = 0.55 + RH() * 0.5;
		house(g, x, z, w, h, d, windowsTex(walls[i % walls.length], [0x3a6aa0, 0x7a3a24, 0x2f6a4a][i % 3], 50 + i), roofs[i % roofs.length], (RH() - 0.5) * 0.3);
	});
	// Neelkanth behind, Narayan range behind the temple, Nar across the river
	const peaks = [[-12, -34, 11, 25, 11], [8, -22, 11, 17, 12], [-20, -14, 10, 15, 13], [6, 30, 11, 20, 14], [-14, 27, 9, 15, 15], [25, -12, 9, 16, 16]];
	const crowd = [[-1.0, 2.25, 0.02], [-0.45, 2.75, 0.02], [0.75, 2.2, 0.02], [1.15, 2.8, 0.02], [-1.9, 2.9, 0.02], [0.55, 1.75, 0.3], [-0.6, 1.8, 0.3], [-2.1, 2.1, 0.02]];
	return { g, peaks, snowLine: 0.5, river: { z: 3.6, w: 1.3 }, crowd };
}

// ---------- Tirumala ----------
// One tier of a Dravidian tower: a stuccoed storey ringed by a parapet of miniature shrines,
// square kutas at the corners and barrel-roofed shalas between.
function dravidaTier(parent, y, w, d, h, wall, top, kutaMat) {
	mesh(box(w, h, d), wall, 0, y + h / 2, 0, parent);
	mesh(box(w + 0.06, 0.05, d + 0.06), top, 0, y + h, 0, parent);
	const py = y + h + 0.025;
	const ks = Math.min(0.16, w * 0.12);
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
		mesh(box(ks, ks * 0.8, ks), kutaMat, (sx * (w - ks)) / 2, py + ks * 0.4, (sz * (d - ks)) / 2, parent);
		mesh(new THREE.SphereGeometry(ks * 0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), kutaMat, (sx * (w - ks)) / 2, py + ks * 0.8, (sz * (d - ks)) / 2, parent);
	}
	const shala = (x, z, len, rot) => {
		const c = mesh(new THREE.CylinderGeometry(ks * 0.45, ks * 0.45, len, 12, 1, false, 0, Math.PI), kutaMat, x, py + ks * 0.55, z, parent);
		c.rotation.set(0, rot, Math.PI / 2);
		mesh(box(rot ? ks : len, ks * 0.55, rot ? len : ks), kutaMat, x, py + ks * 0.28, z, parent);
	};
	shala(0, (d - ks) / 2, w * 0.38, 0);
	shala(0, -(d - ks) / 2, w * 0.38, 0);
	shala((w - ks) / 2, 0, d * 0.38, Math.PI / 2);
	shala(-(w - ks) / 2, 0, d * 0.38, Math.PI / 2);
	return y + h;
}
function gopuram(parent, tiers, baseW, baseD, baseH, scale, granite, lime) {
	const gp = new THREE.Group();
	const tierMat = std(0xffffff, { map: gopuramTier(), roughness: 0.9 });
	// granite base of two storeys with the great doorway
	mesh(box(baseW, baseH * 0.12, baseD + 0.08), granite, 0, baseH * 0.06, 0, gp);
	mesh(box(baseW, baseH, baseD), granite, 0, baseH / 2, 0, gp);
	mesh(box(baseW + 0.08, 0.06, baseD + 0.08), granite, 0, baseH, 0, gp);
	mesh(box(baseW * 0.26, baseH * 0.72, baseD + 0.02), std(0x2a1d14), 0, baseH * 0.36, 0, gp);
	mesh(box(baseW * 0.3, 0.05, baseD + 0.04), GOLD, 0, baseH * 0.74, 0, gp);
	let y = baseH;
	for (let i = 0; i < tiers; i++) {
		const f = 1 - i / (tiers + 1.2);
		y = dravidaTier(gp, y, baseW * 0.92 * f, baseD * 0.9 * (0.55 + 0.45 * f), 0.3 * scale, tierMat, lime, lime);
		y += 0.05 * scale;
	}
	// the barrel-vaulted crown (shala shikhara) with its row of gilded kalashas
	const cw = baseW * 0.92 * (1 - tiers / (tiers + 1.2)) + 0.25 * scale;
	const vault = mesh(new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, cw, 20, 1, false, 0, Math.PI), lime, 0, y, 0, gp);
	vault.rotation.z = Math.PI / 2;
	vault.rotation.y = 0;
	for (const sx of [-1, 1]) {
		const end = mesh(new THREE.CircleGeometry(0.24 * scale, 20, 0, Math.PI), lime, (sx * cw) / 2, y, 0, gp);
		end.rotation.y = (sx * Math.PI) / 2;
		end.material = lime;
	}
	const n = 7;
	for (let i = 0; i < n; i++) {
		const k = kalash(gp, y + 0.18 * scale, 0.55 * scale);
		k.position.x = -cw * 0.4 + (i / (n - 1)) * cw * 0.8;
	}
	parent.add(gp);
	return gp;
}
function tirumala() {
	const g = new THREE.Group();
	const granite = stone(0xa59b8c, { rows: 7, cols: 3, seed: 61, streaks: 0.3 }, 1.0);
	const paving = stone(0xb5ab9a, { rows: 4, cols: 4, seed: 62, jitter: 0.08 }, 1.2);
	const lime = plaster(0xf2ece0, 63);
	const wall = stripes();
	mesh(box(7.2, 0.2, 9.4), paving, 0, 0.1, 0.9, g);
	// outer prakara wall with its coping
	for (const [x, z, w, d] of [[-1.95, 3, 2.35, 0.3], [1.95, 3, 2.35, 0.3], [0, -3, 6.2, 0.3], [-3, 0, 0.3, 6.2], [3, 0, 0.3, 6.2]]) {
		mesh(box(w, 0.75, d), wall, x, 0.57, z, g);
		mesh(box(w + 0.08, 0.06, d + 0.08), lime, x, 0.97, z, g);
	}
	// Mahadwaram: the east gopuram, five tiers over a granite base
	const gp = gopuram(g, 5, 1.7, 0.95, 0.95, 1, granite, lime);
	gp.position.z = 3;
	// pillared colonnades along the inner face of the wall
	for (const sx of [-1, 1]) {
		for (let i = 0; i < 6; i++) for (const off of [0, 0.55]) pillar(g, sx * (2.3 - off), 0.2, -2.2 + i * 0.85, 0.75, 0.05, granite);
		mesh(box(0.85, 0.08, 5.0), granite, sx * 2.45, 0.99, -0.07, g);
		mesh(box(0.95, 0.04, 5.1), lime, sx * 2.45, 1.05, -0.07, g);
	}
	// the inner enclosure around the sanctum, with the Vendi Vakili gate
	for (const [x, z, w, d] of [[-1.0, 0.95, 1.0, 0.22], [1.0, 0.95, 1.0, 0.22], [0, -2.25, 3.2, 0.22], [-1.6, -0.65, 0.22, 3.4], [1.6, -0.65, 0.22, 3.4]]) mesh(box(w, 0.6, d), lime, x, 0.5, z, g);
	const inner = gopuram(g, 2, 1.0, 0.5, 0.7, 0.75, granite, lime);
	inner.position.z = 0.95;
	// golden dhvajastambha and the balipitham before it
	mesh(box(0.34, 0.16, 0.34), granite, 0, 0.28, 1.9, g);
	mesh(new THREE.CylinderGeometry(0.035, 0.055, 2.6, 12), GOLD, 0, 1.65, 1.9, g);
	for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), GOLD, 0, 0.6 + i * 0.4, 1.9, g).rotation.x = Math.PI / 2;
	mesh(box(0.24, 0.05, 0.14), GOLD, 0, 2.97, 1.9, g);
	mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 16), GOLD, 0, 0.31, 2.35, g);
	mesh(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, 0, 0.42, 2.35, g).scale.y = 0.6;
	// Ananda Nilayam: the gilded vimana over the sanctum, three tiers and a round dome
	const VZ = -0.75;
	const v = new THREE.Group();
	mesh(box(1.45, 0.85, 1.45), granite, 0, 0.62, 0, v);
	mesh(box(1.55, 0.06, 1.55), granite, 0, 1.06, 0, v);
	let vy = 1.09;
	for (const [w, h] of [[1.3, 0.38], [1.02, 0.34], [0.76, 0.3]]) vy = dravidaTier(v, vy, w, w, h, GOLD, GOLD, GOLD) + 0.04;
	mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.2, 8), GOLD, 0, vy + 0.1, 0, v);
	const dome = mesh(new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), GOLD, 0, vy + 0.18, 0, v);
	dome.scale.y = 1.05;
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2;
		const kd = mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, Math.sin(a) * 0.4, vy + 0.22, Math.cos(a) * 0.4, v);
		kd.scale.y = 1.5;
	}
	kalash(v, vy + 0.58, 0.85);
	v.position.z = VZ;
	g.add(v);
	for (const x of [-2.4, -1.2, 1.2, 2.4]) lamp(g, x, 1.1, 3.17, 0.06);
	lamp(g, 0, 1.0, 3.5, 0.05);
	const crowd = [[-0.7, 1.7, 0.2], [0.75, 2.2, 0.2], [-1.1, 2.4, 0.2], [1.2, 1.55, 0.2], [-1.4, 3.9, 0.2], [1.3, 4.2, 0.2], [-0.75, 4.75, 0.2], [1.9, 4.7, 0.2], [-2.2, 4.4, 0.2], [0.6, 5.0, 0.2]];
	return { g, hills: true, peaks: [], crowd };
}

// ---------- Bhimashankar ----------
function bhimashankar() {
	const g = new THREE.Group();
	const basalt = stone(0x3f3b37, { rows: 9, cols: 3, seed: 71, streaks: 0.9, moss: 0.8, jitter: 0.2 }, 0.8);
	const basaltL = stone(0x57524c, { rows: 7, cols: 3, seed: 72, streaks: 0.5, moss: 0.6 }, 0.9);
	const paving = stone(0x5e5850, { rows: 4, cols: 3, seed: 73, moss: 1, roughness: 0.45 }, 1.3);
	paving.roughness = 0.45; // wet with monsoon rain
	mesh(box(5.4, 0.08, 7.4), paving, 0, 0.04, 0.8, g);
	mesh(box(2.7, 0.2, 4.2), basaltL, 0, 0.18, -0.1, g);
	steps(g, 0, 0.08, 2.35, 1.0, 0.1, 0.15, 2, basaltL);
	// sanctum walls with rathas and mouldings
	const Z = -0.9;
	mesh(tower(1.0, (t) => 0.64 * mould(t), ratha, 96, 40), basalt, 0, 0.28, Z, g);
	// the curved Nagara shikhara, clustered with smaller spires (urushringas) in the Shekhari manner
	mesh(spire(2.15, 0.7, 0.72, 13), basalt, 0, 1.28, Z, g);
	const uru = (x, z, H, r) => {
		mesh(spire(H, r, 0.75, Math.round(H * 6), ratha, 48), basalt, x, 1.28, Z + z, g);
		amalaka(g, 1.28 + H - 0.02, r * 0.42, basaltL).position.set(x, 1.28 + H - 0.02, Z + z);
	};
	for (const [x, z] of [[-0.62, 0], [0.62, 0], [0, -0.62]]) uru(x, z, 1.25, 0.3);
	for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.62, 0.45], [0.62, 0.45]]) uru(x, z, 0.75, 0.2);
	amalaka(g, 3.4, 0.3, basaltL).position.z = Z;
	kalash(g, 3.56, 0.85).position.z = Z;
	flag(g, 0.16, 3.6, Z);
	// the hall, its stepped samvarana roof and an open pillared porch
	mesh(tower(0.85, (t) => 0.8 * mould(t), ratha, 96, 40), basalt, 0, 0.28, 0.75, g);
	mesh(tower(0.78, (t) => 0.98 * (1 - 0.8 * (Math.floor(t * 6) / 6)) * (((t * 6) % 1) > 0.7 ? 0.94 : 1), square, 64, 48), basaltL, 0, 1.13, 0.75, g);
	amalaka(g, 1.88, 0.16, basaltL).position.z = 0.75;
	kalash(g, 1.96, 0.45).position.z = 0.75;
	for (const x of [-0.45, 0.45]) for (const z of [1.72, 2.12]) pillar(g, x, 0.28, z, 0.8, 0.05, basaltL);
	mesh(box(1.2, 0.1, 0.8), basaltL, 0, 1.12, 1.92, g);
	const eave = mesh(box(1.38, 0.05, 0.95), basalt, 0, 1.2, 1.94, g);
	eave.rotation.x = 0.06;
	mesh(box(0.42, 0.66, 0.05), std(0x1a1410), 0, 0.62, 1.58, g);
	for (const x of [-0.25, 0.25]) mesh(box(0.05, 0.72, 0.06), GOLD, x, 0.64, 1.6, g);
	garland(g, new THREE.Vector3(-0.5, 1.06, 2.32), new THREE.Vector3(0.5, 1.06, 2.32), 0.16);
	// Nandi before the door
	mesh(box(0.6, 0.12, 0.7), basaltL, 0, 0.14, 2.9, g);
	nandi(g, 0, 0.2, 2.9, 1.05, stone(0x2e2a27, { rows: 12, cols: 1, mortar: 0.95, jitter: 0.05, seed: 74 }, 0.6));
	// the great bell in its pavilion, and a deepmala (lamp tower) opposite
	const bronze = std(0x9a6b33, { metalness: 0.75, roughness: 0.35 });
	const bp = new THREE.Group();
	for (const x of [-0.42, 0.42]) pillar(bp, x, 0, 0, 1.15, 0.05, basaltL);
	mesh(box(1.05, 0.12, 0.4), basaltL, 0, 1.2, 0, bp);
	const br = mesh(new THREE.ConeGeometry(0.62, 0.32, 4, 1), basalt, 0, 1.42, 0, bp);
	br.rotation.y = Math.PI / 4;
	br.scale.z = 0.55;
	bell(bp, 0, 0.68, 0, 1.4, bronze);
	bp.position.set(1.7, 0.08, 2.2);
	bp.rotation.y = -0.4;
	g.add(bp);
	const dm = new THREE.Group();
	mesh(box(0.34, 0.16, 0.34), basaltL, 0, 0.08, 0, dm);
	mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.5, 8), basalt, 0, 0.9, 0, dm);
	for (let i = 0; i < 6; i++) {
		const y = 0.35 + i * 0.22;
		for (let k = 0; k < 6; k++) {
			const a = (k / 6) * Math.PI * 2 + i * 0.5;
			const r = 0.13 - i * 0.008;
			mesh(box(0.06, 0.03, 0.06), basaltL, Math.sin(a) * r, y, Math.cos(a) * r, dm);
			lamp(dm, Math.sin(a) * r, y + 0.035, Math.cos(a) * r, 0.018);
		}
	}
	kalash(dm, 1.65, 0.3, basaltL);
	dm.position.set(-1.55, 0.08, 2.3);
	g.add(dm);
	for (const x of [-0.6, 0.6]) lamp(g, x, 0.75, 1.6, 0.05);
	const crowd = [[-0.85, 2.15, 0.08], [0.85, 2.5, 0.08], [-1.0, 3.1, 0.08], [0.95, 3.3, 0.08], [-1.7, 3.6, 0.08], [1.6, 3.8, 0.08], [-0.6, 4.0, 0.08], [2.1, 1.2, 0.08], [-2.1, 1.0, 0.08]];
	return { g, forest: true, peaks: [], crowd };
}

const BUILDERS = { kedarnath, badrinath, tirupati: tirumala, bhimashankar };

// A sky-and-earth environment so gilding and bronze catch light.
function environment(renderer) {
	const pm = new THREE.PMREMGenerator(renderer);
	const s = new THREE.Scene();
	const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
		side: THREE.BackSide,
		vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
		fragmentShader: "varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = h > 0.0 ? mix(vec3(0.95,0.85,0.7), vec3(0.35,0.55,0.85), pow(h, 0.6)) : mix(vec3(0.5,0.42,0.32), vec3(0.18,0.15,0.12), pow(-h, 0.5)); c += vec3(1.6,1.3,0.9) * pow(max(dot(d, normalize(vec3(0.5,0.45,0.6))), 0.0), 40.0); gl_FragColor = vec4(c, 1.0); }",
	}));
	s.add(sky);
	const env = pm.fromScene(s, 0.02).texture;
	pm.dispose();
	return env;
}

export function buildLandmarks(world, scene, renderer, crowdFigure) {
	const env = renderer ? environment(renderer) : null;
	if (env) {
		GOLD.envMap = env;
		GOLD.envMapIntensity = 1.1;
		GOLD.needsUpdate = true;
	}
	const out = [];
	for (const s of SHRINES) {
		const w = toWorld(s.lon, s.lat);
		const y = world.height(w.x, w.z);
		const spec = BUILDERS[s.key]();
		if (crowdFigure && spec.crowd) {
			spec.crowd.forEach(([x, z, fy], i) => {
				const f = crowdFigure(s.key.length * 100 + i * 7 + 3, s.key);
				f.position.set(x, fy - 0.0, z);
				// pilgrims face the shrine, with a little variety
				f.rotation.y = Math.atan2(-x, -z + (s.key === "tirupati" && z > 3 ? -2 : 0)) + Math.sin(i * 3.1) * 0.35;
				spec.g.add(f);
			});
		}
		const root = new THREE.Group();
		root.position.set(w.x, y - 0.05, w.z);
		root.rotation.y = s.facing;
		root.add(spec.g);
		scene.add(root);
		projectUVs(spec.g);
		if (env) spec.g.traverse((o) => {
			if (o.isMesh && !Array.isArray(o.material) && o.material.metalness > 0.5 && !o.material.envMap) {
				o.material.envMap = env;
				o.material.needsUpdate = true;
			}
		});
		// Local-to-world helper for set dressing that must follow the terrain.
		const toW = (lx, lz) => {
			const c = Math.cos(s.facing), sn = Math.sin(s.facing);
			return { x: w.x + lx * c + lz * sn, z: w.z - lx * sn + lz * c };
		};
		const toL = (x, z) => {
			const dx = x - w.x, dz = z - w.z, c = Math.cos(s.facing), sn = Math.sin(s.facing);
			return { x: dx * c - dz * sn, z: dx * sn + dz * c };
		};
		const decor = new THREE.Group();
		scene.add(decor);
		for (const [lx, lz, r, h, seed] of spec.peaks) {
			const p = toW(lx, lz);
			const m = peak(r, h, seed, spec.snowLine);
			m.position.set(p.x, Math.min(world.height(p.x, p.z), y + 2) - 3, p.z);
			m.rotation.y = seed;
			m.userData.peak = { r, h };
			decor.add(m);
		}
		if (spec.river) {
			const pts = [];
			for (let lx = 14; lx >= -14; lx -= 0.7) {
				const p = toW(lx, spec.river.z + Math.sin(lx * 0.4) * 0.3);
				pts.push(new THREE.Vector3(p.x, world.height(p.x, p.z) + 0.06, p.z));
			}
			decor.add(ribbonMesh(pts, spec.river.w, std(0x5f9fa6, { roughness: 0.25, metalness: 0.1, emissive: 0x0d2a30, emissiveIntensity: 0.4 })));
			// a footbridge with railings across to the temple
			const b = toW(0.2, spec.river.z);
			const bridge = new THREE.Group();
			const L = spec.river.w + 1.4;
			const iron = std(0x6b7378, { metalness: 0.5, roughness: 0.5 });
			mesh(box(0.42, 0.06, L), std(0x7a6a58), 0, 0, 0, bridge);
			for (const sx of [-1, 1]) {
				mesh(box(0.025, 0.025, L), iron, sx * 0.2, 0.2, 0, bridge);
				for (let k = 0; k <= 8; k++) mesh(box(0.02, 0.2, 0.02), iron, sx * 0.2, 0.1, -L / 2 + (k / 8) * L, bridge);
				for (let k = 0; k < 4; k++) flag(bridge, sx * 0.2, 0.2, -L / 2 + 0.2 + k * (L / 4), [0xff8a1e, 0xd8261c, 0xf2c14e, 0x2f8a4a][k], 0.5);
			}
			bridge.position.set(b.x, world.height(b.x, b.z) + 0.25, b.z);
			bridge.rotation.y = s.facing;
			decor.add(bridge);
		}
		if (spec.hills) {
			// the seven hills of Tirumala, rounded and forested
			const R = rand(77);
			const hm = terrainDetail(std(0x5d6f3c, { roughness: 0.95 }), "hill");
			for (let i = 0; i < 7; i++) {
				const a = Math.PI * 0.35 + (i / 6) * Math.PI * 1.3;
				const d = 13 + R() * 6;
				const p = toW(Math.cos(a) * d, -Math.sin(a) * d);
				const r = 6 + R() * 3, h = 4 + R() * 2.5;
				const geo = new THREE.SphereGeometry(1, 48, 24);
				const gp = geo.attributes.position;
				for (let k = 0; k < gp.count; k++) {
					const n = 1 + (fbm(gp.getX(k) * 2 + i, gp.getZ(k) * 2 + gp.getY(k), 3) - 0.5) * 0.25;
					gp.setXYZ(k, gp.getX(k) * n, gp.getY(k) * n, gp.getZ(k) * n);
				}
				geo.computeVertexNormals();
				const m = mesh(geo, hm, p.x, world.height(p.x, p.z) - h * 0.35, p.z, decor);
				m.scale.set(r, h, r * (0.8 + R() * 0.4));
				m.castShadow = false;
			}
		}
		if (spec.forest || spec.hills) {
			// keep the paved courtyard and the approach in front of the door open
			const half = spec.forest ? 2.9 : 3.8, front = spec.forest ? 4.6 : 5.6;
			const clear = (x, z) => {
				const l = toL(x, z);
				return Math.abs(l.x) < half + 0.4 && l.z < front + 0.4 && l.z > -half - 0.6;
			};
			decor.add(forest(world, w, spec.forest ? 560 : 220, 3, spec.forest ? 15 : 12, spec.forest ? 91 : 92, spec.forest, clear));
		}
		// a tall soft beacon so each shrine can be found from the air
		const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 16, 1, true), beaconMaterial());
		beacon.position.set(w.x, y + 30, w.z);
		beacon.renderOrder = 5;
		scene.add(beacon);
		out.push({ shrine: s, root, decor, pos: new THREE.Vector3(w.x, y, w.z), beacon, steam: spec.g.userData.steam || [] });
	}
	return out;
}

export const glowTexture = (() => {
	let t;
	return () => {
		if (t) return t;
		t = new THREE.CanvasTexture(canvas(64, 64, (g, w) => {
			const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
			gr.addColorStop(0, "rgba(255,255,255,1)");
			gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
			gr.addColorStop(1, "rgba(255,255,255,0)");
			g.fillStyle = gr;
			g.fillRect(0, 0, w, w);
		}));
		t.colorSpace = THREE.SRGBColorSpace;
		return t;
	};
})();

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
