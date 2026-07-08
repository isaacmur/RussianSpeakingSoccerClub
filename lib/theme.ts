// Boardwalk After Dark — design tokens.
// See DESIGN_SYSTEM_PLAN.md. Hex values live in design-tokens.json (the only
// place), shared with tailwind.config.js across the CommonJS boundary.
//
// This module is what anything taking a color as a *prop* imports from —
// ActivityIndicator, StatusBar, Svg fills, navigator screenOptions. Those can't
// read Tailwind classes, so without a JS export the two representations drift.

import type { BoxShadowValue } from "react-native";
import tokens from "@/design-tokens.json";

const c = tokens.colors;

// ── Palette ───────────────────────────────────────────────────────────────
// Ratios measured against the WCAG 2.x formula; full table in the plan's §2.
// The two-red split is load-bearing:
//
//   cyclone     #FF3B47  FILLS ONLY. 4.70:1 on plank — clears AA on paper, but
//                        saturated red on navy vibrates at small text sizes.
//   cycloneLit  #FF5C63  RED AS TEXT. 5.48:1 on plank.
//
// Painting small uppercase status text in `cyclone` is the exact mistake the
// old palette made. Reach for `cycloneLit` whenever the red is a glyph.
export const palette = {
  // surfaces
  night: c.night, //   screen ground — sea and sky
  plank: c.plank, //   cards — wet boardwalk under lamplight
  line: c.line, //     hairlines, chain-link, borders

  // ink
  bone: c.bone, //     primary text     17.38:1 on night · 14.56:1 on plank
  steel: c.steel, //   secondary text    7.66:1 on night ·  6.42:1 on plank

  // neon
  wonder: c.wonder, //          open · positive · "you"
  luna: c.luna, //              Golden Boot · lamplight · top 3
  cyclone: c.cyclone, //        fills only
  cycloneLit: c["cyclone-lit"], // red as text
  ferris: c.ferris, //          rare spark — waitlist pulse, mentions
} as const;

// ── Type ──────────────────────────────────────────────────────────────────
// Each weight is registered as its own font family, so never pair these with a
// `fontWeight` — RN would try to synthesize a weight the family doesn't have.
export const fonts = {
  display: "Oswald_700Bold",
  displaySemi: "Oswald_600SemiBold",
  body: "Inter_400Regular",
  bodySemi: "Inter_600SemiBold",
} as const;

// Tailwind's `tabular-nums` utility emits `font-variant-numeric`, which
// react-native-css-interop never parses (it handles `font-variant-caps` only).
// The class is a silent no-op — every stat column in the old leaderboard was
// rendering proportional digits. Apply this style object instead; see <Num>.
//
// Only effective on Inter. Oswald has no `tnum` feature (verified against its
// hmtx table: digit advances span 385–550 units/em), and fontVariant cannot
// synthesize a feature the font doesn't ship. So:
//
//   font-body / font-body-semi (Inter)   → digits in a column
//   font-display (Oswald)                → standalone numerals only
export const tabularNums = { fontVariant: ["tabular-nums" as const] };

// ── Glow ──────────────────────────────────────────────────────────────────
// Card lift cannot come from fill on this palette: night→plank tops out at
// 1.19:1 and no usable border beats 1.95:1, because the +0.05 flare term in the
// WCAG ratio dominates when both luminances approach zero. Spreading the hexes
// apart doesn't help — it just makes one of them not-black. So edges are defined
// by border + glow. boxShadow is structural here, not decorative.
//
// RN 0.76 ships boxShadow on both platforms (registered in BaseViewConfig
// .android.js *and* .ios.js), gated on the New Architecture — app.json already
// sets newArchEnabled: true. NativeWind's `shadow-*` utilities map to the legacy
// iOS-only shadowColor/shadowRadius props, NOT boxShadow, so glow always goes
// through `style`, never `className`.

/** Hex → rgba(), for shadow colors that need an alpha channel. */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * A neon tube: one tight bright halo, one wide soft bloom.
 * Two layers is what separates "glowing" from "blurry".
 */
export function glow(color: string, intensity = 1): BoxShadowValue[] {
  return [
    { offsetX: 0, offsetY: 0, blurRadius: 6, color: alpha(color, 0.55 * intensity) },
    { offsetX: 0, offsetY: 0, blurRadius: 20, color: alpha(color, 0.3 * intensity) },
  ];
}

/** Ambient lift for cards — no hue, just separation from the ground. */
export const cardShadow: BoxShadowValue[] = [
  { offsetX: 0, offsetY: 8, blurRadius: 24, color: "rgba(0, 0, 0, 0.5)" },
];

// ── Semantic tones ────────────────────────────────────────────────────────
// Business logic (lib/format.ts) speaks in tones, not colors, so the next
// palette change never touches it. <StatusChip> owns the mapping.
export type Tone = "positive" | "urgent" | "quiet" | "strong" | "spark";

export const toneColor: Record<Tone, string> = {
  positive: palette.wonder,
  urgent: palette.cycloneLit, // text-safe red, never `cyclone`
  quiet: palette.steel,
  strong: palette.bone,
  spark: palette.ferris,
};

/** Literal classes — NativeWind purges anything built by interpolation. */
export const toneText: Record<Tone, string> = {
  positive: "text-wonder",
  urgent: "text-cyclone-lit",
  quiet: "text-steel",
  strong: "text-bone",
  spark: "text-ferris",
};
