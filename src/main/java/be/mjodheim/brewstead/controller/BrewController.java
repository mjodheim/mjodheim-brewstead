package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.brew.BatchResponse;
import be.mjodheim.brewstead.dto.brew.StartBatchRequest;
import be.mjodheim.brewstead.service.BrewService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/brewery")
@RequiredArgsConstructor
public class BrewController {

    private final BrewService brewService;

    @GetMapping("/players/{playerId}/batches")
    public List<BatchResponse> batches(@PathVariable Long playerId) {
        return brewService.findPlayerBatches(playerId);
    }

    @PostMapping("/batches")
    public BatchResponse start(@RequestBody StartBatchRequest request) {
        return brewService.startBatch(request);
    }

    @PostMapping("/batches/{batchId}/refresh")
    public BatchResponse refresh(@PathVariable Long batchId) {
        return brewService.updateBatchStatus(batchId);
    }
}
