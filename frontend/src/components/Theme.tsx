"use client";
import { useEffect, useState } from "react";

function curTheme(): "dark" | "light" {
  const t = document.documentElement.dataset.theme;
  return (t as "dark" | "light") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** Light/dark toggle; the choice is remembered per browser. */
export function ThemeButton() {
  const [label, setLabel] = useState("Dark");
  useEffect(() => setLabel(curTheme() === "dark" ? "Light" : "Dark"), []);
  return (
    <button
      className="iconbtn themeBtn"
      type="button"
      aria-label="Toggle light or dark theme"
      onClick={() => {
        const n = curTheme() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = n;
        try {
          localStorage.setItem("v360-theme", n);
        } catch {
          /* storage blocked */
        }
        setLabel(n === "dark" ? "Light" : "Dark");
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <span className="themeTxt">{label}</span>
    </button>
  );
}
