import './ui/style.css';
import { ApiError, createApi } from './api';
import { startGame } from './game/game';
import { browserStorage, createSession } from './session';
import { renderAuth } from './ui/authScreen';
import { renderCharacters } from './ui/charactersScreen';
import type { AppContext, Route } from './ui/context';
import { renderEditor } from './ui/editorScreen';

const app = document.getElementById('app')!;
const session = createSession(browserStorage());
const api = createApi({
  getToken: () => session.token,
  onUnauthorized: () => {
    session.clear();
    go({ name: 'auth' });
  },
});

let dispose: (() => void) | null = null;
let navigation = 0;

async function show(route: Route): Promise<void> {
  const id = ++navigation;
  dispose?.();
  dispose = null;
  app.replaceChildren();
  const ctx: AppContext = { api, session, go };

  switch (route.name) {
    case 'auth':
      renderAuth(app, ctx);
      break;
    case 'characters':
      await renderCharacters(app, ctx);
      break;
    case 'editor':
      dispose = renderEditor(app, ctx, route.character);
      break;
    case 'game': {
      const character = route.character;
      try {
        const stop = await startGame(app, {
          character,
          token: session.token ?? '',
          onQuit: () => go({ name: 'characters' }),
          onRestart: () => {
            void api.getCharacter(character.id).then(
              (c) => go({ name: 'game', character: c }),
              () => go({ name: 'characters' }),
            );
          },
        });
        if (id !== navigation) stop();
        else dispose = stop;
      } catch (e) {
        console.error(e);
        alert(e instanceof ApiError ? e.message : 'Impossible de charger le jeu (modèles 3D introuvables ?)');
        go({ name: 'characters' });
      }
      break;
    }
  }
}

function go(route: Route): void {
  void show(route);
}

go(session.token ? { name: 'characters' } : { name: 'auth' });
