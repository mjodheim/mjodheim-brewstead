package be.mjodheim.brewstead.dto.tavern;

import java.util.Map;

/** La réponse d'un jeu de taverne : un mot pour le joueur, et le détail publié à la salle. */
public record TavernGameResponse(String message, Map<String, Object> detail) {}
