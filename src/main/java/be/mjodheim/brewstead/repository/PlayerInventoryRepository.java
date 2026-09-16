package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Crop;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerInventoryRepository extends JpaRepository<Crop, Long> {
}
