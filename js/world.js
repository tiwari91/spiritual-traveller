// The stylised map of India: height field, land colours, sea and rivers.
import * as THREE from "three";
import { haze, patch } from "./batch.js";
import { groundDetail } from "./textures.js";
import { INDIA, KAILASH, LANKA, NEIGHBOURS, RIVERS, SHRINES, toWorld, toGeo } from "./geo.js";
import { LAKES } from "./kailash-geo.js";
import { kColour, kGround, kHeight, lakeDist } from "./kailash-world.js";
import { clamp, fbm, inPoly, lerp, polyDist, smoothstep } from "./util.js";

// Main Himalayan crest as lat = f(lon).
const CREST = [[72.5, 34.2], [74.5, 34.6], [76.5, 33.3], [78.0, 32.0], [79.3, 31.0], [80.5, 30.3], [82.5, 29.4], [84.5, 28.6], [86.5, 28.0], [88.2, 27.8], [90.5, 28.0], [92.5, 28.3], [95.0, 28.8], [97.5, 28.6]];
function crestLat(lon) {
	if (lon <= CREST[0][0]) return CREST[0][1];
	for (let i = 0; i < CREST.length - 1; i++) {
		if (lon <= CREST[i + 1][0]) return lerp(CREST[i][1], CREST[i + 1][1], (lon - CREST[i][0]) / (CREST[i + 1][0] - CREST[i][0]));
	}
	return CREST[CREST.length - 1][1];
}
const GHATS = [[73.3, 21.0], [73.4, 19.6], [73.55, 19.07], [73.8, 18.3], [73.9, 17.2], [74.3, 16.0], [74.8, 14.6], [75.5, 13.0], [76.5, 11.5], [77.0, 10.2], [77.3, 8.8]];
const EGHATS = [[84.5, 19.5], [83.0, 18.2], [81.5, 16.6], [80.0, 14.8], [79.3, 13.7], [78.8, 12.5]];
const VINDHYA = [[73.5, 22.2], [75.5, 22.4], [78.0, 22.6], [80.5, 22.9], [82.5, 23.4]];
const ARAVALLI = [[72.8, 24.2], [74.2, 25.6], [75.5, 26.9], [76.8, 28.1]];
const SPOTS = [
	{ lon: 73.535, lat: 19.072, r: 0.2, h: 15.5, blend: 0.14, tint: [0.2, 0.42, 0.18] }, // Bhimashankar plateau on the Ghats crest
	{ lon: 79.347, lat: 13.683, r: 0.17, h: 14.0, blend: 0.12, tint: [0.36, 0.48, 0.27] }, // Tirumala hill top
	// Himalayan valleys: centred a little in front of each temple so the darshan camera stands on open ground
	{ lon: 79.067, lat: 30.69, r: 0.2, h: 46.0, blend: 0.1, tint: [0.42, 0.44, 0.31], soften: true }, // Kedarnath, alpine meadow at the valley head
	{ lon: 79.54, lat: 30.744, r: 0.2, h: 40.0, blend: 0.1, tint: [0.45, 0.45, 0.33], soften: true }, // Badrinath, on the Alaknanda
];

export const isIndia = (lon, lat) => inPoly(INDIA, lon, lat) || inPoly(LANKA, lon, lat);
export const isLand = (lon, lat) => isIndia(lon, lat) || inPoly(NEIGHBOURS, lon, lat);

export function heightAt(lon, lat, land) {
	const inside = land === undefined ? isLand(lon, lat) : land;
	if (!inside) return -3;
	// Base relief by region.
	const n1 = fbm(lon * 0.9, lat * 0.9, 3), n2 = fbm(lon * 3.1 + 4, lat * 3.1, 4);
	let h = 0.8 + n1 * 1.2;
	// Deccan plateau: raised south of the Narmada, east of the Ghats.
	const dec = smoothstep(23.5, 21.0, lat) * smoothstep(7.5, 10.5, lat) * smoothstep(73.0, 74.6, lon) * smoothstep(84.5, 80.5, lon);
	h += dec * (4.5 + n2 * 3.5);
	// Western Ghats ridge.
	const dg = polyDist(GHATS, lon, lat, false);
	const ghats = smoothstep(1.1, 0.0, dg);
	h += ghats * ghats * (11 + n2 * 6) + ghats * 2;
	const deg = polyDist(EGHATS, lon, lat, false);
	h += smoothstep(0.9, 0, deg) * (4 + n2 * 3);
	h += smoothstep(0.8, 0, polyDist(VINDHYA, lon, lat, false)) * (5 + n2 * 3);
	h += smoothstep(0.7, 0, polyDist(ARAVALLI, lon, lat, false)) * (4 + n2 * 3);
	// Himalaya: foothills rise over two degrees to the crest; the plateau beyond stays high.
	const dN = lat - crestLat(lon);
	const foot = smoothstep(-2.6, -0.3, dN);
	const mt = fbm(lon * 2.2 + 1, lat * 2.2 + 3, 5);
	const high = smoothstep(-1.2, 0.0, dN);
	let him = foot * foot * (24 + mt * 22) + high * (18 + mt * 24);
	if (dN > 0) him = 46 + mt * 16 - smoothstep(0, 2.5, dN) * 10;
	h += him;
	// Northeast hills and the Thar lowland.
	h += smoothstep(1.5, 0, polyDist([[94.0, 27.0], [94.5, 24.5], [93.5, 22.5]], lon, lat, false)) * (6 + n2 * 4);
	// Flat spots for the shrines and Pune.
	// Around the Himalayan shrines the relief is softened, so from the temple you look up at a ring of
	// peaks rather than into a wall (the map's vertical scale is exaggerated many times).
	// (the Kailash journey draws its own ground round its stops: kailash-world.js)
	const spots = KAILASH ? [] : SPOTS;
	for (const s of spots) {
		if (!s.soften) continue;
		const d = Math.hypot(lon - s.lon, lat - s.lat);
		if (d < 1.0) h = s.h + (h - s.h) * lerp(0.15, 1, smoothstep(0.15, 1.0, d));
	}
	for (const s of spots) {
		const d = Math.hypot(lon - s.lon, (lat - s.lat));
		const t = smoothstep(s.r + s.blend, s.r, d);
		h = lerp(h, s.h, t);
	}
	if (KAILASH) h = kHeight(lon, lat, h);
	return h;
}

// Land colour by region, before lighting.
const C = {
	sea: [0.06, 0.2, 0.36], shore: [0.78, 0.72, 0.52], plain: [0.46, 0.58, 0.3], plainWet: [0.33, 0.55, 0.3],
	deccan: [0.55, 0.5, 0.3], forest: [0.14, 0.36, 0.17], dry: [0.74, 0.64, 0.42], rock: [0.42, 0.37, 0.33],
	snow: [0.93, 0.95, 0.98], alpine: [0.36, 0.44, 0.3], tibet: [0.6, 0.55, 0.45],
};
function mix3(a, b, t, out) {
	out[0] = lerp(a[0], b[0], t);
	out[1] = lerp(a[1], b[1], t);
	out[2] = lerp(a[2], b[2], t);
	return out;
}
export function colourAt(lon, lat, h, coast, foreign) {
	const out = [0, 0, 0];
	if (h < 0) return mix3(C.sea, C.shore, smoothstep(-3, 0, h) * 0.3, out);
	const n = fbm(lon * 5 + 9, lat * 5, 3);
	const dN = lat - crestLat(lon);
	// plains vs plateau
	const gangetic = smoothstep(23.0, 25.0, lat) * smoothstep(90, 86, lon) * smoothstep(75.5, 77.5, lon) * smoothstep(-0.2, -1.6, dN);
	const thar = smoothstep(75.5, 72.5, lon) * smoothstep(23.5, 25.5, lat) * smoothstep(31, 29, lat);
	const ghatsForest = smoothstep(1.2, 0.0, polyDist(GHATS, lon, lat, false)) * smoothstep(7.5, 9.5, lat);
	const ne = smoothstep(89.5, 92, lon) * smoothstep(21, 23.5, lat);
	let base = mix3(C.deccan, C.plain, 0.5 + 0.4 * (n - 0.5), out.slice());
	base = mix3(base, C.plainWet, gangetic, base);
	base = mix3(base, C.dry, thar, base);
	base = mix3(base, C.forest, ghatsForest * (0.75 + 0.25 * n), base);
	base = mix3(base, C.forest, ne * 0.8, base);
	// mountains: alpine meadow, rock and snow by height
	const alp = smoothstep(14, 24, h) * smoothstep(-3, -1.5, dN);
	base = mix3(base, C.alpine, alp, base);
	const rock = smoothstep(26, 36, h) * (0.7 + 0.3 * n);
	base = mix3(base, C.rock, rock, base);
	const snow = smoothstep(49 + n * 6, 57 + n * 6, h);
	base = mix3(base, C.snow, snow, base);
	if (dN > 0.8) base = mix3(base, C.tibet, smoothstep(0.8, 2.0, dN) * 0.6, base);
	// shore sand and a little variation
	base = mix3(base, C.shore, smoothstep(0.25, 0.0, coast) * 0.7, base);
	// shrine surroundings: forest, hill scrub or alpine meadow rather than snow
	for (const sp of KAILASH ? [] : SPOTS) {
		if (!sp.tint) continue;
		const t = smoothstep(sp.r + sp.blend * 0.8, sp.r * 0.6, Math.hypot(lon - sp.lon, lat - sp.lat));
		if (t > 0) base = mix3(base, sp.tint, t * (0.8 + 0.2 * n), base);
	}
	if (foreign) {
		const l = base[0] * 0.3 + base[1] * 0.55 + base[2] * 0.15;
		base = mix3(base, [l, l, l * 1.05], 0.55, base);
		base[0] *= 0.82;
		base[1] *= 0.82;
		base[2] *= 0.86;
	}
	const v = 0.92 + 0.16 * fbm(lon * 11, lat * 11, 2);
	base[0] *= v;
	base[1] *= v;
	base[2] *= v;
	return base;
}

// What the ground is made of, for the close-up detail shader: x = red soil (laterite in the Sahyadri, the
// red earth of Telangana and Rayalaseema), y = black cotton soil (the Deccan trap), z = how green the
// cover is, w = how dry. Whatever is neither red nor black is the grey-brown alluvium of the plains.
export function groundAt(lon, lat, h) {
	const dN = lat - crestLat(lon);
	const ghats = smoothstep(1.3, 0.2, polyDist(GHATS, lon, lat, false)) * smoothstep(8.5, 10, lat);
	const deccan = smoothstep(23.2, 21.5, lat) * smoothstep(13.5, 15.2, lat) * smoothstep(73.6, 74.6, lon) * smoothstep(81.5, 79.5, lon);
	const telangana = smoothstep(76.6, 77.6, lon) * smoothstep(19.8, 18.8, lat) * smoothstep(81.5, 80.5, lon);
	const south = smoothstep(15.2, 13.8, lat) * smoothstep(73.5, 75.5, lon);
	const central = smoothstep(19.0, 20.2, lat) * smoothstep(25.6, 24.4, lat);
	const ganga = smoothstep(24.4, 25.6, lat) * smoothstep(-0.6, -1.8, dN);
	const thar = smoothstep(75.5, 72.5, lon) * smoothstep(23.5, 25.5, lat) * smoothstep(31, 29, lat);
	const hills = smoothstep(-2.4, -1.2, dN);
	const n = fbm(lon * 3 + 7, lat * 3 + 1, 3);
	let red = Math.max(ghats * 0.85, telangana * 0.75, south * 0.7) * (0.8 + 0.4 * n);
	let black = Math.max(deccan * (1 - telangana * 0.8), central * 0.55) * (1 - ghats * 0.8) * (0.75 + 0.5 * n);
	red *= 1 - hills;
	black *= 1 - hills;
	const sum = red + black;
	if (sum > 0.95) {
		red *= 0.95 / sum;
		black *= 0.95 / sum;
	}
	// green: monsoon ghats and the Himalayan foothills; the Deccan and Rayalaseema stay dry
	let green = 0.4 + ghats * 0.5 + ganga * 0.25 + hills * 0.35 - deccan * 0.12 - thar * 0.4 + smoothstep(14, 26, h) * 0.1;
	let dry = 0.4 + deccan * 0.35 + telangana * 0.15 + south * 0.05 + thar * 0.5 - ghats * 0.4 - ganga * 0.1 - hills * 0.3;
	const g = [clamp(red, 0, 1), clamp(black, 0, 1), clamp(green, 0, 1), clamp(dry, 0, 1)];
	return KAILASH ? kGround(lon, lat, h, g) : g;
}

const GROUND_VS = `
attribute vec4 aGround;
varying vec4 vGround;
varying vec3 vWPos;
varying vec3 vWNrm;
`;
const GROUND_FS = `
uniform sampler2D uDetail;
uniform float uDetailFar;
varying vec4 vGround;
varying vec3 vWPos;
varying vec3 vWNrm;
vec3 groundDetailColor( vec3 macro ) {
	vec2 p = vWPos.xz;
	vec4 d0 = texture2D( uDetail, p * 0.031 + vec2( 0.71, 0.13 ) );
	vec4 d1 = texture2D( uDetail, p * 0.29 + vec2( 0.2, 0.6 ) );
	vec4 d2 = texture2D( uDetail, p * 1.37 + vec2( 0.37, 0.05 ) );
	vec4 d3 = texture2D( uDetail, p * 5.3 );
	float wr = vGround.x, wb = vGround.y, wa = max( 0.0, 1.0 - wr - wb );
	// soils, in linear colour
	vec3 soil = vec3( 0.21, 0.085, 0.04 ) * wr + vec3( 0.062, 0.052, 0.042 ) * wb + vec3( 0.19, 0.15, 0.095 ) * wa;
	soil *= 0.72 + 0.42 * d2.r + 0.18 * ( d3.r - 0.5 );
	// dried black soil cracks into plates
	soil *= mix( 1.0, 0.82 + 0.18 * d2.b, wb * vGround.w );
	// grass cover in patches
	float cover = vGround.z + ( d0.a - 0.5 ) * 0.9 + ( d1.a - 0.5 ) * 0.45 + ( d2.g - 0.5 ) * 0.2;
	cover = smoothstep( 0.12, 0.62, cover + 0.08 );
	float dryness = clamp( vGround.w + ( d0.r - 0.5 ) * 0.5 + ( d1.g - 0.5 ) * 0.3, 0.0, 1.0 );
	vec3 green = vec3( 0.06, 0.11, 0.025 ), olive = vec3( 0.12, 0.125, 0.045 ), straw = vec3( 0.24, 0.19, 0.09 );
	vec3 grass = mix( mix( green, olive, smoothstep( 0.0, 0.55, dryness ) ), straw, smoothstep( 0.45, 1.0, dryness ) );
	grass *= 0.62 + 0.55 * d3.g + 0.25 * ( d2.g - 0.5 );
	vec3 col = mix( soil, grass, cover );
	// bare rock on steep slopes: dark basalt in the ghats, grey granite and schist elsewhere
	float slope = 1.0 - clamp( vWNrm.y, 0.0, 1.0 );
	float rock = smoothstep( 0.3, 0.55, slope + ( d1.r - 0.5 ) * 0.25 );
	vec3 rk = mix( vec3( 0.16, 0.15, 0.14 ), vec3( 0.07, 0.065, 0.06 ), wr ) * ( 0.65 + 0.7 * d1.r ) * ( 0.85 + 0.3 * d3.r );
	col = mix( col, rk, rock );
	// keep the regional hue of the map so the detail never strays far from it
	float lm = dot( macro, vec3( 0.3, 0.59, 0.11 ) ), lc = dot( col, vec3( 0.3, 0.59, 0.11 ) );
	col = mix( col, macro * ( lc / max( lm, 1e-3 ) ), 0.22 );
	return col;
}
`;

export class World {
	constructor(opts) {
		this.lon0 = 66;
		this.lon1 = 98.5;
		this.lat0 = 4.5;
		this.lat1 = 38.5;
		this.step = opts.step || 0.09; // degrees per vertex
		if (KAILASH) {
			// the Kailash journey needs only northern India and western Tibet, drawn much finer: the lakes, the
			// passes and the valleys of the parikrama are walked on, so they have to be in the ground itself
			Object.assign(this, { lon0: 76, lon1: 82.6, lat0: 27, lat1: 32.1 });
			this.step = this.step > 0.1 ? 0.026 : 0.016;
		}
		this.nx = Math.round((this.lon1 - this.lon0) / this.step) + 1;
		this.ny = Math.round((this.lat1 - this.lat0) / this.step) + 1;
		this.h = new Float32Array(this.nx * this.ny);
		this.land = new Uint8Array(this.nx * this.ny);
	}
	// Build the height grid, then meshes.
	compute() {
		const { nx, ny, step } = this;
		for (let j = 0; j < ny; j++) {
			const lat = this.lat0 + j * step;
			for (let i = 0; i < nx; i++) {
				const lon = this.lon0 + i * step;
				const india = isIndia(lon, lat);
				const land = india || inPoly(NEIGHBOURS, lon, lat);
				this.land[j * nx + i] = land ? (india ? 1 : 2) : 0;
				let h = heightAt(lon, lat, land);
				// let the land fall away at the edges of the map
				const e = Math.min(lon - this.lon0, this.lon1 - lon, lat - this.lat0, this.lat1 - lat);
				if (land) h = lerp(-3, h, smoothstep(0, KAILASH ? 0.5 : 1.6, e));
				this.h[j * nx + i] = h;
			}
		}
		// Soften the coast: land cells next to sea fall to the shoreline gradually.
		const soft = new Float32Array(this.h);
		for (let j = 1; j < ny - 1; j++) {
			for (let i = 1; i < nx - 1; i++) {
				const k = j * nx + i;
				const l = this.land[k];
				let sum = 0, n = 0;
				for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
					sum += this.h[k + dj * nx + di];
					n++;
				}
				const avg = sum / n;
				// smooth everywhere a little, more at the coast
				const coastal = !this.land[k - 1] !== !l || !this.land[k + 1] !== !l || !this.land[k - nx] !== !l || !this.land[k + nx] !== !l;
				soft[k] = coastal ? lerp(this.h[k], avg, 0.85) : lerp(this.h[k], avg, 0.35);
			}
		}
		this.h = soft;
	}
	// Bilinear height at world x,z (matches the mesh).
	height(x, z) {
		const g = toGeo(x, z);
		const fx = (g.lon - this.lon0) / this.step, fy = (g.lat - this.lat0) / this.step;
		const i = clamp(Math.floor(fx), 0, this.nx - 2), j = clamp(Math.floor(fy), 0, this.ny - 2);
		const tx = clamp(fx - i, 0, 1), ty = clamp(fy - j, 0, 1);
		const k = j * this.nx + i;
		const a = this.h[k], b = this.h[k + 1], c = this.h[k + this.nx], d = this.h[k + this.nx + 1];
		// Same triangle split as the mesh (diagonal b-c), so things sit exactly on the surface.
		if (tx + ty <= 1) return a + (b - a) * tx + (c - a) * ty;
		return d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
	}
	buildMeshes() {
		const { nx, ny, step } = this;
		const geo = new THREE.BufferGeometry();
		const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), gnd = new Float32Array(nx * ny * 4);
		for (let j = 0; j < ny; j++) {
			const lat = this.lat0 + j * step;
			for (let i = 0; i < nx; i++) {
				const lon = this.lon0 + i * step;
				const k = j * nx + i;
				const w = toWorld(lon, lat);
				const h = this.h[k];
				pos[k * 3] = w.x;
				pos[k * 3 + 1] = h;
				pos[k * 3 + 2] = w.z;
				// coast distance approximated by neighbours' land flags
				let coast = 1;
				if (this.land[k]) {
					const r = 3;
					outer: for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
						const jj = j + dj, ii = i + di;
						if (jj < 0 || jj >= ny || ii < 0 || ii >= nx) continue;
						if (!this.land[jj * nx + ii]) {
							coast = Math.min(coast, Math.hypot(di, dj) * step);
							if (coast < step) break outer;
						}
					}
				}
				let c = colourAt(lon, lat, h, coast, !KAILASH && this.land[k] === 2);
				if (KAILASH) {
					// no line between India and its neighbours here: the ground is coloured by what it is
					const sx = this.step * 40 * 2, gx = this.h[k + (i < nx - 1 ? 1 : 0)] - this.h[k - (i > 0 ? 1 : 0)], gz = this.h[k + (j < ny - 1 ? nx : 0)] - this.h[k - (j > 0 ? nx : 0)];
					c = kColour(lon, lat, h, 1 - 1 / Math.hypot(gx / sx, gz / sx, 1), c);
				}
				gnd.set(groundAt(lon, lat, h), k * 4);
				// design colours are sRGB; the renderer works in linear
				col[k * 3] = Math.pow(c[0], 2.2);
				col[k * 3 + 1] = Math.pow(c[1], 2.2);
				col[k * 3 + 2] = Math.pow(c[2], 2.2);
			}
		}
		const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
		let p = 0;
		for (let j = 0; j < ny - 1; j++) {
			for (let i = 0; i < nx - 1; i++) {
				const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
				idx[p++] = a; idx[p++] = b; idx[p++] = c;
				idx[p++] = b; idx[p++] = d; idx[p++] = c;
			}
		}
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
		geo.setAttribute("aGround", new THREE.BufferAttribute(gnd, 4));
		geo.setIndex(new THREE.BufferAttribute(idx, 1));
		geo.computeVertexNormals();
		const mat = haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false }));
		// Close up, the flat map colour gives way to soil, grass and rock: tiled detail, patchy noise and
		// slope, blended by what the region's ground is made of, fading back to the map colour with distance.
		const uDetail = { value: groundDetail() };
		patch(mat, "ground", (sh) => {
			sh.uniforms.uDetail = uDetail;
			sh.vertexShader = GROUND_VS + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n\tvGround = aGround;\n\tvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWNrm = normalize( mat3( modelMatrix ) * objectNormal );");
			sh.fragmentShader = GROUND_FS + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
	{
		float camD = length( vWPos - cameraPosition );
		float near = 1.0 - smoothstep( 110.0, 420.0, camD );
		float snowy = smoothstep( 0.45, 0.7, dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) );
		float land = step( 0.05, vWPos.y );
		if ( near * land * ( 1.0 - snowy ) > 0.001 ) diffuseColor.rgb = mix( diffuseColor.rgb, groundDetailColor( diffuseColor.rgb ), near * land * ( 1.0 - snowy ) * 0.9 );
	}`);
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.receiveShadow = true;
		mesh.name = "terrain";
		this.mesh = mesh;

		// Sea: a large plane just below the shoreline.
		const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), new THREE.MeshStandardMaterial({ color: 0x12405f, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.92 }));
		sea.rotation.x = -Math.PI / 2;
		sea.position.set(0, -0.15, 0);
		sea.receiveShadow = true;
		this.sea = sea;

		// Rivers: flat ribbons laid slightly above the terrain.
		const rg = new THREE.Group();
		// silty river water that catches the sun, on pale sandbanks
		const rmat = haze(new THREE.MeshStandardMaterial({ color: 0x3e6a6c, roughness: 0.14, metalness: 0.05, emissive: 0x0a2228, emissiveIntensity: 0.25 }));
		const bank = haze(new THREE.MeshStandardMaterial({ color: 0xa8956e, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
		const river = (pts, w) => {
			const g = new THREE.Group();
			g.add(ribbon(pts.map((p) => p.clone().setY(p.y - 0.03)), w * 1.55, bank), ribbon(pts, w, rmat));
			return g;
		};
		for (const r of RIVERS) {
			const pts = [];
			for (let i = 0; i < r.pts.length - 1; i++) {
				const a = r.pts[i], b = r.pts[i + 1];
				const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08));
				for (let k = 0; k < n; k++) {
					const t = k / n;
					const mq = KAILASH ? 0 : 0.03;
					const lon = lerp(a[0], b[0], t) + (Math.sin(t * 9 + i) * mq), lat = lerp(a[1], b[1], t) + Math.cos(t * 7 + i) * mq;
					const w = toWorld(lon, lat);
					// the Himalayan shrines draw their own river; keep this one out of the courtyards
					if (SHRINES.some((s) => s.weather !== "monsoon" && s.lat > 25 && Math.hypot(lon - s.lon, lat - s.lat) < 0.12)) {
						if (pts.length > 1) rg.add(river(pts.splice(0), r.w * 0.9));
						continue;
					}
					pts.push(new THREE.Vector3(w.x, this.height(w.x, w.z) + 0.25, w.z));
				}
			}
			const w = toWorld(r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1]);
			if (pts.length) pts.push(new THREE.Vector3(w.x, this.height(w.x, w.z) + 0.25, w.z));
			if (pts.length > 1) rg.add(river(pts, r.w * 0.9));
		}
		this.rivers = rg;
		if (KAILASH) for (const L of LAKES) rg.add(lakeMesh(L, this));
		return mesh;
	}
}

// A flat ribbon mesh along a 3D polyline.
export function ribbon(pts, width, mat) {
	const n = pts.length;
	const pos = new Float32Array(n * 2 * 3);
	const idx = [];
	const up = new THREE.Vector3(0, 1, 0);
	for (let i = 0; i < n; i++) {
		const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
		const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
		const side = new THREE.Vector3().crossVectors(up, dir).multiplyScalar(width / 2);
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
	m.frustumCulled = false;
	return m;
}


// A lake's water (the Kailash journey): a flat sheet at its level reaching a little past the shore, where the shelving
// ground covers it; deep blue in the middle, turquoise over the shallows, with wind ripples and the sun's glitter.
const LAKE_FS = `
uniform float uLakeT;
varying vec3 vLkW;
float lkH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float lkN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( lkH( i ), lkH( i + vec2( 1.0, 0.0 ) ), u.x ), mix( lkH( i + vec2( 0.0, 1.0 ) ), lkH( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }
`;
function lakeMesh(L, world) {
	const s = 0.012, pad = 0.03;
	let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
	for (const [lo, la] of L.pts) (lo0 = Math.min(lo0, lo)), (lo1 = Math.max(lo1, lo)), (la0 = Math.min(la0, la)), (la1 = Math.max(la1, la));
	lo0 -= pad; lo1 += pad; la0 -= pad; la1 += pad;
	const nx = Math.ceil((lo1 - lo0) / s) + 1, ny = Math.ceil((la1 - la0) / s) + 1;
	const pos = [], col = [], idx = [], id = new Int32Array(nx * ny).fill(-1), sd = new Float32Array(nx * ny);
	for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sd[j * nx + i] = lakeDist(L, lo0 + i * s, la0 + j * s);
	const vert = (i, j) => {
		const k = j * nx + i;
		if (id[k] < 0) {
			const w = toWorld(lo0 + i * s, la0 + j * s);
			id[k] = pos.length / 3;
			pos.push(w.x, L.level, w.z);
			const t = smoothstep(0.2, 4.5, -sd[k]);
			col.push(...[0, 1, 2].map((c) => Math.pow(lerp(L.shallow[c], L.deep[c], t), 2.2)));
		}
		return id[k];
	};
	for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
		const k = j * nx + i;
		if (Math.min(sd[k], sd[k + 1], sd[k + nx], sd[k + nx + 1]) > 0.7) continue;
		const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
		// (wound to face up: c is one step north, -z)
		idx.push(a, b, c, b, d, c);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	const mat = haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.15 }));
	const uT = { value: 0 };
	patch(mat, "lake", (sh) => {
		sh.uniforms.uLakeT = uT;
		sh.vertexShader = "varying vec3 vLkW;\n" + sh.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n\tvLkW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
		sh.fragmentShader = LAKE_FS + sh.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
	{
		vec2 p = vLkW.xz * 3.0;
		float t = uLakeT;
		float e = 0.06;
		float h0 = lkN( p + vec2( t * 0.7, t * 0.4 ) ) + 0.5 * lkN( p * 2.3 - vec2( t * 1.1, -t * 0.6 ) );
		float hx = lkN( p + vec2( e, 0.0 ) + vec2( t * 0.7, t * 0.4 ) ) + 0.5 * lkN( ( p + vec2( e, 0.0 ) ) * 2.3 - vec2( t * 1.1, -t * 0.6 ) );
		float hz = lkN( p + vec2( 0.0, e ) + vec2( t * 0.7, t * 0.4 ) ) + 0.5 * lkN( ( p + vec2( 0.0, e ) ) * 2.3 - vec2( t * 1.1, -t * 0.6 ) );
		vec3 wn = normalize( vec3( ( h0 - hx ) * 0.9, 1.0, ( h0 - hz ) * 0.9 ) );
		normal = normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz );
	}`);
	});
	const m = new THREE.Mesh(g, mat);
	m.receiveShadow = true;
	m.name = "lake";
	m.onBeforeRender = () => (uT.value = performance.now() / 1000 * 0.35);
	m.userData.lake = L;
	return m;
}
