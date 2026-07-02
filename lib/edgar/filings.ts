import { fetchEdgarJson } from "./client.ts";
import type { FilingRef, SubmissionsResponse } from "./types.ts";

/**
 * Fetch a company's filing history and return the most recent 10-Q and 10-K.
 * Either can be null (e.g. a company that has never filed a 10-K yet).
 */
export async function getLatestFilings(
  cik: string,
): Promise<{ latest10Q: FilingRef | null; latest10K: FilingRef | null }> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const submissions = await fetchEdgarJson<SubmissionsResponse>(url);
  const recent = submissions.filings.recent;

  let latest10Q: FilingRef | null = null;
  let latest10K: FilingRef | null = null;

  // Arrays are ordered newest-first, so the first match per form wins.
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== "10-Q" && form !== "10-K") continue;
    if (form === "10-Q" && latest10Q) continue;
    if (form === "10-K" && latest10K) continue;

    const reportDate = recent.reportDate[i];
    if (!reportDate) continue; // can't extract period figures without a period

    const accessionNumber = recent.accessionNumber[i];
    const ref: FilingRef = {
      form,
      accessionNumber,
      filedDate: recent.filingDate[i],
      reportDate,
      documentUrl: buildDocumentUrl(cik, accessionNumber, recent.primaryDocument[i]),
    };
    if (form === "10-Q") latest10Q = ref;
    else latest10K = ref;

    if (latest10Q && latest10K) break;
  }

  return { latest10Q, latest10K };
}

/** Of the latest 10-Q and 10-K, the one covering the most recent period. */
export function pickLatestFiling(filings: {
  latest10Q: FilingRef | null;
  latest10K: FilingRef | null;
}): FilingRef | null {
  const { latest10Q, latest10K } = filings;
  if (!latest10Q) return latest10K;
  if (!latest10K) return latest10Q;
  return latest10Q.reportDate >= latest10K.reportDate ? latest10Q : latest10K;
}

function buildDocumentUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  // Archives path uses the unpadded CIK and the accession number without dashes.
  const cikNum = String(parseInt(cik, 10));
  const accn = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accn}/${primaryDocument}`;
}
