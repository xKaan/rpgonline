import {
  ATTACK_COOLDOWN_TOLERANCE,
  BEHAVIOR,
  BOW_FULL_CHARGE,
  ENCHANT_EFFECTS,
  ENEMIES,
  KNOCKBACK_TIME,
  MAP_HALF_SIZE,
  MULTISHOT_SPREAD,
  PLAYER_RADIUS,
  PROJECTILE_SPEED,
  SHINY,
  WEAPONS,
  aimDirection,
  applyEnchants,
  applyPoison,
  applySlow,
  attackInterval,
  hitDamage,
  meleeHits,
  segmentHitsCircle,
  type AttackMessage,
  type Enchant,
  type WeaponType,
} from '@rpg/shared';
import { dropMonsterLoot } from './loot';
import { spawnMonster } from './monsters';
import { damagePlayer } from './players';
import { nextId, type SimMonster, type SimPlayer, type SimProjectile, type World } from './world';

const PROJECTILE_HIT_PADDING = 0.15;

interface HitSource {
  weapon: WeaponType;
  level: number;
  enchants: readonly (Enchant | null)[];
  charged: boolean;
}

/** Inflige des dégâts à un monstre. `direct` = coup d'arme (bloqué par le bouclier shiny). Renvoie les dégâts réellement infligés. */
export function damageMonster(w: World, m: SimMonster, amount: number, direct: boolean): number {
  if (m.hp <= 0 || amount <= 0) return 0;
  if (direct && m.shield > 0) {
    m.shield--;
    return 0;
  }
  const dealt = Math.min(m.hp, amount);
  m.hp -= amount;
  if (m.hp <= 0) killMonster(w, m);
  return dealt;
}

export function killMonster(w: World, m: SimMonster): void {
  m.hp = 0;
  w.monsters.delete(m.id);
  w.kills++;
  for (const h of w.hazards.values()) if (h.ownerId === m.id && h.kind !== 'fire') w.hazards.delete(h.id);
  if (m.splitCopy) return;
  dropMonsterLoot(w, m);
  if (m.shiny?.includes('splitting')) {
    for (const side of [-1, 1]) {
      const copy = spawnMonster(w, m.kind, m.x + side * m.radius, m.z, { shiny: null, splitCopy: true });
      copy.maxHp = m.maxHp / 2;
      copy.hp = copy.maxHp;
    }
  }
}

function weaponOf(p: SimPlayer): HitSource {
  const ws = p.weapons.find((x) => x.type === p.weapon);
  return { weapon: p.weapon, level: ws?.level ?? 1, enchants: ws?.enchants ?? [null, null], charged: false };
}

/** Coup direct d'un joueur sur un monstre : dégâts, vol de vie, effets d'arme et enchantements. */
export function hitMonster(w: World, p: SimPlayer, m: SimMonster, src: HitSource, alreadyHit: Set<number> = new Set()): void {
  const boss = ENEMIES[m.kind].boss;
  const dmg = hitDamage({
    weapon: src.weapon,
    level: src.level,
    stats: p.stats,
    targetIsBoss: boss,
    charged: src.charged,
    crit: w.rng() < p.stats.critChance,
  });
  alreadyHit.add(m.id);
  const dealt = damageMonster(w, m, dmg, true);
  if (dealt <= 0 && m.hp > 0) return; // bloqué par le bouclier
  if (p.stats.lifesteal > 0 && !p.dead) p.hp = Math.min(p.stats.maxHp, p.hp + dealt * p.stats.lifesteal);

  const special = WEAPONS[src.weapon].special;
  if (m.hp > 0 && !boss) {
    if (special.knockback) {
      const dx = m.x - p.motion.x;
      const dz = m.z - p.motion.z;
      const len = Math.hypot(dx, dz) || 1;
      m.knockX = (dx / len) * (special.knockback / KNOCKBACK_TIME);
      m.knockZ = (dz / len) * (special.knockback / KNOCKBACK_TIME);
      m.knockTime = KNOCKBACK_TIME;
    }
    if (special.stunSec) m.statuses.stunTime = Math.max(m.statuses.stunTime, special.stunSec);
  }

  const { chains, chainDamage } = applyEnchants(m.statuses, src.enchants, dmg, p.stats.elementalMult, w.rng);
  if (chains > 0) {
    const radius = ENCHANT_EFFECTS.lightning.chainRadius;
    const near = [...w.monsters.values()]
      .filter((o) => !alreadyHit.has(o.id) && o.id !== m.id && Math.hypot(o.x - m.x, o.z - m.z) <= radius)
      .sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z))
      .slice(0, chains);
    for (const o of near) {
      alreadyHit.add(o.id);
      damageMonster(w, o, chainDamage, false);
    }
  }
}

/** Intention d'attaque d'un joueur (début ou fin d'appui). */
export function playerAttack(w: World, p: SimPlayer, msg: AttackMessage): void {
  if (p.dead || p.paused || w.phase === 'over') return;
  const src = weaponOf(p);
  if (src.weapon === 'bow') {
    if (msg.pressed) {
      p.chargeStart ??= w.time;
      return;
    }
    if (p.chargeStart === null) return;
    src.charged = w.time - p.chargeStart >= BOW_FULL_CHARGE - 1e-9;
    p.chargeStart = null;
  } else if (!msg.pressed) {
    return;
  }
  if (p.attackCooldown > 0 || p.motion.rollTime > 0) return;

  p.attackCooldown = attackInterval(src.weapon, src.level, p.stats) * ATTACK_COOLDOWN_TOLERANCE;
  p.attackSeq++;
  p.motion = { ...p.motion, facing: msg.yaw + Math.PI };
  const stats = WEAPONS[src.weapon];

  if (stats.shape.kind === 'projectile') {
    const count = 1 + p.stats.extraProjectiles;
    const speed = PROJECTILE_SPEED[src.weapon as 'bow' | 'crossbow'];
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * MULTISHOT_SPREAD;
      const dir = aimDirection(msg.yaw + offset);
      const proj: SimProjectile = {
        id: nextId(w),
        kind: src.weapon === 'bow' ? 'arrow' : 'bolt',
        x: p.motion.x,
        z: p.motion.z,
        dirX: dir.x,
        dirZ: dir.z,
        speed,
        traveled: 0,
        range: stats.range,
        hitsLeft: 1 + stats.shape.pierce,
        hit: new Set(),
        playerId: p.id,
        weapon: src.weapon,
        level: src.level,
        enchants: src.enchants,
        charged: src.charged,
      };
      w.projectiles.set(proj.id, proj);
    }
    return;
  }

  const dir = aimDirection(msg.yaw);
  const range = stats.range * p.stats.meleeRangeMult;
  const hit = new Set<number>();
  for (const m of [...w.monsters.values()]) {
    if (hit.has(m.id) || !meleeHits(stats.shape, range, p.motion, dir, m, m.radius)) continue;
    hitMonster(w, p, m, src, hit);
  }
}

/** Un monstre touche un joueur (corps à corps ou projectile) : dégâts + effets du monstre. */
export function monsterHitsPlayer(w: World, p: SimPlayer, damage: number, from: { kind?: SimMonster['kind']; effects?: readonly string[] | null; melee?: SimMonster }): void {
  if (!damagePlayer(w, p, damage)) return;
  if (from.kind === 'spider') applyPoison(p.statuses, BEHAVIOR.spider.poisonDps, BEHAVIOR.spider.poisonSec);
  if (from.effects?.includes('venomous')) applyPoison(p.statuses, SHINY.venomDps, SHINY.venomSec);
  if (from.effects?.includes('frozen')) applySlow(p.statuses, SHINY.frostSlow, SHINY.frostSec);
  if (from.melee && p.stats.thorns > 0) damageMonster(w, from.melee, damage * p.stats.damageTakenMult * p.stats.thorns, false);
}

function hitsObstacle(w: World, ax: number, az: number, bx: number, bz: number): boolean {
  return w.map.obstacles.some((o) => segmentHitsCircle(ax, az, bx, bz, o.x, o.z, o.radius));
}

export function updateProjectiles(w: World, dt: number): void {
  for (const pr of [...w.projectiles.values()]) {
    const step = Math.min(pr.speed * dt, pr.range - pr.traveled);
    const ax = pr.x;
    const az = pr.z;
    const bx = ax + pr.dirX * step;
    const bz = az + pr.dirZ * step;

    if (pr.playerId !== undefined) {
      const owner = w.players.get(pr.playerId);
      const hits = [...w.monsters.values()]
        .filter((m) => !pr.hit.has(m.id) && segmentHitsCircle(ax, az, bx, bz, m.x, m.z, m.radius + PROJECTILE_HIT_PADDING))
        .sort((a, b) => Math.hypot(a.x - ax, a.z - az) - Math.hypot(b.x - ax, b.z - az));
      for (const m of hits) {
        if (pr.hitsLeft <= 0) break;
        pr.hit.add(m.id);
        pr.hitsLeft--;
        if (owner) hitMonster(w, owner, m, { weapon: pr.weapon!, level: pr.level!, enchants: pr.enchants!, charged: !!pr.charged }, new Set(pr.hit));
      }
    } else {
      for (const p of w.players.values()) {
        if (p.dead || pr.hitsLeft <= 0) continue;
        if (!segmentHitsCircle(ax, az, bx, bz, p.motion.x, p.motion.z, PLAYER_RADIUS + PROJECTILE_HIT_PADDING)) continue;
        if (p.motion.rollTime > 0) continue; // esquivé : la flèche continue
        monsterHitsPlayer(w, p, pr.damage ?? 0, { effects: pr.effects });
        pr.hitsLeft = 0;
      }
    }

    pr.x = bx;
    pr.z = bz;
    pr.traveled += step;
    const out = Math.abs(bx) > MAP_HALF_SIZE || Math.abs(bz) > MAP_HALF_SIZE;
    if (pr.hitsLeft <= 0 || out || pr.traveled >= pr.range - 1e-9 || hitsObstacle(w, ax, az, bx, bz)) w.projectiles.delete(pr.id);
  }
}

/** Zones télégraphiées et flaques : dégâts à l'expiration (ou continus pour le feu). */
export function updateHazards(w: World, dt: number): void {
  for (const h of [...w.hazards.values()]) {
    const owner = h.ownerId !== undefined ? w.monsters.get(h.ownerId) : undefined;
    if (h.kind === 'spin') {
      if (!owner) {
        w.hazards.delete(h.id);
        continue;
      }
      h.x = owner.x;
      h.z = owner.z;
    }
    if (h.kind === 'fire') {
      for (const p of w.players.values()) {
        if (Math.hypot(p.motion.x - h.x, p.motion.z - h.z) <= h.radius + PLAYER_RADIUS) damagePlayer(w, p, h.damage * Math.min(dt, h.time));
      }
    }
    h.time -= dt;
    if (h.time > 1e-9) continue;
    w.hazards.delete(h.id);
    if (h.kind === 'slam' || h.kind === 'rock' || h.kind === 'shock') {
      for (const p of w.players.values()) {
        if (Math.hypot(p.motion.x - h.x, p.motion.z - h.z) <= h.radius + PLAYER_RADIUS) {
          monsterHitsPlayer(w, p, h.damage, { effects: owner?.shiny });
        }
      }
    }
    if (h.kind === 'spawn' && h.pending) {
      for (const kind of h.pending) {
        const a = w.rng() * Math.PI * 2;
        const r = w.rng() * 1.5;
        spawnMonster(w, kind, h.x + Math.cos(a) * r, h.z + Math.sin(a) * r);
      }
    }
  }
}
