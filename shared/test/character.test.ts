import { describe, it, expect } from 'vitest';
import {
  appearanceSchema,
  characterNameSchema,
  DEFAULT_APPEARANCE,
  parseAppearance,
  passwordSchema,
  usernameSchema,
} from '../src/character';

describe('apparence', () => {
  it("accepte l'apparence par défaut", () => {
    expect(appearanceSchema.safeParse(DEFAULT_APPEARANCE).success).toBe(true);
  });

  it('refuse une couleur invalide, un modèle inconnu, un booléen mal typé ou un champ inconnu', () => {
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, outfitColor: 'rouge' }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, base: 'dragon' }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, headgear: 'oui' }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, admin: true }).success).toBe(false);
  });

  it("parseAppearance replie sur l'apparence par défaut pour une ancienne apparence", () => {
    const legacy = { base: 'mage', skinColor: '#e0ac69', hairStyle: 0, hairColor: '#4a2c17', outfitColor: '#3b5ba5' };
    expect(parseAppearance(legacy)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ ...DEFAULT_APPEARANCE, base: 'rogue' })).toEqual({ ...DEFAULT_APPEARANCE, base: 'rogue' });
  });
});

describe('nom de personnage', () => {
  it('nettoie les espaces et accepte les accents', () => {
    expect(characterNameSchema.parse('  Héloïse  ')).toBe('Héloïse');
    expect(characterNameSchema.safeParse('Sir Lance-2').success).toBe(true);
  });

  it('refuse trop court, trop long ou caractères spéciaux', () => {
    expect(characterNameSchema.safeParse(' a ').success).toBe(false);
    expect(characterNameSchema.safeParse('x'.repeat(17)).success).toBe(false);
    expect(characterNameSchema.safeParse('<script>').success).toBe(false);
    expect(characterNameSchema.safeParse('Roi 👑').success).toBe(false);
  });
});

describe('identifiants', () => {
  it('pseudo : 3-20 caractères alphanumériques ou _', () => {
    expect(usernameSchema.safeParse('kaan_32').success).toBe(true);
    expect(usernameSchema.safeParse('ka').success).toBe(false);
    expect(usernameSchema.safeParse('kaan topkaya').success).toBe(false);
  });

  it('mot de passe : 8 à 128 caractères', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});
