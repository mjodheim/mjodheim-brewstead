package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.apiary.BeehiveResponse;
import be.mjodheim.brewstead.service.ApiaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/apiary")
@RequiredArgsConstructor
public class ApiaryController {

    private final ApiaryService apiaryService;

    @GetMapping("/players/{playerId}/hives")
    public List<BeehiveResponse> hives(@PathVariable Long playerId) {
        return apiaryService.findAllHives(playerId);
    }

    @PostMapping("/hives/{hiveId}/start")
    public BeehiveResponse start(@PathVariable Long hiveId) {
        return apiaryService.startProduction(hiveId);
    }

    @PostMapping("/hives/{hiveId}/refresh")
    public BeehiveResponse refresh(@PathVariable Long hiveId) {
        return apiaryService.updateHiveStatus(hiveId);
    }

    @PostMapping("/hives/{hiveId}/harvest")
    public BeehiveResponse harvest(@PathVariable Long hiveId) {
        return apiaryService.harvest(hiveId);
    }
}
