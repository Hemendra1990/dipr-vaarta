package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.UploadBatch;
import gov.dipr.vaarta.reference.DatasetDef;
import gov.dipr.vaarta.repo.UploadBatchRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.upload.UploadService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/uploads")
public class UploadController {
    private final UploadService uploads;
    private final UploadBatchRepo batches;

    public UploadController(UploadService uploads, UploadBatchRepo batches) { this.uploads = uploads; this.batches = batches; }

    @GetMapping("/datasets")
    public List<Map<String, Object>> datasets(@AuthenticationPrincipal CurrentUser u) {
        return uploads.available(u).stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.id()); m.put("title", d.title()); m.put("group", d.group()); m.put("module", d.module());
            m.put("schema", d.schema().stream().map(f -> {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("k", f.k()); x.put("h", f.h()); x.put("t", f.t()); x.put("req", f.req());
                x.put("typeLabel", UploadService.typeLabel(f)); x.put("allowed", UploadService.allowed(f));
                return x;
            }).toList());
            m.put("count", uploads.count(d));
            m.put("sample", uploads.sample(u, d).stream().map(r -> d.schema().stream().map(f -> UploadService.exampleValue(f, r)).toList()).toList());
            return m;
        }).toList();
    }

    @GetMapping("/{dataset}/template")
    public ResponseEntity<byte[]> template(@AuthenticationPrincipal CurrentUser u, @PathVariable String dataset) throws IOException {
        DatasetDef d = uploads.require(u, dataset);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"Vaarta360_" + d.id() + "_template.xlsx\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(uploads.template(u, d));
    }

    @PostMapping("/{dataset}/validate")
    public Map<String, Object> validate(@AuthenticationPrincipal CurrentUser u, @PathVariable String dataset,
                                        @RequestParam("file") MultipartFile file) throws IOException {
        return uploads.validate(u, uploads.require(u, dataset), file);
    }

    public record ImportRequest(String mode) {}

    @PostMapping("/{uploadId}/import")
    public UploadBatch importRows(@AuthenticationPrincipal CurrentUser u, @PathVariable String uploadId, @RequestBody ImportRequest req) {
        return uploads.importRows(u, uploadId, req.mode());
    }

    @GetMapping("/history")
    public List<UploadBatch> history(@AuthenticationPrincipal CurrentUser u) {
        var allowed = uploads.available(u).stream().map(DatasetDef::id).toList();
        return batches.findTop50ByOrderByUploadedAtDesc().stream().filter(b -> allowed.contains(b.dataset)).toList();
    }
}
