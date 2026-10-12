package gov.dipr.vaarta.security;

import gov.dipr.vaarta.config.VaartaProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Optional;

@Service
public class JwtService {
    private final SecretKey key;
    private final int ttlMinutes;

    public JwtService(VaartaProperties props) {
        byte[] secret = props.jwtSecret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) throw new IllegalStateException("vaarta.jwt-secret must be at least 32 bytes");
        this.key = Keys.hmacShaKeyFor(secret);
        this.ttlMinutes = props.jwtTtlMinutes();
    }

    public String issue(String username, Role role) {
        Instant now = Instant.now();
        return Jwts.builder().subject(username).claim("role", role.name())
                .issuedAt(Date.from(now)).expiration(Date.from(now.plus(ttlMinutes, ChronoUnit.MINUTES)))
                .signWith(key).compact();
    }

    /** The username in a valid, unexpired token. */
    public Optional<String> verify(String token) {
        try {
            Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            return Optional.ofNullable(c.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
