package be.mjodheim.brewstead.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "tavern_presences",
        uniqueConstraints = @UniqueConstraint(name = "uk_tavern_presence_player", columnNames = "player_id"),
        indexes = {
                @Index(name = "idx_tavern_presence_room", columnList = "room_id"),
                @Index(name = "idx_tavern_presence_seen", columnList = "lastSeenAt")
        })
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class TavernPresence {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private TavernRoom room;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false, unique = true)
    private PlayerProfile player;

    @Column(length = 24)
    private String seatKey;

    @Column(nullable = false)
    private LocalDateTime joinedAt;

    @Column(nullable = false)
    private LocalDateTime lastSeenAt;

    @Column(length = 16)
    private String emote;

    private LocalDateTime emoteAt;

    /**
     * Coordonnées dans le repère 960×560 de la salle. Elles restent
     * nullable pour que le déploiement puisse faire évoluer une table qui
     * contient encore une ancienne présence : le service fournit alors le
     * point d'entrée par défaut.
     */
    private Double positionX;
    private Double positionY;

    @Column(length = 8)
    private String facing;

    @Column(length = 16)
    private String pose;

    @Column(length = 20)
    private String action;

    private LocalDateTime actionAt;
}
