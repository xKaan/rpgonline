# Plan 3 — Vagues & combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une run jouable : vagues de monstres (boss toutes les 5 vagues, shiny), combat avec les 7 armes et leurs enchantements, loot sauvegardé immédiatement, bonus de run, fin de run à la mort — le tout simulé par une room Colyseus autoritaire, le client ne faisant que prédire/interpoler.

**Architecture:** Les règles d'équilibrage restent dans `shared/` (monstres, vagues, shiny, loot, bonus, combat, protocole). Le serveur contient une simulation pure et testable (`server/src/sim/`, horloge injectée via `step(dt)`, RNG injectable) et un adaptateur Colyseus mince (`server/src/room/`) qui recopie l'état de la simulation dans un schéma synchronisé et persiste les événements (loot, meilleure vague). Le client prédit le mouvement local avec le même `stepMotion` (rejeu des entrées non acquittées) et interpole les autres entités à ~100 ms.

**Tech Stack:** Colyseus 0.18 (`@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema` 5, `@colyseus/sdk` côté client), zod 4, Vitest, Three.js.

**Spec:** `docs/superpowers/specs/2026-11-03-rpg-online-design.md` (§3, §4, §5, §7, §8)

## Global Constraints

- Contraintes des plans 1 et 2 inchangées (TS strict, ESM, `shared/` sans I/O, aléatoire via `Rng`, textes FR, `KeyboardEvent.code`).
- Serveur de jeu Colyseus sur un port à part : `GAME_PORT` (défaut **2568**) ; l'API HTTP reste sur 2567. Client : `VITE_GAME_URL` ou `${protocol}//${hostname}:2568`.
- Room `run`, `maxClients = 1`, le client utilise `create('run', { token, characterId })`.
- Simulation à **20 ticks/s** ; max **60 monstres vivants** ; répit **30 s** ; télégraphe de spawn **1 s** ; 6 points de spawn en bordure.
- **Ne jamais passer de schéma de validation à `onMessage`** : Colyseus déconnecte le client si la validation échoue. Valider avec `safeParse` et ignorer (spec §8).
- Schéma : `t.float64()` pour le mouvement du joueur (rejeu exact), `t.float32()` ailleurs ; `t.array("string")` (nom de type, pas un builder).
- Monstres en géométrie procédurale low-poly (aucun asset à télécharger) ; les modèles Quaternius pourront les remplacer au Plan 4.

## Décisions (là où la spec est muette)

| Sujet | Choix |
|---|---|
| Composition des vagues | gobelin dès la vague 1 (poids 5), araignée dès 2 (poids 3, par groupes de 3), archer dès 3 (2), golem dès 4 (1) |
| Boss | vague % 10 = 0 → Golem ancien ; sinon vague % 5 = 0 → Roi Gobelin. Immunisés au recul et à l'étourdissement |
| Vitesses (m/s) | joueur 6 ; gobelin 4,5 ; archer 2 ; golem 1,5 ; araignée 6,5 |
| Or lâché | `round(base × (1 + 0,1 × (vague − 1)))`, base gobelin 3, archer 4, araignée 2, golem 10, roi 150, golem ancien 250 |
| Matériaux | golem 1, roi 5, golem ancien 10 ; shiny : `max(1, base) × 5` |
| Arc chargé | maintenu ≥ 0,8 s → ×2 ; tir au relâchement |
| Arbalète « perce 2 » | touche jusqu'à `1 + pierce` = 3 ennemis |
| Cadence | le serveur accepte une attaque après 90 % de l'intervalle (tolérance réseau) |
| Anti-triche mouvement | budget de temps par joueur (+dt à chaque tick, plafonné à 0,25 s) ; une entrée dont le `dt` dépasse le budget est ignorée (le client est corrigé) |
| Pause | en solo, si tous les joueurs sont en pause (menu, forge, choix de bonus), la simulation est gelée |
| Bonus non choisi | tiré au hasard parmi les 3 au début de la vague suivante |
| Forge en run | uniquement pendant le répit et à ≤ 4,5 m de la forge/de l'enchanteur ; via un message de la room (même `runForgeAction`) |
| Coffres | 2 au début de chaque répit (max 4 sur la map), ouverts au contact : `15 × vague` or, 30 % de chance d'une pierre |
| Scission | 2 copies non shiny à 50 % des PV max, sans loot |
| Meilleure vague | vague atteinte au moment de la mort/déconnexion |
| Lancer la vague | Entrée pendant le répit (quand tous les joueurs vivants sont prêts) |

## Review Focus

1. **Message malformé ou hors limites** (champ manquant, `dt` énorme, arme inconnue) → ignoré, le client reste connecté. *(test : Task 7)*
2. **Jeton expiré ou perso d'un autre compte à la connexion à la room** → refus avec un message clair, aucune room orpheline. *(test : Task 7)*
3. **Client qui envoie des entrées trop vite (speed hack, onglet qui rattrape)** → déplacement plafonné au temps réel. *(test : Task 4)*
4. **Déconnexion en pleine vague** → loot déjà ramassé conservé en BDD, meilleure vague enregistrée. *(test : Task 7)*
5. **Projectile rapide contre petit monstre** (30 m/s, 1,5 m par tick) → pas d'effet tunnel, le coup touche. *(test : Task 3 / Task 5)*

---

### Task 1: Règles des monstres et des vagues (shared)

**Files:** Create `shared/src/monsters.ts`, `shared/src/waves.ts`, `shared/test/monsters.test.ts` ; Modify `shared/src/index.ts`.

**Produces:** `MONSTER_KINDS`, `BOSS_KINDS`, `EnemyKind`, `ENEMIES: Record<EnemyKind, EnemyStats>`, `BEHAVIOR`, `scaledHp(kind, wave, players?)`, `scaledDamage(kind, wave)`, `goldDrop(kind, wave)`, `MAX_ALIVE`, `BREAK_DURATION`, `SPAWN_TELEGRAPH`, `SPAWN_POINTS`, `waveMonsterCount(wave)`, `bossForWave(wave)`, `waveComposition(wave, rng): EnemyKind[]` (boss en premier).

- [ ] Tests : formules de scaling (vague 1 et 10), `6 + 2 × vague`, boss aux vagues 5/10/15/20, vague de boss = boss + moitié des normaux, seuls les types débloqués, araignées par groupes.
- [ ] Implémentation, tests verts, commit `feat(shared): règles des monstres et des vagues`.

### Task 2: Shiny, loot, coffres et bonus de run (shared)

**Files:** Create `shared/src/shiny.ts`, `shared/src/loot.ts`, `shared/src/bonuses.ts`, `shared/test/shiny.test.ts`, `shared/test/bonuses.test.ts`.

**Produces:** `SHINY_EFFECTS`, `ShinyEffect`, `SHINY`, `SHINY_LABELS`, `rollShiny(rng, boss)`, `shinyStones(effects, boss, rng)` ; `LootDrop`, `monsterLoot(kind, wave, shiny, rng)`, `CHEST`, `chestLoot(wave, rng)`, `PICKUP_RADIUS`, `LOOT_DESPAWN` ; `BONUS_IDS`, `BonusId`, `BONUSES`, `PlayerStats`, `BASE_MAX_HP`, `computeStats(bonuses)`, `drawBonuses(rng, count)`.

- [ ] Tests : 5 % de shiny (RNG injecté), 1 effet / 2 pour un boss, pierres = élément de l'effet, loot shiny ×5 avec matériaux, 15 bonus, tirage de 3 distincts, cumul des bonus.
- [ ] Implémentation, commit `feat(shared): shiny, loot et bonus de run`.

### Task 3: Combat et protocole (shared)

**Files:** Create `shared/src/combat.ts`, `shared/src/protocol.ts`, `shared/test/combat.test.ts`, `shared/test/protocol.test.ts` ; Modify `shared/src/movement.ts` (options `speedMult`, `rollCooldown` ; rayon dans `resolveCollisions`).

**Produces:** `aimDirection(yaw)`, `meleeHits(shape, range, origin, dir, target, radius)`, `segmentHitsCircle(...)`, `hitDamage(ctx)`, `attackInterval(weapon, level, stats)`, `CRIT_MULT`, `BOW_FULL_CHARGE`, `PROJECTILE_SPEED`, `Statuses`, `newStatuses()`, `applyEnchants(...)`, `tickStatuses(s, dt)`, `speedFactor(s)`, `statusBits(s)` ; `MotionOptions` ; protocole : `RUN_ROOM`, `TICK_RATE`, `MAX_INPUT_DT`, `INPUT_BUDGET_MAX`, `encodeKeys`/`decodeKeys`, schémas zod des messages, `MSG`, types `RunOverMessage`, `ForgeReply`, interfaces de vue de l'état (`RunStateView`, `PlayerView`, `MonsterView`, …), `FORGE_REACH`.

- [ ] Tests : cône/ligne/cercle, segment rapide contre petit cercle (Review Focus 5), dégâts (niveau, boss, charge, crit), feu/poison/glace/électricité, ralentissement de `stepMotion`, aller-retour des touches, rejet des messages invalides.
- [ ] Commit `feat(shared): règles de combat et protocole de la room`.

### Task 4: Simulation — joueurs, vagues, navigation, IA de base (server)

**Files:** Create `server/src/sim/world.ts`, `server/src/sim/navigation.ts`, `server/src/sim/players.ts`, `server/src/sim/waves.ts`, `server/src/sim/monsters.ts`, `server/src/sim/RunSim.ts`, `server/test/sim.test.ts`.

**Produces:** `class RunSim { world; addPlayer(id, init); removePlayer(id); input(id, msg); attack(id, msg); setWeapon(id, t); chooseBonus(id, b); setPaused(id, p); skipBreak(id); refreshCharacter(id, weapons, wallet); canForge(id); step(dt); drainEvents(): SimEvent[] }`, `FlowField`.

- [ ] Tests (horloge simulée) : répit initial de 30 s puis vague 1 ; télégraphe 1 s avant l'apparition ; jamais plus de 60 vivants ; fin de vague → répit + PV restaurés ; gobelin qui rejoint et frappe ; invulnérable en roulade ; mort → `runOver` ; pause qui gèle ; budget d'entrées (Review Focus 3) ; le flow field contourne un obstacle.
- [ ] Commit `feat(server): simulation des vagues et IA de base`.

### Task 5: Simulation — attaques, statuts, loot, bonus (server)

**Files:** Create `server/src/sim/combat.ts`, `server/src/sim/loot.ts` ; Modify `RunSim.ts`, `waves.ts` ; Test `server/test/simCombat.test.ts`.

- [ ] Tests : épée qui tue un gobelin devant (et pas derrière), flèche qui touche à 20 m, arbalète qui perce, arc chargé ×2, cadence refusée, feu qui brûle, chaîne électrique, recul de la pelle, loot lâché → ramassé → événement `loot`, coffre, bonus offert/choisi/tiré automatiquement.
- [ ] Commit `feat(server): attaques, enchantements, loot et bonus dans la simulation`.

### Task 6: Simulation — comportements, boss, shiny (server)

**Files:** Create `server/src/sim/behaviors.ts` ; Modify `monsters.ts`, `combat.ts` ; Test `server/test/simBehaviors.test.ts`.

- [ ] Tests : l'archer garde ses distances et tire, le golem télégraphie 1 s avant la zone, poison des araignées, Roi Gobelin (tourbillon, invocation à 50 %), Golem ancien (rochers télégraphiés, enrage à 30 %), shiny bouclier/scission/rapide/électrique.
- [ ] Commit `feat(server): comportements des monstres, boss et shiny`.

### Task 7: Room Colyseus et persistance (server)

**Files:** Create `server/src/room/schema.ts`, `server/src/room/sync.ts`, `server/src/room/persistence.ts`, `server/src/room/RunRoom.ts`, `server/test/room.test.ts` ; Modify `server/src/repo/characters.ts` (`addLoot`, `recordBestWave`), `server/src/http/errors.ts` (`FORGE_CLOSED`, `TOO_FAR`), `server/src/index.ts`, `server/package.json`.

- [ ] Tests : connexion OK (état synchronisé), refus jeton invalide / perso d'un autre compte (Review Focus 2), message malformé ignoré sans déconnexion (Review Focus 1), forge refusée loin de la forge, `addLoot` / `recordBestWave`, déconnexion → meilleure vague enregistrée (Review Focus 4).
- [ ] Commit `feat(server): room Colyseus autoritaire et sauvegarde du loot`.

### Task 8: Réseau côté client (prédiction, interpolation, connexion)

**Files:** Create `client/src/net/prediction.ts`, `client/src/net/interpolation.ts`, `client/src/net/forgeApi.ts`, `client/src/net/runConnection.ts`, tests associés ; Modify `client/package.json`.

- [ ] Tests : rejeu des entrées non acquittées = position serveur + entrées, correction lissée, interpolation à 100 ms (angle le plus court), requêtes de forge résolues/rejetées/expirées.
- [ ] Commit `feat(client): prédiction, interpolation et connexion à la room`.

### Task 9: Rendu des monstres et des entités (client)

**Files:** Create `client/src/three/monsterModels.ts`, `client/src/game/entities.ts`, `client/test/entities.test.ts`.

- [ ] Monstres procéduraux (6 types, variante shiny dorée), barres de PV, flash à l'impact, projectiles, zones télégraphiées au sol, loot, coffres ; diff des clés testé.
- [ ] Commit `feat(client): rendu des monstres, projectiles, zones et loot`.

### Task 10: Intégration du jeu (client)

**Files:** Modify `client/src/game/game.ts`, `hud.ts`, `input.ts`, `forgePanel.ts`, `client/src/main.ts`, `client/src/ui/style.css`.

- [ ] Partie connectée à la room, HUD (PV, vague/répit, or, boss, bonus), choix de bonus, forge via la room, écran de fin de run (« Nouvelle run » / « Personnages »), perte de connexion.
- [ ] Typecheck + tests + vérification navigateur ; commit `feat(client): run jouable avec vagues, combat et loot`.
