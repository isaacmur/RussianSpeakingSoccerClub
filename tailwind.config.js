/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Team-sheet / scoreboard palette (see WEEKEND_LEAGUE_PLAN.md §14)
        ink: "#111A2E", // scoreboard headers, primary text, dark surfaces
        chalk: "#F4F1E8", // app background (warm paper)
        card: "#FFFFFF", // cards, rows
        line: "#E7E2D3", // hairline dividers / borders
        pitch: "#1F7A46", // positive states, primary CTA, "you"
        boot: "#F1571C", // goals, Golden Boot, urgent, full/waitlist
        mute: "#6B7280", // secondary text
      },
      fontFamily: {
        // Condensed heavy uppercase display stack; system sans for body.
        display: ["Oswald", "Arial Narrow", "sans-serif"],
      },
    },
  },
  plugins: [],
};
