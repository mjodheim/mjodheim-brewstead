package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.recipe.CreateRecipeRequest;
import be.mjodheim.brewstead.dto.recipe.RecipeResponse;
import be.mjodheim.brewstead.service.RecipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/recipes")
@RequiredArgsConstructor
public class RecipeController {

    private final RecipeService recipeService;

    @GetMapping("/players/{playerId}")
    public List<RecipeResponse> recipes(@PathVariable Long playerId) {
        return recipeService.findAvailableRecipes(playerId);
    }

    @GetMapping("/{recipeId}/players/{playerId}")
    public RecipeResponse recipe(@PathVariable Long recipeId, @PathVariable Long playerId) {
        return recipeService.findRecipe(playerId, recipeId);
    }

    @PostMapping
    public RecipeResponse create(@RequestBody CreateRecipeRequest request) {
        return recipeService.createRecipe(request);
    }
}
