package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.enums.FieldStatus;
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

    public List<PlayerField> findAllFields(PlayerProfile playerProfile) {
        return playerFieldRepository.findAllByPlayer(playerProfile);
    }

    @Transactional
    public PlayerField plant(PlayerField field, Crop crop) {

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

        return playerFieldRepository.save(field);
    }

    @Transactional
    public PlayerField updateFieldStatus(PlayerField field) {

        // On vérifie le 'field status' pour savoir si la culture est prête
        if(
            FieldStatus.GROWING.equals(field.getStatus())
                &&
            LocalDateTime.now().isAfter(field.getReadyAt())
        ) {
            // Mise à jour de l'état de la parcelle
            field.setStatus(FieldStatus.READY);
        }

        return playerFieldRepository.save(field);
    }

    @Transactional
    public PlayerField harvest (PlayerField field) {

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

        return playerFieldRepository.save(field);
    }
}
