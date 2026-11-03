import { describe, it, expect } from 'vitest';
import {
  NO_INPUT,
  PLAYER_RADIUS,
  ROLL_COOLDOWN,
  ROLL_DURATION,
  ROLL_SPEED,
  moveDirection,
  newMotion,
  stepMotion,
  type MoveInput,
} from '../src/movement';
import { MAP_HALF_SIZE } from '../src/map';

const input = (p: Partial<MoveInput>): MoveInput => ({ ...NO_INPUT, ...p });

describe('moveDirection', () => {
  it('avance vers −Z quand la caméra a un yaw de 0', () => {
    const d = moveDirection(input({ forward: true }), 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('droite = +X à yaw 0, et tourne avec la caméra', () => {
    const r = moveDirection(input({ right: true }), 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    const f = moveDirection(input({ forward: true }), Math.PI / 2);
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });

  it('normalise la diagonale et renvoie 0 sans touche', () => {
    const d = moveDirection(input({ forward: true, right: true }), 0);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
    expect(moveDirection(NO_INPUT, 0)).toEqual({ x: 0, z: 0 });
    expect(moveDirection(input({ forward: true, back: true }), 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('stepMotion', () => {
  it('avance de 6 m/s et oriente le perso', () => {
    const m = stepMotion(newMotion(0, 30), input({ forward: true }), 0, 1);
    expect(m.z).toBeCloseTo(24);
    expect(Math.abs(m.facing)).toBeCloseTo(Math.PI);
  });

  it('roulade : rapide, puis cooldown de 1,5 s', () => {
    let m = stepMotion(newMotion(0, 30), input({ forward: true, roll: true }), 0, ROLL_DURATION);
    expect(m.z).toBeCloseTo(30 - ROLL_SPEED * ROLL_DURATION);
    expect(m.rollTime).toBe(0);
    expect(m.rollCooldown).toBeCloseTo(ROLL_COOLDOWN);
    const z = m.z;
    m = stepMotion(m, input({ forward: true, roll: true }), 0, 0.1);
    expect(m.rollTime).toBe(0);
    expect(m.z).toBeCloseTo(z - 0.6);
  });

  it('roulade sans direction : part dans le sens du regard', () => {
    const m = stepMotion(newMotion(0, 30), input({ roll: true }), 0, 0.1);
    expect(m.z).toBeCloseTo(30 - ROLL_SPEED * 0.1);
    expect(m.rollTime).toBeCloseTo(ROLL_DURATION - 0.1);
  });

  it('est repoussé hors des obstacles', () => {
    const m = stepMotion(newMotion(0, 3), input({ forward: true }), 0, 0.2, [{ x: 0, z: 0, radius: 2 }]);
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(2 + PLAYER_RADIUS);
  });

  it('reste dans les limites de la map', () => {
    const m = stepMotion(newMotion(0, -39), input({ forward: true }), 0, 1);
    expect(m.z).toBeCloseTo(-(MAP_HALF_SIZE - PLAYER_RADIUS));
  });
});
