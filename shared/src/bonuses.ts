import { ROLL_COOLDOWN } from './movement';
import { PICKUP_RADIUS } from './loot';
import type { Rng } from './rng';

export const BONUS_IDS = [
  'damage',
  'attackSpeed',
  'maxHp',
  'lifesteal',
  'multishot',
  'crit',
  'rollCooldown',
  'moveSpeed',
  'pickupRadius',
  'armor',
  'bossDamage',
  'elemental',
  'gold',
  'range',
  'thorns',
] as const;
export type BonusId = (typeof BONUS_IDS)[number];

export const BONUSES: Record<BonusId, { label: string; description: string }> = {
  damage: { label: 'Force', description: '+15 % de dégâts' },
  attackSpeed: { label: 'Frénésie', description: "+10 % de vitesse d'attaque" },
  maxHp: { label: 'Vigueur', description: '+20 PV max' },
  lifesteal: { label: 'Vampirisme', description: '3 % des dégâts infligés rendus en PV' },
  multishot: { label: 'Tir multiple', description: '+1 projectile (arc, arbalète)' },
  crit: { label: 'Précision', description: '+10 % de chance de critique (×2)' },
  rollCooldown: { label: 'Agilité', description: '−20 % de recharge de la roulade' },
  moveSpeed: { label: 'Célérité', description: '+15 % de vitesse de déplacement' },
  pickupRadius: { label: 'Aimant', description: '+30 % de rayon de ramassage' },
  armor: { label: 'Armure', description: '−10 % de dégâts subis' },
  bossDamage: { label: 'Tueur de géants', description: '+20 % de dégâts aux boss' },
  elemental: { label: 'Affinité', description: '+25 % de dégâts des enchantements' },
  gold: { label: 'Cupidité', description: "+20 % d'or ramassé" },
  range: { label: 'Allonge', description: '+15 % de portée en mêlée' },
  thorns: { label: 'Épines', description: '20 % des dégâts de mêlée subis renvoyés' },
};

export const BASE_MAX_HP = 100;

export interface PlayerStats {
  damageMult: number;
  attackSpeedMult: number;
  maxHp: number;
  lifesteal: number;
  extraProjectiles: number;
  critChance: number;
  /** recharge de la roulade (s) */
  rollCooldown: number;
  speedMult: number;
  pickupRadius: number;
  damageTakenMult: number;
  bossDamageMult: number;
  elementalMult: number;
  goldMult: number;
  meleeRangeMult: number;
  thorns: number;
}

/** Statistiques du joueur d'après ses bonus de run (cumulables). */
export function computeStats(bonuses: readonly BonusId[]): PlayerStats {
  const n = (id: BonusId) => bonuses.filter((b) => b === id).length;
  return {
    damageMult: 1 + 0.15 * n('damage'),
    attackSpeedMult: 1 + 0.1 * n('attackSpeed'),
    maxHp: BASE_MAX_HP + 20 * n('maxHp'),
    lifesteal: 0.03 * n('lifesteal'),
    extraProjectiles: n('multishot'),
    critChance: Math.min(1, 0.1 * n('crit')),
    rollCooldown: ROLL_COOLDOWN * 0.8 ** n('rollCooldown'),
    speedMult: 1 + 0.15 * n('moveSpeed'),
    pickupRadius: PICKUP_RADIUS * (1 + 0.3 * n('pickupRadius')),
    damageTakenMult: 0.9 ** n('armor'),
    bossDamageMult: 1 + 0.2 * n('bossDamage'),
    elementalMult: 1 + 0.25 * n('elemental'),
    goldMult: 1 + 0.2 * n('gold'),
    meleeRangeMult: 1 + 0.15 * n('range'),
    thorns: 0.2 * n('thorns'),
  };
}

/** Tire `count` bonus distincts. */
export function drawBonuses(rng: Rng, count = 3): BonusId[] {
  const pool: BonusId[] = [...BONUS_IDS];
  const out: BonusId[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function isBonusId(v: string): v is BonusId {
  return (BONUS_IDS as readonly string[]).includes(v);
}
