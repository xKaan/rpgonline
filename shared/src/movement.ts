import { MAP_HALF_SIZE, type Obstacle } from './map';

export const PLAYER_SPEED = 6;
export const PLAYER_RADIUS = 0.5;
export const ROLL_SPEED = 14;
export const ROLL_DURATION = 0.35;
export const ROLL_COOLDOWN = 1.5;

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  roll: boolean;
}

export const NO_INPUT: MoveInput = { forward: false, back: false, left: false, right: false, roll: false };

export interface PlayerMotion {
  x: number;
  z: number;
  /** rotation.y du modèle (0 = regarde +Z) */
  facing: number;
  /** temps de roulade restant (s) */
  rollTime: number;
  rollCooldown: number;
  rollDirX: number;
  rollDirZ: number;
}

export function newMotion(x: number, z: number): PlayerMotion {
  return { x, z, facing: Math.PI, rollTime: 0, rollCooldown: 0, rollDirX: 0, rollDirZ: -1 };
}

/** Direction de déplacement normalisée, relative à la caméra (yaw 0 = caméra tournée vers −Z). */
export function moveDirection(input: MoveInput, yaw: number): { x: number; z: number } {
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (f === 0 && r === 0) return { x: 0, z: 0 };
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = -sin * f + cos * r;
  const z = -cos * f - sin * r;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function resolveCollisions(x: number, z: number, obstacles: readonly Obstacle[]): { x: number; z: number } {
  for (const o of obstacles) {
    const min = o.radius + PLAYER_RADIUS;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d === 0) {
      x = o.x + min;
    } else {
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  const limit = MAP_HALF_SIZE - PLAYER_RADIUS;
  return { x: clamp(x, -limit, limit), z: clamp(z, -limit, limit) };
}

export function stepMotion(
  m: PlayerMotion,
  input: MoveInput,
  yaw: number,
  dt: number,
  obstacles: readonly Obstacle[] = [],
): PlayerMotion {
  let { x, z, facing, rollTime, rollDirX, rollDirZ } = m;
  let rollCooldown = Math.max(0, m.rollCooldown - dt);
  const dir = moveDirection(input, yaw);
  const moving = dir.x !== 0 || dir.z !== 0;

  if (input.roll && rollTime <= 0 && rollCooldown <= 0) {
    rollTime = ROLL_DURATION;
    rollCooldown = ROLL_COOLDOWN;
    rollDirX = moving ? dir.x : Math.sin(facing);
    rollDirZ = moving ? dir.z : Math.cos(facing);
  }

  if (rollTime > 0) {
    const d = ROLL_SPEED * Math.min(dt, rollTime);
    x += rollDirX * d;
    z += rollDirZ * d;
    rollTime = Math.max(0, rollTime - dt);
    facing = Math.atan2(rollDirX, rollDirZ);
  } else if (moving) {
    x += dir.x * PLAYER_SPEED * dt;
    z += dir.z * PLAYER_SPEED * dt;
    facing = Math.atan2(dir.x, dir.z);
  }

  ({ x, z } = resolveCollisions(x, z, obstacles));
  return { x, z, facing, rollTime, rollCooldown, rollDirX, rollDirZ };
}
