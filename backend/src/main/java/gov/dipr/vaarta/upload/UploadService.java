package gov.dipr.vaarta.upload;

import gov.dipr.vaarta.domain.*;
import gov.dipr.vaarta.reference.DatasetDef;
import gov.dipr.vaarta.reference.FieldDef;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.repo.*;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.RecordMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Excel/CSV upload: the expected format, validation row by row, and import (append or replace). */
@Service
public class UploadService {
    private static final String COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private record Pending(String owner, String dataset, String fileName, List<Map<String, Object>> good, int skipped, Instant expires) {}

    private final ReferenceData ref;
    private final SpendOrderRepo spend;
    private final BudgetLineRepo budget;
    private final RegisterRecordRepo records;
    private final UploadBatchRepo batches;
    private final RecordMapper mapper;
    private final AuditService audit;
    private final FieldCoercer coercer;
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();

    public UploadService(ReferenceData ref, SpendOrderRepo spend, BudgetLineRepo budget, RegisterRecordRepo records,
                         UploadBatchRepo batches, RecordMapper mapper, AuditService audit) {
        this.ref = ref; this.spend = spend; this.budget = budget; this.records = records; this.batches = batches;
        this.mapper = mapper; this.audit = audit;
        this.coercer = new FieldCoercer(ref.districts(), ref.taluks());
    }

    /**
     * Datasets this user may upload: the registers of modules they can open; vendors upload nothing.
     * The budget is a state-level table with no district, so district-pinned users cannot upload it.
     */
    public List<DatasetDef> available(CurrentUser u) {
        if (u.vendorId() != null || !u.can("upload")) return List.of();
        return ref.datasets().stream().filter(d -> u.can(d.module()))
                .filter(d -> !(d.id().equals("budget") && u.district() != null)).toList();
    }

    public DatasetDef require(CurrentUser u, String id) {
        return available(u).stream().filter(d -> d.id().equals(id)).findFirst()
                .orElseThrow(() -> new CurrentUser.AccessDeniedException("Your login cannot upload " + id + "."));
    }

    /** Records of this dataset the user can see (the count shown in the register list). */
    public long count(CurrentUser u, DatasetDef d) {
        return switch (d.id()) {
            case "spend" -> spend.countScoped(u.district(), u.department());
            case "budget" -> budget.countScoped(u.department());
            default -> records.countScoped(d.id(), scopedDistrict(u, d), u.department());
        };
    }

    /** Records a replace-mode import by this user would remove (DIO: own district only, also on geo-all registers). */
    public long replaceCount(CurrentUser u, DatasetDef d) {
        return switch (d.id()) {
            case "spend" -> spend.countScoped(u.district(), u.department());
            case "budget" -> budget.countScoped(u.department());
            default -> records.countScoped(d.id(), u.district(), u.department());
        };
    }

    /** Geo-all registers (campaigns, film, publications, grants) are not district-filtered, as in the prototype. */
    private String scopedDistrict(CurrentUser u, DatasetDef d) {
        boolean geoAll = ref.register(d.id()).map(RegisterDef::geoAll).orElse(false);
        return geoAll ? null : u.district();
    }

    /** Up to three of the user's own rows, used as examples in the format preview and the template. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> sample(CurrentUser u, DatasetDef d) {
        return switch (d.id()) {
            case "spend" -> spend.findScoped(u.district(), u.department(), null).stream().filter(SpendOrder::counts).limit(3).map(mapper::fromSpend).toList();
            case "budget" -> budget.findScoped(u.department()).stream().limit(3).map(b -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("fy", b.fy); m.put("department", b.department); m.put("channel", b.channel); m.put("budget", b.budget);
                return m;
            }).toList();
            default -> records.findScoped(d.id(), u.district(), u.department(), null).stream().limit(3).map(mapper::fromRecord).toList();
        };
    }

    public static String typeLabel(FieldDef f) {
        return switch (f.t()) {
            case "id" -> "Text (unique ID)"; case "code" -> "Text (code)"; case "text" -> "Text"; case "num" -> "Number";
            case "money" -> "Number, in ₹ lakh"; case "inr" -> "Number, in ₹"; case "date" -> "Date"; case "month" -> "Month";
            case "fy" -> "Financial year"; case "enum" -> "One of a list"; case "district" -> "District name"; case "taluk" -> "Taluk name"; case "yn" -> "Yes or No";
            default -> f.t();
        };
    }

    public static String allowed(FieldDef f) {
        return switch (f.t()) {
            case "enum" -> String.join(" · ", f.e());
            case "district" -> "Any of the 31 districts" + (f.statewideAllowed() ? ", or Statewide" : "");
            case "taluk" -> "A taluk of the row's district; empty for Statewide rows";
            case "date" -> "DD-MM-YYYY, or an Excel date";
            case "month" -> "Mmm-YYYY, for example Apr-2026";
            case "fy" -> "YYYY-YY, for example 2026-27";
            case "yn" -> "Yes · No";
            case "num", "money", "inr" -> "Digits only, no commas or ₹ sign";
            case "id" -> "Must be unique in the file";
            case "code" -> "Code as used in DIPR records; can repeat";
            default -> "Free text";
        };
    }

    /** A value as it should be typed in Excel (dates DD-MM-YYYY, months Mmm-YYYY). */
    public static String exampleValue(FieldDef f, Map<String, Object> row) {
        Object v = row == null ? null : row.get(f.k());
        if (v == null || "".equals(v)) v = f.ex() == null ? "" : f.ex();
        String s = v instanceof Double d && d == Math.rint(d) ? String.valueOf(d.longValue()) : v.toString();
        if (f.t().equals("date") && s.matches("\\d{4}-\\d{2}-\\d{2}")) {
            String[] p = s.split("-");
            return p[2] + "-" + p[1] + "-" + p[0];
        }
        if (f.t().equals("month") && s.matches("\\d{4}-\\d{2}"))
            return FieldCoercer.MON.get(Integer.parseInt(s.substring(5)) - 1) + "-" + s.substring(0, 4);
        return s;
    }

    public byte[] template(CurrentUser u, DatasetDef d) throws IOException {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet data = wb.createSheet("Data");
            Row h = data.createRow(0);
            for (int i = 0; i < d.schema().size(); i++) {
                h.createCell(i).setCellValue(d.schema().get(i).h());
                data.setColumnWidth(i, 256 * Math.max(12, d.schema().get(i).h().length() + 3));
            }
            List<Map<String, Object>> ex = sample(u, d);
            for (int r = 0; r < ex.size(); r++) {
                Row row = data.createRow(r + 1);
                for (int i = 0; i < d.schema().size(); i++) row.createCell(i).setCellValue(exampleValue(d.schema().get(i), ex.get(r)));
            }
            List<FieldDef> lists = d.schema().stream().filter(f -> f.t().equals("enum") || f.t().equals("district")).toList();
            Sheet al = wb.createSheet("Allowed values");
            Row ah = al.createRow(0);
            for (int i = 0; i < lists.size(); i++) ah.createCell(i).setCellValue(lists.get(i).h());
            for (int i = 0; i < lists.size(); i++) {
                FieldDef f = lists.get(i);
                List<String> vals = new ArrayList<>();
                if (f.t().equals("enum")) vals.addAll(f.e());
                else {
                    if (f.statewideAllowed()) vals.add("Statewide");
                    vals.addAll(ref.districts());
                }
                for (int r = 0; r < vals.size(); r++) {
                    Row row = al.getRow(r + 1) == null ? al.createRow(r + 1) : al.getRow(r + 1);
                    row.createCell(i).setCellValue(vals.get(r));
                }
            }
            Sheet ins = wb.createSheet("Instructions");
            String[] hd = {"Column", "Heading", "Type", "Required", "Format or allowed values"};
            Row ih = ins.createRow(0);
            for (int i = 0; i < hd.length; i++) ih.createCell(i).setCellValue(hd[i]);
            for (int i = 0; i < d.schema().size(); i++) {
                FieldDef f = d.schema().get(i);
                Row row = ins.createRow(i + 1);
                row.createCell(0).setCellValue(String.valueOf(COLS.charAt(i)));
                row.createCell(1).setCellValue(f.h());
                row.createCell(2).setCellValue(typeLabel(f));
                row.createCell(3).setCellValue(f.req() ? "Required" : "Optional");
                row.createCell(4).setCellValue(allowed(f));
            }
            wb.write(out);
            return out.toByteArray();
        }
    }

    public record RowError(int row, String col, String val, String msg) {}

    public Map<String, Object> validate(CurrentUser u, DatasetDef d, MultipartFile file) throws IOException {
        if (file.getSize() > 10L * 1024 * 1024) throw new IllegalArgumentException("The file is larger than 10 MB. Split it and upload in parts.");
        SheetReader.Sheet sheet = SheetReader.read(file.getOriginalFilename(), file.getInputStream());
        List<List<Object>> aoa = sheet.rows();
        List<String> hdr = aoa.isEmpty() ? List.of() : aoa.get(0).stream().map(o -> o == null ? "" : o.toString().trim()).toList();
        Map<String, Integer> map = new HashMap<>();
        for (FieldDef f : d.schema())
            for (int i = 0; i < hdr.size(); i++) if (norm(hdr.get(i)).equals(norm(f.h()))) { map.put(f.k(), i); break; }
        List<String> missing = d.schema().stream().filter(f -> f.req() && !map.containsKey(f.k())).map(FieldDef::h).toList();
        Set<Integer> used = new HashSet<>(map.values());
        List<String> extra = new ArrayList<>();
        for (int i = 0; i < hdr.size(); i++) if (!hdr.get(i).isEmpty() && !used.contains(i)) extra.add(hdr.get(i));

        List<RowError> errors = new ArrayList<>();
        List<Map<String, Object>> good = new ArrayList<>();
        int total = 0, badRows = 0;
        FieldDef idF = d.schema().stream().filter(f -> f.t().equals("id")).findFirst().orElse(null);
        Set<Object> seen = new HashSet<>();
        for (int i = 1; i < aoa.size(); i++) {
            List<Object> row = aoa.get(i);
            if (row.stream().allMatch(v -> v == null || "".equals(v))) continue;
            total++;
            if (!missing.isEmpty()) continue;
            Map<String, Object> o = new LinkedHashMap<>();
            boolean bad = false;
            for (FieldDef f : d.schema()) {
                Integer idx = map.get(f.k());
                Object raw = idx == null || idx >= row.size() ? "" : row.get(idx);
                FieldCoercer.Result r = coercer.coerce(f, raw, o);
                if (!r.ok()) {
                    bad = true;
                    errors.add(new RowError(i + 1, f.h(), raw == null ? "" : raw.toString(), r.message()));
                } else o.put(f.k(), r.value());
            }
            if (!bad && idF != null && !"".equals(o.get(idF.k()))) {
                if (!seen.add(o.get(idF.k()))) {
                    bad = true;
                    errors.add(new RowError(i + 1, idF.h(), String.valueOf(o.get(idF.k())), "Same ID appears earlier in the file"));
                }
            }
            if (!bad && u.district() != null && o.containsKey("district") && !u.district().equals(o.get("district"))) {
                bad = true;
                errors.add(new RowError(i + 1, "District", String.valueOf(o.get("district")), "Your login can only upload " + u.district() + " records"));
            }
            if (!bad && u.department() != null && o.containsKey("department") && !u.department().equals(o.get("department"))) {
                bad = true;
                errors.add(new RowError(i + 1, "Department", String.valueOf(o.get("department")), "Your login can only upload " + u.department() + " records"));
            }
            if (bad) badRows++; else good.add(o);
        }
        String id = UUID.randomUUID().toString();
        pending.entrySet().removeIf(e -> e.getValue().expires().isBefore(Instant.now()));
        if (!good.isEmpty()) pending.put(id, new Pending(u.username(), d.id(), file.getOriginalFilename(), good, badRows, Instant.now().plusSeconds(3600)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("uploadId", good.isEmpty() ? null : id);
        out.put("file", file.getOriginalFilename());
        out.put("sheet", sheet.name());
        out.put("missing", missing);
        out.put("extra", extra);
        out.put("errors", errors.size() > 500 ? errors.subList(0, 500) : errors);
        out.put("errorCount", errors.size());
        out.put("total", total);
        out.put("badRows", badRows);
        out.put("goodCount", good.size());
        out.put("preview", good.subList(0, Math.min(6, good.size())));
        out.put("existing", count(u, d));
        out.put("replaceCount", replaceCount(u, d));
        return out;
    }

    private static String norm(String s) { return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", ""); }

    @Transactional
    public UploadBatch importRows(CurrentUser u, String uploadId, String mode) {
        Pending p = pending.get(uploadId);
        if (p == null || !p.owner().equals(u.username())) throw new NoSuchElementException("This upload has expired. Choose the file again.");
        DatasetDef d = require(u, p.dataset());
        boolean replace = "replace".equals(mode);
        UploadBatch b = new UploadBatch();
        b.dataset = d.id(); b.datasetTitle = d.title(); b.fileName = p.fileName(); b.mode = replace ? "replace" : "append";
        b.rowsImported = p.good().size(); b.rowsSkipped = p.skipped(); b.uploadedBy = u.username(); b.uploadedByTitle = u.role().title;
        b.uploadedAt = Instant.now();
        batches.save(b);
        switch (d.id()) {
            case "spend" -> {
                if (replace) spend.deleteScoped(u.district(), u.department());
                // An append never duplicates a release order: rows whose RO number is already stored are skipped.
                Set<String> existing = new HashSet<>(spend.allRoNumbers());
                List<SpendOrder> rows = p.good().stream().map(mapper::toSpend).filter(r -> existing.add(r.roNo)).toList();
                int dupes = p.good().size() - rows.size();
                b.rowsImported = rows.size(); b.rowsSkipped = p.skipped() + dupes;
                rows.forEach(r -> r.uploadId = b.id);
                spend.saveAll(rows);
            }
            case "budget" -> {
                if (replace) budget.deleteScoped(u.department());
                List<BudgetLine> rows = p.good().stream().map(mapper::toBudget).toList();
                rows.forEach(r -> r.uploadId = b.id);
                budget.saveAll(rows);
            }
            default -> {
                RegisterDef reg = ref.register(d.id()).orElseThrow();
                if (replace) records.deleteScoped(reg.id(), u.district(), u.department());
                records.saveAll(p.good().stream().map(r -> mapper.toRecord(reg.id(), r, b.id)).toList());
            }
        }
        pending.remove(uploadId);
        audit.record(u, "upload." + b.mode, d.id() + " " + b.fileName + " rows=" + b.rowsImported);
        return b;
    }
}
