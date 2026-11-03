import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client as SDK, type Room } from '@colyseus/sdk';
import { DEFAULT_APPEARANCE, MSG, RUN_ROOM, type ForgeReply, type RunStateView } from '@rpg/shared';
import { addLoot, createCharacter, getCharacter, recordBestWave } from '../src/repo/characters';
import { createRunRoom } from '../src/room/RunRoom';
import { auth, makeApp, registerUser } from './helpers';

const { app, db, tokens } = makeApp();
const transport = new WebSocketTransport();
const server = new Server({ transport, greet: false });
let sdk: SDK;
let token: string;
let otherToken: string;
let characterId: number;
let otherCharacterId: number;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('délai dépassé');
    await wait(20);
  }
}

async function makeCharacter(t: string, name: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/characters', headers: auth(t), payload: { name, appearance: DEFAULT_APPEARANCE } });
  return res.json().id as number;
}

beforeAll(async () => {
  server.define(RUN_ROOM, createRunRoom({ db, tokens }));
  await server.listen(0);
  const { port } = transport.server!.address() as { port: number };
  sdk = new SDK(`http://localhost:${port}`);
  token = await registerUser(app, 'kaan');
  otherToken = await registerUser(app, 'autre');
  characterId = await makeCharacter(token, 'Arthur');
  otherCharacterId = await makeCharacter(otherToken, 'Merlin');
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const join = () => sdk.create(RUN_ROOM, { token, characterId }) as Promise<Room<unknown, RunStateView>>;

describe('room run', () => {
  it('rejoint la room avec son perso : état synchronisé', async () => {
    const room = await join();
    await until(() => room.state.players?.size === 1);
    expect(room.state.phase).toBe('break');
    const [p] = [...(room.state.players as unknown as Map<string, { hp: number; characterId: number }>).values()];
    expect(p.hp).toBe(100);
    expect(p.characterId).toBe(characterId);
    await room.leave();
  });

  it('refuse un jeton invalide ou le perso d’un autre compte', async () => {
    await expect(sdk.create(RUN_ROOM, { token: 'faux', characterId })).rejects.toThrow(/Session invalide/);
    await expect(sdk.create(RUN_ROOM, { token, characterId: otherCharacterId })).rejects.toThrow(/introuvable/);
    await expect(sdk.create(RUN_ROOM, { token })).rejects.toThrow(/invalides/);
  });

  it('ignore un message malformé sans déconnecter', async () => {
    const room = await join();
    let left = false;
    room.onLeave(() => (left = true));
    room.send(MSG.input, { seq: 'x', dt: 1e9 });
    room.send(MSG.weapon, { type: 'sabre-laser' });
    room.send(MSG.input, { seq: 1, dt: 0.05, yaw: 0, keys: 1 });
    await until(() => room.state.players?.get(room.sessionId)?.ackSeq === 1);
    expect(left).toBe(false);
    await room.leave();
  });

  it('forge refusée loin de la forge', async () => {
    const room = await join();
    const reply = new Promise<ForgeReply>((resolve) => room.onMessage(MSG.forgeReply, resolve));
    room.send(MSG.forge, { requestId: 7, weapon: 'sword', action: { kind: 'upgrade' } });
    expect(await reply).toMatchObject({ requestId: 7, ok: false, error: 'TOO_FAR' });
    await room.leave();
  });

  it('déconnexion en pleine vague : la vague atteinte est enregistrée', async () => {
    const room = await join();
    await until(() => room.state.players?.size === 1);
    room.send(MSG.ready);
    await until(() => room.state.wave === 1);
    await room.leave();
    await until(() => getCharacter(db, 1, characterId)!.bestWave === 1);
  });
});

describe('persistance', () => {
  it('addLoot incrémente or, matériaux et pierres', async () => {
    const c = createCharacter(db, 1, 'Loot', DEFAULT_APPEARANCE);
    if (typeof c === 'string') throw new Error(c);
    addLoot(db, c.id, { gold: 12, materials: 2, stones: { fire: 1, ice: 2 } });
    addLoot(db, c.id, { gold: 3, materials: 0, stones: {} });
    const after = getCharacter(db, 1, c.id)!;
    expect(after.gold).toBe(15);
    expect(after.materials).toBe(2);
    expect(after.stones).toEqual({ fire: 1, lightning: 0, poison: 0, ice: 2 });
  });

  it('recordBestWave ne garde que le record', () => {
    expect(recordBestWave(db, characterId, 7)).toBe(7);
    expect(recordBestWave(db, characterId, 3)).toBe(7);
  });
});
