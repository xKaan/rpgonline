import { describe, it, expect } from 'vitest';
import { BEHAVIOR, SHINY } from '@rpg/shared';
import { spawnMonster } from '../src/sim/monsters';
import { DT, makeSim, monster, place, run, tank } from './simHelpers';

describe('comportements', () => {
  it("l'archer garde ses distances et tire", () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    tank(player);
    const a = monster(sim, 'archer', 0, -3);
    run(sim, 2);
    expect(Math.hypot(a.x, a.z)).toBeGreaterThan(3.5);
    run(sim, 3);
    expect([...w.projectiles.values()].some((p) => p.kind === 'enemyArrow') || player.hp < 1e9).toBe(true);
  });

  it('le golem annonce sa frappe 1 s avant les dégâts', () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    monster(sim, 'golem', 0, -2.2, { attackCooldown: 0 });
    sim.step(DT);
    const slam = [...w.hazards.values()].find((h) => h.kind === 'slam');
    expect(slam).toBeDefined();
    run(sim, BEHAVIOR.golem.windup - 2 * DT);
    expect(player.hp).toBe(100);
    run(sim, 2 * DT);
    expect(player.hp).toBeLessThan(100);
  });

  it('la roulade esquive la frappe du golem', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    monster(sim, 'golem', 0, -2.2, { attackCooldown: 0 });
    run(sim, BEHAVIOR.golem.windup - DT);
    player.motion = { ...player.motion, rollTime: 0.3 };
    run(sim, 2 * DT);
    expect(player.hp).toBe(100);
  });

  it("l'araignée empoisonne", () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    monster(sim, 'spider', 0, -1, { attackCooldown: 0 });
    run(sim, 0.5);
    expect(player.statuses.poisonTime).toBeGreaterThan(0);
  });

  it('le coup de mêlée est annoncé : s’éloigner pendant la préparation l’esquive', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    const g = monster(sim, 'goblin', 0, -1, { attackCooldown: 0, speed: 0 });
    sim.step(DT);
    expect(g.action).toBe('attack');
    place(player, 0, 5);
    run(sim, 0.5);
    expect(player.hp).toBe(100);
  });

  it('Roi Gobelin : tourbillon puis invocation à 50 % PV', () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    tank(player);
    const king = monster(sim, 'goblin_king', 0, -4);
    king.timers.spin = DT;
    sim.step(DT);
    expect(king.action).toBe('spin');
    expect([...w.hazards.values()].some((h) => h.kind === 'spin')).toBe(true);
    king.hp = king.maxHp * 0.49;
    sim.step(DT);
    expect([...w.monsters.values()].filter((m) => m.kind === 'goblin')).toHaveLength(BEHAVIOR.goblinKing.summonCount);
    sim.step(DT);
    expect([...w.monsters.values()].filter((m) => m.kind === 'goblin')).toHaveLength(BEHAVIOR.goblinKing.summonCount);
  });

  it('Golem ancien : rochers télégraphiés, enrage à 30 %', () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    tank(player);
    const boss = monster(sim, 'ancient_golem', 0, -15);
    boss.timers.rock = DT;
    sim.step(DT);
    const rocks = [...w.hazards.values()].filter((h) => h.kind === 'rock');
    expect(rocks).toHaveLength(BEHAVIOR.ancientGolem.rockCount);
    expect(rocks[0].x).toBeCloseTo(0);
    boss.hp = boss.maxHp * 0.29;
    sim.step(DT);
    expect(boss.enraged).toBe(true);
  });
});

describe('shiny', () => {
  it('Bouclier : bloque 3 coups', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    const m = spawnMonster(sim.world, 'golem', 0, -1.5, { shiny: ['shielded'] });
    for (let i = 0; i < 4; i++) {
      sim.attack('p1', { yaw: 0, pressed: true });
      player.attackCooldown = 0;
    }
    expect(m.shield).toBe(0);
    expect(m.hp).toBeCloseTo(m.maxHp - 12);
  });

  it('Scission : 2 copies sans loot à la mort', () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    const m = spawnMonster(sim.world, 'goblin', 0, -1.5, { shiny: ['splitting'] });
    m.hp = 1;
    sim.attack('p1', { yaw: 0, pressed: true });
    const copies = [...w.monsters.values()];
    expect(copies).toHaveLength(2);
    expect(copies.every((c) => c.splitCopy && c.shiny === null && c.maxHp === m.maxHp / 2)).toBe(true);
    const lootBefore = w.loot.size;
    for (const c of copies) c.hp = 0.1;
    player.attackCooldown = 0;
    sim.attack('p1', { yaw: 0, pressed: true });
    expect(w.loot.size).toBe(lootBefore);
  });

  it('Rapide : +50 % de vitesse ; shiny : ×2 PV et pierre garantie', () => {
    const { sim, w } = makeSim();
    const m = spawnMonster(sim.world, 'goblin', 10, 10, { shiny: ['swift'] });
    expect(m.speed).toBeCloseTo(4.5 * SHINY.swiftSpeedMult);
    expect(m.maxHp).toBe(60);
    m.hp = 0.1;
    sim.world.players.get('p1')!.motion = { ...sim.world.players.get('p1')!.motion, x: 10, z: 11 };
    sim.attack('p1', { yaw: 0, pressed: true });
    expect([...w.loot.values()].some((l) => l.kind === 'stone')).toBe(true);
  });

  it('Électrique : décharge annoncée autour du monstre', () => {
    const { sim, w } = makeSim();
    const m = spawnMonster(sim.world, 'golem', 20, 20, { shiny: ['electric'] });
    m.timers.shock = DT;
    sim.step(DT);
    expect([...w.hazards.values()].some((h) => h.kind === 'shock')).toBe(true);
  });
});
