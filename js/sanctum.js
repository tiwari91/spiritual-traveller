// Inside the temple: an interior for each of the five shrines, where the traveller performs that shrine's
// rituals one step at a time with a pujari. Self-contained: its own scene, camera, lights and DOM panel.
//
// API
//   import { Sanctum } from "./sanctum.js";
//   const sanctum = new Sanctum({ renderer, container: document.body, audio, low: false, onExit, onStep });
//   sanctum.enter(key)       key is a SHRINES key: "bhimashankar", "shirdi", "tirupati", "kedarnath" or "badrinath".
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
import { body, pose, SKIN, crowdFigure, stride, reach, own, RIGHT, LEFT } from "./pilgrim.js";
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
	udi(g, W, H) {
		// a pinch of grey ash pressed on with the thumb
		const gr = g.createRadialGradient(W / 2, H * 0.36, 1, W / 2, H * 0.36, W * 0.07);
		gr.addColorStop(0, "rgba(150,146,140,0.95)");
		gr.addColorStop(0.7, "rgba(165,160,152,0.8)");
		gr.addColorStop(1, "rgba(170,165,158,0)");
		g.fillStyle = gr;
		g.beginPath();
		g.ellipse(W / 2, H * 0.36, W * 0.07, H * 0.11, 0, 0, Math.PI * 2);
		g.fill();
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
	const J = body({ skin: SENT.skin, top: SENT.top, bottom: SENT.bottom, sash: SENT.sash, headColor: SENT.head, head: opts.head ?? "hair", sari: opts.sari, beard: opts.beard, pujari: opts.pujari, dhoti: opts.dhoti, mark: opts.mark, janeu: opts.janeu });
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
// A living figure in body()'s own materials: the skin with its painted eyes, lips and brows, and woven cloth.
function person(opts) {
	const J = body(opts);
	J.feet = [];
	J.root.traverse((o) => o.isMesh && o.material.color && o.material.color.getHex() === SOLE && J.feet.push(o));
	return J;
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
// abs: 1 when the pose's bob and shift were worked out from where the feet touch the floor (the moves below);
// otherwise the actor stands its feet on the floor itself (with or without sandals).
const KEYS = ["hipL", "hipR", "hipLy", "hipRy", "hipLz", "hipRz", "kneeL", "kneeR", "footL", "footR", "shL", "shLy", "shLz", "shR", "shRy", "shRz", "elL", "elLy", "elR", "elRy", "lean", "twist", "tilt", "nod", "look", "headTilt", "bob", "shift", "pelvisX", "abs"];
const ARMS = new Set(["shL", "shLy", "shLz", "shR", "shRy", "shRz", "elL", "elLy", "elR", "elRy"]);
const BASE = { shLz: -0.06, shRz: 0.06, nod: 0.05 };
// Ritual poses. Positive lean is forward; negative sh raises the arm forward; negative elbow bends it up.
// The skeleton names its arms as seen from in front ("L" is the figure's own right), so the poses of the ritual
// acts below are written in the figure's own terms, "R" for its right hand, and passed through own(). The hold
// slots are in its own terms too: tR and pR are the traveller's and the pujari's right hands.
const STAND = { shL: 0.04, shR: 0.04, shLz: -0.07, shRz: 0.07, elL: -0.12, elR: -0.12, kneeL: 0.03, kneeR: 0.03, nod: 0.06 };
const NAMASTE = { shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, shR: -0.55, shRz: -0.25, shRy: -0.5, elR: -1.55, nod: 0.18, kneeL: 0.03, kneeR: 0.03 };
const BOWED = Object.assign({}, NAMASTE, { lean: 0.22, nod: 0.4 });
// The staff in the left hand: the skeleton's "R" arm is the figure's own left (see own() in pilgrim.js).
const STAFF = { shR: -0.32, shRz: 0.08, elR: -0.5 };
const P = (...a) => Object.assign({}, ...a);
// Only the arms (and the nod) of a pose, to lay over kneeling or sitting legs.
const HANDS = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => ARMS.has(k) || k === "nod"));
const NA = HANDS(NAMASTE);
// Both palms turned up, the forearms rolled out: the right hand to receive, the left beneath it (own terms).
const PALMS_UP = { elRy: 1.5, elLy: -1.5 };

// ---------- whole-body moves, worked out from where the toes, knees and seat touch the floor ----------
// In the body's own frame: z forward from the spot where the feet stood, y up from the floor. The traveller is
// barefoot inside, so the foot's sole is its skin.
const THIGH = 0.46, SHIN = 0.4, ARM = 0.62;
const KNEE_Y = 0.1; // the knee's height when kneeling, on the dhoti folded under it
const TOE = [-0.076, 0.19]; // the tip of the big toe, in the ankle's frame (y, z)
const TOE_A = 1.25; // the foot's pitch standing on tucked toes
const PRONE_Y = 0.14; // the hips' height lying face down
const dirA = (dz, dy) => Math.atan2(-dz, -dy); // a direction's angle from straight down, positive backwards
const sst = (a, b, x) => ease((x - a) / (b - a));
// The ankle (z, y) of a foot pitched a whose toe tip rests on the floor at tz.
function onToe(tz, a) {
	const c = Math.cos(a), s = Math.sin(a);
	return [tz - (TOE[0] * s + TOE[1] * c), -(TOE[0] * c - TOE[1] * s)];
}
// Leg angles for hips, knee and ankle at the given points; the pelvis pitched forward by px.
function legs(h, k, a, foot, px = 0) {
	const th = dirA(k[0] - h[0], k[1] - h[1]), sh = dirA(a[0] - k[0], a[1] - k[1]);
	return { hipL: th - px, hipR: th - px, kneeL: sh - th, kneeR: sh - th, footL: foot, footR: foot, bob: h[1] - 0.95, shift: h[0], pelvisX: px, abs: 1 };
}
// The knee for hips h and ankle a (bending forward).
function kneeFor(h, a) {
	const dz = a[0] - h[0], dy = a[1] - h[1], D = clamp(Math.hypot(dz, dy), 0.07, THIGH + SHIN - 1e-4);
	const al = Math.acos(clamp((THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D), -1, 1));
	const t = dirA(dz, dy) - al;
	return [h[0] - THIGH * Math.sin(t), h[1] - THIGH * Math.cos(t)];
}
const TOE_Z = 0.19; // standing flat, the toes' tip is this far ahead of the ankle
const KNEEL_END = (() => {
	const a = onToe(TOE_Z, TOE_A);
	const phi = Math.acos(clamp((KNEE_Y - a[1]) / SHIN, -1, 1));
	return { a, k: [a[0] + SHIN * Math.sin(phi), KNEE_Y], phi };
})();
// Standing (f = 0) to kneeling upright (f = 1) with the toes planted: the heels lift, the knees swing forward
// and down round the ankles while the hips sink behind them, then come forward over the knees.
function kneelDown(f) {
	f = clamp(f, 0, 1);
	const fa = sst(0.1, 0.6, f), a = TOE_A * fa;
	const an = onToe(TOE_Z, a);
	const phi = KNEEL_END.phi * ease(f);
	const k = [an[0] + SHIN * Math.sin(phi), an[1] + SHIN * Math.cos(phi)];
	const psi = 0.8 * Math.sin(Math.PI * f) ** 1.3;
	const h = [k[0] - THIGH * Math.sin(psi), k[1] + THIGH * Math.cos(psi)];
	return Object.assign(legs(h, k, an, a), { lean: 0.45 * psi });
}
const KNEEL = kneelDown(1);
// Kneeling upright (f = 0) to lying face down (f = 1), the knees and toes where they are: the body bends
// forward and the hands go down to the floor ahead; then the hips go forward and down, the hands slide on
// until the arms lie stretched out beyond the head. Returns the pose and the hands' targets (body frame).
function prostrate(f) {
	f = clamp(f, 0, 1);
	const { a: an, k } = KNEEL_END;
	const a1 = sst(0, 0.4, f), b = sst(0.32, 1, f);
	const psiE = Math.acos((PRONE_Y - KNEE_Y) / THIGH), psi = psiE * b;
	const h = [k[0] + THIGH * Math.sin(psi), k[1] + THIGH * Math.cos(psi)];
	const px = (Math.PI / 2 - 0.035) * b;
	const tau = lerp(1.42 * a1, Math.PI / 2 - 0.035, b);
	const p = legs(h, k, an, TOE_A, px);
	p.lean = tau - px;
	p.nod = lerp(0.18 + 0.25 * a1, 0.34, b);
	const s = [h[0] + 0.47 * Math.sin(tau), h[1] + 0.47 * Math.cos(tau)];
	const hz = lerp(k[0] + 0.48, s[0] + ARM + 0.03, b);
	const w = sst(0.06, 0.32, f);
	return { pose: p, hands: { L: { p: [-0.055, 0.045, hz], w, local: true }, R: { p: [0.055, 0.045, hz], w, local: true } } };
}
// A leg's hip (pitch, turn, swing out) and knee angles that put its knee and ankle at K and A (hips frame, the
// hip joint at x = side * 0.095), and the ankle's bend that lays the foot flattest above the floor at floorY.
function legIK(side, K, A, floorY) {
	const H = V(side * 0.095, 0, 0), q = new THREE.Quaternion(), e = new THREE.Euler(), v = V(), w = V();
	const fk = (x) => {
		q.setFromEuler(e.set(x[0], x[1], x[2]));
		const k = v.set(0, -THIGH, 0).applyQuaternion(q).add(H).clone();
		q.multiply(new THREE.Quaternion().setFromEuler(e.set(x[3], 0, 0)));
		return [k, w.set(0, -SHIN, 0).applyQuaternion(q).add(k).clone(), q.clone()];
	};
	const cost = (x) => {
		const [k, a] = fk(x);
		return k.distanceToSquared(K) + a.distanceToSquared(A);
	};
	let x = [-1.3, 0, side * -0.6, 2.2];
	for (let it = 0; it < 400; it++) {
		const c0 = cost(x), g = [0, 0, 0, 0];
		for (let i = 0; i < 4; i++) {
			const y = x.slice();
			y[i] += 1e-4;
			g[i] = (cost(y) - c0) / 1e-4;
		}
		let st = 0.5;
		while (st > 1e-5) {
			const y = x.map((xi, i) => xi - g[i] * st);
			if (cost(y) < c0) {
				x = y;
				break;
			}
			st *= 0.5;
		}
	}
	const [, a, qs] = fk(x);
	// the foot: the bend that keeps its heel and toes nearest level, above the floor
	let best = 0, bc = 1e9;
	for (let b = -1.2; b <= 1.2; b += 0.02) {
		const qf = qs.clone().multiply(new THREE.Quaternion().setFromEuler(e.set(b, 0, 0)));
		const heel = V(0, -0.066, -0.06).applyQuaternion(qf).add(a), toe = V(0, -0.062, 0.18).applyQuaternion(qf).add(a);
		const c = Math.abs(heel.y - toe.y) + 4 * Math.max(0, floorY - Math.min(heel.y, toe.y));
		if (c < bc) (bc = c), (best = b);
	}
	return { hip: x[0], hipy: x[1], hipz: x[2], knee: x[3], ankle: best };
}
// Standing (f = 0) to sitting cross-legged (f = 1): a flat-footed squat, the seat lowered just behind the heels,
// then the legs folded and crossed, each foot under the other knee. SIT_BACK: how far behind the feet the seat
// comes down.
const SIT_Y = 0.2, SIT_BACK = 0.16;
const SIT = (() => {
	const o = { bob: SIT_Y - 0.95, shift: -SIT_BACK, lean: 0.12, abs: 1 };
	for (const [S, side, fz, fy] of [["L", -1, 0.33, -0.105], ["R", 1, 0.2, -0.09]]) {
		const H = V(side * 0.095, 0, 0), K = V(side * 0.245, -0.075, 0.3).normalize().multiplyScalar(THIGH).add(H);
		const r = legIK(side, K, V(-side * 0.015 + 0.0, fy, fz), -SIT_Y + 0.005);
		o["hip" + S] = r.hip;
		o["hip" + S + "y"] = r.hipy;
		o["hip" + S + "z"] = r.hipz;
		o["knee" + S] = r.knee;
		// footL is the foot's pitch to the ground: the ankle's bend plus the leg's pitch
		o["foot" + S] = r.ankle + r.hip + r.knee;
	}
	return o;
})();
function sitDown(f) {
	f = clamp(f, 0, 1);
	const s = sst(0, 0.62, f), an = [0, -TOE[0]];
	const h = [-SIT_BACK * s, lerp(an[1] + 0.86, SIT_Y + 0.13, s)];
	const squat = Object.assign(legs(h, kneeFor(h, an), an, 0), { lean: 0.5 * Math.sin(Math.PI * s * 0.9) });
	return f <= 0.62 ? squat : mix(squat, SIT, sst(0.62, 1, f));
}
// Up on the toes (k = 0 flat, 1 high), to reach something overhead.
function tiptoe(k) {
	const a = 0.55 * k, an = onToe(TOE_Z, a);
	const h = [an[0], an[1] + THIGH + SHIN - 0.004];
	return legs(h, kneeFor(h, an), an, a);
}

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
// The legs from the shared stride (feet on the ground, heel strike and toe-off), arms swinging against them.
function gait(ph) {
	const L = stride(ph), d = L.hipR - L.hipL;
	return Object.assign(L, {
		hipLz: 0, hipRz: 0, shL: -(L.hipL + 0.06) * 0.7, shR: -(L.hipR + 0.06) * 0.7, shLz: -0.08, shRz: 0.08, shLy: 0, shRy: 0, elL: -0.25 + Math.min(0, L.hipL) * 0.3, elR: -0.25 + Math.min(0, L.hipR) * 0.3, elLy: 0, elRy: 0,
		lean: 0.07, twist: d * 0.06, tilt: 0, nod: 0.07, look: 0, headTilt: 0, shift: 0, pelvisX: 0, abs: 1,
	});
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
		this.bare = false;
		this.rw = { L: 0, R: 0 };
		this.rp = { L: V(), R: V() };
		this.rset = { L: false, R: false };
	}
	// T: { pose, x, z, face, arms, rate, noTurn, reach: { L, R: { p: [x, y, z] (world, or the body's frame with
	// local), w, pt (the point of the hand, default the palm) } } }
	drive(T, dt, snap) {
		const k = snap ? 1 : 1 - Math.exp(-dt * (T.rate ?? 5));
		this.J.cupped = !!T.cupped;
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
		for (const key of KEYS) p[key] = lerp(this.cur[key], g[key] ?? BASE[key] ?? 0, this.w * (ARMS.has(key) ? aw : 1));
		// stand the feet on the floor: the stride assumes sandals, the still poses neither
		const sole = this.bare ? 0.066 : 0.078;
		p.bob += (1 - this.w) * (1 - this.cur.abs) * (sole - 0.09) + this.w * (sole - 0.078);
		this.root.position.set(this.pos.x, this.y, this.pos.z);
		this.root.rotation.y = this.yaw;
		pose(this.J, p);
		if (this.cur.abs < 0.5 || this.w > 0.5) this.feetOnFloor(p);
		// hands that reach for things
		const R = T.reach || {};
		if (R.L || R.R || this.rw.L > 1e-3 || this.rw.R > 1e-3) {
			this.root.updateMatrixWorld(true);
			let moved = false;
			for (const S of ["L", "R"]) {
				const r = R[S];
				this.rw[S] += ((r ? r.w ?? 1 : 0) - this.rw[S]) * (snap ? 1 : 1 - Math.exp(-dt * (r && r.rate ? r.rate : 6)));
				if (r) {
					const q = typeof r.p === "function" ? r.p() : r.p;
					const tg = q.isVector3 ? q.clone() : V(q[0], q[1], q[2]);
					if (r.local) this.root.localToWorld(tg);
					if (!this.rset[S] || snap) this.rp[S].copy(tg);
					else this.rp[S].lerp(tg, 1 - Math.exp(-dt * 14));
					this.rset[S] = true;
					this.rpt = this.rpt || {};
					this.rpt[S] = r.pt;
				}
				if (this.rw[S] < 1e-3) {
					this.rset[S] = false;
					continue;
				}
				const s = reach(this.J, S, this.rp[S], p, this.rpt && this.rpt[S]);
				const w = this.rw[S];
				p["sh" + S] = lerp(p["sh" + S], s.sh, w);
				p["sh" + S + "z"] = lerp(p["sh" + S + "z"], s.shz, w);
				p["el" + S] = lerp(p["el" + S], s.el, w);
				moved = true;
			}
			if (moved) pose(this.J, p);
		}
		this.p = p;
		this.root.updateMatrixWorld(true);
	}
	// On steps a stride or a stance meant for flat ground puts a foot into the stair: bend that leg to stand the
	// foot on its tread instead.
	feetOnFloor(p) {
		const J = this.J;
		this.root.updateMatrixWorld(true);
		let moved = false;
		for (const S of ["L", "R"]) {
			const an = J["ankle" + S];
			let pen = 0;
			for (const z of [-0.06, 0.06, 0.18]) {
				const q = an.localToWorld(V(0, -0.066, z));
				pen = Math.max(pen, this.floor(q.x, q.z) - q.y);
			}
			if (pen < 0.004) continue;
			const a = this.root.worldToLocal(an.getWorldPosition(V()));
			const h = [p.shift, 0.95 + p.bob];
			const tgt = [a.z, a.y + pen];
			const k = kneeFor(h, tgt);
			const th = dirA(k[0] - h[0], k[1] - h[1]), sh = dirA(tgt[0] - k[0], tgt[1] - k[1]);
			p["hip" + S] = th - (p.pelvisX || 0);
			p["knee" + S] = Math.max(0, sh - th);
			moved = true;
		}
		if (moved) pose(J, p);
	}
}

// ---------- lamps, bells, props ----------
class Kit {
	constructor(ctx) {
		this.c = ctx;
	}
	flame(parent, x, y, z, s = 1, halo = 1) {
		const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAME_TEX(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
		f.center.set(0.5, 0.08);
		f.position.set(x, y, z);
		f.scale.set(0.022 * s, 0.05 * s, 1);
		const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff9a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
		h.position.set(x, y + 0.02 * s, z);
		h.scale.setScalar(0.22 * s * halo);
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
		const b = { pivot, a: 0, v: 0, pos: V(x, y - chain - 0.18 * s, z), chain, s };
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
	// small wicks with a soft glow: the lamp is brought close to faces
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2;
		K.flame(aarti, Math.cos(a) * 0.055, 0.025, Math.sin(a) * 0.055, 0.95, 0.5);
	}
	K.flame(aarti, 0, 0.03, 0, 1.05, 0.55);
	const al = K.light(0, 0.12, 0, ctx.low ? 2.2 : 1.8, 4, 0xffa040, aarti);
	add("aarti", aarti, { off: [0, 0.1, 0.03], light: al });
	const ghanti = new THREE.Group();
	mesh(lathe([[0, 0.09], [0.02, 0.09], [0.03, 0.06], [0.035, 0.02], [0.045, 0], [0, 0.0]], 14), M.brass, 0, -0.09, 0, ghanti);
	mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.07, 6), M.brass, 0, 0.03, 0, ghanti);
	add("ghanti", ghanti, { off: [0, 0.02, 0.02] });
	const thali = new THREE.Group();
	mesh(lathe([[0, 0], [0.13, 0.004], [0.14, 0.02], [0.125, 0.018], [0, 0.008]], 24), M.brass, 0, 0, 0, thali);
	heap(thali, [[new THREE.SphereGeometry(0.007, 5, 4), std(0xd9a21e, { roughness: 0.7 }), 0.5], [new THREE.BoxGeometry(0.012, 0.01, 0.012), std(0xf4f0e8, { roughness: 0.3 }), 0.3], [leafGeo().scale(0.6, 0.6, 0.6), M.tulsi, 0.4]], 40, domeSampler(0, 0.012, 0, 0.09, 0.025), 5);
	add("thali", thali, { off: [0, 0.03, 0.1], both: true });
	// a plate of flowers with a folded chadar for the samadhi
	const chadar = new THREE.Group();
	mesh(lathe([[0, 0], [0.13, 0.004], [0.14, 0.02], [0.125, 0.018], [0, 0.008]], 24), M.brass, 0, 0, 0, chadar);
	mesh(new THREE.BoxGeometry(0.17, 0.035, 0.11), std(0x1f6a3a, { roughness: 0.75 }), 0, 0.028, -0.03, chadar);
	for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.018, 0.037, 0.112), M.gold, sx * 0.07, 0.028, -0.03, chadar);
	heap(chadar, flowerKinds(M, false), 26, (R) => V((R() - 0.5) * 0.18, 0.05 + R() * 0.01, 0.05 + (R() - 0.5) * 0.06), 6);
	add("chadar", chadar, { off: [0, 0.03, 0.1], both: true });
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
	add("laddu", laddu, { off: [0, 0.045, 0], palm: true });
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

// ---------- the interiors ----------
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
	// a floor lamp by the steps, lighting the corner where pilgrims prostrate
	kit.diya(g, 2.05, -1, 0.75);
	kit.light(1.95, -0.55, 0.85, 3.2, 4.5);
	kit.incense(g, -1.9, -1, -2.1);
	kit.hanging(g, -2.0, 3.6, 5.6, 1.1);
	kit.hanging(g, 2.0, 3.6, 5.6, 1.1);
	kit.light(0, 2.4, 5.6, 9, 10);
	kit.light(-2.0, 2.3, 8.2, 4, 6);
	// the bell at the head of the steps, garlands over the door
	kit.bell(g, 0.32, 2.75, 3.1, 1.3, 0.45);
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
		// pour: where the feet stand before sitting down to pour (the seat comes down behind them)
		pour: [0, 0.4], pourTop: L0.y + 0.34, offerAt: [0, 0.82], surf: () => V(0, L0.y + 0.34, L0.z),
		priestHome: [-1.65, 0.55], priestFace: [0, -0.3], priestAarti: [-0.2, 0.42], aartiSpot: [0.6, 1.05],
		markSpot: [0.15, 0.95], priestMarkSpot: [-0.55, 0.56],
		circuit: arc(0, -0.3, 1.12, 1.12, 0, -Math.PI * 1.5 + 0.38), circuitBack: true,
		// the prostration lies along a line from the Lord, clear of the steps, the spout and the incense
		bowPath: [[0, 0.82], [1.0, 0.95], [1.53, 1.89]],
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
			bow: F(["T", "D"], 118, 16),
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
	daylight(ctx, 0, 1.4, 12.8, 5, 3.6, "snow", 16, [0, 0, 7]);
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
	kit.bell(g, 0.45, 2.85, 3.5, 1.1, 0.5);
	kit.bell(g, -0.45, 2.85, 3.5, 1.1, 0.5);
	kit.bell(g, 0, 3.05, 3.55, 0.8, 0.15);
	garland(g, V(-0.85, 2.5, 3.45), V(0.85, 2.5, 3.45), 0.3, 0.03, M.marigold, M.rose);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 0.84, 2.45, 3.45, 1.0, M.marigold, M.rose);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, -0.5, 0, 11.78, g);
	// points on the rock's face, for hands and the lota
	const rcast = new THREE.Raycaster(), surfAt = new Map();
	const surf = (x, y, off = 0) => {
		const k = `${x.toFixed(3)},${y.toFixed(3)},${off}`;
		if (!surfAt.has(k)) {
			rcast.set(V(C0.x + x, y, 3), V(0, 0, -1));
			const h = rcast.intersectObject(rock)[0];
			surfAt.set(k, h ? h.point.clone().add(V(0, 0, off)) : V(C0.x + x, y, C0.z + 0.2));
		}
		return surfAt.get(k).clone();
	};
	common(ctx, 4.1);
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-2.5, 2.5, 0.15, 3.2, -2.6, 2.7], [-2.95, 2.95, 0.15, 3.85, 3.5, 10.5], [-2.9, 2.9, 0.15, 3.6, 11.2, 12.6]],
		deityPts: [[0, 0, -0.4], [0, 1.1, -0.4], [-1.0, 0.3, -0.4], [1.0, 0.3, -0.4]], pts: { wash: [-0.5, 0.3, 11.78], bell: [0.45, 2.3, 3.5], nandi: [0, 0.9, 7.4], niche: [2.7, 1.6, 6.4] },
		// the brass threshold strip in the sanctum door is a step up
		floor: (x, z) => (Math.abs(x) < 0.7 && z > 2.9 && z < 3.32 ? 0.06 : 0), shiva: true, mark: "tripundra", priestMark: "tripundra", ghee: true,
		// sandals, staff and the washing all on the porch, outside the door
		start: [1.2, 12.5], enterPath: [[1.2, 12.5], [0.2, 11.62]], staffRest: [0.97, 11.2], staffTilt: [-0.07, 0], sandals: [0.42, 11.42], washFace: [-0.5, 11.78],
		nandiPath: [[0.2, 11.62], [0.3, 10.4], [1.05, 8.8], [0.62, 6.42]], nandiEar: [0.15, 7.0],
		bellSpot: [0.3, 3.85], bellFace: Math.PI, bellPath: [[0.55, 6.6], [0.9, 5.4], [0.3, 3.85]],
		toFront: [[0.3, 3.85], [0, 3.0], [0, 1.65]], front: [0, 1.65], target: [0, -0.4],
		pour: [0, 0.82], pourTop: 0.32, pourAt: surf(0, 0.86, 0.05).add(V(0, 0.2, 0)).toArray(), pourKill: surf(0, 0.86).y, surf, hugLean: 0.78,
		// embrace: where the feet stand before kneeling, the knees coming down just short of the rim
		embrace: [0, 1.24], bowPath: [[0, 1.1], [0, 2.72]],
		priestHome: [-2.15, 1.35], priestFace: [0, -0.4], priestAarti: [-0.3, 1.0], aartiSpot: [0.6, 1.65],
		markSpot: [0.3, 1.6], priestMarkSpot: [-0.42, 1.25],
		circuit: arc(0, -0.4, 1.85, 1.5, 0, -Math.PI * 2, 40),
		cams: {
			enter: Object.assign(F(["T", "wash"], 182, 12, 1.15), { room: [-2.9, 2.9, 0.15, 3.85, 3.5, 12.6] }),
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
	daylight(ctx, 0, 1.6, 11.8, 4, 3.6, "court", 10, [0, 0, 5]);
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
		const m = crowdFigure(301 + i * 17, "tirupati");
		KEEP.add(m.material);
		m.scale.setScalar(1 / 0.28);
		m.position.set(x, 0, z);
		m.rotation.y = ry;
		g.add(m);
	});
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, -0.55, 0, 10.05, g);
	common(ctx, 4.6);
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-1.85, 1.85, 0.15, 3.45, -4.2, 0.25], [-4.95, 4.95, 0.15, 4.4, 1.1, 9.0], [-4.95, -2.6, 0.15, 4.4, -6.6, 9.0], [2.6, 4.95, 0.15, 4.4, -6.6, 9.0], [-4.95, 4.95, 0.15, 4.4, -6.6, -5.0]],
		deityPts: [[0, 0.3, -3.4], [0, 3.1, -3.4]], pts: { wash: [-0.55, 0.3, 10.05], hundi: [-3.75, 1.0, -1.2], door: [0, 2.6, 0.9] },
		floor: (x, z) => (Math.abs(x) < 0.75 && z > 0.5 && z < 0.9 ? 0.07 : 0), noTouch: true, priestMark: "urdhva",
		// sandals and staff left at the door, outside; then into the queue
		start: [1.3, 11.2], enterPath: [[1.3, 11.2], [0.2, 9.9]], staffRest: [1.17, 9.47], staffTilt: [-0.07, 0], sandals: [0.45, 9.72], washFace: [-0.55, 10.05],
		queue: [[0.2, 9.9], [0.5, 8.1], [0.5, 2.7], [0.1, 1.9]], doorFace: [0, -3.4],
		toFront: [[0.1, 1.9], [0.15, 0.9], [0.32, -1.05]], front: [0.32, -1.05], target: [0, -3.4],
		theertham: [[0.32, -1.05], [0.05, 0.55], [-0.9, 1.95], [-3.3, 1.95]], priestHome: [-4.0, 1.85], priestFace: [-3.3, 1.95],
		hundiPath: [[-3.3, 1.95], [-3.1, 0.9], [-3.75, -0.2]], hundiFace: [-3.75, -1.2], hundiDrop: [-3.72, 1.27, -0.8],
		circuit: [[-3.75, -0.2], [-3.1, -0.3], [-2.9, -0.8], [-2.9, -5.5], [2.9, -5.5], [2.9, 1.9], [1.6, 3.2]],
		laddu: [1.6, 3.2],
		cams: {
			enter: Object.assign(F(["T", "wash"], 182, 12, 1.15), { room: [-4.9, 4.9, 0.15, 4.4, 7.75, 11.6] }),
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
	daylight(ctx, 0, 1.6, 11.6, 4, 3.6, "valley", 8, [0, 0, 5]);
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
	const gar = small({ head: "hair", tilak: false }, { skin: brass, top: brass, bottom: brass, sash: brass, hair: null, sole: brass }, P(NAMASTE, { kneeL: 1.62, kneeR: 1.5, hipL: -0.05, hipR: -1.5, bob: -0.45, nod: 0.1 }), 0.95, 0.0, -2.45, Math.PI - 0.3, 0.5);
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
	kit.bell(g, 0.38, 2.95, 1.3, 1.2, 0.6);
	garland(g, V(-0.95, 2.82, 1.1), V(0.95, 2.82, 1.1), 0.3, 0.032, M.marigold, M.rose);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 0.95, 2.82, 1.12, 1.1, M.marigold, M.rose);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, -0.6, 0, 9.65, g);
	const crowdSpots = [[-1.7, 5.0, Math.PI - 0.2], [-2.3, 6.6, Math.PI + 0.3], [-3.6, -3.0, Math.PI / 2], [3.7, -1.5, -Math.PI / 2]];
	crowdSpots.forEach(([x, z, ry], i) => {
		const m = crowdFigure(501 + i * 13, "badrinath");
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
		deityPts: [[0, 0.75, -3.2], [0, 1.75, -3.2]], pts: { wash: [-0.6, 0.3, 9.65], bell: [0.38, 2.4, 1.3], door: [0, 2.0, 0.8] },
		floor: () => 0, priestMark: "urdhva", mark: "chandan", kund: true,
		// up from the kund: sandals and staff left at the door, outside
		start: [1.3, 11.0], enterPath: [[1.3, 11.0], [0.2, 9.5]], staffRest: [1.17, 9.07], staffTilt: [-0.07, 0], sandals: [0.45, 9.32], washFace: [-0.6, 9.65],
		bellSpot: [0.2, 1.75], bellFace: Math.PI, bellPath: [[0.2, 9.5], [0.5, 7.6], [1.4, 4.4], [0.2, 1.75]],
		toFront: [[0.2, 1.75], [0.2, 1.0], [0.36, -0.95]], front: [0.36, -0.95], target: [0, -3.25],
		priestHome: [-1.45, -1.9], priestFace: [0, -0.95], priestTake: [-0.2, -1.6], priestPlace: [0, -2.2],
		priestAarti: [-0.05, -1.95], aartiSpot: [-0.45, -0.95], markSpot: [0.25, -0.95], priestMarkSpot: [-0.3, -1.5],
		circuit: [[0.36, -0.95], [0.3, 1.7], [-2.85, 1.75], [-2.85, -5.4], [2.85, -5.4], [2.85, 1.8], [0.5, 2.5]],
		bowPath: [[0.5, 2.5], [0.2, 1.4], [0.1, -0.42]],
		cams: {
			enter: Object.assign(F(["T", "wash"], 182, 12, 1.15), { room: [-4.5, 4.5, 0.15, 4.0, 1.2, 11.4] }),
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
// Polished white marble: large slabs with fine grey veins and hairline joints. One tile per scale metres.
function marbleMat(base, o = {}) {
	const R = rand(o.seed ?? 1);
	const rows = o.rows ?? 2, cols = o.cols ?? 2;
	const veins = [];
	for (let i = 0; i < (o.veins ?? 16); i++) {
		const pts = [[R() * 512, R() * 512]];
		for (let k = 0; k < 7; k++) pts.push([pts[k][0] + (R() - 0.3) * 90, pts[k][1] + (R() - 0.5) * 70]);
		veins.push({ pts, w: 0.5 + R() * 1.6, a: 0.04 + R() * 0.1 });
	}
	const map = canvas(512, 512, (g, W, H) => {
		g.fillStyle = css(base);
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 70; i++) {
			const x = R() * W, y = R() * H, r = 30 + R() * 90;
			const gr = g.createRadialGradient(x, y, 0, x, y, r);
			gr.addColorStop(0, R() < 0.5 ? "rgba(255,252,245,0.18)" : "rgba(150,145,135,0.07)");
			gr.addColorStop(1, "rgba(255,255,255,0)");
			g.fillStyle = gr;
			g.fillRect(0, 0, W, H);
		}
		for (const v of veins) {
			g.strokeStyle = `rgba(110,108,104,${v.a})`;
			g.lineWidth = v.w;
			g.beginPath();
			v.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
			g.stroke();
		}
		g.fillStyle = css(base, 0.88);
		for (let r = 0; r < rows; r++) g.fillRect(0, (r * H) / rows, W, 2);
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.fillRect(((c + (r % 2) * 0.5) * W) / cols, (r * H) / rows, 2, H / rows);
	});
	const bump = canvas(256, 256, (g, W, H) => {
		g.fillStyle = "#c0c0c0";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#404040";
		for (let r = 0; r < rows; r++) g.fillRect(0, (r * H) / rows, W, 1.5);
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.fillRect(((c + (r % 2) * 0.5) * W) / cols, (r * H) / rows, 1.5, H / rows);
	});
	const m = std(0xffffff, { map: texOf(map), bumpMap: texOf(bump, false), bumpScale: 0.6, roughness: o.rough ?? 0.24, metalness: 0, vertexColors: true });
	m.userData.tri = o.scale ?? 1.6;
	return m;
}
// Static pieces merged into one mesh per material: [geometry, x, y, z, rx?, ry?, rz?].
function merged(g, mat, parts) {
	const geos = parts.map(([geo, x, y, z, rx = 0, ry = 0, rz = 0]) => {
		geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
		geo.translate(x, y, z);
		return geo.index ? geo : mergeVertices(geo);
	});
	const m = mesh(mergeGeometries(geos), mat, 0, 0, 0, g);
	for (const q of geos) q.dispose();
	return m;
}
// Railing along a polyline: posts every gap metres, a top rail and a mid rail, merged.
function railing(g, pts, h, mat, { r = 0.022, gap = 1.2, bars = 0, mid = true } = {}) {
	const parts = [];
	const tube = (a, b, y, rr) => {
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
		parts.push([new THREE.CylinderGeometry(rr, rr, l, 8), (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, Math.PI / 2, Math.atan2(b[0] - a[0], b[1] - a[1]), 0]);
	};
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
		tube(a, b, h, r);
		if (mid) tube(a, b, h * 0.45, r * 0.7);
		const n = Math.max(1, Math.round(l / gap));
		for (let k = i === 1 ? 0 : 1; k <= n; k++) {
			const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n);
			parts.push([new THREE.CylinderGeometry(r * 1.1, r * 1.3, h, 8), x, h / 2, z]);
			parts.push([new THREE.SphereGeometry(r * 1.7, 8, 6), x, h + r, z]);
		}
		// thin balusters between the posts
		const nb = Math.round(l / (bars || 1e9));
		for (let k = 1; k < nb; k++) parts.push([new THREE.CylinderGeometry(r * 0.35, r * 0.35, h, 5), lerp(a[0], b[0], k / nb), h / 2, lerp(a[1], b[1], k / nb)]);
	}
	return merged(g, mat, parts);
}
// A crystal chandelier: brass stem and two rings of lit bulbs hung with drops; electric, so its light is steady.
function chandelier(ctx, x, y, z, s = 1, lit = true) {
	const { g, M } = ctx;
	const crystal = ctx.M.crystal || (ctx.M.crystal = std(0xfff6e8, { roughness: 0.05, metalness: 0.3, emissive: 0x6a5030, emissiveIntensity: 0.6 }));
	const parts = [[new THREE.CylinderGeometry(0.012, 0.012, 0.9 * s, 6), x, y - 0.45 * s, z], [lathe([[0, 0], [0.09, 0.03], [0.13, 0.12], [0.07, 0.24], [0.03, 0.34], [0, 0.36]], 16, s), x, y - 1.25 * s, z]];
	const drops = [];
	for (const [r, h, n] of [[0.55, 1.05, 14], [0.34, 0.8, 10]]) {
		parts.push([new THREE.TorusGeometry(r * s, 0.014 * s, 6, 40), x, y - h * s, z, Math.PI / 2]);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2, bx = x + Math.cos(a) * r * s, bz = z + Math.sin(a) * r * s;
			parts.push([new THREE.CylinderGeometry(0.018 * s, 0.012 * s, 0.05 * s, 8), bx, y - (h - 0.03) * s, bz]);
			const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
			b.position.set(bx, y - (h - 0.085) * s, bz);
			b.scale.setScalar(0.14 * s);
			g.add(b);
			drops.push(new THREE.OctahedronGeometry(0.022 * s).scale(0.7, 1.6, 0.7).translate(bx, y - (h + 0.07) * s, bz));
		}
	}
	merged(g, M.brass, parts);
	mesh(mergeGeometries(drops), crystal, 0, 0, 0, g).castShadow = false;
	if (!lit) return null;
	const l = new THREE.PointLight(0xfff0dc, 12 * s, 12, 2);
	l.position.set(x, y - 1.0 * s, z);
	g.add(l);
	return l;
}
// A cloth laid over a profile [[z, y], ...] (from one side's foot over the top to the other's), along x from x0
// to x1, with soft folds; UVs run 0..1 along x and round the profile, for a bordered chadar.
function drapeGeo(prof, x0, x1, cz, off = 0.012, nu = 48, nv = 30) {
	const len = [0];
	for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
	const L = len[len.length - 1];
	const at = (d) => {
		for (let i = 1; i < prof.length; i++)
			if (d <= len[i] || i === prof.length - 1) {
				const k = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
				const a = prof[i - 1], b = prof[i];
				const tz = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tz, ty) || 1;
				return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), -ty / tl, tz / tl];
			}
	};
	const geo = new THREE.PlaneGeometry(1, 1, nu, nv);
	const p = geo.attributes.position, uv = geo.attributes.uv;
	for (let i = 0; i < p.count; i++) {
		const u = uv.getX(i), v = uv.getY(i);
		const [z, y, nz, ny] = at(v * L);
		const f = off + 0.008 * Math.sin(u * 40 + v * 7) * Math.min(1, (1 - Math.abs(v - 0.5) * 2) * 3 + 0.3);
		p.setXYZ(i, lerp(x0, x1, u), y + ny * f, cz + z + nz * f);
	}
	geo.computeVertexNormals();
	return geo;
}
// The painted portrait of Baba in Dwarkamai: seated on the stone, in a white kafni and head cloth.
function portraitTex() {
	return texOf(canvas(256, 352, (g, W, H) => {
		const bg = g.createLinearGradient(0, 0, 0, H);
		bg.addColorStop(0, "#34524c");
		bg.addColorStop(1, "#1a2a28");
		g.fillStyle = bg;
		g.fillRect(0, 0, W, H);
		const halo = g.createRadialGradient(128, 96, 10, 128, 96, 80);
		halo.addColorStop(0, "rgba(255,220,150,0.55)");
		halo.addColorStop(1, "rgba(255,220,150,0)");
		g.fillStyle = halo;
		g.fillRect(0, 0, W, H);
		const fill = (c, f) => {
			g.fillStyle = c;
			g.beginPath();
			f();
			g.fill();
		};
		// the stone, the kafni with the right leg across the left knee, the hands
		fill("#7a756c", () => g.ellipse(128, 300, 92, 26, 0, 0, Math.PI * 2));
		fill("#f2eee4", () => {
			g.moveTo(92, 132);
			g.quadraticCurveTo(128, 120, 164, 132);
			g.lineTo(184, 240);
			g.lineTo(196, 290);
			g.lineTo(150, 296);
			g.lineTo(140, 250);
			g.lineTo(96, 262);
			g.lineTo(60, 250);
			g.lineTo(76, 200);
			g.closePath();
		});
		fill("#e4dfd2", () => g.ellipse(112, 236, 62, 17, -0.12, 0, Math.PI * 2));
		fill("#c08a60", () => g.ellipse(160, 296, 18, 8, 0, 0, Math.PI * 2));
		fill("#c08a60", () => g.ellipse(64, 240, 12, 9, 0, 0, Math.PI * 2));
		fill("#c08a60", () => g.ellipse(150, 222, 12, 10, 0.4, 0, Math.PI * 2));
		g.strokeStyle = "rgba(120,110,95,0.5)";
		g.lineWidth = 2;
		for (const [a, b, c, d] of [[110, 140, 104, 230], [146, 140, 156, 226], [128, 150, 128, 228]]) {
			g.beginPath();
			g.moveTo(a, b);
			g.lineTo(c, d);
			g.stroke();
		}
		// the face, the white beard and the head cloth with its end over the left shoulder
		fill("#c8956a", () => g.ellipse(128, 96, 24, 30, 0, 0, Math.PI * 2));
		fill("#ece8e0", () => {
			g.moveTo(106, 104);
			g.quadraticCurveTo(128, 150, 150, 104);
			g.quadraticCurveTo(128, 116, 106, 104);
		});
		fill("#2a201a", () => g.ellipse(119, 92, 3.4, 2.2, 0, 0, Math.PI * 2));
		fill("#2a201a", () => g.ellipse(137, 92, 3.4, 2.2, 0, 0, Math.PI * 2));
		fill("#f4f0e8", () => {
			g.moveTo(101, 90);
			g.quadraticCurveTo(100, 56, 128, 54);
			g.quadraticCurveTo(158, 56, 155, 90);
			g.quadraticCurveTo(128, 78, 101, 90);
		});
		fill("#f4f0e8", () => {
			g.moveTo(152, 80);
			g.quadraticCurveTo(170, 110, 168, 150);
			g.lineTo(156, 148);
			g.quadraticCurveTo(158, 112, 146, 88);
		});
		g.strokeStyle = "#c9a040";
		g.lineWidth = 10;
		g.strokeRect(5, 5, W - 10, H - 10);
		g.strokeStyle = "#7a5a20";
		g.lineWidth = 2;
		g.strokeRect(12, 12, W - 24, H - 24);
	}));
}
// A chadar: deep red velvet with a broad gold border and a line embroidered along its middle.
function chadarTex(base, text) {
	return texOf(canvas(512, 256, (g, W, H) => {
		g.fillStyle = css(base);
		g.fillRect(0, 0, W, H);
		const R = rand(5);
		for (let i = 0; i < 6000; i++) {
			g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,220,220"},${0.06 * R()})`;
			g.fillRect(R() * W, R() * H, 2, 2);
		}
		g.fillStyle = "#d8a63a";
		g.fillRect(0, 0, W, 18);
		g.fillRect(0, H - 18, W, 18);
		g.fillRect(0, 0, 14, H);
		g.fillRect(W - 14, 0, 14, H);
		g.fillStyle = css(base, 0.75);
		for (let x = 8; x < W; x += 16) {
			g.fillRect(x, 6, 6, 6);
			g.fillRect(x, H - 12, 6, 6);
		}
		g.fillStyle = "#e6b84a";
		g.font = "bold 46px 'Tiro Devanagari Hindi', serif";
		g.textAlign = "center";
		g.textBaseline = "middle";
		if (text) g.fillText(text, W / 2, H / 2 + 4);
		for (const x of [70, W - 70]) {
			g.beginPath();
			g.arc(x, H / 2, 22, 0, Math.PI * 2);
			g.fill();
		}
	}));
}

// Shirdi: the Samadhi Mandir, a hall of white marble where Sai Baba rests, his murti seated above the samadhi;
// and, built some way off, Dwarkamai, the old mosque where he lived with the dhuni he kept burning.
const DWARKA = 40; // Dwarkamai's x offset from the Samadhi Mandir
function shirdi(ctx) {
	const { g, M, kit } = ctx;
	const floor = marbleMat(0xeeebe4, { seed: 91, rows: 2, cols: 2, scale: 1.4, rough: 0.16 });
	const wall = marbleMat(0xf6f4f0, { seed: 92, rows: 2, cols: 2, scale: 2.4, rough: 0.4, veins: 8 });
	const trim = marbleMat(0xe2ddd2, { seed: 93, rows: 1, cols: 1, scale: 1.0, rough: 0.3, veins: 6 });
	const ceil = std(0xf2eee6, { roughness: 0.6, vertexColors: true });
	const t = 0.4, H = 5.2;
	// the hall
	box(g, -6.5, 6.5, -0.3, 0, -7, 13.5, floor, 1);
	wallX(g, -6.5 - t / 2, -7, 10.2, 0, H, t, wall);
	wallX(g, 6.5 + t / 2, -7, 10.2, 0, H, t, wall);
	wallZ(g, -7 - t / 2, -6.7, 6.7, 0, H, t, wall);
	wallZ(g, 10, -6.7, 6.7, 0, H, t, wall, [-1.3, 1.3, 0, 3.2]);
	box(g, -6.7, 6.7, H, H + 0.3, -7.2, 10.2, ceil, 1);
	// a dado along the walls, and the gilt cornice under the ceiling
	for (const sx of [-1, 1]) {
		box(g, sx * 6.5 - 0.06, sx * 6.5 + 0.06, 0, 0.9, -7, 9.8, trim, 1);
		box(g, sx * 6.5 - 0.08, sx * 6.5 + 0.08, H - 0.32, H - 0.22, -7, 9.8, M.gold, 1);
	}
	box(g, -6.5, 6.5, H - 0.32, H - 0.22, -6.88, -6.72, M.gold, 1);
	// square marble pillars along the sides, beams across the ceiling between them
	const pz = [7.6, 4.2, 0.8, -2.6];
	for (const z of pz) {
		for (const sx of [-1, 1]) {
			const x = sx * 5.85;
			box(g, x - 0.32, x + 0.32, 0, 0.5, z - 0.32, z + 0.32, trim, 1);
			box(g, x - 0.24, x + 0.24, 0.5, H - 0.6, z - 0.24, z + 0.24, wall, 2);
			box(g, x - 0.34, x + 0.34, H - 0.6, H - 0.35, z - 0.34, z + 0.34, trim, 1);
			box(g, x - 0.27, x + 0.27, 2.6, 2.7, z - 0.27, z + 0.27, M.gold, 1);
		}
		box(g, -6.5, 6.5, H - 0.35, H, z - 0.2, z + 0.2, ceil, 1);
	}
	// arched recesses on the side walls between the pillars, outlined in gold
	for (let i = 0; i < pz.length - 1; i++) {
		const z = (pz[i] + pz[i + 1]) / 2;
		for (const sx of [-1, 1]) {
			const a = mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 30, Math.PI), M.gold, sx * 6.28, 2.9, z, g);
			a.rotation.y = Math.PI / 2;
			for (const sz of [-1, 1]) box(g, sx * 6.28 - 0.05, sx * 6.28 + 0.05, 0.9, 2.9, z + sz * 1.15 - 0.05, z + sz * 1.15 + 0.05, M.gold, 1);
		}
	}
	daylight(ctx, 0, 1.6, 13.4, 5, 3.6, "court", 10, [0, 0, 6]);
	// the raised dais of the murti, its face banded in silver repousse
	const rep = repousse(0xd8d8d2, 94, 1, 6);
	const silverF = std(0xffffff, { map: rep.map, bumpMap: rep.bump, bumpScale: 3, metalness: 0.9, roughness: 0.26 });
	silverF.userData.tri = 0.8;
	box(g, -2.7, 2.7, 0, 1.2, -6.9, -4.0, wall, 1);
	box(g, -2.72, 2.72, 0.3, 1.0, -4.02, -3.96, silverF, 1);
	box(g, -2.8, 2.8, 1.16, 1.24, -6.9, -3.92, M.gold, 1);
	// behind the throne: a tall marble arch in the back wall, outlined in gold
	box(g, -2.3, 2.3, 1.2, 4.6, -6.98, -6.8, trim, 1);
	mesh(new THREE.TorusGeometry(1.6, 0.07, 8, 40, Math.PI), M.gold, 0, 3.2, -6.78, g);
	for (const sx of [-1, 1]) box(g, sx * 1.6 - 0.07, sx * 1.6 + 0.07, 1.2, 3.2, -6.85, -6.71, M.gold, 1);
	// the silver throne: seat, an arched back and arms, on a low footstool
	const s = 1.25, Z = -5.25, Y = 1.2; // the murti's root
	const rep2 = repousse(0xd8d8d2, 95, 2, 2);
	const silverT = std(0xffffff, { map: rep2.map, bumpMap: rep2.bump, bumpScale: 3, metalness: 0.92, roughness: 0.24 });
	silverT.userData.tri = 0.6;
	box(g, -0.55, 0.55, Y, Y + 0.48 * s, Z - 0.42, Z + 0.3, silverT, 1);
	box(g, -0.58, 0.58, Y + 0.48 * s, Y + 0.53 * s, Z - 0.44, Z + 0.33, M.silver, 1);
	const back = new THREE.Shape();
	back.moveTo(-0.62, 0);
	back.lineTo(0.62, 0);
	back.lineTo(0.62, 0.95);
	back.quadraticCurveTo(0.62, 1.45, 0, 1.62);
	back.quadraticCurveTo(-0.62, 1.45, -0.62, 0.95);
	back.closePath();
	mesh(new THREE.ExtrudeGeometry(back, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), M.silver, 0, Y + 0.5 * s, Z - 0.52, g);
	// a gilt halo on the throne's back, behind his head
	mesh(new THREE.CircleGeometry(0.34, 40), silverT, 0, Y + 1.3 * s, Z - 0.41, g);
	mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 48), M.gold, 0, Y + 1.3 * s, Z - 0.4, g);
	for (let i = 0; i < 24; i++) {
		const a = (i / 24) * Math.PI * 2;
		mesh(new THREE.ConeGeometry(0.025, 0.09, 5), M.gold, Math.cos(a) * 0.4, Y + 1.3 * s + Math.sin(a) * 0.4, Z - 0.41, g).rotation.z = a - Math.PI / 2;
	}
	const rim = new THREE.CatmullRomCurve3([V(-0.66, 0, 0), V(-0.66, 0.95, 0), V(-0.45, 1.4, 0), V(0, 1.67, 0), V(0.45, 1.4, 0), V(0.66, 0.95, 0), V(0.66, 0, 0)]);
	mesh(new THREE.TubeGeometry(rim, 40, 0.03, 8), M.gold, 0, Y + 0.5 * s, Z - 0.42, g);
	for (const sx of [-1, 1]) {
		box(g, sx * 0.6 - 0.06, sx * 0.6 + 0.06, Y + 0.53 * s, Y + 0.85 * s, Z - 0.44, Z + 0.2, M.silver, 1);
		mesh(new THREE.SphereGeometry(0.075, 14, 10), M.silver, sx * 0.6, Y + 0.9 * s, Z + 0.22, g); // a lion's head on each arm
	}
	box(g, -0.05, 0.38, Y, Y + 0.14, Z + 0.32, Z + 0.74, M.silver, 1);
	// the silver canopy on four posts, its dome hung with a fringe
	for (const [x, z] of [[-0.85, -5.95], [0.85, -5.95], [-0.85, -4.45], [0.85, -4.45]]) {
		mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.4, 10), M.silver, x, Y + 1.2, z, g);
		mesh(new THREE.SphereGeometry(0.06, 10, 8), M.silver, x, Y + 2.42, z, g);
	}
	box(g, -0.95, 0.95, Y + 2.4, Y + 2.5, -6.05, -4.35, M.silver, 1);
	mesh(lathe([[0, 0], [1.0, 0], [0.95, 0.12], [0.78, 0.3], [0.5, 0.46], [0.2, 0.55], [0.08, 0.62], [0.1, 0.7], [0.04, 0.78], [0.06, 0.86], [0, 0.94]], 32), M.silver, 0, Y + 2.5, -5.2, g).scale.set(1, 1, 0.9);
	const fringe = [];
	for (let i = 0; i < 40; i++) {
		const a = (i / 40) * Math.PI * 2;
		fringe.push([new THREE.ConeGeometry(0.022, 0.1, 5).rotateX(Math.PI), Math.cos(a) * 0.98, Y + 2.38, -5.2 + Math.sin(a) * 0.88]);
	}
	merged(g, M.silver, fringe);
	// Sai Baba: white marble, seated with the right leg across the left knee, in a white kafni with a saffron
	// cloth tied on the head; for the day, a gold crown and a shawl over the shoulders
	const MJ = person({ skin: 0xf3efe8, top: 0xf8f6f0, bottom: 0xf8f6f0, sash: 0xf8f6f0, head: "pheta", headColor: 0xe46f1a, border: 0xd8a83a, beard: 0xd4d0c8, moustache: 0xd4d0c8, hairColor: 0xd8d4cc, age: "elder", sleeve: 1, dhoti: "long", shawl: 0x861824, mark: "none", lod: 2 });
	const mp = { bob: -0.35, lean: -0.03, nod: 0.1, shR: -0.5, elR: -0.9, shL: -0.6, elL: -0.7 };
	// own left foot down on the stool; own right ankle laid over the left knee, the right knee out to the side
	for (const [S, side, K, A, fy] of [[LEFT, 1, V(0.11, -0.01, 0.45), V(0.13, -0.41, 0.48), -0.49], [RIGHT, -1, V(-0.26, 0.07, 0.37), V(0.15, 0.115, 0.43), -1]]) {
		const r = legIK(side, K, A, fy);
		Object.assign(mp, { ["hip" + S]: r.hip, ["hip" + S + "y"]: r.hipy, ["hip" + S + "z"]: r.hipz, ["knee" + S]: r.knee, ["ankle" + S]: S === RIGHT ? 0.35 : r.ankle });
	}
	pose(MJ, mp);
	MJ.root.scale.setScalar(s);
	MJ.root.position.set(0, Y, Z);
	g.add(MJ.root);
	MJ.root.updateMatrixWorld(true);
	// the right hand rests on the right knee, the left on the right foot
	const kneeW = MJ["knee" + RIGHT].getWorldPosition(V()).add(V(0.0, 0.1 * s, 0.03));
	const footW = MJ["ankle" + RIGHT].localToWorld(V(0, 0.0, 0.08)).add(V(0, 0.07 * s, 0));
	for (const [S, tg] of [[RIGHT, kneeW], [LEFT, footW]]) {
		const r = reach(MJ, S, tg, mp);
		Object.assign(mp, { ["sh" + S]: r.sh, ["sh" + S + "z"]: r.shz, ["el" + S]: r.el });
		pose(MJ, mp);
		MJ.root.updateMatrixWorld(true);
	}
	for (const f of MJ.feet) f.visible = false;
	// the brows (and the hair under the cloth) carved in the marble, only a shade greyer
	const browM = std(0xcac5bc, { roughness: 0.5 });
	MJ.root.traverse((o) => o.isMesh && o.material.color && o.material.color.getHex() === 0xd8d4cc && (o.material = browM));
	const crown = new THREE.Group();
	mesh(lathe([[0, 0], [0.118, 0], [0.122, 0.03], [0.108, 0.045], [0.125, 0.09], [0.1, 0.12], [0.07, 0.15], [0.05, 0.2], [0.02, 0.25], [0, 0.27]], 28), M.gold, 0, 0, 0, crown);
	for (let i = 0; i < 9; i++) {
		const a = -1.0 + i * 0.25;
		mesh(new THREE.SphereGeometry(0.011, 6, 4), i % 2 ? M.rose : std(0x1a7a3a, { roughness: 0.2, emissive: 0x002a10 }), Math.sin(a) * 0.121, 0.065, Math.cos(a) * 0.121, crown);
	}
	crown.position.set(0, 0.105, -0.01);
	crown.scale.set(0.85, 0.55, 0.85);
	MJ.head.add(crown);
	const gl = (mat, d, r, low, w = 0.2) => {
		const pts = [V(-0.13, 0.55, 0.06), V(-w, 0.3, 0.15 + d), V(-w * 0.8, low + 0.08, 0.2 + d), V(0, low, 0.23 + d), V(w * 0.8, low + 0.08, 0.2 + d), V(w, 0.3, 0.15 + d), V(0.13, 0.55, 0.06)];
		beads(MJ.torso, new THREE.CatmullRomCurve3(pts), r, mat, M.jasmine);
	};
	gl(M.rose, 0.03, 0.028, 0.12, 0.19);
	gl(M.marigold, 0.05, 0.03, 0.2, 0.17);
	gl(M.jasmine, 0.06, 0.02, 0.3, 0.15);
	// the samadhi: a raised white marble tomb under a red chadar heaped with flowers and garlands
	const SZ = -2.82;
	box(g, -1.4, 1.4, 0, 0.2, -3.5, -2.15, trim, 1);
	box(g, -1.25, 1.25, 0.2, 0.4, -3.35, -2.3, wall, 1);
	box(g, -1.27, 1.27, 0.36, 0.4, -3.37, -2.28, M.silver, 1);
	const prof = [[-0.4, 0.4], [-0.4, 0.82], [-0.3, 0.98], [-0.12, 1.04], [0.12, 1.04], [0.3, 0.98], [0.4, 0.82], [0.4, 0.4]];
	const tomb = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
	const tg = new THREE.ExtrudeGeometry(tomb, { depth: 2.1, bevelEnabled: false });
	tg.rotateY(Math.PI / 2);
	mesh(tg, wall, -1.05, 0, SZ, g);
	const red = std(0xffffff, { map: chadarTex(0x8e1420, "ॐ साई राम"), roughness: 0.75, side: THREE.DoubleSide });
	const drapeP = [[-0.43, 0.42], ...prof.slice(1, -1), [0.43, 0.42]];
	mesh(drapeGeo(drapeP, -1.12, 1.12, SZ, 0.014), red, 0, 0, 0, g);
	for (const sx of [-1, 1]) {
		const cap = new THREE.ShapeGeometry(new THREE.Shape(drapeP.map(([z, y]) => new THREE.Vector2(z * 1.03, y))));
		cap.rotateY(sx * Math.PI / 2);
		mesh(cap, red, sx * 1.12, 0, SZ, g).material = std(0x8e1420, { roughness: 0.75, side: THREE.DoubleSide });
	}
	const topY = (z) => 1.04 - 0.4 * Math.max(0, Math.abs(z) - 0.12) - 0.9 * Math.max(0, Math.abs(z) - 0.3);
	heap(g, flowerKinds(M), 260, (R) => {
		const z = (R() - 0.5) * 0.6;
		return V((R() - 0.5) * 1.9, topY(z) + 0.035, SZ + z);
	}, 96);
	for (const [dz, mat, acc, r] of [[-0.2, M.marigold, M.rose, 0.03], [0, M.rose, M.jasmine, 0.03], [0.2, M.marigold, M.jasmine, 0.03], [0.34, M.jasmine, M.rose, 0.022], [-0.34, M.jasmine, M.rose, 0.022]])
		beads(g, new THREE.CatmullRomCurve3([V(-1.12, 0.6, SZ + dz * 1.25), V(-0.9, topY(dz) + 0.05, SZ + dz), V(0, topY(dz) + 0.07, SZ + dz), V(0.9, topY(dz) + 0.05, SZ + dz), V(1.12, 0.6, SZ + dz * 1.25)]), r, mat, acc);
	// what the traveller offers: a green chadar laid across, and fresh flowers on it
	const offered = new THREE.Group();
	g.add(offered);
	const green = std(0xffffff, { map: chadarTex(0x1f6a3a), roughness: 0.75, side: THREE.DoubleSide });
	mesh(drapeGeo(drapeP, -0.42, 0.42, SZ, 0.03, 24, 30), green, 0, 0, 0, offered);
	heap(offered, flowerKinds(M, false), 50, (R) => {
		const z = (R() - 0.5) * 0.4;
		return V((R() - 0.5) * 0.6, topY(z) + 0.06, SZ + z);
	}, 97);
	offered.visible = false;
	ctx.offered = offered;
	// the low silver railing round the samadhi
	railing(g, [[-1.8, -4.0], [-1.8, -1.6], [1.8, -1.6], [1.8, -4.0]], 0.8, M.silver, { r: 0.024, gap: 0.6, bars: 0.12 });
	// the queue: two lanes between steel railings down the right of the hall, then across before the samadhi
	const steel = std(0xc4c4c0, { metalness: 0.85, roughness: 0.3 });
	railing(g, [[3.0, 5.6], [3.0, -0.4], [-2.4, -0.4]], 1.0, steel, { gap: 1.3 });
	railing(g, [[4.2, 5.6], [4.2, -1.6], [1.8, -1.6]], 1.0, steel, { gap: 1.3 });
	railing(g, [[5.4, 5.6], [5.4, -1.2]], 1.0, steel, { gap: 1.3 });
	// lamps: brass samai before the dais, chandeliers down the hall, light on Baba's face
	kit.samai(g, -2.35, 0, -3.6, 1.2, 7);
	kit.samai(g, 2.35, 0, -3.6, 1.2, 7);
	kit.light(-2.2, 1.5, -3.3, 3, 6, 0xffa050);
	kit.light(2.2, 1.5, -3.3, 3, 6, 0xffa050);
	for (const x of [-1.6, -0.8, 0.8, 1.6]) kit.diya(g, x, 1.24, -4.15);
	kit.incense(g, 1.45, 1.24, -4.25);
	kit.incense(g, -1.45, 1.24, -4.25);
	for (const z of [6.0, 2.4, -1.2]) chandelier(ctx, 0, H, z, 1.1);
	chandelier(ctx, -3.6, H, 2.4, 0.8, false);
	const spot = new THREE.SpotLight(0xfff0dc, 26, 12, 0.42, 0.6, 1.4);
	spot.position.set(0, 4.8, -1.6);
	spot.target.position.set(0, 2.0, -5.2);
	if (!ctx.low) {
		spot.castShadow = true;
		spot.shadow.mapSize.set(1024, 1024);
		spot.shadow.bias = -0.002;
	}
	g.add(spot, spot.target);
	garland(g, V(-1.3, 3.2, 10.22), V(1.3, 3.2, 10.22), 0.3, 0.035, M.marigold, M.rose);
	for (const sx of [-1, 1]) hangingGarland(g, sx * 1.3, 3.2, 10.22, 1.1, M.marigold, M.rose);
	for (const sx of [-1, 1]) garland(g, V(sx * 0.85, Y + 2.4, -4.45), V(sx * 0.85, Y + 2.4, -5.95), 0.18, 0.026, M.marigold, M.rose);
	garland(g, V(-0.85, Y + 2.4, -4.45), V(0.85, Y + 2.4, -4.45), 0.22, 0.03, M.rose, M.jasmine);
	mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.1], [0.19, 0.2], [0.13, 0.26], [0.15, 0.3], [0, 0.29]], 20), M.brass, -0.6, 0, 11.3, g);
	// devotees: a second line in the queue beside the traveller's, and others standing to sing the aarti
	const crowdSpots = [[4.8, 1.7], [4.85, 2.9], [4.8, 4.1], [4.85, 5.3], [4.9, 6.9], [-2.6, 0.6], [-3.4, 1.4], [-2.3, 2.2], [-4.2, 0.2], [-4.1, 2.6], [-3.1, 3.4]];
	crowdSpots.forEach(([x, z], i) => {
		const m = crowdFigure(701 + i * 19, "shirdi");
		KEEP.add(m.material);
		m.scale.setScalar(1 / 0.28);
		m.position.set(x, 0, z);
		m.rotation.y = x > 4 ? Math.PI : Math.atan2(-x, -5.2 - z);
		g.add(m);
	});

	// ---- Dwarkamai ----
	const X = DWARKA;
	const plaster = stoneMat(0xe6dcc6, { rows: 3, cols: 1, jitter: 0.03, mortar: 0.96, streaks: 0.35, seed: 97, scale: 2.4, bump: 0.3 });
	const flags = stoneMat(0x6e6456, { rows: 3, cols: 2, seed: 98, rough: 0.6, scale: 1.3, wear: 1, bump: 0.6 });
	const timber = std(0x4a3220, { roughness: 0.75 });
	const HD = 3.8;
	box(g, X - 4.2, X + 4.2, -0.3, 0, -3.6, 7, flags, 1);
	wallX(g, X - 4.2, -3.6, 4.2, 0, HD, t, plaster);
	wallX(g, X + 4.2, -3.6, 4.2, 0, HD, t, plaster);
	wallZ(g, -3.6, X - 4.4, X + 4.4, 0, HD, t, plaster);
	wallZ(g, 4.2, X - 4.4, X + 4.4, 0, HD, t, plaster, [X - 1.0, X + 1.0, 0, 2.6]);
	box(g, X - 4.4, X + 4.4, HD, HD + 0.2, -3.8, 4.4, timber, 1);
	for (let z = -3.0; z < 4; z += 1.2) box(g, X - 4.0, X + 4.0, HD - 0.22, HD, z - 0.1, z + 0.1, timber, 1);
	for (const x of [X - 1.6, X + 1.6]) {
		mesh(new THREE.CylinderGeometry(0.16, 0.19, HD, 10), timber, x, HD / 2, 1.6, g);
		box(g, x - 0.25, x + 0.25, 0, 0.18, 1.35, 1.85, flags, 1);
	}
	// arched niches in the side walls
	const niche = std(0x3a2c20, { roughness: 0.9 }), rimM = std(0xcfc2a4, { roughness: 0.8 });
	for (const z of [-1.4, 1.6]) for (const sx of [-1, 1]) {
		const x = X + sx * 3.99;
		box(g, x - 0.01, x + 0.01, 0.8, 1.9, z - 0.5, z + 0.5, niche, 1);
		const c = mesh(new THREE.CircleGeometry(0.5, 20, 0, Math.PI), niche, x - sx * 0.005, 1.9, z, g);
		c.rotation.y = -sx * Math.PI / 2;
		const a = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 20, Math.PI), rimM, x - sx * 0.02, 1.9, z, g);
		a.rotation.y = Math.PI / 2;
		for (const sz of [-1, 1]) box(g, x - 0.04, x + 0.04, 0.8, 1.9, z + sz * 0.55 - 0.05, z + sz * 0.55 + 0.05, rimM, 1);
	}
	daylight(ctx, X, 1.6, 6.2, 4, 3.4, "court", 6, [X, 0, 1]);
	// Baba's portrait on the back wall, the stone he sat on before it on a marble step
	const pw = 1.25, ph = 1.72;
	const pt = portraitTex();
	mesh(new THREE.PlaneGeometry(pw, ph), std(0xffffff, { map: pt, roughness: 0.55, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.12 }), X, 0.85 + ph / 2 + 0.1, -3.38, g);
	box(g, X - pw / 2 - 0.06, X + pw / 2 + 0.06, 0.88, 0.95 + ph + 0.04, -3.42, -3.39, M.gold, 1);
	garland(g, V(X - pw / 2, 0.95 + ph, -3.3), V(X + pw / 2, 0.95 + ph, -3.3), 0.4, 0.03, M.marigold, M.rose);
	box(g, X - 0.85, X + 0.85, 0, 0.32, -3.4, -2.45, trim, 1);
	let sg = new THREE.IcosahedronGeometry(1, 3);
	sg.deleteAttribute("normal");
	sg.deleteAttribute("uv");
	sg = mergeVertices(sg);
	const sp = sg.attributes.position;
	for (let i = 0; i < sp.count; i++) {
		const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), n = 1 + (fbm(x * 2 + 5, z * 2 + y, 3) - 0.5) * 0.35;
		sp.setXYZ(i, x * 0.42 * n, Math.max(-0.2, y) * 0.16 * n, z * 0.3 * n);
	}
	sg.computeVertexNormals();
	mesh(sg, std(0xd8d0c4, { map: grainTex(0xa8a296, 99), roughness: 0.7 }), X, 0.36, -2.92, g);
	beads(g, new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => V(X + Math.cos((i / 24) * Math.PI * 2) * 0.44, 0.37, -2.92 + Math.sin((i / 24) * Math.PI * 2) * 0.32)), true), 0.028, M.marigold, M.rose);
	heap(g, flowerKinds(M, false), 30, (R) => V(X + (R() - 0.5) * 0.4, 0.43, -2.92 + (R() - 0.5) * 0.2), 100);
	for (const x of [-0.65, 0.65]) kit.diya(g, X + x, 0.32, -2.6);
	kit.samai(g, X + 1.25, 0, -2.8, 1.0, 5);
	// the dhuni: a fire of logs in a raised pit, behind an iron grill, with a basin of its udi beside it
	const D = [X - 2.4, -1.0];
	const brick = std(0x7a3a26, { roughness: 0.9 });
	box(g, D[0] - 0.6, D[0] + 0.6, 0, 0.28, D[1] - 0.6, D[1] + 0.6, brick, 1);
	const cinder = std(0x6a625a, { roughness: 1, emissive: 0x2a0800, emissiveIntensity: 0.5 });
	mesh(new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), cinder, D[0], 0.24, D[1], g).scale.y = 0.25;
	const logs = [];
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		logs.push([new THREE.CylinderGeometry(0.05, 0.06, 0.7, 7), D[0] + Math.cos(a) * 0.12, 0.42, D[1] + Math.sin(a) * 0.12, 1.0, -a, 0]);
	}
	merged(g, std(0x2a1a10, { roughness: 0.9, emissive: 0x3a0e00, emissiveIntensity: 0.6 }), logs);
	for (const [x, z, sc] of [[0, 0, 7.5], [0.12, 0.05, 5.5], [-0.12, -0.04, 6], [0.04, -0.13, 5], [-0.06, 0.13, 5.2]]) kit.flame(g, D[0] + x, 0.36, D[1] + z, sc, 0.6);
	kit.light(D[0], 0.9, D[1] + 0.3, 7, 8, 0xff7a28, null, true);
	ctx.smokeFrom.push(V(D[0], 1.0, D[1]));
	const bars = [];
	const gx0 = D[0] - 0.75, gx1 = D[0] + 0.75, gz0 = D[1] - 0.75, gz1 = D[1] + 0.75, gh = 1.45;
	for (const [a, b] of [[[gx0, gz1], [gx1, gz1]], [[gx1, gz1], [gx1, gz0]], [[gx0, gz1], [gx0, gz0]], [[gx0, gz0], [gx1, gz0]]]) {
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(l / 0.11);
		for (let k = 0; k <= n; k++) bars.push([new THREE.CylinderGeometry(0.011, 0.011, gh, 5), lerp(a[0], b[0], k / n), gh / 2, lerp(a[1], b[1], k / n)]);
		for (const y of [0.05, 0.7, gh]) bars.push([new THREE.BoxGeometry(l + 0.03, 0.035, 0.035), (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, 0, Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2, 0]);
	}
	merged(g, std(0x1c1a18, { roughness: 0.5, metalness: 0.6 }), bars);
	const U = [X - 1.32, -0.12];
	mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.72, 10), timber, U[0], 0.36, U[1], g);
	mesh(lathe([[0, 0], [0.12, 0.0], [0.2, 0.06], [0.22, 0.1], [0, 0.08]], 20), M.copper, U[0], 0.72, U[1], g);
	mesh(new THREE.SphereGeometry(0.19, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.ash, U[0], 0.76, U[1], g).scale.y = 0.25;
	kit.hanging(g, X - 0.8, HD, 0.4, 1.1);
	kit.hanging(g, X + 1.2, HD, -1.4, 1.1);
	kit.light(X + 0.2, 2.3, -0.8, 5, 9);
	for (const [x, z] of [[X - 3.3, 1.6], [X - 3.4, 2.9], [X + 3.1, -2.5]]) {
		const m = crowdFigure(811 + Math.round(x * 7 + z * 13), "shirdi");
		KEEP.add(m.material);
		m.scale.setScalar(1 / 0.28);
		m.position.set(x, 0, z);
		m.rotation.y = Math.atan2(X - x, -2.9 - z);
		g.add(m);
	}
	common(ctx, 12);
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		rooms: [[-5.4, 5.4, 0.15, 4.6, -6.7, 9.7], [X - 3.9, X + 3.9, 0.15, 3.5, -3.3, 3.95]],
		deityPts: [[0, 1.2, -5.25], [0, 3.3, -5.25], [-1.1, 0.4, SZ], [1.1, 0.4, SZ]],
		pts: { wash: [-0.6, 0.3, 11.3], samadhi: [0, 1.0, SZ], murti: [0, 2.8, -5.25], dhuni: [D[0], 0.6, D[1]], grill: [D[0], 1.45, D[1] - 0.75], udi: [U[0], 0.8, U[1]], shila: [X, 0.4, -2.92], portrait: [X, 2.75, -3.38] },
		floor: () => 0, noTouch: true, highDeity: true, mark: "udi", priestMark: "chandan", plate: "chadar",
		// sandals and staff at the door, outside; then into the queue
		start: [1.4, 11.8], enterPath: [[1.4, 11.8], [0.3, 10.9]], staffRest: [1.62, 10.32], staffTilt: [-0.07, 0], sandals: [0.65, 11.15], washFace: [-0.6, 11.3],
		queue: [[0.3, 10.9], [0.5, 8.8], [3.6, 5.8], [3.6, -0.2], [3.4, -0.98], [0.35, -1.08]], queueSpeed: 0.85, doorFace: [0, -5.25],
		toFront: [[0.35, -1.08], [0.35, -1.15]], front: [0.35, -1.15], target: [0, -5.25],
		priestHome: [-1.35, -1.95], priestFace: [0.35, -1.15], priestTake: [0.15, -1.92], priestPlace: [0.0, -1.98],
		priestAarti: [0.2, -2.0], aartiSpot: [0.35, -1.2], markSpot: [0.35, -1.2], priestMarkSpot: [0.3, -1.85],
		// Dwarkamai: in at the door, to the dhuni and its basin of udi; then the bow before the stone
		dhuniPath: [[X + 0.4, 3.6], [X + 0.1, 1.8], [X - 0.92, 0.32]], dhuniFace: D, udiAt: [U[0], 0.84, U[1]],
		bowPath: [[X - 0.92, 0.32], [X - 0.3, 0.9], [X, 0.45]], bowFace: [X, -2.92],
		cams: {
			enter: Object.assign(F(["T", "wash"], 182, 12, 1.15), { room: [-6.2, 6.2, 0.15, 4.9, 6.0, 12.8] }),
			queue: { orbit: [0, -5.25], back: 2.3, out: 0, side: -0.9, h: 1.65, lookH: 1.5, ahead: 2 },
			darshan: Object.assign(F(["T", "D"], 12, 8, 0.8), { padP: 0.95 }),
			offer: F(["T", "P", "samadhi"], 55, 16),
			aarti: F(["T", "P", "D"], 38, 10),
			flame: F(["T", "P"], 70, 10),
			mark: F(["T", "P"], 100, 8),
			dhuni: F(["T", "dhuni", "udi"], 125, 14),
			bow: F(["T", "shila", "portrait"], 50, 16),
		},
	};
}
// ---------- the Kailash journey: rituals out of doors ----------
// Mansarovar's shore, the camp under the north face at Dirapuk, the Dolma La and Yam Dwar. No room here: a sky dome
// and a painted panorama of the country round about (Kailash's banded pyramid, the lake, Gurla Mandhata's snows),
// ground laid as a height grid the feet stand on, high-altitude daylight (dusk at Dirapuk), prayer flags in the wind.
// Each builder returns its layout with outdoor: true, its own props (props), and a tick for the wind, the fire and
// the snow. Units are metres; the traveller starts towards +z and looks towards -z, where Kailash stands.
const KAIL_R = 55; // the panorama's radius
const KAIL_EYE = 1.5;
const FLAG_COLS = [0x2a5ab8, 0xf2f0e8, 0xc8262a, 0x2f8a4a, 0xf0c41e]; // blue, white, red, green, yellow
// A sky dome: zenith to horizon, and the ground colour below it.
function skyDome(top, horizon, below) {
	const geo = new THREE.SphereGeometry(70, 48, 24);
	const p = geo.attributes.position, col = [];
	const a = new THREE.Color(top), b = new THREE.Color(horizon), c = new THREE.Color(below), t = new THREE.Color();
	for (let i = 0; i < p.count; i++) {
		const y = p.getY(i) / 70;
		if (y >= 0) t.copy(b).lerp(a, Math.pow(y, 0.55));
		else t.copy(b).lerp(c, Math.min(1, -y * 6));
		col.push(t.r, t.g, t.b);
	}
	geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	m.renderOrder = -2;
	return m;
}
// Where an angle of elevation (radians) falls on the panorama's canvas, and where an azimuth to the right of -z does.
const panY = (H, a) => H * (1 - (KAIL_R * Math.tan(a) + KAIL_EYE + 30) / 64);
const panX = (W, az) => (((0.5 - az / (Math.PI * 2)) % 1) + 1) % 1 * W;
const deg = (d) => (d * Math.PI) / 180;
// A ridge line across the canvas from x0 to x1, its height (elevation) from f(u), filled down to the bottom.
function ridgeFill(g, W, H, x0, x1, f, fill) {
	g.fillStyle = fill;
	g.beginPath();
	g.moveTo(x0, H);
	for (let x = x0; x <= x1; x += 4) g.lineTo(x, panY(H, f((x - x0) / (x1 - x0), x)));
	g.lineTo(x1, H);
	g.closePath();
	g.fill();
}
// Kailash: the dome-topped pyramid of dark rock banded with ledges of snow, the great gully down the middle of the
// face, the snowcap, a collar of cloud at its foot; lit golden from one side at dusk (glow).
function paintKailash(g, cx, base, w, h, R, glow = 0, north = false) {
	g.save();
	const shape = () => {
		g.beginPath();
		g.moveTo(cx - w * 0.5, base);
		g.bezierCurveTo(cx - w * 0.44, base - h * 0.35, cx - w * 0.36, base - h * 0.62, cx - w * 0.26, base - h * 0.84);
		g.quadraticCurveTo(cx - w * 0.12, base - h * 1.01, cx, base - h);
		g.quadraticCurveTo(cx + w * 0.13, base - h * 1.0, cx + w * 0.27, base - h * 0.83);
		g.bezierCurveTo(cx + w * 0.37, base - h * 0.6, cx + w * 0.45, base - h * 0.33, cx + w * 0.5, base);
		g.closePath();
	};
	shape();
	const rock = g.createLinearGradient(0, base - h, 0, base);
	rock.addColorStop(0, north ? "#5a4c42" : "#6a5c50");
	rock.addColorStop(1, "#2c2622");
	g.fillStyle = rock;
	g.fill();
	g.clip();
	// the strata: ledges of snow lying across the face, thicker towards the top
	for (let i = 0; i < 26; i++) {
		const t = i / 26, y = base - h * (0.08 + t * 0.9);
		const th = h * (0.006 + t * t * 0.018) * (0.6 + R() * 0.8);
		g.fillStyle = `rgba(240,244,250,${0.55 + t * 0.4})`;
		g.beginPath();
		g.moveTo(cx - w, y);
		for (let x = -w; x <= w; x += w / 30) g.lineTo(cx + x, y + Math.sin(x * 0.07 + i) * th * 0.8 + (R() - 0.5) * th);
		for (let x = w; x >= -w; x -= w / 30) g.lineTo(cx + x, y + th + Math.sin(x * 0.05 + i * 2) * th * 0.6);
		g.fill();
	}
	// the snowcap
	g.fillStyle = "rgba(242,246,252,0.92)";
	g.beginPath();
	g.ellipse(cx, base - h * 0.97, w * 0.27, h * 0.13, 0, 0, Math.PI * 2);
	g.fill();
	// the vertical gully down the middle of the face, filled with snow, its shadow beside it
	g.fillStyle = "rgba(20,16,14,0.45)";
	g.fillRect(cx + w * 0.012, base - h * 0.86, w * 0.02, h * 0.62);
	g.fillStyle = "rgba(236,240,248,0.88)";
	g.beginPath();
	g.moveTo(cx - w * 0.012, base - h * 0.9);
	g.lineTo(cx + w * 0.012, base - h * 0.9);
	g.lineTo(cx + w * 0.006, base - h * 0.22);
	g.lineTo(cx - w * 0.008, base - h * 0.22);
	g.fill();
	// the side away from the light in shadow, the near side lit
	const side = g.createLinearGradient(cx - w * 0.5, 0, cx + w * 0.5, 0);
	side.addColorStop(0, "rgba(255,240,215,0.08)");
	side.addColorStop(0.5, "rgba(0,0,0,0)");
	side.addColorStop(1, "rgba(10,14,30,0.42)");
	g.fillStyle = side;
	g.fillRect(cx - w, base - h * 1.1, w * 2, h * 1.2);
	if (glow > 0) {
		const gl = g.createLinearGradient(0, base - h, 0, base - h * 0.35);
		gl.addColorStop(0, `rgba(255,170,90,${0.55 * glow})`);
		gl.addColorStop(1, "rgba(255,170,90,0)");
		g.fillStyle = gl;
		g.fillRect(cx - w, base - h * 1.1, w * 2, h);
	}
	g.restore();
	// foothills in front of its foot, darker, and the collar of cloud
	g.fillStyle = "#3a322c";
	g.beginPath();
	g.moveTo(cx - w * 0.8, base + h * 0.02);
	for (let x = -0.8; x <= 0.8; x += 0.04) g.lineTo(cx + x * w, base - h * (0.12 + 0.08 * Math.sin(x * 9) + 0.05 * R()) * (1 - Math.abs(x) * 0.6));
	g.lineTo(cx + w * 0.8, base + h * 0.05);
	g.fill();
	for (let i = 0; i < 26; i++) {
		const x = cx + (R() - 0.5) * w * 1.1, y = base - h * (0.1 + R() * 0.08), r = w * (0.05 + R() * 0.07);
		const cg = g.createRadialGradient(x, y, 0, x, y, r);
		cg.addColorStop(0, `rgba(235,236,240,${0.28 + R() * 0.2})`);
		cg.addColorStop(1, "rgba(235,236,240,0)");
		g.fillStyle = cg;
		g.fillRect(x - r, y - r, r * 2, r * 2);
	}
}
// A broad snow massif (Gurla Mandhata, the ranges round the pass).
function paintSnowRange(g, W, H, x0, x1, base, top, R) {
	g.fillStyle = "#6a6058";
	g.beginPath();
	g.moveTo(x0, panY(H, base));
	const n = 40, pts = [];
	for (let i = 0; i <= n; i++) {
		const u = i / n, e = base + (top - base) * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.8 + 0.25 * R());
		pts.push([lerp(x0, x1, u), panY(H, e)]);
	}
	for (const [x, y] of pts) g.lineTo(x, y);
	g.lineTo(x1, panY(H, base));
	g.fill();
	g.fillStyle = "rgba(240,244,250,0.9)";
	g.beginPath();
	pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
	for (let i = n; i >= 0; i--) {
		const [x, y] = pts[i];
		g.lineTo(x, y + (panY(H, base) - y) * (0.35 + 0.2 * Math.sin(i * 1.7)));
	}
	g.fill();
}
// The panorama round each place, on a canvas wrapped round the inside of a cylinder (transparent sky).
function panorama(kind) {
	const W = 4096, H = 1024, R = rand(kind.length * 17 + 3);
	const c = canvas(W, H, (g) => {
		g.clearRect(0, 0, W, H);
		const hills = (e0, e1, col, k = 9, seed = 1) => ridgeFill(g, W, H, 0, W, (u) => e0 + (e1 - e0) * fbm(u * k + seed, seed * 0.7, 4), col);
		if (kind === "mansarovar") {
			// across the water to the north: brown hills, and Kailash white above them; Gurla Mandhata behind
			hills(deg(0.4), deg(3.2), "#8a7a64", 7, 3);
			paintKailash(g, panX(W, deg(-6)), panY(H, deg(1.6)), W * 0.05, H * 0.11, R, 0.15);
			hills(deg(0.2), deg(1.2), "#7a6a56", 15, 5);
			paintSnowRange(g, W, H, panX(W, deg(178)), panX(W, deg(138)), deg(1), deg(14), R);
			hills(deg(-0.2), deg(4), "#7e705c", 11, 9);
			// the far shore of the lake: a thin line of pale beach at the foot of the hills, water below it
			g.fillStyle = "rgba(60,150,170,1)";
			g.fillRect(panX(W, deg(60)), panY(H, deg(0.25)), panX(W, deg(-60)) - panX(W, deg(60)), panY(H, deg(-6)) - panY(H, deg(0.25)));
		} else if (kind === "dirapuk") {
			// the north face, close and filling the head of the valley, the valley walls either side
			paintKailash(g, panX(W, 0), panY(H, deg(4)), W * 0.2, H * 0.52, R, 1, true);
			ridgeFill(g, W, H, panX(W, deg(-25)), panX(W, deg(-90)), (u) => deg(10 + 12 * fbm(u * 6, 2, 4) - u * 6), "#4a3a30");
			ridgeFill(g, W, H, panX(W, deg(90)), panX(W, deg(25)), (u) => deg(4 + 12 * fbm(u * 6, 7, 4) + u * 4), "#54423a");
			hills(deg(1), deg(9), "#5e4e44", 10, 11);
		} else if (kind === "dolmala") {
			// rock and snow all round the pass; on the right, far below, the emerald Gauri Kund
			hills(deg(2), deg(16), "#5a524c", 8, 13);
			paintSnowRange(g, W, H, panX(W, deg(-20)), panX(W, deg(-120)), deg(3), deg(18), R);
			paintSnowRange(g, W, H, panX(W, deg(170)), panX(W, deg(110)), deg(2), deg(12), R);
			hills(deg(-2), deg(6), "#6a6058", 14, 17);
			// the drop into the valley on the right, and the lake in its hollow
			ridgeFill(g, W, H, panX(W, deg(140)), panX(W, deg(40)), (u) => deg(-6 - 10 * Math.sin(Math.PI * u)), "#5c544c");
			const gx = panX(W, deg(88)), gy = panY(H, deg(-17));
			const gk = g.createRadialGradient(gx, gy, 0, gx, gy, W * 0.03);
			gk.addColorStop(0, "#1f8a7a");
			gk.addColorStop(0.7, "#2a9a86");
			gk.addColorStop(1, "#cfe4e0");
			g.fillStyle = gk;
			g.beginPath();
			g.ellipse(gx, gy, W * 0.03, H * 0.022, 0, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = "rgba(240,244,250,0.85)";
			g.beginPath();
			g.ellipse(gx - W * 0.012, gy - H * 0.006, W * 0.012, H * 0.008, 0.2, 0, Math.PI * 2);
			g.fill();
		} else {
			// Yam Dwar: the south-west face of Kailash above the ridges, the Barkha plain behind
			hills(deg(1), deg(6), "#7a6a58", 8, 19);
			paintKailash(g, panX(W, deg(4)), panY(H, deg(5)), W * 0.09, H * 0.27, R, 0.1);
			hills(deg(0.5), deg(3.5), "#6e604e", 13, 23);
			hills(deg(-0.5), deg(1.2), "#8e806a", 20, 29);
		}
		// a little haze over the distance
		const hz = g.createLinearGradient(0, panY(H, deg(10)), 0, panY(H, deg(-2)));
		hz.addColorStop(0, "rgba(200,215,230,0)");
		hz.addColorStop(1, "rgba(200,215,230,0.25)");
		g.globalCompositeOperation = "source-atop";
		g.fillStyle = hz;
		g.fillRect(0, 0, W, H);
		g.globalCompositeOperation = "source-over";
	});
	const t = texOf(c);
	t.wrapS = THREE.RepeatWrapping;
	t.wrapT = THREE.ClampToEdgeWrapping;
	return t;
}
function backdrop(ctx, kind, sky) {
	const g = ctx.g;
	g.add(skyDome(...sky));
	const cyl = new THREE.Mesh(new THREE.CylinderGeometry(KAIL_R, KAIL_R, 64, 96, 1, true), new THREE.MeshBasicMaterial({ map: panorama(kind), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	cyl.position.y = 2;
	cyl.renderOrder = -1;
	g.add(cyl);
}
// Ground the feet stand on: a height grid over ±ext metres, coloured by colour(x, z, y).
function groundGrid(ctx, floor, colour, ext = 30, step = 0.5) {
	const n = Math.round((ext * 2) / step) + 1;
	const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
	const c = new THREE.Color();
	for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
		const x = -ext + i * step, z = -ext + j * step, y = floor(x, z), k = j * n + i;
		pos.set([x, y, z], k * 3);
		c.set(colour(x, z, y));
		const v = 0.88 + 0.24 * fbm(x * 0.9 + 3, z * 0.9, 3);
		col.set([c.r * v, c.g * v, c.b * v], k * 3);
		if (i < n - 1 && j < n - 1) idx.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	const m = mesh(geo, std(0xffffff, { vertexColors: true, roughness: 0.95, map: gritTex() }), 0, 0, 0, ctx.g);
	m.castShadow = false;
	// world-space uvs for the grit texture
	const uv = new Float32Array(n * n * 2);
	for (let k = 0; k < n * n; k++) uv.set([pos[k * 3] * 0.6, pos[k * 3 + 2] * 0.6], k * 2);
	geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
	return m;
}
let _grit;
function gritTex() {
	if (_grit) return _grit;
	const R = rand(77);
	_grit = texOf(canvas(256, 256, (g, W, H) => {
		g.fillStyle = "#d8d8d8";
		g.fillRect(0, 0, W, H);
		for (let i = 0; i < 2600; i++) {
			const v = 150 + R() * 105, r = 1 + R() * 4;
			g.fillStyle = `rgb(${v},${v},${v})`;
			g.beginPath();
			g.ellipse(R() * W, R() * H, r, r * (0.5 + R() * 0.5), R() * 3, 0, Math.PI * 2);
			g.fill();
		}
	}));
	KEEP.add(_grit);
	return _grit;
}
// Loose stones and boulders scattered where ok(x, z) allows, sitting on the ground.
function stones(ctx, n, seed, floor, ok, size = [0.08, 0.5], col = 0x8a7f74) {
	const R = rand(seed);
	const geo = new THREE.IcosahedronGeometry(0.5, 1);
	const p = geo.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const k = 1 + Math.sin(p.getX(i) * 9 + p.getY(i) * 7) * 0.12 + Math.cos(p.getZ(i) * 8) * 0.1;
		p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
	}
	geo.computeVertexNormals();
	const im = new THREE.InstancedMesh(geo, std(col, { roughness: 0.9 }), n);
	const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V(), c = new THREE.Color();
	let k = 0;
	for (let i = 0; i < n * 4 && k < n; i++) {
		const x = (R() - 0.5) * 56, z = (R() - 0.5) * 56;
		if (!ok(x, z)) continue;
		const sz = lerp(size[0], size[1], Math.pow(R(), 3));
		e.set((R() - 0.5) * 0.5, R() * 6.3, (R() - 0.5) * 0.5);
		q.setFromEuler(e);
		s.set(sz * (0.8 + R() * 0.5), sz, sz * (0.8 + R() * 0.5));
		m4.compose(V(x, floor(x, z) + sz * 0.15, z), q, s);
		im.setMatrixAt(k, m4);
		c.set(col).offsetHSL(0, 0, (R() - 0.5) * 0.12);
		im.setColorAt(k, c);
		k++;
	}
	im.count = k;
	im.castShadow = im.receiveShadow = true;
	ctx.g.add(im);
	return im;
}
// Strings of prayer flags between points [a, b, sag], each flag a small cloth that flaps; wind in tick().
function flagStrings(ctx, strings, size = [0.2, 0.15], gap = 0.27) {
	const items = [], lines = [];
	for (const [a, b, sag] of strings) {
		const len = a.distanceTo(b), n = Math.max(2, Math.floor(len / gap));
		let prev = null;
		for (let i = 0; i <= n; i++) {
			const u = i / n, p = a.clone().lerp(b, u);
			p.y -= sag * 4 * u * (1 - u);
			if (prev) lines.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
			if (i > 0 && i < n) items.push({ p: p.clone(), t: b.clone().sub(a).normalize(), c: FLAG_COLS[i % 5] });
			prev = p;
		}
	}
	const geo = new THREE.PlaneGeometry(size[0], size[1], 2, 1);
	geo.translate(0, -size[1] / 2, 0);
	const grp = new THREE.Group();
	ctx.g.add(grp);
	const im = new THREE.InstancedMesh(geo, std(0xffffff, { roughness: 0.85, side: THREE.DoubleSide }), Math.max(1, items.length));
	const c = new THREE.Color();
	items.forEach((it, i) => {
		c.set(it.c);
		im.setColorAt(i, c);
	});
	im.count = items.length;
	im.castShadow = true;
	grp.add(im);
	const lg = new THREE.BufferGeometry();
	lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
	grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a342c })));
	const m4 = new THREE.Matrix4(), bx = V(), by = V(), bz = V(), up = V(0, 1, 0), q = new THREE.Quaternion(), qa = new THREE.Quaternion();
	const set = (t) => {
		items.forEach((it, i) => {
			bx.copy(it.t);
			bz.crossVectors(bx, up).normalize();
			by.crossVectors(bz, bx);
			m4.makeBasis(bx, by, bz);
			q.setFromRotationMatrix(m4);
			qa.setFromAxisAngle(bx, Math.sin(t * 3.1 + i * 0.7) * 0.45 + Math.sin(t * 7.3 + i) * 0.12 + 0.35);
			m4.compose(it.p, qa.multiply(q), V(1, 1, 1));
			im.setMatrixAt(i, m4);
		});
		im.instanceMatrix.needsUpdate = true;
	};
	set(0);
	(ctx.ticks ||= []).push((dt, t) => set(t));
	return grp;
}
// Sun and sky light for the place, with shadows; and the whole set's tick.
function outdoorLight(ctx, { sun = 0xfff2dc, sunI = 3.0, dir = [0.5, 0.8, 0.35], sky = 0xbcd4f0, ground = 0x8a7a64, hemi = 1.2 }) {
	const s = new THREE.DirectionalLight(sun, sunI);
	s.position.set(dir[0] * 20, dir[1] * 20, dir[2] * 20);
	if (!ctx.low) {
		s.castShadow = true;
		s.shadow.mapSize.set(2048, 2048);
		const c = s.shadow.camera;
		c.left = c.bottom = -12;
		c.right = c.top = 12;
		c.near = 1;
		c.far = 60;
		s.shadow.bias = -0.0005;
		s.shadow.normalBias = 0.02;
	}
	ctx.g.add(s, s.target);
	ctx.g.add(new THREE.HemisphereLight(sky, ground, hemi));
}
// A stone altar heaped with mani stones and a juniper burner or a lamp before it: the batch's puja place.
function cairn(ctx, x, z, floor, w = 1.2, d = 0.7, h = 0.45) {
	const g = ctx.g, y = floor(x, z);
	const stone = std(0x8a8076, { roughness: 0.92, map: gritTex() });
	mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), stone, x, y + h / 2, z, g);
	const R = rand(Math.round(x * 13 + z * 7) + 5);
	for (let i = 0; i < 18; i++) {
		const s = mesh(new THREE.BoxGeometry(0.16 + R() * 0.12, 0.04 + R() * 0.04, 0.12 + R() * 0.08), std([0x9a9086, 0x7a7068, 0xb0a698][i % 3], { roughness: 0.85 }), x + (R() - 0.5) * (w - 0.2), y + h + 0.02 + R() * 0.12, z + (R() - 0.5) * (d - 0.2), g);
		s.rotation.set((R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3);
	}
	// a carved mani stone set upright on top: OM MANI PADME HUM
	const mani = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.05), [stone, stone, stone, stone, std(0xffffff, { map: maniTex(), roughness: 0.85 }), stone]);
	mani.position.set(x, y + h + 0.13, z + d / 2 - 0.1);
	mani.castShadow = true;
	g.add(mani);
	return y + h;
}
let _mani;
function maniTex() {
	if (_mani) return _mani;
	_mani = texOf(canvas(256, 160, (g, W, H) => {
		g.fillStyle = "#8a8078";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#e8e0d0";
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.font = `600 30px "Noto Sans Tibetan", serif`;
		g.fillText("ༀ་མ་ཎི་པ་དྨེ་ཧཱུྃ", W / 2, H / 2, W - 16);
	}));
	KEEP.add(_mani);
	return _mani;
}
// A pole with strings of flags fanned out from its top to anchors round it.
function flagPole(ctx, x, z, h, floor, spread, n, seed, a0 = 0, a1 = Math.PI * 2) {
	const y = floor(x, z);
	mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 8), std(0x6a4a2e, { roughness: 0.8 }), x, y + h / 2, z, ctx.g);
	const R = rand(seed), top = V(x, y + h, z), out = [];
	for (let i = 0; i < n; i++) {
		const a = lerp(a0, a1, (i + R() * 0.6) / n), r = spread * (0.7 + R() * 0.45);
		const bx = x + Math.sin(a) * r, bz = z + Math.cos(a) * r;
		out.push([top.clone().add(V(0, -R() * 0.4, 0)), V(bx, floor(bx, bz) + 0.1, bz), 0.15 + R() * 0.25]);
	}
	return out;
}
// The Tibetan butter lamps on the altar: brass cups, some lit; khatas draped.
function butterLamps(ctx, x, y, z, rows, cols, unlitAt) {
	const g = ctx.g, M = ctx.M, out = { lit: null };
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
		const px = x + (c - (cols - 1) / 2) * 0.09, pz = z + r * 0.09;
		mesh(lathe([[0, 0], [0.025, 0], [0.012, 0.012], [0.01, 0.05], [0.032, 0.07], [0.036, 0.09], [0, 0.085]], 12), M.brass, px, y, pz, g);
		const isNew = unlitAt && r === unlitAt[0] && c === unlitAt[1];
		const f = ctx.kit.flame(g, px, y + 0.095, pz, 0.7, 0.6);
		if (isNew) out.lit = { f, p: V(px, y + 0.09, pz) };
	}
	ctx.kit.light(x, y + 0.4, z + 0.1, 2.5, 4, 0xffb060);
	return out;
}

function mansarovar(ctx) {
	const { g, M, kit } = ctx;
	ctx.ticks = [];
	// the shore at Qugu: a pebble beach shelving into clear turquoise water; the lake reaches the far shore
	const floor = (x, z) => (z > 1.2 ? 0.06 + (z - 1.2) * 0.014 + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.08 : lerp(-1.4, 0.06, ease((z + 6) / 7.2)));
	backdrop(ctx, "mansarovar", [0x1d4f9e, 0xb8d0e8, 0x6a7a80]);
	outdoorLight(ctx, { dir: [0.55, 0.62, -0.35], sunI: 5.4, hemi: 1.6, sky: 0xc0d8f2, ground: 0x9a8a70 });
	groundGrid(ctx, floor, (x, z, y) => (y < 0 ? 0x8a8a7a : y < 0.12 ? 0xa49c8c : 0xa8946e));
	stones(ctx, 380, 11, floor, (x, z) => z > -2 && Math.hypot(x - 0.4, z - 0.4) > 1.6 && Math.hypot(x + 2.2, z - 3.6) > 1.6, [0.05, 0.35], 0x9a948a);
	const water = new THREE.Mesh(new THREE.PlaneGeometry(130, 75, 1, 1).rotateX(-Math.PI / 2), std(0x2a9ab0, { roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.78, envMapIntensity: 1.2 }));
	water.position.set(0, 0, 1.25 - 37.5);
	water.receiveShadow = true;
	g.add(water);
	// shallows over the pebbles, paler
	const shallow = new THREE.Mesh(new THREE.PlaneGeometry(60, 6).rotateX(-Math.PI / 2), std(0x6ad0d4, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));
	shallow.position.set(0, 0.004, -1.8);
	g.add(shallow);
	// the havan kund: a square of stones round the fire, the elder's things beside it
	const hk = [-2.2, 3.4], hy = floor(hk[0], hk[1]);
	const stone = std(0x8a8076, { roughness: 0.9, map: gritTex() });
	for (const [dx, dz, w, d] of [[0, -0.32, 0.72, 0.1], [0, 0.32, 0.72, 0.1], [-0.32, 0, 0.1, 0.54], [0.32, 0, 0.1, 0.54]]) mesh(new THREE.BoxGeometry(w, 0.22, d), stone, hk[0] + dx, hy + 0.11, hk[1] + dz, g);
	mesh(new THREE.BoxGeometry(0.54, 0.06, 0.54), std(0x2a1c14, { roughness: 1 }), hk[0], hy + 0.04, hk[1], g);
	for (let i = 0; i < 6; i++) {
		const l = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 6), std(0x5a3a22), hk[0] + (i % 3 - 1) * 0.12, hy + 0.12 + Math.floor(i / 3) * 0.05, hk[1], g);
		l.rotation.z = Math.PI / 2;
		l.rotation.y = i * 0.9;
	}
	const fire = [];
	for (let i = 0; i < 5; i++) fire.push(kit.flame(g, hk[0] + (i % 3 - 1) * 0.1, hy + 0.14, hk[1] + (i > 2 ? 0.08 : -0.05), 3.4 + (i % 2) * 0.8, 1.2));
	const fl = kit.light(hk[0], hy + 0.6, hk[1], 4, 6, 0xff8a30);
	ctx.smokeFrom.push(V(hk[0], hy + 0.55, hk[1]));
	// the elder's brass plate of samagri and the ghee pot beside the kund
	mesh(lathe([[0, 0], [0.13, 0.004], [0.14, 0.02], [0.125, 0.018], [0, 0.008]], 20), M.brass, hk[0] - 0.55, hy + 0.01, hk[1] - 0.45, g);
	heap(g, [[new THREE.SphereGeometry(0.008, 5, 4), std(0x8a5a2a), 0.6], [new THREE.SphereGeometry(0.01, 5, 4), M.marigold, 0.4]], 40, domeSampler(hk[0] - 0.55, hy + 0.02, hk[1] - 0.45, 0.1, 0.03), 31);
	mesh(lathe([[0, 0], [0.06, 0], [0.07, 0.06], [0.05, 0.1], [0, 0.1]], 14), M.brass, hk[0] + 0.55, hy, hk[1] - 0.45, g);
	// a few of the batch's water cans by the shore, a folded mat
	for (const [x, z, r] of [[2.6, 2.4, 0.3], [2.9, 2.2, 1.0], [3.3, 2.6, 2.1]]) {
		const can = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.13), std(0xf2f0ea, { roughness: 0.5 }), x, floor(x, z) + 0.15, z, g);
		can.rotation.y = r;
		mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), std(0x2a5ab8), x + 0.05, floor(x, z) + 0.32, z, g);
	}
	mesh(new THREE.BoxGeometry(0.9, 0.03, 0.6), std(0x8a2a2a, { roughness: 1 }), -2.2, floor(-2.2, 4.3) + 0.015, 4.3, g);
	// the traveller's own can, filled, set down on the shore once it is
	const mine = new THREE.Group();
	mesh(new THREE.BoxGeometry(0.2, 0.28, 0.12), std(0xf2f0ea, { roughness: 0.5 }), 0, 0.14, 0, mine);
	mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), std(0x2a5ab8), 0.05, 0.3, 0, mine);
	mine.position.set(1.05, floor(1.05, 1.9), 1.9);
	mine.rotation.y = 0.4;
	leftBehind(ctx, { can: mine });
	// prayer flags on two poles along the shore
	flagStrings(ctx, [[V(-5, floor(-5, 1.8) + 2.2, 1.8), V(3.8, floor(3.8, 2.2) + 2.0, 2.2), 0.5], [V(-5, floor(-5, 1.8) + 2.2, 1.8), V(-8, floor(-8, 5) + 0.2, 5), 0.2]]);
	for (const [x, z] of [[-5, 1.8], [3.8, 2.2]]) mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6), std(0x6a4a2e), x, floor(x, z) + 1.15, z, g);
	ctx.ticks.push((dt, t, F, S) => {
		// the fire flares as ghee is offered (the havan step sets S.fire each frame)
		const k = 1 + (S && S.fire ? S.fire : 0);
		if (S) S.fire = 0;
		fire.forEach((f, i) => f.f.scale.multiplyScalar(k * (1 + Math.sin(t * 5 + i) * 0.05)));
		fl.intensity = 4 * k * (0.9 + Math.sin(t * 11) * 0.1);
	});
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	const dip = [0.2, -1.6];
	return {
		outdoor: true, place: "The snan at Mansarovar", fog: new THREE.FogExp2(0xb8cce0, 0.006), exposure: 0.92,
		rooms: [[-14, 14, 0.25, 9, -14, 14]], floor, deityPts: [[0, 0.3, -3], [0, 1.5, -6]], pts: { kund: [hk[0], hy + 0.3, hk[1]], dip: [dip[0], 0.2, dip[1]], edge: [1.4, 0.2, 0.6], wash: [0.7, 0.3, 1.6] },
		mark: "tripundra", priestMark: "tripundra",
		start: [1.2, 7.4], enterPath: [[1.2, 7.4], [0.7, 3.2]], staffRest: [1.45, 3.05], staffTilt: [-0.1, 0.06], sandals: [1.05, 3.55], washFace: [0.6, -6],
		dipPath: [[0.7, 3.2], [0.5, 1.2], dip], dip, water: 0,
		kund: hk, havanT: [hk[0], hk[1] + 0.85], havanPath: [dip, [0.3, 0.9], [-0.9, 4.2], [hk[0], hk[1] + 0.85]], priestSit: [hk[0], hk[1] - 0.85],
		fillPath: [[hk[0], hk[1] + 0.85], [-0.4, 3.0], [1.3, 1.25]], fillAt: [1.3, -0.12, 0.45],
		toFront: [[1.3, 1.25], [0.4, 2.3]], front: [0.4, 2.3], target: [0, -60],
		bowPath: [[0.4, 2.3], [0.4, 2.7]], bowFace: [0.4, -60],
		priestHome: [-3.1, 3.9], priestFace: [-2.2, 3.4],
		props: () => kailashProps(ctx),
		tick: (dt, t, F, S) => ctx.ticks.forEach((f) => f(dt, t, F, S)),
		cams: {
			enter: F(["T", "wash"], 140, 14, 1.3),
			dip: F(["T", "dip"], 18, 10, 1.6),
			arghya: C([1.6, 1.4, 1.8], [0, 1.6, -5]),
			havan: F(["T", "P", "kund"], 70, 22, 1.15),
			fill: F(["T", "edge"], 120, 16, 1.4),
			darshan: C([1.5, 1.1, 5.6], [0, 1.9, -6]),
			bow: F(["T"], 115, 24, 1.3),
		},
	};
}

function dirapuk(ctx) {
	const { g, M, kit } = ctx;
	// the stony flat below the camp, the north face filling the head of the valley; the gompa's shrine at the side
	const floor = (x, z) => (fbm(x * 0.25 + 5, z * 0.25, 3) - 0.5) * 0.18 + Math.max(0, -z - 7) * 0.12 + Math.max(0, x - 6) * 0.18;
	backdrop(ctx, "dirapuk", [0x1c2c58, 0xe8b07a, 0x4a3a30]);
	outdoorLight(ctx, { sun: 0xffb070, sunI: 3.4, dir: [0.9, 0.25, 0.1], sky: 0x9aa8d0, ground: 0x6a4a3a, hemi: 1.3 });
	groundGrid(ctx, floor, (x, z, y) => (fbm(x * 0.4, z * 0.4, 2) > 0.55 ? 0x6e6a52 : 0x8a7a66));
	stones(ctx, 360, 21, floor, (x, z) => Math.hypot(x, z - 1.5) > 2.4 && !(x > 1.8 && x < 5.4 && z > -2.6 && z < 1.4), [0.06, 0.6], 0x7a6e64);
	const top = cairn(ctx, 0, 0, floor, 1.2, 0.7, 0.45);
	// a juniper burner (sang) by the cairn, its sweet smoke rising
	mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), std(0xf0ece4, { roughness: 0.9 }), -0.95, floor(-0.95, 0.1) + 0.25, 0.1, g);
	ctx.smokeFrom.push(V(-0.95, floor(-0.95, 0.1) + 0.55, 0.1));
	kit.light(-0.95, 0.9, 0.1, 1.2, 3, 0xff7a30);
	// flags from a pole behind the cairn
	flagStrings(ctx, flagPole(ctx, 0, -0.9, 3.4, floor, 5.5, 9, 41, Math.PI * 0.55, Math.PI * 1.45));
	// the gompa's little shrine: whitewashed walls under a maroon frieze, black-framed door, the altar inside
	const wx = 3.6, wz = -1.2, white = std(0xf2eee4, { roughness: 0.95 }), maroon = std(0x6a1c1c, { roughness: 0.9 }), black = std(0x1c1a18);
	const fy = floor(wx, wz);
	box(g, wx - 1.7, wx + 1.7, fy - 0.2, fy + 2.4, wz - 1.1, wz - 0.9, white);
	box(g, wx - 1.7, wx - 1.5, fy - 0.2, fy + 2.4, wz - 1.1, wz + 1.4, white);
	box(g, wx + 1.5, wx + 1.7, fy - 0.2, fy + 2.4, wz - 1.1, wz + 1.4, white);
	box(g, wx - 1.8, wx + 1.8, fy + 2.4, fy + 2.75, wz - 1.2, wz + 1.5, maroon);
	box(g, wx - 1.9, wx + 1.9, fy + 2.75, fy + 2.85, wz - 1.3, wz + 1.6, black);
	for (const sx of [-1, 1]) box(g, wx + sx * 1.6 - 0.06, wx + sx * 1.6 + 0.06, fy, fy + 2.4, wz + 1.38, wz + 1.46, black);
	// the altar table with its rows of butter lamps, a khata on the image's niche, a thangka
	box(g, wx - 1.2, wx + 1.2, fy, fy + 0.85, wz - 0.85, wz - 0.4, std(0x7a2a1a, { roughness: 0.7 }));
	box(g, wx - 0.5, wx + 0.5, fy + 0.85, fy + 1.9, wz - 0.98, wz - 0.9, std(0xffffff, { map: thangkaTex(), roughness: 0.8 }));
	box(g, wx - 0.6, wx + 0.6, fy + 1.92, fy + 1.97, wz - 0.95, wz - 0.85, std(0xf6f2ea, { roughness: 1 }));
	const lamps = butterLamps(ctx, wx, fy + 0.85, wz - 0.78, 3, 9, [2, 5]);
	ctx.ticks ||= [];
	ctx.ticks.push((dt, t, F) => {
		const on = F.has("lamp");
		lamps.lit.f.f.visible = lamps.lit.f.h.visible = on;
	});
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		outdoor: true, place: "Dirapuk, under the north face", fog: new THREE.FogExp2(0x9a8aa0, 0.005), exposure: 1.1,
		rooms: [[-14, 14, 0.25, 9, -14, 14]], floor, deityPts: [[0, top, 0], [0, top + 0.4, 0]], pts: { cairn: [0, top, 0], altar: [wx, fy + 0.9, wz - 0.7] },
		mark: "tripundra", priestMark: "tripundra", highDeity: true,
		start: [0.6, 6.2], staffRest: [0.9, 3.4], staffTilt: [-0.1, 0], sandals: [0.7, 3.5],
		toFront: [[0.6, 6.2], [0.45, 2.6]], front: [0.45, 2.6], target: [0, -60],
		aartiSpot: [0.45, 2.4], priestHome: [-1.7, 1.5], priestFace: [0, -60], priestAarti: [-0.35, 1.05],
		lampPath: [[0.45, 2.4], [2.6, 1.8], [wx - 0.2, wz + 0.55]], lampAt: lamps.lit.p, lampFace: [wx - 0.2, -10],
		bowPath: [[wx - 0.2, wz + 0.55], [1.6, 2.6], [0.45, 2.75]], bowFace: [0, -60],
		props: () => kailashProps(ctx),
		tick: (dt, t, F, S) => ctx.ticks.forEach((f) => f(dt, t, F, S)),
		cams: {
			darshan: C([1.7, 0.9, 6.4], [0, 4.6, -8]),
			aarti: F(["T", "P", "D"], 30, 12, 1.2),
			flame: F(["T", "P"], -110, 10, 1.15),
			lamp: F(["T", "altar"], 15, 14, 1.25),
			bow: F(["T"], 110, 26, 1.3),
		},
	};
}

function dolmala(ctx) {
	const { g, M, kit } = ctx;
	// the saddle of the pass: rock and old snow; on the right the ground drops away towards Gauri Kund
	const floor = (x, z) => (fbm(x * 0.3 + 9, z * 0.3, 3) - 0.5) * 0.25 - Math.pow(Math.max(0, x - 4.2), 1.25) * 0.5 + Math.max(0, -x - 5) * 0.35 + Math.max(0, -z - 6) * 0.2;
	backdrop(ctx, "dolmala", [0x2a5aa8, 0xd4e0ec, 0x7a7a80]);
	outdoorLight(ctx, { dir: [-0.3, 0.75, 0.5], sunI: 3.8, hemi: 2.0, sky: 0xd0dcec, ground: 0xb0aca8 });
	groundGrid(ctx, floor, (x, z, y) => (fbm(x * 0.5 + 2, z * 0.5, 3) > 0.62 ? 0xe8ecf0 : 0x7a726a));
	stones(ctx, 420, 31, floor, (x, z) => Math.hypot(x + 0.4, z + 0.6) > 2.4 && Math.hypot(x - 1, z - 3) > 2.2 && Math.hypot(x + 3.3, z - 2.6) > 1.2, [0.08, 0.7], 0x6e6660);
	// the Dolma stone, a great boulder half buried in flags and khatas
	const sx = -0.4, sz = -0.6, sy = floor(sx, sz);
	const rock = mesh(new THREE.IcosahedronGeometry(1, 2), std(0x6a625c, { roughness: 0.9, map: gritTex() }), sx, sy + 0.55, sz, g);
	rock.scale.set(1.1, 0.95, 0.9);
	const rp = rock.geometry.attributes.position;
	for (let i = 0; i < rp.count; i++) {
		const k = 1 + Math.sin(rp.getX(i) * 5 + rp.getY(i) * 3) * 0.07 + Math.cos(rp.getZ(i) * 4) * 0.06;
		rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
	}
	rock.geometry.computeVertexNormals();
	// the mass of flags: strings from a pole on the stone out to cairns all round, and more over the stone itself
	const strings = flagPole(ctx, sx, sz - 0.2, 4.2, floor, 7, 26, 51);
	for (let i = 0; i < 14; i++) {
		const a = (i / 14) * Math.PI * 2, b = a + 1.3;
		strings.push([V(sx + Math.sin(a) * 1.0, sy + 1.2, sz + Math.cos(a) * 0.9), V(sx + Math.sin(b) * 1.15, sy + 0.25, sz + Math.cos(b) * 1.0), 0.08]);
	}
	flagStrings(ctx, strings);
	// khatas draped on the stone
	for (let i = 0; i < 8; i++) {
		const a = i * 0.8 + 0.3;
		const k = mesh(new THREE.BoxGeometry(0.1, 0.01, 0.6), std(0xf6f2ea, { roughness: 1, side: THREE.DoubleSide }), sx + Math.sin(a) * 0.95, sy + 0.95, sz + Math.cos(a) * 0.82, g);
		k.rotation.set(0.9, a, 0);
	}
	// Shiva Sthal: clothes, hair and tokens left on the ground by the pilgrims
	const R = rand(61);
	for (let i = 0; i < 40; i++) {
		const x = -3.4 + (R() - 0.5) * 2.4, z = 2.4 + (R() - 0.5) * 1.8;
		const c = mesh(new THREE.BoxGeometry(0.2 + R() * 0.3, 0.02, 0.15 + R() * 0.2), std([0x8a2a2a, 0x2a4a8a, 0xd8d0c0, 0x3a6a3a, 0xc8862a, 0x5a3a5a][i % 6], { roughness: 1 }), x, floor(x, z) + 0.02, z, g);
		c.rotation.set((R() - 0.5) * 0.2, R() * 3, (R() - 0.5) * 0.2);
	}
	// what the traveller leaves: a piece of cloth at Shiva Sthal, a string of flags tied onto the stone's
	const cloth = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.12), std(0x8a2a2a, { roughness: 1 }), -3.25, floor(-3.25, 2.75) + 0.02, 2.75, g);
	cloth.rotation.y = 0.5;
	leftBehind(ctx, { token: cloth, tied: flagStrings(ctx, [[V(-0.45, sy + 1.98, 0.08), V(-1.9, floor(-1.9, 2.3) + 0.12, 2.3), 0.18]]) });
	// the falling snow
	const N = ctx.low ? 500 : 1200, sp = new Float32Array(N * 3);
	const Rs = rand(71);
	for (let i = 0; i < N; i++) sp.set([(Rs() - 0.5) * 24, Rs() * 9, (Rs() - 0.5) * 24], i * 3);
	const sg = new THREE.BufferGeometry();
	sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
	const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, map: glow(), transparent: true, depthWrite: false, opacity: 0.9 }));
	snow.frustumCulled = false;
	g.add(snow);
	ctx.ticks ||= [];
	ctx.ticks.push((dt, t) => {
		for (let i = 0; i < N; i++) {
			let y = sp[i * 3 + 1] - dt * (0.5 + (i % 7) * 0.06);
			if (y < -1) y += 10;
			sp[i * 3 + 1] = y;
			sp[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.15 + dt * 0.25;
			if (sp[i * 3] > 12) sp[i * 3] -= 24;
		}
		sg.attributes.position.needsUpdate = true;
	});
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		outdoor: true, place: "The Dolma La", fog: new THREE.FogExp2(0xd0dae6, 0.012), exposure: 0.88,
		rooms: [[-14, 14, 0.25, 9, -14, 14]], floor, deityPts: [[sx, sy + 1.4, sz], [sx, sy + 0.2, sz + 0.8]], pts: { stone: [sx, sy + 1.2, sz], sthal: [-3.4, 0.1, 2.4], edge: [6, -1, 2] },
		mark: "tripundra", priestMark: "tripundra",
		start: [0.9, 6.6], staffRest: [1.2, 3.0], staffTilt: [-0.1, 0], sandals: [0.9, 3.2],
		toFront: [[0.9, 6.6], [0.3, 2.4]], front: [0.3, 2.4], target: [sx, sz],
		tokenPath: [[0.3, 2.4], [-2.6, 2.9]], tokenAt: [-3.25, 2.75], tokenFace: [-3.6, 2.6],
		flagPath: [[-2.6, 2.9], [-0.9, 1.6], [-0.4, 0.95]], tieAt: [-0.45, sy + 2.05, 0.05],
		embrace: [-0.4, 0.75], surf: (x, y, z) => () => V(sx + x, sy + y, sz + 1.02 + z), hugLean: 0.62,
		gauriPath: [[-0.4, 0.75], [1.8, 2.4], [3.8, 2.3]], gauriFace: [14, 1.5],
		priestHome: [2.6, 0.6], priestFace: [sx, sz],
		props: () => kailashProps(ctx),
		tick: (dt, t, F, S) => ctx.ticks.forEach((f) => f(dt, t, F, S)),
		cams: {
			darshan: F(["T", "stone"], 25, 12, 1.15),
			token: F(["T", "sthal"], -60, 18, 1.4),
			flags: F(["T", "stone"], 55, 14, 1.2),
			embrace: F(["T", "D"], 75, 14, 1.3),
			gauri: C([1.7, 2.2, 4.4], [9, -3.2, 1.2]),
		},
	};
}

function yamdwar(ctx) {
	const { g } = ctx;
	// the gravel flat at Tarboche: the Yam Dwar chorten gate, the great flagpole and a long wall of mani stones
	const floor = (x, z) => (fbm(x * 0.25 + 1, z * 0.25 + 4, 3) - 0.5) * 0.12;
	backdrop(ctx, "yamdwar", [0x1e4f9e, 0xbcd2e8, 0x7a6a58]);
	outdoorLight(ctx, { dir: [0.45, 0.7, 0.5], sunI: 5.2, hemi: 1.6, sky: 0xc4daf2, ground: 0x9a8a70 });
	groundGrid(ctx, floor, (x, z, y) => (fbm(x * 0.5, z * 0.5 + 3, 2) > 0.6 ? 0x8a8466 : 0xa2927a));
	stones(ctx, 300, 41, floor, (x, z) => Math.abs(x) > 3.4 || z > 3.6 || z < -6.5, [0.05, 0.4], 0x968a7e);
	const white = std(0xf4f0e8, { roughness: 0.95 }), maroon = std(0x7a1e1e, { roughness: 0.9 }), gold = ctx.M.gold;
	// the gate: a square base with a passage through it, stepped up to the round body and spire of a chorten
	const gz = -1.5, y0 = floor(0, gz);
	box(g, -1.4, -0.55, y0 - 0.1, y0 + 2.1, gz - 1.3, gz + 1.3, white);
	box(g, 0.55, 1.4, y0 - 0.1, y0 + 2.1, gz - 1.3, gz + 1.3, white);
	box(g, -1.4, 1.4, y0 + 2.1, y0 + 2.5, gz - 1.3, gz + 1.3, white);
	box(g, -1.5, 1.5, y0 + 2.5, y0 + 2.62, gz - 1.4, gz + 1.4, maroon);
	for (let i = 0; i < 3; i++) box(g, -1.2 + i * 0.25, 1.2 - i * 0.25, y0 + 2.62 + i * 0.18, y0 + 2.8 + i * 0.18, gz - 1.2 + i * 0.25, gz + 1.2 - i * 0.25, white);
	mesh(lathe([[0, 0], [0.62, 0], [0.7, 0.2], [0.66, 0.6], [0.5, 0.82], [0.2, 0.9], [0, 0.9]], 24), white, 0, y0 + 3.16, gz, g);
	mesh(new THREE.CylinderGeometry(0.06, 0.2, 1.3, 12), gold, 0, y0 + 4.7, gz, g);
	for (let i = 0; i < 8; i++) mesh(new THREE.TorusGeometry(0.17 - i * 0.013, 0.025, 6, 16), gold, 0, y0 + 4.15 + i * 0.13, gz, g).rotation.x = Math.PI / 2;
	mesh(new THREE.SphereGeometry(0.08, 10, 8), gold, 0, y0 + 5.45, gz, g);
	// the passage's painted ceiling and its doorway frames
	box(g, -0.55, 0.55, y0 + 1.95, y0 + 2.1, gz - 1.3, gz + 1.3, std(0x2a4a7a, { roughness: 0.8 }));
	flagStrings(ctx, [[V(0, y0 + 5.2, gz), V(-4.5, floor(-4.5, 2.5) + 0.2, 2.5), 0.4], [V(0, y0 + 5.2, gz), V(4.5, floor(4.5, 2.5) + 0.2, 2.5), 0.4], [V(0, y0 + 5.2, gz), V(4.2, floor(4.2, -6) + 0.2, -6), 0.4]]);
	// Tarboche: the great flagpole, hung with strings of flags out to the ground all round
	const tp = [-6.6, -5.8];
	const strings = flagPole(ctx, tp[0], tp[1], 11, floor, 8.5, 40, 81);
	strings.push([V(tp[0], floor(...tp) + 10.5, tp[1]), V(-2.75, floor(-2.75, -2.05) + 0.9, -2.05), 1.2]);
	flagStrings(ctx, strings, [0.24, 0.18], 0.3);
	mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), std(0x8a8076, { map: gritTex() }), -2.75, floor(-2.75, -2.05) + 0.45, -2.05, g);
	// the khata the traveller ties on, left hanging from the string
	const kh = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.008), std(0xf8f4ec, { roughness: 1, side: THREE.DoubleSide }), -2.68, 1.36, -1.9, g);
	kh.rotation.y = 0.7;
	leftBehind(ctx, { tied: kh });
	// the mani wall
	for (let i = 0; i < 26; i++) {
		const x = -9 + i * 0.7, z = -7.2 + Math.sin(i * 0.3) * 0.2;
		mesh(new THREE.BoxGeometry(0.7, 0.75, 0.9), std(0x8a8076, { map: gritTex() }), x, floor(x, z) + 0.37, z, g);
	}
	const C = (p, l) => ({ p, l });
	const F = (fit, az, el, pad = 1) => ({ fit, dir: [az, el], pad });
	return {
		outdoor: true, place: "Yam Dwar and Tarboche", fog: new THREE.FogExp2(0xbcd0e2, 0.006), exposure: 0.92,
		rooms: [[-14, 14, 0.25, 9, -14, 14]], floor, deityPts: [[0, y0 + 1, gz + 1.3], [0, y0 + 4, gz]], pts: { gate: [0, y0 + 2.4, gz], pole: [-2.75, 1.6, -2.05] },
		mark: "tripundra", priestMark: "tripundra",
		start: [0.7, 6.6], staffRest: [1.0, 3.4], staffTilt: [-0.1, 0], sandals: [0.8, 3.5],
		toFront: [[0.7, 6.6], [0.4, 3.2]], front: [0.4, 3.2], target: [0, -60],
		gatePath: [[0.4, 3.2], [0, 0.6], [0, -3.4], [1.1, -4.2], [2.5, -2.8], [2.5, -0.2], [1.5, 1.6], [0.5, 2.4]],
		tiePath: [[0.5, 2.4], [-1.6, 0.4], [-2.2, -1.25]], tieAt: [-2.68, 1.62, -1.9], tieFace: [-6.6, -5.8],
		bowPath: [[-2.2, -1.25], [-0.4, 1.8], [0.4, 2.8]], bowFace: [0, -60],
		priestHome: [2.4, 3.2], priestFace: [0, -60],
		props: () => kailashProps(ctx),
		tick: (dt, t, F, S) => (ctx.ticks || []).forEach((f) => f(dt, t, F, S)),
		cams: {
			darshan: C([1.6, 1.0, 7.4], [0, 2.6, -6]),
			gate: { orbit: [0, gz], back: 2.6, out: 1.6, side: 0.8, h: 1.6, ahead: 1.0, lookH: 1.1 },
			tie: F(["T", "pole"], 40, 14, 1.3),
			bow: F(["T"], 115, 24, 1.3),
		},
	};
}
// The things carried in these rituals: a water can for the lake's water, a white khata, a string of prayer flags
// folded up, a piece of cloth to leave, a taper to light a butter lamp with.
function kailashProps(ctx) {
	const P = {}, g = ctx.g;
	const add = (name, o, spec = {}) => {
		o.visible = false;
		g.add(o);
		P[name] = Object.assign({ o }, spec);
	};
	const can = new THREE.Group();
	mesh(new THREE.BoxGeometry(0.2, 0.28, 0.12), std(0xf2f0ea, { roughness: 0.5 }), 0, -0.18, 0, can);
	mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), std(0x2a5ab8), 0.05, -0.02, 0, can);
	mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12, Math.PI), std(0xf2f0ea), -0.03, -0.035, 0, can);
	add("can", can, { off: [0, 0, 0.03] });
	const khata = new THREE.Group();
	mesh(new THREE.BoxGeometry(0.11, 0.42, 0.008), std(0xf8f4ec, { roughness: 1, side: THREE.DoubleSide }), 0, -0.2, 0.02, khata);
	add("khata", khata, { off: [0, 0, 0.04] });
	const flags = new THREE.Group();
	FLAG_COLS.forEach((c, i) => mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), std(c, { roughness: 0.9 }), 0, -0.02 + i * 0.022, 0, flags));
	add("flags", flags, { off: [0, 0.02, 0.06] });
	const cloth = new THREE.Group();
	mesh(new THREE.BoxGeometry(0.14, 0.03, 0.1), std(0x8a2a2a, { roughness: 1 }), 0, 0, 0, cloth);
	add("cloth", cloth, { off: [0, -0.01, 0.05] });
	const taper = new THREE.Group();
	mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 5), std(0xe8d8a8), 0, 0.06, 0.06, taper).rotation.x = 0.9;
	ctx.kit.flame(taper, 0, 0.14, 0.15, 0.6, 0.5);
	add("taper", taper, { off: [0, 0, 0.02] });
	// what is left behind: the cloth at Shiva Sthal, a string of flags tied on, a khata on Tarboche's strings
	return P;
}
// A string of flags from a and the cloth on the ground, shown once the step that leaves them has done so.
function leftBehind(ctx, items) {
	const out = {};
	for (const [name, o] of Object.entries(items)) {
		o.visible = false;
		ctx.g.add(o);
		out[name] = o;
	}
	(ctx.ticks ||= []).push((dt, t, F) => {
		for (const [name, o] of Object.entries(out)) o.visible = F.has(name);
	});
	return out;
}
// thangka: a painted scroll of a seated figure in a red and gold border
let _thangka;
function thangkaTex() {
	if (_thangka) return _thangka;
	_thangka = texOf(canvas(128, 160, (g, W, H) => {
		g.fillStyle = "#7a1c14";
		g.fillRect(0, 0, W, H);
		g.fillStyle = "#c8962a";
		g.fillRect(8, 8, W - 16, H - 16);
		g.fillStyle = "#2a5a6a";
		g.fillRect(14, 14, W - 28, H - 28);
		g.fillStyle = "#e8b04a";
		g.beginPath();
		g.arc(W / 2, H * 0.42, 26, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = "#d8a070";
		g.beginPath();
		g.arc(W / 2, H * 0.36, 10, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = "#8a2a1a";
		g.beginPath();
		g.ellipse(W / 2, H * 0.58, 22, 16, 0, 0, Math.PI * 2);
		g.fill();
	}));
	KEEP.add(_thangka);
	return _thangka;
}

const BUILD = { bhimashankar, shirdi, kedarnath, tirupati: tirumala, badrinath };
// the Kailash journey's stops with rituals of their own (the others have none to go in for)
Object.assign(BUILD, { mansarovar, dirapuk, dolmala, yamdwar });

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
	// the unit vector from (ax, az) towards (bx, bz)
	const dir = (ax, az, bx, bz) => {
		const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
		return [dx / l, dz / l];
	};
	// a world point d metres from the actor along its facing, s to its left, at height y above the floor
	const ahead = (A, d, y, s = 0) => () => {
		const fx = Math.sin(A.yaw), fz = Math.cos(A.yaw);
		return V(A.pos.x + fx * d + fz * s, A.y + y, A.pos.z + fz * d - fx * s);
	};
	const headPt = (A, x, y, z) => () => A.J.head.localToWorld(V(x, y, z));
	// Holy things are received in the right hand with the left beneath it: the left palm's target, under the wrist
	// of a right hand held out at p() along the direction g (from the body outwards).
	const under = (p, g, w, rate = 4) => ({ p: () => p().add(V(-g[0] * 0.07, -0.055, -g[1] * 0.07)), w, rate });
	const enter = (text) => ({
		...text, sets: ["barefoot", "staffDown"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("enter");
			const tw = walk(S.T, t, L.enterPath, 0.2, 0.7);
			const u = t - tw;
			S.T.arms = 0.3;
			S.hold.tL = u < 1.0 ? "staff" : null;
			if (u > 0.95) S.flag("staffDown");
			if (u > 1.95) S.flag("barefoot");
			S.T.face = u < 1.3 ? L.staffRest : L.washFace;
			// lean the staff (in the left hand) against the wall, step out of the sandals one foot at a time, then
			// pour water over the hands and feet from the lota in the right hand
			const pour = P(STAND, own({ lean: 0.3, nod: 0.45, shR: -0.95, shRz: -0.25, shRy: -0.3, elR: -0.9, shL: -0.75, shLz: 0.15, shLy: 0.3, elL: -0.5 }));
			S.T.pose = kf(u, [
				[0, P(STAND, STAFF)], [0.5, P(STAND, { lean: 0.3, shR: -0.7, shRz: 0.15, elR: -0.3, nod: 0.3 })], [1.0, P(STAND, { lean: 0.25, nod: 0.3 })],
				[1.4, P(STAND, { hipL: -0.3, kneeL: 0.6, footL: 0.25, nod: 0.45 })], [1.75, P(STAND, { nod: 0.45 })], [2.1, P(STAND, { hipR: -0.3, kneeR: 0.6, footR: 0.25, nod: 0.45 })], [2.5, STAND],
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
			// up on the toes, the right hand to the rim of the bell, swinging it twice
			const up = P(STAND, tiptoe(1), own({ shR: -2.75, shRz: 0.2, elR: -0.35, nod: -0.35, shL: -0.4, shLy: 0.4, elL: -1.4 }));
			S.T.pose = kf(u, [[0, STAND], [0.7, up], [1.9, up], [2.6, NAMASTE]]);
			const B = S.bell(0);
			if (B && u > 0.2 && u < 2.0) S.T.reach = own({ R: { p: () => S.bellRim(0, S.TA), w: u < 1.85 ? 1 : 0, rate: 5 } });
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
			// the right hand cupped beside the mouth
			const whisper = P(STAND, own({ lean: 0.42, nod: 0.25, look: 0.25, shR: -1.05, shRz: -0.3, shRy: -0.6, elR: -1.9, shL: -0.25, elL: -0.5 }));
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
			const tw = walk(S.T, t, L.queue, 0, L.queueSpeed ?? 0.55);
			const u = t - tw;
			S.T.face = L.doorFace;
			S.T.arms = 0.4;
			S.T.pose = P(NAMASTE, { nod: 0.05 });
			if (u > 0) S.T.pose = kf(u, [[0, NAMASTE], [1, P(NAMASTE, { nod: -0.1 })]]);
		},
	});
	// where the hand holding the lota must be for its spout to sit at p, the lota tipped by tilt, facing f
	const lotaHand = (p, tilt, f) => {
		const y = -0.01 + 0.03 * Math.cos(tilt) - 0.045 * Math.sin(tilt), z = 0.05 + 0.03 * Math.sin(tilt) + 0.045 * Math.cos(tilt);
		return V(p[0] - f[0] * z, p[1] - y, p[2] - f[1] * z);
	};
	const pourStep = (text) => ({
		...text, sets: L.ghee ? ["wet", "ghee"] : ["wet"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("pour");
			const tw = walk(S.T, t, [L.front, L.pour], 0, 0.5);
			const u = t - tw;
			S.T.face = L.target;
			const f = dir(L.pour[0], L.pour[1], L.target[0], L.target[1]);
			// the stream lands on the top of the lingam (or the rock), a little on the pilgrim's side
			const spoutAt = L.pourAt || [L.target[0] - f[0] * 0.05, L.pourTop + 0.09, L.target[1] - f[1] * 0.05];
			const tilt = (v) => num(v, [[0, 0.1], [0.9, 1.6], [3.8, 1.8], [4.6, 0.1]]);
			if (!L.ghee) {
				// at Bhimashankar the pilgrim sits down before the low pitha to pour; then rises
				const d = 1.6;
				// the lota in the right hand, the left raised at the chest
				const hold = P(SIT, own({ lean: 0.42, nod: 0.38, shR: -0.75, shRz: -0.1, elR: -0.9, shL: -0.75, shLz: 0.3, shLy: 0.55, elL: -1.5 }));
				const carry = own({ shR: -0.4, elR: -0.8, shL: -0.3, elL: -0.9, nod: 0.3 });
				let ps;
				if (u < d) ps = P(sitDown(u / d), carry);
				else if (u < 7.6) ps = kf(u, [[d, P(SIT, carry)], [2.4, hold], [6.6, hold], [7.6, P(SIT, NA)]]);
				else if (u < 8.2) ps = P(SIT, NA);
				else ps = P(sitDown(1 - (u - 8.2) / 1.8), NA, { nod: 0.2 });
				S.T.pose = ps;
				S.T.rate = 12;
				S.hold.tR = u < 6.8 ? "lota" : null;
				const v = u - d - 0.6;
				S.tilt.lota = tilt(v);
				// the right hand pours; the left palm comes under the lota to support it
				if (v > -0.4 && v < 4.9) S.T.reach = own({ R: { p: () => lotaHand(spoutAt, S.tilt.lota, f), w: v < 4.6 ? 1 : 0, rate: 4 }, L: v > 0.2 ? { p: S.below("lota"), w: v < 4.3 ? 1 : 0, rate: 3 } : undefined });
				S.T.cupped = v > 0 && v < 4.9;
				if (v > 0.8 && v < 3.8) {
					S.emit.push({ from: S.spout("lota"), v: S.fwd(0.15, -0.05), spread: 0.008, rate: 140, color: 0xc8e0ee, size: 0.016, kill: L.pourTop });
					S.flag("wet");
				}
				return;
			}
			// at Kedarnath: standing at the rock, then down on the knees to rub ghee on it
			const hold = P(STAND, own({ lean: 0.3, nod: 0.38, shR: -0.85, shRz: -0.1, elR: -0.9, shL: -0.6, shLz: 0.2, shLy: 0.5, elL: -1.4 }));
			S.T.pose = kf(u, [[0, NAMASTE], [0.6, hold], [4.8, hold], [5.6, NAMASTE]]);
			S.hold.tR = u > 0.3 && u < 5.3 ? "lota" : null;
			S.tilt.lota = tilt(u - 0.6);
			if (u > 0.2 && u < 5.3) S.T.reach = own({ R: { p: () => lotaHand(spoutAt, S.tilt.lota, f), w: u < 5.0 ? 1 : 0, rate: 4 }, L: u > 0.8 ? { p: S.below("lota"), w: u < 4.7 ? 1 : 0, rate: 3 } : undefined });
			S.T.cupped = u > 0.6 && u < 5.3;
			if (u > 1.4 && u < 4.4) {
				S.emit.push({ from: S.spout("lota"), v: S.fwd(0.2, -0.05), spread: 0.008, rate: 140, color: 0xc8e0ee, size: 0.016, kill: L.pourKill ?? L.pourTop });
				S.flag("wet");
			}
			if (u > 5.6) {
				const v = u - 5.6;
				S.cam = cam("embrace");
				// a step back, and down on the knees before the rock
				const tb = walk(S.T, v, [L.pour, L.embrace], 0, 0.45);
				S.T.noTurn = true;
				const k = v - tb;
				// the bowl of ghee in the right hand; then both hands rub it on
				S.hold.tR = k > 0.6 && k < 2.0 ? "ghee" : null;
				const rub = (s) => P(KNEEL, { lean: 0.62, nod: 0.35, shL: -1.15, shLz: 0.25, elL: -0.35, shR: -1.15, shRz: -0.25, elR: -0.35, twist: s * 0.05 });
				if (k < 0) S.T.pose = NAMASTE;
				else if (k < 1.3) S.T.pose = P(kneelDown(k / 1.3), NA);
				else S.T.pose = kf(k, [[1.3, P(KNEEL, NA)], [2.2, rub(0)]]);
				if (k > 2.2) S.T.pose = rub(Math.sin(k * 4));
				S.T.rate = 12;
				if (k > 1.6) {
					const s = Math.sin(k * 4) * 0.09;
					S.T.reach = { L: { p: L.surf(0.16 + s, 0.62, 0.06), w: 1, pt: V(0, -0.06, 0.02) }, R: { p: L.surf(-0.16 + s, 0.62, 0.06), w: 1, pt: V(0, -0.06, 0.02) } };
				}
				if (k > 2.6) S.flag("ghee");
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
			S.T.rate = 10;
			// arms round the rock, the forehead resting on it; then up again
			const hug = P(KNEEL, { lean: L.hugLean, nod: 0.5, shL: -1.4, shLz: -0.55, elL: -0.7, shR: -1.4, shRz: 0.55, elR: -0.7 });
			const kneel = P(KNEEL, NA);
			if (t < 6.8) S.T.pose = kf(t, [[0, kneel], [1.2, kneel], [2.4, hug], [5.6, hug], [6.8, kneel]]);
			else S.T.pose = P(kneelDown(1 - (t - 6.8) / 1.4), NA);
			if (t > 1.0 && t < 6.6) S.T.reach = { L: { p: L.surf(0.5, 0.72, 0.035), w: t < 6.0 ? 1 : 0, rate: 3 }, R: { p: L.surf(-0.5, 0.72, 0.035), w: t < 6.0 ? 1 : 0, rate: 3 } };
		},
	});
	const offer = (text) => ({
		...text, sets: ["leaves"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("offer");
			const at = L.offerAt || L.pour;
			const tw = walk(S.T, t, [L.pour, at], 0, 0.45);
			S.T.noTurn = true;
			const u = t - tw;
			S.T.face = L.target;
			const f = dir(at[0], at[1], L.target[0], L.target[1]);
			const leafAt = [L.target[0] - f[0] * 0.1, L.pourTop + 0.07, L.target[1] - f[1] * 0.1];
			S.hold.tR = u > 0.3 && u < 2.9 ? "bilva" : null;
			if (L.lowDeity) {
				// down on the knees to lay the leaves on the low lingam
				S.T.rate = 12;
				// the leaves in the right hand, the left held up at the chest
				const lay = P(KNEEL, own({ lean: 0.75, nod: 0.45, shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.55, shR: -0.9, elR: -0.4 }));
				const hold = own({ shR: -0.5, elR: -1.0, shL: -0.5, elL: -1.2 });
				if (u < 1.4) S.T.pose = P(kneelDown(u / 1.4), hold);
				else if (u < 4.2) S.T.pose = kf(u, [[1.4, P(KNEEL, hold)], [2.2, lay], [2.9, lay], [3.6, P(KNEEL, NA)], [4.2, P(KNEEL, NA)]]);
				else if (u < 5.6) S.T.pose = P(kneelDown(1 - (u - 4.2) / 1.4), NA);
				else S.T.pose = kf(u, [[5.6, NAMASTE], [6.4, BOWED], [7.4, NAMASTE]]);
				if (u > 1.4 && u < 3.3) S.T.reach = own({ R: { p: V(...leafAt), w: u < 2.95 ? 1 : 0, rate: 4, pt: V(0, -0.03, 0.01) } });
			} else {
				const reachP = P(STAND, own({ lean: 0.35, nod: 0.45, shR: -1.25, shRz: 0.05, elR: -0.25, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4 }));
				S.T.pose = kf(u, [[0, NAMASTE], [0.8, P(STAND, own({ shR: -0.6, elR: -1.4, shL: -0.6, elL: -1.4 }))], [2.0, reachP], [2.8, reachP], [3.8, NAMASTE], [5, BOWED], [6, NAMASTE]]);
				if (u > 0.9 && u < 3.3) S.T.reach = own({ R: { p: L.surf(0.0, 0.92, 0.04), w: u < 2.95 ? 1 : 0, rate: 4, pt: V(0, -0.02, 0.05) } });
			}
			if (u > 2.8) S.flag("leaves");
		},
	});
	const offerPlate = (text) => ({
		...text, sets: ["leaves"],
		run(S, t) {
			S.cam = cam("offer");
			S.T.x = L.front[0];
			S.T.z = L.front[1];
			S.T.face = L.target;
			// the plate passes from hand to hand halfway between them
			const c0 = [lerp(L.front[0], L.priestTake[0], 0.5), lerp(L.front[1], L.priestTake[1], 0.5)];
			const f = dir(L.front[0], L.front[1], L.priestTake[0], L.priestTake[1]), side = [f[1], -f[0]];
			const C = (k, s, y = 1.0) => V(c0[0] + side[0] * s - f[0] * k, y, c0[1] + side[1] * s - f[1] * k);
			const give = P(STAND, { lean: 0.15, nod: 0.35, shL: -1.0, shLy: 0.3, elL: -0.6, shR: -1.0, shRy: -0.3, elR: -0.6 });
			S.T.pose = kf(t, [[0, P(STAND, { shL: -0.7, shLy: 0.3, elL: -1.2, shR: -0.7, shRy: -0.3, elR: -1.2 })], [1.6, give], [2.6, give], [3.4, NAMASTE]]);
			const plate = L.plate || "thali";
		S.hold.tR = t < 2.5 ? plate : null;
			const pt = V(0, -0.05, 0.03);
			if (t < 2.9) {
				// before that the traveller carries the plate close: the same grip, nearer the chest
				const k = 0.25 * (1 - ease((t - 0.4) / 1.2));
				S.T.reach = { L: { p: C(k, -0.14, 1.0 + k * 0.2), w: t < 2.6 ? 1 : 0, pt }, R: { p: C(k, 0.14, 1.0 + k * 0.2), w: t < 2.6 ? 1 : 0, pt } };
			}
			// the pujari takes it and lays it at the Lord's feet
			const pw = walk(S.P, t, [L.priestHome, L.priestTake], 0, 0.8);
			const takeP = P(STAND, { shL: -1.0, shLy: 0.3, elL: -0.6, shR: -1.0, shRy: -0.3, elR: -0.6, lean: 0.1 });
			const carry = P(STAND, { shL: -0.7, shLy: 0.3, elL: -1.2, shR: -0.7, shRy: -0.3, elR: -1.2 });
			S.P.face = L.front;
			S.P.pose = kf(t, [[0, NAMASTE], [1.6, takeP], [2.6, carry]]);
			if (t > 1.5 && t < 2.6) S.P.reach = { L: { p: C(-0.09, 0.08), w: 1, pt }, R: { p: C(-0.09, -0.08), w: 1, pt } };
			if (t > 2.5) S.hold.pR = plate;
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
			// the lamp in the right hand, circling; the bell in the left
			S.hold.pR = "aarti";
			S.hold.pL = "ghanti";
			const a = Math.max(0, u - 0.8) * 2.4;
			const k = clamp(u - 0.6, 0, 1);
			const low = L.lowDeity ? 1 : 0, high = L.highDeity ? 1 : 0; // (raised to a murti seated high above)
			S.P.pose = P(STAND, own({
				shR: -0.95 + low * 0.3 - high * 0.55 - Math.sin(a) * 0.32 * k, shRz: -0.15 + Math.cos(a) * 0.3 * k, shRy: -0.2, elR: -0.75 + low * 0.3 + high * 0.2 + Math.cos(a) * 0.15 * k,
				shL: -0.55, shLz: 0.25, elL: -1.2 + Math.sin(t * 22) * 0.06 * k, lean: 0.08 + low * 0.25 - high * 0.06, nod: 0.12 + low * 0.3 - high * 0.3,
			}));
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
			S.hold.pR = "aarti";
			S.close = 1;
			// the pujari comes to stand a little over an arm's length away, the lamp held out at chest height
			// about 35 cm in front of the traveller
			const f = dir(L.aartiSpot[0], L.aartiSpot[1], L.priestAarti[0], L.priestAarti[1]);
			const stand = [L.aartiSpot[0] + f[0] * 0.8, L.aartiSpot[1] + f[1] * 0.8];
			const e = ease(t / 1.5);
			S.P.x = lerp(L.priestAarti[0], stand[0], e);
			S.P.z = lerp(L.priestAarti[1], stand[1], e);
			S.P.face = L.aartiSpot;
			S.T.face = stand;
			S.P.pose = P(STAND, own({ shR: -0.85, shRz: -0.05, elR: -1.1, shL: -0.4, shLz: 0.2, elL: -1.2, nod: 0.3, lean: 0.05 }));
			const lamp = (y) => () => V(S.TA.pos.x + f[0] * 0.36, S.TA.y + y, S.TA.pos.z + f[1] * 0.36);
			S.P.reach = own({ R: { p: lamp(1.12 - 0.1), w: ease((t - 0.3) / 1.2), rate: 4 } });
			// the traveller's cupped hands pass over the flames, then are drawn to the eyes
			const over = P(STAND, { lean: 0.12, nod: 0.4, shL: -0.85, shLz: 0.2, shLy: 0.35, elL: -0.75, shR: -0.85, shRz: -0.2, shRy: -0.35, elR: -0.75 });
			const eyes = P(STAND, { lean: 0.05, nod: 0.25, shL: -0.6, shLz: 0.4, shLy: 0.7, elL: -2.35, shR: -0.6, shRz: -0.4, shRy: -0.7, elR: -2.35 });
			const pt = V(0, -0.05, 0.015);
			if (t < 1.6) S.T.pose = kf(t, [[0, NAMASTE], [1.6, over]]);
			else if (t < 9.4) {
				const c = ((t - 1.6) % 2.6) / 2.6, k = c < 0.5 ? ease(c * 2) : ease((1 - c) * 2);
				S.T.pose = mix(over, eyes, k);
				// over the flame (the lamp's flames stand 12 cm above the hand; the palms pass 16 cm above them)
				const ov = (s) => () => lamp(1.12 + 0.18)().add(V(f[1] * s, 0, -f[0] * s));
				const ey = (s) => headPt(S.TA, s, 0.02, 0.15);
				const w = (q) => () => {
					const a = ov(q)(), b = ey(q > 0 ? 0.035 : -0.035)();
					return a.lerp(b, k);
				};
				S.T.reach = { L: { p: w(-0.06), w: 1, pt, rate: 8 }, R: { p: w(0.06), w: 1, pt, rate: 8 } };
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
			// the mark with the ring finger of the right hand, the prasad given with the right hand
			const apply = P(STAND, own({ shR: -1.55, shRz: -0.15, shRy: -0.2, elR: -1.0, shL: -0.3, elL: -1.4, nod: 0.1 }));
			const give = P(STAND, own({ shR: -0.8, shRz: -0.1, elR: -0.7, shL: -0.3, elL: -1.4, nod: 0.25, lean: 0.1 }));
			S.P.pose = kf(t, [[0, STAND], [1.6, STAND], [2.4, apply], [3.4, apply], [4.0, STAND], [4.8, give], [5.8, give], [6.4, NAMASTE]]);
			// the ring finger to the forehead, three strokes
			if (t > 1.7 && t < 3.6) {
				const s = Math.sin((t - 2.4) * 6) * 0.03;
				S.P.reach = own({ R: { p: headPt(S.TA, s, 0.06, 0.14), w: t < 3.3 ? 1 : 0, rate: 5, pt: V(0, -0.1, 0.01) } });
			}
			const cup = P(STAND, own({ shR: -0.75, shRz: -0.15, shRy: -0.25, elR: -0.8, shL: -0.6, shLz: 0.2, shLy: 0.35, elL: -0.9, nod: 0.25, ...PALMS_UP }));
			const toHead = P(STAND, own({ shR: -0.9, shRy: -0.5, elR: -2.3, shL: -0.4, elL: -1.0, nod: 0.15 }));
			S.T.pose = kf(t, [[0, NAMASTE], [1.8, P(NAMASTE, { nod: -0.12, lean: 0.12 })], [3.6, P(NAMASTE, { nod: -0.05, lean: 0.12 })], [4.4, cup], [5.8, cup], [6.8, toHead], [7.6, toHead], [8.4, NAMASTE]]);
			// the prasad passes between their right hands, the traveller's right palm below the pujari's and the left
			// hand under the right wrist
			const g = dir(L.markSpot[0], L.markSpot[1], L.priestMarkSpot[0], L.priestMarkSpot[1]);
			const mid = (y) => () => V(lerp(S.TA.pos.x, S.PA.pos.x, 0.5), S.TA.y + y, lerp(S.TA.pos.z, S.PA.pos.z, 0.5));
			if (t > 4.0 && t < 6.2) S.P.reach = own({ R: { p: mid(1.06), w: t < 5.8 ? 1 : 0, rate: 4 } });
			if (t > 4.0 && t < 6.2) S.T.reach = own({ R: { p: () => mid(1.0)().add(V(-g[0] * 0.03, 0, -g[1] * 0.03)), w: t < 5.9 ? 1 : 0, rate: 4 }, L: under(() => mid(1.0)().add(V(-g[0] * 0.03, 0, -g[1] * 0.03)), g, t < 5.9 ? 1 : 0) });
			S.T.cupped = t > 4.0 && t < 6.4;
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
			S.P.face = L.theertham[L.theertham.length - 1];
			// the vessel in the archaka's left hand, the spoon that pours in his right; then the shathari in the right
			S.hold.pL = u < 4.4 ? "vessel" : null;
			S.hold.pR = u < 4.4 ? "spoon" : null;
			const pourP = P(STAND, own({ shR: -1.0, shRz: -0.1, elR: -0.7, shL: -0.7, shLz: 0.2, elL: -0.9, nod: 0.35, lean: 0.1 }));
			const crown = P(STAND, own({ shR: -1.75, shRz: 0.1, elR: -0.65, shL: -0.2, elL: -0.3, nod: 0.15 }));
			S.P.pose = kf(u, [[0, P(STAND, { shL: -0.6, elL: -1.0, shR: -0.4, elR: -1.0 })], [0.8, pourP], [2.4, pourP], [3.0, STAND], [4.6, STAND], [5.4, crown], [6.6, crown], [7.4, NAMASTE]]);
			// the cupped right palm held out between them, the left hand under it; the spoon's lip just above it
			const end = L.theertham[L.theertham.length - 1];
			const g = dir(end[0], end[1], L.priestHome[0], L.priestHome[1]);
			const palm = () => V(S.TA.pos.x + g[0] * 0.3, S.TA.y + 1.02, S.TA.pos.z + g[1] * 0.3);
			if (u > 0.2 && u < 3.0) {
				S.T.reach = own({ R: { p: palm, w: u < 2.7 ? 1 : 0, rate: 5 }, L: under(palm, g, u < 2.7 ? 1 : 0, 5) });
				S.T.cupped = true;
				// the spoon is held 14 cm behind its lip
				S.P.reach = own({ R: { p: () => palm().add(V(g[0] * 0.13, 0.1, g[1] * 0.13)), w: u < 2.6 ? 1 : 0, rate: 5, pt: V(0, -0.02, 0) } });
			}
			if (u > 4.6 && u < 7.2) {
				S.hold.pR = "shathari";
				// the crown, held by its base in the right hand, touched to the top of the bowed head
				S.P.reach = own({ R: { p: headPt(S.TA, 0, 0.145, -0.01), w: u < 6.9 ? 1 : 0, rate: 4, pt: V(0, 0, 0) } });
			}
			if (u > 1.0 && u < 2.2) S.emit.push({ from: S.spout("spoon"), v: [0, -0.1, 0], spread: 0.004, rate: 50, color: 0xb0ccd8, size: 0.01, kill: 1.0 });
			// sip from the right palm, then pass it over the head
			const cup = P(STAND, own({ shR: -0.75, shRz: -0.15, shRy: -0.25, elR: -0.8, shL: -0.6, shLz: 0.2, shLy: 0.35, elL: -0.9, nod: 0.3, ...PALMS_UP }));
			const sip = P(STAND, own({ shR: -0.55, shRy: -0.6, elR: -2.35, shL: -0.3, elL: -0.8, nod: 0.05 }));
			const head = P(STAND, own({ shR: -2.4, shRz: 0.1, elR: -1.5, shL: -0.2, nod: 0.3 }));
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
			// the offering dropped in with the right hand, the left at the chest
			const drop = P(STAND, own({ lean: 0.3, nod: 0.45, shR: -1.25, shRz: 0.1, elR: -0.45, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4 }));
			S.T.pose = kf(u, [[0, STAND], [0.9, drop], [2.6, drop], [3.4, NAMASTE], [4.4, BOWED]]);
			if (u > 0.3 && u < 3.0) S.T.reach = own({ R: { p: V(...L.hundiDrop), w: u < 2.7 ? 1 : 0, rate: 4 } });
			if (u > 1.1 && u < 2.4) S.emit.push({ from: S.at("hand" + RIGHT, 0, -0.05, 0.02), v: [0, -0.2, 0], spread: 0.01, rate: 10, color: 0xffd060, size: 0.03, kill: 1.0 });
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
				if (t >= t1 && t < t1 + 2.0) S.T.face = L.target;
				S.T.pose = NAMASTE;
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
	// Sashtanga pranam: down on the knees, the hands to the floor, then the whole body laid face down towards
	// the Lord with the arms stretched out beyond the head, the palms together; then back up the same way.
	const bow = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("bow");
			const tw = walk(S.T, t, L.bowPath, 0, 0.6);
			const u = t - tw;
			S.T.face = L.bowFace || L.target;
			S.T.rate = 14;
			const arms = NA;
			let pr = null;
			if (u < 0.6) S.T.pose = NAMASTE;
			else if (u < 2.1) S.T.pose = P(kneelDown((u - 0.6) / 1.5), arms);
			else if (u < 2.5) S.T.pose = P(KNEEL, arms);
			else if (u < 4.7) pr = prostrate((u - 2.5) / 2.2);
			else if (u < 6.5) pr = prostrate(1);
			else if (u < 8.5) pr = prostrate(1 - (u - 6.5) / 2.0);
			else if (u < 8.9) S.T.pose = P(KNEEL, arms);
			else if (u < 10.4) S.T.pose = P(kneelDown(1 - (u - 8.9) / 1.5), arms);
			else S.T.pose = kf(u, [[10.4, NAMASTE], [11.2, BOWED], [12.2, NAMASTE]]);
			if (pr) {
				S.T.pose = P(arms, pr.pose);
				if (u > 4.7 && u < 6.5) S.T.pose.nod += Math.sin((u - 4.7) * 1.6) * 0.015;
				S.T.reach = pr.hands;
			}
		},
	});
	// At Shirdi, on to Dwarkamai (a cut to the other set): a bow to the dhuni, then a pinch of its udi from the
	// basin, touched to the forehead.
	const dhuni = (text) => ({
		...text,
		run(S, t) {
			S.once("cut", () => S.cut());
			idlePriest(S, t);
			S.cam = cam("dhuni");
			const tw = walk(S.T, t, L.dhuniPath, 0, 0.7);
			const u = t - tw;
			S.T.face = L.dhuniFace;
			const take = P(STAND, own({ lean: 0.32, nod: 0.45, shR: -1.0, elR: -0.5, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4 }));
			const brow = P(STAND, own({ shR: -0.9, shRy: -0.5, elR: -2.3, shL: -0.6, shLy: 0.5, shLz: 0.2, elL: -1.4, nod: 0.1 }));
			S.T.pose = kf(u, [[0, NAMASTE], [1.2, BOWED], [2.4, NAMASTE], [3.2, take], [4.4, take], [5.2, brow], [6.4, brow], [7.2, NAMASTE], [8.2, BOWED], [9.2, NAMASTE]]);
			if (u > 2.6 && u < 4.8) S.T.reach = own({ R: { p: V(...L.udiAt), w: u < 4.4 ? 1 : 0, rate: 4, pt: V(0, -0.07, 0.02) } });
			if (u > 4.6 && u < 6.8) S.T.reach = own({ R: { p: headPt(S.TA, 0, 0.07, 0.13), w: u < 6.4 ? 1 : 0, rate: 4, pt: V(0, -0.09, 0.01) } });
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
			// the laddu in the right palm, the left hand under it, raised before the face in thanks
			const holdUp = P(STAND, { shL: -0.9, shLy: 0.4, elL: -1.5, shR: -0.9, shRy: -0.4, elR: -1.5, nod: 0.3 }, own(PALMS_UP));
			S.T.pose = kf(t, [[0, P(STAND, { shL: -0.6, shLy: 0.3, elL: -1.2, shR: -0.6, shRy: -0.3, elR: -1.2 })], [1.5, holdUp], [3.2, holdUp], [4.2, NAMASTE]]);
			S.hold.tR = t < 3.8 ? "laddu" : null;
			const y = num(t, [[0, 1.08], [1.5, 1.3]]);
			const pt = V(0, -0.05, 0.025);
			const fw = () => [Math.sin(S.TA.yaw), Math.cos(S.TA.yaw)];
			const palm = ahead(S.TA, 0.32, y, -0.02);
			if (t < 3.9) S.T.reach = own({ R: { p: palm, w: t < 3.5 ? 1 : 0, pt }, L: { p: () => under(palm, fw(), 1).p(), w: t < 3.5 ? 1 : 0 } });
			S.T.cupped = t < 3.9;
		},
	});

	// ---------- the Kailash journey: rituals out of doors ----------
	// Into the lake: wading out over the pebbles (slowly, the water is icy), three dips with the hands folded, down on
	// the knees with the head bowed under, then water cupped and poured over the head.
	const dipStep = (text) => ({
		...text, sets: ["barefoot", "staffDown", "wet"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("dip");
			const tw = walk(S.T, t, L.dipPath, 0, 0.42);
			const u = t - tw;
			S.T.face = L.target;
			S.T.arms = 0.4;
			if (u < 0) {
				// the water's cold: arms in, shoulders up
				S.T.pose = P(STAND, { shL: -0.3, shLz: 0.25, elL: -1.5, shR: -0.3, shRz: -0.25, elR: -1.5, nod: 0.2 });
				return;
			}
			S.T.rate = 9;
			const D = 3.2, n = Math.floor(u / D), v = u - n * D;
			const under = P(KNEEL, NA, { lean: 1.45, nod: 0.9 });
			if (n < 3) {
				if (v < 1.1) S.T.pose = P(kneelDown(v / 1.1), NA);
				else if (v < 2.0) S.T.pose = kf(v, [[1.1, P(KNEEL, NA)], [1.45, under], [1.75, under], [2.0, P(KNEEL, NA)]]);
				else S.T.pose = P(kneelDown(1 - (v - 2.0) / 1.2), NA);
				if (v > 1.4 && v < 1.8) S.emit.push({ from: () => V(S.TA.pos.x + (Math.random() - 0.5) * 0.3, L.water + 0.02, S.TA.pos.z + 0.25 + (Math.random() - 0.5) * 0.3), v: [0, 1.5, 0], spread: 0.2, rate: 160, color: 0xdcf2f6, size: 0.02, kill: L.water - 0.02 });
				if (v > 2.0 && v < 2.8) S.emit.push({ from: S.at("head", 0, 0.0, 0.05), v: [0, -0.4, 0], spread: 0.2, rate: 40, color: 0xcfe8f0, size: 0.014, kill: L.water });
				return;
			}
			// water poured over the head from cupped hands, three times
			const w = u - 3 * D;
			const low = P(STAND, own({ lean: 0.55, nod: 0.45, shR: -0.75, shRz: -0.1, elR: -0.5, shL: -0.75, shLz: 0.1, elL: -0.5, ...PALMS_UP }));
			const over = P(STAND, own({ shR: -2.45, shRz: 0.05, elR: -0.7, shL: -2.45, shLz: -0.05, elL: -0.7, nod: -0.05 }));
			const c = w % 2.2;
			S.T.pose = w < 6.6 ? kf(c, [[0, low], [1.0, over], [1.6, over], [2.2, low]]) : kf(w, [[6.6, low], [7.6, NAMASTE]]);
			S.T.cupped = w < 6.6;
			if (w < 6.6 && c > 1.0 && c < 1.7) S.emit.push({ from: S.at("head", 0, 0.12, 0.02), v: [0, -0.3, 0], spread: 0.18, rate: 90, color: 0xcfe8f0, size: 0.015, kill: L.water });
		},
	});
	// Standing in the lake, water from the lota offered towards the sun and Kailash.
	const arghya = (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("arghya");
			S.T.x = L.dip[0];
			S.T.z = L.dip[1];
			S.T.face = L.target;
			const up = P(STAND, own({ shR: -1.7, shRz: -0.12, elR: -0.8, shL: -1.5, shLz: 0.2, shLy: 0.45, elL: -0.9, nod: -0.15, lean: -0.04 }));
			S.T.pose = kf(t, [[0, NAMASTE], [1.0, P(STAND, own({ shR: -0.7, elR: -1.2, shL: -0.6, elL: -1.2 }))], [2.2, up], [6.8, up], [7.6, NAMASTE], [8.4, BOWED], [9.4, NAMASTE]]);
			S.hold.tR = t > 0.6 && t < 7.4 ? "lota" : null;
			S.tilt.lota = num(t, [[2.2, 0], [3.0, 1.5], [6.0, 1.7], [6.8, 0]]);
			if (t > 3.0 && t < 6.2) S.emit.push({ from: S.spout("lota"), v: S.fwd(0.35, 0.1), spread: 0.01, rate: 120, color: 0xd6eef2, size: 0.016, kill: L.water });
		},
	});
	// The havan: sitting at the fire with the elder, ghee and samagri offered into it at each svaha.
	const havan = (text) => ({
		...text,
		run(S, t) {
			S.cam = cam("havan");
			const tw = walk(S.T, t, L.havanPath, 0, 0.7);
			const u = t - tw;
			S.T.face = L.kund;
			const fire = () => V(L.kund[0], L.floor(L.kund[0], L.kund[1]) + 0.3, L.kund[1] + 0.12);
			// the elder comes to his place across the fire and sits; he leads the mantras
			const pw = walk(S.P, t, [L.priestHome, L.priestSit], 0, 0.6);
			S.P.face = L.kund;
			const pu = t - pw;
			const pose = (k, arms) => P(sitDown(k), arms);
			S.P.pose = pu < 0 ? NAMASTE : pu < 1.8 ? pose(pu / 1.8, NA) : P(SIT, NA, { nod: 0.15 + Math.sin(t * 1.3) * 0.04 });
			S.P.rate = 12;
			if (u < 0) return;
			S.T.rate = 12;
			const offer = P(SIT, own({ lean: 0.38, nod: 0.3, shR: -1.05, shRz: -0.1, elR: -0.35, shL: -0.6, shLz: 0.25, shLy: 0.5, elL: -1.5 }));
			const hold = P(SIT, own({ shR: -0.55, elR: -1.25, shL: -0.6, shLz: 0.25, shLy: 0.5, elL: -1.5, nod: 0.12 }));
			const end = 1.8 + 3 * 2.8;
			if (u < 1.8) S.T.pose = pose(u / 1.8, NA);
			else if (u < end) {
				const v = (u - 1.8) % 2.8;
				S.T.pose = kf(v, [[0, hold], [0.8, offer], [1.4, offer], [2.0, hold], [2.8, hold]]);
				if (v > 0.5 && v < 1.6) S.T.reach = own({ R: { p: fire, w: v < 1.45 ? 1 : 0, rate: 5 } });
				// svaha: the offering goes in, the fire flares, sparks fly up
				if (v > 1.15 && v < 2.0) {
					S.fire = 0.55 * Math.sin(((v - 1.15) / 0.85) * Math.PI);
					S.emit.push({ from: () => fire().add(V(0, 0.1, -0.1)), v: [0, 1.8, 0], spread: 0.15, rate: 40, color: 0xffb040, size: 0.018, kill: -5 });
				}
				if (u > 2.95) S.every("svaha", 2.8, u - 1.8 - 1.15, () => S.ghanti());
				// the elder pours ghee with each svaha
				const pv = (u - 1.8 + 1.4) % 2.8;
				S.hold.pR = "ghee";
				if (pv > 0.6 && pv < 1.6) S.P.reach = own({ R: { p: fire, w: pv < 1.45 ? 1 : 0, rate: 5 } });
			} else if (u < end + 1.6) S.T.pose = P(SIT, NA);
			else S.T.pose = pose(1 - (u - end - 1.6) / 1.8, NA);
			if (u > end + 1.6) S.P.pose = pose(Math.max(0, 1 - (u - end - 1.6) / 1.8), NA);
		},
	});
	// Lake water to take home: down at the water's edge to fill a can.
	const fillCan = (text) => ({
		...text, sets: ["can"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("fill");
			const tw = walk(S.T, t, L.fillPath, 0, 0.75);
			const u = t - tw;
			S.T.face = [L.fillAt[0], L.fillAt[2] - 2];
			S.hold.tR = u < 6.4 ? "can" : null;
			if (u < 0) return;
			S.T.rate = 10;
			const reachP = P(kneelDown(0.75), own({ lean: 0.75, nod: 0.5, shR: -1.0, elR: -0.2, shL: -0.4, elL: -0.6 }));
			if (u < 1.2) S.T.pose = P(kneelDown((u / 1.2) * 0.75), own({ shR: -0.4, elR: -0.4 }));
			else if (u < 4.4) S.T.pose = reachP;
			else if (u < 5.6) S.T.pose = P(kneelDown(0.75 * (1 - (u - 4.4) / 1.2)), own({ shR: -0.3, elR: -0.5 }));
			else S.T.pose = kf(u, [[5.6, P(STAND, own({ shR: -0.2, elR: -0.3 }))], [7.0, NAMASTE]]);
			if (u > 1.0 && u < 4.6) S.T.reach = own({ R: { p: V(...L.fillAt), w: u < 4.3 ? 1 : 0, rate: 4 } });
			S.tilt.can = num(u, [[1.2, 0], [1.8, 0.9], [3.8, 0.9], [4.4, 0]]);
			if (u > 1.8 && u < 3.8) S.emit.push({ from: () => V(L.fillAt[0], L.water + 0.01, L.fillAt[2]), v: [0, 0.25, 0], spread: 0.12, rate: 20, color: 0xeaf6f8, size: 0.012, kill: L.water - 0.01 });
			if (u > 4.4 && u < 5.6) S.emit.push({ from: S.at("hand" + RIGHT, 0, -0.25, 0), v: [0, -0.2, 0], spread: 0.05, rate: 20, color: 0xcfe8f0, size: 0.012, kill: L.water });
		},
	});
	// A butter lamp lit with a taper at the gompa's altar, among the rows already burning.
	const butterLamp = (text) => ({
		...text, sets: ["lamp"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("lamp");
			const tw = walk(S.T, t, L.lampPath, 0, 0.75);
			const u = t - tw;
			S.T.face = L.lampFace;
			S.hold.tR = u > -1 && u < 3.6 ? "taper" : null;
			if (u < 0) return;
			const light = P(STAND, own({ lean: 0.35, nod: 0.45, shR: -1.05, shRz: -0.05, elR: -0.45, shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.5 }));
			S.T.pose = kf(u, [[0, NAMASTE], [1.0, light], [2.8, light], [3.6, NAMASTE], [4.6, BOWED], [5.6, NAMASTE]]);
			if (u > 0.6 && u < 3.2) S.T.reach = own({ R: { p: () => L.lampAt.clone().add(V(0, 0.14, 0.06)), w: u < 2.9 ? 1 : 0, rate: 4, pt: V(0, -0.02, 0.13) } });
			if (u > 2.0) S.flag("lamp");
		},
	});
	// Something of yourself left at Shiva Sthal.
	const token = (text) => ({
		...text, sets: ["token"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("token");
			const tw = walk(S.T, t, L.tokenPath, 0, 0.7);
			const u = t - tw;
			S.T.face = L.tokenFace;
			S.hold.tR = u < 2.4 ? "cloth" : null;
			if (u < 0) return;
			S.T.rate = 10;
			const lay = P(KNEEL, own({ lean: 0.85, nod: 0.5, shR: -1.0, elR: -0.3, shL: -0.55, shLz: 0.25, shLy: 0.5, elL: -1.5 }));
			if (u < 1.3) S.T.pose = P(kneelDown(u / 1.3), NA);
			else if (u < 3.6) S.T.pose = kf(u, [[1.3, P(KNEEL, NA)], [2.0, lay], [2.6, lay], [3.6, P(KNEEL, NA)]]);
			else if (u < 4.9) S.T.pose = P(kneelDown(1 - (u - 3.6) / 1.3), NA);
			else S.T.pose = kf(u, [[4.9, NAMASTE], [5.8, BOWED], [6.8, NAMASTE]]);
			const at = V(L.tokenAt[0], L.floor(L.tokenAt[0], L.tokenAt[1]) + 0.06, L.tokenAt[1]);
			if (u > 1.4 && u < 2.9) S.T.reach = own({ R: { p: at, w: u < 2.6 ? 1 : 0, rate: 4 } });
			if (u > 2.4) S.flag("token");
		},
	});
	// Prayer flags tied on: up on the toes to a string over the stone (or Tarboche's), and the new flags left there.
	const tieOn = (path, face, prop) => (text) => ({
		...text, sets: ["tied"],
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam("tie") || cam("flags");
			const tw = walk(S.T, t, L[path], 0, 0.7);
			const u = t - tw;
			S.T.face = L[face];
			S.hold.tR = u < 3.4 ? prop : null;
			if (u < 0) return;
			const up = P(STAND, tiptoe(1), own({ shR: -2.65, shRz: 0.1, elR: -0.4, shL: -2.55, shLz: -0.1, elL: -0.45, nod: -0.35 }));
			S.T.pose = kf(u, [[0, STAND], [0.9, up], [3.2, up], [4.0, NAMASTE], [5.0, BOWED], [6.0, NAMASTE]]);
			const at = V(...L.tieAt);
			if (u > 0.5 && u < 3.4) S.T.reach = own({ R: { p: at, w: u < 3.1 ? 1 : 0, rate: 4 }, L: { p: () => at.clone().add(V(0.12, -0.05, 0.05)), w: u < 3.1 ? 1 : 0, rate: 4 } });
			if (u > 2.4) S.flag("tied");
		},
	});
	// A walk with folded hands along a path (through Yam Dwar, to the edge above Gauri Kund), facing on at the end.
	const walkOn = (name, path, face, speed = 0.62) => (text) => ({
		...text,
		run(S, t) {
			idlePriest(S, t);
			S.cam = cam(name);
			const tw = walk(S.T, t, L[path], 0, speed);
			const u = t - tw;
			S.T.arms = 0.25;
			S.T.pose = u < 0 ? P(NAMASTE, { nod: 0.1 }) : kf(u, [[0, NAMASTE], [1.0, BOWED], [2.0, NAMASTE]]);
			if (u > 0) S.T.face = L[face];
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
		bow({ title: "Bow and take leave", note: "Kneel, then lie face down before the Lord, arms stretched out beyond the head with the palms together, in sashtanga pranam. Rise again with folded hands. It is customary to sit a while in the hall before you go.", mantra: "हर हर महादेव", latin: "Har Har Mahadev" }),
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
		bow({ title: "Bow and take leave", note: "Kneel, then lie face down before the Lord, arms stretched out beyond the head with the palms together, in sashtanga pranam. Rise again with folded hands and leave quietly.", mantra: "जय बाबा केदार", latin: "Jai Baba Kedar" }),
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
	if (key === "shirdi") return [
		enter({ title: "Leave sandals and staff", note: "Footwear is left at the stands outside the gates. Lean the staff by the door, slip off your sandals and rinse your hands and feet, then join the queue." }),
		queue({ title: "Join the darshan queue", note: "The line winds between steel railings down the marble hall of the Samadhi Mandir towards Baba, devotees chanting his name as it moves.", mantra: "ॐ साईं राम", latin: "Om Sai Ram" }),
		darshan({ title: "Darshan of Sai Baba", note: "Baba sits above his samadhi in white marble on a silver throne, the right leg crossed over the left knee, in a white kafni with a saffron cloth tied on his head. Fold your hands, bow and pause a moment; the murti is never touched.", mantra: "श्री सच्चिदानंद सद्गुरु साईनाथ महाराज की जय", latin: "Shri Sachchidanand Sadguru Sainath Maharaj ki Jai" }),
		offerPlate({ title: "Offer flowers and a chadar", note: "Hand your plate of flowers and a chadar, a cloth for the samadhi, across the railing to the pujari. He lays them on the samadhi where Baba rests." }),
		aarti({ title: "Madhyan aarti", note: "At noon the pujari waves the lamp before Baba as the hall sings his aarti. It is sung four times a day: Kakad at 5:15, Madhyan at noon, Dhoop at sunset and Shej at 10 at night.", mantra: "आरती साईबाबा । सौख्यदातार जीवा", latin: "Aarti Sai Baba, saukhyadatara jiva" }),
		takeFlame(txt.flame),
		markStep({ title: "Udi and prasad", note: "The pujari touches udi, the sacred ash of Baba's dhuni, to your forehead and gives prasad. Baba gave udi to all who came to him, for healing and protection." }),
		dhuni({ title: "Dwarkamai and the dhuni", note: "In the old mosque where Baba lived, the dhuni he lit still burns behind its grill, near the stone he sat on and his portrait. Bow to the fire and take a pinch of its udi.", mantra: "सबका मालिक एक", latin: "Sabka Malik Ek" }),
		bow({ title: "Bow and take leave", note: "Kneel and bow before Baba's portrait and his stone, then rise with folded hands, carrying his teaching: shraddha and saburi, faith and patience.", mantra: "श्रद्धा सबुरी", latin: "Shraddha, Saburi" }),
	];
	if (key === "mansarovar") return [
		enter({ title: "Sandals and staff on the shore", note: "At Qugu the camp is a few steps from the water. Leave the staff and sandals on the pebbles and rinse your hands and feet before going in." }),
		dipStep({ title: "The snan: three dips", note: "Wade out over the pebbles into water that is icy even in July, and dip three times with the hands folded, the head going under, then pour water over the head. No soap is used in the lake.", ...OM_SHIVA }),
		arghya({ title: "Arghya towards Kailash", note: "Standing in the lake, offer water from the lota towards the sun and towards Kailash, white across the water to the north.", ...OM_SHIVA }),
		havan({ title: "Havan on the shore", note: "Back on the shore an elder of the batch lights a small havan in a square of stones. Ghee and samagri go into the fire at each svaha.", mantra: "ॐ नमः शिवाय स्वाहा", latin: "Om Namah Shivaya Svaha" }),
		fillCan({ title: "Water to take home", note: "Pilgrims fill cans with Mansarovar's water to take home, for their families and for puja." }),
		darshan({ title: "Darshan of Kailash across the lake", note: "From the southern shore Kailash stands across the water to the north, with the snows of Gurla Mandhata behind you. Fold your hands.", ...OM_SHIVA }),
		bow({ title: "Bow and take leave", note: "Kneel, then lie face down towards Kailash in sashtanga pranam, and rise with folded hands.", mantra: "जय मानसरोवर", latin: "Jai Mansarovar" }),
	];
	if (key === "dirapuk") return [
		darshan({ title: "The north face", note: "From the camp at Dirapuk the north face of Kailash rises straight from its glaciers: dark rock banded with snow, the great gully down its middle. In the evening it catches the last of the sun.", ...OM_SHIVA }),
		aarti({ title: "Aarti to Kailash", note: "As the light goes the batch gathers at a cairn of mani stones facing the mountain, and an elder waves the lamp in slow circles before it while the others sing.", ...KARPURA }),
		takeFlame(txt.flame),
		butterLamp({ title: "A butter lamp at the gompa", note: "In the small shrine of the Dirapuk gompa, built round a cave, rows of butter lamps burn before the image. Light one from a taper and set it among them.", mantra: "ॐ मणि पद्मे हूँ", latin: "Om Mani Padme Hum" }),
		bow({ title: "Prostration towards the mountain", note: "Lie face down towards the north face in sashtanga pranam. Some Tibetan pilgrims go the whole way round like this, a body's length at a time, over two or three weeks.", mantra: "जय कैलाशपति", latin: "Jai Kailashpati" }),
	];
	if (key === "dolmala") return [
		darshan({ title: "The top of the pass", note: "At about 5,630 m the Dolma La is the highest point of the parikrama. The great Dolma stone is buried in prayer flags; the air is thin and cold, and snow can fall on any day.", ...OM_SHIVA }),
		token({ title: "Shiva Sthal", note: "Just below the pass, at Shiva Sthal, pilgrims leave something of themselves, a piece of clothing or a lock of hair, as a sign of leaving the old life behind." }),
		tieOn("flagPath", "target", "flags")({ title: "Prayer flags on the Dolma stone", note: "Tie a string of prayer flags onto those already on the stone. Blue, white, red, green and yellow, they stand for sky, air, fire, water and earth; the wind carries their prayers.", mantra: "ॐ मणि पद्मे हूँ", latin: "Om Mani Padme Hum" }),
		embrace({ title: "The forehead to the stone", note: "Kneel and touch the forehead to the Dolma stone. Here Parvati is honoured as Dolma, Tara, who is said to have shown the way over the pass.", mantra: "जय माँ गौरी", latin: "Jai Maa Gauri" }),
		walkOn("gauri", "gauriPath", "gauriFace")({ title: "Gauri Kund below", note: "Down the far side lies Gauri Kund (Thukje Chenpo Tso), the emerald lake where Parvati is said to have bathed, often still frozen in summer. Pilgrims climb down to its shore for its water.", mantra: "जय माँ गौरी", latin: "Jai Maa Gauri" }),
	];
	if (key === "yamdwar") return [
		darshan({ title: "Kailash from Yam Dwar", note: "At Tarboche, where the bus from Darchen stops, the parikrama begins. The south-west face of Kailash stands above the ridges ahead.", ...OM_SHIVA }),
		walkOn("gate", "gatePath", "target")({ title: "Through Yam Dwar", note: "Walk through the chorten gate of Yama, the god of death, leaving the world behind, and on round it clockwise. From here Kailash is kept on the right hand all the way round." }),
		tieOn("tiePath", "tieFace", "khata")({ title: "A khata on Tarboche's flags", note: "The great Tarboche flagpole is raised anew each year at Saga Dawa and hung with thousands of prayer flags. Tie a white khata onto one of its strings." }),
		bow({ title: "Prostration towards Kailash", note: "Lie face down towards the mountain in sashtanga pranam before setting out up the Lha Chu valley.", mantra: "बम बम भोले", latin: "Bam Bam Bhole" }),
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
		bow({ title: "Bow and take leave", note: "Kneel, then lie face down before the Lord, arms stretched out beyond the head with the palms together, in sashtanga pranam. Rise again with folded hands.", mantra: "जय बद्री विशाल", latin: "Jai Badri Vishal" }),
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
	// whether a stop has rituals to go in for (the Kailash journey's stops that do not are left outside)
	has(key) {
		return !!BUILD[key];
	}
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
		scene.fog = key === "shirdi" ? new THREE.FogExp2(0x2a2016, 0.022) : new THREE.FogExp2(0x0b0705, key === "tirupati" || key === "badrinath" ? 0.045 : 0.06);
		const g = new THREE.Group();
		scene.add(g);
		const ctx = (this.ctx = { g, M: MAT(), low: this.low, flames: [], lights: [], bells: [], smokeFrom: [] });
		ctx.kit = new Kit(ctx);
		scene.add(new THREE.HemisphereLight(0x8a7a6a, 0x1a120c, { kedarnath: 0.35, badrinath: 0.1, shirdi: 0.5 }[key] ?? 0.22));
		this.L = BUILD[key](ctx);
		// out of doors (the Kailash journey): the sky dome behind everything, a light haze instead of the room's dark
		if (this.L.outdoor) scene.fog = this.L.fog;
		this.steps = stepsFor(key, this.L);
		this.props = buildProps(ctx);
		if (this.L.props) Object.assign(this.props, this.L.props());
		// the traveller: as outside, in saffron kurta, white dhoti, the angavastram, the tilak and a saffron pheta
		const TJ = person({ skin: SKIN[0], top: 0xe2761b, bottom: 0xf1ebdc, sash: 0xb8261c, head: "pheta", headColor: 0xf08a1f, beard: 0x5d554e, sleeve: 0.6 });
		TJ.skinMat = TJ.palmL.material;
		TJ.soleMat = TJ.feet[0].material;
		this.markT = markPatch(this.L.mark || "tripundra", 0.107, 1.0, 1.75);
		this.markT.visible = false;
		TJ.head.add(this.markT);
		g.add(TJ.root);
		this.trav = new Actor(TJ, this.L.floor);
		// the pujari: bare-chested, white dhoti, the sacred thread across the chest, shaven head with a tuft
		// (pujari: bare chest, the sacred thread, a long dhoti to the ankles, a shaven head with the shikha; a
		// Maharashtrian pujari at Bhimashankar, an archaka at Tirumala, the Rawals of Kedarnath and Badrinath)
		// (at Shirdi a white dhoti and a saffron shawl over the bare shoulders)
		const skinP = { bhimashankar: SKIN[2], shirdi: SKIN[4], kedarnath: SKIN[6], tirupati: SKIN[3], badrinath: SKIN[1] }[key] ?? SKIN[2];
		// (out of doors on the Kailash journey, an elder of the batch in a woollen jacket and cap, a shawl and shoes)
		const PJ = this.L.outdoor
			? person({ skin: SKIN[2], top: 0x5a3a2e, bottom: 0x5a5650, sash: 0x8a1c1c, shawl: 0x8a1c1c, head: "cap", headColor: 0x3a3a48, capBand: 0x7a1d24, beard: 0xcfcac2, mark: "none", sleeve: 1, pyjama: true })
			: person({ skin: skinP, top: skinP, bottom: 0xf2eee2, sash: 0xf4efe0, pujari: true, mark: "none", shawl: key === "shirdi" ? 0xe8822a : undefined, moustache: key === "bhimashankar" || key === "shirdi" ? 0x1b1612 : 0 });
		if (!this.L.outdoor) for (const f of PJ.feet) f.visible = false;
		if (PJ.shawl && key !== "shirdi" && !this.L.outdoor) PJ.shawl.visible = false;
		PJ.head.add(markPatch(this.L.priestMark || "tripundra"));
		g.add(PJ.root);
		this.priest = new Actor(PJ, this.L.floor);
		this.priest.bare = !this.L.outdoor;
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
		if (this.L.outdoor) {
			// out of doors the metal and the water see the open sky, the bright sun and the tawny ground
			es.add(skyDome(0x4a7ac8, 0xd8e4ee, 0x7a6a58));
			const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 9) }));
			sun.position.set(30, 40, 20);
			es.add(sun);
		} else {
		// (at Shirdi the room is white marble under electric light, so the metal sees a bright room)
		const back = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: key === "shirdi" ? new THREE.Color(0.32, 0.3, 0.27) : new THREE.Color(0.03, 0.02, 0.014), side: THREE.BackSide }));
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
		}
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
			// a cut to another set: everything jumps there this frame, behind a dip to black that fades up
			cut() {
				self.snap = true;
				if (!self.root) return;
				self.root.classList.remove("blink");
				self.root.classList.add("cutting");
				setTimeout(() => self.root && self.root.classList.remove("cutting"), 350);
			},
			ghanti() { self._ghanti(); },
			tx: () => self.trav.pos.x,
			tz: () => self.trav.pos.z,
			get TA() { return self.trav; },
			get PA() { return self.priest; },
			bell: (i) => self.ctx.bells[i],
			// the near side of a bell's rim, seen from actor A, where a hand takes hold of it to swing it
			bellRim(i, A) {
				const b = self.ctx.bells[i];
				const c = b.pivot.localToWorld(V(0, -b.chain - 0.3 * b.s + 0.035 * b.s, 0));
				const dx = A.pos.x - c.x, dz = A.pos.z - c.z, l = Math.hypot(dx, dz) || 1;
				return c.add(V((dx / l) * 0.13 * b.s, 0, (dz / l) * 0.13 * b.s));
			},
			// world-space emitters, evaluated after the actors move
			at: (joint, x, y, z) => () => self.trav.J[joint].localToWorld(v.set(x, y, z)).clone(),
			// under the body of a held prop, where a palm supporting it goes
			below: (name, drop = 0.075) => () => self.props[name].o.localToWorld(V(0, -0.06, 0)).add(V(0, -drop, 0)),
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
		if (this.L.place) {
			// out of doors: no temple to be inside
			$(".sn-place-k").textContent = this.L.place;
			root.setAttribute("aria-label", `The rituals at ${this.shrine.name}`);
		}
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
		S.hold = { tR: null, tL: null, pR: null, pL: null }; // the figures' own right and left hands
		S.tilt = {};
		S.emit = [];
		S.steam = 0;
		S.camPush = 0;
		S.close = 0;
		this.steps[this.idx].run(S, this.st);
		const snap = this.snap;
		this.trav.bare = this.flags.has("barefoot");
		this.trav.drive(S.T, dt, snap);
		this.priest.drive(S.P, dt, snap);
		if (this.auto && !this.leaving) this._autoStep(S, dt);
		this._props(S);
		this._effects(S, dt, this.time);
		if (L.tick) L.tick(dt, this.time, this.flags, S);
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
			else if (p.palm) J[hand].localToWorld(v.set(0, -0.05, 0)); // resting on the palm, not at the wrist
			else J[hand].getWorldPosition(v);
			const yaw = actor.yaw, off = p.off || [0, 0, 0];
			p.o.position.set(v.x + Math.sin(yaw) * off[2] + Math.cos(yaw) * off[0], v.y + off[1], v.z + Math.cos(yaw) * off[2] - Math.sin(yaw) * off[0]);
			p.o.rotation.set(S.tilt[name] || 0, yaw, 0, "YXZ");
			p.o.visible = true;
			p.o.updateMatrixWorld(true);
		};
		// the hold slots are the figure's own hands: tR its right (the skeleton's "L" joint), tL its left
		const H = S.hold, RH = "hand" + RIGHT, LH = "hand" + LEFT;
		if (H.tL === "staff") {
			this.trav.J[LH].getWorldPosition(v);
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
		// the chappals stay outside with the staff: barefoot from then on
		for (const f of this.trav.J.feet) f.visible = !F.has("barefoot");
		if (H.tR) place(H.tR, this.trav, RH);
		if (H.tL && H.tL !== "staff") place(H.tL, this.trav, LH);
		if (H.pR) place(H.pR, this.priest, RH);
		if (H.pL) place(H.pL, this.priest, LH);
		// the lamp's own light: softer when it is brought up close to a face
		if (P.aarti.light) P.aarti.light.intensity = P.aarti.o.visible ? (this.low ? 2.2 : 1.8) * (1 - 0.55 * (S.close || 0)) : 0;
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
					// the figure as it is posed (kneeling, lying), but never framed shorter than standing height
					const bb = (this._bb = this._bb || new THREE.Box3()).setFromObject(a.root);
					bb.max.y = Math.max(bb.max.y, a.y + 0.5);
					b.union(bb);
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
		r.toneMappingExposure = (this.L && this.L.exposure) || ({ kedarnath: 1.3, badrinath: 1.05, tirupati: 1.3, shirdi: 1.1 }[this.key] ?? 1.35);
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
