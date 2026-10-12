package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.BudgetLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BudgetLineRepo extends JpaRepository<BudgetLine, Long> {
    @Query("select b from BudgetLine b where (:dept is null or b.department = :dept) order by b.id")
    List<BudgetLine> findScoped(@Param("dept") String department);

    @Modifying @Query("delete from BudgetLine b")
    int deleteAllRows();
}
