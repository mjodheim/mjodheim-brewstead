package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecipeRepository extends JpaRepository<Recipe, Long> {

    List<Recipe> findAllByIsPublicTrueOrOwnerId(Long ownerId);

    List<Recipe> findAllByIsPublicTrue();
}
