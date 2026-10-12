package gov.dipr.vaarta.reference;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

/** Geography, enumerations and register definitions, loaded once from the seed resources. */
@Component
public class ReferenceData {
    private final JsonNode reference;
    private final List<RegisterDef> registers;
    private final Map<String, RegisterDef> registerById = new LinkedHashMap<>();
    private final List<DatasetDef> datasets = new ArrayList<>();
    private final Map<String, String> divisionOf = new HashMap<>();
    private final List<String> districts = new ArrayList<>();

    public ReferenceData(ObjectMapper om) throws IOException {
        this.reference = read(om, "reference.json", new TypeReference<JsonNode>() {});
        this.registers = read(om, "registers.json", new TypeReference<List<RegisterDef>>() {});
        registers.forEach(r -> registerById.put(r.id(), r));
        Map<String, List<FieldDef>> ds = read(om, "datasets.json", new TypeReference<Map<String, List<FieldDef>>>() {});
        datasets.add(new DatasetDef("spend", "Campaign spend (release orders)", "Spend", ds.get("spend"), "spend"));
        datasets.add(new DatasetDef("budget", "Budget by department and channel", "Spend", ds.get("budget"), "spend"));
        registers.forEach(r -> datasets.add(new DatasetDef(r.id(), r.title(), r.group(), r.schema(), r.id())));
        reference.get("divisions").fields().forEachRemaining(e -> e.getValue().forEach(d -> {
            divisionOf.put(d.asText(), e.getKey());
            districts.add(d.asText());
        }));
    }

    private static <T> T read(ObjectMapper om, String name, TypeReference<T> type) throws IOException {
        try (InputStream in = new ClassPathResource("seed/" + name).getInputStream()) {
            return om.readValue(in, type);
        }
    }

    public JsonNode reference() { return reference; }
    public List<RegisterDef> registers() { return registers; }
    public Optional<RegisterDef> register(String id) { return Optional.ofNullable(registerById.get(id)); }
    public List<DatasetDef> datasets() { return datasets; }
    public Optional<DatasetDef> dataset(String id) { return datasets.stream().filter(d -> d.id().equals(id)).findFirst(); }
    public List<String> districts() { return districts; }
    public String divisionOf(String district) { return divisionOf.get(district); }
    public boolean isDistrict(String name) { return divisionOf.containsKey(name); }
}
