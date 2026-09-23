package be.mjodheim.brewstead.service;

import be.mjodheim.brewstead.dto.tavern.PostMessageRequest;
import be.mjodheim.brewstead.repository.PlayerProfileRepository;
import be.mjodheim.brewstead.repository.TavernMessageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GenesisV21ChatRateWindowTest {
    @Mock TavernMessageRepository messages;
    @Mock PlayerProfileRepository players;

    @Test
    void antiSpamCountsExactlyThePreviousMinute() {
        TavernChatService service = new TavernChatService(messages, players);
        when(messages.countByAuthorIdAndPostedAtAfter(eq(1L), any(LocalDateTime.class))).thenReturn(12L);

        LocalDateTime before = LocalDateTime.now();
        assertThrows(IllegalStateException.class,
                () -> service.post(1L, new PostMessageRequest("hello")));
        LocalDateTime after = LocalDateTime.now();

        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(messages).countByAuthorIdAndPostedAtAfter(eq(1L), cutoff.capture());

        long minAge = Duration.between(cutoff.getValue(), before).toSeconds();
        long maxAge = Duration.between(cutoff.getValue(), after).toSeconds();
        assertTrue(minAge >= 55 && maxAge <= 65,
                "rate-limit cutoff must be approximately one minute old, got " + minAge + ".." + maxAge + " seconds");
    }
}
