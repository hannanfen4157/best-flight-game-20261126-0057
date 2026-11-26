// A tiny seeded random number generator (mulberry32) and the terrain height
// function. Both are pure and deterministic: the same seed always builds the
// same hills, fields, trees, clouds and ring course, which is what makes the
// screenshot scenes reproducible from a ?seed= query.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth bump centred at (cx, cz) with peak height `h` and width `w`. */
function bump(x, z, cx, cz, h, w) {
  const dx = (x - cx) / w;
  const dz = (z - cz) / w;
  const d2 = dx * dx + dz * dz;
  return d2 > 9 ? 0 : h * Math.exp(-d2);
}

// Hill centres are fixed by the seed the world is built with, so the terrain
// is the same every run for that seed.
let hills = [];
export function buildHills(seed) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  hills = [];
  for (let i = 0; i < 26; i += 1) {
    const side = rand() > 0.5 ? 1 : -1;
    hills.push({
      x: side * (90 + rand() * 420),
      z: -120 + rand() * 1900,
      h: 10 + rand() * 24,
      w: 90 + rand() * 160,
    });
  }
}

/**
 * Terrain height in feet at world (x, z). The runway corridor is flat ground:
 * |x| < 48 and z within the runway's neighbourhood is graded to zero so the
 * aircraft can take off and land on it. Everywhere else rolling farmland
 * rises and falls, with seeded hills on top.
 */
export function terrainHeight(x, z) {
  const flatCorridor = Math.abs(x) < 48 && z > -80 && z < 650;
  if (flatCorridor) {
    // Feather the edges of the graded strip so it meets the fields smoothly.
    const edge = Math.max(0, (Math.abs(x) - 34) / 14);
    const base =
      7 * Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.013) +
      4 * Math.sin(x * 0.047) * Math.sin(z * 0.019 + 0.6) +
      3 * Math.sin((x + z) * 0.008 + 2.2);
    return base * edge * edge;
  }
  let h =
    7 * Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.013) +
    4 * Math.sin(x * 0.047) * Math.sin(z * 0.019 + 0.6) +
    3 * Math.sin((x + z) * 0.008 + 2.2);
  for (let i = 0; i < hills.length; i += 1) {
    h += bump(x, z, hills[i].x, hills[i].z, hills[i].h, hills[i].w);
  }
  return h;
}

/** Field colour band for a ground cell, from its height and a checkerboard. */
export function fieldShade(x, z, rand) {
  const h = terrainHeight(x, z);
  const checker = (Math.floor(x / 90) + Math.floor(z / 90)) % 2 === 0;
  if (h > 22) return 3; // high ground reads as wooded
  if (h > 12) return checker ? 1 : 0;
  return rand() > 0.72 ? 2 : checker ? 0 : 1; // wheat, pasture, pasture
}
