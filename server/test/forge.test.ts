import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import type { Db } from '../src/db';
import { auth, makeApp, registerUser } from './helpers';

let app: FastifyInstance;
let db: Db;
let token: string;
let charId: number;

beforeEach(async () => {
  ({ app, db } = makeApp());
  token = await registerUser(app, 'kaan');
  const res = await app.inject({ method: 'POST', url: '/api/characters', headers: auth(token), payload: { name: 'Arthur', appearance: DEFAULT_APPEARANCE } });
  charId = res.json().id;
});

const setWallet = (gold: number, fireStones = 0) => {
  db.prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, charId);
  db.prepare("UPDATE character_stones SET count = ? WHERE character_id = ? AND element = 'fire'").run(fireStones, charId);
};
const upgrade = (type = 'sword', t = token, id = charId) =>
  app.inject({ method: 'POST', url: `/api/characters/${id}/weapons/${type}/upgrade`, headers: auth(t) });
const enchant = (payload: unknown, type = 'sword') =>
  app.inject({ method: 'POST', url: `/api/characters/${charId}/weapons/${type}/enchant`, headers: auth(token), payload: payload as object });
const getChar = async () => (await app.inject({ method: 'GET', url: `/api/characters/${charId}`, headers: auth(token) })).json();

describe('forge', () => {
  it("améliore une arme et débite l'or", async () => {
    setWallet(100);
    const res = await upgrade('sword');
    expect(res.statusCode).toBe(200);
    expect(res.json().gold).toBe(50);
    expect(res.json().weapons.find((w: { type: string }) => w.type === 'sword').level).toBe(2);
  });

  it("une action refusée ne modifie rien en base", async () => {
    setWallet(49);
    const res = await upgrade('sword');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" });
    const c = await getChar();
    expect(c.gold).toBe(49);
    expect(c.weapons.find((w: { type: string }) => w.type === 'sword').level).toBe(1);
  });

  it('enchante avec des pierres et refuse le slot 2 avant le niveau 7', async () => {
    setWallet(0, 3);
    const ok = await enchant({ slot: 0, element: 'fire' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stones.fire).toBe(2);
    expect(ok.json().weapons[0].enchants).toEqual([{ element: 'fire', rank: 1 }, null]);

    const locked = await enchant({ slot: 1, element: 'fire' });
    expect(locked.statusCode).toBe(400);
    expect(locked.json().error).toBe('SLOT_LOCKED');
    expect((await getChar()).stones.fire).toBe(2);
  });

  it("valide le corps de la requête d'enchantement", async () => {
    for (const payload of [{ slot: 2, element: 'fire' }, { slot: 0, element: 'water' }, {}]) {
      const res = await enchant(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION');
    }
  });

  it("répond 404 pour une arme inconnue ou le perso d'un autre compte", async () => {
    setWallet(1000);
    expect((await upgrade('katana')).statusCode).toBe(404);
    const other = await registerUser(app, 'autre');
    expect((await upgrade('sword', other)).statusCode).toBe(404);
    expect((await getChar()).gold).toBe(1000);
  });
});
