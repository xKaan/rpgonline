const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = 'dev-secret-a-changer-en-production-0123456789';

/**
 * Secret de signature des jetons. Échoue fermé : sans JWT_SECRET, seul un
 * environnement explicitement `development` ou `test` reçoit le secret de dev.
 */
export function resolveJwtSecret(env: Record<string, string | undefined>): string {
  const secret = env.JWT_SECRET;
  if (secret !== undefined) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET doit faire au moins ${MIN_SECRET_LENGTH} caractères`);
    }
    return secret;
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return DEV_SECRET;
  throw new Error('JWT_SECRET est obligatoire (ou NODE_ENV=development pour le dev local)');
}
