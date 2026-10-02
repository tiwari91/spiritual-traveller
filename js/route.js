// The pilgrim route: waypoints resampled over the terrain, with chapters that end at each shrine.
import { ROUTE, SHRINES, toWorld } from "./geo.js";
import { clamp, lerp } from "./util.js";

// Leg durations in seconds of Yatra at Easy pace; the pilgrim's speed is set so each leg takes about this long.
const LEG_SECONDS = [28, 70, 110, 34];

export class Route {
	constructor(world) {
		this.world = world;
		const pts = [];
		const chapters = [];
		let s = 0;
		this.legSpeed = [];
		for (let c = 0; c < ROUTE.length; c++) {
			const leg = ROUTE[c];
			const start = s;
			const raw = [];
			for (let i = 0; i < leg.pts.length - 1; i++) {
				const a = toWorld(leg.pts[i][0], leg.pts[i][1]), b = toWorld(leg.pts[i + 1][0], leg.pts[i + 1][1]);
				const len = Math.hypot(b.x - a.x, b.z - a.z);
				const n = Math.max(1, Math.ceil(len / 0.9));
				for (let k = 0; k < n; k++) {
					const t = k / n;
					raw.push([lerp(a.x, b.x, t), lerp(a.z, b.z, t)]);
				}
			}
			const last = toWorld(leg.pts[leg.pts.length - 1][0], leg.pts[leg.pts.length - 1][1]);
			raw.push([last.x, last.z]);
			// smooth the corners
			const sm = raw.map((p, i) => {
				if (i === 0 || i === raw.length - 1) return p;
				const a = raw[i - 1], b = raw[i + 1];
				return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
			});
			for (let k = 0; k < sm.length; k++) {
				if (c > 0 && k === 0) continue; // shared point with previous leg
				const [x, z] = sm[k];
				const y = world.height(x, z);
				if (pts.length) {
					const q = pts[pts.length - 1];
					s += Math.hypot(x - q.x, z - q.z);
				}
				pts.push({ x, y, z, s, leg: c });
			}
			chapters.push({ index: c, title: leg.title, kicker: leg.kicker, mode: leg.mode, s0: start, s1: s, shrine: SHRINES[c] });
			this.legSpeed.push((s - start) / LEG_SECONDS[c]);
		}
		this.pts = pts;
		this.length = s;
		this.chapters = chapters;
		// Darshan stops: at the end of each leg.
		this.stops = chapters.map((c) => c.s1);
	}
	indexAt(s) {
		// binary search on cumulative distance
		let lo = 0, hi = this.pts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.pts[mid].s < s) lo = mid + 1;
			else hi = mid;
		}
		return Math.max(0, lo - 1);
	}
	at(s, out) {
		s = clamp(s, 0, this.length);
		const i = this.indexAt(s);
		const a = this.pts[i], b = this.pts[Math.min(i + 1, this.pts.length - 1)];
		const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
		out = out || {};
		out.x = lerp(a.x, b.x, t);
		out.z = lerp(a.z, b.z, t);
		out.y = this.world.height(out.x, out.z);
		// tangent (look-ahead for smoothness)
		const c = this.pts[Math.min(i + 3, this.pts.length - 1)], p = this.pts[Math.max(i - 2, 0)];
		let dx = c.x - p.x, dz = c.z - p.z;
		const l = Math.hypot(dx, dz) || 1;
		out.dx = dx / l;
		out.dz = dz / l;
		out.leg = a.leg;
		out.i = i;
		return out;
	}
	chapterAt(s) {
		for (const c of this.chapters) if (s <= c.s1 + 0.001) return c;
		return this.chapters[this.chapters.length - 1];
	}
	speedAt(s) {
		return this.legSpeed[this.chapterAt(s).index];
	}
	// Approximate kilometres along the drawn line (1 unit = 1/40 degree, about 2.6 km east-west at these latitudes).
	km(s) {
		return s * 2.6;
	}
	// Nearest point on the route to world x,z, as a distance along it.
	nearest(x, z) {
		let best = Infinity, bs = 0;
		for (const p of this.pts) {
			const d = (p.x - x) ** 2 + (p.z - z) ** 2;
			if (d < best) {
				best = d;
				bs = p.s;
			}
		}
		return bs;
	}
}
