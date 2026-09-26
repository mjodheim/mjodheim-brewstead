package be.mjodheim.brewstead.dto.brew;

import be.mjodheim.brewstead.enums.BatchStatus;
import be.mjodheim.brewstead.enums.DrinkType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record BatchResponse(
        Long id,
        Long recipeId,
        String recipeName,
        DrinkType drinkType,
        BigDecimal volume,
        LocalDateTime startedAt,
        LocalDateTime readyAt,
        BatchStatus status,
        Integer quality,
        LocalDateTime cellaredAt
) {
}
