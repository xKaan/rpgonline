import {
  computeStats,
  type BonusId,
  type Element,
  type Enchant,
  type EnemyKind,
  type GameMap,
  type HazardKind,
  type LootKind,
  type MonsterAction,
  type PlayerMotion,
  type PlayerStats,
  type ProjectileKind,
  type Rng,
  type RunPhase,
  type ShinyEffect,
  type Statuses,
  type Wallet,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';
import type { FlowField } from './navigation';

export interface SimPlayer {
  id: string;
  characterId: number;
  motion: PlayerMotion;
  hp: number;
  dead: boolean;
  paused: boolean;
  ready: boolean;
  weapons: WeaponState[];
  weapon: WeaponType;
  bonuses: BonusId[];
  stats: PlayerStats;
  offer: BonusId[];
  statuses: Statuses;
  ackSeq: number;
  inputBudget: number;
  attackCooldown: number;
  /** début du maintien de l'arc (temps de simulation), `null` si pas de charge */
  chargeStart: number | null;
  attackSeq: number;
  wallet: Wallet;
  /** loot ramassé pendant cette run */
  runLoot: { gold: number; materials: number; stones: number };
}

export interface SimMonster {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  facing: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  shiny: ShinyEffect[] | null;
  shield: number;
  statuses: Statuses;
  attackCooldown: number;
  action: MonsterAction;
  actionTime: number;
  knockX: number;
  knockZ: number;
  knockTime: number;
  /** minuteurs des comportements (tourbillon, rochers, traînée…) */
  timers: Record<string, number>;
  summoned: boolean;
  enraged: boolean;
  /** copie issue d'une Scission : ne se divise plus et ne lâche rien */
  splitCopy: boolean;
  wave: number;
}

export interface SimProjectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  traveled: number;
  range: number;
  hitsLeft: number;
  hit: Set<number>;
  /** projectile de joueur */
  playerId?: string;
  weapon?: WeaponType;
  level?: number;
  enchants?: readonly (Enchant | null)[];
  charged?: boolean;
  /** projectile de monstre */
  damage?: number;
  ownerId?: number;
  effects?: readonly ShinyEffect[];
}

export interface SimHazard {
  id: number;
  kind: HazardKind;
  x: number;
  z: number;
  radius: number;
  time: number;
  duration: number;
  damage: number;
  ownerId?: number;
  /** monstres à faire apparaître (télégraphe de spawn) */
  pending?: EnemyKind[];
}

export interface SimLoot {
  id: number;
  kind: LootKind;
  element?: Element;
  amount: number;
  x: number;
  z: number;
  age: number;
}

export interface SimChest {
  id: number;
  x: number;
  z: number;
}

export type SimEvent =
  | { type: 'loot'; playerId: string; gold: number; materials: number; stones: Partial<Record<Element, number>> }
  | { type: 'waveStart'; wave: number }
  | { type: 'runOver'; wave: number; kills: number };

export interface World {
  map: GameMap;
  rng: Rng;
  time: number;
  phase: RunPhase;
  wave: number;
  /** temps restant du répit (s) */
  phaseTime: number;
  toSpawn: EnemyKind[];
  /** composition d'une vague (injectable pour les tests) */
  compose: (wave: number, rng: Rng) => EnemyKind[];
  spawnTimer: number;
  spawnIndex: number;
  players: Map<string, SimPlayer>;
  monsters: Map<number, SimMonster>;
  projectiles: Map<number, SimProjectile>;
  hazards: Map<number, SimHazard>;
  loot: Map<number, SimLoot>;
  chests: Map<number, SimChest>;
  nextId: number;
  kills: number;
  flow: FlowField;
  flowTimer: number;
  events: SimEvent[];
}

export function nextId(w: World): number {
  return w.nextId++;
}

export function livingPlayers(w: World): SimPlayer[] {
  return [...w.players.values()].filter((p) => !p.dead);
}

export function nearestPlayer(w: World, x: number, z: number): { player: SimPlayer; dist: number } | null {
  let best: { player: SimPlayer; dist: number } | null = null;
  for (const p of w.players.values()) {
    if (p.dead) continue;
    const d = Math.hypot(p.motion.x - x, p.motion.z - z);
    if (!best || d < best.dist) best = { player: p, dist: d };
  }
  return best;
}

export function refreshStats(p: SimPlayer): void {
  const before = p.stats.maxHp;
  p.stats = computeStats(p.bonuses);
  if (p.stats.maxHp > before && !p.dead) p.hp += p.stats.maxHp - before;
  p.hp = Math.min(p.hp, p.stats.maxHp);
}
