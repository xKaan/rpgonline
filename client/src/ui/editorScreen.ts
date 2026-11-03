import { BASE_MODELS, DEFAULT_APPEARANCE, type Appearance, type CharacterDetail } from '@rpg/shared';
import { createPreview } from '../three/preview';
import type { AppContext } from './context';
import { errorMessage, h } from './dom';
import { BASE_LABELS } from './labels';

export function renderEditor(root: HTMLElement, ctx: AppContext, existing?: CharacterDetail): () => void {
  let appearance: Appearance = { ...(existing?.appearance ?? DEFAULT_APPEARANCE) };

  const previewBox = h('div', { class: 'preview' });
  const preview = createPreview(previewBox);
  const bases = h('div', { class: 'choices' });

  const renderBases = () =>
    bases.replaceChildren(
      ...BASE_MODELS.map((b) =>
        h('button', { type: 'button', class: b === appearance.base ? 'choice active' : 'choice', onclick: () => update({ base: b }) }, BASE_LABELS[b]),
      ),
    );

  const update = (patch: Partial<Appearance>) => {
    appearance = { ...appearance, ...patch };
    renderBases();
    void preview.show(appearance);
  };

  const name = h('input', { value: existing?.name ?? '', placeholder: 'Nom du personnage', maxLength: 16, disabled: !!existing });
  const color = h('input', { type: 'color', value: appearance.outfitColor });
  color.addEventListener('input', () => update({ outfitColor: color.value }));
  const headgear = h('input', { type: 'checkbox', checked: appearance.headgear });
  headgear.addEventListener('change', () => update({ headgear: headgear.checked }));
  const cape = h('input', { type: 'checkbox', checked: appearance.cape });
  cape.addEventListener('change', () => update({ cape: cape.checked }));
  const resetColor = h('button', { type: 'button', class: 'link', onclick: () => { color.value = '#ffffff'; update({ outfitColor: '#ffffff' }); } }, 'couleurs d’origine');

  const error = h('p', { class: 'error' });
  const save = h('button', {}, existing ? 'Enregistrer' : 'Créer');
  save.addEventListener('click', async () => {
    error.textContent = '';
    save.disabled = true;
    try {
      if (existing) await ctx.api.updateAppearance(existing.id, appearance);
      else await ctx.api.createCharacter(name.value, appearance);
      ctx.go({ name: 'characters' });
    } catch (e) {
      error.textContent = errorMessage(e);
    } finally {
      save.disabled = false;
    }
  });

  root.append(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'panel editor' },
        previewBox,
        h(
          'div',
          { class: 'form' },
          h('h1', {}, existing ? `Modifier ${existing.name}` : 'Nouveau personnage'),
          name,
          h('label', {}, 'Modèle'),
          bases,
          h('label', { class: 'row' }, 'Teinte de la tenue ', color, resetColor),
          h('label', { class: 'row' }, headgear, 'Chapeau / casque'),
          h('label', { class: 'row' }, cape, 'Cape'),
          error,
          h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => ctx.go({ name: 'characters' }) }, 'Annuler'), save),
        ),
      ),
    ),
  );

  renderBases();
  void preview.show(appearance);
  if (!existing) name.focus();
  return () => preview.dispose();
}
