import { BEHAVIOR, ENEMIES, PLAYER_RADIUS, SHINY } from '@rpg/shared';
import { monsterHitsPlayer } from './combat';
import { faceTowards, moveMonster, spawnMonster } from './monsters';
import { nextId, livingPlayers, type SimHazard, type SimMonster, type SimPlayer, type World } from './world';

function addHazard(w: World, h: Omit<SimHazard, 'id' | 'duration'>): SimHazard {
  const hazard = { ...h, id: nextId(w), duration: h.time };
  w.hazards.set(hazard.id, hazard);
  return hazard;
}

/** décompte un minuteur ; vrai (et réarme à `every`) quand il expire */
function timer(m: SimMonster, key: string, every: number, dt: number): boolean {
  m.timers[key] = (m.timers[key] ?? every) - dt;
  if (m.timers[key] > 0) return false;
  m.timers[key] = every;
  return true;
}

const edgeDistance = (m: SimMonster, dist: number) => dist - m.radius - PLAYER_RADIUS;

/** Fonce et frappe au contact (gobelin, araignée, base des boss). */
function melee(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number, speedMult = 1): void {
  const st = ENEMIES[m.kind];
  if (edgeDistance(m, dist) > st.attackRange * 0.8) moveMonster(w, m, p.motion.x, p.motion.z, dt, speedMult);
  else {
    faceTowards(m, p.motion.x, p.motion.z);
    if (m.actionTime <= 0) m.action = 'idle';
  }
  if (edgeDistance(m, dist) <= st.attackRange && m.attackCooldown <= 0) {
    m.attackCooldown = st.attackCooldown;
    m.action = 'attack';
    m.actionTime = 0.3;
    monsterHitsPlayer(w, p, m.damage, { kind: m.kind, effects: m.shiny, melee: m });
  }
}

function archer(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number): void {
  const b = BEHAVIOR.archer;
  if (dist < b.keepMin) moveMonster(w, m, p.motion.x, p.motion.z, dt, 1, true);
  else if (dist > b.keepMax) moveMonster(w, m, p.motion.x, p.motion.z, dt);
  else if (m.actionTime <= 0) m.action = 'idle';
  if (dist <= ENEMIES.archer.attackRange && m.attackCooldown <= 0) {
    faceTowards(m, p.motion.x, p.motion.z);
    m.attackCooldown = ENEMIES.archer.attackCooldown;
    m.action = 'attack';
    m.actionTime = 0.4;
    const dx = (p.motion.x - m.x) / dist;
    const dz = (p.motion.z - m.z) / dist;
    const id = nextId(w);
    w.projectiles.set(id, {
      id,
      kind: 'enemyArrow',
      x: m.x + dx * (m.radius + 0.1),
      z: m.z + dz * (m.radius + 0.1),
      dirX: dx,
      dirZ: dz,
      speed: b.projectileSpeed,
      traveled: 0,
      range: b.projectileRange,
      hitsLeft: 1,
      hit: new Set(),
      damage: m.damage,
      ownerId: m.id,
      effects: m.shiny ?? undefined,
    });
  }
}

/** Golem : s'arrête, charge 1 s (zone affichée au sol) puis frappe autour de lui. */
function golem(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number, radius: number = BEHAVIOR.golem.slamRadius): void {
  if (m.action === 'windup' && m.actionTime > 0) return;
  if (edgeDistance(m, dist) <= ENEMIES[m.kind].attackRange && m.attackCooldown <= 0) {
    faceTowards(m, p.motion.x, p.motion.z);
    m.action = 'windup';
    m.actionTime = BEHAVIOR.golem.windup;
    m.attackCooldown = ENEMIES[m.kind].attackCooldown;
    addHazard(w, { kind: 'slam', x: m.x, z: m.z, radius, time: BEHAVIOR.golem.windup, damage: m.damage, ownerId: m.id });
    return;
  }
  if (edgeDistance(m, dist) > ENEMIES[m.kind].attackRange * 0.8) moveMonster(w, m, p.motion.x, p.motion.z, dt, m.enraged ? BEHAVIOR.ancientGolem.enrageSpeedMult : 1);
  else m.action = 'idle';
}

function goblinKing(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number): void {
  const b = BEHAVIOR.goblinKing;
  if (!m.summoned && m.hp <= m.maxHp * b.summonAtHpRatio) {
    m.summoned = true;
    for (let i = 0; i < b.summonCount; i++) {
      const a = (i / b.summonCount) * Math.PI * 2;
      spawnMonster(w, 'goblin', m.x + Math.cos(a) * (m.radius + 1), m.z + Math.sin(a) * (m.radius + 1), { shiny: null });
    }
  }
  if (m.action === 'spin' && m.actionTime > 0) {
    moveMonster(w, m, p.motion.x, p.motion.z, dt, 0.6);
    m.action = 'spin';
    if (timer(m, 'spinTick', b.spinTick, dt)) {
      for (const q of livingPlayers(w)) {
        if (Math.hypot(q.motion.x - m.x, q.motion.z - m.z) <= b.spinRadius + PLAYER_RADIUS) {
          monsterHitsPlayer(w, q, m.damage * b.spinDamageRatio, { effects: m.shiny, melee: m });
        }
      }
    }
    return;
  }
  if (timer(m, 'spin', b.spinEvery, dt) && dist <= b.spinTriggerDist) {
    m.action = 'spin';
    m.actionTime = b.spinDuration;
    m.timers.spinTick = b.spinTick;
    addHazard(w, { kind: 'spin', x: m.x, z: m.z, radius: b.spinRadius, time: b.spinDuration, damage: 0, ownerId: m.id });
    return;
  }
  melee(w, m, p, dist, dt);
}

function ancientGolem(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number): void {
  const b = BEHAVIOR.ancientGolem;
  if (!m.enraged && m.hp <= m.maxHp * b.enrageAtHpRatio) m.enraged = true;
  const every = b.rockEvery * (m.enraged ? b.enrageRockMult : 1);
  if (m.action !== 'windup' && timer(m, 'rock', every, dt)) {
    faceTowards(m, p.motion.x, p.motion.z);
    m.action = 'throw';
    m.actionTime = 0.6;
    for (let i = 0; i < b.rockCount; i++) {
      const a = w.rng() * Math.PI * 2;
      const r = i === 0 ? 0 : w.rng() * b.rockSpread;
      addHazard(w, {
        kind: 'rock',
        x: p.motion.x + Math.cos(a) * r,
        z: p.motion.z + Math.sin(a) * r,
        radius: b.rockRadius,
        time: b.rockWarn,
        damage: m.damage,
        ownerId: m.id,
      });
    }
    return;
  }
  if (m.action === 'throw' && m.actionTime > 0) return;
  golem(w, m, p, dist, dt, BEHAVIOR.golem.slamRadius + 0.7);
}

export function runBehavior(w: World, m: SimMonster, p: SimPlayer, dist: number, dt: number): void {
  switch (m.kind) {
    case 'goblin':
    case 'spider':
      return melee(w, m, p, dist, dt);
    case 'archer':
      return archer(w, m, p, dist, dt);
    case 'golem':
      return golem(w, m, p, dist, dt);
    case 'goblin_king':
      return goblinKing(w, m, p, dist, dt);
    case 'ancient_golem':
      return ancientGolem(w, m, p, dist, dt);
  }
}

/** Effets shiny périodiques : traînée de feu, décharge électrique. */
export function updateShinyEffects(w: World, m: SimMonster, dt: number): void {
  if (!m.shiny) return;
  if (m.shiny.includes('burning') && timer(m, 'trail', SHINY.trailEvery, dt)) {
    addHazard(w, { kind: 'fire', x: m.x, z: m.z, radius: SHINY.trailRadius, time: SHINY.trailSec, damage: m.damage * SHINY.trailDpsRatio, ownerId: m.id });
  }
  if (m.shiny.includes('electric') && timer(m, 'shock', SHINY.shockEvery, dt)) {
    addHazard(w, { kind: 'shock', x: m.x, z: m.z, radius: SHINY.shockRadius, time: SHINY.shockWarn, damage: m.damage, ownerId: m.id });
  }
}
