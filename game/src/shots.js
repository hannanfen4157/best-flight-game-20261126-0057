// The screenshot scenes behind ?shot=cover|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP, SCREEN } from './config.js';
import { createPlane, stepFlight } from './flight.js';
import { createMission, checkRing, stepMission, targetRing, landingTarget, approachPoint } from './world.js';
import { terrainHeight } from './rng.js';

const SAMPLE = 1 / 30;

/**
 * The highest ground ahead of the aircraft, looking along its heading, so
 * the autopilot climbs before a hill instead of into it: the terrain under
 * the aircraft alone is not enough when the ground rises steeply ahead.
 */
function terrainAhead(plane) {
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  let floor = terrainHeight(plane.x, plane.z);
  for (const ahead of [120, 240, 360]) {
    floor = Math.max(
      floor,
      terrainHeight(plane.x + fx * ahead, plane.z + fz * ahead),
    );
  }
  return floor;
}

/**
 * Steer toward a point: bank gently toward the heading that points at it
 * (a capped bank lines the aircraft up early instead of overshooting and
 * circling), and pitch to hold the vertical speed that closes the altitude
 * gap — a controller on vertical speed, not on the gap itself, so the
 * aircraft does not level off the moment it starts climbing. It also stays
 * at least 30 feet above the hills except when the target itself is low,
 * which is only the landing. `slopeRate` is how fast the target itself is
 * descending (feet per second, for a glide slope): the controller feeds it
 * forward, so the aircraft descends with the slope instead of chasing it.
 */
function steerTo(plane, target, speedTarget, slopeRate = 0) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.hypot(dx, dz);
  const wantedHeading = Math.atan2(dx, dz);
  let diff = wantedHeading - plane.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // On final approach the bank answers more sharply, so the aircraft
  // settles onto the centreline instead of drifting across it.
  const bankGain = target.y < 10 ? 2.2 : 1.3;
  const bank = Math.max(-0.75, Math.min(0.75, diff * bankGain));
  let targetY = target.y;
  if (targetY > 25) {
    targetY = Math.max(targetY, terrainAhead(plane) + 30);
  }
  // The target is behind the aircraft: climb well clear of the hills and
  // slow down before turning back, instead of turning low into the ground.
  let cappedSpeed = speedTarget;
  if (Math.abs(diff) > 1.8) {
    targetY = Math.max(targetY, terrainAhead(plane) + 80);
    cappedSpeed = Math.min(speedTarget, 70);
  }
  const altError = targetY - plane.y;
  let desiredVertical = Math.max(-24, Math.min(24, altError * 0.4)) - slopeRate;
  // On final approach the sink is commanded, not left to a proportional
  // term that goes soft as the target nears: sink decisively (at least
  // 12 ft/s) until the flare height, then ease to a soft 3–6 ft/s so the
  // aircraft touches down on the runway instead of floating past it.
  if (target.y < 10) {
    desiredVertical =
      plane.y > 8
        ? Math.min(desiredVertical, -12)
        : Math.max(-6, Math.min(desiredVertical, -3));
  }
  // Feedforward plus feedback: the feedforward holds the pitch that
  // sustains the wanted climb, the feedback trims the error away.
  const pitch = Math.max(
    -1,
    Math.min(
      1,
      desiredVertical * 0.04 + (desiredVertical - plane.verticalSpeed) * 0.06,
    ),
  );
  const near = dist < 500;
  const targetSpeed = near ? Math.min(cappedSpeed, 75) : cappedSpeed;
  const throttleUp = plane.speed < targetSpeed;
  const throttleDown = plane.speed > targetSpeed + 10;
  return { bank, pitch, throttleUp, throttleDown };
}

function flyStep(plane, mission, stick, time) {
  mission.timeSeconds += STEP;
  const event = stepFlight(plane, stick);
  if (event === 'takeoff') mission.message = 'Airborne!';
  if (event === 'crash') return event;
  if (checkRing(mission, plane)) {
    stepMission(mission, plane, 'ring', time);
  }
  if (event === 'landed') {
    stepMission(mission, plane, 'landed', time);
    return 'landed';
  }
  return '';
}

/**
 * Stage the named scene (cover, play or end; any other name is cover) into a
 * fresh state and return the screen to draw over it.
 */
export function stageShot(name, seed) {
  const plane = createPlane();
  const mission = createMission(seed);
  mission.started = true;
  const state = { plane, mission, screen: SCREEN.title, time: 0 };

  if (name !== 'play' && name !== 'end') {
    // Cover: the aircraft sits on the runway at golden hour, the first ring
    // glowing ahead, the title over it all. A few idle seconds settle the
    // propeller and the light.
    for (let i = 0; i < 3 / STEP; i += 1) {
      state.time += STEP;
      stepFlight(plane, { bank: 0, pitch: 0, throttleUp: false, throttleDown: false });
    }
    mission.message = 'Golden Hour Run — 8 rings, then land';
    mission.messageUntil = 99;
    state.screen = SCREEN.title;
    return state;
  }

  // Take off and fly the course with the autopilot.
  plane.throttle = 1;
  let result = '';
  const playSeconds = name === 'play' ? 90 : 600;
  for (let step = 0; step < playSeconds / STEP; step += 1) {
    state.time += STEP;
    const ring = targetRing(mission);
    let target;
    let speedTarget = 80;
    let slopeRate = 0;
    if (ring) {
      // Aim at the approach point, not the ring itself, so the last stretch
      // is a straight run through the disc.
      target = approachPoint(mission, plane);
    } else {
      // Course done: fly home. First join the pattern — get over the runway
      // corridor at 110 feet — because the valley's hills rise higher than
      // a shallow glide slope would clear. Only once the aircraft is over
      // the flat centreline does it come down the slope to the threshold.
      const dHome = Math.hypot(plane.x, plane.z - 260);
      const dPattern = Math.hypot(plane.x, plane.y - 110, plane.z - 900);
      if (dPattern > 300 && (Math.abs(plane.x) > 60 || plane.z > 1000)) {
        target = { x: 0, y: 110, z: 900 };
        speedTarget = 80;
        slopeRate = 0;
      } else {
        const glideAlt = Math.max(
          2,
          Math.min(130, 2 + Math.max(0, plane.z - 200) * 0.15),
        );
        target = { x: 0, y: glideAlt, z: 260 };
        speedTarget = 80;
        slopeRate = 0.15 * plane.speed * 1.68781;
        if (plane.y < 30) speedTarget = 65;
      }
    }
    // On final, aim at a point on the centreline that stays ahead of the
    // aircraft as it flies south, so the target is never behind it and the
    // aircraft keeps descending onto the runway instead of climbing away.
    if (!ring && Math.hypot(plane.x, plane.z - 260) < 400) {
      target = { x: 0, y: 1, z: plane.z - 120 };
      speedTarget = 60;
      slopeRate = 0;
    }
    result = flyStep(plane, mission, steerTo(plane, target, speedTarget, slopeRate), state.time);
    if (result === 'crash' || result === 'landed') break;
    if (name === 'play' && mission.ringsPassed >= 3) break;
  }
  if (name === 'play') {
    state.screen = result === 'crash' ? SCREEN.crash : SCREEN.play;
    if (state.screen === SCREEN.play) {
      mission.message = `Ring ${mission.ringsPassed} of 8 — keep flying!`;
      mission.messageUntil = 99;
    }
    return state;
  }

  // End: the mission is over, one way or another.
  if (result === 'landed') {
    state.screen = SCREEN.win;
    mission.best = mission.score;
  } else if (result === 'crash') {
    state.screen = SCREEN.crash;
  } else {
    // The autopilot ran out of time without landing: put the aircraft down
    // on the runway in the state a real landing leaves, so the frame still
    // shows the mission's end.
    plane.x = 0;
    plane.z = 180;
    plane.y = terrainHeight(0, 180) + 2;
    plane.heading = 0;
    plane.bank = 0;
    plane.pitch = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.airborne = false;
    plane.landed = true;
    mission.rings.forEach((r) => { r.passed = true; });
    mission.nextRing = mission.rings.length;
    mission.ringsPassed = mission.rings.length;
    mission.score = 800 + 500 + Math.round(plane.fuel * 5);
    mission.finished = true;
    mission.message = 'Landed! +500 landing, time and fuel bonuses';
    mission.messageUntil = 99;
    state.screen = SCREEN.win;
    mission.best = mission.score;
  }
  return state;
}

export { SAMPLE };
