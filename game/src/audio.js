// Sound, synthesised live with WebAudio — no audio files, nothing loaded
// over the network. The engine hums with the throttle, a ring chimes, a
// crash thuds, a landing plays a short jingle. Audio starts only after the
// pilot's first key or click, so a browser that has not been touched stays
// silent (and a screenshot run never needs it).
export function createAudio() {
  const audio = {
    context: null,
    engineOsc: null,
    engineGain: null,
    muted: false,
    enabled: false,
  };

  function ensure() {
    if (audio.context) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.context = new Ctx();
      audio.engineOsc = audio.context.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 52;
      const filter = audio.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      audio.engineGain = audio.context.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.context.destination);
      audio.engineOsc.start();
      audio.enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  audio.unlock = function unlock() {
    if (ensure() && audio.context.state === 'suspended') {
      audio.context.resume().catch(() => {});
    }
  };

  audio.setEngine = function setEngine(throttle, speed, airborne) {
    if (!audio.enabled || audio.muted || !audio.context) return;
    const target = airborne ? 0.018 + throttle * 0.05 : 0.012 + throttle * 0.03;
    audio.engineGain.gain.setTargetAtTime(target, audio.context.currentTime, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(
      48 + throttle * 46 + speed * 0.12,
      audio.context.currentTime,
      0.1,
    );
  };

  function blip(frequency, startAt, duration, volume, type = 'sine') {
    if (!audio.enabled || audio.muted || !audio.context) return;
    const osc = audio.context.createOscillator();
    const gain = audio.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, audio.context.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(volume, audio.context.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.context.currentTime + startAt + duration);
    osc.connect(gain);
    gain.connect(audio.context.destination);
    osc.start(audio.context.currentTime + startAt);
    osc.stop(audio.context.currentTime + startAt + duration + 0.05);
  }

  audio.ring = function ring() {
    blip(880, 0, 0.35, 0.16);
    blip(1318, 0.09, 0.45, 0.14);
  };

  audio.crash = function crash() {
    blip(90, 0, 0.7, 0.3, 'triangle');
    blip(55, 0.05, 0.9, 0.28, 'sawtooth');
  };

  audio.landed = function landed() {
    blip(523, 0, 0.3, 0.15);
    blip(659, 0.14, 0.3, 0.15);
    blip(784, 0.28, 0.5, 0.16);
  };

  audio.takeoff = function takeoff() {
    blip(392, 0, 0.25, 0.12);
    blip(587, 0.12, 0.35, 0.12);
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.engineGain) audio.engineGain.gain.value = 0;
    return audio.muted;
  };

  return audio;
}
