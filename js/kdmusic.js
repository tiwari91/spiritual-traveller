// Krishna Das at the aarti: each shrine's chant played from his official YouTube channel (@KrishnaDasMusic) in a
// small player card in the corner, with the credit beside it. Nothing of his is downloaded or bundled: the track
// streams through YouTube's IFrame Player API (youtube-nocookie.com), loaded only after the sound has been turned on.
//
//   const kd = new KDMusic({ audio, music, onNotice });  // audio: audio.js (follows its on/off toggle); music: music.js
//   kd.bind(button)      // a chip that switches "Aarti music: Krishna Das / Temple (synth)"; its first <span> gets the label
//   kd.play(key)         // at the darshan: the shrine's track, or false if this shrine has none / the mode is synth.
//                        //   With the sound off it waits and starts when the sound is turned on.
//   kd.stop(fade = 1.2)  // when the darshan ends: fade out, pause, hide the card, hand back to the synth music
//   kd.mode              // "kd" | "synth" (kept in store "aartiMusic"; default "kd");  kd.setMode(m), kd.toggleMode()
//   kd.state             // "idle" | "loading" | "playing" | "paused" | "failed"
//   kd.key               // the shrine asked for, or null;  KDMusic.TRACKS: { key: { id, title } }
//   onNotice(text)       // optional: a line for the toast when the embed fails and the synth music takes over
//
// The synthesised music.aarti() keeps running underneath and keeps its clock, so the 3D aarti stays in step with it
// whatever the track's length. The synth is muted (music.setEnabled(false)) and the drone ducked only once the video is
// actually playing; if the API or the video fails to load (offline, blocked, an ad-blocker), the synth simply carries
// on at the right bar. The track keeps playing as the darshan bed after the aarti, until stop() or its end.
import { store } from "./util.js";

export const KD_SITE = "https://www.krishnadas.com";
// All from the official channel @KrishnaDasMusic (channel id UCtzvMbKEud7MqkIVdFjfHXQ); oEmbed 200, playableInEmbed true.
export const TRACKS = {
	bhimashankar: { id: "PTc8X37oJBE", title: "Om Namah Shivaya (Live! Songs With Lyrics)" },
	tirupati: { id: "e5jylnA2KdQ", title: "Govinda Hare (NYC Kirtan, 2023)" },
	kedarnath: { id: "sn1otVlvVrM", title: "Jai Shiva Omkara" },
	badrinath: { id: "a3XaLpZSW14", title: "Narayana / For Your Love" },
	// Shirdi: Krishna Das has no chant for Sai Baba, so the Samadhi Mandir's own (synthesised) aarti plays there
	// the Kailash journey: Shiva at every stop, with the same two chants
	omparvat: { id: "PTc8X37oJBE", title: "Om Namah Shivaya (Live! Songs With Lyrics)" },
	mansarovar: { id: "sn1otVlvVrM", title: "Jai Shiva Omkara" },
	yamdwar: { id: "PTc8X37oJBE", title: "Om Namah Shivaya (Live! Songs With Lyrics)" },
	dirapuk: { id: "sn1otVlvVrM", title: "Jai Shiva Omkara" },
	dolmala: { id: "PTc8X37oJBE", title: "Om Namah Shivaya (Live! Songs With Lyrics)" },
	darchen: { id: "sn1otVlvVrM", title: "Jai Shiva Omkara" },
};
const watchUrl = (id) => "https://www.youtube.com/watch?v=" + id;
const API_TIMEOUT = 12000; // the API script and the player's onReady
const TAP_HINT = 6000; // if the browser holds autoplay back, ask for a tap on the video
const VOL = 80;

let apiPromise = null;
function loadAPI() {
	if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
	if (apiPromise) return apiPromise;
	apiPromise = new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), API_TIMEOUT);
		const prev = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			clearTimeout(timer);
			if (typeof prev === "function") prev();
			resolve(window.YT);
		};
		const s = document.createElement("script");
		s.src = "https://www.youtube.com/iframe_api";
		s.async = true;
		s.onerror = () => {
			clearTimeout(timer);
			reject(new Error("blocked"));
		};
		document.head.appendChild(s);
	}).catch((e) => {
		apiPromise = null; // try again next time
		throw e;
	});
	return apiPromise;
}

export class KDMusic {
	constructor({ audio, music, onNotice = null, parent = document.body }) {
		Object.assign(this, { audio, music, onNotice, parent });
		this.mode = store.get("aartiMusic", "kd") === "synth" ? "synth" : "kd";
		this.key = null;
		this.state = "idle";
		this.player = null;
		this.ready = false;
		this.loaded = null; // the key whose video is in the player
		this.muting = false; // true while the synth is muted for us
		this.buttons = [];
		this.token = 0;
		// YouTube's terms do not allow its audio with the video hidden, so the track only plays while the
		// card is expanded; folded, it is a small pill and the temple's own music plays instead
		this.expanded = false;
		if (audio && audio.onToggle) audio.onToggle((on) => this.onSound(on));
	}
	static get TRACKS() {
		return TRACKS;
	}
	// ---------- the setting ----------
	bind(btn) {
		if (!btn) return;
		this.buttons.push(btn);
		btn.addEventListener("click", () => this.toggleMode());
		this.paint();
	}
	paint() {
		for (const b of this.buttons) {
			const s = b.querySelector("span");
			if (s) s.textContent = this.mode === "kd" ? "Krishna Das" : "Temple";
			b.classList.toggle("kd-on", this.mode === "kd");
			b.setAttribute("aria-pressed", String(this.mode === "kd"));
			b.title = `Aarti music: ${this.mode === "kd" ? "Krishna Das" : "Temple (synth)"}. Click for ${this.mode === "kd" ? "the temple's own synthesised music" : "Krishna Das"}`;
		}
	}
	setMode(m) {
		m = m === "synth" ? "synth" : "kd";
		if (m === this.mode) return;
		this.mode = m;
		store.set("aartiMusic", m);
		this.paint();
		if (m === "synth") this.halt(0.8);
		else if (this.key) this.start();
		if (this.onNotice) this.onNotice(m === "kd" ? "Aarti music: Krishna Das, from his official YouTube channel" : "Aarti music: the temple's own (synthesised)");
	}
	toggleMode() {
		this.setMode(this.mode === "kd" ? "synth" : "kd");
	}
	// ---------- playing ----------
	play(key) {
		if (key !== this.key || this.state !== "paused") this.fresh = true; // a new darshan starts the chant from the top
		this.key = key;
		if (this.mode !== "kd" || !TRACKS[key]) {
			this.halt(0.8);
			// say why, a moment after the darshan's own greeting
			if (this.mode === "kd" && this.audio.on && this.onNotice) setTimeout(() => this.key === key && this.onNotice("No Krishna Das track for this shrine; the temple's own aarti plays"), 2800);
			return false;
		}
		this.start();
		return true;
	}
	stop(fade = 1.2) {
		this.key = null;
		this.halt(fade);
	}
	get playing() {
		return this.state === "playing" ? this.loaded : null;
	}
	onSound(on) {
		if (on) {
			// the speaker button is a gesture: fetch the API now so the first aarti starts at once
			if (this.mode === "kd") loadAPI().catch(() => {});
			if (this.key && this.mode === "kd" && this.state !== "playing" && this.state !== "loading") this.start();
		} else if (this.state !== "idle" && this.state !== "failed") this.halt(0.5, true);
	}
	async start() {
		const key = this.key, t = TRACKS[key];
		if (!t || this.mode !== "kd" || !this.audio.on) return;
		if (!this.expanded) {
			this.showPill(t);
			return;
		}
		if (this.state === "playing" && this.loaded === key) return;
		if (this.state === "loading" && this.want === key) return;
		const my = ++this.token;
		this.want = key;
		this.state = "loading";
		clearTimeout(this.hintTimer);
		this.showCard(t, false);
		try {
			const YT = await loadAPI();
			if (my !== this.token) return;
			await this.ensurePlayer(YT, t.id);
			if (my !== this.token) return;
			this.fadeTo(0, 0);
			if (this.loaded !== key) {
				this.loaded = key;
				this.player.loadVideoById({ videoId: t.id, startSeconds: 0 });
			} else {
				if (this.fresh) this.player.seekTo(0, true);
				this.player.playVideo();
			}
			this.fresh = false;
			this.hintTimer = setTimeout(() => {
				if (my === this.token && this.state === "loading") this.card.classList.add("kd-tap");
			}, TAP_HINT);
		} catch (e) {
			if (my === this.token) this.fail();
		}
	}
	ensurePlayer(YT, firstId) {
		if (this.ready) return Promise.resolve();
		if (this.readyP) return this.readyP;
		this.readyP = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("player timeout")), API_TIMEOUT);
			this.loaded = null;
			this.player = new YT.Player(this.slot, {
				host: "https://www.youtube-nocookie.com",
				videoId: firstId,
				width: "100%",
				height: "100%",
				playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
				events: {
					onReady: () => {
						clearTimeout(timer);
						this.ready = true;
						this.loaded = Object.keys(TRACKS).find((k) => TRACKS[k].id === firstId) || null;
						resolve();
					},
					onStateChange: (e) => this.onState(e.data),
					onError: () => {
						clearTimeout(timer);
						if (!this.ready) reject(new Error("player error"));
						else this.fail();
					},
				},
			});
		}).finally(() => (this.readyP = null));
		return this.readyP;
	}
	onState(s) {
		const YT = window.YT;
		if (!YT) return;
		if (s === YT.PlayerState.PLAYING) {
			if (!this.key || this.mode !== "kd" || !this.audio.on || (this.state !== "loading" && this.state !== "playing")) {
				// not wanted any more (the darshan ended or the sound went off while it loaded): never play unseen
				try { this.player.pauseVideo(); } catch (e) { /* gone */ }
				return;
			}
			clearTimeout(this.hintTimer);
			this.card.classList.remove("kd-tap");
			this.state = "playing";
			this.showCard(TRACKS[this.loaded], true);
			this.fadeTo(VOL, 1.5);
			this.muteSynth(true);
		} else if (s === YT.PlayerState.ENDED) {
			if (this.state !== "playing") return;
			// the chant is over: the temple's own ambient bed comes back
			this.state = "idle";
			this.hideCard();
			this.muteSynth(false);
		}
	}
	// pause: true keeps the key, so turning the sound on again picks the track up where it stopped
	halt(fade = 1.2, pause = false) {
		++this.token;
		clearTimeout(this.hintTimer);
		const was = this.state;
		this.state = pause ? "paused" : "idle";
		this.muteSynth(false);
		if (this.player && this.ready && (was === "playing" || was === "loading" || was === "paused")) {
			const p = this.player;
			this.fadeTo(0, fade, () => {
				try {
					p.pauseVideo();
				} catch (e) {
					/* gone */
				}
			});
		}
		this.hideCard();
	}
	fail() {
		++this.token;
		clearTimeout(this.hintTimer);
		const was = this.state;
		this.state = "failed";
		this.muteSynth(false);
		this.hideCard();
		if (was !== "failed" && this.onNotice) this.onNotice("Krishna Das's track could not load here, so the temple's own music plays");
	}
	muteSynth(on) {
		if (on === this.muting) return;
		this.muting = on;
		if (on) {
			if (this.music) this.music.setEnabled(false);
			if (this.audio.duck) this.audio.duck(0.25, 1);
		} else {
			if (this.audio.duck) this.audio.duck(1, 0.8);
			if (this.music) this.music.setEnabled(true);
		}
	}
	fadeTo(v, secs, then) {
		clearInterval(this.fadeTimer);
		const p = this.player;
		if (!p || !this.ready) return then && then();
		let from = this.vol === undefined ? VOL : this.vol;
		if (!secs) {
			this.vol = v;
			try { p.setVolume(v); } catch (e) { /* not ready */ }
			return then && then();
		}
		const t0 = performance.now();
		this.fadeTimer = setInterval(() => {
			const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
			this.vol = from + (v - from) * k;
			try { p.setVolume(Math.round(this.vol)); } catch (e) { /* gone */ }
			if (k >= 1) {
				clearInterval(this.fadeTimer);
				if (then) then();
			}
		}, 50);
	}
	// ---------- the card ----------
	get card() {
		if (this._card) return this._card;
		const c = (this._card = document.createElement("aside"));
		c.className = "kd-card panel";
		c.setAttribute("aria-label", "Aarti music");
		c.innerHTML = `<div class="kd-video"><div class="kd-slot"></div></div>
			<div class="kd-credit"><span class="kd-label">Music:</span> <a class="kd-artist" href="${KD_SITE}" target="_blank" rel="noopener">Krishna Das</a>, <span class="kd-title"></span> (<a class="kd-link" target="_blank" rel="noopener">official video</a>)<span class="kd-hint"> · tap the video to play</span></div>
			<button class="kd-close" type="button" aria-label="Fold away Krishna Das and play the temple music" title="Fold away, and play the temple music">–</button>
			<button class="kd-pill" type="button" aria-label="Listen to Krishna Das"><span class="kd-note">♪</span> <span><b>Krishna Das</b> <span class="kd-pill-title"></span></span><span class="kd-open">Listen ▸</span></button>`;
		this.slot = c.querySelector(".kd-slot");
		c.querySelector(".kd-close").addEventListener("click", () => {
			this.expanded = false;
			const k = this.key;
			this.halt(0.6);
			this.key = k;
			if (TRACKS[k]) this.showPill(TRACKS[k]);
		});
		c.querySelector(".kd-pill").addEventListener("click", () => {
			this.expanded = true;
			this.start();
		});
		this.parent.appendChild(c);
		return c;
	}
	showCard(t, playing) {
		const c = this.card;
		c.querySelector(".kd-title").textContent = `‘${t.title}’`;
		const a = c.querySelector(".kd-link");
		a.href = watchUrl(t.id);
		c.classList.toggle("kd-playing", playing);
		c.classList.remove("kd-folded");
		c.classList.add("show");
	}
	showPill(t) {
		const c = this.card;
		c.querySelector(".kd-pill-title").textContent = `‘${t.title}’`;
		c.classList.remove("kd-playing", "kd-tap");
		c.classList.add("show", "kd-folded");
	}
	hideCard() {
		if (!this._card) return;
		this._card.classList.remove("show", "kd-tap", "kd-playing", "kd-folded");
	}
}
