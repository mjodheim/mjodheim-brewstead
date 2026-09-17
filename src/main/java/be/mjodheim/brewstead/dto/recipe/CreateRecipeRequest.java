package be.mjodheim.brewstead.dto.recipe;

import be.mjodheim.brewstead.enums.DrinkType;

import java.math.BigDecimal;
import java.util.List;

public record CreateRecipeRequest(
        Long ownerId,
        String name,
        DrinkType drinkType,
        BigDecimal baseVolume,
        int fermentationDurationHours,
        List<RecipeIngredientRequest> ingredients
) {
}
