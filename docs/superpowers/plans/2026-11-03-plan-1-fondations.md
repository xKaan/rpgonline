# Plan 1 — Fondations (règles partagées + comptes + persos + forge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le monorepo TypeScript, les règles de jeu pures des armes/enchantements/persos dans `shared/`, et un serveur HTTP qui gère comptes, personnages et forge (amélioration + enchantement) avec persistance SQLite.

**Architecture:** Monorepo npm workspaces (`shared`, `server` ; `client` arrive au Plan 3). `shared/` contient des fonctions pures sans I/O, réutilisées plus tard par la room Colyseus et le client. `server/` expose une API Fastify ; la BDD est accédée via de petites fonctions de dépôt sur `node:sqlite` (synchrone, transactions explicites). Le serveur est la seule autorité sur l'or, les pierres et les niveaux d'armes.

**Tech Stack:** Node 24, TypeScript, npm workspaces, Vitest, Zod 4, Fastify 5, `node:sqlite`, `@node-rs/argon2`, `jose` (JWT HS256), `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-03-rpg-online-design.md`

## Découpage global (pour info)

| Plan | Contenu | Livrable |
|---|---|---|
| **1 — Fondations (ce plan)** | monorepo, règles armes/enchantements/persos, API comptes/persos/forge | API testée, utilisable au `curl` |
| 2 — Simulation de run | règles monstres/vagues/shiny/bonus dans `shared/`, room Colyseus autoritaire (vagues, IA, combat, loot, sauvegarde) | run jouable par un client de test headless |
| 3 — Client 3D | Vite + Three.js : connexion, sélection/éditeur de perso, scène, contrôles 3ᵉ pers., prédiction/interpolation, HUD, forge | jeu jouable dans le navigateur |
| 4 — Finitions & déploiement | perf (instancing, pooling), Postgres, build prod, hébergement | jeu en ligne |

## Global Constraints

- TypeScript strict partout ; ESM (`"type": "module"`) ; résolution `Bundler` ; imports sans extension.
- `shared/` ne fait **aucune** I/O (pas de `fs`, réseau, BDD, `Date.now`, `Math.random` direct) — l'aléatoire passe par un paramètre `rng`.
- Toutes les valeurs d'équilibrage sont des constantes exportées depuis `shared/src/*` (un fichier par domaine).
- Armes : `sword, shovel, axe, spear, mace, bow, crossbow` ; niveaux 1..10 ; dégâts `base × (1 + 0,12 × (niveau−1))` ; +10 % de vitesse d'attaque à chaque palier atteint (5 et 10).
- Coût pour passer du niveau `n` à `n+1` : `round(50 × 1,6^(n−1))` or ; matériaux : 5 pour atteindre le niveau 5, 20 pour atteindre le niveau 10, sinon 0.
- Enchantements : `fire, lightning, poison, ice` ; rangs 1..3 ; coût en pierres pour atteindre le rang I/II/III = 1/2/4 ; 1 slot, 2ᵉ slot à partir du niveau 7 ; même élément interdit sur les deux slots ; remplacer = l'ancien est détruit, le nouveau démarre au rang I.
- Max **5 personnages par compte** ; nom de perso unique par compte (insensible à la casse ASCII).
- Pseudo : 3–20 caractères `[A-Za-z0-9_]`, unique insensible à la casse. Mot de passe : 8–128 caractères, hashé argon2.
- Erreurs API : JSON `{ "error": CODE, "message": "<texte FR>" }`.
- Port par défaut du serveur : `2567` (celui de Colyseus, qui partagera le serveur HTTP au Plan 2).

## Review Focus

1. **Pseudo à casse différente** (« Kaan » puis « kaan ») → 409 `USERNAME_TAKEN`, pas un second compte. *(test : Task 5)*
2. **Accès au perso d'un autre compte** (GET/PATCH/DELETE/forge avec l'id d'un perso étranger) → 404, et le perso reste intact pour son propriétaire. *(tests : Task 6, Task 7)*
3. **Action de forge refusée** (pas assez d'or, slot verrouillé…) → aucune modification d'or, de pierres ni de niveau en BDD. *(test : Task 7)*
4. **Jeton invalide** (garbage, mauvaise signature, compte inexistant) → 401 propre, jamais 500. *(test : Task 5)*
5. **Nom de perso en double avec casse différente** sur le même compte → 409 `NAME_TAKEN` ; le même nom sur un autre compte → autorisé. *(test : Task 6)*

---

### Task 1: Monorepo + règles des armes

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Modify: `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`, `shared/src/weapons.ts`
- Test: `shared/test/weapons.test.ts`

**Interfaces:**
- Produces (depuis `@rpg/shared`) :
  - `WEAPON_TYPES: readonly ['sword','shovel','axe','spear','mace','bow','crossbow']`, `type WeaponType`
  - `MAX_WEAPON_LEVEL = 10`
  - `type HitShape`, `interface WeaponSpecial`, `interface WeaponStats`, `WEAPONS: Record<WeaponType, WeaponStats>`
  - `weaponDamage(type: WeaponType, level: number): number`
  - `weaponAttacksPerSec(type: WeaponType, level: number): number`
  - `interface UpgradeCost { gold: number; materials: number }`, `upgradeCost(currentLevel: number): UpgradeCost | null`
  - `isWeaponType(v: string): v is WeaponType`

- [ ] **Step 1: Créer le monorepo**

`package.json` (racine) :
```json
{
  "name": "rpgonline",
  "private": true,
  "type": "module",
  "workspaces": ["shared"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`shared/package.json` :
```json
{
  "name": "@rpg/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  }
}
```

`shared/tsconfig.json` :
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

Ajouter à `.gitignore` la ligne `data/`.

Installer :
```bash
npm i -D typescript vitest @types/node
npm i zod -w shared
```

- [ ] **Step 2: Écrire le test qui échoue**

`shared/test/weapons.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import {
  WEAPON_TYPES,
  WEAPONS,
  MAX_WEAPON_LEVEL,
  weaponDamage,
  weaponAttacksPerSec,
  upgradeCost,
  isWeaponType,
} from '../src/weapons';

describe('armes', () => {
  it('définit les 7 armes avec des stats positives', () => {
    expect(WEAPON_TYPES).toHaveLength(7);
    for (const t of WEAPON_TYPES) {
      expect(WEAPONS[t].damage).toBeGreaterThan(0);
      expect(WEAPONS[t].attacksPerSec).toBeGreaterThan(0);
      expect(WEAPONS[t].range).toBeGreaterThan(0);
    }
    expect(MAX_WEAPON_LEVEL).toBe(10);
  });

  it('dégâts : +12 % des dégâts de base par niveau', () => {
    expect(weaponDamage('sword', 1)).toBe(12);
    expect(weaponDamage('sword', 2)).toBeCloseTo(13.44);
    expect(weaponDamage('sword', 10)).toBeCloseTo(24.96);
    expect(weaponDamage('crossbow', 5)).toBeCloseTo(38.48);
  });

  it('vitesse : +10 % aux paliers 5 et 10', () => {
    expect(weaponAttacksPerSec('sword', 4)).toBeCloseTo(1.6);
    expect(weaponAttacksPerSec('sword', 5)).toBeCloseTo(1.76);
    expect(weaponAttacksPerSec('sword', 9)).toBeCloseTo(1.76);
    expect(weaponAttacksPerSec('sword', 10)).toBeCloseTo(1.92);
  });

  it("coût d'amélioration en or et matériaux", () => {
    expect(upgradeCost(1)).toEqual({ gold: 50, materials: 0 });
    expect(upgradeCost(2)).toEqual({ gold: 80, materials: 0 });
    expect(upgradeCost(4)).toEqual({ gold: 205, materials: 5 });
    expect(upgradeCost(9)).toEqual({ gold: 2147, materials: 20 });
    expect(upgradeCost(10)).toBeNull();
  });

  it('refuse les niveaux invalides', () => {
    expect(() => weaponDamage('axe', 0)).toThrow(RangeError);
    expect(() => weaponDamage('axe', 11)).toThrow(RangeError);
    expect(() => upgradeCost(2.5)).toThrow(RangeError);
  });

  it('isWeaponType', () => {
    expect(isWeaponType('mace')).toBe(true);
    expect(isWeaponType('katana')).toBe(false);
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w shared`
Expected: FAIL — `Failed to resolve import "../src/weapons"`

- [ ] **Step 4: Implémenter**

`shared/src/weapons.ts` :
```ts
export const WEAPON_TYPES = ['sword', 'shovel', 'axe', 'spear', 'mace', 'bow', 'crossbow'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

export const MAX_WEAPON_LEVEL = 10;

export type HitShape =
  | { kind: 'cone'; angleDeg: number }
  | { kind: 'line'; width: number }
  | { kind: 'circle'; radius: number }
  | { kind: 'projectile'; pierce: number };

export interface WeaponSpecial {
  /** distance de recul infligée (m) */
  knockback?: number;
  /** multiplicateur de dégâts contre les boss */
  bossDamageMult?: number;
  /** durée d'étourdissement (s) */
  stunSec?: number;
  /** multiplicateur de dégâts du tir chargé */
  chargeMult?: number;
}

export interface WeaponStats {
  label: string;
  damage: number;
  attacksPerSec: number;
  range: number;
  shape: HitShape;
  special: WeaponSpecial;
}

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  sword: { label: 'Épée', damage: 12, attacksPerSec: 1.6, range: 2.2, shape: { kind: 'cone', angleDeg: 90 }, special: {} },
  shovel: { label: 'Pelle', damage: 9, attacksPerSec: 1.3, range: 2.4, shape: { kind: 'cone', angleDeg: 120 }, special: { knockback: 4 } },
  axe: { label: 'Hache', damage: 20, attacksPerSec: 0.9, range: 2.0, shape: { kind: 'cone', angleDeg: 70 }, special: { bossDamageMult: 1.25 } },
  spear: { label: 'Lance', damage: 14, attacksPerSec: 1.2, range: 3.5, shape: { kind: 'line', width: 0.8 }, special: {} },
  mace: { label: 'Masse à pointes', damage: 24, attacksPerSec: 0.7, range: 2.0, shape: { kind: 'circle', radius: 2 }, special: { stunSec: 0.5 } },
  bow: { label: 'Arc', damage: 10, attacksPerSec: 1.5, range: 25, shape: { kind: 'projectile', pierce: 0 }, special: { chargeMult: 2 } },
  crossbow: { label: 'Arbalète', damage: 26, attacksPerSec: 0.6, range: 30, shape: { kind: 'projectile', pierce: 2 }, special: {} },
};

const DAMAGE_PER_LEVEL = 0.12;
const SPEED_PER_MILESTONE = 0.1;
const SPEED_MILESTONES = [5, 10];

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > MAX_WEAPON_LEVEL) {
    throw new RangeError(`Niveau d'arme invalide : ${level}`);
  }
}

export function weaponDamage(type: WeaponType, level: number): number {
  assertLevel(level);
  return WEAPONS[type].damage * (1 + DAMAGE_PER_LEVEL * (level - 1));
}

export function weaponAttacksPerSec(type: WeaponType, level: number): number {
  assertLevel(level);
  const reached = SPEED_MILESTONES.filter((m) => level >= m).length;
  return WEAPONS[type].attacksPerSec * (1 + SPEED_PER_MILESTONE * reached);
}

export interface UpgradeCost {
  gold: number;
  materials: number;
}

/** Coût pour passer de `currentLevel` à `currentLevel + 1`, ou `null` au niveau max. */
export function upgradeCost(currentLevel: number): UpgradeCost | null {
  assertLevel(currentLevel);
  if (currentLevel === MAX_WEAPON_LEVEL) return null;
  const next = currentLevel + 1;
  return {
    gold: Math.round(50 * 1.6 ** (currentLevel - 1)),
    materials: next === 5 ? 5 : next === 10 ? 20 : 0,
  };
}

export function isWeaponType(v: string): v is WeaponType {
  return (WEAPON_TYPES as readonly string[]).includes(v);
}
```

`shared/src/index.ts` :
```ts
export * from './weapons';
```

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: 6 tests PASS, typecheck sans erreur.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore shared
git commit -m "feat(shared): monorepo et règles des armes"
```

---

### Task 2: Enchantements et forge (règles pures)

**Files:**
- Create: `shared/src/enchantments.ts`, `shared/src/forge.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/forge.test.ts`

**Interfaces:**
- Consumes: `WeaponType`, `upgradeCost` (Task 1)
- Produces :
  - `ELEMENTS: readonly ['fire','lightning','poison','ice']`, `type Element`, `type EnchantRank = 1 | 2 | 3`, `MAX_ENCHANT_RANK = 3`
  - `interface Enchant { element: Element; rank: EnchantRank }`
  - `ENCHANT_EFFECTS` (paramètres par élément, utilisés au Plan 2)
  - `stonesToReachRank(rank: EnchantRank): number`, `enchantSlotCount(level: number): 1 | 2`, `isElement(v: string): v is Element`
  - `interface WeaponState { type: WeaponType; level: number; enchants: [Enchant | null, Enchant | null] }`
  - `interface Wallet { gold: number; materials: number; stones: Record<Element, number> }`
  - `type ForgeError = 'MAX_LEVEL' | 'NOT_ENOUGH_GOLD' | 'NOT_ENOUGH_MATERIALS' | 'SLOT_LOCKED' | 'DUPLICATE_ELEMENT' | 'MAX_RANK' | 'NOT_ENOUGH_STONES'`
  - `type ForgeResult = { ok: true; weapon: WeaponState; wallet: Wallet } | { ok: false; error: ForgeError }`
  - `newWeapon(type: WeaponType): WeaponState`, `emptyStones(): Record<Element, number>`
  - `upgradeWeapon(weapon: WeaponState, wallet: Wallet): ForgeResult`
  - `enchantWeapon(weapon: WeaponState, wallet: Wallet, slot: 0 | 1, element: Element): ForgeResult`

- [ ] **Step 1: Écrire le test qui échoue**

`shared/test/forge.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { emptyStones, enchantWeapon, newWeapon, upgradeWeapon, type Wallet, type WeaponState } from '../src/forge';
import { enchantSlotCount, stonesToReachRank, type Element } from '../src/enchantments';

const wallet = (gold = 0, materials = 0, stones: Partial<Record<Element, number>> = {}): Wallet => ({
  gold,
  materials,
  stones: { ...emptyStones(), ...stones },
});

const weaponAt = (level: number, enchants: WeaponState['enchants'] = [null, null]): WeaponState => ({
  type: 'sword',
  level,
  enchants,
});

describe('règles des enchantements', () => {
  it('coûts en pierres et slots', () => {
    expect([stonesToReachRank(1), stonesToReachRank(2), stonesToReachRank(3)]).toEqual([1, 2, 4]);
    expect(enchantSlotCount(6)).toBe(1);
    expect(enchantSlotCount(7)).toBe(2);
  });
});

describe('upgradeWeapon', () => {
  it("monte d'un niveau et débite l'or", () => {
    expect(upgradeWeapon(newWeapon('sword'), wallet(60))).toEqual({
      ok: true,
      weapon: weaponAt(2),
      wallet: wallet(10),
    });
  });

  it("refuse sans assez d'or", () => {
    expect(upgradeWeapon(newWeapon('sword'), wallet(49))).toEqual({ ok: false, error: 'NOT_ENOUGH_GOLD' });
  });

  it('exige des matériaux pour atteindre le niveau 5', () => {
    expect(upgradeWeapon(weaponAt(4), wallet(1000, 4))).toEqual({ ok: false, error: 'NOT_ENOUGH_MATERIALS' });
    const r = upgradeWeapon(weaponAt(4), wallet(1000, 5));
    expect(r).toEqual({ ok: true, weapon: weaponAt(5), wallet: wallet(795, 0) });
  });

  it('refuse au niveau max', () => {
    expect(upgradeWeapon(weaponAt(10), wallet(1e9, 1e9))).toEqual({ ok: false, error: 'MAX_LEVEL' });
  });

  it('ne modifie pas les objets reçus', () => {
    const w = newWeapon('sword');
    const wl = wallet(100);
    upgradeWeapon(w, wl);
    expect(w.level).toBe(1);
    expect(wl.gold).toBe(100);
  });
});

describe('enchantWeapon', () => {
  it('pose un enchantement rang I pour 1 pierre', () => {
    expect(enchantWeapon(weaponAt(1), wallet(0, 0, { fire: 3 }), 0, 'fire')).toEqual({
      ok: true,
      weapon: weaponAt(1, [{ element: 'fire', rank: 1 }, null]),
      wallet: wallet(0, 0, { fire: 2 }),
    });
  });

  it('monte au rang II (+2) puis III (+4) puis refuse', () => {
    let w = weaponAt(1, [{ element: 'ice', rank: 1 }, null]);
    let r = enchantWeapon(w, wallet(0, 0, { ice: 6 }), 0, 'ice');
    expect(r.ok && r.weapon.enchants[0]).toEqual({ element: 'ice', rank: 2 });
    expect(r.ok && r.wallet.stones.ice).toBe(4);
    if (!r.ok) throw new Error('attendu ok');
    w = r.weapon;
    r = enchantWeapon(w, r.wallet, 0, 'ice');
    expect(r.ok && r.weapon.enchants[0]).toEqual({ element: 'ice', rank: 3 });
    expect(r.ok && r.wallet.stones.ice).toBe(0);
    if (!r.ok) throw new Error('attendu ok');
    expect(enchantWeapon(r.weapon, wallet(0, 0, { ice: 99 }), 0, 'ice')).toEqual({ ok: false, error: 'MAX_RANK' });
  });

  it("remplacer par un autre élément détruit l'ancien et repart au rang I", () => {
    const r = enchantWeapon(weaponAt(1, [{ element: 'fire', rank: 3 }, null]), wallet(0, 0, { poison: 1 }), 0, 'poison');
    expect(r).toEqual({
      ok: true,
      weapon: weaponAt(1, [{ element: 'poison', rank: 1 }, null]),
      wallet: wallet(0, 0, { poison: 0 }),
    });
  });

  it('le 2e slot est verrouillé avant le niveau 7', () => {
    expect(enchantWeapon(weaponAt(6), wallet(0, 0, { fire: 5 }), 1, 'fire')).toEqual({ ok: false, error: 'SLOT_LOCKED' });
    expect(enchantWeapon(weaponAt(7), wallet(0, 0, { fire: 5 }), 1, 'fire').ok).toBe(true);
  });

  it('interdit le même élément sur les deux slots', () => {
    const w = weaponAt(7, [{ element: 'lightning', rank: 1 }, null]);
    expect(enchantWeapon(w, wallet(0, 0, { lightning: 5 }), 1, 'lightning')).toEqual({ ok: false, error: 'DUPLICATE_ELEMENT' });
  });

  it('refuse sans assez de pierres', () => {
    expect(enchantWeapon(weaponAt(1), wallet(), 0, 'fire')).toEqual({ ok: false, error: 'NOT_ENOUGH_STONES' });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w shared`
Expected: FAIL — `Failed to resolve import "../src/forge"`

- [ ] **Step 3: Implémenter**

`shared/src/enchantments.ts` :
```ts
export const ELEMENTS = ['fire', 'lightning', 'poison', 'ice'] as const;
export type Element = (typeof ELEMENTS)[number];

export type EnchantRank = 1 | 2 | 3;
export const MAX_ENCHANT_RANK = 3;

export interface Enchant {
  element: Element;
  rank: EnchantRank;
}

/** Paramètres des effets ; les tableaux sont indexés par `rank - 1`. */
export const ENCHANT_EFFECTS = {
  fire: { label: 'Feu', burnSec: 3, dpsRatioByRank: [0.15, 0.25, 0.35] },
  lightning: { label: 'Électricité', chainsByRank: [1, 2, 3], chainRadius: 5, chainDamageRatio: 0.5 },
  poison: { label: 'Poison', maxStacksByRank: [3, 5, 7], dpsPerStack: 2, durationSec: 5 },
  ice: { label: 'Glace', slowByRank: [0.2, 0.3, 0.4], slowSec: 2, freezeChanceByRank: [0, 0, 0.1], freezeSec: 1 },
} as const;

const STONES_TO_REACH_RANK = [1, 2, 4] as const;

export function stonesToReachRank(rank: EnchantRank): number {
  return STONES_TO_REACH_RANK[rank - 1];
}

const SECOND_SLOT_LEVEL = 7;

export function enchantSlotCount(level: number): 1 | 2 {
  return level >= SECOND_SLOT_LEVEL ? 2 : 1;
}

export function isElement(v: string): v is Element {
  return (ELEMENTS as readonly string[]).includes(v);
}
```

`shared/src/forge.ts` :
```ts
import { enchantSlotCount, MAX_ENCHANT_RANK, stonesToReachRank, type Element, type Enchant, type EnchantRank } from './enchantments';
import { upgradeCost, type WeaponType } from './weapons';

export interface WeaponState {
  type: WeaponType;
  level: number;
  enchants: [Enchant | null, Enchant | null];
}

export interface Wallet {
  gold: number;
  materials: number;
  stones: Record<Element, number>;
}

export type ForgeError =
  | 'MAX_LEVEL'
  | 'NOT_ENOUGH_GOLD'
  | 'NOT_ENOUGH_MATERIALS'
  | 'SLOT_LOCKED'
  | 'DUPLICATE_ELEMENT'
  | 'MAX_RANK'
  | 'NOT_ENOUGH_STONES';

export type ForgeResult = { ok: true; weapon: WeaponState; wallet: Wallet } | { ok: false; error: ForgeError };

export function newWeapon(type: WeaponType): WeaponState {
  return { type, level: 1, enchants: [null, null] };
}

export function emptyStones(): Record<Element, number> {
  return { fire: 0, lightning: 0, poison: 0, ice: 0 };
}

const fail = (error: ForgeError): ForgeResult => ({ ok: false, error });

export function upgradeWeapon(weapon: WeaponState, wallet: Wallet): ForgeResult {
  const cost = upgradeCost(weapon.level);
  if (!cost) return fail('MAX_LEVEL');
  if (wallet.gold < cost.gold) return fail('NOT_ENOUGH_GOLD');
  if (wallet.materials < cost.materials) return fail('NOT_ENOUGH_MATERIALS');
  return {
    ok: true,
    weapon: { ...weapon, level: weapon.level + 1, enchants: [...weapon.enchants] },
    wallet: {
      gold: wallet.gold - cost.gold,
      materials: wallet.materials - cost.materials,
      stones: { ...wallet.stones },
    },
  };
}

export function enchantWeapon(weapon: WeaponState, wallet: Wallet, slot: 0 | 1, element: Element): ForgeResult {
  if (slot >= enchantSlotCount(weapon.level)) return fail('SLOT_LOCKED');
  const other = weapon.enchants[slot === 0 ? 1 : 0];
  if (other?.element === element) return fail('DUPLICATE_ELEMENT');

  const current = weapon.enchants[slot];
  const nextRank = current?.element === element ? current.rank + 1 : 1;
  if (nextRank > MAX_ENCHANT_RANK) return fail('MAX_RANK');

  const cost = stonesToReachRank(nextRank as EnchantRank);
  if (wallet.stones[element] < cost) return fail('NOT_ENOUGH_STONES');

  const enchants: WeaponState['enchants'] = [...weapon.enchants];
  enchants[slot] = { element, rank: nextRank as EnchantRank };
  return {
    ok: true,
    weapon: { ...weapon, enchants },
    wallet: { ...wallet, stones: { ...wallet.stones, [element]: wallet.stones[element] - cost } },
  };
}
```

`shared/src/index.ts` :
```ts
export * from './weapons';
export * from './enchantments';
export * from './forge';
```

- [ ] **Step 4: Lancer les tests et le typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: tous les tests PASS (weapons + forge), typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): enchantements et règles de forge"
```

---

### Task 3: Règles des comptes et personnages (schémas)

**Files:**
- Create: `shared/src/character.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/character.test.ts`

**Interfaces:**
- Produces :
  - `MAX_CHARACTERS = 5`, `BASE_MODELS: readonly ['knight','barbarian','mage','rogue','rogue_hooded']`, `HAIR_STYLE_COUNT = 4`
  - `appearanceSchema` (Zod, strict), `type Appearance = { base; skinColor; hairStyle; hairColor; outfitColor }`
  - `DEFAULT_APPEARANCE: Appearance`
  - `characterNameSchema`, `usernameSchema`, `passwordSchema` (Zod)

- [ ] **Step 1: Écrire le test qui échoue**

`shared/test/character.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import {
  appearanceSchema,
  characterNameSchema,
  DEFAULT_APPEARANCE,
  passwordSchema,
  usernameSchema,
} from '../src/character';

describe('apparence', () => {
  it("accepte l'apparence par défaut", () => {
    expect(appearanceSchema.safeParse(DEFAULT_APPEARANCE).success).toBe(true);
  });

  it('refuse une couleur invalide, une coiffure hors bornes ou un champ inconnu', () => {
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, skinColor: 'rouge' }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, hairStyle: 4 }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, base: 'dragon' }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, admin: true }).success).toBe(false);
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
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w shared`
Expected: FAIL — `Failed to resolve import "../src/character"`

- [ ] **Step 3: Implémenter**

`shared/src/character.ts` :
```ts
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
```

`shared/src/index.ts` :
```ts
export * from './weapons';
export * from './enchantments';
export * from './forge';
export * from './character';
```

- [ ] **Step 4: Lancer les tests et le typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: tous les tests PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): schémas de compte et de personnage"
```

---

### Task 4: Serveur — base de données et dépôts

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`
- Modify: `package.json` (racine : `"workspaces": ["shared", "server"]`)
- Create: `server/src/db.ts`, `server/src/repo/accounts.ts`, `server/src/repo/characters.ts`
- Test: `server/test/repo.test.ts`

**Interfaces:**
- Consumes: `WEAPON_TYPES`, `ELEMENTS`, `newWeapon`, `emptyStones`, `MAX_CHARACTERS`, types `Appearance`, `WeaponState`, `Wallet`, `Element`, `EnchantRank` (Tasks 1–3)
- Produces :
  - `type Db = DatabaseSync`, `openDb(path: string): Db`, `tx<T>(db: Db, fn: () => T): T`
  - `getRow<T>(db, sql, ...params): T | undefined`, `allRows<T>(db, sql, ...params): T[]`
  - `interface AccountRow { id: number; username: string; password_hash: string }`
  - `createAccount(db, username: string, passwordHash: string): number | null` (`null` = pseudo pris)
  - `findAccountByUsername(db, username: string): AccountRow | undefined` (insensible à la casse)
  - `findAccountById(db, id: number): AccountRow | undefined`
  - `interface CharacterSummary { id: number; name: string; appearance: Appearance; bestWave: number }`
  - `interface CharacterDetail extends CharacterSummary { gold: number; materials: number; stones: Record<Element, number>; weapons: WeaponState[] }`
  - `listCharacters(db, accountId): CharacterSummary[]`
  - `createCharacter(db, accountId, name, appearance): CharacterDetail | 'LIMIT' | 'NAME_TAKEN'`
  - `getCharacter(db, accountId, characterId): CharacterDetail | undefined` (filtré par compte)
  - `updateAppearance(db, accountId, characterId, appearance): boolean`
  - `deleteCharacter(db, accountId, characterId): boolean`
  - `saveWeaponAndWallet(db, characterId, weapon: WeaponState, wallet: Wallet): void`

- [ ] **Step 1: Créer le paquet serveur**

`server/package.json` :
```json
{
  "name": "@rpg/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  },
  "dependencies": {
    "@rpg/shared": "*"
  }
}
```

`server/tsconfig.json` :
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

Dans le `package.json` racine, passer `"workspaces"` à `["shared", "server"]`, puis installer :
```bash
npm i fastify jose @node-rs/argon2 zod -w server
npm i -D tsx -w server
```

- [ ] **Step 2: Écrire le test qui échoue**

`server/test/repo.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import { openDb, type Db } from '../src/db';
import { createAccount, findAccountById, findAccountByUsername } from '../src/repo/accounts';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  saveWeaponAndWallet,
  updateAppearance,
  type CharacterDetail,
} from '../src/repo/characters';

let db: Db;
let accountId: number;

beforeEach(() => {
  db = openDb(':memory:');
  accountId = createAccount(db, 'Kaan', 'hash')!;
});

const create = (name: string, account = accountId) => createCharacter(db, account, name, DEFAULT_APPEARANCE) as CharacterDetail;

describe('comptes', () => {
  it('crée et retrouve un compte sans tenir compte de la casse', () => {
    expect(findAccountByUsername(db, 'kaan')).toMatchObject({ id: accountId, username: 'Kaan' });
    expect(findAccountById(db, accountId)?.username).toBe('Kaan');
    expect(createAccount(db, 'KAAN', 'hash')).toBeNull();
  });
});

describe('personnages', () => {
  it('crée un perso avec 7 armes niveau 1, 0 or et 0 pierre', () => {
    const c = create('Arthur');
    expect(c).toMatchObject({ name: 'Arthur', gold: 0, materials: 0, bestWave: 0, appearance: DEFAULT_APPEARANCE });
    expect(c.weapons.map((w) => w.type)).toEqual(['sword', 'shovel', 'axe', 'spear', 'mace', 'bow', 'crossbow']);
    expect(c.weapons.every((w) => w.level === 1 && w.enchants[0] === null && w.enchants[1] === null)).toBe(true);
    expect(c.stones).toEqual({ fire: 0, lightning: 0, poison: 0, ice: 0 });
  });

  it('limite à 5 persos et refuse un nom en double (casse ignorée)', () => {
    for (const n of ['A1', 'A2', 'A3', 'A4']) create(n);
    expect(createCharacter(db, accountId, 'a1', DEFAULT_APPEARANCE)).toBe('NAME_TAKEN');
    create('A5');
    expect(createCharacter(db, accountId, 'A6', DEFAULT_APPEARANCE)).toBe('LIMIT');
    expect(listCharacters(db, accountId)).toHaveLength(5);
  });

  it("isole les persos par compte", () => {
    const other = createAccount(db, 'autre', 'hash')!;
    const c = create('Arthur');
    expect(getCharacter(db, other, c.id)).toBeUndefined();
    expect(updateAppearance(db, other, c.id, { ...DEFAULT_APPEARANCE, base: 'mage' })).toBe(false);
    expect(deleteCharacter(db, other, c.id)).toBe(false);
    expect(getCharacter(db, accountId, c.id)?.appearance.base).toBe('knight');
  });

  it("met à jour l'apparence et supprime", () => {
    const c = create('Arthur');
    expect(updateAppearance(db, accountId, c.id, { ...DEFAULT_APPEARANCE, base: 'mage' })).toBe(true);
    expect(getCharacter(db, accountId, c.id)?.appearance.base).toBe('mage');
    expect(deleteCharacter(db, accountId, c.id)).toBe(true);
    expect(getCharacter(db, accountId, c.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM character_weapons').get()).toEqual({ n: 0 });
  });

  it('sauvegarde une arme et le porte-monnaie', () => {
    const c = create('Arthur');
    saveWeaponAndWallet(
      db,
      c.id,
      { type: 'axe', level: 7, enchants: [{ element: 'fire', rank: 2 }, { element: 'ice', rank: 1 }] },
      { gold: 12, materials: 3, stones: { fire: 1, lightning: 2, poison: 3, ice: 4 } },
    );
    const after = getCharacter(db, accountId, c.id)!;
    expect(after.gold).toBe(12);
    expect(after.materials).toBe(3);
    expect(after.stones).toEqual({ fire: 1, lightning: 2, poison: 3, ice: 4 });
    expect(after.weapons.find((w) => w.type === 'axe')).toEqual({
      type: 'axe',
      level: 7,
      enchants: [{ element: 'fire', rank: 2 }, { element: 'ice', rank: 1 }],
    });
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w server`
Expected: FAIL — `Failed to resolve import "../src/db"`

- [ ] **Step 4: Implémenter `db.ts`**

`server/src/db.ts` :
```ts
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  appearance TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  materials INTEGER NOT NULL DEFAULT 0,
  best_wave INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_account_name ON characters(account_id, name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS character_weapons (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  weapon_type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  enchant_1 TEXT,
  enchant_1_rank INTEGER,
  enchant_2 TEXT,
  enchant_2_rank INTEGER,
  PRIMARY KEY (character_id, weapon_type)
);
CREATE TABLE IF NOT EXISTS character_stones (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, element)
);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Exécute `fn` dans une transaction ; rollback si elle lève. `fn` doit être synchrone. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getRow<T>(db: Db, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function allRows<T>(db: Db, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}
```

- [ ] **Step 5: Implémenter les dépôts**

`server/src/repo/accounts.ts` :
```ts
import { getRow, type Db } from '../db';

export interface AccountRow {
  id: number;
  username: string;
  password_hash: string;
}

export function findAccountByUsername(db: Db, username: string): AccountRow | undefined {
  return getRow<AccountRow>(db, 'SELECT id, username, password_hash FROM accounts WHERE username = ?', username);
}

export function findAccountById(db: Db, id: number): AccountRow | undefined {
  return getRow<AccountRow>(db, 'SELECT id, username, password_hash FROM accounts WHERE id = ?', id);
}

/** Retourne l'id du compte créé, ou `null` si le pseudo est déjà pris (casse ignorée). */
export function createAccount(db: Db, username: string, passwordHash: string): number | null {
  if (findAccountByUsername(db, username)) return null;
  const res = db.prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  return Number(res.lastInsertRowid);
}
```

`server/src/repo/characters.ts` :
```ts
import {
  ELEMENTS,
  MAX_CHARACTERS,
  WEAPON_TYPES,
  emptyStones,
  type Appearance,
  type Element,
  type Enchant,
  type EnchantRank,
  type Wallet,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';
import { allRows, getRow, tx, type Db } from '../db';

export interface CharacterSummary {
  id: number;
  name: string;
  appearance: Appearance;
  bestWave: number;
}

export interface CharacterDetail extends CharacterSummary {
  gold: number;
  materials: number;
  stones: Record<Element, number>;
  weapons: WeaponState[];
}

interface CharacterRow {
  id: number;
  name: string;
  appearance: string;
  gold: number;
  materials: number;
  best_wave: number;
}

interface WeaponRow {
  weapon_type: WeaponType;
  level: number;
  enchant_1: Element | null;
  enchant_1_rank: number | null;
  enchant_2: Element | null;
  enchant_2_rank: number | null;
}

const toEnchant = (element: Element | null, rank: number | null): Enchant | null =>
  element && rank ? { element, rank: rank as EnchantRank } : null;

const toSummary = (r: CharacterRow): CharacterSummary => ({
  id: r.id,
  name: r.name,
  appearance: JSON.parse(r.appearance) as Appearance,
  bestWave: r.best_wave,
});

export function listCharacters(db: Db, accountId: number): CharacterSummary[] {
  return allRows<CharacterRow>(
    db,
    'SELECT id, name, appearance, gold, materials, best_wave FROM characters WHERE account_id = ? ORDER BY id',
    accountId,
  ).map(toSummary);
}

export function getCharacter(db: Db, accountId: number, characterId: number): CharacterDetail | undefined {
  const row = getRow<CharacterRow>(
    db,
    'SELECT id, name, appearance, gold, materials, best_wave FROM characters WHERE id = ? AND account_id = ?',
    characterId,
    accountId,
  );
  if (!row) return undefined;

  const weapons = allRows<WeaponRow>(
    db,
    'SELECT weapon_type, level, enchant_1, enchant_1_rank, enchant_2, enchant_2_rank FROM character_weapons WHERE character_id = ?',
    characterId,
  )
    .map(
      (w): WeaponState => ({
        type: w.weapon_type,
        level: w.level,
        enchants: [toEnchant(w.enchant_1, w.enchant_1_rank), toEnchant(w.enchant_2, w.enchant_2_rank)],
      }),
    )
    .sort((a, b) => WEAPON_TYPES.indexOf(a.type) - WEAPON_TYPES.indexOf(b.type));

  const stones = emptyStones();
  for (const s of allRows<{ element: Element; count: number }>(
    db,
    'SELECT element, count FROM character_stones WHERE character_id = ?',
    characterId,
  )) {
    stones[s.element] = s.count;
  }

  return { ...toSummary(row), gold: row.gold, materials: row.materials, stones, weapons };
}

export function createCharacter(
  db: Db,
  accountId: number,
  name: string,
  appearance: Appearance,
): CharacterDetail | 'LIMIT' | 'NAME_TAKEN' {
  const id = tx(db, (): number | 'LIMIT' | 'NAME_TAKEN' => {
    const { n } = getRow<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM characters WHERE account_id = ?', accountId)!;
    if (n >= MAX_CHARACTERS) return 'LIMIT';
    const taken = getRow(db, 'SELECT 1 FROM characters WHERE account_id = ? AND name = ? COLLATE NOCASE', accountId, name);
    if (taken) return 'NAME_TAKEN';

    const res = db
      .prepare('INSERT INTO characters (account_id, name, appearance) VALUES (?, ?, ?)')
      .run(accountId, name, JSON.stringify(appearance));
    const characterId = Number(res.lastInsertRowid);
    const insertWeapon = db.prepare('INSERT INTO character_weapons (character_id, weapon_type) VALUES (?, ?)');
    for (const type of WEAPON_TYPES) insertWeapon.run(characterId, type);
    const insertStone = db.prepare('INSERT INTO character_stones (character_id, element, count) VALUES (?, ?, 0)');
    for (const element of ELEMENTS) insertStone.run(characterId, element);
    return characterId;
  });
  return typeof id === 'number' ? getCharacter(db, accountId, id)! : id;
}

export function updateAppearance(db: Db, accountId: number, characterId: number, appearance: Appearance): boolean {
  const res = db
    .prepare('UPDATE characters SET appearance = ? WHERE id = ? AND account_id = ?')
    .run(JSON.stringify(appearance), characterId, accountId);
  return res.changes > 0;
}

export function deleteCharacter(db: Db, accountId: number, characterId: number): boolean {
  const res = db.prepare('DELETE FROM characters WHERE id = ? AND account_id = ?').run(characterId, accountId);
  return res.changes > 0;
}

/** À appeler dans une transaction ; ne vérifie pas le propriétaire (déjà fait par l'appelant). */
export function saveWeaponAndWallet(db: Db, characterId: number, weapon: WeaponState, wallet: Wallet): void {
  db.prepare('UPDATE characters SET gold = ?, materials = ? WHERE id = ?').run(wallet.gold, wallet.materials, characterId);
  const [e1, e2] = weapon.enchants;
  db.prepare(
    `UPDATE character_weapons
     SET level = ?, enchant_1 = ?, enchant_1_rank = ?, enchant_2 = ?, enchant_2_rank = ?
     WHERE character_id = ? AND weapon_type = ?`,
  ).run(weapon.level, e1?.element ?? null, e1?.rank ?? null, e2?.element ?? null, e2?.rank ?? null, characterId, weapon.type);
  const setStone = db.prepare('UPDATE character_stones SET count = ? WHERE character_id = ? AND element = ?');
  for (const element of ELEMENTS) setStone.run(wallet.stones[element], characterId, element);
}
```

- [ ] **Step 6: Lancer les tests et le typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: 6 tests PASS, typecheck sans erreur. (Un avertissement `ExperimentalWarning: SQLite` peut s'afficher : c'est normal.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server
git commit -m "feat(server): base SQLite et dépôts comptes/personnages"
```

---

### Task 5: API d'authentification + point d'entrée du serveur

**Files:**
- Create: `server/src/auth.ts`, `server/src/http/deps.ts`, `server/src/http/errors.ts`, `server/src/http/requireAuth.ts`, `server/src/http/authRoutes.ts`, `server/src/http/app.ts`, `server/src/index.ts`
- Test: `server/test/helpers.ts`, `server/test/auth.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createAccount`, `findAccountByUsername`, `findAccountById` (Task 4) ; `usernameSchema`, `passwordSchema` (Task 3)
- Produces :
  - `hashPassword(p: string): Promise<string>`, `verifyPassword(hash: string, p: string): Promise<boolean>`
  - `interface TokenService { sign(accountId: number): Promise<string>; verify(token: string): Promise<number | null> }`, `createTokenService(secret: string): TokenService`
  - `interface AppDeps { db: Db; tokens: TokenService }`
  - `type ErrorCode`, `sendError(reply, status: number, code: ErrorCode): FastifyReply`
  - `requireAuth(deps): preHandler` — remplit `req.accountId: number`
  - `buildApp(deps: AppDeps): FastifyInstance`
  - Routes : `POST /api/auth/register` → 201 `{ token, username }` | 400 `VALIDATION` | 409 `USERNAME_TAKEN` ; `POST /api/auth/login` → 200 `{ token, username }` | 401 `INVALID_CREDENTIALS` ; `GET /api/me` → 200 `{ id, username }` | 401 `UNAUTHORIZED`
  - Test helpers : `makeApp()`, `registerUser(app, username?, password?)`, `auth(token)`

- [ ] **Step 1: Écrire les helpers de test et le test qui échoue**

`server/test/helpers.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { openDb } from '../src/db';
import { createTokenService } from '../src/auth';
import { buildApp } from '../src/http/app';

export const TEST_SECRET = 'test-secret-0123456789-0123456789-abcd';

export function makeApp() {
  const db = openDb(':memory:');
  const tokens = createTokenService(TEST_SECRET);
  return { db, tokens, app: buildApp({ db, tokens }) };
}

export async function registerUser(app: FastifyInstance, username = 'kaan', password = 'motdepasse123'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, password } });
  if (res.statusCode !== 201) throw new Error(`register a échoué : ${res.body}`);
  return res.json().token as string;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
```

`server/test/auth.test.ts` :
```ts
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
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w server`
Expected: FAIL — `Failed to resolve import "../src/auth"`

- [ ] **Step 3: Implémenter l'auth**

`server/src/auth.ts` :
```ts
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
```

- [ ] **Step 4: Implémenter l'application HTTP**

`server/src/http/deps.ts` :
```ts
import type { TokenService } from '../auth';
import type { Db } from '../db';

export interface AppDeps {
  db: Db;
  tokens: TokenService;
}
```

`server/src/http/errors.ts` :
```ts
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
} satisfies Record<ForgeError, string> & Record<string, string>;

export type ErrorCode = keyof typeof MESSAGES;

export function sendError(reply: FastifyReply, status: number, code: ErrorCode): FastifyReply {
  return reply.code(status).send({ error: code, message: MESSAGES[code] });
}
```

`server/src/http/requireAuth.ts` :
```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { findAccountById } from '../repo/accounts';
import type { AppDeps } from './deps';
import { sendError } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    accountId: number;
  }
}

export function requireAuth({ db, tokens }: AppDeps) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const accountId = token ? await tokens.verify(token) : null;
    if (accountId === null || !findAccountById(db, accountId)) return sendError(reply, 401, 'UNAUTHORIZED');
    req.accountId = accountId;
  };
}
```

`server/src/http/authRoutes.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { passwordSchema, usernameSchema } from '@rpg/shared';
import { hashPassword, verifyPassword } from '../auth';
import { createAccount, findAccountById, findAccountByUsername } from '../repo/accounts';
import type { AppDeps } from './deps';
import { sendError } from './errors';
import { requireAuth } from './requireAuth';

const registerBody = z.object({ username: usernameSchema, password: passwordSchema });
const loginBody = z.object({ username: z.string(), password: z.string() });

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, tokens } = deps;

  app.post('/api/auth/register', async (req, reply) => {
    const body = registerBody.safeParse(req.body);
    if (!body.success) return sendError(reply, 400, 'VALIDATION');
    const passwordHash = await hashPassword(body.data.password);
    const id = createAccount(db, body.data.username, passwordHash);
    if (id === null) return sendError(reply, 409, 'USERNAME_TAKEN');
    return reply.code(201).send({ token: await tokens.sign(id), username: body.data.username });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    const account = body.success ? findAccountByUsername(db, body.data.username) : undefined;
    if (!body.success || !account || !(await verifyPassword(account.password_hash, body.data.password))) {
      return sendError(reply, 401, 'INVALID_CREDENTIALS');
    }
    return { token: await tokens.sign(account.id), username: account.username };
  });

  app.get('/api/me', { preHandler: requireAuth(deps) }, async (req) => {
    const account = findAccountById(db, req.accountId)!;
    return { id: account.id, username: account.username };
  });
}
```

`server/src/http/app.ts` :
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './authRoutes';
import type { AppDeps } from './deps';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest('accountId', 0);
  registerAuthRoutes(app, deps);
  return app;
}
```

`server/src/index.ts` :
```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTokenService } from './auth';
import { openDb } from './db';
import { buildApp } from './http/app';

const dbPath = process.env.DB_PATH ?? 'data/rpg.db';
const secret =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-a-changer-en-production-0123456789');
if (!secret) {
  console.error('JWT_SECRET est obligatoire en production');
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });
const app = buildApp({ db: openDb(dbPath), tokens: createTokenService(secret) });
const port = Number(process.env.PORT ?? 2567);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Serveur prêt sur http://localhost:${port}`);
```

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: tous les tests PASS (repo + auth), typecheck sans erreur.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): API d'inscription/connexion et point d'entrée"
```

---

### Task 6: API des personnages

**Files:**
- Create: `server/src/http/characterRoutes.ts`
- Modify: `server/src/http/app.ts`
- Test: `server/test/characters.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `sendError`, `AppDeps` (Task 5) ; `listCharacters`, `createCharacter`, `getCharacter`, `updateAppearance`, `deleteCharacter` (Task 4) ; `characterNameSchema`, `appearanceSchema` (Task 3)
- Produces :
  - `registerCharacterRoutes(app: FastifyInstance, deps: AppDeps): void`
  - `parseId(raw: string): number | null` (exporté pour la Task 7)
  - Routes (toutes avec `Authorization: Bearer <token>`) :
    - `GET /api/characters` → 200 `{ characters: CharacterSummary[] }`
    - `POST /api/characters` `{ name, appearance }` → 201 `CharacterDetail` | 400 `VALIDATION` | 409 `CHARACTER_LIMIT` / `NAME_TAKEN`
    - `GET /api/characters/:id` → 200 `CharacterDetail` | 404
    - `PATCH /api/characters/:id` `{ appearance }` → 200 `CharacterDetail` | 400 | 404
    - `DELETE /api/characters/:id` → 204 | 404

- [ ] **Step 1: Écrire le test qui échoue**

`server/test/characters.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import { auth, makeApp, registerUser } from './helpers';

let app: FastifyInstance;
let token: string;

beforeEach(async () => {
  ({ app } = makeApp());
  token = await registerUser(app, 'kaan');
});

const createChar = (name: string, t = token, appearance: unknown = DEFAULT_APPEARANCE) =>
  app.inject({ method: 'POST', url: '/api/characters', headers: auth(t), payload: { name, appearance } });

describe('API personnages', () => {
  it('exige une authentification', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/characters' });
    expect(res.statusCode).toBe(401);
  });

  it('crée, liste, lit, modifie et supprime un perso', async () => {
    const created = await createChar('  Arthur ');
    expect(created.statusCode).toBe(201);
    const c = created.json();
    expect(c).toMatchObject({ name: 'Arthur', gold: 0, appearance: DEFAULT_APPEARANCE });
    expect(c.weapons).toHaveLength(7);

    const list = await app.inject({ method: 'GET', url: '/api/characters', headers: auth(token) });
    expect(list.json()).toEqual({ characters: [{ id: c.id, name: 'Arthur', appearance: DEFAULT_APPEARANCE, bestWave: 0 }] });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/characters/${c.id}`,
      headers: auth(token),
      payload: { appearance: { ...DEFAULT_APPEARANCE, base: 'rogue' } },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().appearance.base).toBe('rogue');

    const del = await app.inject({ method: 'DELETE', url: `/api/characters/${c.id}`, headers: auth(token) });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: 'GET', url: `/api/characters/${c.id}`, headers: auth(token) });
    expect(get.statusCode).toBe(404);
  });

  it('refuse une apparence ou un nom invalide', async () => {
    expect((await createChar('Arthur', token, { ...DEFAULT_APPEARANCE, base: 'dragon' })).statusCode).toBe(400);
    expect((await createChar('<b>', token)).statusCode).toBe(400);
  });

  it('limite à 5 persos par compte', async () => {
    for (const n of ['P1', 'P2', 'P3', 'P4', 'P5']) expect((await createChar(n)).statusCode).toBe(201);
    const res = await createChar('P6');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CHARACTER_LIMIT');
  });

  it('nom unique par compte (casse ignorée), mais libre entre comptes', async () => {
    await createChar('Arthur');
    const dup = await createChar('arthur');
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('NAME_TAKEN');
    const other = await registerUser(app, 'autre');
    expect((await createChar('Arthur', other)).statusCode).toBe(201);
  });

  it("répond 404 sur le perso d'un autre compte et ne le modifie pas", async () => {
    const c = (await createChar('Arthur')).json();
    const other = await registerUser(app, 'autre');
    const url = `/api/characters/${c.id}`;
    expect((await app.inject({ method: 'GET', url, headers: auth(other) })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url, headers: auth(other), payload: { appearance: { ...DEFAULT_APPEARANCE, base: 'mage' } } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: auth(other) })).statusCode).toBe(404);
    const mine = await app.inject({ method: 'GET', url, headers: auth(token) });
    expect(mine.json().appearance.base).toBe('knight');
  });

  it('répond 404 sur un id non numérique', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/characters/abc', headers: auth(token) });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w server -- characters`
Expected: FAIL — les requêtes `/api/characters` répondent 404 (route inexistante).

- [ ] **Step 3: Implémenter**

`server/src/http/characterRoutes.ts` :
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appearanceSchema, characterNameSchema } from '@rpg/shared';
import { createCharacter, deleteCharacter, getCharacter, listCharacters, updateAppearance } from '../repo/characters';
import type { AppDeps } from './deps';
import { sendError } from './errors';
import { requireAuth } from './requireAuth';

const createBody = z.object({ name: characterNameSchema, appearance: appearanceSchema });
const patchBody = z.object({ appearance: appearanceSchema });

type IdParams = { Params: { id: string } };

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function registerCharacterRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth(deps));

    scope.get('/api/characters', async (req) => ({ characters: listCharacters(db, req.accountId) }));

    scope.post('/api/characters', async (req, reply) => {
      const body = createBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      const result = createCharacter(db, req.accountId, body.data.name, body.data.appearance);
      if (result === 'LIMIT') return sendError(reply, 409, 'CHARACTER_LIMIT');
      if (result === 'NAME_TAKEN') return sendError(reply, 409, 'NAME_TAKEN');
      return reply.code(201).send(result);
    });

    scope.get<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      const character = id === null ? undefined : getCharacter(db, req.accountId, id);
      return character ?? sendError(reply, 404, 'NOT_FOUND');
    });

    scope.patch<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      if (id === null) return sendError(reply, 404, 'NOT_FOUND');
      const body = patchBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      if (!updateAppearance(db, req.accountId, id, body.data.appearance)) return sendError(reply, 404, 'NOT_FOUND');
      return getCharacter(db, req.accountId, id);
    });

    scope.delete<IdParams>('/api/characters/:id', async (req, reply) => {
      const id = parseId(req.params.id);
      if (id === null || !deleteCharacter(db, req.accountId, id)) return sendError(reply, 404, 'NOT_FOUND');
      return reply.code(204).send();
    });
  });
}
```

Modifier `server/src/http/app.ts` :
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './authRoutes';
import { registerCharacterRoutes } from './characterRoutes';
import type { AppDeps } from './deps';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorateRequest('accountId', 0);
  registerAuthRoutes(app, deps);
  registerCharacterRoutes(app, deps);
  return app;
}
```

- [ ] **Step 4: Lancer les tests et le typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: tous les tests PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): API des personnages"
```

---

### Task 7: API de la forge (amélioration + enchantement)

**Files:**
- Create: `server/src/forgeService.ts`
- Modify: `server/src/http/characterRoutes.ts`
- Test: `server/test/forge.test.ts`

**Interfaces:**
- Consumes: `upgradeWeapon`, `enchantWeapon`, `isWeaponType`, `ELEMENTS`, `ForgeError` (Tasks 1–2) ; `tx` (Task 4) ; `getCharacter`, `saveWeaponAndWallet`, `CharacterDetail` (Task 4) ; `parseId` (Task 6)
- Produces (réutilisé par la room de run au Plan 2) :
  - `type ForgeAction = { kind: 'upgrade' } | { kind: 'enchant'; slot: 0 | 1; element: Element }`
  - `runForgeAction(db, accountId, characterId, weaponType, action): { ok: true; character: CharacterDetail } | { ok: false; error: ForgeError | 'NOT_FOUND' }`
  - Routes :
    - `POST /api/characters/:id/weapons/:type/upgrade` → 200 `CharacterDetail` | 400 `<ForgeError>` | 404
    - `POST /api/characters/:id/weapons/:type/enchant` `{ slot: 0|1, element }` → 200 | 400 `VALIDATION` / `<ForgeError>` | 404

- [ ] **Step 1: Écrire le test qui échoue**

`server/test/forge.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_APPEARANCE } from '@rpg/shared';
import type { Db } from '../src/db';
import { auth, makeApp, registerUser } from './helpers';

let app: FastifyInstance;
let db: Db;
let token: string;
let charId: number;

beforeEach(async () => {
  ({ app, db } = makeApp());
  token = await registerUser(app, 'kaan');
  const res = await app.inject({ method: 'POST', url: '/api/characters', headers: auth(token), payload: { name: 'Arthur', appearance: DEFAULT_APPEARANCE } });
  charId = res.json().id;
});

const setWallet = (gold: number, fireStones = 0) => {
  db.prepare('UPDATE characters SET gold = ? WHERE id = ?').run(gold, charId);
  db.prepare("UPDATE character_stones SET count = ? WHERE character_id = ? AND element = 'fire'").run(fireStones, charId);
};
const upgrade = (type = 'sword', t = token, id = charId) =>
  app.inject({ method: 'POST', url: `/api/characters/${id}/weapons/${type}/upgrade`, headers: auth(t) });
const enchant = (payload: unknown, type = 'sword') =>
  app.inject({ method: 'POST', url: `/api/characters/${charId}/weapons/${type}/enchant`, headers: auth(token), payload: payload as object });
const getChar = async () => (await app.inject({ method: 'GET', url: `/api/characters/${charId}`, headers: auth(token) })).json();

describe('forge', () => {
  it("améliore une arme et débite l'or", async () => {
    setWallet(100);
    const res = await upgrade('sword');
    expect(res.statusCode).toBe(200);
    expect(res.json().gold).toBe(50);
    expect(res.json().weapons.find((w: { type: string }) => w.type === 'sword').level).toBe(2);
  });

  it("une action refusée ne modifie rien en base", async () => {
    setWallet(49);
    const res = await upgrade('sword');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" });
    const c = await getChar();
    expect(c.gold).toBe(49);
    expect(c.weapons.find((w: { type: string }) => w.type === 'sword').level).toBe(1);
  });

  it('enchante avec des pierres et refuse le slot 2 avant le niveau 7', async () => {
    setWallet(0, 3);
    const ok = await enchant({ slot: 0, element: 'fire' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stones.fire).toBe(2);
    expect(ok.json().weapons[0].enchants).toEqual([{ element: 'fire', rank: 1 }, null]);

    const locked = await enchant({ slot: 1, element: 'fire' });
    expect(locked.statusCode).toBe(400);
    expect(locked.json().error).toBe('SLOT_LOCKED');
    expect((await getChar()).stones.fire).toBe(2);
  });

  it("valide le corps de la requête d'enchantement", async () => {
    for (const payload of [{ slot: 2, element: 'fire' }, { slot: 0, element: 'water' }, {}]) {
      const res = await enchant(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('VALIDATION');
    }
  });

  it("répond 404 pour une arme inconnue ou le perso d'un autre compte", async () => {
    setWallet(1000);
    expect((await upgrade('katana')).statusCode).toBe(404);
    const other = await registerUser(app, 'autre');
    expect((await upgrade('sword', other)).statusCode).toBe(404);
    expect((await getChar()).gold).toBe(1000);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -w server -- forge`
Expected: FAIL — les routes `/weapons/...` répondent 404 (inexistantes), donc le premier test échoue sur `expect(res.statusCode).toBe(200)`.

- [ ] **Step 3: Implémenter le service**

`server/src/forgeService.ts` :
```ts
import { enchantWeapon, upgradeWeapon, type Element, type ForgeError, type WeaponType } from '@rpg/shared';
import { tx, type Db } from './db';
import { getCharacter, saveWeaponAndWallet, type CharacterDetail } from './repo/characters';

export type ForgeAction = { kind: 'upgrade' } | { kind: 'enchant'; slot: 0 | 1; element: Element };

export type ForgeServiceResult = { ok: true; character: CharacterDetail } | { ok: false; error: ForgeError | 'NOT_FOUND' };

/** Applique une action de forge de façon atomique : en cas de refus, rien n'est écrit. */
export function runForgeAction(
  db: Db,
  accountId: number,
  characterId: number,
  weaponType: WeaponType,
  action: ForgeAction,
): ForgeServiceResult {
  return tx(db, (): ForgeServiceResult => {
    const character = getCharacter(db, accountId, characterId);
    const weapon = character?.weapons.find((w) => w.type === weaponType);
    if (!character || !weapon) return { ok: false, error: 'NOT_FOUND' };

    const wallet = { gold: character.gold, materials: character.materials, stones: character.stones };
    const result =
      action.kind === 'upgrade' ? upgradeWeapon(weapon, wallet) : enchantWeapon(weapon, wallet, action.slot, action.element);
    if (!result.ok) return result;

    saveWeaponAndWallet(db, characterId, result.weapon, result.wallet);
    return { ok: true, character: getCharacter(db, accountId, characterId)! };
  });
}
```

- [ ] **Step 4: Ajouter les routes**

Dans `server/src/http/characterRoutes.ts`, ajouter aux imports :
```ts
import type { FastifyReply } from 'fastify';
import { ELEMENTS, isWeaponType } from '@rpg/shared';
import { runForgeAction, type ForgeAction, type ForgeServiceResult } from '../forgeService';
```
(fusionner avec les imports existants de `fastify` et `@rpg/shared`.)

Ajouter au niveau du module, après `patchBody` :
```ts
const enchantBody = z.object({ slot: z.union([z.literal(0), z.literal(1)]), element: z.enum(ELEMENTS) });

type WeaponParams = { Params: { id: string; type: string } };

function sendForgeResult(reply: FastifyReply, result: ForgeServiceResult) {
  if (result.ok) return reply.send(result.character);
  return sendError(reply, result.error === 'NOT_FOUND' ? 404 : 400, result.error);
}
```

Ajouter dans le `app.register(async (scope) => { ... })`, après la route `DELETE` :
```ts
    const forge = (req: { accountId: number; params: { id: string; type: string } }, reply: FastifyReply, action: ForgeAction) => {
      const id = parseId(req.params.id);
      if (id === null || !isWeaponType(req.params.type)) return sendError(reply, 404, 'NOT_FOUND');
      return sendForgeResult(reply, runForgeAction(db, req.accountId, id, req.params.type, action));
    };

    scope.post<WeaponParams>('/api/characters/:id/weapons/:type/upgrade', async (req, reply) =>
      forge(req, reply, { kind: 'upgrade' }),
    );

    scope.post<WeaponParams>('/api/characters/:id/weapons/:type/enchant', async (req, reply) => {
      const body = enchantBody.safeParse(req.body);
      if (!body.success) return sendError(reply, 400, 'VALIDATION');
      return forge(req, reply, { kind: 'enchant', ...body.data });
    });
```

- [ ] **Step 5: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: tous les tests PASS dans `shared` et `server`, typecheck sans erreur.

- [ ] **Step 6: Vérification manuelle du serveur réel**

Run (terminal 1) : `npm run dev -w server`
Expected: `Serveur prêt sur http://localhost:2567`

Run (terminal 2) :
```bash
TOKEN=$(curl -s -X POST localhost:2567/api/auth/register -H 'content-type: application/json' -d '{"username":"demo","password":"motdepasse123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X POST localhost:2567/api/characters -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"Arthur","appearance":{"base":"knight","skinColor":"#e0ac69","hairStyle":0,"hairColor":"#4a2c17","outfitColor":"#3b5ba5"}}'
curl -s -X POST localhost:2567/api/characters/1/weapons/sword/upgrade -H "authorization: Bearer $TOKEN"
```
Expected : le 2ᵉ appel renvoie le perso avec 7 armes ; le 3ᵉ renvoie `{"error":"NOT_ENOUGH_GOLD","message":"Pas assez d'or"}`. Arrêter le serveur, puis `rm -rf server/data`.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): API de forge (amélioration et enchantement)"
```
