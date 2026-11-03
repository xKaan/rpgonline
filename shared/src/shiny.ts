import { ELEMENTS, type Element } from './enchantments';
import type { Rng } from './rng';

export const SHINY_EFFECTS = ['burning', 'electric', 'venomous', 'frozen', 'swift', 'shielded', 'splitting'] as const;
export type ShinyEffect = (typeof SHINY_EFFECTS)[number];

export const SHINY = {
  chance: 0.05,
  hpMult: 2,
  damageMult: 1.25,
  lootMult: 5,
  scale: 1.3,
  stones: 1,
  bossStones: 3,
  swiftSpeedMult: 1.5,
  shieldHits: 3,
  /** Enflammé : une flaque de feu toutes les 0,5 s, 3 s, rayon 1 m, dégâts/s = 50 % des dégâts du monstre */
  trailEvery: 0.5,
  trailSec: 3,
  trailRadius: 1,
  trailDpsRatio: 0.5,
  /** Électrique : décharge de zone toutes les 4 s, annoncée 0,75 s avant */
  shockEvery: 4,
  shockWarn: 0.75,
  shockRadius: 4,
  /** Venimeux / Gelé : effet appliqué au joueur touché */
  venomDps: 3,
  venomSec: 4,
  frostSlow: 0.3,
  frostSec: 2,
} as const;

export const SHINY_LABELS: Record<ShinyEffect, string> = {
  burning: 'Enflammé',
  electric: 'Électrique',
  venomous: 'Venimeux',
  frozen: 'Gelé',
  swift: 'Rapide',
  shielded: 'Bouclier',
  splitting: 'Scission',
};

const EFFECT_ELEMENT: Partial<Record<ShinyEffect, Element>> = {
  burning: 'fire',
  electric: 'lightning',
  venomous: 'poison',
  frozen: 'ice',
};

/** `null` si le monstre n'est pas shiny ; sinon 1 effet (2 pour un boss), distincts. */
export function rollShiny(rng: Rng, boss: boolean): ShinyEffect[] | null {
  if (rng() >= SHINY.chance) return null;
  const pool: ShinyEffect[] = [...SHINY_EFFECTS];
  const out: ShinyEffect[] = [];
  for (let i = 0; i < (boss ? 2 : 1); i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/** Pierres garanties d'un shiny : élément de l'effet, aléatoire pour Rapide/Bouclier/Scission. */
export function shinyStones(effects: readonly ShinyEffect[], boss: boolean, rng: Rng): Element[] {
  const count = boss ? SHINY.bossStones : SHINY.stones;
  return Array.from(
    { length: count },
    (_, i) => EFFECT_ELEMENT[effects[i % effects.length]] ?? ELEMENTS[Math.floor(rng() * ELEMENTS.length)],
  );
}
