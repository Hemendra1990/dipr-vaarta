#!/usr/bin/env node
// WhatsApp bot simulator: posts sample messages to the console's bot webhook and prints the reply the bot would send.
//
//   node tools/bot-sim.mjs                 send every sample once, 3 s apart
//   node tools/bot-sim.mjs claim pulse     send only these samples
//   node tools/bot-sim.mjs --every 20      keep sending a random sample every 20 s (Ctrl+C to stop)
//   node tools/bot-sim.mjs --text "Free laptops for all students" --district Mysuru
//
// Settings (env): BOT_URL (default http://localhost:8080/api/bot/inbound), VAARTA_BOT_KEY (default vaarta-dev-bot-key).
// The demo DIO numbers are +91 90000 1nnnn by district order; Raichur is +91 90000 10027.

const URL_ = process.env.BOT_URL || "http://localhost:8080/api/bot/inbound";
const KEY = process.env.VAARTA_BOT_KEY || "vaarta-dev-bot-key";
const RAICHUR_DIO = "+91 90000 10027";
const KOPPAL_DIO = "+91 90000 10028";
const citizen = () => "+91 9" + String(Math.floor(100000000 + Math.random() * 899999999));

const SAMPLES = {
  claim: () => ({ from: citizen(), text: "Recruitment notice: 1,200 panchayat clerk posts, pay ₹400 exam fee by UPI before Sunday", district: "Vijayapura", forwards: 340 }),
  kannada: () => ({ from: citizen(), text: "ಅನ್ನ ಭಾಗ್ಯ ಯೋಜನೆ ಮುಂದಿನ ತಿಂಗಳಿನಿಂದ ಸ್ಥಗಿತ ಎಂದು ಸಂದೇಶ", district: "Raichur", forwards: 120 }),
  video: () => ({ from: citizen(), text: "Video of the Chief Minister announcing free electricity for shops (looks edited)", district: "Bengaluru Urban", forwards: 900 }),
  dup: () => ({ from: citizen(), text: "Fwd: Gruha Lakshmi will stop from November!! Re-apply on this link before Friday", district: "Koppal", forwards: 45 }),
  pulse: () => ({ from: RAICHUR_DIO, type: "pulse", scheme: "Gruha Lakshmi", sentiment: "Mixed", text: "Women at the Manvi camp say the October credit is late; bank mitras are asking for e-KYC again." }),
  report: () => ({ from: KOPPAL_DIO, text: "REPORT: 2 events covered, 1 release issued, press meet at Gangavathi went well." }),
  esc: () => ({ from: RAICHUR_DIO, type: "esc", text: "GRV-RCR-2311 · Old-age pension not credited for 3 months (Devadurga taluk)." }),
  coverage: () => ({ from: KOPPAL_DIO, type: "rel", text: "Coverage: photos and a 40-second clip of the Yuva Nidhi camp at Koppal uploaded to the archive." }),
  stranger: () => ({ from: citizen(), type: "pulse", text: "I am not a DIO but here is a field pulse" }),
};

async function send(name, msg) {
  const res = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Vaarta-Bot-Key": KEY }, body: JSON.stringify(msg) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`✗ ${name}: HTTP ${res.status} ${body.message || ""}`);
    return;
  }
  console.log(`${body.accepted ? "✓" : "·"} ${name.padEnd(9)} ${body.kind}${body.id ? " " + body.id : ""}${body.status ? " (" + body.status + ")" : ""}\n    bot → ${body.reply}`);
}

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (opt("--text")) {
  await send("custom", { from: opt("--from") || citizen(), type: opt("--type"), text: opt("--text"), district: opt("--district"), lang: opt("--lang") });
} else if (opt("--every")) {
  const s = Math.max(2, +opt("--every")) * 1000;
  const names = Object.keys(SAMPLES).filter((n) => n !== "stranger");
  for (;;) {
    const n = names[Math.floor(Math.random() * names.length)];
    await send(n, SAMPLES[n]()).catch((e) => console.log(`✗ ${n}: ${e.message}`));
    await sleep(s);
  }
} else {
  const picked = args.filter((a) => SAMPLES[a]);
  const names = picked.length ? picked : Object.keys(SAMPLES);
  for (let i = 0; i < names.length; i++) {
    await send(names[i], SAMPLES[names[i]]()).catch((e) => console.log(`✗ ${names[i]}: ${e.message}`));
    if (i < names.length - 1) await sleep(3000);
  }
}
