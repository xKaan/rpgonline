import { z } from 'zod';

export const MAX_CHARACTERS = 5;

/** Modèles de base (KayKit Adventurers), branchés au Plan 3. */
export const BASE_MODELS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded'] as const;
export const HAIR_STYLE_COUNT = 4;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const appearanceSchema = z
  .object({
    base: z.enum(BASE_MODELS),
    skinColor: hexColor,
    hairStyle: z.number().int().min(0).max(HAIR_STYLE_COUNT - 1),
    hairColor: hexColor,
    outfitColor: hexColor,
  })
  .strict();

export type Appearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = {
  base: 'knight',
  skinColor: '#e0ac69',
  hairStyle: 0,
  hairColor: '#4a2c17',
  outfitColor: '#3b5ba5',
};

export const characterNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[\p{L}\p{N}_\- ]+$/u);

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_]+$/);

export const passwordSchema = z.string().min(8).max(128);
