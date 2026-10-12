package gov.dipr.vaarta.security;

import gov.dipr.vaarta.domain.AppUser;

/** The signed-in user and their scope, as carried in the JWT and checked on every request. */
public record CurrentUser(String username, Role role, String displayName, String district, String department, String vendorId) {

    public static CurrentUser of(AppUser u) {
        return new CurrentUser(u.getUsername(), u.getRole(), u.getDisplayName(), u.getDistrict(), u.getDepartment(), u.getVendorId());
    }

    public boolean can(String module) { return role.can(module); }

    public void require(String module) {
        if (!can(module)) throw new AccessDeniedException("Your login cannot open " + module + ".");
    }

    public void requireAny(String... modules) {
        for (String m : modules) if (can(m)) return;
        throw new AccessDeniedException("Your login cannot do this.");
    }

    public void requireRole(Role... roles) {
        for (Role r : roles) if (r == role) return;
        throw new AccessDeniedException("Only " + java.util.Arrays.stream(roles).map(r -> r.title).toList() + " can do this.");
    }

    /** Prototype scopeOk: a record carrying a department/vendor field must match the user's department/vendor. */
    public boolean scopeOk(String recordDepartment, String recordVendorId) {
        if (department != null && recordDepartment != null && !department.equals(recordDepartment)) return false;
        if (vendorId != null && recordVendorId != null && !vendorId.equals(recordVendorId)) return false;
        return true;
    }

    /** District-pinned users only see records of their district; statewide records are hidden. */
    public boolean districtOk(String recordDistrict) {
        return district == null || district.equals(recordDistrict);
    }

    public static class AccessDeniedException extends RuntimeException {
        public AccessDeniedException(String m) { super(m); }
    }
}
