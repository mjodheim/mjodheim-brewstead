package be.mjodheim.brewstead.mapper;

import be.mjodheim.brewstead.dto.inventory.PlayerInventoryResponse;
import be.mjodheim.brewstead.entity.PlayerInventory;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper
public interface InventoryMapper {

    @Mapping(source = "ingredient.name", target = "ingredientName")
    @Mapping(source = "ingredient.id", target = "ingredientId")
    @Mapping(source = "ingredient.unit", target = "unit")
    PlayerInventoryResponse toPlayerInventoryResponse(PlayerInventory playerInventory);

    List<PlayerInventoryResponse> toResponseList (List<PlayerInventory> playerInventoryList);
}
