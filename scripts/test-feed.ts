// Builds the discovery feed straight from EDGAR (no cache layer) and prints it,
// so we can confirm it shows recognizable companies with recent filing dates,
// newest first.
//   node --env-file=.env.local scripts/test-feed.ts

import { buildDiscoverFeed } from "../lib/discover/build.ts";

const t0 = Date.now();
const feed = await buildDiscoverFeed();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`Built feed: ${feed.length} companies in ${secs}s (newest filing first)\n`);
for (const item of feed) {
  console.log(
    `  ${item.filedDate}  ${item.form.padEnd(4)}  ${item.ticker.padEnd(6)} ${item.companyName}`,
  );
}
