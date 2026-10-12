package gov.dipr.vaarta.web;

import gov.dipr.vaarta.domain.BudgetLine;
import gov.dipr.vaarta.domain.Vendor;
import gov.dipr.vaarta.repo.BudgetLineRepo;
import gov.dipr.vaarta.repo.SpendOrderRepo;
import gov.dipr.vaarta.repo.VendorRepo;
import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.RecordMapper;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/spend")
public class SpendController {
    private final SpendOrderRepo orders;
    private final BudgetLineRepo budget;
    private final VendorRepo vendors;
    private final RecordMapper mapper;

    public SpendController(SpendOrderRepo orders, BudgetLineRepo budget, VendorRepo vendors, RecordMapper mapper) {
        this.orders = orders; this.budget = budget; this.vendors = vendors; this.mapper = mapper;
    }

    /** Release orders in the user's scope: own district, own department or own vendor code. */
    @GetMapping("/orders")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> orders(@AuthenticationPrincipal CurrentUser u) {
        u.require("spend");
        return orders.findScoped(u.district(), u.department(), u.vendorId()).stream().map(mapper::fromSpend).toList();
    }

    /** Budget lines. Budgets are set at state level by department and channel, so vendors and district users get none. */
    @GetMapping("/budget")
    public List<BudgetLine> budget(@AuthenticationPrincipal CurrentUser u) {
        u.require("spend");
        if (u.vendorId() != null || u.district() != null) return List.of();
        return budget.findScoped(u.department());
    }

    @GetMapping("/vendors")
    public List<Vendor> vendors(@AuthenticationPrincipal CurrentUser u) {
        u.require("spend");
        return vendors.findAll().stream().filter(v -> u.vendorId() == null || u.vendorId().equals(v.id)).toList();
    }
}
