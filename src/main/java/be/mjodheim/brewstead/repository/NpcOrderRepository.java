package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.NpcOrder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NpcOrderRepository extends JpaRepository<NpcOrder, Long> {
}
