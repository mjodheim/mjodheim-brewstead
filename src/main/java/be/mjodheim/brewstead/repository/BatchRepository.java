package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Batch;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BatchRepository extends JpaRepository<Batch, Long> {
}
