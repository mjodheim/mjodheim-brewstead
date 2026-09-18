package be.mjodheim.brewstead.config;

import be.mjodheim.brewstead.entity.User;
import be.mjodheim.brewstead.enums.UserRole;
import be.mjodheim.brewstead.repository.UserRepository;
import be.mjodheim.brewstead.service.PlayerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Amorçage du tout premier compte, sur une base vierge uniquement.
 * Le contenu du jeu est chargé par {@link CatalogSeeder}, qui passe avant.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PlayerService playerService;

    @Override
    public void run(String... args) {
        if (userRepository.count() > 0) {
            return;
        }

        User player = userRepository.save(
                User.builder()
                        .username("Anthony")
                        .password(passwordEncoder.encode("Test123="))
                        .role(UserRole.PLAYER)
                        .build()
        );

        // même chemin que l'inscription : champs, ruches et réserves de départ
        playerService.initializePlayer(player.getId());
        log.info("Compte d'amorçage créé. Change son mot de passe à la première connexion.");
    }
}
