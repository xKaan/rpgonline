import type { FastifyReply, FastifyRequest } from 'fastify';
import { findAccountById } from '../repo/accounts';
import type { AppDeps } from './deps';
import { sendError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    accountId: number;
  }
}

export function requireAuth({ db, tokens }: AppDeps) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const accountId = token ? await tokens.verify(token) : null;
    if (accountId === null || !findAccountById(db, accountId)) return sendError(reply, 401, 'UNAUTHORIZED');
    req.accountId = accountId;
  };
}
