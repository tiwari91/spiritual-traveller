// The last step of the picture, as a photographer would finish it: a soft bloom round the sun, lamps, diyas and
// fires (only what is truly brighter than white), then the tone curve and sRGB, then a light grade (a gentle
// S-curve, shadows a touch cool and highlights a touch warm) and a faint vignette. Weak devices skip all of it and
// render straight to the screen.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const GRADE = {
	uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 }, uContrast: { value: 0.12 }, uSplit: { value: 0.025 } },
	vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
	fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uVignette, uContrast, uSplit;
varying vec2 vUv;
void main() {
	vec4 c = texture2D(tDiffuse, vUv);
	vec3 col = c.rgb;
	// S-curve about the middle grey, kept off the black and white points
	vec3 s = col * col * (3.0 - 2.0 * col);
	col = mix(col, s, uContrast);
	// split toning: cool shadows, warm highlights
	float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col += uSplit * (vec3(-0.6, -0.1, 0.7) * (1.0 - smoothstep(0.0, 0.45, l)) + vec3(0.7, 0.25, -0.6) * smoothstep(0.55, 1.0, l));
	// a faint vignette
	vec2 d = vUv - 0.5;
	col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
	gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
}`,
};

export class Post {
	constructor(renderer, scene, camera) {
		this.renderer = renderer;
		const size = renderer.getDrawingBufferSize(new THREE.Vector2());
		const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
		this.composer = new EffectComposer(renderer, rt);
		this.composer.addPass(new RenderPass(scene, camera));
		this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.45, 2.2);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		this.grade = new ShaderPass(GRADE);
		this.composer.addPass(this.grade);
		// (the triangle counts the checks read are for the whole frame, all passes together)
		renderer.info.autoReset = false;
	}
	// night: 0 by day, 1 at night, when the lamps carry the picture and their glow spreads a little wider
	render(night = 0) {
		this.bloom.strength = 0.2 + 0.3 * night;
		this.bloom.threshold = 2.2 - 1.2 * night;
		this.renderer.info.reset();
		this.composer.render();
	}
	setSize(w, h) {
		this.composer.setPixelRatio(this.renderer.getPixelRatio());
		this.composer.setSize(w, h);
	}
}
