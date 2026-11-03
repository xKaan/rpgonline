import { describe, it, expect } from 'vitest';
import {
  BONUS_IDS,
  chestLoot,
  computeStats,
  drawBonuses,
  monsterLoot,
  mulberry32,
  rollShiny,
  shinyStones,
  type Rng,
} from '../src/index';

const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('shiny', () => {
  it('5 % de chance', () => {
    expect(rollShiny(seq(0.05), false)).toBeNull();
    expect(rollShiny(seq(0.049, 0), false)).toEqual(['burning']);
    const rng = mulberry32(9);
    let n = 0;
    for (let i = 0; i < 20000; i++) if (rollShiny(rng, false)) n++;
    expect(n / 20000).toBeGreaterThan(0.04);
    expect(n / 20000).toBeLessThan(0.06);
  });

  it('2 effets distincts pour un boss', () => {
    const effects = rollShiny(seq(0, 0, 0), true)!;
    expect(effects).toHaveLength(2);
    expect(new Set(effects).size).toBe(2);
  });

  it("pierres de l'élément de l'effet, 3 pour un boss", () => {
    expect(shinyStones(['frozen'], false, seq(0))).toEqual(['ice']);
    expect(shinyStones(['burning', 'venomous'], true, seq(0))).toEqual(['fire', 'poison', 'fire']);
    expect(shinyStones(['swift'], false, seq(0.99))).toEqual(['ice']);
  });

  it('loot shiny : ×5 or et matériaux, même pour un gobelin', () => {
    expect(monsterLoot('goblin', 1, null, seq(0))).toEqual({ gold: 3, materials: 0, stones: [] });
    expect(monsterLoot('goblin', 1, ['electric'], seq(0))).toEqual({ gold: 15, materials: 5, stones: ['lightning'] });
    expect(monsterLoot('golem', 1, null, seq(0)).materials).toBe(1);
  });

  it('coffre : or selon la vague, pierre occasionnelle', () => {
    expect(chestLoot(3, seq(0.5))).toEqual({ gold: 45, materials: 0, stones: [] });
    expect(chestLoot(1, seq(0.1, 0)).stones).toEqual(['fire']);
  });
});

describe('bonus de run', () => {
  it('15 bonus, tirage de 3 distincts', () => {
    expect(BONUS_IDS).toHaveLength(15);
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const d = drawBonuses(rng);
      expect(d).toHaveLength(3);
      expect(new Set(d).size).toBe(3);
    }
  });

  it('les bonus se cumulent', () => {
    const base = computeStats([]);
    expect(base.maxHp).toBe(100);
    expect(base.critChance).toBe(0);
    const s = computeStats(['damage', 'damage', 'maxHp', 'armor', 'armor', 'rollCooldown']);
    expect(s.damageMult).toBeCloseTo(1.3);
    expect(s.maxHp).toBe(120);
    expect(s.damageTakenMult).toBeCloseTo(0.81);
    expect(s.rollCooldown).toBeCloseTo(1.2);
  });
});
