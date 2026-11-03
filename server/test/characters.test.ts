import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import { auth, makeApp, registerUser } from './helpers';

let app: FastifyInstance;
let token: string;

beforeEach(async () => {
  ({ app } = makeApp());
  token = await registerUser(app, 'kaan');
});

const createChar = (name: string, t = token, appearance: unknown = DEFAULT_APPEARANCE) =>
  app.inject({ method: 'POST', url: '/api/characters', headers: auth(t), payload: { name, appearance } });

describe('API personnages', () => {
  it('exige une authentification', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/characters' });
    expect(res.statusCode).toBe(401);
  });

  it('crée, liste, lit, modifie et supprime un perso', async () => {
    const created = await createChar('  Arthur ');
    expect(created.statusCode).toBe(201);
    const c = created.json();
    expect(c).toMatchObject({ name: 'Arthur', gold: 0, appearance: DEFAULT_APPEARANCE });
    expect(c.weapons).toHaveLength(7);

    const list = await app.inject({ method: 'GET', url: '/api/characters', headers: auth(token) });
    expect(list.json()).toEqual({ characters: [{ id: c.id, name: 'Arthur', appearance: DEFAULT_APPEARANCE, bestWave: 0 }] });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${c.id}`,
      headers: auth(token),
      payload: { appearance: { ...DEFAULT_APPEARANCE, base: 'rogue' } },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().appearance.base).toBe('rogue');

    const del = await app.inject({ method: 'DELETE', url: `/api/characters/${c.id}`, headers: auth(token) });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: `/api/characters/${c.id}`, headers: auth(token) });
    expect(get.statusCode).toBe(404);
  });

  it('refuse une apparence ou un nom invalide', async () => {
    expect((await createChar('Arthur', token, { ...DEFAULT_APPEARANCE, base: 'dragon' })).statusCode).toBe(400);
    expect((await createChar('<b>', token)).statusCode).toBe(400);
  });

  it('limite à 5 persos par compte', async () => {
    for (const n of ['P1', 'P2', 'P3', 'P4', 'P5']) expect((await createChar(n)).statusCode).toBe(201);
    const res = await createChar('P6');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CHARACTER_LIMIT');
  });

  it('nom unique par compte (casse ignorée), mais libre entre comptes', async () => {
    await createChar('Arthur');
    const dup = await createChar('arthur');
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('NAME_TAKEN');
    const other = await registerUser(app, 'autre');
    expect((await createChar('Arthur', other)).statusCode).toBe(201);
  });

  it("répond 404 sur le perso d'un autre compte et ne le modifie pas", async () => {
    const c = (await createChar('Arthur')).json();
    const other = await registerUser(app, 'autre');
    const url = `/api/characters/${c.id}`;
    expect((await app.inject({ method: 'GET', url, headers: auth(other) })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url, headers: auth(other), payload: { appearance: { ...DEFAULT_APPEARANCE, base: 'mage' } } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: auth(other) })).statusCode).toBe(404);
    const mine = await app.inject({ method: 'GET', url, headers: auth(token) });
    expect(mine.json().appearance.base).toBe('knight');
  });

  it('répond 404 sur un id non numérique', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/characters/abc', headers: auth(token) });
    expect(res.statusCode).toBe(404);
  });
});
