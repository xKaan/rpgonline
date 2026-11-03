import { describe, it, expect } from 'vitest';
import {
  WEAPON_TYPES,
  WEAPONS,
  MAX_WEAPON_LEVEL,
  weaponDamage,
  weaponAttacksPerSec,
  upgradeCost,
  isWeaponType,
} from '../src/weapons';

describe('armes', () => {
  it('définit les 7 armes avec des stats positives', () => {
    expect(WEAPON_TYPES).toHaveLength(7);
    for (const t of WEAPON_TYPES) {
      expect(WEAPONS[t].damage).toBeGreaterThan(0);
      expect(WEAPONS[t].attacksPerSec).toBeGreaterThan(0);
      expect(WEAPONS[t].range).toBeGreaterThan(0);
    }
    expect(MAX_WEAPON_LEVEL).toBe(10);
  });

  it('dégâts : +12 % des dégâts de base par niveau', () => {
    expect(weaponDamage('sword', 1)).toBe(12);
    expect(weaponDamage('sword', 2)).toBeCloseTo(13.44);
    expect(weaponDamage('sword', 10)).toBeCloseTo(24.96);
    expect(weaponDamage('crossbow', 5)).toBeCloseTo(38.48);
  });

  it('vitesse : +10 % aux paliers 5 et 10', () => {
    expect(weaponAttacksPerSec('sword', 4)).toBeCloseTo(1.6);
    expect(weaponAttacksPerSec('sword', 5)).toBeCloseTo(1.76);
    expect(weaponAttacksPerSec('sword', 9)).toBeCloseTo(1.76);
    expect(weaponAttacksPerSec('sword', 10)).toBeCloseTo(1.92);
  });

  it("coût d'amélioration en or et matériaux", () => {
    expect(upgradeCost(1)).toEqual({ gold: 50, materials: 0 });
    expect(upgradeCost(2)).toEqual({ gold: 80, materials: 0 });
    expect(upgradeCost(4)).toEqual({ gold: 205, materials: 5 });
    expect(upgradeCost(9)).toEqual({ gold: 2147, materials: 20 });
    expect(upgradeCost(10)).toBeNull();
  });

  it('refuse les niveaux invalides', () => {
    expect(() => weaponDamage('axe', 0)).toThrow(RangeError);
    expect(() => weaponDamage('axe', 11)).toThrow(RangeError);
    expect(() => upgradeCost(2.5)).toThrow(RangeError);
  });

  it('isWeaponType', () => {
    expect(isWeaponType('mace')).toBe(true);
    expect(isWeaponType('katana')).toBe(false);
  });
});
