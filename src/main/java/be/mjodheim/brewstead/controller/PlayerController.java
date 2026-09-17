package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.player.PlayerProfileResponse;
import be.mjodheim.brewstead.service.PlayerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/players")
@RequiredArgsConstructor
public class PlayerController {

    private final PlayerService playerService;

    @GetMapping("/{playerId}")
    public PlayerProfileResponse getPlayer(@PathVariable Long playerId) {
        return playerService.getPlayer(playerId);
    }
}
