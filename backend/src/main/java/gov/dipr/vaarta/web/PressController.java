package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.PressRelease;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.PressReleaseRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * The press office: drafts, approval and issue (Commissioner / Joint Director only), media kits and pickup.
 * Reach on issue follows the prototype's addRelease: statewide releases go to 1,210 accredited journalists, a district release to 58.
 */
@RestController
@RequestMapping("/api/press")
public class PressController {
    static final int STATE_REACH = 1210, DISTRICT_REACH = 58;
    static final Set<String> LANGUAGES = Set.of("Kannada", "English");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a").withZone(ZoneId.of("Asia/Kolkata"));

    private final PressReleaseRepo repo;
    private final ReferenceData ref;
    private final AuditService audit;

    public PressController(PressReleaseRepo repo, ReferenceData ref, AuditService audit) {
        this.repo = repo; this.ref = ref; this.audit = audit;
    }

    public record DraftRequest(String title, String dept, String district, String body, String language, Double hoursAfterEvent) {}
    public record PickupRequest(Integer outlets) {}

    @GetMapping("/releases")
    public List<PressRelease> list(@AuthenticationPrincipal CurrentUser u) {
        u.requireAny("press", "ai");
        return repo.findAll().stream().filter(r -> visible(u, r))
                .sorted(Comparator.comparing(PressController::when).reversed()).toList();
    }

    @GetMapping("/releases/{id}")
    public PressRelease one(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        u.requireAny("press", "ai");
        return find(u, id);
    }

    @PostMapping("/releases")
    @Transactional
    public PressRelease draft(@AuthenticationPrincipal CurrentUser u, @RequestBody DraftRequest req) {
        u.require("press");
        String title = trim(req.title()), dept = trim(req.dept()), district = trim(req.district()), body = req.body() == null ? "" : req.body().strip();
        String lang = trim(req.language());
        if (title.isEmpty()) throw new IllegalArgumentException("Give the release a title.");
        if (title.length() > 500) throw new IllegalArgumentException("Keep the title under 500 characters.");
        if (dept.isEmpty() || dept.length() > 120) throw new IllegalArgumentException("Choose the department.");
        if (!"State".equals(district) && !ref.isDistrict(district)) throw new IllegalArgumentException("Choose a district, or State for a statewide release.");
        if (body.isEmpty()) throw new IllegalArgumentException("Write the release text.");
        if (body.length() > 20000) throw new IllegalArgumentException("Keep the release text under 20,000 characters.");
        if (lang.isEmpty()) lang = "Kannada";
        if (!LANGUAGES.contains(lang)) throw new IllegalArgumentException("Language must be Kannada or English.");
        double h = req.hoursAfterEvent() == null ? 1.4 : req.hoursAfterEvent();
        if (h < 0 || h > 720) throw new IllegalArgumentException("Hours after the event must be between 0 and 720.");
        if (u.district() != null && !u.district().equals(district)) throw new CurrentUser.AccessDeniedException("You can draft releases for " + u.district() + " only.");
        if (!u.scopeOk(dept, null)) throw new CurrentUser.AccessDeniedException("You can draft releases for " + u.department() + " only.");

        PressRelease p = new PressRelease();
        p.id = repo.nextDraftId();
        p.status = PressRelease.DRAFT;
        p.title = title; p.dept = dept; p.district = district; p.body = body; p.language = lang;
        p.hoursAfterEvent = Math.round(h * 10) / 10.0;
        p.draftedBy = u.displayName(); p.draftedAt = Instant.now();
        repo.save(p);
        audit.record(u, "press.draft", p.id + " · " + p.district + " · " + p.title);
        return p;
    }

    /** Approve & issue. Only the Commissioner or the Joint Director (News) may issue; the draft gets its REL number now. */
    @PostMapping("/releases/{id}/issue")
    @Transactional
    public PressRelease issue(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        u.require("press");
        u.requireRole(Role.COMMISSIONER, Role.JD_NEWS);
        PressRelease d = find(u, id);
        if (!d.draft()) throw new IllegalArgumentException(d.id + " is already issued.");
        PressRelease p = new PressRelease();
        p.id = repo.nextReleaseId();
        p.title = d.title; p.dept = d.dept; p.district = d.district; p.body = d.body; p.language = d.language;
        p.hoursAfterEvent = d.hoursAfterEvent; p.draftedBy = d.draftedBy; p.draftedAt = d.draftedAt;
        p.status = PressRelease.ISSUED;
        p.reach = "State".equals(d.district) ? STATE_REACH : DISTRICT_REACH;
        p.issuedAt = Instant.now(); p.approvedBy = u.displayName();
        repo.delete(d);
        repo.save(p);
        audit.record(u, "press.issue", d.id + " issued as " + p.id + " · reach " + p.reach);
        return p;
    }

    @PostMapping("/releases/{id}/discard")
    @Transactional
    public void discard(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        u.require("press");
        PressRelease d = find(u, id);
        if (!d.draft()) throw new IllegalArgumentException("Issued releases cannot be discarded.");
        boolean approver = u.role() == Role.COMMISSIONER || u.role() == Role.JD_NEWS;
        if (!approver && !u.displayName().equals(d.draftedBy)) throw new CurrentUser.AccessDeniedException("Only the officer who drafted it, or an approver, can discard this draft.");
        repo.delete(d);
        audit.record(u, "press.discard", d.id + " · " + d.title);
    }

    /** Media kit: a zip with the release text and a fact sheet. Each download counts on the release (prototype kitDownload). */
    @GetMapping("/releases/{id}/kit")
    @Transactional
    public ResponseEntity<byte[]> kit(@AuthenticationPrincipal CurrentUser u, @PathVariable String id) {
        u.requireAny("press", "ai");
        PressRelease p = find(u, id);
        if (p.draft()) throw new IllegalArgumentException("A media kit is available once the release is issued.");
        p.kits++;
        repo.save(p);
        audit.record(u, "press.kit", p.id + " · kits " + p.kits);
        byte[] zip = zip(p);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + p.id + "-media-kit.zip\"")
                .contentType(MediaType.parseMediaType("application/zip")).body(zip);
    }

    /** Record pickup: adds the number of outlets that carried the release. */
    @PostMapping("/releases/{id}/pickup")
    @Transactional
    public PressRelease pickup(@AuthenticationPrincipal CurrentUser u, @PathVariable String id, @RequestBody PickupRequest req) {
        u.require("press");
        PressRelease p = find(u, id);
        if (p.draft()) throw new IllegalArgumentException("Record pickup after the release is issued.");
        int n = req.outlets() == null ? 0 : req.outlets();
        if (n < 1 || n > 5000) throw new IllegalArgumentException("Outlets must be a number from 1 to 5,000.");
        p.pickup += n;
        repo.save(p);
        audit.record(u, "press.pickup", p.id + " +" + n + " outlets · total " + p.pickup);
        return p;
    }

    private PressRelease find(CurrentUser u, String id) {
        PressRelease p = repo.findById(id).orElseThrow(() -> new NoSuchElementException("No release " + id));
        if (!visible(u, p)) throw new CurrentUser.AccessDeniedException("This release is outside your scope.");
        return p;
    }

    /** Statewide releases are open to all press viewers; drafts only to roles with the press module. */
    private static boolean visible(CurrentUser u, PressRelease r) {
        if (r.draft() && !u.can("press")) return false;
        return "State".equals(r.district) || u.districtOk(r.district);
    }

    private static Instant when(PressRelease r) {
        Instant t = r.issuedAt != null ? r.issuedAt : r.draftedAt;
        return t == null ? Instant.EPOCH : t;
    }

    private static String trim(String s) { return s == null ? "" : s.strip(); }

    private static String fmtTime(Instant t) { return t == null ? "—" : WHEN.format(t); }

    static byte[] zip(PressRelease p) {
        String nl = "\r\n";
        String release = "Department of Information and Public Relations, Government of Karnataka" + nl
                + "PRESS RELEASE · " + p.id + nl + nl
                + p.title + nl + nl
                + (p.body == null || p.body.isBlank() ? "(Full text is held by the Media Desk for releases issued before Vaarta 360.)" : p.body) + nl + nl
                + "Issued " + fmtTime(p.issuedAt) + (p.approvedBy != null ? " · approved by " + p.approvedBy : "") + nl;
        String facts = "FACT SHEET · " + p.id + nl + nl
                + "Title: " + p.title + nl
                + "Department: " + p.dept + nl
                + "Scope: " + ("State".equals(p.district) ? "Statewide" : p.district + " district") + nl
                + "Language: " + (p.language == null ? "—" : p.language) + nl
                + "Issued: " + fmtTime(p.issuedAt) + nl
                + "Issued " + p.hoursAfterEvent + " h after the event" + nl
                + "Drafted by: " + (p.draftedBy == null ? "—" : p.draftedBy) + nl
                + "Approved by: " + (p.approvedBy == null ? "—" : p.approvedBy) + nl
                + "Accredited journalists reached on WhatsApp: " + p.reach + nl
                + "Outlets that carried it so far: " + p.pickup + nl + nl
                + "Media Desk, DIPR · for queries reply on the accredited journalists' WhatsApp line." + nl;
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(); ZipOutputStream z = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            z.putNextEntry(new ZipEntry("release.txt"));
            z.write(release.getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
            z.putNextEntry(new ZipEntry("factsheet.txt"));
            z.write(facts.getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
            z.finish();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
