<div align="center">

# 🍺 Mjödheim: Brewstead

### Jeu de gestion de brasserie · Brewery management game

Cultiver, expérimenter, brasser, commercer et faire vivre sa propre brasserie dans un monde partagé.

Grow, experiment, brew, trade and develop your own brewery in a shared world.

![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.x-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Thymeleaf](https://img.shields.io/badge/Thymeleaf-Server_Side_UI-005F0F?style=for-the-badge&logo=thymeleaf&logoColor=white)

</div>

---

# 🇫🇷 Français

## À propos

**Mjödheim: Brewstead** est un jeu de gestion de brasserie jouable depuis le navigateur.

Chaque joueur possède son propre domaine, son **Brewstead**, qu'il développe progressivement autour de l'agriculture, de l'apiculture, de l'expérimentation de recettes, du brassage, de la fermentation, du commerce et des commandes.

Le projet s'inspire des jeux de gestion agricole et de production, avec une identité centrée sur la bière, l'hydromel et l'univers nordique de **Mjödheim**.

L'objectif est de proposer une boucle de jeu simple à prendre en main mais suffisamment riche pour encourager les joueurs à revenir régulièrement afin de récolter, produire, tester de nouvelles recettes et répondre à des commandes limitées dans le temps.

Le projet sert également de terrain d'apprentissage pour construire une application **Spring Boot** structurée en architecture trois tiers, avec une couche métier riche, de la persistance, des transactions et Spring Security.

## 🎮 Concept

Chaque joueur développe son propre environnement de production.

```text
🌾 Champs          🐝 Rucher
      \            /
       \          /
        ⚗️ Laboratoire
              ↓
          🍺 Brasserie
              ↓
      🛢️ Fermentation / Cave
              ↓
          📦 Stockage
              ↓
       📜 Tableau de commandes
              ↓
          🏰 Taverne commune
```

Le joueur peut notamment :

- cultiver des céréales et d'autres matières premières ;
- entretenir des ruches et produire du miel ;
- gérer son inventaire ;
- expérimenter de nouvelles recettes ;
- produire bière et hydromel ;
- gérer des cuves et des temps de fermentation ;
- remplir des commandes de personnages fictifs ;
- publier ou satisfaire des commandes provenant d'autres joueurs ;
- gagner des pièces, de l'expérience, de la réputation et des récompenses ;
- améliorer progressivement son domaine ;
- rejoindre une taverne commune représentant le hub partagé de l'univers.

## 🔁 Boucle de jeu

```text
Cultiver / produire
        ↓
Récolter des ressources
        ↓
Expérimenter au laboratoire
        ↓
Créer ou améliorer une recette
        ↓
Lancer un brassin
        ↓
Fermentation
        ↓
Conditionnement / stockage
        ↓
Remplir des commandes
        ↓
Gagner pièces + réputation + récompenses
        ↓
Améliorer le Brewstead
```

L'objectif est de permettre des sessions courtes : le joueur peut venir récolter, lancer quelques productions, vérifier ses commandes puis revenir plus tard lorsque ses cultures ou ses brassins sont prêts.

## 🌾 Agriculture

Les joueurs pourront produire une partie de leurs matières premières directement sur leur domaine.

Premières cultures envisagées :

- orge ;
- blé ;
- seigle ;
- houblon ;
- herbes et épices.

Chaque culture pourra posséder plusieurs propriétés métier :

- coût de plantation ;
- durée de croissance ;
- rendement ;
- qualité ;
- niveau requis.

## 🐝 Apiculture

Le rucher permettra de produire différentes ressources liées aux abeilles.

Exemples :

- miel ;
- cire ;
- variétés de miel plus rares.

La qualité du miel pourra influencer directement certaines caractéristiques des hydromels produits.

## ⚗️ Laboratoire

Le laboratoire est l'une des mécaniques centrales de **Brewstead**.

Les joueurs ne seront pas limités à une simple liste de recettes prédéfinies. Ils pourront expérimenter leurs propres recettes en combinant ingrédients et paramètres de production.

Une recette pourra prendre en compte :

- céréales ;
- miel ;
- houblons ;
- fruits ;
- herbes ;
- épices ;
- levures ;
- quantités ;
- volume ;
- paramètres de fermentation.

Le moteur métier pourra ensuite calculer différentes caractéristiques :

```text
Alcool
Douceur
Amertume
Corps
Fruit
Épices
Qualité
```

Une recette réussie pourra être enregistrée puis reproduite ultérieurement.

L'objectif est que certains produits deviennent réellement propres au joueur plutôt que de simples objets standards du jeu.

## 🍺 Brasserie

La brasserie transforme les ingrédients en boissons finies.

Le lancement d'un brassin devra notamment vérifier :

1. que la recette existe et appartient au joueur ;
2. que le volume demandé est valide ;
3. que les ingrédients nécessaires sont disponibles ;
4. que le joueur dispose d'une cuve libre ;
5. que son niveau ou ses équipements permettent la production ;
6. que toutes les ressources peuvent être consommées de manière cohérente.

Un brassin pourra suivre plusieurs états :

```text
PLANNED
   ↓
BREWING
   ↓
FERMENTING
   ↓
CONDITIONING
   ↓
READY
```

Les transitions invalides seront refusées par la couche métier.

## 📦 Inventaire

Chaque joueur dispose de son propre inventaire contenant notamment :

- matières premières ;
- récoltes ;
- miel ;
- ingrédients de brassage ;
- produits intermédiaires ;
- boissons finies.

Les services devront garantir les invariants métier, par exemple empêcher un stock négatif ou une consommation supérieure à la quantité disponible.

## 📜 Commandes

Deux catégories de commandes sont prévues.

### Commandes PNJ

Des personnages fictifs proposeront régulièrement des demandes limitées dans le temps.

Exemple :

```text
La troupe de Ragnar

Demande :
12 × Strong Ale

Qualité minimale : 60
Temps restant : 01:42:16

Récompenses :
380 pièces
+8 réputation
Levure rare
```

Les récompenses pourront inclure :

- pièces ;
- expérience ;
- réputation ;
- ingrédients ;
- levures rares ;
- éléments de recettes ;
- objets cosmétiques.

### Commandes entre joueurs

Un joueur pourra publier une demande afin d'obtenir des ressources ou des produits d'un autre joueur.

Exemple :

```text
Demande joueur

20 × Miel
10 × Orge

Récompense : 450 pièces
```

Les échanges devront être transactionnels :

```text
retirer les ressources du vendeur
+
ajouter les ressources à l'acheteur
+
transférer la monnaie
+
mettre à jour la commande
```

Soit l'ensemble de l'opération réussit, soit aucune modification n'est appliquée.

## 🏰 Taverne commune

La taverne sera le point de rencontre commun de l'univers Mjödheim.

Elle pourra afficher :

- des personnages jouables ;
- les joueurs récemment actifs ;
- des profils publics ;
- des boissons mises en avant ;
- des commandes ou événements spéciaux ;
- des classements et statistiques.

La première version ne nécessite pas de multijoueur temps réel. Le serveur peut fournir l'état du monde tandis que l'interface crée visuellement une taverne vivante.

## 👤 Joueur

Un joueur pourra notamment posséder :

```text
username
password
level
experience
coins
reputation
role
```

Chaque joueur possède son propre Brewstead.

Des spécialisations pourront être ajoutées plus tard :

```text
Brasseur
Apiculteur
Fermier
Marchand
Alchimiste
```

Ces spécialisations pourront offrir de petits bonus sans empêcher les autres activités.

## 🔐 Sécurité

L'authentification et les autorisations seront gérées avec **Spring Security**.

Rôles initiaux :

```text
PLAYER
ADMIN
```

Les visiteurs anonymes pourront à terme consulter certaines parties publiques du jeu, tandis que les joueurs authentifiés auront accès à leur domaine et aux interactions économiques.

## 🏗️ Architecture

Le projet suit une architecture classique en trois tiers.

```text
Présentation
Controllers
Thymeleaf
Forms / DTO
        ↓
Métier
Services
Règles métier
Transactions
        ↓
Données
Repositories
JPA / Hibernate
PostgreSQL
```

Principes :

- les **Controllers** restent fins ;
- les **Services** portent la logique métier ;
- les **Repositories** gèrent uniquement la persistance et les requêtes ;
- les **DTO / Forms** isolent les échanges avec la couche de présentation ;
- les opérations critiques utilisent des transactions lorsque nécessaire.

## 🧠 Services envisagés

La couche métier constitue le cœur du projet.

```text
PlayerService
FarmService
ApiaryService
InventoryService
ProductionService
RecipeService
LaboratoryService
BrewService
FermentationService
NpcOrderService
PlayerOrderService
TradeService
RewardService
ReputationService
TavernService
```

Tous ces services ne seront pas nécessairement créés immédiatement. Ils apparaîtront lorsque les besoins métier le justifieront.

## 🧱 Domaine initial

Le premier modèle pourra notamment contenir :

```text
User
PlayerProfile
Ingredient
PlayerInventory
Crop
Field
Beehive
Recipe
RecipeIngredient
Batch
NpcOrder
NpcOrderLine
PlayerOrder
PlayerOrderLine
```

Le modèle évoluera progressivement avec le gameplay.

## 🚀 Premier objectif jouable

La première version fonctionnelle devra permettre :

- création de compte et authentification ;
- un Brewstead par joueur ;
- un inventaire personnel ;
- production d'orge ;
- production de miel ;
- quelques recettes de départ ;
- expérimentation de recettes ;
- lancement d'un brassin ;
- fermentation ;
- commandes PNJ ;
- commandes entre joueurs ;
- récompenses simples ;
- première version de la taverne commune.

## 🛠️ Stack technique

### Backend

- Java
- Spring Boot
- Spring MVC
- Spring Data JPA
- Spring Security
- Spring Validation
- Hibernate
- PostgreSQL
- Lombok

### Frontend

- Thymeleaf
- HTML
- CSS
- JavaScript

### Infrastructure

- GitHub
- Docker
- CI/CD
- Vercel
- PostgreSQL hébergé

## 🎯 Objectifs pédagogiques

Brewstead sert également de projet d'apprentissage afin de pratiquer :

- Spring MVC ;
- architecture trois tiers ;
- injection de dépendances ;
- services et logique métier ;
- DTO et formulaires ;
- relations JPA ;
- repositories ;
- PostgreSQL ;
- transactions ;
- Spring Security ;
- authentification et autorisation ;
- validation ;
- exceptions métier ;
- modélisation de domaine ;
- conception d'un backend maintenable.

## 🗺️ Philosophie de développement

Brewstead doit rester jouable aussi tôt que possible.

Les fonctionnalités seront développées verticalement :

```text
domaine
→ persistance
→ service
→ controller
→ interface
```

L'objectif n'est pas d'implémenter immédiatement toutes les mécaniques prévues, mais de construire d'abord une boucle de jeu courte et fonctionnelle puis d'enrichir progressivement le monde.

## 📌 État du projet

**Phase actuelle : socle multijoueur jouable et progression persistante.**

Le jeu comprend l'inscription sécurisée, la ferme, le rucher, la brasserie, les commandes PNJ,
le marché entre joueurs, la taverne commune, le comptoir de dégustation, le classement,
les objectifs quotidiens, les séries de visites et les hauts faits récompensés. L'interface du
domaine adapte aussi sa météo et sa lumière, avec un mode de mouvement réduit.

---

# 🇬🇧 English

## About

**Mjödheim: Brewstead** is a browser-based brewery management game.

Each player owns a personal estate — their **Brewstead** — which gradually develops around farming, beekeeping, recipe experimentation, brewing, fermentation, trading and timed orders.

The project draws inspiration from farming and production management games while focusing on beer, mead and the Nordic-inspired **Mjödheim** universe.

The goal is to provide a gameplay loop that is easy to understand but rich enough to encourage players to return regularly to harvest resources, launch production, experiment with recipes and complete limited-time orders.

The project is also a practical learning environment for building a structured **Spring Boot** application with a three-tier architecture, a substantial business layer, persistence, transactions and Spring Security.

## 🎮 Concept

Each player develops their own production environment.

```text
🌾 Fields          🐝 Apiary
      \            /
       \          /
        ⚗️ Laboratory
              ↓
          🍺 Brewery
              ↓
      🛢️ Fermentation / Cellar
              ↓
          📦 Storage
              ↓
          📜 Order Board
              ↓
          🏰 Shared Tavern
```

Players will be able to:

- grow cereals and other raw materials;
- maintain beehives and produce honey;
- manage their inventory;
- experiment with new recipes;
- brew beer and mead;
- manage brewing vessels and fermentation times;
- complete NPC orders;
- publish or fulfil orders from other players;
- earn coins, experience, reputation and rewards;
- progressively improve their Brewstead;
- visit a shared Tavern representing the common hub of the game world.

## 🔁 Gameplay loop

```text
Grow / produce
        ↓
Harvest resources
        ↓
Experiment in the laboratory
        ↓
Create or improve a recipe
        ↓
Start a batch
        ↓
Fermentation
        ↓
Condition / store products
        ↓
Complete orders
        ↓
Earn coins + reputation + rewards
        ↓
Improve the Brewstead
```

The game is designed around short sessions: players can harvest resources, launch production, check their orders and return later when crops or batches are ready.

## 🌾 Farming

Players will be able to produce part of their own raw materials.

Initial crops may include:

- barley;
- wheat;
- rye;
- hops;
- herbs and spices.

Each crop may have several business properties:

- planting cost;
- growth duration;
- yield;
- quality;
- required level.

## 🐝 Beekeeping

The apiary will produce bee-related resources such as:

- honey;
- wax;
- rarer honey varieties.

Honey quality may directly influence characteristics of mead produced in the brewery.

## ⚗️ Laboratory

The laboratory is one of the central mechanics of **Brewstead**.

Players will not be limited to a simple list of predefined products. They will be able to experiment with their own recipes by combining ingredients and production parameters.

A recipe may include:

- cereals;
- honey;
- hops;
- fruits;
- herbs;
- spices;
- yeast;
- quantities;
- volume;
- fermentation parameters.

The business engine may then calculate several characteristics:

```text
Alcohol
Sweetness
Bitterness
Body
Fruitiness
Spiciness
Quality
```

Successful recipes can be saved and reproduced later.

The goal is for some drinks to genuinely belong to the player rather than being simple standard game items.

## 🍺 Brewery

The brewery converts ingredients into finished drinks.

Starting a batch must verify, among other rules:

1. that the recipe exists and belongs to the player;
2. that the requested volume is valid;
3. that the required ingredients are available;
4. that a brewing vessel is available;
5. that the player's progression and equipment allow the production;
6. that all resources can be consumed consistently.

A batch may follow several states:

```text
PLANNED
   ↓
BREWING
   ↓
FERMENTING
   ↓
CONDITIONING
   ↓
READY
```

Invalid transitions will be rejected by the business layer.

## 📦 Inventory

Each player has a personal inventory containing items such as:

- raw materials;
- harvested crops;
- honey;
- brewing ingredients;
- intermediate products;
- finished drinks.

Services must protect business invariants, for example preventing negative stock or consumption greater than available quantities.

## 📜 Orders

Two categories of orders are planned.

### NPC orders

Fictional characters will regularly publish limited-time requests.

Example:

```text
Ragnar's Warband

Needs:
12 × Strong Ale

Minimum quality: 60
Time remaining: 01:42:16

Rewards:
380 coins
+8 reputation
Rare yeast
```

Rewards may include:

- coins;
- experience;
- reputation;
- ingredients;
- rare yeast;
- recipe components;
- cosmetic items.

### Player orders

Players will be able to publish requests for resources or products from other players.

Example:

```text
Player request

20 × Honey
10 × Barley

Reward: 450 coins
```

Trades must be transactional:

```text
remove seller resources
+
add resources to buyer
+
transfer currency
+
update the order
```

Either the entire operation succeeds or no changes are applied.

## 🏰 Shared Tavern

The Tavern will be the common meeting point of the Mjödheim world.

It may display:

- playable characters;
- recently active players;
- public profiles;
- featured drinks;
- special orders or events;
- leaderboards and statistics.

The first version does not require real-time multiplayer. The server can expose world state while the frontend visually creates the feeling of a living tavern.

## 👤 Player

A player may initially contain information such as:

```text
username
password
level
experience
coins
reputation
role
```

Each player owns one Brewstead.

Specialisations may be introduced later:

```text
Brewer
Beekeeper
Farmer
Merchant
Alchemist
```

These specialisations may grant small bonuses without preventing access to the other activities.

## 🔐 Security

Authentication and authorization will be handled with **Spring Security**.

Initial roles:

```text
PLAYER
ADMIN
```

Anonymous visitors may eventually access selected public areas of the game, while authenticated players will manage their Brewstead and participate in the game economy.

## 🏗️ Architecture

The project follows a classic three-tier architecture.

```text
Presentation
Controllers
Thymeleaf
Forms / DTOs
        ↓
Business
Services
Business Rules
Transactions
        ↓
Data
Repositories
JPA / Hibernate
PostgreSQL
```

Principles:

- **Controllers** remain lightweight;
- **Services** contain business logic;
- **Repositories** handle persistence and queries only;
- **DTOs / Forms** isolate presentation-layer exchanges;
- critical operations use transactions whenever appropriate.

## 🧠 Planned services

The business layer is the heart of the project.

```text
PlayerService
FarmService
ApiaryService
InventoryService
ProductionService
RecipeService
LaboratoryService
BrewService
FermentationService
NpcOrderService
PlayerOrderService
TradeService
RewardService
ReputationService
TavernService
```

Not every service needs to exist in the first version. They should appear as actual business requirements emerge.

## 🧱 Initial domain

The first model may include:

```text
User
PlayerProfile
Ingredient
PlayerInventory
Crop
Field
Beehive
Recipe
RecipeIngredient
Batch
NpcOrder
NpcOrderLine
PlayerOrder
PlayerOrderLine
```

The domain model will evolve progressively with the gameplay.

## 🚀 First playable milestone

The first functional version should provide:

- account creation and authentication;
- one Brewstead per player;
- personal inventory;
- barley production;
- honey production;
- a few starter recipes;
- recipe experimentation;
- batch creation;
- fermentation;
- NPC orders;
- player-to-player orders;
- simple rewards;
- an initial shared Tavern view.

## 🛠️ Technology stack

### Backend

- Java
- Spring Boot
- Spring MVC
- Spring Data JPA
- Spring Security
- Spring Validation
- Hibernate
- PostgreSQL
- Lombok

### Frontend

- Thymeleaf
- HTML
- CSS
- JavaScript

### Infrastructure

- GitHub
- Docker
- CI/CD
- Vercel
- hosted PostgreSQL

## 🎯 Learning objectives

Brewstead is also a learning project designed to practise:

- Spring MVC;
- three-tier architecture;
- dependency injection;
- service-oriented business logic;
- DTOs and forms;
- JPA relationships;
- repositories;
- PostgreSQL;
- transactions;
- Spring Security;
- authentication and authorization;
- validation;
- business exceptions;
- domain modelling;
- maintainable backend architecture.

## 🗺️ Development philosophy

Brewstead should become playable as early as possible.

Features will be implemented vertically whenever possible:

```text
domain
→ persistence
→ service
→ controller
→ UI
```

The goal is not to implement every planned system immediately, but to build a small functional gameplay loop first and progressively enrich the world.

## 📌 Project status

**Current phase: playable multiplayer foundation with persistent progression.**

The game now includes secure registration, farming, beekeeping, brewing, NPC orders,
the player market, shared tavern and chat, tasting counter, leaderboard, daily quests,
visit streaks and rewarded achievements. The estate also adapts its weather and lighting,
including a reduced-motion mode.

---

<div align="center">

**Mjödheim: Brewstead**

*Cultiver. Expérimenter. Brasser. Commercer.*  
*Grow. Experiment. Brew. Trade.*

</div>
