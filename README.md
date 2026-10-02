# Spiritual Traveller

A quiet pilgrimage across India in the browser. You set out from Pune as a pilgrim in a saffron kurta, with a staff and a lit clay diya, and travel to four of the great shrines: Bhimashankar in the Sahyadri, Tirumala above Tirupati, and Kedarnath and Badrinath in the Garhwal Himalaya. At each one you step off the road, walk up to the door among the other pilgrims, and the journey pauses for darshan while you offer aarti.

**Travel it:** https://tiwari91.github.io/spiritual-traveller/

## The route

1. **Pune to Bhimashankar** (by motorbike, about 110 km): at dawn, up through Rajgurunagar into the monsoon forest on the crest of the Western Ghats.
2. **Bhimashankar to Tirumala** (by taxi, train and taxi): down to Pune station, then the train south across the Deccan via Solapur, Hyderabad and Kurnool to Tirupati, and a taxi up the ghat road to the seven hills.
3. **Tirumala to Kedarnath** (by train and jeep, then on foot): the train north through the night across the Deccan and the Gangetic plain to Delhi, Haridwar and Rishikesh, a jeep up the Alaknanda and the Mandakini to Gaurikund, and the last 16 km on foot.
4. **Kedarnath to Badrinath** (by jeep, about 220 km): back down the Mandakini to Rudraprayag, then up the Alaknanda past Chamoli and Joshimath.

The order starts with the shrine nearest Pune, takes Tirumala while still in the south (it is open all year), and ends in the Himalaya, where Kedarnath comes before Badrinath as in the Char Dham yatra. The two Himalayan temples are only open from about May until Diwali.

## The shrines

- **Bhimashankar**: a black basalt Nagara temple in rain-streaked, mossy stone, its curved shikhara clustered with smaller spires (urushringas), a stepped hall roof and a pillared porch, Nandi at the door, the great bell in its pavilion and a stone deepmala, all in a monsoon forest.
- **Tirumala**: the gilded Ananda Nilayam with its parapets of miniature shrines and round dome, inside an inner enclosure; the five-tier Mahadwaram gopuram on a granite base with its row of kalashas; red-and-white striped prakara walls, pillared colonnades, the golden dhvajastambha and balipitham, and the seven forested hills around.
- **Kedarnath**: a coursed grey granite temple with a curved shikhara, a mandapa roofed in stepped stone slabs with snow on every ledge, a carved gable over a brass-framed door hung with bells and marigolds, a seated Nandi and the Bhim Shila boulder behind, under a ring of snow peaks at dawn.
- **Badrinath**: the painted Singhdwar in red, blue, green and yellow with cusped arches, banded side towers and gilded onion domes, the gilded roof behind, steps down to the steaming Tapt Kund, a flag-hung footbridge over the Alaknanda and the bazaar's tin-roofed houses, with Neelkanth and the Nar and Narayan ranges above.

Each darshan card gives the deity, altitude, best season, how pilgrims usually get there (the Kedarnath trek and helicopters, the Alipiri and Srivari Mettu footpaths, and so on), a short note, and the greeting: Om Namah Shivaya at the two Jyotirlingas, Om Namo Venkatesaya at Tirumala and Om Namo Narayanaya at Badrinath.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Pause or continue; next darshan | Space or Enter | play button, Continue |
| Go to a shrine | 1 to 4 | pin menu or the progress bar |
| Start again from Pune | 0 | pin menu |
| Faster or slower | + and - | speed chip |
| Look around | drag, arrow keys | drag |
| Zoom | scroll, Page Up / Down | pinch |
| Reset the view | C or double-click | |
| Time of day / weather | T / W | sun and cloud chips |
| Temple sounds (drone and bells) | M | speaker button |
| Hide the panels | H | |

Time of day follows the journey (dawn at Pune, a monsoon morning at Bhimashankar, golden evening at Tirumala, night across the plains, dawn at Kedarnath) unless you pick one. Weather follows each shrine's season: monsoon rain and cloud at Bhimashankar, light snow at Kedarnath, clear skies elsewhere.

## Run it locally

Stone, plaster, the painted facade and the gopuram tiers are all textured in the page from canvas drawings, so there are still no image assets.

A static site with no build step. Serve the folder over HTTP (ES modules do not load from `file://`):

```sh
cd spiritual-traveller
python3 -m http.server 8000
# open http://localhost:8000/
```

URL parameters: `?shrine=1..4` opens at a darshan, `?h=18.5` fixes the hour, `?wx=clear|monsoon|snow` sets the weather, `?q=low|high` picks the quality preset (low is the default on phones), `?auto=1` moves on from each darshan by itself after a short pause.

three.js r160 (and its BufferGeometryUtils addon) comes from jsDelivr through an import map; fonts come from Google Fonts. Everything else, including the map, is generated in the page.

## A note on accuracy

The map is a stylised India with greatly exaggerated relief (the Himalaya would otherwise be a thin crease), and the shrines are drawn hundreds of times larger than life so they can be seen. Around Kedarnath and Badrinath the relief is softened so the snow peaks can be framed from the temple. Shrine positions, rivers and the route corridors are approximate but true to the real geography; distances shown are along the drawn line. Seasons and access change, so check the temple boards and the Uttarakhand yatra registration before travelling.

## Tests

`tests/check.mjs` serves the folder, loads it in headless Chromium with Playwright, travels to every shrine, checks the darshan cards and controls, requires a clean console, and saves screenshots at desktop and phone sizes to `tests/shots/`.

```sh
node tests/check.mjs     # needs playwright available to Node
```

## License

MIT
