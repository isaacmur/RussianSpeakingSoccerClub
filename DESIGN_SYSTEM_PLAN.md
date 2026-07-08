# Design Redesign Plan — "Boardwalk After Dark"

A complete UI redesign of Weekend League. Supersedes §14 of `WEEKEND_LEAGUE_PLAN.md`
(the "team sheet / scoreboard" direction), which is retired.

**Direction:** Coney Island Boardwalk · **Mode:** dark-only · **Scope:** design system + all live screens

---

## 1. The idea

Kaiser Park sits a ten-minute walk from the Riegelmann Boardwalk. The club plays
soccer in Brooklyn's most photographed neighborhood, and the neighborhood's
defining image isn't daylight — it's **neon against a black sky**: the Wonder Wheel
lit magenta and teal, the Cyclone's bulbs, sodium lamps down the boardwalk.

So: **Coney Island at night.** Two halves, deliberately divided —

| Half | Source | Carries |
|---|---|---|
| **Park** | Kaiser Park's chain-link, pitch lines, floodlights | *structure* — textures, grids, borders, rules |
| **Boardwalk** | Wonder Wheel, Cyclone, bulb strings, marquees | *light* — accents, glow, state, celebration |

Park is the skeleton. Boardwalk is what's lit up. Nothing glows unless it means
something.

All copy is English. A small `steel` **kicker line** sits above each display heading,
carrying context the heading itself doesn't — season, venue, cadence.

---

## 2. Palette

Every ratio below was computed against the WCAG 2.x formula and validated against
known anchors (`#FFF/#000 = 21.00`, `#777/#FFF = 4.48`, `#F00/#FFF = 3.998`).

### Surfaces

| Token | Hex | Role |
|---|---|---|
| `night` | `#060B13` | screen ground — sea and sky |
| `plank` | `#161F2F` | cards — wet boardwalk under lamplight |
| `line` | `#2C3B52` | hairlines, chain-link, borders |

### Ink

| Token | Hex | on `night` | on `plank` | Role |
|---|---|---|---|---|
| `bone` | `#EDF1F6` | 17.38:1 **AAA** | 14.56:1 **AAA** | primary text |
| `steel` | `#93A3B6` | 7.66:1 **AAA** | 6.42:1 **AA** | secondary text |

### Neon

| Token | Hex | on `night` | on `plank` | Role |
|---|---|---|---|---|
| `wonder` | `#16E0C8` | 11.77:1 **AAA** | 9.86:1 **AAA** | open · positive · "you" |
| `luna` | `#FFC94A` | 12.87:1 **AAA** | 10.78:1 **AAA** | Golden Boot · lamplight · top 3 |
| `cyclone` | `#FF3B47` | 5.60:1 | 4.70:1 | **fills only** — meter bar, tube stroke, badge grounds |
| `cyclone-lit` | `#FF5C63` | 6.54:1 **AA** | 5.48:1 **AA** | **red as text** — "FULL", negative +/- |
| `ferris` | `#FF4FA3` | 6.48:1 **AA** | 5.43:1 **AA** | rare spark — waitlist pulse, mentions |

**The two-red split is load-bearing.** `#FF3B47` is only 4.70:1 on a card — it clears
AA on paper but that is precisely the color today's code paints small uppercase status
text with, and saturated red on navy visibly vibrates at that size. `cyclone` is a
*fill*; `cyclone-lit` is *text*. The token names exist to make the wrong choice hard.

Dark text on neon fills all pass comfortably: `night` on `wonder` 11.77:1, on `luna`
12.87:1, on `cyclone` 5.60:1, on `ferris` 6.48:1. Badges are therefore **neon fill +
`night` text**, never neon text on a neon fill.

### The structural constraint

`night` → `plank` separation maxes out at **1.19:1**, and no usable border color
exceeds **1.95:1** against `plank`. This is not a palette failure — it is arithmetic.
The `+0.05` flare term in the WCAG ratio dominates when both luminances approach
zero, so *any* two near-black surfaces are near-1:1 by construction. Spreading the
hexes further apart does not help; it just makes one of them not-black.

**Consequence: card lift cannot come from fill difference. It must come from border
and glow.** This is why the neon-tube and bulb-string treatments are load-bearing
architecture rather than ornament, and why the design leans on `boxShadow` so hard.
Design with it, not against it.

---

## 3. Typography

### Two styles in the current code are silently dead

1. **`font-display` never renders.** [tailwind.config.js:19](tailwind.config.js#L19)
   declares `["Oswald", "Arial Narrow", "sans-serif"]`, but nothing calls `useFonts`,
   there is no `assets/` directory, and the `expo-font` plugin in [app.json](app.json)
   loads nothing. React Native silently falls back to the system face. The condensed
   uppercase identity §14 describes **has never once appeared on a device.**

2. **`tabular-nums` never renders.** Tailwind emits `font-variant-numeric: tabular-nums`.
   `react-native-css-interop` handles `font-variant-caps` and **zero** occurrences of
   `font-variant-numeric` (verified against
   `node_modules/react-native-css-interop/dist/css-to-rn/parseDeclaration.js`). Every
   stat column in [components/leaderboard.tsx](components/leaderboard.tsx) is rendering
   proportional digits and mis-aligning right now.

Fixing these two is the highest-leverage work in this plan and is worth doing even if
the palette were left untouched.

### The stack

| Role | Face | Why |
|---|---|---|
| Display | **Oswald** 600/700 | condensed, marquee-adjacent — reads as ticket-booth signage |
| Body | **Inter** 400/600 | exposes an OpenType `tnum` feature; excellent at small sizes |

Both are OFL. Load **only these four weights**; `@expo-google-fonts` ships a full TTF per
weight and they add up. Latin subsets only — with the copy now English-only, the Cyrillic
subsets are dead payload.

`tabular-nums` is fixed with a `<Num>` primitive applying the RN style attribute
directly — `style={{ fontVariant: ["tabular-nums"] }}` — bypassing the Tailwind
utility that doesn't survive the CSS-to-RN transform.

> **Corrected during implementation.** `<Num>` alone is not sufficient. Measured
> against each font's `hmtx` table:
>
> | Font | default digits | has `tnum`? | `<Num>` works? |
> |---|---|---|---|
> | Inter | proportional (833–1292 / 2048 em) | **yes** | ✅ |
> | Oswald | proportional (385–550 / 1000 em) | **no** | ❌ |
>
> `fontVariant` cannot synthesize a feature the font doesn't ship, so Oswald digits
> jitter by up to 16.5% of an em (`1` is a third narrower than `0`) no matter what.
> The leaderboard's two most alignment-critical columns — goals and `+/-` — were
> both specced as `font-display`, i.e. Oswald, and would have mis-aligned.
>
> **Rule:** Oswald for *standalone* numerals (hero counts, rank badges — centered
> in their own box, so advance width never matters). Inter for *any digit in a
> column*. Encoded in the `<Num>` docblock and `lib/theme.ts`.

### Kicker lines

Small `steel` uppercase Oswald, tracked out, above each display heading. A kicker must
**add** something — never restate the heading. Most are data-driven, not static strings.

| Screen | Heading | Kicker |
|---|---|---|
| Matchday | `MATCHDAY` | `KAISER PARK · BROOKLYN` |
| Table | `TABLE` | `2026 SEASON · {n} PLAYERS` |
| Game detail | `{game title}` | `{Sat, Jul 12 · 10:00 AM ET}` |
| Clubhouse | `CLUBHOUSE` | `LEAGUE CHAT` |
| Alerts | `ALERTS` | `{n} UNREAD` |
| Profile | `{display name}` | `{status} · {role}` |
| Sign in | `WELCOME BACK` | `RUSSIAN SPEAKING SOCCER CLUB` |
| Sign up | `JOIN THE CLUB` | `ADMISSION BY APPROVAL` |
| Admin | `{section}` | `ADMIN` |

Game detail and Profile already render exactly this information as body text
([game/[id].tsx:152](app/game/%5Bid%5D.tsx#L152), [profile.tsx](app/%28tabs%29/profile.tsx)) —
the kicker promotes it into the heading block rather than adding a new string. Tabs stay
plain English: `PLUS-MINUS` / `GOLDEN BOOT`.

---

## 4. Motif vocabulary

Seven elements. Each has exactly one job.

1. **Wonder Wheel capacity meter** *(the signature)* — replaces the flat `CapacityBar`
   in [app/game/[id].tsx:232](app/game/%5Bid%5D.tsx#L232). Capacity renders as a ring of
   *N* cabins. Each lights `wonder` teal as a player registers. Waitlist cabins pulse
   `ferris` magenta. At capacity the whole wheel goes `cyclone` red. You read "9 of 12"
   as a shape, not a percentage. `react-native-svg`.

2. **Bulb-string divider** — a row of small glowing `luna` dots. Replaces every
   `h-px bg-line` separator.

3. **Marquee rank badge** — the squad-number badge from
   [components/leaderboard.tsx:174](components/leaderboard.tsx#L174) becomes a ticket-booth
   marquee numeral. `luna` fill for ranks 1–3, `plank` + `line` border below.

4. **Chain-link** — Kaiser Park's fence as an SVG pattern at ~6% opacity, behind empty
   states and the Matchday header. This is what keeps the *soccer* half of the identity
   alive against all that boardwalk neon. Without it the app is a carnival, not a
   football club.

5. **Neon tube CTA** — primary `Button` is a `wonder` fill under a layered `boxShadow`
   glow. Withdraw/destructive is a `cyclone` outline tube.

6. **Boardwalk plank rhythm** — leaderboard rows carry a barely-there alternating tint
   and a 1px `line` seam. Board joints underfoot.

7. **Parachute Jump silhouette** — empty states, app icon, splash.

---

## 5. Glow is native

RN 0.76 ships `boxShadow` (`ReadonlyArray<BoxShadowValue> | string`,
`StyleSheetTypes.d.ts:430`), backed by `processBoxShadow.js` and registered in **both**
`BaseViewConfig.android.js` and `BaseViewConfig.ios.js`. Colored shadows therefore work
cross-platform. It requires the New Architecture — [app.json](app.json) already sets
`newArchEnabled: true`.

This kills the usual dark-mode-neon workarounds. No `expo-linear-gradient`, no stacked
translucent Views, no SVG blur. A `<Neon>` wrapper applying two shadow layers (one tight
and bright, one wide and soft) is the whole technique.

NativeWind 4.1's `shadow-*` utilities map to the legacy iOS-only `shadowColor`/
`shadowRadius` props, **not** to `boxShadow`. Glow is applied via `style={{ boxShadow }}`
inside `<Neon>`, not via `className`.

---

## 6. Dependencies

```bash
npx expo install @expo-google-fonts/oswald @expo-google-fonts/inter \
                 expo-splash-screen react-native-svg expo-haptics
```

Use `npx expo install` (not `npm install`) so SDK 52-compatible versions are resolved.

- `expo-splash-screen` — gate render until fonts load, else the app flashes system-font text
- `react-native-svg` — Wonder Wheel, chain-link, Parachute Jump
- `expo-haptics` — a tick on register/withdraw. Optional; drop it if you want.

**Already present:** `@expo/vector-icons@14.0.4` (the tab bar currently has no icons at
all), `react-native-reanimated@3.16.1` (installed, entirely unused — it drives the wheel
fill and tab transitions).

**Not needed:** `expo-linear-gradient` (see §5), `expo-blur`.

---

## 7. Work breakdown

### Phase A — Foundation

| File | Change |
|---|---|
| `lib/theme.ts` | **new.** Exported token object. Single source of truth. |
| `tailwind.config.js` | consume `theme.ts`; map `fontFamily` to the *loaded* font names (`Oswald_700Bold`, not `"Oswald"`) |
| `app.json` | `userInterfaceStyle: "dark"`; splash + `adaptiveIcon.backgroundColor` → `#060B13` |
| `app/_layout.tsx` | `useFonts` + `SplashScreen.preventAutoHideAsync()`; `StatusBar` → `style="light"` |

`lib/theme.ts` exists to kill the eight hard-coded hexes — `#1F7A46` appears in four
separate `<ActivityIndicator color=...>` props, plus `#111A2E` and `#9CA3AF` in
[components/ui.tsx](components/ui.tsx). Prop-based colors can't read Tailwind classes, so
without a JS export the two will drift the moment anything changes.

> `StatusBar style="dark"` in [app/_layout.tsx:85](app/_layout.tsx#L85) must flip to
> `"light"`. On a `#060B13` ground, dark status text is invisible.

### Phase B — Primitives (`components/ui.tsx` + `components/motif/`)

Extend the existing five primitives to fifteen:

| Primitive | Notes |
|---|---|
| `Screen` | `night` ground, optional `<ChainLink>` |
| `Heading` | gains a `kicker` prop (see §3) |
| `Subtle` | → `steel` |
| `Num` | **fixes `tabular-nums`** via `fontVariant` style prop |
| `Button` | neon-tube variants |
| `Field` | `plank` fill, `line` border, `steel` placeholder |
| `Card` | `plank` + `line` border + optional glow |
| `Badge` | neon fill + `night` text |
| `StatusChip` | consolidates the `TONE_TEXT` map **duplicated** in `(tabs)/index.tsx:10` and `game/[id].tsx:13` |
| `Neon` | `boxShadow` glow wrapper |
| `BulbString` | divider |
| `WonderWheel` | capacity meter |
| `ChainLink` | SVG pattern |
| `MarqueeSpinner` | replaces every bare `<ActivityIndicator>` |
| `EmptyState` | Parachute Jump silhouette |

**`lib/format.ts` — decouple tone from color.** `statusLabel()` returns
`tone: "pitch" | "boot" | "mute" | "ink"` — color names baked into business logic. Rename
to semantic tones (`positive | urgent | quiet | strong`) so the next palette change never
touches this file again. `StatusChip` owns the tone → token mapping.

### Phase C — Restyle, fully (9 screens)

- `(auth)/sign-in.tsx`, `(auth)/sign-up.tsx` — Parachute Jump + chain-link, neon CTA
- `(tabs)/index.tsx` — Matchday; chain-link header, plank cards, `StatusChip`
- `game/[id].tsx` — **Wonder Wheel hero**, tube CTA, plank team sheet
- `(tabs)/leaderboard.tsx`, `(viewer)/leaderboard.tsx`, `(pending)/leaderboard.tsx` — via
  `components/leaderboard.tsx`: marquee badges, plank rhythm, `Num` columns
- `admin/{members,schedule,series,baselines}.tsx` — `luna` as the admin accent so
  destructive surfaces read distinctly from member surfaces
- `(tabs)/_layout.tsx` — custom tab bar: `@expo/vector-icons` + `wonder` neon on the
  active tab (there are currently **no icons at all**)

### Phase D — Shells only (3 screens)

`(tabs)/chat.tsx`, `(tabs)/notifications.tsx`, `(tabs)/profile.tsx` get the new `Screen`,
`Heading` + kicker, and `EmptyState`. Their interiors are Phase 4/6 placeholders in
`WEEKEND_LEAGUE_PLAN.md` — they'll be **built** in this language rather than retrofitted
into it. That's the payoff of doing the redesign at Phase 3 instead of Phase 7.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| `boxShadow` needs New Arch | Confirmed on. Verify on a **physical Android device** — emulators lie about shadows. Fallback: stacked translucent Views. |
| Glow overdraw on long lists | Glow the hero only. Never put `<Neon>` inside a `FlatList` `renderItem`. |
| `fontVariant: ["tabular-nums"]` needs the font to expose `tnum` | Inter does. Confirm with the digit-width test in §3. |
| Font payload | Four TTFs, Latin subset only. Don't `import * from` the Google Fonts package — it pulls every weight. |
| Data-driven kickers can be empty | `{n} UNREAD` / `{n} PLAYERS` are zero or undefined on first paint. `Heading` must collapse the kicker slot when falsy, not reserve dead space. |
| `cyclone` misused as small text | Encoded in token names. Consider an ESLint rule if it recurs. |
| Dark-only outdoor legibility | `bone` on `night` is 17.38:1 — beyond AAA. The real risk was `cyclone`, and §2 handles it. |

---

## 9. Definition of done

- Oswald and Inter render on a physical device — `font-display` produces visibly
  condensed type, and the digit-width test passes.
- Leaderboard stat columns align under `000` / `111`.
- Zero hard-coded hexes outside `lib/theme.ts` (`grep -rn '#[0-9A-Fa-f]\{6\}' app components`).
- Game detail's Wonder Wheel fills live via Realtime as a second device registers.
- All 12 screens render on `night` with no light-mode bleed; status bar legible.
- Every text/background pair in §2 measured on-device, not just in the table above.
- `npm run typecheck` clean.

---

## 10. Open questions

1. **`ferris` magenta — keep or cut?** It's a fifth accent. Currently justified by exactly
   two states (waitlist pulse, chat mentions). If those don't land, cut it; four accents is
   already generous.
2. **Wonder Wheel on the Matchday cards too, or game detail only?** A 12-cabin ring at
   list-row scale may be illegible. Recommend: detail only; Matchday keeps a compact bar.
3. **Does the club's name appear anywhere in-app?** Currently nowhere — `app.json` says
   "Weekend League". The sign-in kicker is the natural home for
   `RUSSIAN SPEAKING SOCCER CLUB`, but it's the only place the identity surfaces.
