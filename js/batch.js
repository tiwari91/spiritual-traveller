// Merge many small shapes into one vertex-coloured mesh, so a whole stretch of roadside is one draw call.
import * as THREE from "three";

// Unit templates with their origin at the bottom centre, non-indexed, position and normal only.
function template(g, lift = 0.5) {
	g.translate(0, lift, 0);
	const n = g.index ? g.toNonIndexed() : g;
	for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
	n.computeVertexNormals();
	return n;
}
export const T = {
	box: template(new THREE.BoxGeometry(1, 1, 1)),
	cyl: template(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1)),
	cyl12: template(new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1)),
	taper: template(new THREE.CylinderGeometry(0.32, 0.5, 1, 8, 1)),
	cone: template(new THREE.ConeGeometry(0.5, 1, 8, 1)),
	pyramid: template(new THREE.ConeGeometry(0.71, 1, 4, 1).rotateY(Math.PI / 4)),
	ball: template(new THREE.IcosahedronGeometry(0.5, 1), 0.5),
	dome: template(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0),
	// a gable roof: a triangular prism 1 wide, 1 tall, 1 deep
	gable: template(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), 0),
};
// A lumpy crown for trees.
T.crown = (() => {
	const g = new THREE.IcosahedronGeometry(0.5, 1);
	const p = g.attributes.position;
	for (let i = 0; i < p.count; i++) {
		const k = 1 + Math.sin(p.getX(i) * 17 + p.getY(i) * 11) * 0.09 + Math.cos(p.getZ(i) * 13) * 0.07;
		p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
	}
	return template(g, 0.5);
})();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
// Position, yaw and size in one matrix.
export function place(x, y, z, yaw, sx, sy, sz, pitch = 0, roll = 0) {
	_e.set(pitch, yaw, roll, "YXZ");
	_q.setFromEuler(_e);
	return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
// A beam of the given cross-section from point a to point b (centre line).
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function beam(a, b, w, h) {
	_d.subVectors(b, a);
	const len = _d.length() || 1e-6;
	_d.divideScalar(len);
	_q.setFromUnitVectors(_up, _d);
	// the box template sits on its base; shift so the beam is centred on a..b
	_m.compose(_p.copy(a), _q, _s.set(w, len, h));
	return _m;
}

export class Batch {
	constructor() {
		this.parts = [];
		this.count = 0;
	}
	add(geo, matrix, color) {
		this.parts.push({ geo, m: matrix.clone(), c: color instanceof THREE.Color ? color.clone() : new THREE.Color(color) });
		this.count += geo.attributes.position.count;
	}
	get empty() {
		return this.parts.length === 0;
	}
	build(material) {
		const g = this.buildGen(material);
		let r = g.next();
		while (!r.done) r = g.next();
		return r.value;
	}
	// The same, as a generator that yields every `slice` vertices so a big merge can span frames.
	*buildGen(material, slice = 40000) {
		const n = this.count;
		let since = 0;
		const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
		const v = new THREE.Vector3(), nm = new THREE.Matrix3();
		let o = 0;
		for (const part of this.parts) {
			since += part.raw ? part.P.length / 3 : part.geo.attributes.position.count;
			if (since > slice) {
				since = 0;
				yield;
			}
			if (part.raw) {
				pos.set(part.P, o);
				nor.set(part.N, o);
				col.set(part.C, o);
				o += part.P.length;
				continue;
			}
			const { geo, m, c, vc } = part;
			nm.getNormalMatrix(m);
			const P = geo.attributes.position.array, N = geo.attributes.normal.array;
			const VC = vc ? geo.attributes.color.array : null;
			for (let i = 0; i < P.length; i += 3) {
				v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m);
				pos[o] = v.x;
				pos[o + 1] = v.y;
				pos[o + 2] = v.z;
				v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize();
				nor[o] = v.x;
				nor[o + 1] = v.y;
				nor[o + 2] = v.z;
				if (VC) {
					col[o] = VC[i] * c.r;
					col[o + 1] = VC[i + 1] * c.g;
					col[o + 2] = VC[i + 2] * c.b;
				} else {
					col[o] = c.r;
					col[o + 1] = c.g;
					col[o + 2] = c.b;
				}
				o += 3;
			}
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
		g.setAttribute("color", new THREE.BufferAttribute(col, 3));
		g.computeBoundingSphere();
		const mesh = new THREE.Mesh(g, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.parts = [];
		this.count = 0;
		return mesh;
	}
}
// Raw triangles already in world space: flat arrays of positions, normals and colours.
Batch.prototype.addTris = function (P, N, C) {
	this.parts.push({ raw: true, P, N, C });
	this.count += P.length / 3;
};
// Shapes that already carry vertex colours (figures, animals): merged in with an optional tint.
Batch.prototype.addColored = function (geo, matrix, tint = 1) {
	this.parts.push({ geo, m: matrix.clone(), c: tint instanceof THREE.Color ? tint.clone() : typeof tint === "number" && tint <= 4 ? new THREE.Color(tint, tint, tint) : new THREE.Color(tint), vc: true });
	this.count += geo.attributes.position.count;
};

// ---------- shared shader patches ----------
// Uniforms every countryside material shares: the clock (for wind) and the camera (for LOD fades).
export const SHARED = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: 1 } };

// Chain an onBeforeCompile patch onto a material, keeping any earlier one.
export function patch(material, key, fn) {
	const prev = material.onBeforeCompile;
	const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : "";
	material.onBeforeCompile = (shader, r) => {
		if (prev) prev(shader, r);
		fn(shader, r);
	};
	material.customProgramCacheKey = () => prevKey + "|" + key;
	return material;
}

// Aerial perspective: distant country fades towards the sky colour and loses saturation, linearly with
// distance (exp), on top of the scene's exp-squared fog, which on its own leaves the middle distance crisp.
export const HAZE_FOG = `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		float aerial = ( 1.0 - exp( - fogDensity * 0.9 * vFogDepth ) ) * 0.66;
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		float aerial = fogFactor * 0.3;
	#endif
	float lumA = dot( gl_FragColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( lumA ), aerial * 0.4 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, max( fogFactor, aerial ) );
#endif`;
export function haze(material) {
	return patch(material, "haze", (s) => {
		s.fragmentShader = s.fragmentShader.replace("#include <fog_fragment>", HAZE_FOG);
	});
}
// Double-sided foliage keeps its outward-bent normals on both faces instead of flipping them.
export const NO_FLIP = THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "");
// Screen-door dither for LOD cross-fades.
export const DITHER = `
float stDither( vec2 p ) {
	return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}
`;

export const VCOL = haze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
