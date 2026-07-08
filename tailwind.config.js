/** @type {import('tailwindcss').Config} */

// Hex values and font-family names live in design-tokens.json — the single
// source of truth, shared with lib/theme.ts. See DESIGN_SYSTEM_PLAN.md.
const tokens = require("./design-tokens.json");

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: tokens.colors,
      // Each weight is its own family (Oswald_700Bold, not Oswald @ 700).
      // Never combine these with font-bold / font-semibold.
      fontFamily: tokens.fontFamily,
    },
  },
  plugins: [],
};
