// The flight model: an arcade model with enough discipline to be a game.
// Speed follows the throttle, the wings need speed to fly, bank turns the
// nose, pitch trades speed for height, and fuel is a budget the pilot spends.
// It knows nothing about drawing; render.js reads the state it leaves.
import { PLANE, STEP, WORLD } from './config.js';
import { terrainHeight } from './rng.js';

export function createPlane() {
  return {
    x: 0, // feet east of the runway centreline
    y: 2, // feet above the ground (wheels on the runway at 2)
    z: 24, // feet along the runway from its threshold
    heading: 0, // radians, 0 = north (+z), clockwise
    pitch: 0, // radians, positive = nose up
    bank: 0, // radians, positive = right wing down
    speed: 0, // knots
    throttle: 0, // 0..1
    fuel: 100, // percent
    verticalSpeed: 0, // feet per second
    airborne: false,
    crashed: false,
    crashReason: '',
    landed: false,
    distanceFlown: 0,
  };
}

/** The ground the aircraft stands on, in feet above sea level. */
export function groundAt(plane) {
  return terrainHeight(plane.x, plane.z);
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function angleToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + clamp(diff, -maxStep, maxStep);
}

/**
 * Advance the aircraft one fixed step. `stick` carries the pilot's bank and
 * pitch (-1..1), throttle up/down flags, and whether the engine still runs.
 * Returns an event string ('takeoff', 'stall', 'crash', 'landed') or ''.
 */
export function stepFlight(plane, stick, dt = STEP) {
  if (plane.crashed || plane.landed) return '';

  // Throttle: W opens it, S closes it, a dead engine coasts to idle.
  if (stick.throttleUp) plane.throttle = clamp(plane.throttle + dt * 0.9, 0, 1);
  if (stick.throttleDown) plane.throttle = clamp(plane.throttle - dt * 0.9, 0, 1);
  const engineOn = plane.fuel > 0;
  const throttle = engineOn ? plane.throttle : 0;

  // Speed chases the throttle's target, faster with power than without.
  const targetSpeed = throttle * PLANE.maxSpeed;
  if (plane.speed < targetSpeed) {
    plane.speed += PLANE.accel * dt * (0.4 + throttle);
  } else {
    plane.speed -= PLANE.drag * dt * (1.6 - throttle);
  }
  plane.speed = clamp(plane.speed, 0, PLANE.maxSpeed + 12);

  // Fuel: full throttle drinks, idle sips.
  plane.fuel = clamp(
    plane.fuel - (PLANE.fuelIdle + throttle * PLANE.fuelBurn) * dt,
    0,
    100,
  );

  // Bank and pitch ease toward what the stick asks for.
  plane.bank = angleToward(plane.bank, stick.bank * PLANE.maxBank, PLANE.bankRate * dt);
  plane.pitch = angleToward(plane.pitch, stick.pitch * PLANE.maxPitch, PLANE.pitchRate * dt);

  // A banked wing turns the nose: the tighter the bank, the faster the turn.
  plane.heading += Math.sin(plane.bank) * PLANE.turnRate * (plane.speed / PLANE.cruiseSpeed) * dt;
  while (plane.heading > Math.PI) plane.heading -= Math.PI * 2;
  while (plane.heading < -Math.PI) plane.heading += Math.PI * 2;

  // Lift: above stall speed the wings fly and pitch moves the aircraft up or
  // down; level flight near cruise speed holds altitude, slower flight needs
  // a touch of nose-up, and below stall speed the nose drops and the
  // aircraft sinks whether the pilot likes it or not.
  const flying = plane.airborne || plane.speed > PLANE.stallSpeed;
  let vertical = 0;
  if (flying) {
    const lift = clamp((plane.speed - PLANE.stallSpeed) / 50, 0, 1.3);
    vertical =
      Math.sin(plane.pitch) * PLANE.climbRate * (0.5 + lift) + (lift - 0.75) * 12;
    if (plane.speed < PLANE.stallSpeed) {
      vertical -= PLANE.sinkRate * 0.7;
      plane.pitch = angleToward(plane.pitch, -0.22, PLANE.pitchRate * dt);
    }
  }
  plane.verticalSpeed = vertical;

  // Move forward along the heading, and up or down by the vertical speed.
  const forward = plane.speed * 1.68781 * dt; // knots -> feet per second
  const wasAirborne = plane.airborne;
  plane.x += Math.sin(plane.heading) * forward;
  plane.z += Math.cos(plane.heading) * forward;
  plane.y += vertical * dt;
  plane.distanceFlown += forward;

  const ground = groundAt(plane);
  if (!plane.airborne && plane.speed > PLANE.stallSpeed + 6 && vertical > 0) {
    plane.airborne = true;
    return 'takeoff';
  }
  if (!plane.airborne) {
    // Still rolling: the runway holds the wheels on the ground.
    plane.y = ground + 2;
    plane.pitch = clamp(plane.pitch, -0.05, 0.12);
  } else {
    if (plane.y <= ground + 2) {
      // Touching down: a gentle, slow, runway-aligned arrival is a landing,
      // anything else is a crash.
      const onRunway =
        Math.abs(plane.x) <= PLANE.runwayHalfWidth &&
        plane.z >= PLANE.runwayStart - 10 &&
        plane.z <= PLANE.runwayEnd + 60;
      const aligned =
        Math.abs(Math.sin(plane.heading)) < 0.35 && Math.abs(plane.bank) < 0.35;
      const gentle = plane.verticalSpeed > -14 && plane.speed < 105;
      plane.y = ground + 2;
      if (onRunway && aligned && gentle) {
        plane.landed = true;
        plane.airborne = false;
        plane.speed = Math.max(0, plane.speed - 60 * dt);
        return 'landed';
      }
      plane.crashed = true;
      plane.crashReason = onRunway
        ? 'Landed too hard — the undercarriage gave way.'
        : 'Flew into the ground.';
      return 'crash';
    }
  }
  if (wasAirborne && !plane.airborne && plane.speed < 20) {
    plane.speed = 0;
  }
  // Straying far from the course is not a crash, but the HUD will warn.
  return '';
}

/** Heading in degrees, 0 = north, clockwise, for the compass and HUD. */
export function headingDegrees(plane) {
  const deg = ((plane.heading * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

/** True if the aircraft is outside the valley the course stays in. */
export function outOfBounds(plane) {
  return (
    Math.abs(plane.x) > WORLD.courseHalfWidth + 240 ||
    plane.z > WORLD.courseLength + 500 ||
    plane.z < -320
  );
}
