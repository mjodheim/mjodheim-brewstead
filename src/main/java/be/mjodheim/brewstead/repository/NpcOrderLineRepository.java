package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.NpcOrderLine;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NpcOrderLineRepository extends JpaRepository<NpcOrderLine, Long> {
}
