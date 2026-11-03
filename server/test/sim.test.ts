import { describe, it, expect } from 'vitest';
import { BREAK_DURATION, MAX_ALIVE, SPAWN_TELEGRAPH, encodeKeys, mulberry32 } from '@rpg/shared';
import { FlowField } from '../src/sim/navigation';
import { damagePlayer } from '../src/sim/players';
import { DT, makeSim, monster, place, run, tank } from './simHelpers';

const forward = encodeKeys({ forward: true, back: false, left: false, right: false, roll: false });

describe('vagues', () => {
  it('répit initial de 30 s, puis vague 1 télégraphiée 1 s avant les monstres', () => {
    const { sim, w, player } = makeSim({ compose: () => ['goblin', 'goblin'] });
    tank(player);
    expect(w.phase).toBe('break');
    expect(w.phaseTime).toBe(BREAK_DURATION);
    run(sim, BREAK_DURATION - 1);
    expect(w.phase).toBe('break');
    run(sim, 1.05);
    expect(w.phase).toBe('wave');
    expect(w.wave).toBe(1);
    expect([...w.hazards.values()].some((h) => h.kind === 'spawn')).toBe(true);
    expect(w.monsters.size).toBe(0);
    run(sim, SPAWN_TELEGRAPH + DT);
    expect(w.monsters.size).toBe(2);
  });

  it('« prêt » lance la vague tout de suite', () => {
    const { sim, w } = makeSim({ compose: () => ['goblin'] });
    sim.ready('p1');
    sim.step(DT);
    expect(w.phase).toBe('wave');
  });

  it('jamais plus de 60 monstres vivants ou annoncés', () => {
    const { sim, w, player } = makeSim({ compose: () => Array(100).fill('golem') });
    tank(player);
    sim.ready('p1');
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      sim.step(DT);
      let pending = 0;
      for (const h of w.hazards.values()) pending += h.pending?.length ?? 0;
      max = Math.max(max, w.monsters.size + pending);
    }
    expect(max).toBe(MAX_ALIVE);
    expect(w.toSpawn.length).toBe(40);
  });

  it('fin de vague → répit, PV restaurés, 3 bonus proposés, coffres', () => {
    const { sim, w, player } = makeSim({ compose: () => ['goblin'] });
    sim.ready('p1');
    run(sim, SPAWN_TELEGRAPH + DT);
    const [m] = w.monsters.values();
    player.hp = 40;
    w.rng = mulberry32(3);
    w.monsters.delete(m.id);
    sim.step(DT);
    expect(w.phase).toBe('break');
    expect(player.hp).toBe(100);
    expect(player.offer).toHaveLength(3);
    expect(w.chests.size).toBe(2);
  });
});

describe('monstres et joueur', () => {
  it('un gobelin rejoint le joueur et le frappe', () => {
    const { sim, player } = makeSim();
    monster(sim, 'goblin', 0, -10);
    run(sim, 5);
    expect(player.hp).toBeLessThan(100);
  });

  it('invulnérable pendant la roulade', () => {
    const { w, player } = makeSim();
    player.motion = { ...player.motion, rollTime: 0.2 };
    expect(damagePlayer(w, player, 50)).toBe(false);
    expect(player.hp).toBe(100);
  });

  it('mort → fin de run', () => {
    const { sim, w, player } = makeSim();
    damagePlayer(w, player, 1000);
    sim.step(DT);
    expect(w.phase).toBe('over');
    expect(sim.drainEvents()).toContainEqual({ type: 'runOver', wave: 0, kills: 0 });
  });

  it('la pause gèle la simulation', () => {
    const { sim, w } = makeSim();
    sim.setPaused('p1', true);
    run(sim, 5);
    expect(w.time).toBe(0);
    expect(w.phaseTime).toBe(BREAK_DURATION);
    sim.setPaused('p1', false);
    run(sim, 1);
    expect(w.time).toBeCloseTo(1);
  });
});

describe('entrées de déplacement', () => {
  it('appliquées avec le même stepMotion que le client', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    sim.input('p1', { seq: 1, dt: 0.1, yaw: 0, keys: forward });
    expect(player.motion.z).toBeCloseTo(-0.6);
    expect(player.ackSeq).toBe(1);
  });

  it('un client qui envoie trop d’entrées ne va pas plus vite que le temps réel', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    for (let seq = 1; seq <= 100; seq++) sim.input('p1', { seq, dt: 0.1, yaw: 0, keys: forward });
    expect(Math.abs(player.motion.z)).toBeLessThanOrEqual(6 * 0.25 + 1e-6);
    expect(player.ackSeq).toBe(100);
  });

  it('dt énorme plafonné, entrée ancienne ignorée', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    sim.input('p1', { seq: 5, dt: 50, yaw: 0, keys: forward });
    expect(player.motion.z).toBeCloseTo(-0.6);
    sim.input('p1', { seq: 3, dt: 0.1, yaw: 0, keys: forward });
    expect(player.motion.z).toBeCloseTo(-0.6);
  });
});

describe('navigation', () => {
  it('le champ de flux contourne un obstacle', () => {
    const flow = new FlowField([{ x: 0, z: 0, radius: 4 }]);
    flow.compute([{ x: 0, z: -10 }]);
    let x = 0.2;
    let z = 10;
    for (let i = 0; i < 200 && Math.hypot(x, z + 10) > 1.5; i++) {
      const d = flow.direction(x, z)!;
      expect(d).not.toBeNull();
      x += d.x * 0.5;
      z += d.z * 0.5;
      expect(Math.hypot(x, z)).toBeGreaterThan(3.5);
    }
    expect(Math.hypot(x, z + 10)).toBeLessThanOrEqual(1.5);
  });
});
