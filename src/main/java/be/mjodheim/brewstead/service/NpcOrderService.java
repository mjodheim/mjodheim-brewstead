package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.order.NpcOrderResponse;
import be.mjodheim.brewstead.entity.NpcOrder;
import be.mjodheim.brewstead.entity.NpcOrderLine;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.enums.OrderStatus;
import be.mjodheim.brewstead.enums.ProgressAction;
import be.mjodheim.brewstead.mapper.NpcOrderMapper;
import be.mjodheim.brewstead.repository.NpcOrderLineRepository;
import be.mjodheim.brewstead.repository.NpcOrderRepository;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.RecipeRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NpcOrderService {

    private static final List<String> CUSTOMERS = List.of(
            "La troupe de Ragnar",
            "Les pêcheurs du fjord",
            "La garde de Skjold",
            "Les voyageurs de Brume",
            "Le banquet du Jarl"
    );

    private final NpcOrderRepository npcOrderRepository;
    private final NpcOrderLineRepository npcOrderLineRepository;
    private final RecipeRepository recipeRepository;
    private final PlayerProfileRepository playerProfileRepository;
    private final BrewService brewService;
    private final PlayerService playerService;
    private final NpcOrderMapper npcOrderMapper;
    private final ProgressionService progressionService;

    @Transactional
    public List<NpcOrderResponse> findAllOrders(Long playerId) {
        getPlayer(playerId);
        return npcOrderRepository.findAllByPlayerIdOrderByCreatedAtDesc(playerId).stream()
                .peek(this::refreshOrderStatus)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public NpcOrderResponse generateOrder(Long playerId) {
        PlayerProfile player = getPlayer(playerId);
        long active = npcOrderRepository.findAllByPlayerIdOrderByCreatedAtDesc(playerId).stream()
                .peek(this::refreshOrderStatus)
                .filter(order -> order.getStatus() == OrderStatus.OPEN || order.getStatus() == OrderStatus.IN_PROGRESS)
                .count();
        if (active >= 3) throw new IllegalStateException("Termine tes contrats actifs avant d’inviter un autre marchand.");
        List<Recipe> recipes = recipeRepository.findAllByIsPublicTrue().stream()
                .sorted(Comparator.comparingLong(Recipe::getId))
                .toList();
        if (recipes.isEmpty()) {
            throw new IllegalStateException("No public recipe is available for NPC orders");
        }

        // Les premiers contrats suivent ce que le joueur a réellement brassé.
        Set<Long> brewed = brewService.findPlayerBatches(playerId).stream()
                .map(batch -> batch.recipeId()).collect(Collectors.toSet());
        List<Recipe> familiar = recipes.stream().filter(recipe -> brewed.contains(recipe.getId())).toList();
        if (!familiar.isEmpty()) recipes = familiar;
        long sequence = npcOrderRepository.count();
        Recipe recipe = recipes.get((int) (sequence % recipes.size()));
        int quantity = 2 + (int) (sequence % 4);
        int minQuality = 50 + (int) (sequence % 4) * 5;
        int rewardCoins = quantity * 40 + minQuality;
        int rewardReputation = 2 + quantity;
        LocalDateTime now = LocalDateTime.now();

        NpcOrder order = npcOrderRepository.save(
                NpcOrder.builder()
                        .player(player)
                        .customerName(CUSTOMERS.get((int) (sequence % CUSTOMERS.size())))
                        .createdAt(now)
                        .expiresAt(now.plusMinutes(90))
                        .status(OrderStatus.OPEN)
                        .rewardCoins(rewardCoins)
                        .rewardReputation(rewardReputation)
                        .build()
        );

        NpcOrderLine line = npcOrderLineRepository.save(
                NpcOrderLine.builder()
                        .order(order)
                        .recipe(recipe)
                        .quantity(quantity)
                        .minQuality(minQuality)
                        .build()
        );

        return npcOrderMapper.toResponse(order, List.of(line));
    }

    @Transactional
    public NpcOrderResponse acceptOrder(Long playerId, Long orderId) {
        NpcOrder order = getOwnedOrder(playerId, orderId);
        refreshOrderStatus(order);

        if (order.getStatus() != OrderStatus.OPEN) {
            throw new IllegalStateException("Order is not open");
        }
        order.setStatus(OrderStatus.IN_PROGRESS);
        return toResponse(order);
    }

    @Transactional
    public NpcOrderResponse completeOrder(Long playerId, Long orderId) {
        NpcOrder order = getOwnedOrder(playerId, orderId);
        refreshOrderStatus(order);

        if (order.getStatus() != OrderStatus.OPEN && order.getStatus() != OrderStatus.IN_PROGRESS) {
            throw new IllegalStateException("Order cannot be completed");
        }

        List<NpcOrderLine> lines = npcOrderLineRepository.findAllByOrderId(orderId);
        if (lines.isEmpty()) {
            throw new IllegalStateException("Order has no lines");
        }

        for (NpcOrderLine line : lines) {
            brewService.consumeReadyProduct(
                    order.getPlayer().getId(),
                    line.getRecipe().getId(),
                    BigDecimal.valueOf(line.getQuantity()),
                    line.getMinQuality()
            );
        }

        playerService.reward(
                order.getPlayer().getId(),
                progressionService.npcCoinReward(playerId, order.getRewardCoins()),
                order.getRewardReputation(),
                order.getRewardReputation() * 5
        );
        order.setStatus(OrderStatus.COMPLETED);
        progressionService.record(playerId, ProgressAction.COMPLETE_ORDER);

        return npcOrderMapper.toResponse(order, lines);
    }

    private NpcOrderResponse toResponse(NpcOrder order) {
        return npcOrderMapper.toResponse(
                order,
                npcOrderLineRepository.findAllByOrderId(order.getId())
        );
    }

    private NpcOrder getOwnedOrder(Long playerId, Long orderId) {
        NpcOrder order = getOrder(orderId);
        if (!order.getPlayer().getId().equals(playerId)) {
            throw new AccessDeniedException("Cette commande ne t'est pas adressée.");
        }
        return order;
    }

    private NpcOrder getOrder(Long orderId) {
        return npcOrderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("NPC order not found"));
    }

    private PlayerProfile getPlayer(Long playerId) {
        return playerProfileRepository.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));
    }

    private void refreshOrderStatus(NpcOrder order) {
        if ((order.getStatus() == OrderStatus.OPEN || order.getStatus() == OrderStatus.IN_PROGRESS)
                && !LocalDateTime.now().isBefore(order.getExpiresAt())) {
            order.setStatus(OrderStatus.EXPIRED);
        }
    }
}
