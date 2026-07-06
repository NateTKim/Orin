// One entry in the discovery feed: lightweight filing metadata only (no
// analysis). Carries everything a feed card needs to display AND to save the
// company to a portfolio without an extra fetch.

export interface FeedItem {
  ticker: string;
  companyName: string;
  form: "10-Q" | "10-K";
  /** Filing date, YYYY-MM-DD (what the feed is sorted by, newest first). */
  filedDate: string;
  /** SEC accession number of that filing. */
  accessionNumber: string;
  /** Fiscal period the filing covers, YYYY-MM-DD. */
  periodEnd: string;
}
