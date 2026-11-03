import { WEAPONS, type CharacterDetail, type WeaponType } from '@rpg/shared';
import { h } from '../ui/dom';

export function createHud(root: HTMLElement) {
  const bar = h('div', { class: 'weapon-bar' });
  const prompt = h('div', { class: 'prompt', hidden: true });
  const el = h('div', { class: 'hud' }, h('div', { class: 'crosshair' }), prompt, bar);
  root.append(el);

  return {
    setWeapons(c: CharacterDetail, current: WeaponType) {
      bar.replaceChildren(
        ...c.weapons.map((w, i) =>
          h(
            'div',
            { class: w.type === current ? 'slot active' : 'slot' },
            h('span', { class: 'key' }, String(i + 1)),
            h('span', {}, WEAPONS[w.type].label),
            h('span', { class: 'lvl' }, `Niv. ${w.level}`),
          ),
        ),
      );
    },
    setPrompt(text: string | null) {
      prompt.hidden = text === null;
      if (text !== null && prompt.textContent !== text) prompt.textContent = text;
    },
    destroy() {
      el.remove();
    },
  };
}
