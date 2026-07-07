import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthControls } from "@/components/auth-controls";
import { DiscoverLink } from "@/components/discover-link";
import { DashboardSearch } from "@/components/portfolio/dashboard-search";
import { PortfolioGrid } from "@/components/portfolio/portfolio-grid";
import { getSavedStocks } from "@/lib/portfolio/actions.ts";

// Reads the signed-in user's saved rows on the server, so nothing renders until
// auth is known and RLS has scoped the query to this user.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  // Logged-out visitors have no dashboard — send them to the landing page.
  if (!userId) redirect("/");

  const stocks = await getSavedStocks();

  return (
    // Calm workspace: warm paper with a barely-there brand wash up top.
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-brand-50/60 to-transparent"
      />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 sm:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="font-display text-2xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            Orin
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <DashboardSearch />
            <DiscoverLink />
            <AuthControls showDashboardLink={false} />
          </div>
        </header>

        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-medium tracking-tight">Your portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Companies you&apos;ve saved. Tap any card to jump back into its full analysis.
          </p>
        </div>

        <PortfolioGrid initialStocks={stocks} />

        <footer className="border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
          All numbers come straight from each company&apos;s official SEC report. Not
          investment advice.
        </footer>
      </main>
    </div>
  );
}
