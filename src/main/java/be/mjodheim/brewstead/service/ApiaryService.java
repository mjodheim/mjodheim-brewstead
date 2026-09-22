package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.apiary.BeehiveResponse;
import be.mjodheim.brewstead.dto.inventory.IngredientRequest;
import be.mjodheim.brewstead.entity.Beehive;
import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.enums.BehiveStatus;
import be.mjodheim.brewstead.enums.EffectKind;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.enums.ProgressAction;
import be.mjodheim.brewstead.mapper.ApiaryMapper;
import be.mjodheim.brewstead.repository.BeehiveRepository;
import be.mjodheim.brewstead.repository.IngredientRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ApiaryService {

    private static final int BASE_PRODUCTION_MINUTES = 10;
    private static final BigDecimal BASE_HONEY_YIELD = new BigDecimal("1.000");

    private final BeehiveRepository beehiveRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryService inventoryService;
    private final ApiaryMapper apiaryMapper;
    private final EffectService effectService;
    private final ProgressionService progressionService;

    @Transactional
    public List<BeehiveResponse> findAllHives(Long playerId) {
        List<Beehive> hives = beehiveRepository.findAllByPlayerId(playerId);
        hives.forEach(this::refreshHiveStatus);
        return apiaryMapper.toResponseList(hives);
    }

    @Transactional
    public BeehiveResponse startProduction(Long playerId, Long hiveId) {
        Beehive hive = getOwnedHive(playerId, hiveId);
        refreshHiveStatus(hive);

        if (hive.getStatus() != BehiveStatus.IDLE) {
            throw new IllegalStateException("Beehive is not idle");
        }

        LocalDateTime now = LocalDateTime.now();
        double factor = effectService.durationFactor(hive.getPlayer().getId(), EffectKind.BOURDONNEMENT);
        long durationMinutes = Math.max(1,
                Math.round(Math.max(2, BASE_PRODUCTION_MINUTES - (hive.getLevel() - 1)) * factor));

        hive.setStartedAt(now);
        hive.setReadyAt(now.plusMinutes(durationMinutes));
        hive.setStatus(BehiveStatus.PRODUCING);

        return apiaryMapper.toResponse(hive);
    }

    @Transactional
    public BeehiveResponse updateHiveStatus(Long playerId, Long hiveId) {
        Beehive hive = getOwnedHive(playerId, hiveId);
        refreshHiveStatus(hive);
        return apiaryMapper.toResponse(hive);
    }

    @Transactional
    public BeehiveResponse harvest(Long playerId, Long hiveId) {
        Beehive hive = getOwnedHive(playerId, hiveId);
        refreshHiveStatus(hive);

        if (hive.getStatus() != BehiveStatus.READY) {
            throw new IllegalStateException("Beehive is not ready");
        }

        Ingredient honey = ingredientRepository.findFirstByType(IngredientType.HONEY)
                .orElseThrow(() -> new IllegalStateException("Honey ingredient is not configured"));

        BigDecimal quantity = progressionService.harvestYield(playerId,
                BASE_HONEY_YIELD.multiply(BigDecimal.valueOf(Math.max(1, hive.getLevel()))));
        inventoryService.addIngredient(
                new IngredientRequest(hive.getPlayer().getId(), honey.getId(), quantity)
        );

        hive.setStatus(BehiveStatus.IDLE);
        hive.setStartedAt(null);
        hive.setReadyAt(null);

        progressionService.record(playerId, ProgressAction.HARVEST_HIVE);

        return apiaryMapper.toResponse(hive);
    }

    /**
     * Vide toutes les ruches prêtes d'un seul geste.
     *
     * @return le nombre de ruches effectivement récoltées
     */
    @Transactional
    public int harvestAll(Long playerId) {
        List<Beehive> hives = beehiveRepository.findAllByPlayerId(playerId);
        hives.forEach(this::refreshHiveStatus);

        int harvested = 0;
        for (Beehive hive : hives) {
            if (hive.getStatus() == BehiveStatus.READY) {
                harvest(playerId, hive.getId());
                harvested++;
            }
        }
        return harvested;
    }

    private Beehive getOwnedHive(Long playerId, Long hiveId) {
        Beehive hive = beehiveRepository.findById(hiveId)
                .orElseThrow(() -> new IllegalArgumentException("Ruche introuvable."));
        if (!hive.getPlayer().getId().equals(playerId)) {
            throw new AccessDeniedException("Cette ruche n'est pas la tienne.");
        }
        return hive;
    }

    private void refreshHiveStatus(Beehive hive) {
        if (hive.getStatus() == BehiveStatus.PRODUCING
                && hive.getReadyAt() != null
                && !LocalDateTime.now().isBefore(hive.getReadyAt())) {
            hive.setStatus(BehiveStatus.READY);
        }
    }
}
