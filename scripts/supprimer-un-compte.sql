-- Supprime définitivement un compte et tout ce que son domaine a produit.
--
-- Aucune clé étrangère n'est en ON DELETE CASCADE : il faut donc descendre
-- l'arbre dans l'ordre, des lignes vers les entêtes, puis du domaine vers le
-- compte. Ce qui touche les AUTRES joueurs est démêlé, pas effacé : une
-- commande qu'un voisin a honorée reste à lui, elle perd seulement son
-- demandeur.
--
-- Usage :
--   psql "$DB_URL" -v pseudo="'Anthony'" -f scripts/supprimer-un-compte.sql
--
-- Les guillemets simples autour du pseudo font partie de la valeur : psql
-- remplace :pseudo textuellement.

BEGIN;

CREATE TEMP TABLE a_supprimer ON COMMIT DROP AS
SELECT u.id AS user_id, p.id AS player_id
FROM users u LEFT JOIN player_profiles p ON p.user_id = u.id
WHERE u.username = :pseudo;

\echo 'Comptes visés :'
SELECT * FROM a_supprimer;

-- Les lignes de détail, avant leurs entêtes.
DELETE FROM npc_order_lines WHERE order_id IN (
    SELECT id FROM npc_orders WHERE player_id IN (SELECT player_id FROM a_supprimer));
DELETE FROM player_order_lines WHERE player_order_id IN (
    SELECT id FROM player_orders WHERE creator_id IN (SELECT player_id FROM a_supprimer));
DELETE FROM recipe_ingredients WHERE recipe_id IN (
    SELECT id FROM recipes WHERE owner_id IN (SELECT player_id FROM a_supprimer));

-- Les commandes que ce domaine a honorées pour quelqu'un d'autre restent au
-- voisin : elles perdent seulement leur exécutant.
UPDATE player_orders SET fulfilled_by_id = NULL
WHERE fulfilled_by_id IN (SELECT player_id FROM a_supprimer);

DELETE FROM player_orders WHERE creator_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM npc_orders WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM tasting_offers WHERE seller_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM tavern_messages WHERE author_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM batches WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM recipes WHERE owner_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_inventory WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_fields WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM beehives WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_effects WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_achievements WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_progress WHERE player_id IN (SELECT player_id FROM a_supprimer);
DELETE FROM player_profiles WHERE id IN (SELECT player_id FROM a_supprimer);
DELETE FROM users WHERE id IN (SELECT user_id FROM a_supprimer);

\echo 'Reste-t-il quelque chose ?'
SELECT count(*) AS comptes_restants FROM users WHERE username = :pseudo;

COMMIT;
