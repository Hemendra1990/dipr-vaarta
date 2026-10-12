package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.AgentRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentRunRepo extends JpaRepository<AgentRun, Long> {
    List<AgentRun> findTop20ByOrderByStartedAtDesc();

    List<AgentRun> findTop50ByOrderByStartedAtDesc();

    List<AgentRun> findBySentToAndStatusOrderByDecidedAtDesc(String sentTo, String status);
}
