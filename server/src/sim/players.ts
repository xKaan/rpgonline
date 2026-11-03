import {
  INPUT_BUDGET_MAX,
  MAX_INPUT_DT,
  SPAWN_POS,
  computeStats,
  decodeKeys,
  newMotion,
  newStatuses,
  speedFactor,
  stepMotion,
  tickStatuses,
  type InputMessage,
  type MotionOptions,
  type Wallet,
  type WeaponState,
} from '@rpg/shared';
import type { SimPlayer, World } from './world';

export interface PlayerInit {
  characterId: number;
  weapons: WeaponState[];
  wallet: Wallet;
}

export function createPlayer(id: string, init: PlayerInit, index: number): SimPlayer {
  const stats = computeStats([]);
  return {
    id,
    characterId: init.characterId,
    motion: newMotion(SPAWN_POS.x + index * 1.5, SPAWN_POS.z),
    hp: stats.maxHp,
    dead: false,
    paused: false,
    ready: false,
    weapons: init.weapons,
    weapon: 'sword',
    bonuses: [],
    stats,
    offer: [],
    statuses: newStatuses(),
    ackSeq: 0,
    inputBudget: INPUT_BUDGET_MAX,
    attackCooldown: 0,
    chargeStart: null,
    attackSeq: 0,
    wallet: { gold: init.wallet.gold, materials: init.wallet.materials, stones: { ...init.wallet.stones } },
    runLoot: { gold: 0, materials: 0, stones: 0 },
  };
}

export function motionOptions(p: SimPlayer): MotionOptions {
  return { speedMult: p.stats.speedMult * speedFactor(p.statuses), rollCooldown: p.stats.rollCooldown };
}

/**
 * Applique une entrée de déplacement. Le temps simulé est plafonné par un budget qui se remplit
 * au rythme réel : un client qui envoie trop d'entrées voit les excédentaires ignorées.
 */
export function applyInput(w: World, p: SimPlayer, msg: InputMessage): void {
  if (msg.seq <= p.ackSeq) return;
  p.ackSeq = msg.seq;
  if (p.dead || p.paused || w.phase === 'over') return;
  const dt = Math.min(msg.dt, MAX_INPUT_DT);
  if (dt > p.inputBudget + 1e-9) return;
  p.inputBudget -= dt;
  p.motion = stepMotion(p.motion, decodeKeys(msg.keys), msg.yaw, dt, w.map.obstacles, motionOptions(p));
}

/** Inflige des dégâts au joueur ; sans effet pendant une roulade. Renvoie vrai si le coup a porté. */
export function damagePlayer(w: World, p: SimPlayer, amount: number, opts: { ignoreRoll?: boolean } = {}): boolean {
  if (p.dead || w.phase === 'over' || amount <= 0) return false;
  if (!opts.ignoreRoll && p.motion.rollTime > 0) return false;
  const dmg = amount * p.stats.damageTakenMult;
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp === 0) {
    p.dead = true;
    p.chargeStart = null;
  }
  return true;
}

export function updatePlayers(w: World, dt: number): void {
  for (const p of w.players.values()) {
    p.inputBudget = Math.min(INPUT_BUDGET_MAX, p.inputBudget + dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    if (p.dead) continue;
    const dot = tickStatuses(p.statuses, dt);
    if (dot > 0) damagePlayer(w, p, dot, { ignoreRoll: true });
  }
}
