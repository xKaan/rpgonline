import { enchantWeapon, upgradeWeapon, type Element, type ForgeError, type WeaponType } from '@rpg/shared';
import { tx, type Db } from './db';
import { getCharacter, saveWeaponAndWallet, type CharacterDetail } from './repo/characters';

export type ForgeAction = { kind: 'upgrade' } | { kind: 'enchant'; slot: 0 | 1; element: Element };

export type ForgeServiceResult = { ok: true; character: CharacterDetail } | { ok: false; error: ForgeError | 'NOT_FOUND' };

/** Applique une action de forge de façon atomique : en cas de refus, rien n'est écrit. */
export function runForgeAction(
  db: Db,
  accountId: number,
  characterId: number,
  weaponType: WeaponType,
  action: ForgeAction,
): ForgeServiceResult {
  return tx(db, (): ForgeServiceResult => {
    const character = getCharacter(db, accountId, characterId);
    const weapon = character?.weapons.find((w) => w.type === weaponType);
    if (!character || !weapon) return { ok: false, error: 'NOT_FOUND' };

    const wallet = { gold: character.gold, materials: character.materials, stones: character.stones };
    const result =
      action.kind === 'upgrade' ? upgradeWeapon(weapon, wallet) : enchantWeapon(weapon, wallet, action.slot, action.element);
    if (!result.ok) return result;

    saveWeaponAndWallet(db, characterId, result.weapon, result.wallet);
    return { ok: true, character: getCharacter(db, accountId, characterId)! };
  });
}
