import { describe, it, expect } from 'vitest';
import { BOW_FULL_CHARGE, WEAPON_TYPES, newWeapon, scaledHp, type WeaponState } from '@rpg/shared';
import { DT, makeSim, monster, place, run, tank } from './simHelpers';

const attack = (sim: ReturnType<typeof makeSim>['sim'], yaw = 0) => {
  sim.attack('p1', { yaw, pressed: true });
  sim.attack('p1', { yaw, pressed: false });
};

const weaponsWith = (patch: Partial<WeaponState> & { type: WeaponState['type'] }): WeaponState[] =>
  WEAPON_TYPES.map((t) => (t === patch.type ? { ...newWeapon(t), ...patch } : newWeapon(t)));

describe('attaques de mêlée', () => {
  it("l'épée touche devant, pas derrière", () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    const front = monster(sim, 'goblin', 0, -1.5);
    const back = monster(sim, 'goblin', 0, 1.5);
    attack(sim);
    expect(front.hp).toBeCloseTo(30 - 12);
    expect(back.hp).toBe(30);
    expect(player.attackSeq).toBe(1);
  });

  it('cadence trop rapide refusée', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    const m = monster(sim, 'golem', 0, -2);
    attack(sim);
    attack(sim);
    expect(m.hp).toBeCloseTo(120 - 12);
    run(sim, 0.6);
    attack(sim);
    expect(m.hp).toBeCloseTo(120 - 24);
  });

  it('tue le monstre, lâche du loot qui est ramassé et signalé', () => {
    const { sim, w, player } = makeSim();
    place(player, 0, 0);
    const m = monster(sim, 'goblin', 0, -1.5, { hp: 5 });
    attack(sim);
    expect(w.monsters.has(m.id)).toBe(false);
    expect(w.kills).toBe(1);
    expect(w.loot.size).toBe(1);
    sim.step(DT);
    expect(w.loot.size).toBe(0);
    expect(player.wallet.gold).toBe(3);
    expect(player.runLoot.gold).toBe(3);
    expect(sim.drainEvents()).toContainEqual({ type: 'loot', playerId: 'p1', gold: 3, materials: 0, stones: {} });
  });

  it('la pelle repousse, la masse étourdit', () => {
    const { sim, player } = makeSim();
    place(player, 0, 0);
    tank(player);
    const g = monster(sim, 'golem', 0, -2);
    sim.setWeapon('p1', 'shovel');
    attack(sim);
    run(sim, 0.25);
    expect(g.z).toBeLessThan(-5);
    sim.setWeapon('p1', 'mace');
    const m = monster(sim, 'golem', 1.5, 0);
    run(sim, 1);
    attack(sim);
    expect(m.statuses.stunTime).toBeGreaterThan(0);
  });

  it('feu : brûle après le coup ; électricité : rebondit', () => {
    const { sim, player } = makeSim({ weapons: weaponsWith({ type: 'sword', level: 7, enchants: [{ element: 'fire', rank: 3 }, { element: 'lightning', rank: 1 }] }) });
    place(player, 0, 0);
    const a = monster(sim, 'golem', 0, -1.5);
    const b = monster(sim, 'golem', 3, -4);
    const c = monster(sim, 'golem', 20, 20);
    attack(sim);
    const hit = 12 * (1 + 0.12 * 6);
    expect(a.hp).toBeCloseTo(120 - hit);
    expect(b.hp).toBeCloseTo(120 - hit * 0.5);
    expect(c.hp).toBe(120);
    const after = a.hp;
    run(sim, 1);
    expect(after - a.hp).toBeCloseTo(hit * 0.35, 0);
  });
});

describe('projectiles', () => {
  it("la flèche touche à 20 m ; l'arc chargé fait ×2", () => {
    const { sim, player } = makeSim();
    place(player, 0, 10);
    tank(player);
    sim.setWeapon('p1', 'bow');
    const far = monster(sim, 'golem', 0, -10, { speed: 0 });
    attack(sim);
    run(sim, 1);
    expect(far.hp).toBeCloseTo(120 - 10);
    sim.attack('p1', { yaw: 0, pressed: true });
    run(sim, BOW_FULL_CHARGE);
    sim.attack('p1', { yaw: 0, pressed: false });
    run(sim, 1);
    expect(far.hp).toBeCloseTo(120 - 30);
  });

  it("l'arbalète perce : jusqu'à 3 ennemis alignés", () => {
    const { sim, player } = makeSim();
    place(player, 0, 10);
    tank(player);
    sim.setWeapon('p1', 'crossbow');
    const targets = [0, -3, -6, -9].map((z) => monster(sim, 'golem', 0, z, { speed: 0 }));
    attack(sim);
    run(sim, 1);
    expect(targets.map((t) => t.hp < 120)).toEqual([true, true, true, false]);
  });
});

describe('bonus et coffres', () => {
  it('bonus choisi parmi l’offre, sinon tiré au début de la vague', () => {
    const { sim, w, player } = makeSim();
    player.offer = ['maxHp', 'damage', 'crit'];
    sim.chooseBonus('p1', 'gold');
    expect(player.bonuses).toEqual([]);
    sim.chooseBonus('p1', 'maxHp');
    expect(player.bonuses).toEqual(['maxHp']);
    expect(player.stats.maxHp).toBe(120);
    expect(player.hp).toBe(120);
    player.offer = ['damage', 'crit', 'gold'];
    sim.ready('p1');
    sim.step(DT);
    expect(w.phase).toBe('wave');
    expect(player.offer).toEqual([]);
    expect(player.bonuses).toHaveLength(2);
  });

  it('un coffre s’ouvre au contact et lâche de l’or', () => {
    const { sim, w, player } = makeSim();
    w.wave = 2;
    w.chests.set(999, { id: 999, x: 20, z: 20 });
    place(player, 20, 20.5);
    sim.step(DT);
    sim.step(DT);
    expect(w.chests.size).toBe(0);
    expect(player.wallet.gold).toBe(30);
  });
});

describe('PV des monstres', () => {
  it('scaling selon la vague', () => {
    const { sim, w } = makeSim();
    w.wave = 3;
    expect(monster(sim, 'goblin', 10, 10).maxHp).toBeCloseTo(scaledHp('goblin', 3));
  });
});
