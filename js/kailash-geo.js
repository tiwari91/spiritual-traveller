// The Kailash Mansarovar Yatra by the Lipulekh route: its stops, its route and the places on it. Data only (no
// imports), read by geo.js when the page is kailash.html. Coordinates are [longitude, latitude] in degrees.
//
// Delhi, where the Ministry of External Affairs assembles each batch, by road through Moradabad, Bareilly and
// Pilibhit to Tanakpur, up into Kumaon by Champawat and Pithoragarh to Dharchula on the Kali, up the Kali gorge on
// the Border Roads road by Budhi and Garbyang to Gunji, past Kalapani to Nabhidhang under Om Parvat; over the
// Lipulekh Pass into Tibet and down to Taklakot (Purang); by the yatra's bus between Gurla Mandhata and Rakshas Tal
// to Chiu Gompa on Mansarovar and round its northern and eastern shores to Qugu for the snan; on round the western
// shore to Chiu and across the Barkha plain to Darchen and Yam Dwar; and on foot round Kailash: up the Lha Chu to
// Dirapuk under the north face, over the Dolma La past Gauri Kund, down the Lham Chu Khir by Zuthulphuk and back
// to Darchen.
//
// Kailash and the circuit round it are drawn about four times larger than life and set some 30 km north of
// Kailash's true place (31.07 N, 81.31 E), so the parikrama can be walked round a mountain that reads as one; Darchen,
// the lakes, Gurla Mandhata, Taklakot and the Indian side are where they are, except that Kalapani and Nabhidhang
// are spaced out along the last few kilometres below the pass (truly 2 to 3 km apart in a straight line, 9 km by the
// old path) and Om Parvat is set back from the camp so it can be seen whole. The camps at Qugu and Chiu, Hor, Tarboche,
// Dirapuk, Dolma La, Gauri Kund and Zuthulphuk are placed by description, not from surveyed coordinates.

// The drawn centre of Kailash, and a point at a bearing (degrees from north, clockwise) and distance (world units,
// 40 to the degree) from it.
export const KAILASH = [81.3, 31.25];
const K = (b, d) => [+(KAILASH[0] + (d * Math.sin((b * Math.PI) / 180)) / 40).toFixed(4), +(KAILASH[1] + (d * Math.cos((b * Math.PI) / 180)) / 40).toFixed(4)];

// Kailash's true summit, and a drawn point back on the true ground (for the satellite map, which shows the real
// country): within the drawn circuit points are drawn about 3.9 times further from the summit than they are,
// easing to their own place by Darchen.
export const KAILASH_TRUE = [81.3125, 31.067];
export function trueGeo([lon, lat]) {
	const dx = (lon - KAILASH[0]) * 40, dz = (lat - KAILASH[1]) * 40, r = Math.hypot(dx, dz);
	const w = r < 9.5 ? 1 : r > 12.5 ? 0 : 1 - ((r - 9.5) / 3) * ((r - 9.5) / 3) * (3 - (2 * (r - 9.5)) / 3);
	if (w <= 0) return [lon, lat];
	const tx = KAILASH_TRUE[0] + (lon - KAILASH[0]) / 3.9, ty = KAILASH_TRUE[1] + (lat - KAILASH[1]) / 3.9;
	return [lon + (tx - lon) * w, lat + (ty - lat) * w];
}

// Named points on the way.
export const P = {
	delhi: [77.21, 28.61], moradabad: [78.78, 28.84], rampur: [79.03, 28.8], bareilly: [79.43, 28.37], pilibhit: [79.8, 28.63], khatima: [79.97, 28.92],
	tanakpur: [80.109, 29.074], champawat: [80.1, 29.33], lohaghat: [80.08, 29.4], pithoragarh: [80.22, 29.58], ogla: [80.36, 29.68], jauljibi: [80.38, 29.75],
	dharchula: [80.543, 29.8485], tawaghat: [80.6, 29.95], malpa: [80.67, 30.03], budhi: [80.76, 30.11], garbyang: [80.83, 30.15], gunji: [80.851, 30.187],
	kalapani: [80.93, 30.206], nabhidhang: [80.985, 30.222], roadHead: [81.016, 30.236], lipulekh: [81.029, 30.233], busStand: [81.046, 30.243], pala: [81.08, 30.262], taklakot: [81.177, 30.29],
	gurlaLa: [81.158, 30.452], isthmus: [81.345, 30.66], chiu: [81.373, 30.758], hor: [81.6, 30.735], qugu: [81.418, 30.543],
	darchen: [81.287, 30.976], tarboche: [81.245, 31.004],
	// where the parikrama path comes back into Darchen from the east, on the edge of the town
	darchenEnd: [81.335, 30.988], pastDarchen: [81.268, 30.962],
	omParvat: [81.02, 30.172], gurla: [81.296, 30.436],
	dirapuk: K(320, 10.4), dolmaLa: K(25, 9.8), gauriKund: K(45, 10.4), zuthulphuk: K(110, 11.5),
};

// The parikrama path round the drawn Kailash, clockwise (Kailash always on the right hand): from Tarboche up the
// Lha Chu (the west side), across the north under Dirapuk, over the Dolma La, down the Lham Chu Khir (the east
// side) by Zuthulphuk, and back to Darchen.
export const KORA = {
	west: [P.tarboche, K(205, 10.4), K(225, 10.6), K(248, 10.6), K(272, 10.2), K(296, 9.6), P.dirapuk],
	north: [P.dirapuk, K(334, 9.1), K(350, 9.3), K(6, 9.6), P.dolmaLa],
	east: [P.dolmaLa, P.gauriKund, K(62, 10.9), K(80, 11.3), K(96, 11.5), P.zuthulphuk, K(126, 11.8), K(142, 12.0), K(158, 11.7), [81.355, 30.984], P.darchenEnd],
};

// Lakes, traced round their shores (approximate).
export const LAKES = [
	{
		name: "Mansarovar", deva: "मानसरोवर", level: 46.5, deep: [0.05, 0.22, 0.38], shallow: [0.2, 0.5, 0.54],
		pts: [[81.372, 30.7], [81.385, 30.742], [81.42, 30.764], [81.48, 30.772], [81.54, 30.757], [81.574, 30.722], [81.586, 30.668], [81.572, 30.612], [81.532, 30.567], [81.472, 30.551], [81.418, 30.556], [81.385, 30.588], [81.37, 30.642]],
	},
	{
		name: "Rakshas Tal", deva: "राक्षस ताल", level: 46.35, deep: [0.03, 0.14, 0.28], shallow: [0.12, 0.34, 0.44],
		pts: [[81.296, 30.8], [81.318, 30.772], [81.322, 30.724], [81.31, 30.672], [81.302, 30.622], [81.284, 30.574], [81.25, 30.548], [81.214, 30.56], [81.2, 30.598], [81.162, 30.628], [81.152, 30.668], [81.188, 30.702], [81.226, 30.722], [81.246, 30.768], [81.27, 30.8]],
	},
];

// Rivers of the journey: the Kali (Mahakali) from its source at Kalapani down past Dharchula to Tanakpur, the
// Karnali (Map Chu) past Taklakot, the Ganga Chhu from Mansarovar into Rakshas Tal, the Lha Chu and the
// Lham Chu Khir round Kailash, and the plains rivers on the way out of Delhi.
export const RIVERS = [
	{ name: "Yamuna", w: 1.1, pts: [[77.6, 30.4], [77.3, 29.5], [77.24, 28.62], [77.6, 27.9]] },
	{ name: "Ganga", w: 1.5, pts: [[78.16, 29.95], [78.05, 29.3], [78.3, 28.5], [78.6, 27.7]] },
	{ name: "Ramganga", w: 0.7, pts: [[79.25, 29.75], [78.96, 29.2], [78.8, 28.9], [79.35, 28.33], [79.6, 27.8]] },
	{ name: "Sharda", w: 0.9, pts: [[80.38, 29.75], [80.24, 29.42], [80.12, 29.1], [80.06, 28.9], [80.15, 28.4]] },
	{ name: "Kali", w: 0.55, pts: [[80.94, 30.204], [80.9, 30.198], [80.851, 30.18], [80.8, 30.13], [80.72, 30.07], [80.64, 29.99], [80.58, 29.9], [80.53, 29.84], [80.45, 29.78], [80.38, 29.75]] },
	{ name: "Karnali", w: 0.45, pts: [[81.26, 30.34], [81.22, 30.315], [81.18, 30.282], [81.13, 30.22], [81.1, 30.13]] },
	{ name: "Ganga Chhu", w: 0.22, pts: [[81.377, 30.745], [81.352, 30.758], [81.33, 30.766], [81.313, 30.775]] },
	{ name: "Lha Chu", w: 0.24, pts: [K(312, 8.6), K(290, 9.2), K(268, 9.6), K(246, 9.9), K(224, 10.0), K(206, 10.4), [81.25, 30.98], [81.25, 30.9]] },
	{ name: "Lham Chu Khir", w: 0.22, pts: [K(58, 10.3), K(78, 10.8), K(96, 11.0), K(112, 11.1), K(128, 11.3), K(146, 11.7), [81.36, 30.95], [81.37, 30.88]] },
];

// Towns and camps, for labels and lamp clusters.
export const CITIES = [
	{ name: "Delhi", lon: 77.21, lat: 28.61, size: 3 },
	{ name: "Moradabad", lon: 78.78, lat: 28.84, size: 2 },
	{ name: "Bareilly", lon: 79.43, lat: 28.37, size: 2 },
	{ name: "Pilibhit", lon: 79.8, lat: 28.63, size: 1 },
	{ name: "Tanakpur", lon: 80.109, lat: 29.074, size: 1 },
	{ name: "Champawat", lon: 80.1, lat: 29.33, size: 1 },
	{ name: "Pithoragarh", lon: 80.22, lat: 29.58, size: 1 },
	{ name: "Dharchula", lon: 80.543, lat: 29.8485, size: 1 },
	{ name: "Gunji", lon: 80.851, lat: 30.187, size: 1 },
	{ name: "Taklakot", lon: 81.177, lat: 30.29, size: 1 },
	{ name: "Darchen", lon: 81.287, lat: 30.976, size: 1 },
	{ name: "Haldwani", lon: 79.51, lat: 29.22, size: 1 },
	{ name: "Dehradun", lon: 78.03, lat: 30.32, size: 2 },
	{ name: "Lucknow", lon: 80.95, lat: 26.85, size: 2 },
];

// The stops, in the order of the yatra, with what the darshan card says (same fields as the five-shrine yatra's).
// look: the peak (or the lake) the stop faces, from which geo.js sets its facing; view: the darshan camera, looking
// up from behind the traveller to the mountain (lift above the ground, pitch, distance); petals: false where no
// flowers are thrown; shelf: the stop's level ground (kailash-world.js).
export const SHRINES = [
	{
		key: "omparvat", name: "Om Parvat", deva: "ॐ पर्वत", lon: P.nabhidhang[0], lat: P.nabhidhang[1], look: P.omParvat,
		deity: "Shiva, in the snow that lies in the shape of ॐ on the face of Om Parvat", kind: "Om Parvat · Nabhidhang",
		state: "The Byans valley of Pithoragarh district, Uttarakhand, under Indian administration (Nepal also claims the Kalapani area), on the way up to the Lipulekh Pass",
		altitude: "Nabhidhang camp about 4,250 m (sources give 4,246 to 4,300 m); Om Parvat about 5,590 m",
		season: "The yatra crosses from late June to August; the ॐ shows best in the clear early morning, and is often lost in cloud by noon.",
		access: "From Delhi by road through Tanakpur (the 2025 and 2026 batches spent the first night there), Dharchula and Gunji, now on the Border Roads road up the Kali gorge (the old 27 km of trekking is almost all gone). Two nights at Gunji and two at Nabhidhang to acclimatise. An Inner Line Permit is needed above Dharchula.",
		note: "Om Parvat stands above the camp at Nabhidhang, the last halt before Tibet. Snow lying in the gullies of its face draws ॐ, the sacred syllable. Below it the Kali rises at Kalapani, where there is a Kali temple and the cave of Ved Vyas. Adi Kailash (Jolingkong, 5,945 m), up the Kuti valley from Gunji, is not on the MEA route.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Har Har Mahadev",
		hour: 6.6, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.0, 5.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 },
	},
	{
		key: "mansarovar", name: "Mansarovar", deva: "मानसरोवर", lon: P.qugu[0], lat: P.qugu[1], look: [81.36, 31.0],
		deity: "Shiva and Parvati; the lake made by Brahma from his mind (manas)", kind: "Sacred lake · snan",
		state: "Purang (Burang) county, Ngari, Tibet Autonomous Region, China, between Gurla Mandhata and Kailash",
		altitude: "about 4,590 m (sources give 4,590 to 4,600 m)",
		season: "June to September. The water is bitterly cold; the wind rises by midday and the lake goes from glass to whitecaps.",
		access: "Over the Lipulekh Pass from India, two nights at Taklakot, then by the yatra's Chinese bus. The bus goes round the lake (about 88 km of shore): Rakshas Tal and the first sight of Kailash, the camp at Chiu, then by Hor to Qugu on the south-western shore.",
		note: "Pilgrims take a snan in the lake (no soap), offer puja and a havan on the shore, and fill cans with its water to take home. Before dawn people watch the water for lights said to be the gods coming down to bathe. Kailash stands across the lake to the north and the snows of Gurla Mandhata (7,694 m) behind.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Jai Mansarovar",
		hour: 7.1, weather: "clear", rest: [0.3, 3.4], floor: 0.03, lake: true, shelf: [2.6, 4.4], view: { lift: 1.4, pitch: 0.12, dist: 6.2 },
	},
	{
		key: "yamdwar", name: "Yam Dwar", deva: "यम द्वार", lon: P.tarboche[0], lat: P.tarboche[1], look: KAILASH,
		deity: "Shiva, Lord of Kailash: the gate of Yama, where the parikrama begins", kind: "Tarboche · start of the parikrama",
		state: "Below the south-west face of Kailash, a few kilometres from Darchen, Ngari, Tibet",
		altitude: "about 4,750 m",
		season: "June to September. At Saga Dawa (the full moon of May or June) the great Tarboche flagpole is raised anew.",
		access: "From Darchen by the yatra's bus to Yam Dwar, where the walk begins. Yaks, ponies and porters are hired for the three days.",
		note: "Pilgrims pass through Yam Dwar, a small chorten gateway, leaving the world behind; beside it the Tarboche flagpole stands hung with thousands of prayer flags. From here the path turns north up the Lha Chu valley, with Kailash on the right hand all the way round.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Bam Bam Bhole",
		hour: 9.6, weather: "clear", rest: [0.35, 3.3], floor: 0.03, shelf: [3.0, 5.2], view: { lift: 3.2, pitch: 0.0, dist: 8.6 }, petals: false,
	},
	{
		key: "dirapuk", name: "Dirapuk", deva: "डेरापुक", lon: P.dirapuk[0], lat: P.dirapuk[1], look: KAILASH,
		deity: "Shiva, before the north face of Kailash", kind: "Night halt · the north face",
		state: "The head of the Lha Chu valley, on the north-west of Kailash, Ngari, Tibet",
		altitude: "about 4,900 m (sources give 4,890 to 5,080 m)",
		season: "June to September; the north face catches the last sun of the evening.",
		access: "About 20 km on foot from Darchen (the first day of the parikrama), the first 10 km to Yam Dwar by bus. A basic camp; the Dirapuk gompa stands on the slope opposite.",
		note: "Here the north face of Kailash rises straight from the glaciers above the camp, the closest view of the whole circuit: dark rock banded with snow, the great gully down its middle. The gompa is built round a cave, the 'cave of the female yak's horns'. Pilgrims can walk up towards the face for charan sparsh, to touch its foot.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Jai Kailashpati",
		hour: 16.8, weather: "clear", rest: [0.35, 3.4], floor: 0.03, shelf: [5.0, 8.0], view: { lift: 3.2, pitch: -0.02, dist: 8.4 }, petals: false,
	},
	{
		key: "dolmala", name: "Dolma La", deva: "डोल्मा ला", lon: P.dolmaLa[0], lat: P.dolmaLa[1], look: KAILASH,
		deity: "Parvati as Dolma (Tara), at the highest point of the parikrama", kind: "The pass · 5,630 m",
		state: "The pass on the north-east of Kailash, Ngari, Tibet",
		altitude: "about 5,630 m (sources give 5,630 to 5,670 m)",
		season: "June to September; snow can fall on the pass on any day, and blizzards come without warning.",
		access: "A steep climb of about 6 km from Dirapuk, starting before dawn. Ponies and yaks go over; many walk. Below it on the far side lies Gauri Kund.",
		note: "The pass is a sea of prayer flags round the great Dolma stone. Pilgrims leave something of themselves (a lock of hair, a piece of clothing) at Shiva Sthal below, and offer at the stone. Down the far side, Gauri Kund (Thukje Chenpo Tso), the emerald lake where Parvati bathed, is often still frozen.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Jai Maa Gauri",
		hour: 9.4, weather: "snow", rest: [0.35, 3.3], floor: 0.03, shelf: [3.0, 5.2], view: { lift: 2.4, pitch: 0.02, dist: 7.0 }, petals: false,
	},
	{
		key: "darchen", name: "Darchen", deva: "दारचेन", lon: P.darchenEnd[0], lat: P.darchenEnd[1], look: KAILASH,
		deity: "Shiva, Lord of Kailash: the parikrama complete", kind: "Parikrama complete",
		state: "Darchen, at the foot of the south face of Kailash, Ngari, Tibet",
		altitude: "about 4,670 m",
		season: "June to September.",
		access: "From Dolma La down past Gauri Kund into the Lham Chu Khir valley, a night at Zuthulphuk (Milarepa's cave), then about 12 km back to Darchen. Then by bus to Taklakot and back over the Lipulekh to India; about 22 days from Delhi to Delhi.",
		note: "The parikrama of about 52 km (the MEA's own booklet says 48) is done in three days. Zuthulphuk, the last halt, is the gompa round the cave where Milarepa stayed. From Darchen the south face shows its stair of snow bands and the vertical gully: the 'stairway to heaven'.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Om Namah Shivaya",
		hour: 11.4, weather: "clear", rest: [0.35, 3.3], floor: 0.03, shelf: [3.0, 5.2], view: { lift: 3.0, pitch: 0.02, dist: 8.4 }, petals: false,
	},
];

// Each leg ends at its stop (ROUTE[i] ends at SHRINES[i]). secs sets the pace at 1x; ways lists how each stretch
// is travelled, from the named point it starts at: "bus" (the yatra's coach), "jeep", "walk" or "choice" (the
// transport chip: bus, train, bike or car), "tibet" (the Chinese bus on the Tibet side).
export const ROUTE = [
	{
		title: "Delhi to the Kumaon Himalaya", secs: 120, overnight: true, kicker: "From Delhi · by road", mode: "By road and jeep",
		pts: [P.delhi, [77.7, 28.72], P.moradabad, P.rampur, P.bareilly, P.pilibhit, P.khatima, P.tanakpur, [80.13, 29.2], P.champawat, P.lohaghat, [80.16, 29.49], P.pithoragarh, P.ogla, P.jauljibi, [80.47, 29.8], P.dharchula, P.tawaghat, P.malpa, P.budhi, P.garbyang, P.gunji, [80.92, 30.2], P.kalapani, P.nabhidhang],
		ways: [["choice", P.delhi], ["jeep", P.dharchula, "By jeep up the Kali gorge"]],
	},
	{
		title: "Over the Lipulekh to Mansarovar", secs: 90, overnight: true, kicker: "Into Tibet", mode: "On foot and by bus",
		pts: [P.nabhidhang, [80.995, 30.231], [81.008, 30.226], P.roadHead, [81.022, 30.231], P.lipulekh, [81.038, 30.239], P.busStand, [81.06, 30.252], P.pala, [81.13, 30.27], P.taklakot, [81.18, 30.33], [81.17, 30.39], P.gurlaLa, [81.2, 30.5], [81.31, 30.548], [81.335, 30.6], P.isthmus, [81.35, 30.72], P.chiu, [81.43, 30.79], [81.51, 30.792], [81.57, 30.775], P.hor, [81.608, 30.68], [81.59, 30.6], [81.54, 30.55], [81.47, 30.535], P.qugu],
		ways: [["walk", P.nabhidhang, "On foot over the Lipulekh"], ["tibet", P.busStand, "By bus down to Taklakot"], ["tibet", P.taklakot, "By bus over the Gurla La"], ["tibet", P.chiu, "By bus round the lake"]],
	},
	{
		title: "Round the lake to Darchen", secs: 46, kicker: "Morning · by bus", mode: "By bus, then on foot",
		pts: [P.qugu, [81.39, 30.556], [81.36, 30.584], [81.335, 30.6], P.isthmus, [81.35, 30.72], P.chiu, [81.35, 30.8], [81.33, 30.87], [81.3, 30.935], P.pastDarchen, [81.25, 30.985], P.tarboche],
		ways: [["tibet", P.qugu, "By bus round the lake"], ["tibet", [81.335, 30.6], "By bus round the lake", { shared: true }], ["tibet", P.chiu, "By bus across the Barkha plain"], ["tibet", P.pastDarchen, "By bus past Darchen"]],
	},
	{ title: "Up the Lha Chu to Dirapuk", secs: 60, kicker: "The parikrama · day one", mode: "On foot, about 20 km", pts: KORA.west, ways: [["walk", P.tarboche, "On foot up the Lha Chu"]] },
	{ title: "Over the Dolma La", secs: 34, kicker: "The parikrama · day two", mode: "On foot, a steep 6 km", pts: KORA.north, ways: [["walk", P.dirapuk, "On foot, climbing"]] },
	{ title: "Down by Zuthulphuk to Darchen", secs: 70, overnight: true, kicker: "The parikrama · days two and three", mode: "On foot, about 30 km", pts: KORA.east, ways: [["walk", P.dolmaLa, "On foot, down past Gauri Kund"], ["walk", P.zuthulphuk, "On foot, the last day"]] },
];

// Places passed on the way, announced as the traveller goes by: [lon, lat, text].
export const PASSING = [
	[80.109, 29.074, "Tanakpur: the first night out of Delhi"],
	[80.22, 29.58, "Pithoragarh, under the Panchachuli snows"],
	[80.543, 29.8485, "Dharchula on the Kali, Nepal across the river"],
	[80.851, 30.187, "Gunji: two nights to acclimatise"],
	[80.93, 30.206, "Kalapani: the Kali temple at the river's source"],
	[81.029, 30.233, "The Lipulekh Pass, about 5,100 m"],
	[81.177, 30.29, "Taklakot (Purang): two nights"],
	[81.158, 30.452, "The Gurla La: the first sight of Kailash"],
	[81.25, 30.64, "Rakshas Tal, the lake of Ravana"],
	[81.373, 30.758, "Chiu Gompa on its rock above the lake"],
	[81.6, 30.735, "Hor, on the eastern shore"],
	[81.268, 30.962, "Darchen: yaks and porters are hired here"],
	[81.245, 31.004, "Tarboche, the great flagpole"],
	[P.gauriKund[0], P.gauriKund[1], "Gauri Kund, where Parvati bathed"],
	[P.zuthulphuk[0], P.zuthulphuk[1], "Zuthulphuk: Milarepa's cave, the last night"],
];
