import type { MoveInput } from '@rpg/shared';

/** Touches lues par position physique (`code`) : ZQSD en AZERTY = WASD en QWERTY. */
export function createInput(target: HTMLElement) {
  const held = new Set<string>();
  const pressed = new Set<string>();
  let dx = 0;
  let dy = 0;
  let attack = false;
  const lockListeners: ((locked: boolean) => void)[] = [];

  const isLocked = () => document.pointerLockElement === target;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    held.add(e.code);
    if (!e.repeat) pressed.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onMouseMove = (e: MouseEvent) => {
    if (!isLocked()) return;
    dx += e.movementX;
    dy += e.movementY;
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && isLocked()) attack = true;
  };
  const onLockChange = () => {
    if (!isLocked()) held.clear();
    for (const cb of lockListeners) cb(isLocked());
  };
  const onBlur = () => held.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    moveInput(): MoveInput {
      return {
        forward: held.has('KeyW'),
        back: held.has('KeyS'),
        left: held.has('KeyA'),
        right: held.has('KeyD'),
        roll: pressed.delete('Space'),
      };
    },
    consumeMouse() {
      const out = { dx, dy };
      dx = 0;
      dy = 0;
      return out;
    },
    consumeAttack() {
      const out = attack;
      attack = false;
      return out;
    },
    consumePressed(code: string) {
      return pressed.delete(code);
    },
    isLocked,
    lock() {
      void Promise.resolve(target.requestPointerLock()).catch(() => undefined);
    },
    unlock() {
      if (isLocked()) document.exitPointerLock();
    },
    onLockChange(cb: (locked: boolean) => void) {
      lockListeners.push(cb);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (isLocked()) document.exitPointerLock();
    },
  };
}

export type Input = ReturnType<typeof createInput>;
