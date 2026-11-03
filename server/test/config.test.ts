import { describe, it, expect } from 'vitest';
import { resolveJwtSecret } from '../src/config';

const strong = 'x'.repeat(32);

describe('resolveJwtSecret', () => {
  it('utilise JWT_SECRET quand il est assez long', () => {
    expect(resolveJwtSecret({ JWT_SECRET: strong })).toBe(strong);
  });

  it('refuse un JWT_SECRET de moins de 32 caractères', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'court', NODE_ENV: 'development' })).toThrow(/32/);
  });

  it('ne fournit un secret de dev que si NODE_ENV vaut development ou test', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' }).length).toBeGreaterThanOrEqual(32);
    expect(resolveJwtSecret({ NODE_ENV: 'test' }).length).toBeGreaterThanOrEqual(32);
    expect(() => resolveJwtSecret({})).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret({ NODE_ENV: 'staging' })).toThrow(/JWT_SECRET/);
  });
});
