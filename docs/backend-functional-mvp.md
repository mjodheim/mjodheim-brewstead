# Backend fonctionnel MVP — Brewstead

Ce document résume la couche fonctionnelle disponible avant la phase Spring Security.

## Flux principal

```text
Frontend
  -> Controller REST
  -> Service métier (@Transactional lorsque nécessaire)
  -> Repository Spring Data JPA
  -> Hibernate
  -> PostgreSQL
```

Le frontend ne doit jamais appeler directement un repository. Les règles de gameplay restent dans les services.

## Boucles de gameplay disponibles

### Ferme

`EMPTY -> GROWING -> READY -> récolte -> EMPTY`

La récolte crédite automatiquement l'ingrédient produit dans `PlayerInventory`.

### Rucher

`IDLE -> PRODUCING -> READY -> récolte -> IDLE`

La durée diminue légèrement avec le niveau de la ruche et la récolte de miel augmente avec ce niveau.

### Laboratoire / recettes

Un joueur peut consulter les recettes publiques et ses recettes privées, puis créer une recette personnalisée composée d'ingrédients, d'un volume de référence et d'un temps de fermentation.

### Brasserie

Le lancement d'un brassin :

1. valide le joueur, la recette et le volume ;
2. calcule les quantités d'ingrédients proportionnellement au volume demandé ;
3. retire tous les ingrédients dans une transaction ;
4. crée le brassin ;
5. fait évoluer son statut selon le temps écoulé : `BREWING -> FERMENTING -> CONDITIONING -> READY`.

Une qualité simple est calculée lorsque le brassin devient prêt. Le volume d'un batch `READY` représente actuellement le stock restant de boisson finie.

### Commandes PNJ

Les commandes PNJ sont limitées dans le temps et demandent un volume d'une recette avec une qualité minimale. Leur validation consomme le volume disponible dans les batches `READY`, puis crédite pièces, réputation et expérience.

> Choix de modélisation MVP : `NpcOrderLine.quantity` représente ici un nombre de litres de boisson finie. Une future entité de bouteilles/produits finis pourra remplacer ce raccourci si le domaine devient plus détaillé.

### Commandes entre joueurs

Lors de la création d'une commande, la récompense en pièces est placée en séquestre logique en étant immédiatement retirée au créateur.

Lors de l'exécution, une seule transaction :

```text
retire les ressources du vendeur
+ ajoute les ressources à l'acheteur
+ verse les pièces au vendeur
+ clôture la commande
```

Une annulation ou une expiration rembourse le créateur.

### Taverne

La première version expose les joueurs les mieux classés par réputation/niveau et le nombre de commandes joueur ouvertes.

## API fonctionnelle

Principales routes :

```text
GET  /api/players/{playerId}
GET  /api/players/{playerId}/state
GET  /api/players/{playerId}/inventory

GET  /api/catalog/ingredients
GET  /api/catalog/crops

GET  /api/farm/players/{playerId}/fields
POST /api/farm/plant
POST /api/farm/fields/{fieldId}/refresh
POST /api/farm/fields/{fieldId}/harvest

GET  /api/apiary/players/{playerId}/hives
POST /api/apiary/hives/{hiveId}/start
POST /api/apiary/hives/{hiveId}/refresh
POST /api/apiary/hives/{hiveId}/harvest

GET  /api/recipes/players/{playerId}
GET  /api/recipes/{recipeId}/players/{playerId}
POST /api/recipes

GET  /api/brewery/players/{playerId}/batches
POST /api/brewery/batches
POST /api/brewery/batches/{batchId}/refresh

GET  /api/npc-orders/players/{playerId}
POST /api/npc-orders/players/{playerId}/generate
POST /api/npc-orders/{orderId}/accept
POST /api/npc-orders/{orderId}/complete

GET  /api/player-orders/market
GET  /api/player-orders/players/{playerId}
POST /api/player-orders
POST /api/player-orders/{orderId}/fulfill
POST /api/player-orders/{orderId}/cancel

GET  /api/tavern
```

`GET /api/players/{playerId}/state` fournit un read model agrégé destiné à simplifier le raccordement futur de l'interface.

## Point d'entrée pour la future création de compte

`PlayerService.initializePlayer(userId)` crée une seule fois :

- le `PlayerProfile` lié au `User` ;
- trois parcelles vides ;
- deux ruches ;
- un stock de départ en eau, miel et céréales.

La couche de sécurité/inscription pourra appeler cette méthode après la création sécurisée du `User`.

## Ce qui reste volontairement à la phase sécurité

Les routes fonctionnelles acceptent encore des identifiants `playerId`, `creatorId` ou `fulfillerId`. C'est volontaire pour séparer la logique métier du travail de sécurité.

La phase Spring Security devra notamment :

- créer/charger les utilisateurs avec mot de passe hashé ;
- relier le `Principal` authentifié à son `PlayerProfile` ;
- remplacer les identifiants joueur fournis par le client par l'identité courante lorsque l'action concerne le joueur connecté ;
- vérifier la propriété des parcelles, ruches, recettes, batches et commandes avant toute mutation ;
- définir les autorisations `PLAYER` / `ADMIN` ;
- protéger les opérations économiques contre l'usurpation d'identité ;
- décider quelles données de la taverne et du catalogue restent publiques.

Une fois cette étape faite, le frontend pourra consommer les endpoints sans avoir à connaître ou choisir arbitrairement l'identité du joueur courant.
