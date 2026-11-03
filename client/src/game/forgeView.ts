import {
  ENCHANT_EFFECTS,
  WEAPONS,
  enchantSlotCount,
  upgradeCost,
  type CharacterDetail,
  type Enchant,
  type UpgradeCost,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';

export interface WeaponRowView {
  type: WeaponType;
  label: string;
  level: number;
  maxed: boolean;
  cost: UpgradeCost | null;
  affordable: boolean;
  enchants: WeaponState['enchants'];
  slotCount: 1 | 2;
}

export function forgeRows(c: CharacterDetail): WeaponRowView[] {
  return c.weapons.map((w) => {
    const cost = upgradeCost(w.level);
    return {
      type: w.type,
      label: WEAPONS[w.type].label,
      level: w.level,
      maxed: cost === null,
      cost,
      affordable: cost !== null && c.gold >= cost.gold && c.materials >= cost.materials,
      enchants: w.enchants,
      slotCount: enchantSlotCount(w.level),
    };
  });
}

const ROMAN = ['I', 'II', 'III'] as const;

export function enchantLabel(e: Enchant | null): string {
  return e ? `${ENCHANT_EFFECTS[e.element].label} ${ROMAN[e.rank - 1]}` : 'Vide';
}
