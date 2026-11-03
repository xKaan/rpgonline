// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_APPEARANCE, WEAPON_TYPES, emptyStones, newWeapon, type CharacterDetail } from '@rpg/shared';
import type { Api } from '../src/api';
import { openForgePanel } from '../src/game/forgePanel';

const character: CharacterDetail = {
  id: 1,
  name: 'Arthur',
  appearance: DEFAULT_APPEARANCE,
  bestWave: 0,
  gold: 0,
  materials: 0,
  stones: emptyStones(),
  weapons: WEAPON_TYPES.map((t) => newWeapon(t)),
};

describe('openForgePanel', () => {
  it("se ferme avec E, mais pas sur la répétition automatique de la touche maintenue", () => {
    const onClose = vi.fn();
    openForgePanel(document.body, { character, api: {} as Api, onChange: () => undefined, onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }));
    expect(document.querySelector('.panel.forge')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    expect(document.querySelector('.panel.forge')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
