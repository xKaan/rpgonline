// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInput, type Input } from '../src/game/input';

let canvas: HTMLElement;
let input: Input;

const setLocked = (locked: boolean) => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (locked ? canvas : null) });
  document.dispatchEvent(new Event('pointerlockchange'));
};
const key = (code: string, opts: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { code, cancelable: true, ...opts });
  window.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  // happy-dom n'implémente pas l'API Pointer Lock
  document.exitPointerLock = () => undefined;
  canvas = document.createElement('canvas');
  document.body.append(canvas);
  input = createInput(canvas);
});
afterEach(() => {
  input.dispose();
  setLocked(false);
  canvas.remove();
});

describe('createInput', () => {
  it('lit les touches quand la souris est capturée', () => {
    setLocked(true);
    key('KeyW');
    key('Space');
    key('Digit3');
    expect(input.moveInput()).toMatchObject({ forward: true, roll: true });
    expect(input.consumePressed('Digit3')).toBe(true);
  });

  it("ignore les touches pressées pendant la pause (pas de roulade rejouée à la reprise)", () => {
    setLocked(false);
    key('Space');
    key('KeyE');
    setLocked(true);
    expect(input.moveInput().roll).toBe(false);
    expect(input.consumePressed('KeyE')).toBe(false);
  });

  it('oublie les appuis non consommés quand la capture change', () => {
    setLocked(true);
    key('Space');
    setLocked(false);
    setLocked(true);
    expect(input.moveInput().roll).toBe(false);
  });

  it("ne bloque Tab et Espace que pendant le jeu (menus utilisables au clavier)", () => {
    setLocked(false);
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('Space').defaultPrevented).toBe(false);
    setLocked(true);
    expect(key('Space').defaultPrevented).toBe(true);
  });
});
