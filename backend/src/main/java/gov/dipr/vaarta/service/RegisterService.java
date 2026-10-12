package gov.dipr.vaarta.service;

import gov.dipr.vaarta.domain.RegisterRecord;
import gov.dipr.vaarta.reference.FieldDef;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.repo.RegisterRecordRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.upload.FieldCoercer;
import gov.dipr.vaarta.upload.UploadService;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;

/**
 * Record-level work on the generic registers: add, edit, move to the next stage, delete and export.
 * Every write checks the user's module, district and department scope on the server and is audited.
 */
@Service
public class RegisterService {
    /**
     * Stages that are an exception or an end state off the main path (a returned bill, a rejected film).
     * "Move to next stage" skips them; they can still be chosen by name or in the edit form.
     */
    static final Set<String> SIDE_STAGES = Set.of("Returned", "Rejected", "On hold", "Not needed", "Referred to Returning Officer",
            "Suspended", "Expired", "Idle", "UC overdue");

    /** A row that failed validation: one message per field key, shown next to the field. */
    public static class InvalidRow extends IllegalArgumentException {
        public final Map<String, String> errors;

        public InvalidRow(Map<String, String> errors) {
            super(errors.size() == 1 ? "One field needs fixing." : errors.size() + " fields need fixing.");
            this.errors = errors;
        }
    }

    private final ReferenceData ref;
    private final RegisterRecordRepo repo;
    private final RecordMapper mapper;
    private final AuditService audit;
    private final FieldCoercer coercer;

    public RegisterService(ReferenceData ref, RegisterRecordRepo repo, RecordMapper mapper, AuditService audit) {
        this.ref = ref; this.repo = repo; this.mapper = mapper; this.audit = audit;
        this.coercer = new FieldCoercer(ref.districts());
    }

    public RegisterDef def(String id) {
        return ref.register(id).orElseThrow(() -> new NoSuchElementException("No register " + id));
    }

    /** Rows within the user's scope. Geo-all registers (campaigns, film, publications, grants) are not district-filtered. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> rows(CurrentUser u, String id) {
        RegisterDef def = def(id);
        u.require(id);
        return visible(u, def).stream().map(mapper::fromRecord).toList();
    }

    private List<RegisterRecord> visible(CurrentUser u, RegisterDef def) {
        return repo.findScoped(def.id(), def.geoAll() ? null : u.district(), u.department(), u.vendorId());
    }

    private void requireWriter(CurrentUser u, RegisterDef def) {
        u.require(def.id());
        if (u.role() == Role.VENDOR || u.vendorId() != null)
            throw new CurrentUser.AccessDeniedException("Vendor logins can view registers but not change them.");
    }

    /** The record, if it exists and the user may change it (own district for district officers, own department for nodal officers). */
    private RegisterRecord writable(CurrentUser u, RegisterDef def, long rowId) {
        RegisterRecord r = repo.findById(rowId).filter(x -> x.registerId.equals(def.id()))
                .orElseThrow(() -> new NoSuchElementException("No such record in " + def.title() + "."));
        if (!u.districtOk(r.district))
            throw new CurrentUser.AccessDeniedException("Your login can only change " + u.district() + " records.");
        if (!u.scopeOk(r.department, r.vendorId))
            throw new CurrentUser.AccessDeniedException("Your login can only change " + u.department() + " records.");
        return r;
    }

    /** Validates every schema field with the upload rules and the user's scope; returns the cleaned row. */
    private Map<String, Object> validate(CurrentUser u, RegisterDef def, Map<String, Object> input, Long selfId) {
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, Object> out = new LinkedHashMap<>();
        for (FieldDef f : def.schema()) {
            Object raw = input == null ? null : input.get(f.k());
            FieldCoercer.Result r = coercer.coerce(f, raw);
            if (r.ok()) out.put(f.k(), r.value());
            else errors.put(f.k(), r.message());
        }
        Object dist = out.get("district");
        if (u.district() != null && !errors.containsKey("district")) {
            String d = dist == null || "".equals(dist) ? "Statewide" : dist.toString();
            if (!u.district().equals(d)) errors.put("district", "Your login covers only " + u.district() + " records");
        }
        if (u.department() != null && out.containsKey("department") && !errors.containsKey("department")
                && !u.department().equals(out.get("department")))
            errors.put("department", "Your login covers only " + u.department() + " records");
        FieldDef idF = idField(def);
        if (idF != null && !errors.containsKey(idF.k()) && !"".equals(out.get(idF.k()))) {
            String v = String.valueOf(out.get(idF.k()));
            boolean taken = repo.findScoped(def.id(), null, null, null).stream()
                    .filter(x -> !x.id.equals(selfId))
                    .anyMatch(x -> v.equalsIgnoreCase(String.valueOf(mapper.fromRecord(x).get(idF.k()))));
            if (taken) errors.put(idF.k(), "This ID is already in the register");
        }
        if (!errors.isEmpty()) throw new InvalidRow(errors);
        return out;
    }

    private static FieldDef idField(RegisterDef def) {
        return def.schema().stream().filter(f -> f.t().equals("id")).findFirst().orElse(null);
    }

    private static String label(RegisterDef def, Map<String, Object> row, Long id) {
        FieldDef idF = idField(def);
        Object v = idF == null ? row.get(def.schema().get(0).k()) : row.get(idF.k());
        return def.id() + " " + (v == null || "".equals(v) ? "#" + id : v);
    }

    @Transactional
    public Map<String, Object> create(CurrentUser u, String id, Map<String, Object> input) {
        RegisterDef def = def(id);
        requireWriter(u, def);
        Map<String, Object> row = validate(u, def, input, null);
        RegisterRecord saved = repo.save(mapper.toRecord(def.id(), row, null));
        audit.record(u, "register.create", label(def, row, saved.id));
        return mapper.fromRecord(saved);
    }

    @Transactional
    public Map<String, Object> update(CurrentUser u, String id, long rowId, Map<String, Object> input) {
        RegisterDef def = def(id);
        requireWriter(u, def);
        RegisterRecord r = writable(u, def, rowId);
        Map<String, Object> clean = validate(u, def, input, r.id);
        Map<String, Object> old = mapper.fromRecord(r);
        Map<String, Object> merged = new LinkedHashMap<>(old);
        merged.putAll(clean);
        List<String> changed = def.schema().stream().map(FieldDef::k)
                .filter(k -> !Objects.equals(String.valueOf(old.get(k)), String.valueOf(clean.get(k)))).toList();
        save(r, def, merged);
        audit.record(u, "register.update", label(def, merged, r.id) + (changed.isEmpty() ? " (no change)" : " changed " + String.join(", ", changed)));
        return mapper.fromRecord(r);
    }

    /** Moves the record to the named stage, or to the next stage on the main path of the register's order. */
    @Transactional
    public Map<String, Object> advance(CurrentUser u, String id, long rowId, String to) {
        RegisterDef def = def(id);
        requireWriter(u, def);
        RegisterRecord r = writable(u, def, rowId);
        Map<String, Object> row = mapper.fromRecord(r);
        String cur = String.valueOf(row.get(def.status()));
        String target;
        if (to != null && !to.isBlank()) {
            target = def.order().stream().filter(s -> s.equalsIgnoreCase(to.trim())).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("\"" + to + "\" is not a stage of " + def.title() + "."));
        } else {
            target = nextStage(def, cur)
                    .orElseThrow(() -> new IllegalArgumentException("\"" + cur + "\" is the last stage. Choose a stage in the form instead."));
        }
        if (target.equals(cur)) throw new IllegalArgumentException("The record is already at \"" + cur + "\".");
        row.put(def.status(), target);
        save(r, def, row);
        audit.record(u, "register.advance", label(def, row, r.id) + " " + cur + " -> " + target);
        return mapper.fromRecord(r);
    }

    public static Optional<String> nextStage(RegisterDef def, String cur) {
        int i = def.order().indexOf(cur);
        if (i < 0 || SIDE_STAGES.contains(cur)) return Optional.empty();
        return def.order().stream().skip(i + 1L).filter(s -> !SIDE_STAGES.contains(s)).findFirst();
    }

    @Transactional
    public void delete(CurrentUser u, String id, long rowId) {
        RegisterDef def = def(id);
        u.require(def.id());
        u.requireRole(Role.COMMISSIONER);
        RegisterRecord r = writable(u, def, rowId);
        Map<String, Object> row = mapper.fromRecord(r);
        repo.delete(r);
        audit.record(u, "register.delete", label(def, row, r.id));
    }

    private void save(RegisterRecord r, RegisterDef def, Map<String, Object> row) {
        RegisterRecord fresh = mapper.toRecord(def.id(), row, r.uploadId);
        r.district = fresh.district; r.department = fresh.department; r.vendorId = fresh.vendorId; r.data = fresh.data;
        repo.save(r);
    }

    /** The rows the user can see, as an Excel sheet with the upload template's headings, so it can be edited and uploaded back. */
    @Transactional(readOnly = true)
    public byte[] export(CurrentUser u, String id) throws IOException {
        RegisterDef def = def(id);
        u.require(id);
        List<Map<String, Object>> rows = visible(u, def).stream().map(mapper::fromRecord).toList();
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet data = wb.createSheet("Data");
            Row h = data.createRow(0);
            List<FieldDef> schema = def.schema();
            for (int i = 0; i < schema.size(); i++) {
                h.createCell(i).setCellValue(schema.get(i).h());
                data.setColumnWidth(i, 256 * Math.max(12, schema.get(i).h().length() + 3));
            }
            for (int r = 0; r < rows.size(); r++) {
                Row row = data.createRow(r + 1);
                Map<String, Object> m = rows.get(r);
                for (int i = 0; i < schema.size(); i++) {
                    FieldDef f = schema.get(i);
                    Object v = m.get(f.k());
                    if (v == null || "".equals(v)) continue;
                    if (v instanceof Number n && List.of("num", "money", "inr").contains(f.t())) row.createCell(i).setCellValue(n.doubleValue());
                    else row.createCell(i).setCellValue(UploadService.exampleValue(f, m));
                }
            }
            data.createFreezePane(0, 1);
            wb.write(out);
            return out.toByteArray();
        }
    }
}
