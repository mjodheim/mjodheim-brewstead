package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.TavernMessage;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface TavernMessageRepository extends JpaRepository<TavernMessage, Long> {

    List<TavernMessage> findByOrderByPostedAtDesc(Limit limit);

    List<TavernMessage> findByIdGreaterThanOrderByPostedAtAsc(Long id, Limit limit);

    long countByAuthorIdAndPostedAtAfter(Long authorId, LocalDateTime moment);
}
