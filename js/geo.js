// Geography: a coarse outline of India, major rivers, cities, the shrines and the pilgrim route.
// Coordinates are [longitude, latitude] in degrees. Projection: 1 degree = 40 world units,
// x grows east from 82E, z grows south from 22N (so north is -z).
export const SCALE = 40;
export const ORIGIN = { lon: 82, lat: 22 };

export function toWorld(lon, lat) {
	return { x: (lon - ORIGIN.lon) * SCALE, z: -(lat - ORIGIN.lat) * SCALE };
}
export function toGeo(x, z) {
	return { lon: x / SCALE + ORIGIN.lon, lat: -z / SCALE + ORIGIN.lat };
}

// Mainland outline, clockwise from the Rann of Kutch. Simplified to about 90 vertices.
export const INDIA = [
	[68.2, 23.6], [68.8, 24.3], [70.1, 24.4], [70.8, 25.7], [70.3, 26.8], [69.6, 27.3], [70.5, 28.0], [71.9, 28.0], [72.9, 29.0],
	[73.4, 30.0], [74.6, 31.0], [74.5, 32.0], [75.3, 32.9], [74.3, 33.9], [73.9, 34.6], [74.8, 35.6], [76.3, 35.9], [77.8, 35.5],
	[78.5, 34.4], [79.4, 33.0], [78.8, 31.5], [79.3, 30.9], [80.4, 30.4], [81.0, 30.2], [80.4, 29.4], [80.1, 28.8], [81.3, 28.1],
	[82.6, 27.6], [84.1, 27.3], [85.4, 26.8], [86.8, 26.5], [88.1, 26.5], [88.2, 27.9], [88.9, 27.9], [89.4, 26.9], [90.5, 26.8],
	[92.1, 26.9], [92.0, 27.8], [93.0, 28.4], [94.4, 29.3], [95.5, 29.5], [97.2, 28.4], [96.2, 27.3], [95.2, 26.6], [94.7, 25.3],
	[94.2, 24.0], [93.4, 22.5], [92.6, 22.1], [92.3, 23.1], [91.5, 24.1], [90.1, 25.2], [89.8, 26.0], [88.4, 26.3], [88.1, 25.3],
	[88.9, 24.6], [88.7, 23.6], [89.0, 22.3], [88.3, 21.6], [87.1, 21.5], [86.7, 20.4], [85.6, 19.8], [84.6, 18.9], [83.6, 18.0],
	[82.4, 17.0], [81.3, 16.3], [80.3, 15.8], [80.2, 14.5], [80.3, 13.3], [80.0, 12.1], [79.8, 10.9], [79.8, 10.3], [79.3, 9.3],
	[78.5, 8.9], [77.6, 8.1], [76.7, 8.7], [76.3, 9.8], [75.9, 11.0], [75.3, 11.9], [74.8, 13.0], [74.4, 14.6], [73.8, 15.6],
	[73.4, 16.9], [73.0, 18.4], [72.8, 19.3], [72.7, 20.4], [72.8, 21.2], [72.5, 21.9], [72.1, 21.4], [71.4, 20.8], [70.7, 20.8],
	[69.9, 21.5], [69.1, 22.4], [69.7, 22.8], [70.4, 22.9], [69.9, 23.1], [69.0, 23.0], [68.4, 23.3],
];
// Sri Lanka, to keep the southern sea honest.
export const LANKA = [[79.9, 9.8], [80.5, 9.6], [81.3, 8.5], [81.9, 7.4], [81.6, 6.3], [80.6, 5.9], [80.0, 6.4], [79.7, 7.9], [79.8, 9.0]];

// Neighbouring land (Pakistan, Nepal, Tibet, Bhutan, Bangladesh, Myanmar), drawn muted so the subcontinent
// reads as one landmass while India stays in focus. Traced along the Arabian Sea and Bay of Bengal coasts.
export const NEIGHBOURS = [
	[68.2, 23.6], [67.4, 23.8], [66.6, 25.4], [64.5, 25.2], [61.5, 25.1], [60.0, 25.3], [60.0, 40.0], [100.0, 40.0], [100.0, 16.0],
	[98.6, 16.2], [97.7, 16.6], [97.2, 17.0], [95.4, 15.8], [94.3, 16.0], [94.6, 17.6], [94.2, 19.0], [93.6, 19.8], [92.8, 20.6],
	[92.3, 21.4], [92.0, 21.6], [91.8, 22.4], [91.3, 22.6], [90.6, 22.2], [90.2, 21.9], [89.6, 21.9], [89.1, 21.7], [88.9, 22.4],
	[88.0, 23.2], [72.5, 24.0],
];

// Major rivers as polylines.
export const RIVERS = [
	{ name: "Ganga", w: 1.6, pts: [[78.2, 30.1], [78.0, 29.2], [78.5, 27.6], [80.3, 26.5], [81.8, 25.4], [83.0, 25.3], [85.1, 25.6], [87.4, 25.2], [88.2, 24.5], [88.5, 23.0], [88.3, 21.7]] },
	{ name: "Yamuna", w: 1.1, pts: [[78.4, 31.0], [77.3, 29.5], [77.2, 28.6], [78.0, 27.2], [79.9, 25.9], [81.8, 25.4]] },
	{ name: "Godavari", w: 1.2, pts: [[73.8, 19.9], [75.5, 19.3], [77.4, 19.0], [79.6, 18.8], [80.8, 18.1], [81.8, 17.1], [82.3, 16.7]] },
	{ name: "Krishna", w: 1.1, pts: [[73.8, 17.4], [75.6, 16.7], [77.5, 16.3], [79.0, 16.3], [80.4, 16.1], [81.0, 15.9]] },
	{ name: "Narmada", w: 1.0, pts: [[81.7, 22.7], [79.9, 22.8], [77.0, 22.5], [75.0, 22.3], [73.2, 21.7]] },
	{ name: "Kaveri", w: 0.9, pts: [[75.6, 12.4], [76.7, 12.3], [77.6, 12.1], [78.6, 10.9], [79.4, 10.8]] },
	{ name: "Mahanadi", w: 0.9, pts: [[81.8, 20.2], [83.5, 20.4], [85.0, 20.4], [86.4, 20.3]] },
	{ name: "Brahmaputra", w: 1.5, pts: [[95.0, 28.0], [94.2, 27.5], [92.5, 26.7], [90.5, 26.2], [89.7, 25.6]] },
	{ name: "Indus", w: 0.9, pts: [[78.5, 33.5], [76.5, 34.6], [74.8, 35.0]] },
	{ name: "Alaknanda", w: 0.6, pts: [[79.58, 30.80], [79.58, 30.744], [79.575, 30.66], [79.56, 30.55], [79.33, 30.40], [78.98, 30.28], [78.60, 30.15], [78.29, 30.09]] },
	{ name: "Mandakini", w: 0.5, pts: [[79.10, 30.70], [79.06, 30.66], [79.02, 30.62], [79.02, 30.45], [78.98, 30.28]] },
];

// Towns the route passes through, for labels and little lamp clusters.
export const CITIES = [
	{ name: "Pune", lon: 73.86, lat: 18.52, size: 3 },
	{ name: "Solapur", lon: 75.91, lat: 17.68, size: 1 },
	{ name: "Sangamner", lon: 74.21, lat: 19.57, size: 1 },
	{ name: "Manmad", lon: 74.43, lat: 20.25, size: 1 },
	{ name: "Aurangabad", lon: 75.34, lat: 19.88, size: 2 },
	{ name: "Nanded", lon: 77.3, lat: 19.15, size: 1 },
	{ name: "Guntakal", lon: 77.37, lat: 15.17, size: 1 },
	{ name: "Hyderabad", lon: 78.49, lat: 17.39, size: 3 },
	{ name: "Kurnool", lon: 78.04, lat: 15.83, size: 1 },
	{ name: "Tirupati", lon: 79.42, lat: 13.63, size: 2 },
	{ name: "Nagpur", lon: 79.09, lat: 21.15, size: 2 },
	{ name: "Jhansi", lon: 78.57, lat: 25.45, size: 1 },
	{ name: "Delhi", lon: 77.21, lat: 28.61, size: 3 },
	{ name: "Haridwar", lon: 78.16, lat: 29.95, size: 1 },
	{ name: "Rishikesh", lon: 78.29, lat: 30.09, size: 1 },
	{ name: "Rudraprayag", lon: 78.98, lat: 30.28, size: 1 },
	{ name: "Joshimath", lon: 79.57, lat: 30.55, size: 1 },
	{ name: "Mumbai", lon: 72.88, lat: 19.08, size: 3 },
	{ name: "Bengaluru", lon: 77.59, lat: 12.97, size: 3 },
	{ name: "Chennai", lon: 80.27, lat: 13.08, size: 3 },
	{ name: "Kolkata", lon: 88.36, lat: 22.57, size: 3 },
	{ name: "Varanasi", lon: 83.0, lat: 25.32, size: 2 },
	{ name: "Jaipur", lon: 75.79, lat: 26.91, size: 2 },
	{ name: "Ahmedabad", lon: 72.57, lat: 23.02, size: 2 },
	{ name: "Lucknow", lon: 80.95, lat: 26.85, size: 2 },
	{ name: "Patna", lon: 85.14, lat: 25.59, size: 2 },
	{ name: "Bhopal", lon: 77.41, lat: 23.26, size: 2 },
	{ name: "Guwahati", lon: 91.74, lat: 26.14, size: 2 },
	{ name: "Kochi", lon: 76.27, lat: 9.93, size: 2 },
];

// The shrines, in the order of the yatra, with what the darshan card says. rest: where the traveller stands for
// darshan in the shrine's local frame (x across, z out from the door), clear of the crowd; floor: the height there;
// gate: points the traveller walks by on the way to it and back (round the outside of Tirumala's prakara wall).
export const SHRINES = [
	{
		key: "bhimashankar", name: "Bhimashankar", deva: "भीमाशंकर", lon: 73.535, lat: 19.072, facing: Math.PI / 2,
		deity: "Shiva, as the Bhimashankar Jyotirlinga", kind: "Jyotirlinga",
		state: "Pune district, Maharashtra, on the crest of the Sahyadri (Western Ghats)",
		altitude: "about 1,000 m (3,250 ft)",
		season: "October to February for clear skies; in the monsoon (June to September) the forest turns emerald and the ridge vanishes into cloud. Mahashivratri brings the biggest crowds.",
		access: "About 110 km by road from Pune via Rajgurunagar (Khed), three to four hours by car or MSRTC bus. The last climb runs through the Bhimashankar Wildlife Sanctuary.",
		note: "One of the twelve Jyotirlingas and the source of the Bhima river. The black-stone Nagara shikhara was raised in the 18th century under Nana Phadnavis, and the great bell in the courtyard is linked to Chimaji Appa. The forest around it shelters the Indian giant squirrel, the shekru, Maharashtra's state animal.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Har Har Mahadev",
		hour: 8.6, weather: "monsoon", rest: [0.5, 3.45], floor: 0.03,
	},
	{
		key: "shirdi", name: "Shirdi", deva: "शिर्डी", lon: 74.477, lat: 19.766, facing: Math.PI / 2,
		deity: "Sai Baba of Shirdi, at his samadhi", kind: "Samadhi Mandir",
		state: "Rahata taluka, Ahilyanagar (Ahmednagar) district, Maharashtra, on the dry Deccan plateau east of the Sahyadri",
		altitude: "about 504 m (1,654 ft)",
		season: "Open all year, from the Kakad aarti at dawn to the Shej aarti at 10 pm. October to March is the most comfortable; Ram Navami, Guru Purnima and Vijayadashami (Baba's Punyatithi) bring the biggest crowds.",
		access: "About 180 km by road from Bhimashankar via Manchar, Narayangaon, Sangamner and Rahata, four to five hours by taxi or MSRTC bus. Sainagar Shirdi station, a terminus on the branch from Puntamba, is about 3 km from the temple, with trains to the south such as the weekly Shirdi–Tirupati Express (17418) via Manmad and Secunderabad.",
		note: "Sai Baba lived some sixty years in Shirdi, most of them in the old mosque he called Dwarkamai, where the dhuni he kept burning still gives the udi (sacred ash). He died in 1918 and was laid to rest in the stone wada Gopalrao Buti had built, now the Samadhi Mandir; the white marble murti by Balaji Vasant Talim has sat above the samadhi since 1954. Close by are the Chavadi, where he slept on alternate nights, and Gurusthan under its neem tree, where he was first seen as a youth. The aarti is sung four times a day: Kakad at dawn, Madhyan at noon, Dhoop at sunset and Shej at night.",
		mantra: "ॐ साईं राम", mantraLatin: "Om Sai Ram", greeting: "Sabka Malik Ek",
		hour: 12.0, weather: "clear", rest: [0.35, 3.6], floor: 0.05,
	},
	{
		key: "tirupati", name: "Tirumala", deva: "तिरुमला", lon: 79.347, lat: 13.683, facing: Math.PI / 2,
		deity: "Vishnu, as Sri Venkateswara (Balaji)", kind: "Divya Desam",
		state: "Tirupati district, Andhra Pradesh, on Venkatadri, the seventh of the seven hills of the Seshachalam range",
		altitude: "about 850 m (2,800 ft)",
		season: "Open all year; September to February is the most comfortable. The Brahmotsavam festival fills the hills in September or October.",
		access: "Walk the Alipiri footpath from Tirupati town (about 3,550 steps, roughly 9 km, three to four hours) or the shorter Srivari Mettu (about 2,400 steps), or ride the 20-odd km ghat road by bus or taxi. Renigunta airport and Tirupati station are close by.",
		note: "The Ananda Nilayam, the gold-covered vimana over the sanctum, rises inside the white gopuram of the Mahadwaram with the golden dhvajastambha before it. It is one of the most visited shrines on earth; pilgrims leave with the Tirupati laddu and the cry of Govinda in their ears.",
		mantra: "ॐ नमो वेङ्कटेशाय", mantraLatin: "Om Namo Venkatesaya", greeting: "Govinda, Govinda",
		hour: 16.6, weather: "clear", rest: [0.15, 4.1], floor: 0.15, gate: [[3.75, 3.6]],
	},
	{
		key: "kedarnath", name: "Kedarnath", deva: "केदारनाथ", lon: 79.067, lat: 30.735, facing: 0,
		deity: "Shiva, as the Kedarnath Jyotirlinga", kind: "Jyotirlinga · Char Dham",
		state: "Rudraprayag district, Uttarakhand, at the head of the Mandakini valley below the Kedarnath peaks",
		altitude: "3,583 m (11,755 ft)",
		season: "Open from Akshaya Tritiya (late April or May) until Bhai Dooj after Diwali. May, June, September and October are best; the July and August monsoon brings landslides.",
		access: "The road ends at Sonprayag; shared jeeps go on to Gaurikund, then a 16 km trek climbs to the temple (six to eight hours, on foot, pony or palki). Helicopters fly from Phata, Sersi and Guptkashi. Yatra registration with the Uttarakhand government is required.",
		note: "The highest of the twelve Jyotirlingas. The Pandavas are said to have sought Shiva here; he hid as a bull and the hump remained as the lingam. The grey stone temple survived the 2013 flood behind the Bhim Shila boulder, and Adi Shankara's samadhi, rebuilt in 2021, stands behind it.",
		mantra: "ॐ नमः शिवाय", mantraLatin: "Om Namah Shivaya", greeting: "Jai Baba Kedar",
		hour: 6.7, weather: "snow", rest: [0.55, 3.75], floor: 0.05,
	},
	{
		key: "badrinath", name: "Badrinath", deva: "बद्रीनाथ", lon: 79.493, lat: 30.744, facing: Math.PI / 2,
		deity: "Vishnu, as Badri Narayan (Badri Vishal)", kind: "Char Dham · Divya Desam",
		state: "Chamoli district, Uttarakhand, on the Alaknanda between the Nar and Narayan ranges",
		altitude: "3,133 m (10,279 ft) at the temple; the town spreads up to about 3,300 m",
		season: "Open from late April or May until around November, after Diwali. May, June, September and October are the gentlest months.",
		access: "Motorable all the way: about 300 km from Rishikesh up the Alaknanda via Devprayag, Rudraprayag, Chamoli and Joshimath, and roughly 220 km by road from Kedarnath. Mana, the last village before Tibet, is 3 km beyond.",
		note: "The northern dham and the northern seat of Adi Shankara, who is said to have recovered the black shaligram image of Vishnu from the river. Pilgrims bathe in the Tapt Kund hot spring below the painted facade before darshan, with Neelkanth's snow pyramid above the valley.",
		mantra: "ॐ नमो नारायणाय", mantraLatin: "Om Namo Narayanaya", greeting: "Jai Badri Vishal",
		hour: 9.4, weather: "clear", rest: [0.25, 2.85], floor: 0,
	},
];

// Route waypoints, Pune to Badrinath. Each chapter ends at its shrine (ROUTE[i] ends at SHRINES[i]); secs is about
// how long the leg takes at 1x, which sets the pace along it.
export const ROUTE = [
	{ title: "Pune to the Sahyadri", secs: 28, kicker: "Dawn · by road", mode: "By road, 110 km", pts: [[73.86, 18.52], [73.95, 18.75], [73.93, 18.98], [73.75, 19.07], [73.535, 19.072]] },
	// back down the Bhimashankar road to Manchar, then north on the Pune–Nashik highway (NH60) to Sangamner, Loni and Rahata
	{ title: "Down the Sahyadri to Shirdi", secs: 40, kicker: "Late morning · by road", mode: "By road, about 180 km", pts: [[73.535, 19.072], [73.75, 19.07], [73.93, 18.98], [73.97, 19.12], [74.08, 19.19], [74.16, 19.4], [74.21, 19.57], [74.45, 19.59], [74.48, 19.71], [74.477, 19.766]] },
	// out of Shirdi to the east, then the line of the Shirdi–Tirupati Express (17418), drawn as a smooth sweep: Puntamba
	// (the real train runs up to Manmad and back down to Aurangabad; the drawn line cuts across), Jalna, Parbhani, Nanded,
	// Nizamabad, Secunderabad, then by Raichur, Guntakal, Gooty and Kadapa to Tirupati (past Renigunta)
	{ title: "South to the seven hills", secs: 85, overnight: true, kicker: "Overnight across the Deccan", mode: "By rail and road", pts: [[74.477, 19.766], [74.7, 19.82], [75.34, 19.88], [75.88, 19.84], [76.77, 19.27], [77.3, 19.15], [78.09, 18.67], [78.5, 17.44], [77.35, 16.2], [77.27, 15.63], [77.37, 15.17], [77.63, 15.12], [78.01, 14.91], [78.82, 14.47], [79.42, 13.63], [79.347, 13.683]] },
	{ title: "North to the Himalaya", secs: 110, kicker: "Through the night", mode: "By rail and road", pts: [[79.347, 13.683], [79.42, 13.63], [78.8, 15.0], [78.49, 17.39], [78.9, 19.3], [79.09, 21.15], [79.0, 23.3], [78.57, 25.45], [77.9, 27.2], [77.21, 28.61], [77.7, 29.3], [78.16, 29.95], [78.29, 30.09], [78.60, 30.15], [78.98, 30.28], [79.02, 30.45], [79.02, 30.62], [79.067, 30.735]] },
	{ title: "Down the Mandakini, up the Alaknanda", secs: 34, kicker: "Morning in the hills", mode: "By road, about 220 km", pts: [[79.067, 30.735], [79.02, 30.62], [79.02, 30.45], [78.98, 30.28], [79.33, 30.40], [79.57, 30.55], [79.55, 30.68], [79.493, 30.744]] },
];
// Gaurikund, where the road gives way to the 16 km footpath.
export const GAURIKUND = [79.02, 30.62];
