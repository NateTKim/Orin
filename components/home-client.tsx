"use client";

import { useEffect, useState } from "react";
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

/* Floating-card treatment shared across the page. */
const cardShell =
  "rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent shadow-[0_8px_30px_rgba(0,0,0,0.35)]";

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
        <Landing ticker={ticker} setTicker={setTicker} onSubmit={lookup} />
      </div>
    );
  }

  return (
    // `dark` keeps the tool view on the legacy dark theme until Pass 2 of the
    // redesign restyles it (the site-wide default is now warm light).
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Soft accent glow behind the header */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(50%_60%_at_50%_0%,--theme(--color-primary/14%),transparent_70%)]"
      />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          {isSignedIn ? (
            // Signed in: home base is the dashboard.
            <Link
              href="/dashboard"
              className="text-2xl font-semibold tracking-tight text-primary transition-opacity hover:opacity-80"
            >
              Orin
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setView({ kind: "idle" })}
              className="text-2xl font-semibold tracking-tight text-primary transition-opacity hover:opacity-80"
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

        <footer className="border-t border-white/[0.06] pt-6 text-xs leading-5 text-muted-foreground">
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

  // Compact treatment used inside the (still dark) tool view header.
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Ticker, e.g. AAPL"
        aria-label="Stock ticker"
        maxLength={10}
        className="h-11 max-w-48 rounded-xl border-white/10 bg-card text-base shadow-inner"
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 rounded-xl px-5 shadow-[0_0_24px_-6px_var(--color-primary)]"
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
}: {
  ticker: string;
  setTicker: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="relative isolate flex flex-col">
      {/* Sunrise backdrop — a static scene in three cheap layers: the CSS
          sky gradient, a whisper of stars up top, and a layered mountain
          horizon along the bottom (inline SVG, ~1 KB). All masked so they
          dissolve into the paper background (see globals.css). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden sm:h-[640px]"
      >
        <div className="orin-sunrise absolute inset-0" />

        {/* Fading stars in the still-blue part of the sky */}
        <svg
          className="orin-stars absolute inset-x-0 top-0 h-[280px] w-full"
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

        {/* Dawn horizon: three overlapping flat ranges — far (cool blue
            haze), mid (soft rose), near (warm sand) — bases fading into
            the paper background via the .orin-horizon mask. */}
        <svg
          className="orin-horizon absolute inset-x-0 bottom-0 h-24 w-full sm:h-40"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          {/* The busiest range is desktop-only: squeezed onto a phone width
              its peaks get too dense and read as noise. */}
          <path
            className="hidden sm:block"
            d="M0,205 L95,160 L205,195 L335,118 L445,178 L555,148 L680,198 L800,132 L910,182 L1015,152 L1125,196 L1240,140 L1340,185 L1440,158 L1440,320 L0,320 Z"
            fill="var(--color-brand-200)"
            fillOpacity="0.5"
          />
          <path
            d="M0,248 L170,182 L315,232 L480,166 L650,244 L830,188 L1000,246 L1160,196 L1310,238 L1440,202 L1440,320 L0,320 Z"
            fill="oklch(0.84 0.045 350)"
            fillOpacity="0.4"
          />
          <path
            d="M0,292 L215,238 L440,282 L665,228 L920,286 L1140,248 L1440,278 L1440,320 L0,320 Z"
            fill="oklch(0.87 0.05 60)"
            fillOpacity="0.55"
          />
        </svg>
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

      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-14 pb-16 text-center sm:pt-24 sm:pb-24">
        <h1 className="max-w-3xl text-balance font-display text-5xl font-medium leading-[1.06] tracking-tight text-foreground sm:text-7xl">
          Understand what you own
        </h1>
        {/* sand-600 (not muted-foreground): this copy sits on the tinted
            sunrise wash, so it needs one step more contrast than plain paper */}
        <p className="mt-6 max-w-xl text-balance text-base leading-7 text-sand-600 sm:text-lg sm:leading-8">
          Orin reads company earnings reports and tells you in plain English what&apos;s
          really going on — including what most people miss.
        </p>

        <div className="mt-10 flex w-full justify-center">
          <SearchForm
            ticker={ticker}
            setTicker={setTicker}
            onSubmit={onSubmit}
            loading={false}
            variant="hero"
          />
        </div>
        <p className="mt-4 text-sm text-sand-600">Free · no account needed</p>
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
          <Skeleton className="h-7 w-64 bg-white/[0.06]" />
          <Skeleton className="h-4 w-80 bg-white/[0.06]" />
        </CardContent>
      </Card>
      {/* Grid skeleton mirroring the result layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-[0_0_50px_-18px_var(--color-primary)]">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-xl bg-primary/15" />
              <Skeleton className="h-6 w-56 bg-white/[0.07]" />
            </div>
            <div className="mt-6 flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-white/[0.03] p-4">
                  <Skeleton className="h-4 w-full bg-white/[0.06]" />
                  <Skeleton className="mt-2 h-4 w-4/5 bg-white/[0.06]" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36 bg-white/[0.06]" />
            <Skeleton className="h-4 w-full bg-white/[0.06]" />
            <Skeleton className="h-4 w-full bg-white/[0.06]" />
            <Skeleton className="h-4 w-3/4 bg-white/[0.06]" />
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className={cardShell}>
                <CardContent className="flex flex-col gap-2 py-1">
                  <Skeleton className="h-3 w-12 bg-white/[0.06]" />
                  <Skeleton className="h-6 w-16 bg-white/[0.06]" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className={cardShell}>
            <CardContent className="flex flex-col gap-3 py-2">
              <Skeleton className="h-4 w-32 bg-white/[0.06]" />
              <Skeleton className="h-44 w-full bg-white/[0.05]" />
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
    <Card className={cn(cardShell, "max-w-2xl border-destructive/20 ring-destructive/20")}>
      <CardContent className="flex items-start gap-3 py-1">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
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
              <h2 className="text-2xl font-semibold tracking-tight">{snapshot.companyName}</h2>
              <span className="rounded-md bg-primary/15 px-2 py-0.5 text-sm font-medium tracking-wide text-accent-foreground">
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
                "gap-2 rounded-xl border-white/10 bg-background/40",
              )}
            >
              Read the official report
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Bento grid: insights + summary in the primary column, numbers in the
          secondary column. Single column on mobile, insights first. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:grid-rows-[auto_1fr]">
        {/* HERO — the reason the app exists */}
        <section
          aria-label="What most people miss"
          className="lg:col-span-3 lg:col-start-1 lg:row-start-1"
        >
          <div className="relative h-full overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 shadow-[0_0_60px_-15px_var(--color-primary)] sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_0%,--theme(--color-primary/18%),transparent_60%)]"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/40">
                <Eye className="size-5 text-accent-foreground" aria-hidden />
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
                    className="flex gap-4 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]"
                  >
                    <span
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[13px] font-semibold tabular-nums text-accent-foreground"
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
  const changeColor = up ? "text-emerald-400" : "text-red-400";
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
    <dl className="mt-3 flex flex-col divide-y divide-white/[0.05]">
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
