package be.mjodheim.brewstead.controller;

import be.mjodheim.brewstead.dto.account.ApparenceRequest;
import be.mjodheim.brewstead.dto.account.ApparenceResponse;
import be.mjodheim.brewstead.dto.account.ChangePasswordRequest;
import be.mjodheim.brewstead.dto.account.UpdateAccountRequest;
import be.mjodheim.brewstead.dto.player.PlayerProfileResponse;
import be.mjodheim.brewstead.enums.Avatar;
import be.mjodheim.brewstead.dto.effect.PlayerEffectResponse;
import be.mjodheim.brewstead.service.AccountService;
import be.mjodheim.brewstead.service.EffectService;
import be.mjodheim.brewstead.service.TavernRoomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;
    private final EffectService effectService;
    private final TavernRoomService tavernRoomService;

    @GetMapping("/me")
    public PlayerProfileResponse me(Principal principal) {
        return accountService.currentAccount(principal.getName());
    }

    @PutMapping("/me")
    public PlayerProfileResponse update(Principal principal, @Valid @RequestBody UpdateAccountRequest request) {
        return accountService.updateAccount(principal.getName(), request);
    }

    @PutMapping("/password")
    public void changePassword(Principal principal, @Valid @RequestBody ChangePasswordRequest request) {
        accountService.changePassword(principal.getName(), request);
    }

    @GetMapping("/me/effects")
    public List<PlayerEffectResponse> effects(Principal principal) {
        return effectService.activeEffects(accountService.currentPlayerId(principal.getName()));
    }

    @GetMapping("/apparence")
    public ApparenceResponse apparence(Principal principal) {
        return accountService.apparence(principal.getName());
    }

    @PutMapping("/apparence")
    public ApparenceResponse changerApparence(Principal principal, @RequestBody ApparenceRequest request) {
        ApparenceResponse apparence = accountService.changerApparence(principal.getName(), request);
        tavernRoomService.annoncerAllure(accountService.currentPlayerId(principal.getName()));
        return apparence;
    }

    @GetMapping("/avatars")
    public List<String> avatars() {
        return Arrays.stream(Avatar.values()).map(Enum::name).toList();
    }
}
