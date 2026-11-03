import type { TokenService } from '../auth';
import type { Db } from '../db';

export interface AppDeps {
  db: Db;
  tokens: TokenService;
}
