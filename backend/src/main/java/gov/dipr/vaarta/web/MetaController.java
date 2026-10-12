package gov.dipr.vaarta.web;

import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.repo.UploadBatchRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.Calendar;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MetaController {
    private final ReferenceData ref;
    private final Calendar cal;
    private final UploadBatchRepo uploads;

    public MetaController(ReferenceData ref, Calendar cal, UploadBatchRepo uploads) {
        this.ref = ref; this.cal = cal; this.uploads = uploads;
    }

    @GetMapping("/health")
    public Map<String, String> health() { return Map.of("status", "ok"); }

    /** Geography, enumerations, FY calendar and the register definitions this user can open. */
    @GetMapping("/meta")
    public Map<String, Object> meta(@AuthenticationPrincipal CurrentUser u) {
        List<RegisterDef> regs = ref.registers().stream().filter(r -> u.can(r.id())).toList();
        Map<String, Object> sources = new HashMap<>();
        for (String ds : List.of("spend", "budget")) addSource(sources, ds);
        regs.forEach(r -> addSource(sources, r.id()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reference", ref.reference());
        out.put("calendar", cal.describe());
        out.put("registers", regs);
        out.put("sources", sources);
        return out;
    }

    private void addSource(Map<String, Object> sources, String ds) {
        uploads.findTopByDatasetOrderByUploadedAtDesc(ds).ifPresent(b -> sources.put(ds, Map.of("file", b.fileName, "when", b.uploadedAt.toString())));
    }
}
