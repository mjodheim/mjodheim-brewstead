package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.farm.PlantCropRequest;
import be.mjodheim.brewstead.dto.farm.PlayerFieldResponse;
import be.mjodheim.brewstead.service.FarmService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/farm")
@RequiredArgsConstructor
public class FarmController {

    private final FarmService farmService;

    @GetMapping("/players/{playerId}/fields")
    public List<PlayerFieldResponse> fields(@PathVariable Long playerId) {
        return farmService.findAllFields(playerId);
    }

    @PostMapping("/plant")
    public PlayerFieldResponse plant(@RequestBody PlantCropRequest request) {
        return farmService.plant(request);
    }

    @PostMapping("/fields/{fieldId}/refresh")
    public PlayerFieldResponse refresh(@PathVariable Long fieldId) {
        return farmService.updateFieldStatus(fieldId);
    }

    @PostMapping("/fields/{fieldId}/harvest")
    public PlayerFieldResponse harvest(@PathVariable Long fieldId) {
        return farmService.harvest(fieldId);
    }
}
