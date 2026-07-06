// Curated list of well-known, recognizable large-cap companies for the
// discovery feed, spread across sectors. Stored in code for now — easy to
// expand or make dynamic later. Tickers only; company names come from the
// EDGAR ticker map at build time.
//
// Neutral by design: this is a "recently filed reports" list, NOT a
// recommendation list. Inclusion here says nothing about a company as an
// investment — only that it's a household name whose filings are worth
// being able to understand.

export const DISCOVER_TICKERS: string[] = [
  // Tech / semis / software
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "ORCL",
  "ADBE", "CRM", "AMD", "INTC", "CSCO", "NFLX",
  // Consumer / retail / staples
  "WMT", "COST", "HD", "NKE", "MCD", "SBUX", "KO", "PEP", "PG", "DIS",
  // Financials
  "JPM", "BAC", "V", "MA", "GS",
  // Healthcare / pharma
  "JNJ", "PFE", "UNH", "LLY", "ABBV", "MRK",
  // Industrials / energy / telecom
  "BA", "CAT", "XOM", "CVX", "T", "VZ",
];
