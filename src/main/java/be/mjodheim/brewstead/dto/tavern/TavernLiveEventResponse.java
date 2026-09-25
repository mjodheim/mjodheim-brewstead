package be.mjodheim.brewstead.dto.tavern;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Un petit événement visuel de la salle. {@code detail} porte ce que les
 * jeux de taverne ajoutent (tournée, dés, skål collectif) sans multiplier
 * les champs : chaque type sait ce qu'il y met, le client aussi.
 */
public record TavernLiveEventResponse(
        String type,
        Long roomId,
        TavernPresenceResponse player,
        TavernMessageResponse message,
        String drinkName,
        Map<String, Object> detail,
        LocalDateTime at
) {
    public static TavernLiveEventResponse connected(Long roomId) {
        return new TavernLiveEventResponse("CONNECTED", roomId, null, null, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse refresh(Long roomId) {
        return new TavernLiveEventResponse("REFRESH", roomId, null, null, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse player(String type, Long roomId, TavernPresenceResponse player) {
        return new TavernLiveEventResponse(type, roomId, player, null, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse message(Long roomId, TavernMessageResponse message) {
        return new TavernLiveEventResponse("MESSAGE", roomId, null, message, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse drink(Long roomId, TavernPresenceResponse player, String drinkName) {
        return new TavernLiveEventResponse("DRINK", roomId, player, null, drinkName, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse game(String type, Long roomId, Map<String, Object> detail) {
        return new TavernLiveEventResponse(type, roomId, null, null, null, detail, LocalDateTime.now());
    }
}
