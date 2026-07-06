# DESIGN.md — visual direction for the upcoming redesign

Captures the redesign we're about to do so the direction isn't lost. This describes the
**target**, not the current code. As of 2026-07-05 the app still ships the *old* look
(dark navy background + indigo/violet accent) — the whole point of this work is to move away
from that.

## The problem with the current look

The app currently uses the **dark-violet "default AI app" aesthetic** (near-black navy base,
indigo/violet accent, glow effects). It's competent but generic — it reads as "an AI tool,"
not as a trustworthy financial companion. We want to deliberately break from that default.

## Brand direction

**Warm, premium, human, trustworthy.** Orin should feel like a calm, credible guide that a
regular person trusts to explain their investments — not a hype machine, not a Bloomberg
terminal, not a chatbot. Warmth and clarity over darkness and neon.

## The hybrid approach

Two moods for two jobs:

- **Landing page = warm "sunrise" moment.** Emotional, inviting, premium. This is where we earn
  trust and communicate the promise ("Understand what you own"). Warm light, generous space, a
  sense of clarity dawning. This is the marketing surface — it can be richer/more expressive.
- **App screens = calm warm-light workspace.** Once someone is using the tool (results,
  dashboard, discover), the priority is focused, readable calm. Same warm palette, dialed down —
  quiet surfaces, strong type hierarchy, numbers that are easy to read at a glance.

Same design language across both; the landing just turns the warmth/expressiveness up.

## Design tokens to establish (Pass 1)

- **Accent: a warm-leaning blue** (not violet). Blue keeps the trustworthy/financial feel;
  warming it (toward a friendlier, slightly softer blue) moves us off the generic-AI violet.
- **App base: a warm off-white** (not dark navy). Light, paper-like, easy on the eyes for
  reading dense financial content. Cards sit slightly above the base with soft shadows.
- **Up/down stays green/red.** Financial direction must remain instantly legible — keep
  green for up, red for down (tuned to sit well on warm light, not garish).
- **Type: a clean, confident hierarchy.** One clear display level for headlines, a readable
  body, and muted secondary text. Numbers should feel precise (tabular). Inter is fine to keep
  unless a warmer typeface serves the brand better — decide during Pass 1.
- **Cards: rounded, friendly, calm.** Generous radius, soft borders/shadows, real whitespace.
  Approachable, not sharp/technical.

Implement these as CSS variables / Tailwind theme tokens in `app/globals.css` (the existing
`--primary`, `--background`, `--card`, `--accent`, etc. shadcn tokens are the right place —
this is mostly re-defining those, plus removing the forced `dark` class in `app/layout.tsx`).

## Two-pass plan

- **Pass 1 — design system + landing page.** Define the tokens above; rebuild the landing page
  in the warm sunrise style as the reference implementation of the new system. Get the palette,
  type, spacing, and card treatment feeling right here first.
- **Pass 2 — restyle the app screens.** Apply the system to results (`home-client.tsx`),
  dashboard, and discover. Re-skin only — keep all behavior, data, and component structure. The
  "what most people miss" hero card stays the visual centerpiece of the results screen; the
  portfolio/feed cards keep their future-content slots.

## Guardrails during the redesign

- **Presentation only.** Do not touch extraction, caching, auth, RLS, server actions, or the
  analysis prompt. This is tokens + markup/classes.
- Keep the neutral, no-investment-advice framing everywhere (especially the discovery feed).
- Keep accessibility: legible contrast on warm light, `prefers-reduced-motion` respected for any
  animation.
- A possible signature background animation (a virtual stock-market / graph line that follows
  scroll) is parked in `LATER.md` — not part of these two passes unless explicitly pulled in.
