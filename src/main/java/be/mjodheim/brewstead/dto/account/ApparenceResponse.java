package be.mjodheim.brewstead.dto.account;

import be.mjodheim.brewstead.entity.Apparence;

/** L'allure du joueur, et s'il l'a choisie lui-même ou non. */
public record ApparenceResponse(
        boolean choisie,
        String corps,
        String peau,
        String cheveux,
        String teinte,
        String barbe,
        String tenue,
        String couleur
) {
    public static ApparenceResponse of(boolean choisie, Apparence a) {
        return new ApparenceResponse(choisie, a.getCorps(), a.getPeau(), a.getCheveux(), a.getTeinte(),
                a.getBarbe(), a.getTenue(), a.getCouleur());
    }
}
