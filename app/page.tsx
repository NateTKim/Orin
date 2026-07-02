"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Filings Copilot</h1>
          <p className="text-sm text-muted-foreground">
            Type a stock ticker to get the company&apos;s latest SEC filing (10-Q or 10-K) as
            real extracted numbers plus a plain-English summary.
          </p>
        </header>

        <form onSubmit={lookup} className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Ticker, e.g. AAPL"
            aria-label="Stock ticker"
            maxLength={10}
            className="max-w-48 bg-white dark:bg-zinc-900"
          />
          <Button type="submit" disabled={view.kind === "loading"}>
            {view.kind === "loading" ? "Fetching…" : "Look up"}
          </Button>
        </form>

        {view.kind === "loading" && <LoadingCards ticker={view.ticker} />}
        {view.kind === "error" && (
          <Card className="border-destructive/30">
            <CardContent className="text-sm">{view.message}</CardContent>
          </Card>
        )}
        {view.kind === "result" && <Results data={view.data} />}

        <footer className="pt-4 text-xs text-muted-foreground">
          Figures come directly from SEC EDGAR data. The summary is AI-written prose around
          those figures only. Not investment advice.
        </footer>
      </main>
    </div>
  );
}

function LoadingCards({ ticker }: { ticker: string }) {
  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        Pulling {ticker}&apos;s latest filing from SEC EDGAR and writing the summary — this
        takes up to a minute.
      </p>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}

function Results({ data }: { data: FilingApiSuccess }) {
  const { snapshot, summary, summaryNote } = data;
  const m = snapshot.metrics;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {snapshot.companyName} ({snapshot.ticker})
          </CardTitle>
          <CardDescription>
            {snapshot.form} · fiscal period ended {snapshot.periodEnd} · filed{" "}
            {snapshot.filedDate} ·{" "}
            <a
              href={snapshot.filingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              view filing on sec.gov
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <Metric label="Revenue" metric={m.revenue} fmt={formatUsd} />
          <Metric label="Net income" metric={m.netIncome} fmt={formatUsd} />
          <Metric label="Diluted EPS" metric={m.dilutedEps} fmt={formatPerShare} />
          <Metric label="Operating income" metric={m.operatingIncome} fmt={formatUsd} />
          <Metric
            label="Gross margin"
            metric={m.grossMarginPct}
            fmt={(v) => formatPct(v, false)}
            yoyUnit="pts"
          />
          <Metric label="Total assets" metric={m.totalAssets} fmt={formatUsd} />
          <Metric label="Total liabilities" metric={m.totalLiabilities} fmt={formatUsd} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plain-English summary</CardTitle>
        </CardHeader>
        <CardContent>
          {summary ? (
            <SummaryText text={summary} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {summaryNote ?? "The summary is unavailable."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  metric,
  fmt,
  yoyUnit = "%",
}: {
  label: string;
  metric: MetricValue;
  fmt: (v: number) => string;
  yoyUnit?: "%" | "pts";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {metric.value === null ? (
        <span className="text-sm text-muted-foreground">not reported</span>
      ) : (
        <>
          <span className="text-base font-medium tabular-nums">{fmt(metric.value)}</span>
          {metric.yoyPct !== null && (
            <span
              className={`text-xs tabular-nums ${
                metric.yoyPct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
              }`}
            >
              {yoyUnit === "pts"
                ? `${metric.yoyPct > 0 ? "+" : ""}${(metric.yoyPct * 100).toFixed(1)} pts YoY`
                : `${formatPct(metric.yoyPct)} YoY`}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Renders the plain-text summary: paragraphs, a "Notable changes" heading, "- " bullets. */
function SummaryText({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flush = (key: number) => {
    if (paragraph.length) {
      blocks.push(
        <p key={`p${key}`} className="text-sm leading-6">
          {paragraph.join(" ")}
        </p>,
      );
      paragraph = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={`u${key}`} className="list-disc space-y-1 pl-5 text-sm leading-6">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((line, i) => {
    if (line === "") {
      flush(i);
    } else if (/^notable changes:?$/i.test(line)) {
      flush(i);
      blocks.push(
        <h3 key={`h${i}`} className="pt-1 text-sm font-semibold">
          Notable changes
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush(i);
      bullets.push(line.slice(2));
    } else {
      if (bullets.length) flush(i);
      paragraph.push(line);
    }
  });
  flush(lines.length);

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
