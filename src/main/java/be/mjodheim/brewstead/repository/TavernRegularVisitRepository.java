package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.TavernRegularVisit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface TavernRegularVisitRepository extends JpaRepository<TavernRegularVisit, Long> {
    List<TavernRegularVisit> findAllByPlayerIdAndDay(Long playerId, LocalDate day);
    boolean existsByPlayerIdAndRegularKeyAndDay(Long playerId, String regularKey, LocalDate day);
}
