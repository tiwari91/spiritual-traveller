// In-page monitor for tests/check.mjs: every frame of the journey it checks that the traveller is drawn, in
// the frame, standing on something (not floating or sunk), never jumping, clear of the other pilgrims, and that
// the camera is above the ground with nothing solid between it and the traveller. It can also pause the journey
// at the moments worth a screenshot (getting on and off, leaving a temple, on the train), for check.mjs to take.
// Loaded with page.addScriptTag({ type: "module", url: "tests/monitor.js" }); it waits for window.app.
import * as THREE from "three";
import { surfaceAt } from "../js/traffic.js";
import { crowdFigure } from "../js/pilgrim.js";

const app = window.app;
const ray = new THREE.Raycaster(), dir = new THREE.Vector3(), head = new THREE.Vector3(), pos = new THREE.Vector3(), prev = new THREE.Vector3();
const crowdMat = crowdFigure(1).material;
let landCrowd = null;
const mon = (window.__mon = { on: false, issues: [], counts: {}, frames: 0, want: null, shots: [], pauseAt: true, seen: new Set() });

function crowdOf() {
	// the pilgrims standing at each temple, as world positions
	if (landCrowd) return landCrowd;
	landCrowd = [];
	for (const l of app.landmarks) l.root.traverse((o) => o.isMesh && o.material === crowdMat && landCrowd.push(o));
	return landCrowd;
}
function issue(kind, info) {
	mon.counts[kind] = (mon.counts[kind] || 0) + 1;
	if (mon.issues.length < 4000) mon.issues.push(Object.assign({ kind, leg: app.leg, s: +app.s.toFixed(2), mode: app.mode, transport: app.transport }, info));
	// the first of each kind on each leg is worth a picture
	const key = kind + "|" + app.leg + "|" + app.transport;
	if (mon.pauseAt && !mon.seen.has(key)) {
		mon.seen.add(key);
		want(`issue-${kind}`);
	}
}
// pause the journey and ask check.mjs for a screenshot named `name`
function want(name) {
	if (mon.want) return;
	mon.want = name;
	mon.wasPlaying = app.playing;
	app.playing = false;
}
mon.resume = () => {
	mon.want = null;
	app.playing = true;
};
mon.want_ = want;

let lastT = performance.now(), lastEp = null, lastStep = -1, lastLeg = -1, lastOnTrain = false, legT = 0, rideShot = false, leftShot = false, lastPos = null;
function frame(ts) {
	requestAnimationFrame(frame);
	if (!mon.on || app.state !== "travel" || !app.playing) {
		lastPos = null;
		lastT = ts;
		return;
	}
	mon.frames++;
	const now = ts, dt = Math.min(0.1, (now - lastT) / 1000);
	lastT = now;
	const J = app.journey, st = J.status(), tr = app.traveller.group, cam = app.camera;
	tr.getWorldPosition(pos);
	const sc = tr.scale.x;
	head.copy(pos).y += 0.45 * sc;
	// ---------- the moments to photograph ----------
	if (app.leg !== lastLeg) {
		lastLeg = app.leg;
		legT = 0;
		rideShot = leftShot = false;
	}
	legT += 1;
	const c = app.route.chapters[app.leg], w = app.roads.legWalk[app.leg];
	if (app.playing && !mon.want) {
		if (st.ep !== lastEp && st.ep) want(`ep-${st.ep}-start`);
		else if (st.ep && st.step !== lastStep && J.ep && st.step === Math.floor(J.ep.steps.length * 0.55)) want(`ep-${st.ep}-mid`);
		else if (!st.ep && lastEp) want(`ep-${lastEp}-end`);
		else if (legT >= 40 && !leftShot) (leftShot = true), want(app.leg ? "leaving-temple" : "leaving-pune");
		else if (st.onTrain && !st.ep && !st.halt && !rideShot && J.rake && J.rake.v > 3) (rideShot = true), want("train-ride");
		else if (st.halt && !lastOnTrain) want("train-halt");
	}
	lastOnTrain = st.halt;
	lastEp = st.ep;
	lastStep = st.step;
	// ---------- checks ----------
	if (!tr.visible) {
		// inside the coach with the door shut is the only time the traveller may be out of sight
		if (!(st.ep && /train/.test(st.ep))) issue("hidden", { ep: st.ep, step: st.step });
	} else {
		head.project(cam);
		if (head.z > 1 || Math.abs(head.x) > 0.97 || Math.abs(head.y) > 0.97) issue("offscreen", { ep: st.ep, step: st.step, ndc: [+head.x.toFixed(2), +head.y.toFixed(2)] });
		head.copy(pos).y += 0.45 * sc;
	}
	// a jump: more than a stride in one frame, except while riding along
	const riding = (st.inside && !st.ep) || (st.onTrain && !st.ep);
	if (lastPos && !riding && !lastPos.riding) {
		const d = Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y, pos.z - lastPos.z);
		// a brisk walk at this speed, with room to spare: anything more is a jump
		const most = 0.12 + 0.6 * [1, 2, 4, 8][app.speed] * dt;
		if (d > most) issue("jump", { d: +d.toFixed(2), most: +most.toFixed(2), ep: st.ep, step: st.step, was: lastPos.ep });
	}
	lastPos = { x: pos.x, y: pos.y, z: pos.z, riding, ep: st.ep };
	// standing on the road, the path or the ground (stations, bridges and temple floors have their own levels)
	if (tr.visible && !st.inside && !st.onTrain && !(st.ep && /train/.test(st.ep)) && mon.frames % 2 === 0) {
		const nearStation = app.roads.stations.some((q) => Math.hypot(q.x - pos.x, q.z - pos.z) < 30);
		const nearShrine = app.landmarks.some((l) => Math.hypot(l.pos.x - pos.x, l.pos.z - pos.z) < 7);
		const r = app.roads.road(app.s, 0, {});
		if (!nearStation && !nearShrine && !(r && r.bridge > 0.01)) {
			const g = Math.max(app.world.height(pos.x, pos.z), surfaceAt(app.roads, pos.x, pos.z) ?? -1e9, app.roads.deckAt(pos.x, pos.z));
			const dy = pos.y - g;
			if (dy > 0.12) issue("floating", { dy: +dy.toFixed(3), ep: st.ep, step: st.step });
			else if (dy < -0.1) issue("sunk", { dy: +dy.toFixed(3), ep: st.ep, step: st.step });
		}
	}
	// clear of the other pilgrims: the platform crowd, the passengers and the crowd at each temple
	if (tr.visible && mon.frames % 3 === 0) {
		let md = Infinity;
		const v = new THREE.Vector3();
		for (const m of [...J.crowd, ...J.walkers.map((x) => x.group), ...crowdOf()]) {
			if (!m.visible || (m.parent && !m.parent.visible)) continue;
			m.getWorldPosition(v);
			if (Math.abs(v.y - pos.y) > 0.4) continue;
			md = Math.min(md, Math.hypot(v.x - pos.x, v.z - pos.z));
		}
		if (md < 0.1) issue("pilgrim-clip", { d: +md.toFixed(3), ep: st.ep, step: st.step });
	}
	// the camera: above the ground, and nothing solid between it and the traveller
	const gy = app.world.height(cam.position.x, cam.position.z);
	if (cam.position.y < gy + 0.03) issue("camera-underground", { dy: +(cam.position.y - gy).toFixed(3) });
	if (tr.visible && mon.frames % 4 === 0) {
		// Three sight lines (feet, chest, head). It counts as blocked only when most of the traveller is hidden,
		// and only when that lasts about half a second: a leaf or a coach edge crossing a corner of the shot is not.
		const solid = [app.roads.group, app.scenery.group, app.scenery.trees.group, ...app.landmarks.map((l) => l.root), ...app.landmarks.map((l) => l.decor)];
		if (J.rake) for (const k of J.rake.cars) solid.push(k.group);
		let hidden = 0, by = "", at = 0, of = 0;
		for (const f of [0.08, 0.3, 0.55]) {
			const to = head.copy(pos);
			to.y += f * sc;
			const d = cam.position.distanceTo(to);
			dir.subVectors(to, cam.position).normalize();
			ray.set(cam.position, dir);
			ray.camera = cam;
			ray.near = 0.05;
			ray.far = d - 0.15;
			for (const h of ray.intersectObjects(solid, true)) {
				const o = h.object, m = o.material;
				if (!o.visible || o.isSprite || o.isPoints || o.isLine) continue;
				if (m && m.transparent && m.opacity < 0.6) continue;
				let q = o, mine = false;
				while (q) {
					if (q === tr) mine = true;
					q = q.parent;
				}
				if (mine) continue;
				// riding in the open doorway: its own frame, just in front of them, is not something in the way
				if ((st.onTrain || (st.ep && /train/.test(st.ep))) && d - h.distance < 0.45) continue;
				hidden++;
				by = (o.name || o.parent?.name || o.type) + "";
				at = +h.distance.toFixed(2);
				of = +d.toFixed(2);
				break;
			}
		}
		mon.blockRun = hidden >= 2 ? (mon.blockRun || 0) + 1 : 0;
		// 8 samples, every 4th frame: about half a second at 60 fps
		if (mon.blockRun === 8) issue("camera-blocked", { by, at, of, ep: st.ep, step: st.step });
	}
}
requestAnimationFrame(frame);
