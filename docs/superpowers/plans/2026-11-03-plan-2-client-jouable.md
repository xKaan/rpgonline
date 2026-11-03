# Plan 2 — Client jouable (exploration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un client navigateur où l'on se connecte, crée/modifie ses persos (aperçu 3D), puis explore la map en 3ᵉ personne avec les 7 armes, la roulade et la forge (amélioration/enchantement via l'API existante).

**Architecture:** Nouveau workspace `client/` (Vite + TypeScript + Three.js, DOM natif pour les menus). Les règles de déplacement, de collision et la génération de la map vont dans `shared/` car la room serveur du Plan 3 les réutilisera (le client fera alors de la prédiction avec le même code). Le client parle au serveur via un petit client HTTP ; Vite proxifie `/api` vers `localhost:2567`. Pas encore de monstres ni de combat réel : les attaques jouent seulement l'animation.

**Tech Stack:** Vite, Three.js (+ `@types/three`), TypeScript, Vitest, assets KayKit Adventurers (CC0, déjà dans `client/public/assets/`), `concurrently`.

**Spec:** `docs/superpowers/specs/2026-11-03-rpg-online-design.md`

## Découpage global (mis à jour)

| Plan | Contenu |
|---|---|
| 1 — Fondations ✅ | règles armes/enchantements, API comptes/persos/forge |
| **2 — Client jouable (ce plan)** | connexion, éditeur de perso 3D, map explorable, armes, roulade, forge |
| 3 — Vagues & combat | règles monstres/vagues/shiny/bonus, room Colyseus autoritaire, monstres visibles, dégâts, loot |
| 4 — Finitions & déploiement | perf, Postgres, build prod, hébergement, coop 8 joueurs |

## Global Constraints

- TypeScript strict ; ESM ; imports sans extension (sauf `three/addons/...js`).
- `shared/` reste sans I/O ; l'aléatoire passe par `Rng`.
- Contrôles par **position physique** des touches (`KeyboardEvent.code`) : `KeyW/KeyA/KeyS/KeyD` = ZQSD sur AZERTY, WASD sur QWERTY. `Space` roulade, `Digit1..7` armes, `KeyE` forge, souris = visée (pointer lock), clic gauche = attaque.
- Roulade : invulnérabilité gérée au Plan 3 ; ici durée 0,35 s, vitesse 14 m/s, cooldown **1,5 s** (spec).
- Apparence v2 (remplace la v1, les packs KayKit n'ont pas de coiffures) : `{ base, outfitColor, headgear, cape }`.
- Modèles d'armes : épée, hache, arbalète = glTF KayKit ; pelle, lance, masse, arc = géométrie procédurale low-poly. Tous attachés à l'os `handslot.r`, position `(0, 0.0333, 0)`, rotation Y = π, lame selon +Y.
- Textes de l'interface en français.
- `localStorage` toujours dans un `try/catch` ; l'appli fonctionne sans.

## Review Focus

1. **Jeton expiré pendant la session** (une requête API répond 401) → session effacée et retour à l'écran de connexion, jamais un écran vide. *(test : Task 3)*
2. **Serveur injoignable** (fetch rejette) → erreur `NETWORK` avec message « Impossible de joindre le serveur », affichable. *(test : Task 3)*
3. **`localStorage` indisponible ou qui lève** → la session marche en mémoire. *(test : Task 3)*
4. **Perso créé avec l'ancienne apparence v1** en BDD → l'API renvoie l'apparence par défaut au lieu de planter le client. *(test : Task 1)*
5. **Joueur qui fonce dans la forge ou le bord de la map** → il est repoussé hors des obstacles et reste dans les limites. *(test : Task 2)*

---

### Task 1: Apparence v2 et types d'API partagés

**Files:**
- Modify: `shared/src/character.ts`, `shared/test/character.test.ts`, `shared/src/index.ts`
- Create: `shared/src/apiTypes.ts`
- Modify: `server/src/repo/characters.ts`, `server/test/repo.test.ts`
- Modify: `docs/superpowers/specs/2026-11-03-rpg-online-design.md` (section 6, éditeur)

**Interfaces:**
- Produces (depuis `@rpg/shared`) :
  - `BASE_MODELS`, `type BaseModel = 'knight' | 'barbarian' | 'mage' | 'rogue' | 'rogue_hooded'`
  - `appearanceSchema`, `type Appearance = { base: BaseModel; outfitColor: string; headgear: boolean; cape: boolean }`, `DEFAULT_APPEARANCE`
  - `parseAppearance(raw: unknown): Appearance` (repli sur `DEFAULT_APPEARANCE`)
  - `interface CharacterSummary`, `interface CharacterDetail`, `interface AuthResult { token: string; username: string }`, `interface Me { id: number; username: string }`
- Le serveur ré-exporte `CharacterSummary`/`CharacterDetail` depuis `repo/characters.ts` (imports existants inchangés).

- [ ] **Step 1: Mettre à jour les tests d'apparence (ils doivent échouer)**

Remplacer le bloc `describe('apparence', ...)` de `shared/test/character.test.ts` par :
```ts
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
```
Et remplacer l'import en tête du fichier par :
```ts
import { describe, it, expect } from 'vitest';
import {
  appearanceSchema,
  characterNameSchema,
  DEFAULT_APPEARANCE,
  parseAppearance,
  passwordSchema,
  usernameSchema,
} from '../src/character';
```

Ajouter à la fin de `server/test/repo.test.ts` :
```ts
describe('apparence héritée', () => {
  it("renvoie l'apparence par défaut si celle stockée n'est plus valide", () => {
    const c = create('Ancien');
    db.prepare('UPDATE characters SET appearance = ? WHERE id = ?').run('{"base":"mage","hairStyle":2}', c.id);
    expect(getCharacter(db, accountId, c.id)?.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(listCharacters(db, accountId)[0].appearance).toEqual(DEFAULT_APPEARANCE);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w shared; npm test -w server`
Expected: FAIL dans `shared` (`parseAppearance` n'existe pas / `headgear` inconnu) et dans `server` (`appearance` vaut l'objet hérité au lieu du défaut).

- [ ] **Step 3: Implémenter l'apparence v2**

Dans `shared/src/character.ts`, remplacer tout le code depuis `/** Modèles de base` jusqu'à la fin de `DEFAULT_APPEARANCE` par :
```ts
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
```
(Supprimer `HAIR_STYLE_COUNT`, devenu inutile.)

`shared/src/apiTypes.ts` :
```ts
import type { Appearance } from './character';
import type { Element } from './enchantments';
import type { WeaponState } from './forge';

export interface AuthResult {
  token: string;
  username: string;
}

export interface Me {
  id: number;
  username: string;
}

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
```

`shared/src/index.ts` :
```ts
export * from './weapons';
export * from './enchantments';
export * from './forge';
export * from './character';
export * from './apiTypes';
```

- [ ] **Step 4: Brancher le serveur**

Dans `server/src/repo/characters.ts` :
1. Dans l'import `@rpg/shared`, ajouter `parseAppearance`, `type CharacterDetail`, `type CharacterSummary`, et retirer `type Appearance` s'il n'est plus utilisé ailleurs que dans les signatures (le garder s'il l'est — il l'est dans `createCharacter`/`updateAppearance`, donc le garder).
2. Supprimer les deux `export interface CharacterSummary` / `CharacterDetail` et les remplacer par :
```ts
export type { CharacterDetail, CharacterSummary };
```
3. Dans `toSummary`, remplacer `appearance: JSON.parse(r.appearance) as Appearance,` par :
```ts
  appearance: parseAppearance(safeJson(r.appearance)),
```
et ajouter au-dessus de `toSummary` :
```ts
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
```

- [ ] **Step 5: Mettre à jour la spec**

Dans `docs/superpowers/specs/2026-11-03-rpg-online-design.md`, remplacer la ligne qui commence par `- **Éditeur de perso v1 :**` par :
```markdown
- **Éditeur de perso v1 :** modèle de base (Chevalier, Barbare, Mage, Voleur, Voleur encapuchonné — KayKit), teinte de la tenue et de la cape, chapeau/casque affiché ou non, cape affichée ou non, nom (unique par compte). Les packs KayKit n'ont pas de coiffures séparées, d'où l'abandon de la coiffure/couleur de peau prévues initialement.
```

- [ ] **Step 6: Lancer tests et typecheck**

Run: `npm test && npm run typecheck`
Expected: tout PASS (`shared` 25 tests, `server` 29 tests), typecheck sans erreur.

- [ ] **Step 7: Commit**

```bash
git add shared server docs/superpowers/specs
git commit -m "feat(shared): apparence v2 (KayKit) et types d'API partagés"
```

---

### Task 2: Carte et déplacement (règles partagées)

**Files:**
- Create: `shared/src/rng.ts`, `shared/src/map.ts`, `shared/src/movement.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/map.test.ts`, `shared/test/movement.test.ts`

**Interfaces:**
- Produces :
  - `type Rng = () => number`, `mulberry32(seed: number): Rng`
  - `MAP_HALF_SIZE = 40`, `MAP_SEED = 1337`, `SAFE_RADIUS = 14`, `FORGE_POS`, `FORGE_RADIUS = 2.2`, `ENCHANTER_POS`, `ENCHANTER_RADIUS = 1.2`, `SPAWN_POS = { x: 0, z: 8 }`
  - `interface Obstacle { x: number; z: number; radius: number }`, `interface Decoration { x; z; scale; rotation }`, `interface GameMap { trees: Decoration[]; rocks: Decoration[]; obstacles: Obstacle[] }`, `generateMap(seed?: number): GameMap`
  - `PLAYER_SPEED = 6`, `PLAYER_RADIUS = 0.5`, `ROLL_SPEED = 14`, `ROLL_DURATION = 0.35`, `ROLL_COOLDOWN = 1.5`
  - `interface MoveInput { forward; back; left; right; roll: boolean }`, `NO_INPUT: MoveInput`
  - `interface PlayerMotion { x; z; facing; rollTime; rollCooldown; rollDirX; rollDirZ: number }`
  - `newMotion(x: number, z: number): PlayerMotion`, `moveDirection(input, yaw): { x; z }`, `resolveCollisions(x, z, obstacles): { x; z }`, `stepMotion(m, input, yaw, dt, obstacles?): PlayerMotion`
  - Convention : `yaw = 0` ⇒ la caméra regarde vers −Z ; `facing` = `rotation.y` du modèle (le modèle regarde +Z à 0), donc regarder vers (dx, dz) ⇔ `facing = atan2(dx, dz)`.

- [ ] **Step 1: Écrire les tests**

`shared/test/map.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/rng';
import { FORGE_POS, MAP_HALF_SIZE, SAFE_RADIUS, generateMap } from '../src/map';

describe('rng', () => {
  it('est déterministe et dans [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateMap', () => {
  it('est déterministe pour une même graine', () => {
    expect(generateMap(7)).toEqual(generateMap(7));
    expect(generateMap(7)).not.toEqual(generateMap(8));
  });

  it('place arbres et rochers dans les limites, hors de la zone centrale', () => {
    const map = generateMap();
    expect(map.trees.length).toBe(70);
    expect(map.rocks.length).toBe(30);
    for (const d of [...map.trees, ...map.rocks]) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(MAP_HALF_SIZE);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(MAP_HALF_SIZE);
      expect(Math.hypot(d.x, d.z)).toBeGreaterThanOrEqual(SAFE_RADIUS);
    }
  });

  it('inclut la forge dans les obstacles', () => {
    expect(generateMap().obstacles).toContainEqual(expect.objectContaining({ x: FORGE_POS.x, z: FORGE_POS.z }));
  });
});
```

`shared/test/movement.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import {
  NO_INPUT,
  PLAYER_RADIUS,
  ROLL_COOLDOWN,
  ROLL_DURATION,
  ROLL_SPEED,
  moveDirection,
  newMotion,
  stepMotion,
  type MoveInput,
} from '../src/movement';
import { MAP_HALF_SIZE } from '../src/map';

const input = (p: Partial<MoveInput>): MoveInput => ({ ...NO_INPUT, ...p });

describe('moveDirection', () => {
  it('avance vers −Z quand la caméra a un yaw de 0', () => {
    const d = moveDirection(input({ forward: true }), 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('droite = +X à yaw 0, et tourne avec la caméra', () => {
    const r = moveDirection(input({ right: true }), 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    const f = moveDirection(input({ forward: true }), Math.PI / 2);
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });

  it('normalise la diagonale et renvoie 0 sans touche', () => {
    const d = moveDirection(input({ forward: true, right: true }), 0);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
    expect(moveDirection(NO_INPUT, 0)).toEqual({ x: 0, z: 0 });
    expect(moveDirection(input({ forward: true, back: true }), 0)).toEqual({ x: 0, z: 0 });
  });
});

describe('stepMotion', () => {
  it('avance de 6 m/s et oriente le perso', () => {
    const m = stepMotion(newMotion(0, 30), input({ forward: true }), 0, 1);
    expect(m.z).toBeCloseTo(24);
    expect(Math.abs(m.facing)).toBeCloseTo(Math.PI);
  });

  it('roulade : rapide, puis cooldown de 1,5 s', () => {
    let m = stepMotion(newMotion(0, 30), input({ forward: true, roll: true }), 0, ROLL_DURATION);
    expect(m.z).toBeCloseTo(30 - ROLL_SPEED * ROLL_DURATION);
    expect(m.rollTime).toBe(0);
    expect(m.rollCooldown).toBeCloseTo(ROLL_COOLDOWN);
    const z = m.z;
    m = stepMotion(m, input({ forward: true, roll: true }), 0, 0.1);
    expect(m.rollTime).toBe(0);
    expect(m.z).toBeCloseTo(z - 0.6);
  });

  it('roulade sans direction : part dans le sens du regard', () => {
    const m = stepMotion(newMotion(0, 30), input({ roll: true }), 0, 0.1);
    expect(m.z).toBeCloseTo(30 - ROLL_SPEED * 0.1);
    expect(m.rollTime).toBeCloseTo(ROLL_DURATION - 0.1);
  });

  it('est repoussé hors des obstacles', () => {
    const m = stepMotion(newMotion(0, 3), input({ forward: true }), 0, 1, [{ x: 0, z: 0, radius: 2 }]);
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(2 + PLAYER_RADIUS);
  });

  it('reste dans les limites de la map', () => {
    const m = stepMotion(newMotion(0, -39), input({ forward: true }), 0, 1);
    expect(m.z).toBeCloseTo(-(MAP_HALF_SIZE - PLAYER_RADIUS));
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w shared`
Expected: FAIL — `Cannot find module '../src/rng'` et `'../src/movement'`.

- [ ] **Step 3: Implémenter**

`shared/src/rng.ts` :
```ts
export type Rng = () => number;

/** Générateur pseudo-aléatoire déterministe (mulberry32), valeurs dans [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`shared/src/map.ts` :
```ts
import { mulberry32 } from './rng';

export const MAP_HALF_SIZE = 40;
export const MAP_SEED = 1337;
/** rayon autour du centre laissé libre (forge, enchanteur, spawn) */
export const SAFE_RADIUS = 14;

export const FORGE_POS = { x: 0, z: 0 };
export const FORGE_RADIUS = 2.2;
export const ENCHANTER_POS = { x: 6, z: -2 };
export const ENCHANTER_RADIUS = 1.2;
export const SPAWN_POS = { x: 0, z: 8 };

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface Decoration {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface GameMap {
  trees: Decoration[];
  rocks: Decoration[];
  obstacles: Obstacle[];
}

const TREE_COUNT = 70;
const ROCK_COUNT = 30;

export function generateMap(seed = MAP_SEED): GameMap {
  const rng = mulberry32(seed);
  const trees: Decoration[] = [];
  const rocks: Decoration[] = [];
  const all: Decoration[] = [];

  const place = (list: Decoration[], count: number, spacing: number) => {
    for (let tries = 0; list.length < count && tries < count * 100; tries++) {
      const x = (rng() * 2 - 1) * (MAP_HALF_SIZE - 2);
      const z = (rng() * 2 - 1) * (MAP_HALF_SIZE - 2);
      if (Math.hypot(x, z) < SAFE_RADIUS) continue;
      if (all.some((d) => Math.hypot(d.x - x, d.z - z) < spacing)) continue;
      const d = { x, z, scale: 0.8 + rng() * 0.6, rotation: rng() * Math.PI * 2 };
      list.push(d);
      all.push(d);
    }
  };
  place(trees, TREE_COUNT, 3);
  place(rocks, ROCK_COUNT, 2.5);

  const obstacles: Obstacle[] = [
    { ...FORGE_POS, radius: FORGE_RADIUS },
    { ...ENCHANTER_POS, radius: ENCHANTER_RADIUS },
    ...trees.map((t) => ({ x: t.x, z: t.z, radius: 0.5 * t.scale })),
    ...rocks.map((r) => ({ x: r.x, z: r.z, radius: 0.7 * r.scale })),
  ];
  return { trees, rocks, obstacles };
}
```

`shared/src/movement.ts` :
```ts
import { MAP_HALF_SIZE, type Obstacle } from './map';

export const PLAYER_SPEED = 6;
export const PLAYER_RADIUS = 0.5;
export const ROLL_SPEED = 14;
export const ROLL_DURATION = 0.35;
export const ROLL_COOLDOWN = 1.5;

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  roll: boolean;
}

export const NO_INPUT: MoveInput = { forward: false, back: false, left: false, right: false, roll: false };

export interface PlayerMotion {
  x: number;
  z: number;
  /** rotation.y du modèle (0 = regarde +Z) */
  facing: number;
  /** temps de roulade restant (s) */
  rollTime: number;
  rollCooldown: number;
  rollDirX: number;
  rollDirZ: number;
}

export function newMotion(x: number, z: number): PlayerMotion {
  return { x, z, facing: Math.PI, rollTime: 0, rollCooldown: 0, rollDirX: 0, rollDirZ: -1 };
}

/** Direction de déplacement normalisée, relative à la caméra (yaw 0 = caméra tournée vers −Z). */
export function moveDirection(input: MoveInput, yaw: number): { x: number; z: number } {
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (f === 0 && r === 0) return { x: 0, z: 0 };
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = -sin * f + cos * r;
  const z = -cos * f - sin * r;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function resolveCollisions(x: number, z: number, obstacles: readonly Obstacle[]): { x: number; z: number } {
  for (const o of obstacles) {
    const min = o.radius + PLAYER_RADIUS;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= min) continue;
    if (d === 0) {
      x = o.x + min;
    } else {
      x = o.x + (dx / d) * min;
      z = o.z + (dz / d) * min;
    }
  }
  const limit = MAP_HALF_SIZE - PLAYER_RADIUS;
  return { x: clamp(x, -limit, limit), z: clamp(z, -limit, limit) };
}

export function stepMotion(
  m: PlayerMotion,
  input: MoveInput,
  yaw: number,
  dt: number,
  obstacles: readonly Obstacle[] = [],
): PlayerMotion {
  let { x, z, facing, rollTime, rollDirX, rollDirZ } = m;
  let rollCooldown = Math.max(0, m.rollCooldown - dt);
  const dir = moveDirection(input, yaw);
  const moving = dir.x !== 0 || dir.z !== 0;

  if (input.roll && rollTime <= 0 && rollCooldown <= 0) {
    rollTime = ROLL_DURATION;
    rollCooldown = ROLL_COOLDOWN;
    rollDirX = moving ? dir.x : Math.sin(facing);
    rollDirZ = moving ? dir.z : Math.cos(facing);
  }

  if (rollTime > 0) {
    const d = ROLL_SPEED * Math.min(dt, rollTime);
    x += rollDirX * d;
    z += rollDirZ * d;
    rollTime = Math.max(0, rollTime - dt);
    facing = Math.atan2(rollDirX, rollDirZ);
  } else if (moving) {
    x += dir.x * PLAYER_SPEED * dt;
    z += dir.z * PLAYER_SPEED * dt;
    facing = Math.atan2(dir.x, dir.z);
  }

  ({ x, z } = resolveCollisions(x, z, obstacles));
  return { x, z, facing, rollTime, rollCooldown, rollDirX, rollDirZ };
}
```

`shared/src/index.ts` — ajouter :
```ts
export * from './rng';
export * from './map';
export * from './movement';
```

- [ ] **Step 4: Lancer tests et typecheck**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: tout PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): génération de la map et règles de déplacement"
```

---

### Task 3: Workspace client, session et client API

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/session.ts`, `client/src/api.ts`
- Modify: `package.json` (racine : workspace `client`, script `dev`)
- Test: `client/test/session.test.ts`, `client/test/api.test.ts`

**Interfaces:**
- Consumes: `AuthResult`, `Me`, `CharacterSummary`, `CharacterDetail`, `Appearance`, `WeaponType`, `Element` (Task 1, Plan 1)
- Produces :
  - `interface Session { readonly token: string | null; readonly username: string | null; save(token: string, username: string): void; clear(): void }`
  - `type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`, `createSession(storage: KeyValueStorage | null): Session`, `browserStorage(): KeyValueStorage | null`
  - `class ApiError extends Error { status: number; code: string }`
  - `createApi(opts: { getToken(): string | null; onUnauthorized?(): void; fetch?: typeof fetch; baseUrl?: string })` → objet avec `register`, `login`, `me`, `listCharacters`, `getCharacter`, `createCharacter`, `updateAppearance`, `deleteCharacter`, `upgradeWeapon`, `enchantWeapon` ; `type Api = ReturnType<typeof createApi>`

- [ ] **Step 1: Créer le workspace**

`client/package.json` :
```json
{
  "name": "@rpg/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  },
  "dependencies": {
    "@rpg/shared": "*"
  }
}
```

`client/tsconfig.json` :
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "test"]
}
```

`client/vite.config.ts` :
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:2567' },
  },
});
```

`client/index.html` :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RPG Online</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Dans le `package.json` racine (via node, pas sed) : `workspaces` = `["shared", "server", "client"]` et ajouter le script `"dev": "concurrently -k -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\""`.
```bash
node -e 'const f="package.json",fs=require("fs"),p=JSON.parse(fs.readFileSync(f));p.workspaces=["shared","server","client"];p.scripts.dev="concurrently -k -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"";fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")'
npm i three -w client
npm i -D @types/three vite -w client
npm i -D concurrently
```
Vérifier ensuite que `client/package.json` contient bien `three`, `@types/three` et `vite`.

- [ ] **Step 2: Écrire les tests**

`client/test/session.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { createSession, type KeyValueStorage } from '../src/session';

const memoryStorage = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const throwingStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('bloqué');
  },
  setItem: () => {
    throw new Error('bloqué');
  },
  removeItem: () => {
    throw new Error('bloqué');
  },
};

describe('session', () => {
  it('persiste et relit le jeton', () => {
    const storage = memoryStorage();
    createSession(storage).save('t0k3n', 'Kaan');
    const again = createSession(storage);
    expect(again.token).toBe('t0k3n');
    expect(again.username).toBe('Kaan');
    again.clear();
    expect(createSession(storage).token).toBeNull();
  });

  it('fonctionne en mémoire si le stockage lève ou est absent', () => {
    for (const storage of [throwingStorage, null]) {
      const s = createSession(storage);
      expect(s.token).toBeNull();
      s.save('abc', 'Kaan');
      expect(s.token).toBe('abc');
      s.clear();
      expect(s.username).toBeNull();
    }
  });
});
```

`client/test/api.test.ts` :
```ts
import { describe, it, expect, vi } from 'vitest';
import { ApiError, createApi } from '../src/api';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('client API', () => {
  it("envoie le jeton et le corps JSON, et renvoie la réponse", async () => {
    const fetch = vi.fn(async () => json(200, { token: 'x', username: 'Kaan' }));
    const api = createApi({ getToken: () => 'abc', fetch });
    expect(await api.login('Kaan', 'motdepasse123')).toEqual({ token: 'x', username: 'Kaan' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer abc');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'Kaan', password: 'motdepasse123' });
  });

  it("transforme une erreur serveur en ApiError avec le message français", async () => {
    const api = createApi({ getToken: () => 'abc', fetch: async () => json(400, { error: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" }) });
    const err = await api.upgradeWeapon(1, 'sword').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'NOT_ENOUGH_GOLD', message: "Pas assez d'or" });
  });

  it('appelle onUnauthorized sur un 401 quand on avait un jeton', async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ getToken: () => 'expiré', onUnauthorized, fetch: async () => json(401, { error: 'UNAUTHORIZED', message: 'Session invalide ou expirée' }) });
    await expect(api.listCharacters()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("n'appelle pas onUnauthorized sur un échec de connexion sans jeton", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ getToken: () => null, onUnauthorized, fetch: async () => json(401, { error: 'INVALID_CREDENTIALS', message: 'x' }) });
    await expect(api.login('a', 'b')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('serveur injoignable → ApiError NETWORK', async () => {
    const api = createApi({ getToken: () => null, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'NETWORK', message: 'Impossible de joindre le serveur' });
  });

  it('réponse non JSON → ApiError générique', async () => {
    const api = createApi({ getToken: () => null, fetch: async () => new Response('<html>502</html>', { status: 502 }) });
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('204 → undefined, et listCharacters déballe le tableau', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(200, { characters: [{ id: 1 }] }));
    const api = createApi({ getToken: () => 'abc', fetch });
    expect(await api.deleteCharacter(3)).toBeUndefined();
    expect(fetch.mock.calls[0][0]).toBe('/api/characters/3');
    expect(await api.listCharacters()).toEqual([{ id: 1 }]);
  });

  it("enchantWeapon envoie slot et élément", async () => {
    const fetch = vi.fn(async () => json(200, {}));
    await createApi({ getToken: () => 'abc', fetch }).enchantWeapon(4, 'bow', 1, 'ice');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/characters/4/weapons/bow/enchant');
    expect(JSON.parse(init.body as string)).toEqual({ slot: 1, element: 'ice' });
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npm test -w client`
Expected: FAIL — `Cannot find module '../src/session'` et `'../src/api'`.

- [ ] **Step 4: Implémenter**

`client/src/session.ts` :
```ts
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Session {
  readonly token: string | null;
  readonly username: string | null;
  save(token: string, username: string): void;
  clear(): void;
}

const TOKEN_KEY = 'rpg.token';
const USERNAME_KEY = 'rpg.username';

/** Session persistée si possible ; reste fonctionnelle en mémoire si le stockage est absent ou bloqué. */
export function createSession(storage: KeyValueStorage | null): Session {
  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null) => {
    try {
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // stockage indisponible : on garde la valeur en mémoire
    }
  };

  let token = read(TOKEN_KEY);
  let username = read(USERNAME_KEY);

  return {
    get token() {
      return token;
    },
    get username() {
      return username;
    },
    save(t, u) {
      token = t;
      username = u;
      write(TOKEN_KEY, t);
      write(USERNAME_KEY, u);
    },
    clear() {
      token = null;
      username = null;
      write(TOKEN_KEY, null);
      write(USERNAME_KEY, null);
    },
  };
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

`client/src/api.ts` :
```ts
import type { Appearance, AuthResult, CharacterDetail, CharacterSummary, Element, Me, WeaponType } from '@rpg/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  getToken(): string | null;
  /** appelé quand une requête authentifiée reçoit 401 (jeton expiré ou invalide) */
  onUnauthorized?(): void;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createApi(opts: ApiOptions) {
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const base = opts.baseUrl ?? '';

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = opts.getToken();
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await doFetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur');
    }
    if (res.status === 204) return undefined as T;

    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(res.status, data?.error ?? 'UNKNOWN', data?.message ?? `Erreur inattendue du serveur (${res.status})`);
    }
    return data as T;
  }

  return {
    register: (username: string, password: string) => request<AuthResult>('POST', '/api/auth/register', { username, password }),
    login: (username: string, password: string) => request<AuthResult>('POST', '/api/auth/login', { username, password }),
    me: () => request<Me>('GET', '/api/me'),
    listCharacters: () =>
      request<{ characters: CharacterSummary[] }>('GET', '/api/characters').then((r) => r.characters),
    getCharacter: (id: number) => request<CharacterDetail>('GET', `/api/characters/${id}`),
    createCharacter: (name: string, appearance: Appearance) =>
      request<CharacterDetail>('POST', '/api/characters', { name, appearance }),
    updateAppearance: (id: number, appearance: Appearance) =>
      request<CharacterDetail>('PATCH', `/api/characters/${id}`, { appearance }),
    deleteCharacter: (id: number) => request<void>('DELETE', `/api/characters/${id}`),
    upgradeWeapon: (id: number, type: WeaponType) =>
      request<CharacterDetail>('POST', `/api/characters/${id}/weapons/${type}/upgrade`),
    enchantWeapon: (id: number, type: WeaponType, slot: 0 | 1, element: Element) =>
      request<CharacterDetail>('POST', `/api/characters/${id}/weapons/${type}/enchant`, { slot, element }),
  };
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 5: Lancer tests et typecheck**

Run: `npm test -w client && npm run typecheck -w client`
Expected: 10 tests PASS, typecheck sans erreur.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json client/package.json client/tsconfig.json client/vite.config.ts client/index.html client/src client/test
git commit -m "feat(client): workspace Vite, session et client API"
```

---

### Task 4: Logique pure du client (pièces du modèle, caméra, animations, vue forge)

**Files:**
- Create: `client/src/three/parts.ts`, `client/src/game/camera.ts`, `client/src/game/animations.ts`, `client/src/game/forgeView.ts`, `client/src/ui/labels.ts`
- Test: `client/test/parts.test.ts`, `client/test/camera.test.ts`, `client/test/animations.test.ts`, `client/test/forgeView.test.ts`

**Interfaces:**
- Produces :
  - `type PartKind = 'skin' | 'outfit' | 'headgear' | 'cape' | 'prop'`, `classifyPart(nodeName: string): PartKind`, `isPartVisible(kind: PartKind, a: Appearance): boolean`, `MODEL_FILES: Record<BaseModel, string>`
  - `CAMERA_DISTANCE = 6`, `TARGET_HEIGHT = 2`, `PITCH_MIN = -0.2`, `PITCH_MAX = 1.1`, `cameraOffset(yaw, pitch, distance): { x; y; z }`, `clampPitch(p): number`, `aimFacing(yaw): number`
  - `ATTACK_ANIMATIONS: Record<WeaponType, string>`, `ROLL_ANIMATION = 'Dodge_Forward'`, `interface AnimState { rolling; attacking; moving: boolean; weapon: WeaponType }`, `chooseAnimation(s): { name: string; once: boolean }`
  - `interface WeaponRowView { type; label; level; maxed; cost: UpgradeCost | null; affordable; enchants; slotCount }`, `forgeRows(c: CharacterDetail): WeaponRowView[]`, `enchantLabel(e: Enchant | null): string`
  - `BASE_LABELS: Record<BaseModel, string>`

- [ ] **Step 1: Écrire les tests**

`client/test/parts.test.ts` :
```ts
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
```

`client/test/camera.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { PITCH_MAX, PITCH_MIN, aimFacing, cameraOffset, clampPitch } from '../src/game/camera';

describe('caméra', () => {
  it('se place derrière le joueur (+Z) à yaw 0', () => {
    const o = cameraOffset(0, 0, 6);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
    expect(o.z).toBeCloseTo(6);
  });

  it('tourne autour du joueur et monte avec le pitch', () => {
    expect(cameraOffset(Math.PI / 2, 0, 6).x).toBeCloseTo(6);
    expect(cameraOffset(0, Math.PI / 2, 6).y).toBeCloseTo(6);
  });

  it('borne le pitch', () => {
    expect(clampPitch(5)).toBe(PITCH_MAX);
    expect(clampPitch(-5)).toBe(PITCH_MIN);
    expect(clampPitch(0.3)).toBe(0.3);
  });

  it("aimFacing oriente le modèle dans la direction où regarde la caméra", () => {
    for (const yaw of [0, 1, -2.5]) {
      const f = aimFacing(yaw);
      expect(Math.sin(f)).toBeCloseTo(-Math.sin(yaw));
      expect(Math.cos(f)).toBeCloseTo(-Math.cos(yaw));
    }
  });
});
```

`client/test/animations.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { WEAPON_TYPES } from '@rpg/shared';
import { ATTACK_ANIMATIONS, ROLL_ANIMATION, chooseAnimation } from '../src/game/animations';

const base = { rolling: false, attacking: false, moving: false, weapon: 'sword' as const };

describe('chooseAnimation', () => {
  it('priorité : roulade > attaque > course > repos', () => {
    expect(chooseAnimation({ ...base, rolling: true, attacking: true, moving: true })).toEqual({ name: ROLL_ANIMATION, once: true });
    expect(chooseAnimation({ ...base, attacking: true, moving: true })).toEqual({ name: ATTACK_ANIMATIONS.sword, once: true });
    expect(chooseAnimation({ ...base, moving: true })).toEqual({ name: 'Running_A', once: false });
    expect(chooseAnimation(base)).toEqual({ name: 'Idle', once: false });
    expect(chooseAnimation({ ...base, weapon: 'axe' })).toEqual({ name: '2H_Melee_Idle', once: false });
  });

  it('a une animation d’attaque pour chaque arme', () => {
    for (const w of WEAPON_TYPES) expect(ATTACK_ANIMATIONS[w]).toMatch(/Attack|Shoot/);
  });
});
```

`client/test/forgeView.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { emptyStones, newWeapon, WEAPON_TYPES, DEFAULT_APPEARANCE, type CharacterDetail } from '@rpg/shared';
import { enchantLabel, forgeRows } from '../src/game/forgeView';

const character = (gold: number, materials = 0): CharacterDetail => ({
  id: 1,
  name: 'Arthur',
  appearance: DEFAULT_APPEARANCE,
  bestWave: 0,
  gold,
  materials,
  stones: emptyStones(),
  weapons: WEAPON_TYPES.map((t) => newWeapon(t)),
});

describe('forgeRows', () => {
  it('calcule coût, accessibilité et slots par arme', () => {
    const c = character(60);
    c.weapons[1] = { ...c.weapons[1], level: 4 };
    c.weapons[2] = { ...c.weapons[2], level: 10 };
    c.weapons[3] = { ...c.weapons[3], level: 7 };
    const rows = forgeRows(c);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ type: 'sword', label: 'Épée', level: 1, maxed: false, cost: { gold: 50, materials: 0 }, affordable: true, slotCount: 1 });
    expect(rows[1]).toMatchObject({ level: 4, cost: { gold: 205, materials: 5 }, affordable: false });
    expect(rows[2]).toMatchObject({ maxed: true, cost: null, affordable: false, slotCount: 2 });
    expect(rows[3].slotCount).toBe(2);
  });
});

describe('enchantLabel', () => {
  it('affiche élément et rang en chiffres romains', () => {
    expect(enchantLabel(null)).toBe('Vide');
    expect(enchantLabel({ element: 'fire', rank: 1 })).toBe('Feu I');
    expect(enchantLabel({ element: 'lightning', rank: 3 })).toBe('Électricité III');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -w client`
Expected: FAIL — modules `parts`, `camera`, `animations`, `forgeView` introuvables.

- [ ] **Step 3: Implémenter**

`client/src/three/parts.ts` :
```ts
import type { Appearance, BaseModel } from '@rpg/shared';

export const MODEL_FILES: Record<BaseModel, string> = {
  knight: 'Knight.glb',
  barbarian: 'Barbarian.glb',
  mage: 'Mage.glb',
  rogue: 'Rogue.glb',
  rogue_hooded: 'Rogue_Hooded.glb',
};

export type PartKind = 'skin' | 'outfit' | 'headgear' | 'cape' | 'prop';

/** Classe un maillage KayKit d'après son nom de nœud (ex. « Knight_Body », « Mage_Hat », « 1H_Sword »). */
export function classifyPart(nodeName: string): PartKind {
  if (/_Head(_Hooded)?$/.test(nodeName)) return 'skin';
  if (/_(Body|ArmLeft|ArmRight|LegLeft|LegRight)$/.test(nodeName)) return 'outfit';
  if (/_(Hat|Helmet)$/.test(nodeName)) return 'headgear';
  if (/_Cape$/.test(nodeName)) return 'cape';
  return 'prop';
}

export function isPartVisible(kind: PartKind, a: Appearance): boolean {
  switch (kind) {
    case 'skin':
    case 'outfit':
      return true;
    case 'headgear':
      return a.headgear;
    case 'cape':
      return a.cape;
    case 'prop':
      return false;
  }
}
```

`client/src/game/camera.ts` :
```ts
export const CAMERA_DISTANCE = 6;
export const TARGET_HEIGHT = 2;
export const PITCH_MIN = -0.2;
export const PITCH_MAX = 1.1;

/** Position de la caméra relative à la cible ; yaw 0 = derrière le joueur côté +Z, regardant vers −Z. */
export function cameraOffset(yaw: number, pitch: number, distance: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * distance,
    y: Math.sin(pitch) * distance,
    z: Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));
}

/** rotation.y qui fait regarder le modèle dans la direction visée par la caméra */
export function aimFacing(yaw: number): number {
  return yaw + Math.PI;
}
```

`client/src/game/animations.ts` :
```ts
import type { WeaponType } from '@rpg/shared';

export const ATTACK_ANIMATIONS: Record<WeaponType, string> = {
  sword: '1H_Melee_Attack_Slice_Horizontal',
  shovel: '2H_Melee_Attack_Slice',
  axe: '2H_Melee_Attack_Chop',
  spear: '2H_Melee_Attack_Stab',
  mace: '2H_Melee_Attack_Spin',
  bow: '2H_Ranged_Shoot',
  crossbow: '2H_Ranged_Shoot',
};

export const ROLL_ANIMATION = 'Dodge_Forward';

export interface AnimState {
  rolling: boolean;
  attacking: boolean;
  moving: boolean;
  weapon: WeaponType;
}

export function chooseAnimation(s: AnimState): { name: string; once: boolean } {
  if (s.rolling) return { name: ROLL_ANIMATION, once: true };
  if (s.attacking) return { name: ATTACK_ANIMATIONS[s.weapon], once: true };
  if (s.moving) return { name: 'Running_A', once: false };
  return { name: s.weapon === 'sword' ? 'Idle' : '2H_Melee_Idle', once: false };
}
```

`client/src/game/forgeView.ts` :
```ts
import {
  ENCHANT_EFFECTS,
  WEAPONS,
  enchantSlotCount,
  upgradeCost,
  type CharacterDetail,
  type Enchant,
  type UpgradeCost,
  type WeaponState,
  type WeaponType,
} from '@rpg/shared';

export interface WeaponRowView {
  type: WeaponType;
  label: string;
  level: number;
  maxed: boolean;
  cost: UpgradeCost | null;
  affordable: boolean;
  enchants: WeaponState['enchants'];
  slotCount: 1 | 2;
}

export function forgeRows(c: CharacterDetail): WeaponRowView[] {
  return c.weapons.map((w) => {
    const cost = upgradeCost(w.level);
    return {
      type: w.type,
      label: WEAPONS[w.type].label,
      level: w.level,
      maxed: cost === null,
      cost,
      affordable: cost !== null && c.gold >= cost.gold && c.materials >= cost.materials,
      enchants: w.enchants,
      slotCount: enchantSlotCount(w.level),
    };
  });
}

const ROMAN = ['I', 'II', 'III'] as const;

export function enchantLabel(e: Enchant | null): string {
  return e ? `${ENCHANT_EFFECTS[e.element].label} ${ROMAN[e.rank - 1]}` : 'Vide';
}
```

`client/src/ui/labels.ts` :
```ts
import type { BaseModel } from '@rpg/shared';

export const BASE_LABELS: Record<BaseModel, string> = {
  knight: 'Chevalier',
  barbarian: 'Barbare',
  mage: 'Mage',
  rogue: 'Voleur',
  rogue_hooded: 'Voleur encapuchonné',
};
```

- [ ] **Step 4: Lancer tests et typecheck**

Run: `npm test -w client && npm run typecheck -w client`
Expected: tout PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add client/src client/test
git commit -m "feat(client): logique pure (pièces, caméra, animations, forge)"
```

---

### Task 5: Rendu 3D du personnage, des armes et aperçu

**Files:**
- Create: `client/src/three/weaponModels.ts`, `client/src/three/characterModel.ts`, `client/src/three/preview.ts`

**Interfaces:**
- Consumes: `classifyPart`, `isPartVisible`, `MODEL_FILES` (Task 4)
- Produces :
  - `createWeaponModel(type: WeaponType): Promise<THREE.Object3D>` (déjà orienté pour `handslot.r`)
  - `class CharacterModel { readonly root: THREE.Object3D; static create(a: Appearance): Promise<CharacterModel>; applyAppearance(a: Appearance): void; setWeapon(t: WeaponType): Promise<void>; play(name: string, opts?: { once?: boolean; restart?: boolean; duration?: number }): void; update(dt: number): void; dispose(): void }`
  - `interface Preview { show(a: Appearance): Promise<void>; dispose(): void }`, `createPreview(container: HTMLElement): Preview`

Ces modules dépendent de WebGL/du chargement d'assets : ils sont vérifiés par le typecheck ici et visuellement à la Task 6.

- [ ] **Step 1: Modèles d'armes**

`client/src/three/weaponModels.ts` :
```ts
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WeaponType } from '@rpg/shared';

const GLTF_FILES: Partial<Record<WeaponType, string>> = {
  sword: 'sword_1handed.gltf',
  axe: 'axe_2handed.gltf',
  crossbow: 'crossbow_2handed.gltf',
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.8, flatShading: true });
const metal = new THREE.MeshStandardMaterial({ color: '#b8c0c8', metalness: 0.6, roughness: 0.35, flatShading: true });
const dark = new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.4, roughness: 0.5, flatShading: true });
const cord = new THREE.MeshStandardMaterial({ color: '#e8e0c8', roughness: 0.9 });

function piece(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Armes absentes du pack KayKit : low-poly, poignée à l'origine, lame vers +Y. */
function buildProcedural(type: WeaponType): THREE.Object3D {
  const g = new THREE.Group();
  switch (type) {
    case 'shovel':
      g.add(piece(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), wood, 0, 0.55));
      g.add(piece(new THREE.BoxGeometry(0.42, 0.5, 0.05), metal, 0, 1.45));
      g.add(piece(new THREE.BoxGeometry(0.26, 0.07, 0.07), wood, 0, -0.2));
      break;
    case 'spear':
      g.add(piece(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 6), wood, 0, 0.7));
      g.add(piece(new THREE.ConeGeometry(0.12, 0.4, 6), metal, 0, 2));
      break;
    case 'mace': {
      g.add(piece(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), wood, 0, 0.35));
      g.add(piece(new THREE.IcosahedronGeometry(0.25, 0), dark, 0, 1));
      const spike = new THREE.ConeGeometry(0.06, 0.22, 4);
      const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0]];
      for (const [x, y, z] of dirs) {
        const s = piece(spike, metal, x * 0.3, 1 + y * 0.3, z * 0.3);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize());
        g.add(s);
      }
      break;
    }
    case 'bow': {
      // demi-tore tourné : bombé vers +X, extrémités en y = ±0,8 ; le milieu (la poignée) à l'origine
      const arc = piece(new THREE.TorusGeometry(0.8, 0.04, 6, 16, Math.PI), wood, -0.8, 0);
      arc.rotation.z = -Math.PI / 2;
      g.add(arc);
      g.add(piece(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), cord, -0.8, 0));
      break;
    }
    default:
      g.add(piece(new THREE.BoxGeometry(0.1, 1, 0.1), metal, 0, 0.5));
  }
  return g;
}

export async function createWeaponModel(type: WeaponType): Promise<THREE.Object3D> {
  const file = GLTF_FILES[type];
  if (!file) return buildProcedural(type);
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(`/assets/weapons/${file}`);
    cache.set(file, p);
  }
  const scene = (await p).scene.clone();
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return scene;
}
```

- [ ] **Step 2: Modèle de personnage**

`client/src/three/characterModel.ts` :
```ts
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Appearance, BaseModel, WeaponType } from '@rpg/shared';
import { MODEL_FILES, classifyPart, isPartVisible } from './parts';
import { createWeaponModel } from './weaponModels';

const loader = new GLTFLoader();
const cache = new Map<BaseModel, Promise<GLTF>>();
const FADE = 0.15;
/** placement des armes dans `handslot.r`, identique aux armes intégrées des persos KayKit */
const WEAPON_OFFSET_Y = 0.0333;

function loadBase(base: BaseModel): Promise<GLTF> {
  let p = cache.get(base);
  if (!p) {
    p = loader.loadAsync(`/assets/characters/${MODEL_FILES[base]}`);
    cache.set(base, p);
  }
  return p;
}

export interface PlayOptions {
  once?: boolean;
  /** relance l'animation même si elle joue déjà */
  restart?: boolean;
  /** accélère l'animation pour qu'elle tienne dans cette durée (s) ; ne la ralentit jamais */
  duration?: number;
}

export class CharacterModel {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly weaponSlot: THREE.Object3D;
  private readonly baseMaterials = new Map<THREE.Mesh, THREE.Material>();
  private current: THREE.AnimationAction | null = null;
  private weapon: THREE.Object3D | null = null;
  private weaponRequest = 0;

  private constructor(gltf: GLTF) {
    this.root = cloneSkinned(gltf.scene);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.weaponSlot = this.root.getObjectByName('handslot.r') ?? this.root;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      this.baseMaterials.set(mesh, mesh.material as THREE.Material);
    });
  }

  static async create(appearance: Appearance): Promise<CharacterModel> {
    const model = new CharacterModel(await loadBase(appearance.base));
    model.applyAppearance(appearance);
    return model;
  }

  /** Visibilité des pièces et teinte de la tenue ; le modèle de base ne change pas ici. */
  applyAppearance(a: Appearance): void {
    const tint = new THREE.Color(a.outfitColor);
    for (const [mesh, baseMat] of this.baseMaterials) {
      const kind = classifyPart(mesh.name);
      mesh.visible = isPartVisible(kind, a);
      if (mesh.material !== baseMat) (mesh.material as THREE.Material).dispose();
      if (kind === 'outfit' || kind === 'cape') {
        const tinted = (baseMat as THREE.MeshStandardMaterial).clone();
        tinted.color.copy(tint);
        mesh.material = tinted;
      } else {
        mesh.material = baseMat;
      }
    }
  }

  /** Remplace l'arme en main ; seule la dernière demande est appliquée si plusieurs se chevauchent. */
  async setWeapon(type: WeaponType): Promise<void> {
    const request = ++this.weaponRequest;
    const obj = await createWeaponModel(type);
    if (request !== this.weaponRequest) return;
    if (this.weapon) this.weaponSlot.remove(this.weapon);
    obj.position.set(0, WEAPON_OFFSET_Y, 0);
    obj.rotation.set(0, Math.PI, 0);
    this.weaponSlot.add(obj);
    this.weapon = obj;
  }

  play(name: string, opts: PlayOptions = {}): void {
    const next = this.actions.get(name);
    if (!next || (next === this.current && !opts.restart)) return;
    next.reset();
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    const clipDuration = next.getClip().duration;
    next.timeScale = opts.duration ? Math.max(1, clipDuration / opts.duration) : 1;
    if (this.current && this.current !== next) {
      this.current.fadeOut(FADE);
      next.fadeIn(FADE);
    } else {
      next.setEffectiveWeight(1);
    }
    next.play();
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const [mesh, baseMat] of this.baseMaterials) {
      if (mesh.material !== baseMat) (mesh.material as THREE.Material).dispose();
    }
    this.root.removeFromParent();
  }
}
```

- [ ] **Step 3: Aperçu pour l'éditeur**

`client/src/three/preview.ts` :
```ts
import * as THREE from 'three';
import type { Appearance, BaseModel } from '@rpg/shared';
import { CharacterModel } from './characterModel';

export interface Preview {
  show(a: Appearance): Promise<void>;
  dispose(): void;
}

export function createPreview(container: HTMLElement): Preview {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 1.6));
  const sun = new THREE.DirectionalLight('#fff3d6', 2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshStandardMaterial({ color: '#2d3a4a' }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 2, 6.5);
  camera.lookAt(0, 1.2, 0);

  let model: CharacterModel | null = null;
  let base: BaseModel | null = null;
  let request = 0;

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (model) {
      model.root.rotation.y += dt * 0.5;
      model.update(dt);
    }
    renderer.render(scene, camera);
  };
  tick();

  return {
    async show(a) {
      const r = ++request;
      if (model && base === a.base) {
        model.applyAppearance(a);
        return;
      }
      const next = await CharacterModel.create(a);
      if (r !== request) {
        next.dispose();
        return;
      }
      const rotation = model?.root.rotation.y ?? 0.4;
      model?.dispose();
      model = next;
      base = a.base;
      model.root.rotation.y = rotation;
      scene.add(model.root);
      model.play('Idle');
      await model.setWeapon('sword');
    },
    dispose() {
      request++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      model?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w client && npm test -w client`
Expected: typecheck sans erreur ; tests toujours PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/three
git commit -m "feat(client): modèles 3D du perso, des armes et aperçu"
```

---

### Task 6: Écrans de connexion, de persos et éditeur

**Files:**
- Create: `client/src/ui/dom.ts`, `client/src/ui/context.ts`, `client/src/ui/authScreen.ts`, `client/src/ui/charactersScreen.ts`, `client/src/ui/editorScreen.ts`, `client/src/ui/style.css`, `client/src/main.ts`

**Interfaces:**
- Consumes: `createApi`, `ApiError`, `Api` (Task 3) ; `createSession`, `browserStorage`, `Session` (Task 3) ; `createPreview` (Task 5) ; `BASE_LABELS` (Task 4)
- Produces :
  - `h(tag, props?, ...children): HTMLElement` ; `errorMessage(e: unknown): string`
  - `type Route = { name: 'auth' } | { name: 'characters' } | { name: 'editor'; character?: CharacterDetail } | { name: 'game'; character: CharacterDetail }`
  - `interface AppContext { api: Api; session: Session; go(route: Route): void }`
  - `renderAuth(root, ctx): void`, `renderCharacters(root, ctx): Promise<void>`, `renderEditor(root, ctx, existing?): () => void`
  - `main.ts` route `game` vers `startGame` (Task 7) — à cette Task, la route `game` affiche un écran provisoire « Le jeu arrive à la Task 7 » avec un bouton retour.

- [ ] **Step 1: Utilitaires DOM et contexte**

`client/src/ui/dom.ts` :
```ts
import { ApiError } from '../api';

type Child = Node | string | null | undefined | false;

/** Crée un élément ; `onxxx` = écouteur, sinon propriété DOM si elle existe, sinon attribut. `false`/`null` sont ignorés. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key in el) {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Erreur inattendue';
}
```

`client/src/ui/context.ts` :
```ts
import type { CharacterDetail } from '@rpg/shared';
import type { Api } from '../api';
import type { Session } from '../session';

export type Route =
  | { name: 'auth' }
  | { name: 'characters' }
  | { name: 'editor'; character?: CharacterDetail }
  | { name: 'game'; character: CharacterDetail };

export interface AppContext {
  api: Api;
  session: Session;
  go(route: Route): void;
}
```

- [ ] **Step 2: Écran de connexion**

`client/src/ui/authScreen.ts` :
```ts
import type { AppContext } from './context';
import { errorMessage, h } from './dom';

export function renderAuth(root: HTMLElement, ctx: AppContext): void {
  let mode: 'login' | 'register' = 'login';

  const username = h('input', { placeholder: 'Pseudo', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password', required: true });
  const hint = h('p', { class: 'hint', hidden: true }, 'Pseudo : 3 à 20 lettres, chiffres ou _ · Mot de passe : 8 caractères minimum');
  const error = h('p', { class: 'error' });
  const submit = h('button', { type: 'submit' }, 'Se connecter');
  const toggle = h('button', { type: 'button', class: 'link' }, "Pas encore de compte ? S'inscrire");

  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    submit.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    toggle.textContent = mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter';
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    hint.hidden = mode === 'login';
    error.textContent = '';
  });

  const form = h(
    'form',
    {
      class: 'panel auth',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          const res =
            mode === 'login'
              ? await ctx.api.login(username.value, password.value)
              : await ctx.api.register(username.value, password.value);
          ctx.session.save(res.token, res.username);
          ctx.go({ name: 'characters' });
        } catch (err) {
          error.textContent = errorMessage(err);
        } finally {
          submit.disabled = false;
        }
      },
    },
    h('h1', {}, 'RPG Online'),
    username,
    password,
    hint,
    error,
    submit,
    toggle,
  );

  root.append(h('div', { class: 'screen' }, form));
  username.focus();
}
```

- [ ] **Step 3: Écran des personnages**

`client/src/ui/charactersScreen.ts` :
```ts
import { MAX_CHARACTERS, type CharacterDetail, type CharacterSummary } from '@rpg/shared';
import type { AppContext } from './context';
import { errorMessage, h } from './dom';
import { BASE_LABELS } from './labels';

export async function renderCharacters(root: HTMLElement, ctx: AppContext): Promise<void> {
  const list = h('div', { class: 'char-list' }, h('p', { class: 'hint' }, 'Chargement…'));
  const error = h('p', { class: 'error' });

  const withDetail = async (id: number, then: (c: CharacterDetail) => void) => {
    error.textContent = '';
    try {
      then(await ctx.api.getCharacter(id));
    } catch (e) {
      error.textContent = errorMessage(e);
    }
  };

  const card = (c: CharacterSummary) =>
    h(
      'div',
      { class: 'card' },
      h('h3', {}, c.name),
      h('p', { class: 'hint' }, `${BASE_LABELS[c.appearance.base]} · meilleure vague : ${c.bestWave}`),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => withDetail(c.id, (d) => ctx.go({ name: 'game', character: d })) }, 'Jouer'),
        h('button', { class: 'secondary', onclick: () => withDetail(c.id, (d) => ctx.go({ name: 'editor', character: d })) }, 'Modifier'),
        h(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              if (!confirm(`Supprimer ${c.name} ? Cette action est définitive.`)) return;
              try {
                await ctx.api.deleteCharacter(c.id);
                ctx.go({ name: 'characters' });
              } catch (e) {
                error.textContent = errorMessage(e);
              }
            },
          },
          'Supprimer',
        ),
      ),
    );

  root.append(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'panel wide' },
        h(
          'header',
          { class: 'row spread' },
          h('h1', {}, 'Mes personnages'),
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'hint' }, ctx.session.username ?? ''),
            h('button', { class: 'secondary', onclick: () => { ctx.session.clear(); ctx.go({ name: 'auth' }); } }, 'Déconnexion'),
          ),
        ),
        list,
        error,
      ),
    ),
  );

  try {
    const characters = await ctx.api.listCharacters();
    list.replaceChildren(
      ...characters.map(card),
      characters.length < MAX_CHARACTERS
        ? h('button', { class: 'card new', onclick: () => ctx.go({ name: 'editor' }) }, '+ Nouveau personnage')
        : h('p', { class: 'hint' }, `Maximum de ${MAX_CHARACTERS} personnages atteint.`),
    );
  } catch (e) {
    list.replaceChildren();
    error.textContent = errorMessage(e);
  }
}
```

- [ ] **Step 4: Éditeur**

`client/src/ui/editorScreen.ts` :
```ts
import { BASE_MODELS, DEFAULT_APPEARANCE, type Appearance, type CharacterDetail } from '@rpg/shared';
import { createPreview } from '../three/preview';
import type { AppContext } from './context';
import { errorMessage, h } from './dom';
import { BASE_LABELS } from './labels';

export function renderEditor(root: HTMLElement, ctx: AppContext, existing?: CharacterDetail): () => void {
  let appearance: Appearance = { ...(existing?.appearance ?? DEFAULT_APPEARANCE) };

  const previewBox = h('div', { class: 'preview' });
  const preview = createPreview(previewBox);
  const bases = h('div', { class: 'choices' });

  const renderBases = () =>
    bases.replaceChildren(
      ...BASE_MODELS.map((b) =>
        h('button', { type: 'button', class: b === appearance.base ? 'choice active' : 'choice', onclick: () => update({ base: b }) }, BASE_LABELS[b]),
      ),
    );

  const update = (patch: Partial<Appearance>) => {
    appearance = { ...appearance, ...patch };
    renderBases();
    void preview.show(appearance);
  };

  const name = h('input', { value: existing?.name ?? '', placeholder: 'Nom du personnage', maxLength: 16, disabled: !!existing });
  const color = h('input', { type: 'color', value: appearance.outfitColor });
  color.addEventListener('input', () => update({ outfitColor: color.value }));
  const headgear = h('input', { type: 'checkbox', checked: appearance.headgear });
  headgear.addEventListener('change', () => update({ headgear: headgear.checked }));
  const cape = h('input', { type: 'checkbox', checked: appearance.cape });
  cape.addEventListener('change', () => update({ cape: cape.checked }));
  const resetColor = h('button', { type: 'button', class: 'link', onclick: () => { color.value = '#ffffff'; update({ outfitColor: '#ffffff' }); } }, 'couleurs d’origine');

  const error = h('p', { class: 'error' });
  const save = h('button', {}, existing ? 'Enregistrer' : 'Créer');
  save.addEventListener('click', async () => {
    error.textContent = '';
    save.disabled = true;
    try {
      if (existing) await ctx.api.updateAppearance(existing.id, appearance);
      else await ctx.api.createCharacter(name.value, appearance);
      ctx.go({ name: 'characters' });
    } catch (e) {
      error.textContent = errorMessage(e);
    } finally {
      save.disabled = false;
    }
  });

  root.append(
    h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'panel editor' },
        previewBox,
        h(
          'div',
          { class: 'form' },
          h('h1', {}, existing ? `Modifier ${existing.name}` : 'Nouveau personnage'),
          name,
          h('label', {}, 'Modèle'),
          bases,
          h('label', { class: 'row' }, 'Teinte de la tenue ', color, resetColor),
          h('label', { class: 'row' }, headgear, 'Chapeau / casque'),
          h('label', { class: 'row' }, cape, 'Cape'),
          error,
          h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => ctx.go({ name: 'characters' }) }, 'Annuler'), save),
        ),
      ),
    ),
  );

  renderBases();
  void preview.show(appearance);
  if (!existing) name.focus();
  return () => preview.dispose();
}
```

- [ ] **Step 5: Styles et point d'entrée**

`client/src/ui/style.css` :
```css
:root {
  --bg: #12161f;
  --panel: #1c2230;
  --panel-2: #252d3f;
  --text: #e8e6e1;
  --muted: #9aa3b5;
  --accent: #e0a24a;
  --accent-text: #1a1206;
  --danger: #d9534f;
  --radius: 10px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
h1 { margin: 0 0 12px; font-size: 1.6rem; }
h2 { margin: 0 0 12px; }
h3 { margin: 0; }
button {
  font: inherit; cursor: pointer; border: 0; border-radius: var(--radius);
  padding: 8px 14px; background: var(--accent); color: var(--accent-text); font-weight: 600;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { background: var(--panel-2); color: var(--text); }
button.danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
button.link { background: none; color: var(--muted); padding: 0; font-weight: normal; text-decoration: underline; }
input, select {
  font: inherit; color: var(--text); background: var(--panel-2); border: 1px solid #3a4560;
  border-radius: var(--radius); padding: 8px 10px;
}
input[type='color'] { padding: 2px; width: 48px; height: 34px; }
.screen { min-height: 100%; display: grid; place-items: center; padding: 16px; }
.panel { background: var(--panel); border-radius: 14px; padding: 24px; box-shadow: 0 10px 40px #0008; }
.panel.auth { display: flex; flex-direction: column; gap: 10px; width: min(360px, 100%); }
.panel.wide { width: min(820px, 100%); }
.panel.editor { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; width: min(900px, 100%); }
.panel.editor .form { display: flex; flex-direction: column; gap: 10px; }
.preview { min-height: 380px; border-radius: var(--radius); background: radial-gradient(circle at 50% 40%, #2f3b52, #161b26); overflow: hidden; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.row.spread { justify-content: space-between; }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice { background: var(--panel-2); color: var(--text); font-weight: normal; }
.choice.active { background: var(--accent); color: var(--accent-text); font-weight: 600; }
.char-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin-top: 12px; }
.card { background: var(--panel-2); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.card.new { color: var(--muted); border: 2px dashed #3a4560; background: transparent; min-height: 120px; font-weight: 600; }
.hint { color: var(--muted); margin: 0; font-size: 0.9rem; }
.error { color: var(--danger); margin: 0; min-height: 1.2em; }
.game { position: fixed; inset: 0; }
.game canvas { display: block; }
.overlay { position: absolute; inset: 0; display: grid; place-items: center; background: #0009; padding: 16px; }
.overlay[hidden] { display: none; }
.overlay .panel { display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
.hud { position: absolute; inset: 0; pointer-events: none; }
.crosshair { position: absolute; left: 50%; top: 45%; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: #fff; box-shadow: 0 0 4px #000; }
.prompt { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); background: #000a; padding: 6px 14px; border-radius: var(--radius); }
.weapon-bar { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 6px; }
.slot { background: #000a; border: 2px solid transparent; border-radius: 8px; padding: 6px 8px; min-width: 86px; text-align: center; font-size: 0.8rem; display: flex; flex-direction: column; }
.slot.active { border-color: var(--accent); }
.slot .key { color: var(--accent); font-weight: 700; }
.slot .lvl { color: var(--muted); }
.panel.forge { width: min(860px, 100%); max-height: 90vh; overflow: auto; }
.forge-row { display: grid; grid-template-columns: 160px 210px 1fr 1fr; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid #2c3548; }
.enchant { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.enchant .current { min-width: 92px; }
.locked { color: var(--muted); }
@media (max-width: 720px) {
  .panel.editor { grid-template-columns: 1fr; }
  .forge-row { grid-template-columns: 1fr; }
}
```

`client/src/main.ts` (version provisoire, la route `game` sera branchée à la Task 7) :
```ts
import './ui/style.css';
import { createApi } from './api';
import { browserStorage, createSession } from './session';
import { renderAuth } from './ui/authScreen';
import { renderCharacters } from './ui/charactersScreen';
import type { AppContext, Route } from './ui/context';
import { h } from './ui/dom';
import { renderEditor } from './ui/editorScreen';

const app = document.getElementById('app')!;
const session = createSession(browserStorage());
const api = createApi({
  getToken: () => session.token,
  onUnauthorized: () => {
    session.clear();
    go({ name: 'auth' });
  },
});

let dispose: (() => void) | null = null;
let navigation = 0;

async function show(route: Route): Promise<void> {
  const id = ++navigation;
  dispose?.();
  dispose = null;
  app.replaceChildren();
  const ctx: AppContext = { api, session, go };

  switch (route.name) {
    case 'auth':
      renderAuth(app, ctx);
      break;
    case 'characters':
      await renderCharacters(app, ctx);
      break;
    case 'editor':
      dispose = renderEditor(app, ctx, route.character);
      break;
    case 'game':
      app.append(
        h('div', { class: 'screen' }, h('div', { class: 'panel' }, h('p', {}, `Le jeu arrive à la Task 7 (${route.character.name}).`), h('button', { onclick: () => go({ name: 'characters' }) }, 'Retour'))),
      );
      break;
  }
  if (id !== navigation) return;
}

function go(route: Route): void {
  void show(route);
}

go(session.token ? { name: 'characters' } : { name: 'auth' });
```

- [ ] **Step 6: Typecheck et tests**

Run: `npm run typecheck -w client && npm test -w client`
Expected: typecheck sans erreur ; tests PASS.

- [ ] **Step 7: Vérification dans le navigateur**

Run: `npm run dev` (serveur + client).
Ouvrir `http://localhost:5173` et vérifier :
1. Inscription d'un compte → arrivée sur « Mes personnages » (liste vide + « Nouveau personnage »).
2. Éditeur : l'aperçu 3D affiche le chevalier qui tourne, épée en main ; changer de modèle, de teinte, masquer chapeau/cape → l'aperçu suit.
3. Créer → la carte apparaît ; « Modifier » rouvre l'éditeur avec l'apparence enregistrée ; « Supprimer » demande confirmation.
4. Recharger la page → toujours connecté ; « Déconnexion » → écran de connexion.
5. Mauvais mot de passe → « Pseudo ou mot de passe incorrect ».
6. Aucune erreur dans la console du navigateur.

- [ ] **Step 8: Commit**

```bash
git add client/src
git commit -m "feat(client): écrans de connexion, de personnages et éditeur 3D"
```

---

### Task 7: Scène de jeu (map, contrôles, armes, forge)

**Files:**
- Create: `client/src/game/world.ts`, `client/src/game/input.ts`, `client/src/game/hud.ts`, `client/src/game/forgePanel.ts`, `client/src/game/game.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Consumes: `generateMap`, `stepMotion`, `newMotion`, `SPAWN_POS`, `FORGE_POS`, `ENCHANTER_POS`, `ROLL_DURATION`, `NO_INPUT`, `weaponAttacksPerSec`, `WEAPON_TYPES`, `WEAPONS`, `ELEMENTS`, `ENCHANT_EFFECTS` (shared) ; `CharacterModel` (Task 5) ; `cameraOffset`, `clampPitch`, `aimFacing`, `CAMERA_DISTANCE`, `TARGET_HEIGHT`, `chooseAnimation`, `ATTACK_ANIMATIONS`, `ROLL_ANIMATION`, `forgeRows`, `enchantLabel` (Task 4) ; `h`, `errorMessage` (Task 6) ; `Api` (Task 3)
- Produces :
  - `buildWorld(scene: THREE.Scene, map: GameMap): { update(dt: number): void }`
  - `createInput(target: HTMLElement)` → `{ moveInput(): MoveInput; consumeMouse(): { dx; dy }; consumeAttack(): boolean; consumePressed(code: string): boolean; isLocked(): boolean; lock(): void; unlock(): void; onLockChange(cb: (locked: boolean) => void): void; dispose(): void }`
  - `createHud(root)` → `{ setWeapons(c: CharacterDetail, current: WeaponType): void; setPrompt(text: string | null): void; destroy(): void }`
  - `openForgePanel(root, { character, api, onChange, onClose }): () => void`
  - `startGame(root: HTMLElement, opts: { character: CharacterDetail; api: Api; onQuit(): void }): Promise<() => void>`

- [ ] **Step 1: Le monde**

`client/src/game/world.ts` :
```ts
import * as THREE from 'three';
import { ENCHANTER_POS, FORGE_POS, MAP_HALF_SIZE, SAFE_RADIUS, type Decoration, type GameMap } from '@rpg/shared';

const SKY = '#9fd3f0';

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Decoration[], y: (d: Decoration) => number, scale = 1) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  items.forEach((d, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotation);
    s.setScalar(d.scale * scale);
    p.set(d.x, y(d), d.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildForge(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#7b7f87', flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: '#2f3238', metalness: 0.5, roughness: 0.5 });
  const ember = new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 2 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  add(new THREE.BoxGeometry(3, 1, 2.4), stone, 0, 0.5, 0);
  add(new THREE.BoxGeometry(1.2, 3.2, 1.2), stone, -0.9, 1.6, -0.6);
  add(new THREE.BoxGeometry(0.9, 0.25, 0.7), ember, -0.9, 1.05, 0.15);
  add(new THREE.BoxGeometry(0.9, 0.45, 0.45), iron, 0.8, 1.25, 0.3);
  add(new THREE.BoxGeometry(0.4, 0.3, 0.3), iron, 0.8, 0.85, 0.3);
  const light = new THREE.PointLight('#ff8a3a', 8, 7);
  light.position.set(-0.9, 1.6, 0.6);
  g.add(light);
  return g;
}

function buildEnchanter(): { group: THREE.Group; crystal: THREE.Mesh } {
  const g = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.8, 1, 8),
    new THREE.MeshStandardMaterial({ color: '#5a5f6b', flatShading: true }),
  );
  pedestal.position.y = 0.5;
  pedestal.castShadow = true;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    new THREE.MeshStandardMaterial({ color: '#b07cff', emissive: '#7a3cff', emissiveIntensity: 1.5, flatShading: true }),
  );
  crystal.position.y = 1.7;
  const light = new THREE.PointLight('#a070ff', 5, 6);
  light.position.y = 1.7;
  g.add(pedestal, crystal, light);
  return { group: g, crystal };
}

export function buildWorld(scene: THREE.Scene, map: GameMap): { update(dt: number): void } {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 110);

  scene.add(new THREE.HemisphereLight('#ffffff', '#4a6b3a', 1.2));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.2);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = MAP_HALF_SIZE + 5;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF_SIZE * 2 + 80, MAP_HALF_SIZE * 2 + 80),
    new THREE.MeshStandardMaterial({ color: '#6fa35a' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(SAFE_RADIUS - 2, 40), new THREE.MeshStandardMaterial({ color: '#b49a6c' }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a4f2a', flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8a3a', flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8f94', flatShading: true });
  scene.add(instanced(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 6), trunkMat, map.trees, (d) => 0.7 * d.scale));
  scene.add(instanced(new THREE.ConeGeometry(1.3, 2.8, 7), leafMat, map.trees, (d) => 2.6 * d.scale));
  scene.add(instanced(new THREE.DodecahedronGeometry(0.8, 0), rockMat, map.rocks, (d) => 0.35 * d.scale));

  const forge = buildForge();
  forge.position.set(FORGE_POS.x, 0, FORGE_POS.z);
  scene.add(forge);

  const enchanter = buildEnchanter();
  enchanter.group.position.set(ENCHANTER_POS.x, 0, ENCHANTER_POS.z);
  scene.add(enchanter.group);

  let time = 0;
  return {
    update(dt) {
      time += dt;
      enchanter.crystal.rotation.y = time;
      enchanter.crystal.position.y = 1.7 + Math.sin(time * 2) * 0.12;
    },
  };
}
```

- [ ] **Step 2: Entrées clavier/souris**

`client/src/game/input.ts` :
```ts
import type { MoveInput } from '@rpg/shared';

/** Touches lues par position physique (`code`) : ZQSD en AZERTY = WASD en QWERTY. */
export function createInput(target: HTMLElement) {
  const held = new Set<string>();
  const pressed = new Set<string>();
  let dx = 0;
  let dy = 0;
  let attack = false;
  const lockListeners: ((locked: boolean) => void)[] = [];

  const isLocked = () => document.pointerLockElement === target;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    held.add(e.code);
    if (!e.repeat) pressed.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onMouseMove = (e: MouseEvent) => {
    if (!isLocked()) return;
    dx += e.movementX;
    dy += e.movementY;
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && isLocked()) attack = true;
  };
  const onLockChange = () => {
    if (!isLocked()) held.clear();
    for (const cb of lockListeners) cb(isLocked());
  };
  const onBlur = () => held.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    moveInput(): MoveInput {
      return {
        forward: held.has('KeyW'),
        back: held.has('KeyS'),
        left: held.has('KeyA'),
        right: held.has('KeyD'),
        roll: pressed.delete('Space'),
      };
    },
    consumeMouse() {
      const out = { dx, dy };
      dx = 0;
      dy = 0;
      return out;
    },
    consumeAttack() {
      const out = attack;
      attack = false;
      return out;
    },
    consumePressed(code: string) {
      return pressed.delete(code);
    },
    isLocked,
    lock() {
      void Promise.resolve(target.requestPointerLock()).catch(() => undefined);
    },
    unlock() {
      if (isLocked()) document.exitPointerLock();
    },
    onLockChange(cb: (locked: boolean) => void) {
      lockListeners.push(cb);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (isLocked()) document.exitPointerLock();
    },
  };
}

export type Input = ReturnType<typeof createInput>;
```

- [ ] **Step 3: HUD**

`client/src/game/hud.ts` :
```ts
import { WEAPONS, type CharacterDetail, type WeaponType } from '@rpg/shared';
import { h } from '../ui/dom';

export function createHud(root: HTMLElement) {
  const bar = h('div', { class: 'weapon-bar' });
  const prompt = h('div', { class: 'prompt', hidden: true });
  const el = h('div', { class: 'hud' }, h('div', { class: 'crosshair' }), prompt, bar);
  root.append(el);

  return {
    setWeapons(c: CharacterDetail, current: WeaponType) {
      bar.replaceChildren(
        ...c.weapons.map((w, i) =>
          h(
            'div',
            { class: w.type === current ? 'slot active' : 'slot' },
            h('span', { class: 'key' }, String(i + 1)),
            h('span', {}, WEAPONS[w.type].label),
            h('span', { class: 'lvl' }, `Niv. ${w.level}`),
          ),
        ),
      );
    },
    setPrompt(text: string | null) {
      prompt.hidden = text === null;
      if (text !== null && prompt.textContent !== text) prompt.textContent = text;
    },
    destroy() {
      el.remove();
    },
  };
}
```

- [ ] **Step 4: Panneau de forge**

`client/src/game/forgePanel.ts` :
```ts
import { ELEMENTS, ENCHANT_EFFECTS, type CharacterDetail, type Element } from '@rpg/shared';
import type { Api } from '../api';
import { errorMessage, h } from '../ui/dom';
import { enchantLabel, forgeRows, type WeaponRowView } from './forgeView';

export interface ForgePanelOptions {
  character: CharacterDetail;
  api: Api;
  onChange(c: CharacterDetail): void;
  onClose(): void;
}

/** Ouvre le panneau ; renvoie une fonction qui le ferme sans appeler `onClose`. */
export function openForgePanel(root: HTMLElement, opts: ForgePanelOptions): () => void {
  let current = opts.character;
  let busy = false;

  const wallet = h('p', { class: 'hint' });
  const body = h('div');
  const message = h('p', { class: 'error' });

  const remove = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const close = () => {
    remove();
    opts.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyE') {
      e.preventDefault();
      close();
    }
  };

  const run = async (action: () => Promise<CharacterDetail>) => {
    if (busy) return;
    busy = true;
    message.textContent = '';
    try {
      current = await action();
      opts.onChange(current);
      render();
    } catch (e) {
      message.textContent = errorMessage(e);
    } finally {
      busy = false;
    }
  };

  const enchantControl = (row: WeaponRowView, slot: 0 | 1) => {
    if (slot >= row.slotCount) return h('span', { class: 'locked' }, '🔒 2e emplacement au niveau 7');
    const select = h('select', {}, ...ELEMENTS.map((el) => h('option', { value: el }, ENCHANT_EFFECTS[el].label)));
    const existing = row.enchants[slot];
    if (existing) select.value = existing.element;
    return h(
      'span',
      { class: 'enchant' },
      h('span', { class: 'current' }, enchantLabel(existing)),
      select,
      h('button', { class: 'secondary', onclick: () => run(() => opts.api.enchantWeapon(current.id, row.type, slot, select.value as Element)) }, 'Enchanter'),
    );
  };

  const upgradeLabel = (row: WeaponRowView) => {
    if (!row.cost) return 'Niveau max';
    const mats = row.cost.materials ? ` + ${row.cost.materials} mat.` : '';
    return `Améliorer (${row.cost.gold} or${mats})`;
  };

  const render = () => {
    const s = current.stones;
    wallet.textContent = `Or : ${current.gold} · Matériaux : ${current.materials} · Pierres : 🔥 ${s.fire}  ⚡ ${s.lightning}  ☠️ ${s.poison}  ❄️ ${s.ice}`;
    body.replaceChildren(
      ...forgeRows(current).map((row) =>
        h(
          'div',
          { class: 'forge-row' },
          h('strong', {}, `${row.label} · niv. ${row.level}`),
          h('button', { disabled: row.maxed, onclick: () => run(() => opts.api.upgradeWeapon(current.id, row.type)) }, upgradeLabel(row)),
          enchantControl(row, 0),
          enchantControl(row, 1),
        ),
      ),
    );
  };

  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel forge' },
      h('h2', {}, 'Forge & enchantements'),
      wallet,
      body,
      message,
      h('button', { class: 'secondary', onclick: close }, 'Fermer (E)'),
    ),
  );

  render();
  root.append(overlay);
  document.addEventListener('keydown', onKey);
  return remove;
}
```

- [ ] **Step 5: Boucle de jeu**

`client/src/game/game.ts` :
```ts
import * as THREE from 'three';
import {
  ENCHANTER_POS,
  FORGE_POS,
  NO_INPUT,
  ROLL_DURATION,
  SPAWN_POS,
  WEAPON_TYPES,
  generateMap,
  newMotion,
  stepMotion,
  weaponAttacksPerSec,
  type CharacterDetail,
  type WeaponType,
} from '@rpg/shared';
import type { Api } from '../api';
import { CharacterModel } from '../three/characterModel';
import { h } from '../ui/dom';
import { ATTACK_ANIMATIONS, ROLL_ANIMATION, chooseAnimation } from './animations';
import { CAMERA_DISTANCE, TARGET_HEIGHT, aimFacing, cameraOffset, clampPitch } from './camera';
import { openForgePanel } from './forgePanel';
import { createHud } from './hud';
import { createInput } from './input';
import { buildWorld } from './world';

const MOUSE_SENSITIVITY = 0.0025;
const FORGE_REACH = 4.5;
const CONTROLS_HELP = 'ZQSD : se déplacer · Souris : viser · Clic : attaquer · Espace : roulade · 1-7 : armes · E : forge · Échap : pause';

export interface GameOptions {
  character: CharacterDetail;
  api: Api;
  onQuit(): void;
}

export async function startGame(root: HTMLElement, opts: GameOptions): Promise<() => void> {
  let character = opts.character;
  const container = h('div', { class: 'game' });
  root.append(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  const map = generateMap();
  const world = buildWorld(scene, map);

  let model: CharacterModel;
  try {
    model = await CharacterModel.create(character.appearance);
  } catch (e) {
    renderer.dispose();
    container.remove();
    throw e;
  }
  scene.add(model.root);
  let weapon: WeaponType = 'sword';
  await model.setWeapon(weapon);

  const input = createInput(renderer.domElement);
  const hud = createHud(container);
  hud.setWeapons(character, weapon);

  let motion = newMotion(SPAWN_POS.x, SPAWN_POS.z);
  let yaw = 0;
  let pitch = 0.35;
  let attackCooldown = 0;
  let attackTime = 0;
  let closeForge: (() => void) | null = null;

  const overlay = h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, character.name),
      h('button', { onclick: () => input.lock() }, 'Jouer'),
      h('button', { class: 'secondary', onclick: () => opts.onQuit() }, 'Retour aux personnages'),
      h('p', { class: 'hint' }, CONTROLS_HELP),
    ),
  );
  container.append(overlay);
  input.onLockChange((locked) => {
    overlay.hidden = locked || closeForge !== null;
  });

  const resize = () => {
    const w = container.clientWidth;
    const hgt = container.clientHeight;
    renderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const nearForge = () =>
    Math.hypot(motion.x - FORGE_POS.x, motion.z - FORGE_POS.z) < FORGE_REACH ||
    Math.hypot(motion.x - ENCHANTER_POS.x, motion.z - ENCHANTER_POS.z) < FORGE_REACH;

  const openForge = () => {
    closeForge = openForgePanel(container, {
      character,
      api: opts.api,
      onChange: (c) => {
        character = c;
        hud.setWeapons(character, weapon);
      },
      onClose: () => {
        closeForge = null;
        overlay.hidden = false;
        input.lock();
      },
    });
    overlay.hidden = true;
    input.unlock();
  };

  const switchWeapon = (t: WeaponType) => {
    if (t === weapon) return;
    weapon = t;
    void model.setWeapon(t);
    hud.setWeapons(character, weapon);
  };

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const playing = input.isLocked();

    const mouse = input.consumeMouse();
    if (playing) {
      yaw -= mouse.dx * MOUSE_SENSITIVITY;
      pitch = clampPitch(pitch + mouse.dy * MOUSE_SENSITIVITY);
    }
    WEAPON_TYPES.forEach((t, i) => {
      if (input.consumePressed(`Digit${i + 1}`) && playing) switchWeapon(t);
    });
    if (input.consumePressed('KeyE') && playing && nearForge()) openForge();

    const move = playing ? input.moveInput() : NO_INPUT;
    const wasRolling = motion.rollTime > 0;
    motion = stepMotion(motion, move, yaw, dt, map.obstacles);
    const rolling = motion.rollTime > 0;
    if (rolling && !wasRolling) model.play(ROLL_ANIMATION, { once: true, restart: true, duration: ROLL_DURATION });

    attackCooldown = Math.max(0, attackCooldown - dt);
    attackTime = Math.max(0, attackTime - dt);
    if (input.consumeAttack() && playing && attackCooldown === 0 && !rolling) {
      const level = character.weapons.find((w) => w.type === weapon)?.level ?? 1;
      attackCooldown = 1 / weaponAttacksPerSec(weapon, level);
      attackTime = attackCooldown;
      model.play(ATTACK_ANIMATIONS[weapon], { once: true, restart: true, duration: attackCooldown });
    }
    const attacking = attackTime > 0;
    const moving = move.forward || move.back || move.left || move.right;
    const anim = chooseAnimation({ rolling, attacking, moving, weapon });
    model.play(anim.name, { once: anim.once });

    model.root.position.set(motion.x, 0, motion.z);
    model.root.rotation.y = attacking && !rolling ? aimFacing(yaw) : motion.facing;
    model.update(dt);
    world.update(dt);

    const off = cameraOffset(yaw, pitch, CAMERA_DISTANCE);
    camera.position.set(motion.x + off.x, TARGET_HEIGHT + off.y, motion.z + off.z);
    camera.lookAt(motion.x, TARGET_HEIGHT, motion.z);

    hud.setPrompt(playing && nearForge() ? 'E : forge et enchantements' : null);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    closeForge?.();
    input.dispose();
    hud.destroy();
    model.dispose();
    renderer.dispose();
    container.remove();
  };
}
```

- [ ] **Step 6: Brancher la route `game`**

Dans `client/src/main.ts` :
1. Ajouter l'import `import { startGame } from './game/game';` et retirer l'import de `h` s'il n'est plus utilisé.
2. Remplacer tout le `case 'game': ... break;` par :
```ts
    case 'game':
      try {
        const stop = await startGame(app, { character: route.character, api, onQuit: () => go({ name: 'characters' }) });
        if (id !== navigation) stop();
        else dispose = stop;
      } catch (e) {
        console.error(e);
        alert('Impossible de charger le jeu (modèles 3D introuvables ?)');
        go({ name: 'characters' });
      }
      break;
```
3. Supprimer la ligne `if (id !== navigation) return;` en fin de `show` (devenue inutile).

- [ ] **Step 7: Typecheck et tests**

Run: `npm run typecheck && npm test`
Expected: typecheck sans erreur dans les 3 workspaces ; tous les tests PASS.

- [ ] **Step 8: Vérification dans le navigateur**

Run: `npm run dev`, ouvrir `http://localhost:5173`, choisir un perso → « Jouer ».
Vérifier :
1. La map s'affiche (herbe, arbres, rochers, place centrale, forge avec braises, cristal violet qui tourne) ; menu « Jouer » visible.
2. Clic sur « Jouer » → souris capturée ; ZQSD déplace le perso relativement à la caméra, il court et s'oriente ; la souris tourne la caméra autour de lui.
3. Espace → roulade rapide, impossible d'enchaîner avant 1,5 s.
4. 1 à 7 → l'arme en main change (épée, pelle, hache, lance, masse, arc, arbalète), la barre du bas suit ; clic → animation d'attaque tournée vers la visée.
5. On ne traverse ni la forge, ni le cristal, ni les arbres/rochers ; on ne sort pas de la map.
6. Près de la forge : « E : forge et enchantements » → le panneau s'ouvre, liste les 7 armes ; « Améliorer » sans or affiche « Pas assez d'or ». Pour tester une réussite : `sqlite3 server/data/rpg.db "UPDATE characters SET gold = 10000, materials = 50"` (ou via `node -e` si sqlite3 n'est pas installé), rouvrir le panneau après être sorti/rentré dans le jeu → l'amélioration fonctionne et le niveau suit dans la barre.
7. Échap → menu pause ; « Retour aux personnages » → écran des persos, sans erreur console.

- [ ] **Step 9: Commit**

```bash
git add client/src
git commit -m "feat(client): scène de jeu explorable avec armes, roulade et forge"
```
