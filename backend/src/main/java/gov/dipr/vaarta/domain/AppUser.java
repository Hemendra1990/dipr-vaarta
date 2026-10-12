package gov.dipr.vaarta.domain;

import gov.dipr.vaarta.security.Role;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "app_user")
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(unique = true, nullable = false, length = 80)
    private String username;
    @Column(nullable = false)
    private String passwordHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 30)
    private Role role;
    private String displayName;
    private String scopeLabel;
    /** Set for district-scoped users (DIO). */
    private String district;
    /** Set for department-scoped users (nodal officers). */
    private String department;
    /** Set for vendor logins. */
    private String vendorId;
    private boolean active = true;
    /** Sign-in hardening: wrong passwords in a row, and when a lock (if any) ends. Nullable so existing rows migrate. */
    private Integer failedLogins;
    private Instant lockedUntil;
    private Instant lastSignInAt;
    private Instant createdAt;
    private Instant passwordChangedAt;
    /** Set when an administrator issued the password; the user is asked to choose their own after signing in. */
    private Boolean mustChangePassword;

    protected AppUser() {}

    public AppUser(String username, String passwordHash, Role role, String displayName, String scopeLabel,
                   String district, String department, String vendorId) {
        this.username = username; this.passwordHash = passwordHash; this.role = role; this.displayName = displayName;
        this.scopeLabel = scopeLabel; this.district = district; this.department = department; this.vendorId = vendorId;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public String getDisplayName() { return displayName; }
    public String getScopeLabel() { return scopeLabel; }
    public String getDistrict() { return district; }
    public String getDepartment() { return department; }
    public String getVendorId() { return vendorId; }
    public boolean isActive() { return active; }
    public int getFailedLogins() { return failedLogins == null ? 0 : failedLogins; }
    public Instant getLockedUntil() { return lockedUntil; }
    public Instant getLastSignInAt() { return lastSignInAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getPasswordChangedAt() { return passwordChangedAt; }
    public boolean isMustChangePassword() { return Boolean.TRUE.equals(mustChangePassword); }
    public boolean isLocked(Instant now) { return lockedUntil != null && lockedUntil.isAfter(now); }

    public void setPassword(String hash, boolean mustChange) {
        this.passwordHash = hash; this.mustChangePassword = mustChange; this.passwordChangedAt = Instant.now();
    }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public void setActive(boolean active) { this.active = active; }

    /** Role and its scope change together, so a user never holds a scope the role does not use. */
    public void setRoleAndScope(Role role, String scopeLabel, String district, String department, String vendorId) {
        this.role = role; this.scopeLabel = scopeLabel; this.district = district; this.department = department; this.vendorId = vendorId;
    }

    /** Counts a wrong password; returns true when this attempt locks the account. */
    public boolean recordFailedLogin(int maxAttempts, Instant lockUntil) {
        int n = getFailedLogins() + 1;
        if (n >= maxAttempts) {
            failedLogins = 0;
            lockedUntil = lockUntil;
            return true;
        }
        failedLogins = n;
        return false;
    }

    public void recordSignIn(Instant at) {
        failedLogins = 0; lockedUntil = null; lastSignInAt = at;
    }

    public void unlock() { failedLogins = 0; lockedUntil = null; }
}
