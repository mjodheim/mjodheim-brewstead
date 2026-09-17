package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.recipe.CreateRecipeRequest;
import be.mjodheim.brewstead.dto.recipe.RecipeIngredientRequest;
import be.mjodheim.brewstead.dto.recipe.RecipeResponse;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.RecipeIngredient;
import be.mjodheim.brewstead.mapper.RecipeMapper;
import be.mjodheim.brewstead.repository.IngredientRepository;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.RecipeIngredientRepository;
import be.mjodheim.brewstead.repository.RecipeRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;
    private final IngredientRepository ingredientRepository;
    private final PlayerProfileRepository playerProfileRepository;
    private final RecipeMapper recipeMapper;

    @Transactional
    public List<RecipeResponse> findAvailableRecipes(Long playerId) {
        getPlayer(playerId);
        return recipeRepository.findAllByIsPublicTrueOrOwnerId(playerId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public RecipeResponse findRecipe(Long playerId, Long recipeId) {
        Recipe recipe = getRecipe(recipeId);
        assertAccessible(recipe, playerId);
        return toResponse(recipe);
    }

    @Transactional
    public RecipeResponse createRecipe(CreateRecipeRequest request) {
        validateRequest(request);
        PlayerProfile owner = getPlayer(request.ownerId());

        Recipe recipe = recipeRepository.save(
                Recipe.builder()
                        .owner(owner)
                        .name(request.name().trim())
                        .drinkType(request.drinkType())
                        .baseVolume(request.baseVolume())
                        .fermentationDurationHours(request.fermentationDurationHours())
                        .isPublic(false)
                        .build()
        );

        List<RecipeIngredient> lines = request.ingredients().stream()
                .map(line -> toEntity(recipe, line))
                .toList();
        recipeIngredientRepository.saveAll(lines);

        return recipeMapper.toResponse(recipe, lines);
    }

    @Transactional
    public Recipe getAccessibleRecipeEntity(Long playerId, Long recipeId) {
        Recipe recipe = getRecipe(recipeId);
        assertAccessible(recipe, playerId);
        return recipe;
    }

    private RecipeResponse toResponse(Recipe recipe) {
        return recipeMapper.toResponse(
                recipe,
                recipeIngredientRepository.findAllByRecipeId(recipe.getId())
        );
    }

    private RecipeIngredient toEntity(Recipe recipe, RecipeIngredientRequest request) {
        Ingredient ingredient = ingredientRepository.findById(request.ingredientId())
                .orElseThrow(() -> new IllegalArgumentException("Ingredient not found"));

        return RecipeIngredient.builder()
                .recipe(recipe)
                .ingredient(ingredient)
                .quantity(request.quantity())
                .build();
    }

    private void validateRequest(CreateRecipeRequest request) {
        if (request.ownerId() == null) {
            throw new IllegalArgumentException("Recipe owner is required");
        }
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("Recipe name is required");
        }
        if (request.drinkType() == null) {
            throw new IllegalArgumentException("Drink type is required");
        }
        if (request.baseVolume() == null || request.baseVolume().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Base volume must be greater than zero");
        }
        if (request.fermentationDurationHours() <= 0) {
            throw new IllegalArgumentException("Fermentation duration must be greater than zero");
        }
        if (request.ingredients() == null || request.ingredients().isEmpty()) {
            throw new IllegalArgumentException("A recipe must contain at least one ingredient");
        }

        Set<Long> ingredientIds = new HashSet<>();
        for (RecipeIngredientRequest line : request.ingredients()) {
            if (line.ingredientId() == null || line.quantity() == null
                    || line.quantity().compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Recipe ingredient quantity must be greater than zero");
            }
            if (!ingredientIds.add(line.ingredientId())) {
                throw new IllegalArgumentException("An ingredient can only appear once in a recipe");
            }
        }
    }

    private PlayerProfile getPlayer(Long playerId) {
        return playerProfileRepository.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));
    }

    private Recipe getRecipe(Long recipeId) {
        return recipeRepository.findById(recipeId)
                .orElseThrow(() -> new IllegalArgumentException("Recipe not found"));
    }

    private void assertAccessible(Recipe recipe, Long playerId) {
        boolean ownedByPlayer = recipe.getOwner() != null && recipe.getOwner().getId().equals(playerId);
        if (!recipe.isPublic() && !ownedByPlayer) {
            throw new IllegalStateException("Recipe is not available to this player");
        }
    }
}
