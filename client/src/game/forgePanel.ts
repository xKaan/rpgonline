import { ELEMENTS, ENCHANT_EFFECTS, type CharacterDetail, type Element } from '@rpg/shared';
import type { ForgeApi } from '../net/forgeApi';
import { errorMessage, h } from '../ui/dom';
import { enchantLabel, forgeRows, type WeaponRowView } from './forgeView';

export interface ForgePanelOptions {
  character: CharacterDetail;
  api: ForgeApi;
  onChange(c: CharacterDetail): void;
  onClose(): void;
}

/** Ouvre le panneau ; renvoie une fonction qui le ferme sans appeler `onClose`. */
export function openForgePanel(root: HTMLElement, opts: ForgePanelOptions): () => void {
  let current = opts.character;
  let busy = false;

  const wallet = h('p', { class: 'hint' });
  const body = h('div');
  const message = h('p', { class: 'error' });

  const remove = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const close = () => {
    remove();
    opts.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === 'Escape' || e.code === 'KeyE') && !e.repeat) {
      e.preventDefault();
      close();
    }
  };

  const run = async (action: () => Promise<CharacterDetail>) => {
    if (busy) return;
    busy = true;
    message.textContent = '';
    try {
      current = await action();
      opts.onChange(current);
      render();
    } catch (e) {
      message.textContent = errorMessage(e);
    } finally {
      busy = false;
    }
  };

  const enchantControl = (row: WeaponRowView, slot: 0 | 1) => {
    if (slot >= row.slotCount) return h('span', { class: 'locked' }, '🔒 2e emplacement au niveau 7');
    const select = h('select', {}, ...ELEMENTS.map((el) => h('option', { value: el }, ENCHANT_EFFECTS[el].label)));
    const existing = row.enchants[slot];
    if (existing) select.value = existing.element;
    return h(
      'span',
      { class: 'enchant' },
      h('span', { class: 'current' }, enchantLabel(existing)),
      select,
      h('button', { class: 'secondary', onclick: () => run(() => opts.api.enchantWeapon(current.id, row.type, slot, select.value as Element)) }, 'Enchanter'),
    );
  };

  const upgradeLabel = (row: WeaponRowView) => {
    if (!row.cost) return 'Niveau max';
    const mats = row.cost.materials ? ` + ${row.cost.materials} mat.` : '';
    return `Améliorer (${row.cost.gold} or${mats})`;
  };

  const render = () => {
    const s = current.stones;
    wallet.textContent = `Or : ${current.gold} · Matériaux : ${current.materials} · Pierres : 🔥 ${s.fire}  ⚡ ${s.lightning}  ☠️ ${s.poison}  ❄️ ${s.ice}`;
    body.replaceChildren(
      ...forgeRows(current).map((row) =>
        h(
          'div',
          { class: 'forge-row' },
          h('strong', {}, `${row.label} · niv. ${row.level}`),
          h('button', { disabled: row.maxed, onclick: () => run(() => opts.api.upgradeWeapon(current.id, row.type)) }, upgradeLabel(row)),
          enchantControl(row, 0),
          enchantControl(row, 1),
        ),
      ),
    );
  };

  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel forge' },
      h('h2', {}, 'Forge & enchantements'),
      wallet,
      body,
      message,
      h('button', { class: 'secondary', onclick: close }, 'Fermer (E)'),
    ),
  );

  render();
  root.append(overlay);
  document.addEventListener('keydown', onKey);
  return remove;
}
