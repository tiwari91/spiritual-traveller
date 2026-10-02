# Spiritual Traveller

A quiet pilgrimage across India in the browser. You set out from Pune with a small clay lamp and travel to four of the great shrines: Bhimashankar in the Sahyadri, Tirumala above Tirupati, and Kedarnath and Badrinath in the Garhwal Himalaya. At each one the journey pauses for darshan.

**Travel it:** https://tiwari91.github.io/spiritual-traveller/

## The route

1. **Pune to Bhimashankar** (by road, about 110 km): at dawn, up through Rajgurunagar into the monsoon forest on the crest of the Western Ghats.
2. **Bhimashankar to Tirumala** (by rail and road): south across the Deccan via Solapur, Hyderabad and Kurnool to the seven hills of the Seshachalam range.
3. **Tirumala to Kedarnath** (by rail and road, then on foot): north through the night across the Deccan and the Gangetic plain to Delhi, Haridwar and Rishikesh, up the Alaknanda and the Mandakini, and the last 16 km on foot from Gaurikund.
4. **Kedarnath to Badrinath** (by road, about 220 km): back down the Mandakini to Rudraprayag, then up the Alaknanda past Chamoli and Joshimath.

The order starts with the shrine nearest Pune, takes Tirumala while still in the south (it is open all year), and ends in the Himalaya, where Kedarnath comes before Badrinath as in the Char Dham yatra. The two Himalayan temples are only open from about May until Diwali.

## The shrines

- **Bhimashankar**: a black basalt Nagara temple with a curved, ribbed shikhara, an amalaka and a gold kalash, the great bell under its arch, all in a rain-soaked forest with mist on the ridge.
- **Tirumala**: the gold vimana of the Ananda Nilayam inside the prakara wall, the white tiered gopuram of the Mahadwaram, the golden dhvajastambha and the seven forested hills around.
- **Kedarnath**: a grey stone temple with a stepped shikhara and pyramidal mandapa roof, Nandi at the door and the Bhim Shila boulder behind, under a ring of snow peaks at dawn, with a little snow falling.
- **Badrinath**: the bright painted facade in red, blue, green and yellow with three gilded cupolas, the gilded roof behind, the steaming Tapt Kund and a footbridge over the Alaknanda, with Neelkanth and the Nar and Narayan ranges above.

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

A static site with no build step. Serve the folder over HTTP (ES modules do not load from `file://`):

```sh
cd spiritual-traveller
python3 -m http.server 8000
# open http://localhost:8000/
```

URL parameters: `?shrine=1..4` opens at a darshan, `?h=18.5` fixes the hour, `?wx=clear|monsoon|snow` sets the weather, `?q=low|high` picks the quality preset (low is the default on phones), `?auto=1` moves on from each darshan by itself after a short pause.

three.js r160 comes from jsDelivr through an import map; fonts come from Google Fonts. Everything else, including the map, is generated in the page.

## A note on accuracy

The map is a stylised India with greatly exaggerated relief (the Himalaya would otherwise be a thin crease), and the shrines are drawn hundreds of times larger than life so they can be seen. Around Kedarnath and Badrinath the relief is softened so the snow peaks can be framed from the temple. Shrine positions, rivers and the route corridors are approximate but true to the real geography; distances shown are along the drawn line. Seasons and access change, so check the temple boards and the Uttarakhand yatra registration before travelling.

## Tests

`tests/check.mjs` serves the folder, loads it in headless Chromium with Playwright, travels to every shrine, checks the darshan cards and controls, requires a clean console, and saves screenshots at desktop and phone sizes to `tests/shots/`.

```sh
node tests/check.mjs     # needs playwright available to Node
```

## License

MIT
