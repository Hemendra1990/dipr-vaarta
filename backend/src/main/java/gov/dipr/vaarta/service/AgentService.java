package gov.dipr.vaarta.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.domain.*;
import gov.dipr.vaarta.repo.*;
import gov.dipr.vaarta.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.time.Instant;
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

    private final AgentRunRepo runs;
    private final ClaimRepo claims;
    private final AdFlagRepo flags;
    private final PressReleaseRepo releases;
    private final SpendOrderRepo spend;
    private final BudgetLineRepo budget;
    private final Calendar cal;
    private final AuditService audit;
    private final ObjectMapper om;

    public AgentService(AgentRunRepo runs, ClaimRepo claims, AdFlagRepo flags, PressReleaseRepo releases, SpendOrderRepo spend,
                        BudgetLineRepo budget, Calendar cal, AuditService audit, ObjectMapper om) {
        this.runs = runs; this.claims = claims; this.flags = flags; this.releases = releases; this.spend = spend; this.budget = budget;
        this.cal = cal; this.audit = audit; this.om = om;
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
        AgentInfo info = AGENTS.stream().filter(a -> a.id().equals(agentId)).findFirst()
                .orElseThrow(() -> new NoSuchElementException("No agent " + agentId));
        if (ctx == null) ctx = Map.of();
        List<String> steps;
        String out, approve;
        String area = String.valueOf(ctx.getOrDefault("areaLabel", "Karnataka"));
        String low = String.valueOf(ctx.getOrDefault("lowLabel", area));
        switch (agentId) {
            case "press" -> {
                steps = List.of("Reading field notes from DIO Raichur: 4 photos, 2 voice notes", "Transcribing Kannada voice notes",
                        "Checking figures against Skill Development data", "Drafting release in Kannada and English",
                        "Tone check: no party names, no unverified claims", "Waiting for approval from Joint Director (News)");
                out = "<h5>Draft release · Yuva Nidhi registration drive, Sindhanur</h5><p style=\"margin:0 0 6px\"><b>EN:</b> A special Yuva Nidhi registration drive at Government First Grade College, Sindhanur registered 312 graduates and diploma holders on Tuesday. Officials helped students complete the monthly self-declaration on the spot.</p><p style=\"margin:0\" lang=\"kn\"><b>ಕನ್ನಡ:</b> ಸಿಂಧನೂರಿನ ಸರ್ಕಾರಿ ಪ್ರಥಮ ದರ್ಜೆ ಕಾಲೇಜಿನಲ್ಲಿ ನಡೆದ ಯುವನಿಧಿ ವಿಶೇಷ ನೋಂದಣಿ ಅಭಿಯಾನದಲ್ಲಿ 312 ಪದವೀಧರರು ಮತ್ತು ಡಿಪ್ಲೊಮಾ ಹೊಂದಿದವರು ನೋಂದಾಯಿಸಿಕೊಂಡರು.</p>";
                approve = "Approve and send to journalists";
            }
            case "triage" -> {
                long newC = claims.findAll().stream().filter(c -> "New".equals(c.status)).count();
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
                List<SpendOrder> cur = spend.findAll().stream().filter(s -> fy.equals(s.fy) && s.booked()).toList();
                double s = cur.stream().mapToDouble(SpendOrder::spendAmount).sum(), p = s / el;
                double b = budget.findAll().stream().filter(x -> fy.equals(x.fy)).mapToDouble(x -> x.budget).sum();
                double dg = cur.stream().filter(x -> "Digital & social".equals(x.channel)).mapToDouble(SpendOrder::spendAmount).sum();
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
        AgentRun r = new AgentRun();
        r.agentId = agentId; r.target = target; r.status = "Needs approval"; r.approveLabel = approve; r.output = out;
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
                msg = "Release sent|" + p.id + " queued to 58 Raichur-accredited journalists on WhatsApp.";
            }
            case "triage" -> {
                claims.findAll().stream().filter(c -> "New".equals(c.status)).forEach(c -> { c.status = "Triaged"; c.updatedAt = Instant.now(); });
                msg = "Queue updated|New claims moved to Triaged.";
            }
            case "monitor" -> msg = "Brief sent|Delivered to the Minister's and Secretary's WhatsApp at 7:00 AM.";
            case "planner" -> msg = "Campaign scheduled|Two-week test for " + r.target + " starts tomorrow 7:30 AM.";
            case "adaudit" -> msg = "Report sent|Audit summary sent to the Commissioner for review.";
            case "query" -> msg = "Request sent|Energy department asked for an approved FAQ answer.";
            case "spend" -> msg = "Forecast sent|The year-end forecast was sent to the Commissioner.";
            default -> msg = "Approved|";
        }
        r.status = "Approved"; r.decidedBy = u.displayName(); r.decidedAt = Instant.now();
        audit.record(u, "agent.approve", r.agentId + " #" + r.id);
        return dto(r, info(r.agentId), msg);
    }

    @Transactional
    public Map<String, Object> reject(CurrentUser u, long runId, String comment) {
        u.require("ai");
        AgentRun r = runs.findById(runId).orElseThrow(() -> new NoSuchElementException("No run " + runId));
        if (!"Needs approval".equals(r.status)) throw new IllegalArgumentException("This run was already decided.");
        r.status = "Sent back"; r.decidedBy = u.displayName(); r.decidedAt = Instant.now(); r.comment = comment;
        audit.record(u, "agent.reject", r.agentId + " #" + r.id);
        return dto(r, info(r.agentId), "Sent back|The agent will revise using your comments.");
    }

    public List<Map<String, Object>> recent(CurrentUser u) {
        u.require("ai");
        return runs.findTop20ByOrderByStartedAtDesc().stream().map(r -> dto(r, info(r.agentId), null)).toList();
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
        if (message != null) {
            String[] p = message.split("\\|", 2);
            m.put("toast", Map.of("title", p[0], "body", p.length > 1 ? p[1] : ""));
        }
        return m;
    }
}
