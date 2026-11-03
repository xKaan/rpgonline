import type { PlayerStats } from './bonuses';
import { ENCHANT_EFFECTS, type Enchant } from './enchantments';
import type { Rng } from './rng';
import { WEAPONS, weaponAttacksPerSec, weaponDamage, type HitShape, type WeaponType } from './weapons';

export interface Vec2 {
  x: number;
  z: number;
}

export const CRIT_MULT = 2;
/** durée de maintien pour un tir d'arc chargé (s) */
export const BOW_FULL_CHARGE = 0.8;
export const PROJECTILE_SPEED: Record<'bow' | 'crossbow', number> = { bow: 30, crossbow: 36 };
/** écart angulaire entre projectiles du bonus « Tir multiple » (rad) */
export const MULTISHOT_SPREAD = 0.14;
/** le serveur accepte une attaque après cette fraction de l'intervalle (tolérance réseau) */
export const ATTACK_COOLDOWN_TOLERANCE = 0.9;
/** durée du recul de la pelle (s) */
export const KNOCKBACK_TIME = 0.2;

/** Direction horizontale visée par la caméra (yaw 0 = vers −Z). */
export function aimDirection(yaw: number): Vec2 {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Vrai si le cercle `target`/`radius` est dans la forme de mêlée partant de `origin` vers `dir` (normalisée). */
export function meleeHits(shape: HitShape, range: number, origin: Vec2, dir: Vec2, target: Vec2, radius: number): boolean {
  const tx = target.x - origin.x;
  const tz = target.z - origin.z;
  const d = Math.hypot(tx, tz);
  switch (shape.kind) {
    case 'circle':
      return d <= shape.radius + radius;
    case 'cone': {
      if (d > range + radius) return false;
      if (d <= radius) return true;
      const cos = (tx * dir.x + tz * dir.z) / d;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      return angle <= (shape.angleDeg * Math.PI) / 360 + Math.asin(Math.min(1, radius / d));
    }
    case 'line': {
      const along = tx * dir.x + tz * dir.z;
      if (along < -radius || along > range + radius) return false;
      return Math.abs(tx * dir.z - tz * dir.x) <= shape.width / 2 + radius;
    }
    case 'projectile':
      return false;
  }
}

/** Vrai si le segment A→B passe à moins de `r` du centre C (évite l'effet tunnel des projectiles rapides). */
export function segmentHitsCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len2));
  return Math.hypot(ax + dx * t - cx, az + dz * t - cz) <= r;
}

export interface HitContext {
  weapon: WeaponType;
  level: number;
  stats: Pick<PlayerStats, 'damageMult' | 'bossDamageMult'>;
  targetIsBoss: boolean;
  charged: boolean;
  crit: boolean;
}

export function hitDamage(ctx: HitContext): number {
  const special = WEAPONS[ctx.weapon].special;
  let dmg = weaponDamage(ctx.weapon, ctx.level) * ctx.stats.damageMult;
  if (ctx.charged && special.chargeMult) dmg *= special.chargeMult;
  if (ctx.targetIsBoss) dmg *= (special.bossDamageMult ?? 1) * ctx.stats.bossDamageMult;
  if (ctx.crit) dmg *= CRIT_MULT;
  return dmg;
}

/** Intervalle entre deux attaques (s). */
export function attackInterval(weapon: WeaponType, level: number, stats: Pick<PlayerStats, 'attackSpeedMult'>): number {
  return 1 / (weaponAttacksPerSec(weapon, level) * stats.attackSpeedMult);
}

/** Effets en cours sur une créature (monstre ou joueur). Les fonctions ci-dessous la modifient en place. */
export interface Statuses {
  burnDps: number;
  burnTime: number;
  poisonStacks: number;
  /** dégâts/s par stack */
  poisonPerStack: number;
  poisonTime: number;
  slow: number;
  slowTime: number;
  freezeTime: number;
  stunTime: number;
}

export function newStatuses(): Statuses {
  return { burnDps: 0, burnTime: 0, poisonStacks: 0, poisonPerStack: 0, poisonTime: 0, slow: 0, slowTime: 0, freezeTime: 0, stunTime: 0 };
}

export function applySlow(s: Statuses, ratio: number, sec: number): void {
  s.slow = s.slowTime > 0 ? Math.max(s.slow, ratio) : ratio;
  s.slowTime = Math.max(s.slowTime, sec);
}

/** Poison à un seul stack (attaques des monstres sur le joueur). */
export function applyPoison(s: Statuses, dps: number, sec: number): void {
  s.poisonStacks = 1;
  s.poisonPerStack = s.poisonTime > 0 ? Math.max(s.poisonPerStack, dps) : dps;
  s.poisonTime = Math.max(s.poisonTime, sec);
}

/** Applique les enchantements d'un coup direct ; renvoie les rebonds électriques à effectuer. */
export function applyEnchants(
  s: Statuses,
  enchants: readonly (Enchant | null)[],
  hitDmg: number,
  elementalMult: number,
  rng: Rng,
): { chains: number; chainDamage: number } {
  let chains = 0;
  let chainDamage = 0;
  for (const e of enchants) {
    if (!e) continue;
    const i = e.rank - 1;
    switch (e.element) {
      case 'fire': {
        const fx = ENCHANT_EFFECTS.fire;
        const dps = fx.dpsRatioByRank[i] * hitDmg * elementalMult;
        s.burnDps = s.burnTime > 0 ? Math.max(s.burnDps, dps) : dps;
        s.burnTime = fx.burnSec;
        break;
      }
      case 'poison': {
        const fx = ENCHANT_EFFECTS.poison;
        s.poisonPerStack = Math.max(s.poisonTime > 0 ? s.poisonPerStack : 0, fx.dpsPerStack * elementalMult);
        s.poisonStacks = Math.max(s.poisonTime > 0 ? s.poisonStacks : 0, Math.min(fx.maxStacksByRank[i], s.poisonStacks + 1));
        s.poisonTime = fx.durationSec;
        break;
      }
      case 'ice': {
        const fx = ENCHANT_EFFECTS.ice;
        applySlow(s, fx.slowByRank[i], fx.slowSec);
        if (rng() < fx.freezeChanceByRank[i]) s.freezeTime = Math.max(s.freezeTime, fx.freezeSec);
        break;
      }
      case 'lightning': {
        const fx = ENCHANT_EFFECTS.lightning;
        chains = Math.max(chains, fx.chainsByRank[i]);
        chainDamage = hitDmg * fx.chainDamageRatio * elementalMult;
        break;
      }
    }
  }
  return { chains, chainDamage };
}

/** Avance les statuts de `dt` ; renvoie les dégâts subis pendant ce pas. */
export function tickStatuses(s: Statuses, dt: number): number {
  let dmg = 0;
  if (s.burnTime > 0) {
    const t = Math.min(dt, s.burnTime);
    dmg += s.burnDps * t;
    s.burnTime -= t;
    if (s.burnTime <= 0) s.burnDps = 0;
  }
  if (s.poisonTime > 0) {
    const t = Math.min(dt, s.poisonTime);
    dmg += s.poisonStacks * s.poisonPerStack * t;
    s.poisonTime -= t;
    if (s.poisonTime <= 0) s.poisonStacks = 0;
  }
  s.slowTime = Math.max(0, s.slowTime - dt);
  if (s.slowTime === 0) s.slow = 0;
  s.freezeTime = Math.max(0, s.freezeTime - dt);
  s.stunTime = Math.max(0, s.stunTime - dt);
  return dmg;
}

export function canAct(s: Statuses): boolean {
  return s.freezeTime <= 0 && s.stunTime <= 0;
}

/** Multiplicateur de vitesse dû aux statuts (0 si gelé ou étourdi). */
export function speedFactor(s: Statuses): number {
  return canAct(s) ? 1 - s.slow : 0;
}

export const STATUS_BITS = { burn: 1, poison: 2, slow: 4, freeze: 8, stun: 16 } as const;

export function statusBits(s: Statuses): number {
  return (
    (s.burnTime > 0 ? STATUS_BITS.burn : 0) |
    (s.poisonTime > 0 ? STATUS_BITS.poison : 0) |
    (s.slowTime > 0 ? STATUS_BITS.slow : 0) |
    (s.freezeTime > 0 ? STATUS_BITS.freeze : 0) |
    (s.stunTime > 0 ? STATUS_BITS.stun : 0)
  );
}
