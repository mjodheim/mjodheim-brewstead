package be.mjodheim.brewstead.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TavernNavigationTest {

    @Test
    void arrivalsLandBetweenTheChairsNotOnThem() {
        List<TavernNavigation.Point> taken = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            TavernNavigation.Point spawn = TavernNavigation.spawn(taken);
            for (TavernNavigation.Seat seat : TavernNavigation.seats()) {
                assertTrue(Math.abs(seat.x() - spawn.x()) >= 30,
                        "L'arrivée " + spawn + " tombe sur la place " + seat);
            }
            taken.add(spawn);
        }
    }

    @Test
    void eachArrivalTakesAFreeSpotAlongTheBar() {
        List<TavernNavigation.Point> taken = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            TavernNavigation.Point spawn = TavernNavigation.spawn(taken);
            assertFalse(taken.contains(spawn), "Deux arrivants au même endroit : " + spawn);
            // Le point d'arrivée doit déjà être une destination valide, hors des tables.
            assertEquals(spawn, TavernNavigation.normalize(spawn.x(), spawn.y()));
            taken.add(spawn);
        }
    }

    @Test
    void aSpotFreedBySomeoneWhoLeftIsReused() {
        TavernNavigation.Point first = TavernNavigation.spawn(List.of());
        TavernNavigation.Point second = TavernNavigation.spawn(List.of(first));
        assertNotEquals(first, second);
        // Le premier est parti, le second est resté : la place de la porte se libère.
        assertEquals(first, TavernNavigation.spawn(List.of(second)));
    }

    @Test
    void someoneWhoWalkedAwayNoLongerBlocksTheDoor() {
        TavernNavigation.Point elsewhere = new TavernNavigation.Point(300, 520);
        assertEquals(TavernNavigation.spawn(), TavernNavigation.spawn(List.of(elsewhere)));
    }
}
