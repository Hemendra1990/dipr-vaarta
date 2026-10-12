"use client";
import { useApp } from "@/lib/store";
import { Ads } from "./Ads";
import { AIView } from "./AIView";
import { Offices } from "./Offices";
import { Overview } from "./Overview";
import { Press } from "./Press";
import { RegisterView } from "./RegisterView";
import { Spend } from "./Spend";
import { Tipline } from "./Tipline";
import { UploadView } from "./UploadView";

/** Picks the module view for the current tab. */
export function ViewSwitch() {
  const { tab, meta } = useApp();
  switch (tab) {
    case "overview":
      return <Overview />;
    case "tipline":
      return <Tipline />;
    case "press":
      return <Press />;
    case "ads":
      return <Ads />;
    case "offices":
      return <Offices />;
    case "ai":
      return <AIView />;
    case "spend":
      return <Spend />;
    case "upload":
      return <UploadView />;
  }
  const def = meta.registers.find((r) => r.id === tab);
  return def ? <RegisterView def={def} /> : <div className="empty">This module is not available to your login.</div>;
}
