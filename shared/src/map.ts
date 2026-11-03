import { mulberry32 } from './rng';

export const MAP_HALF_SIZE = 40;
export const MAP_SEED = 1337;
/** rayon autour du centre laissé libre (forge, enchanteur, spawn) */
export const SAFE_RADIUS = 14;

export const FORGE_POS = { x: 0, z: 0 };
export const FORGE_RADIUS = 2.2;
export const ENCHANTER_POS = { x: 6, z: -2 };
export const ENCHANTER_RADIUS = 1.2;
export const SPAWN_POS = { x: 0, z: 8 };

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface Decoration {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface GameMap {
  trees: Decoration[];
  rocks: Decoration[];
  obstacles: Obstacle[];
}

const TREE_COUNT = 70;
const ROCK_COUNT = 30;

export function generateMap(seed = MAP_SEED): GameMap {
  const rng = mulberry32(seed);
  const trees: Decoration[] = [];
  const rocks: Decoration[] = [];
  const all: Decoration[] = [];

  const place = (list: Decoration[], count: number, spacing: number) => {
    for (let tries = 0; list.length < count && tries < count * 100; tries++) {
      const x = (rng() * 2 - 1) * (MAP_HALF_SIZE - 2);
      const z = (rng() * 2 - 1) * (MAP_HALF_SIZE - 2);
      if (Math.hypot(x, z) < SAFE_RADIUS) continue;
      if (all.some((d) => Math.hypot(d.x - x, d.z - z) < spacing)) continue;
      const d = { x, z, scale: 0.8 + rng() * 0.6, rotation: rng() * Math.PI * 2 };
      list.push(d);
      all.push(d);
    }
  };
  place(trees, TREE_COUNT, 3);
  place(rocks, ROCK_COUNT, 2.5);

  const obstacles: Obstacle[] = [
    { ...FORGE_POS, radius: FORGE_RADIUS },
    { ...ENCHANTER_POS, radius: ENCHANTER_RADIUS },
    ...trees.map((t) => ({ x: t.x, z: t.z, radius: 0.5 * t.scale })),
    ...rocks.map((r) => ({ x: r.x, z: r.z, radius: 0.7 * r.scale })),
  ];
  return { trees, rocks, obstacles };
}
