"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Eye,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPct, formatPerShare, formatUsd } from "@/lib/format.ts";
import type { FilingApiResponse, FilingApiSuccess } from "@/lib/api-types.ts";
import type { MetricValue } from "@/lib/edgar/types.ts";

type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; ticker: string }
  | { kind: "error"; message: string }
  | { kind: "result"; data: FilingApiSuccess };

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "idle" });

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setView({ kind: "loading", ticker: t });
    try {
      const res = await fetch(`/api/filing/${encodeURIComponent(t)}`);
      const data = (await res.json()) as FilingApiResponse;
      if (data.ok) setView({ kind: "result", data });
      else setView({ kind: "error", message: data.message });
    } catch {
      setView({
        kind: "error",
        message: "Something went wrong fetching the filing. Please try again.",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-16 sm:py-20">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Orin</h1>
          <p className="max-w-md text-[15px] leading-6 text-muted-foreground">
            SEC filings, explained in plain English. Type a ticker to see a company&apos;s
            latest 10-Q or 10-K with the real numbers.
          </p>
        </header>

        <form onSubmit={lookup} className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Ticker, e.g. AAPL"
            aria-label="Stock ticker"
            maxLength={10}
            className="h-10 max-w-48 bg-card text-base"
          />
          <Button type="submit" size="lg" className="h-10 px-4" disabled={view.kind === "loading"}>
            {view.kind === "loading" ? "Reading…" : "Explain it"}
          </Button>
        </form>

        {view.kind === "loading" && <LoadingState ticker={view.ticker} />}
        {view.kind === "error" && <ErrorState message={view.message} />}
        {view.kind === "result" && <Results data={view.data} />}

        <footer className="border-t pt-6 text-xs leading-5 text-muted-foreground">
          Figures come directly from SEC EDGAR data. Commentary is AI-written from the
          filing itself, using only those figures. Not investment advice.
        </footer>
      </main>
    </div>
  );
}

/* ----------------------------- loading state ----------------------------- */

function LoadingState({ ticker }: { ticker: string }) {
  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        Reading {ticker}&apos;s latest filing from SEC EDGAR and writing the explanation —
        this takes up to a minute.
      </p>
      <Card>
        <CardContent className="flex flex-col gap-3 py-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-72" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 py-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/* ------------------------------ error state ------------------------------ */

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-3 py-1">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">We couldn&apos;t fetch that filing</p>
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

  return (
    <div className="flex flex-col gap-10">
      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{snapshot.companyName}</h2>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium tracking-wide text-primary">
              {snapshot.ticker}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {snapshot.form} · fiscal period ended {formatDate(snapshot.periodEnd)} · filed{" "}
            {formatDate(snapshot.filedDate)}
          </p>
        </CardContent>
      </Card>

      {/* Key numbers */}
      <section className="flex flex-col gap-4" aria-label="Key numbers">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Revenue"
            value={m.revenue.value !== null ? formatUsd(m.revenue.value) : null}
            change={m.revenue.yoyPct}
            changeLabel="vs. last year"
          />
          <StatCard
            label="Year over year"
            value={m.revenue.yoyPct !== null ? formatPct(m.revenue.yoyPct) : null}
            change={m.revenue.yoyPct}
            changeLabel="revenue growth"
            emphasizeChangeColor
          />
          <StatCard
            label="Diluted EPS"
            value={m.dilutedEps.value !== null ? formatPerShare(m.dilutedEps.value) : null}
            change={m.dilutedEps.yoyPct}
            changeLabel="vs. last year"
          />
        </div>
        <SecondaryMetrics metrics={m} />
      </section>

      {/* Plain-English summary */}
      <section className="flex flex-col gap-3" aria-label="Plain-English summary">
        <h2 className="text-lg font-semibold tracking-tight">In plain English</h2>
        {summary ? (
          <div className="flex flex-col gap-4">
            {sections.intro.map((p, i) => (
              <p key={i} className="text-[15px] leading-7 text-foreground/90">
                {p}
              </p>
            ))}
            {sections.notable.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <h3 className="text-sm font-semibold">Notable changes</h3>
                <ul className="flex flex-col gap-2">
                  {sections.notable.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-[15px] leading-7 text-foreground/90">
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
            {summaryNote ?? "The summary is unavailable."}
          </p>
        )}
      </section>

      {/* Signature: what management may be downplaying */}
      {sections.downplaying.length > 0 && (
        <section aria-label="What management may be downplaying">
          <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-transparent p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15">
                <Eye className="size-4 text-primary" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-primary">
                What management may be downplaying
              </h2>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {sections.downplaying.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-7">
                  <span className="mt-[13px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              An AI reading of the filing&apos;s own discussion — worth a closer look, not a
              verdict.
            </p>
          </div>
        </section>
      )}

      {/* Source */}
      <div>
        <a
          href={snapshot.filingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
        >
          Read the full filing on sec.gov
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

/* ------------------------------- stat cards ------------------------------ */

function StatCard({
  label,
  value,
  change,
  changeLabel,
  emphasizeChangeColor = false,
}: {
  label: string;
  value: string | null;
  change: number | null;
  changeLabel: string;
  emphasizeChangeColor?: boolean;
}) {
  const up = change !== null && change >= 0;
  const changeColor = up
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {value === null ? (
          <span className="text-lg text-muted-foreground">not reported</span>
        ) : (
          <span
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              emphasizeChangeColor && change !== null && changeColor,
            )}
          >
            {value}
          </span>
        )}
        {change !== null && (
          <span className={cn("flex items-center gap-1 text-xs font-medium", changeColor)}>
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {changeLabel}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function SecondaryMetrics({ metrics }: { metrics: FilingApiSuccess["snapshot"]["metrics"] }) {
  const rows: Array<{ label: string; metric: MetricValue; fmt: (v: number) => string }> = [
    { label: "Net income", metric: metrics.netIncome, fmt: formatUsd },
    { label: "Operating income", metric: metrics.operatingIncome, fmt: formatUsd },
    { label: "Gross margin", metric: metrics.grossMarginPct, fmt: (v) => formatPct(v, false) },
    { label: "Total assets", metric: metrics.totalAssets, fmt: formatUsd },
    { label: "Total liabilities", metric: metrics.totalLiabilities, fmt: formatUsd },
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 px-1 text-sm">
      {rows.map(({ label, metric, fmt }) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">
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
 * Splits the plain-text summary into its three sections. Tolerates missing
 * sections (e.g. responses generated before the downplaying section existed).
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
