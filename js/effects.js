// Route line, the pilgrim's lamp, town lights, rain, snow and falling petals.
import * as THREE from "three";
import { CITIES, toWorld } from "./geo.js";
import { glowTexture } from "./landmarks.js";
import { rand } from "./util.js";

// The route as a ribbon that glows saffron behind the pilgrim and shows dashed gold ahead.
export function routeLine(route) {
	const pts = route.pts;
	const n = pts.length;
	const pos = new Float32Array(n * 6), dirA = new Float32Array(n * 6), sAttr = new Float32Array(n * 2), side = new Float32Array(n * 2);
	const idx = [];
	for (let i = 0; i < n; i++) {
		const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
		let dx = b.x - a.x, dz = b.z - a.z;
		const l = Math.hypot(dx, dz) || 1;
		dx /= l;
		dz /= l;
		const p = pts[i];
		const y = p.y + 0.3;
		pos.set([p.x, y, p.z, p.x, y, p.z], i * 6);
		// perpendicular, so the shader can set the width from the camera distance
		dirA.set([dz, 0, -dx, dz, 0, -dx], i * 6);
		sAttr[i * 2] = sAttr[i * 2 + 1] = p.s;
		side[i * 2] = -1;
		side[i * 2 + 1] = 1;
		if (i < n - 1) {
			const k = i * 2;
			idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	g.setAttribute("aDir", new THREE.BufferAttribute(dirA, 3));
	g.setAttribute("aS", new THREE.BufferAttribute(sAttr, 1));
	g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
	g.setIndex(idx);
	const mat = new THREE.ShaderMaterial({
		uniforms: { uProg: { value: 0 }, uTime: { value: 0 }, uDone: { value: new THREE.Color(0xffa63d) }, uAhead: { value: new THREE.Color(0xf3dfa8) }, uWidth: { value: 0.3 } },
		vertexShader: `
uniform float uWidth; attribute vec3 aDir; attribute float aS; attribute float aSide; varying float vS; varying float vSide;
void main(){ vS = aS; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aDir * aSide * uWidth, 1.0); }`,
		fragmentShader: `
uniform float uProg, uTime; uniform vec3 uDone, uAhead; varying float vS; varying float vSide;
void main(){
	float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
	vec4 c;
	if (vS <= uProg) {
		float pulse = 0.75 + 0.25 * sin(vS * 0.8 - uTime * 3.0);
		c = vec4(uDone * (1.1 + 0.4 * pulse), 0.95 * edge + 0.05);
	} else {
		float dash = step(0.45, fract(vS * 0.35 - uTime * 0.25));
		c = vec4(uAhead, 0.55 * dash * edge);
	}
	if (c.a < 0.02) discard;
	gl_FragColor = c;
	#include <colorspace_fragment>
}`,
		transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
	});
	const m = new THREE.Mesh(g, mat);
	m.frustumCulled = false;
	m.renderOrder = 3;
	return m;
}

// The pilgrim: a small clay diya with a living flame and a halo you can always find.
export function pilgrimLamp() {
	const g = new THREE.Group();
	const clay = new THREE.MeshStandardMaterial({ color: 0xb4592c, roughness: 0.8 });
	const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), clay);
	bowl.scale.y = 0.6;
	bowl.position.y = 0.14;
	g.add(bowl);
	const lip = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), clay);
	lip.rotation.x = Math.PI / 2;
	lip.position.y = 0.14;
	g.add(lip);
	const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 12), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
	flame.position.y = 0.3;
	g.add(flame);
	const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4cf }));
	core.position.y = 0.22;
	g.add(core);
	const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb547, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
	halo.position.y = 0.3;
	halo.scale.setScalar(1.6);
	halo.renderOrder = 6;
	g.add(halo);
	g.userData = { flame, halo };
	return g;
}

// Little clusters of lamps at each town, visible after dusk.
export function cityLights(world) {
	const pos = [], col = [];
	const R = rand(5);
	const c = new THREE.Color();
	for (const city of CITIES) {
		const w = toWorld(city.lon, city.lat);
		const n = city.size * 26;
		for (let i = 0; i < n; i++) {
			const a = R() * Math.PI * 2, d = Math.pow(R(), 0.7) * city.size * 0.9;
			const x = w.x + Math.cos(a) * d, z = w.z + Math.sin(a) * d;
			pos.push(x, world.height(x, z) + 0.3, z);
			c.setHSL(0.09 + R() * 0.05, 0.9, 0.6 + R() * 0.2);
			col.push(c.r, c.g, c.b);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
	const m = new THREE.PointsMaterial({ size: 0.6, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
	const p = new THREE.Points(g, m);
	p.frustumCulled = false;
	return p;
}

// Rain streaks and snowflakes in a box that follows the camera's focus.
export class Weather {
	constructor(scene) {
		const N = 2200;
		this.N = N;
		this.box = 46;
		this.H = 30;
		const R = rand(9);
		this.seed = new Float32Array(N * 3);
		for (let i = 0; i < N * 3; i++) this.seed[i] = R();
		const rg = new THREE.BufferGeometry();
		rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
		this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc6d3e0, transparent: true, opacity: 0, depthWrite: false }));
		this.rain.frustumCulled = false;
		const sg = new THREE.BufferGeometry();
		sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
		this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false }));
		this.snow.frustumCulled = false;
		scene.add(this.rain, this.snow);
		this.t = 0;
	}
	update(dt, focus, rain, snow, scale = 1) {
		this.t += dt;
		const B = this.box * scale, H = this.H * scale;
		this.rain.visible = rain > 0.02;
		this.snow.visible = snow > 0.02;
		this.rain.material.opacity = rain * 0.55;
		this.snow.material.opacity = snow * 0.95;
		this.snow.material.size = 0.22 * Math.max(1, scale * 0.8);
		const sd = this.seed, t = this.t;
		if (this.rain.visible) {
			const a = this.rain.geometry.attributes.position.array;
			for (let i = 0; i < this.N; i++) {
				const x = focus.x + (sd[i * 3] - 0.5) * B, z = focus.z + (sd[i * 3 + 1] - 0.5) * B;
				const y = focus.y + H - ((sd[i * 3 + 2] * H + t * 26 * scale) % H);
				a.set([x, y, z, x + 0.12 * scale, y - 0.9 * scale, z + 0.05 * scale], i * 6);
			}
			this.rain.geometry.attributes.position.needsUpdate = true;
		}
		if (this.snow.visible) {
			const a = this.snow.geometry.attributes.position.array;
			for (let i = 0; i < this.N; i++) {
				const ph = sd[i * 3] * 40;
				const x = focus.x + (sd[i * 3] - 0.5) * B + Math.sin(t * 0.7 + ph) * 0.6;
				const z = focus.z + (sd[i * 3 + 1] - 0.5) * B + Math.cos(t * 0.5 + ph) * 0.6;
				const y = focus.y + H - ((sd[i * 3 + 2] * H + t * 2.2 * scale) % H);
				a.set([x, y, z], i * 3);
			}
			this.snow.geometry.attributes.position.needsUpdate = true;
		}
	}
}

// Marigold and rose petals drifting down over the shrine during darshan.
export class Petals {
	constructor(scene) {
		const N = 160;
		this.N = N;
		const R = rand(21);
		this.seed = new Float32Array(N * 3);
		for (let i = 0; i < N * 3; i++) this.seed[i] = R();
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
		const col = new Float32Array(N * 3);
		const c = new THREE.Color();
		for (let i = 0; i < N; i++) {
			c.set([0xff9f1c, 0xffc23a, 0xe8452c, 0xff7b00][i % 4]);
			col.set([c.r, c.g, c.b], i * 3);
		}
		g.setAttribute("color", new THREE.BufferAttribute(col, 3));
		this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.2, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
		this.points.frustumCulled = false;
		scene.add(this.points);
		this.t = 0;
		this.level = 0;
	}
	update(dt, centre, on) {
		this.t += dt;
		this.level += ((on ? 1 : 0) - this.level) * Math.min(1, dt * 1.5);
		this.points.visible = this.level > 0.01;
		this.points.material.opacity = this.level;
		if (!this.points.visible) return;
		const a = this.points.geometry.attributes.position.array, sd = this.seed;
		for (let i = 0; i < this.N; i++) {
			const r = 0.6 + sd[i * 3] * 3.2, ang = sd[i * 3 + 1] * Math.PI * 2 + this.t * 0.25;
			const y = 6 - ((sd[i * 3 + 2] * 6 + this.t * 0.55) % 6);
			a.set([centre.x + Math.cos(ang) * r + Math.sin(this.t * 2 + i) * 0.08, centre.y + y, centre.z + Math.sin(ang) * r], i * 3);
		}
		this.points.geometry.attributes.position.needsUpdate = true;
	}
}
