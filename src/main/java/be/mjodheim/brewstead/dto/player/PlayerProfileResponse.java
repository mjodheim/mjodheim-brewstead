package be.mjodheim.brewstead.dto.player;

public record PlayerProfileResponse(
        Long id,
        String username,
        int level,
        int experience,
        int coins,
        int reputation
) {
}
