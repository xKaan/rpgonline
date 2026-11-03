import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import { openDb, type Db } from '../src/db';
import { createAccount, findAccountById, findAccountByUsername } from '../src/repo/accounts';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  saveWeaponAndWallet,
  updateAppearance,
  type CharacterDetail,
} from '../src/repo/characters';

let db: Db;
let accountId: number;

beforeEach(() => {
  db = openDb(':memory:');
  accountId = createAccount(db, 'Kaan', 'hash')!;
});

const create = (name: string, account = accountId) => createCharacter(db, account, name, DEFAULT_APPEARANCE) as CharacterDetail;

describe('comptes', () => {
  it('crée et retrouve un compte sans tenir compte de la casse', () => {
    expect(findAccountByUsername(db, 'kaan')).toMatchObject({ id: accountId, username: 'Kaan' });
    expect(findAccountById(db, accountId)?.username).toBe('Kaan');
    expect(createAccount(db, 'KAAN', 'hash')).toBeNull();
  });
});

describe('personnages', () => {
  it('crée un perso avec 7 armes niveau 1, 0 or et 0 pierre', () => {
    const c = create('Arthur');
    expect(c).toMatchObject({ name: 'Arthur', gold: 0, materials: 0, bestWave: 0, appearance: DEFAULT_APPEARANCE });
    expect(c.weapons.map((w) => w.type)).toEqual(['sword', 'shovel', 'axe', 'spear', 'mace', 'bow', 'crossbow']);
    expect(c.weapons.every((w) => w.level === 1 && w.enchants[0] === null && w.enchants[1] === null)).toBe(true);
    expect(c.stones).toEqual({ fire: 0, lightning: 0, poison: 0, ice: 0 });
  });

  it('limite à 5 persos et refuse un nom en double (casse ignorée)', () => {
    for (const n of ['A1', 'A2', 'A3', 'A4']) create(n);
    expect(createCharacter(db, accountId, 'a1', DEFAULT_APPEARANCE)).toBe('NAME_TAKEN');
    create('A5');
    expect(createCharacter(db, accountId, 'A6', DEFAULT_APPEARANCE)).toBe('LIMIT');
    expect(listCharacters(db, accountId)).toHaveLength(5);
  });

  it("isole les persos par compte", () => {
    const other = createAccount(db, 'autre', 'hash')!;
    const c = create('Arthur');
    expect(getCharacter(db, other, c.id)).toBeUndefined();
    expect(updateAppearance(db, other, c.id, { ...DEFAULT_APPEARANCE, base: 'mage' })).toBe(false);
    expect(deleteCharacter(db, other, c.id)).toBe(false);
    expect(getCharacter(db, accountId, c.id)?.appearance.base).toBe('knight');
  });

  it("met à jour l'apparence et supprime", () => {
    const c = create('Arthur');
    expect(updateAppearance(db, accountId, c.id, { ...DEFAULT_APPEARANCE, base: 'mage' })).toBe(true);
    expect(getCharacter(db, accountId, c.id)?.appearance.base).toBe('mage');
    expect(deleteCharacter(db, accountId, c.id)).toBe(true);
    expect(getCharacter(db, accountId, c.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM character_weapons').get()).toEqual({ n: 0 });
  });

  it('sauvegarde une arme et le porte-monnaie', () => {
    const c = create('Arthur');
    saveWeaponAndWallet(
      db,
      c.id,
      { type: 'axe', level: 7, enchants: [{ element: 'fire', rank: 2 }, { element: 'ice', rank: 1 }] },
      { gold: 12, materials: 3, stones: { fire: 1, lightning: 2, poison: 3, ice: 4 } },
    );
    const after = getCharacter(db, accountId, c.id)!;
    expect(after.gold).toBe(12);
    expect(after.materials).toBe(3);
    expect(after.stones).toEqual({ fire: 1, lightning: 2, poison: 3, ice: 4 });
    expect(after.weapons.find((w) => w.type === 'axe')).toEqual({
      type: 'axe',
      level: 7,
      enchants: [{ element: 'fire', rank: 2 }, { element: 'ice', rank: 1 }],
    });
  });
});

describe('noms accentués', () => {
  it('refuse un nom identique à la casse près, accents compris', () => {
    create('Élise');
    expect(createCharacter(db, accountId, 'élise', DEFAULT_APPEARANCE)).toBe('NAME_TAKEN');
  });
});
