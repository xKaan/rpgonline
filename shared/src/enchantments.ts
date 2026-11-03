export const ELEMENTS = ['fire', 'lightning', 'poison', 'ice'] as const;
export type Element = (typeof ELEMENTS)[number];

export type EnchantRank = 1 | 2 | 3;
export const MAX_ENCHANT_RANK = 3;

export interface Enchant {
  element: Element;
  rank: EnchantRank;
}

/** Paramètres des effets ; les tableaux sont indexés par `rank - 1`. */
export const ENCHANT_EFFECTS = {
  fire: { label: 'Feu', burnSec: 3, dpsRatioByRank: [0.15, 0.25, 0.35] },
  lightning: { label: 'Électricité', chainsByRank: [1, 2, 3], chainRadius: 5, chainDamageRatio: 0.5 },
  poison: { label: 'Poison', maxStacksByRank: [3, 5, 7], dpsPerStack: 2, durationSec: 5 },
  ice: { label: 'Glace', slowByRank: [0.2, 0.3, 0.4], slowSec: 2, freezeChanceByRank: [0, 0, 0.1], freezeSec: 1 },
} as const;

const STONES_TO_REACH_RANK = [1, 2, 4] as const;

export function stonesToReachRank(rank: EnchantRank): number {
  return STONES_TO_REACH_RANK[rank - 1];
}

const SECOND_SLOT_LEVEL = 7;

export function enchantSlotCount(level: number): 1 | 2 {
  return level >= SECOND_SLOT_LEVEL ? 2 : 1;
}

export function isElement(v: string): v is Element {
  return (ELEMENTS as readonly string[]).includes(v);
}
