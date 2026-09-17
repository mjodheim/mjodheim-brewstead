package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.entity.Crop;
import be.mjodheim.brewstead.entity.PlayerField;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.repository.PlayerFieldRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class FarmService {

    private final PlayerFieldRepository playerFieldRepository;

    private final InventoryService inventoryService;

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
            LocalDateTime.now().isAfter(field.getPlantedAt())
        ) {
            // Mise à jour de l'état de la parcelle
            field.setStatus(FieldStatus.READY);
        }

        return playerFieldRepository.save(field);
    }
}
