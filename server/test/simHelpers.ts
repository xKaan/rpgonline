import { WEAPON_TYPES, emptyStones, newWeapon, type EnemyKind, type GameMap, type Rng, type WeaponState } from '@rpg/shared';
import { RunSim } from '../src/sim/RunSim';
import { spawnMonster } from '../src/sim/monsters';
import type { SimMonster, SimPlayer } from '../src/sim/world';

export const EMPTY_MAP: GameMap = { trees: [], rocks: [], obstacles: [] };
export const DT = 0.05;

/** RNG constant : jamais de shiny ni de critique, tirages reproductibles. */
export const calm: Rng = () => 0.5;

export function makeSim(opts: { compose?: (wave: number) => EnemyKind[]; rng?: Rng; weapons?: WeaponState[] } = {}) {
  const sim = new RunSim({ map: EMPTY_MAP, rng: opts.rng ?? calm, compose: opts.compose ?? (() => []) });
  sim.addPlayer('p1', {
    characterId: 1,
    weapons: opts.weapons ?? WEAPON_TYPES.map((t) => newWeapon(t)),
    wallet: { gold: 0, materials: 0, stones: emptyStones() },
  });
  const player = sim.world.players.get('p1')!;
  return { sim, player, w: sim.world };
}

export function run(sim: RunSim, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) sim.step(DT);
}

export function place(p: SimPlayer, x: number, z: number): void {
  p.motion = { ...p.motion, x, z };
}

export function monster(sim: RunSim, kind: EnemyKind, x: number, z: number, extra: Partial<SimMonster> = {}): SimMonster {
  const m = spawnMonster(sim.world, kind, x, z, { shiny: null });
  Object.assign(m, extra);
  return m;
}

/** joueur quasi immortel pour observer les monstres */
export function tank(p: SimPlayer): void {
  p.stats = { ...p.stats, maxHp: 1e9 };
  p.hp = 1e9;
}
