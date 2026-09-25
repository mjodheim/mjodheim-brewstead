package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.account.ApparenceRequest;
import be.mjodheim.brewstead.entity.Apparence;
import be.mjodheim.brewstead.entity.PlayerProfile;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ce qu'on peut choisir dans l'atelier du personnage.
 *
 * <p>La même liste vit dans {@code brewstead-personnage.js}, qui sait les
 * dessiner ; un test vérifie que les deux ne divergent pas.
 */
public final class ApparenceCatalogue {

    public static final Map<String, List<String>> OPTIONS = options();

    private ApparenceCatalogue() {
    }

    private static Map<String, List<String>> options() {
        Map<String, List<String>> options = new LinkedHashMap<>();
        options.put("corps", List.of("robuste", "fin", "grand"));
        options.put("peau", List.of("claire", "rosee", "doree", "halee", "brune", "ebene"));
        options.put("cheveux", List.of("court", "tresse", "long", "chignon", "boucles", "rase"));
        options.put("teinte", List.of("blond", "roux", "chatain", "brun", "noir", "gris"));
        options.put("barbe", List.of("aucune", "courte", "longue", "tressee", "moustache"));
        options.put("tenue", List.of("brasseur", "voyageur", "fermier", "marchand", "guerrier"));
        options.put("couleur", List.of("ambre", "fjord", "mousse", "prune", "cuivre", "ardoise"));
        return Collections.unmodifiableMap(options);
    }

    public static Apparence valider(ApparenceRequest request) {
        if (request == null) throw new IllegalArgumentException("Aucune allure reçue.");
        return new Apparence(
                choix("corps", request.corps()),
                choix("peau", request.peau()),
                choix("cheveux", request.cheveux()),
                choix("teinte", request.teinte()),
                choix("barbe", request.barbe()),
                choix("tenue", request.tenue()),
                choix("couleur", request.couleur()));
    }

    private static String choix(String groupe, String valeur) {
        String propre = valeur == null ? "" : valeur.trim().toLowerCase();
        if (!OPTIONS.get(groupe).contains(propre)) {
            throw new IllegalArgumentException("Choix inconnu pour « " + groupe + " » : " + valeur);
        }
        return propre;
    }

    /**
     * L'allure d'un joueur qui n'a rien choisi : tirée de son identifiant,
     * donc stable d'une visite à l'autre. Corps, coiffure, tenue et couleur
     * suivent le même tirage qu'avant l'atelier.
     */
    public static Apparence parDefaut(Long playerId) {
        long seed = playerId == null ? 0 : Math.abs(playerId);
        List<String> anciennesCoiffures = List.of("court", "tresse", "long", "rase", "boucles");
        List<String> anciennesTenues = List.of("brasseur", "voyageur", "fermier", "marchand");
        List<String> anciennesTeintes = List.of("brun", "chatain", "chatain", "noir", "blond");
        return new Apparence(
                pick("corps", seed),
                pick("peau", seed / 5),
                anciennesCoiffures.get((int) ((seed / 3) % anciennesCoiffures.size())),
                anciennesTeintes.get((int) (seed % anciennesTeintes.size())),
                seed % 3 == 0 ? "courte" : "aucune",
                anciennesTenues.get((int) ((seed / 7) % anciennesTenues.size())),
                pick("couleur", seed / 11));
    }

    private static String pick(String groupe, long seed) {
        List<String> liste = OPTIONS.get(groupe);
        return liste.get((int) (seed % liste.size()));
    }

    public static boolean choisie(PlayerProfile player) {
        Apparence a = player.getApparence();
        return a != null && a.getCorps() != null;
    }

    public static Apparence effective(PlayerProfile player) {
        return choisie(player) ? player.getApparence() : parDefaut(player.getId());
    }
}
