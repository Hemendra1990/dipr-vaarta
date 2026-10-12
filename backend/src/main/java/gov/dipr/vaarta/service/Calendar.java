package gov.dipr.vaarta.service;

import gov.dipr.vaarta.config.VaartaProperties;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Financial-year arithmetic relative to the as-of date (FY runs April to March). */
@Component
public class Calendar {
    private final VaartaProperties props;

    public Calendar(VaartaProperties props) { this.props = props; }

    public LocalDate asOf() { return props.asOf(); }

    public static String fyOf(YearMonth ym) {
        int s = ym.getMonthValue() >= 4 ? ym.getYear() : ym.getYear() - 1;
        return s + "-" + String.format("%02d", (s + 1) % 100);
    }

    public static String quarterOf(YearMonth ym) {
        return "Q" + (((ym.getMonthValue() + 8) % 12) / 3 + 1);
    }

    public String currentFy() { return fyOf(YearMonth.from(asOf())); }

    /** Last fully closed month, e.g. 2026-09 when the as-of date is in October 2026. */
    public YearMonth lastClosedMonth() { return YearMonth.from(asOf()).minusMonths(1); }

    /** Share of the current FY elapsed in closed months (Apr–Sep = 0.5). */
    public double elapsed() {
        int idx = (lastClosedMonth().getMonthValue() + 8) % 12 + 1;
        if (!fyOf(lastClosedMonth()).equals(currentFy())) idx = 0;
        return Math.max(1, idx) / 12.0;
    }

    public List<String> fys() {
        int start = Integer.parseInt(currentFy().substring(0, 4));
        List<String> out = new ArrayList<>();
        for (int y = start - 4; y <= start; y++) out.add(y + "-" + String.format("%02d", (y + 1) % 100));
        return out;
    }

    public Map<String, Object> describe() {
        return Map.of("asOf", asOf().toString(), "curFy", currentFy(), "lastYm", lastClosedMonth().toString(),
                "elapsed", elapsed(), "fys", fys());
    }
}
