package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.farm.PlantCropRequest;
import be.mjodheim.brewstead.dto.farm.PlayerFieldResponse;
import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.repository.CropRepository;
import be.mjodheim.brewstead.repository.PlayerFieldRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class FarmService {

    private final PlayerFieldRepository playerFieldRepository;
    private final InventoryService inventoryService;
    private final CropRepository cropRepository;

    public List<PlayerField> findAllFields(PlayerProfile playerProfile) {
        return playerFieldRepository.findAllByPlayer(playerProfile);
    }

    // La méthode du service reçoit le DTO 'PlantCropRequest'
    // Travaille avec les entities depuis les repositories
    // Et retourne un autre DTO 'PlayerFieldResponse'
    @Transactional
    public PlayerFieldResponse plant(PlantCropRequest request) {

        Crop crop = cropRepository.findById(request.cropId())
                .orElseThrow(
                        () -> new IllegalArgumentException("Crop not found")
                );

        PlayerField field = playerFieldRepository.findById(request.fieldId())
                .orElseThrow(
                        () -> new IllegalArgumentException("Field not found")
                );

        if(field.getStatus() != FieldStatus.EMPTY) {
            throw  new IllegalStateException("Field is not empty");
        }

        LocalDateTime now = LocalDateTime.now();

        field.setCrop(crop);

        field.setPlantedAt(now);

        field.setReadyAt(
                // Chaque crop possède son propre temps de pousse
                now.plusMinutes(crop.getGrowDurationMinutes())
        );

        field.setStatus(
                // Silence, ça pousse !
                FieldStatus.GROWING
        );

        return toResponse(field);
    }

    @Transactional
    public PlayerFieldResponse updateFieldStatus(Long fieldId) {

        PlayerField field = playerFieldRepository.findById(fieldId)
                .orElseThrow(
                        () -> new IllegalArgumentException("Field not found")
                );

        refreshFieldStatus(field);

        return toResponse(field);
    }

    // C'est l'heure de la récolte !
    @Transactional
    public PlayerFieldResponse harvest (Long fieldId) {

        PlayerField field = playerFieldRepository.findById(fieldId)
                .orElseThrow(
                        () -> new IllegalArgumentException("Field not found")
                );

        // Avant de vérifier le status, on met à jour
        // Ben oui, peut-être qu'entretemps une culture a fini de pousser...
        refreshFieldStatus(field);

        // On vérifie si la parcelle est prête à être récoltée
        if(!field.getStatus().equals(FieldStatus.READY)) {
            throw  new IllegalStateException("Field is not ready");
        }

        // Ajouter la culture dans l'inventaire du joueur
        inventoryService.addIngredient(
                field.getPlayer(),
                field.getCrop().getIngredient(),
                field.getCrop().getYieldQuantity()
        );

        // Mise à jour de l'état de la parcelle
        field.setStatus(FieldStatus.EMPTY);

        // Remise à zéro de ses valeurs
        field.setCrop(null);
        field.setPlantedAt(null);
        field.setReadyAt(null);

        return toResponse(field);
    }

    // Méthode pour mettre à jour le statut d'une parcelle
    private void refreshFieldStatus (PlayerField field) {

        // On vérifie le 'field status' pour savoir si la culture est prête
        if(
            FieldStatus.GROWING.equals(field.getStatus())
                &&
            !LocalDateTime.now().isBefore(field.getReadyAt())
        ) {
            // Mise à jour de l'état de la parcelle
            field.setStatus(FieldStatus.READY);
        }
    }

    // Méthode privée pour mapper les entities en DTO de sortie
    private PlayerFieldResponse toResponse(PlayerField field) {
        return new PlayerFieldResponse(
                field.getId(),
                field.getCrop() == null ? null : field.getCrop().getName(),
                field.getPlantedAt(),
                field.getReadyAt(),
                field.getStatus()
        );
    }
}
