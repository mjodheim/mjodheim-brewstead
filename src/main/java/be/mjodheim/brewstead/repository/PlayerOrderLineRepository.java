package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.PlayerOrderLine;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerOrderLineRepository extends JpaRepository<PlayerOrderLine, Long> {
}
