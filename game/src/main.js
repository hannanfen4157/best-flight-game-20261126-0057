// Sky Courier — Golden Hour Run: the bootstrap and the game loop.
// Owns the screen state (title, flying, landed, crashed), reads the input,
// steps the flight model and the mission, and hands each frame to the
// renderer. With ?shot=cover|play|end&seed=N in the URL it stages a
// deterministic screenshot scene instead of the title screen.
import { STEP, SCREEN } from './config.js';
import { buildHills } from './rng.js';
import { createInput } from './input.js';
import { createPlane, stepFlight, outOfBounds } from './flight.js';
import { createMission, checkRing, stepMission, targetRing } from './world.js';
import { createAudio } from './audio.js';
import { drawGame } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? '7') || 7;

buildHills(seed);

let state;
let shotMode = false;
if (shotName) {
  state = stageShot(shotName, seed);
  shotMode = true;
} else {
  state = {
    plane: createPlane(),
    mission: createMission(seed),
    screen: SCREEN.title,
    time: 0,
  };
}

const input = createInput(canvas);
const audio = createAudio();

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function announce(text) {
  statusEl.textContent = text;
}

function startFlying() {
  const { plane, mission } = state;
  if (state.screen !== SCREEN.title) return;
  state.screen = SCREEN.play;
  mission.started = true;
  mission.message = 'Full throttle — W to climb out!';
  mission.messageUntil = state.time + 4;
  audio.unlock();
  audio.takeoff();
  announce('Flying. Fly through the golden rings, then land on the runway.');
}

function restart() {
  buildHills(seed);
  state = {
    plane: createPlane(),
    mission: createMission(seed),
    screen: SCREEN.title,
    time: state.time,
  };
  announce('Sky Courier. Press Enter to fly.');
}

function frame(now) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  input.poll();
  const pressed = input.takePressed();

  if (!shotMode) {
    if (pressed.has('Enter') || pressed.has('MouseClick')) {
      if (state.screen === SCREEN.title) startFlying();
    }
    if (pressed.has('KeyR') && (state.screen === SCREEN.win || state.screen === SCREEN.crash)) {
      restart();
    }
    if (pressed.has('KeyM')) {
      const muted = audio.toggleMute();
      state.mission.message = muted ? 'Sound off (M to turn on)' : 'Sound on';
      state.mission.messageUntil = state.time + 2;
    }

    if (state.screen === SCREEN.play) {
      const { plane, mission } = state;
      // The engine hums with the throttle; the pilot only steers while flying.
      audio.setEngine(plane.throttle, plane.speed, plane.airborne);
      const stick = {
        bank: input.bank,
        pitch: input.pitch,
        throttleUp: input.throttleUp,
        throttleDown: input.throttleDown,
      };
      const event = stepFlight(plane, stick);
      state.time += STEP;
      mission.timeSeconds += STEP;
      if (event === 'takeoff') {
        mission.message = 'Airborne! Climb to the first ring.';
        mission.messageUntil = state.time + 3;
        audio.takeoff();
      }
      if (checkRing(mission, plane)) {
        stepMission(mission, plane, 'ring', state.time);
        audio.ring();
      }
      if (event === 'landed') {
        stepMission(mission, plane, 'landed', state.time);
        state.screen = SCREEN.win;
        mission.best = Math.max(mission.best, mission.score);
        audio.landed();
        announce(`Mission complete. Score ${mission.score}. Press R to fly again.`);
      }
      if (event === 'crash') {
        state.screen = SCREEN.crash;
        audio.crash();
        announce(`Crashed. ${plane.crashReason} Press R to try again.`);
      }
      if (outOfBounds(plane) && state.screen === SCREEN.play) {
        mission.message = 'You are leaving the valley — turn back!';
        mission.messageUntil = state.time + 2;
      }
      if (plane.fuel <= 0 && plane.airborne) {
        mission.message = 'Fuel empty — glide to the runway!';
        mission.messageUntil = state.time + 2;
      }
      const ring = targetRing(mission);
      if (ring && state.screen === SCREEN.play && state.time > mission.messageUntil) {
        const dx = ring.x - plane.x;
        const dz = ring.z - plane.z;
        const dist = Math.round(Math.hypot(dx, ring.y - plane.y, dz));
        if (dist < 400) {
          mission.message = `Ring ${mission.nextRing + 1} ahead — ${dist} ft`;
          mission.messageUntil = state.time + 1.5;
        }
      }
    } else {
      state.time += STEP;
      // On the title screen the propeller still turns: the scene is alive.
      if (state.screen === SCREEN.title) {
        const { plane } = state;
        plane.throttle = 0.12;
      }
    }
  } else {
    // A staged screenshot scene: the frame is frozen at the staged moment,
    // with only the propeller and the light moving.
    state.time += STEP;
  }

  drawGame(ctx, w, h, state);
  requestAnimationFrame(frame);
  void now;
}

announce('Sky Courier, Golden Hour Run. Press Enter to fly.');
requestAnimationFrame(frame);
