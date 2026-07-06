import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Nav link to the public discovery feed. No hooks, so it works in both server
// and client component headers.
export function DiscoverLink({ className }: { className?: string }) {
  return (
    <Link
      href="/discover"
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 rounded-lg", className)}
    >
      <Compass className="size-4" aria-hidden />
      Discover
    </Link>
  );
}
