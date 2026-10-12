package gov.dipr.vaarta.web;

import gov.dipr.vaarta.security.CurrentUser;
import gov.dipr.vaarta.service.AgentService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agents")
public class AgentController {
    private final AgentService agents;

    public AgentController(AgentService agents) { this.agents = agents; }

    @GetMapping
    public List<AgentService.AgentAccess> list(@AuthenticationPrincipal CurrentUser u) {
        return agents.cards(u);
    }

    /** Approved agent reports addressed to the Commissioner. */
    @GetMapping("/inbox")
    public List<Map<String, Object>> inbox(@AuthenticationPrincipal CurrentUser u) { return agents.inbox(u); }

    @GetMapping("/runs")
    public List<Map<String, Object>> runs(@AuthenticationPrincipal CurrentUser u) { return agents.recent(u); }

    public record RunRequest(String target, Map<String, Object> context) {}

    @PostMapping("/{agentId}/runs")
    public Map<String, Object> run(@AuthenticationPrincipal CurrentUser u, @PathVariable String agentId, @RequestBody(required = false) RunRequest req) {
        return agents.run(u, agentId, req == null ? null : req.target(), req == null ? null : req.context());
    }

    @PostMapping("/runs/{id}/approve")
    public Map<String, Object> approve(@AuthenticationPrincipal CurrentUser u, @PathVariable long id) { return agents.approve(u, id); }

    public record RejectRequest(String comment) {}

    @PostMapping("/runs/{id}/reject")
    public Map<String, Object> reject(@AuthenticationPrincipal CurrentUser u, @PathVariable long id, @RequestBody(required = false) RejectRequest req) {
        return agents.reject(u, id, req == null ? null : req.comment());
    }
}
