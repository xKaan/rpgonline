import {
  BREAK_DURATION,
  MAX_ALIVE,
  SPAWN_GROUP,
  SPAWN_INTERVAL,
  SPAWN_POINTS,
  SPAWN_TELEGRAPH,
  drawBonuses,
} from '@rpg/shared';
import { spawnChests } from './loot';
import { nextId, livingPlayers, refreshStats, type World } from './world';

function pendingSpawns(w: World): number {
  let n = 0;
  for (const h of w.hazards.values()) if (h.kind === 'spawn') n += h.pending?.length ?? 0;
  return n;
}

/** Monstres de la vague pas encore tués (à venir + télégraphiés + vivants). */
export function remainingMonsters(w: World): number {
  return w.toSpawn.length + pendingSpawns(w) + w.monsters.size;
}

export function startBreak(w: World): void {
  w.phase = 'break';
  w.phaseTime = BREAK_DURATION;
  for (const p of w.players.values()) {
    p.ready = false;
    if (p.dead) continue;
    p.hp = p.stats.maxHp;
    if (w.wave > 0) p.offer = drawBonuses(w.rng);
  }
  if (w.wave > 0) spawnChests(w);
}

export function startWave(w: World): void {
  for (const p of w.players.values()) {
    if (p.offer.length === 0) continue;
    p.bonuses.push(p.offer[Math.floor(w.rng() * p.offer.length)]);
    p.offer = [];
    refreshStats(p);
  }
  w.wave++;
  w.phase = 'wave';
  w.phaseTime = 0;
  w.toSpawn = w.compose(w.wave, w.rng);
  w.spawnTimer = 0;
  w.events.push({ type: 'waveStart', wave: w.wave });
}

export function updateWaves(w: World, dt: number): void {
  if (w.phase === 'break') {
    w.phaseTime -= dt;
    const living = livingPlayers(w);
    if (w.phaseTime <= 0 || (living.length > 0 && living.every((p) => p.ready))) startWave(w);
    return;
  }
  if (w.phase !== 'wave') return;

  w.spawnTimer -= dt;
  const alive = w.monsters.size + pendingSpawns(w);
  if (w.toSpawn.length > 0 && w.spawnTimer <= 0 && alive < MAX_ALIVE) {
    const n = Math.min(SPAWN_GROUP, w.toSpawn.length, MAX_ALIVE - alive);
    const point = SPAWN_POINTS[w.spawnIndex++ % SPAWN_POINTS.length];
    const id = nextId(w);
    w.hazards.set(id, {
      id,
      kind: 'spawn',
      x: point.x,
      z: point.z,
      radius: 2,
      time: SPAWN_TELEGRAPH,
      duration: SPAWN_TELEGRAPH,
      damage: 0,
      pending: w.toSpawn.splice(0, n),
    });
    w.spawnTimer = SPAWN_INTERVAL;
  }
  if (remainingMonsters(w) === 0) startBreak(w);
}
