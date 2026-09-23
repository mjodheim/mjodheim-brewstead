package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.entity.Batch;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.RecipeIngredient;
import be.mjodheim.brewstead.enums.BatchStatus;
import be.mjodheim.brewstead.mapper.BrewMapper;
import be.mjodheim.brewstead.repository.BatchRepository;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.RecipeIngredientRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static be.mjodheim.brewstead.TestData.player;
import static be.mjodheim.brewstead.TestData.recipe;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GenesisV21BrewQualityBonusTest {
    @Mock BatchRepository batches;
    @Mock PlayerProfileRepository players;
    @Mock RecipeIngredientRepository ingredients;
    @Mock RecipeService recipes;
    @Mock InventoryService inventory;
    @Mock BrewMapper mapper;
    @Mock EffectService effects;
    @Mock ProgressionService progression;

    @Test
    void readyBatchQualityIncludesProgressionBonus() {
        BrewService service = new BrewService(batches, players, ingredients, recipes, inventory, mapper, effects, progression);
        PlayerProfile player = player(1);
        player.setLevel(5);
        Recipe recipe = recipe(3);
        Batch ready = Batch.builder()
                .id(4L).player(player).recipe(recipe)
                .volume(BigDecimal.TEN)
                .startedAt(LocalDateTime.now().minusMinutes(11))
                .readyAt(LocalDateTime.now().minusMinutes(1))
                .status(BatchStatus.BREWING)
                .build();
        when(batches.findById(4L)).thenReturn(Optional.of(ready));
        when(ingredients.findAllByRecipeId(3L))
                .thenReturn(List.of(new RecipeIngredient(), new RecipeIngredient(), new RecipeIngredient()));
        when(effects.qualityShift(1L)).thenReturn(5);
        when(progression.brewingQualityBonus(1L)).thenReturn(7);

        service.updateBatchStatus(1L, 4L);

        assertEquals(BatchStatus.READY, ready.getStatus());
        assertEquals(89, ready.getQuality());
    }
}
