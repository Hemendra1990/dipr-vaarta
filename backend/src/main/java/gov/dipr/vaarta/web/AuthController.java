package gov.dipr.vaarta.web;

import gov.dipr.vaarta.config.VaartaProperties;
import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.repo.AppUserRepo;
import gov.dipr.vaarta.security.CaptchaService;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.JwtService;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.UserAdminService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

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
    private final UserAdminService admin;

    public AuthController(AppUserRepo users, PasswordEncoder encoder, JwtService jwt, CaptchaService captcha, AuditService audit, VaartaProperties props,
                          UserAdminService admin) {
        this.users = users; this.encoder = encoder; this.jwt = jwt; this.captcha = captcha; this.audit = audit; this.props = props; this.admin = admin;
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

    /** Wrong passwords in a row before the account is locked, and for how long. */
    public static final int MAX_FAILED_LOGINS = 5;
    public static final Duration LOCK_FOR = Duration.ofMinutes(15);
    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    @PostMapping("/login")
    @Transactional
    public ResponseEntity<?> login(@RequestBody @jakarta.validation.Valid LoginRequest req) {
        if (!captcha.check(req.captchaId(), req.captchaAnswer()))
            return ResponseEntity.badRequest().body(Map.of("message", "The security check answer is wrong. Try the new question.", "code", "captcha"));
        String name = req.username().trim();
        var found = users.findByUsernameIgnoreCase(name);
        if (found.isEmpty()) {
            audit.record(null, "login.failed", "unknown user " + (name.length() > 60 ? name.substring(0, 60) : name));
            return wrong();
        }
        AppUser u = found.get();
        CurrentUser who = CurrentUser.of(u);
        Instant now = Instant.now();
        if (u.isLocked(now)) return locked(u);
        if (!encoder.matches(req.password(), u.getPasswordHash())) {
            if (u.recordFailedLogin(MAX_FAILED_LOGINS, now.plus(LOCK_FOR))) {
                audit.record(who, "login.locked", MAX_FAILED_LOGINS + " wrong passwords; locked until " + u.getLockedUntil());
                return locked(u);
            }
            audit.record(who, "login.failed", "wrong password (" + u.getFailedLogins() + " of " + MAX_FAILED_LOGINS + ")");
            return wrong();
        }
        if (!u.isActive())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "This login is deactivated. Ask the Commissioner's office to restore it.", "code", "inactive"));
        u.recordSignIn(now);
        audit.record(who, "login", u.getRole().title);
        return ResponseEntity.ok(Map.of("token", jwt.issue(u.getUsername(), u.getRole()), "user", UserDto.of(u), "mustChangePassword", u.isMustChangePassword()));
    }

    private static ResponseEntity<?> wrong() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "The user ID or password is wrong."));
    }

    private static ResponseEntity<?> locked(AppUser u) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                "message", "This login is locked after " + MAX_FAILED_LOGINS + " wrong passwords. Try again after " + AT.format(u.getLockedUntil()) + " IST.",
                "code", "locked", "retryAt", u.getLockedUntil().toString()));
    }

    public record PasswordRequest(String currentPassword, String newPassword) {}

    /** Any signed-in user changes their own password: needs the current one; minimum 8 characters with a digit. */
    @PostMapping("/password")
    public Map<String, String> changePassword(@AuthenticationPrincipal CurrentUser cu, @RequestBody PasswordRequest req) {
        admin.changeOwnPassword(cu, req.currentPassword(), req.newPassword());
        return Map.of("message", "Password changed.");
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal CurrentUser cu) {
        return UserDto.of(users.findByUsernameIgnoreCase(cu.username()).orElseThrow());
    }
}
