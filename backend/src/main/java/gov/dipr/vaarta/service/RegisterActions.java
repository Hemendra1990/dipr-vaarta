package gov.dipr.vaarta.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Named one-click actions of the registers, for the steps the module text promises but "Move to next stage" cannot
 * express: renewing an empanelment, returning a bill for proof, replying to an RTI, recording a utilisation
 * certificate, rejecting an application. Each action moves the record from one of {@code from} to {@code to} and may
 * set other fields. Guards that need data (dates, audit figures) are checked in {@link RegisterService#act}.
 */
public final class RegisterActions {
    public record Action(String register, String key, String label, List<String> from, String to, Map<String, String> set, String hint) {}

    public static final List<Action> ALL = List.of(
            new Action("empanel", "renew", "Renew for one year", List.of("Renewal due", "Expired", "Suspended"), "Active", Map.of(),
                    "Extends validity by a year from the later of today and the current end date. Needs an audited figure on file."),
            new Action("empanel", "suspend", "Suspend", List.of("Active", "Renewal due"), "Suspended", Map.of(),
                    "Stops new release orders to this vendor."),
            new Action("bills", "return", "Return for proof", List.of("Received", "Proof check"), "Returned", Map.of("proof", "Missing"),
                    "Sends the bill back to the vendor for proof of publication or broadcast."),
            new Action("bills", "proof", "Proof received", List.of("Returned"), "Proof check", Map.of("proof", "Attached"),
                    "The vendor sent the missing proof; the bill goes back to proof check."),
            new Action("welfare", "return", "Return for documents", List.of("Received", "Verified"), "Returned", Map.of(),
                    "Sends the case back to the journalist for a missing document."),
            new Action("welfare", "resubmit", "Documents received", List.of("Returned"), "Received", Map.of(),
                    "The journalist sent the missing document; the case starts again."),
            new Action("rti", "reply", "Mark replied", List.of("Received", "Information sought"), "Replied", Map.of(),
                    "The reply has gone to the applicant."),
            new Action("rti", "close", "Close", List.of("Replied", "First appeal"), "Closed", Map.of(), "No further action."),
            new Action("rti", "appeal", "First appeal filed", List.of("Closed"), "First appeal", Map.of(),
                    "The applicant appealed against the reply."),
            new Action("grants", "uc", "UC received", List.of("Released", "UC due", "UC overdue"), "UC received", Map.of(),
                    "The body submitted its utilisation certificate."),
            new Action("grants", "overdue", "Mark UC overdue", List.of("Released", "UC due"), "UC overdue", Map.of(),
                    "Only after the UC due date has passed."),
            new Action("film", "reject", "Reject", List.of("Received", "Screening", "Committee decision"), "Rejected", Map.of(), ""),
            new Action("election", "reject", "Reject", List.of("Received", "Under review"), "Rejected", Map.of(), ""),
            new Action("election", "refer", "Refer to Returning Officer", List.of("Received", "Under review"), "Referred to Returning Officer", Map.of(), ""),
            new Action("events", "skip", "No release needed", List.of("Pending"), "Not needed", Map.of(), ""),
            new Action("field", "hold", "Put on hold", List.of("Logged", "Geo-verified", "Approved"), "On hold", Map.of(),
                    "Holds payment until the geo-tagged proof is fixed."),
            new Action("field", "verify", "Proof checked", List.of("On hold"), "Geo-verified", Map.of("geo", "Verified"),
                    "Photo, location and time now match the plan.")
    );

    public static List<Action> of(String register) {
        return ALL.stream().filter(a -> a.register().equals(register)).toList();
    }

    public static Optional<Action> find(String register, String key) {
        return ALL.stream().filter(a -> a.register().equals(register) && a.key().equals(key)).findFirst();
    }

    private RegisterActions() {}
}
