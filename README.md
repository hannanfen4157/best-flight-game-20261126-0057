# Sky Courier — Golden Hour Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/hannanfen4157/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/hannanfen4157/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A complete, original flight game that plays offline in a desktop browser
from its own static files — no build step, no network request, no library.

You are the courier pilot of **N7SKY**, a red-and-cream prop plane, on a
golden-hour run over a river valley of farmland and wooded hills. Take off
from the runway, fly the course of eight glowing golden rings in order, mind
your fuel and your airspeed, and bring her home: land gently on the same
runway you left, lined up and slow, for the landing bonus. Fly too slow and
she stalls; fly into a hill and the sortie is over.

## How to play

Serve `game/` and open it in desktop Chrome, or just run `node serve.ts`
and open <http://localhost:8080>.

| Control | What it does |
| --- | --- |
| W / S | Throttle up / down |
| A / D or ← / → | Bank left / right (banking turns the nose) |
| ↑ / ↓ | Pitch up / down |
| Mouse | Move to steer — left/right banks, up/down pitches |
| Enter or click | Start flying from the title screen |
| R | Fly again after a landing or a crash |
| M | Mute / unmute the engine and chimes |

## Scoring

- Each golden ring: **+100**
- Landing on the runway after the full course: **+500**, plus a time bonus
  for beating the 4-minute par and a fuel bonus for what is left in the tank
- Landing early ends the sortie with the rings you flew, but no landing bonus
- Crashing ends the sortie with the rings you flew

The instruments are lit and live: an attitude ball, an altimeter dial, an
airspeed dial, a heading tape, fuel and throttle bars, and big digital
**ALT / SPD / HDG** readouts. The HUD also shows your score, rings flown,
mission timer, the distance to the next ring, and warnings for stall, low
fuel and leaving the valley.

## Files

- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  `main.js` (loop and screens), `flight.js` (the flight model), `world.js`
  (the ring course and scoring), `render.js` (the chase camera, terrain,
  runway, rings, aircraft and instruments), `shots.js` (the deterministic
  screenshot scenes), `input.js`, `audio.js` (synthesised sound, no files),
  `rng.js` (seeded random numbers and the terrain), `config.js`.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.
- `shots.json` — the three deterministic screenshot scenes
  (`?shot=cover|play|end&seed=N`).
- `screenshots/` — real renders of the game's own code in a browser.

## License

MIT — see [LICENSE](LICENSE).
