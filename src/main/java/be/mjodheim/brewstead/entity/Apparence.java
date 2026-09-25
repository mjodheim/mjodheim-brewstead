package be.mjodheim.brewstead.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * L'allure que le joueur s'est composée pour la taverne.
 *
 * <p>Toutes les colonnes restent nulles tant qu'il n'a rien choisi : le
 * personnage garde alors l'allure tirée de son identifiant, la même qu'avant
 * l'atelier.
 */
@Embeddable
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class Apparence {

    @Column(name = "apparence_corps", length = 16)
    private String corps;

    @Column(name = "apparence_peau", length = 16)
    private String peau;

    @Column(name = "apparence_cheveux", length = 16)
    private String cheveux;

    @Column(name = "apparence_teinte", length = 16)
    private String teinte;

    @Column(name = "apparence_barbe", length = 16)
    private String barbe;

    @Column(name = "apparence_tenue", length = 16)
    private String tenue;

    @Column(name = "apparence_couleur", length = 16)
    private String couleur;
}
