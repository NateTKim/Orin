import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { HomeClient } from "@/components/home-client";

// Server entry for "/". Checks auth so we can send signed-in users to their
// dashboard (their home base), while keeping the landing + search for everyone
// else. A ?ticker= link (saved cards, shared analysis) is the exception: it
// always shows the analysis, for logged-in and logged-out users alike.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string | string[] }>;
}) {
  const { userId } = await auth();
  const params = await searchParams;
  const ticker = typeof params.ticker === "string" ? params.ticker : undefined;

  if (userId && !ticker) redirect("/dashboard");

  return <HomeClient initialTicker={ticker} />;
}
