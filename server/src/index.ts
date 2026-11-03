import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTokenService } from './auth';
import { resolveJwtSecret } from './config';
import { openDb } from './db';
import { buildApp } from './http/app';

const dbPath = process.env.DB_PATH ?? 'data/rpg.db';
let secret: string;
try {
  secret = resolveJwtSecret(process.env);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const app = buildApp({ db: openDb(dbPath), tokens: createTokenService(secret) });
const port = Number(process.env.PORT ?? 2567);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Serveur prêt sur http://localhost:${port}`);
