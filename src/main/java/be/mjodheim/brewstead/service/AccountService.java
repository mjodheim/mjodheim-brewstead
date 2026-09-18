package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.account.UpdateAccountRequest;
import be.mjodheim.brewstead.dto.player.PlayerProfileResponse;
import be.mjodheim.brewstead.entity.PlayerProfile;
import be.mjodheim.brewstead.entity.User;
import be.mjodheim.brewstead.enums.Avatar;
import be.mjodheim.brewstead.mapper.PlayerMapper;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

/**
 * Espace compte : tout part de l'utilisateur connecté, jamais d'un identifiant
 * reçu du navigateur.
 */
@Service
@RequiredArgsConstructor
public class AccountService {

    private static final Pattern DISPLAY_NAME = Pattern.compile("[\\p{L}\\p{N} '\\-]{3,30}");

    private final UserRepository userRepository;
    private final PlayerProfileRepository playerProfileRepository;
    private final PlayerService playerService;
    private final PlayerMapper playerMapper;

    @Transactional
    public PlayerProfileResponse currentAccount(String username) {
        User user = requireUser(username);
        return playerProfileRepository.findByUserId(user.getId())
                .map(playerMapper::toResponse)
                .orElseGet(() -> playerService.initializePlayer(user.getId()));
    }

    @Transactional
    public PlayerProfileResponse updateAccount(String username, UpdateAccountRequest request) {
        User user = requireUser(username);
        PlayerProfile profile = playerProfileRepository.findByUserId(user.getId())
                .orElseThrow(() -> new IllegalStateException("Aucun domaine pour ce compte."));

        profile.setDisplayName(cleanDisplayName(request.displayName()));
        profile.setAvatar(Avatar.fromNullable(request.avatar()));

        return playerMapper.toResponse(profile);
    }

    /** Un nom vide remet simplement l'identifiant de connexion en vitrine. */
    private String cleanDisplayName(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim().replaceAll("\\s{2,}", " ");
        if (!DISPLAY_NAME.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(
                    "Le nom affiché fait 3 à 30 caractères : lettres, chiffres, espace, apostrophe ou tiret.");
        }
        return trimmed;
    }

    private User requireUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalStateException("Compte introuvable."));
    }
}
