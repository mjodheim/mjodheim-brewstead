package be.mjodheim.brewstead.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "player_profiles")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class PlayerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(cascade = CascadeType.MERGE,  fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "user_id",
            nullable = false,
            unique = true
    )
    private User user;

    @Builder.Default
    @Column(nullable = false)
    private int level = 1;

    @Builder.Default
    @Column(nullable = false)
    private int experience = 0;

    @Builder.Default
    @Column(nullable = false)
    private int coin = 500;

    @Builder.Default
    @Column(nullable = false)
    private int reputation = 0;

}
