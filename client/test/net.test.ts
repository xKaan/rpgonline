import { afterEach, describe, it, expect, vi } from 'vitest';
import { NO_INPUT, newMotion, stepMotion, type ForgeReply, type MoveInput } from '@rpg/shared';
import { ApiError } from '../src/api';
import { createRoomForgeApi } from '../src/net/forgeApi';
import { SnapshotBuffer } from '../src/net/interpolation';
import { Predictor } from '../src/net/prediction';

const forward: MoveInput = { ...NO_INPUT, forward: true };

describe('Predictor', () => {
  it('rejoue les entrées non acquittées par-dessus l’état serveur', () => {
    const p = new Predictor(newMotion(0, 0), []);
    const sent = [1, 2, 3].map(() => p.step(forward, 0, 0.05, {}));
    expect(p.motion.z).toBeCloseTo(-0.9);
    // le serveur n'a traité que la 1re entrée
    const server = { ...stepMotion(newMotion(0, 0), forward, 0, 0.05), ackSeq: sent[0].seq };
    p.reconcile(server, {});
    expect(p.motion.z).toBeCloseTo(-0.9);
    expect(p.pendingCount).toBe(2);
    expect(Math.hypot(p.offsetX, p.offsetZ)).toBeLessThan(1e-9);
  });

  it('corrige et lisse quand le serveur diverge', () => {
    const p = new Predictor(newMotion(0, 0), []);
    const msg = p.step(forward, 0, 0.05, {});
    p.reconcile({ ...newMotion(0, 0), ackSeq: msg.seq }, {});
    expect(p.motion.z).toBe(0);
    expect(p.renderZ).toBeCloseTo(-0.3);
    p.decay(1);
    expect(Math.abs(p.renderZ)).toBeLessThan(0.01);
  });

  it('téléporte si l’écart est grand', () => {
    const p = new Predictor(newMotion(0, 0), []);
    p.reconcile({ ...newMotion(10, 10), ackSeq: 0 }, {});
    expect(p.renderX).toBe(10);
  });

  it('plafonne dt comme le serveur', () => {
    const p = new Predictor(newMotion(0, 0), []);
    expect(p.step(forward, 0, 2, {}).dt).toBe(0.1);
  });
});

describe('SnapshotBuffer', () => {
  it('interpole entre deux états, par le plus court chemin angulaire', () => {
    const b = new SnapshotBuffer();
    b.push(0, { x: 0, z: 0, facing: Math.PI - 0.1 });
    b.push(100, { x: 10, z: 0, facing: -Math.PI + 0.1 });
    const s = b.sample(50)!;
    expect(s.x).toBeCloseTo(5);
    expect(Math.abs(Math.abs(s.facing) - Math.PI)).toBeLessThan(1e-6);
    expect(b.sample(-10)!.x).toBe(0);
    expect(b.sample(500)!.x).toBe(10);
  });
});

describe('forge via la room', () => {
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    let reply: (r: ForgeReply) => void = () => undefined;
    const send = vi.fn();
    const api = createRoomForgeApi(send, (cb) => (reply = cb));
    return { api, send, reply: (r: ForgeReply) => reply(r) };
  };

  it('résout avec le perso renvoyé', async () => {
    const { api, send, reply } = setup();
    const p = api.upgradeWeapon(1, 'sword');
    const { requestId } = send.mock.calls[0][0];
    reply({ requestId, ok: true, character: { id: 1 } as never });
    await expect(p).resolves.toEqual({ id: 1 });
  });

  it('rejette avec le message du serveur', async () => {
    const { api, send, reply } = setup();
    const p = api.enchantWeapon(1, 'axe', 0, 'fire');
    expect(send.mock.calls[0][0].action).toEqual({ kind: 'enchant', slot: 0, element: 'fire' });
    reply({ requestId: send.mock.calls[0][0].requestId, ok: false, error: 'TOO_FAR', message: 'Approche-toi de la forge' });
    await expect(p).rejects.toEqual(new ApiError(400, 'TOO_FAR', 'Approche-toi de la forge'));
  });

  it('expire sans réponse', async () => {
    vi.useFakeTimers();
    const { api } = setup();
    const p = api.upgradeWeapon(1, 'sword');
    vi.advanceTimersByTime(6000);
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
