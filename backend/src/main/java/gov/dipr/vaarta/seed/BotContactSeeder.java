package gov.dipr.vaarta.seed;

import gov.dipr.vaarta.domain.AppUser;
import gov.dipr.vaarta.domain.BotContact;
import gov.dipr.vaarta.reference.ReferenceData;
import gov.dipr.vaarta.repo.AppUserRepo;
import gov.dipr.vaarta.repo.BotContactRepo;
import gov.dipr.vaarta.security.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Registers one demo WhatsApp number per District Information Office the first time the app starts:
 * +91 90000 1nnnn, where nnnn is the district's position in the reference list (Raichur is +91 90000 10027).
 * Runs after the sample data loader so DIO logins can be linked.
 */
@Component
public class BotContactSeeder {
    private static final Logger log = LoggerFactory.getLogger(BotContactSeeder.class);
    private final BotContactRepo contacts;
    private final AppUserRepo users;
    private final ReferenceData ref;

    public BotContactSeeder(BotContactRepo contacts, AppUserRepo users, ReferenceData ref) {
        this.contacts = contacts; this.users = users; this.ref = ref;
    }

    public static String demoPhone(int index) { return "91900001" + String.format("%04d", index + 1); }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        if (contacts.count() > 0) return;
        List<AppUser> dios = users.findAll().stream().filter(u -> u.getRole() == Role.DIO && u.getDistrict() != null).toList();
        List<BotContact> out = new ArrayList<>();
        List<String> ds = ref.districts();
        for (int i = 0; i < ds.size(); i++) {
            String d = ds.get(i);
            BotContact c = new BotContact();
            c.phone = demoPhone(i);
            c.district = d;
            c.name = "DIO, " + d;
            c.username = dios.stream().filter(u -> d.equals(u.getDistrict())).map(AppUser::getUsername).findFirst().orElse(null);
            out.add(c);
        }
        contacts.saveAll(out);
        log.info("Registered {} demo district office numbers with the WhatsApp bot", out.size());
    }
}
