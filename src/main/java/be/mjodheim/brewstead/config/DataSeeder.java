package be.mjodheim.brewstead.config;

import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.RecipeIngredient;
import be.mjodheim.brewstead.enums.DrinkType;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.enums.Unit;
import be.mjodheim.brewstead.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final CropRepository cropRepository;
    private final IngredientRepository ingredientRepository;
    private final RecipeRepository recipeRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;

    @Override
    public void run(String... args) throws Exception {
        if (ingredientRepository.count() > 0) {
            return;
        }

        Ingredient barley = ingredientRepository.save(
                Ingredient.builder()
                        .name("Barley")
                        .type(IngredientType.CEREAL)
                        .unit(Unit.KILOGRAM)
                        .baseValue(new BigDecimal("2.50"))
                        .build()
        );

        Ingredient honey = ingredientRepository.save(
                Ingredient.builder()
                        .name("Honey")
                        .type(IngredientType.HONEY)
                        .unit(Unit.KILOGRAM)
                        .baseValue(new BigDecimal("8.00"))
                        .build()
        );

        Ingredient hops = ingredientRepository.save(
                Ingredient.builder()
                        .name("Hops")
                        .type(IngredientType.HOP)
                        .unit(Unit.GRAM)
                        .baseValue(new BigDecimal("0.03"))
                        .build()
        );

        Ingredient water = ingredientRepository.save(
                Ingredient.builder()
                        .name("Water")
                        .type(IngredientType.WATER)
                        .unit(Unit.LITER)
                        .baseValue(new BigDecimal("0.10"))
                        .build()
        );

        cropRepository.save(
                Crop.builder()
                        .name("Barley Field")
                        .ingredient(barley)
                        .growDurationMinutes(5)
                        .yieldQuantity(new BigDecimal("3.000"))
                        .build()
        );

        Recipe beginnerMead = recipeRepository.save(
                Recipe.builder()
                        .name("Beginner Mead")
                        .drinkType(DrinkType.MEAD)
                        .baseVolume(new BigDecimal("10.00"))
                        .fermentationDurationHours(1)
                        .isPublic(true)
                        .build()
        );

        recipeIngredientRepository.save(
                RecipeIngredient.builder()
                        .recipe(beginnerMead)
                        .ingredient(honey)
                        .quantity(new BigDecimal("2.000"))
                        .build()
        );

        recipeIngredientRepository.save(
                RecipeIngredient.builder()
                        .recipe(beginnerMead)
                        .ingredient(water)
                        .quantity(new BigDecimal("8.000"))
                        .build()
        );
    }
}
