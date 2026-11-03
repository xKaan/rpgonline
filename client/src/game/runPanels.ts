import { BONUSES, isBonusId, type BonusId, type RunOverMessage } from '@rpg/shared';
import { h } from '../ui/dom';

/** Choix d'un bonus parmi l'offre ; renvoie une fonction qui ferme le panneau. */
export function openBonusPanel(root: HTMLElement, offer: readonly string[], onChoose: (id: BonusId) => void): () => void {
  const choices = offer.filter(isBonusId);
  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel bonus-panel' },
      h('h2', {}, 'Vague terminée !'),
      h('p', { class: 'hint' }, 'Choisis un bonus pour cette run (sinon il sera tiré au hasard au début de la vague).'),
      h(
        'div',
        { class: 'bonus-choices' },
        ...choices.map((id) =>
          h(
            'button',
            {
              class: 'bonus-card',
              onclick: () => {
                overlay.remove();
                onChoose(id);
              },
            },
            h('strong', {}, BONUSES[id].label),
            h('span', {}, BONUSES[id].description),
          ),
        ),
      ),
    ),
  );
  root.append(overlay);
  return () => overlay.remove();
}

export function openRunOverPanel(
  root: HTMLElement,
  summary: RunOverMessage,
  actions: { onRestart(): void; onQuit(): void },
): () => void {
  const record = summary.wave >= summary.bestWave && summary.wave > 0;
  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Tu es tombé…'),
      h('p', {}, `Vague atteinte : ${summary.wave}${record ? ' — nouveau record !' : ` (record : ${summary.bestWave})`}`),
      h('p', { class: 'hint' }, `${summary.kills} monstres vaincus · ${summary.gold} or · ${summary.materials} matériaux · ${summary.stones} pierres (déjà sauvegardés)`),
      h('button', { onclick: actions.onRestart }, 'Nouvelle run'),
      h('button', { class: 'secondary', onclick: actions.onQuit }, 'Retour aux personnages'),
    ),
  );
  root.append(overlay);
  return () => overlay.remove();
}

export function openMessagePanel(root: HTMLElement, title: string, message: string, onQuit: () => void): () => void {
  const overlay = h(
    'div',
    { class: 'overlay' },
    h('div', { class: 'panel' }, h('h2', {}, title), h('p', { class: 'hint' }, message), h('button', { onclick: onQuit }, 'Retour aux personnages')),
  );
  root.append(overlay);
  return () => overlay.remove();
}
