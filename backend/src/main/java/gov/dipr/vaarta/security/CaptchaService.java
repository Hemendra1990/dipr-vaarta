package gov.dipr.vaarta.security;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** The arithmetic security check on the sign-in page. Each question is single use and expires in 5 minutes. */
@Service
public class CaptchaService {
    private record Pending(int answer, Instant expires) {}

    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private final SecureRandom rnd = new SecureRandom();

    public Map<String, String> next() {
        pending.entrySet().removeIf(e -> e.getValue().expires().isBefore(Instant.now()));
        int a = 2 + rnd.nextInt(8), b = 1 + rnd.nextInt(9);
        String id = UUID.randomUUID().toString();
        pending.put(id, new Pending(a + b, Instant.now().plusSeconds(300)));
        return Map.of("id", id, "question", a + " + " + b);
    }

    public boolean check(String id, String answer) {
        if (id == null || answer == null) return false;
        Pending p = pending.remove(id);
        if (p == null || p.expires().isBefore(Instant.now())) return false;
        try {
            return Integer.parseInt(answer.trim()) == p.answer();
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
