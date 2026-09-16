package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.Ingredient;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IngredientRepository extends JpaRepository<Ingredient, Long> {
}
