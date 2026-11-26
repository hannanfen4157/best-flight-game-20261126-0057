// Everything the pilot sees: a chase camera behind the aircraft, a golden
// hour sky, procedural farmland below, the runway, the golden rings, the
// aircraft itself, and a lit instrument panel with altitude, speed and
// heading. Pure 2D canvas, no images, no network — every pixel is drawn
// from the flight state each frame.
import { COLOURS, PLANE, SCREEN, WORLD } from './config.js';
import { fieldShade, terrainHeight } from './rng.js';
import { headingDegrees } from './flight.js';
import { targetRing } from './world.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? v : v;
}

/** Build the camera: behind and above the aircraft, looking ahead of it. */
function cameraFor(plane) {
  const h = plane.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const cam = {
    x: plane.x - fx * 20,
    y: plane.y + 6.5,
    z: plane.z - fz * 20,
  };
  // Look at a point ahead of the nose, a little below the aircraft.
  const look = {
    x: plane.x + fx * 34,
    y: plane.y + 1.2 - Math.sin(plane.pitch) * 8,
    z: plane.z + fz * 34,
  };
  const d = { x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  const dir = { x: d.x / len, y: d.y / len, z: d.z / len };
  // Right = dir x world-up, up = right x dir.
  let right = { x: -dir.z, y: 0, z: dir.x };
  const rl = Math.hypot(right.x, right.z) || 1;
  right = { x: right.x / rl, y: 0, z: right.z / rl };
  const up = {
    x: right.y * dir.z - right.z * dir.y,
    y: right.z * dir.x - right.x * dir.z,
    z: right.x * dir.y - right.y * dir.x,
  };
  return { pos: cam, dir, right, up, fx, fz };
}

/** Project a world point to screen space; null when behind the camera. */
function project(cam, focal, cx, cy, x, y, z) {
  const dx = x - cam.pos.x;
  const dy = y - cam.pos.y;
  const dz = z - cam.pos.z;
  const cz = dx * cam.dir.x + dy * cam.dir.y + dz * cam.dir.z;
  if (cz < 2) return null;
  const px = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const py = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return { x: cx + (px / cz) * focal, y: cy - (py / cz) * focal, d: cz };
}

function quad(ctx, a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

const FIELD_FILLS = [COLOURS.fieldA, COLOURS.fieldB, COLOURS.fieldC, COLOURS.forest];

/** The sky: a dusk gradient, a low sun and soft clouds. */
function drawSky(ctx, w, h, cam, focal, cx, cy, time) {
  // The sky fills the whole frame, so a gap the terrain does not cover at
  // the horizon reads as sky, never as the page behind the canvas.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLOURS.skyTop);
  g.addColorStop(0.45, COLOURS.skyMid);
  g.addColorStop(0.62, COLOURS.horizonGlow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Low sun, fixed in the west, so the light always comes from the same place.
  const sun = project(cam, focal, cx, cy, cam.pos.x - 2600, cam.pos.y + 260, cam.pos.z + 900);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    glow.addColorStop(0, 'rgba(255, 214, 130, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 178, 92, 0.45)');
    glow.addColorStop(1, 'rgba(255, 178, 92, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    ctx.fillStyle = COLOURS.sunCore;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, TAU);
    ctx.fill();
  }

  // A few slow clouds, placed in world space so they sit still in the sky.
  ctx.fillStyle = 'rgba(255, 246, 232, 0.7)';
  const clouds = [
    [-320, 380, 1100, 110, 18],
    [260, 420, 1400, 140, 22],
    [-120, 350, 1800, 120, 17],
    [420, 400, 900, 95, 16],
  ];
  for (const [x, y, z, cw, ch] of clouds) {
    const p = project(cam, focal, cx, cy, x, y, z);
    if (!p) continue;
    const s = clamp(900 / p.d, 0.25, 1.6);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, cw * s, ch * s, 0, 0, TAU);
    ctx.ellipse(p.x - cw * 0.45 * s, p.y + ch * 0.25 * s, cw * 0.5 * s, ch * 0.7 * s, 0, 0, TAU);
    ctx.fill();
  }
  void time;
}

/** The ground: farmland quads in camera space, far rows first. */
function drawTerrain(ctx, w, h, cam, focal, cx, cy, seedRand) {
  const depthStep = 20;
  const latStep = 24;
  const maxDepth = 460;
  // Precompute rows of projected points so each corner is projected once.
  // Each row reaches wider as it gets further away, so the ground covers
  // the whole width of the frame at every depth, not just near the camera.
  // Every row holds the same number of columns, so the quads between two
  // rows always line up.
  const rows = [];
  const COLS = 21;
  for (let d = 26; d <= maxDepth; d += depthStep) {
    const half = Math.max(240, d * 0.85);
    const row = [];
    for (let j = 0; j < COLS; j += 1) {
      const l = -half + (2 * half * j) / (COLS - 1);
      const wx = cam.pos.x + cam.fx * d + cam.right.x * l;
      const wz = cam.pos.z + cam.fz * d + cam.right.z * l;
      const wy = terrainHeight(wx, wz);
      row.push({ p: project(cam, focal, cx, cy, wx, wy, wz), x: wx, z: wz });
    }
    rows.push(row);
  }
  for (let r = rows.length - 1; r > 0; r -= 1) {
    const far = rows[r];
    const near = rows[r - 1];
    for (let i = 0; i < far.length - 1; i += 1) {
      const shade = fieldShade(near[i].x, near[i].z, seedRand);
      quad(ctx, near[i].p, near[i + 1].p, far[i + 1].p, far[i].p, FIELD_FILLS[shade]);
    }
  }
  // Tree dots on the high ground: small dark triangles where the shade is wood.
  ctx.fillStyle = COLOURS.forest;
  for (let i = 0; i < 60; i += 1) {
    const d = 40 + seedRand() * 380;
    const l = (seedRand() - 0.5) * 440;
    const wx = cam.pos.x + cam.fx * d + cam.right.x * l;
    const wz = cam.pos.z + cam.fz * d + cam.right.z * l;
    if (terrainHeight(wx, wz) < 20) continue;
    const p = project(cam, focal, cx, cy, wx, terrainHeight(wx, wz) + 2, wz);
    if (!p) continue;
    const s = clamp(500 / p.d, 1.5, 9);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 2);
    ctx.lineTo(p.x - s, p.y + s);
    ctx.lineTo(p.x + s, p.y + s);
    ctx.closePath();
    ctx.fill();
  }
}

/** The runway: dark strip with centreline dashes and threshold bars. */
function drawRunway(ctx, cam, focal, cx, cy) {
  const half = PLANE.runwayHalfWidth;
  for (let z = PLANE.runwayStart; z < PLANE.runwayEnd; z += 16) {
    const y = terrainHeight(0, z) + 0.4;
    const a = project(cam, focal, cx, cy, -half, y, z);
    const b = project(cam, focal, cx, cy, half, y, z);
    const c = project(cam, focal, cx, cy, half, y, z + 16);
    const d = project(cam, focal, cx, cy, -half, y, z + 16);
    quad(ctx, a, b, c, d, COLOURS.runway);
    if (Math.floor(z / 32) % 2 === 0) {
      const e = project(cam, focal, cx, cy, -1.1, y + 0.1, z + 3);
      const f = project(cam, focal, cx, cy, 1.1, y + 0.1, z + 3);
      const g = project(cam, focal, cx, cy, 1.1, y + 0.1, z + 13);
      const hh = project(cam, focal, cx, cy, -1.1, y + 0.1, z + 13);
      quad(ctx, e, f, g, hh, COLOURS.runwayMark);
    }
  }
  // Threshold bars at both ends.
  for (const tz of [PLANE.runwayStart + 4, PLANE.runwayEnd - 8]) {
    const y = terrainHeight(0, tz) + 0.5;
    for (let x = -7; x <= 7; x += 3.5) {
      const a = project(cam, focal, cx, cy, x - 1.2, y, tz);
      const b = project(cam, focal, cx, cy, x + 1.2, y, tz);
      const c = project(cam, focal, cx, cy, x + 1.2, y, tz + 5);
      const d = project(cam, focal, cx, cy, x - 1.2, y, tz + 5);
      quad(ctx, a, b, c, d, COLOURS.runwayMark);
    }
  }
}

/** The golden rings: glowing circles the pilot flies through in order. */
function drawRings(ctx, mission, plane, cam, focal, cx, cy, time) {
  for (let i = 0; i < mission.rings.length; i += 1) {
    const ring = mission.rings[i];
    const isNext = i === mission.nextRing;
    if (ring.passed) continue;
    // The ring faces the aircraft so it reads as a circle from the cockpit.
    const nx = ring.x - plane.x;
    const ny = ring.y - plane.y;
    const nz = ring.z - plane.z;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const n = { x: nx / nl, y: ny / nl, z: nz / nl };
    let u = { x: -n.z, y: 0, z: n.x };
    const ul = Math.hypot(u.x, u.z) || 1;
    u = { x: u.x / ul, y: 0, z: u.z / ul };
    const v = {
      x: n.y * u.z - n.z * u.y,
      y: n.z * u.x - n.x * u.z,
      z: n.x * u.y - n.y * u.x,
    };
    const pulse = isNext ? 1 + 0.08 * Math.sin(time * 4) : 1;
    const pts = [];
    for (let k = 0; k <= 24; k += 1) {
      const a = (k / 24) * TAU;
      const px = ring.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * ring.radius * pulse;
      const py = ring.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * ring.radius * pulse;
      const pz = ring.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * ring.radius * pulse;
      pts.push(project(cam, focal, cx, cy, px, py, pz));
    }
    if (pts.some((p) => p === null)) continue;
    ctx.save();
    ctx.strokeStyle = isNext ? COLOURS.ringNext : 'rgba(255, 194, 51, 0.55)';
    ctx.lineWidth = isNext ? 7 : 4;
    ctx.shadowColor = COLOURS.ringGold;
    ctx.shadowBlur = isNext ? 22 : 8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // A thin guide line from the ring down to the ground helps judge height.
    if (isNext) {
      const top = project(cam, focal, cx, cy, ring.x, ring.y - ring.radius, ring.z);
      const bottom = project(cam, focal, cx, cy, ring.x, terrainHeight(ring.x, ring.z), ring.z);
      if (top && bottom) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Ring number, drawn at the ring's centre.
    const centre = project(cam, focal, cx, cy, ring.x, ring.y, ring.z);
    if (centre && isNext) {
      ctx.save();
      ctx.fillStyle = '#1a1206';
      ctx.font = `bold ${Math.max(13, Math.min(30, 900 / centre.d))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), centre.x, centre.y);
      ctx.restore();
    }
  }
}

/** The aircraft, drawn from behind and above in the middle of the frame. */
function drawPlane(ctx, w, h, plane, time) {
  const cx = w / 2;
  const cy = h * 0.55;
  const s = Math.min(w, h) / 560; // overall scale
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.9);
  ctx.scale(s, s);
  // Soft shadow on the ground is skipped: the chase camera looks down the
  // nose, so the aircraft reads as a built machine, not a sticker.
  // Main wings.
  ctx.fillStyle = '#c8342c';
  ctx.beginPath();
  ctx.moveTo(-150, 26);
  ctx.lineTo(-138, 6);
  ctx.lineTo(138, 6);
  ctx.lineTo(150, 26);
  ctx.lineTo(120, 34);
  ctx.lineTo(-120, 34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4ede0';
  ctx.fillRect(-150, 18, 300, 7);
  // Fuselage, nose up-screen.
  const body = ctx.createLinearGradient(0, -170, 0, 90);
  body.addColorStop(0, '#f7f2e7');
  body.addColorStop(0.6, '#e8dfc9');
  body.addColorStop(1, '#cbb98f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -178);
  ctx.quadraticCurveTo(26, -140, 30, -70);
  ctx.lineTo(34, 30);
  ctx.quadraticCurveTo(34, 78, 22, 92);
  ctx.lineTo(-22, 92);
  ctx.quadraticCurveTo(-34, 78, -34, 30);
  ctx.lineTo(-30, -70);
  ctx.quadraticCurveTo(-26, -140, 0, -178);
  ctx.closePath();
  ctx.fill();
  // Gold cheatline down the fuselage.
  ctx.fillStyle = COLOURS.ringGold;
  ctx.beginPath();
  ctx.moveTo(-28, -60);
  ctx.lineTo(28, -60);
  ctx.lineTo(32, -34);
  ctx.lineTo(-32, -34);
  ctx.closePath();
  ctx.fill();
  // Cockpit windows.
  ctx.fillStyle = '#20344f';
  ctx.beginPath();
  ctx.moveTo(-18, -128);
  ctx.quadraticCurveTo(0, -142, 18, -128);
  ctx.lineTo(14, -96);
  ctx.lineTo(-14, -96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 220, 255, 0.7)';
  ctx.beginPath();
  ctx.moveTo(-12, -126);
  ctx.quadraticCurveTo(0, -134, 12, -126);
  ctx.lineTo(9, -104);
  ctx.lineTo(-9, -104);
  ctx.closePath();
  ctx.fill();
  // Tail: horizontal stabiliser and fin.
  ctx.fillStyle = '#c8342c';
  ctx.beginPath();
  ctx.moveTo(-64, 62);
  ctx.lineTo(-56, 48);
  ctx.lineTo(56, 48);
  ctx.lineTo(64, 62);
  ctx.lineTo(52, 70);
  ctx.lineTo(-52, 70);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 52);
  ctx.lineTo(0, 96);
  ctx.lineTo(8, 52);
  ctx.closePath();
  ctx.fill();
  // Registration on the fuselage.
  ctx.fillStyle = '#26303c';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N7SKY', 0, -6);
  // Propeller at the nose: a spinning blur disc and two slim blades.
  const spin = time * 22;
  ctx.save();
  ctx.translate(0, -172);
  ctx.rotate(spin);
  ctx.fillStyle = 'rgba(40, 40, 46, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 48, 48, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 30, 34, 0.6)';
  ctx.fillRect(-2, -46, 4, 92);
  ctx.fillRect(-46, -2, 92, 4);
  ctx.restore();
  ctx.fillStyle = '#2b2b30';
  ctx.beginPath();
  ctx.arc(0, -172, 9, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A round dial with a needle: altimeter, airspeed and the attitude ball. */
function dial(ctx, x, y, r, label, valueText, needleAngle, tickLabels) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#10151d';
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8fa3bd';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
    ctx.lineTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10));
    ctx.stroke();
  }
  if (tickLabels) {
    ctx.fillStyle = '#c8d6e8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [text, angle] of tickLabels) {
      ctx.fillText(text, Math.cos(angle) * (r - 19), Math.sin(angle) * (r - 19));
    }
  }
  // Needle.
  ctx.strokeStyle = COLOURS.hudAmber;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(needleAngle) * (r - 8), Math.sin(needleAngle) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(valueText, 0, r * 0.42);
  ctx.fillStyle = '#8fa3bd';
  ctx.font = '9px sans-serif';
  ctx.fillText(label, 0, -r * 0.62);
  ctx.restore();
}

function attitudeBall(ctx, x, y, r, plane) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  ctx.rotate(-plane.bank);
  const pitchOffset = clamp(plane.pitch, -0.5, 0.5) * r * 1.4;
  ctx.fillStyle = '#3f6ea6';
  ctx.fillRect(-r, -r + pitchOffset, r * 2, r);
  ctx.fillStyle = '#8a6a3f';
  ctx.fillRect(-r, pitchOffset, r * 2, r);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchOffset);
  ctx.lineTo(r, pitchOffset);
  ctx.stroke();
  ctx.rotate(plane.bank);
  // Fixed wings of the symbol.
  ctx.strokeStyle = COLOURS.hudAmber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.lineTo(-r * 0.2, 0);
  ctx.moveTo(r * 0.2, 0);
  ctx.lineTo(r * 0.7, 0);
  ctx.stroke();
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#8fa3bd';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', x, y + r + 11);
}

function compassTape(ctx, w, panelY, plane) {
  const tapeW = Math.min(420, w * 0.36);
  const x0 = (w - tapeW) / 2;
  const y = panelY + 30;
  const deg = headingDegrees(plane);
  ctx.save();
  ctx.fillStyle = '#10151d';
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.beginPath();
  ctx.roundRect(x0, y - 16, tapeW, 32, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x0, y - 16, tapeW, 32);
  ctx.clip();
  const points = [
    ['N', 0], ['E', 90], ['S', 180], ['W', 270],
    ['30', 30], ['60', 60], ['120', 120], ['150', 150],
    ['210', 210], ['240', 240], ['300', 300], ['330', 330],
  ];
  for (const [label, d] of points) {
    let diff = d - deg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    const px = x0 + tapeW / 2 + (diff / 60) * (tapeW / 2);
    if (px < x0 - 10 || px > x0 + tapeW + 10) continue;
    ctx.fillStyle = d % 90 === 0 ? COLOURS.hudAmber : '#c8d6e8';
    ctx.font = d % 90 === 0 ? 'bold 13px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, y);
    ctx.strokeStyle = '#8fa3bd';
    ctx.beginPath();
    ctx.moveTo(px, y + 12);
    ctx.lineTo(px, y + 16);
    ctx.stroke();
  }
  ctx.restore();
  // Centre caret and digital heading.
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, y - 18);
  ctx.lineTo(w / 2 + 6, y - 18);
  ctx.lineTo(w / 2, y - 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(deg)).padStart(3, '0')}°`, w / 2, y + 34);
  ctx.fillStyle = '#8fa3bd';
  ctx.font = '9px sans-serif';
  ctx.fillText('HEADING', w / 2, y + 47);
}

/** The instrument panel along the bottom, with the big digital readouts. */
function drawPanel(ctx, w, h, plane, mission, time) {
  const panelH = 118;
  const y0 = h - panelH;
  ctx.fillStyle = COLOURS.panel;
  ctx.fillRect(0, y0, w, panelH);
  ctx.fillStyle = COLOURS.panelEdge;
  ctx.fillRect(0, y0, w, 2);

  const cy = y0 + 52;
  attitudeBall(ctx, 62, cy, 34, plane);
  const altAngle = ((plane.y % 1000) / 1000) * TAU - Math.PI / 2;
  dial(ctx, 150, cy, 34, 'ALT', `${Math.round(plane.y)}`, altAngle, [
    ['0', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI],
  ]);
  const spdAngle = (clamp(plane.speed, 0, 240) / 240) * TAU * 0.75 - Math.PI * 0.75;
  dial(ctx, 238, cy, 34, 'SPEED', `${Math.round(plane.speed)}`, spdAngle, [
    ['0', -Math.PI * 0.75], ['120', Math.PI / 2], ['240', Math.PI * 0.75],
  ]);
  compassTape(ctx, w, y0, plane);

  // Fuel and throttle bars on the right.
  const bx = w - 150;
  ctx.fillStyle = '#8fa3bd';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', bx, y0 + 18);
  ctx.fillText('THR', bx, y0 + 52);
  ctx.fillStyle = '#10151d';
  ctx.fillRect(bx + 44, y0 + 10, 92, 12);
  ctx.fillRect(bx + 44, y0 + 44, 92, 12);
  const fuelW = (plane.fuel / 100) * 92;
  ctx.fillStyle = plane.fuel < 20 ? COLOURS.hudRed : COLOURS.hudGreen;
  ctx.fillRect(bx + 44, y0 + 10, fuelW, 12);
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.fillRect(bx + 44, y0 + 44, plane.throttle * 92, 12);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`${Math.round(plane.fuel)}%`, bx + 44, y0 + 34);
  ctx.fillText(`${Math.round(plane.throttle * 100)}%`, bx + 44, y0 + 68);

  // Big digital readouts, centre-left of the panel.
  const rx = w / 2 + Math.min(230, w * 0.2);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`ALT ${Math.round(plane.y)} ft`, rx, y0 + 34);
  ctx.fillText(`SPD ${Math.round(plane.speed)} kt`, rx, y0 + 62);
  ctx.fillText(`HDG ${String(Math.round(headingDegrees(plane))).padStart(3, '0')}°`, rx, y0 + 90);
  void mission;
  void time;
}

/** Top-of-screen HUD: score, rings, timer, messages and warnings. */
function drawHud(ctx, w, h, plane, mission, screen, time) {
  ctx.textBaseline = 'alphabetic';
  // Score block, top left.
  ctx.fillStyle = 'rgba(12, 16, 24, 0.55)';
  ctx.fillRect(12, 12, 210, 64);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(12, 12, 210, 64);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${mission.score}`, 24, 38);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.fillText(`RINGS ${mission.ringsPassed} / ${WORLD.ringCount}`, 24, 62);
  if (mission.best > 0) {
    ctx.fillStyle = '#8fa3bd';
    ctx.fillText(`BEST ${mission.best}`, 150, 62);
  }

  // Timer, top right.
  const mins = Math.floor(mission.timeSeconds / 60);
  const secs = Math.floor(mission.timeSeconds % 60);
  ctx.fillStyle = 'rgba(12, 16, 24, 0.55)';
  ctx.fillRect(w - 132, 12, 120, 40);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(w - 132, 12, 120, 40);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, w - 24, 40);

  // Mission message banner.
  if (mission.message && time < mission.messageUntil) {
    ctx.font = 'bold 20px sans-serif';
    const tw = ctx.measureText(mission.message).width + 36;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.65)';
    ctx.fillRect((w - tw) / 2, 84, tw, 36);
    ctx.strokeStyle = COLOURS.ringGold;
    ctx.strokeRect((w - tw) / 2, 84, tw, 36);
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.textAlign = 'center';
    ctx.fillText(mission.message, w / 2, 108);
  }

  // Next-ring distance and direction, under the banner.
  const ring = targetRing(mission);
  if (ring && screen === SCREEN.play) {
    const dx = ring.x - plane.x;
    const dy = ring.y - plane.y;
    const dz = ring.z - plane.z;
    const dist = Math.round(Math.hypot(dx, dy, dz));
    ctx.fillStyle = COLOURS.hudText;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`NEXT RING ${dist} ft`, w / 2, 140);
  }

  // Warnings, centre of the screen.
  const warnings = [];
  if (plane.airborne && plane.speed < PLANE.stallSpeed + 8) warnings.push('STALL — NOSE DOWN, ADD POWER');
  if (plane.fuel < 20 && plane.fuel > 0) warnings.push('LOW FUEL');
  if (plane.fuel <= 0) warnings.push('FUEL EMPTY — GLIDING');
  if (warnings.length > 0) {
    ctx.fillStyle = COLOURS.hudRed;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    const blink = Math.sin(time * 6) > -0.2;
    if (blink) ctx.fillText(warnings[0], w / 2, h * 0.3);
  }
}

function overlayPanel(ctx, w, h, title, lines, accent, yOffset = 0) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const pw = Math.min(620, w - 60);
  const ph = 90 + lines.length * 30;
  const x0 = (w - pw) / 2;
  const y0 = (h - ph) / 2 - 40 + yOffset;
  ctx.fillStyle = 'rgba(12, 16, 24, 0.92)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x0, y0, pw, ph, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, y0 + 58);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '17px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, y0 + 96 + i * 30);
  });
}

/**
 * Draw one frame. `state` holds the plane, the mission, the screen and the
 * clock; `seedRand` is a fresh seeded generator each frame so the trees do
 * not flicker between frames.
 */
export function drawGame(ctx, w, h, state) {
  const { plane, mission, screen, time } = state;
  const focal = Math.min(w, h) * 0.9;
  const cx = w / 2;
  const cy = h * 0.42;
  const cam = cameraFor(plane);
  // A fresh generator per frame, seeded from the mission seed, keeps the
  // decorative trees in the same places from frame to frame.
  const seedRand = (() => {
    let a = (mission.seed ^ 0x51ed) >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  drawSky(ctx, w, h, cam, focal, cx, cy, time);
  drawTerrain(ctx, w, h, cam, focal, cx, cy, seedRand);
  drawRunway(ctx, cam, focal, cx, cy);
  drawRings(ctx, mission, plane, cam, focal, cx, cy, time);
  drawPlane(ctx, w, h, plane, time);
  drawPanel(ctx, w, h, plane, mission, time);
  drawHud(ctx, w, h, plane, mission, screen, time);

  if (screen === SCREEN.title) {
    overlayPanel(ctx, w, h, 'SKY COURIER', [
      'Golden Hour Run — fly the ring course, then land on the runway.',
      'W / S  throttle      A / D  bank      ↑ / ↓  pitch      Mouse steers too',
      'Fly through all 8 golden rings, watch your fuel, land gently.',
      'Press ENTER or click to fly',
    ], COLOURS.ringGold, -70);
  } else if (screen === SCREEN.win) {
    overlayPanel(ctx, w, h, 'MISSION COMPLETE', [
      `Score ${mission.score}   •   Rings ${mission.ringsPassed} / ${WORLD.ringCount}   •   Time ${Math.floor(mission.timeSeconds / 60)}:${String(Math.floor(mission.timeSeconds % 60)).padStart(2, '0')}`,
      mission.message,
      'Press R to fly again',
    ], COLOURS.hudGreen);
  } else if (screen === SCREEN.crash) {
    overlayPanel(ctx, w, h, 'CRASHED', [
      plane.crashReason || 'The aircraft came down.',
      `Score ${mission.score}   •   Rings ${mission.ringsPassed} / ${WORLD.ringCount}`,
      'Press R to try again',
    ], COLOURS.hudRed);
  }
}
