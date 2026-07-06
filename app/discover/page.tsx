import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { AuthControls } from "@/components/auth-controls";
import { DashboardSearch } from "@/components/portfolio/dashboard-search";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { getDiscoverFeed } from "@/lib/discover/feed.ts";
import { getSavedStocks } from "@/lib/portfolio/actions.ts";

// Public page: logged-in AND logged-out visitors can browse. Building the feed
// (cache miss) fetches ~40 EDGAR submissions, so allow generous time; hits are
// instant.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DiscoverPage() {
  const { userId } = await auth();

  const [feed, savedStocks] = await Promise.all([
    getDiscoverFeed(),
    userId ? getSavedStocks() : Promise.resolve([]),
  ]);
  const savedTickers = savedStocks.map((s) => s.ticker);

  return (
    // `dark` keeps this screen on the legacy dark theme until Pass 2 of the
    // redesign restyles it (the site-wide default is now warm light).
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(50%_60%_at_50%_0%,--theme(--color-primary/12%),transparent_70%)]"
      />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="text-2xl font-semibold tracking-tight text-primary transition-opacity hover:opacity-80"
          >
            Orin
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <DashboardSearch />
            <AuthControls />
          </div>
        </header>

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Recently filed reports</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Well-known companies that just filed with the SEC, newest first. These aren&apos;t
            recommendations — just reports worth understanding. Tap any company for the full
            plain-English breakdown.
          </p>
        </div>

        <DiscoverFeed items={feed} initialSavedTickers={savedTickers} />

        <footer className="border-t border-white/[0.06] pt-6 text-xs leading-5 text-muted-foreground">
          Filing dates and details come straight from SEC EDGAR. Orin helps you understand
          company filings — it is not investment advice.
        </footer>
      </main>
    </div>
  );
}
