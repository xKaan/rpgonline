import { MAX_CHARACTERS, type CharacterDetail, type CharacterSummary } from '@rpg/shared';
import type { AppContext } from './context';
import { errorMessage, h } from './dom';
import { BASE_LABELS } from './labels';

export async function renderCharacters(root: HTMLElement, ctx: AppContext): Promise<void> {
  const list = h('div', { class: 'char-list' }, h('p', { class: 'hint' }, 'Chargement…'));
  const error = h('p', { class: 'error' });

  const withDetail = async (id: number, then: (c: CharacterDetail) => void) => {
    error.textContent = '';
    try {
      then(await ctx.api.getCharacter(id));
    } catch (e) {
      error.textContent = errorMessage(e);
    }
  };

  const card = (c: CharacterSummary) =>
    h(
      'div',
      { class: 'card' },
      h('h3', {}, c.name),
      h('p', { class: 'hint' }, `${BASE_LABELS[c.appearance.base]} · meilleure vague : ${c.bestWave}`),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => withDetail(c.id, (d) => ctx.go({ name: 'game', character: d })) }, 'Jouer'),
        h('button', { class: 'secondary', onclick: () => withDetail(c.id, (d) => ctx.go({ name: 'editor', character: d })) }, 'Modifier'),
        h(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              if (!confirm(`Supprimer ${c.name} ? Cette action est définitive.`)) return;
              try {
                await ctx.api.deleteCharacter(c.id);
                ctx.go({ name: 'characters' });
              } catch (e) {
                error.textContent = errorMessage(e);
              }
            },
          },
          'Supprimer',
        ),
      ),
    );

  root.append(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'panel wide' },
        h(
          'header',
          { class: 'row spread' },
          h('h1', {}, 'Mes personnages'),
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'hint' }, ctx.session.username ?? ''),
            h('button', { class: 'secondary', onclick: () => { ctx.session.clear(); ctx.go({ name: 'auth' }); } }, 'Déconnexion'),
          ),
        ),
        list,
        error,
      ),
    ),
  );

  try {
    const characters = await ctx.api.listCharacters();
    list.replaceChildren(
      ...characters.map(card),
      characters.length < MAX_CHARACTERS
        ? h('button', { class: 'card new', onclick: () => ctx.go({ name: 'editor' }) }, '+ Nouveau personnage')
        : h('p', { class: 'hint' }, `Maximum de ${MAX_CHARACTERS} personnages atteint.`),
    );
  } catch (e) {
    list.replaceChildren();
    error.textContent = errorMessage(e);
  }
}
