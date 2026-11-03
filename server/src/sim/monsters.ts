import {
  ENEMIES,
  MAP_HALF_SIZE,
  SHINY,
  canAct,
  newStatuses,
  resolveCollisions,
  rollShiny,
  scaledDamage,
  scaledHp,
  speedFactor,
  tickStatuses,
  type EnemyKind,
  type ShinyEffect,
} from '@rpg/shared';
import { runBehavior, updateShinyEffects } from './behaviors';
import { damageMonster } from './combat';
import { nextId, livingPlayers, nearestPlayer, type SimMonster, type World } from './world';

/** distance sous laquelle le monstre fonce tout droit au lieu de suivre le champ de flux */
const DIRECT_CHASE = 3;
const FLOW_REFRESH = 0.5;

export function spawnMonster(
  w: World,
  kind: EnemyKind,
  x: number,
  z: number,
  opts: { shiny?: ShinyEffect[] | null; splitCopy?: boolean } = {},
): SimMonster {
  const st = ENEMIES[kind];
  const wave = Math.max(1, w.wave);
  const shiny = opts.shiny !== undefined ? opts.shiny : rollShiny(w.rng, st.boss);
  let hp = scaledHp(kind, wave, Math.max(1, w.players.size));
  let damage = scaledDamage(kind, wave);
  if (shiny) {
    hp *= SHINY.hpMult;
    damage *= SHINY.damageMult;
  }
  const radius = st.radius * (shiny ? SHINY.scale : 1);
  const pos = resolveCollisions(x, z, w.map.obstacles, radius);
  const m: SimMonster = {
    id: nextId(w),
    kind,
    x: pos.x,
    z: pos.z,
    facing: Math.atan2(-pos.x, -pos.z),
    hp,
    maxHp: hp,
    damage,
    speed: st.speed * (shiny?.includes('swift') ? SHINY.swiftSpeedMult : 1),
    radius,
    shiny,
    shield: shiny?.includes('shielded') ? SHINY.shieldHits : 0,
    statuses: newStatuses(),
    attackCooldown: 0.5,
    action: 'move',
    actionTime: 0,
    knockX: 0,
    knockZ: 0,
    knockTime: 0,
    timers: {},
    summoned: false,
    enraged: false,
    splitCopy: !!opts.splitCopy,
    wave,
  };
  w.monsters.set(m.id, m);
  return m;
}

/** Déplace `m` vers (ou à l'opposé de) la cible, via le champ de flux si elle est loin. */
export function moveMonster(w: World, m: SimMonster, tx: number, tz: number, dt: number, speedMult = 1, away = false): void {
  const dx = tx - m.x;
  const dz = tz - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return;
  let dir = { x: dx / d, z: dz / d };
  if (away) dir = { x: -dir.x, z: -dir.z };
  else if (d > DIRECT_CHASE) dir = w.flow.direction(m.x, m.z) ?? dir;
  const step = m.speed * speedMult * speedFactor(m.statuses) * dt;
  m.x += dir.x * step;
  m.z += dir.z * step;
  m.facing = Math.atan2(dir.x, dir.z);
  m.action = 'move';
}

export function faceTowards(m: SimMonster, tx: number, tz: number): void {
  m.facing = Math.atan2(tx - m.x, tz - m.z);
}

function separate(w: World): void {
  const list = [...w.monsters.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d >= min) continue;
      const push = (min - d) / 2;
      const nx = d === 0 ? 1 : dx / d;
      const nz = d === 0 ? 0 : dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
    }
  }
}

export function updateMonsters(w: World, dt: number): void {
  w.flowTimer -= dt;
  if (w.flowTimer <= 0) {
    w.flowTimer = FLOW_REFRESH;
    w.flow.compute(livingPlayers(w).map((p) => p.motion));
  }

  for (const m of [...w.monsters.values()]) {
    const dot = tickStatuses(m.statuses, dt);
    if (dot > 0) damageMonster(w, m, dot, false);
    if (m.hp <= 0) continue;
    m.attackCooldown = Math.max(0, m.attackCooldown - dt);
    m.actionTime = Math.max(0, m.actionTime - dt);

    if (m.knockTime > 0) {
      const t = Math.min(dt, m.knockTime);
      m.x += m.knockX * t;
      m.z += m.knockZ * t;
      m.knockTime -= t;
    }

    updateShinyEffects(w, m, dt);
    if (m.hp <= 0) continue;
    const target = nearestPlayer(w, m.x, m.z);
    if (!target) {
      m.action = 'idle';
      continue;
    }
    if (!canAct(m.statuses)) continue;
    runBehavior(w, m, target.player, target.dist, dt);
  }

  separate(w);
  for (const m of w.monsters.values()) {
    const pos = resolveCollisions(m.x, m.z, w.map.obstacles, m.radius);
    m.x = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, pos.x));
    m.z = Math.max(-MAP_HALF_SIZE, Math.min(MAP_HALF_SIZE, pos.z));
  }
}
