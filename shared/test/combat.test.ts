import { describe, it, expect } from 'vitest';
import {
  WEAPONS,
  aimDirection,
  applyEnchants,
  attackInterval,
  computeStats,
  decodeKeys,
  encodeKeys,
  hitDamage,
  inputMessageSchema,
  meleeHits,
  newMotion,
  newStatuses,
  segmentHitsCircle,
  speedFactor,
  stepMotion,
  tickStatuses,
  weaponMessageSchema,
  type Rng,
} from '../src/index';

const origin = { x: 0, z: 0 };
const fwd = { x: 0, z: -1 };
const stats = computeStats([]);
const always = (v: number): Rng => () => v;

describe('formes de mêlée', () => {
  it('cône : devant oui, derrière non, hors portée non', () => {
    const cone = WEAPONS.sword.shape;
    expect(meleeHits(cone, 2.2, origin, fwd, { x: 0, z: -2 }, 0.45)).toBe(true);
    expect(meleeHits(cone, 2.2, origin, fwd, { x: 1.5, z: -1.5 }, 0.45)).toBe(true);
    expect(meleeHits(cone, 2.2, origin, fwd, { x: 0, z: 2 }, 0.45)).toBe(false);
    expect(meleeHits(cone, 2.2, origin, fwd, { x: 0, z: -3 }, 0.45)).toBe(false);
  });

  it('ligne : étroite mais longue', () => {
    const line = WEAPONS.spear.shape;
    expect(meleeHits(line, 3.5, origin, fwd, { x: 0, z: -3.6 }, 0.45)).toBe(true);
    expect(meleeHits(line, 3.5, origin, fwd, { x: 1.5, z: -2 }, 0.45)).toBe(false);
  });

  it('cercle : tout autour du joueur', () => {
    const circle = WEAPONS.mace.shape;
    expect(meleeHits(circle, 2, origin, fwd, { x: 0, z: 2.2 }, 0.45)).toBe(true);
    expect(meleeHits(circle, 2, origin, fwd, { x: 3, z: 0 }, 0.45)).toBe(false);
  });

  it('visée : yaw 0 = vers −Z', () => {
    const d = aimDirection(0);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });
});

describe('projectiles', () => {
  it("un projectile qui parcourt 1,5 m en un tick touche un petit monstre au milieu (pas d'effet tunnel)", () => {
    expect(segmentHitsCircle(0, 0, 0, -1.5, 0.1, -0.75, 0.4)).toBe(true);
    expect(segmentHitsCircle(0, 0, 0, -1.5, 1, -0.75, 0.4)).toBe(false);
  });
});

describe('dégâts', () => {
  it('niveau, boss, charge, critique', () => {
    expect(hitDamage({ weapon: 'sword', level: 1, stats, targetIsBoss: false, charged: false, crit: false })).toBe(12);
    expect(hitDamage({ weapon: 'axe', level: 1, stats, targetIsBoss: true, charged: false, crit: false })).toBe(25);
    expect(hitDamage({ weapon: 'bow', level: 1, stats, targetIsBoss: false, charged: true, crit: true })).toBe(40);
    expect(hitDamage({ weapon: 'sword', level: 1, stats: computeStats(['damage']), targetIsBoss: false, charged: false, crit: false })).toBeCloseTo(13.8);
  });

  it("intervalle d'attaque", () => {
    expect(attackInterval('sword', 1, stats)).toBeCloseTo(1 / 1.6);
    expect(attackInterval('sword', 1, computeStats(['attackSpeed']))).toBeCloseTo(1 / 1.76);
  });
});

describe('enchantements', () => {
  it('feu : brûlure 3 s à 15 % des dégâts/s au rang I', () => {
    const s = newStatuses();
    applyEnchants(s, [{ element: 'fire', rank: 1 }, null], 100, 1, always(0.5));
    expect(tickStatuses(s, 1)).toBeCloseTo(15);
    expect(tickStatuses(s, 5)).toBeCloseTo(30);
    expect(s.burnTime).toBe(0);
  });

  it('poison : stacks plafonnés selon le rang', () => {
    const s = newStatuses();
    for (let i = 0; i < 5; i++) applyEnchants(s, [{ element: 'poison', rank: 1 }, null], 10, 1, always(0.5));
    expect(s.poisonStacks).toBe(3);
    expect(tickStatuses(s, 1)).toBeCloseTo(6);
  });

  it('glace : ralentit, gel 10 % au rang III', () => {
    const s = newStatuses();
    applyEnchants(s, [{ element: 'ice', rank: 3 }, null], 10, 1, always(0.05));
    expect(s.slow).toBe(0.4);
    expect(s.freezeTime).toBe(1);
    expect(speedFactor(s)).toBe(0);
    tickStatuses(s, 1.5);
    expect(speedFactor(s)).toBeCloseTo(0.6);
  });

  it('électricité : rebonds selon le rang à 50 %', () => {
    const r = applyEnchants(newStatuses(), [null, { element: 'lightning', rank: 2 }], 20, 1.25, always(0.5));
    expect(r).toEqual({ chains: 2, chainDamage: 12.5 });
  });
});

describe('mouvement avec options', () => {
  const forward = { forward: true, back: false, left: false, right: false, roll: false };

  it('vitesse multipliée', () => {
    const m = stepMotion(newMotion(0, 0), forward, 0, 1, [], { speedMult: 0.5 });
    expect(m.z).toBeCloseTo(-3);
  });

  it('recharge de roulade réduite', () => {
    const roll = { ...forward, roll: true };
    let m = stepMotion(newMotion(0, 0), roll, 0, 0.01, [], { rollCooldown: 1 });
    expect(m.rollCooldown).toBe(1);
    m = stepMotion(m, forward, 0, 1, [], { rollCooldown: 1 });
    m = stepMotion(m, roll, 0, 0.01, [], { rollCooldown: 1 });
    expect(m.rollTime).toBeGreaterThan(0);
  });
});

describe('protocole', () => {
  it('touches encodées en bits', () => {
    const input = { forward: true, back: false, left: true, right: false, roll: true };
    expect(decodeKeys(encodeKeys(input))).toEqual(input);
  });

  it('messages invalides refusés', () => {
    expect(inputMessageSchema.safeParse({ seq: 1, dt: 0.016, yaw: 0, keys: 3 }).success).toBe(true);
    expect(inputMessageSchema.safeParse({ seq: 'x', dt: 0.016, yaw: 0, keys: 3 }).success).toBe(false);
    expect(inputMessageSchema.safeParse({ seq: 1, dt: 0.016, yaw: Infinity, keys: 3 }).success).toBe(false);
    expect(inputMessageSchema.safeParse({ seq: 1, dt: 0.016, yaw: 0, keys: 99 }).success).toBe(false);
    expect(weaponMessageSchema.safeParse({ type: 'lightsaber' }).success).toBe(false);
  });
});
