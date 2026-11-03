export const WEAPON_TYPES = ['sword', 'shovel', 'axe', 'spear', 'mace', 'bow', 'crossbow'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

export const MAX_WEAPON_LEVEL = 10;

export type HitShape =
  | { kind: 'cone'; angleDeg: number }
  | { kind: 'line'; width: number }
  | { kind: 'circle'; radius: number }
  | { kind: 'projectile'; pierce: number };

export interface WeaponSpecial {
  /** distance de recul infligée (m) */
  knockback?: number;
  /** multiplicateur de dégâts contre les boss */
  bossDamageMult?: number;
  /** durée d'étourdissement (s) */
  stunSec?: number;
  /** multiplicateur de dégâts du tir chargé */
  chargeMult?: number;
}

export interface WeaponStats {
  label: string;
  damage: number;
  attacksPerSec: number;
  range: number;
  shape: HitShape;
  special: WeaponSpecial;
}

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  sword: { label: 'Épée', damage: 12, attacksPerSec: 1.6, range: 2.2, shape: { kind: 'cone', angleDeg: 90 }, special: {} },
  shovel: { label: 'Pelle', damage: 9, attacksPerSec: 1.3, range: 2.4, shape: { kind: 'cone', angleDeg: 120 }, special: { knockback: 4 } },
  axe: { label: 'Hache', damage: 20, attacksPerSec: 0.9, range: 2.0, shape: { kind: 'cone', angleDeg: 70 }, special: { bossDamageMult: 1.25 } },
  spear: { label: 'Lance', damage: 14, attacksPerSec: 1.2, range: 3.5, shape: { kind: 'line', width: 0.8 }, special: {} },
  mace: { label: 'Masse à pointes', damage: 24, attacksPerSec: 0.7, range: 2.0, shape: { kind: 'circle', radius: 2 }, special: { stunSec: 0.5 } },
  bow: { label: 'Arc', damage: 10, attacksPerSec: 1.5, range: 25, shape: { kind: 'projectile', pierce: 0 }, special: { chargeMult: 2 } },
  crossbow: { label: 'Arbalète', damage: 26, attacksPerSec: 0.6, range: 30, shape: { kind: 'projectile', pierce: 2 }, special: {} },
};

const DAMAGE_PER_LEVEL = 0.12;
const SPEED_PER_MILESTONE = 0.1;
const SPEED_MILESTONES = [5, 10];

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_WEAPON_LEVEL) {
    throw new RangeError(`Niveau d'arme invalide : ${level}`);
  }
}

export function weaponDamage(type: WeaponType, level: number): number {
  assertLevel(level);
  return WEAPONS[type].damage * (1 + DAMAGE_PER_LEVEL * (level - 1));
}

export function weaponAttacksPerSec(type: WeaponType, level: number): number {
  assertLevel(level);
  const reached = SPEED_MILESTONES.filter((m) => level >= m).length;
  return WEAPONS[type].attacksPerSec * (1 + SPEED_PER_MILESTONE * reached);
}

export interface UpgradeCost {
  gold: number;
  materials: number;
}

/** Coût pour passer de `currentLevel` à `currentLevel + 1`, ou `null` au niveau max. */
export function upgradeCost(currentLevel: number): UpgradeCost | null {
  assertLevel(currentLevel);
  if (currentLevel === MAX_WEAPON_LEVEL) return null;
  const next = currentLevel + 1;
  return {
    gold: Math.round(50 * 1.6 ** (currentLevel - 1)),
    materials: next === 5 ? 5 : next === 10 ? 20 : 0,
  };
}

export function isWeaponType(v: string): v is WeaponType {
  return (WEAPON_TYPES as readonly string[]).includes(v);
}
