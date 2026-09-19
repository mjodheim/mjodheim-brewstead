package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.PlayerProgress;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlayerProgressRepository extends JpaRepository<PlayerProgress, Long> {
    Optional<PlayerProgress> findByPlayerId(Long playerId);
}
