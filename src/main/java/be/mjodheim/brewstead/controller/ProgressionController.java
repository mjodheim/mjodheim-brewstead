package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.progression.ProgressionResponse;
import be.mjodheim.brewstead.service.CurrentPlayerService;
import be.mjodheim.brewstead.service.ProgressionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

@RestController
@RequestMapping("/api/progression")
@RequiredArgsConstructor
public class ProgressionController {
    private final ProgressionService progressionService;
    private final CurrentPlayerService currentPlayer;

    @GetMapping
    public ProgressionResponse progression(Principal principal) {
        return progressionService.visit(currentPlayer.id(principal));
    }
}
