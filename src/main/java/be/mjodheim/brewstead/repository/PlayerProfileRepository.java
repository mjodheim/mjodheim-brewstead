package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.PlayerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerProfileRepository extends JpaRepository<PlayerProfile, Long> {
}
