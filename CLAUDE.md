# CLAUDE.md

This file is auto-loaded by Claude Code every session. It defines how to work in this repository. Read it fully before doing anything. Also read `PROJECT.md` for the full product spec.

## What this project is

A web tool where a user types a stock ticker and gets the company's latest SEC filing (10-Q or 10-K) turned into a plain-English summary with the **real financial numbers extracted and displayed**. One ticker in, one clear filing breakdown out. Nothing else.

## The prime directive: respect the phase gates

The build is split into ordered phases in `PROJECT.md`. **Do not skip ahead.** Complete a phase, confirm it works, then stop and wait for me before starting the next. The hard, valuable part of this product is reliable financial-data extraction — that gets proven in isolation BEFORE any UI is built.

If you ever feel the urge to build something not in the current phase, **do not build it.** Add it to `LATER.md` and keep going.

## Non-negotiable rules

1. **No scope creep.** No features beyond the current phase. When unsure whether something is in scope, ask — don't build it.
2. **Never let the LLM invent numbers.** Every financial figure shown to the user must come from EDGAR data extraction. The Claude API is only allowed to write prose *around* numbers that were passed into its prompt. It must never generate, estimate, or infer a financial figure itself.
3. **Fail gracefully, never silently.** Missing data shows "not reported." Never crash, never render `undefined`, never show a raw error to the user.
4. **Type everything.** Define explicit TypeScript interfaces for EDGAR API responses and for the normalized output. No `any` without a written reason.
5. **Commit after each working phase** with a clear message, so there's always a clean checkpoint to return to.
6. **Don't add libraries or change the stack** without asking first. The stack is locked (see below).

## Locked tech stack — do not substitute

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Anthropic Claude API via `@anthropic-ai/sdk` (for summaries only)
- SEC EDGAR REST APIs for all financial data (free, no key)
- Vercel for deployment
- **No database** in the MVP
- **No auth** in the MVP

## EDGAR ground rules (full detail in PROJECT.md)

- A `User-Agent` header is REQUIRED on every EDGAR request. Read it from the `SEC_USER_AGENT` env var. Never hardcode it.
- Stay under 10 requests/second. Centralize all EDGAR calls in one client module that enforces the header and a small delay.
- Values are raw units (e.g. 383285000000). Normalize/format only at display time.
- Concept tags vary by company. Use ordered fallback lists per metric. Handle missing concepts gracefully.

## Working style I want

- Before writing code for a phase, briefly tell me your plan and let me confirm.
- Work in small, reviewable steps. Explain what you did and why after each step.
- When a phase's exit test is defined (e.g. the 5-ticker test in Phase 1), run it and show me the real output before declaring the phase done.
- If something is ambiguous, ask one clear question rather than guessing.
- Prefer readable, boring, correct code over clever code.

## Definition of done (MVP)

A deployed Vercel URL where typing `AAPL`, `JPM`, `WMT`, `RIVN`, and `O` returns correct headline financials plus a plain-English summary matching the real filing — no manual intervention, no invented numbers.
