// Procedural temple sounds: a soft drone and a bell at each darshan. Muted until the visitor turns it on.
// Also shared with music.js: onToggle(fn) hears every on/off change, and duck(v) lowers the drone (0..1)
// while a shrine's own music plays.
export class Audio {
	constructor() {
		this.on = false;
		this.ctx = null;
		this.listeners = [];
		this.duckLevel = 1;
	}
	ensure() {
		if (this.ctx) return;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0;
		this.master.connect(this.ctx.destination);
		// tanpura-like drone on Sa and Pa
		const lp = this.ctx.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 900;
		lp.connect(this.master);
		this.drone = this.ctx.createGain();
		this.drone.gain.value = 0.035 * this.duckLevel;
		this.drone.connect(lp);
		for (const [f, d] of [[130.8, 0], [131.2, 0], [196.0, 0.3], [261.6, 0.6]]) {
			const o = this.ctx.createOscillator();
			o.type = "sawtooth";
			o.frequency.value = f;
			const g = this.ctx.createGain();
			g.gain.value = 0.25;
			const lfo = this.ctx.createOscillator();
			lfo.frequency.value = 0.11 + d * 0.07;
			const lg = this.ctx.createGain();
			lg.gain.value = 0.12;
			lfo.connect(lg);
			lg.connect(g.gain);
			o.connect(g);
			g.connect(this.drone);
			o.start();
			lfo.start();
		}
	}
	toggle(v) {
		this.on = v === undefined ? !this.on : v;
		if (this.on) {
			this.ensure();
			if (!this.ctx) return this.on = false;
			this.ctx.resume();
		}
		if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.4);
		for (const fn of this.listeners) fn(this.on);
		return this.on;
	}
	// fn(on) runs after every toggle; returns a function that removes it
	onToggle(fn) {
		this.listeners.push(fn);
		return () => (this.listeners = this.listeners.filter((f) => f !== fn));
	}
	// v: 1 is the usual drone, 0 silences it
	duck(v, tc = 0.8) {
		this.duckLevel = v;
		if (this.drone) this.drone.gain.setTargetAtTime(0.035 * v, this.ctx.currentTime, tc);
	}
	bell(times = 3) {
		if (!this.on || !this.ctx) return;
		const now = this.ctx.currentTime;
		for (let k = 0; k < times; k++) {
			const t0 = now + k * 1.6;
			const f0 = 392;
			for (const [m, a, d] of [[1, 0.5, 4.5], [2.76, 0.25, 2.6], [5.4, 0.14, 1.4], [8.93, 0.07, 0.8], [0.5, 0.18, 5]]) {
				const o = this.ctx.createOscillator();
				o.type = "sine";
				o.frequency.value = f0 * m;
				const g = this.ctx.createGain();
				g.gain.setValueAtTime(0, t0);
				g.gain.linearRampToValueAtTime(a * 0.4, t0 + 0.005);
				g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
				o.connect(g);
				g.connect(this.master);
				o.start(t0);
				o.stop(t0 + d + 0.1);
			}
		}
	}
}
