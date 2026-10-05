// The stops of the Kailash journey, built like the shrines in landmarks.js: in each stop's own frame, facing local
// +z (the traveller stands in front, at about z = 3.3, looking towards -z and the mountain beyond), with an altar
// of stones whose front is at about z = 1.9 for the aarti. Each returns { g, peaks, crowd, world? }.
import * as THREE from "three";

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0 }, o));
function altar() {
	const g = new THREE.Group();
	const stone = std(0x7a7068);
	const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.6), stone);
	m.position.set(0, 0.17, 1.55);
	m.castShadow = m.receiveShadow = true;
	g.add(m);
	return { g, peaks: [], crowd: [[-1.2, 2.3, 0.05], [1.3, 2.2, 0.05]] };
}
export const K_BUILDERS = { omparvat: altar, mansarovar: altar, yamdwar: altar, dirapuk: altar, dolmala: altar, darchen: altar };
