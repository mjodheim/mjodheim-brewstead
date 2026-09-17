package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.inventory.IngredientRequest;
import be.mjodheim.brewstead.dto.player.PlayerProfileResponse;
import be.mjodheim.brewstead.entity.*;
import be.mjodheim.brewstead.enums.FieldStatus;
import be.mjodheim.brewstead.enums.IngredientType;
import be.mjodheim.brewstead.enums.BehiveStatus;
import be.mjodheim.brewstead.exception.InsufficientCoinsException;
import be.mjodheim.brewstead.mapper.PlayerMapper;
import be.mjodheim.brewstead.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PlayerService {

    private final PlayerProfileRepository playerProfileRepository;
    private final UserRepository userRepository;
    private final PlayerFieldRepository playerFieldRepository;
    private final BeehiveRepository beehiveRepository;
    private final IngredientRepository ingredientRepository;
    private final InventoryService inventoryService;
    private final PlayerMapper playerMapper;

    @Transactional
    public PlayerProfileResponse getPlayer(Long playerId) {
        return playerMapper.toResponse(getPlayerEntity(playerId));
    }

    /**
     * Functional hook for the future registration/security flow.
     * Once a User has been created by the authentication layer, this method creates
     * the corresponding Brewstead and starter resources exactly once.
     */
    @Transactional
    public PlayerProfileResponse initializePlayer(Long userId) {
        return playerProfileRepository.findByUserId(userId)
                .map(playerMapper::toResponse)
                .orElseGet(() -> createStarterBrewstead(userId));
    }

    @Transactional
    public void spendCoins(Long playerId, int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Coin amount must be greater than zero");
        }

        PlayerProfile player = getPlayerEntity(playerId);
        if (player.getCoin() < amount) {
            throw new InsufficientCoinsException("Not enough coins");
        }
        player.setCoin(player.getCoin() - amount);
    }

    @Transactional
    public PlayerProfileResponse reward(Long playerId, int coins, int reputation, int experience) {
        if (coins < 0 || reputation < 0 || experience < 0) {
            throw new IllegalArgumentException("Rewards cannot be negative");
        }

        PlayerProfile player = getPlayerEntity(playerId);
        player.setCoin(player.getCoin() + coins);
        player.setReputation(player.getReputation() + reputation);
        player.setExperience(player.getExperience() + experience);
        player.setLevel(Math.max(player.getLevel(), 1 + player.getExperience() / 100));

        return playerMapper.toResponse(player);
    }

    @Transactional
    public PlayerProfile getPlayerEntity(Long playerId) {
        return playerProfileRepository.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));
    }

    private PlayerProfileResponse createStarterBrewstead(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        PlayerProfile player = playerProfileRepository.save(
                PlayerProfile.builder()
                        .user(user)
                        .build()
        );

        List<PlayerField> fields = List.of(
                newStarterField(player),
                newStarterField(player),
                newStarterField(player)
        );
        playerFieldRepository.saveAll(fields);

        beehiveRepository.saveAll(List.of(
                newStarterHive(player),
                newStarterHive(player)
        ));

        addStarterIngredient(player, IngredientType.WATER, new BigDecimal("20.000"));
        addStarterIngredient(player, IngredientType.HONEY, new BigDecimal("3.000"));
        addStarterIngredient(player, IngredientType.CEREAL, new BigDecimal("5.000"));

        return playerMapper.toResponse(player);
    }

    private PlayerField newStarterField(PlayerProfile player) {
        return PlayerField.builder()
                .player(player)
                .status(FieldStatus.EMPTY)
                .build();
    }

    private Beehive newStarterHive(PlayerProfile player) {
        return Beehive.builder()
                .player(player)
                .status(BehiveStatus.IDLE)
                .build();
    }

    private void addStarterIngredient(PlayerProfile player, IngredientType type, BigDecimal quantity) {
        Ingredient ingredient = ingredientRepository.findFirstByType(type)
                .orElseThrow(() -> new IllegalStateException("Starter ingredient not configured: " + type));

        inventoryService.addIngredient(
                new IngredientRequest(player.getId(), ingredient.getId(), quantity)
        );
    }
}
