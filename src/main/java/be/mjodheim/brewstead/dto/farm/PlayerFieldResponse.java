package be.mjodheim.brewstead.dto.farm;

import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.enums.IngredientType;

import java.time.LocalDateTime;

/**
 * Une parcelle telle que le joueur la voit.
 *
 * <p>{@code cropType} est la famille de ce qui y pousse (céréale, houblon,
 * fruit, herbe, épice) : le décor en tire le dessin de la culture, des épis
 * pour l'orge, des perches pour le houblon, des arbustes pour les baies.
 */
public record PlayerFieldResponse(
        Long id,
        String cropName,
        IngredientType cropType,
        LocalDateTime plantedAt,
        LocalDateTime readyAt,
        FieldStatus status
) {
}
