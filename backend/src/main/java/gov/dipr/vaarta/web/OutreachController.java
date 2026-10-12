package gov.dipr.vaarta.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.repo.OutreachBaseRepo;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/outreach")
public class OutreachController {
    private final OutreachBaseRepo repo;
    private final ObjectMapper om;

    public OutreachController(OutreachBaseRepo repo, ObjectMapper om) { this.repo = repo; this.om = om; }

    /** Taluk-level outreach base metrics; a district-pinned user receives only their district's taluks. */
    @GetMapping("/base")
    public List<Map<String, Object>> base(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("overview", "tipline", "press", "offices", "ai", "ads");
        return repo.findScoped(u.district()).stream().map(o -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("district", o.district);
            m.put("taluk", o.taluk);
            try {
                m.putAll(om.readValue(o.metrics, new TypeReference<Map<String, Object>>() {}));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
            return m;
        }).toList();
    }
}
