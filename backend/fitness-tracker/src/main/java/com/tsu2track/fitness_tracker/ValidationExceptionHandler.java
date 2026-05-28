package com.tsu2track.fitness_tracker;

import java.time.Instant;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class ValidationExceptionHandler {

    public record FieldErrorDetail(String field, String message) {}

    public record ValidationErrorResponse(
        String timestamp,
        int status,
        String error,
        String path,
        List<FieldErrorDetail> errors
    ) {}

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationErrorResponse> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request) {
        List<FieldErrorDetail> details = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new FieldErrorDetail(fe.getField(), fe.getDefaultMessage()))
            .toList();
        ValidationErrorResponse body = new ValidationErrorResponse(
            Instant.now().toString(),
            400,
            "Validation failed",
            request.getRequestURI(),
            details
        );
        return ResponseEntity.badRequest().body(body);
    }
}
