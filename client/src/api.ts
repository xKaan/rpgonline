import type { Appearance, AuthResult, CharacterDetail, CharacterSummary, Element, Me, WeaponType } from '@rpg/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  getToken(): string | null;
  /** appelé quand une requête authentifiée reçoit 401 (jeton expiré ou invalide) */
  onUnauthorized?(): void;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createApi(opts: ApiOptions) {
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const base = opts.baseUrl ?? '';

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = opts.getToken();
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await doFetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur');
    }
    if (res.status === 204) return undefined as T;

    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(res.status, data?.error ?? 'UNKNOWN', data?.message ?? `Erreur inattendue du serveur (${res.status})`);
    }
    return data as T;
  }

  return {
    register: (username: string, password: string) => request<AuthResult>('POST', '/api/auth/register', { username, password }),
    login: (username: string, password: string) => request<AuthResult>('POST', '/api/auth/login', { username, password }),
    me: () => request<Me>('GET', '/api/me'),
    listCharacters: () =>
      request<{ characters: CharacterSummary[] }>('GET', '/api/characters').then((r) => r.characters),
    getCharacter: (id: number) => request<CharacterDetail>('GET', `/api/characters/${id}`),
    createCharacter: (name: string, appearance: Appearance) =>
      request<CharacterDetail>('POST', '/api/characters', { name, appearance }),
    updateAppearance: (id: number, appearance: Appearance) =>
      request<CharacterDetail>('PATCH', `/api/characters/${id}`, { appearance }),
    deleteCharacter: (id: number) => request<void>('DELETE', `/api/characters/${id}`),
    upgradeWeapon: (id: number, type: WeaponType) =>
      request<CharacterDetail>('POST', `/api/characters/${id}/weapons/${type}/upgrade`),
    enchantWeapon: (id: number, type: WeaponType, slot: 0 | 1, element: Element) =>
      request<CharacterDetail>('POST', `/api/characters/${id}/weapons/${type}/enchant`, { slot, element }),
  };
}

export type Api = ReturnType<typeof createApi>;
