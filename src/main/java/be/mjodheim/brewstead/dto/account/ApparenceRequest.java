package be.mjodheim.brewstead.dto.account;

public record ApparenceRequest(
        String corps,
        String peau,
        String cheveux,
        String teinte,
        String barbe,
        String tenue,
        String couleur
) {
}
