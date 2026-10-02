// Temple music for the four shrines, synthesised in the page with the Web Audio API. No recordings or samples:
// bells, drums and cymbals are built sample by sample from decaying partials and filtered noise, and the
// harmonium, nadaswaram, voices, conch and horn are live oscillators through filters. The tunes are traditional
// forms written out afresh, in the style of the aartis sung at each shrine.
//
//   const music = new Music(audio);    // audio: the Audio from audio.js; music follows its on/off toggle
//   music.ambient(key);                // a quiet bed for darshan; key: "bhimashankar" | "tirupati" | "kedarnath" | "badrinath"
//   const a = music.aarti(key);        // the full aarti (about 95 s), then back to the ambient bed by itself
//     a.id, a.duration, a.cues        // cues in seconds: enter, conch [a, b], pick, aarti [a, b], song [a, b],
//                                     //   peal [a, b], offer [a, b], petals, end
//     a.circle(t), a.ring(t)          // lamp circles and hand-bell strokes counted at piece time t (ring is -1 when silent)
//     a.done                          // Promise: true when it plays out, false if replaced or stopped
//   music.position(a.id);              // seconds into that aarti, counted even while the sound is off; -1 once replaced
//   music.stinger("conch" | "bells" | "bell");
//   music.stop(fade = 1.5);            // fade out and stay silent until the next ambient() or aarti()
//   music.setEnabled(bool);            // an extra mute on top of audio.on
//   music.playing                      // "ambient" | "aarti" | null
//   aartiSchedule(key)                 // the same timing without a Music, for visuals that run with no sound
//   Music.render(key, "aarti" | "ambient", seconds) → Promise<AudioBuffer>, offline, for tests
//
// Nothing sounds until audio.toggle(true) has run inside a user gesture. A piece started while the sound is off
// keeps its clock, so turning the sound on mid-aarti joins it at the right bar. Notes are scheduled on the
// AudioContext clock a little ahead (lookahead), never timed by setTimeout.

const SA = 261.63; // Sa is middle C, in tune with the drone and bell in audio.js
const hz = (s) => SA * Math.pow(2, s / 12);
const NOTE = { S: 0, r: 1, R: 2, g: 3, G: 4, M: 5, m: 6, P: 7, d: 8, D: 9, n: 10, N: 11 };
const now = () => performance.now() / 1000;
const BLOCK = 4; // ambient beds are written four seconds at a time

function lcg(seed) {
	let s = seed >>> 0 || 1;
	return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Sargam: "S R G - .N S'" ("-" holds the last note, "_" rests, "." lowers an octave, "'" raises one).
function score(str) {
	const out = [];
	let at = 0;
	for (const tok of str.trim().split(/\s+/)) {
		if (tok === "|") continue;
		if (tok === "-") {
			if (out.length) out[out.length - 1].len++;
			at++;
			continue;
		}
		if (tok === "_") {
			at++;
			continue;
		}
		const oct = (tok.match(/'/g) || []).length - (tok.match(/\./g) || []).length;
		const k = tok.replace(/['.]/g, "");
		out.push({ s: NOTE[k] + oct * 12, at, len: 1 });
		at++;
	}
	out.len = at;
	return out;
}

// ---------- one-shot sounds, built sample by sample ----------
// Decaying sine partials [ratio, amplitude, decay seconds], by a two-term recurrence (no Math.sin per sample).
function modal(d, rate, f0, parts) {
	for (const [r, a, dec] of parts) {
		const w = (2 * Math.PI * f0 * r) / rate;
		if (w >= Math.PI * 0.95) continue;
		const k = Math.exp(-1 / (dec * rate)), c2 = 2 * Math.cos(w);
		let y1 = Math.sin(-w), y2 = Math.sin(-2 * w), env = a;
		for (let i = 0; i < d.length && env > 1e-5; i++) {
			const y = c2 * y1 - y2;
			y2 = y1;
			y1 = y;
			d[i] += y * env;
			env *= k;
		}
	}
}
// A burst of filtered noise.
function noiseInto(d, rate, amp, decay, lp = 6000, hp = 0, seed = 7) {
	const R = lcg(seed);
	const a = 1 - Math.exp((-2 * Math.PI * lp) / rate), b = hp ? 1 - Math.exp((-2 * Math.PI * hp) / rate) : 0;
	const k = Math.exp(-1 / (decay * rate)), n = Math.min(d.length, Math.ceil(decay * 9 * rate));
	let l = 0, h = 0, env = amp;
	for (let i = 0; i < n; i++) {
		l += a * (R() * 2 - 1 - l);
		h += b * (l - h);
		d[i] += (l - h) * env;
		env *= k;
	}
}
// A struck membrane: partials over a pitch that drops from (1 + bend) times f as the head settles.
function drumInto(d, rate, o) {
	const parts = o.parts || [[1, 1]];
	const ks = parts.map((p) => Math.exp(-1 / (o.decay * (p[2] ?? 1) * rate)));
	const env = parts.map((p) => p[1]);
	const bk = Math.exp(-1 / ((o.bendT ?? 0.03) * rate));
	let ph = 0, bend = o.bend || 0;
	for (let i = 0; i < d.length; i++) {
		ph += (2 * Math.PI * o.f * (1 + bend)) / rate;
		bend *= bk;
		let s = 0;
		for (let k = 0; k < parts.length; k++) {
			s += Math.sin(ph * parts[k][0]) * env[k];
			env[k] *= ks[k];
		}
		d[i] = s;
	}
	if (o.noise) noiseInto(d, rate, o.noise, o.nDecay ?? 0.02, o.nLp ?? 6000, o.nHp ?? 0, o.f | 0);
}
// Cymbals: a cloud of inharmonic partials over a noisy strike.
function cymbalInto(d, rate, freqs, decay, noise, nDecay, hp) {
	modal(d, rate, 1, freqs.map((f, i) => [f, 1 / (1 + i * 0.35), decay * (1 - i * 0.04)]));
	noiseInto(d, rate, noise, nDecay, 12000, hp, freqs.length);
}
// A tambura string: rich harmonics with the jawari's bright band sliding down through them as it rings.
function tamburaInto(d, rate, f) {
	for (let n = 1; n <= 18; n++) {
		const w = (2 * Math.PI * f * n) / rate;
		if (w > Math.PI * 0.9) break;
		const c2 = 2 * Math.cos(w), base = 1 / Math.pow(n, 0.85), dec = 2.6 / (1 + n * 0.05);
		let y1 = Math.sin(-w), y2 = Math.sin(-2 * w);
		for (let i = 0; i < d.length; i += 64) {
			const t = i / rate, c = 3 + 13 * Math.exp(-t / 1.1);
			const env = base * (1 + 2.4 * Math.exp(-((n - c) ** 2) / 5)) * Math.exp(-t / dec) * Math.min(1, t / 0.004 + 0.02);
			for (let j = i; j < Math.min(d.length, i + 64); j++) {
				const y = c2 * y1 - y2;
				y2 = y1;
				y1 = y;
				d[j] += y * env;
			}
		}
	}
}
const bell = (f0, parts, click = 0.25) => (d, r) => {
	modal(d, r, f0, parts);
	noiseInto(d, r, click, 0.004, 7000, 400, f0 | 0);
};
const drum = (o) => [Math.min(2.5, o.decay * 6 + 0.05), (d, r) => drumInto(d, r, o)];
// name: [seconds, fill(data, rate), sample rate (defaults to the context's)]
const BUFS = {
	// the great temple bell, its partial pairs beating slowly
	ghanta: [6, bell(165, [[0.5, 0.35, 6.5], [1, 0.6, 5.5], [1.004, 0.45, 5.5], [1.19, 0.3, 4], [1.5, 0.3, 3.2], [1.506, 0.2, 3.2], [2, 0.32, 2.6], [2.52, 0.2, 1.8], [2.67, 0.18, 1.6], [3.01, 0.14, 1.2], [3.98, 0.1, 0.8], [5.3, 0.06, 0.5], [6.8, 0.04, 0.35]], 0.35)],
	// the brass bells hung at the door, rung by pilgrims
	doorBell: [2.6, bell(587, [[1, 0.6, 2.4], [1.006, 0.4, 2.4], [2.62, 0.3, 1.2], [2.64, 0.2, 1.2], [4.5, 0.18, 0.6], [6.9, 0.1, 0.3], [0.51, 0.15, 2.6]])],
	// the pujari's hand bell (ghanti)
	ghanti: [1.1, bell(1318, [[1, 0.6, 0.85], [1.007, 0.4, 0.85], [2.44, 0.35, 0.42], [3.95, 0.2, 0.28], [5.6, 0.12, 0.16], [7.4, 0.06, 0.1]], 0.3)],
	manjira: [1.4, (d, r) => cymbalInto(d, r, [2380, 2970, 3460, 4190, 5010, 5870, 6620, 7730], 1.1, 0.5, 0.02, 3000)],
	manjiraC: [0.2, (d, r) => cymbalInto(d, r, [2380, 2970, 3460, 4190, 5010, 5870], 0.05, 0.4, 0.015, 3000)],
	tal: [1.1, (d, r) => cymbalInto(d, r, [610, 1130, 1540, 1980, 2470, 3030, 3610, 4290, 5150, 6170], 0.75, 0.9, 0.06, 800)],
	talC: [0.2, (d, r) => cymbalInto(d, r, [610, 1130, 1540, 1980, 2470, 3030, 3610], 0.05, 0.7, 0.03, 900)],
	jalra: [0.7, (d, r) => cymbalInto(d, r, [1750, 2260, 2890, 3570, 4380, 5320, 6410], 0.45, 0.5, 0.02, 2000)],
	jalraC: [0.15, (d, r) => cymbalInto(d, r, [1750, 2260, 2890, 3570, 4380], 0.04, 0.4, 0.012, 2000)],
	// Garhwali dhol (bass face and the stick side) and the damau kettle drum
	dholBass: drum({ f: 82, bend: 0.7, bendT: 0.025, decay: 0.32, parts: [[1, 1], [1.58, 0.22, 0.6], [2.13, 0.1, 0.4]], noise: 0.25, nDecay: 0.012, nLp: 2500 }),
	dholStick: drum({ f: 340, bend: 0.25, decay: 0.07, parts: [[1, 0.6], [1.62, 0.3]], noise: 0.8, nDecay: 0.025, nLp: 7000, nHp: 1200 }),
	damau: drum({ f: 450, bend: 0.3, decay: 0.09, parts: [[1, 0.8], [1.52, 0.35], [2.08, 0.2]], noise: 0.6, nDecay: 0.015, nLp: 8000, nHp: 1500 }),
	nagara: drum({ f: 58, bend: 0.9, bendT: 0.04, decay: 0.65, parts: [[1, 1], [1.5, 0.3, 0.6], [2, 0.15, 0.4]], noise: 0.3, nDecay: 0.03, nLp: 1800 }),
	// dholak: the bass "ge", the treble "na" and the dry "ti"
	dholakGe: drum({ f: 105, bend: 0.45, bendT: 0.05, decay: 0.28, parts: [[1, 1], [2, 0.15]], noise: 0.1, nLp: 2000 }),
	dholakNa: drum({ f: 510, decay: 0.16, parts: [[1, 0.8], [2, 0.4], [3, 0.2], [4.1, 0.08]], noise: 0.25, nDecay: 0.006, nLp: 9000, nHp: 2000 }),
	dholakTi: drum({ f: 620, decay: 0.045, parts: [[1, 0.5], [2.3, 0.3]], noise: 0.6, nDecay: 0.01, nHp: 2500 }),
	// pakhawaj (mridanga): the open bass, the ringing treble with its near-harmonic partials, and a slap
	pakhGa: drum({ f: 72, bend: 0.25, bendT: 0.06, decay: 0.42, parts: [[1, 1], [2, 0.2], [3, 0.08]], noise: 0.12, nLp: 1500 }),
	pakhTa: drum({ f: 280, decay: 0.38, parts: [[1, 0.8], [2, 0.55], [3, 0.35], [4, 0.2], [5, 0.1]], noise: 0.18, nDecay: 0.006, nLp: 8000, nHp: 1500 }),
	pakhKa: drum({ f: 190, decay: 0.045, parts: [[1, 0.6], [1.7, 0.3]], noise: 0.6, nDecay: 0.012, nLp: 5000 }),
	// thavil: the right hand's open ring and slap, and the crack of the left-hand stick
	thavilDhi: drum({ f: 230, bend: 0.15, decay: 0.26, parts: [[1, 1], [1.98, 0.45], [2.94, 0.25], [3.9, 0.1]], noise: 0.25, nDecay: 0.008, nLp: 6000 }),
	thavilTa: drum({ f: 310, decay: 0.06, parts: [[1, 0.6], [2.1, 0.3]], noise: 0.55, nDecay: 0.012, nLp: 7000, nHp: 1000 }),
	thavilStick: drum({ f: 720, decay: 0.035, parts: [[1, 0.5], [1.6, 0.3]], noise: 1, nDecay: 0.018, nLp: 9000, nHp: 2200 }),
	damaru: drum({ f: 610, bend: 0.2, decay: 0.055, parts: [[1, 0.8], [1.58, 0.35]], noise: 0.35, nDecay: 0.008, nLp: 7000, nHp: 1000 }),
	tamPa: [3.6, (d, r) => tamburaInto(d, r, 196), 22050],
	tamSa: [3.6, (d, r) => tamburaInto(d, r, 261.63), 22050],
	tamSaL: [3.6, (d, r) => tamburaInto(d, r, 130.81), 22050],
	noise: [2, (d) => {
		const R = lcg(99);
		for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
	}],
};

// Reverb per shrine: [seconds, brightness, wet]. Kedarnath and Bhimashankar ring like stone halls.
const ROOM = { kedarnath: [3.4, 0.5, 0.42], bhimashankar: [2.8, 0.55, 0.36], tirupati: [1.8, 0.7, 0.24], badrinath: [2.2, 0.6, 0.27] };

class Engine {
	constructor(ctx) {
		this.ctx = ctx;
		this.bufs = {};
		this.irs = {};
	}
	buf(name) {
		let b = this.bufs[name];
		if (b) return b;
		const [secs, fill, rate] = BUFS[name];
		const r = rate || this.ctx.sampleRate;
		b = this.ctx.createBuffer(1, Math.ceil(secs * r), r);
		const d = b.getChannelData(0);
		fill(d, r);
		if (name !== "noise") {
			let peak = 0;
			for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
			const k = 0.9 / (peak || 1), na = Math.ceil(r * 0.0015);
			for (let i = 0; i < d.length; i++) d[i] *= k * (i < na ? i / na : 1);
		}
		return (this.bufs[name] = b);
	}
	// a generated impulse: early reflections off stone, then a tail that darkens as it dies
	ir(key) {
		if (this.irs[key]) return this.irs[key];
		const [secs, bright] = ROOM[key] || ROOM.kedarnath;
		const rate = this.ctx.sampleRate, n = Math.floor(secs * rate);
		const b = this.ctx.createBuffer(2, n, rate);
		for (let ch = 0; ch < 2; ch++) {
			const d = b.getChannelData(ch), R = lcg(11 + ch * 7);
			let l = 0;
			for (let i = 0; i < n; i++) {
				const t = i / rate;
				const a = 0.04 + bright * Math.exp((-t * 3) / secs);
				l += a * (R() * 2 - 1 - l);
				d[i] = l * Math.exp((-6.9 * t) / secs) * Math.min(1, t / 0.008);
			}
			for (const [ms, g] of [[9, 0.5], [15, 0.4], [23, 0.32], [34, 0.25], [47, 0.18], [63, 0.12]]) d[Math.floor(((ms + ch * 1.3) / 1000) * rate)] += g * (ch ? -1 : 1);
		}
		return (this.irs[key] = b);
	}
}

// ---------- node helpers ----------
const G = (c, v = 1) => {
	const g = c.createGain();
	g.gain.value = v;
	return g;
};
const O = (c, type, f) => {
	const o = c.createOscillator();
	o.type = type;
	o.frequency.value = f;
	return o;
};
const F = (c, type, f, Q = 0.7, gain = 0) => {
	const b = c.createBiquadFilter();
	b.type = type;
	b.frequency.value = f;
	b.Q.value = Q;
	b.gain.value = gain;
	return b;
};
const chain = (...n) => {
	for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
	return n[n.length - 1];
};
// attack, a slight fall to the sustain, and a quick release before the next note
function env(p, T, dur, vel, a = 0.015, r = 0.03) {
	p.setTargetAtTime(vel, T, a);
	if (dur > 0.3) p.setTargetAtTime(vel * 0.82, T + Math.min(0.2, dur * 0.4), 0.25);
	p.setTargetAtTime(0, T + Math.max(0.02, dur - r * 1.5), r);
}

// For tests: names to leave out of a render (buffer names, voices, "om", "conch", "horn", "drone", "bed").
const MUTE = new Set();
// The mix: drums sit under the singing, the thavil a little forward as it is at Tirumala.
const MIX = { ghanta: 0.7, doorBell: 0.7, ghanti: 0.6, thavilDhi: 0.72, thavilTa: 0.72, thavilStick: 0.72 };
for (const n of ["dholBass", "dholStick", "damau", "nagara", "dholakGe", "dholakNa", "dholakTi", "pakhGa", "pakhTa", "pakhKa", "damaru"]) MIX[n] = 0.55;
function hit(P, T, name, vel = 1, rate = 1, pan = 0) {
	if (MUTE.has(name)) return;
	const c = P.ctx, s = c.createBufferSource();
	s.buffer = P.e.buf(name);
	s.playbackRate.value = rate;
	const g = G(c, vel * (MIX[name] ?? 1));
	s.connect(g);
	if (pan && c.createStereoPanner) {
		const p = c.createStereoPanner();
		p.pan.value = pan;
		chain(g, p, P.out);
	} else g.connect(P.out);
	s.start(T);
}

// ---------- live voices ----------
// Harmonium: two reeds a hair apart and one an octave up, through a soft lowpass.
class Reed {
	constructor(P, level = 1, cutoff = 2600) {
		const c = P.ctx;
		this.amp = G(c, 0);
		const lp = F(c, "lowpass", cutoff, 0.8);
		chain(lp, F(c, "peaking", 1150, 1.2, 4), this.amp, P.out);
		this.o = [["sawtooth", 1, 0, 0.5], ["square", 1, 5, 0.2], ["sawtooth", 2, -4, 0.16]].map(([type, m, det, a]) => {
			const o = O(c, type, SA * m);
			o.detune.value = det;
			chain(o, G(c, a * level), lp);
			o.start(P.t);
			P.stop.push(o);
			return [o, m];
		});
	}
	note(T, f, dur, vel) {
		for (const [o, m] of this.o) o.frequency.setValueAtTime(f * m, T);
		env(this.amp.gain, T, dur, vel, 0.012, 0.03);
	}
}
// Vowels by their first three formants.
const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [390, 1990, 2550], o: [570, 840, 2410], u: [325, 870, 2250], m: [260, 1100, 2400] };
// A singer, or a group of singers a few cents apart: sawtooth voices through a formant bank.
class Singer {
	constructor(P, n = 1, level = 1) {
		const c = P.ctx;
		this.amp = G(c, 0);
		this.amp.connect(P.out);
		const mix = G(c, level / Math.sqrt(n)), lp = F(c, "lowpass", 3800);
		mix.connect(lp);
		this.bp = VOWELS.a.map((f, i) => {
			const b = F(c, "bandpass", f, [8, 10, 12][i]);
			chain(lp, b, G(c, [1.6, 1.0, 0.45][i]), this.amp);
			return b;
		});
		this.o = [];
		for (let k = 0; k < n; k++) {
			const o = O(c, "sawtooth", SA / 2);
			o.detune.value = (k - (n - 1) / 2) * 9;
			const lfo = O(c, "sine", 4.8 + k * 0.55);
			chain(lfo, G(c, 7), o.detune);
			chain(o, mix);
			o.start(P.t);
			lfo.start(P.t);
			P.stop.push(o, lfo);
			this.o.push(o);
		}
	}
	vowel(T, v, tc = 0.04) {
		VOWELS[v].forEach((f, i) => this.bp[i].frequency.setTargetAtTime(f, T, tc));
	}
	note(T, f, dur, vel, o = {}) {
		for (const x of this.o) x.frequency.setTargetAtTime(f, T, 0.025);
		if (o.v) this.vowel(T, o.v);
		env(this.amp.gain, T, dur, vel, 0.03, 0.05);
	}
}
// Nadaswaram: a bright double reed, played here by a pair a few cents apart, with gamakas and slides.
class Nadaswaram {
	constructor(P, level = 1) {
		const c = P.ctx;
		this.amp = G(c, 0);
		const hp = F(c, "highpass", 320);
		chain(hp, F(c, "peaking", 1250, 1.3, 9), F(c, "peaking", 2900, 1.6, 5), F(c, "lowpass", 6000), this.amp, P.out);
		this.o = [["sawtooth", 0, 0.55], ["square", 7, 0.28], ["sawtooth", -6, 0.3]].map(([type, det, a]) => {
			const o = O(c, type, SA);
			o.detune.value = det;
			chain(o, G(c, a * level), hp);
			o.start(P.t);
			P.stop.push(o);
			return o;
		});
		const br = c.createBufferSource();
		br.buffer = P.e.buf("noise");
		br.loop = true;
		chain(br, F(c, "bandpass", 2200, 0.9), G(c, 0.05 * level), hp);
		br.start(P.t);
		P.stop.push(br);
	}
	note(T, f, dur, vel, o = {}) {
		for (const x of this.o) x.frequency.setTargetAtTime(f, T, o.slide ? 0.05 : 0.018);
		if (o.gam && dur > 0.4) {
			// kampita: a shake down to just below the note and back
			const lo = f * Math.pow(2, -1.3 / 12);
			let x = T + 0.14, k = 0;
			while (x < T + dur - 0.14) {
				for (const v of this.o) v.frequency.setTargetAtTime(k % 2 ? f : lo, x, 0.03);
				x += 0.12;
				k++;
			}
			for (const v of this.o) v.frequency.setTargetAtTime(f, x, 0.03);
		}
		env(this.amp.gain, T, dur, vel, 0.02, 0.04);
	}
}

// ---------- phrases with their own nodes ----------
// The shankh: a deep blown conch, scooping up to pitch with a breathy edge and a slow vibrato.
function conch(P, T, dur, f, vel) {
	vel *= 0.5;
	const c = P.ctx, amp = G(c, 0);
	const lp = F(c, "lowpass", 400, 2.2);
	chain(lp, F(c, "peaking", 1100, 1.4, 5), amp, P.out);
	const vib = O(c, "sine", 5.3), vg = G(c, 0);
	vib.connect(vg);
	vg.gain.setValueAtTime(0, T);
	vg.gain.linearRampToValueAtTime(9, T + 1.2);
	for (const [type, m, a] of [["sawtooth", 1, 0.55], ["triangle", 1, 0.5], ["sawtooth", 2.005, 0.12]]) {
		const o = O(c, type, f * m);
		vg.connect(o.detune);
		o.frequency.setValueAtTime(f * m * 0.9, T);
		o.frequency.exponentialRampToValueAtTime(f * m, T + 0.35);
		o.frequency.setValueAtTime(f * m, T + dur - 0.4);
		o.frequency.exponentialRampToValueAtTime(f * m * 0.95, T + dur);
		chain(o, G(c, a), lp);
		o.start(T);
		o.stop(T + dur + 0.05);
	}
	lp.frequency.setValueAtTime(400, T);
	lp.frequency.exponentialRampToValueAtTime(2600, T + 0.45);
	lp.frequency.setTargetAtTime(1900, T + 0.6, 0.5);
	lp.frequency.setTargetAtTime(500, T + dur - 0.35, 0.12);
	const br = c.createBufferSource();
	br.buffer = P.e.buf("noise");
	br.loop = true;
	chain(br, F(c, "bandpass", 1500, 0.8), G(c, 0.1), amp);
	br.start(T);
	br.stop(T + dur + 0.05);
	vib.start(T);
	vib.stop(T + dur + 0.05);
	const g = amp.gain;
	g.setValueAtTime(0, T);
	g.linearRampToValueAtTime(vel * 0.55, T + 0.3);
	g.linearRampToValueAtTime(vel * 0.75, T + dur * 0.65);
	g.linearRampToValueAtTime(vel * 0.6, T + dur - 0.3);
	g.linearRampToValueAtTime(0, T + dur);
}
// Ransingha: the curved Garhwali horn, two natural notes with a brassy swell.
function horn(P, T, vel) {
	vel *= 0.7;
	const c = P.ctx, amp = G(c, 0), lp = F(c, "lowpass", 400, 1.2);
	chain(lp, amp, P.out);
	const notes = [[392, 0, 0.55], [523.25, 0.5, 1.15], [392, 1.65, 0.4]];
	const end = T + 2.1;
	for (const det of [0, 9]) {
		const o = O(c, "sawtooth", 392);
		o.detune.value = det;
		for (const [f, at] of notes) {
			o.frequency.setValueAtTime(f * 0.86, T + at);
			o.frequency.exponentialRampToValueAtTime(f, T + at + 0.07);
		}
		chain(o, G(c, 0.5), lp);
		o.start(T);
		o.stop(end);
	}
	const g = amp.gain;
	g.setValueAtTime(0, T);
	for (const [, at, len] of notes) {
		g.setTargetAtTime(vel, T + at, 0.04);
		lp.frequency.setTargetAtTime(3400, T + at, 0.08);
		g.setTargetAtTime(vel * 0.35, T + at + len - 0.08, 0.04);
		lp.frequency.setTargetAtTime(700, T + at + len - 0.08, 0.06);
	}
	g.setTargetAtTime(0, T + 2.0, 0.03);
}
// "Om": a group of priests on Sa with one an octave below, the vowel closing from "o" to the hummed "m".
function om(P, T, dur, vel) {
	vel *= 0.35;
	const c = P.ctx, amp = G(c, 0), lp = F(c, "lowpass", 3200, 0.5);
	amp.connect(P.out);
	const bp = VOWELS.o.map((f, i) => {
		const b = F(c, "bandpass", f, [7, 9, 12][i]);
		chain(lp, b, G(c, [1.8, 1.0, 0.35][i]), amp);
		return b;
	});
	chain(lp, G(c, 0.3), amp);
	for (const [f, a, det] of [[130.81, 0.55, -5], [130.81, 0.45, 6], [65.41, 0.7, 0], [196, 0.15, 3]]) {
		const o = O(c, "sawtooth", f);
		o.detune.value = det;
		chain(o, G(c, a), lp);
		o.start(T);
		o.stop(T + dur + 0.1);
	}
	const m = T + dur * 0.42;
	VOWELS.m.forEach((f, i) => bp[i].frequency.setTargetAtTime(f, m, 0.12));
	lp.frequency.setTargetAtTime(520, m, 0.18);
	const g = amp.gain;
	g.setValueAtTime(0, T);
	g.linearRampToValueAtTime(vel, T + 0.6);
	g.setTargetAtTime(vel * 1.15, m, 0.3);
	g.setTargetAtTime(0, T + dur - 0.8, 0.25);
}
// A long continuous reed drone on Sa and Pa (harmonium, or the ottu of the mangala vadyam), breathing with the bellows.
function reedDrone(P, freqs, level, cutoff, nasal) {
	const c = P.ctx, g = G(c, 0), lp = F(c, "lowpass", cutoff, 0.6);
	if (nasal) chain(lp, F(c, "peaking", 1300, 1.2, 8), g, P.out);
	else chain(lp, g, P.out);
	g.gain.setTargetAtTime(level, P.t, 1.2);
	const lfo = O(c, "sine", 0.17);
	chain(lfo, G(c, level * 0.22), g.gain);
	lfo.start(P.t);
	P.stop.push(lfo);
	freqs.forEach(([f, a], i) => {
		const o = O(c, "sawtooth", f);
		o.detune.value = (i % 2 ? 3 : -3) * (i + 1) * 0.5;
		chain(o, G(c, a), lp);
		o.start(P.t);
		P.stop.push(o);
	});
}
// Wind over the snows, or the Alaknanda below the steps.
function noiseBed(P, type, f, Q, level, sweep) {
	const c = P.ctx, src = c.createBufferSource();
	src.buffer = P.e.buf("noise");
	src.loop = true;
	const flt = F(c, type, f, Q), g = G(c, 0);
	chain(src, flt, g, P.out);
	g.gain.setTargetAtTime(level, P.t, 2);
	const lfo = O(c, "sine", 0.07);
	chain(lfo, G(c, sweep), flt.frequency);
	src.start(P.t);
	lfo.start(P.t);
	P.stop.push(src, lfo);
}

// ---------- writing music ----------
// A tempo grid: bars of upb units, each bar with its own unit length so a piece can gather speed.
class Grid {
	constructor(t0, upb) {
		this.t0 = this.end = t0;
		this.upb = upb;
		this.bars = [];
	}
	add(n, u0, u1 = u0) {
		for (let i = 0; i < n; i++) {
			const u = n > 1 ? u0 + ((u1 - u0) * i) / (n - 1) : u0;
			this.bars.push({ t: this.end, u });
			this.end += u * this.upb;
		}
		return this;
	}
	time(x) {
		const b = clamp(Math.floor(x / this.upb), 0, this.bars.length - 1), bar = this.bars[b];
		return bar.t + (x - b * this.upb) * bar.u;
	}
	units(t) {
		for (let i = this.bars.length - 1; i >= 0; i--) if (t >= this.bars[i].t) return i * this.upb + (t - this.bars[i].t) / this.bars[i].u;
		return (t - this.t0) / this.bars[0].u;
	}
}
class Score {
	constructor(seed = 1) {
		this.ev = [];
		this.rings = [];
		this.R = lcg(seed);
	}
	at(t, fn) {
		this.ev.push({ t, fn });
	}
	hit(t, name, vel = 1, rate = 1, pan = 0) {
		this.at(t, (T, P) => hit(P, T, name, vel, rate, pan));
	}
	conch(t, dur, f = 196, vel = 1) {
		this.at(t, (T, P) => MUTE.has("conch") || conch(P, T, dur, f, vel));
	}
	horn(t, vel = 0.7) {
		this.at(t, (T, P) => MUTE.has("horn") || horn(P, T, vel));
	}
	om(t, dur, vel = 0.5) {
		this.at(t, (T, P) => MUTE.has("om") || om(P, T, dur, vel));
	}
	// the damaru's rattle: the two heads struck in turn, quickening and easing
	damaru(t, dur, vel = 0.5) {
		for (let x = t, k = 0; x < t + dur; k++) {
			const s = (x - t) / dur;
			this.hit(x, "damaru", vel * (0.55 + 0.45 * Math.sin(Math.PI * s)) * (k % 2 ? 0.8 : 1), k % 2 ? 1.09 : 1, k % 2 ? 0.2 : -0.2);
			x += 1 / (11 + 6 * Math.sin(Math.PI * s));
		}
	}
	// the pujari's hand bell, in free time
	ring(t0, t1, step = 0.15, vel = 0.16) {
		this.rings.push({ t0, t1, step });
		for (let x = t0, k = 0; x < t1; x += step, k++) this.hit(x + this.R() * 0.012, "ghanti", vel * (k % 2 ? 0.7 : 1), k % 2 ? 0.996 : 1, 0.1);
	}
	// or in time with the song, per strokes to a unit
	ringGrid(g, b0, b1, per = 2, vel = 0.16) {
		const x0 = b0 * g.upb * per, x1 = b1 * g.upb * per;
		this.rings.push({ t0: g.time(x0 / per), t1: g.time(x1 / per), g, x0, per });
		for (let x = x0; x < x1; x++) this.hit(g.time(x / per) + this.R() * 0.01, "ghanti", vel * (x % 2 ? 0.7 : 1), x % 2 ? 0.996 : 1, 0.1);
	}
	// pilgrims at the door bells, all at once
	peal(t, n = 12, vel = 0.3) {
		for (let k = 0; k < n; k++) this.hit(t + k * 0.21 + this.R() * 0.08, "doorBell", vel * (0.7 + this.R() * 0.3), 0.97 + this.R() * 0.07, this.R() * 1.2 - 0.6);
	}
	line(g, u0, str, voice, vel, o = {}) {
		const ns = score(str), vw = o.vowels || "aoaiae";
		ns.forEach((n, i) => {
			const t = g.time(u0 + n.at), d = g.time(u0 + n.at + n.len) - t, f = hz(n.s + (o.oct || 0) * 12);
			const opt = { v: vw[i % vw.length], gam: o.gam && (n.s % 12 === 4 || n.s % 12 === 9) && n.len >= 2, slide: o.slide };
			this.at(t, (T, P) => P.v[voice] && !MUTE.has(voice) && P.v[voice].note(T, f, d, vel, opt));
		});
		return u0 + ns.len;
	}
	// call (the lead singer and harmonium) and response (the gathered pilgrims)
	sing(g, u0, str, who, vowels) {
		this.line(g, u0, str, "lead", who === "call" ? 0.75 : 0.95);
		if (who !== "resp") this.line(g, u0, str, "solo", 0.8, { oct: -1, vowels });
		if (who !== "call") this.line(g, u0, str, "chorus", 0.95, { oct: -1, vowels });
		return u0 + score(str).len;
	}
	// a shouted refrain, one per bar: syl = [[vowel, semitone, unit, length], ...]
	chant(g, b0, b1, syl, vel = 1) {
		for (let b = b0; b < b1; b++) for (const [v, s, u, len] of syl) {
			const x = b * g.upb + u, t = g.time(x), d = g.time(x + len) - t;
			this.at(t, (T, P) => {
				if (P.v.chorus && !MUTE.has("chorus")) P.v.chorus.note(T, hz(s - 12), d, vel, { v });
				if (P.v.lead && !MUTE.has("lead")) P.v.lead.note(T, hz(s), d, 0.7);
			});
		}
	}
	// one pattern string per bar (or per bar at two strokes a unit); map: char → [[buffer, velocity], ...]
	rhythm(g, b0, b1, str, map) {
		const sub = str.length / g.upb;
		for (let b = b0; b < b1; b++) for (let k = 0; k < str.length; k++) {
			const hits = map[str[k]];
			if (!hits) continue;
			const t = g.time(b * g.upb + k / sub);
			for (const [name, vel, rate = 1, pan = 0] of hits) this.hit(t + this.R() * 0.006, name, vel * (0.9 + this.R() * 0.2), rate, pan);
		}
	}
	sorted() {
		return this.ev.sort((a, b) => a.t - b.t);
	}
}

// The close shared by every aarti: the great bell and the door bells all at once, a last conch, then quiet.
function finale(S, end, conchF) {
	for (let k = 0; k < 5; k++) S.hit(end + k * 0.95, "ghanta", 0.9 - k * 0.1, 1, k % 2 ? 0.25 : -0.25);
	S.peal(end + 0.1, 16, 0.32);
	S.ring(end, end + 5.4, 0.11, 0.2);
	S.conch(end + 1.1, 4.2, conchF, 0.95);
	return { peal: [end, end + 5.6], offer: [end + 5.8, end + 17.3], petals: end + 14.3, end: end + 22.5 };
}
const OPEN = { enter: [0, 2.6], conch: [3.2, 8.0], pick: 8.9 };

// ---------- the four aartis ----------
const PIECES = {
	// Kedarnath: the evening (shayan) aarti in the Garhwal manner. Om, the shankh, the great bell, damaru and the
	// ransingha, then a call and response in the style of "Om Jai Shiv Omkara" over dhol and damau.
	kedarnath(S) {
		S.om(0.6, 5.5, 0.45);
		S.hit(1.4, "doorBell", 0.22, 1, -0.3);
		S.conch(3.2, 4.8, 196, 1);
		for (const [t, v] of [[8.4, 0.85], [10.0, 0.75], [11.6, 0.8], [13.2, 0.65]]) S.hit(t, "ghanta", v);
		S.damaru(8.9, 1.5, 0.55);
		S.damaru(12.1, 1.3, 0.55);
		S.horn(10.5, 0.45);
		S.horn(12.9, 0.45);
		S.om(8.7, 6.0, 0.45);
		S.ring(9, 15, 0.15);
		const g = new Grid(15, 8).add(16, 0.3).add(8, 0.28, 0.21).add(4, 0.2);
		const P1 = "S - R G G - G - G M G R G - - -", P2 = "G G P - M G R - S R G R S - - -";
		const P3 = "P P P D P - M G M P M G R - - -", P4 = "G M G R S - .N S S - - - - - - -";
		const vw = "oaioaaea";
		let u = 0;
		for (const [str, who] of [[P1 + " " + P2, "call"], [P1 + " " + P2, "resp"], [P3 + " " + P4, "call"], [P3 + " " + P4, "resp"], [[P1, P2, P3, P4].join(" "), "all"]]) u = S.sing(g, u, str, who, vw);
		// Har Har Mahadev
		S.chant(g, 24, 28, [["a", 7, 0, 1], ["a", 7, 1, 1], ["a", 5, 2, 1], ["a", 4, 3, 1], ["e", 4, 4, 3]]);
		const dd = { D: [["dholBass", 0.8]], t: [["dholStick", 0.42]], T: [["dholStick", 0.62]] }, dm = { x: [["damau", 0.36]], X: [["damau", 0.55]] };
		S.rhythm(g, 0, 16, "D..tD.t.", dd);
		S.rhythm(g, 0, 16, "..x...x.", dm);
		S.rhythm(g, 16, 24, "D.tDt.tD", dd);
		S.rhythm(g, 16, 24, "x.xx.xXx", dm);
		S.rhythm(g, 24, 28, "DtTtDtTt", dd);
		S.rhythm(g, 24, 28, "xxXxxxXxxxXxxxXx", dm);
		S.rhythm(g, 24, 28, "N...N...", { N: [["nagara", 0.75]] });
		S.ringGrid(g, 0, 28, 2);
		for (let b = 0; b < 24; b += 2) S.hit(g.time(b * 8), "ghanta", 0.4);
		for (const b of [3, 7, 11, 15, 19, 23]) S.damaru(g.time(b * 8 + 5), 0.7, 0.4);
		S.horn(g.time(16 * 8), 0.6);
		S.horn(g.time(24 * 8), 0.7);
		const c = finale(S, g.end, 196);
		S.damaru(g.end, 2.0, 0.5);
		S.om(g.end + 6.2, 7.5, 0.45);
		return { g, cues: { ...OPEN, aarti: [9, g.end], song: [g.t0, g.end], ...c } };
	},
	// Bhimashankar: a Maharashtrian aarti, brisk, with heavy tal cymbals, pakhawaj and the nagara, in the style of
	// "Jai Dev Jai Dev" and ending in "Har Har Mahadev".
	bhimashankar(S) {
		S.om(0.6, 5.2, 0.4);
		S.conch(3.2, 4.8, 220, 1);
		for (const [t, v] of [[8.4, 0.85], [10.1, 0.75], [11.8, 0.75]]) S.hit(t, "ghanta", v);
		S.damaru(9.2, 1.4, 0.45);
		S.om(8.8, 5.6, 0.4);
		// the tal shimmering, gathering itself
		for (let x = 12.4, k = 0; x < 15; x += 0.11, k++) S.hit(x, k % 3 ? "talC" : "tal", 0.12 + ((x - 12.4) / 2.6) * 0.2);
		S.ring(9, 15, 0.15);
		const g = new Grid(15, 8).add(16, 0.27).add(8, 0.25, 0.19).add(6, 0.18);
		const V1 = "S S R G - G G G M G R G - - - -", V2 = "G G M P - P P P D P M G R - - -";
		const R1 = "P - P - D - P - M G M P - - - -", R2 = "G - G - M - G - R S R S - - - -";
		const vw = "aeaeaiao";
		let u = 0;
		for (const [str, who] of [[V1 + " " + V2, "call"], [R1 + " " + R2, "resp"], [V1 + " " + V2, "call"], [R1 + " " + R2, "resp"], [[R1, R2, R1, R2].join(" "), "all"]]) u = S.sing(g, u, str, who, vw);
		S.chant(g, 24, 30, [["a", 7, 0, 1], ["a", 7, 1, 1], ["a", 5, 2, 1], ["a", 4, 3, 1], ["e", 4, 4, 3]]);
		const tal = { O: [["tal", 0.3]], c: [["talC", 0.24]] };
		const pk = { G: [["pakhGa", 0.75]], t: [["pakhTa", 0.45]], k: [["pakhKa", 0.4]] };
		S.rhythm(g, 0, 16, "OcOcOcOc", tal);
		S.rhythm(g, 0, 16, "G.tkG.tk", pk);
		S.rhythm(g, 16, 24, "OcOcOcOc", tal);
		S.rhythm(g, 16, 24, "GtkGtGtk", pk);
		S.rhythm(g, 24, 30, "OcOcOcOcOcOcOcOc", tal);
		S.rhythm(g, 24, 30, "GkGkGtGt", pk);
		S.rhythm(g, 24, 30, "N..N..N.", { N: [["nagara", 0.7]] });
		S.rhythm(g, 16, 24, "N.......", { N: [["nagara", 0.5]] });
		S.ringGrid(g, 0, 30, 2);
		for (let b = 0; b < 24; b += 4) S.hit(g.time(b * 8), "ghanta", 0.38);
		const c = finale(S, g.end, 220);
		S.om(g.end + 6.2, 7, 0.4);
		return { g, cues: { ...OPEN, aarti: [9, g.end], song: [g.t0, g.end], ...c } };
	},
	// Badrinath: harmonium, dholak and manjira in a lilting six, in the style of the Badrinath aarti
	// "Pavan Mand Sugandh Sheetal", the dhol and damau joining for the procession at the end.
	badrinath(S) {
		S.hit(0.8, "doorBell", 0.22, 1, 0.3);
		S.conch(3.2, 4.8, 208, 1);
		S.hit(8.4, "ghanta", 0.8);
		S.hit(10.2, "ghanta", 0.7);
		S.ring(9, 15, 0.15);
		// a harmonium alap before the song
		let t = 9.2;
		for (const [s, d] of [[0, 1.0], [2, 0.4], [4, 1.1], [2, 0.4], [0, 0.6], [-1, 0.5], [0, 1.6]]) {
			const f = hz(s), at = t;
			S.at(at, (T, P) => P.v.lead.note(T, f, d, 0.6));
			t += d;
		}
		const g = new Grid(15, 6).add(16, 0.36).add(8, 0.34, 0.26).add(6, 0.24);
		const L1 = "S - R G - G M - G R - S R - G M - P M G R G - -";
		const L2 = "P - D P - M G - M P - - G M G R - S .N S - - - -";
		const vw = "aaoaaiau";
		let u = 0;
		for (const [str, who] of [[L1, "call"], [L1, "resp"], [L2, "call"], [L2, "resp"], [L1 + " " + L2, "all"]]) u = S.sing(g, u, str, who, vw);
		// Jai Badri Vishal
		S.chant(g, 24, 30, [["a", 7, 0, 1], ["a", 7, 1, 1], ["i", 5, 2, 1], ["i", 4, 3, 1], ["a", 4, 4, 2]]);
		const dk = { D: [["dholakGe", 0.6], ["dholakNa", 0.4]], d: [["dholakGe", 0.35], ["dholakNa", 0.3]], n: [["dholakNa", 0.4]], t: [["dholakTi", 0.36]] };
		const mj = { o: [["manjira", 0.18]], c: [["manjiraC", 0.15]] };
		S.rhythm(g, 0, 16, "DdnDtn", dk);
		S.rhythm(g, 0, 16, "o.co.c", mj);
		S.rhythm(g, 16, 24, "DtnDdn", dk);
		S.rhythm(g, 16, 24, "o.oo.o", mj);
		S.rhythm(g, 24, 30, "DnDDnD", dk);
		S.rhythm(g, 24, 30, "oooooo", mj);
		S.rhythm(g, 24, 30, "D.tD.t", { D: [["dholBass", 0.75]], t: [["dholStick", 0.5]] });
		S.rhythm(g, 24, 30, "xxXxxX", { x: [["damau", 0.32]], X: [["damau", 0.5]] });
		S.ringGrid(g, 0, 30, 2);
		for (let b = 0; b < 24; b += 4) S.hit(g.time(b * 6), "ghanta", 0.35);
		const c = finale(S, g.end, 208);
		return { g, cues: { ...OPEN, aarti: [9, g.end], song: [g.t0, g.end], ...c } };
	},
	// Tirumala: the mangala vadyam at the harati. The nadaswaram opens with an alapana in Mohanam (S R G P D) over
	// the ottu drone, then a kriti-like melody in Adi tala with thavil and jalra, and the cry of "Govinda".
	tirupati(S) {
		S.hit(0.5, "ghanta", 0.5);
		S.hit(2.0, "ghanta", 0.4);
		S.conch(3.2, 4.6, 233, 0.95);
		S.ring(9, 24.2, 0.15);
		let t = 8.8;
		for (const n of [[0, 1.6], [2, 0.35], [4, 1.3, 1], [2, 0.35], [0, 0.6], [-3, 1.0, 1], [0, 1.6], null, [7, 0.5], [9, 0.5], [12, 1.8], [9, 0.45, 1], [7, 0.45], [4, 0.8, 1], [2, 0.35], [0, 2.2]]) {
			if (!n) {
				t += 0.5;
				continue;
			}
			const [s, d, gam] = n, f = hz(s + 12), at = t;
			S.at(at, (T, P) => P.v.nada.note(T, f, d, 0.75, { gam: !!gam, slide: true }));
			t += d;
		}
		for (let x = 9.4; x < t; x += 1.6) S.hit(x, "jalra", 0.12);
		const g = new Grid(t + 0.6, 16).add(8, 0.32).add(2, 0.3, 0.26);
		const K1 = "S - R - G - - - P - G - R - S -", K2 = "R - G - P - D - P - G - R - G -";
		const K3 = "P - D - S' - - - D - P - G - P -", K4 = "G - R - S - .D - S - - - - - - -";
		const T1 = "G P D S' D P G P D S' - - S' - - -";
		let u = 0;
		for (const str of [K1, K2, K3, K4, K1, K2, K3, K4, T1, T1]) u = S.line(g, u, str, "nada", 0.8, { oct: 1, gam: true });
		// thavil: a stroke pattern per beat (four strokes a beat), the cycle's first beat always the strongest
		const BEATS = ["D.kt", "D.k.", "Dtk.", "D.tk", "k.D.", "DkDk", "D.kk"];
		const R = lcg(5);
		const cycle = (dense) => {
			let s = "Kkkt";
			for (let b = 1; b < 8; b++) s += dense ? (b % 2 ? "DkDk" : "Dtkk") : BEATS[Math.floor(R() * BEATS.length)];
			return s;
		};
		const th = { D: [["thavilDhi", 0.6]], t: [["thavilTa", 0.4]], k: [["thavilStick", 0.42]], K: [["thavilStick", 0.65], ["thavilDhi", 0.6]] };
		for (let c = 0; c < 10; c++) S.rhythm(g, c, c + 1, cycle(c >= 8), th);
		S.rhythm(g, 0, 8, "J.j.J.j.J.j.J.j.J.j.J.j.J.j.J.j.", { J: [["jalra", 0.2]], j: [["jalraC", 0.14]] });
		S.rhythm(g, 8, 10, "JjJjJjJjJjJjJjJjJjJjJjJjJjJjJjJj", { J: [["jalra", 0.22]], j: [["jalraC", 0.16]] });
		S.ringGrid(g, 0, 10, 2, 0.16);
		// Govinda, Govinda
		S.chant(g, 8, 10, [["o", 7, 0, 1], ["i", 7, 1, 1], ["a", 9, 2, 2], ["o", 7, 8, 1], ["i", 7, 9, 1], ["a", 9, 10, 2]], 0.9);
		const c = finale(S, g.end, 233);
		S.chant({ upb: 16, time: (x) => g.end + 0.4 + x * 0.3 }, 0, 1, [["o", 7, 0, 1], ["i", 7, 1, 1], ["a", 9, 2, 3], ["o", 7, 6, 1], ["i", 7, 7, 1], ["a", 9, 8, 3]], 0.85);
		return { g, cues: { ...OPEN, aarti: [9, g.end], song: [g.t0, g.end], ...c }, circleUnits: 8 };
	},
};

const SCHEDULES = {};
// The composed aarti for a shrine: its events, length, cues, and the clocks the visuals follow.
export function aartiSchedule(key) {
	if (SCHEDULES[key]) return SCHEDULES[key];
	const S = new Score(key.length * 13 + 1);
	const { g, cues, circleUnits } = PIECES[key](S);
	const per = circleUnits || g.upb, free = 3.2;
	const a0 = cues.aarti[0] + 0.6, c0 = (g.t0 - a0) / free, bars = g.bars.length * g.upb / per;
	const last = g.bars[g.bars.length - 1].u * per;
	const circle = (t) => {
		if (t < a0) return 0;
		if (t < g.t0) return (t - a0) / free;
		if (t < g.end) return c0 + g.units(t) / per;
		return c0 + bars + (t - g.end) / last;
	};
	const rings = S.rings;
	const ring = (t) => {
		for (const r of rings) if (t >= r.t0 && t < r.t1) return r.g ? r.g.units(t) * r.per - r.x0 : (t - r.t0) / r.step;
		return -1;
	};
	return (SCHEDULES[key] = { key, events: S.sorted(), duration: cues.end, cues, circle, ring, upb: g.upb });
}

// ---------- quiet beds for darshan ----------
const AMBIENT = {
	kedarnath(S, t0, R) {
		if (R() < 0.22) S.om(t0 + R() * 2, 6 + R() * 2, 0.32);
		if (R() < 0.3) for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) S.hit(t0 + R() * 0.5 + k * 1.3, "doorBell", 0.18, 1, R() - 0.5);
		if (R() < 0.06) S.hit(t0 + R() * 3, "ghanta", 0.35);
		if (R() < 0.04) S.damaru(t0 + R() * 2, 1, 0.25);
	},
	bhimashankar(S, t0, R) {
		if (R() < 0.35) for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) S.hit(t0 + R() * 0.5 + k * 1.2, "doorBell", 0.18, 1, R() - 0.5);
		if (R() < 0.1) S.hit(t0 + R() * 3, "ghanta", 0.38);
		if (R() < 0.12) S.om(t0 + R(), 5.5, 0.3);
		else if (R() < 0.12) hum(S, t0, "S S R G R S", "oaaiaa", 0.32); // Om Namah Shivaya
	},
	tirupati(S, t0, R) {
		[["tamPa", 0], ["tamSa", 1], ["tamSa", 2], ["tamSaL", 3]].forEach(([n, k]) => S.hit(t0 + k * 1, n, 0.22, 1, (k - 1.5) * 0.15));
		if (R() < 0.3) S.hit(t0 + R() * 3, "doorBell", 0.15, 1, R() - 0.5);
		if (R() < 0.08) {
			const ph = [[[4, 0.9, 1], [2, 0.3], [0, 1.2]], [[7, 0.5], [9, 1.0, 1], [7, 0.4], [4, 1.0, 1]], [[12, 1.2], [9, 0.5, 1], [7, 1.0]]][Math.floor(R() * 3)];
			let t = t0 + 0.3;
			for (const [s, d, gam] of ph) {
				const f = hz(s + 12), at = t;
				S.at(at, (T, P) => P.v.nada && P.v.nada.note(T, f, d, 0.3, { gam: !!gam, slide: true }));
				t += d;
			}
		}
	},
	badrinath(S, t0, R) {
		if (R() < 0.3) for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) S.hit(t0 + R() * 0.5 + k * 1.3, "doorBell", 0.17, 1, R() - 0.5);
		if (R() < 0.05) S.hit(t0 + R() * 3, "ghanta", 0.32);
		if (R() < 0.12) hum(S, t0, "S R G M G R S", "oaoaaaa", 0.3); // Om Namo Narayanaya
	},
};
// a soft group chant across one block
function hum(S, t0, str, vw, vel) {
	const ns = score(str), u = 3.6 / ns.len;
	ns.forEach((n, i) => {
		const f = hz(n.s - 12), d = n.len * u;
		S.at(t0 + 0.2 + n.at * u, (T, P) => P.v.chorus && P.v.chorus.note(T, f, d, vel, { v: vw[i % vw.length] }));
	});
}

// ---------- programs: one piece playing on a context ----------
function makeProgram(e, dest, key, kind, piece) {
	const c = e.ctx, offline = typeof c.startRendering === "function", t = offline ? 0 : c.currentTime;
	const P = { e, ctx: c, key, kind, stop: [], v: {}, i: 0, block: 0, base: t, t, seed: 1 + key.length * 31 };
	P.bus = G(c, 0);
	P.bus.connect(dest);
	const level = kind === "ambient" ? { badrinath: 0.75, tirupati: 0.42 }[key] || 0.55 : 0.5;
	if (offline || kind === "fx") P.bus.gain.value = level;
	else P.bus.gain.setTargetAtTime(level, t, 0.5);
	P.out = G(c, 1);
	P.out.connect(P.bus);
	const cv = c.createConvolver();
	cv.buffer = e.ir(key);
	chain(P.out, cv, G(c, (ROOM[key] || ROOM.kedarnath)[2]), P.bus);
	if (kind === "fx") return P;
	const south = key === "tirupati";
	if (MUTE.has("drone")) P.muted = true;
	else if (south) reedDrone(P, [[261.63, 0.5], [392, 0.28]], kind === "ambient" ? 0.02 : 0.03, 2200, true);
	else reedDrone(P, [[130.81, 0.5], [196, 0.32], [261.63, 0.22]], kind === "ambient" ? 0.06 : 0.075, 1300, false);
	if (key === "kedarnath" && !MUTE.has("bed")) noiseBed(P, "bandpass", 450, 0.6, 0.05, 250);
	if (key === "badrinath" && !MUTE.has("bed")) noiseBed(P, "lowpass", 650, 0.5, 0.06, 150);
	if (south) P.v.nada = new Nadaswaram(P, kind === "ambient" ? 0.5 : 0.32);
	else if (kind === "aarti") {
		P.v.lead = new Reed(P, 0.38);
		P.v.solo = new Singer(P, 1, 0.95);
	}
	if (kind === "aarti" || key === "bhimashankar" || key === "badrinath") P.v.chorus = new Singer(P, 3, 0.85);
	if (kind === "aarti") {
		P.events = piece.events;
		P.duration = piece.duration;
	} else P.gen = AMBIENT[key];
	return P;
}
// Play every event of P that falls before ctx time `until`; anything already past is skipped.
function pump(P, until) {
	const c = P.ctx, t = typeof c.startRendering === "function" ? 0 : c.currentTime;
	if (P.events) {
		while (P.i < P.events.length || P.loop) {
			if (P.i >= P.events.length) {
				P.i = 0;
				P.base += P.duration;
			}
			const ev = P.events[P.i], T = P.base + ev.t;
			if (T >= until) break;
			P.i++;
			if (T >= t - 0.03) ev.fn(Math.max(T, t), P);
		}
	} else if (P.gen) {
		while (P.base + P.block * BLOCK < until) {
			const S = new Score(P.seed + P.block * 7919);
			P.gen(S, P.block * BLOCK, lcg(P.seed + P.block * 104729));
			for (const ev of S.sorted()) {
				const T = P.base + ev.t;
				if (T >= t - 0.03) ev.fn(Math.max(T, t), P);
			}
			P.block++;
		}
	}
}
function release(P, fade) {
	const c = P.ctx, t = c.currentTime, g = P.bus.gain;
	g.cancelScheduledValues(t);
	g.setValueAtTime(g.value, t);
	g.setTargetAtTime(0, t, Math.max(0.05, fade / 4));
	setTimeout(() => {
		for (const n of P.stop) try {
			n.stop();
		} catch (e) { /* already stopped */ }
		P.bus.disconnect();
	}, fade * 1000 + 400);
}
function masterChain(c, dest) {
	const out = G(c, 1), comp = c.createDynamicsCompressor();
	comp.threshold.value = -12;
	comp.knee.value = 8;
	comp.ratio.value = 3.5;
	comp.attack.value = 0.005;
	comp.release.value = 0.25;
	chain(out, comp, dest);
	return out;
}

export class Music {
	constructor(audio) {
		this.audio = audio;
		this.enabled = true;
		this.cur = null;
		this.live = null;
		this.n = 0;
		this.timer = 0;
		this.lastKey = "kedarnath";
		if (audio && audio.onToggle) audio.onToggle(() => this.sync());
	}
	get playing() {
		return this.cur ? this.cur.kind : null;
	}
	get audible() {
		return this.enabled && !!this.audio && this.audio.on && !!this.audio.ctx;
	}
	ambient(key) {
		if (this.cur && this.cur.kind === "ambient" && this.cur.key === key) return;
		this.begin({ kind: "ambient", key });
	}
	aarti(key, { loop = false } = {}) {
		const piece = aartiSchedule(key);
		let resolve;
		const done = new Promise((r) => (resolve = r));
		const cur = this.begin({ kind: "aarti", key, piece, loop, resolve });
		return { id: cur.id, key, duration: piece.duration, cues: piece.cues, circle: piece.circle, ring: piece.ring, upb: piece.upb, done };
	}
	position(id) {
		const c = this.cur;
		if (!c || c.kind !== "aarti" || (id !== undefined && c.id !== id)) return -1;
		const p = now() - c.t0;
		return c.loop ? p % c.piece.duration : p;
	}
	stinger(kind = "bells") {
		if (!this.audible) return;
		this.ready();
		let P = this.live;
		if (!P) {
			// a short-lived bus with the shrine's reverb, let go once the sound has died away
			const fx = (P = makeProgram(this.e, this.out, this.lastKey, "fx"));
			setTimeout(() => fx.bus.disconnect(), 9000);
		}
		const T = this.audio.ctx.currentTime + 0.03, S = new Score(7);
		if (kind === "conch") S.conch(0, 3.8, 196, 0.9);
		else if (kind === "bell") S.hit(0, "ghanta", 0.8);
		else {
			for (let k = 0; k < 3; k++) S.hit(k * 1.1, "ghanta", 0.8 - k * 0.12);
			S.peal(0.1, 10, 0.3);
			S.ring(0, 2.4, 0.12, 0.18);
		}
		for (const ev of S.sorted()) ev.fn(T + ev.t, P);
	}
	stop(fade = 1.5) {
		this.finish(false);
		this.cur = null;
		this.drop(fade);
		clearInterval(this.timer);
		this.timer = 0;
	}
	setEnabled(v) {
		this.enabled = !!v;
		this.sync();
	}
	begin(spec) {
		this.finish(false);
		this.drop(1.5);
		this.cur = Object.assign(spec, { id: ++this.n, t0: now() });
		this.lastKey = spec.key;
		this.sync();
		if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
		return this.cur;
	}
	finish(ok) {
		const c = this.cur;
		if (c && c.resolve) {
			c.resolve(ok);
			c.resolve = null;
		}
	}
	ready() {
		const ctx = this.audio.ctx;
		if (!this.e || this.e.ctx !== ctx) {
			const e = (this.e = new Engine(ctx));
			this.out = masterChain(ctx, this.audio.master);
			// build the one-shot sounds one at a time in spare moments, so the first drum stroke never stalls a frame
			const names = Object.keys(BUFS);
			const next = () => {
				const n = names.shift();
				if (!n || this.e !== e) return;
				e.buf(n);
				setTimeout(next, 30);
			};
			setTimeout(next, 30);
		}
		this.out.gain.setTargetAtTime(this.enabled ? 1 : 0, ctx.currentTime, 0.2);
	}
	// start or stop the sounding program to match the logical one and the toggles
	sync() {
		if (this.audible && this.cur && !this.live) {
			this.ready();
			const c = this.cur, ctx = this.audio.ctx;
			const P = makeProgram(this.e, this.out, c.key, c.kind, c.piece);
			let pos = now() - c.t0;
			if (c.loop && P.duration) pos %= P.duration;
			P.loop = !!c.loop;
			P.base = ctx.currentTime + 0.05 - pos;
			if (P.events) while (P.i < P.events.length && P.events[P.i].t < pos) P.i++;
			else P.block = Math.max(0, Math.floor(pos / BLOCK));
			this.live = P;
			if (this.audio.duck) this.audio.duck(0);
			this.tick();
		} else if (!this.audible && this.live) this.drop(0.6);
	}
	drop(fade) {
		const P = this.live;
		if (!P) return;
		this.live = null;
		release(P, fade);
		if (this.audio.duck) this.audio.duck(1);
	}
	tick() {
		const c = this.cur;
		if (!c) return;
		if (c.kind === "aarti" && !c.loop && now() - c.t0 >= c.piece.duration) {
			const key = c.key;
			this.finish(true);
			this.begin({ kind: "ambient", key });
			return;
		}
		if (this.live) pump(this.live, this.live.ctx.currentTime + (document.hidden ? 1.5 : 0.3));
	}
	// Render a piece offline (for tests): resolves to an AudioBuffer. mute: names to leave out (see MUTE).
	static render(key, kind = "aarti", seconds = 10, rate = 44100, mute = []) {
		MUTE.clear();
		for (const m of mute) MUTE.add(m);
		const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
		const ctx = new AC(2, Math.ceil(seconds * rate), rate);
		const e = new Engine(ctx), master = G(ctx, 0.8);
		master.connect(ctx.destination);
		const P = makeProgram(e, masterChain(ctx, master), key, kind, kind === "aarti" ? aartiSchedule(key) : null);
		pump(P, seconds);
		for (const n of P.stop) n.stop(seconds);
		MUTE.clear();
		return ctx.startRendering();
	}
}
