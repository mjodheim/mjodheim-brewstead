package be.mjodheim.brewstead.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * Une livraison faite à un habitué de la taverne. Chaque habitué ne passe
 * qu'une commande par jour et par brasseur : cette ligne dit qu'elle a été
 * honorée, et empêche de la payer deux fois.
 */
@Entity
@Table(name = "tavern_regular_visits",
        uniqueConstraints = @UniqueConstraint(name = "uk_tavern_regular_visit",
                columnNames = {"player_id", "regularKey", "day"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class TavernRegularVisit {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private PlayerProfile player;

    @Column(nullable = false, length = 24)
    private String regularKey;

    @Column(nullable = false)
    private LocalDate day;
}
