// The air of the Kailash country, which moves (main.js builds it once on kailash.html and calls update each frame):
// - a banner cloud streaming off the summit of Kailash, as one forms in the lee of a high peak in a strong wind
//   (drawn to the east, downwind of the afternoon westerlies; its size and direction are illustrative, not observed);
// - the shadows of the summer cumulus (sky.js draws the clouds) drifting across the plateau and the hills, laid on
//   the ground's own material so they run over every slope;
// - dust lifted off the dry, stony Barkha plain between the lakes and Darchen by the afternoon wind, drifting low
//   in wisps.
// None of it is solid. On the low setting the shadows and the banner stand still and there is no dust; under reduced
// motion the same.
import * as THREE from "three";
import { patch } from "./batch.js";
import { toGeo } from "./geo.js";
import { glowTexture } from "./landmarks.js";
import { tibet } from "./kailash-world.js";
import { clamp, rand, smoothstep } from "./util.js";

const RM = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const noRay = () => {};
// the wind, from the west (world +x is east); units a second
const WIND = new THREE.Vector2(1, 0.25).normalize();

// a cheap value noise for the cloud shadows, in the ground's fragment shader
const NOISE = `
float stHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float stCloud( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( stHash( i ), stHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( stHash( i + vec2( 0.0, 1.0 ) ), stHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;

export class Air {
	constructor(scene, world, low = false) {
		this.scene = scene;
		this.world = world;
		this.still = low || RM;
		this.low = low;
		this.t = 0;
		// the cloud shadows: patches of shade some kilometres across, a third of the sky's worth, moving with the wind
		this.U = { uCloudOff: { value: new THREE.Vector2(3.1, 7.7) }, uCloudAmt: { value: 0 } };
		const mat = world.mesh && world.mesh.material;
		if (mat) {
			const U = this.U;
			patch(mat, "cloudShadow", (sh) => {
				Object.assign(sh.uniforms, U);
				sh.fragmentShader = NOISE + "uniform vec2 uCloudOff;\nuniform float uCloudAmt;\n" + sh.fragmentShader.replace(
					"#include <opaque_fragment>",
					`{
		vec2 cq = vWPos.xz * 0.05 + uCloudOff;
		float cn = stCloud( cq ) * 0.62 + stCloud( cq * 2.2 + 7.1 ) * 0.28 + stCloud( cq * 5.1 + 3.3 ) * 0.1;
		outgoingLight *= 1.0 - 0.34 * smoothstep( 0.55, 0.68, cn ) * uCloudAmt;
	}
	#include <opaque_fragment>`,
				);
			});
			mat.needsUpdate = true;
		}
		this.banner = null;
		// the dust: a few soft, tawny wisps near the camera, each living some seconds
		this.dust = [];
		if (!this.still) {
			const dm = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xc9b48e, transparent: true, opacity: 0, depthWrite: false, fog: true });
			const R = rand(2207);
			for (let i = 0; i < 9; i++) {
				const s = new THREE.Sprite(dm.clone());
				s.visible = false;
				s.raycast = noRay;
				s.renderOrder = 2;
				scene.add(s);
				this.dust.push({ s, life: 0, age: 1, k: 0.6 + R() * 0.8 });
			}
			this.R = R;
		}
	}
	// The banner: soft puffs strung out downwind from the summit, swelling and thinning as they go.
	makeBanner() {
		const km = this.scene.getObjectByName("kailash");
		if (!km) return null;
		km.geometry.computeBoundingBox();
		const bb = km.geometry.boundingBox, top = km.position.y + bb.max.y;
		const g = new THREE.Group();
		g.position.set(km.position.x, top - 0.6, km.position.z);
		const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xd3d9e2, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
		const R = rand(5150), puffs = [];
		for (let i = 0; i < 20; i++) {
			const s = new THREE.Sprite(mat.clone());
			s.raycast = noRay;
			g.add(s);
			puffs.push({ s, u: i / 20, j: R() - 0.5, k: 0.8 + R() * 0.4 });
		}
		this.scene.add(g);
		return { g, puffs };
	}
	placeBanner() {
		for (const p of this.banner.puffs) {
			const u = p.u, L = 14;
			// out from the lee of the summit, sinking a little and spreading
			p.s.position.set(WIND.x * u * L + p.j * u * 1.2, -u * 1.6 + p.j * 0.4, WIND.y * u * L + p.j * u * 2);
			const w = (1.6 + u * 5.0) * p.k;
			p.s.scale.set(w, w * (0.55 - u * 0.25), 1);
			p.s.material.opacity = 0.85 * smoothstep(0, 0.04, u) * (1 - smoothstep(0.45, 1, u));
		}
	}
	// dt: seconds; camera; focus: the point the camera looks at; thin: how far into the plateau's air (0..1);
	// night: 0 by day to 1 at night; overcast: 0..1
	update(dt, camera, focus, thin = 0, night = 0, overcast = 0) {
		this.t += dt;
		const day = 1 - night;
		this.U.uCloudAmt.value = clamp(thin * day * (1 - overcast), 0, 1);
		if (!this.still) this.U.uCloudOff.value.addScaledVector(WIND, -dt * 0.012);
		// the banner, once Kailash is built; seen only when the sun is up and the sky not closed in
		if (!this.banner) {
			this.banner = this.makeBanner() || null;
			if (this.banner) this.placeBanner();
		}
		if (this.banner) {
			this.banner.g.visible = day > 0.3 && overcast < 0.6 && thin > 0.2;
			if (this.banner.g.visible && !this.still) {
				for (const p of this.banner.puffs) p.u = (p.u + dt / 70) % 1;
				this.placeBanner();
			}
		}
		// the dust, on the Barkha plain in the afternoon wind
		if (this.still || !focus) return;
		const g = toGeo(focus.x, focus.z);
		const on = day > 0.5 && overcast < 0.5 && tibet(g.lon, g.lat) > 0.5 && g.lon > 81.18 && g.lon < 81.46 && g.lat > 30.74 && g.lat < 30.99;
		const R = this.R;
		for (const d of this.dust) {
			d.age += dt / d.life;
			if (d.age >= 1) {
				d.s.visible = false;
				if (!on) continue;
				// a new wisp upwind of the focus, within a few units of it
				const a = R() * Math.PI * 2, r = 1.5 + R() * 6;
				const x = focus.x + Math.cos(a) * r - WIND.x * 3, z = focus.z + Math.sin(a) * r - WIND.y * 3;
				d.s.position.set(x, this.world.height(x, z) + 0.12 + R() * 0.25, z);
				d.life = 5 + R() * 6;
				d.age = 0;
				d.s.visible = true;
			}
			const p = d.s.position;
			p.x += WIND.x * dt * 0.7 * d.k;
			p.z += WIND.y * dt * 0.7 * d.k;
			p.y = Math.max(p.y, this.world.height(p.x, p.z) + 0.1);
			const w = (1.2 + d.age * 2.2) * d.k;
			d.s.scale.set(w, w * 0.28, 1);
			d.s.material.opacity = 0.16 * Math.sin(Math.PI * d.age) * day;
		}
	}
}
