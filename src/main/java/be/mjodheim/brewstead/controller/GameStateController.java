package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.game.GameStateResponse;
import be.mjodheim.brewstead.service.GameStateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.security.Principal;
import be.mjodheim.brewstead.service.CurrentPlayerService;

@RestController
@RequestMapping("/api/players")
@RequiredArgsConstructor
public class GameStateController {

    private final GameStateService gameStateService;
    private final CurrentPlayerService currentPlayer;

    @GetMapping("/{playerId}/state")
    public GameStateResponse getState(Principal principal, @PathVariable Long playerId) {
        return gameStateService.getState(currentPlayer.requireSelf(principal, playerId));
    }
}
