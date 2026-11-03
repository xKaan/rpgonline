import { ELEMENTS, type Element } from './enchantments';
import { ENEMIES, goldDrop, type EnemyKind } from './monsters';
import type { Rng } from './rng';
import { SHINY, shinyStones, type ShinyEffect } from './shiny';

export interface LootDrop {
  gold: number;
  materials: number;
  stones: Element[];
}

export const PICKUP_RADIUS = 1.5;
/** durée de vie du loot au sol (s) */
export const LOOT_DESPAWN = 90;

export function monsterLoot(kind: EnemyKind, wave: number, shiny: readonly ShinyEffect[] | null, rng: Rng): LootDrop {
  const base = ENEMIES[kind];
  if (!shiny) return { gold: goldDrop(kind, wave), materials: base.materials, stones: [] };
  return {
    gold: goldDrop(kind, wave) * SHINY.lootMult,
    materials: Math.max(1, base.materials) * SHINY.lootMult,
    stones: shinyStones(shiny, base.boss, rng),
  };
}

export const CHEST = { perBreak: 2, maxOnMap: 4, goldPerWave: 15, stoneChance: 0.3, openRadius: 1.6 } as const;

export function chestLoot(wave: number, rng: Rng): LootDrop {
  const stones = rng() < CHEST.stoneChance ? [ELEMENTS[Math.floor(rng() * ELEMENTS.length)]] : [];
  return { gold: CHEST.goldPerWave * Math.max(1, wave), materials: 0, stones };
}
