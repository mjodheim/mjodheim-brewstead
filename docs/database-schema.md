```mermaid
erDiagram

    USER {
        Long id PK
        String username UK
        String password
        String role
    }

    PLAYER_PROFILE {
        Long id PK
        Long user_id FK
        int level
        int experience
        int coin
        int reputation
    }

    PLAYER_PROGRESS {
        Long id PK
        Long player_id FK, UK
        long harvested_fields
        long harvested_hives
        long started_batches
        long completed_orders
        long player_trades
        long tavern_tastings
        date last_visit_date
        int visit_streak
        date daily_date
        String daily_action
        int daily_progress
        boolean daily_claimed
    }

    PLAYER_ACHIEVEMENT {
        Long id PK
        Long player_id FK
        String code UK
        datetime unlocked_at
    }

    INGREDIENT {
        Long id PK
        String name
        String type
        String unit
        decimal base_value
    }

    PLAYER_INVENTORY {
        Long id PK
        Long player_id FK
        Long ingredient_id FK
        decimal quantity
    }

    CROP {
        Long id PK
        String name
        Long ingredient_id FK
        int grow_duration_minutes
        decimal yield_quantity
    }

    PLAYER_FIELD {
        Long id PK
        Long player_id FK
        Long crop_id FK
        datetime planted_at
        datetime ready_at
        String status
    }

    BEEHIVE {
        Long id PK
        Long player_id FK
        int level
        datetime started_at
        datetime ready_at
        String status
    }

    RECIPE {
        Long id PK
        Long owner_id FK
        String name
        String drink_type
        decimal base_volume
        int fermentation_duration_hours
        boolean is_public
    }

    RECIPE_INGREDIENT {
        Long recipe_id PK, FK
        Long ingredient_id PK, FK
        decimal quantity
    }

    BATCH {
        Long id PK
        Long player_id FK
        Long recipe_id FK
        decimal volume
        datetime started_at
        datetime ready_at
        String status
        int quality
    }

    NPC_ORDER {
        Long id PK
        Long player_id FK
        String customer_name
        datetime created_at
        datetime expires_at
        String status
        int reward_coins
        int reward_reputation
    }

    NPC_ORDER_LINE {
        Long id PK
        Long npc_order_id FK
        Long recipe_id FK
        int quantity
        int min_quality
    }

    PLAYER_ORDER {
        Long id PK
        Long creator_id FK
        Long fulfilled_by_id FK
        datetime created_at
        datetime expires_at
        String status
        int reward_coins
    }

    PLAYER_ORDER_LINE {
        Long id PK
        Long player_order_id FK
        Long ingredient_id FK
        decimal quantity
    }

    USER ||--|| PLAYER_PROFILE : has
    PLAYER_PROFILE ||--|| PLAYER_PROGRESS : tracks
    PLAYER_PROFILE ||--o{ PLAYER_ACHIEVEMENT : unlocks

    PLAYER_PROFILE ||--o{ PLAYER_INVENTORY : owns
    INGREDIENT ||--o{ PLAYER_INVENTORY : stored_as

    INGREDIENT ||--o{ CROP : produced_by
    PLAYER_PROFILE ||--o{ PLAYER_FIELD : owns
    CROP ||--o{ PLAYER_FIELD : planted_as

    PLAYER_PROFILE ||--o{ BEEHIVE : owns

    PLAYER_PROFILE ||--o{ RECIPE : creates
    RECIPE ||--o{ RECIPE_INGREDIENT : contains
    INGREDIENT ||--o{ RECIPE_INGREDIENT : used_in

    PLAYER_PROFILE ||--o{ BATCH : brews
    RECIPE ||--o{ BATCH : based_on

    PLAYER_PROFILE ||--o{ NPC_ORDER : receives
    NPC_ORDER ||--|{ NPC_ORDER_LINE : contains
    RECIPE ||--o{ NPC_ORDER_LINE : requested_as

    PLAYER_PROFILE ||--o{ PLAYER_ORDER : creates
    PLAYER_PROFILE ||--o{ PLAYER_ORDER : fulfils
    PLAYER_ORDER ||--|{ PLAYER_ORDER_LINE : contains
    INGREDIENT ||--o{ PLAYER_ORDER_LINE : requested_as
```

## Remarques

- `RECIPE.owner_id` peut être nul pour les recettes officielles du jeu.
- `PLAYER_INVENTORY` représente une relation joueur–ingrédient avec quantité.
- `RECIPE_INGREDIENT` est une table de liaison enrichie par la quantité.
- `PLAYER_ORDER_LINE` porte les ressources demandées par une commande entre joueurs.
- `PLAYER_ORDER.fulfilled_by_id` reste nul tant que la commande n'a pas été satisfaite.
- `PLAYER_PROGRESS` conserve les compteurs durables, la série de visites et l'objectif quotidien courant.
- L'unicité `(player_id, code)` de `PLAYER_ACHIEVEMENT` garantit qu'une récompense de haut fait n'est attribuée qu'une fois.
- Les temps de production, de fermentation et d'expiration utilisent des timestamps (`LocalDateTime` côté Java).
- Les statuts sont modélisés en Java avec des enums.
- Dans le MVP fonctionnel, le volume restant d'un `BATCH` en statut `READY` sert de stock de boisson finie pour les commandes PNJ.
