import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './authRoutes';
import { registerCharacterRoutes } from './characterRoutes';
import type { AppDeps } from './deps';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest('accountId', 0);
  registerAuthRoutes(app, deps);
  registerCharacterRoutes(app, deps);
  return app;
}
