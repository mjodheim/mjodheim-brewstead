package be.mjodheim.brewstead.entity;

import be.mjodheim.brewstead.enums.UserRole;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table (name= "users")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false,  length = 50)
    private String username;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    private UserRole role;
}
