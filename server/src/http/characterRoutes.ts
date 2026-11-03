import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ELEMENTS, appearanceSchema, characterNameSchema, isWeaponType } from '@rpg/shared';
import { runForgeAction, type ForgeAction, type ForgeServiceResult } from '../forgeService';
import { createCharacter, deleteCharacter, getCharacter, listCharacters, updateAppearance } from '../repo/characters';
import type { AppDeps } from './deps';
import { sendError } from './errors';
import { requireAuth } from './requireAuth';

const createBody = z.object({ name: characterNameSchema, appearance: appearanceSchema });
const patchBody = z.object({ appearance: appearanceSchema });
const enchantBody = z.object({ slot: z.union([z.literal(0), z.literal(1)]), element: z.enum(ELEMENTS) });

type WeaponParams = { Params: { id: string; type: string } };

function sendForgeResult(reply: FastifyReply, result: ForgeServiceResult) {
  if (result.ok) return reply.send(result.character);
  return sendError(reply, result.error === 'NOT_FOUND' ? 404 : 400, result.error);
}

type IdParams = { Params: { id: string } };

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function registerCharacterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth(deps));

    scope.get('/api/characters', async (req) => ({ characters: listCharacters(db, req.accountId) }));

    scope.post('/api/characters', async (req, reply) => {
      const body = createBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      const result = createCharacter(db, req.accountId, body.data.name, body.data.appearance);
      if (result === 'LIMIT') return sendError(reply, 409, 'CHARACTER_LIMIT');
      if (result === 'NAME_TAKEN') return sendError(reply, 409, 'NAME_TAKEN');
      return reply.code(201).send(result);
    });

    scope.get<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      const character = id === null ? undefined : getCharacter(db, req.accountId, id);
      return character ?? sendError(reply, 404, 'NOT_FOUND');
    });

    scope.patch<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      if (id === null) return sendError(reply, 404, 'NOT_FOUND');
      const body = patchBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      if (!updateAppearance(db, req.accountId, id, body.data.appearance)) return sendError(reply, 404, 'NOT_FOUND');
      return getCharacter(db, req.accountId, id);
    });

    scope.delete<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      if (id === null || !deleteCharacter(db, req.accountId, id)) return sendError(reply, 404, 'NOT_FOUND');
      return reply.code(204).send();
    });

    const forge = (req: { accountId: number; params: { id: string; type: string } }, reply: FastifyReply, action: ForgeAction) => {
      const id = parseId(req.params.id);
      if (id === null || !isWeaponType(req.params.type)) return sendError(reply, 404, 'NOT_FOUND');
      return sendForgeResult(reply, runForgeAction(db, req.accountId, id, req.params.type, action));
    };

    scope.post<WeaponParams>('/api/characters/:id/weapons/:type/upgrade', async (req, reply) =>
      forge(req, reply, { kind: 'upgrade' }),
    );

    scope.post<WeaponParams>('/api/characters/:id/weapons/:type/enchant', async (req, reply) => {
      const body = enchantBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      return forge(req, reply, { kind: 'enchant', ...body.data });
    });
  });
}
