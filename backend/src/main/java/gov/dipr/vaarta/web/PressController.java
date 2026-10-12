package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.PressRelease;
import gov.dipr.vaarta.repo.PressReleaseRepo;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;

@RestController
@RequestMapping("/api/press")
public class PressController {
    private final PressReleaseRepo repo;

    public PressController(PressReleaseRepo repo) { this.repo = repo; }

    @GetMapping("/releases")
    public List<PressRelease> list(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("press", "ai");
        return repo.findAll().stream().filter(r -> "State".equals(r.district) || u.districtOk(r.district))
                .sorted(Comparator.comparing((PressRelease r) -> r.issuedAt).reversed()).toList();
    }
}
