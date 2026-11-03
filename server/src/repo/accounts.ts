import { getRow, type Db } from '../db';

export interface AccountRow {
  id: number;
  username: string;
  password_hash: string;
}

export function findAccountByUsername(db: Db, username: string): AccountRow | undefined {
  return getRow<AccountRow>(db, 'SELECT id, username, password_hash FROM accounts WHERE username = ?', username);
}

export function findAccountById(db: Db, id: number): AccountRow | undefined {
  return getRow<AccountRow>(db, 'SELECT id, username, password_hash FROM accounts WHERE id = ?', id);
}

/** Retourne l'id du compte créé, ou `null` si le pseudo est déjà pris (casse ignorée). */
export function createAccount(db: Db, username: string, passwordHash: string): number | null {
  if (findAccountByUsername(db, username)) return null;
  const res = db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return Number(res.lastInsertRowid);
}
