package gov.dipr.vaarta.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import gov.dipr.vaarta.domain.BudgetLine;
import gov.dipr.vaarta.domain.RegisterRecord;
import gov.dipr.vaarta.domain.SpendOrder;
import gov.dipr.vaarta.reference.RegisterDef;
import gov.dipr.vaarta.reference.ReferenceData;
import org.springframework.stereotype.Component;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

/** Converts between the row maps used by seed files, uploads and the API, and the stored entities. */
@Component
public class RecordMapper {
    private final ObjectMapper om;
    private final ReferenceData ref;

    public RecordMapper(ObjectMapper om, ReferenceData ref) { this.om = om; this.ref = ref; }

    /**
     * The taluk as spelt in the reference list when it belongs to the district; null when empty, statewide or not a
     * taluk of that district (a stale taluk left behind after the district was changed is dropped, not kept).
     */
    private String taluk(Object district, Object taluk) {
        if (district == null || taluk == null || "".equals(taluk)) return null;
        return ref.talukOf(district.toString(), taluk.toString());
    }

    private static String s(Object o) { return o == null || "".equals(o) ? null : o.toString(); }

    private static double d(Object o) { return o instanceof Number n ? n.doubleValue() : o == null || "".equals(o) ? 0 : Double.parseDouble(o.toString()); }

    public SpendOrder toSpend(Map<String, Object> m) {
        SpendOrder o = new SpendOrder();
        o.roNo = s(m.get("roNo")); o.month = s(m.get("month"));
        YearMonth ym = YearMonth.parse(o.month);
        o.fy = m.get("fy") != null ? s(m.get("fy")) : Calendar.fyOf(ym);
        o.quarter = m.get("quarter") != null ? s(m.get("quarter")) : Calendar.quarterOf(ym);
        o.campaignId = s(m.get("campaignId")); o.campaign = s(m.get("campaign")); o.ctype = s(m.get("ctype"));
        o.department = s(m.get("department")); o.channel = s(m.get("channel")); o.vendorId = s(m.get("vendorId"));
        o.vendor = s(m.get("vendor")); o.district = s(m.get("district")); o.amount = d(m.get("amount")); o.status = s(m.get("status"));
        o.taluk = taluk(o.district, m.get("taluk"));
        return o;
    }

    public Map<String, Object> fromSpend(SpendOrder o) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("roNo", o.roNo); m.put("fy", o.fy); m.put("month", o.month); m.put("quarter", o.quarter); m.put("campaignId", o.campaignId);
        m.put("campaign", o.campaign); m.put("ctype", o.ctype); m.put("department", o.department); m.put("channel", o.channel);
        m.put("vendorId", o.vendorId); m.put("vendor", o.vendor); m.put("district", o.district); m.put("taluk", o.taluk); m.put("amount", o.amount); m.put("status", o.status);
        return m;
    }

    public BudgetLine toBudget(Map<String, Object> m) {
        BudgetLine b = new BudgetLine();
        b.fy = s(m.get("fy")); b.department = s(m.get("department")); b.channel = s(m.get("channel")); b.budget = d(m.get("budget"));
        return b;
    }

    public RegisterRecord toRecord(String registerId, Map<String, Object> row, Long uploadId) {
        RegisterRecord r = new RegisterRecord();
        r.registerId = registerId;
        row.remove("_id");
        Object dist = row.get("district");
        if (dist == null || "".equals(dist)) {
            row.put("district", "Statewide");
            dist = "Statewide";
        }
        r.district = dist.toString();
        // Seed-only marker for rows added to fill drill-down gaps; never stored or shown.
        row.remove("supplementary");
        Object tk = row.get("taluk");
        if (tk != null) {
            String t = taluk(r.district, tk);
            if (t != null) row.put("taluk", t);
            else if (hasTalukField(registerId) && !"".equals(tk))
                throw new IllegalArgumentException(tk + " is not a taluk of " + r.district + ".");
            else if (!hasTalukField(registerId)) row.remove("taluk");
        }
        r.department = s(row.get("department"));
        r.vendorId = s(row.get("vendorId"));
        r.uploadId = uploadId;
        try {
            r.data = om.writeValueAsString(row);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        return r;
    }

    private boolean hasTalukField(String registerId) {
        return ref.register(registerId).map(RegisterDef::schema).orElse(java.util.List.of()).stream().anyMatch(f -> f.k().equals("taluk"));
    }

    /** The stored row, plus its database id as {@code _id} so the API can address it for edits. */
    public Map<String, Object> fromRecord(RegisterRecord r) {
        try {
            LinkedHashMap<String, Object> m = om.readValue(r.data, new TypeReference<LinkedHashMap<String, Object>>() {});
            if (r.id != null) m.put("_id", r.id);
            return m;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
