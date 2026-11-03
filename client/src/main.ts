import './ui/style.css';
import { createApi } from './api';
import { browserStorage, createSession } from './session';
import { renderAuth } from './ui/authScreen';
import { renderCharacters } from './ui/charactersScreen';
import type { AppContext, Route } from './ui/context';
import { h } from './ui/dom';
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
    case 'game':
      app.append(
        h('div', { class: 'screen' }, h('div', { class: 'panel' }, h('p', {}, `Le jeu arrive à la Task 7 (${route.character.name}).`), h('button', { onclick: () => go({ name: 'characters' }) }, 'Retour'))),
      );
      break;
  }
  if (id !== navigation) return;
}

function go(route: Route): void {
  void show(route);
}

go(session.token ? { name: 'characters' } : { name: 'auth' });
