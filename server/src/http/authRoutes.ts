import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { passwordSchema, usernameSchema } from '@rpg/shared';
import { hashPassword, verifyPassword } from '../auth';
import { createAccount, findAccountById, findAccountByUsername } from '../repo/accounts';
import type { AppDeps } from './deps';
import { sendError } from './errors';
import { requireAuth } from './requireAuth';

const registerBody = z.object({ username: usernameSchema, password: passwordSchema });
const loginBody = z.object({ username: z.string(), password: z.string() });

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, tokens } = deps;

  app.post('/api/auth/register', async (req, reply) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'VALIDATION');
    const passwordHash = await hashPassword(body.data.password);
    const id = createAccount(db, body.data.username, passwordHash);
    if (id === null) return sendError(reply, 409, 'USERNAME_TAKEN');
    return reply.code(201).send({ token: await tokens.sign(id), username: body.data.username });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    const account = body.success ? findAccountByUsername(db, body.data.username) : undefined;
    if (!body.success || !account || !(await verifyPassword(account.password_hash, body.data.password))) {
      return sendError(reply, 401, 'INVALID_CREDENTIALS');
    }
    return { token: await tokens.sign(account.id), username: account.username };
  });

  app.get('/api/me', { preHandler: requireAuth(deps) }, async (req) => {
    const account = findAccountById(db, req.accountId)!;
    return { id: account.id, username: account.username };
  });
}
