package gov.dipr.vaarta.domain;

import gov.dipr.vaarta.security.Role;
import jakarta.persistence.*;

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

    protected AppUser() {}

    public AppUser(String username, String passwordHash, Role role, String displayName, String scopeLabel,
                   String district, String department, String vendorId) {
        this.username = username; this.passwordHash = passwordHash; this.role = role; this.displayName = displayName;
        this.scopeLabel = scopeLabel; this.district = district; this.department = department; this.vendorId = vendorId;
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
}
