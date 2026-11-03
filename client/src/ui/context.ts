import type { CharacterDetail } from '@rpg/shared';
import type { Api } from '../api';
import type { Session } from '../session';

export type Route =
  | { name: 'auth' }
  | { name: 'characters' }
  | { name: 'editor'; character?: CharacterDetail }
  | { name: 'game'; character: CharacterDetail };

export interface AppContext {
  api: Api;
  session: Session;
  go(route: Route): void;
}
