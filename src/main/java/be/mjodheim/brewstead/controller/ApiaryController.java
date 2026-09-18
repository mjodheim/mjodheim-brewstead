package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.apiary.BeehiveResponse;
import be.mjodheim.brewstead.service.ApiaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.security.Principal;
import be.mjodheim.brewstead.service.CurrentPlayerService;

@RestController
@RequestMapping("/api/apiary")
@RequiredArgsConstructor
public class ApiaryController {

    private final ApiaryService apiaryService;
    private final CurrentPlayerService currentPlayer;

    @GetMapping("/players/{playerId}/hives")
    public List<BeehiveResponse> hives(Principal principal, @PathVariable Long playerId) {
        return apiaryService.findAllHives(currentPlayer.requireSelf(principal, playerId));
    }

    @PostMapping("/hives/{hiveId}/start")
    public BeehiveResponse start(Principal principal, @PathVariable Long hiveId) {
        return apiaryService.startProduction(currentPlayer.id(principal), hiveId);
    }

    @PostMapping("/hives/{hiveId}/refresh")
    public BeehiveResponse refresh(Principal principal, @PathVariable Long hiveId) {
        return apiaryService.updateHiveStatus(currentPlayer.id(principal), hiveId);
    }

    @PostMapping("/hives/{hiveId}/harvest")
    public BeehiveResponse harvest(Principal principal, @PathVariable Long hiveId) {
        return apiaryService.harvest(currentPlayer.id(principal), hiveId);
    }
}
