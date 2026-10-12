package gov.dipr.vaarta.reference;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * One column of a register or dataset. Types: id, code, text, num, money (₹ lakh), inr (₹), date, month, fy,
 * enum (one of {@code e}), district (31 districts, plus Statewide when {@code sw}), yn.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldDef(String k, String h, String t, boolean req, List<String> e, Boolean sw, String ex) {
    public boolean statewideAllowed() { return Boolean.TRUE.equals(sw); }
}
