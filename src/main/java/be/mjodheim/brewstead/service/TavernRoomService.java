package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.tavern.*;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.TavernPresence;
import be.mjodheim.brewstead.entity.TavernRoom;
import be.mjodheim.brewstead.enums.TavernRoomType;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.TavernPresenceRepository;
import be.mjodheim.brewstead.repository.TavernRoomRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class TavernRoomService {

    public static final int CAPACITY = 6;
    private static final int PRESENCE_SECONDS = 75;
    private static final List<String> SEATS = List.of(
            "bar-gauche", "bar-droite",
            "table-gauche-a", "table-gauche-b",
            "table-droite-a", "table-droite-b",
            "feu-gauche", "feu-droite"
    );
    private static final Set<String> EMOTES = Set.of("SKAL", "SALUT", "RIRE", "COEUR", "MUSIQUE");
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TavernRoomRepository roomRepository;
    private final TavernPresenceRepository presenceRepository;
    private final PlayerProfileRepository playerRepository;
    private final TavernChatService chatService;
    private final TastingCounterService counterService;
    private final TavernLiveService liveService;

    @Transactional
    public TavernLobbyResponse lobby(Long playerId) {
        cleanup();
        Long current = presenceRepository.findByPlayerId(playerId)
                .map(p -> p.getRoom().getId()).orElse(null);
        List<TavernRoomSummaryResponse> rooms = roomRepository
                .findAllByTypeOrderByCreatedAtAsc(TavernRoomType.COMMON).stream()
                .map(room -> summary(room, current))
                .filter(room -> room.occupancy() > 0 || Objects.equals(room.id(), current))
                .toList();
        return new TavernLobbyResponse(rooms, current);
    }

    @Transactional
    public TavernRoomSnapshot joinAuto(Long playerId) {
        cleanup();
        Optional<TavernPresence> current = presenceRepository.findByPlayerId(playerId);
        if (current.isPresent()) return snapshot(playerId, current.get().getRoom().getId());

        TavernRoom selected = roomRepository.findAllByTypeOrderByCreatedAtAsc(TavernRoomType.COMMON)
                .stream()
                .filter(room -> presenceRepository.countByRoomId(room.getId()) < room.getCapacity())
                .max(Comparator.comparingLong(room -> presenceRepository.countByRoomId(room.getId())))
                .orElseGet(this::createCommonRoom);
        return joinLocked(playerId, selected.getId(), false);
    }

    @Transactional
    public TavernRoomSnapshot join(Long playerId, Long roomId) {
        cleanup();
        TavernRoom room = roomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Salle introuvable."));
        if (room.getType() == TavernRoomType.PRIVATE) {
            throw new IllegalStateException("Ce salon se rejoint avec son code.");
        }
        return joinLocked(playerId, roomId, false);
    }

    @Transactional
    public TavernRoomSnapshot createPrivate(Long playerId, CreateTavernRoomRequest request) {
        cleanup();
        leave(playerId);
        PlayerProfile owner = player(playerId);
        String wanted = request == null ? null : request.name();
        String name = wanted == null || wanted.isBlank() ? "Table de " + owner.getDisplayName() : wanted.trim();
        TavernRoom room = roomRepository.save(TavernRoom.builder()
                .code(uniqueCode()).name(name).type(TavernRoomType.PRIVATE)
                .capacity(CAPACITY).owner(owner).createdAt(LocalDateTime.now()).build());
        presenceRepository.save(presence(room, owner));
        liveService.refresh(room.getId());
        return snapshot(playerId, room.getId());
    }

    @Transactional
    public TavernRoomSnapshot joinByCode(Long playerId, String code) {
        cleanup();
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Entre le code du salon.");
        TavernRoom room = roomRepository.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> new IllegalArgumentException("Aucun salon avec ce code."));
        return joinLocked(playerId, room.getId(), true);
    }

    @Transactional
    public TavernRoomSnapshot takeSeat(Long playerId, Long roomId, String seatKey) {
        cleanup();
        if (!SEATS.contains(seatKey)) throw new IllegalArgumentException("Cette place n'existe pas.");
        TavernRoom room = roomRepository.findForUpdateById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Salle introuvable."));
        TavernPresence mine = requirePresence(playerId, room.getId());
        Optional<TavernPresence> occupied = presenceRepository.findByRoomIdAndSeatKey(roomId, seatKey);
        if (occupied.isPresent() && !occupied.get().getPlayer().getId().equals(playerId)) {
            throw new IllegalStateException("Quelqu'un est déjà assis ici.");
        }
        TavernNavigation.Seat seat = TavernNavigation.seat(seatKey);
        mine.setSeatKey(seatKey);
        mine.setPositionX(seat.x());
        mine.setPositionY(seat.y());
        mine.setFacing(seat.facing());
        mine.setPose("SEATED");
        mine.setLastSeenAt(LocalDateTime.now());
        presenceRepository.save(mine);
        liveService.publish(roomId,
                TavernLiveEventResponse.player("PLAYER", roomId, toPresence(mine, playerId)));
        return snapshot(playerId, roomId);
    }

    @Transactional
    public TavernRoomSnapshot emote(Long playerId, Long roomId, String emote) {
        cleanup();
        String normalized = emote == null ? "" : emote.trim().toUpperCase(Locale.ROOT);
        if (!EMOTES.contains(normalized)) throw new IllegalArgumentException("Émote inconnue.");
        TavernPresence mine = requirePresence(playerId, roomId);
        mine.setEmote(normalized);
        mine.setEmoteAt(LocalDateTime.now());
        mine.setLastSeenAt(LocalDateTime.now());
        presenceRepository.save(mine);
        liveService.publish(roomId,
                TavernLiveEventResponse.player("EMOTE", roomId, toPresence(mine, playerId)));
        return snapshot(playerId, roomId);
    }

    @Transactional
    public TavernPresenceResponse move(Long playerId, Long roomId, TavernMoveRequest request) {
        cleanup();
        TavernPresence mine = requirePresence(playerId, roomId);
        TavernNavigation.Point current = positionOf(mine);
        TavernNavigation.Point target = TavernNavigation.normalize(request.x(), request.y());

        mine.setSeatKey(null);
        mine.setPositionX(target.x());
        mine.setPositionY(target.y());
        mine.setFacing(TavernNavigation.facing(current.x(), target.x(), mine.getFacing()));
        mine.setPose("STANDING");
        mine.setLastSeenAt(LocalDateTime.now());
        presenceRepository.save(mine);

        TavernPresenceResponse response = toPresence(mine, playerId);
        liveService.publish(roomId, TavernLiveEventResponse.player("MOVE", roomId, response));
        return response;
    }

    @Transactional
    public void assertPresent(Long playerId, Long roomId) {
        cleanup();
        TavernPresence presence = requirePresence(playerId, roomId);
        presence.setLastSeenAt(LocalDateTime.now());
        presenceRepository.save(presence);
    }

    @Transactional
    public void leave(Long playerId) {
        Long roomId = presenceRepository.findByPlayerId(playerId)
                .map(presence -> presence.getRoom().getId())
                .orElse(null);
        presenceRepository.deleteByPlayerId(playerId);
        if (roomId != null) liveService.refresh(roomId);
    }

    @Transactional
    public TavernRoomSnapshot snapshot(Long playerId, Long roomId) {
        cleanup();
        TavernPresence mine = requirePresence(playerId, roomId);
        mine.setLastSeenAt(LocalDateTime.now());
        presenceRepository.save(mine);
        TavernRoom room = mine.getRoom();

        return new TavernRoomSnapshot(
                room.getId(), room.getCode(), room.getName(), room.getType().name(),
                room.getCapacity(), SEATS,
                presenceRepository.findAllByRoomIdOrderByJoinedAtAsc(roomId)
                        .stream().map(p -> toPresence(p, playerId)).toList(),
                chatService.recentInRoom(roomId, null),
                counterService.counter(playerId)
        );
    }

    private TavernRoomSnapshot joinLocked(Long playerId, Long roomId, boolean codeGranted) {
        Optional<TavernPresence> current = presenceRepository.findByPlayerId(playerId);
        if (current.isPresent() && current.get().getRoom().getId().equals(roomId)) {
            return snapshot(playerId, roomId);
        }
        TavernRoom room = roomRepository.findForUpdateById(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Salle introuvable."));
        if (room.getType() == TavernRoomType.PRIVATE && !codeGranted) {
            throw new IllegalStateException("Ce salon se rejoint avec son code.");
        }
        if (presenceRepository.countByRoomId(roomId) >= room.getCapacity()) {
            throw new IllegalStateException("Cette salle est complète.");
        }
        presenceRepository.deleteByPlayerId(playerId);
        presenceRepository.save(presence(room, player(playerId)));
        liveService.refresh(roomId);
        return snapshot(playerId, roomId);
    }

    private TavernRoom createCommonRoom() {
        long number = roomRepository.countByType(TavernRoomType.COMMON) + 1;
        return roomRepository.save(TavernRoom.builder()
                .code(uniqueCode()).name("Salle du Fjord " + number)
                .type(TavernRoomType.COMMON).capacity(CAPACITY)
                .createdAt(LocalDateTime.now()).build());
    }

    private TavernPresence presence(TavernRoom room, PlayerProfile player) {
        LocalDateTime now = LocalDateTime.now();
        TavernNavigation.Point spawn = TavernNavigation.spawn();
        return TavernPresence.builder()
                .room(room).player(player)
                .positionX(spawn.x()).positionY(spawn.y())
                .facing("LEFT").pose("STANDING")
                .joinedAt(now).lastSeenAt(now)
                .build();
    }

    private TavernPresence requirePresence(Long playerId, Long roomId) {
        TavernPresence presence = presenceRepository.findByPlayerId(playerId)
                .orElseThrow(() -> new IllegalStateException("Tu n'es pas dans la taverne."));
        if (!presence.getRoom().getId().equals(roomId)) {
            throw new IllegalStateException("Tu n'es pas dans cette salle.");
        }
        return presence;
    }

    private PlayerProfile player(Long playerId) {
        return playerRepository.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Joueur introuvable."));
    }

    private TavernRoomSummaryResponse summary(TavernRoom room, Long currentRoomId) {
        return new TavernRoomSummaryResponse(
                room.getId(), room.getCode(), room.getName(), room.getType().name(),
                (int) presenceRepository.countByRoomId(room.getId()), room.getCapacity(),
                Objects.equals(room.getId(), currentRoomId));
    }

    public TavernPresenceResponse toPresence(TavernPresence presence, Long viewerId) {
        PlayerProfile player = presence.getPlayer();
        TavernNavigation.Point position = positionOf(presence);
        String action = presence.getActionAt() != null
                && presence.getActionAt().isAfter(LocalDateTime.now().minusSeconds(4))
                ? presence.getAction() : null;
        return new TavernPresenceResponse(
                player.getId(), player.getDisplayName(), player.getLevel(), player.getReputation(),
                presence.getSeatKey(), player.getId().equals(viewerId),
                character(player), presence.getEmote(), presence.getEmoteAt(),
                position.x(), position.y(),
                presence.getFacing() == null ? "LEFT" : presence.getFacing(),
                presence.getPose() == null ? (presence.getSeatKey() == null ? "STANDING" : "SEATED") : presence.getPose(),
                action, presence.getActionAt());
    }

    private TavernNavigation.Point positionOf(TavernPresence presence) {
        TavernNavigation.Seat seat = presence.getSeatKey() == null ? null : TavernNavigation.seat(presence.getSeatKey());
        if (seat != null) return new TavernNavigation.Point(seat.x(), seat.y());
        if (presence.getPositionX() != null && presence.getPositionY() != null) {
            return TavernNavigation.normalize(presence.getPositionX(), presence.getPositionY());
        }
        return TavernNavigation.spawn();
    }

    private TavernCharacterResponse character(PlayerProfile player) {
        long seed = player.getId() == null ? 0 : player.getId();
        String[] bodies = {"robuste", "fin", "grand"};
        String[] hairs = {"court", "tresse", "long", "rase", "boucles"};
        String[] outfits = {"brasseur", "voyageur", "fermier", "marchand"};
        String[] palettes = {"ambre", "fjord", "mousse", "prune", "cuivre", "ardoise"};
        String accessory = player.getReputation() >= 120 ? "broche" : player.getLevel() >= 5 ? "ceinture" : "aucun";
        return new TavernCharacterResponse(
                player.getAvatar(),
                bodies[(int) (seed % bodies.length)],
                hairs[(int) ((seed / 3) % hairs.length)],
                outfits[(int) ((seed / 7) % outfits.length)],
                palettes[(int) ((seed / 11) % palettes.length)],
                accessory);
    }

    private void cleanup() {
        presenceRepository.deleteByLastSeenAtBefore(LocalDateTime.now().minusSeconds(PRESENCE_SECONDS));
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder out = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                out.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
            }
            String code = out.toString();
            if (roomRepository.findByCodeIgnoreCase(code).isEmpty()) return code;
        }
        throw new IllegalStateException("Impossible d'ouvrir un nouveau salon pour l'instant.");
    }
}
