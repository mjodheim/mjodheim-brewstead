package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.farm.PlantCropRequest;
import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.mapper.FarmMapper;
import be.mjodheim.brewstead.repository.CropRepository;
import be.mjodheim.brewstead.repository.PlayerFieldRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;

import static be.mjodheim.brewstead.TestData.player;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GenesisV21FarmOwnershipTest {
    @Mock PlayerFieldRepository fields;
    @Mock InventoryService inventory;
    @Mock CropRepository crops;
    @Mock FarmMapper mapper;
    @Mock EffectService effects;
    @Mock ProgressionService progression;
    @Mock PlayerService players;

    @Test
    void plantingForeignFieldIsRejectedBeforeEffects() {
        FarmService service = new FarmService(fields, inventory, crops, mapper, effects, progression, players);
        Crop crop = Crop.builder().id(3L).growDurationMinutes(10).build();
        PlayerField foreign = PlayerField.builder()
                .id(5L).player(player(2)).status(FieldStatus.EMPTY).build();
        when(crops.findById(3L)).thenReturn(Optional.of(crop));
        when(fields.findById(5L)).thenReturn(Optional.of(foreign));

        assertThrows(AccessDeniedException.class,
                () -> service.plant(1L, new PlantCropRequest(5L, 3L)));
        verifyNoInteractions(effects);
    }
}
