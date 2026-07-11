// Boardwalk After Dark — primitives.
// Tokens: lib/theme.ts · Motifs: components/motif.tsx · Rationale: DESIGN_SYSTEM_PLAN.md

import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  Platform,
  Pressable,
  PressableProps,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BulbString, ChainLink, Neon, ParachuteJump } from "@/components/motif";
import { cardShadow, glow, palette, tabularNums, Tone, toneText } from "@/lib/theme";

export { BulbString, ChainLink, Neon, ParachuteJump };

// expo-haptics has no web implementation — calling it in a browser throws.
const canBuzz = Platform.OS !== "web";
const buzzTap = () => {
  if (canBuzz) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};
const buzzSelect = () => {
  if (canBuzz) void Haptics.selectionAsync();
};

// ── Screen ────────────────────────────────────────────────────────────────
// Night ground. `fence` lays Kaiser Park's chain-link behind the content —
// on by default, because it's the one thing keeping this a football club.
export function Screen({
  children,
  fence = true,
}: {
  children: React.ReactNode;
  fence?: boolean;
}) {
  return (
    <SafeAreaView className="flex-1 bg-night" edges={["top", "left", "right"]}>
      {fence ? (
        <View className="absolute inset-x-0 top-0 h-56" pointerEvents="none">
          <ChainLink className="h-full w-full" />
        </View>
      ) : null}
      <View className="flex-1 px-5">{children}</View>
    </SafeAreaView>
  );
}

// ── Heading ───────────────────────────────────────────────────────────────
// The kicker adds context the heading doesn't — season, venue, cadence. It
// must never restate the heading.
//
// Kickers are usually data-driven ("{n} UNREAD", "2026 SEASON · {n} PLAYERS"),
// so they're empty or zero on first paint. The slot collapses when falsy rather
// than reserving dead space that pops in later.
export function Heading({
  children,
  kicker,
}: {
  children: React.ReactNode;
  kicker?: string | null | false;
}) {
  return (
    <View className="gap-0.5">
      {kicker ? (
        <Text className="font-display-semi text-[11px] uppercase tracking-[2px] text-steel">
          {kicker}
        </Text>
      ) : null}
      <Text className="font-display text-3xl uppercase tracking-wide text-bone">
        {children}
      </Text>
    </View>
  );
}

export function Subtle({ children }: { children: React.ReactNode }) {
  return <Text className="font-body text-base text-steel">{children}</Text>;
}

/** Small tracked-out uppercase label. Column heads, field labels, section eyebrows. */
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-display-semi text-[11px] uppercase tracking-[1.5px] text-steel">
      {children}
    </Text>
  );
}

// ── Num ───────────────────────────────────────────────────────────────────
// Tailwind's `tabular-nums` compiles to `font-variant-numeric`, which
// react-native-css-interop never parses — the class silently does nothing, and
// every stat column in this app was rendering proportional digits. RN exposes
// `fontVariant` as a real style attribute, so that's the route.
//
// Any digit that sits in a column goes through <Num>. Never `className="tabular-nums"`.
//
// CRITICAL: pair <Num> with `font-body`/`font-body-semi` (Inter), never
// `font-display` (Oswald). Oswald ships no `tnum` feature — its digits span
// 385–550 units/em, and fontVariant cannot synthesize a feature the font
// doesn't contain. Inter's digits are proportional by default but it *has*
// tnum, so <Num> makes them uniform.
//
//   Oswald  → standalone numerals (hero counts, rank badges, centered in a box)
//   Inter   → anything in a column
//
// className is forwarded as an explicit JSX attribute, not via {...rest}:
// NativeWind's transform only rewrites a className it can see at the JSX site,
// so spreading it into <Text> would drop every class. Same failure mode as the
// dead font-display this file exists to fix.
export function Num({ className, style, ...rest }: TextProps & { className?: string }) {
  return <Text className={className} style={[tabularNums, style]} {...rest} />;
}

// ── Card ──────────────────────────────────────────────────────────────────
// night→plank separation maxes out at 1.19:1 — the WCAG flare term swamps any
// two near-black surfaces. Fill alone can't lift a card off this ground, so the
// border does the work and the ambient shadow seats it. See lib/theme.ts.
type CardProps = ViewProps & { glowColor?: string };

export function Card({ glowColor, style, className = "", ...rest }: CardProps) {
  return (
    <View
      className={`rounded-2xl border border-line bg-plank ${className}`}
      style={[{ boxShadow: glowColor ? glow(glowColor, 0.5) : cardShadow }, style]}
      {...rest}
    />
  );
}

// ── Button ────────────────────────────────────────────────────────────────
// Primary is a lit neon tube. Danger is an unlit outline that only burns on the
// stroke — withdrawing shouldn't feel as inviting as joining.
type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
};

export function Button({
  title,
  loading,
  variant = "primary",
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const off = disabled || loading;

  const face = {
    primary: "bg-wonder border-wonder",
    ghost: "bg-plank border-line",
    danger: "bg-transparent border-cyclone",
  }[variant];

  const label = {
    primary: "text-night",
    ghost: "text-bone",
    danger: "text-cyclone-lit",
  }[variant];

  const tube = { primary: palette.wonder, ghost: undefined, danger: palette.cyclone }[
    variant
  ];

  return (
    <Pressable
      disabled={off}
      onPress={(e) => {
        buzzTap();
        onPress?.(e);
      }}
      className={`h-12 items-center justify-center rounded-xl border px-4 ${face} ${
        off ? "opacity-40" : ""
      }`}
      style={{ boxShadow: tube && !off ? glow(tube, 0.7) : undefined }}
      {...rest}
    >
      {loading ? (
        <MiniSpinner color={variant === "primary" ? palette.night : palette.bone} />
      ) : (
        <Text className={`font-display text-lg uppercase tracking-wider ${label}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Three pulsing bulbs — an inline loading state that fits a button's height. */
function MiniSpinner({ color }: { color: string }) {
  return (
    <View className="flex-row gap-1.5">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, opacity: [1, 0.6, 0.3][i] }}
        />
      ))}
    </View>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────
type FieldProps = TextInputProps & { label: string };

export function Field({ label, ...rest }: FieldProps) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      <TextInput
        className="h-12 rounded-xl border border-line bg-plank px-3 font-body text-base text-bone"
        placeholderTextColor={palette.steel}
        {...rest}
      />
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
// Neon fill + `night` text. Never neon text on a neon fill — every fill in the
// palette clears 5.6:1 against night, but nothing clears it against another neon.
export function Badge({
  children,
  color = palette.wonder,
  lit = false,
}: {
  children: React.ReactNode;
  color?: string;
  lit?: boolean;
}) {
  return (
    <View
      className="rounded-md px-2 py-0.5"
      style={{ backgroundColor: color, boxShadow: lit ? glow(color, 0.6) : undefined }}
    >
      <Text className="font-display text-[11px] uppercase tracking-wider text-night">
        {children}
      </Text>
    </View>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────
// Consolidates the TONE_TEXT map that was duplicated in (tabs)/index.tsx and
// game/[id].tsx. Owns the only tone → color mapping in the app.
export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const dot = {
    positive: "bg-wonder",
    urgent: "bg-cyclone",
    quiet: "bg-steel",
    strong: "bg-bone",
    spark: "bg-ferris",
  }[tone];

  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <Text
        className={`font-display-semi text-[11px] uppercase tracking-wider ${toneText[tone]}`}
      >
        {label}
      </Text>
    </View>
  );
}

// ── MarqueeRank ───────────────────────────────────────────────────────────
// The squad-number badge, promoted to a ticket-booth marquee numeral. Podium
// ranks burn `luna`; everyone below sits unlit on plank.
export function MarqueeRank({ rank }: { rank: number }) {
  const podium = rank <= 3;
  return (
    <View
      className={`h-8 w-8 items-center justify-center rounded-md border ${
        podium ? "border-luna bg-luna" : "border-line bg-plank"
      }`}
      style={{ boxShadow: podium ? glow(palette.luna, 0.45) : undefined }}
    >
      <Num className={`font-display text-sm ${podium ? "text-night" : "text-steel"}`}>
        {rank}
      </Num>
    </View>
  );
}

// ── ActionChip ────────────────────────────────────────────────────────────
// Admin row actions. Was copy-pasted as `ActionChip` in members.tsx and `Chip`
// in schedule.tsx with divergent tone unions.
//
// Filled chips put `night` on the neon, never neon on neon — night clears
// 11.77:1 on wonder and 5.60:1 on cyclone, while no two neons clear each other.
export function ActionChip({
  label,
  tone = "neutral",
  disabled,
  onPress,
}: {
  label: string;
  tone?: "go" | "danger" | "neutral";
  disabled?: boolean;
  onPress: () => void;
}) {
  const face = {
    go: "bg-wonder",
    danger: "bg-cyclone",
    neutral: "border border-line bg-plank",
  }[tone];
  const ink = { go: "text-night", danger: "text-night", neutral: "text-bone" }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        buzzSelect();
        onPress();
      }}
      className={`rounded-lg px-3 py-2 ${face} ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`font-display-semi text-xs uppercase tracking-wider ${ink}`}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── FilterPills ───────────────────────────────────────────────────────────
export function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1 ${
        active ? "border-bone bg-bone" : "border-line bg-plank"
      }`}
    >
      <Text
        className={`font-display-semi text-xs uppercase tracking-wider ${
          active ? "text-night" : "text-steel"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── SignOutLink ───────────────────────────────────────────────────────────
// Sits on a Heading's baseline in the viewer/pending shells. A full-height
// <Button> would tower over the heading block, and signing out is not the
// primary action on a screen whose whole purpose is the standings.
export function SignOutLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} className="pt-1">
      <Text className="font-display-semi text-xs uppercase tracking-wider text-steel">
        Sign out
      </Text>
    </Pressable>
  );
}

// ── BackButton ────────────────────────────────────────────────────────────
// An explicit in-content way off any pushed screen (game, report, admin). The
// native stack header carries a back arrow too, but on web that arrow is easy
// to miss — this puts a labelled control in the content itself. Falls back to
// the entry route when there's nothing to pop (e.g. a deep link opened cold).
export function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        buzzSelect();
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
      hitSlop={12}
      className="-ml-1 flex-row items-center gap-1 self-start py-1"
    >
      <Feather name="chevron-left" size={18} color={palette.steel} />
      <Text className="font-display-semi text-xs uppercase tracking-wider text-steel">
        {label}
      </Text>
    </Pressable>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <View className="items-center gap-4 py-16">
      <ParachuteJump height={96} opacity={0.5} />
      <Text className="text-center font-body text-base text-steel">{children}</Text>
    </View>
  );
}
