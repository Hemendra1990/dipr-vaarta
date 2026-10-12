package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

/** A phone number registered with the WhatsApp bot as a District Information Office. Messages from it can post to the ground feed. */
@Entity
@Table(name = "bot_contact")
public class BotContact {
    /** Digits only, with country code (e.g. 919000010001). */
    @Id @Column(length = 20) public String phone;
    public String district;
    public String name;
    /** The console login of this officer, if any. */
    public String username;
    public boolean active = true;
}
