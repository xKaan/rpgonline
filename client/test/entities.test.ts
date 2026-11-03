import { describe, it, expect } from 'vitest';
import { diffKeys } from '../src/game/entities';

const mapOf = (...keys: string[]) => {
  const m = new Map(keys.map((k) => [k, {}]));
  return { get: (k: string) => m.get(k), forEach: (cb: (v: object, k: string) => void) => m.forEach(cb), size: m.size };
};

describe('diffKeys', () => {
  it('liste les entités apparues et disparues', () => {
    expect(diffKeys(['1', '2', '3'], mapOf('2', '3', '4'))).toEqual({ added: ['4'], removed: ['1'] });
    expect(diffKeys([], mapOf())).toEqual({ added: [], removed: [] });
  });
});
