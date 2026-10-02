// Procedural textures for the countryside, drawn once on canvas: leaf clusters, bark, crops, house walls
// and roofs, shop signs, contact shadows and the ground detail. No image files.
import * as THREE from "three";
import { rand } from "./util.js";

const cache = {};
function canvas(w, h) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return [c, c.getContext("2d", { willReadFrequently: true })];
}
// Canvas to a mipmapped texture. Transparent pixels take the cell's average colour so alpha-tested
// edges do not pick up a dark fringe when filtered.
function toTexture(c, { cells = 1, srgb = true, wrap = false, bleed = false } = {}) {
	const g = c.getContext("2d", { willReadFrequently: true });
	const W = c.width, H = c.height;
	const img = g.getImageData(0, 0, W, H);
	const d = img.data;
	if (bleed) {
		const cw = W / cells, ch = H / cells;
		for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
			let r = 0, gg = 0, b = 0, n = 0;
			for (let y = cy * ch; y < (cy + 1) * ch; y += 2) for (let x = cx * cw; x < (cx + 1) * cw; x += 2) {
				const k = (y * W + x) * 4;
				if (d[k + 3] > 128) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++; }
			}
			if (!n) continue;
			r /= n; gg /= n; b /= n;
			for (let y = cy * ch; y < (cy + 1) * ch; y++) for (let x = cx * cw; x < (cx + 1) * cw; x++) {
				const k = (y * W + x) * 4;
				const a = d[k + 3] / 255;
				if (a < 1) {
					d[k] = d[k] * a + r * (1 - a);
					d[k + 1] = d[k + 1] * a + gg * (1 - a);
					d[k + 2] = d[k + 2] * a + b * (1 - a);
				}
			}
		}
	}
	const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), W, H, THREE.RGBAFormat);
	t.flipY = false;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.anisotropy = 4;
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.needsUpdate = true;
	return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// ---------- leaves ----------
// A 4 x 4 atlas of foliage clusters. Image rows run top to bottom, and the texture is not flipped,
// so cell (i, j) spans u in [i/4, (i+1)/4] and v in [j/4, (j+1)/4] with v = 0 at the top of the image.
export const LEAF = { mango: 0, neem: 1, peepal: 2, banyan: 3, euc: 4, acacia: 5, pine: 6, deodar: 7, frond: 8, fan: 9, grass: 10, shrub: 11, tallgrass: 12, weed: 13, frondDead: 14, flower: 15 };
export function leafCell(i) {
	return [(i % 4) / 4, Math.floor(i / 4) / 4, 0.25, 0.25];
}
function leafShape(g, len, wid, tip = 0) {
	g.beginPath();
	g.moveTo(0, 0);
	g.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.9, len * (1 + tip), 0);
	g.bezierCurveTo(len * 0.7, wid * 0.9, len * 0.25, wid, 0, 0);
}
function drawLeaf(g, x, y, ang, len, wid, l, opts = {}) {
	g.save();
	g.translate(x, y);
	g.rotate(ang);
	const grad = g.createLinearGradient(0, -wid, 0, wid);
	const h = opts.h ?? 95, s = opts.s ?? 35;
	grad.addColorStop(0, hsl(h, s, l + 8));
	grad.addColorStop(1, hsl(h, s, l - 8));
	g.fillStyle = grad;
	if (opts.heart) {
		g.beginPath();
		g.moveTo(0, 0);
		g.bezierCurveTo(len * 0.1, -wid * 1.3, len * 0.6, -wid * 1.1, len, 0);
		g.lineTo(len * 1.45, 0);
		g.lineTo(len, wid * 0.05);
		g.bezierCurveTo(len * 0.6, wid * 1.1, len * 0.1, wid * 1.3, 0, 0);
	} else leafShape(g, len, wid, opts.tip || 0);
	g.fill();
	g.strokeStyle = hsl(h, s - 10, l - 18, 0.5);
	g.lineWidth = Math.max(0.6, wid * 0.12);
	g.beginPath();
	g.moveTo(0, 0);
	g.lineTo(len * 0.95, 0);
	g.stroke();
	g.restore();
}
function twig(g, x0, y0, x1, y1, w, col = "rgba(70,55,40,0.9)") {
	g.strokeStyle = col;
	g.lineWidth = w;
	g.lineCap = "round";
	g.beginPath();
	g.moveTo(x0, y0);
	g.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * 0.15, (y0 + y1) / 2, x1, y1);
	g.stroke();
}
export function leafAtlas(low) {
	if (cache.leaf) return cache.leaf;
	const S = low ? 512 : 1024, C = S / 4;
	const [c, g] = canvas(S, S);
	const R = rand(101);
	const cell = (i, fn) => {
		g.save();
		g.translate((i % 4) * C, Math.floor(i / 4) * C);
		g.beginPath();
		g.rect(2, 2, C - 4, C - 4);
		g.clip();
		g.scale(C / 256, C / 256);
		fn();
		g.restore();
	};
	const inDisc = (k = 1) => {
		// a point in a soft disc, denser towards the middle
		const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 108 * k;
		return [128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.92];
	};
	// mango, jamun, sal: long lanceolate leaves in whorls at the twig ends
	cell(LEAF.mango, () => {
		for (let w = 0; w < 26; w++) {
			const [x, y] = inDisc(0.82);
			twig(g, 128 + (x - 128) * 0.3, 250, x, y, 2.2);
			const n = 7 + Math.floor(R() * 5), base = R() * 6;
			for (let k = 0; k < n; k++) drawLeaf(g, x, y, base + (k / n) * Math.PI * 2 + R() * 0.3, 34 + R() * 26, 7 + R() * 3, 52 + R() * 26, { h: 92 + R() * 12, s: 32 });
		}
	});
	// neem, tamarind: pinnate compound leaves with small leaflets
	cell(LEAF.neem, () => {
		for (let w = 0; w < 46; w++) {
			const [x, y] = inDisc(0.85);
			const ang = R() * Math.PI * 2, len = 44 + R() * 34;
			const l = 50 + R() * 28;
			g.save();
			g.translate(x, y);
			g.rotate(ang);
			g.strokeStyle = hsl(90, 25, l - 20, 0.8);
			g.lineWidth = 1.2;
			g.beginPath();
			g.moveTo(0, 0);
			g.quadraticCurveTo(len * 0.5, 4, len, 0);
			g.stroke();
			for (let t = 0.1; t < 1; t += 0.09) {
				for (const sg of [-1, 1]) drawLeaf(g, len * t, t * 3, sg * (0.9 + R() * 0.3) - 0.25, 11 + R() * 5 - t * 3, 2.6 + R(), l + (R() - 0.5) * 10, { h: 90 + R() * 15, s: 38 });
			}
			g.restore();
		}
	});
	// peepal: heart-shaped leaves with long drip tips on slender stalks
	cell(LEAF.peepal, () => {
		for (let w = 0; w < 64; w++) {
			const [x, y] = inDisc(0.88);
			drawLeaf(g, x, y, R() * Math.PI * 2, 22 + R() * 10, 13 + R() * 4, 50 + R() * 30, { heart: true, h: 85 + R() * 15, s: 40 });
		}
	});
	// banyan: thick oval leathery leaves
	cell(LEAF.banyan, () => {
		for (let w = 0; w < 80; w++) {
			const [x, y] = inDisc(0.86);
			drawLeaf(g, x, y, R() * Math.PI * 2, 24 + R() * 12, 11 + R() * 4, 40 + R() * 30, { h: 100 + R() * 12, s: 34 });
		}
	});
	// eucalyptus: narrow sickle leaves hanging from thin twigs
	cell(LEAF.euc, () => {
		for (let w = 0; w < 14; w++) {
			const x0 = 30 + R() * 196, y0 = 20 + R() * 120;
			const x1 = x0 + (R() - 0.5) * 80, y1 = y0 + 50 + R() * 70;
			twig(g, x0, y0, x1, y1, 1.5, "rgba(120,90,70,0.8)");
			for (let k = 0; k < 12; k++) {
				const t = R();
				drawLeaf(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.PI / 2 + (R() - 0.5) * 1.1, 34 + R() * 22, 4 + R() * 2, 52 + R() * 24, { h: 110 + R() * 30, s: 22, tip: 0.15 });
			}
		}
	});
	// acacia, babul: fine bipinnate foliage, a few yellow flower balls
	cell(LEAF.acacia, () => {
		for (let w = 0; w < 70; w++) {
			const [x, y] = inDisc(0.85);
			const ang = R() * Math.PI * 2, len = 22 + R() * 18, l = 42 + R() * 30;
			g.save();
			g.translate(x, y);
			g.rotate(ang);
			g.strokeStyle = hsl(85, 30, l, 0.95);
			for (let t = 0; t < 1; t += 0.12) {
				g.lineWidth = 1.6;
				g.beginPath();
				g.moveTo(len * t, 0);
				g.lineTo(len * t + 3, -7);
				g.moveTo(len * t, 0);
				g.lineTo(len * t + 3, 7);
				g.stroke();
			}
			g.restore();
		}
		for (let k = 0; k < 18; k++) {
			const [x, y] = inDisc(0.8);
			g.fillStyle = hsl(50, 90, 60);
			g.beginPath();
			g.arc(x, y, 2.5, 0, 7);
			g.fill();
		}
	});
	// chir pine: tufts of long needles
	cell(LEAF.pine, () => {
		for (let w = 0; w < 16; w++) {
			const [x, y] = inDisc(0.62);
			const n = 40 + Math.floor(R() * 20), base = -Math.PI / 2 + (R() - 0.5) * 0.8;
			for (let k = 0; k < n; k++) {
				const a = base + (R() - 0.5) * 3.4, len = 36 + R() * 34;
				g.strokeStyle = hsl(80 + R() * 15, 30, 42 + R() * 30, 0.95);
				g.lineWidth = 1.3;
				g.beginPath();
				g.moveTo(x, y);
				g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 4, x + Math.cos(a) * len, y + Math.sin(a) * len + 10);
				g.stroke();
			}
		}
	});
	// deodar: drooping sprays of short needles
	cell(LEAF.deodar, () => {
		for (let w = 0; w < 22; w++) {
			const x0 = 20 + R() * 216, y0 = 30 + R() * 150, len = 50 + R() * 50, dir = R() < 0.5 ? -1 : 1;
			const pts = [];
			for (let t = 0; t <= 1; t += 0.05) pts.push([x0 + dir * len * t, y0 + t * t * 40]);
			g.strokeStyle = "rgba(80,60,45,0.9)";
			g.lineWidth = 1.5;
			g.beginPath();
			pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
			g.stroke();
			for (const [x, y] of pts) for (let k = 0; k < 9; k++) {
				const a = R() * Math.PI * 2, l = 5 + R() * 6;
				g.strokeStyle = hsl(150 + R() * 20, 22, 36 + R() * 30, 0.95);
				g.lineWidth = 1.2;
				g.beginPath();
				g.moveTo(x, y);
				g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l + 3);
				g.stroke();
			}
		}
	});
	// a coconut frond along the cell: rachis at mid height, leaflets angled forward on both sides
	const frond = (dead) => () => {
		const l0 = dead ? 45 : 50;
		for (let t = 0.02; t < 1; t += 0.012) {
			const span = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 110 + 8;
			for (const sg of [-1, 1]) {
				const x = t * 252;
				const ex = x + span * 0.55, ey = 128 + sg * span;
				g.strokeStyle = dead ? hsl(35 + R() * 10, 35, l0 + R() * 18) : hsl(78 + R() * 12, 42, l0 + R() * 24);
				g.lineWidth = 3.2 * (1 - t * 0.5);
				g.beginPath();
				g.moveTo(x, 128);
				g.quadraticCurveTo(x + span * 0.2, 128 + sg * span * 0.6, ex, ey + (dead ? -sg * 10 : 0));
				g.stroke();
			}
		}
		g.strokeStyle = dead ? "rgb(150,120,80)" : "rgb(175,170,110)";
		g.lineWidth = 5;
		g.beginPath();
		g.moveTo(0, 128);
		g.lineTo(256, 128);
		g.stroke();
	};
	cell(LEAF.frond, frond(false));
	cell(LEAF.frondDead, frond(true));
	// palmyra: a pleated fan leaf
	cell(LEAF.fan, () => {
		const cx = 128, cy = 240;
		for (let k = 0; k < 44; k++) {
			const a = Math.PI * (1.08 + (k / 43) * 0.84), r = 200 + R() * 25;
			g.strokeStyle = hsl(82 + R() * 10, 35, 40 + (k % 2) * 16 + R() * 10);
			g.lineWidth = 9;
			g.beginPath();
			g.moveTo(cx, cy);
			g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
			g.stroke();
			// split tips
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
			g.lineTo(cx + Math.cos(a + 0.03) * (r + 18), cy + Math.sin(a + 0.03) * (r + 18));
			g.stroke();
		}
	});
	// grass clump: blades from the bottom middle
	const grass = (tall) => () => {
		for (let k = 0; k < (tall ? 70 : 110); k++) {
			const x0 = 128 + (R() - 0.5) * 120, h = (tall ? 160 : 110) + R() * 90;
			const lean = (R() - 0.5) * 140;
			g.strokeStyle = hsl(70 + R() * 30, 35, 35 + R() * 35);
			g.lineWidth = 2 + R() * 2.5;
			g.beginPath();
			g.moveTo(x0, 256);
			g.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.6, x0 + lean, 256 - h);
			g.stroke();
			if (tall && R() < 0.25) {
				g.fillStyle = hsl(40, 40, 70);
				g.beginPath();
				g.ellipse(x0 + lean, 256 - h, 3, 12, lean * 0.004, 0, 7);
				g.fill();
			}
		}
	};
	cell(LEAF.grass, grass(false));
	cell(LEAF.tallgrass, grass(true));
	// lantana shrub: small rough leaves with orange-pink flower heads
	cell(LEAF.shrub, () => {
		for (let w = 0; w < 140; w++) {
			const [x, y] = inDisc(0.88);
			drawLeaf(g, x, y, R() * Math.PI * 2, 14 + R() * 8, 7 + R() * 3, 40 + R() * 30, { h: 95, s: 32 });
		}
		for (let k = 0; k < 26; k++) {
			const [x, y] = inDisc(0.8);
			for (let j = 0; j < 7; j++) {
				g.fillStyle = j < 3 ? hsl(30, 90, 62) : hsl(330, 70, 72);
				g.beginPath();
				g.arc(x + (R() - 0.5) * 8, y + (R() - 0.5) * 8, 2.4, 0, 7);
				g.fill();
			}
		}
	});
	// weeds and herbs for the verges
	cell(LEAF.weed, () => {
		for (let k = 0; k < 40; k++) {
			const x0 = 128 + (R() - 0.5) * 160, top = 256 - 60 - R() * 140;
			twig(g, x0, 256, x0 + (R() - 0.5) * 30, top, 1.5, hsl(90, 30, 40));
			for (let j = 0; j < 4; j++) drawLeaf(g, x0 + (R() - 0.5) * 20, top + j * 25, R() * 6, 14 + R() * 8, 5, 45 + R() * 25);
		}
	});
	// marigold-like flowers for gardens and shrines
	cell(LEAF.flower, () => {
		for (let w = 0; w < 100; w++) {
			const [x, y] = inDisc(0.88);
			drawLeaf(g, x, y, R() * 6, 16, 6, 40 + R() * 20);
		}
		for (let k = 0; k < 40; k++) {
			const [x, y] = inDisc(0.8);
			g.fillStyle = R() < 0.6 ? hsl(35, 95, 55) : hsl(48, 95, 58);
			g.beginPath();
			g.arc(x, y, 6, 0, 7);
			g.fill();
		}
	});
	cache.leaf = toTexture(c, { cells: 4, bleed: true });
	return cache.leaf;
}

// ---------- bark ----------
// Four columns: furrowed bark, smooth mottled bark (eucalyptus, peepal), palm rings, pine plates.
export const BARK = { furrow: 0, smooth: 1, palm: 2, plates: 3 };
export function barkAtlas() {
	if (cache.bark) return cache.bark;
	const [c, g] = canvas(256, 256);
	const R = rand(7);
	const col = (i, fn) => {
		g.save();
		g.translate(i * 64, 0);
		g.beginPath();
		g.rect(0, 0, 64, 256);
		g.clip();
		fn();
		g.restore();
	};
	col(0, () => {
		g.fillStyle = "#b8b0a6";
		g.fillRect(0, 0, 64, 256);
		for (let k = 0; k < 60; k++) {
			const x = R() * 64;
			g.strokeStyle = `rgba(40,30,25,${0.3 + R() * 0.4})`;
			g.lineWidth = 1 + R() * 2.5;
			g.beginPath();
			g.moveTo(x, -10);
			let y = -10, xx = x;
			while (y < 266) {
				y += 8 + R() * 14;
				xx += (R() - 0.5) * 5;
				g.lineTo(xx, y);
			}
			g.stroke();
		}
		for (let k = 0; k < 300; k++) {
			g.fillStyle = `rgba(255,255,255,${R() * 0.12})`;
			g.fillRect(R() * 64, R() * 256, 2, 3);
		}
	});
	col(1, () => {
		g.fillStyle = "#e4e0d8";
		g.fillRect(0, 0, 64, 256);
		for (let k = 0; k < 40; k++) {
			g.fillStyle = R() < 0.5 ? `rgba(160,150,130,${0.3 + R() * 0.3})` : `rgba(200,190,175,${0.4})`;
			g.beginPath();
			g.ellipse(R() * 64, R() * 256, 4 + R() * 10, 8 + R() * 22, 0, 0, 7);
			g.fill();
		}
	});
	col(2, () => {
		g.fillStyle = "#a9a39a";
		g.fillRect(0, 0, 64, 256);
		for (let y = 0; y < 256; y += 8) {
			g.fillStyle = `rgba(50,45,40,${0.35 + R() * 0.25})`;
			g.fillRect(0, y + R() * 2, 64, 2 + R() * 1.5);
			g.fillStyle = "rgba(255,255,255,0.08)";
			g.fillRect(0, y + 4, 64, 2);
		}
	});
	col(3, () => {
		g.fillStyle = "#a8826a";
		g.fillRect(0, 0, 64, 256);
		for (let k = 0; k < 90; k++) {
			const x = R() * 64, y = R() * 256;
			g.fillStyle = `rgba(${150 + R() * 60},${90 + R() * 40},${60 + R() * 30},0.8)`;
			g.fillRect(x, y, 8 + R() * 10, 12 + R() * 16);
			g.strokeStyle = "rgba(40,25,20,0.6)";
			g.strokeRect(x, y, 8 + R() * 10, 12 + R() * 16);
		}
	});
	cache.bark = toTexture(c, { wrap: true });
	cache.bark.wrapS = THREE.ClampToEdgeWrapping;
	return cache.bark;
}

// ---------- crops ----------
// Four bands that repeat along a row: sugarcane, jowar (sorghum), cotton bushes and banana.
export const CROP = { cane: 0, jowar: 1, cotton: 2, banana: 3 };
export function cropAtlas(low) {
	if (cache.crop) return cache.crop;
	const W = low ? 256 : 512, S = W / 512;
	const [c, g] = canvas(W, W);
	const R = rand(33);
	const band = (i, fn) => {
		g.save();
		g.translate(0, i * (W / 4));
		g.beginPath();
		g.rect(0, 3 * S, W, W / 4 - 6 * S);
		g.clip();
		g.scale(S, S);
		fn();
		// repeat the left edge on the right so it tiles
		g.restore();
	};
	const H = 128;
	band(CROP.cane, () => {
		for (let k = 0; k < 70; k++) {
			const x = R() * 512, top = 4 + R() * 30;
			g.strokeStyle = hsl(70 + R() * 20, 30, 45 + R() * 15);
			g.lineWidth = 3;
			g.beginPath();
			g.moveTo(x, H);
			g.lineTo(x + (R() - 0.5) * 6, top + 40);
			g.stroke();
			for (let j = 0; j < 5; j++) {
				const y = top + 30 + R() * 60, sg = R() < 0.5 ? -1 : 1, len = 30 + R() * 30;
				g.strokeStyle = hsl(85 + R() * 20, 40, 35 + R() * 30);
				g.lineWidth = 3;
				g.beginPath();
				g.moveTo(x, y);
				g.quadraticCurveTo(x + sg * len * 0.6, y - 25, x + sg * len, y - 5 + R() * 20);
				g.stroke();
			}
		}
	});
	band(CROP.jowar, () => {
		for (let k = 0; k < 60; k++) {
			const x = R() * 512, top = 10 + R() * 20;
			g.strokeStyle = hsl(75, 30, 45);
			g.lineWidth = 2.5;
			g.beginPath();
			g.moveTo(x, H);
			g.lineTo(x, top + 10);
			g.stroke();
			for (let j = 0; j < 4; j++) {
				const y = top + 30 + j * 20, sg = j % 2 ? -1 : 1;
				g.fillStyle = hsl(80 + R() * 25, 38, 38 + R() * 25);
				g.beginPath();
				g.moveTo(x, y);
				g.quadraticCurveTo(x + sg * 22, y - 18, x + sg * 34, y + 6);
				g.quadraticCurveTo(x + sg * 18, y - 4, x, y + 4);
				g.fill();
			}
			g.fillStyle = hsl(30 + R() * 10, 45, 40 + R() * 15);
			g.beginPath();
			g.ellipse(x, top + 6, 5, 11, 0, 0, 7);
			g.fill();
		}
	});
	band(CROP.cotton, () => {
		for (let k = 0; k < 55; k++) {
			const x = R() * 512, y = 40 + R() * 70, r = 22 + R() * 14;
			for (let j = 0; j < 14; j++) drawLeaf(g, x + (R() - 0.5) * r, y + (R() - 0.5) * r, R() * 6, 12 + R() * 6, 7, 30 + R() * 25, { h: 95, s: 30 });
			for (let j = 0; j < 4; j++) {
				g.fillStyle = "rgb(250,250,245)";
				g.beginPath();
				g.arc(x + (R() - 0.5) * r, y + (R() - 0.5) * r * 0.8, 3.5, 0, 7);
				g.fill();
			}
		}
		g.fillStyle = "rgba(0,0,0,0)";
	});
	band(CROP.banana, () => {
		for (let k = 0; k < 14; k++) {
			const x = 18 + k * 36 + (R() - 0.5) * 8;
			g.fillStyle = hsl(80, 25, 50);
			g.fillRect(x - 3, 60, 6, 68);
			for (let j = 0; j < 6; j++) {
				const a = -Math.PI / 2 + (j - 2.5) * 0.45 + (R() - 0.5) * 0.2, len = 40 + R() * 20;
				g.save();
				g.translate(x, 62);
				g.rotate(a);
				g.fillStyle = hsl(90 + R() * 15, 40, 38 + R() * 20);
				g.beginPath();
				g.ellipse(len / 2, 0, len / 2, 9, 0, 0, 7);
				g.fill();
				g.restore();
			}
		}
	});
	cache.crop = toTexture(c, { cells: 4, bleed: true });
	cache.crop.wrapS = THREE.RepeatWrapping;
	return cache.crop;
}

// ---------- houses ----------
// A 4 x 4 atlas of 3 m x 3 m facade and roof tiles. Alpha 255 marks paint (tinted by the house colour);
// alpha 254 marks unpainted detail (doors, window frames, grilles), which keeps its own colour.
export const WALL = { window: 0, door: 1, plain: 2, shop: 3, brickWin: 4, brick: 5, stoneWin: 6, stone: 7, tile: 8, tin: 9, slate: 10, concrete: 11, thatch: 12, wood: 13, gate: 14, wallBase: 15 };
export function wallCell(i) {
	return [(i % 4) / 4, Math.floor(i / 4) / 4, 0.25, 0.25];
}
export function houseAtlas(low) {
	if (cache.house) return cache.house;
	const S = low ? 512 : 1024, C = S / 4;
	const [c, g] = canvas(S, S);
	const [mc, mg] = canvas(S, S); // paint mask: white = painted
	const R = rand(55);
	const cell = (i, fn) => {
		for (const [ctx, isMask] of [[g, false], [mg, true]]) {
			ctx.save();
			ctx.translate((i % 4) * C, Math.floor(i / 4) * C);
			ctx.beginPath();
			ctx.rect(0, 0, C, C);
			ctx.clip();
			ctx.scale(C / 256, C / 256);
			if (isMask) {
				ctx.fillStyle = "#000";
				ctx.fillRect(0, 0, 256, 256);
			}
			fn(ctx, isMask);
			ctx.restore();
		}
	};
	const RS = () => rand(Math.floor(R() * 1e6)); // per-cell seed so colour and mask passes match
	const plaster = (ctx, m, rr, dirt = 1) => {
		if (m) {
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, 256, 256);
			return;
		}
		ctx.fillStyle = "#efece6";
		ctx.fillRect(0, 0, 256, 256);
		for (let k = 0; k < 500; k++) {
			ctx.fillStyle = rr() < 0.5 ? `rgba(120,110,95,${rr() * 0.07})` : `rgba(255,255,255,${rr() * 0.1})`;
			ctx.beginPath();
			ctx.arc(rr() * 256, rr() * 256, 2 + rr() * 9, 0, 7);
			ctx.fill();
		}
		// rain splash and grime at the foot of the wall, streaks from the top
		const gr = ctx.createLinearGradient(0, 200, 0, 256);
		gr.addColorStop(0, "rgba(90,70,50,0)");
		gr.addColorStop(1, `rgba(90,70,50,${0.45 * dirt})`);
		ctx.fillStyle = gr;
		ctx.fillRect(0, 190, 256, 66);
		for (let k = 0; k < 10 * dirt; k++) {
			const x = rr() * 256, w = 3 + rr() * 10, l = 20 + rr() * 80;
			const sg = ctx.createLinearGradient(0, 0, 0, l);
			sg.addColorStop(0, `rgba(70,65,55,${0.12 + rr() * 0.12})`);
			sg.addColorStop(1, "rgba(70,65,55,0)");
			ctx.fillStyle = sg;
			ctx.fillRect(x, 0, w, l);
		}
	};
	// draw an opening: m = mask pass (opening is unpainted)
	const unpaint = (ctx, m, x, y, w, h) => {
		if (m) {
			ctx.fillStyle = "#000";
			ctx.fillRect(x, y, w, h);
			return true;
		}
		return false;
	};
	const windowAt = (ctx, m, x, y, w, h, frame, rr, opts = {}) => {
		// the chajja (concrete sunshade) above, with its shadow
		if (!opts.noShade) {
			if (!m) {
				ctx.fillStyle = "rgba(0,0,0,0.25)";
				ctx.fillRect(x - 14, y - 8, w + 28, 14);
				ctx.fillStyle = "#c9c4ba";
				ctx.fillRect(x - 16, y - 16, w + 32, 9);
			}
		}
		if (unpaint(ctx, m, x - 5, y - 5, w + 10, h + 10)) return;
		ctx.fillStyle = frame;
		ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
		ctx.fillStyle = "#1d1f22";
		ctx.fillRect(x, y, w, h);
		// half-open wooden shutters or glass
		ctx.fillStyle = opts.glass ? "#3a4a55" : "#2a2622";
		ctx.fillRect(x, y, w / 2 - 1, h);
		ctx.fillStyle = "rgba(255,255,255,0.08)";
		ctx.fillRect(x + 2, y + 2, w / 2 - 6, h * 0.4);
		// grille
		ctx.strokeStyle = opts.grille || "#4a5560";
		ctx.lineWidth = 2;
		for (let gx = x + 6; gx < x + w; gx += 9) {
			ctx.beginPath();
			ctx.moveTo(gx, y);
			ctx.lineTo(gx, y + h);
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.moveTo(x, y + h / 2);
		ctx.lineTo(x + w, y + h / 2);
		ctx.stroke();
		// sill and a streak below it
		ctx.fillStyle = "#bdb6aa";
		ctx.fillRect(x - 6, y + h + 3, w + 12, 5);
	};
	const doorAt = (ctx, m, x, y, w, h, col, rr) => {
		if (unpaint(ctx, m, x - 7, y - 7, w + 14, h + 9)) return;
		ctx.fillStyle = "#cfc8bb";
		ctx.fillRect(x - 7, y - 7, w + 14, h + 9);
		ctx.fillStyle = col;
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = "rgba(0,0,0,0.35)";
		ctx.lineWidth = 2;
		ctx.strokeRect(x + 5, y + 6, w / 2 - 8, h / 2 - 10);
		ctx.strokeRect(x + w / 2 + 3, y + 6, w / 2 - 8, h / 2 - 10);
		ctx.strokeRect(x + 5, y + h / 2 + 2, w / 2 - 8, h / 2 - 10);
		ctx.strokeRect(x + w / 2 + 3, y + h / 2 + 2, w / 2 - 8, h / 2 - 10);
		ctx.fillStyle = "rgba(0,0,0,0.5)";
		ctx.fillRect(x + w / 2 - 1, y, 2, h);
		// toran: a string of mango leaves and marigolds over the door
		for (let k = 0; k < 9; k++) {
			ctx.fillStyle = k % 2 ? "#3d7a2a" : "#f39a1e";
			ctx.beginPath();
			ctx.arc(x - 2 + k * ((w + 4) / 8), y - 2 + Math.sin((k / 8) * Math.PI) * 6, 3.5, 0, 7);
			ctx.fill();
		}
	};
	const bricks = (ctx, m, rr, base = [150, 70, 45]) => {
		if (m) {
			// brick is tinted by a near-white colour, so it counts as paint
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, 256, 256);
			return;
		}
		ctx.fillStyle = "#b8a898";
		ctx.fillRect(0, 0, 256, 256);
		for (let y = 0, row = 0; y < 256; y += 7, row++) {
			for (let x = (row % 2) * -10; x < 256; x += 20) {
				const v = 0.8 + rr() * 0.35;
				ctx.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`;
				ctx.fillRect(x + 1, y + 1, 18, 5.4);
			}
		}
	};
	const stones = (ctx, m, rr) => {
		if (m) {
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, 256, 256);
			return;
		}
		ctx.fillStyle = "#6c655c";
		ctx.fillRect(0, 0, 256, 256);
		for (let y = 0; y < 256; y += 16 + rr() * 6) {
			for (let x = -rr() * 30; x < 256; x += 20 + rr() * 26) {
				const v = 110 + rr() * 60;
				ctx.fillStyle = `rgb(${v | 0},${(v * 0.96) | 0},${(v * 0.9) | 0})`;
				ctx.beginPath();
				ctx.ellipse(x + 12, y + 8, 12 + rr() * 6, 7 + rr() * 2, (rr() - 0.5) * 0.2, 0, 7);
				ctx.fill();
			}
		}
	};
	{
		const rr = RS();
		cell(WALL.window, (ctx, m) => {
			const r2 = rand(11);
			plaster(ctx, m, r2);
			windowAt(ctx, m, 78, 70, 100, 96, "#2f7a6a", r2);
		});
		cell(WALL.door, (ctx, m) => {
			const r2 = rand(12);
			plaster(ctx, m, r2);
			doorAt(ctx, m, 84, 70, 88, 186, "#5b3a22", r2);
			// a kolam / rangoli at the doorstep is drawn on the ground, not here
		});
		cell(WALL.plain, (ctx, m) => {
			const r2 = rand(13);
			plaster(ctx, m, r2, 1.4);
			if (!m) {
				// an electricity meter box and a bit of fallen plaster showing brick
				ctx.fillStyle = "#d8d4c8";
				ctx.fillRect(30, 90, 26, 34);
				ctx.strokeStyle = "#555";
				ctx.strokeRect(30, 90, 26, 34);
				ctx.strokeStyle = "#222";
				ctx.beginPath();
				ctx.moveTo(43, 90);
				ctx.lineTo(43, 0);
				ctx.stroke();
				ctx.fillStyle = "rgba(150,80,55,0.6)";
				ctx.beginPath();
				ctx.ellipse(190, 210, 22, 12, 0.2, 0, 7);
				ctx.fill();
			}
		});
		cell(WALL.shop, (ctx, m) => {
			const r2 = rand(14);
			plaster(ctx, m, r2);
			if (unpaint(ctx, m, 8, 60, 240, 196)) return;
			ctx.fillStyle = "#151515";
			ctx.fillRect(8, 60, 240, 196);
			// shelves of colourful packets
			for (let y = 100; y < 230; y += 26) {
				ctx.fillStyle = "#4a3a2a";
				ctx.fillRect(14, y + 18, 228, 4);
				for (let x = 16; x < 238; x += 8) {
					ctx.fillStyle = hsl(r2() * 360, 70, 45 + r2() * 20);
					ctx.fillRect(x, y + 4 + r2() * 4, 6, 14);
				}
			}
			// the rolling shutter, pulled half way up
			ctx.fillStyle = "#8e9396";
			ctx.fillRect(8, 60, 240, 40);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			for (let y = 62; y < 100; y += 5) ctx.fillRect(8, y, 240, 1.5);
			// a counter in front
			ctx.fillStyle = "#7a6a58";
			ctx.fillRect(8, 210, 240, 46);
		});
		cell(WALL.brickWin, (ctx, m) => {
			const r2 = rand(15);
			bricks(ctx, m, r2);
			if (!m) {
				ctx.fillStyle = "#1a1714";
				ctx.fillRect(80, 70, 96, 96);
				ctx.fillStyle = "#8a8a84";
				ctx.fillRect(74, 60, 108, 10); // concrete lintel
			}
		});
		cell(WALL.brick, (ctx, m) => bricks(ctx, m, rand(16)));
		cell(WALL.stoneWin, (ctx, m) => {
			const r2 = rand(17);
			stones(ctx, m, r2);
			if (unpaint(ctx, m, 84, 64, 88, 104)) return;
			ctx.fillStyle = "#5a3a20";
			ctx.fillRect(84, 64, 88, 104);
			ctx.fillStyle = "#1a1410";
			ctx.fillRect(94, 74, 68, 84);
			ctx.strokeStyle = "#7a5230";
			ctx.lineWidth = 4;
			ctx.strokeRect(94, 74, 68, 84);
			ctx.beginPath();
			ctx.moveTo(128, 74);
			ctx.lineTo(128, 158);
			ctx.stroke();
		});
		cell(WALL.stone, (ctx, m) => stones(ctx, m, rand(18)));
		cell(WALL.tile, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(19);
			ctx.fillStyle = "#5a2a1a";
			ctx.fillRect(0, 0, 256, 256);
			for (let y = 0; y < 256; y += 21) {
				for (let x = (y / 21) % 2 ? -16 : 0; x < 256; x += 32) {
					const v = 0.8 + r2() * 0.3;
					const gr = ctx.createLinearGradient(x, 0, x + 32, 0);
					gr.addColorStop(0, `rgb(${150 * v | 0},${62 * v | 0},${38 * v | 0})`);
					gr.addColorStop(0.5, `rgb(${200 * v | 0},${92 * v | 0},${58 * v | 0})`);
					gr.addColorStop(1, `rgb(${140 * v | 0},${58 * v | 0},${36 * v | 0})`);
					ctx.fillStyle = gr;
					ctx.fillRect(x + 1, y, 30, 19);
					ctx.fillStyle = "rgba(0,0,0,0.35)";
					ctx.fillRect(x + 1, y + 16, 30, 3);
				}
			}
			for (let k = 0; k < 30; k++) {
				ctx.fillStyle = `rgba(40,40,30,${r2() * 0.25})`;
				ctx.fillRect(r2() * 256, r2() * 256, 6 + r2() * 30, 4 + r2() * 20);
			}
		});
		cell(WALL.tin, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(20);
			for (let x = 0; x < 256; x += 8) {
				const gr = ctx.createLinearGradient(x, 0, x + 8, 0);
				gr.addColorStop(0, "#7d858a");
				gr.addColorStop(0.5, "#b9c0c4");
				gr.addColorStop(1, "#6f777c");
				ctx.fillStyle = gr;
				ctx.fillRect(x, 0, 8, 256);
			}
			for (let k = 0; k < 26; k++) {
				ctx.fillStyle = `rgba(${130 + r2() * 40},${60 + r2() * 20},30,${0.25 + r2() * 0.35})`;
				ctx.beginPath();
				ctx.ellipse(r2() * 256, r2() * 256, 6 + r2() * 26, 4 + r2() * 14, 0, 0, 7);
				ctx.fill();
			}
			ctx.fillStyle = "rgba(0,0,0,0.3)";
			ctx.fillRect(0, 126, 256, 3);
		});
		cell(WALL.slate, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(21);
			ctx.fillStyle = "#3a3a38";
			ctx.fillRect(0, 0, 256, 256);
			for (let y = 0; y < 256; y += 26) for (let x = -r2() * 20; x < 256; x += 30 + r2() * 20) {
				const v = 90 + r2() * 50;
				ctx.fillStyle = `rgb(${v | 0},${v | 0},${(v * 1.02) | 0})`;
				ctx.fillRect(x + 1, y + 1, 28 + r2() * 14, 24);
			}
		});
		cell(WALL.concrete, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(22);
			ctx.fillStyle = "#b0aca4";
			ctx.fillRect(0, 0, 256, 256);
			for (let k = 0; k < 400; k++) {
				ctx.fillStyle = r2() < 0.6 ? `rgba(60,55,50,${r2() * 0.12})` : `rgba(255,255,255,${r2() * 0.1})`;
				ctx.beginPath();
				ctx.arc(r2() * 256, r2() * 256, 2 + r2() * 12, 0, 7);
				ctx.fill();
			}
			ctx.strokeStyle = "rgba(40,40,40,0.35)";
			for (let k = 0; k < 5; k++) {
				ctx.beginPath();
				let x = r2() * 256, y = r2() * 256;
				ctx.moveTo(x, y);
				for (let j = 0; j < 6; j++) ctx.lineTo((x += (r2() - 0.5) * 40), (y += (r2() - 0.5) * 40));
				ctx.stroke();
			}
		});
		cell(WALL.thatch, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(23);
			ctx.fillStyle = "#6a5434";
			ctx.fillRect(0, 0, 256, 256);
			for (let k = 0; k < 1400; k++) {
				const x = r2() * 256, y = r2() * 256;
				ctx.strokeStyle = `rgba(${170 + r2() * 50},${140 + r2() * 40},${80 + r2() * 30},0.7)`;
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x + (r2() - 0.5) * 4, y + 20 + r2() * 20);
				ctx.stroke();
			}
		});
		cell(WALL.wood, (ctx, m) => {
			if (m) {
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			const r2 = rand(24);
			for (let x = 0; x < 256; x += 21) {
				const v = 0.8 + r2() * 0.3;
				ctx.fillStyle = `rgb(${120 * v | 0},${82 * v | 0},${52 * v | 0})`;
				ctx.fillRect(x, 0, 20, 256);
				ctx.fillStyle = "rgba(0,0,0,0.35)";
				ctx.fillRect(x + 20, 0, 1.5, 256);
			}
		});
		cell(WALL.gate, (ctx, m) => {
			// an iron gate in a compound wall: bars over open ground
			if (m) {
				ctx.fillStyle = "#000";
				ctx.fillRect(0, 0, 256, 256);
				return;
			}
			ctx.fillStyle = "#2a3a48";
			ctx.fillRect(0, 0, 256, 256);
			ctx.fillStyle = "#3f6d8a";
			for (let x = 4; x < 256; x += 14) ctx.fillRect(x, 0, 5, 256);
			ctx.fillRect(0, 20, 256, 8);
			ctx.fillRect(0, 200, 256, 8);
		});
		cell(WALL.wallBase, (ctx, m) => {
			const r2 = rand(25);
			plaster(ctx, m, r2, 1.6);
			if (!m) {
				// a painted dado band along the bottom
				ctx.fillStyle = "rgba(120,60,40,0.55)";
				ctx.fillRect(0, 210, 256, 46);
			}
		});
		void rr;
	}
	// merge colour and mask: alpha 255 = paint, 254 = keep
	const img = g.getImageData(0, 0, S, S), mk = mg.getImageData(0, 0, S, S).data;
	const d = img.data;
	for (let k = 0; k < d.length; k += 4) d[k + 3] = mk[k] > 127 ? 255 : 0;
	const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), S, S, THREE.RGBAFormat);
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.anisotropy = 4;
	t.colorSpace = THREE.SRGBColorSpace;
	t.needsUpdate = true;
	cache.house = t;
	return t;
}

// ---------- shop signs ----------
// Painted boards in the local script: five per language (Marathi, Telugu, Hindi, English), 256 x 64 each,
// two columns by ten rows. Sign k is at column k % 2, row k >> 1.
export const LANGS = ["mr", "te", "hi", "en"];
const SIGNS = {
	mr: ["किराणा दुकान", "श्री गणेश हॉटेल", "जय भवानी टायर्स", "साई मेडिकल", "बस थांबा"],
	te: ["శ్రీ లక్ష్మి కిరాణా", "హోటల్ శ్రీ సాయి", "టైర్ పంక్చర్", "మెడికల్ షాప్", "బస్ స్టాప్"],
	hi: ["शर्मा जनरल स्टोर", "चाय नाश्ता", "पंजाबी ढाबा", "मोबाइल रिचार्ज", "बस स्टॉप"],
	en: ["TEA STALL", "TYRE PUNCTURE", "MOBILE RECHARGE", "XEROX & STD", "BUS STOP"],
};
const FONTS = {
	mr: "'Noto Sans Devanagari','Kohinoor Devanagari','Devanagari Sangam MN','Mangal',sans-serif",
	hi: "'Noto Sans Devanagari','Kohinoor Devanagari','Devanagari Sangam MN','Mangal',sans-serif",
	te: "'Noto Sans Telugu','Kohinoor Telugu','Telugu Sangam MN','Gautami',sans-serif",
	en: "'Arial Black','Helvetica Neue',Arial,sans-serif",
};
export function signCell(lang, i) {
	const k = LANGS.indexOf(lang) * 5 + i;
	return [(k % 2) / 2, (k >> 1) / 10, 0.5, 0.1];
}
export function signAtlas() {
	if (cache.sign) return cache.sign;
	const [c, g] = canvas(512, 640);
	const R = rand(77);
	const pal = [["#f2c418", "#b3121b"], ["#c8201e", "#fff6d8"], ["#1c4f9c", "#ffffff"], ["#1f7a3a", "#fff3a0"], ["#ffffff", "#1c3f8f"]];
	LANGS.forEach((lang, li) => {
		SIGNS[lang].forEach((text, i) => {
			const k = li * 5 + i, x = (k % 2) * 256, y = (k >> 1) * 64;
			const [bg, fg] = i === 4 ? ["#1f6a3a", "#ffffff"] : pal[Math.floor(R() * pal.length)];
			g.fillStyle = bg;
			g.fillRect(x + 2, y + 2, 252, 60);
			g.strokeStyle = fg;
			g.lineWidth = 2;
			g.strokeRect(x + 6, y + 6, 244, 52);
			g.fillStyle = fg;
			g.textAlign = "center";
			g.textBaseline = "middle";
			let size = lang === "en" ? 30 : 32;
			g.font = `bold ${size}px ${FONTS[lang]}`;
			while (g.measureText(text).width > 228 && size > 12) g.font = `bold ${--size}px ${FONTS[lang]}`;
			g.fillText(text, x + 128, y + 34);
			// sun-faded and dusty
			g.fillStyle = "rgba(255,240,220,0.12)";
			g.fillRect(x + 2, y + 2, 252, 30);
			for (let j = 0; j < 30; j++) {
				g.fillStyle = `rgba(80,60,40,${R() * 0.12})`;
				g.fillRect(x + R() * 250, y + R() * 60, 2 + R() * 8, 2 + R() * 4);
			}
		});
	});
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	t.flipY = false;
	cache.sign = t;
	return t;
}

// ---------- contact shadow ----------
export function blobTexture() {
	if (cache.blob) return cache.blob;
	const N = 64, d = new Uint8Array(N * N * 4);
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
		const a = Math.max(0, 1 - r);
		const k = (y * N + x) * 4;
		d[k] = d[k + 1] = d[k + 2] = 0;
		d[k + 3] = Math.round(255 * Math.pow(a, 1.6));
	}
	const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.needsUpdate = true;
	cache.blob = t;
	return t;
}

// ---------- ground detail ----------
// A seamless 256 x 256 data texture: R = fine grain and pebbles, G = grass-blade streaks, B = cracks
// (dried black soil), A = larger mottling.
export function groundDetail() {
	if (cache.ground) return cache.ground;
	const N = 256, d = new Uint8Array(N * N * 4);
	const R = rand(9);
	const hash = (x, y, p) => {
		x = ((x % p) + p) % p;
		y = ((y % p) + p) % p;
		let h = (x * 374761393 + y * 668265263 + p * 982451653) | 0;
		h = (h ^ (h >> 13)) * 1274126177;
		return ((h ^ (h >> 16)) >>> 0) / 4294967296;
	};
	const vnoise = (x, y, p) => {
		const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
		const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
		const a = hash(ix, iy, p), b = hash(ix + 1, iy, p), c = hash(ix, iy + 1, p), e = hash(ix + 1, iy + 1, p);
		return (a + (b - a) * ux) * (1 - uy) + (c + (e - c) * ux) * uy;
	};
	// Voronoi cells for soil cracks
	const P = 12, pts = [];
	for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) pts.push([(i + R()) / P, (j + R()) / P]);
	for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
		const u = x / N, v = y / N;
		let f = 0, a = 0.5, s = 0;
		for (let o = 0, p = 16; o < 4; o++, p *= 2) {
			f += a * vnoise(u * p, v * p, p);
			s += a;
			a *= 0.5;
		}
		f /= s;
		const peb = vnoise(u * 64, v * 64, 64);
		const grain = Math.min(1, f * 0.8 + (peb > 0.78 ? 0.35 : 0) + R() * 0.12);
		// streaks
		const st = vnoise(u * 128, v * 12, 128) * 0.6 + vnoise(u * 64, v * 6, 64) * 0.4;
		// cracks: distance to the second-nearest cell edge
		let d1 = 9, d2 = 9;
		for (const [px, py] of pts) {
			let dx = Math.abs(u - px), dy = Math.abs(v - py);
			dx = Math.min(dx, 1 - dx);
			dy = Math.min(dy, 1 - dy);
			const dd = dx * dx + dy * dy;
			if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
		}
		const edge = Math.sqrt(d2) - Math.sqrt(d1);
		const crack = edge < 0.006 ? 0 : 1;
		const mott = vnoise(u * 8, v * 8, 8);
		const k = (y * N + x) * 4;
		d[k] = grain * 255;
		d[k + 1] = st * 255;
		d[k + 2] = crack * 255;
		d[k + 3] = mott * 255;
	}
	const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.anisotropy = 8;
	t.needsUpdate = true;
	cache.ground = t;
	return t;
}
