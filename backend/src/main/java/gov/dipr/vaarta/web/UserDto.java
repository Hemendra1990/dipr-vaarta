package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.security.Role;

import java.util.List;

public record UserDto(String username, String displayName, String role, String roleKey, String title, String titleKn,
                      String scope, String district, String department, String vendorId, List<String> modules,
                      String icon, String color) {
    public static UserDto of(AppUser u) {
        Role r = u.getRole();
        return new UserDto(u.getUsername(), u.getDisplayName(), r.name(), r.key, r.title, r.titleKn, u.getScopeLabel(),
                u.getDistrict(), u.getDepartment(), u.getVendorId(), r.modules, r.icon, r.color);
    }
}
