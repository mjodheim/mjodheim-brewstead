package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.entity.Beehive;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.enums.BehiveStatus;
import be.mjodheim.brewstead.enums.EffectKind;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.mapper.ApiaryMapper;
import be.mjodheim.brewstead.repository.BeehiveRepository;
import be.mjodheim.brewstead.repository.IngredientRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static be.mjodheim.brewstead.TestData.ingredient;
import static be.mjodheim.brewstead.TestData.player;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ApiaryServiceTest {

    @Mock BeehiveRepository beehiveRepository;
    @Mock IngredientRepository ingredientRepository;
    @Mock InventoryService inventoryService;
    @Mock ApiaryMapper mapper;
    @Mock EffectService effectService;
    @Mock ProgressionService progressionService;
    @InjectMocks ApiaryService service;

    @Test
    void findAllHivesRefreshesReadyHives() {
        Beehive hive = Beehive.builder()
                .player(player(1))
                .status(BehiveStatus.PRODUCING)
                .readyAt(LocalDateTime.now().minusSeconds(1))
                .build();
        List<Beehive> hives = List.of(hive);
        when(beehiveRepository.findAllByPlayerId(1L)).thenReturn(hives);
        when(mapper.toResponseList(hives)).thenReturn(List.of());

        service.findAllHives(1L);

        assertEquals(BehiveStatus.READY, hive.getStatus());
    }

    @Test
    void startProductionUsesLevelAndEffectForDuration() {
        PlayerProfile owner = player(1);
        Beehive hive = Beehive.builder()
                .id(5L).player(owner).level(3).status(BehiveStatus.IDLE).build();
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));
        when(effectService.durationFactor(1L, EffectKind.BOURDONNEMENT)).thenReturn(0.5);

        service.startProduction(1L, 5L);

        assertEquals(BehiveStatus.PRODUCING, hive.getStatus());
        assertEquals(4, Duration.between(hive.getStartedAt(), hive.getReadyAt()).toMinutes());
    }

    @Test
    void startProductionRequiresIdleHive() {
        Beehive hive = Beehive.builder()
                .id(5L).player(player(1)).status(BehiveStatus.READY).build();
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));

        assertThrows(IllegalStateException.class,
                () -> service.startProduction(1L, 5L));
    }

    @Test
    void operationsRejectForeignHive() {
        Beehive hive = Beehive.builder()
                .id(5L).player(player(2)).status(BehiveStatus.IDLE).build();
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));

        assertThrows(AccessDeniedException.class,
                () -> service.updateHiveStatus(1L, 5L));
    }

    @Test
    void harvestRequiresReadyHive() {
        Beehive hive = Beehive.builder()
                .id(5L).player(player(1)).status(BehiveStatus.PRODUCING)
                .readyAt(LocalDateTime.now().plusMinutes(1)).build();
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));

        assertThrows(IllegalStateException.class, () -> service.harvest(1L, 5L));
        verifyNoInteractions(ingredientRepository, inventoryService);
    }

    @Test
    void harvestAddsHoneyScaledByHiveLevelAndResetsHive() {
        Beehive hive = Beehive.builder()
                .id(5L).player(player(1)).level(3).status(BehiveStatus.READY).build();
        Ingredient honey = ingredient(8, IngredientType.HONEY);
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));
        when(ingredientRepository.findFirstByType(IngredientType.HONEY))
                .thenReturn(Optional.of(honey));

        when(progressionService.harvestYield(eq(1L), any(BigDecimal.class)))
                .thenAnswer(call -> call.getArgument(1));
        service.harvest(1L, 5L);

        verify(inventoryService).addIngredient(argThat(request ->
                request.playerId().equals(1L)
                        && request.ingredientId().equals(8L)
                        && request.quantity().compareTo(new BigDecimal("3.000")) == 0));
        assertEquals(BehiveStatus.IDLE, hive.getStatus());
        assertNull(hive.getStartedAt());
        assertNull(hive.getReadyAt());
    }

    @Test
    void harvestFailsWhenHoneyIsNotConfigured() {
        Beehive hive = Beehive.builder()
                .id(5L).player(player(1)).status(BehiveStatus.READY).build();
        when(beehiveRepository.findById(5L)).thenReturn(Optional.of(hive));
        when(ingredientRepository.findFirstByType(IngredientType.HONEY))
                .thenReturn(Optional.empty());

        assertThrows(IllegalStateException.class, () -> service.harvest(1L, 5L));
    }
}
