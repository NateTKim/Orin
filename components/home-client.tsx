"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Eye,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueChart } from "@/components/revenue-chart";
import { BusinessHealth } from "@/components/business-health";
import { AuthControls } from "@/components/auth-controls";
import { DiscoverLink } from "@/components/discover-link";
import { SaveButton } from "@/components/portfolio/save-button";
import { cn } from "@/lib/utils";
import { formatPct, formatPerShare, formatUsd, formatUsdCompact } from "@/lib/format.ts";
import type { FilingApiResponse, FilingApiSuccess } from "@/lib/api-types.ts";
import type { MetricValue } from "@/lib/edgar/types.ts";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; ticker: string }
  | { kind: "error"; message: string }
  | { kind: "result"; data: FilingApiSuccess };

/* Floating-card treatment shared across the page: warm white card, soft
   warm shadow, hairline warm ring — same language as the landing cards. */
const cardShell = "rounded-2xl bg-card shadow-card ring-sand-900/8";

/* A few recognizable large caps, offered as one-tap suggestions under the
   landing search box so a first-time visitor isn't staring at a blank field. */
const SUGGESTED_TICKERS = ["AAPL", "NVDA", "TSLA", "AMZN"];

export function HomeClient({ initialTicker }: { initialTicker?: string }) {
  const seed = initialTicker?.trim().toUpperCase() ?? "";
  const [ticker, setTicker] = useState(seed);
  // When arriving via /?ticker=… start straight in the loading state, so a
  // deep link (from a saved card) never flashes the marketing landing first.
  const [view, setView] = useState<ViewState>(
    seed ? { kind: "loading", ticker: seed } : { kind: "idle" },
  );
  const { isSignedIn } = useUser();

  async function runLookup(raw: string) {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setTicker(t);
    setView({ kind: "loading", ticker: t });
    try {
      const res = await fetch(`/api/filing/${encodeURIComponent(t)}`);
      const data = (await res.json()) as FilingApiResponse;
      if (data.ok) setView({ kind: "result", data });
      else setView({ kind: "error", message: data.message });
    } catch {
      setView({ kind: "error", message: "Something went wrong on our side. Please try again." });
    }
  }

  function lookup(event: React.FormEvent) {
    event.preventDefault();
    runLookup(ticker);
  }

  // Auto-run when arriving via /?ticker=… (a saved card or a shared link).
  useEffect(() => {
    if (seed) runLookup(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Before the first lookup, show the landing page. Once a lookup starts,
  // switch to the focused tool view.
  if (view.kind === "idle") {
    return (
      <div className="relative min-h-screen overflow-x-clip bg-background">
        <Landing ticker={ticker} setTicker={setTicker} onSubmit={lookup} onPick={runLookup} />
      </div>
    );
  }

  return (
    // The calm workspace: plain warm paper with a barely-there brand wash at
    // the top — no sunrise scenery here, that energy stays on the landing.
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-50/60 to-transparent"
      />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          {isSignedIn ? (
            // Signed in: home base is the dashboard.
            <Link
              href="/dashboard"
              className="font-display text-2xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
            >
              Orin
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setView({ kind: "idle" })}
              className="font-display text-2xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
              aria-label="Back to Orin home"
            >
              Orin
            </button>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchForm
              ticker={ticker}
              setTicker={setTicker}
              onSubmit={lookup}
              loading={view.kind === "loading"}
              variant="compact"
            />
            <DiscoverLink />
            <AuthControls />
          </div>
        </header>

        {view.kind === "loading" && <LoadingState ticker={view.ticker} />}
        {view.kind === "error" && <ErrorState message={view.message} />}
        {view.kind === "result" && <Results data={view.data} />}

        <footer className="border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
          All numbers come straight from the company&apos;s official SEC report. The
          explanations are AI-written using only those numbers. Not investment advice.
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------- search form ----------------------------- */

function SearchForm({
  ticker,
  setTicker,
  onSubmit,
  loading,
  variant,
}: {
  ticker: string;
  setTicker: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  variant: "hero" | "compact";
}) {
  const hero = variant === "hero";

  if (hero) {
    // Landing treatment: one warm floating "pill" that holds both the input
    // and the CTA, so the whole unit reads as a single inviting action.
    return (
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-lg items-center gap-2 rounded-2xl border border-border/80 bg-card/90 p-2 shadow-card-lg backdrop-blur-sm transition-shadow focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-600/10"
      >
        <Input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker, e.g. AAPL"
          aria-label="Stock ticker"
          maxLength={10}
          className="h-12 flex-1 border-transparent bg-transparent px-3 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 shrink-0 rounded-xl px-6 text-[15px] font-semibold shadow-[0_8px_20px_-8px_var(--color-brand-600)]"
          disabled={loading}
        >
          {loading ? "Reading…" : "Explain it"}
        </Button>
      </form>
    );
  }

  // Compact treatment used inside the tool view header.
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Ticker, e.g. AAPL"
        aria-label="Stock ticker"
        maxLength={10}
        className="h-11 max-w-48 rounded-xl bg-card text-base shadow-card"
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 rounded-xl px-5 shadow-[0_6px_16px_-8px_var(--color-brand-600)]"
        disabled={loading}
      >
        {loading ? "Reading…" : "Explain it"}
      </Button>
    </form>
  );
}

/* -------------------------------- landing -------------------------------- */

function Landing({
  ticker,
  setTicker,
  onSubmit,
  onPick,
}: {
  ticker: string;
  setTicker: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  /** Runs a lookup directly for a tapped suggestion chip. */
  onPick: (ticker: string) => void;
}) {
  // Gentle scene parallax: pointer position (fine pointers only) and scroll
  // write CSS vars onto the backdrop; each layer translates by its own depth
  // factor (see .orin-plx in globals.css). rAF-throttled, direct style writes
  // (no React re-renders), and skipped entirely under reduced motion — the
  // CSS transform then stays at identity since the vars default to 0.
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = backdropRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let mx = 0;
    let my = 0;
    let sy = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
      el.style.setProperty("--sy", sy.toFixed(1));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    };
    const onScroll = () => {
      sy = Math.min(window.scrollY, 240);
      schedule();
    };

    // Touch devices get the scroll-based parallax only.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (finePointer) window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (finePointer) window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="relative isolate flex flex-col">
      {/* Sunrise backdrop — a static illustrated dawn in cheap layers: the
          CSS sky gradient, faint stars, soft cloud wisps, and a horizon SVG
          holding the rising sun plus five receding ranges, finished with a
          band of valley mist. No images, no filters, no animation — masked
          so everything dissolves into the paper background (globals.css). */}
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden sm:h-[640px]"
      >
        {/* Every parallax layer bleeds 24px past the container's top and
            sides (-inset-x-6 / -top-6) so its edges can never slide into
            view — translations max out well under 24px. Bottoms stay
            anchored: the scene already fades to paper there. */}
        <div
          className="orin-sunrise orin-plx absolute -inset-x-6 -top-6 bottom-0"
          style={{ "--plx": 4, "--ply": 3, "--pls": 0.05 } as React.CSSProperties}
        />

        {/* Fading stars in the still-blue part of the sky */}
        <svg
          className="orin-stars orin-plx absolute -inset-x-6 -top-6 h-[304px]"
          style={{ "--plx": 7, "--ply": 5, "--pls": 0.04, width: "calc(100% + 3rem)" } as React.CSSProperties}
          viewBox="0 0 1440 280"
          preserveAspectRatio="xMidYMin slice"
          fill="white"
        >
          <circle cx="60" cy="42" r="1.2" opacity="0.5" />
          <circle cx="152" cy="92" r="1" opacity="0.35" />
          <circle cx="243" cy="30" r="1.4" opacity="0.55" />
          <circle cx="332" cy="122" r="0.9" opacity="0.3" />
          <circle cx="428" cy="62" r="1.1" opacity="0.45" />
          <circle cx="521" cy="24" r="1" opacity="0.4" />
          <circle cx="608" cy="102" r="1.3" opacity="0.35" />
          <circle cx="702" cy="50" r="1" opacity="0.5" />
          <circle cx="788" cy="138" r="0.9" opacity="0.25" />
          <circle cx="884" cy="36" r="1.2" opacity="0.45" />
          <circle cx="978" cy="92" r="1" opacity="0.35" />
          <circle cx="1063" cy="46" r="1.4" opacity="0.5" />
          <circle cx="1152" cy="120" r="0.9" opacity="0.3" />
          <circle cx="1238" cy="72" r="1.1" opacity="0.4" />
          <circle cx="1332" cy="32" r="1.2" opacity="0.5" />
          <circle cx="1392" cy="112" r="0.9" opacity="0.3" />
          <circle cx="502" cy="162" r="0.8" opacity="0.2" />
          <circle cx="902" cy="172" r="0.8" opacity="0.2" />
        </svg>

        {/* Soft cloud wisps — desktop only, kept near the edges so the sky
            behind the headline stays calm. Each drifts at its own slow tempo
            (see .orin-cloud in globals.css); the wrapper carries their
            parallax depth so drift and parallax transforms don't collide. */}
        <div
          className="orin-plx absolute -inset-x-6 -top-6 bottom-0"
          style={{ "--plx": 12, "--ply": 8, "--pls": 0.03 } as React.CSSProperties}
        >
          <div
            className="orin-cloud absolute left-[6%] top-[130px] hidden h-10 w-64 sm:block"
            style={{ animationDuration: "26s" }}
          />
          <div
            className="orin-cloud absolute right-[4%] top-[210px] hidden h-12 w-80 sm:block"
            style={{ animationDuration: "34s", animationDelay: "-14s" }}
          />
          <div
            className="orin-cloud absolute right-[22%] top-[90px] hidden h-8 w-48 opacity-70 sm:block"
            style={{ animationDuration: "42s", animationDelay: "-27s" }}
          />
        </div>

        {/* Dawn horizon: the rising sun plus six ranges receding with
            atmospheric perspective — coolest and lightest at the back,
            warming and firming toward the front; one mid range picks up
            the sunrise light via a gradient fill, haze bands pool between
            ridges, and a wide light-band glows on the middle distance. The
            sun lives INSIDE this SVG so the ranges genuinely occlude its
            lower half at every viewport size; on load the whole sun group
            rises into place (.orin-sun). Bases fade via .orin-horizon. */}
        <svg
          className="orin-horizon orin-plx absolute -inset-x-6 bottom-0 h-24 sm:h-40"
          style={{ "--plx": 16, "--ply": 10, "--pls": 0.02, width: "calc(100% + 3rem)" } as React.CSSProperties}
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <defs>
            <radialGradient id="orinSunGlow">
              <stop offset="0%" stopColor="oklch(0.98 0.07 82)" stopOpacity="0.9" />
              <stop offset="55%" stopColor="oklch(0.97 0.06 78)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="oklch(0.97 0.055 78)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orinSunCore">
              <stop offset="0%" stopColor="oklch(1 0.01 95)" />
              <stop offset="40%" stopColor="oklch(0.995 0.035 90)" />
              <stop offset="62%" stopColor="oklch(0.98 0.07 82)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="oklch(0.97 0.08 75)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="orinHorizonGlow">
              <stop offset="0%" stopColor="oklch(0.97 0.06 78)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="oklch(0.97 0.06 78)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="orinHaze" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.99 0.01 85)" stopOpacity="0" />
              <stop offset="100%" stopColor="oklch(0.99 0.01 85)" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="orinLitRange" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="oklch(0.84 0.04 345)" />
              <stop offset="50%" stopColor="oklch(0.89 0.055 55)" />
              <stop offset="100%" stopColor="oklch(0.84 0.04 345)" />
            </linearGradient>
          </defs>

          {/* The sun: an outer bloom, the breathing inner bloom, and the
              flattened glowing disc — grouped so the whole light source
              rises into place on load. Off-center so it climbs into open
              sky instead of hiding behind the search pill. */}
          <g className="orin-sun">
            <g opacity="0.5">
              <ellipse
                className="orin-sun-glow"
                style={{ animationDuration: "8.5s" }}
                cx="990"
                cy="140"
                rx="520"
                ry="200"
                fill="url(#orinSunGlow)"
              />
            </g>
            <ellipse
              className="orin-sun-glow"
              cx="990"
              cy="135"
              rx="320"
              ry="140"
              fill="url(#orinSunGlow)"
            />
            <circle cx="990" cy="110" r="72" fill="url(#orinSunCore)" />
          </g>

          {/* ranges, farthest → nearest, with haze pooling between ridges.
              The three most distant are desktop-only: compressed onto a
              phone width they turn to noise. */}
          <path
            className="hidden sm:block"
            d="M0,158 L110,132 L230,152 L360,118 L500,146 L640,126 L780,150 L920,122 L1060,148 L1200,128 L1330,150 L1440,134 L1440,320 L0,320 Z"
            fill="var(--color-brand-200)"
            fillOpacity="0.28"
          />
          <path
            className="hidden sm:block"
            d="M0,175 L120,142 L250,170 L380,126 L520,162 L640,144 L760,168 L880,136 L1000,164 L1120,140 L1250,168 L1360,148 L1440,160 L1440,320 L0,320 Z"
            fill="var(--color-brand-200)"
            fillOpacity="0.45"
          />
          <path
            className="hidden sm:block"
            d="M0,205 L95,168 L205,198 L335,142 L445,186 L555,158 L680,200 L800,150 L910,190 L1015,162 L1125,200 L1240,152 L1340,190 L1440,166 L1440,320 L0,320 Z"
            fill="oklch(0.86 0.03 340)"
            fillOpacity="0.55"
          />
          {/* haze pooling on the far ranges' lower slopes (desktop) */}
          <rect
            className="hidden sm:block"
            x="0"
            y="170"
            width="1440"
            height="80"
            fill="url(#orinHaze)"
            opacity="0.6"
          />
          <path
            d="M0,248 L170,196 L315,238 L480,180 L650,246 L830,198 L1000,248 L1160,206 L1310,242 L1440,212 L1440,320 L0,320 Z"
            fill="oklch(0.84 0.045 350)"
            fillOpacity="0.55"
          />
          {/* haze between the mid and near ranges (all sizes) */}
          <rect x="0" y="212" width="1440" height="78" fill="url(#orinHaze)" opacity="0.55" />
          <path
            d="M0,268 L190,228 L370,262 L560,214 L760,266 L950,226 L1130,264 L1290,238 L1440,258 L1440,320 L0,320 Z"
            fill="url(#orinLitRange)"
            fillOpacity="0.6"
          />
          {/* the sun's light glowing on the middle distance, with the
              nearest range silhouetted against it */}
          <ellipse cx="990" cy="252" rx="430" ry="58" fill="url(#orinHorizonGlow)" />
          <path
            d="M0,296 L215,252 L440,288 L665,268 L920,292 L1140,258 L1440,284 L1440,320 L0,320 Z"
            fill="oklch(0.85 0.052 58)"
            fillOpacity="0.7"
          />
        </svg>

        {/* morning mist pooling over the mountain bases */}
        <div
          className="orin-mist orin-plx absolute -inset-x-6 bottom-0 h-14 sm:h-20"
          style={{ "--plx": 20, "--ply": 12, "--pls": 0.015 } as React.CSSProperties}
        />

        {/* film grain over the whole scene — static, illustrated texture */}
        <div className="orin-grain absolute inset-0" />
      </div>

      {/* Top bar: wordmark left, discovery + account right */}
      {/* flex-wrap: on narrow phones the account controls drop to a second
          row instead of forcing the page wider than the viewport. */}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-5">
        <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Orin
        </span>
        <div className="flex items-center gap-2">
          <DiscoverLink />
          <AuthControls />
        </div>
      </header>

      {/* Hero — content eases up into place on load, one element after the
          next (--fade-order sets each element's slot in the stagger). */}
      <section className="flex flex-col items-center px-6 pt-14 pb-16 text-center sm:pt-24 sm:pb-24">
        <h1
          className="orin-fade-up max-w-3xl text-balance font-display text-5xl font-medium leading-[1.06] tracking-tight text-foreground sm:text-7xl"
          style={{ "--fade-order": 0 } as React.CSSProperties}
        >
          Understand what you own
        </h1>
        {/* sand-600 (not muted-foreground): this copy sits on the tinted
            sunrise wash, so it needs one step more contrast than plain paper */}
        <p
          className="orin-fade-up mt-6 max-w-xl text-balance text-base leading-7 text-sand-600 sm:text-lg sm:leading-8"
          style={{ "--fade-order": 1 } as React.CSSProperties}
        >
          Orin reads company earnings reports and tells you in plain English what&apos;s
          really going on — including what most people miss.
        </p>

        <div
          className="orin-fade-up mt-10 flex w-full justify-center"
          style={{ "--fade-order": 2 } as React.CSSProperties}
        >
          <SearchForm
            ticker={ticker}
            setTicker={setTicker}
            onSubmit={onSubmit}
            loading={false}
            variant="hero"
          />
        </div>
        <p
          className="orin-fade-up mt-4 text-sm text-sand-600"
          style={{ "--fade-order": 3 } as React.CSSProperties}
        >
          Free · no account needed
        </p>

        {/* One-tap suggestions — a soft nudge past the blank-box moment. Small,
            quiet pills so they read as a helpful starting point, not CTAs. */}
        <div
          className="orin-fade-up mt-6 flex flex-wrap items-center justify-center gap-2"
          style={{ "--fade-order": 4 } as React.CSSProperties}
        >
          <span className="text-xs text-sand-600">Try</span>
          {SUGGESTED_TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-sand-700 shadow-card ring-1 ring-sand-900/8 backdrop-blur-sm transition-colors hover:text-brand-700 hover:ring-brand-300"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-4xl px-6 py-8" aria-label="How Orin works">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <HowStep
            n={1}
            icon={<Search className="size-4.5 text-accent-foreground" aria-hidden />}
            title="Type a ticker"
            body="Any US-listed company — like AAPL or NVDA."
          />
          <HowStep
            n={2}
            icon={<FileText className="size-4.5 text-accent-foreground" aria-hidden />}
            title="Orin reads the filing"
            body="The latest official quarterly or annual report, start to finish."
          />
          <HowStep
            n={3}
            icon={<Sparkles className="size-4.5 text-accent-foreground" aria-hidden />}
            title="Get the real story"
            body="A plain-English summary, the key numbers, and the fine print."
          />
        </div>
      </section>

      {/* Trust / differentiation */}
      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="rounded-3xl bg-gradient-to-b from-brand-50 to-card p-8 text-center shadow-card ring-1 ring-brand-100 sm:p-10">
          <p className="text-balance font-display text-xl font-medium leading-8 text-foreground sm:text-2xl sm:leading-9">
            Other tools show you the numbers.{" "}
            <span className="text-primary">Orin actually reads the report</span> — the
            risks, the fine print, and the things companies would rather you skim past.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-4xl px-6 pb-14 pt-6">
        <p className="border-t border-border pt-6 text-center text-xs leading-5 text-muted-foreground">
          Orin helps you understand company filings. It is not investment advice.
        </p>
      </footer>
    </div>
  );
}

function HowStep({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="rounded-2xl bg-card shadow-card ring-sand-900/8">
      <CardContent className="flex flex-col gap-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
            {icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Step {n}
          </span>
        </div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- loading state ----------------------------- */

function LoadingState({ ticker }: { ticker: string }) {
  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        Reading {ticker}&apos;s latest report and writing the explanation — this takes up
        to a minute.
      </p>
      {/* Header skeleton */}
      <Card className={cardShell}>
        <CardContent className="flex flex-col gap-3 py-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </CardContent>
      </Card>
      {/* Grid skeleton mirroring the result layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          {/* mirrors the "What most people miss" hero treatment */}
          <div className="rounded-2xl bg-card p-6 shadow-card-lg ring-1 ring-brand-200/70">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-xl bg-brand-100" />
              <Skeleton className="h-6 w-56" />
            </div>
            <div className="mt-6 flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-brand-50/60 p-4">
                  <Skeleton className="h-4 w-full bg-sand-200/70" />
                  <Skeleton className="mt-2 h-4 w-4/5 bg-sand-200/70" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className={cardShell}>
                <CardContent className="flex flex-col gap-2 py-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-6 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className={cardShell}>
            <CardContent className="flex flex-col gap-3 py-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-44 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ error state ------------------------------ */

function ErrorState({ message }: { message: string }) {
  return (
    <Card className={cn(cardShell, "max-w-2xl ring-destructive/25")}>
      <CardContent className="flex items-start gap-3 py-1">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
          <AlertCircle className="size-4 text-destructive" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">We couldn&apos;t find that one</p>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- results -------------------------------- */

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Results({ data }: { data: FilingApiSuccess }) {
  const { snapshot, summary, summaryNote } = data;
  const m = snapshot.metrics;
  const sections = parseSummary(summary ?? "");
  const periodWord = snapshot.form === "10-Q" ? "quarter" : "fiscal year";
  const hasDerivedPoint = snapshot.history.some((p) => p.revenueDerived);

  return (
    <div className="flex flex-col gap-6">
      {/* Header card — full width */}
      <Card className={cardShell}>
        <CardContent className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-display text-2xl font-medium tracking-tight">
                {snapshot.companyName}
              </h2>
              <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-medium tracking-wide text-accent-foreground ring-1 ring-brand-100">
                {snapshot.ticker}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Latest report ({snapshot.form}) · covers the {periodWord} ended{" "}
              {formatDate(snapshot.periodEnd)} · published {formatDate(snapshot.filedDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SaveButton
              ticker={snapshot.ticker}
              companyName={snapshot.companyName}
              accessionNumber={snapshot.accessionNumber}
              form={snapshot.form}
              filedDate={snapshot.filedDate}
            />
            <a
              href={snapshot.filingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "gap-2 rounded-xl bg-card",
              )}
            >
              Read the official report
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Business Health — glanceable signal right under the company header. */}
      <BusinessHealth snapshot={snapshot} />

      {/* Bento grid: insights + summary in the primary column, numbers in the
          secondary column. Single column on mobile, insights first. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:grid-rows-[auto_1fr]">
        {/* HERO — the reason the app exists */}
        <section
          aria-label="What most people miss"
          className="lg:col-span-3 lg:col-start-1 lg:row-start-1"
        >
          {/* The signature section: same card language as everything else,
              but set apart by a brand-blue hairline ring, a whisper of blue
              in the top-left corner, and the deeper shadow-card-lg. Calm,
              not loud — no glows. */}
          <div className="relative h-full overflow-hidden rounded-2xl bg-card p-6 shadow-card-lg ring-1 ring-brand-200/70 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_0%,--theme(--color-brand-100/45%),transparent_60%)]"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600/10 ring-1 ring-brand-600/20">
                <Eye className="size-5 text-brand-700" aria-hidden />
              </span>
              <div className="flex flex-col">
                <h2 className="text-xl font-semibold tracking-tight">What most people miss</h2>
                <p className="text-xs text-muted-foreground">
                  Things this report mentions quietly that deserve your attention
                </p>
              </div>
            </div>

            {sections.downplaying.length > 0 ? (
              <ol className="relative mt-6 flex flex-col gap-4">
                {sections.downplaying.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-4 rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-100/70"
                  >
                    <span
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[13px] font-semibold tabular-nums text-brand-700"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <p className="max-w-[62ch] text-[15px] leading-7 text-foreground/90">{b}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="relative mt-6 text-sm leading-6 text-muted-foreground">
                {summaryNote ?? "We couldn't produce insights for this report."}
              </p>
            )}

            <p className="relative mt-5 text-xs leading-5 text-muted-foreground">
              Our AI&apos;s reading of the report&apos;s own wording — a starting point for
              questions, not a verdict.
            </p>
          </div>
        </section>

        {/* Secondary column: the numbers */}
        <div className="flex flex-col gap-6 lg:col-span-2 lg:col-start-4 lg:row-span-2 lg:row-start-1">
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Revenue"
              explain="money brought in"
              value={m.revenue.value !== null ? formatUsdCompact(m.revenue.value) : null}
              change={m.revenue.yoyPct}
            />
            <StatCard
              label="Growth"
              explain="vs. a year ago"
              value={m.revenue.yoyPct !== null ? formatPct(m.revenue.yoyPct) : null}
              change={m.revenue.yoyPct}
              emphasizeChangeColor
            />
            <StatCard
              label="EPS"
              explain="profit per share"
              value={m.dilutedEps.value !== null ? formatPerShare(m.dilutedEps.value) : null}
              change={m.dilutedEps.yoyPct}
            />
          </div>

          {snapshot.history.length >= 2 && (
            <Card className={cardShell}>
              <CardContent className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-base font-semibold tracking-tight">Revenue trend</h2>
                  <p className="text-xs text-muted-foreground">
                    Last {snapshot.history.length}{" "}
                    {snapshot.historyKind === "quarterly" ? "quarters" : "years"} — real SEC
                    figures
                  </p>
                </div>
                <RevenueChart history={snapshot.history} />
                {hasDerivedPoint && (
                  <p className="text-[11px] leading-4 text-muted-foreground/80">
                    Companies don&apos;t file a separate fourth-quarter report, so those
                    points are calculated from the annual total minus the three reported
                    quarters.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className={cardShell}>
            <CardContent className="py-2">
              <h2 className="text-base font-semibold tracking-tight">More numbers</h2>
              <SecondaryMetrics metrics={m} />
            </CardContent>
          </Card>
        </div>

        {/* Plain-English summary — under the hero in the primary column */}
        <section
          aria-label="Plain-English summary"
          className="lg:col-span-3 lg:col-start-1 lg:row-start-2"
        >
          <Card className={cn(cardShell, "h-full")}>
            <CardContent className="flex flex-col gap-4 py-2">
              <h2 className="text-lg font-semibold tracking-tight">In plain English</h2>
              {summary ? (
                <div className="flex flex-col gap-4">
                  {sections.intro.map((p, i) => (
                    <p key={i} className="max-w-[68ch] text-[15px] leading-7 text-foreground/90">
                      {p}
                    </p>
                  ))}
                  {sections.notable.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <h3 className="text-sm font-semibold">What changed since last year</h3>
                      <ul className="flex flex-col gap-2">
                        {sections.notable.map((b, i) => (
                          <li
                            key={i}
                            className="flex max-w-[68ch] gap-2.5 text-[15px] leading-7 text-foreground/90"
                          >
                            <span
                              className="mt-[13px] size-1.5 shrink-0 rounded-full bg-primary/60"
                              aria-hidden
                            />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  {summaryNote ?? "The explanation is unavailable right now."}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------- stat cards ------------------------------ */

function StatCard({
  label,
  explain,
  value,
  change,
  emphasizeChangeColor = false,
}: {
  label: string;
  explain: string;
  value: string | null;
  change: number | null;
  emphasizeChangeColor?: boolean;
}) {
  const up = change !== null && change >= 0;
  const changeColor = up ? "text-up" : "text-down";
  return (
    <Card className={cardShell}>
      <CardContent className="flex flex-col gap-1 px-3 py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {change !== null &&
            (up ? (
              <ArrowUpRight className={cn("size-3.5", changeColor)} aria-hidden />
            ) : (
              <ArrowDownRight className={cn("size-3.5", changeColor)} aria-hidden />
            ))}
        </div>
        {value === null ? (
          <span className="text-sm text-muted-foreground">not reported</span>
        ) : (
          <span
            className={cn(
              "text-xl font-bold tracking-tight tabular-nums sm:text-2xl",
              emphasizeChangeColor && change !== null && changeColor,
            )}
          >
            {value}
          </span>
        )}
        <span className="text-[11px] leading-4 text-muted-foreground/70">{explain}</span>
      </CardContent>
    </Card>
  );
}

function SecondaryMetrics({ metrics }: { metrics: FilingApiSuccess["snapshot"]["metrics"] }) {
  const rows: Array<{
    label: string;
    explain: string;
    metric: MetricValue;
    fmt: (v: number) => string;
  }> = [
    { label: "Net income", explain: "profit after all costs", metric: metrics.netIncome, fmt: formatUsd },
    {
      label: "Operating income",
      explain: "profit from day-to-day business",
      metric: metrics.operatingIncome,
      fmt: formatUsd,
    },
    {
      label: "Gross margin",
      explain: "share of sales kept after direct costs",
      metric: metrics.grossMarginPct,
      fmt: (v) => formatPct(v, false),
    },
    { label: "Total assets", explain: "everything the company owns", metric: metrics.totalAssets, fmt: formatUsd },
    {
      label: "Total liabilities",
      explain: "everything it owes",
      metric: metrics.totalLiabilities,
      fmt: formatUsd,
    },
  ];
  return (
    <dl className="mt-3 flex flex-col divide-y divide-border/70">
      {rows.map(({ label, explain, metric, fmt }) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="flex flex-col">
            <span className="text-sm text-foreground/80">{label}</span>
            <span className="text-[11px] leading-4 text-muted-foreground/70">{explain}</span>
          </dt>
          <dd className="text-sm font-medium tabular-nums">
            {metric.value === null ? (
              <span className="font-normal text-muted-foreground/70">not reported</span>
            ) : (
              fmt(metric.value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------- summary parsing ---------------------------- */

interface SummarySections {
  intro: string[];
  notable: string[];
  downplaying: string[];
}

/**
 * Splits the plain-text summary into its three sections. The model still
 * emits the heading "What management may be downplaying"; the UI renames it.
 * Tolerates missing sections.
 */
function parseSummary(text: string): SummarySections {
  const sections: SummarySections = { intro: [], notable: [], downplaying: [] };
  let current: keyof SummarySections = "intro";
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      sections.intro.push(paragraph.join(" "));
      paragraph = [];
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^notable changes:?$/i.test(line)) {
      flushParagraph();
      current = "notable";
    } else if (/^what management may be downplaying:?$/i.test(line)) {
      flushParagraph();
      current = "downplaying";
    } else if (line.startsWith("- ")) {
      flushParagraph();
      const target = current === "intro" ? "notable" : current;
      sections[target].push(line.slice(2));
    } else if (line === "") {
      flushParagraph();
    } else if (current === "intro") {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return sections;
}
