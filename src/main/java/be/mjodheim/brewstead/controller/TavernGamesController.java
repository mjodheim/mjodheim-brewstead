package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.tavern.DiceChallengeRequest;
import be.mjodheim.brewstead.dto.tavern.TavernGameResponse;
import be.mjodheim.brewstead.dto.tavern.TavernRegularResponse;
import be.mjodheim.brewstead.service.CurrentPlayerService;
import be.mjodheim.brewstead.service.TavernGamesService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/tavern")
@RequiredArgsConstructor
public class TavernGamesController {

    private final TavernGamesService games;
    private final CurrentPlayerService currentPlayer;

    @GetMapping("/regulars")
    public List<TavernRegularResponse> regulars(Principal principal) {
        return games.regulars(currentPlayer.id(principal));
    }

    @PostMapping("/regulars/{key}/deliver")
    public List<TavernRegularResponse> deliver(Principal principal, @PathVariable String key) {
        return games.deliver(currentPlayer.id(principal), key);
    }

    @PostMapping("/rooms/{roomId}/round")
    public TavernGameResponse round(Principal principal, @PathVariable Long roomId) {
        return games.round(currentPlayer.id(principal), roomId);
    }

    @PostMapping("/rooms/{roomId}/dice")
    public TavernGameResponse challenge(Principal principal, @PathVariable Long roomId,
                                        @RequestBody DiceChallengeRequest request) {
        return games.challenge(currentPlayer.id(principal), roomId, request);
    }

    @PostMapping("/rooms/{roomId}/dice/{challengeId}/accept")
    public TavernGameResponse accept(Principal principal, @PathVariable Long roomId, @PathVariable String challengeId) {
        return games.accept(currentPlayer.id(principal), roomId, challengeId);
    }

    @PostMapping("/rooms/{roomId}/dice/{challengeId}/decline")
    public TavernGameResponse decline(Principal principal, @PathVariable Long roomId, @PathVariable String challengeId) {
        return games.decline(currentPlayer.id(principal), roomId, challengeId);
    }
}
