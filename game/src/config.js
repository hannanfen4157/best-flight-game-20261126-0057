// Sky Courier — Golden Hour Run: every tunable number of the game lives here,
// so the flight model, the world and the renderer all agree on one set of facts.
export const STEP = 1 / 60;

export const PLANE = {
  maxSpeed: 210, // knots the engine can hold at full throttle
  cruiseSpeed: 120, // knots the autopilot and the HUD treat as comfortable
  stallSpeed: 52, // below this the wings stop flying and the nose drops
  accel: 26, // knots per second gained toward the throttle's target speed
  drag: 9, // knots per second bled off when the throttle is closed
  climbRate: 45, // feet per second of climb at full power, level pitch
  sinkRate: 22, // feet per second of sink when slow and nose down
  bankRate: 1.9, // radians per second of roll toward the pilot's bank
  maxBank: 1.1, // radians of bank the stick can ask for
  pitchRate: 1.2, // radians per second of pitch toward the pilot's pitch
  maxPitch: 0.55, // radians up or down
  turnRate: 1.1, // heading radians per second at full bank
  fuelBurn: 0.45, // fuel percent per second at full throttle
  fuelIdle: 0.06, // fuel percent per second at idle
  runwayHalfWidth: 12, // feet either side of the centreline that counts as runway
  runwayStart: 0, // feet along z where the runway threshold sits
  runwayEnd: 320, // feet along z where the runway far end sits
};

export const WORLD = {
  ringCount: 8,
  ringRadius: 22, // feet; fly through the ring's disc to score
  ringScore: 100,
  landingBonus: 500,
  fuelBonusPerPercent: 5,
  timeBonusPerSecond: 2, // paid for every second under the par time
  parTimeSeconds: 150,
  terrainMax: 34, // highest hill the terrain function can build
  courseHalfWidth: 260, // feet either side of the centreline the course stays in
  courseLength: 3600, // feet along z the ring course runs
};

export const SCREEN = {
  title: 'title',
  play: 'play',
  win: 'win',
  crash: 'crash',
};

export const COLOURS = {
  skyTop: '#2e4a7a',
  skyMid: '#7d9cc4',
  horizonGlow: '#f7b267',
  sunCore: '#ffd98a',
  fieldA: '#5d8a3c',
  fieldB: '#7ba24a',
  fieldC: '#a8894e',
  forest: '#2f5d2a',
  runway: '#3a3f46',
  runwayMark: '#f2f0e6',
  ringGold: '#ffc233',
  ringNext: '#ffd94d',
  panel: 'rgba(12, 16, 24, 0.82)',
  panelEdge: '#4a5a70',
  hudText: '#eaf2ff',
  hudAmber: '#ffc233',
  hudRed: '#ff5a4e',
  hudGreen: '#7be495',
};
