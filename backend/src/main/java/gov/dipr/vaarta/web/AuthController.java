package gov.dipr.vaarta.web;

import gov.dipr.vaarta.config.VaartaProperties;
import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.repo.AppUserRepo;
import gov.dipr.vaarta.security.CaptchaService;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AppUserRepo users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final CaptchaService captcha;
    private final AuditService audit;
    private final VaartaProperties props;

    public AuthController(AppUserRepo users, PasswordEncoder encoder, JwtService jwt, CaptchaService captcha, AuditService audit, VaartaProperties props) {
        this.users = users; this.encoder = encoder; this.jwt = jwt; this.captcha = captcha; this.audit = audit; this.props = props;
    }

    public record RoleTile(String role, String key, String title, String titleKn, String scope, String user, String icon, String color) {}

    /** Sign-in tiles. The demo password is returned so the prototype's prefilled sign-in still works for sample data. */
    @GetMapping("/roles")
    public Map<String, Object> roles() {
        List<RoleTile> tiles = Arrays.stream(Role.values()).map(r -> {
            String scope = users.findByUsernameIgnoreCase(r.demoUser).map(AppUser::getScopeLabel).orElse(r.defaultScope);
            return new RoleTile(r.name(), r.key, r.title, r.titleKn, scope, r.demoUser, r.icon, r.color);
        }).toList();
        return Map.of("roles", tiles, "demoPassword", props.seedSampleData() ? props.demoPassword() : "");
    }

    @PostMapping("/captcha")
    public Map<String, String> captcha() { return captcha.next(); }

    public record LoginRequest(@NotBlank String username, @NotBlank String password, String captchaId, String captchaAnswer) {}

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody @jakarta.validation.Valid LoginRequest req) {
        if (!captcha.check(req.captchaId(), req.captchaAnswer()))
            return ResponseEntity.badRequest().body(Map.of("message", "The security check answer is wrong. Try the new question.", "code", "captcha"));
        var u = users.findByUsernameIgnoreCase(req.username().trim()).filter(AppUser::isActive)
                .filter(x -> encoder.matches(req.password(), x.getPasswordHash()));
        if (u.isEmpty())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "The user ID or password is wrong."));
        audit.record(CurrentUser.of(u.get()), "login", u.get().getRole().title);
        return ResponseEntity.ok(Map.of("token", jwt.issue(u.get().getUsername(), u.get().getRole()), "user", UserDto.of(u.get())));
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal CurrentUser cu) {
        return UserDto.of(users.findByUsernameIgnoreCase(cu.username()).orElseThrow());
    }
}
