import { describe, it, expect } from 'vitest';
import { createSession, type KeyValueStorage } from '../src/session';

const memoryStorage = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const throwingStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('bloqué');
  },
  setItem: () => {
    throw new Error('bloqué');
  },
  removeItem: () => {
    throw new Error('bloqué');
  },
};

describe('session', () => {
  it('persiste et relit le jeton', () => {
    const storage = memoryStorage();
    createSession(storage).save('t0k3n', 'Kaan');
    const again = createSession(storage);
    expect(again.token).toBe('t0k3n');
    expect(again.username).toBe('Kaan');
    again.clear();
    expect(createSession(storage).token).toBeNull();
  });

  it('fonctionne en mémoire si le stockage lève ou est absent', () => {
    for (const storage of [throwingStorage, null]) {
      const s = createSession(storage);
      expect(s.token).toBeNull();
      s.save('abc', 'Kaan');
      expect(s.token).toBe('abc');
      s.clear();
      expect(s.username).toBeNull();
    }
  });
});
