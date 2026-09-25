package be.mjodheim.brewstead.dto.tavern;

/**
 * Un habitué de la taverne, tel que le brasseur le voit aujourd'hui : ce
 * qu'il raconte, et ce qu'il aimerait boire.
 */
public record TavernRegularResponse(
        String key,
        String name,
        String role,
        String rumor,
        Request request
) {
    public record Request(
            String drinkType,
            String drinkLabel,
            int liters,
            int coins,
            int reputation,
            boolean done,
            boolean canDeliver
    ) {}
}
