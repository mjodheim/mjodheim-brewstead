package be.mjodheim.brewstead.dto.inventory;

import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerProfile;

import java.math.BigDecimal;

public record IngredientRequest(
        PlayerProfile player,
        Ingredient ingredient,
        BigDecimal quantity
) {
}
