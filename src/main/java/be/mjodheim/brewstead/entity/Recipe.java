package be.mjodheim.brewstead.entity;

import be.mjodheim.brewstead.enums.DrinkType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "recipes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Recipe {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private long id;

    // Les recettes officielles du jeu n'ont pas de 'owner' → nullable
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private PlayerProfile owner;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DrinkType drinkType;

    @Column(nullable = false, precision = 8, scale = 2)
    private BigDecimal baseVolume;

    @Column(nullable = false)
    private int fermentationDurationHours;

    @Column(nullable = false)
    @Builder.Default
    private boolean isPublic = false;
}
