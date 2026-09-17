package be.mjodheim.brewstead.dto.recipe;

import be.mjodheim.brewstead.enums.DrinkType;

import java.math.BigDecimal;
import java.util.List;

public record RecipeResponse(
        Long id,
        Long ownerId,
        String ownerUsername,
        String name,
        DrinkType drinkType,
        BigDecimal baseVolume,
        int fermentationDurationHours,
        boolean isPublic,
        List<RecipeIngredientResponse> ingredients
) {
}
