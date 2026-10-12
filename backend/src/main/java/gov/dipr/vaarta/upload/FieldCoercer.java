package gov.dipr.vaarta.upload;

import gov.dipr.vaarta.reference.FieldDef;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Turns one spreadsheet cell into a typed value, or explains what is wrong, using the prototype's rules. */
public final class FieldCoercer {
    public record Result(boolean ok, Object value, String message) {
        static Result ok(Object v) { return new Result(true, v, null); }
        static Result err(String m) { return new Result(false, null, m); }
    }

    static final List<String> MON = List.of("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec");
    private static final Pattern DMY = Pattern.compile("^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$");
    private static final Pattern YMD = Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})$");
    private static final Pattern D_MON_Y = Pattern.compile("^(\\d{1,2})[\\s-]([A-Za-z]{3})[a-z]*[\\s-](\\d{4})$");
    private static final Pattern MON_Y = Pattern.compile("^([A-Za-z]{3})[a-z]*[\\s-](\\d{4})$");
    private static final Pattern Y_M = Pattern.compile("^(\\d{4})-(\\d{1,2})$");
    private static final Pattern M_Y = Pattern.compile("^(\\d{1,2})[-/](\\d{4})$");
    private static final Pattern FY = Pattern.compile("^(20\\d\\d)\\s*-\\s*(\\d\\d)$");

    private final List<String> districts;
    private final Map<String, List<String>> taluks;

    public FieldCoercer(List<String> districts) { this(districts, Map.of()); }

    public FieldCoercer(List<String> districts, Map<String, List<String>> taluks) { this.districts = districts; this.taluks = taluks; }

    /**
     * Like {@link #coerce(FieldDef, Object)}, but a {@code taluk} cell is checked against the taluks of the row's district
     * (the district column must come earlier in the schema, as it does in every schema).
     */
    public Result coerce(FieldDef f, Object v, Map<String, Object> row) {
        if (!"taluk".equals(f.t()) || taluks.isEmpty()) return coerce(f, v);
        boolean empty = v == null || (v instanceof String s && s.trim().isEmpty());
        if (empty) return f.req() ? Result.err("Required value is empty") : Result.ok("");
        Object dist = row == null ? null : row.get("district");
        if (dist == null || "".equals(dist) || "Statewide".equals(dist)) return Result.err("Statewide rows have no taluk; leave it empty");
        String t = v.toString().trim();
        return taluks.getOrDefault(dist.toString(), List.of()).stream().filter(x -> x.equalsIgnoreCase(t)).findFirst().<Result>map(Result::ok)
                .orElse(Result.err("Not a taluk of " + dist));
    }

    public Result coerce(FieldDef f, Object v) {
        boolean empty = v == null || (v instanceof String s && s.trim().isEmpty());
        if (empty) return f.req() ? Result.err("Required value is empty") : Result.ok("");
        switch (f.t()) {
            case "num", "money", "inr" -> {
                if (v instanceof Number n) return Result.ok(clean(n.doubleValue()));
                try {
                    double x = Double.parseDouble(v.toString().replaceAll("[,₹\\s]", ""));
                    return Double.isFinite(x) ? Result.ok(clean(x)) : Result.err("Must be a number");
                } catch (NumberFormatException e) {
                    return Result.err("Must be a number");
                }
            }
            case "date" -> {
                LocalDate d = toDate(v);
                return d != null ? Result.ok(d.toString()) : Result.err("Not a date. Use DD-MM-YYYY");
            }
            case "month" -> {
                YearMonth m = toMonth(v);
                return m != null ? Result.ok(m.toString()) : Result.err("Not a month. Use Mmm-YYYY, like Apr-2026");
            }
            case "fy" -> {
                Matcher m = FY.matcher(v.toString().trim());
                if (m.matches() && Integer.parseInt(m.group(2)) == (Integer.parseInt(m.group(1)) + 1) % 100)
                    return Result.ok(m.group(1) + "-" + m.group(2));
                return Result.err("Use a financial year like 2026-27");
            }
            case "enum" -> {
                String t = v.toString().trim();
                return f.e().stream().filter(x -> x.equalsIgnoreCase(t)).findFirst().<Result>map(Result::ok)
                        .orElse(Result.err("Not in the allowed list"));
            }
            case "district" -> {
                String t = v.toString().trim();
                if (f.statewideAllowed() && t.equalsIgnoreCase("statewide")) return Result.ok("Statewide");
                return districts.stream().filter(d -> d.equalsIgnoreCase(t)).findFirst().<Result>map(Result::ok)
                        .orElse(Result.err("Unknown district name"));
            }
            case "yn" -> {
                String t = v.toString().trim().toLowerCase(Locale.ROOT);
                if (t.equals("yes") || t.equals("y")) return Result.ok("Yes");
                if (t.equals("no") || t.equals("n")) return Result.ok("No");
                return Result.err("Use Yes or No");
            }
            default -> {
                if (v instanceof LocalDate d) return Result.ok(d.toString());
                if (v instanceof Double d && d == Math.rint(d)) return Result.ok(String.valueOf(d.longValue()));
                return Result.ok(v.toString().trim());
            }
        }
    }

    private static Object clean(double d) {
        return d == Math.rint(d) && Math.abs(d) < 1e15 ? (Object) (long) d : (Object) d;
    }

    static LocalDate toDate(Object v) {
        if (v instanceof LocalDate d) return d;
        if (v instanceof Number n) {
            double x = n.doubleValue();
            if (x > 20000 && x < 80000) return LocalDate.of(1899, 12, 30).plusDays(Math.round(x));
            return null;
        }
        String s = v.toString().trim();
        Matcher m = DMY.matcher(s);
        if (m.matches()) return ok(i(m.group(3)), i(m.group(2)), i(m.group(1)));
        m = YMD.matcher(s);
        if (m.matches()) return ok(i(m.group(1)), i(m.group(2)), i(m.group(3)));
        m = D_MON_Y.matcher(s);
        if (m.matches()) {
            int mi = monthIndex(m.group(2));
            if (mi >= 0) return ok(i(m.group(3)), mi + 1, i(m.group(1)));
        }
        return null;
    }

    static YearMonth toMonth(Object v) {
        if (v instanceof LocalDate || v instanceof Number) {
            LocalDate d = toDate(v);
            return d == null ? null : YearMonth.from(d);
        }
        String s = v.toString().trim();
        Matcher m = MON_Y.matcher(s);
        if (m.matches()) {
            int mi = monthIndex(m.group(1));
            return mi >= 0 ? YearMonth.of(i(m.group(2)), mi + 1) : null;
        }
        m = Y_M.matcher(s);
        if (m.matches() && i(m.group(2)) >= 1 && i(m.group(2)) <= 12) return YearMonth.of(i(m.group(1)), i(m.group(2)));
        m = M_Y.matcher(s);
        if (m.matches() && i(m.group(1)) >= 1 && i(m.group(1)) <= 12) return YearMonth.of(i(m.group(2)), i(m.group(1)));
        LocalDate d = toDate(s);
        return d == null ? null : YearMonth.from(d);
    }

    private static int monthIndex(String s) {
        for (int k = 0; k < 12; k++) if (MON.get(k).equalsIgnoreCase(s)) return k;
        return -1;
    }

    private static int i(String s) { return Integer.parseInt(s); }

    private static LocalDate ok(int y, int mo, int d) {
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        try {
            return LocalDate.of(y, mo, d);
        } catch (Exception e) {
            return null;
        }
    }
}
