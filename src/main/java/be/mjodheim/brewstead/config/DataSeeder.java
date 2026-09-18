package be.mjodheim.brewstead.config;

import be.mjodheim.brewstead.entity.*;
import be.mjodheim.brewstead.enums.DrinkType;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.enums.Unit;
import be.mjodheim.brewstead.enums.UserRole;
import be.mjodheim.brewstead.repository.*;
import be.mjodheim.brewstead.service.PlayerService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final CropRepository cropRepository;
    private final IngredientRepository ingredientRepository;
    private final RecipeRepository recipeRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PlayerService playerService;

    @Override
    public void run(String... args) throws Exception {
        if (ingredientRepository.count() == 0) {

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

        if (userRepository.count() == 0) {
            String password = passwordEncoder.encode("Test123=");

            User player = User.builder()
                    .username("Anthony")
                    .password(password)
                    .role(UserRole.PLAYER)
                    .build();

            userRepository.save(player);

            // même chemin que l'inscription : champs, ruches et réserves de départ
            playerService.initializePlayer(player.getId());
        }
    }
}
