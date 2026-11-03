import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appearanceSchema, characterNameSchema } from '@rpg/shared';
import { createCharacter, deleteCharacter, getCharacter, listCharacters, updateAppearance } from '../repo/characters';
import type { AppDeps } from './deps';
import { sendError } from './errors';
import { requireAuth } from './requireAuth';

const createBody = z.object({ name: characterNameSchema, appearance: appearanceSchema });
const patchBody = z.object({ appearance: appearanceSchema });

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
  });
}
