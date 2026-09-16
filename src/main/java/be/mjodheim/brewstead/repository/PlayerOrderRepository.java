package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.PlayerOrder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerOrderRepository extends JpaRepository<PlayerOrder, Long> {
}
