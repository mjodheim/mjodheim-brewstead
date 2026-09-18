package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.recipe.CreateRecipeRequest;
import be.mjodheim.brewstead.dto.recipe.RecipeIngredientRequest;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.RecipeIngredient;
import be.mjodheim.brewstead.enums.DrinkType;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.mapper.RecipeMapper;
import be.mjodheim.brewstead.repository.IngredientRepository;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.RecipeIngredientRepository;
import be.mjodheim.brewstead.repository.RecipeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static be.mjodheim.brewstead.TestData.ingredient;
import static be.mjodheim.brewstead.TestData.player;
import static be.mjodheim.brewstead.TestData.recipe;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RecipeServiceTest {

    @Mock RecipeRepository recipeRepository;
    @Mock RecipeIngredientRepository recipeIngredientRepository;
    @Mock IngredientRepository ingredientRepository;
    @Mock PlayerProfileRepository playerRepository;
    @Mock RecipeMapper mapper;
    @InjectMocks RecipeService service;

    @Test
    void accessibleRecipeAllowsPublicAndOwnerButRejectsPrivateForeignRecipe() {
        Recipe publicRecipe = recipe(1);
        publicRecipe.setPublic(true);
        when(recipeRepository.findById(1L)).thenReturn(Optional.of(publicRecipe));
        assertSame(publicRecipe, service.getAccessibleRecipeEntity(10L, 1L));

        Recipe owned = recipe(2);
        owned.setPublic(false);
        owned.setOwner(player(10));
        when(recipeRepository.findById(2L)).thenReturn(Optional.of(owned));
        assertSame(owned, service.getAccessibleRecipeEntity(10L, 2L));

        Recipe foreign = recipe(3);
        foreign.setPublic(false);
        foreign.setOwner(player(11));
        when(recipeRepository.findById(3L)).thenReturn(Optional.of(foreign));
        assertThrows(IllegalStateException.class,
                () -> service.getAccessibleRecipeEntity(10L, 3L));
    }

    @Test
    void findAvailableRecipesRequiresExistingPlayer() {
        when(playerRepository.findById(7L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> service.findAvailableRecipes(7L));
        verifyNoInteractions(recipeRepository);
    }

    @Test
    void createRecipePersistsTrimmedRecipeAndIngredients() {
        PlayerProfile owner = player(7);
        Ingredient honey = ingredient(1, IngredientType.HONEY);
        Ingredient water = ingredient(2, IngredientType.WATER);
        CreateRecipeRequest request = new CreateRecipeRequest(
                7L, "  Mon Hydromel  ", DrinkType.values()[0],
                new BigDecimal("10.00"), 12,
                List.of(
                        new RecipeIngredientRequest(1L, new BigDecimal("2.000")),
                        new RecipeIngredientRequest(2L, new BigDecimal("8.000"))
                ));
        when(playerRepository.findById(7L)).thenReturn(Optional.of(owner));
        when(recipeRepository.save(any(Recipe.class))).thenAnswer(invocation -> {
            Recipe saved = invocation.getArgument(0);
            saved.setId(20L);
            return saved;
        });
        when(ingredientRepository.findById(1L)).thenReturn(Optional.of(honey));
        when(ingredientRepository.findById(2L)).thenReturn(Optional.of(water));

        service.createRecipe(request);

        ArgumentCaptor<Recipe> recipeCaptor = ArgumentCaptor.forClass(Recipe.class);
        verify(recipeRepository).save(recipeCaptor.capture());
        assertEquals("Mon Hydromel", recipeCaptor.getValue().getName());
        assertFalse(recipeCaptor.getValue().isPublic());
        assertSame(owner, recipeCaptor.getValue().getOwner());

        verify(recipeIngredientRepository).saveAll(argThat(lines -> {
            int count = 0;
            for (RecipeIngredient line : lines) {
                count++;
                if (line.getRecipe().getId() != 20L || line.getQuantity().signum() <= 0) return false;
            }
            return count == 2;
        }));
    }

    @Test
    void createRecipeValidatesRequiredFieldsAndQuantities() {
        CreateRecipeRequest valid = validRequest();

        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(null, valid.name(), valid.drinkType(), valid.baseVolume(),
                        valid.fermentationDurationHours(), valid.ingredients())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, " ", valid.drinkType(), valid.baseVolume(),
                        valid.fermentationDurationHours(), valid.ingredients())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, "X", null, valid.baseVolume(),
                        valid.fermentationDurationHours(), valid.ingredients())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, "X", valid.drinkType(), BigDecimal.ZERO,
                        valid.fermentationDurationHours(), valid.ingredients())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, "X", valid.drinkType(), valid.baseVolume(),
                        0, valid.ingredients())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, "X", valid.drinkType(), valid.baseVolume(),
                        1, List.of())));
        assertThrows(IllegalArgumentException.class, () -> service.createRecipe(
                new CreateRecipeRequest(1L, "X", valid.drinkType(), valid.baseVolume(),
                        1, List.of(new RecipeIngredientRequest(1L, BigDecimal.ZERO)))));
    }

    @Test
    void createRecipeRejectsDuplicateIngredient() {
        CreateRecipeRequest request = new CreateRecipeRequest(
                1L, "X", DrinkType.values()[0], BigDecimal.TEN, 1,
                List.of(
                        new RecipeIngredientRequest(1L, BigDecimal.ONE),
                        new RecipeIngredientRequest(1L, new BigDecimal("2"))
                ));

        assertThrows(IllegalArgumentException.class,
                () -> service.createRecipe(request));
    }

    @Test
    void createRecipeRejectsMissingIngredientEntity() {
        when(playerRepository.findById(1L)).thenReturn(Optional.of(player(1)));
        when(recipeRepository.save(any(Recipe.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(ingredientRepository.findById(1L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> service.createRecipe(validRequest()));
    }

    private CreateRecipeRequest validRequest() {
        return new CreateRecipeRequest(
                1L, "Test", DrinkType.values()[0], BigDecimal.TEN, 1,
                List.of(new RecipeIngredientRequest(1L, BigDecimal.ONE)));
    }
}
