package be.mjodheim.brewstead.service;

import java.util.Collection;
import java.util.Map;

/**
 * Petit navmesh volontairement simple pour la taverne : on laisse le joueur
 * libre sur le plancher mais on repousse les destinations qui tomberaient
 * dans une table. Le client utilise la même géométrie pour prédire le trajet,
 * le serveur reste l'autorité.
 */
public final class TavernNavigation {

    private TavernNavigation() {}

    public record Point(double x, double y) {}
    public record Seat(double x, double y, String facing) {}

    private record Ellipse(double cx, double cy, double rx, double ry) {}

    private static final double MIN_X = 72;
    private static final double MAX_X = 888;
    private static final double MIN_Y = 382;
    private static final double MAX_Y = 520;

    private static final Ellipse[] TABLES = {
            new Ellipse(168, 472, 112, 43),
            new Ellipse(478, 486, 126, 48),
            new Ellipse(792, 468, 106, 41)
    };

    private static final Map<String, Seat> SEATS = Map.of(
            "bar-gauche", new Seat(332, 445, "RIGHT"),
            "bar-droite", new Seat(628, 445, "LEFT"),
            "table-gauche-a", new Seat(118, 486, "RIGHT"),
            "table-gauche-b", new Seat(254, 488, "LEFT"),
            "table-droite-a", new Seat(706, 480, "RIGHT"),
            "table-droite-b", new Seat(842, 482, "LEFT"),
            "feu-gauche", new Seat(389, 505, "RIGHT"),
            "feu-droite", new Seat(570, 507, "LEFT")
    );

    /** Les points d'arrivée, le long du comptoir, depuis la porte de droite. */
    private static final int SPAWN_SLOTS = 6;
    private static final double SPAWN_STEP = 64;

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
        return new Point(862 - Math.floorMod(slot, SPAWN_SLOTS) * SPAWN_STEP, 405);
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

        // Deux passages suffisent lorsque deux volumes se frôlent.
        for (int pass = 0; pass < 2; pass++) {
            for (Ellipse table : TABLES) {
                double nx = (x - table.cx()) / table.rx();
                double ny = (y - table.cy()) / table.ry();
                double d2 = nx * nx + ny * ny;
                if (d2 >= 1.0) continue;

                if (d2 < 0.0001) {
                    ny = y <= table.cy() ? -1.0 : 1.0;
                    nx = 0;
                    d2 = 1.0;
                }
                double length = Math.sqrt(d2);
                // Un petit coussin évite que le sprite touche le plateau.
                double factor = 1.08 / length;
                x = table.cx() + nx * factor * table.rx();
                y = table.cy() + ny * factor * table.ry();
                x = clamp(x, MIN_X, MAX_X);
                y = clamp(y, MIN_Y, MAX_Y);
            }
        }

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
