import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export interface TokenService {
  sign(accountId: number): Promise<string>;
  /** Retourne l'id du compte, ou `null` si le jeton est invalide ou expiré. */
  verify(token: string): Promise<number | null>;
}

const TOKEN_TTL = '7d';

export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (accountId) =>
      new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(String(accountId)).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(key),
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        const id = Number(payload.sub);
        return Number.isInteger(id) && id > 0 ? id : null;
      } catch {
        return null;
      }
    },
  };
}
