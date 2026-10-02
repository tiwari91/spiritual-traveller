// Small helpers shared across modules.
import * as THREE from "three";
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Deterministic value noise.
function hash(x, y) {
	let h = (x * 374761393 + y * 668265263) | 0;
	h = (h ^ (h >> 13)) * 1274126177;
	h = h ^ (h >> 16);
	return ((h >>> 0) % 10000) / 10000;
}
export function noise2(x, y) {
	const ix = Math.floor(x), iy = Math.floor(y);
	const fx = x - ix, fy = y - iy;
	const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
	const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
export function fbm(x, y, oct = 4) {
	let s = 0, a = 0.5, n = 0;
	for (let i = 0; i < oct; i++) {
		s += a * noise2(x, y);
		n += a;
		x = x * 2.03 + 17.1;
		y = y * 2.03 + 9.7;
		a *= 0.5;
	}
	return s / n;
}
export function rand(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

export const store = {
	get(k, d) {
		try {
			const v = localStorage.getItem("st." + k);
			return v === null ? d : JSON.parse(v);
		} catch (e) {
			return d;
		}
	},
	set(k, v) {
		try {
			localStorage.setItem("st." + k, JSON.stringify(v));
		} catch (e) {
			/* private mode */
		}
	},
};

// Distance from point p to segment ab (2D).
export function segDist(px, py, ax, ay, bx, by) {
	const dx = bx - ax, dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	t = clamp(t, 0, 1);
	const x = ax + t * dx - px, y = ay + t * dy - py;
	return Math.sqrt(x * x + y * y);
}
export function polyDist(poly, x, y, closed = true) {
	let d = Infinity;
	const n = poly.length;
	for (let i = 0; i < (closed ? n : n - 1); i++) {
		const a = poly[i], b = poly[(i + 1) % n];
		const s = segDist(x, y, a[0], a[1], b[0], b[1]);
		if (s < d) d = s;
	}
	return d;
}
export function inPoly(poly, x, y) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}
export function hex(c) {
	return new THREE.Color(c);
}
