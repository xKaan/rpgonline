import { describe, it, expect, vi } from 'vitest';
import { ApiError, createApi } from '../src/api';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('client API', () => {
  it("envoie le jeton et le corps JSON, et renvoie la réponse", async () => {
    const fetch = vi.fn(async () => json(200, { token: 'x', username: 'Kaan' }));
    const api = createApi({ getToken: () => 'abc', fetch });
    expect(await api.login('Kaan', 'motdepasse123')).toEqual({ token: 'x', username: 'Kaan' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'Kaan', password: 'motdepasse123' });
  });

  it("transforme une erreur serveur en ApiError avec le message français", async () => {
    const api = createApi({ getToken: () => 'abc', fetch: async () => json(400, { error: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" }) });
    const err = await api.upgradeWeapon(1, 'sword').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" });
  });

  it('appelle onUnauthorized sur un 401 quand on avait un jeton', async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ getToken: () => 'expiré', onUnauthorized, fetch: async () => json(401, { error: 'UNAUTHORIZED', message: 'Session invalide ou expirée' }) });
    await expect(api.listCharacters()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("n'appelle pas onUnauthorized sur un échec de connexion sans jeton", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ getToken: () => null, onUnauthorized, fetch: async () => json(401, { error: 'INVALID_CREDENTIALS', message: 'x' }) });
    await expect(api.login('a', 'b')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('serveur injoignable → ApiError NETWORK', async () => {
    const api = createApi({ getToken: () => null, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'NETWORK', message: 'Impossible de joindre le serveur' });
  });

  it('réponse non JSON → ApiError générique', async () => {
    const api = createApi({ getToken: () => null, fetch: async () => new Response('<html>502</html>', { status: 502 }) });
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('204 → undefined, et listCharacters déballe le tableau', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { characters: [{ id: 1 }] }));
    const api = createApi({ getToken: () => 'abc', fetch });
    expect(await api.deleteCharacter(3)).toBeUndefined();
    expect(fetch.mock.calls[0][0]).toBe('/api/characters/3');
    expect(await api.listCharacters()).toEqual([{ id: 1 }]);
  });

  it("enchantWeapon envoie slot et élément", async () => {
    const fetch = vi.fn(async () => json(200, {}));
    await createApi({ getToken: () => 'abc', fetch }).enchantWeapon(4, 'bow', 1, 'ice');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/characters/4/weapons/bow/enchant');
    expect(JSON.parse(init.body as string)).toEqual({ slot: 1, element: 'ice' });
  });
});
