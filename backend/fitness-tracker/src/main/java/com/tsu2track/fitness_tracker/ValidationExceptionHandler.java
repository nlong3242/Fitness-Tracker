package com.tsu2track.fitness_tracker;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import tools.jackson.databind.DatabindException;
import tools.jackson.databind.exc.InvalidFormatException;

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

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ValidationErrorResponse> handleUnreadable(
            HttpMessageNotReadableException ex,
            HttpServletRequest request) {
        String field = "(body)";
        String message = "malformed request body";

        if (ex.getCause() instanceof DatabindException jme) {
            String path = extractFieldPath(jme);
            if (!path.isEmpty()) field = path;

            if (jme instanceof InvalidFormatException ife
                    && ife.getTargetType() != null
                    && ife.getTargetType().isEnum()) {
                String allowed = Arrays.stream(ife.getTargetType().getEnumConstants())
                    .map(Object::toString)
                    .collect(Collectors.joining(", "));
                message = "must be one of [" + allowed + "]";
            } else {
                message = "invalid value";
            }
        }

        ValidationErrorResponse body = new ValidationErrorResponse(
            Instant.now().toString(),
            400,
            "Validation failed",
            request.getRequestURI(),
            List.of(new FieldErrorDetail(field, message))
        );
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(ApiFieldException.class)
    public ResponseEntity<ValidationErrorResponse> handleApiField(
            ApiFieldException ex,
            HttpServletRequest request) {
        ValidationErrorResponse body = new ValidationErrorResponse(
            Instant.now().toString(),
            ex.getStatus().value(),
            ex.getStatus().getReasonPhrase(),
            request.getRequestURI(),
            List.of(new FieldErrorDetail(ex.getField(), ex.getMessage()))
        );
        return ResponseEntity.status(ex.getStatus()).body(body);
    }

    private static String extractFieldPath(DatabindException jme) {
        StringBuilder sb = new StringBuilder();
        for (DatabindException.Reference ref : jme.getPath()) {
            if (ref.getPropertyName() != null) {
                if (sb.length() > 0) sb.append('.');
                sb.append(ref.getPropertyName());
            } else if (ref.getIndex() >= 0) {
                sb.append('[').append(ref.getIndex()).append(']');
            }
        }
        return sb.toString();
    }
}
