import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTokenService } from './auth';
import { openDb } from './db';
import { buildApp } from './http/app';

const dbPath = process.env.DB_PATH ?? 'data/rpg.db';
const secret =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-a-changer-en-production-0123456789');
if (!secret) {
  console.error('JWT_SECRET est obligatoire en production');
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const app = buildApp({ db: openDb(dbPath), tokens: createTokenService(secret) });
const port = Number(process.env.PORT ?? 2567);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Serveur prêt sur http://localhost:${port}`);
