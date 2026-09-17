package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.NpcOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NpcOrderRepository extends JpaRepository<NpcOrder, Long> {

    List<NpcOrder> findAllByPlayerIdOrderByCreatedAtDesc(Long playerId);
}
