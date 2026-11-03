import { Room, ServerError, type Client } from '@colyseus/core';
import {
  MSG,
  TICK_RATE,
  attackMessageSchema,
  bonusMessageSchema,
  forgeMessageSchema,
  inputMessageSchema,
  joinOptionsSchema,
  pauseMessageSchema,
  weaponMessageSchema,
  type CharacterDetail,
  type ForgeReply,
  type Rng,
  type RunOverMessage,
} from '@rpg/shared';
import type { z } from 'zod';
import type { TokenService } from '../auth';
import type { Db } from '../db';
import { runForgeAction } from '../forgeService';
import { errorMessage, type ErrorCode } from '../http/errors';
import { addLoot, getCharacter, recordBestWave } from '../repo/characters';
import { RunSim } from '../sim/RunSim';
import type { SimEvent } from '../sim/world';
import { RunState } from './schema';
import { syncRunState } from './sync';

export interface RunRoomDeps {
  db: Db;
  tokens: TokenService;
  rng?: Rng;
}

interface RunAuth {
  accountId: number;
  character: CharacterDetail;
}

type RunClient = Client<{ auth: RunAuth }>;

/** Sauvegarde immédiate du loot ramassé (spec §3 : conservé même en cas de mort). */
export function persistEvent(db: Db, characterIdOf: (playerId: string) => number | undefined, event: SimEvent): void {
  if (event.type !== 'loot') return;
  const characterId = characterIdOf(event.playerId);
  if (characterId !== undefined) addLoot(db, characterId, event);
}

export function createRunRoom(deps: RunRoomDeps) {
  return class RunRoom extends Room<{ state: RunState; client: RunClient }> {
    maxClients = 1;
    state = new RunState();
    sim = new RunSim({ rng: deps.rng });
    /** joueurs dont la run est déjà enregistrée (mort ou départ) */
    private finished = new Set<string>();

    async onAuth(_client: Client, options: unknown): Promise<RunAuth> {
      const parsed = joinOptionsSchema.safeParse(options);
      if (!parsed.success) throw new ServerError(400, errorMessage('VALIDATION'));
      const accountId = await deps.tokens.verify(parsed.data.token);
      if (accountId === null) throw new ServerError(401, errorMessage('UNAUTHORIZED'));
      const character = getCharacter(deps.db, accountId, parsed.data.characterId);
      if (!character) throw new ServerError(404, 'Personnage introuvable');
      return { accountId, character };
    }

    onCreate(): void {
      const on = <S extends z.ZodType>(type: string, schema: S, handler: (client: RunClient, msg: z.infer<S>) => void) => {
        // validation manuelle : un message invalide est ignoré (Colyseus déconnecterait le client)
        this.onMessage(type, (client: RunClient, raw: unknown) => {
          const parsed = schema.safeParse(raw);
          if (parsed.success) handler(client, parsed.data);
        });
      };
      on(MSG.input, inputMessageSchema, (c, m) => {
        this.sim.input(c.sessionId, m);
        syncRunState(this.state, this.sim.world);
      });
      on(MSG.attack, attackMessageSchema, (c, m) => this.sim.attack(c.sessionId, m));
      on(MSG.weapon, weaponMessageSchema, (c, m) => this.sim.setWeapon(c.sessionId, m.type));
      on(MSG.bonus, bonusMessageSchema, (c, m) => this.sim.chooseBonus(c.sessionId, m.id));
      on(MSG.pause, pauseMessageSchema, (c, m) => this.sim.setPaused(c.sessionId, m.paused));
      this.onMessage(MSG.ready, (c: RunClient) => this.sim.ready(c.sessionId));
      on(MSG.forge, forgeMessageSchema, (c, m) => this.forge(c, m));
      this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
      syncRunState(this.state, this.sim.world);
    }

    onJoin(client: RunClient): void {
      const { character } = client.auth!;
      this.sim.addPlayer(client.sessionId, {
        characterId: character.id,
        weapons: character.weapons,
        wallet: { gold: character.gold, materials: character.materials, stones: character.stones },
      });
      syncRunState(this.state, this.sim.world);
    }

    onLeave(client: RunClient): void {
      this.finish(client);
      this.sim.removePlayer(client.sessionId);
    }

    private characterIdOf = (playerId: string) => this.sim.world.players.get(playerId)?.characterId;

    /** Enregistre la vague atteinte et renvoie le bilan de la run. */
    private finish(client: RunClient): RunOverMessage | null {
      if (this.finished.has(client.sessionId)) return null;
      const p = this.sim.world.players.get(client.sessionId);
      if (!p) return null;
      this.finished.add(client.sessionId);
      const bestWave = recordBestWave(deps.db, p.characterId, this.sim.world.wave);
      return { wave: this.sim.world.wave, bestWave, kills: this.sim.world.kills, ...p.runLoot };
    }

    private tick(dt: number): void {
      this.sim.step(dt);
      for (const event of this.sim.drainEvents()) {
        persistEvent(deps.db, this.characterIdOf, event);
        if (event.type === 'runOver') {
          for (const client of this.clients) {
            const summary = this.finish(client);
            if (summary) client.send(MSG.runOver, summary);
          }
        }
      }
      syncRunState(this.state, this.sim.world);
    }

    private forge(client: RunClient, msg: z.infer<typeof forgeMessageSchema>): void {
      const reply = (r: ForgeReply) => client.send(MSG.forgeReply, r);
      const fail = (code: ErrorCode) => reply({ requestId: msg.requestId, ok: false, error: code, message: errorMessage(code) });
      const check = this.sim.canForge(client.sessionId);
      if (check !== 'OK') return fail(check);
      const { accountId, character } = client.auth!;
      const action = msg.action.kind === 'upgrade' ? { kind: 'upgrade' as const } : msg.action;
      const result = runForgeAction(deps.db, accountId, character.id, msg.weapon, action);
      if (!result.ok) return fail(result.error);
      const c = result.character;
      this.sim.refreshCharacter(client.sessionId, c.weapons, { gold: c.gold, materials: c.materials, stones: c.stones });
      syncRunState(this.state, this.sim.world);
      reply({ requestId: msg.requestId, ok: true, character: c });
    }
  };
}
