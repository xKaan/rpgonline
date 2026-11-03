import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/rng';
import { FORGE_POS, MAP_HALF_SIZE, SAFE_RADIUS, generateMap } from '../src/map';

describe('rng', () => {
  it('est déterministe et dans [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateMap', () => {
  it('est déterministe pour une même graine', () => {
    expect(generateMap(7)).toEqual(generateMap(7));
    expect(generateMap(7)).not.toEqual(generateMap(8));
  });

  it('place arbres et rochers dans les limites, hors de la zone centrale', () => {
    const map = generateMap();
    expect(map.trees.length).toBe(70);
    expect(map.rocks.length).toBe(30);
    for (const d of [...map.trees, ...map.rocks]) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(MAP_HALF_SIZE);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(MAP_HALF_SIZE);
      expect(Math.hypot(d.x, d.z)).toBeGreaterThanOrEqual(SAFE_RADIUS);
    }
  });

  it('inclut la forge dans les obstacles', () => {
    expect(generateMap().obstacles).toContainEqual(expect.objectContaining({ x: FORGE_POS.x, z: FORGE_POS.z }));
  });
});
