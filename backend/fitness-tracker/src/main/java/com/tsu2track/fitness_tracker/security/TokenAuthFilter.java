package com.tsu2track.fitness_tracker.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpHeaders;
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
import com.tsu2track.fitness_tracker.service.AuthService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/* Every request except sign-up and login must carry a login token:
   "Authorization: Bearer <token>". A valid one puts its AuthUser in the
   security context; anything else gets a 401 the client answers by
   showing the login page. */
@Component
public class TokenAuthFilter extends OncePerRequestFilter {

    public static final Set<String> OPEN_PATHS = Set.of("/auth/signup", "/auth/login");
    private static final String BEARER = "Bearer ";

    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public TokenAuthFilter(AuthService authService, ObjectMapper objectMapper) {
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    // The token from an Authorization header, or null.
    public static String bearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith(BEARER)) return null;
        return authorization.substring(BEARER.length()).trim();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return HttpMethod.OPTIONS.matches(request.getMethod())
            || OPEN_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {

        Optional<AuthUser> user = authService.authenticate(
            bearerToken(request.getHeader(HttpHeaders.AUTHORIZATION)));
        if (user.isEmpty()) {
            writeUnauthorized(request, response);
            return;
        }

        var auth = new UsernamePasswordAuthenticationToken(
            user.get(),
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
            List.of(new FieldErrorDetail("Authorization", "missing, invalid or expired login"))
        );
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
