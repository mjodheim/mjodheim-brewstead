package be.mjodheim.brewstead.repository;

import be.mjodheim.brewstead.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
}
