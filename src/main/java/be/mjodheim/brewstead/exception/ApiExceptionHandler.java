package be.mjodheim.brewstead.exception;

import be.mjodheim.brewstead.dto.error.ApiError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleBadRequest(IllegalArgumentException exception) {
        return response(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler({
            IllegalStateException.class,
            IngredientNotInInventoryException.class,
            InsufficientStockException.class,
            InsufficientCoinsException.class
    })
    public ResponseEntity<ApiError> handleConflict(RuntimeException exception) {
        return response(HttpStatus.CONFLICT, exception.getMessage());
    }

    private ResponseEntity<ApiError> response(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(
                new ApiError(
                        LocalDateTime.now(),
                        status.value(),
                        status.getReasonPhrase(),
                        message
                )
        );
    }
}
