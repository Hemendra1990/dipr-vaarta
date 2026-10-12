package gov.dipr.vaarta.domain;

import jakarta.persistence.*;

import java.time.Instant;

/** Ground feed from district offices: field pulse, daily report, escalation or coverage. */
@Entity
@Table(name = "feed_item")
public class FeedItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(length = 20) public String type;
    public String district;
    public String scheme;
    public String sentiment;
    @Column(length = 1000) public String note;
    public String author;
    public Instant createdAt;
    /** "WhatsApp" when sent through the bot, "Console" when posted in the app; null for sample data. */
    @Column(length = 20) public String channel;
    /** Username (or bot:&lt;phone&gt;) that created the item; used to skip your own items in live updates. */
    public String createdBy;
}
