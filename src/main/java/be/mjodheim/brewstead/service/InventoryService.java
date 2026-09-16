package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.entity.Ingredient;
import be.mjodheim.brewstead.entity.PlayerInventory;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.repository.PlayerInventoryRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InventoryService {

    private final PlayerInventoryRepository playerInventoryRepository;

    public List<PlayerInventoryRepository> getPlayerInventory(PlayerProfile player) {
        return playerInventoryRepository.findAllByPlayer(player);
    }

    @Transactional
    public PlayerInventory addIngredient(PlayerProfile player, Ingredient ingredient, BigDecimal quantity) {

        if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }

        PlayerInventory playerInventory = playerInventoryRepository
                .findByPlayerAndIngredient(player,ingredient)
                .orElseGet(
                        () -> PlayerInventory.builder()
                                .player(player)
                                .ingredient(ingredient)
                                .quantity(BigDecimal.ZERO)
                                .build());

        playerInventory.setQuantity(
                playerInventory.getQuantity().add(quantity)
        );

        return playerInventoryRepository.save(playerInventory);
    }

    @Transactional
    public PlayerInventory removeIngredient(PlayerProfile player, Ingredient ingredient, BigDecimal quantity) {

        if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }

        PlayerInventory playerInventory = playerInventoryRepository
                .findByPlayerAndIngredient(player, ingredient)
                .orElseThrow(
                        () -> new IllegalArgumentException("Ingredient not found")
                );

        if (playerInventory.getQuantity().subtract(quantity).compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Not enough ingredients");
        }

        playerInventory.setQuantity(
                playerInventory.getQuantity().subtract(quantity)
        );

        return playerInventoryRepository.save(playerInventory);
    }
}
