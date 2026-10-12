// Navigation groups and labels, exactly as the prototype's NAV.
export const NAV: { g: string; items: [string, string][] }[] = [
  { g: "Command", items: [["overview", "Command overview"], ["ai", "AI agents"]] },
  { g: "Outreach", items: [["tipline", "Tipline & claims"], ["media", "Media monitoring"], ["social", "Social media"], ["crisis", "Crisis advisories"]] },
  { g: "Spend", items: [["spend", "Spend analytics"], ["campaigns", "Campaigns"], ["empanel", "Empanelment"], ["bills", "Bills & payments"], ["ads", "Release-order audit"]] },
  { g: "Press & media", items: [["press", "Press & journalists"], ["welfare", "Journalist welfare"], ["events", "Events & coverage"], ["election", "Election period"]] },
  { g: "Field", items: [["offices", "District offices"], ["field", "Field & folk publicity"], ["outdoor", "Outdoor displays"]] },
  { g: "Culture & records", items: [["film", "Film sector"], ["publications", "Publications"], ["archive", "Photo & film archive"], ["grants", "Academies & grants"]] },
  { g: "Administration", items: [["admin", "Offices & staff"], ["rti", "RTI applications"], ["upload", "Data upload"], ["users", "Users & access"], ["audit", "Audit log"]] },
];

/** Modules that use the outreach drill and the global Period / Scheme / Language / Audience slicers. */
export const OUTREACH = new Set(["overview", "tipline", "press", "offices", "ai", "ads"]);

export const LBL: Record<string, string> = {};
NAV.forEach((g) => g.items.forEach(([k, l]) => (LBL[k] = l)));
