package gov.dipr.vaarta.security;

import java.util.List;

/**
 * The sign-in roles of the prototype (PROLES). Modules are the navigation keys a role may open;
 * record scope (district, department, vendor) is set per user.
 */
public enum Role {
    COMMISSIONER("commissioner", "Commissioner, DIPR", "ಆಯುಕ್ತರು", "All of Karnataka · every wing", "commr.dipr", "CO", "var(--kumkum)",
            Modules.ALL),
    JD_NEWS("jd", "Joint Director, News & Media", "ಜಂಟಿ ನಿರ್ದೇಶಕರು (ಸುದ್ದಿ)", "Karnataka · news, media, outreach", "jd.news", "JD", "var(--indigo)",
            List.of("overview", "tipline", "media", "social", "crisis", "press", "welfare", "events", "election", "archive", "ai", "upload")),
    DD_ACCOUNTS("dd", "Deputy Director, Accounts & Advertisement", "ಉಪ ನಿರ್ದೇಶಕರು (ಲೆಕ್ಕ)", "Karnataka · spend, empanelment, bills", "dd.accounts", "DD", "var(--arishina)",
            List.of("spend", "campaigns", "empanel", "bills", "ads", "outdoor", "field", "grants", "admin", "rti", "ai", "upload")),
    DIO("dio", "District Information Officer", "ಜಿಲ್ಲಾ ವಾರ್ತಾಧಿಕಾರಿ", "Raichur district only", "dio.raichur", "DI", "var(--good)",
            List.of("overview", "tipline", "offices", "field", "outdoor", "events", "media", "crisis", "welfare", "campaigns", "spend", "rti", "upload")),
    DEPT_NODAL("dept", "Department Nodal Officer", "ಇಲಾಖಾ ನೋಡಲ್ ಅಧಿಕಾರಿ", "Health & Family Welfare campaigns", "nodal.health", "DN", "var(--ch5)",
            List.of("spend", "campaigns", "bills", "media")),
    VENDOR("vendor", "Empanelled Media / Vendor", "ಮಾಧ್ಯಮ ಸಂಸ್ಥೆ", "PR-K02 · own orders and bills", "vendor.prk02", "VN", "var(--ch6)",
            List.of("spend", "bills", "empanel")),
    FILM_SECTION("film", "Film & Academies Section", "ಚಲನಚಿತ್ರ ಶಾಖೆ", "Film, academies, publications, archive", "film.section", "FA", "var(--ch7)",
            List.of("film", "grants", "publications", "archive", "upload"));

    public final String key, title, titleKn, defaultScope, demoUser, icon, color;
    public final List<String> modules;

    Role(String key, String title, String titleKn, String defaultScope, String demoUser, String icon, String color, List<String> modules) {
        this.key = key; this.title = title; this.titleKn = titleKn; this.defaultScope = defaultScope;
        this.demoUser = demoUser; this.icon = icon; this.color = color; this.modules = modules;
    }

    public boolean can(String module) {
        return modules.contains(module);
    }

    public static final class Modules {
        public static final List<String> ALL = List.of("overview", "ai", "tipline", "media", "social", "crisis", "spend", "campaigns",
                "empanel", "bills", "ads", "press", "welfare", "events", "election", "offices", "field", "outdoor", "film",
                "publications", "archive", "grants", "admin", "rti", "upload", "users", "audit");
        private Modules() {}
    }
}
