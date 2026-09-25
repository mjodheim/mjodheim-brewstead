package be.mjodheim.brewstead.service;

import java.util.Collection;
import java.util.Map;

/**
 * La géométrie de la salle, dans les pixels de la peinture de la taverne
 * (1672 × 708). Les coordonnées sont celles des pieds : le point où un
 * personnage touche le plancher, ou le bas du tabouret où il est assis.
 *
 * <p>La peinture est pleine : habitués, tables et bancs occupent l'avant de
 * la salle. On marche donc dans l'allée qui longe le comptoir, entre les
 * tabourets et les tables ; celui qui passe derrière une table est caché
 * par elle, la tête au-dessus, comme dans une vraie salle. Le client utilise
 * la même géométrie pour prédire le trajet, le serveur reste l'autorité.
 */
public final class TavernNavigation {

    private TavernNavigation() {}

    public record Point(double x, double y) {}
    public record Seat(double x, double y, String facing) {}

    /** L'allée du comptoir, en coordonnées de pieds. */
    private static final double MIN_X = 520;
    private static final double MAX_X = 1240;
    private static final double MIN_Y = 478;
    private static final double MAX_Y = 545;

    /** Les tabourets libres du comptoir, et quelques places debout. */
    private static final Map<String, Seat> SEATS = Map.of(
            "bar-gauche", new Seat(552, 502, "RIGHT"),
            "bar-droite", new Seat(642, 502, "RIGHT"),
            "table-gauche-a", new Seat(868, 500, "LEFT"),
            "table-gauche-b", new Seat(1060, 500, "LEFT"),
            "table-droite-a", new Seat(1188, 504, "LEFT"),
            "table-droite-b", new Seat(760, 538, "RIGHT"),
            "feu-gauche", new Seat(528, 530, "RIGHT"),
            "feu-droite", new Seat(1226, 540, "LEFT")
    );

    /**
     * Les points d'arrivée, le long de l'allée, depuis l'escalier de droite.
     * Ils tombent entre les chaises : posés dessus, l'arrivant masquait la
     * place où il aurait voulu s'asseoir.
     */
    private static final int SPAWN_SLOTS = 6;
    private static final double SPAWN_STEP = 110;
    private static final double SPAWN_FIRST_X = 1135;

    public static Point spawn() {
        return spawnSlot(0);
    }

    /**
     * Où se tient celui qui entre.
     *
     * <p>Tout le monde apparaissait au même point : deux joueurs entrés à la
     * suite se tenaient l'un dans l'autre, noms superposés. L'arrivant prend
     * la première place libre le long du comptoir ; si toutes sont prises,
     * il se glisse à côté de la plus ancienne.
     */
    public static Point spawn(Collection<Point> taken) {
        for (int slot = 0; slot < SPAWN_SLOTS; slot++) {
            Point candidate = spawnSlot(slot);
            boolean free = taken.stream().noneMatch(other ->
                    Math.abs(other.x() - candidate.x()) < SPAWN_STEP / 2
                            && Math.abs(other.y() - candidate.y()) < SPAWN_STEP / 2);
            if (free) return candidate;
        }
        return spawnSlot(taken.size());
    }

    private static Point spawnSlot(int slot) {
        return new Point(SPAWN_FIRST_X - Math.floorMod(slot, SPAWN_SLOTS) * SPAWN_STEP, 520);
    }

    static Collection<Seat> seats() {
        return SEATS.values();
    }

    public static Seat seat(String key) {
        return SEATS.get(key);
    }

    public static Point normalize(double requestedX, double requestedY) {
        if (!Double.isFinite(requestedX) || !Double.isFinite(requestedY)) {
            throw new IllegalArgumentException("Destination invalide.");
        }

        double x = clamp(requestedX, MIN_X, MAX_X);
        double y = clamp(requestedY, MIN_Y, MAX_Y);
        return new Point(round(x), round(y));
    }

    public static String facing(double fromX, double toX, String fallback) {
        if (Math.abs(toX - fromX) < 2) return fallback == null ? "LEFT" : fallback;
        return toX < fromX ? "LEFT" : "RIGHT";
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double round(double value) {
        return Math.rint(value * 10.0) / 10.0;
    }
}
