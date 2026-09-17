package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.game.GameStateResponse;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GameStateService {

    private final PlayerService playerService;
    private final FarmService farmService;
    private final ApiaryService apiaryService;
    private final InventoryService inventoryService;
    private final RecipeService recipeService;
    private final BrewService brewService;
    private final NpcOrderService npcOrderService;

    @Transactional
    public GameStateResponse getState(Long playerId) {
        return new GameStateResponse(
                playerService.getPlayer(playerId),
                farmService.findAllFields(playerId),
                apiaryService.findAllHives(playerId),
                inventoryService.getPlayerInventory(playerId),
                recipeService.findAvailableRecipes(playerId),
                brewService.findPlayerBatches(playerId),
                npcOrderService.findAllOrders(playerId)
        );
    }
}
