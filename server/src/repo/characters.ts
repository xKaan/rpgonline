import {
  ELEMENTS,
  MAX_CHARACTERS,
  WEAPON_TYPES,
  emptyStones,
  type Appearance,
  type Element,
  type Enchant,
  type EnchantRank,
  type Wallet,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';
import { allRows, getRow, tx, type Db } from '../db';

export interface CharacterSummary {
  id: number;
  name: string;
  appearance: Appearance;
  bestWave: number;
}

export interface CharacterDetail extends CharacterSummary {
  gold: number;
  materials: number;
  stones: Record<Element, number>;
  weapons: WeaponState[];
}

interface CharacterRow {
  id: number;
  name: string;
  appearance: string;
  gold: number;
  materials: number;
  best_wave: number;
}

interface WeaponRow {
  weapon_type: WeaponType;
  level: number;
  enchant_1: Element | null;
  enchant_1_rank: number | null;
  enchant_2: Element | null;
  enchant_2_rank: number | null;
}

const toEnchant = (element: Element | null, rank: number | null): Enchant | null =>
  element && rank ? { element, rank: rank as EnchantRank } : null;

const toSummary = (r: CharacterRow): CharacterSummary => ({
  id: r.id,
  name: r.name,
  appearance: JSON.parse(r.appearance) as Appearance,
  bestWave: r.best_wave,
});

export function listCharacters(db: Db, accountId: number): CharacterSummary[] {
  return allRows<CharacterRow>(
    db,
    'SELECT id, name, appearance, gold, materials, best_wave FROM characters WHERE account_id = ? ORDER BY id',
    accountId,
  ).map(toSummary);
}

export function getCharacter(db: Db, accountId: number, characterId: number): CharacterDetail | undefined {
  const row = getRow<CharacterRow>(
    db,
    'SELECT id, name, appearance, gold, materials, best_wave FROM characters WHERE id = ? AND account_id = ?',
    characterId,
    accountId,
  );
  if (!row) return undefined;

  const weapons = allRows<WeaponRow>(
    db,
    'SELECT weapon_type, level, enchant_1, enchant_1_rank, enchant_2, enchant_2_rank FROM character_weapons WHERE character_id = ?',
    characterId,
  )
    .map(
      (w): WeaponState => ({
        type: w.weapon_type,
        level: w.level,
        enchants: [toEnchant(w.enchant_1, w.enchant_1_rank), toEnchant(w.enchant_2, w.enchant_2_rank)],
      }),
    )
    .sort((a, b) => WEAPON_TYPES.indexOf(a.type) - WEAPON_TYPES.indexOf(b.type));

  const stones = emptyStones();
  for (const s of allRows<{ element: Element; count: number }>(
    db,
    'SELECT element, count FROM character_stones WHERE character_id = ?',
    characterId,
  )) {
    stones[s.element] = s.count;
  }

  return { ...toSummary(row), gold: row.gold, materials: row.materials, stones, weapons };
}

export function createCharacter(
  db: Db,
  accountId: number,
  name: string,
  appearance: Appearance,
): CharacterDetail | 'LIMIT' | 'NAME_TAKEN' {
  const id = tx(db, (): number | 'LIMIT' | 'NAME_TAKEN' => {
    const { n } = getRow<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM characters WHERE account_id = ?', accountId)!;
    if (n >= MAX_CHARACTERS) return 'LIMIT';
    const taken = getRow(db, 'SELECT 1 FROM characters WHERE account_id = ? AND name = ? COLLATE NOCASE', accountId, name);
    if (taken) return 'NAME_TAKEN';

    const res = db
      .prepare('INSERT INTO characters (account_id, name, appearance) VALUES (?, ?, ?)')
      .run(accountId, name, JSON.stringify(appearance));
    const characterId = Number(res.lastInsertRowid);
    const insertWeapon = db.prepare('INSERT INTO character_weapons (character_id, weapon_type) VALUES (?, ?)');
    for (const type of WEAPON_TYPES) insertWeapon.run(characterId, type);
    const insertStone = db.prepare('INSERT INTO character_stones (character_id, element, count) VALUES (?, ?, 0)');
    for (const element of ELEMENTS) insertStone.run(characterId, element);
    return characterId;
  });
  return typeof id === 'number' ? getCharacter(db, accountId, id)! : id;
}

export function updateAppearance(db: Db, accountId: number, characterId: number, appearance: Appearance): boolean {
  const res = db
    .prepare('UPDATE characters SET appearance = ? WHERE id = ? AND account_id = ?')
    .run(JSON.stringify(appearance), characterId, accountId);
  return res.changes > 0;
}

export function deleteCharacter(db: Db, accountId: number, characterId: number): boolean {
  const res = db.prepare('DELETE FROM characters WHERE id = ? AND account_id = ?').run(characterId, accountId);
  return res.changes > 0;
}

/** À appeler dans une transaction ; ne vérifie pas le propriétaire (déjà fait par l'appelant). */
export function saveWeaponAndWallet(db: Db, characterId: number, weapon: WeaponState, wallet: Wallet): void {
  db.prepare('UPDATE characters SET gold = ?, materials = ? WHERE id = ?').run(wallet.gold, wallet.materials, characterId);
  const [e1, e2] = weapon.enchants;
  db.prepare(
    `UPDATE character_weapons
     SET level = ?, enchant_1 = ?, enchant_1_rank = ?, enchant_2 = ?, enchant_2_rank = ?
     WHERE character_id = ? AND weapon_type = ?`,
  ).run(weapon.level, e1?.element ?? null, e1?.rank ?? null, e2?.element ?? null, e2?.rank ?? null, characterId, weapon.type);
  const setStone = db.prepare('UPDATE character_stones SET count = ? WHERE character_id = ? AND element = ?');
  for (const element of ELEMENTS) setStone.run(wallet.stones[element], characterId, element);
}
