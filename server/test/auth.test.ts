import { describe, it, expect } from 'vitest';
import { createTokenService } from '../src/auth';
import { auth, makeApp, registerUser } from './helpers';

describe('inscription', () => {
  it('crée un compte et renvoie un jeton utilisable', async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'Kaan', password: 'motdepasse123' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().username).toBe('Kaan');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(res.json().token) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'Kaan' });
  });

  it('refuse un pseudo déjà pris, même avec une casse différente', async () => {
    const { app } = makeApp();
    await registerUser(app, 'Kaan');
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'kaan', password: 'motdepasse123' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'USERNAME_TAKEN', message: 'Ce pseudo est déjà pris' });
  });

  it('refuse des données invalides', async () => {
    const { app } = makeApp();
    for (const payload of [{ username: 'ka', password: 'motdepasse123' }, { username: 'kaan', password: 'court' }, {}]) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION');
    }
  });
});

describe('connexion', () => {
  it('accepte le bon mot de passe (pseudo insensible à la casse)', async () => {
    const { app } = makeApp();
    await registerUser(app, 'Kaan', 'motdepasse123');
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'KAAN', password: 'motdepasse123' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe('Kaan');
    expect(typeof res.json().token).toBe('string');
  });

  it('refuse un mauvais mot de passe ou un pseudo inconnu avec le même message', async () => {
    const { app } = makeApp();
    await registerUser(app, 'Kaan', 'motdepasse123');
    for (const payload of [{ username: 'Kaan', password: 'mauvais123' }, { username: 'inconnu', password: 'motdepasse123' }, { username: 'Kaan' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('INVALID_CREDENTIALS');
    }
  });
});

describe('jetons', () => {
  it('répond 401 (jamais 500) aux jetons invalides', async () => {
    const { app } = makeApp();
    const foreign = await createTokenService('autre-secret-0123456789-0123456789-xyz').sign(1);
    const unknownAccount = await makeApp().tokens.sign(999);
    const headers = [{}, { authorization: 'Bearer nimportequoi' }, { authorization: 'Basic abc' }, auth(foreign), auth(unknownAccount)];
    for (const h of headers) {
      const res = await app.inject({ method: 'GET', url: '/api/me', headers: h });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('UNAUTHORIZED');
    }
  });
});
