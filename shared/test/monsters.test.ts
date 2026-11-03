import { describe, it, expect } from 'vitest';
import {
  ENEMIES,
  MAX_ALIVE,
  bossForWave,
  coopHpMult,
  goldDrop,
  mulberry32,
  scaledDamage,
  scaledHp,
  waveComposition,
  waveMonsterCount,
} from '../src/index';

describe('scaling des monstres', () => {
  it('PV × 1,12^(vague−1) et dégâts × (1 + 0,06 × (vague−1))', () => {
    expect(scaledHp('goblin', 1)).toBe(30);
    expect(scaledHp('goblin', 10)).toBeCloseTo(30 * 1.12 ** 9);
    expect(scaledDamage('golem', 1)).toBe(15);
    expect(scaledDamage('golem', 11)).toBeCloseTo(15 * 1.6);
  });

  it('PV multipliés en coop', () => {
    expect(coopHpMult(1)).toBe(1);
    expect(coopHpMult(8)).toBe(4.5);
    expect(scaledHp('goblin', 1, 3)).toBe(60);
  });

  it("l'or lâché augmente avec la vague", () => {
    expect(goldDrop('goblin', 1)).toBe(3);
    expect(goldDrop('golem', 11)).toBe(20);
  });

  it('refuse une vague invalide', () => {
    expect(() => scaledHp('goblin', 0)).toThrow(RangeError);
  });
});

describe('vagues', () => {
  it('6 + 2 × vague monstres', () => {
    expect(waveMonsterCount(1)).toBe(8);
    expect(waveMonsterCount(4)).toBe(14);
    expect(MAX_ALIVE).toBe(60);
  });

  it('boss : Roi Gobelin aux vagues 5, 15… et Golem ancien aux vagues 10, 20…', () => {
    expect(bossForWave(4)).toBeNull();
    expect(bossForWave(5)).toBe('goblin_king');
    expect(bossForWave(10)).toBe('ancient_golem');
    expect(bossForWave(15)).toBe('goblin_king');
    expect(bossForWave(20)).toBe('ancient_golem');
  });

  it('une vague normale contient exactement le nombre prévu de monstres débloqués', () => {
    const rng = mulberry32(1);
    for (let wave = 1; wave <= 4; wave++) {
      const list = waveComposition(wave, rng);
      expect(list).toHaveLength(waveMonsterCount(wave));
      expect(list.every((k) => !ENEMIES[k].boss)).toBe(true);
    }
    const w1 = waveComposition(1, mulberry32(2));
    expect(new Set(w1)).toEqual(new Set(['goblin']));
  });

  it('une vague de boss = boss en premier + la moitié des monstres normaux', () => {
    const list = waveComposition(5, mulberry32(3));
    expect(list[0]).toBe('goblin_king');
    expect(list.slice(1)).toHaveLength(Math.floor(waveMonsterCount(5) / 2));
    expect(list.slice(1).some((k) => ENEMIES[k].boss)).toBe(false);
  });

  it('les araignées arrivent en groupe', () => {
    const list = waveComposition(20, mulberry32(4)).slice(1);
    const runs: number[] = [];
    list.forEach((k, i) => {
      if (k !== 'spider') return;
      if (i > 0 && list[i - 1] === 'spider') runs[runs.length - 1]++;
      else runs.push(1);
    });
    expect(runs.length).toBeGreaterThan(0);
    // groupes de 3 (un groupe peut en contenir plusieurs collés, ou être tronqué en fin de liste)
    expect(runs.slice(0, -1).every((n) => n % 3 === 0)).toBe(true);
  });
});
