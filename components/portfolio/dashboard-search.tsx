"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Search bar shown on the dashboard so a lookup is always one step away.
 * Navigates to /?ticker=…, which the results view reads and auto-runs — so
 * search reuses the exact same analysis screen.
 */
export function DashboardSearch() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    router.push(`/?ticker=${encodeURIComponent(t)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        id="dashboard-search"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Look up a company, e.g. AAPL"
        aria-label="Stock ticker"
        maxLength={10}
        className="h-11 w-full max-w-56 rounded-xl border-white/10 bg-card text-base shadow-inner"
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 rounded-xl px-5 shadow-[0_0_24px_-6px_var(--color-primary)]"
      >
        Explain it
      </Button>
    </form>
  );
}
