package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.BotContact;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BotContactRepo extends JpaRepository<BotContact, String> {
}
