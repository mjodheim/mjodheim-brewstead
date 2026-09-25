package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.tavern.DiceChallengeRequest;
import be.mjodheim.brewstead.dto.tavern.TavernGameResponse;
import be.mjodheim.brewstead.dto.tavern.TavernLiveEventResponse;
import be.mjodheim.brewstead.dto.tavern.TavernRegularResponse;
import be.mjodheim.brewstead.entity.Batch;
import be.mjodheim.brewstead.entity.NpcOrder;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.TavernPresence;
import be.mjodheim.brewstead.entity.TavernRegularVisit;
import be.mjodheim.brewstead.enums.BatchStatus;
import be.mjodheim.brewstead.enums.DrinkType;
import be.mjodheim.brewstead.enums.OrderStatus;
import be.mjodheim.brewstead.exception.InsufficientCoinsException;
import be.mjodheim.brewstead.exception.InsufficientStockException;
import be.mjodheim.brewstead.repository.BatchRepository;
import be.mjodheim.brewstead.repository.NpcOrderRepository;
import be.mjodheim.brewstead.repository.TavernPresenceRepository;
import be.mjodheim.brewstead.repository.TavernRegularVisitRepository;
import jakarta.transaction.Transactional;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.random.RandomGenerator;

/**
 * Ce qu'on fait à la taverne en plus de s'y asseoir : parler aux habitués,
 * payer une tournée, jouer aux dés, trinquer ensemble.
 *
 * <p>Les jeux de salle (tournée, dés, skål) vivent en mémoire : une salle
 * compte six personnes et un défi dure quarante-cinq secondes, un
 * redémarrage du serveur ne perd rien qui compte. Seules les livraisons aux
 * habitués, qui rapportent chaque jour, sont écrites en base.
 */
@Service
public class TavernGamesService {

    static final int ROUND_PRICE_PER_HEAD = 8;
    /** Les habitués boivent aussi : une tournée n'est jamais offerte à une salle vide. */
    static final int ROUND_REGULARS_PRICE = 12;
    static final Duration ROUND_COOLDOWN = Duration.ofMinutes(10);
    static final Set<Integer> STAKES = Set.of(5, 10, 25);
    static final Duration DICE_TTL = Duration.ofSeconds(45);
    static final Duration SKAL_WINDOW = Duration.ofSeconds(6);
    static final Duration SKAL_REWARD_COOLDOWN = Duration.ofMinutes(10);

    /** Les habitués peints dans la salle, dans l'ordre où on les voit de gauche à droite. */
    record Regular(String key, String name, String role, DrinkType drink, List<String> lines) {}

    static final List<Regular> REGULARS = List.of(
            new Regular("sigrid", "Sigrid", "rit plus fort que la cheminée", DrinkType.BEER, List.of(
                    "Une bière qui mousse, c'est une journée qui commence bien. Et une qui finit mieux !",
                    "Bjarne jure qu'il a vu un kraken. Moi je dis qu'il avait vu le fond de sa chope.")),
            new Regular("bjarne", "Bjarne", "ancien marin, barbe de tempête", DrinkType.MEAD, List.of(
                    "L'hydromel, petit, c'est du soleil mis en tonneau. Le miel de bruyère donne le meilleur.",
                    "Des ruches agrandies donnent plus de miel à chaque tournée. Un marin sait compter ses barils.")),
            new Regular("ylva", "Ylva", "sait tout avant tout le monde", DrinkType.CIDER, List.of(
                    "On dit que le laboratoire sait marier des ingrédients que personne n'a jamais osé mélanger.",
                    "Une recette à toi, c'est une recette que personne d'autre ne vend.")),
            new Regular("leif", "Leif", "bretteur au cœur tendre", DrinkType.BEER, List.of(
                    "Un brasseur qui livre à l'heure, on s'en souvient. Un brasseur qui livre tard, aussi.",
                    "La réputation, ça se gagne une chope à la fois. Et ça se perd d'un seul fût tourné.")),
            new Regular("torvald", "Torvald", "doyen du fjord", DrinkType.MEAD, List.of(
                    "De mon temps, on laissait fermenter plus longtemps. La patience fait la qualité.",
                    "Chaque saison du fjord a son brassin. Regarde la saison en cours, elle paie mieux.")),
            new Regular("runa", "Runa", "marchande de passage", DrinkType.CIDER, List.of(
                    "Au marché, les autres domaines réclament ce qu'ils ne savent pas brasser. Regarde leurs demandes.",
                    "Un cidre bien sec se vend mieux qu'on ne croit, surtout à l'automne."))
    );

    private static final Map<DrinkType, String> DRINK_LABELS = Map.of(
            DrinkType.BEER, "bière", DrinkType.MEAD, "hydromel", DrinkType.CIDER, "cidre", DrinkType.OTHER, "boisson");

    record Challenge(String id, Long roomId, Long fromId, String fromName, Long toId, String toName,
                     int stake, Instant expiresAt) {}

    private record Skal(Long playerId, Instant at) {}

    private final TavernPresenceRepository presences;
    private final PlayerService players;
    private final TavernLiveService live;
    private final BatchRepository batches;
    private final BrewService brew;
    private final NpcOrderRepository orders;
    private final TavernRegularVisitRepository visits;

    private final Map<Long, Instant> lastRounds = new ConcurrentHashMap<>();
    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();
    private final Map<Long, Deque<Skal>> skals = new ConcurrentHashMap<>();
    private final Map<Long, Instant> skalRewards = new ConcurrentHashMap<>();

    private RandomGenerator random = new SecureRandom();
    private Clock clock = Clock.systemDefaultZone();

    public TavernGamesService(TavernPresenceRepository presences, PlayerService players, TavernLiveService live,
                              BatchRepository batches, BrewService brew, NpcOrderRepository orders,
                              TavernRegularVisitRepository visits) {
        this.presences = presences;
        this.players = players;
        this.live = live;
        this.batches = batches;
        this.brew = brew;
        this.orders = orders;
        this.visits = visits;
    }

    /** Pour les tests : des dés et une horloge qu'on choisit. */
    void useRandomAndClock(RandomGenerator random, Clock clock) {
        this.random = random;
        this.clock = clock;
    }

    /* ------------------------------------------------------------ Habitués */

    @Transactional
    public List<TavernRegularResponse> regulars(Long playerId) {
        LocalDate today = LocalDate.now(clock);
        brew.refreshPlayerBatches(playerId);
        Set<String> served = new HashSet<>();
        visits.findAllByPlayerIdAndDay(playerId, today).forEach(v -> served.add(v.getRegularKey()));
        Map<DrinkType, BigDecimal> cellar = cellar(playerId);
        Optional<NpcOrder> bestOrder = orders.findAllByPlayerIdOrderByCreatedAtDesc(playerId).stream()
                .filter(o -> o.getStatus() == OrderStatus.OPEN)
                .max(Comparator.comparingInt(NpcOrder::getRewardCoins));
        boolean cellarEmpty = cellar.values().stream().allMatch(v -> v.signum() <= 0);

        List<TavernRegularResponse> result = new ArrayList<>();
        for (Regular regular : REGULARS) {
            int liters = liters(regular, today);
            BigDecimal have = cellar.getOrDefault(regular.drink(), BigDecimal.ZERO);
            result.add(new TavernRegularResponse(
                    regular.key(), regular.name(), regular.role(),
                    rumor(regular, today, bestOrder, cellarEmpty),
                    new TavernRegularResponse.Request(
                            regular.drink().name(), DRINK_LABELS.get(regular.drink()), liters,
                            coins(liters), reputation(liters),
                            served.contains(regular.key()),
                            have.compareTo(BigDecimal.valueOf(liters)) >= 0)));
        }
        return result;
    }

    @Transactional
    public List<TavernRegularResponse> deliver(Long playerId, String key) {
        Regular regular = REGULARS.stream().filter(r -> r.key().equals(key)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Cet habitué n'est pas de la maison."));
        LocalDate today = LocalDate.now(clock);
        if (visits.existsByPlayerIdAndRegularKeyAndDay(playerId, key, today)) {
            throw new IllegalStateException(regular.name() + " a déjà eu sa chope aujourd'hui.");
        }

        int liters = liters(regular, today);
        brew.refreshPlayerBatches(playerId);
        List<Batch> ready = batches.findAllByPlayerIdOrderByStartedAtDesc(playerId).stream()
                .filter(b -> b.getStatus() == BatchStatus.READY && b.getRecipe().getDrinkType() == regular.drink())
                .sorted(Comparator.comparing(Batch::getReadyAt))
                .toList();
        BigDecimal needed = BigDecimal.valueOf(liters);
        BigDecimal available = ready.stream().map(Batch::getVolume).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (available.compareTo(needed) < 0) {
            throw new InsufficientStockException("Il te faut " + liters + " L de " + DRINK_LABELS.get(regular.drink())
                    + " prêts en cave pour " + regular.name() + ".");
        }
        BigDecimal remaining = needed;
        for (Batch batch : ready) {
            if (remaining.signum() <= 0) break;
            BigDecimal taken = batch.getVolume().min(remaining);
            batch.setVolume(batch.getVolume().subtract(taken));
            remaining = remaining.subtract(taken);
            if (batch.getVolume().signum() == 0) batch.setStatus(BatchStatus.SOLD_OUT);
        }

        players.reward(playerId, coins(liters), reputation(liters), liters * 5);
        visits.save(TavernRegularVisit.builder()
                .player(players.getPlayerEntity(playerId)).regularKey(key).day(today).build());
        return regulars(playerId);
    }

    static int liters(Regular regular, LocalDate day) {
        return 2 + Math.floorMod(Objects.hash(regular.key(), day.toEpochDay()), 3);
    }

    static int coins(int liters) {
        return liters * 14 + 6;
    }

    static int reputation(int liters) {
        return liters + 1;
    }

    private String rumor(Regular regular, LocalDate day, Optional<NpcOrder> bestOrder, boolean cellarEmpty) {
        // Ylva sait ce qui se passe au tableau des commandes ; Bjarne s'inquiète
        // d'une cave vide. Les autres racontent ce qu'ils savent du métier.
        if (regular.key().equals("ylva") && bestOrder.isPresent()) {
            NpcOrder order = bestOrder.get();
            return order.getCustomerName() + " paie " + order.getRewardCoins()
                    + " pièces au tableau des commandes. Si j'étais toi, je ne traînerais pas.";
        }
        if (regular.key().equals("bjarne") && cellarEmpty) {
            return "Ta cave sonne creux, brasseur. Lance un brassin : une chope à la main se vend mieux qu'une promesse.";
        }
        List<String> lines = regular.lines();
        return lines.get(Math.floorMod(Objects.hash(regular.key(), day.toEpochDay(), 7), lines.size()));
    }

    private Map<DrinkType, BigDecimal> cellar(Long playerId) {
        Map<DrinkType, BigDecimal> cellar = new EnumMap<>(DrinkType.class);
        for (Batch batch : batches.findAllByPlayerIdOrderByStartedAtDesc(playerId)) {
            if (batch.getStatus() != BatchStatus.READY) continue;
            cellar.merge(batch.getRecipe().getDrinkType(), batch.getVolume(), BigDecimal::add);
        }
        return cellar;
    }

    /* ------------------------------------------------------------- Tournée */

    @Transactional
    public TavernGameResponse round(Long playerId, Long roomId) {
        TavernPresence mine = requirePresence(playerId, roomId);
        Instant now = clock.instant();
        Instant last = lastRounds.get(playerId);
        if (last != null && now.isBefore(last.plus(ROUND_COOLDOWN))) {
            long minutes = Math.max(1, Duration.between(now, last.plus(ROUND_COOLDOWN)).toMinutes() + 1);
            throw new IllegalStateException("Le tavernier attend que ta dernière tournée soit bue (encore "
                    + minutes + " min).");
        }

        List<TavernPresence> present = presences.findAllByRoomIdOrderByJoinedAtAsc(roomId);
        int others = (int) present.stream().filter(p -> !p.getPlayer().getId().equals(playerId)).count();
        int cost = ROUND_REGULARS_PRICE + ROUND_PRICE_PER_HEAD * (others + 1);
        int reputation = 2 + 2 * others;
        players.spendCoins(playerId, cost);
        players.reward(playerId, 0, reputation, 10);
        lastRounds.put(playerId, now);

        LocalDateTime at = LocalDateTime.now(clock);
        List<Long> drinkers = new ArrayList<>();
        for (TavernPresence presence : present) {
            presence.setAction("DRINKING");
            presence.setActionAt(at);
            drinkers.add(presence.getPlayer().getId());
        }
        presences.saveAll(present);

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("buyerId", playerId);
        detail.put("buyerName", mine.getPlayer().getDisplayName());
        detail.put("cost", cost);
        detail.put("reputation", reputation);
        detail.put("drinkers", drinkers);
        live.publish(roomId, TavernLiveEventResponse.game("ROUND", roomId, detail));
        return new TavernGameResponse("Tournée générale ! " + cost + " pièces, +" + reputation + " réputation.", detail);
    }

    /* ---------------------------------------------------------------- Dés */

    @Transactional
    public TavernGameResponse challenge(Long playerId, Long roomId, DiceChallengeRequest request) {
        int stake = request == null || request.stake() == null ? 0 : request.stake();
        if (!STAKES.contains(stake)) throw new IllegalArgumentException("Mise possible : 5, 10 ou 25 pièces.");
        Long targetId = request.targetId();
        if (targetId == null || targetId.equals(playerId)) {
            throw new IllegalArgumentException("Choisis quelqu'un d'autre que toi.");
        }
        TavernPresence mine = requirePresence(playerId, roomId);
        TavernPresence theirs = presences.findByPlayerId(targetId)
                .filter(p -> p.getRoom().getId().equals(roomId))
                .orElseThrow(() -> new IllegalStateException("Ce joueur n'est plus dans la salle."));
        PlayerProfile me = mine.getPlayer();
        PlayerProfile them = theirs.getPlayer();
        if (me.getCoin() < stake) throw new InsufficientCoinsException("Ta bourse ne suit pas.");
        if (them.getCoin() < stake) {
            throw new IllegalStateException(them.getDisplayName() + " n'a pas de quoi suivre cette mise.");
        }

        purgeChallenges();
        // Un défi à la fois par joueur : le nouveau remplace l'ancien.
        challenges.values().removeIf(c -> c.fromId().equals(playerId));
        Challenge challenge = new Challenge(shortId(), roomId, playerId, me.getDisplayName(),
                targetId, them.getDisplayName(), stake, clock.instant().plus(DICE_TTL));
        challenges.put(challenge.id(), challenge);

        Map<String, Object> detail = challengeDetail(challenge);
        detail.put("expiresAt", challenge.expiresAt().toString());
        live.publish(roomId, TavernLiveEventResponse.game("DICE_CHALLENGE", roomId, detail));
        return new TavernGameResponse("Défi lancé à " + them.getDisplayName() + ".", detail);
    }

    @Transactional
    public TavernGameResponse accept(Long playerId, Long roomId, String challengeId) {
        purgeChallenges();
        Challenge challenge = challenges.get(challengeId);
        if (challenge == null || !challenge.roomId().equals(roomId)) {
            throw new IllegalStateException("Ce défi a expiré.");
        }
        if (!challenge.toId().equals(playerId)) throw new AccessDeniedException("Ce défi ne t'est pas adressé.");
        challenges.remove(challengeId);
        requirePresence(challenge.fromId(), roomId);
        requirePresence(playerId, roomId);

        int[] from = roll();
        int[] to = roll();
        int throwsCount = 1;
        // Une égalité se rejoue, deux fois au plus : trois égalités, c'est un signe.
        while (sum(from) == sum(to) && throwsCount < 3) {
            from = roll();
            to = roll();
            throwsCount++;
        }

        Long winnerId = null;
        if (sum(from) != sum(to)) {
            winnerId = sum(from) > sum(to) ? challenge.fromId() : challenge.toId();
            Long loserId = winnerId.equals(challenge.fromId()) ? challenge.toId() : challenge.fromId();
            players.spendCoins(loserId, challenge.stake());
            players.refundCoins(winnerId, challenge.stake());
        }

        Map<String, Object> detail = challengeDetail(challenge);
        detail.put("fromDice", List.of(from[0], from[1]));
        detail.put("toDice", List.of(to[0], to[1]));
        detail.put("throws", throwsCount);
        detail.put("winnerId", winnerId);
        live.publish(roomId, TavernLiveEventResponse.game("DICE_RESULT", roomId, detail));
        String message = winnerId == null ? "Égalité : chacun garde sa mise."
                : (winnerId.equals(playerId) ? "Tu gagnes " : "Tu perds ") + challenge.stake() + " pièces.";
        return new TavernGameResponse(message, detail);
    }

    @Transactional
    public TavernGameResponse decline(Long playerId, Long roomId, String challengeId) {
        Challenge challenge = challenges.get(challengeId);
        if (challenge == null) return new TavernGameResponse("Ce défi n'existe plus.", Map.of());
        if (!challenge.toId().equals(playerId) && !challenge.fromId().equals(playerId)) {
            throw new AccessDeniedException("Ce défi ne te concerne pas.");
        }
        challenges.remove(challengeId);
        Map<String, Object> detail = challengeDetail(challenge);
        detail.put("byId", playerId);
        live.publish(roomId, TavernLiveEventResponse.game("DICE_DECLINED", roomId, detail));
        return new TavernGameResponse("Défi refusé.", detail);
    }

    Optional<Challenge> pending(String id) {
        return Optional.ofNullable(challenges.get(id));
    }

    private Map<String, Object> challengeDetail(Challenge c) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("id", c.id());
        detail.put("fromId", c.fromId());
        detail.put("fromName", c.fromName());
        detail.put("toId", c.toId());
        detail.put("toName", c.toName());
        detail.put("stake", c.stake());
        return detail;
    }

    private int[] roll() {
        return new int[]{1 + random.nextInt(6), 1 + random.nextInt(6)};
    }

    private static int sum(int[] dice) {
        return dice[0] + dice[1];
    }

    private void purgeChallenges() {
        Instant now = clock.instant();
        challenges.values().removeIf(c -> c.expiresAt().isBefore(now));
    }

    private String shortId() {
        String alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder id = new StringBuilder();
        for (int i = 0; i < 8; i++) id.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return id.toString();
    }

    /* -------------------------------------------------------- Skål collectif */

    /**
     * Un skål qui répond à un autre dans les six secondes, c'est une salle qui
     * trinque : chacun gagne un point de réputation, une fois toutes les dix
     * minutes, pour qu'on revienne à plusieurs sans pouvoir le mécaniser.
     */
    @Transactional
    public void onSkal(Long playerId, Long roomId) {
        Instant now = clock.instant();
        Deque<Skal> window = skals.computeIfAbsent(roomId, ignored -> new ArrayDeque<>());
        Set<Long> together;
        synchronized (window) {
            while (!window.isEmpty() && window.peekFirst().at().isBefore(now.minus(SKAL_WINDOW))) {
                window.pollFirst();
            }
            window.addLast(new Skal(playerId, now));
            together = new LinkedHashSet<>();
            window.forEach(s -> together.add(s.playerId()));
        }
        if (together.size() < 2) return;

        List<Long> rewarded = new ArrayList<>();
        for (Long id : together) {
            Instant last = skalRewards.get(id);
            if (last != null && now.isBefore(last.plus(SKAL_REWARD_COOLDOWN))) continue;
            players.reward(id, 0, 1, 5);
            skalRewards.put(id, now);
            rewarded.add(id);
        }

        List<String> names = new ArrayList<>();
        for (Long id : together) {
            presences.findByPlayerId(id).ifPresent(p -> names.add(p.getPlayer().getDisplayName()));
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("players", new ArrayList<>(together));
        detail.put("names", names);
        detail.put("rewarded", rewarded);
        live.publish(roomId, TavernLiveEventResponse.game("SKAL_COLLECTIF", roomId, detail));
    }

    /* -------------------------------------------------------------- Commun */

    private TavernPresence requirePresence(Long playerId, Long roomId) {
        TavernPresence presence = presences.findByPlayerId(playerId)
                .orElseThrow(() -> new IllegalStateException("Tu n'es pas dans la taverne."));
        if (!presence.getRoom().getId().equals(roomId)) {
            throw new IllegalStateException("Tu n'es pas dans cette salle.");
        }
        return presence;
    }
}
