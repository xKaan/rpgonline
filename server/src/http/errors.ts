import type { FastifyReply } from 'fastify';
import type { ForgeError } from '@rpg/shared';

const MESSAGES = {
  VALIDATION: 'Données invalides',
  USERNAME_TAKEN: 'Ce pseudo est déjà pris',
  INVALID_CREDENTIALS: 'Pseudo ou mot de passe incorrect',
  UNAUTHORIZED: 'Session invalide ou expirée',
  NOT_FOUND: 'Introuvable',
  CHARACTER_LIMIT: 'Nombre maximum de personnages atteint (5)',
  NAME_TAKEN: 'Tu as déjà un personnage avec ce nom',
  MAX_LEVEL: 'Arme déjà au niveau maximum',
  NOT_ENOUGH_GOLD: "Pas assez d'or",
  NOT_ENOUGH_MATERIALS: 'Pas assez de matériaux',
  SLOT_LOCKED: "Le 2e emplacement d'enchantement se débloque au niveau 7",
  DUPLICATE_ELEMENT: 'Cet enchantement est déjà sur l’arme',
  MAX_RANK: 'Enchantement déjà au rang maximum',
  NOT_ENOUGH_STONES: "Pas assez de pierres d'enchantement",
  FORGE_CLOSED: 'La forge est fermée pendant une vague',
  TOO_FAR: 'Approche-toi de la forge',
} satisfies Record<ForgeError, string> & Record<string, string>;

export type ErrorCode = keyof typeof MESSAGES;

export function errorMessage(code: ErrorCode): string {
  return MESSAGES[code];
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode): FastifyReply {
  return reply.code(status).send({ error: code, message: MESSAGES[code] });
}
