# RPG Online — Design v1

Date : 2026-11-03

## 1. Vision

RPG d'action 3D jouable dans le navigateur. Le joueur explore une petite map ouverte sur laquelle des vagues de monstres apparaissent (boss toutes les 5 vagues, monstres « shiny » rares avec effets bonus). Il améliore 7 armes sur 10 niveaux et les enchante (feu, électricité, poison, glace).

Chaque compte possède plusieurs personnages personnalisables, chacun avec sa propre sauvegarde.

**Stratégie réseau :** solo d'abord, architecture prête pour la coop jusqu'à **8 joueurs** sans lag. Le serveur est autoritaire dès la v1 (salon à 1 joueur).

## 2. Stack technique

| Couche | Choix | Raison |
|---|---|---|
| Langage | TypeScript partout | types et règles partagés client/serveur |
| Client 3D | Three.js + Vite | léger, écosystème riche |
| Temps réel | Colyseus (Node.js, WebSocket) | rooms, sync d'état delta-encodée, adapté à 8 joueurs + ~60 monstres |
| API comptes | HTTP (dans le même process Node) | inscription, connexion, gestion des persos |
| Base de données | PostgreSQL (SQLite accepté en dev local) | comptes, persos, armes |
| Assets | Packs CC0 low-poly (KayKit Adventurers / Weapons, Quaternius monstres) | animés, modulaires, licence libre |

### Structure du dépôt (monorepo)

```
rpgonline/
  shared/   données de jeu + règles pures : stats armes, coûts d'upgrade,
            enchantements, monstres, formules de dégâts, scaling des vagues
  server/   API HTTP comptes/persos, room Colyseus "run", accès BDD
  client/   rendu Three.js, contrôles, prédiction/interpolation, UI (menus, HUD, forge)
```

Toutes les valeurs d'équilibrage vivent dans `shared/` (un fichier de données par domaine) pour permettre l'équilibrage sans toucher à la logique.

## 3. Boucle de jeu (mélange monde ouvert + roguelite)

- Une **run** se joue sur la map ouverte. Forge et enchanteur au centre de la map.
- Les vagues apparaissent sur la map depuis 6 points de spawn en bordure (télégraphés 1 s avant).
- Entre deux vagues : **30 s de répit** (explorer, coffres, forge). PV restaurés au début du répit.
- Fin de vague : le joueur choisit **1 bonus de run parmi 3** (perdus en fin de run).
- La run se termine à la mort (en coop : à la mort de toute l'équipe).
- **Permanent (lié au perso) :** or, matériaux, pierres d'enchantement, niveaux d'armes, enchantements. Ramassés = sauvegardés immédiatement, même en cas de mort.
- L'amélioration/enchantement se fait à la forge/l'enchanteur pendant le répit ou hors run.

## 4. Contrôles et combat

- Caméra 3ᵉ personne derrière le perso. ZQSD (et WASD) déplacement, souris visée, clic gauche attaque, Espace roulade.
- **Roulade :** invulnérabilité brève, cooldown 1,5 s.
- **PV joueur :** 100 de base, pas de régénération pendant une vague.
- **Mêlée :** touche tous les ennemis dans la forme de l'arme (cône/ligne/cercle) devant le joueur.
- **Distance :** projectile vers le point visé.
- Le perso équipe **1 arme à la fois** ; il peut changer d'arme (touches 1-7) parmi celles qu'il possède. Les 7 armes sont débloquées dès la création du perso, au niveau 1.

### 4.1 Armes (niveau 1)

| Arme | Dégâts | Vitesse | Portée | Forme | Particularité |
|---|---|---|---|---|---|
| Épée | 12 | 1,6/s | 2,2 m | cône 90° | équilibrée |
| Pelle | 9 | 1,3/s | 2,4 m | cône 120° | repousse les ennemis |
| Hache | 20 | 0,9/s | 2,0 m | cône 70° | +25 % dégâts aux boss |
| Lance | 14 | 1,2/s | 3,5 m | ligne | transperce |
| Masse à pointes | 24 | 0,7/s | 2,0 m | cercle 2 m autour du joueur | étourdit 0,5 s |
| Arc | 10 | 1,5/s | 25 m | projectile | tir chargé (maintenir) ×2 dégâts |
| Arbalète | 26 | 0,6/s | 30 m | projectile | perce 2 ennemis |

### 4.2 Amélioration (niveaux 1 → 10)

- Dégâts : **+12 % du niveau 1 par niveau** (niveau 10 = ×2,08).
- Paliers **niveau 5 et 10** : +10 % de vitesse d'attaque et changement visuel (couleur/lueur).
- Coût pour passer au niveau `n+1` : `round(50 × 1,6^(n−1))` or. Les passages vers 5 et 10 exigent aussi des matériaux (5 et 20).
- Pas d'échec, pas de casse.

### 4.3 Enchantements

- 1 slot par arme ; **2ᵉ slot débloqué au niveau 7**. Deux enchantements identiques sur une même arme interdits.
- Poser/monter un enchantement consomme des pierres du même élément : rang I = 1 pierre, rang II = +2, rang III = +4.
- Remplacer un enchantement détruit l'ancien (pierres perdues).

| Effet | Rang I → III |
|---|---|
| Feu | brûlure 3 s, 15 % → 25 % → 35 % des dégâts du coup par seconde |
| Électricité | rebondit sur 1 → 2 → 3 ennemis proches (rayon 5 m) à 50 % des dégâts |
| Poison | max 3 → 5 → 7 stacks, 2 dégâts/s par stack, durée 5 s (rafraîchie) |
| Glace | ralentit 20 % → 30 % → 40 % pendant 2 s ; rang III : 10 % de chance de geler 1 s |

### 4.4 Bonus de run (v1 : ~15)

Exemples : +15 % dégâts, +10 % vitesse d'attaque, +20 PV max, 3 % vol de vie, +1 projectile (arc/arbalète), 10 % critique (×2), −20 % cooldown roulade, +15 % vitesse de déplacement, +30 % rayon de ramassage, etc. Cumulables. Tirage de 3 bonus distincts.

## 5. Monstres et vagues

### 5.1 Monstres de base

| Monstre | PV | Dégâts | Vitesse | Comportement |
|---|---|---|---|---|
| Gobelin | 30 | 6 | rapide | fonce sur le joueur le plus proche |
| Squelette archer | 25 | 8 | lent | garde ses distances, tire |
| Golem | 120 | 15 | très lent | charge 1 s puis frappe de zone |
| Araignée | 20 | 4 | très rapide | arrive en groupe, poison léger |

### 5.2 Boss

- **Roi Gobelin** (vagues 5, 15, 25, …) : 800 PV, tourbillon, invoque des gobelins à 50 % PV.
- **Golem ancien** (vagues 10, 20, 30, …) : 1500 PV, lancers de rochers en zone (cercle au sol avant impact), enrage à 30 % PV.
- Une vague de boss contient le boss + la moitié des monstres normaux de la vague.

### 5.3 Scaling

- PV : `base × 1,12^(vague−1)` ; dégâts : `base × (1 + 0,06 × (vague−1))`.
- Nombre de monstres : `6 + 2 × vague`, max **60 vivants simultanément** (le reste spawne au fil des morts).
- Coop (post-v1) : PV × `1 + 0,5 × (joueurs − 1)`.

### 5.4 Shiny

- 5 % de chance par monstre (boss inclus). Plus gros, teinte dorée irisée, particules. ×2 PV, +25 % dégâts.
- 1 effet aléatoire (2 pour un boss) : Enflammé (traînée de feu), Électrique (décharge de zone /4 s), Venimeux, Gelé, Rapide (+50 % vitesse), Bouclier (bloque 3 coups), Scission (se divise en 2 à la mort).
- Loot : ×5 or et matériaux, **1 pierre d'enchantement garantie** (3 pour un boss). Type = élément de l'effet ; aléatoire pour Rapide/Bouclier/Scission.

### 5.5 Loot

- Or : chaque mort de monstre en lâche ; ramassage automatique par proximité.
- Matériaux : golems, boss, shiny uniquement.

### 5.6 IA

Déplacement vers la cible par grille de navigation de la map (pathfinding léger, recalcul espacé), comportement propre à chaque type. Tourne sur le serveur à **20 ticks/s**.

## 6. Comptes, personnages, données *(défauts à valider)*

- **Authentification :** pseudo + mot de passe (hash argon2), session par jeton (JWT court + refresh, ou cookie httpOnly). Pas d'email en v1.
- **Personnages :** jusqu'à **5 par compte**. Création/suppression/modification depuis l'écran de sélection.
- **Éditeur de perso v1 :** choix du modèle de base (parmi les persos KayKit), couleur de peau, coiffure, couleur de cheveux, tenue/couleur de tenue, nom (unique par compte).

### Modèle de données

```
accounts(id, username UNIQUE, password_hash, created_at)
characters(id, account_id → accounts, name, appearance JSON, gold, materials,
           best_wave, created_at)                  UNIQUE(account_id, name)
character_weapons(character_id → characters, weapon_type, level 1..10,
           enchant_1 NULL, enchant_1_rank, enchant_2 NULL, enchant_2_rank)
           PK(character_id, weapon_type)
character_stones(character_id → characters, element, count)
           PK(character_id, element)
```

## 7. Réseau et flux de données

- Le client se connecte à l'API, reçoit son jeton, choisit un perso, puis rejoint une room Colyseus `run` en présentant jeton + id du perso. Le serveur vérifie que le perso appartient au compte.
- **Le client n'envoie que des intentions :** direction de déplacement, orientation de visée, attaque (début/fin de charge), roulade, changement d'arme, choix de bonus, achat à la forge.
- **Le serveur est la seule autorité** sur positions, dégâts, morts, loot, or, upgrades. Écritures en BDD à chaque ramassage/achat (regroupées au besoin), et en fin de run.
- **Client :** prédiction locale du mouvement du joueur avec réconciliation sur l'état serveur ; interpolation (~100 ms de retard) des autres entités.
- **Rendu :** low-poly, instancing des monstres identiques, pooling des projectiles/particules ; cible 60 FPS avec 60 monstres sur une machine moyenne.
- Room v1 : `maxClients = 1`. Passer à la coop = monter à 8 + lobby de matchmaking (hors v1).

## 8. Gestion des erreurs

- Toute action client invalide (achat sans fonds, arme non possédée, cadence d'attaque trop rapide, déplacement impossible) est **ignorée** par le serveur et l'état autoritaire corrige le client.
- Déconnexion en pleine run : la progression déjà ramassée est sauvegardée ; la run est perdue (pas de reconnexion en v1).
- Erreurs API : codes HTTP standards + message affichable ; le client affiche un message clair (pseudo pris, mauvais mot de passe, etc.).

## 9. Tests

- **`shared/` :** tests unitaires (Vitest) des formules : coûts d'upgrade, dégâts par niveau, effets d'enchantement, scaling des vagues, tirage des shiny (RNG injectable).
- **`server/` :** tests de l'API (inscription, connexion, CRUD persos, isolation entre comptes) et de la room avec horloge simulée (spawn de vague, mort d'un monstre → loot → sauvegarde, rejet d'actions invalides).
- **`client/` :** vérification manuelle dans le navigateur (contrôles, rendu, FPS).

## 10. Hors périmètre v1

Drop d'objets pendant la run (prévu ensuite), coop multijoueur effective, chat, classements, son/musique soignés, reconnexion en cours de run, récupération de compte par email.
