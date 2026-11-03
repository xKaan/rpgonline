import { describe, it, expect } from 'vitest';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import { classifyPart, isPartVisible } from '../src/three/parts';

describe('classifyPart', () => {
  it('reconnaît les pièces des persos KayKit', () => {
    expect(classifyPart('Knight_Head')).toBe('skin');
    expect(classifyPart('Rogue_Head_Hooded')).toBe('skin');
    expect(classifyPart('Knight_Body')).toBe('outfit');
    expect(classifyPart('Mage_ArmLeft')).toBe('outfit');
    expect(classifyPart('Barbarian_LegRight')).toBe('outfit');
    expect(classifyPart('Knight_Helmet')).toBe('headgear');
    expect(classifyPart('Mage_Hat')).toBe('headgear');
    expect(classifyPart('Rogue_Cape')).toBe('cape');
    expect(classifyPart('1H_Sword')).toBe('prop');
    expect(classifyPart('Badge_Shield')).toBe('prop');
    expect(classifyPart('Mug')).toBe('prop');
  });
});

describe('isPartVisible', () => {
  it('cache les accessoires et suit les options chapeau/cape', () => {
    const a = { ...DEFAULT_APPEARANCE, headgear: false, cape: true };
    expect(isPartVisible('skin', a)).toBe(true);
    expect(isPartVisible('outfit', a)).toBe(true);
    expect(isPartVisible('headgear', a)).toBe(false);
    expect(isPartVisible('cape', a)).toBe(true);
    expect(isPartVisible('prop', a)).toBe(false);
  });
});
