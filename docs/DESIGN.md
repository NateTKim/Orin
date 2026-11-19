# Design

Orin's visual system: the brand direction, the design tokens in `app/globals.css`, and the
landing-page scene. How the app works is documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Brand direction

**Warm, premium, human, trustworthy.** Orin should feel like a calm, credible guide that a
regular person trusts to explain a company's filings. It shouldn't feel like a hype machine, a
Bloomberg terminal, or a chatbot. Warmth and clarity over darkness and neon.

The app deliberately avoids the dark-navy, violet-accent look common to AI products, which reads
as "an AI tool" rather than a trustworthy financial companion.

## Two moods, one system

- **Landing page: a warm "sunrise" moment.** Emotional, inviting, premium. It communicates the
  promise ("Understand what you own") with warm light, generous space, and a sense of clarity
  dawning. This is the one expressive, animated surface.
- **App screens: a calm, warm-light workspace.** Results, dashboard, and discover put focused,
  readable calm first: quiet surfaces, strong type hierarchy, and numbers that are easy to read
  at a glance. Same palette, dialed down.

On the results screen, the "What most people miss" card is the visual centerpiece, alongside the
Business Health card and the headline numbers.

## Tokens (`app/globals.css`)

Warm light is the only theme. Components use one shared card style
(`bg-card shadow-card ring-sand-900/8`), brand blue only as a restrained accent, and
`text-up`/`text-down` for financial direction.

### Raw scales (`@theme`, usable as Tailwind utilities)

- **`brand-50 … brand-950`**: warm cornflower blue, oklch hue 266. `brand-600` ≈ `#3b64dd` is
  the primary. Utilities: `bg-brand-600`, `text-brand-700`, `from-brand-50`, `ring-brand-100`, …
- **`sand-50 … sand-950`**: warm gray. `sand-50` ≈ `#fcfaf6` is the app background; `sand-900`
  is body text (15:1 contrast); `sand-500` is muted text (4.7:1, AA).
- **`up` / `down`**: financial-direction green and red tuned for warm light (`text-up`,
  `text-down`; both ≈ 5.2:1 on card).
- **`shadow-card`, `shadow-card-lg`**: soft warm-brown shadows (never pure black).
- **`font-display`**: Fraunces (serif), loaded in `app/layout.tsx`, for headlines and brand
  moments. Body and UI text use Inter (`--font-sans`). Numbers use `tabular-nums`.

### Semantic tokens (`:root`, what components should normally use)

`--background` = sand-50, `--foreground` = sand-900, `--card` = warm near-white,
`--primary` = brand-600, `--accent` = brand-50 / `--accent-foreground` = brand-700,
`--muted` = sand-100 / `--muted-foreground` = sand-500, `--border` = sand-200,
`--destructive` = down, charts = brand-600 / up-green / warm amber / brand-300 / sand-400.
`--radius` = 0.75rem: rounded and friendly.

## Landing scene

Everything is CSS and inline SVG (no images), built in `components/home-client.tsx` and styled
in `app/globals.css`.

- **Sky**: `.orin-sunrise`, a vertical dawn gradient (blue → rose → peach → gold) with a sun-glow
  radial and two warm flanks.
- **Horizon**: a rising sun drawn inside the horizon SVG so the ranges occlude its lower half,
  and six mountain ranges receding with atmospheric perspective (cool and light far away, warmer
  and firmer up close; one mid range lit by a sunrise gradient). Haze bands pool between the
  ridges.
- **Atmosphere**: faint `.orin-stars` that fade as the sky brightens, three `.orin-cloud` wisps,
  `.orin-mist`, and a subtle `.orin-grain` film-grain overlay.
- **Motion**: content fades up into place on load, the sun rises and then gently "breathes",
  stars twinkle, clouds drift, and the layers parallax with pointer position (fine pointers
  only) and scroll. Animation uses only `transform` and `opacity`.
- **Accessibility**: all motion and parallax live inside
  `@media (prefers-reduced-motion: no-preference)`, so with reduced motion the scene is static
  and fully visible.
- **Mobile**: the three farthest ranges, the far haze, and the clouds are desktop-only, and
  touch devices get scroll parallax only, so phones keep a calmer scene.
- **Hero search**: input + CTA inside one floating pill (`rounded-2xl bg-card/90 shadow-card-lg`
  with a `focus-within` brand ring), with one-tap ticker suggestion chips.
- **Clerk UI** (sign-in modal, account menu) is themed in `app/layout.tsx` with
  `colorPrimary: #3b64dd` and the 0.75rem radius.

## Principles

- **Neutral framing everywhere.** Orin describes businesses and filings; it never signals buy or
  sell. This matters most on the discovery feed and the Business Health card.
- **Direction stays legible.** Green for up and red for down, tuned for warm light. The debt-load
  chip is never red, because high leverage is structurally normal in some industries.
- **Accessible contrast** on warm light, and `prefers-reduced-motion` respected for any
  animation.
