package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.order.NpcOrderResponse;
import be.mjodheim.brewstead.service.NpcOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/npc-orders")
@RequiredArgsConstructor
public class NpcOrderController {

    private final NpcOrderService npcOrderService;

    @GetMapping("/players/{playerId}")
    public List<NpcOrderResponse> orders(@PathVariable Long playerId) {
        return npcOrderService.findAllOrders(playerId);
    }

    @PostMapping("/players/{playerId}/generate")
    public NpcOrderResponse generate(@PathVariable Long playerId) {
        return npcOrderService.generateOrder(playerId);
    }

    @PostMapping("/{orderId}/accept")
    public NpcOrderResponse accept(@PathVariable Long orderId) {
        return npcOrderService.acceptOrder(orderId);
    }

    @PostMapping("/{orderId}/complete")
    public NpcOrderResponse complete(@PathVariable Long orderId) {
        return npcOrderService.completeOrder(orderId);
    }
}
