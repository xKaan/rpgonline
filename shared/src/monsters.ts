export const MONSTER_KINDS = ['goblin', 'archer', 'golem', 'spider'] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];
export const BOSS_KINDS = ['goblin_king', 'ancient_golem'] as const;
export type BossKind = (typeof BOSS_KINDS)[number];
export type EnemyKind = MonsterKind | BossKind;
export const ENEMY_KINDS: readonly EnemyKind[] = [...MONSTER_KINDS, ...BOSS_KINDS];

export interface EnemyStats {
  label: string;
  hp: number;
  damage: number;
  /** m/s */
  speed: number;
  radius: number;
  /** distance bord à bord à partir de laquelle il attaque (m) */
  attackRange: number;
  attackCooldown: number;
  gold: number;
  materials: number;
  boss: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  goblin: { label: 'Gobelin', hp: 30, damage: 6, speed: 4.5, radius: 0.45, attackRange: 0.5, attackCooldown: 1.4, gold: 3, materials: 0, boss: false },
  archer: { label: 'Squelette archer', hp: 25, damage: 8, speed: 2, radius: 0.45, attackRange: 14, attackCooldown: 2.2, gold: 4, materials: 0, boss: false },
  golem: { label: 'Golem', hp: 120, damage: 15, speed: 1.5, radius: 0.9, attackRange: 1.6, attackCooldown: 3, gold: 10, materials: 1, boss: false },
  spider: { label: 'Araignée', hp: 20, damage: 4, speed: 6.5, radius: 0.4, attackRange: 0.4, attackCooldown: 1.2, gold: 2, materials: 0, boss: false },
  goblin_king: { label: 'Roi Gobelin', hp: 800, damage: 18, speed: 4, radius: 1.2, attackRange: 0.7, attackCooldown: 1.2, gold: 150, materials: 5, boss: true },
  ancient_golem: { label: 'Golem ancien', hp: 1500, damage: 25, speed: 1.6, radius: 1.5, attackRange: 1, attackCooldown: 2.2, gold: 250, materials: 10, boss: true },
};

/** Paramètres des comportements propres à chaque type. */
export const BEHAVIOR = {
  archer: { keepMin: 7, keepMax: 12, projectileSpeed: 14, projectileRange: 22 },
  golem: { windup: 1, slamRadius: 2.8 },
  spider: { groupSize: 3, poisonDps: 1, poisonSec: 3 },
  goblinKing: { spinEvery: 7, spinDuration: 2, spinRadius: 3, spinTick: 0.5, spinDamageRatio: 0.6, spinTriggerDist: 8, summonAtHpRatio: 0.5, summonCount: 4 },
  ancientGolem: { rockEvery: 5, rockCount: 3, rockWarn: 1.5, rockRadius: 2.5, rockSpread: 4, enrageAtHpRatio: 0.3, enrageSpeedMult: 1.5, enrageRockMult: 0.5 },
} as const;

function assertWave(wave: number): void {
  if (!Number.isInteger(wave) || wave < 1) throw new RangeError(`Vague invalide : ${wave}`);
}

/** Multiplicateur de PV en coop : `1 + 0,5 × (joueurs − 1)`. */
export function coopHpMult(players: number): number {
  return 1 + 0.5 * Math.max(0, players - 1);
}

export function scaledHp(kind: EnemyKind, wave: number, players = 1): number {
  assertWave(wave);
  return ENEMIES[kind].hp * 1.12 ** (wave - 1) * coopHpMult(players);
}

export function scaledDamage(kind: EnemyKind, wave: number): number {
  assertWave(wave);
  return ENEMIES[kind].damage * (1 + 0.06 * (wave - 1));
}

export function goldDrop(kind: EnemyKind, wave: number): number {
  assertWave(wave);
  return Math.round(ENEMIES[kind].gold * (1 + 0.1 * (wave - 1)));
}

export function isBoss(kind: EnemyKind): kind is BossKind {
  return ENEMIES[kind].boss;
}
