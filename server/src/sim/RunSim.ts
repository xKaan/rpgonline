import {
  ENCHANTER_POS,
  FORGE_POS,
  FORGE_REACH,
  generateMap,
  isWeaponType,
  waveComposition,
  type AttackMessage,
  type BonusId,
  type EnemyKind,
  type GameMap,
  type InputMessage,
  type Rng,
  type Wallet,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';
import { playerAttack, updateHazards, updateProjectiles } from './combat';
import { updateLoot } from './loot';
import { updateMonsters } from './monsters';
import { FlowField } from './navigation';
import { applyInput, createPlayer, updatePlayers, type PlayerInit } from './players';
import { startBreak, updateWaves } from './waves';
import { refreshStats, type SimEvent, type World } from './world';

export interface RunSimOptions {
  rng?: Rng;
  map?: GameMap;
  compose?: (wave: number, rng: Rng) => EnemyKind[];
}

export type ForgeCheck = 'OK' | 'FORGE_CLOSED' | 'TOO_FAR' | 'NOT_FOUND';

/** Simulation autoritaire d'une run, sans I/O : la room la fait avancer avec `step(dt)`. */
export class RunSim {
  readonly world: World;

  constructor(opts: RunSimOptions = {}) {
    const map = opts.map ?? generateMap();
    this.world = {
      map,
      rng: opts.rng ?? Math.random,
      time: 0,
      phase: 'break',
      wave: 0,
      phaseTime: 0,
      toSpawn: [],
      compose: opts.compose ?? waveComposition,
      spawnTimer: 0,
      spawnIndex: 0,
      players: new Map(),
      monsters: new Map(),
      projectiles: new Map(),
      hazards: new Map(),
      loot: new Map(),
      chests: new Map(),
      nextId: 1,
      kills: 0,
      flow: new FlowField(map.obstacles),
      flowTimer: 0,
      events: [],
    };
    startBreak(this.world);
  }

  addPlayer(id: string, init: PlayerInit): void {
    const p = createPlayer(id, init, this.world.players.size);
    this.world.players.set(id, p);
  }

  removePlayer(id: string): void {
    this.world.players.delete(id);
  }

  input(id: string, msg: InputMessage): void {
    const p = this.world.players.get(id);
    if (p) applyInput(this.world, p, msg);
  }

  attack(id: string, msg: AttackMessage): void {
    const p = this.world.players.get(id);
    if (p) playerAttack(this.world, p, msg);
  }

  setWeapon(id: string, type: WeaponType): void {
    const p = this.world.players.get(id);
    if (!p || p.dead || !isWeaponType(type) || !p.weapons.some((w) => w.type === type)) return;
    if (p.weapon !== type) p.chargeStart = null;
    p.weapon = type;
  }

  chooseBonus(id: string, bonus: BonusId): void {
    const p = this.world.players.get(id);
    if (!p || !p.offer.includes(bonus)) return;
    p.bonuses.push(bonus);
    p.offer = [];
    refreshStats(p);
  }

  setPaused(id: string, paused: boolean): void {
    const p = this.world.players.get(id);
    if (p) p.paused = paused;
  }

  /** Le joueur est prêt : la vague démarre quand tous les joueurs vivants le sont. */
  ready(id: string): void {
    const p = this.world.players.get(id);
    if (p && this.world.phase === 'break') p.ready = true;
  }

  canForge(id: string): ForgeCheck {
    const p = this.world.players.get(id);
    if (!p) return 'NOT_FOUND';
    if (this.world.phase !== 'break') return 'FORGE_CLOSED';
    const near = (pos: { x: number; z: number }) => Math.hypot(p.motion.x - pos.x, p.motion.z - pos.z) <= FORGE_REACH;
    return near(FORGE_POS) || near(ENCHANTER_POS) ? 'OK' : 'TOO_FAR';
  }

  /** Après un achat à la forge : niveaux d'armes et porte-monnaie relus en BDD. */
  refreshCharacter(id: string, weapons: WeaponState[], wallet: Wallet): void {
    const p = this.world.players.get(id);
    if (!p) return;
    p.weapons = weapons;
    p.wallet = { gold: wallet.gold, materials: wallet.materials, stones: { ...wallet.stones } };
  }

  /** Vrai si la simulation est gelée (tous les joueurs en pause). */
  get frozen(): boolean {
    const players = [...this.world.players.values()];
    return players.length > 0 && players.every((p) => p.paused);
  }

  step(dt: number): void {
    const w = this.world;
    if (w.phase === 'over' || this.frozen || dt <= 0) return;
    w.time += dt;
    updatePlayers(w, dt);
    updateWaves(w, dt);
    updateMonsters(w, dt);
    updateProjectiles(w, dt);
    updateHazards(w, dt);
    updateLoot(w, dt);
    const players = [...w.players.values()];
    if (players.length > 0 && players.every((p) => p.dead)) {
      w.phase = 'over';
      w.events.push({ type: 'runOver', wave: w.wave, kills: w.kills });
    }
  }

  drainEvents(): SimEvent[] {
    const out = this.world.events;
    this.world.events = [];
    return out;
  }
}
