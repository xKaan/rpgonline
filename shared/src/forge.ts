import { enchantSlotCount, MAX_ENCHANT_RANK, stonesToReachRank, type Element, type Enchant, type EnchantRank } from './enchantments';
import { upgradeCost, type WeaponType } from './weapons';

export interface WeaponState {
  type: WeaponType;
  level: number;
  enchants: [Enchant | null, Enchant | null];
}

export interface Wallet {
  gold: number;
  materials: number;
  stones: Record<Element, number>;
}

export type ForgeError =
  | 'MAX_LEVEL'
  | 'NOT_ENOUGH_GOLD'
  | 'NOT_ENOUGH_MATERIALS'
  | 'SLOT_LOCKED'
  | 'DUPLICATE_ELEMENT'
  | 'MAX_RANK'
  | 'NOT_ENOUGH_STONES';

export type ForgeResult = { ok: true; weapon: WeaponState; wallet: Wallet } | { ok: false; error: ForgeError };

export function newWeapon(type: WeaponType): WeaponState {
  return { type, level: 1, enchants: [null, null] };
}

export function emptyStones(): Record<Element, number> {
  return { fire: 0, lightning: 0, poison: 0, ice: 0 };
}

const fail = (error: ForgeError): ForgeResult => ({ ok: false, error });

export function upgradeWeapon(weapon: WeaponState, wallet: Wallet): ForgeResult {
  const cost = upgradeCost(weapon.level);
  if (!cost) return fail('MAX_LEVEL');
  if (wallet.gold < cost.gold) return fail('NOT_ENOUGH_GOLD');
  if (wallet.materials < cost.materials) return fail('NOT_ENOUGH_MATERIALS');
  return {
    ok: true,
    weapon: { ...weapon, level: weapon.level + 1, enchants: [...weapon.enchants] },
    wallet: {
      gold: wallet.gold - cost.gold,
      materials: wallet.materials - cost.materials,
      stones: { ...wallet.stones },
    },
  };
}

export function enchantWeapon(weapon: WeaponState, wallet: Wallet, slot: 0 | 1, element: Element): ForgeResult {
  if (slot >= enchantSlotCount(weapon.level)) return fail('SLOT_LOCKED');
  const other = weapon.enchants[slot === 0 ? 1 : 0];
  if (other?.element === element) return fail('DUPLICATE_ELEMENT');

  const current = weapon.enchants[slot];
  const nextRank = current?.element === element ? current.rank + 1 : 1;
  if (nextRank > MAX_ENCHANT_RANK) return fail('MAX_RANK');

  const cost = stonesToReachRank(nextRank as EnchantRank);
  if (wallet.stones[element] < cost) return fail('NOT_ENOUGH_STONES');

  const enchants: WeaponState['enchants'] = [...weapon.enchants];
  enchants[slot] = { element, rank: nextRank as EnchantRank };
  return {
    ok: true,
    weapon: { ...weapon, enchants },
    wallet: { ...wallet, stones: { ...wallet.stones, [element]: wallet.stones[element] - cost } },
  };
}
