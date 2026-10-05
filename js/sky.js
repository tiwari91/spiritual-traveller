// Sky dome, sun, moon, stars and fog by hour of day.
import * as THREE from "three";
import { clamp, lerp, smoothstep } from "./util.js";

const KEYS = [
	// sun elevation, zenith, horizon, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, glow
	[-18, "#050a1c", "#101a38", "#2a3660", 0.0, "#2a3868", "#0d0f18", 0.36, "#000000"],
	[-8, "#0d1840", "#3a2d58", "#5a4e8e", 0.05, "#3a4278", "#17141e", 0.38, "#4a2a46"],
	[-2, "#1d2f6b", "#d9774f", "#ff7a40", 0.3, "#5a5f90", "#352722", 0.45, "#ff6a35"],
	[3, "#2f5296", "#f7b06a", "#ffa055", 1.1, "#8590b5", "#574430", 0.55, "#ff9a46"],
	[9, "#3e6fb6", "#f1c993", "#ffcf90", 1.9, "#9bb0cf", "#6b5a42", 0.65, "#ffbd70"],
	[20, "#3f7fc8", "#cfdde2", "#ffeacb", 2.4, "#a7c0dc", "#7a6d52", 0.72, "#ffdca8"],
	[45, "#2f72c9", "#b8d3e8", "#fff6ea", 2.7, "#b2cae4", "#827458", 0.78, "#ffe9c6"],
];
const KC = KEYS.map((k) => k.map((v) => (typeof v === "string" ? new THREE.Color(v) : v)));

// three r155+ uses physical light units; scale the old values to match.
const LIGHT = Math.PI * 0.8;

const VS = `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = p.xyww;
}`;
const FS = `
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uMoonDir;
uniform float uStars, uTime, uOvercast, uSunVis, uCumulus;
varying vec3 vDir;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.07; a *= 0.5; } return s; }
void main() {
	vec3 d = normalize(vDir);
	float h = d.y;
	float t = pow(1.0 - clamp(h, 0.0, 1.0), 3.0);
	vec3 col = mix(uZenith, uHorizon, t);
	float sd = max(dot(d, uSunDir), 0.0);
	col += uGlow * (pow(sd, 6.0) * 0.5 + pow(sd, 40.0) * 0.6) * (0.3 + 0.7 * t);
	col += uGlow * 0.2 * pow(sd, 2.0) * t;
	vec2 cp = d.xz / (h + 0.2);
	float c = fbm(cp * vec2(1.1, 2.2) + vec2(uTime * 0.003, 0.0));
	float cl = smoothstep(0.55, 0.85, c) * smoothstep(0.0, 0.14, h) * (1.0 - uOvercast);
	vec3 cloudCol = mix(uHorizon * 1.1 + 0.05, uGlow * 1.1 + uHorizon * 0.4, pow(sd, 3.0) * 0.8);
	col = mix(col, cloudCol, cl * 0.5);
	// the plateau's sky (the Kailash journey): great heaps of cumulus, white in the sun with grey undersides, sailing
	// over the ranges, between them the deep blue
	if (uCumulus > 0.01) {
		vec2 cq = d.xz / (h + 0.25);
		float base = fbm(cq * vec2(0.5, 1.0) + vec2(uTime * 0.0016, 2.7));
		float detail = fbm(cq * vec2(2.6, 5.2) + vec2(uTime * 0.003, 9.1));
		float body = smoothstep(0.5, 0.62, base + 0.18 * (detail - 0.5));
		float cover = body * smoothstep(0.0, 0.1, h) * (1.0 - uOvercast) * uCumulus;
		// lit from the sun's side: white tops, grey bases shading away from it
		float lit = clamp(0.35 + 0.65 * smoothstep(0.55, 0.85, base + 0.25 * detail) , 0.0, 1.0);
		float sunside = 0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4));
		vec3 cuCol = mix(vec3(0.58, 0.62, 0.68), vec3(1.0, 1.0, 0.99), lit * (0.75 + 0.25 * sunside)) * (0.55 + 0.45 * uSunVis);
		cuCol = mix(cuCol, cuCol * (uHorizon + 0.4), 1.0 - uSunVis);
		col = mix(col, cuCol, cover * 0.96);
	}
	float disc = smoothstep(0.9995, 0.9998, dot(d, uSunDir));
	col += vec3(1.0, 0.93, 0.8) * disc * 10.0 * uSunVis * (1.0 - uOvercast * 0.9);
	// moon
	float md = dot(d, uMoonDir);
	col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.9997, md) * 1.6 * uStars;
	col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 60.0) * 0.25 * uStars;
	if (uStars > 0.01 && h > 0.0) {
		vec2 g = floor(d.xz / (h + 0.35) * 240.0);
		float s = h21(g);
		float tw = 0.7 + 0.3 * sin(uTime * 2.0 + s * 60.0);
		col += vec3(smoothstep(0.996, 1.0, s)) * uStars * 1.4 * tw * smoothstep(0.0, 0.3, h);
		// milky band
		float band = exp(-pow((d.x * 0.8 + d.y * 0.5 - 0.1) * 3.0, 2.0));
		col += vec3(0.35, 0.4, 0.6) * band * 0.12 * uStars * fbm(d.xz * 30.0);
	}
	// overcast: monsoon grey, warmer near the sun
	vec3 grey = mix(vec3(0.5, 0.54, 0.6), uHorizon, 0.3) * (0.45 + 0.55 * clamp(uSunVis + 0.3, 0.0, 1.0));
	col = mix(col, grey * (0.85 + 0.2 * fbm(cp * 0.7 + uTime * 0.01)), uOvercast * smoothstep(-0.05, 0.2, h + 0.1));
	gl_FragColor = vec4(col, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

export class Sky {
	constructor(scene) {
		this.scene = scene;
		this.u = {
			uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
			uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
			uStars: { value: 0 }, uTime: { value: 0 }, uOvercast: { value: 0 }, uSunVis: { value: 1 }, uCumulus: { value: 0 },
		};
		this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false }));
		this.dome.frustumCulled = false;
		this.dome.renderOrder = -10;
		this.dome.scale.setScalar(1500);
		scene.add(this.dome);
		this.sun = new THREE.DirectionalLight(0xffffff, 2);
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.set(2048, 2048);
		const sc = this.sun.shadow.camera;
		sc.near = 1;
		sc.far = 400;
		sc.left = sc.bottom = -90;
		sc.right = sc.top = 90;
		this.sun.shadow.bias = -0.0008;
		this.sun.shadow.normalBias = 0.3;
		scene.add(this.sun);
		scene.add(this.sun.target);
		this.hemi = new THREE.HemisphereLight(0xa0b8d8, 0x6a5a42, 0.7);
		scene.add(this.hemi);
		this.moon = new THREE.DirectionalLight(0x8fa4d8, 0);
		scene.add(this.moon);
		scene.fog = new THREE.FogExp2(0x9fb6cc, 0.0035);
		this.overcast = 0;
		this.fogColor = new THREE.Color();
	}
	// hour: 0..24, focus: where the shadow box should centre.
	update(hour, focus, dt, weather) {
		const t = this.u.uTime.value += dt;
		const dayFrac = (hour - 6) / 12; // 6 -> sunrise, 18 -> sunset
		const elev = Math.sin(dayFrac * Math.PI) * 62;
		const az = lerp(-1.2, 1.2, clamp(dayFrac, -0.3, 1.3)); // east to west, mostly south
		const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos((elev * Math.PI) / 180), Math.sin((elev * Math.PI) / 180), Math.cos((elev * Math.PI) / 180) * 0.55 + 0.1).normalize();
		// find key frames
		let k = 0;
		while (k < KC.length - 2 && KC[k + 1][0] < elev) k++;
		const a = KC[k], b = KC[k + 1];
		const f = clamp((elev - a[0]) / (b[0] - a[0]), 0, 1);
		const zen = a[1].clone().lerp(b[1], f), hor = a[2].clone().lerp(b[2], f), sunCol = a[3].clone().lerp(b[3], f);
		const inten = lerp(a[4], b[4], f), hs = a[5].clone().lerp(b[5], f), hg = a[6].clone().lerp(b[6], f), hi = lerp(a[7], b[7], f), glow = a[8].clone().lerp(b[8], f);
		// the thin air of the Tibetan plateau (the Kailash journey): a deeper blue overhead, a harder sun, less haze
		const thin = weather.thin || 0;
		if (thin) {
			zen.lerp(new THREE.Color(0x1a3f9a), 0.45 * thin * smoothstep(-4, 12, elev));
			hor.lerp(new THREE.Color(0xa9c4e2), 0.3 * thin * smoothstep(-4, 12, elev));
		}
		this.overcast = lerp(this.overcast, weather.overcast, Math.min(1, dt * 0.8));
		const oc = this.overcast;
		this.u.uZenith.value.copy(zen);
		this.u.uHorizon.value.copy(hor);
		this.u.uGlow.value.copy(glow);
		this.u.uSunDir.value.copy(sunDir);
		this.u.uMoonDir.value.copy(sunDir).multiplyScalar(-1).setY(Math.abs(sunDir.y) * 0.8 + 0.2).normalize();
		this.u.uStars.value = smoothstep(-2, -12, elev);
		this.u.uOvercast.value = oc;
		this.u.uCumulus.value = weather.cumulus || 0;
		this.u.uSunVis.value = smoothstep(-3, 2, elev);
		this.sun.color.copy(sunCol);
		this.sun.intensity = inten * (1 - oc * 0.7) * LIGHT;
		this.sun.position.copy(focus).addScaledVector(sunDir, 180);
		this.sun.target.position.copy(focus);
		this.sun.target.updateMatrixWorld();
		this.sun.visible = elev > -3;
		this.moon.intensity = this.u.uStars.value * 0.9 * (1 - oc * 0.7) * LIGHT;
		this.moon.position.copy(focus).add(this.u.uMoonDir.value.clone().multiplyScalar(150));
		this.moon.target.position.copy(focus);
		this.hemi.color.copy(hs).lerp(new THREE.Color(0x6f7a88), oc * 0.5);
		this.hemi.groundColor.copy(hg);
		this.hemi.intensity = (hi + oc * 0.15 + 0.12) * LIGHT;
		this.fogColor.copy(hor).lerp(zen, 0.35).lerp(new THREE.Color(0x7f8a96), oc * 0.6);
		this.scene.fog.color.copy(this.fogColor);
		this.scene.fog.density = lerp(0.0028, 0.0075, oc) * (weather.snow ? 1.15 : 1) * (1 + 0.5 * this.u.uStars.value);
		if (thin) {
			this.scene.fog.density *= 1 - 0.4 * thin;
			this.sun.intensity *= 1 + 0.12 * thin;
		}
		this.dome.position.copy(focus);
		this.sunDir = sunDir;
		this.elev = elev;
	}
}
