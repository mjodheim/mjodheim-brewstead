package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.progression.*;
import be.mjodheim.brewstead.entity.*;
import be.mjodheim.brewstead.enums.ProgressAction;
import be.mjodheim.brewstead.repository.*;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;
import java.util.function.ToLongFunction;

@Service
@RequiredArgsConstructor
public class ProgressionService {

    private static final int XP_PER_LEVEL = 1_000;
    private static final int DAILY_TARGET = 3;
    private static final int DAILY_COINS = 75;
    private static final int DAILY_XP = 100;

    private final PlayerProgressRepository progressRepository;
    private final PlayerAchievementRepository achievementRepository;
    private final PlayerProfileRepository playerRepository;

    private record Achievement(String code, String title, String description,
                               ProgressAction action, long target, int coins, int xp,
                               ToLongFunction<PlayerProgress> counter) { }

    private static final List<Achievement> ACHIEVEMENTS = List.of(
            new Achievement("FIRST_HARVEST", "Première moisson", "Récolter une parcelle.", ProgressAction.HARVEST_FIELD, 1, 40, 50, PlayerProgress::getHarvestedFields),
            new Achievement("MASTER_FARMER", "Terres généreuses", "Récolter 25 parcelles.", ProgressAction.HARVEST_FIELD, 25, 250, 350, PlayerProgress::getHarvestedFields),
            new Achievement("HONEY_KEEPER", "Ami des abeilles", "Récolter 10 ruches.", ProgressAction.HARVEST_HIVE, 10, 150, 200, PlayerProgress::getHarvestedHives),
            new Achievement("FIRST_BREW", "Premier brassin", "Lancer son premier brassin.", ProgressAction.START_BATCH, 1, 60, 75, PlayerProgress::getStartedBatches),
            new Achievement("MASTER_BREWER", "Maître brasseur", "Lancer 25 brassins.", ProgressAction.START_BATCH, 25, 300, 500, PlayerProgress::getStartedBatches),
            new Achievement("TRUSTED_SUPPLIER", "Fournisseur du fjord", "Honorer 10 commandes.", ProgressAction.COMPLETE_ORDER, 10, 300, 400, PlayerProgress::getCompletedOrders),
            new Achievement("GOOD_NEIGHBOUR", "Bon voisin", "Servir 5 commandes de joueurs.", ProgressAction.PLAYER_TRADE, 5, 200, 250, PlayerProgress::getPlayerTrades),
            new Achievement("TAVERN_REGULAR", "Habitué de la taverne", "Goûter 10 productions voisines.", ProgressAction.TASTE_AT_TAVERN, 10, 150, 200, PlayerProgress::getTavernTastings)
    );

    @Transactional
    public ProgressionResponse visit(Long playerId) {
        PlayerProgress progress = getOrCreate(playerId);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (!today.equals(progress.getLastVisitDate())) {
            progress.setVisitStreak(today.minusDays(1).equals(progress.getLastVisitDate())
                    ? progress.getVisitStreak() + 1 : 1);
            progress.setLastVisitDate(today);
        }
        prepareDaily(progress, today);
        unlockEligible(progress);
        return toResponse(progress);
    }

    @Transactional
    public void record(Long playerId, ProgressAction action) {
        PlayerProgress progress = getOrCreate(playerId);
        increment(progress, action);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        prepareDaily(progress, today);
        if (progress.getDailyAction() == action && !progress.isDailyClaimed()) {
            progress.setDailyProgress(Math.min(DAILY_TARGET, progress.getDailyProgress() + 1));
            if (progress.getDailyProgress() >= DAILY_TARGET) {
                progress.setDailyClaimed(true);
                reward(progress.getPlayer(), DAILY_COINS, DAILY_XP);
            }
        }
        unlockEligible(progress);
    }

    private PlayerProgress getOrCreate(Long playerId) {
        return progressRepository.findByPlayerId(playerId).orElseGet(() -> {
            PlayerProfile player = playerRepository.findById(playerId)
                    .orElseThrow(() -> new IllegalArgumentException("Player not found"));
            return progressRepository.save(PlayerProgress.builder().player(player).build());
        });
    }

    private void prepareDaily(PlayerProgress progress, LocalDate today) {
        if (today.equals(progress.getDailyDate())) return;
        ProgressAction[] rotation = {
                ProgressAction.HARVEST_FIELD, ProgressAction.HARVEST_HIVE,
                ProgressAction.START_BATCH, ProgressAction.COMPLETE_ORDER,
                ProgressAction.PLAYER_TRADE, ProgressAction.TASTE_AT_TAVERN
        };
        progress.setDailyDate(today);
        progress.setDailyAction(rotation[Math.floorMod(today.getDayOfYear(), rotation.length)]);
        progress.setDailyProgress(0);
        progress.setDailyClaimed(false);
    }

    private void increment(PlayerProgress p, ProgressAction action) {
        switch (action) {
            case HARVEST_FIELD -> p.setHarvestedFields(p.getHarvestedFields() + 1);
            case HARVEST_HIVE -> p.setHarvestedHives(p.getHarvestedHives() + 1);
            case START_BATCH -> p.setStartedBatches(p.getStartedBatches() + 1);
            case COMPLETE_ORDER -> p.setCompletedOrders(p.getCompletedOrders() + 1);
            case PLAYER_TRADE -> p.setPlayerTrades(p.getPlayerTrades() + 1);
            case TASTE_AT_TAVERN -> p.setTavernTastings(p.getTavernTastings() + 1);
        }
    }

    private void unlockEligible(PlayerProgress progress) {
        for (Achievement achievement : ACHIEVEMENTS) {
            if (achievement.counter().applyAsLong(progress) < achievement.target()
                    || achievementRepository.existsByPlayerIdAndCode(progress.getPlayer().getId(), achievement.code())) continue;
            achievementRepository.save(PlayerAchievement.builder()
                    .player(progress.getPlayer()).code(achievement.code()).unlockedAt(LocalDateTime.now()).build());
            reward(progress.getPlayer(), achievement.coins(), achievement.xp());
        }
    }

    private void reward(PlayerProfile player, int coins, int xp) {
        player.setCoin(player.getCoin() + coins);
        player.setExperience(player.getExperience() + xp);
        player.setLevel(Math.max(player.getLevel(), 1 + player.getExperience() / XP_PER_LEVEL));
    }

    private ProgressionResponse toResponse(PlayerProgress progress) {
        Map<String, LocalDateTime> unlocked = new HashMap<>();
        achievementRepository.findAllByPlayerId(progress.getPlayer().getId())
                .forEach(value -> unlocked.put(value.getCode(), value.getUnlockedAt()));
        List<AchievementResponse> achievements = ACHIEVEMENTS.stream().map(a -> new AchievementResponse(
                a.code(), a.title(), a.description(), a.counter().applyAsLong(progress), a.target(),
                a.coins(), a.xp(), unlocked.containsKey(a.code()), unlocked.get(a.code()))).toList();
        return new ProgressionResponse(progress.getVisitStreak(), daily(progress), achievements);
    }

    private DailyQuestResponse daily(PlayerProgress progress) {
        ProgressAction action = progress.getDailyAction();
        return new DailyQuestResponse(action.name(), dailyTitle(action), dailyPlace(action),
                progress.getDailyProgress(), DAILY_TARGET, DAILY_COINS, DAILY_XP, progress.isDailyClaimed());
    }

    private String dailyTitle(ProgressAction action) {
        return switch (action) {
            case HARVEST_FIELD -> "Récolter 3 parcelles";
            case HARVEST_HIVE -> "Récolter 3 ruches";
            case START_BATCH -> "Lancer 3 brassins";
            case COMPLETE_ORDER -> "Honorer 3 commandes";
            case PLAYER_TRADE -> "Aider 3 domaines voisins";
            case TASTE_AT_TAVERN -> "Goûter 3 breuvages voisins";
        };
    }

    private String dailyPlace(ProgressAction action) {
        return switch (action) {
            case HARVEST_FIELD -> "champs";
            case HARVEST_HIVE -> "rucher";
            case START_BATCH -> "brasserie";
            case COMPLETE_ORDER, PLAYER_TRADE -> "commandes";
            case TASTE_AT_TAVERN -> "taverne";
        };
    }
}
