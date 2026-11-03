import { describe, it, expect } from 'vitest';
import { emptyStones, newWeapon, WEAPON_TYPES, DEFAULT_APPEARANCE, type CharacterDetail } from '@rpg/shared';
import { enchantLabel, forgeRows } from '../src/game/forgeView';

const character = (gold: number, materials = 0): CharacterDetail => ({
  id: 1,
  name: 'Arthur',
  appearance: DEFAULT_APPEARANCE,
  bestWave: 0,
  gold,
  materials,
  stones: emptyStones(),
  weapons: WEAPON_TYPES.map((t) => newWeapon(t)),
});

describe('forgeRows', () => {
  it('calcule coût, accessibilité et slots par arme', () => {
    const c = character(60);
    c.weapons[1] = { ...c.weapons[1], level: 4 };
    c.weapons[2] = { ...c.weapons[2], level: 10 };
    c.weapons[3] = { ...c.weapons[3], level: 7 };
    const rows = forgeRows(c);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ type: 'sword', label: 'Épée', level: 1, maxed: false, cost: { gold: 50, materials: 0 }, affordable: true, slotCount: 1 });
    expect(rows[1]).toMatchObject({ level: 4, cost: { gold: 205, materials: 5 }, affordable: false });
    expect(rows[2]).toMatchObject({ maxed: true, cost: null, affordable: false, slotCount: 2 });
    expect(rows[3].slotCount).toBe(2);
  });
});

describe('enchantLabel', () => {
  it('affiche élément et rang en chiffres romains', () => {
    expect(enchantLabel(null)).toBe('Vide');
    expect(enchantLabel({ element: 'fire', rank: 1 })).toBe('Feu I');
    expect(enchantLabel({ element: 'lightning', rank: 3 })).toBe('Électricité III');
  });
});
