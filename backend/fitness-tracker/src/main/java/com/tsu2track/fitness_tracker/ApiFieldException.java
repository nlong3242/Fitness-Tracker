package com.tsu2track.fitness_tracker;

import org.springframework.http.HttpStatus;

/* A rejected request the client should explain to the user (wrong
   password, email taken...). ValidationExceptionHandler turns it into the
   usual {status, error, path, errors:[{field, message}]} body, which
   ResponseStatusException can't do (server.error.include-message=never). */
public class ApiFieldException extends RuntimeException {
    private final HttpStatus status;
    private final String field;

    public ApiFieldException(HttpStatus status, String field, String message) {
        super(message);
        this.status = status;
        this.field = field;
    }

    public HttpStatus getStatus() { return status; }
    public String getField() { return field; }
}
