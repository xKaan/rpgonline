import {
  CHEST,
  LOOT_DESPAWN,
  MAP_HALF_SIZE,
  PLAYER_RADIUS,
  SAFE_RADIUS,
  chestLoot,
  monsterLoot,
  type Element,
  type LootDrop,
} from '@rpg/shared';
import { nextId, type SimMonster, type World } from './world';

export function dropLoot(w: World, drop: LootDrop, x: number, z: number): void {
  const scatter = () => (w.rng() - 0.5) * 1.2;
  const add = (kind: 'gold' | 'material' | 'stone', amount: number, element?: Element) => {
    const id = nextId(w);
    w.loot.set(id, { id, kind, amount, element, x: x + scatter(), z: z + scatter(), age: 0 });
  };
  if (drop.gold > 0) add('gold', drop.gold);
  if (drop.materials > 0) add('material', drop.materials);
  for (const el of drop.stones) add('stone', 1, el);
}

export function dropMonsterLoot(w: World, m: SimMonster): void {
  dropLoot(w, monsterLoot(m.kind, m.wave, m.shiny, w.rng), m.x, m.z);
}

/** Ramassage automatique par proximité ; un événement `loot` par joueur et par pas. */
export function updateLoot(w: World, dt: number): void {
  for (const l of [...w.loot.values()]) {
    l.age += dt;
    if (l.age >= LOOT_DESPAWN) w.loot.delete(l.id);
  }
  for (const p of w.players.values()) {
    if (p.dead) continue;
    let gold = 0;
    let materials = 0;
    const stones: Partial<Record<Element, number>> = {};
    for (const l of [...w.loot.values()]) {
      if (Math.hypot(l.x - p.motion.x, l.z - p.motion.z) > p.stats.pickupRadius) continue;
      w.loot.delete(l.id);
      if (l.kind === 'gold') gold += Math.round(l.amount * p.stats.goldMult);
      else if (l.kind === 'material') materials += l.amount;
      else if (l.element) stones[l.element] = (stones[l.element] ?? 0) + l.amount;
    }
    for (const c of [...w.chests.values()]) {
      if (Math.hypot(c.x - p.motion.x, c.z - p.motion.z) > CHEST.openRadius + PLAYER_RADIUS) continue;
      w.chests.delete(c.id);
      dropLoot(w, chestLoot(w.wave, w.rng), c.x, c.z);
    }
    const stoneCount = Object.values(stones).reduce((a, b) => a + b, 0);
    if (gold === 0 && materials === 0 && stoneCount === 0) continue;
    p.wallet.gold += gold;
    p.wallet.materials += materials;
    for (const [el, n] of Object.entries(stones) as [Element, number][]) p.wallet.stones[el] += n;
    p.runLoot.gold += gold;
    p.runLoot.materials += materials;
    p.runLoot.stones += stoneCount;
    w.events.push({ type: 'loot', playerId: p.id, gold, materials, stones });
  }
}

/** Place des coffres sur des emplacements libres, hors de la place centrale. */
export function spawnChests(w: World): void {
  for (let i = 0; i < CHEST.perBreak && w.chests.size < CHEST.maxOnMap; i++) {
    for (let tries = 0; tries < 50; tries++) {
      const x = (w.rng() * 2 - 1) * (MAP_HALF_SIZE - 4);
      const z = (w.rng() * 2 - 1) * (MAP_HALF_SIZE - 4);
      if (Math.hypot(x, z) < SAFE_RADIUS) continue;
      if (w.map.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.radius + 1.2)) continue;
      const id = nextId(w);
      w.chests.set(id, { id, x, z });
      break;
    }
  }
}
