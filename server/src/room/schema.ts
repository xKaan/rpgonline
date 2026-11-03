import { schema, t, type SchemaType } from '@colyseus/schema';

// Mouvement du joueur en float64 : le client rejoue ses entrées depuis ces valeurs exactes.
export const PlayerState = schema(
  {
    characterId: t.uint32(),
    x: t.float64(),
    z: t.float64(),
    facing: t.float64(),
    rollTime: t.float64(),
    rollCooldown: t.float64(),
    rollDirX: t.float64(),
    rollDirZ: t.float64(),
    ackSeq: t.uint32(),
    speedMult: t.float64(),
    rollCooldownMax: t.float64(),
    hp: t.float32(),
    maxHp: t.float32(),
    dead: t.boolean(),
    weapon: t.string(),
    status: t.uint8(),
    attackSeq: t.uint16(),
    charging: t.boolean(),
    ready: t.boolean(),
    gold: t.uint32(),
    materials: t.uint32(),
    fire: t.uint32(),
    lightning: t.uint32(),
    poison: t.uint32(),
    ice: t.uint32(),
    bonuses: t.array('string'),
    offer: t.array('string'),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const MonsterState = schema(
  {
    kind: t.string(),
    x: t.float32(),
    z: t.float32(),
    facing: t.float32(),
    hp: t.float32(),
    maxHp: t.float32(),
    shiny: t.string(),
    status: t.uint8(),
    action: t.string(),
    shield: t.uint8(),
  },
  'MonsterState',
);
export type MonsterState = SchemaType<typeof MonsterState>;

export const ProjectileState = schema(
  { kind: t.string(), x: t.float32(), z: t.float32(), dirX: t.float32(), dirZ: t.float32() },
  'ProjectileState',
);
export type ProjectileState = SchemaType<typeof ProjectileState>;

export const HazardState = schema(
  { kind: t.string(), x: t.float32(), z: t.float32(), radius: t.float32(), time: t.float32(), duration: t.float32() },
  'HazardState',
);
export type HazardState = SchemaType<typeof HazardState>;

export const LootState = schema({ kind: t.string(), element: t.string(), x: t.float32(), z: t.float32() }, 'LootState');
export type LootState = SchemaType<typeof LootState>;

export const ChestState = schema({ x: t.float32(), z: t.float32() }, 'ChestState');
export type ChestState = SchemaType<typeof ChestState>;

export const RunState = schema(
  {
    phase: t.string(),
    wave: t.uint16(),
    phaseTime: t.float32(),
    remaining: t.uint16(),
    kills: t.uint32(),
    players: t.map(PlayerState),
    monsters: t.map(MonsterState),
    projectiles: t.map(ProjectileState),
    hazards: t.map(HazardState),
    loot: t.map(LootState),
    chests: t.map(ChestState),
  },
  'RunState',
);
export type RunState = SchemaType<typeof RunState>;
