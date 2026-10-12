package gov.dipr.vaarta.reference;

import java.util.List;

/** A register module of the prototype (REGS): its schema and how its dashboard groups the rows. */
public record RegisterDef(String id, String group, String title, String sub, List<FieldDef> schema, String status,
                          List<String> order, String dim, String dimLabel, String sum, List<String> cols,
                          boolean geoAll, String wa, String banner) {
}
