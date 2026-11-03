import { MAP_HALF_SIZE } from './map';
import { BEHAVIOR, MONSTER_KINDS, type BossKind, type EnemyKind, type MonsterKind } from './monsters';
import type { Rng } from './rng';

export const MAX_ALIVE = 60;
export const BREAK_DURATION = 30;
export const SPAWN_TELEGRAPH = 1;
/** monstres max par point de spawn télégraphié */
export const SPAWN_GROUP = 5;
/** délai entre deux télégraphes de spawn (s) */
export const SPAWN_INTERVAL = 1.2;

const SPAWN_RING = MAP_HALF_SIZE - 4;
export const SPAWN_POINTS: readonly { x: number; z: number }[] = Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 6 + (i * Math.PI) / 3;
  return { x: Math.cos(a) * SPAWN_RING, z: Math.sin(a) * SPAWN_RING };
});

const UNLOCK: Record<MonsterKind, { from: number; weight: number }> = {
  goblin: { from: 1, weight: 5 },
  spider: { from: 2, weight: 3 },
  archer: { from: 3, weight: 2 },
  golem: { from: 4, weight: 1 },
};

export function waveMonsterCount(wave: number): number {
  return 6 + 2 * wave;
}

export function bossForWave(wave: number): BossKind | null {
  if (wave % 10 === 0) return 'ancient_golem';
  if (wave % 5 === 0) return 'goblin_king';
  return null;
}

/** Liste des monstres de la vague, boss en premier. */
export function waveComposition(wave: number, rng: Rng): EnemyKind[] {
  const boss = bossForWave(wave);
  let target = waveMonsterCount(wave);
  if (boss) target = Math.floor(target / 2);
  const pool = MONSTER_KINDS.filter((k) => wave >= UNLOCK[k].from);
  const total = pool.reduce((s, k) => s + UNLOCK[k].weight, 0);

  const list: EnemyKind[] = boss ? [boss] : [];
  let normals = 0;
  while (normals < target) {
    let roll = rng() * total;
    let kind = pool[pool.length - 1];
    for (const k of pool) {
      roll -= UNLOCK[k].weight;
      if (roll < 0) {
        kind = k;
        break;
      }
    }
    const n = kind === 'spider' ? Math.min(BEHAVIOR.spider.groupSize, target - normals) : 1;
    for (let i = 0; i < n; i++) list.push(kind);
    normals += n;
  }
  return list;
}
