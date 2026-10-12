package gov.dipr.vaarta.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.LocalDate;
import java.util.List;

@ConfigurationProperties(prefix = "vaarta")
public record VaartaProperties(String asOfDate, String jwtSecret, int jwtTtlMinutes, boolean seedSampleData,
                               String demoPassword, List<String> corsOrigins) {

    /** The date dashboards treat as today: a fixed date for the sample data, or the real date when set to "today". */
    public LocalDate asOf() {
        return asOfDate == null || asOfDate.isBlank() || asOfDate.equalsIgnoreCase("today")
                ? LocalDate.now() : LocalDate.parse(asOfDate);
    }
}
