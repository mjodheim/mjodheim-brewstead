package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.tavern.TavernLiveEventResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Bus temps réel minuscule, adapté aux salles de six personnes. Il n'y a ni
 * broker ni protocole de jeu lourd : le navigateur garde une connexion SSE,
 * les actions REST restent l'autorité et seuls les petits événements visuels
 * traversent la connexion.
 */
@Service
public class TavernLiveService {

    private static final long CONNECTION_LIFETIME_MS = 55_000L;

    private final ConcurrentHashMap<Long, CopyOnWriteArrayList<SseEmitter>> rooms = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long roomId) {
        SseEmitter emitter = new SseEmitter(CONNECTION_LIFETIME_MS);
        CopyOnWriteArrayList<SseEmitter> listeners = rooms.computeIfAbsent(roomId, ignored -> new CopyOnWriteArrayList<>());
        listeners.add(emitter);

        Runnable cleanup = () -> remove(roomId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());

        try {
            emitter.send(SseEmitter.event().name("tavern").data(TavernLiveEventResponse.connected(roomId)));
        } catch (IOException | IllegalStateException failure) {
            cleanup.run();
            emitter.complete();
        }
        return emitter;
    }

    public void publish(Long roomId, TavernLiveEventResponse event) {
        if (roomId == null) return;
        List<SseEmitter> listeners = rooms.get(roomId);
        if (listeners == null || listeners.isEmpty()) return;

        for (SseEmitter emitter : listeners) {
            try {
                emitter.send(SseEmitter.event().name("tavern").data(event));
            } catch (IOException | IllegalStateException failure) {
                remove(roomId, emitter);
                try { emitter.complete(); } catch (IllegalStateException ignored) { }
            }
        }
    }

    public void refresh(Long roomId) {
        publish(roomId, TavernLiveEventResponse.refresh(roomId));
    }

    int listenerCount(Long roomId) {
        return rooms.getOrDefault(roomId, new CopyOnWriteArrayList<>()).size();
    }

    private void remove(Long roomId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> listeners = rooms.get(roomId);
        if (listeners == null) return;
        listeners.remove(emitter);
        if (listeners.isEmpty()) rooms.remove(roomId, listeners);
    }
}
