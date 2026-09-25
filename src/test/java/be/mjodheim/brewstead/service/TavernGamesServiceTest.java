package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.tavern.DiceChallengeRequest;
import be.mjodheim.brewstead.dto.tavern.TavernGameResponse;
import be.mjodheim.brewstead.dto.tavern.TavernLiveEventResponse;
import be.mjodheim.brewstead.dto.tavern.TavernRegularResponse;
import be.mjodheim.brewstead.entity.Batch;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.Recipe;
import be.mjodheim.brewstead.entity.TavernPresence;
import be.mjodheim.brewstead.entity.TavernRegularVisit;
import be.mjodheim.brewstead.entity.TavernRoom;
import be.mjodheim.brewstead.enums.BatchStatus;
import be.mjodheim.brewstead.enums.DrinkType;
import be.mjodheim.brewstead.enums.TavernRoomType;
import be.mjodheim.brewstead.exception.InsufficientStockException;
import be.mjodheim.brewstead.repository.BatchRepository;
import be.mjodheim.brewstead.repository.NpcOrderRepository;
import be.mjodheim.brewstead.repository.TavernPresenceRepository;
import be.mjodheim.brewstead.repository.TavernRegularVisitRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.random.RandomGenerator;

import static be.mjodheim.brewstead.TestData.batch;
import static be.mjodheim.brewstead.TestData.player;
import static be.mjodheim.brewstead.TestData.recipe;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TavernGamesServiceTest {

    @Mock TavernPresenceRepository presences;
    @Mock PlayerService players;
    @Mock TavernLiveService live;
    @Mock BatchRepository batches;
    @Mock BrewService brew;
    @Mock NpcOrderRepository orders;
    @Mock TavernRegularVisitRepository visits;

    TavernGamesService service;
    MutableClock clock;
    Dice dice;

    final TavernRoom room = TavernRoom.builder().id(4L).code("ABC123").name("Salle 4")
            .type(TavernRoomType.COMMON).capacity(6).createdAt(LocalDateTime.now()).build();
    PlayerProfile alice;
    PlayerProfile bob;

    @BeforeEach
    void setUp() {
        service = new TavernGamesService(presences, players, live, batches, brew, orders, visits);
        clock = new MutableClock(Instant.parse("2026-09-25T18:00:00Z"));
        dice = new Dice();
        service.useRandomAndClock(dice, clock);
        alice = player(1);
        alice.setDisplayName("Alice");
        bob = player(2);
        bob.setDisplayName("Bob");
        TavernPresence a = presence(alice);
        TavernPresence b = presence(bob);
        when(presences.findByPlayerId(1L)).thenReturn(Optional.of(a));
        when(presences.findByPlayerId(2L)).thenReturn(Optional.of(b));
        when(presences.findAllByRoomIdOrderByJoinedAtAsc(4L)).thenReturn(List.of(a, b));
        when(orders.findAllByPlayerIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        when(players.getPlayerEntity(1L)).thenReturn(alice);
    }

    /* ------------------------------------------------------------ Habitués */

    @Test
    void regularsAskForTwoToFourLitresAndKnowWhatTheCellarHolds() {
        Recipe mead = recipe(10);
        mead.setDrinkType(DrinkType.MEAD);
        when(batches.findAllByPlayerIdOrderByStartedAtDesc(1L)).thenReturn(List.of(ready(1, mead, "8")));
        when(visits.findAllByPlayerIdAndDay(eq(1L), any())).thenReturn(List.of());

        List<TavernRegularResponse> regulars = service.regulars(1L);

        assertEquals(6, regulars.size());
        for (TavernRegularResponse regular : regulars) {
            int liters = regular.request().liters();
            assertTrue(liters >= 2 && liters <= 4, regular.name() + " demande " + liters + " L");
            assertFalse(regular.rumor().isBlank());
            assertEquals(regular.request().drinkType().equals("MEAD"), regular.request().canDeliver(),
                    "Seul l'hydromel est en cave : " + regular.name());
        }
    }

    @Test
    void deliveringToARegularTakesFromTheCellarPaysAndOnlyOnceADay() {
        Recipe mead = recipe(10);
        mead.setDrinkType(DrinkType.MEAD);
        Batch cask = ready(1, mead, "8");
        when(batches.findAllByPlayerIdOrderByStartedAtDesc(1L)).thenReturn(List.of(cask));
        when(visits.findAllByPlayerIdAndDay(eq(1L), any())).thenReturn(List.of());
        int liters = TavernGamesService.liters(TavernGamesService.REGULARS.get(1), LocalDate.now(clock));

        service.deliver(1L, "bjarne");

        assertEquals(0, new BigDecimal(8 - liters).compareTo(cask.getVolume()), "Le fût a été entamé");
        verify(players).reward(1L, TavernGamesService.coins(liters), TavernGamesService.reputation(liters), liters * 5);
        verify(visits).save(any(TavernRegularVisit.class));

        when(visits.existsByPlayerIdAndRegularKeyAndDay(1L, "bjarne", LocalDate.now(clock))).thenReturn(true);
        assertThrows(IllegalStateException.class, () -> service.deliver(1L, "bjarne"));
    }

    @Test
    void aRegularWithoutHisDrinkInTheCellarLeavesTheCellarAlone() {
        Recipe beer = recipe(11);
        beer.setDrinkType(DrinkType.BEER);
        Batch cask = ready(1, beer, "20");
        when(batches.findAllByPlayerIdOrderByStartedAtDesc(1L)).thenReturn(List.of(cask));

        // Runa ne boit que du cidre.
        assertThrows(InsufficientStockException.class, () -> service.deliver(1L, "runa"));
        assertEquals(0, new BigDecimal("20").compareTo(cask.getVolume()));
        verify(players, never()).reward(anyLong(), anyInt(), anyInt(), anyInt());
    }

    /* ------------------------------------------------------------- Tournée */

    @Test
    void aRoundCostsPerHeadMakesEveryoneDrinkAndWaitsTenMinutes() {
        TavernGameResponse round = service.round(1L, 4L);

        int cost = TavernGamesService.ROUND_REGULARS_PRICE + 2 * TavernGamesService.ROUND_PRICE_PER_HEAD;
        verify(players).spendCoins(1L, cost);
        verify(players).reward(1L, 0, 4, 10);
        assertEquals(List.of(1L, 2L), round.detail().get("drinkers"));
        assertEquals("ROUND", published().getLast().type());

        clock.advance(Duration.ofMinutes(5));
        assertThrows(IllegalStateException.class, () -> service.round(1L, 4L));
        clock.advance(Duration.ofMinutes(6));
        assertDoesNotThrow(() -> service.round(1L, 4L));
    }

    /* ---------------------------------------------------------------- Dés */

    @Test
    void diceRejectOddStakesAndChallengingOneself() {
        assertThrows(IllegalArgumentException.class, () -> service.challenge(1L, 4L, new DiceChallengeRequest(2L, 7)));
        assertThrows(IllegalArgumentException.class, () -> service.challenge(1L, 4L, new DiceChallengeRequest(1L, 10)));
    }

    @Test
    void theHigherThrowTakesTheStake() {
        TavernGameResponse challenge = service.challenge(1L, 4L, new DiceChallengeRequest(2L, 10));
        String id = (String) challenge.detail().get("id");
        assertEquals("DICE_CHALLENGE", published().getLast().type());

        dice.next(6, 5, 2, 1); // Alice 11, Bob 3
        TavernGameResponse result = service.accept(2L, 4L, id);

        assertEquals(1L, result.detail().get("winnerId"));
        verify(players).spendCoins(2L, 10);
        verify(players).refundCoins(1L, 10);
        assertEquals("DICE_RESULT", published().getLast().type());
        assertTrue(service.pending(id).isEmpty(), "Un défi ne se joue qu'une fois");
    }

    @Test
    void aTieIsThrownAgainAndThreeTiesKeepTheStakes() {
        String id = (String) service.challenge(1L, 4L, new DiceChallengeRequest(2L, 5)).detail().get("id");
        dice.next(3, 3, 2, 4, 1, 1, 1, 1, 6, 6, 6, 6);

        TavernGameResponse result = service.accept(2L, 4L, id);

        assertNull(result.detail().get("winnerId"));
        assertEquals(3, result.detail().get("throws"));
        verify(players, never()).spendCoins(anyLong(), anyInt());
    }

    @Test
    void onlyTheChallengedPlayerAcceptsAndAChallengeExpires() {
        String id = (String) service.challenge(1L, 4L, new DiceChallengeRequest(2L, 5)).detail().get("id");
        assertThrows(AccessDeniedException.class, () -> service.accept(1L, 4L, id));

        clock.advance(Duration.ofSeconds(50));
        assertThrows(IllegalStateException.class, () -> service.accept(2L, 4L, id));
    }

    @Test
    void aDeclinedChallengeIsAnnouncedToTheRoom() {
        String id = (String) service.challenge(1L, 4L, new DiceChallengeRequest(2L, 5)).detail().get("id");
        service.decline(2L, 4L, id);
        assertEquals("DICE_DECLINED", published().getLast().type());
        assertTrue(service.pending(id).isEmpty());
    }

    /* -------------------------------------------------------- Skål collectif */

    @Test
    void twoSkalsWithinSixSecondsRewardEveryoneOnce() {
        service.onSkal(1L, 4L);
        verify(players, never()).reward(anyLong(), anyInt(), anyInt(), anyInt());

        clock.advance(Duration.ofSeconds(3));
        service.onSkal(2L, 4L);
        verify(players).reward(1L, 0, 1, 5);
        verify(players).reward(2L, 0, 1, 5);
        TavernLiveEventResponse event = published().getLast();
        assertEquals("SKAL_COLLECTIF", event.type());
        assertEquals(List.of("Alice", "Bob"), event.detail().get("names"));

        // Trinquer encore dans la foulée ne rapporte plus rien pendant dix minutes.
        clock.advance(Duration.ofSeconds(2));
        service.onSkal(1L, 4L);
        verify(players, times(1)).reward(1L, 0, 1, 5);
    }

    @Test
    void skalsTooFarApartAreNotTogether() {
        service.onSkal(1L, 4L);
        clock.advance(Duration.ofSeconds(8));
        service.onSkal(2L, 4L);
        verify(players, never()).reward(anyLong(), anyInt(), anyInt(), anyInt());
    }

    /* -------------------------------------------------------------- Outils */

    private List<TavernLiveEventResponse> published() {
        ArgumentCaptor<TavernLiveEventResponse> captor = ArgumentCaptor.forClass(TavernLiveEventResponse.class);
        verify(live, atLeastOnce()).publish(eq(4L), captor.capture());
        return captor.getAllValues();
    }

    private TavernPresence presence(PlayerProfile player) {
        return TavernPresence.builder().room(room).player(player)
                .joinedAt(LocalDateTime.now()).lastSeenAt(LocalDateTime.now()).build();
    }

    private Batch ready(long id, Recipe recipe, String liters) {
        Batch batch = batch(id, alice, recipe);
        batch.setStatus(BatchStatus.READY);
        batch.setVolume(new BigDecimal(liters));
        batch.setReadyAt(LocalDateTime.now().minusMinutes(5));
        return batch;
    }

    static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    /** Des dés pipés : les faces à sortir, dans l'ordre ; 1 ensuite. */
    static final class Dice implements RandomGenerator {
        private final Deque<Integer> faces = new ArrayDeque<>();
        void next(int... values) { for (int v : values) faces.add(v); }
        @Override public long nextLong() { return 0; }
        @Override public int nextInt(int bound) {
            if (bound == 6 && !faces.isEmpty()) return faces.poll() - 1;
            return 0;
        }
    }
}
