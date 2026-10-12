package gov.dipr.vaarta;

import gov.dipr.vaarta.config.VaartaProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(VaartaProperties.class)
public class VaartaApplication {
    public static void main(String[] args) {
        SpringApplication.run(VaartaApplication.class, args);
    }
}
