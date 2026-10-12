package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.domain.Vendor;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.AppUserRepo;
import gov.dipr.vaarta.repo.VendorRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.UserAdminService;
import gov.dipr.vaarta.service.UserAdminService.UserInput;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Users & access: Commissioner-only user administration. */
@RestController
@RequestMapping("/api/users")
public class UsersController {
    private final AppUserRepo users;
    private final VendorRepo vendors;
    private final ReferenceData ref;
    private final UserAdminService admin;

    public UsersController(AppUserRepo users, VendorRepo vendors, ReferenceData ref, UserAdminService admin) {
        this.users = users; this.vendors = vendors; this.ref = ref; this.admin = admin;
    }

    public record AdminUserDto(long id, String username, String displayName, String role, String roleTitle, String icon, String color,
                               String scope, String district, String department, String vendorId, boolean active, boolean locked,
                               Instant lockedUntil, Instant lastSignInAt, Instant createdAt, boolean mustChangePassword, boolean self) {
        static AdminUserDto of(AppUser u, CurrentUser cu) {
            Role r = u.getRole();
            return new AdminUserDto(u.getId(), u.getUsername(), u.getDisplayName(), r.name(), r.title, r.icon, r.color, u.getScopeLabel(),
                    u.getDistrict(), u.getDepartment(), u.getVendorId(), u.isActive(), u.isLocked(Instant.now()), u.getLockedUntil(),
                    u.getLastSignInAt(), u.getCreatedAt(), u.isMustChangePassword(), u.getUsername().equalsIgnoreCase(cu.username()));
        }
    }

    @GetMapping
    public List<AdminUserDto> list(@AuthenticationPrincipal CurrentUser cu) {
        cu.require("users");
        return users.findAll(Sort.by("username")).stream().map(u -> AdminUserDto.of(u, cu)).toList();
    }

    public record RoleOption(String role, String title, String scopeNeeded, String defaultScope) {}
    public record VendorOption(String id, String name) {}

    /** Choices for the user form: roles with the scope each needs, and the valid districts, departments and vendors. */
    @GetMapping("/options")
    public Map<String, Object> options(@AuthenticationPrincipal CurrentUser cu) {
        cu.require("users");
        List<RoleOption> roles = Arrays.stream(Role.values())
                .map(r -> new RoleOption(r.name(), r.title, UserAdminService.scopeNeed(r), r.defaultScope)).toList();
        List<VendorOption> vs = vendors.findAll().stream().sorted(Comparator.comparing((Vendor v) -> v.id))
                .map(v -> new VendorOption(v.id, v.name)).toList();
        return Map.of("roles", roles, "districts", ref.districts().stream().sorted().toList(), "departments", admin.departments(),
                "vendors", vs, "minPassword", UserAdminService.MIN_PASSWORD);
    }

    @PostMapping
    public AdminUserDto create(@AuthenticationPrincipal CurrentUser cu, @RequestBody UserInput in) {
        cu.require("users");
        return AdminUserDto.of(admin.create(cu, in), cu);
    }

    @PostMapping("/{id}")
    public AdminUserDto update(@AuthenticationPrincipal CurrentUser cu, @PathVariable long id, @RequestBody UserInput in) {
        cu.require("users");
        return AdminUserDto.of(admin.update(cu, id, in), cu);
    }

    public record ActiveRequest(boolean active) {}

    @PostMapping("/{id}/active")
    public AdminUserDto active(@AuthenticationPrincipal CurrentUser cu, @PathVariable long id, @RequestBody ActiveRequest req) {
        cu.require("users");
        return AdminUserDto.of(admin.setActive(cu, id, req.active()), cu);
    }

    @PostMapping("/{id}/reset-password")
    public Map<String, String> resetPassword(@AuthenticationPrincipal CurrentUser cu, @PathVariable long id) {
        cu.require("users");
        return Map.of("temporaryPassword", admin.resetPassword(cu, id));
    }

    @PostMapping("/{id}/unlock")
    public AdminUserDto unlock(@AuthenticationPrincipal CurrentUser cu, @PathVariable long id) {
        cu.require("users");
        return AdminUserDto.of(admin.unlock(cu, id), cu);
    }
}
