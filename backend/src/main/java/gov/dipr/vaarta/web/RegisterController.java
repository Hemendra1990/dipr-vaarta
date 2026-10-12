package gov.dipr.vaarta.web;

import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.repo.RegisterRecordRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.RecordMapper;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/registers")
public class RegisterController {
    private final ReferenceData ref;
    private final RegisterRecordRepo repo;
    private final RecordMapper mapper;

    public RegisterController(ReferenceData ref, RegisterRecordRepo repo, RecordMapper mapper) {
        this.ref = ref; this.repo = repo; this.mapper = mapper;
    }

    /**
     * Rows of a register within the user's scope. Registers that are not tied to places (geo-all: campaigns, film,
     * publications, grants) are not district-filtered, as in the prototype.
     */
    @GetMapping("/{id}/rows")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> rows(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        RegisterDef def = ref.register(id).orElseThrow(() -> new NoSuchElementException("No register " + id));
        u.require(id);
        String district = def.geoAll() ? null : u.district();
        return repo.findScoped(id, district, u.department(), u.vendorId()).stream().map(mapper::fromRecord).toList();
    }
}
