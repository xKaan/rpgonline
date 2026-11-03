import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTokenService } from './auth';
import { resolveJwtSecret } from './config';
import { openDb } from './db';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_GAME_PORT, RUN_ROOM } from '@rpg/shared';
import { buildApp } from './http/app';
import { createRunRoom } from './room/RunRoom';

const dbPath = process.env.DB_PATH ?? 'data/rpg.db';
let secret: string;
try {
  secret = resolveJwtSecret(process.env);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
const tokens = createTokenService(secret);
const app = buildApp({ db, tokens });
const port = Number(process.env.PORT ?? 2567);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API prête sur http://localhost:${port}`);

const game = new Server({ transport: new WebSocketTransport(), greet: false });
game.define(RUN_ROOM, createRunRoom({ db, tokens }));
const gamePort = Number(process.env.GAME_PORT ?? DEFAULT_GAME_PORT);
await game.listen(gamePort);
console.log(`Serveur de jeu prêt sur ws://localhost:${gamePort}`);
