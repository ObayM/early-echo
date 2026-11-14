# Early Echo

NASA Space Apps Cairo 2026, challenge Flame in Freefall. Team: Obay, Omar and Habiba.

- Website: https://earlyecho.obayy.dev
- Android app: https://earlyecho.obayy.dev/app

## What it is

The website puts NASA's microgravity fire test records in one place: 1,939 records from 18 experiments in NASA's Physical Sciences Informatics archive. It ranks groups of similar tests by how often the flame went out and maps every flame by oxygen and pressure. It also has small models that predict which flames go out, and a reader for NASA's flame videos.

The Android app turns two phones into a heat alarm. The phones send a short sound to each other and time it. Sound travels faster in warm air, so a flame between them makes the sound arrive early. Timing it in both directions cancels out wind and the offset between the two phones' clocks.

## Testing

We put a real candle under a sound line and timed it one way with one laptop. The sound arrived 2 to 4 µs early at one microphone and 1 to 2 µs early at the other. The app passes nine simulated tests. The phones haven't been tested on a real flame yet.

## Folders

| Folder | Contents |
|---|---|
| `src/`, `public/` | The website (React, TypeScript, Vite, three.js) and the data, models and textures it loads |
| `data/` | NASA's per-test tables from psi.nasa.gov |
| `build/` | `build_data.py`, which turns the tables into `public/data` |
| `analysis/` | The flame models, the NASA video reader and the candle export |
| `results/` | The list of NASA videos matched to tests, read by the video scripts |
| `phone/` | The Android app (Kotlin) and its tests |

## Running it

Website, with Node.js 20.19 or 22.12 and newer:

```
npm install
npm run dev
npm run build
```

Data, with Python 3:

```
python3 build/build_data.py
python3 analysis/flame_model.py
```

The analysis scripts need numpy and scikit-learn, and the video reader also needs ffmpeg.

Android app, with the Android SDK and `sdk.dir=...` in `phone/local.properties`:

```
phone/build.sh
phone/build.sh testDebugUnitTest
```

The first command builds the APK into `phone/dist/`. The second runs the unit tests.

## Credits

- NASA Physical Sciences Informatics (psi.nasa.gov): the experiment records, test tables and flame videos (public domain).
- NASA 3D Resources (science.nasa.gov): the space station models, the Earth and Moon models and the Mars colour map.
- Poly Haven (polyhaven.com): the table model and the ground texture (CC0).
- Inter typeface (SIL Open Font License).
- Claude (Anthropic) helped with the implementation.
