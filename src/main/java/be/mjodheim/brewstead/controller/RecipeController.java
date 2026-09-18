package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.recipe.CreateRecipeRequest;
import be.mjodheim.brewstead.dto.recipe.RecipeResponse;
import be.mjodheim.brewstead.service.CurrentPlayerService;
import be.mjodheim.brewstead.service.RecipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/recipes")
@RequiredArgsConstructor
public class RecipeController {

    private final RecipeService recipeService;
    private final CurrentPlayerService currentPlayer;

    @GetMapping("/players/{playerId}")
    public List<RecipeResponse> recipes(Principal principal, @PathVariable Long playerId) {
        return recipeService.findAvailableRecipes(currentPlayer.requireSelf(principal, playerId));
    }

    @GetMapping("/{recipeId}/players/{playerId}")
    public RecipeResponse recipe(
            Principal principal,
            @PathVariable Long recipeId,
            @PathVariable Long playerId
    ) {
        return recipeService.findRecipe(currentPlayer.requireSelf(principal, playerId), recipeId);
    }

    @PostMapping
    public RecipeResponse create(Principal principal, @RequestBody CreateRecipeRequest request) {
        currentPlayer.requireSelf(principal, request.ownerId());
        return recipeService.createRecipe(request);
    }
}
