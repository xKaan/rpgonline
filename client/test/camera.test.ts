import { describe, it, expect } from 'vitest';
import { PITCH_MAX, PITCH_MIN, aimFacing, cameraOffset, clampPitch } from '../src/game/camera';

describe('caméra', () => {
  it('se place derrière le joueur (+Z) à yaw 0', () => {
    const o = cameraOffset(0, 0, 6);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
    expect(o.z).toBeCloseTo(6);
  });

  it('tourne autour du joueur et monte avec le pitch', () => {
    expect(cameraOffset(Math.PI / 2, 0, 6).x).toBeCloseTo(6);
    expect(cameraOffset(0, Math.PI / 2, 6).y).toBeCloseTo(6);
  });

  it('borne le pitch', () => {
    expect(clampPitch(5)).toBe(PITCH_MAX);
    expect(clampPitch(-5)).toBe(PITCH_MIN);
    expect(clampPitch(0.3)).toBe(0.3);
  });

  it("aimFacing oriente le modèle dans la direction où regarde la caméra", () => {
    for (const yaw of [0, 1, -2.5]) {
      const f = aimFacing(yaw);
      expect(Math.sin(f)).toBeCloseTo(-Math.sin(yaw));
      expect(Math.cos(f)).toBeCloseTo(-Math.cos(yaw));
    }
  });
});
