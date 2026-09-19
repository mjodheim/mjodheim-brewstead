# Revue des interactions — 19 septembre 2026

## Défauts traités

| Défaut | Correction | Régression couverte |
| --- | --- | --- |
| Chat ouvert depuis la carte : champ caché homonyme lu à la place du champ visible | Nettoyage des panneaux fermés, aperçu de taverne sans formulaire | Entrée par le marqueur, un seul `chatInput`, envoi et réception dans deux sessions |
| Brouillons, focus et boutons remplacés par les rafraîchissements | Réconciliation du DOM existant plutôt que remplacement du panneau | Saisie lente pendant réception, identité du champ et focus conservés |
| Échec d'envoi silencieux et texte perdu | Texte conservé, état d'envoi, erreur lisible, bouton réutilisable | Panne réseau simulée puis nouvelle tentative réussie |
| Doubles envois et réponses tardives qui changent la navigation | Garde d'envoi et version de navigation | Double clic mobile, réponse de publication retardée et changement d'écran |
| Productions et marché figés dans le navigateur | Relecture serveur toutes les 15 secondes et au retour de l'onglet | Ruche récoltable sans rechargement, commande reçue par un autre joueur |
| Requêtes répétées et lectures de chat coûteuses | Catalogues et identité mis en cache, chargements regroupés, auteurs chargés avec les messages | Tests Node des requêtes ; parcours PostgreSQL/Chromium |
| Échecs API masqués en listes vides | Erreurs propagées et session expirée reconnue sur les mutations | Tests Node 401/403/500, expiration réelle du cookie dans le navigateur |
| Remboursement de commande majoré par les bonus de gains | Restitution exacte, indépendante des récompenses | Test de débit/remboursement et tests annulation/expiration |
| Météo étirée et panneaux mobiles recouverts par la navigation | Positionnement corrigé, espace réservé au dock, effets liés au décor | Assertions CSS, captures ordinateur et fenêtre étroite |

## Validation reproductible

La CI lance `./mvnw -B clean verify` avec Java 26, PostgreSQL 17 et Chrome/ChromeDriver, puis `node --test src/test/js/*.test.cjs` et les vérifications syntaxiques JavaScript/JSON.

Les tests navigateur utilisent les clics WebDriver natifs ; ils n'exécutent plus `element.click()` en JavaScript. Le script de défilement sert uniquement à amener le contrôle dans la zone visible. Les réglages de mouvement sont actionnés par l'interface.

Les six captures sont publiées par la CI dans l'artefact `brewstead-playtest` : domaine, progression ordinateur/mobile, chat après échec d'envoi, chat mobile et marché après livraison. Une capture supplémentaire est enregistrée si un parcours échoue.

## Limites

Ces tests couvrent deux sessions réelles du serveur de test, pas une montée en charge ni toutes les courses concurrentes possibles. La fenêtre étroite vérifie la disposition responsive, pas un appareil tactile physique ni son clavier virtuel. La panne d'envoi et la réponse lente sont injectées côté navigateur ; le reste des parcours emploie les API et la base réelles. La validation CI n'équivaut pas à une session manuelle sur le serveur de production.
