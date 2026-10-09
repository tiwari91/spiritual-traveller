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

// Which way the journey goes: "leh" (from Leh up the Indus, by the old trade and pilgrim road through Demchok into
// Ngari) or "lipulekh" (the official MEA route). Chosen on the start screen; a ?route= in the address wins, then the
// last choice remembered; Leh by default.
export const ROUTES = ["leh", "lipulekh"];
export const ROUTE_CHOICE = (() => {
	try {
		const q = new URLSearchParams(location.search).get("route");
		if (ROUTES.includes(q)) {
			localStorage.setItem("kailashRoute", q);
			return q;
		}
		const m = localStorage.getItem("kailashRoute");
		if (ROUTES.includes(m)) return m;
	} catch (e) {
		/* no storage: the default */
	}
	return "leh";
})();
export const LEH = ROUTE_CHOICE === "leh";

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
	// the yatra's Delhi stay, west of the Yamuna (the road east crosses it at once)
	delhi: [77.13, 28.62], moradabad: [78.78, 28.84], rampur: [79.03, 28.8], bareilly: [79.43, 28.37], pilibhit: [79.8, 28.63], khatima: [79.97, 28.92],
	tanakpur: [80.109, 29.074], champawat: [80.1, 29.33], lohaghat: [80.08, 29.4], pithoragarh: [80.22, 29.58], ogla: [80.36, 29.68], jauljibi: [80.38, 29.75],
	dharchula: [80.543, 29.8485], tawaghat: [80.6, 29.95], sosa: [80.628, 29.962], narayan: [80.655, 29.97], malpa: [80.67, 30.03], budhi: [80.76, 30.11], garbyang: [80.83, 30.15], gunji: [80.851, 30.187],
	kalapani: [80.93, 30.206], nabhidhang: [80.985, 30.222], roadHead: [81.016, 30.236], lipulekh: [81.029, 30.233], busStand: [81.046, 30.243], pala: [81.08, 30.262], taklakot: [81.177, 30.29],
	gurlaLa: [81.158, 30.452], isthmus: [81.345, 30.66], chiu: [81.353, 30.777], hor: [81.624, 30.750], qugu: [81.405, 30.518],
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

// Lakes, traced round their shores (approximate); the road round Mansarovar is drawn a little out from the shore.
export const LAKES = [
	{
		name: "Mansarovar", deva: "मानसरोवर", level: 46.5, deep: [0.05, 0.22, 0.38], shallow: [0.2, 0.5, 0.54],
		pts: [[81.376, 30.698], [81.390, 30.738], [81.423, 30.759], [81.479, 30.767], [81.536, 30.752], [81.569, 30.719], [81.580, 30.668], [81.566, 30.615], [81.529, 30.571], [81.471, 30.557], [81.420, 30.561], [81.390, 30.591], [81.375, 30.643]],
	},
	{
		name: "Rakshas Tal", deva: "राक्षस ताल", level: 46.35, deep: [0.03, 0.14, 0.28], shallow: [0.12, 0.34, 0.44],
		pts: [[81.293, 30.790], [81.312, 30.764], [81.316, 30.721], [81.305, 30.672], [81.297, 30.626], [81.281, 30.583], [81.250, 30.559], [81.217, 30.569], [81.204, 30.605], [81.168, 30.632], [81.159, 30.669], [81.193, 30.700], [81.228, 30.718], [81.247, 30.761], [81.269, 30.790]],
	},
];

// Rivers of the journey: the Kali (Mahakali) from its source at Kalapani down past Dharchula to Tanakpur, the
// Karnali (Map Chu) past Taklakot, the Ganga Chhu from Mansarovar into Rakshas Tal, the Lha Chu and the
// Lham Chu Khir round Kailash, and the plains rivers on the way out of Delhi.
const LIPU_RIVERS = [
	{ name: "Yamuna", w: 1.1, pts: [[77.6, 30.4], [77.3, 29.5], [77.24, 28.62], [77.6, 27.9]] },
	{ name: "Ganga", w: 1.5, pts: [[78.16, 29.95], [78.05, 29.3], [78.3, 28.5], [78.6, 27.7]] },
	{ name: "Ramganga", w: 0.7, pts: [[79.25, 29.75], [78.96, 29.2], [78.8, 28.9], [79.35, 28.33], [79.6, 27.8]] },
	{ name: "Sharda", w: 0.9, pts: [[80.38, 29.75], [80.24, 29.42], [80.12, 29.1], [80.06, 28.9], [80.15, 28.4]] },
	{ name: "Kali", w: 0.55, pts: [[80.905, 30.2], [80.851, 30.18], [80.8, 30.13], [80.72, 30.07], [80.64, 29.99], [80.58, 29.9], [80.53, 29.84], [80.45, 29.78], [80.38, 29.75]] },
	{ name: "Karnali", w: 0.45, pts: [[81.26, 30.34], [81.22, 30.315], [81.18, 30.282], [81.13, 30.22], [81.1, 30.13]] },
	{ name: "Ganga Chhu", w: 0.22, pts: [[81.402, 30.718], [81.375, 30.735], [81.348, 30.742], [81.322, 30.748], [81.306, 30.748]] },
	{ name: "Lha Chu", w: 0.24, pts: [K(312, 8.6), K(290, 9.2), K(268, 9.6), K(246, 9.9), K(224, 10.0), K(206, 10.4), [81.25, 30.98], [81.25, 30.9]] },
	{ name: "Lham Chu Khir", w: 0.22, pts: [K(58, 10.3), K(78, 10.8), K(96, 11.0), K(112, 11.1), K(128, 11.3), K(146, 11.7), [81.36, 30.95], [81.37, 30.88]] },
];

// Towns and camps, for labels and lamp clusters.
const LIPU_CITIES = [
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
export const LIPU_SHRINES = [
	{
		key: "narayan", name: "Narayan Ashram", deva: "नारायण आश्रम", lon: P.narayan[0], lat: P.narayan[1], look: [80.62, 29.995],
		deity: "Narayana; the ashram of Narayan Swami on the hillside above the Kali", kind: "Ashram · Sosa, above Tawaghat",
		state: "Dharchula tehsil, Pithoragarh district, Uttarakhand: about 14 km up from Tawaghat by the district's reckoning (travellers' figures run from 23 to 54 km out of Dharchula)",
		altitude: "about 2,734 m",
		season: "Open from spring to early winter, roughly April to June and September to November; snowed in between. Early June for the flowers.",
		access: "From Dharchula up the Kali to Tawaghat, then the side road up to Sosa (an Inner Line Permit is needed beyond Dharchula). A KMVN rest house stands just below the ashram.",
		note: "Founded in 1936 by Narayan Swami (Sri Raghavendra) and built over some thirteen years: a temple, a library, a meditation room (the Shoonyata Kuteer), a school for the valley's children, herb gardens and the swami's samadhi. Before the road and the war of 1962 the Kailash pilgrims walking up from Almora are said to have rested here, between Pangu and Sirkha; the yatra's buses now pass below it.",
		mantra: "ॐ नमो नारायणाय", mantraLatin: "Om Namo Narayanaya", greeting: "Narayan Narayan",
		hour: 15.6, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [5.2, 8.0], uphill: true, view: { lift: 1.5, pitch: 0.08, dist: 6.4 },
	},
	{
		key: "kalapani", name: "Kalapani", deva: "कालापानी", lon: P.kalapani[0], lat: P.kalapani[1], look: [80.92, 30.222],
		deity: "Kali, at the source of the Kali river; the cave of Sage Vyasa on the cliff above", kind: "Kali temple · Vyas cave",
		state: "The upper Kali valley, below Nabhidhang, at about 3,600 m; under Indian administration, and also claimed by Nepal",
		altitude: "about 3,600 m (the MEA's booklet); the Kalapani area lies between 3,650 and 6,180 m",
		season: "The yatra passes in June to August; the road is open from about the middle of May to late October.",
		access: "By the Border Roads road up the Kali from Dharchula, about 85 km and five to seven hours by jeep. The ITBP checks documents here, and an Inner Line Permit is needed. The batches halt at Kalapani before Nabhidhang.",
		note: "A small temple of Kali, tended by the ITBP, where the yatris pray before going on up to the pass; the Kali, which gives the valley and the border river their name, rises here. Tradition says Sage Vyasa did penance for years in a cave on the cliff above, its mouth marked with a flag (the MEA's own booklet points it out on the way in). Not the Vyas Gufa at Mana near Badrinath.",
		mantra: "ॐ क्रीं कालिकायै नमः", mantraLatin: "Om Krim Kalikayai Namah", greeting: "Jai Maa Kali",
		hour: 10.4, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [5.2, 8.0], uphill: true, view: { lift: 1.5, pitch: 0.08, dist: 6.4 },
	},
	{
		key: "omparvat", name: "Om Parvat", deva: "ॐ पर्वत", lon: P.nabhidhang[0], lat: P.nabhidhang[1], look: P.omParvat,
		deity: "Shiva, in the snow that lies in the shape of ॐ on the face of Om Parvat", kind: "Om Parvat · Nabhidhang",
		state: "The Byans valley of Pithoragarh district, Uttarakhand, under Indian administration (Nepal also claims the Kalapani area), on the way up to the Lipulekh Pass",
		altitude: "Nabhidhang camp about 4,250 m (sources give 4,246 to 4,300 m); Om Parvat about 5,590 m",
		season: "The yatra crosses from late June to August; the ॐ shows best in the clear early morning, and is often lost in cloud by noon.",
		access: "From Delhi by road through Tanakpur (the 2025 and 2026 batches spent the first night there), Dharchula and Gunji, now on the Border Roads road up the Kali gorge (the old 27 km of trekking is almost all gone). Two nights at Gunji and two at Nabhidhang to acclimatise. An Inner Line Permit is needed above Dharchula.",
		note: "Om Parvat stands above the camp at Nabhidhang, the last halt before Tibet. Snow lying in the gullies of its face draws ॐ, the sacred syllable. Below it the Kali rises at Kalapani, where there is a Kali temple and the cave of Ved Vyas. Adi Kailash (Jolingkong, 5,945 m), up the Kuti valley from Gunji, is not on the MEA route.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Har Har Mahadev",
		hour: 6.6, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.4, 6.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 },
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
export const LIPU_ROUTE = [
	{
		title: "Delhi to the Kumaon Himalaya", secs: 104, overnight: true, kicker: "From Delhi · by road", mode: "By road and jeep",
		pts: [P.delhi, [77.7, 28.72], P.moradabad, P.rampur, P.bareilly, P.pilibhit, P.khatima, P.tanakpur, [80.13, 29.2], P.champawat, P.lohaghat, [80.16, 29.49], P.pithoragarh, P.ogla, P.jauljibi, [80.47, 29.8], P.dharchula, P.tawaghat, P.sosa, P.narayan],
		ways: [["choice", P.delhi], ["jeep", [80.45, 29.789], "By jeep up the Kali gorge"]],
	},
	{
		title: "Up the Kali gorge to Kalapani", secs: 34, overnight: true, kicker: "The Byans valley · by jeep", mode: "By jeep",
		pts: [P.narayan, [80.645, 29.99], P.malpa, P.budhi, P.garbyang, P.gunji, [80.92, 30.2], P.kalapani],
		ways: [["jeep", P.narayan, "By jeep up the Kali gorge"]],
	},
	{
		title: "Kalapani to Nabhidhang", secs: 12, kicker: "The last camp · by jeep", mode: "By jeep",
		pts: [P.kalapani, [80.958, 30.212], P.nabhidhang],
		ways: [["jeep", P.kalapani, "By jeep to Nabhidhang"]],
	},
	{
		title: "Over the Lipulekh to Mansarovar", secs: 90, overnight: true, kicker: "Into Tibet", mode: "On foot and by bus",
		pts: [P.nabhidhang, [80.995, 30.231], [81.008, 30.226], P.roadHead, [81.022, 30.231], P.lipulekh, [81.038, 30.239], P.busStand, [81.06, 30.252], P.pala, [81.13, 30.27], P.taklakot, [81.18, 30.33], [81.17, 30.39], P.gurlaLa, [81.2, 30.5], [81.31, 30.548], [81.335, 30.6], P.isthmus, [81.35, 30.72], P.chiu, [81.420, 30.816], [81.517, 30.819], [81.587, 30.797], P.hor, [81.636, 30.684], [81.615, 30.587], [81.554, 30.526], [81.468, 30.507], P.qugu],
		ways: [["walk", P.nabhidhang, "On foot over the Lipulekh"], ["tibet", P.busStand, "By bus down to Taklakot"], ["tibet", P.taklakot, "By bus over the Gurla La"], ["tibet", P.chiu, "By bus round the lake"]],
	},
	{
		title: "Round the lake to Darchen", secs: 46, kicker: "Morning · by bus", mode: "By bus, then on foot",
		pts: [P.qugu, [81.372, 30.535], [81.336, 30.569], [81.335, 30.6], P.isthmus, [81.35, 30.72], P.chiu, [81.35, 30.8], [81.33, 30.87], [81.3, 30.935], P.pastDarchen, [81.25, 30.985], P.tarboche],
		ways: [["tibet", P.qugu, "By bus round the lake"], ["tibet", [81.335, 30.6], "By bus round the lake", { shared: true }], ["tibet", P.chiu, "By bus across the Barkha plain"], ["tibet", P.pastDarchen, "By bus past Darchen"]],
	},
	{ title: "Up the Lha Chu to Dirapuk", secs: 60, kora: true, kicker: "The parikrama · day one", mode: "On foot, about 20 km", pts: KORA.west, ways: [["walk", P.tarboche, "On foot up the Lha Chu"]] },
	{ title: "Over the Dolma La", secs: 34, kora: true, kicker: "The parikrama · day two", mode: "On foot, a steep 6 km", pts: KORA.north, ways: [["walk", P.dirapuk, "On foot, climbing"]] },
	{ title: "Down by Zuthulphuk to Darchen", secs: 70, overnight: true, kora: true, kicker: "The parikrama · days two and three", mode: "On foot, about 30 km", pts: KORA.east, ways: [["walk", P.dolmaLa, "On foot, down past Gauri Kund"], ["walk", P.zuthulphuk, "On foot, the last day"]] },
];

// Places passed on the way, announced as the traveller goes by: [lon, lat, text].
const LIPU_PASSING = [
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

// ---------- From Leh, Ladakh ----------
// The old trade and pilgrim way from Ladakh into Ngari: from Leh up the Indus past Thiksey to Hemis, on up the river
// by Upshi and Kiari to the hot springs at Chumathang, into the Changthang plateau by Mahe and Nyoma, up the Hanle
// river to Hanle, east to Demchok, the last Indian village, and over into Tibet: up the Indus (the Sengge Zangbo)
// past Tashigang to Shiquanhe (Ali), south by Gartok down to the Sutlej, and on to Darchen, round the north and east
// shores of Mansarovar to Qugu for the snan, and from there the parikrama as on the Lipulekh route. The crossing at
// Demchok is closed to pilgrims today (Indian yatris go by the Lipulekh or the Nathu La); the journey takes it as it
// once was taken. Places are from published coordinates to within a few kilometres; Kiari, Mahe, Loma and Tashigang
// are placed by description along the river.
Object.assign(P, {
	leh: [77.585, 34.164], shey: [77.635, 34.072], thiksey: [77.667, 34.056], karu: [77.733, 33.935], hemis: [77.703, 33.912],
	upshi: [77.818, 33.829], kiari: [78.12, 33.53], chumathang: [78.33, 33.36], mahe: [78.47, 33.28], nyoma: [78.65, 33.19],
	loma: [78.98, 33.05], hanle: [78.969, 32.794], demchok: [79.44, 32.70], tashigang: [79.69, 32.55], ali: [80.10, 32.50],
	gartok: [80.35, 31.75], sutlej: [80.85, 31.2],
});
const LEH_STOPS = [
	{
		key: "hemis", name: "Hemis", deva: "हेमिस", lon: P.hemis[0], lat: P.hemis[1], look: [77.69, 33.89],
		deity: "Padmasambhava (Guru Rinpoche), at the great Drukpa monastery of Ladakh", kind: "Gompa · above the Indus",
		state: "Leh district, Ladakh, in a side valley south of the Indus, about 40 km from Leh",
		altitude: "about 3,600 m (Leh itself about 3,500 m)",
		season: "May to September, when the road over from Manali and the passes are open; the Hemis festival falls in June or July.",
		access: "From Leh up the Indus past Shey and Thiksey to Karu, then across the river and up the side valley. Leh has flights from Delhi.",
		note: "Re-founded in 1672 under King Sengge Namgyal, Hemis is the largest and richest monastery in Ladakh. At its festival, on the tenth day of the fifth Tibetan month, the monks dance the cham in masks in the courtyard for the birth of Guru Rinpoche, and every twelfth year a great thangka of him is unrolled.",
		mantra: "ॐ मणि पद्मे हूँ", mantraLatin: "Om Mani Padme Hum", greeting: "Julley",
		hour: 10.2, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.4, 6.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 }, petals: false,
	},
	{
		key: "chumathang", name: "Chumathang", deva: "चुमाथांग", lon: P.chumathang[0], lat: P.chumathang[1], look: [78.345, 33.375],
		deity: "The hot springs beside the Indus", kind: "Hot springs · the upper Indus",
		state: "Nyoma subdivision, Leh district, Ladakh, about 140 km up the Indus from Leh",
		altitude: "about 3,950 m",
		season: "May to October.",
		access: "Up the Indus from Upshi on the road to Nyoma and Hanle (an Inner Line Permit is needed for the Changthang).",
		note: "Steam rises from the sulphur springs on the river bank, and people come to bathe in them for aches and the skin. Below the village the Indus runs green and fast between bare brown mountains; above it, the valley opens into the Changthang.",
		mantra: "ॐ मणि पद्मे हूँ", mantraLatin: "Om Mani Padme Hum", greeting: "Julley",
		hour: 13.4, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.4, 6.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 }, petals: false,
	},
	{
		key: "hanle", name: "Hanle", deva: "हानले", lon: P.hanle[0], lat: P.hanle[1], look: [78.964, 32.779],
		deity: "The Drukpa gompa of Hanle on its hill, and the observatory under the darkest sky in India", kind: "Gompa · observatory · Changthang",
		state: "The Hanle valley in the Changthang, Leh district, Ladakh, inside the Changthang Wildlife Sanctuary",
		altitude: "about 4,300 m in the valley; the observatory on Mt Saraswati about 4,500 m",
		season: "May to October; the sky is clearest in autumn.",
		access: "From Nyoma up the Indus to Loma and south up the Hanle river (an Inner Line Permit is needed).",
		note: "The 17th-century monastery, built under Sengge Namgyal, stands on a hill over the marshes where Changpa nomads graze yaks and pashmina goats. On the ridge opposite, the Indian Astronomical Observatory's Himalayan Chandra Telescope has watched the sky since 2001; Hanle became India's first dark-sky reserve in 2022.",
		mantra: "ॐ मणि पद्मे हूँ", mantraLatin: "Om Mani Padme Hum", greeting: "Julley",
		hour: 17.6, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.4, 6.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 }, petals: false,
	},
	{
		key: "demchok", name: "Demchok", deva: "डेमचोक", lon: P.demchok[0], lat: P.demchok[1], look: [79.62, 32.6],
		deity: "The last Indian village on the Indus, Tibet across the stream", kind: "The line · into Ngari",
		state: "Nyoma subdivision, Leh district, Ladakh, on the Indus at the border with Tibet (the line here is disputed)",
		altitude: "about 4,200 m",
		season: "Summer.",
		access: "Closed to pilgrims: no yatra crosses here today. Indian yatris go to Kailash by the Lipulekh (Uttarakhand) or the Nathu La (Sikkim). The journey follows the old trade road on into Tibet.",
		note: "For centuries Ladakhi traders and pilgrims went this way up the Indus to the fair at Gartok and on to Kailash, the river's own source country. Tibetan Demchok lies across the stream; from here the Indus is the Sengge Zangbo, the Lion River.",
		mantra: "ॐ मणि पद्मे हूँ", mantraLatin: "Om Mani Padme Hum", greeting: "Julley",
		hour: 9.0, weather: "clear", rest: [0.35, 3.3], floor: 0.04, shelf: [4.4, 6.6], view: { lift: 1.9, pitch: 0.06, dist: 6.6 }, petals: false,
	},
];
const byKey = (k) => LIPU_SHRINES.find((s) => s.key === k);
const LEH_SHARED = [
	{ ...byKey("mansarovar"), access: "From Demchok up the Indus past Shiquanhe (Ali), south by Gartok to the Sutlej and Darchen, then round the northern and eastern shores of the lake by Chiu and Hor to Qugu. (The official yatra comes over the Lipulekh to Taklakot.)" },
	byKey("yamdwar"), byKey("dirapuk"), byKey("dolmala"),
	{ ...byKey("darchen"), access: "From Dolma La down past Gauri Kund into the Lham Chu Khir valley, a night at Zuthulphuk (Milarepa's cave), then about 12 km back to Darchen." },
];
const LEH_ROUTE = [
	{
		title: "Leh, up the Indus to Hemis", secs: 46, kicker: "From Leh · by road", mode: "By road",
		pts: [P.leh, [77.61, 34.12], P.shey, P.thiksey, [77.7, 34.0], P.karu, [77.722, 33.922], P.hemis],
		ways: [["jeep", P.leh, "By jeep up the Indus"]],
	},
	{
		title: "Up the Indus to Chumathang", secs: 62, kicker: "The Indus gorge · by road", mode: "By road",
		pts: [P.hemis, [77.722, 33.922], P.karu, P.upshi, [77.95, 33.7], P.kiari, [78.22, 33.43], P.chumathang],
		ways: [["jeep", P.hemis, "By jeep up the Indus"]],
	},
	{
		title: "Into the Changthang to Hanle", secs: 64, overnight: true, kicker: "The Changthang · by road", mode: "By road",
		pts: [P.chumathang, P.mahe, [78.56, 33.24], P.nyoma, [78.82, 33.12], P.loma, [78.99, 32.92], P.hanle],
		ways: [["jeep", P.chumathang, "By jeep into the Changthang"]],
	},
	{
		title: "Hanle to Demchok", secs: 40, kicker: "To the line · by road", mode: "By road",
		pts: [P.hanle, [79.1, 32.78], [79.27, 32.73], P.demchok],
		ways: [["jeep", P.hanle, "By jeep to Demchok"]],
	},
	{
		title: "Up the Sengge Zangbo to Mansarovar", secs: 130, overnight: true, kicker: "Into Tibet · Ngari", mode: "By road",
		pts: [P.demchok, [79.56, 32.63], P.tashigang, [79.9, 32.5], P.ali, [80.12, 32.2], [80.25, 31.95], P.gartok, [80.6, 31.45], P.sutlej, [81.03, 31.01], [81.17, 30.955], P.pastDarchen, [81.3, 30.935], [81.33, 30.87], [81.35, 30.8], P.chiu, [81.420, 30.816], [81.517, 30.819], [81.587, 30.797], P.hor, [81.636, 30.684], [81.615, 30.587], [81.554, 30.526], [81.468, 30.507], P.qugu],
		ways: [["tibet", P.demchok, "By bus up the Sengge Zangbo"], ["tibet", P.ali, "By bus south by Gartok"], ["tibet", P.sutlej, "By bus to Darchen"], ["tibet", P.pastDarchen, "By bus across the Barkha plain", { shared: true }], ["tibet", P.chiu, "By bus round the lake"]],
	},
	...LIPU_ROUTE.slice(4),
];
const LEH_PASSING = [
	[77.585, 34.164, "Leh: the palace and the Shanti Stupa above the town"],
	[77.635, 34.072, "Shey, the old palace of the Ladakhi kings"],
	[77.667, 34.056, "Thiksey Gompa, tier on tier up its hill"],
	[77.818, 33.829, "Upshi: the Manali road turns off south"],
	[78.65, 33.19, "Nyoma, on the Changthang plateau"],
	[78.98, 33.05, "Loma: the Hanle river meets the Indus"],
	[79.44, 32.7, "Demchok: this crossing is closed to pilgrims today; the game travels the old road"],
	[79.69, 32.55, "Tashigang, the first Tibetan village up the Indus"],
	[80.1, 32.5, "Shiquanhe (Ali), the town of Ngari, on the Indus"],
	[80.35, 31.75, "Gartok, where Ladakhi traders came to the summer fair"],
	[80.85, 31.2, "The Sutlej valley: the first sight of Kailash"],
	[81.268, 30.962, "Darchen, under the south face"],
	[81.373, 30.758, "Chiu Gompa on its rock above the lake"],
	[81.6, 30.735, "Hor, on the eastern shore"],
	...LIPU_PASSING.slice(12),
];
const LEH_CITIES = [
	{ name: "Leh", lon: 77.585, lat: 34.164, size: 2 },
	{ name: "Nyoma", lon: 78.65, lat: 33.19, size: 1 },
	{ name: "Hanle", lon: 78.969, lat: 32.794, size: 1 },
	{ name: "Shiquanhe (Ali)", lon: 80.1, lat: 32.5, size: 1 },
	{ name: "Darchen", lon: 81.287, lat: 30.976, size: 1 },
];
const INDUS = [
	{ name: "Indus", w: 0.7, pts: [[77.45, 34.22], [77.6, 34.11], [77.69, 34.02], [77.74, 33.93], [77.83, 33.82], [77.97, 33.68], [78.13, 33.52], [78.24, 33.42], [78.33, 33.35], [78.48, 33.27], [78.66, 33.18], [78.83, 33.11], [78.99, 33.06], [79.15, 32.95], [79.3, 32.84], [79.43, 32.73], [79.56, 32.64], [79.7, 32.56], [79.9, 32.51], [80.12, 32.51], [80.28, 32.3], [80.45, 32.05]] },
	{ name: "Hanle", w: 0.3, pts: [[78.95, 32.72], [78.975, 32.8], [79.0, 32.92], [78.99, 33.05]] },
	{ name: "Sutlej", w: 0.4, pts: [[81.15, 31.0], [80.95, 31.12], [80.75, 31.2], [80.5, 31.3]] },
];

// Altitude anchors in metres along each way, for the altitude readout and the profile under the progress bar.
const ALT_LIPU = [[P.delhi, 216], [P.tanakpur, 260], [P.champawat, 1610], [P.pithoragarh, 1650], [P.jauljibi, 650], [P.dharchula, 915], [P.narayan, 2734], [P.budhi, 2740], [P.gunji, 3200], [P.kalapani, 3600], [P.nabhidhang, 4250], [P.lipulekh, 5100], [P.taklakot, 3900], [P.gurlaLa, 4800], [P.chiu, 4600], [P.qugu, 4600], [P.darchen, 4670], [P.tarboche, 4750], [P.dirapuk, 4900], [P.dolmaLa, 5630], [P.gauriKund, 5450], [P.zuthulphuk, 4790], [P.darchenEnd, 4670]];
const ALT_LEH = [[P.leh, 3500], [P.thiksey, 3300], [P.karu, 3400], [P.hemis, 3600], [P.upshi, 3400], [P.kiari, 3750], [P.chumathang, 3950], [P.nyoma, 4180], [P.loma, 4200], [P.hanle, 4300], [P.demchok, 4200], [P.tashigang, 4250], [P.ali, 4280], [P.gartok, 4450], [P.sutlej, 4500], [P.pastDarchen, 4650], [P.chiu, 4600], [P.qugu, 4600], [P.darchen, 4670], [P.tarboche, 4750], [P.dirapuk, 4900], [P.dolmaLa, 5630], [P.gauriKund, 5450], [P.zuthulphuk, 4790], [P.darchenEnd, 4670]];

export const SHRINES = LEH ? [...LEH_STOPS, ...LEH_SHARED] : LIPU_SHRINES;
export const ROUTE = LEH ? LEH_ROUTE : LIPU_ROUTE;
export const PASSING = LEH ? LEH_PASSING : LIPU_PASSING;
export const CITIES = LEH ? LEH_CITIES : LIPU_CITIES;
// The Indus and Hanle river lines are coarse, and the road up the valley weaves across them; drawn as they are
// they ran over the tarmac and threw up bridges in the middle of the valley. Densify each, and keep it on one bank
// of the road, at least a road and a bank away from it, crossing only where it has gone well over to the far side.
function offRoad(rivers, ways) {
	const segsR = [];
	for (const c of ways) for (let i = 0; i < c.pts.length - 1; i++) segsR.push([c.pts[i], c.pts[i + 1]]);
	const near = (x, y) => {
		let best = null;
		for (const [a, b] of segsR) {
			const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12;
			const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
			const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(x - px, y - py);
			if (!best || d < best.d) {
				const l = Math.sqrt(l2), nx = -dy / l, ny = dx / l;
				best = { d, px, py, nx, ny, side: Math.sign((x - px) * nx + (y - py) * ny) || 1 };
			}
		}
		return best;
	};
	const MIN = 0.075, FLIP = 0.3;
	return rivers.map((r) => {
		const out = [];
		let cur = 0;
		for (let i = 0; i < r.pts.length - 1; i++) {
			const a = r.pts[i], b = r.pts[i + 1];
			const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.02));
			for (let k = 0; k < n || (i === r.pts.length - 2 && k === n); k++) {
				const x = a[0] + (b[0] - a[0]) * (k / n), y = a[1] + (b[1] - a[1]) * (k / n);
				const q = near(x, y);
				if (!cur || (q.side !== cur && q.d > FLIP)) cur = q.side;
				const d = q.side === cur ? Math.max(q.d, MIN) : MIN;
				out.push(q.d > FLIP && q.side === cur ? [x, y] : [q.px + q.nx * cur * d, q.py + q.ny * cur * d]);
			}
		}
		return { ...r, pts: out };
	});
}
export const RIVERS = LEH ? [...offRoad(INDUS.slice(0, 2), LEH_ROUTE), INDUS[2], ...LIPU_RIVERS.filter((r) => r.pts.some(([lo, la]) => lo > 80.8 && la > 30.2))] : LIPU_RIVERS;
export const ALTS = LEH ? ALT_LEH : ALT_LIPU;
export const START_NAME = LEH ? "Leh" : "Delhi";
