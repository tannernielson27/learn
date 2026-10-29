// #518: makes the Stripe catalog billing needs, once per sandbox and once for live (docs/05 §7.15
// steps 1 and 5). Idempotent: a second run finds everything and changes nothing.
//
//     pnpm stripe:catalog                 # .env.local's STRIPE_SECRET_KEY, a sandbox key
//     pnpm stripe:catalog -- --live       # a live key; refused without --live
//     node --env-file=.env.local scripts/stripe-catalog.mjs
//
// Never prints the key. The decisions live in stripe-catalog-lib.mjs, where they are tested.

import Stripe from "stripe";
import {
  USAGE,
  catalogExitCode,
  checkCatalogKey,
  ensureCatalog,
  formatCatalog,
  parseCatalogArgs,
} from "./stripe-catalog-lib.mjs";

// The same version as src/lib/billing/stripe.ts.
const API_VERSION = "2026-09-30.endive";

async function main() {
  const options = parseCatalogArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const checked = checkCatalogKey(process.env.STRIPE_SECRET_KEY, options);
  if (!checked.ok) {
    console.error(`stripe:catalog: ${checked.reason}`);
    return 2;
  }
  const stripe = new Stripe(checked.key, { apiVersion: API_VERSION, maxNetworkRetries: 2 });
  const lines = await ensureCatalog(stripe);
  console.log(formatCatalog(lines, checked.mode));
  return catalogExitCode(lines);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    // A Stripe error's message names the request, never the key.
    console.error(`stripe:catalog: ${error instanceof Error ? error.message : "failed"}`);
    console.error(USAGE);
    process.exitCode = 2;
  },
);
