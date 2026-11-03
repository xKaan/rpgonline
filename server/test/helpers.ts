import type { FastifyInstance } from 'fastify';
import { openDb } from '../src/db';
import { createTokenService } from '../src/auth';
import { buildApp } from '../src/http/app';

export const TEST_SECRET = 'test-secret-0123456789-0123456789-abcd';

export function makeApp() {
  const db = openDb(':memory:');
  const tokens = createTokenService(TEST_SECRET);
  return { db, tokens, app: buildApp({ db, tokens }) };
}

export async function registerUser(app: FastifyInstance, username = 'kaan', password = 'motdepasse123'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } });
  if (res.statusCode !== 201) throw new Error(`register a échoué : ${res.body}`);
  return res.json().token as string;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
