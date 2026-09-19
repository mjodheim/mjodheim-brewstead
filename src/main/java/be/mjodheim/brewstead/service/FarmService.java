package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.farm.PlantCropRequest;
import be.mjodheim.brewstead.dto.farm.PlayerFieldResponse;
import be.mjodheim.brewstead.dto.inventory.IngredientRequest;
import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.enums.EffectKind;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.enums.ProgressAction;
import be.mjodheim.brewstead.mapper.FarmMapper;
import be.mjodheim.brewstead.repository.CropRepository;
import be.mjodheim.brewstead.repository.PlayerFieldRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class FarmService {

    private final PlayerFieldRepository playerFieldRepository;
    private final InventoryService inventoryService;
    private final CropRepository cropRepository;
    private final FarmMapper farmMapper;
    private final EffectService effectService;
    private final ProgressionService progressionService;

    @Transactional
    public List<PlayerFieldResponse> findAllFields(Long id) {
        List<PlayerField> fields = playerFieldRepository.findAllByPlayerId(id);
        fields.forEach(this::refreshFieldStatus);
        return farmMapper.toResponseList(fields);
    }

    @Transactional
    public PlayerFieldResponse plant(Long playerId, PlantCropRequest request) {
        Crop crop = cropRepository.findById(request.cropId())
                .orElseThrow(() -> new IllegalArgumentException("Culture introuvable."));

        PlayerField field = getOwnedField(playerId, request.fieldId());

        if (field.getStatus() != FieldStatus.EMPTY) {
            throw new IllegalStateException("Field is not empty");
        }

        LocalDateTime now = LocalDateTime.now();
        double factor = effectService.durationFactor(field.getPlayer().getId(), EffectKind.MAIN_VERTE);
        long minutes = Math.max(1, Math.round(crop.getGrowDurationMinutes() * factor));

        field.setCrop(crop);
        field.setPlantedAt(now);
        field.setReadyAt(now.plusMinutes(minutes));
        field.setStatus(FieldStatus.GROWING);

        return farmMapper.toResponse(field);
    }

    @Transactional
    public PlayerFieldResponse updateFieldStatus(Long playerId, Long fieldId) {
        PlayerField field = getOwnedField(playerId, fieldId);
        refreshFieldStatus(field);
        return farmMapper.toResponse(field);
    }

    @Transactional
    public PlayerFieldResponse harvest(Long playerId, Long fieldId) {
        PlayerField field = getOwnedField(playerId, fieldId);
        refreshFieldStatus(field);
        if (field.getStatus() != FieldStatus.READY) {
            throw new IllegalStateException("Field is not ready");
        }

        inventoryService.addIngredient(
                new IngredientRequest(
                        field.getPlayer().getId(),
                        field.getCrop().getIngredient().getId(),
                        field.getCrop().getYieldQuantity()
                )
        );

        field.setStatus(FieldStatus.EMPTY);
        field.setCrop(null);
        field.setPlantedAt(null);
        field.setReadyAt(null);

        progressionService.record(playerId, ProgressAction.HARVEST_FIELD);

        return farmMapper.toResponse(field);
    }

    private PlayerField getOwnedField(Long playerId, Long fieldId) {
        PlayerField field = playerFieldRepository.findById(fieldId)
                .orElseThrow(() -> new IllegalArgumentException("Parcelle introuvable."));
        if (!field.getPlayer().getId().equals(playerId)) {
            throw new AccessDeniedException("Cette parcelle n'est pas la tienne.");
        }
        return field;
    }

    private void refreshFieldStatus(PlayerField field) {
        if (FieldStatus.GROWING.equals(field.getStatus())
                && field.getReadyAt() != null
                && !LocalDateTime.now().isBefore(field.getReadyAt())) {
            field.setStatus(FieldStatus.READY);
        }
    }
}
