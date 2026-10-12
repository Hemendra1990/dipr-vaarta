package gov.dipr.vaarta.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.domain.BudgetLine;
import gov.dipr.vaarta.domain.SpendOrder;
import gov.dipr.vaarta.domain.Vendor;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.AdFlagRepo;
import gov.dipr.vaarta.repo.BudgetLineRepo;
import gov.dipr.vaarta.repo.SpendOrderRepo;
import gov.dipr.vaarta.repo.VendorRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.security.Role;
import gov.dipr.vaarta.service.AuditService;
import gov.dipr.vaarta.service.Calendar;
import gov.dipr.vaarta.service.RecordMapper;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Spend analytics data plus the release-order workflow: issue an RO, the vendor bills it, accounts pay it.
 * Budget lines (FY × department × channel) can be edited by the Commissioner and DD Accounts.
 */
@RestController
@RequestMapping("/api/spend")
public class SpendController {
    public static final String ISSUED = "RO issued", BILLED = "Billed", PAID = "Paid", CANCELLED = SpendOrder.CANCELLED;
    /** A bill may exceed the RO by at most this share (e.g. taxes, rounding). */
    public static final double BILL_TOLERANCE = 0.05;
    private static final Pattern RO = Pattern.compile("^RO/\\d{2}/(\\d+)$");

    private final SpendOrderRepo orders;
    private final BudgetLineRepo budget;
    private final VendorRepo vendors;
    private final RecordMapper mapper;
    private final AuditService audit;
    private final ReferenceData ref;
    private final Calendar cal;
    private final ObjectMapper om;
    private final AdFlagRepo flags;

    public SpendController(SpendOrderRepo orders, BudgetLineRepo budget, VendorRepo vendors, RecordMapper mapper, AuditService audit,
                           ReferenceData ref, Calendar cal, ObjectMapper om, AdFlagRepo flags) {
        this.orders = orders; this.budget = budget; this.vendors = vendors; this.mapper = mapper; this.audit = audit;
        this.ref = ref; this.cal = cal; this.om = om; this.flags = flags;
    }

    /**
     * Release orders in the user's scope: own district, own department or own vendor code.
     * {@code amount} is the figure spend analytics count (bill amount once billed or paid, else the order amount);
     * {@code orderAmount} is always the amount on the release order. Cancelled orders are left out unless
     * {@code cancelled=true}, so every spend figure built on this list ignores them.
     */
    @GetMapping("/orders")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> orders(@AuthenticationPrincipal CurrentUser u, @RequestParam(defaultValue = "false") boolean cancelled) {
        u.require("spend");
        return orders.findScoped(u.district(), u.department(), u.vendorId()).stream().filter(o -> cancelled || o.counts()).map(this::row).toList();
    }

    /** One order with its history, if it is in the user's scope. */
    @GetMapping("/orders/{id}")
    @Transactional(readOnly = true)
    public Map<String, Object> order(@AuthenticationPrincipal CurrentUser u, @PathVariable long id) {
        u.require("spend");
        SpendOrder o = scoped(u, id);
        Map<String, Object> m = row(o);
        m.put("history", history(o));
        return m;
    }

    public record IssueRequest(String campaignId, String campaign, String ctype, String department, String channel, String vendorId,
                               String district, String month, Double amount) {}

    /** Issue a release order. Commissioner and DD Accounts for any district; a DIO for their own district only. */
    @PostMapping("/orders")
    @Transactional
    public Map<String, Object> issue(@AuthenticationPrincipal CurrentUser u, @RequestBody IssueRequest r) {
        u.require("spend");
        u.requireRole(Role.COMMISSIONER, Role.DD_ACCOUNTS, Role.DIO);
        String campaignId = req(r.campaignId(), "Campaign id", 20);
        String campaign = req(r.campaign(), "Campaign name", 120);
        String ctype = oneOf(r.ctype(), "Campaign type", ref.reference().get("campaignTypes"));
        String dept = oneOf(r.department(), "Department", ref.reference().get("departments"));
        String channel = oneOf(r.channel(), "Channel", ref.reference().get("channels"));
        String district = req(r.district(), "District", 40);
        if (!"Statewide".equals(district) && !ref.isDistrict(district)) throw new IllegalArgumentException("Unknown district: " + district + ".");
        if (u.district() != null && !u.district().equals(district))
            throw new CurrentUser.AccessDeniedException("You can issue release orders for " + u.district() + " only.");
        Vendor v = vendors.findById(req(r.vendorId(), "Vendor", 20)).orElseThrow(() -> new IllegalArgumentException("Unknown vendor: " + r.vendorId() + "."));
        if (!v.channel.equals(channel)) throw new IllegalArgumentException(v.id + " is a " + v.channel + " vendor, not " + channel + ".");
        if (!v.district.equals(district))
            throw new IllegalArgumentException(v.id + " is a " + ("Statewide".equals(v.district) ? "statewide" : v.district) + " vendor, so it cannot take an order for "
                    + district + ".");
        YearMonth ym;
        try { ym = YearMonth.parse(req(r.month(), "Month", 7)); } catch (DateTimeParseException e) { throw new IllegalArgumentException("Month must look like 2026-10."); }
        String fy = Calendar.fyOf(ym);
        if (!cal.fys().contains(fy)) throw new IllegalArgumentException("Month must fall in " + cal.fys().get(0) + " to " + cal.currentFy() + ".");
        double amount = amount(r.amount(), "Amount");
        // a campaign keeps one type and one department across its orders
        orders.findFirstByCampaignIdOrderByIdAsc(campaignId).ifPresent(o -> {
            if (!Objects.equals(o.ctype, ctype) || !Objects.equals(o.department, dept))
                throw new IllegalArgumentException(campaignId + " is already a " + o.ctype + " campaign of " + o.department + ".");
        });

        SpendOrder o = new SpendOrder();
        o.roNo = nextRoNo(fy);
        o.fy = fy; o.month = ym.toString(); o.quarter = Calendar.quarterOf(ym);
        o.campaignId = campaignId; o.campaign = campaign; o.ctype = ctype; o.department = dept; o.channel = channel;
        o.vendorId = v.id; o.vendor = v.name; o.district = district; o.amount = amount; o.status = ISSUED;
        o.issuedBy = u.username(); o.issuedOn = LocalDate.now().toString();
        addHistory(o, u, "Release order issued", "₹" + lakh(amount) + " L to " + v.id + " for " + ym);
        orders.save(o);
        audit.record(u, "spend.issue", o.roNo + " · " + v.id + " · " + district + " · ₹" + lakh(amount) + " L · " + campaignId);
        return order(u, o.id);
    }

    public record BillRequest(String billNo, Double amount, String billDate) {}

    /** The vendor submits a bill against one of its own open release orders. */
    @PostMapping("/orders/{id}/bill")
    @Transactional
    public Map<String, Object> bill(@AuthenticationPrincipal CurrentUser u, @PathVariable long id, @RequestBody BillRequest r) {
        u.require("spend");
        u.requireRole(Role.VENDOR);
        SpendOrder o = scoped(u, id);
        if (!Objects.equals(u.vendorId(), o.vendorId)) throw new CurrentUser.AccessDeniedException("You can bill only your own release orders.");
        if (!ISSUED.equals(o.status)) throw new IllegalArgumentException(o.roNo + " is " + (CANCELLED.equals(o.status) ? "cancelled" : "already " + o.status.toLowerCase()) + ".");
        String billNo = req(r.billNo(), "Bill number", 40);
        double amt = amount(r.amount(), "Bill amount");
        double cap = Math.round(o.amount * (1 + BILL_TOLERANCE) * 100) / 100.0;
        if (amt > cap + 1e-9) throw new IllegalArgumentException("Bill amount can be at most ₹" + lakh(cap) + " L (order amount plus 5%).");
        LocalDate d = date(r.billDate(), "Bill date");
        o.billNo = billNo; o.billAmount = amt; o.billDate = d.toString(); o.status = BILLED;
        addHistory(o, u, "Bill submitted", "Bill " + billNo + " for ₹" + lakh(amt) + " L dated " + d);
        audit.record(u, "spend.bill", o.roNo + " · bill " + billNo + " · ₹" + lakh(amt) + " L");
        return order(u, o.id);
    }

    public record PayRequest(String paidOn, String reference) {}

    /** Accounts record payment of a billed release order. */
    @PostMapping("/orders/{id}/pay")
    @Transactional
    public Map<String, Object> pay(@AuthenticationPrincipal CurrentUser u, @PathVariable long id, @RequestBody PayRequest r) {
        u.require("spend");
        u.requireRole(Role.COMMISSIONER, Role.DD_ACCOUNTS);
        SpendOrder o = scoped(u, id);
        if (!BILLED.equals(o.status))
            throw new IllegalArgumentException(ISSUED.equals(o.status) ? o.roNo + " has not been billed yet."
                    : CANCELLED.equals(o.status) ? o.roNo + " is cancelled." : o.roNo + " is already paid.");
        flags.findById(o.roNo).filter(f -> "Payment withheld".equals(f.reviewStatus)).ifPresent(f -> {
            throw new IllegalArgumentException("Payment for " + o.roNo + " is withheld after the release-order audit: " + f.outcomeNote);
        });
        String refNo = req(r.reference(), "Payment reference", 60);
        LocalDate d = date(r.paidOn(), "Payment date");
        if (o.billDate != null && d.isBefore(LocalDate.parse(o.billDate))) throw new IllegalArgumentException("Payment date cannot be before the bill date (" + o.billDate + ").");
        o.paidOn = d.toString(); o.paymentRef = refNo; o.status = PAID;
        addHistory(o, u, "Marked paid", "Paid on " + d + ", reference " + refNo);
        audit.record(u, "spend.pay", o.roNo + " · " + refNo + " · " + d);
        return order(u, o.id);
    }

    public record CancelRequest(String reason) {}

    /** Cancel a release order that has not been billed yet. Commissioner and DD Accounts only; a reason is required. */
    @PostMapping("/orders/{id}/cancel")
    @Transactional
    public Map<String, Object> cancel(@AuthenticationPrincipal CurrentUser u, @PathVariable long id, @RequestBody CancelRequest r) {
        u.require("spend");
        u.requireRole(Role.COMMISSIONER, Role.DD_ACCOUNTS);
        SpendOrder o = scoped(u, id);
        if (!ISSUED.equals(o.status))
            throw new IllegalArgumentException(CANCELLED.equals(o.status) ? o.roNo + " is already cancelled."
                    : o.roNo + " is already " + o.status.toLowerCase() + ", so it can no longer be cancelled.");
        String reason = req(r == null ? null : r.reason(), "Reason", 300);
        o.status = CANCELLED; o.cancelledBy = u.username(); o.cancelledOn = LocalDate.now().toString(); o.cancelReason = reason;
        addHistory(o, u, "Release order cancelled", reason);
        audit.record(u, "spend.cancel", o.roNo + " · " + o.vendorId + " · ₹" + lakh(o.amount) + " L · " + reason);
        return order(u, o.id);
    }

    /** Budget lines. Budgets are set at state level by department and channel, so vendors and district users get none. */
    @GetMapping("/budget")
    public List<BudgetLine> budget(@AuthenticationPrincipal CurrentUser u) {
        u.require("spend");
        if (u.vendorId() != null || u.district() != null) return List.of();
        return budget.findScoped(u.department());
    }

    public record BudgetRequest(String fy, String department, String channel, Double budget) {}

    /** Set one budget line (FY × department × channel), creating it if missing. Commissioner and DD Accounts only. */
    @PutMapping("/budget")
    @Transactional
    public BudgetLine setBudget(@AuthenticationPrincipal CurrentUser u, @RequestBody BudgetRequest r) {
        u.require("spend");
        u.requireRole(Role.COMMISSIONER, Role.DD_ACCOUNTS);
        String fy = req(r.fy(), "Financial year", 10);
        if (!cal.fys().contains(fy)) throw new IllegalArgumentException("Financial year must be one of " + String.join(", ", cal.fys()) + ".");
        String dept = oneOf(r.department(), "Department", ref.reference().get("departments"));
        String channel = oneOf(r.channel(), "Channel", ref.reference().get("channels"));
        if (r.budget() == null || r.budget().isNaN() || r.budget() < 0 || r.budget() > 100000)
            throw new IllegalArgumentException("Budget must be between 0 and 1,00,000 (₹ lakh).");
        double value = Math.round(r.budget() * 100) / 100.0;
        List<BudgetLine> found = budget.findByFyAndDepartmentAndChannel(fy, dept, channel);
        BudgetLine b;
        Double before = null;
        if (found.isEmpty()) {
            b = new BudgetLine();
            b.fy = fy; b.department = dept; b.channel = channel;
        } else {
            b = found.get(0);
            before = b.budget;
            // duplicate lines (from uploads) are folded into one so the total equals what was set
            for (int i = 1; i < found.size(); i++) budget.delete(found.get(i));
        }
        b.budget = value;
        budget.save(b);
        audit.record(u, "spend.budget", fy + " · " + dept + " · " + channel + " · " + (before == null ? "new" : "₹" + lakh(before) + " L") + " → ₹" + lakh(value) + " L");
        return b;
    }

    @GetMapping("/vendors")
    public List<Vendor> vendors(@AuthenticationPrincipal CurrentUser u) {
        u.require("spend");
        return vendors.findAll().stream().filter(v -> u.vendorId() == null || u.vendorId().equals(v.id)).toList();
    }

    // ---- helpers ----

    private Map<String, Object> row(SpendOrder o) {
        Map<String, Object> m = mapper.fromSpend(o);
        m.put("id", o.id);
        m.put("orderAmount", o.amount);
        m.put("amount", o.spendAmount());
        if (o.billNo != null) { m.put("billNo", o.billNo); m.put("billAmount", o.billAmount); m.put("billDate", o.billDate); }
        if (o.paidOn != null) { m.put("paidOn", o.paidOn); m.put("paymentRef", o.paymentRef); }
        if (o.issuedBy != null) { m.put("issuedBy", o.issuedBy); m.put("issuedOn", o.issuedOn); }
        if (o.cancelledBy != null) { m.put("cancelledBy", o.cancelledBy); m.put("cancelledOn", o.cancelledOn); m.put("cancelReason", o.cancelReason); }
        return m;
    }

    /** Loads an order and checks it is inside the user's district, department and vendor scope. */
    private SpendOrder scoped(CurrentUser u, long id) {
        SpendOrder o = orders.findById(id).orElseThrow(() -> new NoSuchElementException("No such release order."));
        if (!u.districtOk(o.district) || !u.scopeOk(o.department, o.vendorId))
            throw new CurrentUser.AccessDeniedException("This release order is outside your scope.");
        return o;
    }

    /** Next RO number in the seed format RO/&lt;FY start yy&gt;/&lt;5-digit running serial&gt;; the serial runs across years. */
    private String nextRoNo(String fy) {
        int max = 0;
        for (String no : orders.allRoNumbers()) {
            if (no == null) continue;
            Matcher m = RO.matcher(no);
            if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
        }
        return "RO/" + fy.substring(2, 4) + "/" + String.format("%05d", max + 1);
    }

    private List<Map<String, Object>> history(SpendOrder o) {
        if (o.history == null || o.history.isBlank()) return new ArrayList<>();
        try { return om.readValue(o.history, new TypeReference<>() {}); } catch (Exception e) { return new ArrayList<>(); }
    }

    private void addHistory(SpendOrder o, CurrentUser u, String action, String note) {
        List<Map<String, Object>> h = history(o);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Instant.now().toString()); e.put("by", u.username()); e.put("action", action); e.put("note", note);
        h.add(e);
        try { o.history = om.writeValueAsString(h); } catch (Exception ex) { throw new IllegalStateException(ex); }
    }

    private static String req(String v, String what, int max) {
        if (v == null || v.isBlank()) throw new IllegalArgumentException(what + " is required.");
        String t = v.trim();
        if (t.length() > max) throw new IllegalArgumentException(what + " can be at most " + max + " characters.");
        return t;
    }

    private static String oneOf(String v, String what, com.fasterxml.jackson.databind.JsonNode allowed) {
        String t = req(v, what, 80);
        for (var n : allowed) if (n.asText().equals(t)) return t;
        throw new IllegalArgumentException("Unknown " + what.toLowerCase() + ": " + t + ".");
    }

    private static double amount(Double v, String what) {
        if (v == null || v.isNaN() || v <= 0) throw new IllegalArgumentException(what + " must be more than zero.");
        if (v > 10000) throw new IllegalArgumentException(what + " can be at most ₹10,000 L for one order.");
        return Math.round(v * 100) / 100.0;
    }

    private static LocalDate date(String v, String what) {
        LocalDate d;
        if (v == null || v.isBlank()) d = LocalDate.now();
        else try { d = LocalDate.parse(v.trim()); } catch (DateTimeParseException e) { throw new IllegalArgumentException(what + " must look like 2026-10-12."); }
        if (d.isAfter(LocalDate.now())) throw new IllegalArgumentException(what + " cannot be in the future.");
        return d;
    }

    private static String lakh(double v) { return String.format("%.2f", v); }
}
