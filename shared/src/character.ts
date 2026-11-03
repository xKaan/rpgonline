import { z } from 'zod';

export const MAX_CHARACTERS = 5;

/** Modèles de base (KayKit Adventurers). */
export const BASE_MODELS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded'] as const;
export type BaseModel = (typeof BASE_MODELS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const appearanceSchema = z
  .object({
    base: z.enum(BASE_MODELS),
    /** teinte multipliée sur la tenue et la cape ; #ffffff = couleurs d'origine */
    outfitColor: hexColor,
    headgear: z.boolean(),
    cape: z.boolean(),
  })
  .strict();

export type Appearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = {
  base: 'knight',
  outfitColor: '#ffffff',
  headgear: true,
  cape: true,
};

/** Valide une apparence venant de la BDD ; repli sur l'apparence par défaut si elle est invalide ou d'une ancienne version. */
export function parseAppearance(raw: unknown): Appearance {
  const parsed = appearanceSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_APPEARANCE };
}

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
