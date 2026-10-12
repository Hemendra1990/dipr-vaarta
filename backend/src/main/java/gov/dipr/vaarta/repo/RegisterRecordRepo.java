package gov.dipr.vaarta.repo;

import gov.dipr.vaarta.domain.RegisterRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface RegisterRecordRepo extends JpaRepository<RegisterRecord, Long> {

    /** Rows of one register within a user's scope. Null parameters mean "no restriction". */
    @Query("""
            select r from RegisterRecord r where r.registerId = :reg
              and (:district is null or r.district = :district)
              and (:dept is null or r.department is null or r.department = :dept)
              and (:vendor is null or r.vendorId is null or r.vendorId = :vendor)
            order by r.id""")
    List<RegisterRecord> findScoped(@Param("reg") String registerId, @Param("district") String district,
                                    @Param("dept") String department, @Param("vendor") String vendorId);

    long countByRegisterId(String registerId);

    @Modifying
    @Query("delete from RegisterRecord r where r.registerId = :reg")
    int deleteByRegister(@Param("reg") String registerId);

    /** Replace-mode import for a scoped user removes only the rows inside their scope. */
    @Modifying
    @Query("""
            delete from RegisterRecord r where r.registerId = :reg
              and (:district is null or r.district = :district)
              and (:dept is null or r.department = :dept)""")
    int deleteScoped(@Param("reg") String registerId, @Param("district") String district, @Param("dept") String department);

    @Query("""
            select count(r) from RegisterRecord r where r.registerId = :reg
              and (:district is null or r.district = :district)
              and (:dept is null or r.department is null or r.department = :dept)""")
    long countScoped(@Param("reg") String registerId, @Param("district") String district, @Param("dept") String department);
}
