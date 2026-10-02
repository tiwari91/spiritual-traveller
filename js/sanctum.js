// Inside the temple: an interior for each of the four shrines, where the traveller performs that shrine's
// rituals one step at a time with a pujari. Self-contained: its own scene, camera, lights and DOM panel.
//
// API
//   import { Sanctum } from "./sanctum.js";
//   const sanctum = new Sanctum({ renderer, container: document.body, audio, low: false, onExit, onStep });
//   sanctum.enter(key)       key is a SHRINES key: "bhimashankar", "tirupati", "kedarnath" or "badrinath".
//                            Builds that interior (one at a time) and shows the ritual panel inside container.
//   sanctum.active           true from enter() until exit() has finished its fade.
//   sanctum.update(dt, t)    advance the animation; dt and t in seconds.
//   sanctum.render()         draw its own scene with its own camera into renderer. Tone mapping, exposure,
//                            shadow map flag, clear colour and autoClear are restored afterwards.
//   sanctum.resize(w, h)     canvas size in CSS pixels (call from the window resize handler).
//   sanctum.go(i), next(), back()   move between ritual steps; next() on the last step exits.
//   sanctum.exit()           fades to black, disposes the scene and the panel, then calls onExit(key).
//   onStep(index, step, key) is called on every step change; step = { title, note, mantra, latin }.
//
// Wiring it into main.js
//   - Link css/sanctum.css in index.html. Call sanctum.resize(innerWidth, innerHeight) after enter() and on resize.
//   - While sanctum.active, call sanctum.update(dt, t) and sanctum.render() instead of rendering the map scene.
//   - Keys (keydown and keyup) are taken on window in the capture phase and stopped while active, so main's
//     window key handlers never see them. Space, Enter and Right go to the next ritual, Left goes back,
//     Esc returns outside. M is let through so main's sound toggle keeps working.
//   - The overlay (z-index 24, above .hud, below dialogs) stops pointer and wheel events; a drag looks around.
//   - document.body gets the class "sanctum-open" while inside; css/sanctum.css uses it to hide .hud.
//   - Bells use audio.bell(n); the aarti hand bell is synthesised on audio.ctx/audio.master when sound is on.
//   - Units are metres. Nothing here touches the map scene or main's camera.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { body, pose, SKIN, crowdFigure } from "./pilgrim.js";
import { glowTexture } from "./landmarks.js";
import { SHRINES } from "./geo.js";
import { clamp, fbm, lerp, rand } from "./util.js";

// Textures and materials shared across visits are never disposed.
const KEEP = new WeakSet();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o));
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	m.castShadow = true;
	m.receiveShadow = true;
	if (parent) parent.add(m);
	return m;
}
const lathe = (pts, segs = 24, s = 1) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * s, y * s)), segs);

// ---------- textures (procedural, after landmarks.js) ----------
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
const css = (c, k = 1) => {
	const col = new THREE.Color(c);
	return `rgb(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0})`;
};
// Coursed blocks with mortar joints, grain and soot streaks; colour and bump maps.
function masonry({ base, rows = 6, cols = 2, jitter = 0.14, mortar = 0.55, seed = 1, streaks = 0, size = 256, wear = 0 }) {
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
		g.fillStyle = css(base, mortar);
		g.fillRect(0, 0, W, H);
		for (const [x, y, w, h, k] of blocks) {
			g.fillStyle = css(base, k);
			g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
			g.fillRect(x + 1.5 - W, y + 1.5, w - 3, h - 3);
			if (wear) {
				// polished, foot-worn centres
				const gr = g.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w * 0.6);
				gr.addColorStop(0, `rgba(255,240,220,${0.07 * wear})`);
				gr.addColorStop(1, "rgba(255,240,220,0)");
				g.fillStyle = gr;
				g.fillRect(x, y, w, h);
			}
		}
		for (let i = 0; i < size * 16; i++) {
			g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.14 * R()})` : `rgba(255,255,255,${0.07 * R()})`;
			g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
		}
		for (let i = 0; i < streaks * 30; i++) {
			const x = R() * W, w = 2 + R() * 8, y0 = Math.floor(R() * rows) * rh;
			const gr = g.createLinearGradient(0, y0, 0, y0 + rh * (1 + R() * 3));
			gr.addColorStop(0, `rgba(8,6,4,${0.3 * streaks})`);
			gr.addColorStop(1, "rgba(8,6,4,0)");
			g.fillStyle = gr;
			g.fillRect(x, y0, w, rh * 4);
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
// Stone whose UVs are projected in world space (scale metres per tile), darkened with soot toward the ceiling.
function stoneMat(base, o = {}) {
	const t = masonry(Object.assign({ base }, o));
	const m = std(0xffffff, { map: t.map, bumpMap: t.bump, bumpScale: o.bump ?? 1.6, roughness: o.rough ?? 0.88, metalness: o.metal ?? 0, vertexColors: true });
	m.userData.tri = o.scale ?? 1.2;
	return m;
}
// A painted interior wall: dado, bands and floral roundels in the Badrinath colours. One tile per wall height.
function paintedMat(seed, H) {
	const R = rand(seed);
	const c = canvas(512, 512, (g, W, Hh) => {
		g.fillStyle = "#9c8a68";
		g.fillRect(0, 0, W, Hh);
		const band = (y, h, col) => { g.fillStyle = col; g.fillRect(0, y, W, h); };
		band(Hh * 0.72, Hh * 0.28, "#7a2019");
		band(Hh * 0.69, Hh * 0.03, "#b8862c");
		band(Hh * 0.62, Hh * 0.07, "#24543a");
		band(Hh * 0.6, Hh * 0.02, "#b8862c");
		band(0, Hh * 0.08, "#1c3362");
		band(Hh * 0.08, Hh * 0.02, "#b8862c");
		for (let i = 0; i < 4; i++) {
			const x = W * (i + 0.5) / 4, y = Hh * 0.34;
			g.fillStyle = "#2f6a4a";
			g.beginPath();
			g.arc(x, y, 40, 0, Math.PI * 2);
			g.fill();
			for (let k = 0; k < 8; k++) {
				g.fillStyle = k % 2 ? "#c23a2a" : "#e0a53a";
				g.beginPath();
				g.ellipse(x + Math.cos(k * Math.PI / 4) * 26, y + Math.sin(k * Math.PI / 4) * 26, 12, 7, k * Math.PI / 4, 0, Math.PI * 2);
				g.fill();
			}
			g.fillStyle = "#f2d27a";
			g.beginPath();
			g.arc(x, y, 9, 0, Math.PI * 2);
			g.fill();
		}
		for (let i = 0; i < 16; i++) {
			g.fillStyle = "#e0a53a";
			g.beginPath();
			g.moveTo(W * i / 16, Hh * 0.72);
			g.lineTo(W * (i + 0.5) / 16, Hh * 0.79);
			g.lineTo(W * (i + 1) / 16, Hh * 0.72);
			g.fill();
		}
		for (let i = 0; i < 9000; i++) {
			g.fillStyle = `rgba(${R() < 0.6 ? "40,25,10" : "255,250,235"},${0.06 * R()})`;
			g.fillRect(R() * W, R() * Hh, 1 + R() * 2, 1 + R() * 2);
		}
	});
	const m = std(0xffffff, { map: texOf(c), roughness: 0.8, vertexColors: true });
	m.userData.tri = H;
	return m;
}
// Gold sheet with embossed panels, for the Bangaru Vakili doors and the altars.
function repousse(base, seed, rows = 6, cols = 3) {
	const R = rand(seed);
	const draw = (g, W, H, bump) => {
		g.fillStyle = bump ? "#606060" : css(base, 0.8);
		g.fillRect(0, 0, W, H);
		const cw = W / cols, rh = H / rows;
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) {
				const x = c * cw, y = r * rh;
				g.fillStyle = bump ? "#a0a0a0" : css(base, 1.05);
				g.fillRect(x + 6, y + 6, cw - 12, rh - 12);
				g.fillStyle = bump ? "#e0e0e0" : css(base, 1.25);
				g.beginPath();
				g.ellipse(x + cw / 2, y + rh * 0.48, cw * 0.22, rh * 0.32, 0, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = bump ? "#b0b0b0" : css(base, 0.95);
				g.beginPath();
				g.arc(x + cw / 2, y + rh * 0.3, cw * 0.09, 0, Math.PI * 2);
				g.fill();
			}
		if (!bump)
			for (let i = 0; i < 3000; i++) {
				g.fillStyle = `rgba(${R() < 0.5 ? "60,30,0" : "255,240,200"},${0.12 * R()})`;
				g.fillRect(R() * W, R() * H, 1, 1);
			}
	};
	return { map: texOf(canvas(256, 256, (g, W, H) => draw(g, W, H, false))), bump: texOf(canvas(256, 256, (g, W, H) => draw(g, W, H, true)), false) };
}
// Rough stone grain for the deities and the Kedarnath rock.
function grainTex(base, seed) {
	const R = rand(seed);
	return texOf(canvas(256, 256, (g, W, H) => {
		g.fillStyle = css(base);
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 9000; i++) {
			g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.25 * R()})` : `rgba(255,255,255,${0.1 * R()})`;
			g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3);
		}
	}));
}
// Box-project UVs in the group's frame by dominant normal axis, for materials with userData.tri.
function projectUVs(group) {
	group.updateMatrixWorld(true);
	const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
	const v = V(), n = V(), mtx = new THREE.Matrix4(), nm = new THREE.Matrix3();
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
// Lamp soot: vertex colours darken with height (and a little at the floor) for materials that use them.
function soot(group, y0, y1, floorY = -99) {
	group.updateMatrixWorld(true);
	const v = V();
	group.traverse((o) => {
		if (!o.isMesh || !o.material.vertexColors || o.geometry.attributes.color) return;
		const p = o.geometry.attributes.position;
		const c = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) {
			v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
			let k = 1 - 0.6 * ease((v.y - y0) / (y1 - y0));
			if (v.y < floorY + 0.4) k *= 0.8 + 0.2 * ease((v.y - floorY) / 0.4);
			c.set([k, k * 0.97, k * 0.94], i * 3);
		}
		o.geometry.setAttribute("color", new THREE.BufferAttribute(c, 3));
	});
}

// ---------- sprites ----------
const FLAME_TEX = (() => {
	let t;
	return () => {
		if (t) return t;
		t = new THREE.CanvasTexture(canvas(64, 128, (g, W, H) => {
			const gr = g.createRadialGradient(W / 2, H * 0.68, 2, W / 2, H * 0.6, H * 0.42);
			gr.addColorStop(0, "rgba(255,255,235,1)");
			gr.addColorStop(0.25, "rgba(255,220,120,0.95)");
			gr.addColorStop(0.6, "rgba(255,140,40,0.55)");
			gr.addColorStop(1, "rgba(255,80,10,0)");
			g.fillStyle = gr;
			g.beginPath();
			g.moveTo(W / 2, 4);
			g.bezierCurveTo(W * 0.78, H * 0.4, W * 0.92, H * 0.7, W / 2, H * 0.96);
			g.bezierCurveTo(W * 0.08, H * 0.7, W * 0.22, H * 0.4, W / 2, 4);
			g.fill();
		}));
		t.colorSpace = THREE.SRGBColorSpace;
		KEEP.add(t);
		return t;
	};
})();
const SMOKE_TEX = (() => {
	let t;
	return () => {
		if (t) return t;
		const R = rand(77);
		t = new THREE.CanvasTexture(canvas(128, 128, (g, W) => {
			for (let i = 0; i < 26; i++) {
				const x = W / 2 + (R() - 0.5) * W * 0.4, y = W / 2 + (R() - 0.5) * W * 0.4, r = W * (0.12 + R() * 0.2);
				const gr = g.createRadialGradient(x, y, 0, x, y, r);
				gr.addColorStop(0, "rgba(255,255,255,0.18)");
				gr.addColorStop(1, "rgba(255,255,255,0)");
				g.fillStyle = gr;
				g.fillRect(0, 0, W, W);
			}
		}));
		t.colorSpace = THREE.SRGBColorSpace;
		KEEP.add(t);
		return t;
	};
})();
const glow = () => {
	const t = glowTexture();
	KEEP.add(t);
	return t;
};
// Marks on the forehead, drawn on a patch of sphere over the front of the head.
const MARKS = {
	tripundra(g, W, H) {
		g.fillStyle = "rgba(235,232,225,0.95)";
		for (let i = 0; i < 3; i++) g.fillRect(W * 0.2, H * (0.3 + i * 0.085), W * 0.6, H * 0.045);
		g.fillStyle = "#c81e14";
		g.beginPath();
		g.arc(W / 2, H * 0.4, W * 0.03, 0, Math.PI * 2);
		g.fill();
	},
	namam(g, W, H) {
		// the broad white U of the Tirumala namam, with the red srichurnam line, low enough to cover the eyes
		g.fillStyle = "rgba(250,250,245,1)";
		g.beginPath();
		g.moveTo(W * 0.24, H * 0.02);
		g.lineTo(W * 0.38, H * 0.02);
		g.lineTo(W * 0.44, H * 0.78);
		g.lineTo(W * 0.56, H * 0.78);
		g.lineTo(W * 0.62, H * 0.02);
		g.lineTo(W * 0.76, H * 0.02);
		g.lineTo(W * 0.64, H * 0.92);
		g.lineTo(W * 0.36, H * 0.92);
		g.closePath();
		g.fill();
		g.fillStyle = "#d8261a";
		g.fillRect(W * 0.475, H * 0.02, W * 0.05, H * 0.72);
	},
	urdhva(g, W, H) {
		g.fillStyle = "rgba(240,236,226,0.95)";
		g.fillRect(W * 0.4, H * 0.12, W * 0.05, H * 0.36);
		g.fillRect(W * 0.55, H * 0.12, W * 0.05, H * 0.36);
		g.fillStyle = "#d02a16";
		g.fillRect(W * 0.48, H * 0.12, W * 0.04, H * 0.34);
	},
	chandan(g, W, H) {
		g.fillStyle = "rgba(240,190,110,0.95)";
		g.beginPath();
		g.ellipse(W / 2, H * 0.32, W * 0.05, H * 0.16, 0, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = "#c81e14";
		g.beginPath();
		g.arc(W / 2, H * 0.42, W * 0.025, 0, Math.PI * 2);
		g.fill();
	},
};
function markPatch(kind, r = 0.107, lo = 0.62, hi = 1.62) {
	const t = new THREE.CanvasTexture(canvas(128, 128, (g, W, H) => MARKS[kind](g, W, H)));
	t.colorSpace = THREE.SRGBColorSpace;
	const geo = new THREE.SphereGeometry(r, 24, 12, Math.PI / 2 - 0.75, 1.5, lo, hi - lo);
	const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
	m.scale.set(0.92, 1.08, 1);
	m.renderOrder = 2;
	return m;
}

// ---------- shared furnishings ----------
const MAT = () => {
	const M = {
		brass: std(0xc9963e, { metalness: 0.85, roughness: 0.32 }),
		gold: std(0xe2aa3c, { metalness: 0.95, roughness: 0.24, emissive: 0x3a2204, emissiveIntensity: 0.25 }),
		silver: std(0xd6d6d2, { metalness: 0.92, roughness: 0.22 }),
		copper: std(0xb8643a, { metalness: 0.85, roughness: 0.3 }),
		marigold: std(0xff9614, { roughness: 0.75, emissive: 0x4a1a00, emissiveIntensity: 0.25 }),
		jasmine: std(0xf3efe2, { roughness: 0.8 }),
		rose: std(0xb3121d, { roughness: 0.75 }),
		leaf: std(0x3f6e2a, { roughness: 0.6, side: THREE.DoubleSide }),
		tulsi: std(0x3d6a33, { roughness: 0.7, side: THREE.DoubleSide }),
		wood: std(0x6b4a2a, { roughness: 0.7 }),
		cloth: std(0xf3efe6, { roughness: 0.95 }),
		red: std(0xa8201c, { roughness: 0.8 }),
		ash: std(0xd8d4cc, { roughness: 1 }),
		water: std(0x6f8796, { roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0 }),
	};
	return M;
};
// A flight of steps falling toward -z: top at y0 at z0, n steps of rise and run.
function stepsDown(g, x, w, z0, y0, rise, run, n, mat) {
	for (let i = 0; i < n; i++) {
		const top = y0 - rise * (i + 1);
		mesh(new THREE.BoxGeometry(w, top - (y0 - rise * n) + 0.02, run), mat, x, (top + y0 - rise * n) / 2 - 0.01, z0 - run * (i + 0.5), g);
	}
}
function box(g, x0, x1, y0, y1, z0, z1, mat, seg = 4) {
	return mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, 1, seg, 1), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, g);
}
// A wall across x at depth z (thickness t) with an optional door [x0, x1, y1].
function wallZ(g, z, x0, x1, y0, y1, t, mat, door) {
	if (!door) return box(g, x0, x1, y0, y1, z - t / 2, z + t / 2, mat);
	const [d0, d1, dy0, dy1] = door;
	box(g, x0, d0, y0, y1, z - t / 2, z + t / 2, mat);
	box(g, d1, x1, y0, y1, z - t / 2, z + t / 2, mat);
	box(g, d0, d1, dy1, y1, z - t / 2, z + t / 2, mat, 1);
	if (dy0 > y0) box(g, d0, d1, y0, dy0, z - t / 2, z + t / 2, mat, 1);
}
function wallX(g, x, z0, z1, y0, y1, t, mat) {
	return box(g, x - t / 2, x + t / 2, y0, y1, z0, z1, mat);
}
// A temple pillar: square base, octagonal shaft with a carved band, cushion capital and bracket.
function pillar(g, x, y, z, h, r, mat) {
	box(g, x - r * 1.35, x + r * 1.35, y, y + h * 0.12, z - r * 1.35, z + r * 1.35, mat, 1);
	mesh(new THREE.CylinderGeometry(r, r * 1.08, h * 0.74, 8), mat, x, y + h * 0.49, z, g);
	mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.06, 8), mat, x, y + h * 0.3, z, g);
	mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.1, h * 0.08, 8), mat, x, y + h * 0.9, z, g);
	box(g, x - r * 1.6, x + r * 1.6, y + h * 0.94, y + h, z - r * 1.6, z + r * 1.6, mat, 1);
}
// Garlands strung as beads of flowers along a curve, mostly mat with a bead of accent every few.
function beads(g, curve, r, mat, accent) {
	const n = Math.max(4, Math.round(curve.getLength() / (r * 1.5)));
	const geo = new THREE.IcosahedronGeometry(r, 1);
	const a = new THREE.InstancedMesh(geo, mat, n);
	const b = accent ? new THREE.InstancedMesh(geo, accent, Math.ceil(n / 7)) : null;
	const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V();
	let ia = 0, ib = 0;
	for (let i = 0; i < n; i++) {
		const p = curve.getPointAt(i / (n - 1));
		q.setFromAxisAngle(V(0, 1, 0), i * 2.3);
		s.set(1, 0.8 + (i % 3) * 0.1, 1);
		m4.compose(p, q, s);
		if (b && i % 7 === 3) b.setMatrixAt(ib++, m4);
		else a.setMatrixAt(ia++, m4);
	}
	a.count = ia;
	g.add(a);
	if (b) {
		b.count = ib;
		g.add(b);
	}
	return a;
}
function garland(g, a, b, sag, r, mat, accent) {
	const mid = a.clone().lerp(b, 0.5);
	mid.y -= sag * 2;
	return beads(g, new THREE.QuadraticBezierCurve3(a, mid, b), r, mat, accent);
}
function hangingGarland(g, x, y, z, len, mat, accent) {
	beads(g, new THREE.LineCurve3(V(x, y, z), V(x, y - len, z)), 0.028, mat, accent);
}
// A seated Nandi (after landmarks.js), facing +z before it is turned.
function nandi(g, x, y, z, s, mat, ry, marigold) {
	const n = new THREE.Group();
	mesh(new THREE.SphereGeometry(0.2, 18, 14), mat, 0, 0.16, 0.02, n).scale.set(0.8, 0.75, 1.5);
	mesh(new THREE.SphereGeometry(0.1, 14, 10), mat, 0, 0.32, -0.08, n).scale.set(0.9, 0.9, 1.1);
	const head = new THREE.Group();
	head.position.set(0, 0.32, 0.3);
	head.rotation.x = 0.35;
	mesh(new THREE.CapsuleGeometry(0.065, 0.12, 4, 10), mat, 0, 0, 0.05, head).rotation.x = Math.PI / 2.4;
	for (const sx of [-1, 1]) {
		const horn = mesh(new THREE.ConeGeometry(0.018, 0.09, 6), mat, sx * 0.05, 0.08, -0.02, head);
		horn.rotation.z = -sx * 0.6;
		mesh(new THREE.SphereGeometry(0.025, 6, 4), mat, sx * 0.075, 0.04, 0.0, head).scale.set(1.6, 0.6, 1);
	}
	n.add(head);
	for (const sx of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), mat, sx * 0.1, 0.06, 0.2, n).rotation.x = Math.PI / 2;
	mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 18), marigold, 0, 0.27, 0.22, n).rotation.x = 1.2;
	mesh(new THREE.BoxGeometry(0.5, 0.05, 0.75), mat, 0, 0.0, 0.05, n);
	n.position.set(x, y, z);
	n.rotation.y = ry;
	n.scale.setScalar(s);
	g.add(n);
	return n;
}
// Instanced flowers and leaves heaped in a dome or ring.
function leafGeo() {
	const parts = [];
	for (let i = 0; i < 3; i++) {
		const l = new THREE.CircleGeometry(0.03, 9);
		l.scale(0.45, 1, 1);
		l.translate(0, 0.032, 0);
		l.rotateZ((i - 1) * 1.05);
		parts.push(l);
	}
	const g = mergeGeometries(parts);
	g.rotateX(-Math.PI / 2);
	return g;
}
function heap(g, kinds, n, sample, seed) {
	const R = rand(seed);
	const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V();
	const out = [];
	for (const [geo, mat, share] of kinds) {
		const cnt = Math.max(1, Math.round(n * share));
		const im = new THREE.InstancedMesh(geo, mat, cnt);
		for (let i = 0; i < cnt; i++) {
			const p = sample(R);
			e.set((R() - 0.5) * 0.9, R() * 6.28, (R() - 0.5) * 0.9);
			q.setFromEuler(e);
			s.setScalar(0.8 + R() * 0.5);
			m4.compose(p, q, s);
			im.setMatrixAt(i, m4);
		}
		im.castShadow = false;
		im.receiveShadow = true;
		g.add(im);
		out.push(im);
	}
	return out;
}
function flowerKinds(M, leaf = true) {
	const k = [
		[new THREE.SphereGeometry(0.024, 8, 5).scale(1, 0.7, 1), M.marigold, 0.4],
		[new THREE.SphereGeometry(0.014, 6, 4), M.jasmine, 0.2],
		[new THREE.ConeGeometry(0.03, 0.02, 7).rotateX(Math.PI), M.rose, 0.12],
	];
	if (leaf) k.push([leafGeo(), M.leaf, 0.45]);
	return k;
}
const domeSampler = (cx, cy, cz, r, h, r0 = 0) => (R) => {
	const a = R() * Math.PI * 2, d = r0 + Math.sqrt(R()) * (r - r0);
	return V(cx + Math.cos(a) * d, cy + h * (1 - (d / r) ** 2) + R() * 0.01, cz + Math.sin(a) * d);
};

// ---------- figures ----------
const SENT = { skin: 0x010203, top: 0x020304, bottom: 0x030405, sash: 0x040506, head: 0x050607 };
const SOLE = 0x3a2a1e, HAIR = 0x1b1612, TILAK = 0xd23a1e;
// body() with stand-in colours, then the real materials swapped in. mats: { skin, top, bottom, sash, head, sole, hair }
// hair: null removes it (shaven or crowned); tilak: false removes the default red mark.
function figure(opts, mats) {
	const J = body({ skin: SENT.skin, top: SENT.top, bottom: SENT.bottom, sash: SENT.sash, headColor: SENT.head, head: opts.head ?? "hair", sari: opts.sari, beard: opts.beard });
	const drop = [];
	J.feet = [];
	J.root.traverse((o) => {
		if (!o.isMesh) return;
		const h = o.material.color.getHex();
		let m;
		if (h === SENT.skin) m = mats.skin;
		else if (h === SENT.top) m = mats.top ?? mats.skin;
		else if (h === SENT.bottom) m = mats.bottom;
		else if (h === SENT.sash) m = mats.sash ?? mats.bottom;
		else if (h === SENT.head) m = mats.head ?? mats.sash;
		else if (h === SOLE) {
			m = mats.sole ?? mats.skin;
			J.feet.push(o);
		} else if (h === HAIR) {
			if (mats.hair === null) drop.push(o);
			else m = mats.hair;
		} else if (h === TILAK && opts.tilak === false) drop.push(o);
		if (m) {
			o.material.dispose();
			o.material = m;
		}
	});
	for (const o of drop) {
		o.parent.remove(o);
		o.geometry.dispose();
		o.material.dispose();
	}
	J.hem = opts.sari ? null : J.torso.children[0];
	J.sash = J.torso.children.find((c) => c.geometry && c.geometry.type === "TorusGeometry");
	return J;
}
function eyes(J, white = 0xa89f90) {
	const wm = std(white, { roughness: 0.4 }), pm = std(0x120c08, { roughness: 0.3 });
	for (const sx of [-1, 1]) {
		mesh(new THREE.SphereGeometry(0.012, 8, 6), wm, sx * 0.034, 0.018, 0.094, J.head).scale.set(1.3, 0.7, 0.6);
		mesh(new THREE.SphereGeometry(0.0075, 6, 4), pm, sx * 0.034, 0.018, 0.1, J.head);
		mesh(new THREE.BoxGeometry(0.036, 0.006, 0.01), pm, sx * 0.036, 0.04, 0.097, J.head).rotation.z = sx * -0.12;
	}
}
// A second pair of arms taken from another body, for the four-armed images of Vishnu.
function moreArms(J, mats, y = 0.5) {
	const J2 = figure({ head: "hair" }, mats);
	const out = {};
	for (const k of ["L", "R"]) {
		const sh = J2["sh" + k];
		J2.torso.remove(sh);
		sh.position.set(k === "L" ? -0.18 : 0.18, y, -0.05);
		J.torso.add(sh);
		out["sh" + k] = sh;
		out["el" + k] = J2["el" + k];
		out["hand" + k] = J2["hand" + k];
	}
	J2.root.traverse((o) => o.isMesh && o.geometry.dispose());
	return out;
}
function chakra(M) {
	const g = new THREE.Group();
	mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 28), M.gold, 0, 0, 0, g);
	mesh(new THREE.CircleGeometry(0.03, 16), M.gold, 0, 0, 0.004, g);
	for (let i = 0; i < 8; i++) {
		const s = mesh(new THREE.BoxGeometry(0.006, 0.07, 0.006), M.gold, 0, 0, 0, g);
		s.rotation.z = (i / 8) * Math.PI;
		const f = mesh(new THREE.ConeGeometry(0.012, 0.03, 5), M.gold, Math.cos((i / 8) * Math.PI * 2) * 0.094, Math.sin((i / 8) * Math.PI * 2) * 0.094, 0, g);
		f.rotation.z = (i / 8) * Math.PI * 2 - Math.PI / 2;
	}
	return g;
}
function conch(M) {
	const g = new THREE.Group();
	const c = mesh(lathe([[0, 0], [0.025, 0.01], [0.045, 0.04], [0.05, 0.07], [0.04, 0.1], [0.022, 0.125], [0.008, 0.15], [0, 0.155]], 16), M.jasmine, 0, -0.07, 0, g);
	c.rotation.z = 0.25;
	mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 16), M.gold, 0, -0.03, 0, g).rotation.x = Math.PI / 2;
	return g;
}
function kireetam(M, h = 0.42, r = 0.12) {
	const g = new THREE.Group();
	const pts = [];
	const n = 14;
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		pts.push([r * (1 - t * 0.72) * (i % 2 ? 0.93 : 1.0), t * h]);
	}
	pts.push([0.012, h * 1.04], [0, h * 1.12]);
	mesh(lathe([[0, 0], ...pts], 24), M.gold, 0, 0, 0, g);
	const gem = [std(0xb0102a, { roughness: 0.2, metalness: 0.3, emissive: 0x300008 }), std(0x1a7a3a, { roughness: 0.2, metalness: 0.3, emissive: 0x002a10 })];
	for (let i = 0; i < 18; i++) {
		const t = 0.1 + (i % 6) * 0.14, a = Math.floor(i / 6) * 0.45 - 0.45;
		const rr = r * (1 - t * 0.72) + 0.004;
		mesh(new THREE.SphereGeometry(0.01, 6, 4), gem[i % 2], Math.sin(a) * rr, t * h, Math.cos(a) * rr, g);
	}
	return g;
}

// ---------- actors: smooth targets, gait on top ----------
const KEYS = ["hipL", "hipR", "hipLz", "hipRz", "kneeL", "kneeR", "shL", "shLy", "shLz", "shR", "shRy", "shRz", "elL", "elLy", "elR", "elRy", "lean", "twist", "nod", "look", "bob"];
const ARMS = new Set(["shL", "shLy", "shLz", "shR", "shRy", "shRz", "elL", "elLy", "elR", "elRy"]);
const BASE = { shLz: -0.06, shRz: 0.06, nod: 0.05 };
// Ritual poses. Positive lean is forward; negative sh raises the arm forward; negative elbow bends it up.
const STAND = { shL: 0.04, shR: 0.04, shLz: -0.07, shRz: 0.07, elL: -0.12, elR: -0.12, kneeL: 0.03, kneeR: 0.03, nod: 0.06 };
const NAMASTE = { shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, shR: -0.55, shRz: -0.25, shRy: -0.5, elR: -1.55, nod: 0.18, kneeL: 0.03, kneeR: 0.03 };
const BOWED = Object.assign({}, NAMASTE, { lean: 0.22, nod: 0.4 });
const KNEEL = { kneeL: 1.62, kneeR: 1.62, hipL: -0.05, hipR: -0.05, bob: -0.45 };
const PRANAM = { hipL: -1.3, hipR: -1.3, kneeL: 2.85, kneeR: 2.85, bob: -0.78, lean: 1.42, nod: 0.45, shL: -2.75, shLz: 0.15, shR: -2.75, shRz: -0.15, elL: -0.15, elR: -0.15 };
const STAFF = { shR: -0.32, shRz: 0.08, elR: -0.5 };
// sitting cross-legged on the sanctum floor, as pilgrims do for abhishek at Bhimashankar
const SIT = { hipL: -1.45, hipR: -1.45, hipLz: 0.75, hipRz: -0.75, kneeL: 2.35, kneeR: 2.35, bob: -0.8, lean: 0.12 };
const P = (...a) => Object.assign({}, ...a);

function fill(p) {
	const o = {};
	for (const k of KEYS) o[k] = p[k] ?? BASE[k] ?? 0;
	return o;
}
function mix(a, b, k) {
	const o = {};
	for (const key of KEYS) o[key] = lerp(a[key] ?? BASE[key] ?? 0, b[key] ?? BASE[key] ?? 0, k);
	return o;
}
// Pose keyframes [[time, pose], ...], eased between keys and held after the last.
function kf(t, keys) {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return mix(keys[i - 1][1], keys[i][1], ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
	return keys[keys.length - 1][1];
}
const num = (t, keys) => {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
	return keys[keys.length - 1][1];
};
function gait(ph) {
	const s = Math.sin(ph), c = Math.cos(ph);
	return {
		hipL: s * 0.4, hipR: -s * 0.4, hipLz: 0, hipRz: 0,
		kneeL: Math.max(0, -Math.sin(ph - 0.9)) * 0.8 + 0.05, kneeR: Math.max(0, Math.sin(ph - 0.9)) * 0.8 + 0.05,
		shL: -s * 0.26, shR: s * 0.26, shLz: -0.08, shRz: 0.08, shLy: 0, shRy: 0, elL: -0.25, elR: -0.25, elLy: 0, elRy: 0,
		lean: 0.07, twist: s * 0.05, nod: 0.07, look: 0, bob: Math.abs(c) * 0.03 - 0.015,
	};
}
const plen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
function along(pts, d) {
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (d <= l && l > 0) return [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l];
		d -= l;
	}
	return pts[pts.length - 1];
}
// Sets T's position along pts from time t0 at speed v; returns the arrival time.
function walk(T, t, pts, t0 = 0, v = 0.75) {
	const len = plen(pts);
	const p = along(pts, clamp((t - t0) * v, 0, len));
	T.x = p[0];
	T.z = p[1];
	return t0 + len / v;
}
const arc = (cx, cz, rx, rz, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
	const a = lerp(a0, a1, i / n);
	return [cx + Math.sin(a) * rx, cz + Math.cos(a) * rz];
});

class Actor {
	constructor(J, floor) {
		this.J = J;
		this.root = J.root;
		this.floor = floor;
		this.cur = fill(STAND);
		this.pos = V();
		this.yaw = Math.PI;
		this.w = 0;
		this.ph = 0;
		this.y = 0;
	}
	drive(T, dt, snap) {
		const k = snap ? 1 : 1 - Math.exp(-dt * (T.rate ?? 5));
		for (const key of KEYS) this.cur[key] += ((T.pose[key] ?? BASE[key] ?? 0) - this.cur[key]) * k;
		const kp = snap ? 1 : 1 - Math.exp(-dt * 8);
		const ox = this.pos.x, oz = this.pos.z;
		this.pos.x += (T.x - ox) * kp;
		this.pos.z += (T.z - oz) * kp;
		const dx = this.pos.x - ox, dz = this.pos.z - oz, dist = Math.hypot(dx, dz);
		const speed = dt > 0 ? dist / dt : 0;
		this.w += ((snap ? 0 : clamp((speed - 0.05) / 0.4, 0, 1)) - this.w) * (snap ? 1 : 1 - Math.exp(-dt * 6));
		this.ph += dist * 4.9;
		let yt = this.yaw;
		if (speed > 0.25 && !T.noTurn) yt = Math.atan2(dx, dz);
		else if (typeof T.face === "number") yt = T.face;
		else if (T.face) {
			const fx = T.face[0] - this.pos.x, fz = T.face[1] - this.pos.z;
			if (fx * fx + fz * fz > 0.01) yt = Math.atan2(fx, fz);
		}
		this.yaw += wrap(yt - this.yaw) * (snap ? 1 : 1 - Math.exp(-dt * 4.5));
		const fy = this.floor(this.pos.x, this.pos.z);
		this.y += (fy - this.y) * (snap ? 1 : 1 - Math.exp(-dt * 9));
		const g = gait(this.ph);
		const p = {};
		const aw = T.arms ?? 1;
		for (const key of KEYS) p[key] = lerp(this.cur[key], g[key], this.w * (ARMS.has(key) ? aw : 1));
		pose(this.J, p);
		if (this.J.hem) this.J.hem.rotation.x = -p.lean * 0.75;
		this.root.position.set(this.pos.x, this.y, this.pos.z);
		this.root.rotation.y = this.yaw;
		this.root.updateMatrixWorld(true);
	}
}

// ---------- lamps, bells, props ----------
class Kit {
	constructor(ctx) {
		this.c = ctx;
	}
	flame(parent, x, y, z, s = 1) {
		const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAME_TEX(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		f.center.set(0.5, 0.08);
		f.position.set(x, y, z);
		f.scale.set(0.022 * s, 0.05 * s, 1);
		const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff9a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
		h.position.set(x, y + 0.02 * s, z);
		h.scale.setScalar(0.22 * s);
		parent.add(f, h);
		const o = { f, h, s, seed: Math.random() * 100 };
		this.c.flames.push(o);
		return o;
	}
	light(x, y, z, intensity, dist = 8, color = 0xff9a48, parent, shadow = false) {
		const l = new THREE.PointLight(color, intensity, dist, 2);
		l.position.set(x, y, z);
		if (shadow && !this.c.low) {
			l.castShadow = true;
			l.shadow.mapSize.set(512, 512);
			l.shadow.bias = -0.004;
			l.shadow.radius = 4;
			l.shadow.camera.near = 0.1;
		}
		(parent || this.c.g).add(l);
		this.c.lights.push({ l, base: intensity, seed: Math.random() * 100 });
		return l;
	}
	// A clay diya.
	diya(g, x, y, z) {
		const clay = this.c.M.clay || (this.c.M.clay = std(0x9a4a26, { roughness: 0.85 }));
		mesh(new THREE.SphereGeometry(0.045, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay, x, y + 0.025, z, g).scale.y = 0.6;
		return this.flame(g, x, y + 0.03, z, 0.8);
	}
	// A brass samai: standing oil lamp with a ring of wicks.
	samai(g, x, y, z, h = 1, wicks = 5) {
		const M = this.c.M;
		mesh(lathe([[0, 0], [0.16, 0], [0.16, 0.025], [0.08, 0.05], [0.04, 0.09], [0.03, 0.4], [0.05, 0.42], [0.028, 0.45], [0.024, 0.86], [0.11, 0.89], [0.13, 0.92], [0.1, 0.935], [0.03, 0.94], [0.025, 1.02], [0.04, 1.05], [0.0, 1.1]], 20, h), M.brass, x, y, z, g);
		const out = [];
		for (let i = 0; i < wicks; i++) {
			const a = (i / wicks) * Math.PI * 2;
			out.push(this.flame(g, x + Math.cos(a) * 0.11 * h, y + 0.935 * h, z + Math.sin(a) * 0.11 * h, 1));
		}
		return out;
	}
	// A brass lamp hanging on chains.
	hanging(g, x, y, z, drop = 0.9) {
		const M = this.c.M;
		mesh(new THREE.CylinderGeometry(0.006, 0.006, drop, 4), M.brass, x, y - drop / 2, z, g);
		mesh(lathe([[0, 0], [0.12, 0.02], [0.16, 0.06], [0.13, 0.07], [0, 0.05]], 18), M.brass, x, y - drop - 0.07, z, g);
		for (let i = 0; i < 5; i++) {
			const a = (i / 5) * Math.PI * 2;
			this.flame(g, x + Math.cos(a) * 0.13, y - drop - 0.005, z + Math.sin(a) * 0.13, 0.9);
		}
	}
	// A bell on a chain, swinging from its pivot.
	bell(g, x, y, z, s = 1, chain = 0.25) {
		const M = this.c.M;
		const pivot = new THREE.Group();
		pivot.position.set(x, y, z);
		g.add(pivot);
		mesh(new THREE.CylinderGeometry(0.006, 0.006, chain, 5), M.brass, 0, -chain / 2, 0, pivot);
		mesh(lathe([[0, 0.3], [0.05, 0.3], [0.09, 0.22], [0.11, 0.08], [0.16, 0], [0.15, 0.0], [0.1, 0.06], [0, 0.06]], 22, s), M.brass, 0, -chain - 0.3 * s, 0, pivot);
		mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), M.brass, 0, -chain - 0.27 * s, 0, pivot);
		const b = { pivot, a: 0, v: 0, pos: V(x, y - chain - 0.18 * s, z) };
		this.c.bells.push(b);
		return b;
	}
	incense(g, x, y, z) {
		const M = this.c.M;
		mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 10), M.brass, x, y + 0.025, z, g);
		for (let i = 0; i < 3; i++) {
			const st = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.32, 4), this.c.M.wood, x + (i - 1) * 0.01, y + 0.2, z, g);
			st.rotation.z = (i - 1) * 0.12;
		}
		const tip = V(x, y + 0.36, z);
		this.c.smokeFrom.push(tip);
		const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff4a10, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
		ember.position.copy(tip);
		ember.scale.setScalar(0.03);
		g.add(ember);
	}
}
// Hand-held objects. Each is placed every frame at a hand (or explicitly), turned with the holder's yaw.
function buildProps(ctx) {
	const M = ctx.M, K = ctx.kit, g = ctx.g;
	const P = {};
	const add = (name, o, spec = {}) => {
		o.visible = false;
		g.add(o);
		P[name] = Object.assign({ o }, spec);
	};
	const staff = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.75, 8), M.wood, 0, 0.875, 0, staff);
	add("staff", staff);
	const lota = new THREE.Group();
	// pivots at the neck, where the hand holds it
	mesh(lathe([[0, 0], [0.045, 0], [0.065, 0.03], [0.07, 0.06], [0.055, 0.1], [0.032, 0.125], [0.036, 0.135], [0.046, 0.145], [0.04, 0.15], [0, 0.13]], 20), M.copper, 0, -0.12, 0, lota);
	add("lota", lota, { off: [0, -0.01, 0.05], spout: V(0, 0.03, 0.045) });
	const bilva = new THREE.Group();
	for (let i = 0; i < 4; i++) {
		const l = mesh(leafGeo(), M.leaf, (i - 1.5) * 0.015, 0.0, 0.01 * i, bilva);
		l.rotation.set(-1.2 + i * 0.2, i * 0.6, 0);
	}
	mesh(new THREE.SphereGeometry(0.02, 8, 5), M.marigold, 0.02, 0.01, 0.02, bilva);
	add("bilva", bilva, { off: [0, 0.02, 0.05] });
	// aarti lamp: a brass dish of five wicks on a short handle, with its own light
	const aarti = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.14, 8), M.brass, 0, -0.07, 0, aarti);
	mesh(lathe([[0, 0], [0.07, 0.005], [0.09, 0.02], [0.085, 0.028], [0, 0.015]], 18), M.brass, 0, 0, 0, aarti);
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2;
		K.flame(aarti, Math.cos(a) * 0.055, 0.025, Math.sin(a) * 0.055, 1.3);
	}
	K.flame(aarti, 0, 0.03, 0, 1.5);
	const al = K.light(0, 0.12, 0, ctx.low ? 3 : 2.5, 5, 0xffa040, aarti);
	add("aarti", aarti, { off: [0, 0.1, 0.03], light: al });
	const ghanti = new THREE.Group();
	mesh(lathe([[0, 0.09], [0.02, 0.09], [0.03, 0.06], [0.035, 0.02], [0.045, 0], [0, 0.0]], 14), M.brass, 0, -0.09, 0, ghanti);
	mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.07, 6), M.brass, 0, 0.03, 0, ghanti);
	add("ghanti", ghanti, { off: [0, 0.02, 0.02] });
	const thali = new THREE.Group();
	mesh(lathe([[0, 0], [0.13, 0.004], [0.14, 0.02], [0.125, 0.018], [0, 0.008]], 24), M.brass, 0, 0, 0, thali);
	heap(thali, [[new THREE.SphereGeometry(0.007, 5, 4), std(0xd9a21e, { roughness: 0.7 }), 0.5], [new THREE.BoxGeometry(0.012, 0.01, 0.012), std(0xf4f0e8, { roughness: 0.3 }), 0.3], [leafGeo().scale(0.6, 0.6, 0.6), M.tulsi, 0.4]], 40, domeSampler(0, 0.012, 0, 0.09, 0.025), 5);
	add("thali", thali, { off: [0, 0.03, 0.1], both: true });
	const vessel = new THREE.Group();
	mesh(lathe([[0, 0], [0.04, 0], [0.055, 0.04], [0.045, 0.08], [0.05, 0.09], [0, 0.085]], 16), M.silver, 0, 0, 0, vessel);
	add("vessel", vessel, { off: [0, -0.06, 0.04] });
	const spoon = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 5), M.silver, 0, 0.0, 0.05, spoon).rotation.x = 1.2;
	mesh(new THREE.SphereGeometry(0.014, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.silver, 0, -0.03, 0.115, spoon);
	add("spoon", spoon, { off: [0, 0, 0.02], spout: V(0, -0.025, 0.12) });
	const shathari = new THREE.Group();
	mesh(lathe([[0, 0], [0.09, 0], [0.085, 0.03], [0.06, 0.07], [0.05, 0.11], [0.03, 0.15], [0.01, 0.18], [0, 0.19]], 18), M.silver, 0, 0, 0, shathari);
	for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.014, 8, 5), M.silver, sx * 0.012, 0.19, 0, shathari).scale.set(0.7, 0.4, 1.4);
	add("shathari", shathari, { off: [0, 0.03, 0.03] });
	const laddu = new THREE.Group();
	const lg = new THREE.IcosahedronGeometry(0.042, 2);
	const lp = lg.attributes.position;
	for (let i = 0; i < lp.count; i++) {
		const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.08;
		lp.setXYZ(i, lp.getX(i) * k, lp.getY(i) * k, lp.getZ(i) * k);
	}
	lg.computeVertexNormals();
	mesh(lg, std(0xe8a12e, { roughness: 0.9 }), 0, 0, 0, laddu);
	add("laddu", laddu, { off: [0, 0.05, 0.07], both: true });
	const prasad = new THREE.Group();
	heap(prasad, [[new THREE.BoxGeometry(0.012, 0.01, 0.012), std(0xf6f2ea, { roughness: 0.3 }), 1]], 9, domeSampler(0, 0, 0, 0.03, 0.02), 9);
	mesh(leafGeo().scale(1.2, 1, 1.2), M.leaf, 0, -0.005, 0, prasad);
	add("prasad", prasad, { off: [0, 0.035, 0.03] });
	const ghee = new THREE.Group();
	mesh(lathe([[0, 0], [0.04, 0.0], [0.05, 0.03], [0.045, 0.035], [0, 0.03]], 14), M.brass, 0, 0, 0, ghee);
	mesh(new THREE.CircleGeometry(0.044, 14).rotateX(-Math.PI / 2), std(0xf0c85a, { roughness: 0.3 }), 0, 0.03, 0, ghee);
	add("ghee", ghee, { off: [0, -0.02, 0.04] });
	const sandals = new THREE.Group();
	for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, 0.025, 0.26), std(0x4a3222, { roughness: 0.8 }), sx * 0.08, 0.0125, 0, sandals);
	add("sandals", sandals);
	return P;
}

// ---------- the four interiors ----------
// Each builder fills ctx.g and returns the layout L: floor(x,z), named spots, cameras and the steps' anchors.
function common(ctx, wallTop) {
	ctx.smokeFrom = ctx.smokeFrom || [];
	soot(ctx.g, 0.6, wallTop, 0);
	projectUVs(ctx.g);
}
// What is seen through the door, painted: monsoon forest, snow peaks, a sunlit courtyard or the valley.
function outside(kind) {
	const R = rand(kind.length * 31);
	const c = canvas(512, 256, (g, W, H) => {
		const sky = { forest: ["#9aa8a8", "#6f7f7a"], snow: ["#8fb0d8", "#dfe8f2"], court: ["#f0c890", "#e8b070"], valley: ["#7fa6d8", "#cfdcec"] }[kind];
		const gr = g.createLinearGradient(0, 0, 0, H);
		gr.addColorStop(0, sky[0]);
		gr.addColorStop(1, sky[1]);
		g.fillStyle = gr;
		g.fillRect(0, 0, W, H);
		const ridge = (y0, amp, col, n = 9) => {
			g.fillStyle = col;
			g.beginPath();
			g.moveTo(0, H);
			for (let i = 0; i <= n; i++) g.lineTo((W * i) / n, y0 - R() * amp);
			g.lineTo(W, H);
			g.fill();
		};
		if (kind === "forest") {
			g.globalAlpha = 0.7;
			ridge(H * 0.45, 30, "#5c6e5c", 14);
			g.globalAlpha = 1;
			for (let i = 0; i < 40; i++) {
				g.fillStyle = `rgba(${40 + R() * 30},${70 + R() * 30},${45 + R() * 20},0.9)`;
				g.beginPath();
				g.arc(R() * W, H * 0.62 + R() * H * 0.2, 18 + R() * 30, 0, Math.PI * 2);
				g.fill();
			}
			g.fillStyle = "#3a3a36";
			g.fillRect(0, H * 0.82, W, H);
		} else if (kind === "snow") {
			g.fillStyle = "#f4f7fb";
			g.beginPath();
			g.moveTo(W * 0.1, H * 0.75);
			g.lineTo(W * 0.48, H * 0.12);
			g.lineTo(W * 0.62, H * 0.3);
			g.lineTo(W * 0.72, H * 0.22);
			g.lineTo(W * 0.98, H * 0.75);
			g.fill();
			g.fillStyle = "rgba(120,140,170,0.45)";
			g.beginPath();
			g.moveTo(W * 0.48, H * 0.12);
			g.lineTo(W * 0.56, H * 0.75);
			g.lineTo(W * 0.3, H * 0.75);
			g.fill();
			g.fillStyle = "#e6ecf2";
			g.fillRect(0, H * 0.75, W, H);
			g.fillStyle = "#8a8680";
			g.fillRect(0, H * 0.86, W, H);
		} else if (kind === "court") {
			g.fillStyle = "#f2ece0";
			g.fillRect(W * 0.3, H * 0.15, W * 0.4, H * 0.6);
			for (let i = 0; i < 5; i++) g.fillRect(W * (0.32 + i * 0.008), H * (0.15 - i * 0.03), W * (0.36 - i * 0.016), H * 0.03);
			g.fillStyle = "#c9b48c";
			g.fillRect(0, H * 0.72, W, H);
		} else {
			ridge(H * 0.55, 60, "#6a6458", 7);
			g.fillStyle = "rgba(245,248,252,0.9)";
			g.beginPath();
			g.moveTo(W * 0.35, H * 0.5);
			g.lineTo(W * 0.55, H * 0.08);
			g.lineTo(W * 0.75, H * 0.5);
			g.fill();
			g.fillStyle = "#8a7f70";
			g.fillRect(0, H * 0.8, W, H);
		}
	});
	return texOf(c);
}
// A stand-in for daylight beyond the door: the painted view, and a cool light thrown inside.
function daylight(ctx, x, y, z, w, h, kind, intensity, target) {
	const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: outside(kind), color: kind === "snow" ? 0x6a6e74 : 0x8a8a8a, fog: false }));
	m.position.set(x, y, z);
	m.rotation.y = Math.PI;
	ctx.g.add(m);
	const s = new THREE.SpotLight(0xbfd4ff, intensity, 22, 0.75, 0.8, 1.6);
	s.position.set(x, y + h * 0.3, z - 0.3);
	s.target.position.set(...target);
	ctx.g.add(s, s.target);
}

function bhimashankar(ctx) {
	const { g, M, kit } = ctx;
	const wall = stoneMat(0x3c3935, { rows: 7, cols: 2, streaks: 0.7, seed: 11, scale: 1.3 });
	const floor = stoneMat(0x34312d, { rows: 3, cols: 2, seed: 12, rough: 0.42, scale: 1.4, wear: 1, bump: 0.6 });
	const ceil = stoneMat(0x2e2b28, { rows: 2, cols: 1, seed: 13, scale: 1.6 });
	const t = 0.35;
	// sanctum: floor 1 m below the hall
	box(g, -2.4, 2.4, -1.3, -1, -2.6, 2.4, floor, 1);
	wallX(g, -2.4 - t / 2, -2.6 - t, 2.4, -1, 2.4, t, wall);
	wallX(g, 2.4 + t / 2, -2.6 - t, 2.4, -1, 2.4, t, wall);
	wallZ(g, -2.6 - t / 2, -2.4, 2.4, -1, 2.4, t, wall);
	box(g, -2.4, 2.4, 2.4, 2.7, -2.6, 2.4, ceil, 1);
	wallZ(g, 2.4 + t / 2, -2.4 - t, 2.4 + t, -1, 3.6, t, wall, [-0.62, 0.62, 0, 2.05]);
	stepsDown(g, 0, 1.24, 2.4, 0, 0.2, 0.28, 5, floor);
	// door frame of carved basalt with a brass threshold strip
	for (const sx of [-1, 1]) box(g, sx * 0.62 - 0.09, sx * 0.62 + 0.09, 0, 2.05, 2.72, 2.84, wall, 2);
	box(g, -0.75, 0.75, 2.05, 2.25, 2.72, 2.84, wall, 1);
	box(g, -0.62, 0.62, -0.005, 0.012, 2.25, 2.75, M.brass, 1);
	// hall
	box(g, -3.2, 3.2, -0.3, 0, 2.75, 12, floor, 1);
	wallX(g, -3.2 - t / 2, 2.75, 8.6, 0, 3.6, t, wall);
	wallX(g, 3.2 + t / 2, 2.75, 8.6, 0, 3.6, t, wall);
	box(g, -3.4, 3.4, 3.6, 3.9, 2.75, 8.6, ceil, 1);
	box(g, -3.4, 3.4, 2.9, 3.6, 8.3, 8.6, wall, 1);
	for (const [x, z] of [[-1.9, 4.5], [1.9, 4.5], [-1.9, 6.9], [1.9, 6.9], [-1.5, 8.45], [1.5, 8.45]]) pillar(g, x, 0, z, 3.6, 0.16, wall);
	daylight(ctx, 0, 1.6, 12.6, 9, 5, "forest", 30, [0, 0, 6]);
	nandi(g, 0, 0, 6.3, 1.5, std(0x2a2826, { roughness: 0.45 }), Math.PI, M.marigold);
	// the Jyotirlinga in its silver pitha, under the naga hood, heaped with bilva and flowers
	const L0 = V(0, -1, -0.3);
	const pitha = new THREE.Group();
	pitha.position.copy(L0);
	pitha.scale.setScalar(0.75);
	g.add(pitha);
	mesh(lathe([[0, 0], [0.5, 0], [0.5, 0.06], [0.44, 0.09], [0.4, 0.14], [0.44, 0.2], [0.48, 0.24], [0.47, 0.28], [0.38, 0.29], [0.34, 0.22], [0, 0.22]], 40), M.silver, 0, 0, 0, pitha);
	const spout = new THREE.Shape();
	spout.moveTo(0.3, -0.16);
	spout.lineTo(0.78, -0.04);
	spout.quadraticCurveTo(0.84, 0, 0.78, 0.04);
	spout.lineTo(0.3, 0.16);
	const sg = new THREE.ExtrudeGeometry(spout, { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2 });
	sg.rotateX(Math.PI / 2);
	mesh(sg, M.silver, 0, 0.27, 0, pitha);
	const stoneD = std(0x161412, { map: grainTex(0x2a2724, 31), roughness: 0.4, metalness: 0.05 });
	ctx.wetMats = [stoneD];
	mesh(lathe([[0, 0], [0.12, 0], [0.12, 0.13], [0.105, 0.19], [0.07, 0.225], [0, 0.235]], 28), stoneD, 0, 0.22, 0, pitha);
	const pool = mesh(new THREE.CircleGeometry(0.37, 32).rotateX(-Math.PI / 2), M.water, 0, 0.225, 0, pitha);
	pool.castShadow = false;
	ctx.pool = pool;
	// naga: a silver cobra coiled at the base, rising behind, its five-headed hood spread over the lingam
	mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 30), M.silver, 0, 0.25, 0, pitha).rotation.x = Math.PI / 2;
	const neck = new THREE.CatmullRomCurve3([V(0, 0.26, -0.15), V(0, 0.4, -0.22), V(0, 0.6, -0.2), V(0, 0.68, -0.1)]);
	mesh(new THREE.TubeGeometry(neck, 20, 0.035, 8), M.silver, 0, 0, 0, pitha);
	const hood = new THREE.Group();
	hood.position.set(0, 0.66, -0.12);
	hood.rotation.x = 0.62;
	pitha.add(hood);
	// the spread hood: a broad shield behind five heads fanned along its rim, all leaning over the lingam
	mesh(new THREE.SphereGeometry(0.2, 24, 16), M.silver, 0, 0.02, -0.02, hood).scale.set(1.0, 0.8, 0.2);
	const ruby = std(0x8a0a0a, { emissive: 0x500000, roughness: 0.3 });
	for (let i = 0; i < 5; i++) {
		const a = (i - 2) * 0.48;
		const hx = Math.sin(a) * 0.17, hy = 0.02 + Math.cos(a) * 0.13;
		const h = mesh(new THREE.SphereGeometry(0.05, 14, 10), M.silver, hx, hy, 0.05, hood);
		h.scale.set(0.75, 0.6, 1.25);
		h.rotation.z = -a * 0.6;
		for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.007, 5, 4), ruby, hx + sx * 0.018, hy + 0.018, 0.095, hood);
	}
	heap(pitha, flowerKinds(M), 70, domeSampler(0, 0.225, 0, 0.34, 0.06, 0.13), 21);
	const offered = new THREE.Group();
	pitha.add(offered);
	heap(offered, [[leafGeo(), M.leaf, 0.75], [new THREE.SphereGeometry(0.024, 8, 5).scale(1, 0.7, 1), M.marigold, 0.25]], 28, domeSampler(0, 0.43, 0, 0.12, 0.04), 22);
	offered.visible = false;
	ctx.offered = offered;
	beads(pitha, new THREE.CatmullRomCurve3(Array.from({ length: 32 }, (_, i) => V(Math.cos((i / 32) * Math.PI * 2) * 0.43, 0.31, Math.sin((i / 32) * Math.PI * 2) * 0.43)), true), 0.03, M.marigold, M.jasmine);
	// lamps and incense
	kit.samai(g, -1.15, -1, -1.45, 1.05);
	kit.samai(g, 1.15, -1, -1.45, 1.05);
	kit.light(-1.15, 0.25, -1.3, 5, 7, 0xff9440, null, true);
	kit.light(1.15, 0.25, -1.3, 4, 7);
	for (const x of [-1.6, -0.8, 0.8, 1.6]) kit.diya(g, x, 0.05, -2.55);
	box(g, -2.0, 2.0, -0.02, 0.05, -2.6, -2.42, wall, 1);
	kit.incense(g, 1.75, -1, 1.3);
	kit.incense(g, -1.9, -1, -2.1);
	kit.hanging(g, -2.0, 3.6, 5.6, 1.1);
	kit.hanging(g, 2.0, 3.6, 5.6, 1.1);
	kit.light(0, 2.4, 5.6, 9, 10);
	kit.light(-2.0, 2.3, 8.2, 4, 6);
	// the bell at the head of the steps, garlands over the door
	kit.bell(g, 0.32, 2.75, 3.1, 1.3, 0.3);
	garland(g, V(-0.75, 2.2, 2.9), V(0.75, 2.2, 2.9), 0.28, 0.03, M.marigold, M.rose);
	garland(g, V(-0.7, 2.18, 2.93), V(0.7, 2.18, 2.93), 0.18, 0.022, M.jasmine);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 0.72, 2.2, 2.9, 0.9, M.marigold, M.rose);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, -2.55, 0, 9.1, g);
	common(ctx, 3.6);
	const floorAt = (x, z) => {
		if (z >= 2.4) return 0;
		if (z > 1.0 && Math.abs(x) < 0.66) return -0.2 * (Math.floor((2.4 - z) / 0.28) + 1);
		return -1;
	};
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-2.25, 2.25, -0.85, 2.25, -2.45, 2.3], [-3.0, 3.0, 0.15, 3.45, 2.9, 11.5]],
		deityPts: [[0, -1, -0.3], [0, -0.42, -0.36]], pts: { wash: [-2.55, 0.3, 9.1], bell: [0.32, 2.2, 3.1] },
		floor: floorAt, lowDeity: true, shiva: true, mark: "tripundra", priestMark: "tripundra",
		start: [0.6, 11.2], enterPath: [[0.6, 11.2], [-1.9, 9.1]], staffRest: [-1.62, 8.74], staffTilt: [-0.08, 0], sandals: [-1.95, 9.55], washFace: [-2.55, 9.1],
		bellSpot: [0.18, 3.42], bellFace: Math.PI, bellPath: [[-1.9, 9.1], [-0.8, 8.9], [-0.9, 5.4], [0.18, 3.42]],
		toFront: [[0.18, 3.42], [0, 2.9], [0, 2.2], [0, 1.0]], front: [0, 1.0], target: [0, -0.3],
		pour: [0, 0.3], pourTop: L0.y + 0.34,
		priestHome: [-1.65, 0.55], priestFace: [0, -0.3], priestAarti: [-0.2, 0.42], aartiSpot: [0.6, 1.05],
		markSpot: [0.15, 0.95], priestMarkSpot: [-0.45, 0.6],
		circuit: arc(0, -0.3, 1.12, 1.12, 0, -Math.PI * 1.5 + 0.38), circuitBack: true,
		bow: [0, 0.95],
		cams: {
			enter: F(["T", "wash"], 125, 12, 1.25),
			bell: F(["T", "bell"], 25, 8),
			darshan: F(["T", "D"], 55, 24),
			pour: F(["T", "D"], 70, 16),
			offer: F(["T", "D"], 105, 16),
			aarti: F(["T", "P", "D"], -95, 14),
			flame: F(["T", "P"], 139, 10),
			mark: F(["T", "P"], 168, 8),
			circuit: C([1.95, 1.15, 2.05], [0, -0.85, -0.3]),
			bow: F(["T", "D"], 90, 12),
		},
	};
}

function kedarnath(ctx) {
	const { g, M, kit } = ctx;
	const wall = stoneMat(0x77726a, { rows: 4, cols: 2, jitter: 0.12, streaks: 0.5, seed: 41, scale: 2.0, bump: 2 });
	const floor = stoneMat(0x625d56, { rows: 3, cols: 2, seed: 42, rough: 0.5, scale: 1.6, wear: 1, bump: 0.6 });
	const ceil = stoneMat(0x56524c, { rows: 2, cols: 1, seed: 43, scale: 2 });
	const t = 0.45;
	// sanctum
	box(g, -2.7, 2.7, -0.3, 0, -2.8, 3.1, floor, 1);
	wallX(g, -2.7 - t / 2, -2.8 - t, 2.9, 0, 3.4, t, wall);
	wallX(g, 2.7 + t / 2, -2.8 - t, 2.9, 0, 3.4, t, wall);
	wallZ(g, -2.8 - t / 2, -2.7, 2.7, 0, 3.4, t, wall);
	box(g, -2.7, 2.7, 3.4, 3.7, -2.8, 2.9, ceil, 1);
	wallZ(g, 3.1, -3.2 - t, 3.2 + t, 0, 4.1, 0.4, wall, [-0.7, 0.7, 0, 2.3]);
	// brass-framed door with bells and marigolds
	for (const sx of [-1, 1]) box(g, sx * 0.7 - 0.07, sx * 0.7 + 0.07, 0, 2.3, 3.28, 3.36, M.brass, 2);
	box(g, -0.84, 0.84, 2.3, 2.46, 3.28, 3.36, M.brass, 1);
	box(g, -0.7, 0.7, -0.01, 0.06, 2.9, 3.32, M.brass, 1);
	// hall (sabha mandapa)
	box(g, -3.2, 3.2, -0.3, 0, 3.1, 13, floor, 1);
	wallX(g, -3.2 - t / 2, 3.3, 10.7, 0, 4.1, t, wall);
	wallX(g, 3.2 + t / 2, 3.3, 10.7, 0, 4.1, t, wall);
	box(g, -3.5, 3.5, 4.1, 4.4, 3.3, 10.9, ceil, 1);
	for (let z = 4.2; z < 10.6; z += 1.6) box(g, -3.2, 3.2, 3.85, 4.1, z - 0.15, z + 0.15, ceil, 1);
	wallZ(g, 10.9, -3.2 - t, 3.2 + t, 0, 4.1, 0.4, wall, [-0.8, 0.8, 0, 2.6]);
	for (const [x, z] of [[-1.6, 5.4], [1.6, 5.4], [-1.6, 8.6], [1.6, 8.6]]) pillar(g, x, 0, z, 4.1, 0.2, wall);
	daylight(ctx, 0, 1.4, 11.6, 4, 3.2, "snow", 16, [0, 0, 7]);
	// niches with the Pandavas and Draupadi in grey stone
	const statue = std(0x9a958c, { map: grainTex(0x8a857c, 44), roughness: 0.7 });
	const names = [0, 1, 2, 3, 4, 5];
	names.forEach((i) => {
		const sx = i < 3 ? -1 : 1, z = 4.4 + (i % 3) * 2.0;
		const x = sx * 3.2;
		box(g, x - sx * 0.12, x + sx * 0.04, 0.4, 2.6, z - 0.55, z + 0.55, ceil, 1);
		box(g, x - sx * 0.3, x - sx * 0.02, 2.6, 2.8, z - 0.65, z + 0.65, wall, 1);
		box(g, x - sx * 0.3, x - sx * 0.02, 0.0, 0.4, z - 0.65, z + 0.65, wall, 1);
		const woman = i === 5;
		const J = figure({ head: woman ? "veil" : "hair", sari: woman, tilak: false }, { skin: statue, top: statue, bottom: statue, sash: statue, head: statue, hair: woman ? statue : null, sole: statue });
		if (!woman) {
			const k = kireetam({ gold: statue }, 0.2, 0.1);
			k.position.y = 0.06;
			J.head.add(k);
		}
		pose(J, i % 2 ? P(NAMASTE, { nod: 0.05 }) : P(STAND, { shL: -0.3, elL: -1.2, shLz: 0.1 }));
		J.root.position.set(x - sx * 0.42, 0.4, z);
		J.root.rotation.y = -sx * Math.PI / 2;
		J.root.scale.setScalar(0.95);
		g.add(J.root);
		if (i === 1) mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), statue, x - sx * 0.6, 1.0, z + 0.25, g); // Bhima's mace
		kit.diya(g, x - sx * 0.2, 0.4, z + 0.38);
	});
	nandi(g, 0, 0, 7.6, 2.0, std(0x8a857c, { map: grainTex(0x6a655e, 45), roughness: 0.6 }), Math.PI, M.marigold);
	// the lingam: a low natural rock with three faces, on a stone rim
	const C0 = V(0, 0, -0.4);
	const rimShape = new THREE.Shape();
	const rr = (w, d, r) => {
		rimShape.moveTo(-w + r, -d);
		rimShape.lineTo(w - r, -d);
		rimShape.quadraticCurveTo(w, -d, w, -d + r);
		rimShape.lineTo(w, d - r);
		rimShape.quadraticCurveTo(w, d, w - r, d);
		rimShape.lineTo(-w + r, d);
		rimShape.quadraticCurveTo(-w, d, -w, d - r);
		rimShape.lineTo(-w, -d + r);
		rimShape.quadraticCurveTo(-w, -d, -w + r, -d);
	};
	rr(1.15, 0.8, 0.3);
	const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
	rim.rotateX(-Math.PI / 2);
	mesh(rim, std(0x4a4640, { map: grainTex(0x55514a, 46), roughness: 0.55 }), C0.x, 0, C0.z, g);
	let rg = new THREE.IcosahedronGeometry(1, 6);
	rg.deleteAttribute("normal");
	rg.deleteAttribute("uv");
	rg = mergeVertices(rg);
	const p = rg.attributes.position;
	for (let i = 0; i < p.count; i++) {
		let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		y = y < 0 ? y * 0.12 : y;
		// a ridge rising to one shoulder, with flat faces falling away: the bull's hump
		const ridge = 1 - 0.35 * Math.abs(x + 0.25);
		z *= 0.66 * (1 - Math.max(0, y) * 0.25);
		x *= 0.82 * (1 - Math.max(0, y) * 0.12);
		y = Math.max(0, y) * 0.78 * ridge + Math.min(0, y);
		// three broad faces, as on the real rock, before the weathering
		for (const [nx, ny, nz, d] of [[0.5, 0.5, 0.71, 0.4], [-0.55, 0.55, 0.63, 0.42], [0.08, 0.5, -0.86, 0.36]]) {
			const k = x * nx + y * ny + z * nz - d;
			if (k > 0) {
				x -= k * nx * 0.7;
				y -= k * ny * 0.7;
				z -= k * nz * 0.7;
			}
		}
		const n = (fbm(x * 2.2 + 3, z * 2.2 + y * 2.2, 4) - 0.5) * 0.2 + (fbm(x * 7 + 1, z * 7 - y * 5, 2) - 0.5) * 0.05;
		p.setXYZ(i, x * (1 + n), y + n * 0.6, z * (1 + n));
	}
	rg.computeVertexNormals();
	rg.computeVertexNormals();
	// weathered grey stone, paler on the worn upper faces and dark in the hollows
	const rc = new Float32Array(p.count * 3);
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
		const k = 0.55 + y * 0.25 + (fbm(x * 4 + 9, z * 4 + y * 3, 3) - 0.5) * 0.5;
		rc.set([k, k * 0.96, k * 0.9], i * 3);
	}
	rg.setAttribute("color", new THREE.BufferAttribute(rc, 3));
	const rockM = std(0xffffff, { map: grainTex(0x9a958c, 47), roughness: 0.78, metalness: 0.02, vertexColors: true });
	ctx.wetMats = [rockM];
	ctx.gheeMat = rockM;
	const rock = mesh(rg, rockM, C0.x, 0.24, C0.z, g);
	rock.updateMatrixWorld(true);
	// flowers and bilva caught on the upper faces
	const verts = [];
	const vv = V();
	for (let i = 0; i < p.count; i += 7) {
		vv.fromBufferAttribute(p, i);
		if (vv.y > 0.25) verts.push(vv.clone().applyMatrix4(rock.matrixWorld));
	}
	heap(g, flowerKinds(M), 60, (R) => verts[Math.floor(R() * verts.length)].clone().add(V(0, 0.01, 0)), 48);
	const offered = new THREE.Group();
	g.add(offered);
	heap(offered, [[leafGeo(), M.leaf, 0.8], [new THREE.SphereGeometry(0.024, 8, 5).scale(1, 0.7, 1), M.marigold, 0.3]], 30, (R) => verts[Math.floor(R() * verts.length)].clone().add(V(0, 0.015, 0)), 49);
	offered.visible = false;
	ctx.offered = offered;
	heap(g, flowerKinds(M, false), 50, (R) => {
		const a = R() * Math.PI * 2;
		return V(C0.x + Math.cos(a) * (1.0 + R() * 0.1), 0.26, C0.z + Math.sin(a) * (0.66 + R() * 0.08));
	}, 50);
	// lamps
	kit.samai(g, -1.65, 0, -1.9, 1.1, 7);
	kit.samai(g, 1.65, 0, -1.9, 1.1, 7);
	kit.light(-1.6, 1.4, -1.6, 6, 8, 0xff9440, null, true);
	kit.light(1.6, 1.4, -1.6, 5, 8);
	// the akhand jyoti, an oil lamp kept burning at the front of the lingam
	kit.samai(g, 1.45, 0, 1.1, 0.7, 5);
	kit.light(1.45, 0.9, 1.1, 3.5, 6);
	kit.hanging(g, -0.6, 3.4, 1.2, 1.0);
	kit.light(-0.6, 2.2, 1.2, 5, 7);
	for (const x of [-1.2, 0, 1.2]) kit.diya(g, x, 1.2, -2.7);
	box(g, -1.6, 1.6, 1.12, 1.2, -2.8, -2.55, wall, 1);
	kit.incense(g, 2.25, 0, 1.9);
	kit.hanging(g, 0, 4.1, 6.0, 1.3);
	kit.light(0, 2.6, 6.0, 7, 10);
	kit.bell(g, 0.45, 2.85, 3.5, 1.1, 0.25);
	kit.bell(g, -0.45, 2.85, 3.5, 1.1, 0.25);
	kit.bell(g, 0, 3.05, 3.55, 0.8, 0.15);
	garland(g, V(-0.85, 2.5, 3.45), V(0.85, 2.5, 3.45), 0.3, 0.03, M.marigold, M.rose);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 0.84, 2.45, 3.45, 1.0, M.marigold, M.rose);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, 2.6, 0, 9.6, g);
	common(ctx, 4.1);
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-2.5, 2.5, 0.15, 3.2, -2.6, 2.7], [-2.95, 2.95, 0.15, 3.85, 3.5, 10.5]],
		deityPts: [[0, 0, -0.4], [0, 1.1, -0.4], [-1.0, 0.3, -0.4], [1.0, 0.3, -0.4]], pts: { wash: [2.6, 0.3, 9.6], bell: [0.45, 2.3, 3.5], nandi: [0, 0.9, 7.4], niche: [2.7, 1.6, 6.4] },
		floor: () => 0, shiva: true, mark: "tripundra", priestMark: "tripundra", ghee: true,
		start: [0.2, 12.4], enterPath: [[0.2, 12.4], [0.3, 10.4], [2.0, 10.0]], staffRest: [2.98, 10.35], staffTilt: [0, -0.12], sandals: [2.1, 10.45], washFace: [2.6, 9.6],
		nandiPath: [[2.0, 10.0], [1.05, 8.8], [0.55, 6.6]], nandiEar: [0.15, 7.0],
		bellSpot: [0.3, 3.85], bellFace: Math.PI, bellPath: [[0.55, 6.6], [0.9, 5.4], [0.3, 3.85]],
		toFront: [[0.3, 3.85], [0, 3.0], [0, 1.65]], front: [0, 1.65], target: [0, -0.4],
		pour: [0, 0.8], pourTop: 0.32, embrace: [0, 0.66],
		priestHome: [-2.15, 1.35], priestFace: [0, -0.4], priestAarti: [-0.3, 1.0], aartiSpot: [0.6, 1.65],
		markSpot: [0.3, 1.6], priestMarkSpot: [-0.3, 1.3],
		circuit: arc(0, -0.4, 1.85, 1.5, 0, -Math.PI * 2, 40),
		bow: [0, 1.6],
		cams: {
			enter: F(["T", "wash"], -135, 12, 1.25),
			nandi: F(["T", "nandi", "niche"], -88, 10),
			bell: F(["T", "bell"], 15, 8),
			darshan: F(["T", "D"], 50, 24),
			pour: F(["T", "D"], 75, 16),
			embrace: F(["T", "D"], 85, 12),
			offer: F(["T", "D"], -75, 16),
			aarti: F(["T", "P", "D"], -100, 14),
			flame: F(["T", "P"], 143, 10),
			mark: F(["T", "P"], 120, 8),
			circuit: C([2.3, 2.55, 2.6], [0, 0.2, -0.5]),
			bow: F(["T", "D"], 90, 12),
		},
	};
}

function tirumala(ctx) {
	const { g, M, kit } = ctx;
	const wall = stoneMat(0x6c675f, { rows: 5, cols: 2, seed: 61, scale: 1.6, streaks: 0.4 });
	const floor = stoneMat(0x4c4842, { rows: 2, cols: 2, seed: 62, rough: 0.32, scale: 1.2, wear: 1, bump: 0.4 });
	const ceil = stoneMat(0x4a4640, { rows: 3, cols: 1, seed: 63, scale: 1.8 });
	const t = 0.4;
	// the hall around the sanctum
	box(g, -5.2, 5.2, -0.3, 0, -7, 12, floor, 1);
	wallX(g, -5.2, -7, 9.2, 0, 4.6, t, wall);
	wallX(g, 5.2, -7, 9.2, 0, 4.6, t, wall);
	wallZ(g, -7, -5.2, 5.2, 0, 4.6, t, wall);
	wallZ(g, 9.2, -5.2, 5.2, 0, 4.6, t, wall, [-1.0, 1.0, 0, 3.0]);
	box(g, -5.4, 5.4, 4.6, 4.9, -7, 9.2, ceil, 1);
	for (const z of [3.4, 5.6, 7.8]) for (const x of [-3.4, 3.4]) pillar(g, x, 0, z, 4.6, 0.22, wall);
	for (const z of [-2.2, -5.6]) for (const x of [-4.4, 4.4]) pillar(g, x, 0, z, 4.6, 0.2, wall);
	daylight(ctx, 0, 1.6, 9.9, 3, 3.4, "court", 10, [0, 0, 5]);
	// the sanctum block, gold-clad door in its face
	wallX(g, -2.2, -4.6, 0.9, 0, 4.6, t, wall);
	wallX(g, 2.2, -4.6, 0.9, 0, 4.6, t, wall);
	wallZ(g, -4.6, -2.4, 2.4, 0, 4.6, t, wall);
	wallZ(g, 0.7, -2.4, 2.4, 0, 4.6, t, wall, [-0.75, 0.75, 0, 2.7]);
	box(g, -2.0, 2.0, 3.6, 3.75, -4.4, 0.5, ceil, 1);
	const rep = repousse(0xe2aa3c, 64);
	const gilt = std(0xffffff, { map: rep.map, bumpMap: rep.bump, bumpScale: 3, metalness: 0.9, roughness: 0.3, emissive: 0x2a1802, emissiveIntensity: 0.5 });
	gilt.userData.tri = 0.9;
	// the Bangaru Vakili: a broad gilded frame, lintel and doors folded back
	for (const sx of [-1, 1]) box(g, sx * 0.75 - (sx > 0 ? 0 : 0.32), sx * 0.75 + (sx > 0 ? 0.32 : 0), 0, 3.0, 0.88, 0.98, gilt, 2);
	box(g, -1.07, 1.07, 2.7, 3.3, 0.88, 0.98, gilt, 1);
	for (const sx of [-1, 1]) {
		const d = box(new THREE.Group(), 0, 0.72, 0, 2.62, -0.03, 0.03, gilt, 1);
		const hinge = new THREE.Group();
		hinge.position.set(sx * 0.75, 0.04, 0.46);
		hinge.rotation.y = sx > 0 ? 0.04 : Math.PI - 0.04;
		hinge.add(d);
		d.position.x = 0.36;
		g.add(hinge);
	}
	box(g, -0.75, 0.75, -0.01, 0.07, 0.5, 0.9, gilt, 1);
	box(g, -0.62, 0.62, -0.01, 0.1, -1.55, -1.42, gilt, 1); // Kulasekhara padi: pilgrims do not cross it
	// Jaya and Vijaya at the door, gilded, each with a mace
	for (const sx of [-1, 1]) {
		const J = figure({ head: "hair", tilak: false }, { skin: M.gold, top: M.gold, bottom: M.gold, sash: M.gold, hair: null, sole: M.gold });
		const k = kireetam(M, 0.3, 0.11);
		k.position.y = 0.06;
		J.head.add(k);
		pose(J, sx < 0 ? P(STAND, { shR: -0.5, shRz: 0.15, elR: -1.6, shL: -0.25, elL: -0.6 }) : P(STAND, { shL: -0.5, shLz: -0.15, elL: -1.6, shR: -0.25, elR: -0.6 }));
		J.root.scale.setScalar(1.35);
		J.root.position.set(sx * 1.45, 0.15, 1.35);
		g.add(J.root);
		mesh(new THREE.BoxGeometry(0.7, 0.15, 0.6), wall, sx * 1.45, 0.075, 1.35, g);
		const mace = new THREE.Group();
		mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), M.gold, 0, 0.65, 0, mace);
		mesh(new THREE.SphereGeometry(0.11, 14, 10), M.gold, 0, 1.35, 0, mace).scale.y = 1.25;
		mace.position.set(sx * 1.45 + sx * 0.32, 0.15, 1.62);
		g.add(mace);
	}
	// Sri Venkateswara, standing, about 2.5 m, on a lotus pedestal
	const stoneB = std(0x111110, { map: grainTex(0x1c1b1a, 65), roughness: 0.32, metalness: 0.1 });
	const silk = std(0xe2a42a, { roughness: 0.45, emissive: 0x2a1600, emissiveIntensity: 0.3 });
	const D = V(0, 0.45, -3.4);
	mesh(lathe([[0, 0], [0.7, 0], [0.7, 0.12], [0.6, 0.16], [0.66, 0.3], [0.56, 0.45], [0, 0.45]], 32), M.gold, D.x, 0, D.z, g);
	const J = figure({ head: "hair", tilak: false }, { skin: stoneB, top: stoneB, bottom: silk, sash: M.gold, hair: null, sole: M.gold });
	J.hem.material = silk;
	J.sash.geometry.dispose();
	J.sash.geometry = new THREE.TorusGeometry(0.205, 0.006, 4, 48);
	for (const s of ["kneeL", "kneeR"]) J[s].children[1].material = silk;
	pose(J, { shL: -0.22, shLz: -0.2, elL: -0.25, shR: 0.0, shRz: 0.55, elR: -0.25, nod: 0.02 });
	J.elR.rotation.z = -1.15; // lower left hand on the hip
	J.handL.children[0].material = M.gold;
	J.handR.children[0].material = M.gold;
	const up = moreArms(J, { skin: stoneB, top: stoneB, bottom: silk });
	up.shL.rotation.set(-0.15, 0, -1.25);
	up.elL.rotation.set(0, 0, -1.75);
	up.shR.rotation.set(-0.15, 0, 1.25);
	up.elR.rotation.set(0, 0, 1.75);
	const ch = chakra(M);
	ch.position.set(0, 0.11, 0);
	up.handL.add(ch); // upper right hand: the Sudarshana chakra
	const co = conch(M);
	co.position.set(0, 0.06, 0);
	up.handR.add(co); // upper left: the Panchajanya conch
	const kr = kireetam(M, 0.42, 0.118);
	kr.position.y = 0.075;
	J.head.add(kr);
	const nm = markPatch("namam", 0.108, 0.78, 1.95);
	nm.material.emissive.set(0x333330);
	J.head.add(nm);
	J.torso.scale.set(1.12, 1, 1.05);
	for (const [r, y, w] of [[0.1, 0.56, 0.025], [0.14, 0.5, 0.016], [0.17, 0.46, 0.014]]) {
		const k = mesh(new THREE.TorusGeometry(r, w, 6, 36, Math.PI), M.gold, 0, y, 0.02, J.torso);
		k.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI);
		k.scale.set(1, 0.95, 1);
	}
	for (const sx of [-1, 1]) mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 14), M.gold, sx * 0.1, -0.03, 0, J.head).rotation.y = Math.PI / 2;
	for (const [r, y, tilt] of [[0.12, 0.55, 0.7], [0.15, 0.53, 0.85], [0.18, 0.52, 1.0]]) {
		const nk = mesh(new THREE.TorusGeometry(r, 0.012, 6, 36), M.gold, 0, y, 0.01, J.torso);
		nk.rotation.x = Math.PI / 2 + tilt * 0.6;
		nk.scale.set(1, 0.75, 1);
	}
	mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 36), M.gold, 0, 0.05, 0, J.torso).rotation.x = Math.PI / 2;
	mesh(new THREE.CircleGeometry(0.03, 14), M.gold, 0.08, 0.38, 0.145, J.torso); // Lakshmi on the chest
	mesh(new THREE.BoxGeometry(0.07, 0.42, 0.02), M.gold, 0, -0.2, 0.2, J.torso).rotation.x = -0.12;
	for (const sx of [-1, 1]) mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 16), M.gold, 0, -0.12, 0, J[sx < 0 ? "shL" : "shR"]).rotation.x = Math.PI / 2;
	const gl = (mat, d, r, low, accent) => {
		const pts = [V(-0.17, 0.5, 0.08), V(-0.2, 0.2, 0.17 + d), V(-0.22, -0.3, 0.27 + d), V(-0.12, low, 0.29 + d), V(0, low - 0.04, 0.3 + d), V(0.12, low, 0.29 + d), V(0.22, -0.3, 0.27 + d), V(0.2, 0.2, 0.17 + d), V(0.17, 0.5, 0.08)];
		beads(J.torso, new THREE.CatmullRomCurve3(pts), r, mat, accent);
	};
	gl(M.tulsi, 0.0, 0.03, -0.86, M.jasmine);
	gl(M.jasmine, 0.035, 0.024, -0.7, M.rose);
	gl(M.marigold, 0.06, 0.028, -0.52, M.rose);
	gl(M.rose, 0.08, 0.02, -0.3, M.jasmine);
	J.root.scale.setScalar(1.36);
	J.root.position.copy(D);
	g.add(J.root);
	// makara torana behind
	const tor = mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40, Math.PI), M.gold, D.x, 2.2, D.z - 0.45, g);
	tor.scale.y = 1.05;
	for (let i = 0; i <= 14; i++) {
		const a = (i / 14) * Math.PI;
		const f = mesh(new THREE.ConeGeometry(0.035, 0.12, 6), M.gold, D.x + Math.cos(a) * 1.22, 2.2 + Math.sin(a) * 1.28, D.z - 0.45, g);
		f.rotation.z = a - Math.PI / 2;
	}
	for (const sx of [-1, 1]) box(g, sx * 1.15 - 0.05, sx * 1.15 + 0.05, 0.45, 2.2, D.z - 0.5, D.z - 0.4, M.gold, 1);
	box(g, -1.9, 1.9, 0, 3.6, -4.42, -4.3, std(0x1a1512, { roughness: 0.9 }), 1);
	// the sanctum is lit only by lamps
	kit.samai(g, -1.15, 0, -2.85, 1.35, 7);
	kit.samai(g, 1.15, 0, -2.85, 1.35, 7);
	kit.light(-1.0, 1.7, -2.6, 6, 7, 0xffa050, null, true);
	kit.light(1.0, 1.7, -2.6, 6, 7);
	for (const x of [-0.5, 0.5]) kit.diya(g, x, 0.45, -2.75);
	kit.hanging(g, 0, 4.6, 4.2, 1.4);
	kit.hanging(g, -3.4, 4.6, -1.4, 1.3);
	kit.hanging(g, 3.4, 4.6, -4.0, 1.3);
	kit.light(0, 3.0, 4.2, 6, 11);
	kit.light(-3.4, 3.0, -1.4, 4, 9);
	kit.light(3.4, 3.0, -4.0, 4, 9);
	kit.hanging(g, 0, 4.6, -5.8, 1.3);
	kit.light(0, 3.0, -5.8, 4, 9);
	kit.light(0, 2.8, 1.8, 3, 6, 0xffb060);
	garland(g, V(-1.0, 2.95, 1.04), V(1.0, 2.95, 1.04), 0.32, 0.035, M.marigold, M.rose);
	garland(g, V(-0.95, 2.92, 1.06), V(0.95, 2.92, 1.06), 0.2, 0.025, M.jasmine);
	// queue rails
	const steel = std(0xb8b8b4, { metalness: 0.8, roughness: 0.35 });
	for (const x of [-1.45, -0.1, 1.15]) {
		const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.0, 8), steel, x, 0.95, 5.1, g);
		rail.rotation.x = Math.PI / 2;
		for (let z = 2.6; z <= 7.7; z += 1.25) mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), steel, x, 0.475, z, g);
	}
	// the Srivari hundi under its white cloth
	const H = V(-3.75, 0, -1.2);
	mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.2, 24), wall, H.x, 0.1, H.z, g);
	mesh(lathe([[0, 0], [0.4, 0], [0.55, 0.25], [0.56, 0.5], [0.45, 0.75], [0.3, 0.85], [0.3, 0.9], [0, 0.9]], 24), M.copper, H.x, 0.2, H.z, g);
	const cg = lathe([[0, 0.92], [0.34, 0.92], [0.5, 0.85], [0.56, 0.74], [0.55, 0.6], [0, 0.6]], 32);
	const cp = cg.attributes.position;
	for (let i = 0; i < cp.count; i++) {
		const a = Math.atan2(cp.getZ(i), cp.getX(i));
		const k = 1 + Math.sin(a * 11) * 0.02 * (0.92 - cp.getY(i)) * 3;
		cp.setX(i, cp.getX(i) * k);
		cp.setZ(i, cp.getZ(i) * k);
	}
	cg.computeVertexNormals();
	mesh(cg, M.cloth, H.x, 0.2, H.z, g);
	mesh(new THREE.TorusGeometry(0.47, 0.02, 6, 30), M.red, H.x, 0.98, H.z, g).rotation.x = Math.PI / 2;
	// a stand for the archaka's theertham
	mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 16), wall, -4.45, 0.4, 1.55, g);
	const crowdSpots = [[-0.78, 3.3, Math.PI], [-0.8, 4.7, Math.PI], [-0.75, 6.1, Math.PI], [-0.8, 7.3, Math.PI], [3.8, -3.5, Math.PI], [-4.1, -5.0, Math.PI / 2], [4.0, 1.6, Math.PI]];
	crowdSpots.forEach(([x, z, ry], i) => {
		const m = crowdFigure(301 + i * 17);
		KEEP.add(m.material);
		m.scale.setScalar(1 / 0.28);
		m.position.set(x, 0, z);
		m.rotation.y = ry;
		g.add(m);
	});
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, 3.2, 0, 8.4, g);
	common(ctx, 4.6);
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-1.85, 1.85, 0.15, 3.45, -4.2, 0.25], [-4.95, 4.95, 0.15, 4.4, 1.1, 9.0], [-4.95, -2.6, 0.15, 4.4, -6.6, 9.0], [2.6, 4.95, 0.15, 4.4, -6.6, 9.0], [-4.95, 4.95, 0.15, 4.4, -6.6, -5.0]],
		deityPts: [[0, 0.3, -3.4], [0, 3.1, -3.4]], pts: { wash: [3.2, 0.3, 8.4], hundi: [-3.75, 1.0, -1.2], door: [0, 2.6, 0.9] },
		floor: (x, z) => (Math.abs(x) < 0.75 && z > 0.5 && z < 0.9 ? 0.07 : 0), noTouch: true, priestMark: "urdhva",
		start: [0.6, 11.0], enterPath: [[0.6, 11.0], [0.6, 9.0], [2.5, 8.7]], staffRest: [2.6, 8.86], staffTilt: [0.08, 0], sandals: [2.1, 8.95], washFace: [3.2, 8.4],
		queue: [[2.5, 8.7], [0.5, 8.1], [0.5, 2.7], [0.1, 1.9]], doorFace: [0, -3.4],
		toFront: [[0.1, 1.9], [0.15, 0.9], [0.32, -1.05]], front: [0.32, -1.05], target: [0, -3.4],
		theertham: [[0.32, -1.05], [0.05, 0.55], [-0.9, 1.95], [-3.3, 1.95]], priestHome: [-4.0, 1.85], priestFace: [-3.3, 1.95],
		hundiPath: [[-3.3, 1.95], [-3.1, 0.9], [-3.75, -0.35]], hundiFace: [-3.75, -1.2],
		circuit: [[-3.75, -0.35], [-2.9, -0.8], [-2.9, -5.5], [2.9, -5.5], [2.9, 1.9], [1.6, 3.2]],
		laddu: [1.6, 3.2],
		cams: {
			enter: F(["T", "wash"], -140, 10, 1.25),
			queue: { orbit: [0, -3.4], back: 2.3, out: 0, side: 0.9, h: 1.65, lookH: 1.5, ahead: 2 },
			darshan: Object.assign(F(["T", "D"], 4, 6, 0.62), { padP: 0.95, room: [-0.62, 0.62, 0.2, 2.5, -4.2, 2.6] }),
			theertham: F(["T", "P"], -35, 10),
			hundi: F(["T", "hundi"], 20, 14),
			circuit: { orbit: [0, -1.8], back: 2.1, out: 1.0, side: 0, h: 1.8, lookH: 1.0, ahead: 1 },
			laddu: F(["T", "door"], 60, 10, 1.1),
		},
	};
}

function badrinath(ctx) {
	const { g, M, kit } = ctx;
	const paint = paintedMat(81, 4.2);
	const floor = stoneMat(0x8a8276, { rows: 3, cols: 2, seed: 82, rough: 0.45, scale: 1.4, wear: 1, bump: 0.5 });
	const ceil = stoneMat(0x5a3a22, { rows: 6, cols: 1, seed: 83, scale: 1.0, jitter: 0.25 });
	const t = 0.4;
	box(g, -4.8, 4.8, -0.3, 0, -6.8, 12, floor, 1);
	wallX(g, -4.8, -6.8, 8.8, 0, 4.2, t, paint);
	wallX(g, 4.8, -6.8, 8.8, 0, 4.2, t, paint);
	wallZ(g, -6.8, -4.8, 4.8, 0, 4.2, t, paint);
	wallZ(g, 8.8, -4.8, 4.8, 0, 4.2, t, paint, [-1.0, 1.0, 0, 2.9]);
	box(g, -5, 5, 4.2, 4.5, -6.8, 8.8, ceil, 1);
	const red = std(0xa3261e, { roughness: 0.6 }), green = std(0x2f6a4a, { roughness: 0.6 });
	for (const z of [2.8, 5.4]) for (const x of [-2.9, 2.9]) {
		pillar(g, x, 0, z, 4.2, 0.2, red);
		mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.25, 8), green, x, 1.6, z, g);
		mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), M.gold, x, 1.75, z, g);
	}
	daylight(ctx, 0, 1.6, 9.5, 3.2, 3.4, "valley", 8, [0, 0, 5]);
	// the sanctum block, gilded frame and silver doors open
	wallX(g, -2.2, -4.4, 1.0, 0, 4.2, t, paint);
	wallX(g, 2.2, -4.4, 1.0, 0, 4.2, t, paint);
	wallZ(g, -4.4, -2.4, 2.4, 0, 4.2, t, paint);
	wallZ(g, 0.8, -2.4, 2.4, 0, 4.2, t, paint, [-0.75, 0.75, 0, 2.5]);
	box(g, -2.0, 2.0, 3.4, 3.55, -4.2, 0.6, ceil, 1);
	const rep = repousse(0xd8d8d2, 84, 5, 2);
	const silverD = std(0xffffff, { map: rep.map, bumpMap: rep.bump, bumpScale: 3, metalness: 0.9, roughness: 0.28 });
	silverD.userData.tri = 0.7;
	for (const sx of [-1, 1]) box(g, sx * 0.75 - (sx > 0 ? 0 : 0.2), sx * 0.75 + (sx > 0 ? 0.2 : 0), 0, 2.7, 0.98, 1.06, M.gold, 2);
	box(g, -0.95, 0.95, 2.5, 2.85, 0.98, 1.06, M.gold, 1);
	for (const sx of [-1, 1]) {
		const d = box(new THREE.Group(), 0, 0.72, 0, 2.45, -0.03, 0.03, silverD, 1);
		const hinge = new THREE.Group();
		hinge.position.set(sx * 0.75, 0.02, 0.56);
		hinge.rotation.y = sx > 0 ? 0.04 : Math.PI - 0.04;
		hinge.add(d);
		d.position.x = 0.36;
		g.add(hinge);
	}
	// altar with silver front, the gilded canopy and its back panel
	const A = V(0, 0.75, -3.25);
	box(g, -1.4, 1.4, 0, 0.75, -3.85, -2.75, M.cloth, 1).material = std(0x8a1e18, { roughness: 0.7 });
	const fr = repousse(0xd8d8d2, 88, 1, 3);
	const frieze = std(0xffffff, { map: fr.map, bumpMap: fr.bump, bumpScale: 3, metalness: 0.9, roughness: 0.28 });
	frieze.userData.tri = 0.7;
	box(g, -1.42, 1.42, 0.05, 0.7, -2.76, -2.72, frieze, 1);
	box(g, -1.45, 1.45, 0.72, 0.78, -3.88, -2.7, M.gold, 1);
	for (const [x, z] of [[-0.62, -2.85], [0.62, -2.85], [-0.62, -3.75], [0.62, -3.75]]) mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.65, 8), M.gold, x, 0.78 + 0.82, z, g);
	box(g, -0.72, 0.72, 2.42, 2.5, -3.85, -2.75, M.gold, 1);
	const dome = mesh(lathe([[0, 0], [0.8, 0], [0.74, 0.12], [0.6, 0.28], [0.38, 0.42], [0.16, 0.5], [0.05, 0.62], [0.06, 0.7], [0, 0.78]], 4, 1), M.gold, 0, 2.5, -3.3, g);
	dome.rotation.y = Math.PI / 4;
	dome.scale.set(1.05, 1, 0.82);
	for (let i = 0; i < 22; i++) {
		const xx = -0.68 + (i % 11) * 0.136, zz = i < 11 ? -2.73 : -3.87;
		mesh(new THREE.ConeGeometry(0.02, 0.09, 5).rotateX(Math.PI), M.gold, xx, 2.38, zz, g);
	}
	const pb = mesh(new THREE.CircleGeometry(0.62, 32, 0, Math.PI), M.gold, 0, 1.55, -3.82, g);
	pb.scale.y = 1.25;
	box(g, -0.62, 0.62, 0.78, 1.55, -3.83, -3.81, M.gold, 1);
	// Badri Narayan: black shaligram, seated in padmasana, four-armed, dressed and garlanded
	const stoneB = std(0x121211, { map: grainTex(0x1e1d1b, 85), roughness: 0.35, metalness: 0.08 });
	const robe = std(0xc8401a, { roughness: 0.55, emissive: 0x2a0800, emissiveIntensity: 0.3 });
	const J = figure({ head: "hair", tilak: false }, { skin: stoneB, top: robe, bottom: robe, sash: M.gold, hair: null, sole: stoneB });
	J.hem.visible = false;
	J.hipL.visible = J.hipR.visible = false;
	pose(J, { shL: -0.45, shLz: 0.35, shLy: 0.3, elL: -1.15, shR: -0.45, shRz: -0.35, shRy: -0.3, elR: -1.15, nod: 0.08, bob: -0.83 });
	const lap = mesh(new THREE.SphereGeometry(0.3, 24, 12), robe, 0, 0.1, 0.1, J.root);
	lap.scale.set(1.15, 0.32, 0.85);
	mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 40), M.gold, 0, 0.1, 0.1, J.root).rotation.x = Math.PI / 2;
	for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.05, 10, 6), stoneB, sx * 0.13, 0.19, 0.2, J.root).scale.set(0.6, 0.35, 1.2);
	mesh(new THREE.SphereGeometry(0.04, 10, 6), stoneB, 0, 0.2, 0.17, J.root).scale.set(1.4, 0.5, 0.9); // hands in the lap
	const cape = mesh(lathe([[0.05, 0.62], [0.2, 0.52], [0.27, 0.4], [0.3, 0.15], [0.32, -0.02]], 28), robe, 0, 0, -0.005, J.torso);
	cape.scale.z = 0.8;
	cape.material = std(0xe6b830, { roughness: 0.5, side: THREE.DoubleSide, emissive: 0x2a1a00, emissiveIntensity: 0.3 });
	const up = moreArms(J, { skin: stoneB, top: stoneB, bottom: robe }, 0.46);
	up.shL.rotation.set(-0.2, 0, -1.15);
	up.elL.rotation.set(0, 0, -1.9);
	up.shR.rotation.set(-0.2, 0, 1.15);
	up.elR.rotation.set(0, 0, 1.9);
	const ch = chakra(M);
	ch.position.y = 0.1;
	ch.scale.setScalar(0.8);
	up.handL.add(ch);
	const co = conch(M);
	co.position.y = 0.05;
	up.handR.add(co);
	const kr = new THREE.Group();
	mesh(lathe([[0, 0], [0.125, 0], [0.13, 0.04], [0.118, 0.06], [0.135, 0.12], [0.12, 0.18], [0.09, 0.22], [0.1, 0.25], [0.06, 0.3], [0.03, 0.36], [0.035, 0.39], [0, 0.44]], 28), M.gold, 0, 0, 0, kr);
	mesh(new THREE.CircleGeometry(0.24, 28), M.gold, 0, 0.1, -0.09, kr); // the halo behind the crown
	for (let i = 0; i < 9; i++) {
		const a = -0.9 + i * 0.225;
		mesh(new THREE.SphereGeometry(0.012, 6, 4), i % 2 ? M.rose : std(0x1a7a3a, { roughness: 0.2, emissive: 0x002a10 }), Math.sin(a) * 0.132, 0.09, Math.cos(a) * 0.132, kr);
	}
	kr.position.y = 0.06;
	J.head.add(kr);
	const diamond = mesh(new THREE.OctahedronGeometry(0.016), std(0xffffff, { metalness: 1, roughness: 0.05, emissive: 0x8899aa, emissiveIntensity: 0.6 }), 0, 0.05, 0.104, J.head);
	diamond.scale.y = 1.3;
	const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xddeeff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
	sp.position.set(0, 0.05, 0.11);
	sp.scale.setScalar(0.08);
	J.head.add(sp);
	ctx.sparkle = sp;
	const gl = (mat, d, r, low, w = 0.2) => {
		const pts = [V(-0.14, 0.55, 0.08), V(-w, 0.25, 0.17 + d), V(-w * 0.9, low + 0.1, 0.24 + d), V(0, low, 0.27 + d), V(w * 0.9, low + 0.1, 0.24 + d), V(w, 0.25, 0.17 + d), V(0.14, 0.55, 0.08)];
		beads(J.torso, new THREE.CatmullRomCurve3(pts), r, mat, M.rose);
	};
	gl(M.tulsi, 0.02, 0.03, -0.05, 0.24);
	gl(M.marigold, 0.05, 0.032, 0.08, 0.22);
	gl(M.jasmine, 0.065, 0.022, 0.2, 0.18);
	J.root.scale.setScalar(0.72);
	J.root.position.copy(A).add(V(0, 0, 0.05));
	g.add(J.root);
	// those around him: Nara and Narayana, Kubera, Garuda, Narada
	const brass = M.brass, darkS = stoneB;
	const small = (opts, mats, ps, x, y, z, ry, s) => {
		const F = figure(opts, mats);
		pose(F, ps);
		F.root.position.set(x, y, z);
		F.root.rotation.y = ry;
		F.root.scale.setScalar(s);
		g.add(F.root);
		return F;
	};
	const ochre = std(0xc86a1c, { roughness: 0.7 }), white = std(0xeae4d6, { roughness: 0.8 }), blue = std(0x2a4a8a, { roughness: 0.7 });
	for (const [i, x] of [[0, -0.85], [1, -1.17]]) {
		const F = small({ head: "hair", tilak: false }, { skin: darkS, top: darkS, bottom: ochre, sash: ochre, hair: darkS, sole: darkS }, i ? NAMASTE : P(STAND, { shL: -0.5, elL: -1.4 }), x, 0.78, -3.35, 0.15, 0.36);
		mesh(new THREE.SphereGeometry(0.05, 10, 8), darkS, 0, 0.12, -0.02, F.head);
	}
	const kub = small({ head: "hair", tilak: false }, { skin: darkS, top: darkS, bottom: blue, sash: M.gold, hair: null, sole: darkS }, { hipL: -1.4, hipR: -1.4, kneeL: 1.5, kneeR: 1.5, bob: -0.45, shL: -0.5, elL: -1.0, shR: -0.4, elR: -0.9 }, 1.0, 0.78, -3.3, -0.2, 0.38);
	mesh(new THREE.SphereGeometry(0.19, 14, 10), darkS, 0, 0.12, 0.08, kub.torso).scale.set(1, 0.9, 0.9); // Kubera's round belly
	const kk = kireetam(M, 0.18, 0.1);
	kk.position.y = 0.05;
	kub.head.add(kk);
	const gar = small({ head: "hair", tilak: false }, { skin: brass, top: brass, bottom: brass, sash: brass, hair: null, sole: brass }, P(NAMASTE, KNEEL, { kneeL: 1.62, kneeR: 1.5, hipR: -1.5, nod: 0.1 }), 0.95, 0.0, -2.45, Math.PI - 0.3, 0.5);
	for (const sx of [-1, 1]) {
		const w = mesh(new THREE.SphereGeometry(0.22, 12, 8), brass, sx * 0.17, 0.32, -0.12, gar.torso);
		w.scale.set(0.35, 1.0, 0.18);
		w.rotation.z = -sx * 0.35;
	}
	mesh(new THREE.ConeGeometry(0.025, 0.07, 6), brass, 0, -0.02, 0.12, gar.head).rotation.x = Math.PI / 2 + 0.5;
	const nar = small({ head: "hair", tilak: false }, { skin: darkS, top: white, bottom: white, sash: ochre, hair: darkS, sole: darkS }, P(STAND, { shL: -0.9, elL: -1.0, shR: -0.7, elR: -1.3, shRz: -0.3 }), -0.95, 0.0, -2.45, 0.3, 0.55);
	const vee = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), M.wood, 0, 0, 0, vee);
	for (const y of [-0.3, 0.26]) mesh(new THREE.SphereGeometry(0.07, 10, 8), M.wood, 0, y, 0.03, vee);
	vee.position.set(0, 0.32, 0.16);
	vee.rotation.z = 0.5;
	nar.torso.add(vee);
	mesh(new THREE.SphereGeometry(0.045, 10, 8), darkS, 0, 0.12, -0.02, nar.head);
	// offerings at his feet, and a place for the traveller's plate
	heap(g, flowerKinds(M), 60, (R) => V((R() - 0.5) * 1.1, 0.79, -2.82 - R() * 0.22), 86);
	const offered = new THREE.Group();
	g.add(offered);
	heap(offered, [[leafGeo(), M.tulsi, 0.6], [new THREE.SphereGeometry(0.008, 5, 4), std(0xd9a21e), 0.4]], 30, (R) => V((R() - 0.5) * 0.3, 0.8, -2.86 + (R() - 0.5) * 0.08), 87);
	offered.visible = false;
	ctx.offered = offered;
	kit.samai(g, -1.6, 0, -2.6, 1.25, 7);
	kit.samai(g, 1.6, 0, -2.6, 1.25, 7);
	kit.light(-1.4, 1.6, -2.3, 5, 7, 0xffa050, null, true);
	kit.light(1.4, 1.6, -2.3, 5, 7);
	kit.light(0, 2.2, -1.4, 2.5, 5, 0xffb060);
	for (const x of [-1.2, -0.4, 0.4, 1.2]) kit.diya(g, x, 0.78, -2.73);
	kit.incense(g, -0.55, 0, -2.2);
	kit.hanging(g, 0, 4.2, 4.2, 1.3);
	kit.hanging(g, 0, 4.2, -5.6, 1.2);
	kit.light(0, 2.8, -5.6, 3, 8);
	kit.light(0, 2.6, 4.2, 3.5, 10);
	kit.light(0, 2.4, 1.6, 1.5, 6, 0xffb060);
	kit.bell(g, 0.38, 2.95, 1.3, 1.2, 0.25);
	garland(g, V(-0.95, 2.82, 1.1), V(0.95, 2.82, 1.1), 0.3, 0.032, M.marigold, M.rose);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 0.95, 2.82, 1.12, 1.1, M.marigold, M.rose);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, 3.6, 0, 7.4, g);
	const crowdSpots = [[-1.7, 5.0, Math.PI - 0.2], [-2.3, 6.6, Math.PI + 0.3], [-3.6, -3.0, Math.PI / 2], [3.7, -1.5, -Math.PI / 2]];
	crowdSpots.forEach(([x, z, ry], i) => {
		const m = crowdFigure(501 + i * 13);
		KEEP.add(m.material);
		m.scale.setScalar(1 / 0.28);
		m.position.set(x, 0, z);
		m.rotation.y = ry;
		g.add(m);
	});
	common(ctx, 4.2);
	const door = [-0.62, 0.62, 0.2, 2.4, -4.0, 2.4]; // looking in through the open sanctum door
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-1.85, 1.85, 0.15, 3.25, -4.05, 0.3], [-4.55, 4.55, 0.15, 4.0, 1.2, 8.6], [-4.55, -2.65, 0.15, 4.0, -6.55, 8.6], [2.65, 4.55, 0.15, 4.0, -6.55, 8.6], [-4.55, 4.55, 0.15, 4.0, -6.55, -4.85]],
		deityPts: [[0, 0.75, -3.2], [0, 1.75, -3.2]], pts: { wash: [3.6, 0.3, 7.4], bell: [0.38, 2.4, 1.3], door: [0, 2.0, 0.8] },
		floor: () => 0, priestMark: "urdhva", mark: "chandan", kund: true,
		start: [0.6, 9.9], enterPath: [[0.6, 9.9], [0.6, 8.3], [2.7, 7.4]], staffRest: [4.45, 7.6], staffTilt: [0, -0.1], sandals: [3.1, 7.75], washFace: [3.6, 7.4],
		bellSpot: [0.2, 1.75], bellFace: Math.PI, bellPath: [[2.7, 7.4], [1.4, 4.4], [0.2, 1.75]],
		toFront: [[0.2, 1.75], [0.2, 1.0], [0.36, -0.95]], front: [0.36, -0.95], target: [0, -3.25],
		priestHome: [-1.45, -1.9], priestFace: [0, -0.95], priestTake: [-0.2, -1.6], priestPlace: [0, -2.2],
		priestAarti: [-0.05, -1.95], aartiSpot: [-0.45, -0.95], markSpot: [0.25, -0.95], priestMarkSpot: [-0.3, -1.5],
		circuit: [[0.36, -0.95], [0.3, 1.7], [-2.85, 1.75], [-2.85, -5.4], [2.85, -5.4], [2.85, 1.8], [0.5, 2.5]],
		bow: [0.36, -0.95],
		cams: {
			enter: F(["T", "wash"], -140, 10, 1.25),
			bell: F(["T", "bell"], -55, 8),
			darshan: Object.assign(F(["T", "D"], -4, 6, 0.8), { padP: 1, room: door }),
			offer: F(["T", "P", "D"], 60, 14),
			aarti: F(["T", "P", "D"], 62, 12),
			flame: F(["T", "P"], 65, 10),
			mark: Object.assign(F(["T", "P"], 10, 8), { room: door }),
			circuit: { orbit: [0, -2.0], back: 2.1, out: 1.0, side: 0, h: 1.8, lookH: 1.0, ahead: 1 },
			bow: Object.assign(F(["T", "D"], 4, 16, 0.9), { room: door }),
		},
	};
}
const BUILD = { bhimashankar, kedarnath, tirupati: tirumala, badrinath };

// ---------- the rituals ----------
// Each step: { title, note, mantra?, latin?, sets?: [flags], run(S, t) }. run sets the actors' targets,
// what is held, the camera and any streams for the moment t seconds into the step.
const OM_SHIVA = { mantra: "ॐ नमः शिवाय", latin: "Om Namah Shivaya" };
const BILVA = { mantra: "एकबिल्वं शिवार्पणम्", latin: "Ekabilvam Shivarpanam" };
const KARPURA = { mantra: "कर्पूरगौरं करुणावतारम्", latin: "Karpuragauram karunavataram" };

function stepsFor(key, L) {
	const cam = (name) => L.cams[name];
	const idlePriest = (S, t) => {
		S.P.x = L.priestHome[0];
		S.P.z = L.priestHome[1];
		S.P.face = L.priestFace;
		S.P.pose = P(NAMASTE, { nod: 0.12 + Math.sin(t * 0.7) * 0.04 });
	};
	const enter = (text) => ({
		...text, sets: ["barefoot", "staffDown"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("enter");
			const tw = walk(S.T, t, L.enterPath, 0.2, 0.7);
			const u = t - tw;
			S.T.arms = 0.3;
			S.hold.tR = u < 1.0 ? "staff" : null;
			if (u > 0.95) S.flag("staffDown");
			if (u > 2.1) S.flag("barefoot");
			S.T.face = u < 1.3 ? L.staffRest : L.washFace;
			const pour = P(STAND, { lean: 0.3, nod: 0.45, shR: -0.95, shRz: -0.25, shRy: -0.3, elR: -0.9, shL: -0.75, shLz: 0.15, shLy: 0.3, elL: -0.5 });
			S.T.pose = kf(u, [
				[0, P(STAND, STAFF)], [0.5, P(STAND, { lean: 0.3, shR: -0.7, shRz: 0.15, elR: -0.3, nod: 0.3 })], [1.0, P(STAND, { lean: 0.25, nod: 0.3 })],
				[1.4, P(STAND, { hipL: -0.35, kneeL: 0.7, nod: 0.4 })], [1.75, P(STAND, { nod: 0.4 })], [2.1, P(STAND, { hipR: -0.35, kneeR: 0.7, nod: 0.4 })], [2.5, STAND],
				[3.1, pour], [5.6, pour], [6.3, NAMASTE],
			]);
			if (L.kund) {
				// fresh from the hot spring: water still running off, and the kund's steam drifting in
				if (u < 3) S.emit.push({ from: S.at("head", 0, 0.05, 0), v: [0, -0.2, 0], spread: 0.18, rate: 18, color: 0xb8d0e0, size: 0.018 });
				S.steam = t < 9 ? 1 : 0;
			}
			if (u > 2.6 && u < 6.0) {
				S.hold.tR = "lota";
				S.tilt.lota = num(u, [[2.6, 0], [3.2, 1.4], [5.4, 1.5], [5.9, 0]]);
				if (u > 3.2 && u < 5.4) S.emit.push({ from: S.spout("lota"), v: S.fwd(0.25, -0.1), spread: 0.01, rate: 70, color: 0x9fbccc, size: 0.012, kill: L.floor(S.tx(), S.tz()) + 0.02 });
			}
		},
	});
	const bell = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("bell");
			const tw = walk(S.T, t, L.bellPath, 0, 0.8);
			const u = t - tw;
			S.T.face = L.bellFace;
			const up = P(STAND, { shR: -2.75, shRz: 0.2, elR: -0.35, nod: -0.35, shL: -0.4, shLy: 0.4, elL: -1.4 });
			S.T.pose = kf(u, [[0, STAND], [0.7, up], [1.0, P(up, { shR: -2.55 })], [1.25, up], [1.5, P(up, { shR: -2.55 })], [1.8, up], [2.6, NAMASTE]]);
			if (u > 0.9) S.once("ring", () => S.ring(0, 2.8));
			if (u > 1.4) S.once("ring2", () => S.ring(0, 2.2, false));
		},
	});
	const nandiStep = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("nandi");
			const tw = walk(S.T, t, L.nandiPath, 0, 0.75);
			const u = t - tw;
			S.T.face = L.nandiEar;
			const whisper = P(STAND, { lean: 0.42, nod: 0.25, look: 0.25, shR: -1.05, shRz: -0.3, shRy: -0.6, elR: -1.9, shL: -0.25, elL: -0.5 });
			S.T.pose = kf(u, [[0, NAMASTE], [0.9, P(NAMASTE, { lean: 0.25 })], [1.8, whisper], [4.2, whisper], [5.0, NAMASTE]]);
		},
	});
	const darshan = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("darshan");
			const tw = walk(S.T, t, L.toFront, 0, 0.6);
			const u = t - tw;
			S.T.face = L.target;
			S.T.pose = kf(u, [[0, STAND], [0.8, NAMASTE], [2.2, BOWED], [3.4, NAMASTE]]);
			if (L.noTouch) {
				// at Tirumala the moment is brief: hands raised in salutation as the line moves past
				S.T.pose = kf(u, [[0, STAND], [0.6, NAMASTE], [1.6, P(NAMASTE, { shL: -1.3, shR: -1.3, elL: -1.25, elR: -1.25, nod: -0.05 })], [3.2, BOWED], [4.4, NAMASTE]]);
				S.camPush = clamp(u / 8, 0, 1) * 0.35;
			}
		},
	});
	const queue = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("queue");
			const tw = walk(S.T, t, L.queue, 0, 0.55);
			const u = t - tw;
			S.T.face = L.doorFace;
			S.T.arms = 0.4;
			S.T.pose = P(NAMASTE, { nod: 0.05 });
			if (u > 0) S.T.pose = kf(u, [[0, NAMASTE], [1, P(NAMASTE, { nod: -0.1 })]]);
		},
	});
	const pourStep = (text) => ({
		...text, sets: L.ghee ? ["wet", "ghee"] : ["wet"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("pour");
			// seated, the pilgrim settles a little further back so the crossed knees clear the pitha
			const sitting = !L.ghee;
			const tw = walk(S.T, t, [L.front, sitting ? [L.pour[0], L.pour[1] + 0.32] : L.pour], 0, 0.5);
			const u = t - tw;
			S.T.face = L.target;
			// at Bhimashankar the pilgrim sits down beside the low pitha before pouring; at Kedarnath they stand at the rock
			const sit = !L.ghee;
			const base = sit ? SIT : STAND, d = sit ? 1.6 : 0;
			const hold = P(base, { lean: sit ? 0.3 : 0.15, nod: 0.3, shR: -0.75, shRz: -0.1, elR: -0.9, shL: -0.6, shLz: 0.2, shLy: 0.5, elL: -1.4 });
			const tip = P(hold, { lean: sit ? 0.5 : 0.32, nod: 0.45, shR: -1.05, elR: -0.55 });
			S.hold.tR = u < 6.4 + d ? "lota" : null;
			S.T.pose = sit
				? kf(u, [[0, P(STAND, { shR: -0.75, elR: -0.9, nod: 0.3 })], [0.6, P(KNEEL, { shR: -0.75, elR: -0.9 })], [1.6, hold], [2.6, tip], [6.2, tip], [7.0, P(SIT, NAMASTE)], [7.8, P(SIT, NAMASTE)], [8.8, NAMASTE]])
				: kf(u, [[0, hold], [1.0, tip], [4.6, tip], [5.4, hold], [6.4, NAMASTE]]);
			S.tilt.lota = num(u, [[0.6 + d, 0.1], [1.5 + d, 1.6], [4.4 + d, 1.8], [5.2 + d, 0.1]]);
			if (u > 1.4 + d && u < 4.4 + d) {
				S.emit.push({ from: S.spout("lota"), v: S.fwd(0.3, -0.05), spread: 0.008, rate: 140, color: 0xc8e0ee, size: 0.016, kill: L.pourTop });
				S.flag("wet");
			}
			if (L.ghee && u > 6.4) {
				// then ghee, rubbed onto the rock by hand
				const v = u - 6.4;
				S.hold.tL = v < 1.2 ? "ghee" : null;
				const rub = (k) => P(KNEEL, { lean: 0.55, nod: 0.35, shL: -1.15, shLz: 0.25 + k, elL: -0.35, shR: -1.15, shRz: -0.25 - k, elR: -0.35 });
				S.T.pose = kf(v, [[0, NAMASTE], [0.9, P(STAND, { lean: 0.3, shL: -0.8, elL: -1.0, nod: 0.3 })], [1.6, rub(0)], [2.0, rub(0.12)]]);
				if (v > 2.0) S.T.pose = rub(Math.sin(v * 5) * 0.12);
				if (v > 2.6) S.flag("ghee");
				S.cam = cam("embrace");
				S.T.x = L.embrace[0];
				S.T.z = L.embrace[1];
				S.T.noTurn = true;
			}
		},
	});
	const embrace = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("embrace");
			S.T.x = L.embrace[0];
			S.T.z = L.embrace[1];
			S.T.face = L.target;
			const hug = P(KNEEL, { lean: 0.72, nod: 0.55, shL: -1.4, shLz: -0.55, elL: -0.7, elLy: 0.3, shR: -1.4, shRz: 0.55, elR: -0.7, elRy: -0.3 });
			S.T.pose = kf(t, [[0, NAMASTE], [1.2, P(KNEEL, NAMASTE)], [2.4, hug], [6.0, hug], [7.0, P(KNEEL, NAMASTE)]]);
		},
	});
	const offer = (text) => ({
		...text, sets: ["leaves"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("offer");
			S.T.x = L.pour[0];
			S.T.z = L.pour[1];
			S.T.face = L.target;
			const reach = P(STAND, { lean: 0.35, nod: 0.45, shR: -1.25, shRz: 0.05, elR: -0.25, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4 });
			S.T.pose = kf(t, [[0, NAMASTE], [0.8, P(STAND, { shR: -0.6, elR: -1.4, shL: -0.6, elL: -1.4 })], [2.0, reach], [2.8, reach], [3.8, NAMASTE], [5, BOWED]]);
			S.hold.tR = t > 0.5 && t < 2.6 ? "bilva" : null;
			if (t > 2.5) S.flag("leaves");
		},
	});
	const offerPlate = (text) => ({
		...text, sets: ["leaves"],
		run(S, t) {
			S.cam = cam("offer");
			S.T.x = L.front[0];
			S.T.z = L.front[1];
			S.T.face = L.target;
			const give = P(STAND, { lean: 0.2, nod: 0.35, shL: -1.0, shLy: 0.3, elL: -0.6, shR: -1.0, shRy: -0.3, elR: -0.6 });
			S.T.pose = kf(t, [[0, P(STAND, { shL: -0.7, shLy: 0.3, elL: -1.2, shR: -0.7, shRy: -0.3, elR: -1.2 })], [1.6, give], [2.6, give], [3.4, NAMASTE]]);
			S.hold.tR = t < 2.5 ? "thali" : null;
			// the pujari takes it and lays it at the Lord's feet
			const pw = walk(S.P, t, [L.priestHome, L.priestTake], 0, 0.8);
			const takeP = P(STAND, { shL: -1.0, shLy: 0.3, elL: -0.6, shR: -1.0, shRy: -0.3, elR: -0.6, lean: 0.1 });
			const carry = P(STAND, { shL: -0.7, shLy: 0.3, elL: -1.2, shR: -0.7, shRy: -0.3, elR: -1.2 });
			S.P.face = L.front;
			S.P.pose = kf(t, [[0, NAMASTE], [1.6, takeP], [2.6, carry]]);
			if (t > 2.5) S.hold.pR = "thali";
			if (t > 3.0) {
				const tw = walk(S.P, t, [L.priestTake, L.priestPlace], 3.0, 0.7);
				S.P.face = L.target;
				const v = t - tw;
				S.P.pose = kf(v, [[0, carry], [0.9, P(carry, { lean: 0.55, nod: 0.4, shL: -1.1, shR: -1.1, elL: -0.5, elR: -0.5 })], [1.8, P(NAMASTE, { lean: 0.2 })]]);
				if (v > 0.9) {
					S.hold.pR = null;
					S.flag("leaves");
				}
				if (v > 2.6) {
					walk(S.P, t, [L.priestPlace, L.priestHome], tw + 2.6, 0.7);
					S.P.face = v > 4.5 ? L.priestFace : undefined;
				}
			}
		},
	});
	const aarti = (text) => ({
		...text,
		run(S, t) {
			S.cam = cam("aarti");
			S.T.x = L.aartiSpot[0];
			S.T.z = L.aartiSpot[1];
			S.T.face = L.target;
			S.T.pose = P(NAMASTE, { nod: 0.15 + Math.sin(t * 0.8) * 0.04, twist: Math.sin(t * 0.6) * 0.03 });
			const tw = walk(S.P, t, [L.priestHome, L.priestAarti], 0, 0.7);
			const u = t - tw;
			S.P.face = L.target;
			S.hold.pR = "aarti";
			S.hold.pL = "ghanti";
			const a = Math.max(0, u - 0.8) * 2.4;
			const k = clamp(u - 0.6, 0, 1);
			const low = L.lowDeity ? 1 : 0;
			S.P.pose = P(STAND, {
				shR: -0.95 + low * 0.3 - Math.sin(a) * 0.32 * k, shRz: -0.15 + Math.cos(a) * 0.3 * k, shRy: -0.2, elR: -0.75 + low * 0.3 + Math.cos(a) * 0.15 * k,
				shL: -0.55, shLz: 0.25, elL: -1.2 + Math.sin(t * 22) * 0.06 * k, lean: 0.08 + low * 0.25, nod: 0.12 + low * 0.3,
			});
			if (u > 0.5) S.once("bells", () => S.bigBell(2));
			if (u > 0.8) S.every("ghanti", 0.42, u, () => S.ghanti());
		},
	});
	const takeFlame = (text) => ({
		...text,
		run(S, t) {
			S.cam = cam("flame");
			S.T.x = L.aartiSpot[0];
			S.T.z = L.aartiSpot[1];
			S.P.x = L.priestAarti[0];
			S.P.z = L.priestAarti[1];
			S.hold.pR = "aarti";
			const pt = [lerp(L.priestAarti[0], L.aartiSpot[0], 0.55), lerp(L.priestAarti[1], L.aartiSpot[1], 0.55)];
			S.P.x = lerp(L.priestAarti[0], pt[0], ease(t / 1.5) * 0.6);
			S.P.z = lerp(L.priestAarti[1], pt[1], ease(t / 1.5) * 0.6);
			S.P.face = L.aartiSpot;
			S.P.pose = P(STAND, { shR: -0.85, shRz: -0.05, elR: -0.95, shL: -0.4, shLz: 0.2, elL: -1.2, nod: 0.25 });
			S.T.face = [S.P.x, S.P.z];
			const over = P(STAND, { lean: 0.25, nod: 0.45, shL: -0.85, shLz: 0.2, shLy: 0.35, elL: -0.55, shR: -0.85, shRz: -0.2, shRy: -0.35, elR: -0.55 });
			const eyes = P(STAND, { lean: 0.05, nod: 0.25, shL: -0.6, shLz: 0.4, shLy: 0.7, elL: -2.35, shR: -0.6, shRz: -0.4, shRy: -0.7, elR: -2.35 });
			if (t < 1.6) S.T.pose = kf(t, [[0, NAMASTE], [1.6, over]]);
			else if (t < 9.4) {
				const c = ((t - 1.6) % 2.6) / 2.6;
				S.T.pose = c < 0.5 ? mix(over, eyes, ease(c * 2)) : mix(eyes, over, ease((c - 0.5) * 2));
			} else S.T.pose = kf(t, [[9.4, over], [10.4, NAMASTE]]);
		},
	});
	const markStep = (text) => ({
		...text, sets: ["mark"],
		run(S, t) {
			S.cam = cam("mark");
			S.T.x = L.markSpot[0];
			S.T.z = L.markSpot[1];
			walk(S.P, t, [L.priestHome, L.priestMarkSpot], 0, 0.8);
			S.P.face = L.markSpot;
			S.T.face = L.priestMarkSpot;
			const apply = P(STAND, { shR: -1.55, shRz: -0.15, shRy: -0.2, elR: -1.0, shL: -0.3, elL: -1.4, nod: 0.1 });
			const give = P(STAND, { shR: -0.8, shRz: -0.1, elR: -0.7, shL: -0.3, elL: -1.4, nod: 0.25, lean: 0.1 });
			S.P.pose = kf(t, [[0, STAND], [1.6, STAND], [2.4, apply], [3.4, apply], [4.0, STAND], [4.8, give], [5.8, give], [6.4, NAMASTE]]);
			const cup = P(STAND, { shR: -0.75, shRz: -0.15, shRy: -0.25, elR: -0.8, shL: -0.6, shLz: 0.2, shLy: 0.35, elL: -0.9, nod: 0.25 });
			const toHead = P(STAND, { shR: -0.9, shRy: -0.5, elR: -2.3, shL: -0.4, elL: -1.0, nod: 0.15 });
			S.T.pose = kf(t, [[0, NAMASTE], [1.8, P(NAMASTE, { nod: -0.12, lean: 0.12 })], [3.6, P(NAMASTE, { nod: -0.05, lean: 0.12 })], [4.4, cup], [5.8, cup], [6.8, toHead], [7.6, toHead], [8.4, NAMASTE]]);
			if (t > 3.0) S.flag("mark");
			if (t > 4.5 && t < 5.6) S.hold.pR = "prasad";
			if (t > 5.6 && t < 8.0) S.hold.tR = "prasad";
		},
	});
	const theertham = (text) => ({
		...text,
		run(S, t) {
			S.cam = cam("theertham");
			const tw = walk(S.T, t, L.theertham, 0, 0.8);
			const u = t - tw;
			S.T.face = L.priestHome;
			S.P.x = L.priestHome[0];
			S.P.z = L.priestHome[1];
			S.P.face = L.priestFace;
			S.hold.pL = u < 4.4 ? "vessel" : null;
			S.hold.pR = u < 4.4 ? "spoon" : null;
			const pourP = P(STAND, { shR: -1.0, shRz: -0.1, elR: -0.7, shL: -0.7, shLz: 0.2, elL: -0.9, nod: 0.35, lean: 0.1 });
			const crown = P(STAND, { shL: -1.75, shLz: -0.1, elL: -0.65, shR: -0.2, elR: -0.3, nod: 0.15 });
			S.P.pose = kf(u, [[0, P(STAND, { shL: -0.6, elL: -1.0, shR: -0.4, elR: -1.0 })], [0.8, pourP], [2.4, pourP], [3.0, STAND], [4.6, STAND], [5.4, crown], [6.6, crown], [7.4, NAMASTE]]);
			if (u > 4.6 && u < 7.2) S.hold.pL = "shathari";
			if (u > 1.0 && u < 2.2) S.emit.push({ from: S.spout("spoon"), v: [0, -0.1, 0], spread: 0.004, rate: 50, color: 0xb0ccd8, size: 0.01, kill: 1.0 });
			const cup = P(STAND, { shR: -0.75, shRz: -0.15, shRy: -0.25, elR: -0.8, shL: -0.6, shLz: 0.2, shLy: 0.35, elL: -0.9, nod: 0.3 });
			const sip = P(STAND, { shR: -0.55, shRy: -0.6, elR: -2.35, shL: -0.3, elL: -0.8, nod: 0.05 });
			const head = P(STAND, { shR: -2.4, shRz: 0.1, elR: -1.5, shL: -0.2, nod: 0.3 });
			S.T.pose = kf(u, [[0, NAMASTE], [0.6, cup], [2.4, cup], [3.0, sip], [3.5, sip], [4.0, head], [4.5, NAMASTE], [5.2, P(NAMASTE, { nod: 0.5, lean: 0.25 })], [6.8, P(NAMASTE, { nod: 0.5, lean: 0.25 })], [7.6, NAMASTE]]);
		},
	});
	const hundi = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("hundi");
			const tw = walk(S.T, t, L.hundiPath, 0, 0.8);
			const u = t - tw;
			S.T.face = L.hundiFace;
			const drop = P(STAND, { lean: 0.3, nod: 0.45, shR: -1.25, shRz: 0.1, elR: -0.45, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4 });
			S.T.pose = kf(u, [[0, STAND], [0.9, drop], [2.6, drop], [3.4, NAMASTE], [4.4, BOWED]]);
			if (u > 1.1 && u < 2.4) S.emit.push({ from: S.at("handR", 0, -0.02, 0.03), v: [0, -0.2, 0], spread: 0.01, rate: 10, color: 0xffd060, size: 0.03, kill: 1.0 });
		},
	});
	const pradakshina = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			const c = cam("circuit");
			const path = L.circuit;
			const len = plen(path);
			const v = 0.62;
			if (L.circuitBack) {
				// a Shiva shrine: clockwise to the spout of the pitha, then back the way you came
				const t1 = len / v;
				const d = t < t1 ? t * v : t < t1 + 2.0 ? len : Math.max(0, len - (t - t1 - 2.0) * v);
				const p = along(path, d);
				S.T.x = p[0];
				S.T.z = p[1];
				if (t >= t1 && t < t1 + 2.0) {
					S.T.face = L.target;
					S.T.pose = NAMASTE;
				} else S.T.pose = NAMASTE;
				if (t > t1 + 2 + len / v) S.T.face = L.target;
			} else {
				walk(S.T, t, path, 0, v);
				S.T.pose = NAMASTE;
				S.T.face = L.target;
			}
			S.T.arms = 0;
			S.cam = c;
		},
	});
	const bow = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("bow");
			const at = L.bow;
			S.T.x = at[0];
			S.T.z = at[1];
			S.T.face = L.target;
			S.T.pose = kf(t, [[0, NAMASTE], [1.0, P(NAMASTE, KNEEL)], [2.2, PRANAM], [4.2, PRANAM], [5.2, P(NAMASTE, KNEEL)], [6.4, NAMASTE], [7.4, BOWED], [8.4, NAMASTE]]);
			S.T.rate = 3.2;
		},
	});
	const laddu = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("laddu");
			S.T.x = L.laddu[0];
			S.T.z = L.laddu[1];
			S.T.face = L.target;
			const holdUp = P(STAND, { shL: -0.9, shLy: 0.4, elL: -1.5, shR: -0.9, shRy: -0.4, elR: -1.5, nod: 0.3 });
			S.T.pose = kf(t, [[0, P(STAND, { shL: -0.6, shLy: 0.3, elL: -1.2, shR: -0.6, shRy: -0.3, elR: -1.2 })], [1.5, holdUp], [3.2, holdUp], [4.2, NAMASTE]]);
			S.hold.tR = t < 3.8 ? "laddu" : null;
		},
	});

	const txt = {
		shoes: { title: "Leave sandals and staff", note: "Footwear never goes into a shrine. Lean the staff by the door, slip off your sandals and rinse your hands and feet before stepping in." },
		bell: { title: "Ring the bell", note: "A brass bell hangs at the threshold. Ring it as you enter: its sound announces you to the deity and is said to clear the mind." },
		aarti: { title: "Aarti", note: "The pujari waves a brass lamp of many wicks in slow clockwise circles before the deity while the bells ring.", ...KARPURA },
		flame: { title: "Take the aarti", note: "When the lamp is brought to you, pass your palms over the flame and draw its warmth to your eyes and head." },
		vibhuti: { title: "Vibhuti and prasad", note: "The pujari marks your forehead with vibhuti, the sacred ash of Shiva, in three lines, and gives prasad. Take it in your right hand." },
	};
	if (key === "bhimashankar") return [
		enter(txt.shoes),
		bell(txt.bell),
		darshan({ title: "Down to the Jyotirlinga", note: "The garbhagriha lies below the level of the hall, down a short flight of steps. The small lingam rests in a silver pitha under a silver naga hood, heaped with bilva leaves and flowers.", ...OM_SHIVA }),
		pourStep({ title: "Abhishek", note: "Pour water slowly from a copper lota over the lingam while chanting. It runs off through the spout of the pitha.", ...OM_SHIVA }),
		offer({ title: "Offer bilva leaves", note: "Bilva leaves, three to a stalk, are the leaf most dear to Shiva. Lay them on the lingam with a few flowers.", ...BILVA }),
		aarti(txt.aarti),
		takeFlame(txt.flame),
		markStep(txt.vibhuti),
		pradakshina({ title: "Pradakshina", note: "Walk around the lingam clockwise, keeping it on your right. At a Shiva shrine you turn back at the spout where the abhishek water runs out, rather than stepping over it." }),
		bow({ title: "Bow and take leave", note: "Kneel and touch your forehead to the floor, then rise with folded hands. It is customary to sit a while in the hall before you go.", mantra: "हर हर महादेव", latin: "Har Har Mahadev" }),
	];
	if (key === "kedarnath") return [
		enter({ title: "Leave sandals and staff", note: "Footwear stays outside. Lean the staff by the door, slip off your sandals and rinse your hands and feet in the icy water before stepping in." }),
		nandiStep({ title: "Nandi and the Pandavas", note: "In the hall Nandi kneels facing the sanctum, and stone figures of the five Pandavas and Draupadi stand in the niches. Many pilgrims bow to Nandi and whisper a prayer in his ear." }),
		bell({ title: "Ring the bell", note: "Bells hang in the brass-framed doorway of the sanctum. Ring one as you enter." }),
		darshan({ title: "Darshan of Kedarnath", note: "The lingam here is not carved. It is a low, three-sided natural rock, said to be the hump of Shiva, who took the form of a bull to hide from the Pandavas.", ...OM_SHIVA }),
		pourStep({ title: "Water and ghee", note: "Pour water from a copper lota over the rock, then rub ghee onto it with your own hands, a custom special to Kedarnath.", ...OM_SHIVA }),
		embrace({ title: "Embrace the lingam", note: "Here pilgrims may touch the deity. Kneel, put your arms around the rock and rest your forehead on it.", ...OM_SHIVA }),
		offer({ title: "Offer bilva leaves", note: "Bilva leaves, three to a stalk, are the leaf most dear to Shiva. Lay them on the rock with a few flowers.", ...BILVA }),
		aarti(txt.aarti),
		takeFlame(txt.flame),
		markStep(txt.vibhuti),
		pradakshina({ title: "Pradakshina", note: "Walk around the lingam clockwise, keeping it on your right. Outside, pilgrims also circle the whole temple, passing Adi Shankara's samadhi behind it." }),
		bow({ title: "Bow and take leave", note: "Kneel and touch your forehead to the floor, then rise with folded hands and leave quietly.", mantra: "जय बाबा केदार", latin: "Jai Baba Kedar" }),
	];
	if (key === "tirupati") return [
		enter({ title: "Leave sandals and staff", note: "Footwear and bags are left at the counters outside. Rinse your hands and feet, then join the queue." }),
		queue({ title: "Through the golden door", note: "The queue moves through the halls to the Bangaru Vakili, the gold-plated doorway guarded by Jaya and Vijaya. Pilgrims chant the Lord's name as they go.", mantra: "गोविन्दा गोविन्दा", latin: "Govinda, Govinda" }),
		darshan({ title: "Darshan of Sri Venkateswara", note: "For a few seconds you stand before the Lord: black stone, about 2.5 m tall, his eyes covered by the broad white namam, his lower right hand pointing to his feet. Fold your hands and call his name. Nothing is touched here, and the line keeps moving.", mantra: "ॐ नमो वेङ्कटेशाय", latin: "Om Namo Venkatesaya" }),
		theertham({ title: "Theertham and shathari", note: "An archaka pours theertham, holy water, into your cupped right palm. Sip it and pass the hand over your head. Then the shathari, a silver crown bearing the Lord's feet, is touched to your head." }),
		hundi({ title: "The hundi", note: "Offerings go into the Srivari hundi, a great vessel under a white cloth. Pilgrims drop in money and gold, often in fulfilment of a vow." }),
		pradakshina({ title: "Vimana pradakshina", note: "Walk clockwise around the sanctum, keeping it on your right. Pilgrims look up for the Vimana Venkateswara, a small image of the Lord on the golden tower." }),
		laddu({ title: "The laddu", note: "Leave with the Tirupati laddu, the temple's famous prasadam, collected at the counters outside, and a last call of the Lord's name.", mantra: "गोविन्दा गोविन्दा", latin: "Govinda, Govinda" }),
	];
	return [
		enter({ title: "Bathe in Tapt Kund", note: "Before darshan pilgrims bathe in Tapt Kund, the hot spring below the temple steps, said to be the seat of Agni. Then leave sandals and staff at the door." }),
		bell(txt.bell),
		darshan({ title: "Darshan of Badri Vishal", note: "Badri Narayan sits in padmasana, in meditation: a black shaligram image about a metre high under a gilded canopy, with Nara and Narayana, Kubera, Garuda and Narada around him.", mantra: "ॐ नमो नारायणाय", latin: "Om Namo Narayanaya" }),
		offerPlate({ title: "Offer tulsi", note: "Tulsi is the leaf most dear to Vishnu. Hand your plate of tulsi, chana dal and mishri to the pujari, who lays it at the Lord's feet." }),
		aarti({ title: "Aarti", note: "The pujari waves the lamp in slow clockwise circles before Badri Vishal as the bells ring and the Badrinath aarti is sung.", mantra: "पवन मंद सुगंध शीतल हेम मंदिर शोभितम्", latin: "Pavan mand sugandh sheetal, hem mandir shobhitam" }),
		takeFlame(txt.flame),
		markStep({ title: "Chandan and prasad", note: "The pujari marks your forehead with chandan, sandalwood paste, and gives prasad of chana dal, mishri and tulsi." }),
		pradakshina({ title: "Pradakshina", note: "Walk clockwise around the sanctum, keeping it on your right." }),
		bow({ title: "Bow and take leave", note: "Kneel and touch your forehead to the floor, then rise with folded hands.", mantra: "जय बद्री विशाल", latin: "Jai Badri Vishal" }),
	];
}

// ---------- the module ----------
export class Sanctum {
	constructor({ renderer, container = document.body, audio = null, low = false, onExit = null, onStep = null } = {}) {
		this.renderer = renderer;
		this.container = container;
		this.audio = audio;
		this.low = low;
		this.onExit = onExit;
		this.onStep = onStep;
		this.active = false;
		this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
		this.w = innerWidth;
		this.h = innerHeight;
		this._cc = new THREE.Color();
		this._onKey = this._onKey.bind(this);
	}
	// auto: walk through every ritual by itself, moving on once the traveller and pujari have finished
	// the step's actions and there has been time to read it, and leave after the last one.
	enter(key, { auto = false } = {}) {
		this.auto = auto;
		if (this.active) this._teardown();
		const shrine = SHRINES.find((s) => s.key === key);
		if (!shrine) throw new Error(`Unknown shrine: ${key}`);
		this.key = key;
		this.shrine = shrine;
		this.active = true;
		this.leaving = false;
		this._build(key);
		this._ui();
		window.addEventListener("keydown", this._onKey, true);
		window.addEventListener("keyup", this._onKey, true);
		document.body.classList.add("sanctum-open");
		this.go(0, true);
		requestAnimationFrame(() => this.root && this.root.classList.add("ready"));
	}
	next() {
		if (this.idx >= this.steps.length - 1) return this.exit();
		this.go(this.idx + 1);
	}
	back() {
		if (this.idx > 0) this.go(this.idx - 1);
	}
	go(i, first = false) {
		if (!this.active || this.leaving) return;
		i = clamp(i | 0, 0, this.steps.length - 1);
		const jump = first || i !== this.idx + 1;
		this.idx = i;
		this.st = 0;
		this.fired = new Set();
		this.every = {};
		this.flags = new Set();
		for (let k = 0; k < i; k++) for (const f of this.steps[k].sets || []) this.flags.add(f);
		this.snap = jump;
		this.drag.yaw = this.drag.pitch = 0;
		if (jump && !first) {
			this.root.classList.add("blink");
			setTimeout(() => this.root && this.root.classList.remove("blink"), 220);
		}
		this._panel();
		const s = this.steps[i];
		if (this.onStep) this.onStep(i, { title: s.title, note: s.note, mantra: s.mantra, latin: s.latin }, this.key);
	}
	exit() {
		if (!this.active || this.leaving) return;
		this.leaving = true;
		this.root.classList.add("leaving");
		setTimeout(() => {
			const key = this.key;
			this._teardown();
			if (this.onExit) this.onExit(key);
		}, 520);
	}
	resize(w, h) {
		this.w = w;
		this.h = h;
		this._frame();
	}

	// ---------- build ----------
	_build(key) {
		const scene = (this.scene = new THREE.Scene());
		scene.background = new THREE.Color(0x060403);
		scene.fog = new THREE.FogExp2(0x0b0705, key === "tirupati" || key === "badrinath" ? 0.045 : 0.06);
		const g = new THREE.Group();
		scene.add(g);
		const ctx = (this.ctx = { g, M: MAT(), low: this.low, flames: [], lights: [], bells: [], smokeFrom: [] });
		ctx.kit = new Kit(ctx);
		scene.add(new THREE.HemisphereLight(0x8a7a6a, 0x1a120c, { kedarnath: 0.35, badrinath: 0.1 }[key] ?? 0.22));
		this.L = BUILD[key](ctx);
		this.steps = stepsFor(key, this.L);
		this.props = buildProps(ctx);
		// the traveller: as outside, in saffron kurta, white dhoti, turban and shawl
		const skinT = std(SKIN[0], { roughness: 0.65 });
		const TJ = figure({ head: "turban", beard: 0x5d554e }, { skin: skinT, top: std(0xe2761b), bottom: std(0xf1ebdc), sash: std(0xb8261c), head: std(0xf08a1f), sole: std(SOLE) });
		eyes(TJ);
		TJ.skinMat = skinT;
		TJ.soleMat = TJ.feet[0].material;
		this.markT = markPatch(this.L.mark || "tripundra", 0.107, 1.0, 1.75);
		this.markT.visible = false;
		TJ.head.add(this.markT);
		g.add(TJ.root);
		this.trav = new Actor(TJ, this.L.floor);
		// the pujari: bare-chested, white dhoti, the sacred thread across the chest, shaven head with a tuft
		const skinP = std(SKIN[2], { roughness: 0.6 });
		const dhoti = std(0xf2eee2, { roughness: 0.9 });
		const PJ = figure({ head: "hair", tilak: false }, { skin: skinP, top: skinP, bottom: dhoti, sash: std(0xf4efe0), hair: null, sole: skinP });
		PJ.hem.material = dhoti;
		PJ.sash.geometry.dispose();
		PJ.sash.geometry = new THREE.TorusGeometry(0.205, 0.0045, 4, 48);
		PJ.sash.scale.set(1, 0.74, 1.12);
		const tuft = mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x15110e, { roughness: 0.7 }), 0, 0.09, -0.07, PJ.head);
		tuft.scale.set(1, 1.3, 1);
		mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.08, 5), tuft.material, 0, 0.06, -0.11, PJ.head).rotation.x = 0.6;
		PJ.head.add(markPatch(this.L.priestMark || "tripundra"));
		eyes(PJ);
		g.add(PJ.root);
		this.priest = new Actor(PJ, this.L.floor);
		// incense smoke and the streams of water, ghee and coins
		this.smoke = [];
		const ns = this.low ? 18 : 40;
		for (let i = 0; i < ns; i++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX(), color: 0x8f8478, transparent: true, depthWrite: false, opacity: 0 }));
			s.userData = { life: -Math.random() * 6, src: i % Math.max(1, ctx.smokeFrom.length) };
			g.add(s);
			this.smoke.push(s);
		}
		this.steam = [];
		if (this.L.kund) {
			for (let i = 0; i < (this.low ? 10 : 22); i++) {
				const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE_TEX(), color: 0xd8dde4, transparent: true, depthWrite: false, opacity: 0 }));
				s.userData = { life: -Math.random() * 5 };
				g.add(s);
				this.steam.push(s);
			}
		}
		const N = 600;
		const pg = new THREE.BufferGeometry();
		pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
		pg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
		this.drops = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.014, vertexColors: true, map: glow(), transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true }));
		this.drops.frustumCulled = false;
		this.dropV = new Float32Array(N * 3);
		this.dropK = new Float32Array(N).fill(-999);
		this.dropN = 0;
		this.emitAcc = 0;
		g.add(this.drops);
		// warm reflections for the metal: a dark room with a few lamp-bright spots
		const pm = new THREE.PMREMGenerator(this.renderer);
		const es = new THREE.Scene();
		const back = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.02, 0.014), side: THREE.BackSide }));
		es.add(back);
		const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.4, 1.4) });
		const sph = new THREE.SphereGeometry(0.5, 12, 8);
		for (const [x, y, z] of [[-3, 1, -4], [3, 1, -4], [0, 3, 3], [-4, 0.5, 2], [4, 2, 1]]) {
			const m = new THREE.Mesh(sph, hot);
			m.position.set(x, y, z);
			es.add(m);
		}
		const cool = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.55, 0.62), side: THREE.DoubleSide }));
		cool.position.set(0, 1.5, 9.8);
		es.add(cool);
		this.envRT = pm.fromScene(es, 0.03);
		this.env = this.envRT.texture;
		pm.dispose();
		es.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			if (o.material) o.material.dispose();
		});
		scene.environment = this.env;
		this.camP = V();
		this.camL = V();
		this.drag = { yaw: 0, pitch: 0, on: false, x: 0, y: 0 };
		this.time = 0;
		this.S = this._stage();
	}
	_stage() {
		const self = this;
		const v = V();
		return {
			T: {}, P: {}, hold: {}, tilt: {}, emit: [], cam: null,
			flag(f) { self.flags.add(f); },
			once(id, fn) { if (!self.fired.has(id)) { self.fired.add(id); fn(); } },
			every(id, period, u, fn) {
				const n = Math.floor(u / period);
				if (self.every[id] !== n) { self.every[id] = n; fn(); }
			},
			ring(i, kick = 2.5, sound = true) {
				const b = self.ctx.bells[i];
				if (b) b.v += kick;
				if (sound && self.audio && self.audio.bell) self.audio.bell(1);
			},
			bigBell(n) { if (self.audio && self.audio.bell) self.audio.bell(n); },
			ghanti() { self._ghanti(); },
			tx: () => self.trav.pos.x,
			tz: () => self.trav.pos.z,
			// world-space emitters, evaluated after the actors move
			at: (joint, x, y, z) => () => self.trav.J[joint].localToWorld(v.set(x, y, z)).clone(),
			spout: (name) => () => {
				const p = self.props[name];
				return p.o.localToWorld(p.spout.clone());
			},
			fwd: (f, up) => () => {
				const yaw = self.trav.yaw;
				return [Math.sin(yaw) * f, up, Math.cos(yaw) * f];
			},
		};
	}
	_ui() {
		const root = (this.root = document.createElement("div"));
		root.className = "sanctum";
		root.setAttribute("role", "dialog");
		root.setAttribute("aria-label", `Inside the temple at ${this.shrine.name}`);
		root.innerHTML = `
			<div class="sn-veil"></div>
			<div class="sn-top">
				<div class="sn-place"><span class="sn-place-k">Inside the temple</span><span class="sn-place-n"></span></div>
				<button class="sn-exit ghost" type="button" title="Return outside (Esc)">Return outside</button>
			</div>
			<aside class="sn-panel panel" aria-live="polite">
				<div class="sn-body">
					<div class="sn-kicker"></div>
					<h2 class="sn-title"></h2>
					<p class="sn-note"></p>
					<div class="mantra sn-mantra"><div class="m-deva" lang="sa"></div><div class="m-latin"></div></div>
				</div>
				<div class="sn-foot">
					<div class="sn-dots" role="tablist" aria-label="Rituals"></div>
					<div class="sn-actions">
						<button class="sn-back ghost" type="button" title="Back (Left arrow)">Back</button>
						<button class="sn-next primary" type="button" title="Next ritual (Space, Enter or Right arrow)">Next ritual</button>
					</div>
					<div class="sn-hint">Space or → next · ← back · Esc return outside · drag to look</div>
				</div>
			</aside>`;
		const $ = (s) => root.querySelector(s);
		this.ui = { kicker: $(".sn-kicker"), title: $(".sn-title"), note: $(".sn-note"), mantra: $(".sn-mantra"), deva: $(".m-deva"), latin: $(".m-latin"), dots: $(".sn-dots"), back: $(".sn-back"), next: $(".sn-next"), panel: $(".sn-panel") };
		$(".sn-place-n").textContent = `${this.shrine.name} · ${this.shrine.deva}`;
		this.steps.forEach((s, i) => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "sn-dot";
			b.setAttribute("role", "tab");
			b.setAttribute("aria-label", `${i + 1}. ${s.title}`);
			b.title = s.title;
			b.addEventListener("click", () => this.go(i));
			this.ui.dots.appendChild(b);
		});
		$(".sn-exit").addEventListener("click", () => this.exit());
		this.ui.back.addEventListener("click", () => this.back());
		this.ui.next.addEventListener("click", () => this.next());
		// a drag on the scene looks around a little; nothing reaches main's handlers underneath
		const stop = (e) => e.stopPropagation();
		root.addEventListener("pointerdown", (e) => {
			stop(e);
			if (e.target.closest(".sn-panel, .sn-top")) return;
			this.drag.on = true;
			this.drag.x = e.clientX;
			this.drag.y = e.clientY;
			root.setPointerCapture(e.pointerId);
		});
		root.addEventListener("pointermove", (e) => {
			stop(e);
			if (!this.drag.on) return;
			this.drag.yaw = clamp(this.drag.yaw - (e.clientX - this.drag.x) * 0.004, -0.7, 0.7);
			this.drag.pitch = clamp(this.drag.pitch + (e.clientY - this.drag.y) * 0.003, -0.35, 0.35);
			this.drag.x = e.clientX;
			this.drag.y = e.clientY;
		});
		const up = (e) => {
			stop(e);
			this.drag.on = false;
		};
		root.addEventListener("pointerup", up);
		root.addEventListener("pointercancel", up);
		// zoom with the wheel or a pinch: a lens zoom, so the camera never passes through the sanctum walls
		this.zoom = this.zoom || 1;
		root.addEventListener("wheel", (e) => {
			stop(e);
			if (e.target.closest(".sn-panel")) return;
			this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), 0.6, 3.2);
		}, { passive: true });
		const touches = new Map();
		let pinch = 0;
		root.addEventListener("pointerdown", (e) => {
			touches.set(e.pointerId, [e.clientX, e.clientY]);
			if (touches.size === 2) {
				const [a, b] = [...touches.values()];
				pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
			}
		});
		root.addEventListener("pointermove", (e) => {
			if (!touches.has(e.pointerId)) return;
			touches.set(e.pointerId, [e.clientX, e.clientY]);
			if (touches.size === 2 && pinch > 0) {
				const [a, b] = [...touches.values()];
				const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
				this.zoom = clamp(this.zoom * (d / pinch), 0.6, 3.2);
				pinch = d;
				this.drag.on = false;
			}
		});
		const lift = (e) => {
			touches.delete(e.pointerId);
			pinch = 0;
		};
		root.addEventListener("pointerup", lift);
		root.addEventListener("pointercancel", lift);
		root.addEventListener("dblclick", stop);
		this.container.appendChild(root);
		this._frame();
	}
	_panel() {
		const s = this.steps[this.idx], u = this.ui, n = this.steps.length;
		u.kicker.textContent = `Ritual ${this.idx + 1} of ${n}`;
		u.title.textContent = s.title;
		u.note.textContent = s.note;
		u.mantra.hidden = !s.mantra;
		u.deva.textContent = s.mantra || "";
		u.latin.textContent = s.latin || "";
		[...u.dots.children].forEach((d, i) => {
			d.classList.toggle("done", i < this.idx);
			d.classList.toggle("cur", i === this.idx);
			d.setAttribute("aria-selected", i === this.idx ? "true" : "false");
		});
		u.back.disabled = this.idx === 0;
		u.next.textContent = this.idx === n - 1 ? "Return outside" : "Next ritual";
		this.root.querySelector(".sn-body").scrollTop = 0;
		this._frame();
	}
	// Keep the subject clear of the panel: on wide screens it sits at the right, on phones along the bottom.
	_frame() {
		const w = this.w, h = this.h, cam = this.camera;
		cam.aspect = w / h;
		this.portrait = w / h < 0.8;
		cam.fov = this.portrait ? 64 : 52;
		const r = this.ui && this.ui.panel.getBoundingClientRect();
		const vh = (cam.fov * Math.PI) / 360;
		let fx = 1, fy = 1;
		if (r && r.width) {
			if (w > 720) {
				const ox = Math.min(w * 0.22, (w - r.left) / 2);
				cam.setViewOffset(w, h, ox, 0, w, h);
				fx = (w - ox * 2) / w;
			} else {
				const oy = Math.min(h * 0.24, (h - r.top) / 2);
				cam.setViewOffset(w, h, 0, oy, w, h);
				fy = (h - oy * 2) / h;
			}
		} else cam.clearViewOffset();
		cam.updateProjectionMatrix();
		// the half-angle the free part of the view can hold, for framing
		this.halfV = Math.atan(Math.tan(vh) * fy);
		this.halfH = Math.atan(Math.tan(vh) * cam.aspect * fx);
	}
	_onKey(e) {
		if (!this.active) return;
		const k = e.key;
		if (k === "m" || k === "M") return;
		e.stopPropagation();
		if (e.type !== "keydown") return;
		const onButton = e.target && e.target.closest && this.root && this.root.contains(e.target) && e.target.closest("button");
		if (k === "Escape") {
			e.preventDefault();
			this.exit();
		} else if (k === "ArrowRight" || ((k === " " || k === "Enter") && !onButton)) {
			e.preventDefault();
			if (!e.repeat) this.next();
		} else if (k === "ArrowLeft") {
			e.preventDefault();
			if (!e.repeat) this.back();
		} else if (!onButton && (k === " " || k.startsWith("Arrow") || k === "PageUp" || k === "PageDown")) e.preventDefault();
	}
	_ghanti() {
		const a = this.audio;
		if (!a || !a.on || !a.ctx || !a.master) return;
		const c = a.ctx, t0 = c.currentTime;
		for (const [m, amp, d] of [[1, 0.09, 0.7], [2.71, 0.05, 0.4], [5.17, 0.025, 0.2]]) {
			const o = c.createOscillator();
			o.frequency.value = 1240 * m * (0.99 + Math.random() * 0.02);
			const gn = c.createGain();
			gn.gain.setValueAtTime(0, t0);
			gn.gain.linearRampToValueAtTime(amp, t0 + 0.004);
			gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
			o.connect(gn);
			gn.connect(a.master);
			o.start(t0);
			o.stop(t0 + d + 0.05);
		}
	}

	// ---------- per frame ----------
	update(dt, t) {
		if (!this.active || !this.scene) return;
		dt = Math.min(dt, 0.1);
		this.time += dt;
		this.st += dt;
		const S = this.S, L = this.L;
		S.T = { pose: STAND, x: S.T.x ?? L.start[0], z: S.T.z ?? L.start[1], face: undefined, arms: 1 };
		S.P = { pose: NAMASTE, x: S.P.x ?? L.priestHome[0], z: S.P.z ?? L.priestHome[1], face: L.priestFace };
		S.hold = { tR: null, tL: null, pR: null, pL: null };
		S.tilt = {};
		S.emit = [];
		S.steam = 0;
		S.camPush = 0;
		this.steps[this.idx].run(S, this.st);
		const snap = this.snap;
		this.trav.drive(S.T, dt, snap);
		this.priest.drive(S.P, dt, snap);
		if (this.auto && !this.leaving) this._autoStep(S, dt);
		this._props(S);
		this._effects(S, dt, this.time);
		this._camera(S, dt, this.time, snap);
		this.snap = false;
	}
	_autoStep(S, dt) {
		// how much the actors' targets moved this frame; a step is done once both have been still a while
		let d = Math.abs((S.T.x ?? 0) - (this._ax ?? 0)) + Math.abs((S.T.z ?? 0) - (this._az ?? 0));
		const pose = S.T.pose || {}, prev = this._ap || {};
		for (const k of KEYS) d += Math.abs((pose[k] ?? 0) - (prev[k] ?? 0));
		this._ax = S.T.x;
		this._az = S.T.z;
		this._ap = Object.assign({}, pose);
		this.quiet = d < 0.002 ? (this.quiet || 0) + dt : 0;
		const text = (this.steps[this.idx].note || "").length;
		const read = clamp(3 + text / 32, 5, 9);
		if ((this.st > read && this.quiet > 1.6) || this.st > 22) {
			this.quiet = 0;
			this.next();
		}
	}
	_props(S) {
		const P = this.props, F = this.flags, L = this.L;
		for (const n in P) P[n].o.visible = false;
		const v = V(), v2 = V();
		const place = (name, actor, hand) => {
			const p = P[name];
			if (!p) return;
			const J = actor.J;
			if (p.both) J.handL.getWorldPosition(v).add(J.handR.getWorldPosition(v2)).multiplyScalar(0.5);
			else J[hand].getWorldPosition(v);
			const yaw = actor.yaw, off = p.off || [0, 0, 0];
			p.o.position.set(v.x + Math.sin(yaw) * off[2] + Math.cos(yaw) * off[0], v.y + off[1], v.z + Math.cos(yaw) * off[2] - Math.sin(yaw) * off[0]);
			p.o.rotation.set(S.tilt[name] || 0, yaw, 0, "YXZ");
			p.o.visible = true;
			p.o.updateMatrixWorld(true);
		};
		const H = S.hold;
		if (H.tR === "staff") {
			this.trav.J.handR.getWorldPosition(v);
			P.staff.o.position.set(v.x, L.floor(v.x, v.z), v.z);
			P.staff.o.rotation.set(0.05, 0, 0);
			P.staff.o.visible = true;
		} else if (F.has("staffDown")) {
			P.staff.o.position.set(L.staffRest[0], L.floor(L.staffRest[0], L.staffRest[1]), L.staffRest[1]);
			P.staff.o.rotation.set(L.staffTilt[0], 0, L.staffTilt[1]);
			P.staff.o.visible = true;
		}
		if (F.has("barefoot")) {
			P.sandals.o.position.set(L.sandals[0], L.floor(L.sandals[0], L.sandals[1]), L.sandals[1]);
			P.sandals.o.rotation.y = 0.4;
			P.sandals.o.visible = true;
		}
		const tj = this.trav.J;
		for (const f of tj.feet) f.material = F.has("barefoot") ? tj.skinMat : tj.soleMat;
		if (H.tR && H.tR !== "staff") place(H.tR, this.trav, "handR");
		if (H.tL) place(H.tL, this.trav, "handL");
		if (H.pR) place(H.pR, this.priest, "handR");
		if (H.pL) place(H.pL, this.priest, "handL");
		if (H.pL === "shathari") {
			// held over the traveller's bowed head
			const tp = this.trav.J.head.getWorldPosition(v);
			const hp = this.priest.J.handL.getWorldPosition(v2);
			const k = clamp((this.st - 0) * 1, 0, 1);
			P.shathari.o.position.copy(hp.lerp(tp.add(V(0, 0.17, 0)), 0.85 * k));
			P.shathari.o.rotation.set(0, this.priest.yaw, 0);
		}
		if (P.aarti.light) P.aarti.light.intensity = P.aarti.o.visible ? (this.low ? 3 : 2.5) : 0;
		this.markT.visible = F.has("mark");
		if (this.ctx.offered) this.ctx.offered.visible = F.has("leaves");
	}
	_effects(S, dt, t) {
		const F = this.flags, ctx = this.ctx;
		for (const f of ctx.flames) {
			const n = Math.sin(t * 13 + f.seed) * 0.12 + Math.sin(t * 7.3 + f.seed * 2) * 0.09 + Math.sin(t * 23 + f.seed) * 0.05;
			f.f.scale.set(0.022 * f.s * (1 - n * 0.4), 0.05 * f.s * (1 + n), 1);
			f.h.material.opacity = 0.42 + n * 0.5;
		}
		for (const l of ctx.lights) {
			if (l.l.parent && l.l.parent.visible === false) continue;
			if (this.props && l.l === this.props.aarti.light) continue;
			const n = Math.sin(t * 9 + l.seed) * 0.06 + Math.sin(t * 15.7 + l.seed * 3) * 0.04 + Math.sin(t * 3.1 + l.seed) * 0.05;
			l.l.intensity = l.base * (1 + n);
		}
		for (const b of ctx.bells) {
			b.v += (-b.a * 18 - b.v * 1.3) * dt;
			b.a += b.v * dt;
			b.pivot.rotation.x = b.a * 0.35;
			b.pivot.rotation.z = b.a * 0.12;
		}
		// wet stone shines; ghee darkens and warms the rock
		const wet = F.has("wet") ? 1 : 0;
		for (const m of ctx.wetMats || []) {
			m.userData.w = (m.userData.w ?? 0) + (wet - (m.userData.w ?? 0)) * Math.min(1, dt * 1.5);
			const base = m === ctx.gheeMat ? 0.78 : 0.4;
			m.roughness = lerp(base, 0.12, m.userData.w);
		}
		if (ctx.gheeMat) {
			const gh = F.has("ghee") ? 1 : 0;
			ctx.gheeMat.userData.g = (ctx.gheeMat.userData.g ?? 0) + (gh - (ctx.gheeMat.userData.g ?? 0)) * Math.min(1, dt);
			ctx.gheeMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.85, 0.72, 0.5), ctx.gheeMat.userData.g * 0.6);
			ctx.gheeMat.roughness = Math.min(ctx.gheeMat.roughness, lerp(0.78, 0.18, ctx.gheeMat.userData.g));
		}
		if (ctx.pool) ctx.pool.material.opacity = lerp(ctx.pool.material.opacity, wet * 0.75, Math.min(1, dt));
		if (ctx.sparkle) ctx.sparkle.material.opacity = 0.35 + Math.sin(t * 2.3) * 0.2 + Math.sin(t * 7.1) * 0.1;
		// incense smoke rising and spreading
		const src = ctx.smokeFrom;
		if (src.length)
			for (const s of this.smoke) {
				const u = s.userData;
				u.life += dt;
				if (u.life < 0) {
					s.material.opacity = 0;
					continue;
				}
				if (u.life > 6.5 || !u.p) {
					u.life = Math.random() * 0.3;
					u.p = src[Math.floor(Math.random() * src.length)].clone();
					u.seed = Math.random() * 10;
				}
				const k = u.life / 6.5;
				s.position.set(u.p.x + Math.sin(u.life * 0.9 + u.seed) * 0.08 * k * 3, u.p.y + u.life * 0.22, u.p.z + Math.cos(u.life * 0.7 + u.seed) * 0.08 * k * 3);
				s.scale.setScalar(0.08 + k * 0.8);
				s.material.opacity = Math.min(1, u.life * 2) * (1 - k) * 0.22;
				s.material.rotation = u.seed + u.life * 0.2;
			}
		for (const s of this.steam) {
			const u = s.userData;
			u.life += dt;
			if (u.life > 5 || !u.p) {
				u.life = Math.random() * 0.2;
				u.p = V(this.L.start[0] + (Math.random() - 0.5) * 2.4, 0.1, this.L.start[1] - 1.2 + (Math.random() - 0.5) * 1.6);
			}
			const k = u.life / 5;
			s.position.set(u.p.x + Math.sin(u.life) * 0.2, u.p.y + u.life * 0.4, u.p.z);
			s.scale.setScalar(0.4 + k * 1.6);
			s.material.opacity = S.steam * Math.min(1, u.life * 2) * (1 - k) * 0.35;
		}
		// drops: water, ghee, theertham and coins
		const pos = this.drops.geometry.attributes.position, col = this.drops.geometry.attributes.color;
		const N = this.dropK.length;
		const c = new THREE.Color();
		for (const e of S.emit) {
			const from = e.from();
			const vel = typeof e.v === "function" ? e.v() : e.v;
			c.set(e.color);
			this.emitAcc += e.rate * dt;
			while (this.emitAcc >= 1) {
				this.emitAcc -= 1;
				const i = this.dropN++ % N;
				const r = e.spread || 0;
				pos.setXYZ(i, from.x + (Math.random() - 0.5) * r, from.y + (Math.random() - 0.5) * r, from.z + (Math.random() - 0.5) * r);
				this.dropV[i * 3] = vel[0] + (Math.random() - 0.5) * 0.03;
				this.dropV[i * 3 + 1] = vel[1];
				this.dropV[i * 3 + 2] = vel[2] + (Math.random() - 0.5) * 0.03;
				this.dropK[i] = e.kill ?? -50;
				col.setXYZ(i, c.r, c.g, c.b);
			}
			this.drops.material.size = e.size || 0.014;
		}
		for (let i = 0; i < N; i++) {
			if (this.dropK[i] === -999) continue;
			this.dropV[i * 3 + 1] -= 9.8 * dt;
			const y = pos.getY(i) + this.dropV[i * 3 + 1] * dt;
			if (y < this.dropK[i]) {
				pos.setXYZ(i, 0, -999, 0);
				this.dropK[i] = -999;
				continue;
			}
			pos.setXYZ(i, pos.getX(i) + this.dropV[i * 3] * dt, y, pos.getZ(i) + this.dropV[i * 3 + 2] * dt);
		}
		pos.needsUpdate = true;
		col.needsUpdate = true;
	}
	_camera(S, dt, t, snap) {
		const c = S.cam;
		const p = V(), l = V(), v1 = V();
		if (c.fit) {
			// frame the named subjects from a chosen direction, as close as the view allows, inside the room
			const L = this.L, b = new THREE.Box3();
			for (const f of c.fit) {
				if (f === "T" || f === "P") {
					const a = f === "T" ? this.trav : this.priest;
					b.expandByPoint(v1.set(a.pos.x, a.y + 0.05, a.pos.z)).expandByPoint(v1.set(a.pos.x, a.y + 1.6 + (a.cur.bob || 0), a.pos.z));
				} else if (f === "D") for (const q of L.deityPts) b.expandByPoint(v1.set(...q));
				else b.expandByPoint(v1.set(...L.pts[f]));
			}
			b.expandByScalar(0.2);
			const ctr = b.getCenter(V());
			const az = (c.dir[0] * Math.PI) / 180, el = (c.dir[1] * Math.PI) / 180;
			const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
			// the distance at which every corner of the subjects' box fits the free part of the view
			const right = V().crossVectors(dir, V(0, 1, 0)).normalize(), up = V().crossVectors(right, dir);
			const pad = (this.portrait ? c.padP ?? c.pad : c.pad) ?? 1;
			const th = Math.tan(this.halfH) / pad / 1.1, tv = Math.tan(this.halfV) / pad / 1.1;
			let dist = 0;
			for (let i = 0; i < 8; i++) {
				v1.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(ctr);
				const dd = v1.dot(dir);
				dist = Math.max(dist, dd + Math.abs(v1.dot(right)) / th, dd + Math.abs(v1.dot(up)) / tv);
			}
			const box = c.room || L.rooms.find((r) => ctr.x >= r[0] && ctr.x <= r[1] && ctr.z >= r[4] && ctr.z <= r[5]) || L.rooms[0];
			for (const [i, lo, hi] of [[0, box[0], box[1]], [1, box[2], box[3]], [2, box[4], box[5]]]) {
				const o = ctr.getComponent(i), d = dir.getComponent(i);
				if (d > 1e-4) dist = Math.min(dist, (hi - o) / d);
				else if (d < -1e-4) dist = Math.min(dist, (lo - o) / d);
			}
			p.copy(ctr).addScaledVector(dir, Math.max(0.6, dist));
			l.copy(ctr);
			l.y -= 0.05;
		} else if (c.orbit) {
			// trail the traveller: behind, a little outside the circuit and to one side
			const a = this.trav.pos, yaw = this.trav.yaw;
			const fx = Math.sin(yaw), fz = Math.cos(yaw);
			let ox = a.x - c.orbit[0], oz = a.z - c.orbit[1];
			const ol = Math.hypot(ox, oz) || 1;
			ox /= ol;
			oz /= ol;
			p.set(a.x - fx * c.back + ox * c.out - fz * c.side, this.trav.y + c.h, a.z - fz * c.back + oz * c.out + fx * c.side);
			l.set(a.x + fx * c.ahead, this.trav.y + c.lookH, a.z + fz * c.ahead);
		} else {
			p.set(...c.p);
			l.set(...c.l);
		}
		if (S.camPush) p.lerp(l, S.camPush);
		// gentle breathing drift, the visitor's drag, and a step back on tall phone screens
		p.x += Math.sin(t * 0.21) * 0.05;
		p.y += Math.sin(t * 0.17) * 0.03;
		p.z += Math.cos(t * 0.19) * 0.05;
		const d = p.clone().sub(l);
		if (this.portrait && !c.fit) d.multiplyScalar(1.3);
		d.applyAxisAngle(V(0, 1, 0), this.drag.yaw);
		d.y += this.drag.pitch * d.length();
		p.copy(l).add(d);
		const k = snap ? 1 : 1 - Math.exp(-dt * 1.6);
		this.camP.lerp(p, k);
		this.camL.lerp(l, k);
		this.camera.position.copy(this.camP);
		this.camera.lookAt(this.camL);
		const z = this.zoom || 1;
		if (Math.abs(this.camera.zoom - z) > 1e-3) {
			this.camera.zoom += (z - this.camera.zoom) * Math.min(1, dt * 8);
			this.camera.updateProjectionMatrix();
		}
	}
	render() {
		if (!this.active || !this.scene) return;
		const r = this.renderer;
		const prev = { tm: r.toneMapping, ex: r.toneMappingExposure, sh: r.shadowMap.enabled, ac: r.autoClear, ca: r.getClearAlpha() };
		r.getClearColor(this._cc);
		r.toneMapping = THREE.ACESFilmicToneMapping;
		r.toneMappingExposure = { kedarnath: 1.3, badrinath: 1.05, tirupati: 1.3 }[this.key] ?? 1.35;
		r.shadowMap.enabled = !this.low;
		r.autoClear = true;
		r.setClearColor(0x060403, 1);
		r.render(this.scene, this.camera);
		r.toneMapping = prev.tm;
		r.toneMappingExposure = prev.ex;
		r.shadowMap.enabled = prev.sh;
		r.autoClear = prev.ac;
		r.setClearColor(this._cc, prev.ca);
	}
	_teardown() {
		window.removeEventListener("keydown", this._onKey, true);
		window.removeEventListener("keyup", this._onKey, true);
		document.body.classList.remove("sanctum-open");
		if (this.root) this.root.remove();
		this.root = null;
		this.ui = null;
		if (this.scene) {
			const mats = new Set(), geos = new Set();
			this.scene.traverse((o) => {
				if (o.geometry && !o.isSprite) geos.add(o.geometry);
				if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
				if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
			});
			// feet swap materials, so dispose both
			if (this.trav) mats.add(this.trav.J.skinMat).add(this.trav.J.soleMat);
			for (const g of geos) g.dispose();
			for (const m of mats) {
				if (KEEP.has(m)) continue;
				for (const k of ["map", "bumpMap", "roughnessMap", "normalMap", "emissiveMap", "alphaMap"]) if (m[k] && !KEEP.has(m[k])) m[k].dispose();
				m.dispose();
			}
			if (this.envRT) this.envRT.dispose();
			this.envRT = this.env = null;
		}
		this.scene = null;
		this.ctx = null;
		this.trav = this.priest = null;
		this.active = false;
		this.leaving = false;
	}
}
