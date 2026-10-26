/** @type {import('tailwindcss').Config} */
// Every value points at a CSS token in src/app/globals.css (docs/ui/DESIGN.md §2).
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)", surface: "var(--surface)", raised: "var(--raised)", active: "var(--active)",
        border: "var(--border)", rule: "var(--rule)", control: "var(--control)",
        text: "var(--text)", muted: "var(--muted)", faint: "var(--faint)",
        accent: { DEFAULT: "var(--accent)", soft: "var(--accent-soft)", track: "var(--accent-track)", ink: "var(--accent-ink)" },
        primary: { DEFAULT: "var(--primary)", ink: "var(--primary-ink)" },
        positive: "var(--positive)", negative: "var(--negative)", warning: "var(--warning)",
      },
      fontFamily: { sans: ["var(--font)"] },
      fontSize: { micro: "12px", small: "13px", body: "14px", section: "16px", kpi: "24px", title: "28px", lead: "32px" },
      borderRadius: { card: "8px", control: "6px" },
    },
  },
  plugins: [],
};
