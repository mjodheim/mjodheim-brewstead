package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.farm.PlantCropRequest;
import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.enums.EffectKind;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.mapper.FarmMapper;
import be.mjodheim.brewstead.repository.CropRepository;
import be.mjodheim.brewstead.repository.PlayerFieldRepository;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FarmServiceTest {

    @Mock PlayerFieldRepository fieldRepository;
    @Mock InventoryService inventoryService;
    @Mock CropRepository cropRepository;
    @Mock FarmMapper mapper;
    @Mock EffectService effectService;
    @InjectMocks FarmService service;

    @Test
    void findAllFieldsRefreshesReadyCropsBeforeMapping() {
        PlayerField field = PlayerField.builder()
                .player(player(1))
                .status(FieldStatus.GROWING)
                .readyAt(LocalDateTime.now().minusSeconds(1))
                .build();
        List<PlayerField> fields = List.of(field);
        when(fieldRepository.findAllByPlayerId(1L)).thenReturn(fields);
        when(mapper.toResponseList(fields)).thenReturn(List.of());

        service.findAllFields(1L);

        assertEquals(FieldStatus.READY, field.getStatus());
        verify(mapper).toResponseList(fields);
    }

    @Test
    void plantStartsGrowthUsingActiveDurationFactor() {
        PlayerProfile owner = player(1);
        Ingredient harvest = ingredient(8, IngredientType.CEREAL);
        Crop crop = Crop.builder()
                .id(3L)
                .name("Orge")
                .ingredient(harvest)
                .growDurationMinutes(10)
                .yieldQuantity(new BigDecimal("4.000"))
                .build();
        PlayerField field = PlayerField.builder()
                .id(5L).player(owner).status(FieldStatus.EMPTY).build();
        when(cropRepository.findById(3L)).thenReturn(Optional.of(crop));
        when(fieldRepository.findById(5L)).thenReturn(Optional.of(field));
        when(effectService.durationFactor(1L, EffectKind.MAIN_VERTE)).thenReturn(0.5);

        service.plant(1L, new PlantCropRequest(5L, 3L));

        assertEquals(FieldStatus.GROWING, field.getStatus());
        assertSame(crop, field.getCrop());
        assertNotNull(field.getPlantedAt());
        assertNotNull(field.getReadyAt());
        assertEquals(5, Duration.between(field.getPlantedAt(), field.getReadyAt()).toMinutes());
    }

    @Test
    void plantRejectsOccupiedField() {
        PlayerProfile owner = player(1);
        Crop crop = Crop.builder().id(3L).growDurationMinutes(10).build();
        PlayerField field = PlayerField.builder()
                .id(5L).player(owner).status(FieldStatus.GROWING).build();
        when(cropRepository.findById(3L)).thenReturn(Optional.of(crop));
        when(fieldRepository.findById(5L)).thenReturn(Optional.of(field));

        assertThrows(IllegalStateException.class,
                () -> service.plant(1L, new PlantCropRequest(5L, 3L)));
        verifyNoInteractions(effectService);
    }

    @Test
    void operationsRejectForeignField() {
        PlayerField field = PlayerField.builder()
                .id(5L).player(player(2)).status(FieldStatus.EMPTY).build();
        when(fieldRepository.findById(5L)).thenReturn(Optional.of(field));

        assertThrows(AccessDeniedException.class,
                () -> service.updateFieldStatus(1L, 5L));
    }

    @Test
    void missingFieldIsRejected() {
        when(fieldRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class,
                () -> service.updateFieldStatus(1L, 99L));
    }

    @Test
    void harvestRequiresReadyField() {
        PlayerField field = PlayerField.builder()
                .id(5L).player(player(1)).status(FieldStatus.GROWING)
                .readyAt(LocalDateTime.now().plusMinutes(2)).build();
        when(fieldRepository.findById(5L)).thenReturn(Optional.of(field));

        assertThrows(IllegalStateException.class, () -> service.harvest(1L, 5L));
        verifyNoInteractions(inventoryService);
    }

    @Test
    void harvestAddsYieldAndResetsField() {
        PlayerProfile owner = player(1);
        Ingredient ingredient = ingredient(8, IngredientType.CEREAL);
        Crop crop = Crop.builder()
                .id(3L).ingredient(ingredient)
                .yieldQuantity(new BigDecimal("4.000")).build();
        PlayerField field = PlayerField.builder()
                .id(5L).player(owner).crop(crop)
                .status(FieldStatus.GROWING)
                .plantedAt(LocalDateTime.now().minusMinutes(5))
                .readyAt(LocalDateTime.now().minusSeconds(1))
                .build();
        when(fieldRepository.findById(5L)).thenReturn(Optional.of(field));

        service.harvest(1L, 5L);

        verify(inventoryService).addIngredient(argThat(request ->
                request.playerId().equals(1L)
                        && request.ingredientId().equals(8L)
                        && request.quantity().compareTo(new BigDecimal("4.000")) == 0));
        assertEquals(FieldStatus.EMPTY, field.getStatus());
        assertNull(field.getCrop());
        assertNull(field.getPlantedAt());
        assertNull(field.getReadyAt());
    }
}
