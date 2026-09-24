package be.mjodheim.brewstead.dto.tavern;

import java.time.LocalDateTime;

public record TavernLiveEventResponse(
        String type,
        Long roomId,
        TavernPresenceResponse player,
        TavernMessageResponse message,
        String drinkName,
        LocalDateTime at
) {
    public static TavernLiveEventResponse connected(Long roomId) {
        return new TavernLiveEventResponse("CONNECTED", roomId, null, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse refresh(Long roomId) {
        return new TavernLiveEventResponse("REFRESH", roomId, null, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse player(String type, Long roomId, TavernPresenceResponse player) {
        return new TavernLiveEventResponse(type, roomId, player, null, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse message(Long roomId, TavernMessageResponse message) {
        return new TavernLiveEventResponse("MESSAGE", roomId, null, message, null, LocalDateTime.now());
    }

    public static TavernLiveEventResponse drink(Long roomId, TavernPresenceResponse player, String drinkName) {
        return new TavernLiveEventResponse("DRINK", roomId, player, null, drinkName, LocalDateTime.now());
    }
}
