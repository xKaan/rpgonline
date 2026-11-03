export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Session {
  readonly token: string | null;
  readonly username: string | null;
  save(token: string, username: string): void;
  clear(): void;
}

const TOKEN_KEY = 'rpg.token';
const USERNAME_KEY = 'rpg.username';

/** Session persistée si possible ; reste fonctionnelle en mémoire si le stockage est absent ou bloqué. */
export function createSession(storage: KeyValueStorage | null): Session {
  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null) => {
    try {
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // stockage indisponible : on garde la valeur en mémoire
    }
  };

  let token = read(TOKEN_KEY);
  let username = read(USERNAME_KEY);

  return {
    get token() {
      return token;
    },
    get username() {
      return username;
    },
    save(t, u) {
      token = t;
      username = u;
      write(TOKEN_KEY, t);
      write(USERNAME_KEY, u);
    },
    clear() {
      token = null;
      username = null;
      write(TOKEN_KEY, null);
      write(USERNAME_KEY, null);
    },
  };
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
