import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
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
    // Clerk's built-in UI (sign-in modal, account menu) to our dark theme with
    // the Orin indigo accent, so it feels native rather than bolted on.
    <ClerkProvider
      appearance={{
        theme: dark,
        variables: {
          colorPrimary: "#7c5cff",
          colorBackground: "#12131a",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-sans)",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
