package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.BotContact;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.BotContactRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.BotService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * The WhatsApp bot's door into the console. {@code /api/bot/inbound} takes no JWT: the bot gateway proves itself with the
 * shared secret in the {@code X-Vaarta-Bot-Key} header (property {@code vaarta.bot-key}, env {@code VAARTA_BOT_KEY}).
 */
@RestController
@RequestMapping("/api/bot")
public class BotController {
    public static final String DEV_KEY = "vaarta-dev-bot-key";

    private final BotService bot;
    private final BotContactRepo contacts;
    private final ReferenceData ref;
    private final AuditService audit;
    private final byte[] key;

    public BotController(BotService bot, BotContactRepo contacts, ReferenceData ref, AuditService audit,
                         @Value("${vaarta.bot-key:${VAARTA_BOT_KEY:" + DEV_KEY + "}}") String key) {
        this.bot = bot; this.contacts = contacts; this.ref = ref; this.audit = audit;
        this.key = key.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/inbound")
    public ResponseEntity<?> inbound(@RequestHeader(value = "X-Vaarta-Bot-Key", required = false) String given, @RequestBody BotService.Inbound msg) {
        if (given == null || given.isBlank())
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "The bot key is missing."));
        if (!MessageDigest.isEqual(key, given.getBytes(StandardCharsets.UTF_8)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", "The bot key is wrong."));
        return ResponseEntity.ok(bot.handle(msg));
    }

    /** Numbers registered as District Information Offices. Commissioner only. */
    @GetMapping("/contacts")
    public List<BotContact> contacts(@AuthenticationPrincipal CurrentUser u) {
        u.requireRole(Role.COMMISSIONER);
        return contacts.findAll().stream().sorted(Comparator.comparing((BotContact c) -> c.district)).toList();
    }

    public record ContactReq(@NotBlank String phone, @NotBlank String district, String name, String username, Boolean active) {}

    /** Register or update a DIO number. Commissioner only. */
    @PostMapping("/contacts")
    public BotContact save(@AuthenticationPrincipal CurrentUser u, @RequestBody @Valid ContactReq r) {
        u.requireRole(Role.COMMISSIONER);
        String phone = BotService.normalisePhone(r.phone());
        if (phone == null) throw new IllegalArgumentException("Enter a valid phone number");
        if (!ref.isDistrict(r.district())) throw new IllegalArgumentException("Unknown district " + r.district());
        BotContact c = contacts.findById(phone).orElseGet(BotContact::new);
        c.phone = phone; c.district = r.district();
        c.name = r.name() == null || r.name().isBlank() ? "DIO, " + r.district() : r.name().trim();
        c.username = r.username() == null || r.username().isBlank() ? null : r.username().trim();
        c.active = r.active() == null || r.active();
        audit.record(u, "bot.contact", BotService.mask(phone) + " · " + c.district + (c.active ? "" : " · inactive"));
        return contacts.save(c);
    }
}
