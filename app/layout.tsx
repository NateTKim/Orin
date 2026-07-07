import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Display serif for landing headlines and brand moments (font-display token).
// Body and UI text stay Inter.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orin — SEC filings in plain English",
  description:
    "Type a stock ticker and get the company's latest SEC filing explained in plain English, with the real numbers extracted from EDGAR.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ClerkProvider makes auth state available everywhere. `appearance` themes
    // Clerk's built-in UI (sign-in modal, account menu) to the warm-light Orin
    // brand used across the whole app.
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#3b64dd",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-sans)",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
