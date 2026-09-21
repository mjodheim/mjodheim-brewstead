package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecipeRepository extends JpaRepository<Recipe, Long> {

    List<Recipe> findAllByIsPublicTrueOrOwnerId(Long ownerId);

    List<Recipe> findAllByIsPublicTrue();

    Optional<Recipe> findFirstByNameIgnoreCaseAndOwnerIsNull(String name);

    long countByOwnerId(Long ownerId);

    boolean existsByOwnerIdAndNameIgnoreCase(Long ownerId, String name);
}
