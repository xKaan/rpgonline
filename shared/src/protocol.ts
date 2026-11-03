import { z } from 'zod';
import type { CharacterDetail } from './apiTypes';
import { BONUS_IDS } from './bonuses';
import { ELEMENTS, type Element } from './enchantments';
import type { MoveInput } from './movement';
import { WEAPON_TYPES } from './weapons';

export const RUN_ROOM = 'run';
export const DEFAULT_GAME_PORT = 2568;
export const TICK_RATE = 20;
/** pas de temps max d'une entrée de déplacement (s) */
export const MAX_INPUT_DT = 0.1;
/** temps de déplacement qu'un joueur peut avoir d'avance sur le serveur (s) */
export const INPUT_BUDGET_MAX = 0.25;
/** distance max à la forge ou à l'enchanteur pour les utiliser */
export const FORGE_REACH = 4.5;

export const KEY_BITS = { forward: 1, back: 2, left: 4, right: 8, roll: 16 } as const;

export function encodeKeys(input: MoveInput): number {
  return (
    (input.forward ? KEY_BITS.forward : 0) |
    (input.back ? KEY_BITS.back : 0) |
    (input.left ? KEY_BITS.left : 0) |
    (input.right ? KEY_BITS.right : 0) |
    (input.roll ? KEY_BITS.roll : 0)
  );
}

export function decodeKeys(bits: number): MoveInput {
  return {
    forward: (bits & KEY_BITS.forward) !== 0,
    back: (bits & KEY_BITS.back) !== 0,
    left: (bits & KEY_BITS.left) !== 0,
    right: (bits & KEY_BITS.right) !== 0,
    roll: (bits & KEY_BITS.roll) !== 0,
  };
}

export const MSG = {
  input: 'input',
  attack: 'attack',
  weapon: 'weapon',
  bonus: 'bonus',
  pause: 'pause',
  ready: 'ready',
  forge: 'forge',
  runOver: 'runOver',
  forgeReply: 'forgeReply',
} as const;

export const joinOptionsSchema = z.object({ token: z.string().min(1), characterId: z.number().int().positive() });
export const inputMessageSchema = z.object({
  seq: z.number().int().nonnegative(),
  dt: z.number().nonnegative(),
  yaw: z.number(),
  keys: z.number().int().min(0).max(31),
});
export const attackMessageSchema = z.object({ yaw: z.number(), pressed: z.boolean() });
export const weaponMessageSchema = z.object({ type: z.enum(WEAPON_TYPES) });
export const bonusMessageSchema = z.object({ id: z.enum(BONUS_IDS) });
export const pauseMessageSchema = z.object({ paused: z.boolean() });
export const forgeMessageSchema = z.object({
  requestId: z.number().int(),
  weapon: z.enum(WEAPON_TYPES),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('upgrade') }),
    z.object({ kind: z.literal('enchant'), slot: z.union([z.literal(0), z.literal(1)]), element: z.enum(ELEMENTS) }),
  ]),
});

export type JoinOptions = z.infer<typeof joinOptionsSchema>;
export type InputMessage = z.infer<typeof inputMessageSchema>;
export type AttackMessage = z.infer<typeof attackMessageSchema>;
export type ForgeMessage = z.infer<typeof forgeMessageSchema>;

export interface RunOverMessage {
  wave: number;
  bestWave: number;
  kills: number;
  gold: number;
  materials: number;
  stones: number;
}

export type ForgeReply =
  | { requestId: number; ok: true; character: CharacterDetail }
  | { requestId: number; ok: false; error: string; message: string };

export const RUN_PHASES = ['break', 'wave', 'over'] as const;
export type RunPhase = (typeof RUN_PHASES)[number];
export type HazardKind = 'spawn' | 'slam' | 'rock' | 'spin' | 'fire' | 'shock';
export type ProjectileKind = 'arrow' | 'bolt' | 'enemyArrow';
export type LootKind = 'gold' | 'material' | 'stone';
export type MonsterAction = 'move' | 'idle' | 'attack' | 'windup' | 'spin' | 'throw';

/* Vues de l'état synchronisé (ce que le client lit dans `room.state`). */

export interface EntityMap<T> {
  get(key: string): T | undefined;
  forEach(cb: (value: T, key: string) => void): void;
  readonly size: number;
}

export interface PlayerView {
  characterId: number;
  x: number;
  z: number;
  facing: number;
  rollTime: number;
  rollCooldown: number;
  rollDirX: number;
  rollDirZ: number;
  ackSeq: number;
  speedMult: number;
  rollCooldownMax: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  weapon: string;
  status: number;
  attackSeq: number;
  charging: boolean;
  ready: boolean;
  gold: number;
  materials: number;
  fire: number;
  lightning: number;
  poison: number;
  ice: number;
  bonuses: ArrayLike<string> & Iterable<string>;
  offer: ArrayLike<string> & Iterable<string>;
}

export interface MonsterView {
  kind: string;
  x: number;
  z: number;
  facing: number;
  hp: number;
  maxHp: number;
  /** effets shiny séparés par des virgules, vide si non shiny */
  shiny: string;
  status: number;
  action: string;
  shield: number;
}

export interface ProjectileView {
  kind: string;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

export interface HazardView {
  kind: string;
  x: number;
  z: number;
  radius: number;
  time: number;
  duration: number;
}

export interface LootView {
  kind: string;
  element: string;
  x: number;
  z: number;
}

export interface ChestView {
  x: number;
  z: number;
}

export interface RunStateView {
  phase: string;
  wave: number;
  phaseTime: number;
  remaining: number;
  kills: number;
  players: EntityMap<PlayerView>;
  monsters: EntityMap<MonsterView>;
  projectiles: EntityMap<ProjectileView>;
  hazards: EntityMap<HazardView>;
  loot: EntityMap<LootView>;
  chests: EntityMap<ChestView>;
}

export function stonesOf(p: Pick<PlayerView, Element>): Record<Element, number> {
  return { fire: p.fire, lightning: p.lightning, poison: p.poison, ice: p.ice };
}
