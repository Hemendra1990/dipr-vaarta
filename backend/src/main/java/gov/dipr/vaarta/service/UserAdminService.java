package gov.dipr.vaarta.service;

import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.AppUserRepo;
import gov.dipr.vaarta.repo.VendorRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;

/** User administration (Commissioner only) and the password rules every user follows. */
@Service
public class UserAdminService {
    public static final int MIN_PASSWORD = 8;
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9][a-z0-9._-]{2,39}$");
    private static final String TEMP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    private static final SecureRandom RNG = new SecureRandom();

    private final AppUserRepo users;
    private final VendorRepo vendors;
    private final ReferenceData ref;
    private final PasswordEncoder encoder;
    private final AuditService audit;

    public UserAdminService(AppUserRepo users, VendorRepo vendors, ReferenceData ref, PasswordEncoder encoder, AuditService audit) {
        this.users = users; this.vendors = vendors; this.ref = ref; this.encoder = encoder; this.audit = audit;
    }

    /** Which scope field a role must carry: district, department, vendor, or none. */
    public static String scopeNeed(Role r) {
        return switch (r) {
            case DIO -> "district";
            case DEPT_NODAL -> "department";
            case VENDOR -> "vendor";
            default -> null;
        };
    }

    /** Minimum 8 characters with at least one digit; throws a 400 with a plain message otherwise. */
    public static void checkPolicy(String pw) {
        if (pw == null || pw.length() < MIN_PASSWORD || pw.chars().noneMatch(Character::isDigit))
            throw new IllegalArgumentException("The password must be at least " + MIN_PASSWORD + " characters and include a digit.");
        if (pw.length() > 128) throw new IllegalArgumentException("The password is too long (128 characters at most).");
    }

    public List<String> departments() {
        List<String> out = new ArrayList<>();
        ref.reference().path("departments").forEach(n -> out.add(n.asText()));
        return out;
    }

    public record Scope(String label, String district, String department, String vendorId) {}

    /** Checks the scope against reference data and builds the scope label shown on the sign-in tile and top bar. */
    public Scope scopeFor(Role role, String district, String department, String vendorId) {
        String need = scopeNeed(role);
        if ("district".equals(need)) {
            String d = trim(district);
            if (d == null || !ref.isDistrict(d)) throw new IllegalArgumentException("Choose one of the 31 districts for a District Information Officer.");
            return new Scope(d + " district only", d, null, null);
        }
        if ("department".equals(need)) {
            String d = trim(department);
            if (d == null || !departments().contains(d)) throw new IllegalArgumentException("Choose a department from the list for a nodal officer.");
            return new Scope(d + " campaigns", null, d, null);
        }
        if ("vendor".equals(need)) {
            String v = trim(vendorId);
            if (v == null) throw new IllegalArgumentException("Enter the vendor code for a vendor login.");
            v = v.toUpperCase();
            if (vendors.count() > 0 ? !vendors.existsById(v) : !v.matches("^[A-Z]{2}-[A-Z0-9]{2,8}$"))
                throw new IllegalArgumentException("Vendor code " + v + " is not in the empanelled vendor list.");
            return new Scope(v + " · own orders and bills", null, null, v);
        }
        return new Scope(role.defaultScope, null, null, null);
    }

    public record UserInput(String username, String displayName, String role, String district, String department, String vendorId, String password) {}

    @Transactional
    public AppUser create(CurrentUser cu, UserInput in) {
        String un = trim(in.username());
        if (un != null) un = un.toLowerCase();
        if (un == null || !USERNAME.matcher(un).matches())
            throw new IllegalArgumentException("User ID: 3 to 40 characters, lower-case letters, digits, dot, dash or underscore.");
        if (users.findByUsernameIgnoreCase(un).isPresent()) throw new IllegalArgumentException("User ID " + un + " is already taken.");
        Role role = role(in.role());
        String name = name(in.displayName());
        checkPolicy(in.password());
        Scope s = scopeFor(role, in.district(), in.department(), in.vendorId());
        AppUser u = new AppUser(un, encoder.encode(in.password()), role, name, s.label(), s.district(), s.department(), s.vendorId());
        u.setPassword(u.getPasswordHash(), true);
        users.save(u);
        audit.record(cu, "user.create", un + " · " + role.title + " · " + s.label());
        return u;
    }

    @Transactional
    public AppUser update(CurrentUser cu, long id, UserInput in) {
        AppUser u = find(id);
        Role role = in.role() == null ? u.getRole() : role(in.role());
        if (isSelf(cu, u) && role != u.getRole()) throw new IllegalArgumentException("You cannot change your own role.");
        String name = in.displayName() == null ? u.getDisplayName() : name(in.displayName());
        Scope s = scopeFor(role, in.district(), in.department(), in.vendorId());
        String before = u.getRole().title + " · " + u.getScopeLabel();
        u.setDisplayName(name);
        u.setRoleAndScope(role, s.label(), s.district(), s.department(), s.vendorId());
        audit.record(cu, "user.update", u.getUsername() + ": " + before + " → " + role.title + " · " + s.label());
        return u;
    }

    @Transactional
    public AppUser setActive(CurrentUser cu, long id, boolean active) {
        AppUser u = find(id);
        if (isSelf(cu, u) && !active) throw new IllegalArgumentException("You cannot deactivate your own login.");
        if (u.isActive() == active) return u;
        u.setActive(active);
        if (active) u.unlock();
        audit.record(cu, active ? "user.reactivate" : "user.deactivate", u.getUsername());
        return u;
    }

    /** Issues a one-time temporary password (shown once, never stored in clear) and clears any lock. */
    @Transactional
    public String resetPassword(CurrentUser cu, long id) {
        AppUser u = find(id);
        String temp = temporaryPassword();
        u.setPassword(encoder.encode(temp), true);
        u.unlock();
        audit.record(cu, "user.reset-password", u.getUsername());
        return temp;
    }

    @Transactional
    public AppUser unlock(CurrentUser cu, long id) {
        AppUser u = find(id);
        u.unlock();
        audit.record(cu, "user.unlock", u.getUsername());
        return u;
    }

    @Transactional
    public void changeOwnPassword(CurrentUser cu, String current, String next) {
        AppUser u = users.findByUsernameIgnoreCase(cu.username()).orElseThrow();
        if (current == null || !encoder.matches(current, u.getPasswordHash())) throw new IllegalArgumentException("The current password is wrong.");
        checkPolicy(next);
        if (encoder.matches(next, u.getPasswordHash())) throw new IllegalArgumentException("Choose a password different from the current one.");
        u.setPassword(encoder.encode(next), false);
        audit.record(cu, "password.change", u.getUsername());
    }

    static String temporaryPassword() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 6; i++) b.append(TEMP_CHARS.charAt(RNG.nextInt(TEMP_CHARS.length())));
        b.append('-');
        for (int i = 0; i < 4; i++) b.append(2 + RNG.nextInt(8));
        return b.toString();
    }

    private AppUser find(long id) {
        return users.findById(id).orElseThrow(() -> new NoSuchElementException("No such user."));
    }

    private static boolean isSelf(CurrentUser cu, AppUser u) { return u.getUsername().equalsIgnoreCase(cu.username()); }

    private static Role role(String r) {
        if (r == null) throw new IllegalArgumentException("Choose a role.");
        try {
            return Role.valueOf(r.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown role " + r + ".");
        }
    }

    private static String name(String n) {
        String s = trim(n);
        if (s == null) throw new IllegalArgumentException("Enter a display name.");
        if (s.length() > 80) throw new IllegalArgumentException("The display name is too long (80 characters at most).");
        return s;
    }

    private static String trim(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() ? null : s;
    }
}
