package gov.dipr.vaarta.service;

import gov.dipr.vaarta.domain.AuditEvent;
import gov.dipr.vaarta.domain.BotContact;
import gov.dipr.vaarta.domain.Claim;
import gov.dipr.vaarta.domain.FeedItem;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.AuditEventRepo;
import gov.dipr.vaarta.repo.BotContactRepo;
import gov.dipr.vaarta.repo.ClaimRepo;
import gov.dipr.vaarta.repo.FeedItemRepo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns messages from the WhatsApp bot into tipline claims and ground-feed items, and decides the reply the bot sends.
 * No LLM is involved: category, language and duplicate matching use simple, explainable rules.
 */
@Service
public class BotService {
    public static final List<String> CATEGORIES = List.of("Scheme rumour", "Fake recruitment", "Doctored circular", "Synthetic media", "Public safety", "Price rumour");
    public static final Set<String> FEED_TYPES = Set.of("pulse", "report", "esc", "rel");
    /** Share of words two messages must have in common to count as the same claim. */
    static final double MATCH_THRESHOLD = 0.6;

    private final ClaimRepo claims;
    private final FeedItemRepo feed;
    private final BotContactRepo contacts;
    private final AuditEventRepo audit;
    private final ReferenceData ref;

    public BotService(ClaimRepo claims, FeedItemRepo feed, BotContactRepo contacts, AuditEventRepo audit, ReferenceData ref) {
        this.claims = claims; this.feed = feed; this.contacts = contacts; this.audit = audit; this.ref = ref;
    }

    public record Inbound(String from, String type, String text, String lang, String district, Integer forwards, String scheme, String sentiment) {}

    public record Result(boolean accepted, String kind, String id, String status, String reply) {}

    @Transactional
    public Result handle(Inbound m) {
        String phone = normalisePhone(m.from());
        if (phone == null) throw new IllegalArgumentException("from: a phone number is needed");
        String text = m.text() == null ? "" : m.text().trim();
        if (text.isEmpty()) throw new IllegalArgumentException("text: the message is empty");
        if (text.length() > 1000) text = text.substring(0, 1000);
        Optional<BotContact> dio = contacts.findById(phone).filter(c -> c.active);

        // A DIO can tag a message with a prefix instead of a type: "PULSE: ...", "REPORT: ...", "ESC: ...", "COVERAGE: ...".
        String type = m.type() == null || m.type().isBlank() ? null : m.type().trim().toLowerCase(Locale.ROOT);
        Matcher pre = Pattern.compile("^(pulse|report|daily report|esc|escalation|coverage|rel)\\s*[:\\-]\\s*", Pattern.CASE_INSENSITIVE).matcher(text);
        if (type == null && pre.find()) {
            type = switch (pre.group(1).toLowerCase(Locale.ROOT)) {
                case "pulse" -> "pulse";
                case "report", "daily report" -> "report";
                case "esc", "escalation" -> "esc";
                default -> "rel";
            };
            text = text.substring(pre.end()).trim();
        }
        if (type == null || type.equals("claim")) return claim(m, phone, text, dio);
        if (type.equals("escalation")) type = "esc";
        if (type.equals("coverage")) type = "rel";
        if (!FEED_TYPES.contains(type)) throw new IllegalArgumentException("type: use claim, pulse, report, esc or rel");
        if (dio.isEmpty()) {
            log("bot:" + phone, "bot.rejected", "Feed " + type + " from unregistered number " + mask(phone));
            return new Result(false, "rejected", null, null,
                    "This number is not registered with a District Information Office. To report a rumour, just send the message here.");
        }
        return feedItem(m, phone, type, text, dio.get());
    }

    private Result claim(Inbound m, String phone, String text, Optional<BotContact> dio) {
        String district = dio.map(c -> c.district).orElseGet(() -> matchDistrict(m.district()));
        if (district == null) {
            return new Result(false, "need-district", null, null, "Thank you. Which district are you in? Reply with the district name and forward the message again.");
        }
        Claim c = new Claim();
        c.id = nextClaimId(claims);
        c.text = text;
        c.lang = guessLanguage(text, m.lang());
        c.district = district;
        c.category = guessCategory(text);
        c.forwards = m.forwards() == null ? 0 : Math.max(0, m.forwards());
        c.source = dio.isPresent() ? "District office" : "Tipline";
        c.contact = mask(phone);
        c.createdBy = "bot:" + phone;
        c.receivedAt = Instant.now();
        c.updatedAt = c.receivedAt;
        Claim match = findPublishedMatch(text);
        String reply;
        if (match != null) {
            c.status = "Published";
            c.verdict = match.verdict;
            c.clarification = match.clarification;
            c.category = match.category;
            c.matchOf = match.id;
            c.approvedBy = match.approvedBy;
            reply = "This message was checked earlier (" + match.id + "). Verdict: " + match.verdict + "."
                    + (match.clarification != null && !match.clarification.isBlank() ? " " + match.clarification : "")
                    + " Please do not forward it.";
        } else {
            c.status = "New";
            c.verdict = "—";
            reply = "Thank you. Your message is logged as " + c.id + ". The fact-check team will reply here once it is checked.";
        }
        claims.save(c);
        log(c.createdBy, "claim.create", c.id + (match != null ? " · matched " + match.id : "") + " · via WhatsApp");
        return new Result(true, "claim", c.id, c.status, reply);
    }

    private Result feedItem(Inbound m, String phone, String type, String text, BotContact dio) {
        FeedItem f = new FeedItem();
        f.type = type;
        f.district = dio.district; // always the officer's own district, whatever the message says
        f.scheme = blank(m.scheme());
        f.sentiment = m.sentiment() == null ? null : switch (m.sentiment().trim().toLowerCase(Locale.ROOT)) {
            case "positive" -> "Positive";
            case "mixed" -> "Mixed";
            case "negative" -> "Negative";
            default -> null;
        };
        f.note = text;
        f.author = dio.name != null ? dio.name : "DIO, " + dio.district;
        f.channel = "WhatsApp";
        f.createdBy = "bot:" + phone;
        f.createdAt = Instant.now();
        feed.save(f);
        log("bot:" + phone, "feed.post", type + " " + f.district + " · via WhatsApp");
        String what = switch (type) {
            case "pulse" -> "Field pulse";
            case "report" -> "Daily report";
            case "esc" -> "Citizen escalation";
            default -> "Coverage";
        };
        return new Result(true, "feed", String.valueOf(f.id), null, what + " logged for " + f.district + " (#" + f.id + "). Thank you.");
    }

    private void log(String who, String action, String detail) {
        audit.save(new AuditEvent(who, action, detail));
    }

    /** Next id in the IDTU-26-nnnn series. */
    public static synchronized String nextClaimId(ClaimRepo repo) {
        int next = repo.findAll().stream().map(x -> x.id).filter(id -> id.startsWith("IDTU-26-"))
                .mapToInt(id -> { try { return Integer.parseInt(id.substring(8)); } catch (NumberFormatException e) { return 0; } })
                .max().orElse(4500) + 1;
        return "IDTU-26-" + next;
    }

    Claim findPublishedMatch(String text) {
        Set<String> a = words(text);
        if (a.size() < 3) return null;
        Claim best = null;
        double bestScore = 0;
        for (Claim p : claims.findByStatus("Published")) {
            if (p.matchOf != null) continue; // compare with the original clarification only
            Set<String> b = words(p.text);
            if (b.isEmpty()) continue;
            Set<String> inter = new HashSet<>(a);
            inter.retainAll(b);
            Set<String> union = new HashSet<>(a);
            union.addAll(b);
            double score = Math.max((double) inter.size() / union.size(), (double) inter.size() / Math.min(a.size(), b.size()) * 0.85);
            if (score > bestScore) { bestScore = score; best = p; }
        }
        return bestScore >= MATCH_THRESHOLD ? best : null;
    }

    private static final Set<String> STOP = Set.of("the", "a", "an", "is", "are", "will", "be", "to", "of", "on", "in", "for", "and", "or", "from",
            "with", "by", "at", "this", "that", "it", "all", "your", "you", "please", "forward", "share", "fwd", "msg", "message", "says", "say");

    static Set<String> words(String s) {
        Set<String> out = new LinkedHashSet<>();
        if (s == null) return out;
        for (String w : s.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (w.length() < 2 || STOP.contains(w)) continue;
            out.add(w);
        }
        return out;
    }

    private static final Map<String, List<String>> KEYWORDS = new LinkedHashMap<>();
    static {
        KEYWORDS.put("Synthetic media", List.of("video", "deepfake", "deep fake", "audio", "clip", "morphed", "ai generated", "ai-generated", "voice", "edited photo"));
        KEYWORDS.put("Fake recruitment", List.of("recruitment", "vacancy", "vacancies", "posts", "job", "jobs", "hiring", "appointment letter", "registration fee", "exam fee", "upi"));
        KEYWORDS.put("Public safety", List.of("dam", "flood", "evacuate", "evacuation", "curfew", "riot", "violence", "earthquake", "cyclone", "stampede", "kidnap", "poison", "gas leak"));
        KEYWORDS.put("Doctored circular", List.of("circular", "notification", "gazette", "government order", "holiday", "schools closed", "colleges closed", "official notice", "letterhead"));
        KEYWORDS.put("Price rumour", List.of("price", "fare", "ticket", "hike", "petrol", "diesel", "milk", "gas cylinder", "tariff", "toll"));
    }

    /** Keyword rules, checked in order; a scheme rumour when nothing else fits. */
    public static String guessCategory(String text) {
        String t = " " + text.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}₹]+", " ") + " ";
        for (var e : KEYWORDS.entrySet())
            for (String k : e.getValue())
                if (t.contains(" " + k.replace("-", " ") + " ")) return e.getKey();
        return "Scheme rumour";
    }

    /** Script detection first (Kannada, Urdu), then the language the bot reported, then English. */
    public static String guessLanguage(String text, String reported) {
        if (text.codePoints().anyMatch(cp -> cp >= 0x0C80 && cp <= 0x0CFF)) return "Kannada";
        if (text.codePoints().anyMatch(cp -> cp >= 0x0600 && cp <= 0x06FF)) return "Urdu";
        if (reported != null && !reported.isBlank()) {
            String r = reported.trim();
            for (String l : List.of("Kannada", "English", "Urdu", "Tulu", "Konkani", "Hindi", "Telugu", "Tamil", "Marathi"))
                if (l.equalsIgnoreCase(r) || l.substring(0, 2).equalsIgnoreCase(r)) return l;
        }
        return "English";
    }

    private String matchDistrict(String d) {
        if (d == null || d.isBlank()) return null;
        String want = d.trim().replaceAll("\\s+", " ");
        for (String x : ref.districts()) if (x.equalsIgnoreCase(want)) return x;
        return null;
    }

    /** Digits only, Indian numbers get the 91 prefix. */
    public static String normalisePhone(String s) {
        if (s == null) return null;
        String d = s.replaceAll("\\D", "");
        if (d.length() == 10) d = "91" + d;
        if (d.length() == 11 && d.startsWith("0")) d = "91" + d.substring(1);
        return d.length() < 10 || d.length() > 15 ? null : d;
    }

    /** +91 90000 xxx01 style: enough to tell senders apart, not enough to call them. */
    public static String mask(String digits) {
        if (digits.length() < 6) return "xxxx";
        String cc = digits.length() > 10 ? "+" + digits.substring(0, digits.length() - 10) + " " : "";
        String n = digits.substring(digits.length() - 10);
        return cc + n.substring(0, 5) + " xxx" + n.substring(8);
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
