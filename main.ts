// Sky Courier — Golden Hour Run: the entry program (Node 22, standard library
// only). It hands the game in: it copies this directory's game/ and
// screenshots/ to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The dossier's cover is the first screenshot by name, so an entry with no
// screenshots is not an entry at all: fail here with a plain message rather
// than halfway through the library's build.
const shotsDir = join(here, 'screenshots');
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.'))
  : [];
if (shots.length === 0) {
  throw new Error('main.ts: screenshots/ holds no image: take the screenshots first (see shots.json)');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A short summary, so a run's result is visible without opening the output.
const gameFiles = readdirSync(join(out, 'game'), { recursive: true });
console.log(
  `Sky Courier handed in: ${gameFiles.length} game files, ${shots.length} screenshots (${shots.join(', ')}), dossier.json written to ${out}`,
);
