import type { ArraySchema, MapSchema } from '@colyseus/schema';
import { statusBits } from '@rpg/shared';
import { motionOptions } from '../sim/players';
import { remainingMonsters } from '../sim/waves';
import type { World } from '../sim/world';
import { ChestState, HazardState, LootState, MonsterState, PlayerState, ProjectileState, type RunState } from './schema';

/** N'écrit que les champs qui changent (chaque écriture part dans le prochain patch). */
function assign<T extends object>(target: T, values: Partial<T>): void {
  const t = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(values)) if (t[k] !== v) t[k] = v;
}

function syncArray(target: ArraySchema<string>, values: readonly string[]): void {
  if (target.length === values.length && values.every((v, i) => target[i] === v)) return;
  target.clear();
  target.push(...values);
}

function syncMap<S, E>(target: MapSchema<S>, source: Map<number | string, E>, create: () => S, fill: (s: S, e: E) => void): void {
  target.forEach((_, key) => {
    if (!source.has(key) && !source.has(Number(key))) target.delete(key);
  });
  for (const [key, entity] of source) {
    const k = String(key);
    let s = target.get(k);
    if (!s) {
      s = create();
      fill(s, entity);
      target.set(k, s);
    } else {
      fill(s, entity);
    }
  }
}

export function syncRunState(state: RunState, w: World): void {
  assign(state, { phase: w.phase, wave: w.wave, phaseTime: Math.max(0, w.phaseTime), remaining: w.phase === 'wave' ? remainingMonsters(w) : 0, kills: w.kills });

  syncMap(state.players, w.players, () => new PlayerState(), (s, p) => {
    assign(s, {
      characterId: p.characterId,
      x: p.motion.x,
      z: p.motion.z,
      facing: p.motion.facing,
      rollTime: p.motion.rollTime,
      rollCooldown: p.motion.rollCooldown,
      rollDirX: p.motion.rollDirX,
      rollDirZ: p.motion.rollDirZ,
      ackSeq: p.ackSeq,
      speedMult: motionOptions(p).speedMult,
      rollCooldownMax: p.stats.rollCooldown,
      hp: p.hp,
      maxHp: p.stats.maxHp,
      dead: p.dead,
      weapon: p.weapon,
      status: statusBits(p.statuses),
      attackSeq: p.attackSeq,
      charging: p.chargeStart !== null,
      ready: p.ready,
      gold: p.wallet.gold,
      materials: p.wallet.materials,
      fire: p.wallet.stones.fire,
      lightning: p.wallet.stones.lightning,
      poison: p.wallet.stones.poison,
      ice: p.wallet.stones.ice,
    });
    syncArray(s.bonuses, p.bonuses);
    syncArray(s.offer, p.offer);
  });

  syncMap(state.monsters, w.monsters, () => new MonsterState(), (s, m) =>
    assign(s, {
      kind: m.kind,
      x: m.x,
      z: m.z,
      facing: m.facing,
      hp: Math.max(0, m.hp),
      maxHp: m.maxHp,
      shiny: m.shiny?.join(',') ?? '',
      status: statusBits(m.statuses),
      action: m.action,
      shield: m.shield,
    }),
  );
  syncMap(state.projectiles, w.projectiles, () => new ProjectileState(), (s, p) =>
    assign(s, { kind: p.kind, x: p.x, z: p.z, dirX: p.dirX, dirZ: p.dirZ }),
  );
  syncMap(state.hazards, w.hazards, () => new HazardState(), (s, h) =>
    assign(s, { kind: h.kind, x: h.x, z: h.z, radius: h.radius, time: Math.max(0, h.time), duration: h.duration }),
  );
  syncMap(state.loot, w.loot, () => new LootState(), (s, l) => assign(s, { kind: l.kind, element: l.element ?? '', x: l.x, z: l.z }));
  syncMap(state.chests, w.chests, () => new ChestState(), (s, c) => assign(s, { x: c.x, z: c.z }));
}
