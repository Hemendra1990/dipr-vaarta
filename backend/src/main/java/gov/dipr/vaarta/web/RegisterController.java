package gov.dipr.vaarta.web;

import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.RegisterService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The generic registers (campaigns, bills, RTI ...): read, add, edit, move to the next stage, delete (Commissioner)
 * and export to Excel. Rows carry their database id as {@code _id}.
 */
@RestController
@RequestMapping("/api/registers")
public class RegisterController {
    private final RegisterService registers;

    public RegisterController(RegisterService registers) { this.registers = registers; }

    @GetMapping("/{id}/rows")
    public List<Map<String, Object>> rows(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        return registers.rows(u, id);
    }

    @PostMapping("/{id}/rows")
    public Map<String, Object> create(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @RequestBody Map<String, Object> row) {
        return registers.create(u, id, row);
    }

    @PutMapping("/{id}/rows/{rowId}")
    public Map<String, Object> update(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @PathVariable long rowId,
                                      @RequestBody Map<String, Object> row) {
        return registers.update(u, id, rowId, row);
    }

    public record AdvanceRequest(String stage) {}

    @PostMapping("/{id}/rows/{rowId}/advance")
    public Map<String, Object> advance(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @PathVariable long rowId,
                                       @RequestBody(required = false) AdvanceRequest req) {
        return registers.advance(u, id, rowId, req == null ? null : req.stage());
    }

    @DeleteMapping("/{id}/rows/{rowId}")
    public Map<String, Object> delete(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @PathVariable long rowId) {
        registers.delete(u, id, rowId);
        return Map.of("deleted", rowId);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) throws IOException {
        RegisterDef def = registers.def(id);
        byte[] body = registers.export(u, id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"Vaarta360_" + def.id() + "_records.xlsx\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(body);
    }

    /** Validation errors keep a per-field map so the form can show each message next to its field. */
    @ExceptionHandler(RegisterService.InvalidRow.class)
    ResponseEntity<Map<String, Object>> invalid(RegisterService.InvalidRow e) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("message", e.getMessage());
        b.put("errors", e.errors);
        return ResponseEntity.badRequest().body(b);
    }
}
