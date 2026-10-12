package gov.dipr.vaarta.reference;

import java.util.List;

/** Something a user can upload from Excel: the two spend datasets or any register. {@code module} gates access. */
public record DatasetDef(String id, String title, String group, List<FieldDef> schema, String module) {
}
