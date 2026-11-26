// The world: the ring course, the mission state and the score. The course
// is a loop out over the valley and back to the runway: eight golden rings
// the pilot flies through in order, then a landing on the runway they took
// off from. Ring positions come from the seed, so every seed flies a
// different course and the same seed always flies the same one.
import { PLANE, WORLD } from './config.js';
import { mulberry32, terrainHeight } from './rng.js';

export function buildCourse(seed) {
  const rand = mulberry32(seed);
  const rings = [];
  // The first ring sits on the centreline just past the runway, low and
  // easy, so the takeoff leads straight into the course; the rest weave
  // out over the valley and climb, and the last one lines the pilot up
  // with the runway for the landing approach from the north.
  for (let i = 0; i < WORLD.ringCount; i += 1) {
    const t = i / (WORLD.ringCount - 1);
    if (i === 0) {
      rings.push({ x: 0, y: 32, z: 450, radius: WORLD.ringRadius, passed: false });
      continue;
    }
    // The weave is a gentle slalom: each ring sits only a small heading
    // change from the last, so the course can be flown at cruise speed.
    const weave = 120 * Math.sin(t * 2.4);
    const z = 450 + t * (WORLD.courseLength - 450);
    const x = i === WORLD.ringCount - 1 ? 0 : weave + (rand() - 0.5) * 40;
    const altitude = 55 + t * 50 + rand() * 15;
    rings.push({
      x,
      y: altitude,
      z,
      radius: WORLD.ringRadius,
      passed: false,
    });
  }
  // Each ring faces the way the course arrives at it: its normal points
  // along the course from the previous ring (or from the runway for the
  // first), so a pass is crossing the ring's disc, not touching its centre.
  let prev = { x: 0, y: 2, z: 24 };
  for (const ring of rings) {
    const dx = ring.x - prev.x;
    const dy = ring.y - prev.y;
    const dz = ring.z - prev.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    ring.nx = dx / len;
    ring.ny = dy / len;
    ring.nz = dz / len;
    ring.prevD = null; // signed distance along the normal, last step
    prev = ring;
  }
  return rings;
}

export function createMission(seed) {
  return {
    seed,
    rings: buildCourse(seed),
    nextRing: 0,
    score: 0,
    ringsPassed: 0,
    timeSeconds: 0,
    started: false,
    finished: false,
    message: '',
    messageUntil: 0,
    best: 0,
  };
}

/** The ring the pilot is flying toward, or null once the course is done. */
export function targetRing(mission) {
  return mission.nextRing < mission.rings.length ? mission.rings[mission.nextRing] : null;
}

/**
 * Advance the mission one step: the clock, ring passes and the landing
 * bonus. Returns an event string ('ring', 'landed') or ''.
 */
export function stepMission(mission, plane, event, nowSeconds) {
  if (!mission.started || mission.finished) return '';
  // The clock lives with the caller (the loop or the shot autopilot), which
  // advances mission.timeSeconds every step; this function only scores.

  if (event === 'ring') {
    const ring = mission.rings[mission.nextRing];
    ring.passed = true;
    mission.nextRing += 1;
    mission.ringsPassed += 1;
    mission.score += WORLD.ringScore;
    if (mission.nextRing >= mission.rings.length) {
      mission.message = 'Course complete — land on the runway!';
      mission.messageUntil = nowSeconds + 6;
    } else {
      mission.message = `Ring ${mission.ringsPassed} of ${WORLD.ringCount}!`;
      mission.messageUntil = nowSeconds + 2.5;
    }
    return 'ring';
  }

  if (event === 'landed' && mission.nextRing >= mission.rings.length) {
    const timeBonus = Math.max(
      0,
      Math.round((WORLD.parTimeSeconds - mission.timeSeconds) * WORLD.timeBonusPerSecond),
    );
    const fuelBonus = Math.round(plane.fuel * WORLD.fuelBonusPerPercent);
    mission.score += WORLD.landingBonus + timeBonus + fuelBonus;
    mission.finished = true;
    mission.message = `Landed! +${WORLD.landingBonus} landing, +${timeBonus} time, +${fuelBonus} fuel`;
    mission.messageUntil = nowSeconds + 8;
    return 'landed';
  }
  if (event === 'landed') {
    // A landing before the course is done ends the sortie early: the pilot
    // keeps the rings they flew, but no landing bonus.
    mission.finished = true;
    mission.message = 'Landed early — the course was not finished.';
    mission.messageUntil = nowSeconds + 8;
    return 'landed';
  }
  return '';
}

/**
 * True when the plane flies through the next ring this step. A ring is
 * passed by crossing its disc: the signed distance along the ring's normal
 * flips from negative (approaching) to positive (through) while the
 * aircraft is inside the ring's radius in the ring's plane. A slow pass
 * that touches the centre counts too.
 */
export function checkRing(mission, plane) {
  const ring = targetRing(mission);
  if (!ring) return false;
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  const d = dx * ring.nx + dy * ring.ny + dz * ring.nz;
  const crossed = ring.prevD !== null && ring.prevD < 0 && d >= 0;
  ring.prevD = d;
  if (crossed) {
    // Distance from the ring's centre inside the ring's plane at crossing.
    const px = dx - ring.nx * d;
    const py = dy - ring.ny * d;
    const pz = dz - ring.nz * d;
    if (Math.hypot(px, py, pz) < ring.radius) return true;
  }
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return dist < ring.radius * 0.6;
}

/**
 * The point the pilot should aim at to arrive at the next ring lined up:
 * 150 feet before the ring along the course, at the ring's altitude, so
 * the last stretch is a straight run through the disc. Close in, the ring
 * itself is the aim point.
 */
export function approachPoint(mission, plane) {
  const ring = targetRing(mission);
  if (!ring) return null;
  const dx = ring.x - plane.x;
  const dy = ring.y - plane.y;
  const dz = ring.z - plane.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 360) return { x: ring.x, y: ring.y, z: ring.z };
  return {
    x: ring.x - ring.nx * 350,
    y: ring.y - ring.ny * 350,
    z: ring.z - ring.nz * 350,
  };
}

/** The runway approach point the landing autopilot aims for. */
export function landingTarget() {
  return { x: 0, y: terrainHeight(0, 260) + 6, z: 260 };
}

export { PLANE };
