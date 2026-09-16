package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Beehive;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeehiveRepository extends JpaRepository<Beehive, Long> {
}
