package com.tsu2track.fitness_tracker.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import tools.jackson.databind.ObjectMapper;

import com.tsu2track.fitness_tracker.ValidationExceptionHandler.FieldErrorDetail;
import com.tsu2track.fitness_tracker.ValidationExceptionHandler.ValidationErrorResponse;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "X-API-Key";

    private final byte[] expectedKey;
    private final ObjectMapper objectMapper;

    public ApiKeyAuthFilter(
            @Value("${app.api-key}") String configuredKey,
            ObjectMapper objectMapper) {
        this.expectedKey = configuredKey.getBytes(StandardCharsets.UTF_8);
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {

        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String provided = request.getHeader(HEADER);
        if (provided == null
                || !MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), expectedKey)) {
            writeUnauthorized(request, response);
            return;
        }

        var auth = new UsernamePasswordAuthenticationToken(
            "api-key-user",
            null,
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private void writeUnauthorized(HttpServletRequest request, HttpServletResponse response) throws IOException {
        var body = new ValidationErrorResponse(
            Instant.now().toString(),
            HttpStatus.UNAUTHORIZED.value(),
            "Unauthorized",
            request.getRequestURI(),
            List.of(new FieldErrorDetail("X-API-Key", "missing or invalid"))
        );
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
