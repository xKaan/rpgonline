import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  appearance TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  materials INTEGER NOT NULL DEFAULT 0,
  best_wave INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_account_name ON characters(account_id, name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS character_weapons (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  weapon_type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  enchant_1 TEXT,
  enchant_1_rank INTEGER,
  enchant_2 TEXT,
  enchant_2_rank INTEGER,
  PRIMARY KEY (character_id, weapon_type)
);
CREATE TABLE IF NOT EXISTS character_stones (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, element)
);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Exécute `fn` dans une transaction ; rollback si elle lève. `fn` doit être synchrone. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getRow<T>(db: Db, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function allRows<T>(db: Db, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}
