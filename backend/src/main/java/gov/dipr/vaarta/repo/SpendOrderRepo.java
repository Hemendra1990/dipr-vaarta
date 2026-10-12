package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.SpendOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SpendOrderRepo extends JpaRepository<SpendOrder, Long> {
    @Query("""
            select s from SpendOrder s where (:district is null or s.district = :district)
              and (:dept is null or s.department = :dept)
              and (:vendor is null or s.vendorId = :vendor)
            order by s.id""")
    List<SpendOrder> findScoped(@Param("district") String district, @Param("dept") String department, @Param("vendor") String vendorId);

    @Modifying @Query("delete from SpendOrder s")
    int deleteAllRows();
}
