package gov.dipr.vaarta.upload;

import org.apache.poi.ss.usermodel.*;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Reads the first sheet (or the sheet named "Data") of an Excel file, or a CSV file, as rows of cell values. */
public final class SheetReader {
    public record Sheet(String name, List<List<Object>> rows) {}

    private SheetReader() {}

    public static Sheet read(String fileName, InputStream in) throws IOException {
        String n = fileName == null ? "" : fileName.toLowerCase();
        if (n.endsWith(".csv")) return new Sheet("CSV", csv(new String(in.readAllBytes(), StandardCharsets.UTF_8)));
        if (!n.endsWith(".xlsx") && !n.endsWith(".xls")) throw new IllegalArgumentException("Use an .xlsx, .xls or .csv file.");
        try (Workbook wb = WorkbookFactory.create(in)) {
            org.apache.poi.ss.usermodel.Sheet sh = null;
            for (int i = 0; i < wb.getNumberOfSheets(); i++) if (wb.getSheetName(i).equalsIgnoreCase("data")) sh = wb.getSheetAt(i);
            if (sh == null) sh = wb.getSheetAt(0);
            FormulaEvaluator ev = wb.getCreationHelper().createFormulaEvaluator();
            List<List<Object>> out = new ArrayList<>();
            for (int r = 0; r <= sh.getLastRowNum(); r++) {
                Row row = sh.getRow(r);
                List<Object> vals = new ArrayList<>();
                if (row != null) for (int c = 0; c < row.getLastCellNum(); c++) vals.add(value(row.getCell(c), ev));
                out.add(vals);
            }
            return new Sheet(sh.getSheetName(), out);
        } catch (org.apache.poi.EmptyFileException | org.apache.poi.openxml4j.exceptions.NotOfficeXmlFileException e) {
            throw new IllegalArgumentException("The file could not be read as Excel.");
        }
    }

    private static Object value(Cell cell, FormulaEvaluator ev) {
        if (cell == null) return "";
        CellType t = cell.getCellType() == CellType.FORMULA ? ev.evaluateFormulaCell(cell) : cell.getCellType();
        return switch (t) {
            case NUMERIC -> DateUtil.isCellDateFormatted(cell) ? cell.getLocalDateTimeCellValue().toLocalDate() : (Object) cell.getNumericCellValue();
            case STRING -> cell.getStringCellValue();
            case BOOLEAN -> cell.getBooleanCellValue() ? "Yes" : "No";
            default -> "";
        };
    }

    static List<List<Object>> csv(String t) {
        if (!t.isEmpty() && t.charAt(0) == '﻿') t = t.substring(1);
        List<List<Object>> out = new ArrayList<>();
        List<Object> row = new ArrayList<>();
        StringBuilder f = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (q) {
                if (c == '"') {
                    if (i + 1 < t.length() && t.charAt(i + 1) == '"') { f.append('"'); i++; } else q = false;
                } else f.append(c);
            } else if (c == '"') q = true;
            else if (c == ',') { row.add(f.toString()); f.setLength(0); }
            else if (c == '\n') { row.add(f.toString()); out.add(row); row = new ArrayList<>(); f.setLength(0); }
            else if (c != '\r') f.append(c);
        }
        if (f.length() > 0 || !row.isEmpty()) { row.add(f.toString()); out.add(row); }
        return out;
    }
}
