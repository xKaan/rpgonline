import {
  ELEMENTS,
  MAX_CHARACTERS,
  WEAPON_TYPES,
  emptyStones,
  parseAppearance,
  type Appearance,
  type CharacterDetail,
  type CharacterSummary,
  type Element,
  type Enchant,
  type EnchantRank,
  type Wallet,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';
import { allRows, getRow, tx, type Db } from '../db';

export type { CharacterDetail, CharacterSummary };

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

/** Clé d'unicité du nom : insensible à la casse, accents compris. */
const nameKey = (name: string) => name.normalize('NFC').toLowerCase();

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toSummary = (r: CharacterRow): CharacterSummary => ({
  id: r.id,
  name: r.name,
  appearance: parseAppearance(safeJson(r.appearance)),
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
    const taken = getRow(db, 'SELECT 1 FROM characters WHERE account_id = ? AND name_key = ?', accountId, nameKey(name));
    if (taken) return 'NAME_TAKEN';

    const res = db
      .prepare('INSERT INTO characters (account_id, name, name_key, appearance) VALUES (?, ?, ?, ?)')
      .run(accountId, name, nameKey(name), JSON.stringify(appearance));
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

export interface LootGain {
  gold: number;
  materials: number;
  stones: Partial<Record<Element, number>>;
}

/** Ajoute du loot ramassé (incréments atomiques : sûr même si la forge écrit en parallèle). */
export function addLoot(db: Db, characterId: number, loot: LootGain): void {
  tx(db, () => {
    db.prepare('UPDATE characters SET gold = gold + ?, materials = materials + ? WHERE id = ?').run(loot.gold, loot.materials, characterId);
    const addStone = db.prepare('UPDATE character_stones SET count = count + ? WHERE character_id = ? AND element = ?');
    for (const [element, n] of Object.entries(loot.stones)) if (n) addStone.run(n, characterId, element);
  });
}

/** Enregistre la vague atteinte si c'est un record ; renvoie la meilleure vague. */
export function recordBestWave(db: Db, characterId: number, wave: number): number {
  db.prepare('UPDATE characters SET best_wave = MAX(best_wave, ?) WHERE id = ?').run(wave, characterId);
  return getRow<{ best_wave: number }>(db, 'SELECT best_wave FROM characters WHERE id = ?', characterId)?.best_wave ?? 0;
}
