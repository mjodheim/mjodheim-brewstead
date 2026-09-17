package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.order.CreatePlayerOrderRequest;
import be.mjodheim.brewstead.dto.order.FulfillPlayerOrderRequest;
import be.mjodheim.brewstead.dto.order.PlayerOrderResponse;
import be.mjodheim.brewstead.service.PlayerOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/player-orders")
@RequiredArgsConstructor
public class PlayerOrderController {

    private final PlayerOrderService playerOrderService;

    @GetMapping("/market")
    public List<PlayerOrderResponse> market() {
        return playerOrderService.findOpenOrders();
    }

    @GetMapping("/players/{playerId}")
    public List<PlayerOrderResponse> playerOrders(@PathVariable Long playerId) {
        return playerOrderService.findPlayerOrders(playerId);
    }

    @PostMapping
    public PlayerOrderResponse create(@RequestBody CreatePlayerOrderRequest request) {
        return playerOrderService.createOrder(request);
    }

    @PostMapping("/{orderId}/fulfill")
    public PlayerOrderResponse fulfill(
            @PathVariable Long orderId,
            @RequestBody FulfillPlayerOrderRequest request
    ) {
        return playerOrderService.fulfillOrder(orderId, request.fulfillerId());
    }

    @PostMapping("/{orderId}/cancel")
    public PlayerOrderResponse cancel(
            @PathVariable Long orderId,
            @RequestParam Long creatorId
    ) {
        return playerOrderService.cancelOrder(orderId, creatorId);
    }
}
