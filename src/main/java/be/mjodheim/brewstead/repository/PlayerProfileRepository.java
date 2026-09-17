package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.PlayerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlayerProfileRepository extends JpaRepository<PlayerProfile, Long> {

    Optional<PlayerProfile> findByUserId(Long userId);

    List<PlayerProfile> findTop10ByOrderByReputationDescLevelDesc();
}
