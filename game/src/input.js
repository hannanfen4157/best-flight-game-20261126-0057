// Keyboard and mouse input. The game is steered with W/S (throttle), A/D or
// the arrow keys (bank), Up/Down (pitch), and the mouse: moving the pointer
// left or right banks the aircraft, moving it up or down pitches it. Enter
// starts, R restarts after a landing or a crash, M toggles sound.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    // -1..1 bank the pilot asks for, from keys or from the mouse position.
    bank: 0,
    // -1..1 pitch the pilot asks for (positive = nose up).
    pitch: 0,
    throttleUp: false,
    throttleDown: false,
    mouseSteer: false,
    mouseX: 0,
    mouseY: 0,
    pressed: new Set(), // keys pressed since the last frame was read
  };

  function onKeyDown(event) {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(code);
    keys.add(code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    input.mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    input.mouseSteer = true;
  }
  function onMouseDown(event) {
    input.pressed.add('MouseClick');
    onMouseMove(event);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  // Read the held keys into bank / pitch / throttle for this frame.
  input.poll = function poll() {
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const up = keys.has('ArrowUp');
    const down = keys.has('ArrowDown');
    let bank = 0;
    let pitch = 0;
    if (left) bank -= 1;
    if (right) bank += 1;
    if (up) pitch += 1;
    if (down) pitch -= 1;
    if (input.mouseSteer && bank === 0 && pitch === 0) {
      // The mouse steers gently when no key is held: bank follows how far
      // the pointer sits from the middle, pitch follows its height.
      bank = Math.max(-1, Math.min(1, input.mouseX * 2.4));
      pitch = Math.max(-1, Math.min(1, -input.mouseY * 2.0));
    }
    input.bank = bank;
    input.pitch = pitch;
    input.throttleUp = keys.has('KeyW');
    input.throttleDown = keys.has('KeyS');
  };

  // Take and clear the keys pressed since the last read.
  input.takePressed = function takePressed() {
    const out = input.pressed;
    input.pressed = new Set();
    return out;
  };

  return input;
}
