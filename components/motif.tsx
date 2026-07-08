// Boardwalk After Dark — the motif vocabulary.
//
// Seven elements, each with exactly one job. Two halves, deliberately divided:
//   Park      (Kaiser Park's chain-link, pitch lines)  → structure
//   Boardwalk (Wonder Wheel, bulbs, marquees)          → light
//
// Park is the skeleton. Boardwalk is what's lit up. Nothing glows unless it
// means something — glow is how state is announced, so spending it on chrome
// spends the app's only loud voice.

import { useEffect, useMemo } from "react";
import { View, ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  Line as SvgLine,
  Path,
  Pattern,
  Rect,
} from "react-native-svg";
import { glow, palette } from "@/lib/theme";

// ── Neon ──────────────────────────────────────────────────────────────────
// The glow wrapper. Everything lit goes through here.
//
// NOTE: never place <Neon> inside a FlatList renderItem. Each instance is a
// real two-layer shadow the compositor must rasterize; a 100-row list of them
// tanks scroll on mid-range Android. Glow the hero, outline the rest.
type NeonProps = ViewProps & {
  color?: string;
  /** 0 dims the tube without unmounting it — use for disabled/idle states. */
  intensity?: number;
};

// className is forwarded explicitly rather than via {...rest} — NativeWind's
// transform only rewrites a className it can see as a JSX attribute here.
export function Neon({
  color = palette.wonder,
  intensity = 1,
  className,
  style,
  ...rest
}: NeonProps & { className?: string }) {
  const shadow = useMemo(
    () => (intensity > 0 ? glow(color, intensity) : undefined),
    [color, intensity]
  );
  return <View className={className} style={[{ boxShadow: shadow }, style]} {...rest} />;
}

// ── Chain-link ────────────────────────────────────────────────────────────
// Kaiser Park's fence. This is the single element keeping the *soccer* half of
// the identity alive against all the boardwalk neon — without it the app reads
// as a carnival rather than a football club.
//
// A diamond lattice, tiled as an SVG pattern. Deliberately near-invisible: it
// should register as texture, never as content.
export function ChainLink({
  opacity = 0.06,
  size = 28,
  className,
}: {
  opacity?: number;
  size?: number;
  className?: string;
}) {
  return (
    <View className={className} pointerEvents="none">
      <Svg width="100%" height="100%" opacity={opacity}>
        <Defs>
          <Pattern
            id="chainlink"
            width={size}
            height={size}
            patternUnits="userSpaceOnUse"
          >
            {/* two crossing diagonals = one woven diamond */}
            <SvgLine x1={0} y1={0} x2={size} y2={size} stroke={palette.line} strokeWidth={1.4} />
            <SvgLine x1={size} y1={0} x2={0} y2={size} stroke={palette.line} strokeWidth={1.4} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#chainlink)" />
      </Svg>
    </View>
  );
}

// ── Bulb string ───────────────────────────────────────────────────────────
// Replaces every `h-px bg-line` divider. A run of lamplit dots strung between
// two hairlines.
export function BulbString({
  count = 9,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center gap-2 py-3 ${className}`}>
      <View className="h-px flex-1 bg-line" />
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          className="h-1 w-1 rounded-full bg-luna"
          // Alternating bulbs run brighter — an even row of dots reads as a
          // dotted rule, not as lights.
          style={{ boxShadow: i % 2 === 0 ? glow(palette.luna, 0.7) : undefined, opacity: i % 2 === 0 ? 1 : 0.45 }}
        />
      ))}
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

// ── Marquee spinner ───────────────────────────────────────────────────────
// Replaces every bare <ActivityIndicator>. Chasing bulbs around a ring, like a
// theatre marquee.
export function MarqueeSpinner({
  size = 28,
  color = palette.wonder,
}: {
  size?: number;
  color?: string;
}) {
  const t = useSharedValue(0);
  const BULBS = 8;

  useEffect(() => {
    t.value = withRepeat(
      withTiming(BULBS, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(t);
  }, [t]);

  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: BULBS }, (_, i) => (
        <MarqueeBulb key={i} index={i} total={BULBS} size={size} color={color} t={t} />
      ))}
    </View>
  );
}

function MarqueeBulb({
  index,
  total,
  size,
  color,
  t,
}: {
  index: number;
  total: number;
  size: number;
  color: string;
  t: SharedValue<number>;
}) {
  const r = size / 2;
  const dot = Math.max(3, size / 8);
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;

  const style = useAnimatedStyle(() => {
    // Distance from the travelling head, wrapped — so bulb 0 lights right
    // after bulb 7 without a jump.
    const raw = (t.value - index + total) % total;
    const d = Math.min(raw, total - raw);
    return { opacity: interpolate(d, [0, 2], [1, 0.15], "clamp") };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
          left: r + r * 0.78 * Math.cos(angle) - dot / 2,
          top: r + r * 0.78 * Math.sin(angle) - dot / 2,
        },
        style,
      ]}
    />
  );
}

// ── Wonder Wheel ──────────────────────────────────────────────────────────
// The signature element. Capacity as a ferris wheel: one cabin per roster spot,
// each lighting as a player registers. You read "9 of 12" as a shape rather
// than parsing a percentage off a bar.
//
//   filled  < capacity  → cabins light `wonder` teal
//   filled == capacity  → the whole wheel goes `cyclone` red
//   waitlist            → extra cabins ring the hub in `ferris` magenta
export function WonderWheel({
  filled,
  capacity,
  waitlist = 0,
  size = 220,
}: {
  filled: number;
  capacity: number;
  waitlist?: number;
  size?: number;
}) {
  const full = filled >= capacity && capacity > 0;
  const lit = full ? palette.cyclone : palette.wonder;

  const cx = size / 2;
  const cy = size / 2;
  const rim = size * 0.4;
  const hub = size * 0.055;
  const cabin = Math.max(4, size * 0.032);

  // Cabins start at 12 o'clock and fill clockwise.
  const cabins = Array.from({ length: Math.max(capacity, 1) }, (_, i) => {
    const a = (i / Math.max(capacity, 1)) * 2 * Math.PI - Math.PI / 2;
    return {
      on: i < filled,
      x: cx + rim * Math.cos(a),
      y: cy + rim * Math.sin(a),
      spokeA: a,
    };
  });

  // Waitlisted players orbit inside the rim — visibly not on the wheel yet.
  const orbit = rim * 0.58;
  const waiters = Array.from({ length: waitlist }, (_, i) => {
    const a = (i / Math.max(waitlist, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + orbit * Math.cos(a), y: cy + orbit * Math.sin(a) };
  });

  return (
    <Svg width={size} height={size}>
      <G>
        {/* spokes — drawn under everything, structural not decorative */}
        {cabins.map((c, i) => (
          <SvgLine
            key={`s${i}`}
            x1={cx}
            y1={cy}
            x2={c.x}
            y2={c.y}
            stroke={c.on ? lit : palette.line}
            strokeWidth={c.on ? 1.5 : 1}
            opacity={c.on ? 0.5 : 0.7}
          />
        ))}

        {/* rim */}
        <Circle cx={cx} cy={cy} r={rim} stroke={palette.line} strokeWidth={1.5} fill="none" />

        {/* waitlist orbit */}
        {waiters.map((w, i) => (
          <Circle key={`w${i}`} cx={w.x} cy={w.y} r={cabin * 0.55} fill={palette.ferris} opacity={0.85} />
        ))}

        {/* cabins */}
        {cabins.map((c, i) => (
          <Circle
            key={`c${i}`}
            cx={c.x}
            cy={c.y}
            r={cabin}
            fill={c.on ? lit : palette.plank}
            stroke={c.on ? lit : palette.line}
            strokeWidth={1.5}
          />
        ))}

        {/* hub */}
        <Circle cx={cx} cy={cy} r={hub} fill={palette.plank} stroke={palette.line} strokeWidth={1.5} />
      </G>
    </Svg>
  );
}

// ── Parachute Jump ────────────────────────────────────────────────────────
// Coney Island's derelict tower — "Brooklyn's Eiffel Tower". Empty states and
// the auth screens. A silhouette, never a focal point.
export function ParachuteJump({
  height = 120,
  color = palette.line,
  opacity = 1,
}: {
  height?: number;
  color?: string;
  opacity?: number;
}) {
  const w = height * 0.62;
  return (
    <Svg width={w} height={height} viewBox="0 0 62 120" opacity={opacity}>
      {/* mast + splayed legs */}
      <Path
        d="M31 14 L31 96 M31 96 L12 116 M31 96 L50 116 M31 96 L22 116 M31 96 L40 116"
        stroke={color}
        strokeWidth={1.6}
        fill="none"
      />
      {/* lattice cross-bracing */}
      <Path
        d="M24 34 L38 34 M23 52 L39 52 M22 70 L40 70 M21 88 L41 88"
        stroke={color}
        strokeWidth={1}
        opacity={0.7}
      />
      <Path
        d="M24 34 L39 52 L22 70 L41 88 M38 34 L23 52 L40 70 L21 88"
        stroke={color}
        strokeWidth={0.8}
        opacity={0.45}
      />
      {/* the crown ring and its radiating arms */}
      <Circle cx={31} cy={12} r={7} stroke={color} strokeWidth={1.6} fill="none" />
      <Path
        d="M31 5 L31 2 M24 12 L20 12 M38 12 L42 12 M26 7 L23 4 M36 7 L39 4"
        stroke={color}
        strokeWidth={1.2}
      />
    </Svg>
  );
}
