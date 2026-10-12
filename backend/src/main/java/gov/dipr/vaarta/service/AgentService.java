package gov.dipr.vaarta.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.domain.*;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.*;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * The DIPR agents of the prototype. Each run prepares work from current data and stops for a named officer's
 * approval; approving applies the agent's side effect. Outputs are deterministic (no external model is called).
 */
@Service
public class AgentService {
    public record AgentInfo(String id, String name, String does, String guard) {}

    public static final List<AgentInfo> AGENTS = List.of(
            new AgentInfo("press", "Press Release Composer", "Turns an officer's photos, voice notes and points into a bilingual release.", "Checks figures against department data. Never publishes without approval."),
            new AgentInfo("triage", "Claim Triage", "Groups incoming tipline forwards, matches them to published clarifications and routes the rest.", "Suggests a verdict only. A fact-checker signs every published one."),
            new AgentInfo("monitor", "Media Monitor", "Reads e-papers, TV transcripts and public posts each morning and writes the 7 AM brief.", "Covers public sources only. No monitoring of private chats or individuals."),
            new AgentInfo("planner", "Campaign Planner", "Finds where reach is weak and proposes the language, format and time slot to fix it.", "Proposes only. Broadcast windows respect opt-in rules and election model code."),
            new AgentInfo("adaudit", "Ad Spend Auditor", "Checks every release order against the rate card, proofs and circulation audits.", "Flags only. Payments are never stopped without an officer's decision."),
            new AgentInfo("query", "Citizen Query Agent", "Answers scheme questions on WhatsApp in Kannada text and voice, and opens a grievance when needed.", "Answers from approved department FAQs only. Hands off to a person when unsure."),
            new AgentInfo("spend", "Spend Forecaster", "Projects year-end spend by channel and department, and suggests where to move budget.", "Suggests only. Re-appropriation needs Finance Department approval."));

    /** The module whose data an agent reads and whose records its approval changes: needed to run and approve it. */
    static final Map<String, String> MODULE = Map.of("press", "press", "triage", "tipline", "monitor", "media", "planner", "overview",
            "adaudit", "ads", "query", "tipline", "spend", "spend");
    private static final Map<String, String> MODULE_LABEL = Map.of("press", "Press & journalists", "tipline", "Tipline & claims",
            "media", "Media monitoring", "overview", "Command overview", "ads", "Release-order audit", "spend", "Spend analytics");

    /** An agent card for this user: whether they may run it and approve its output, and why not. */
    public record AgentAccess(String id, String name, String does, String guard, boolean canRun, boolean canApprove, String note) {}

    public static boolean canRun(CurrentUser u, String agentId) {
        return u.can("ai") && MODULE.containsKey(agentId) && u.can(MODULE.get(agentId));
    }

    /** Press releases are issued only by the Commissioner and the Joint Director (News), as in the press office. */
    public static boolean canApprove(CurrentUser u, String agentId) {
        if (!canRun(u, agentId)) return false;
        if (agentId.equals("press")) return u.role() == Role.COMMISSIONER || u.role() == Role.JD_NEWS;
        return true;
    }

    public List<AgentAccess> cards(CurrentUser u) {
        u.require("ai");
        return AGENTS.stream().map(a -> {
            boolean run = canRun(u, a.id()), ok = canApprove(u, a.id());
            String note = !run ? "Needs access to " + MODULE_LABEL.get(MODULE.get(a.id())) + "."
                    : !ok ? "You can run it; the Commissioner or Joint Director (News) approves." : null;
            return new AgentAccess(a.id(), a.name(), a.does(), a.guard(), run, ok, note);
        }).toList();
    }

    private final AgentRunRepo runs;
    private final ClaimRepo claims;
    private final AdFlagRepo flags;
    private final PressReleaseRepo releases;
    private final SpendOrderRepo spend;
    private final BudgetLineRepo budget;
    private final Calendar cal;
    private final AuditService audit;
    private final ObjectMapper om;
    private final RegisterRecordRepo records;
    private final RecordMapper mapper;
    private final ReferenceData ref;

    public AgentService(AgentRunRepo runs, ClaimRepo claims, AdFlagRepo flags, PressReleaseRepo releases, SpendOrderRepo spend,
                        BudgetLineRepo budget, Calendar cal, AuditService audit, ObjectMapper om, RegisterRecordRepo records,
                        RecordMapper mapper, ReferenceData ref) {
        this.runs = runs; this.claims = claims; this.flags = flags; this.releases = releases; this.spend = spend; this.budget = budget;
        this.cal = cal; this.audit = audit; this.om = om; this.records = records; this.mapper = mapper; this.ref = ref;
    }

    private void requireRun(CurrentUser u, String agentId) {
        u.require("ai");
        if (!canRun(u, agentId))
            throw new CurrentUser.AccessDeniedException("This agent needs access to " + MODULE_LABEL.get(MODULE.get(agentId)) + ".");
    }

    private List<Claim> newClaims(CurrentUser u) {
        return claims.findAll().stream().filter(c -> "New".equals(c.status) && u.districtOk(c.district))
                .sorted(Comparator.comparing((Claim c) -> c.receivedAt == null ? Instant.EPOCH : c.receivedAt)).toList();
    }

    private static String e(Object o) { return HtmlUtils.htmlEscape(String.valueOf(o)); }

    private static String pct(double v) { return String.format("%.1f%%", v * 100); }

    static String lakh(double v) {
        return v >= 100 ? String.format("₹%.2f Cr", v / 100) : String.format(v < 10 ? "₹%.2f L" : "₹%.1f L", v);
    }

    static String fmt(double n) {
        if (n >= 1e7) return String.format("%.2f Cr", n / 1e7);
        if (n >= 1e5) return String.format("%.1f L", n / 1e5);
        if (n >= 1e3) return String.format("%.1fK", n / 1e3);
        return String.valueOf(Math.round(n));
    }

    private static double num(Map<String, Object> ctx, String k) {
        Object v = ctx.get(k);
        return v instanceof Number n ? n.doubleValue() : 0;
    }

    /** Context the console sends: the area in view and the weakest area by read rate, with their metrics. */
    @Transactional
    public Map<String, Object> run(CurrentUser u, String agentId, String target, Map<String, Object> ctx) {
        u.require("ai");
        if (!MODULE.containsKey(agentId)) throw new NoSuchElementException("No agent " + agentId);
        requireRun(u, agentId);
        AgentInfo info = AGENTS.stream().filter(a -> a.id().equals(agentId)).findFirst()
                .orElseThrow(() -> new NoSuchElementException("No agent " + agentId));
        if (ctx == null) ctx = Map.of();
        List<String> steps;
        String out, approve;
        String area = String.valueOf(ctx.getOrDefault("areaLabel", "Karnataka"));
        String low = String.valueOf(ctx.getOrDefault("lowLabel", area));
        if (area.length() > 120) area = area.substring(0, 120);
        if (low.length() > 120) low = low.substring(0, 120);
        if (target != null && target.length() > 120) target = target.substring(0, 120);
        String targetDistrict = null;
        switch (agentId) {
            case "press" -> {
                steps = List.of("Reading field notes from DIO Raichur: 4 photos, 2 voice notes", "Transcribing Kannada voice notes",
                        "Checking figures against Skill Development data", "Drafting release in Kannada and English",
                        "Tone check: no party names, no unverified claims", "Waiting for approval from Joint Director (News)");
                out = "<h5>Draft release · Yuva Nidhi registration drive, Sindhanur</h5><p style=\"margin:0 0 6px\"><b>EN:</b> A special Yuva Nidhi registration drive at Government First Grade College, Sindhanur registered 312 graduates and diploma holders on Tuesday. Officials helped students complete the monthly self-declaration on the spot.</p><p style=\"margin:0\" lang=\"kn\"><b>ಕನ್ನಡ:</b> ಸಿಂಧನೂರಿನ ಸರ್ಕಾರಿ ಪ್ರಥಮ ದರ್ಜೆ ಕಾಲೇಜಿನಲ್ಲಿ ನಡೆದ ಯುವನಿಧಿ ವಿಶೇಷ ನೋಂದಣಿ ಅಭಿಯಾನದಲ್ಲಿ 312 ಪದವೀಧರರು ಮತ್ತು ಡಿಪ್ಲೊಮಾ ಹೊಂದಿದವರು ನೋಂದಾಯಿಸಿಕೊಂಡರು.</p>";
                approve = "Approve and send to journalists";
            }
            case "triage" -> {
                long newC = newClaims(u).size();
                steps = List.of("Pulling " + newC + " new claims from the tipline queue", "Grouping by narrative (text and image similarity)",
                        "Matching against 1,284 published clarifications", "Looking up source circulars in the e-Office archive",
                        "Routing public-safety items to district administration");
                out = "<h5>" + newC + " new claims triaged</h5><p style=\"margin:0\">" + (newC > 0
                        ? Math.max(0, newC - 1) + " match existing narratives and can reuse approved clarifications. 1 needs a fresh fact-check (suspected synthetic video, high forward velocity). Suggested priority: synthetic video first."
                        : "No new claims waiting. The queue is clear.") + "</p>";
                approve = "Move all to Triaged";
            }
            case "monitor" -> {
                steps = List.of("Scanning 46 e-papers and 18 TV transcripts", "Tagging coverage by scheme, district and tone",
                        "Comparing with yesterday's releases", "Writing the 7 AM brief for the Minister and Secretary");
                out = "<h5>7 AM brief · " + e(area) + "</h5><ol style=\"margin:0;padding-left:18px\"><li>Gruha Lakshmi instalment release carried by 63 outlets; tone mostly neutral to positive.</li><li>"
                        + e(low) + " has the weakest message read rate (" + pct(num(ctx, "lowReadR")) + "); local papers there ran 2 stories on payment delays.</li><li>A suspected synthetic video about a loan waiver is spreading in Bengaluru; clarification is in draft.</li><li>Dasara traffic advisory for Mysuru had the fastest pickup this week.</li></ol>";
                approve = "Send brief to Minister's office";
            }
            case "planner" -> {
                String tgt = target != null && !target.isBlank() ? target : low;
                double subs = num(ctx, "targetSubs");
                steps = List.of("Analysing reach gaps in " + tgt, "Comparing read rate by language, format and hour",
                        "Checking scheme uptake from department data", "Drafting a 2-week test plan with a control group");
                out = "<h5>Recovery plan · " + e(tgt) + "</h5><p style=\"margin:0 0 8px\">Current read rate " + pct(num(ctx, "targetReadR")) + ", uptake index "
                        + Math.round(num(ctx, "targetUptake")) + ". Proposed two-week test:</p><div class=\"tbw\"><table class=\"tb\" style=\"min-width:480px\"><thead><tr><th>Segment</th><th>Format</th><th>Slot</th><th class=\"r\">Est. reach</th></tr></thead><tbody><tr><td>Women 30–55, rural</td><td>45-second Kannada voice note</td><td>7:30–8:30 AM</td><td class=\"r\">"
                        + fmt(subs * .42) + "</td></tr><tr><td>Youth 18–25</td><td>Short video + Yuva Nidhi link</td><td>8:00–9:30 PM</td><td class=\"r\">" + fmt(subs * .18)
                        + "</td></tr><tr><td>Urdu-preferring households</td><td>Urdu text card</td><td>After 1:30 PM</td><td class=\"r\">" + fmt(subs * .07)
                        + "</td></tr></tbody></table></div><p style=\"margin:8px 0 0;color:var(--muted);font-size:12.5px\">10% of subscribers held back as a control so the lift can be measured.</p>";
                approve = "Schedule the test";
                target = tgt;
                Object td = ctx.get("targetDistrict");
                if (td != null && ref.isDistrict(td.toString())) targetDistrict = td.toString();
            }
            case "adaudit" -> {
                List<AdFlag> fl = flags.findAll();
                long high = fl.stream().filter(f -> "crit".equals(f.severity)).count();
                steps = List.of("Reading " + String.format("%,d", spend.count()) + " release orders this period", "Matching billed rates to the approved rate card",
                        "Checking telecast and geo-tagged photo proofs", "Comparing claimed circulation with audit figures");
                out = "<h5>" + fl.size() + " orders flagged · " + lakh(fl.stream().mapToDouble(f -> f.amount).sum()) + " under review</h5><p style=\"margin:0\">"
                        + high + " high-severity issues (rate above card, inflated circulation). See the Release-order audit module for each order.</p>";
                approve = "Send report to Commissioner";
            }
            case "query" -> {
                steps = List.of("Reading last 30 days of bot conversations", "Measuring auto-answer and hand-off rates", "Finding questions with no approved answer");
                out = "<h5>Citizen Query Agent · last 30 days</h5><ol style=\"margin:0;padding-left:18px\"><li>78% of questions answered automatically; 14% opened a grievance; 8% handed to a person.</li><li>Top unanswered: Gruha Jyothi charges after moving house. Ask Energy department for an approved answer.</li><li>Voice questions are 31% of Kannada traffic and growing.</li></ol>";
                approve = "Request FAQ from Energy dept";
            }
            case "spend" -> {
                String fy = cal.currentFy();
                double el = cal.elapsed();
                List<SpendOrder> cur = spend.findAll().stream().filter(s -> fy.equals(s.fy) && !"RO issued".equals(s.status)).toList();
                double s = cur.stream().mapToDouble(x -> x.amount).sum(), p = s / el;
                double b = budget.findAll().stream().filter(x -> fy.equals(x.fy)).mapToDouble(x -> x.budget).sum();
                double dg = cur.stream().filter(x -> "Digital & social".equals(x.channel)).mapToDouble(x -> x.amount).sum();
                double dgb = budget.findAll().stream().filter(x -> fy.equals(x.fy) && "Digital & social".equals(x.channel)).mapToDouble(x -> x.budget).sum();
                steps = List.of("Reading " + String.format("%,d", spend.count()) + " release orders and " + budget.count() + " budget lines",
                        "Projecting year-end spend from the April–September run-rate", "Adjusting for Dasara, Rajyotsava and other planned campaigns",
                        "Comparing each channel and department with its budget", "Drafting re-appropriation options");
                out = "<h5>Year-end forecast · " + fy + "</h5><p style=\"margin:0 0 8px\">Projected spend <b>" + lakh(p) + "</b> against a budget of <b>" + lakh(b)
                        + "</b>.</p><ol style=\"margin:0;padding-left:18px\"><li>Digital and social is on course for " + lakh(dg / el) + " against " + lakh(dgb)
                        + ". Move part of the print surplus to digital, or cap new digital orders.</li><li>Hold 10% of the Q4 print budget until the Rajyotsava and Hampi Utsav plans are final.</li><li>Ask departments with slow spend to confirm their Q3 campaigns by 31 October, or release the funds.</li></ol>";
                approve = "Send forecast to Commissioner";
            }
            default -> throw new NoSuchElementException("No agent " + agentId);
        }
        // "Run again": an earlier run of the same agent by this officer that was never decided is set aside.
        runs.findAll().stream().filter(x -> agentId.equals(x.agentId) && "Needs approval".equals(x.status) && u.displayName().equals(x.startedBy))
                .forEach(x -> { x.status = "Superseded"; x.decidedAt = Instant.now(); });
        AgentRun r = new AgentRun();
        r.agentId = agentId; r.target = target; r.area = area; r.targetDistrict = targetDistrict; r.status = "Needs approval"; r.approveLabel = approve; r.output = out;
        r.startedBy = u.displayName(); r.startedAt = Instant.now();
        try {
            r.steps = om.writeValueAsString(steps);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
        runs.save(r);
        audit.record(u, "agent.run", agentId);
        return dto(r, info, null);
    }

    @Transactional
    public Map<String, Object> approve(CurrentUser u, long runId) {
        u.require("ai");
        AgentRun r = runs.findById(runId).orElseThrow(() -> new NoSuchElementException("No run " + runId));
        requireRun(u, r.agentId);
        if (!canApprove(u, r.agentId))
            throw new CurrentUser.AccessDeniedException("Only the Commissioner or the Joint Director (News) can approve this.");
        if (!"Needs approval".equals(r.status)) throw new IllegalArgumentException("This run was already decided.");
        String msg;
        switch (r.agentId) {
            case "press" -> {
                PressRelease p = new PressRelease();
                p.id = releases.nextReleaseId();
                p.title = "Sindhanur: 312 youth register for Yuva Nidhi at special drive"; p.dept = "Skill Development"; p.district = "Raichur";
                p.hoursAfterEvent = 1.4; p.reach = 58; p.issuedAt = Instant.now();
                p.status = PressRelease.ISSUED; p.language = "English";
                p.body = "A special Yuva Nidhi registration drive at Government First Grade College, Sindhanur registered 312 graduates and diploma holders on Tuesday. "
                        + "Officials helped students complete the monthly self-declaration on the spot.";
                p.draftedBy = "Press Release Composer (AI agent), run by " + r.startedBy; p.draftedAt = r.startedAt;
                p.approvedBy = u.displayName();
                releases.save(p);
                audit.record(u, "press.issue", p.id + " (Press Release Composer)");
                r.sentTo = "58 Raichur-accredited journalists";
                r.effect = p.id + " issued: " + p.title;
                msg = "Release sent|" + p.id + " queued to 58 Raichur-accredited journalists on WhatsApp.";
            }
            case "triage" -> {
                List<Claim> moved = newClaims(u);
                moved.forEach(c -> {
                    c.status = "Triaged"; c.updatedAt = Instant.now();
                    audit.record(u, "claim.Triaged", c.id + " (Claim Triage agent)");
                });
                r.effect = moved.isEmpty() ? "No new claims were waiting."
                        : moved.size() + (moved.size() == 1 ? " claim" : " claims") + " moved to Triaged: "
                          + String.join(", ", moved.stream().map(c -> c.id).toList());
                msg = moved.isEmpty() ? "Queue updated|No new claims were waiting." : "Queue updated|" + moved.size() + " new "
                        + (moved.size() == 1 ? "claim" : "claims") + " moved to Triaged.";
            }
            case "monitor" -> {
                r.sentTo = "Minister's office and Secretary";
                r.effect = "7 AM brief for " + r.area + " delivered on WhatsApp.";
                msg = "Brief sent|Delivered to the Minister's and Secretary's WhatsApp at 7:00 AM.";
            }
            case "planner" -> {
                String id = scheduleTest(r);
                r.sentTo = "Publicity campaigns register";
                r.effect = id + " added to Publicity campaigns: two-week test for " + r.target + " from " + startDate().format(DateTimeFormatter.ofPattern("d MMM yyyy")) + ".";
                msg = "Campaign scheduled|Two-week test for " + r.target + " starts tomorrow 7:30 AM. Added to Campaigns as " + id + ".";
            }
            case "adaudit" -> {
                List<AdFlag> fl = flags.findAll();
                r.sentTo = "Commissioner";
                r.effect = fl.size() + " flagged orders (" + lakh(fl.stream().mapToDouble(f -> f.amount).sum()) + ") in the audit summary.";
                msg = "Report sent|Audit summary sent to the Commissioner for review.";
            }
            case "query" -> {
                r.sentTo = "Energy department";
                r.effect = "Approved FAQ answer requested: Gruha Jyothi charges after moving house.";
                msg = "Request sent|Energy department asked for an approved FAQ answer.";
            }
            case "spend" -> {
                r.sentTo = "Commissioner";
                r.effect = "Year-end forecast for " + cal.currentFy() + " sent.";
                msg = "Forecast sent|The year-end forecast was sent to the Commissioner.";
            }
            default -> msg = "Approved|";
        }
        r.status = "Approved"; r.decidedBy = u.displayName(); r.decidedAt = Instant.now();
        audit.record(u, "agent.approve", r.agentId + " #" + r.id + (r.effect == null ? "" : " · " + r.effect));
        return dto(r, info(r.agentId), msg);
    }

    private LocalDate startDate() { return cal.asOf().plusDays(1); }

    /** The Campaign Planner's approved test becomes a DIPR campaign in the Publicity campaigns register. */
    private String scheduleTest(AgentRun r) {
        int max = records.findScoped("campaigns", null, null, null).stream()
                .map(x -> String.valueOf(mapper.fromRecord(x).get("campaignId")))
                .filter(v -> v.matches("CMP-\\d+")).mapToInt(v -> Integer.parseInt(v.substring(4))).max().orElse(26000);
        String id = "CMP-" + (max + 1);
        LocalDate start = startDate(), end = start.plusDays(13);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("campaignId", id);
        row.put("campaign", "Read-rate recovery test · " + r.target);
        row.put("ctype", "Guarantee schemes awareness");
        row.put("department", "DIPR (own campaigns)");
        row.put("fy", Calendar.fyOf(YearMonth.from(start)));
        row.put("start", start.toString());
        row.put("end", end.toString());
        row.put("stage", "Creative in design");
        row.put("budget", 0.0);
        row.put("spent", 0.0);
        row.put("reach", 0.0);
        row.put("district", r.targetDistrict == null ? "Statewide" : r.targetDistrict);
        records.save(mapper.toRecord("campaigns", row, null));
        return id;
    }

    @Transactional
    public Map<String, Object> reject(CurrentUser u, long runId, String comment) {
        u.require("ai");
        AgentRun r = runs.findById(runId).orElseThrow(() -> new NoSuchElementException("No run " + runId));
        requireRun(u, r.agentId);
        if (comment == null || comment.isBlank()) throw new IllegalArgumentException("Write what the agent should change.");
        comment = comment.trim();
        if (comment.length() > 1000) throw new IllegalArgumentException("Keep comments under 1,000 characters.");
        if (!"Needs approval".equals(r.status)) throw new IllegalArgumentException("This run was already decided.");
        r.status = "Sent back"; r.decidedBy = u.displayName(); r.decidedAt = Instant.now(); r.comment = comment;
        audit.record(u, "agent.reject", r.agentId + " #" + r.id + " · " + comment);
        return dto(r, info(r.agentId), "Sent back|The agent will revise using your comments.");
    }

    /** Recent runs of the agents this user may run, newest first. */
    public List<Map<String, Object>> recent(CurrentUser u) {
        u.require("ai");
        return runs.findTop50ByOrderByStartedAtDesc().stream().filter(r -> canRun(u, r.agentId)).limit(20)
                .map(r -> dto(r, info(r.agentId), null)).toList();
    }

    /** Approved agent output addressed to the Commissioner (audit summaries, spend forecasts). */
    public List<Map<String, Object>> inbox(CurrentUser u) {
        u.requireRole(Role.COMMISSIONER);
        return runs.findBySentToAndStatusOrderByDecidedAtDesc("Commissioner", "Approved").stream().limit(20)
                .map(r -> dto(r, info(r.agentId), null)).toList();
    }

    private AgentInfo info(String id) {
        return AGENTS.stream().filter(a -> a.id().equals(id)).findFirst().orElseThrow();
    }

    private Map<String, Object> dto(AgentRun r, AgentInfo info, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.id); m.put("agentId", r.agentId); m.put("name", info.name()); m.put("target", r.target); m.put("status", r.status);
        try {
            m.put("steps", om.readValue(r.steps, new TypeReference<List<String>>() {}));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
        m.put("output", r.output); m.put("approveLabel", r.approveLabel); m.put("startedBy", r.startedBy); m.put("startedAt", r.startedAt);
        m.put("decidedBy", r.decidedBy); m.put("decidedAt", r.decidedAt); m.put("comment", r.comment);
        m.put("area", r.area); m.put("sentTo", r.sentTo); m.put("effect", r.effect);
        if (message != null) {
            String[] p = message.split("\\|", 2);
            m.put("toast", Map.of("title", p[0], "body", p.length > 1 ? p[1] : ""));
        }
        return m;
    }
}
