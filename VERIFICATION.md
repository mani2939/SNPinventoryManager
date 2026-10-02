# Verification — 2 October 2026 (Neon and barcode update)

- Final production build: passed (`next build`, Next.js 16.3.8); strict TypeScript compilation passed.
- Pricing, input-validation, SKU, PostgreSQL, automatic-migration and auth-configuration tests: **13 passed**.
- Complete browser workflow: **1 passed**, covering desktop/mobile, login/logout, rejected login, protected APIs, vendor/rate setup, photo upload/read, create/edit/delete, refresh persistence, vendor/date filters, saved exchange rates, invalid input, cross-origin write rejection and stale-edit rejection. No JavaScript page errors were recorded.
- SKU generation: BACKGROUND mapping, Z decimal separator, two pence digits, suffixes 000 and 999, vendor normalization and half-up rounding verified. The SKU and visible barcode are available before saving.
- Database: the generic PostgreSQL migration ran twice successfully in PGlite. Pricing triggers matched TypeScript calculations including rounding and large values. Untrusted table/function access was denied. Persistent login limiting and reset passed.
- Actual production save SQL executed against PGlite: unique reservations, mismatched-cost rejection, one-time redemption, immutable stored SKU/barcode and atomic rollback of a claim when product insertion fails all passed. Deleted product identifiers remain consumed.
- Browser/API: ten simultaneous reservations were distinct. Saving without a reservation failed. Mismatched pricing failed. Retrying an identical successful save, including its photo, returned the same product ID.
- Scanning: lowercase keyboard entry resolved the product. The actual ZXing camera reader decoded a camera stream containing the generated SVG, performed lookup, and closed capture.
- Labels: copy count and browser print invocation passed. PDF output contained exactly three labels on three pages for each size. Page sizes measured approximately 70 × 40 mm and 100 × 50 mm (Chromium rounding); no navigation or controls appeared. Both 300-DPI rasterized PDF label barcodes were independently decoded to the correct saved SKU using ZXing.
- Stored identity: changing the saved product's INR price changed its GBP/retail prices but preserved its SKU and exact barcode SVG.
- Desktop/mobile screenshots and printed label renderings were inspected; mobile page overflow checks passed.
- The existing PeaSoup adapter remains unchanged from the previously validated version (signed PUT expiry/content length, MIME type, WebP checks and S3 checksum compatibility). Supabase packages and environment variables have been removed.
- The legacy-product backfill script loads and reports missing credentials clearly. Live backfill needs a configured Neon account.

## SQL setup verification added

The standalone SQL setup was run on fresh PostgreSQL via PGlite and rerun successfully. Existing vendor/rate data was preserved. The read-only verifier returned all five tables and caught a deliberately disabled identity trigger. SQL setup creates all required tables, keys, pricing and identity triggers, login limiter and settings singleton; it verifies required columns/types and supporting indexes before committing.

On 2 October 2026, the connected Vercel app listed `sn-pinventory-manager` (`prj_jbdcBdNejawu5WrdEdSeRCEag5Yj`), but project details and deployment access returned 403 for the `snp11` scope. No live database credential was available locally. No SQL has been applied to the live Neon database from this workspace, and production readiness is not yet verified. Re-authorizing Vercel for that scope is needed to continue live inspection.

## Automatic Vercel migration

- Added npm `prebuild` migration hook, `db:migrate` manual command, and `vercel.json` build-command wiring.
- The actual runner executed against PostgreSQL via PGlite: first deployment created all five tables; repeat deployment retained a complete saved product, barcode, vendor and exchange rate exactly.
- Verification failure rolled back initial table creation. On an existing schema it restored the active trigger and preserved vendor data.
- The real `npm run build` process with `VERCEL=1` and missing `DATABASE_URL` exited 1 during prebuild before Next.js built. `DEMO_MODE=true` did not bypass the check.
- Transaction-level advisory locking and timeout SQL executed successfully. Multiple live Neon/Vercel builds have not been tested concurrently.
- No dependency changes were required. The migration uses Neon's pg-compatible Client over WebSockets; the native Node.js WebSocket is explicitly configured.
- Ordinary local builds skip database access. A full local production build is verified separately; live database execution is deferred to Vercel's next build with its configured credential.

## Production login diagnostics

The public https://www.snpinventory.com/api/auth/login endpoint was reproduced returning HTTP 500 with the generic error response using the requested login. Vercel's Runtime Logs API denied access (403), so the exact exception from the reported production request is not confirmed.

- Added shared auth configuration validation before production rate-limit calls and before Vercel migration/build. Missing/malformed password hashes and missing/short session secrets are actionable failures.
- Login now emits stage-specific, secret-safe structured events and error codes/request IDs. PostgreSQL missing-table/function and permission-denied codes get targeted guidance. No authentication or database fallback was added.
- Unit checks cover configuration failures, valid configuration and the real prebuild stopping before database access when authentication settings are missing.
- Production HTTP integration checks: **1 passed** against the actual compiled Next.js server with an explicitly preloaded Neon test fixture. They cover configuration failures, missing login function, permission failures, network failures, incorrect password rejection, successful production login/session access and unsigned-session rejection. The database fixture is test-only and is never imported by the application.
- Actual deployed Neon credentials and the original Vercel exception remain unavailable. The test fixture establishes application behavior; it does not certify the current live database/environment.

## Reference barcode label and card printing

- Matched the supplied reference layout with product name, prominent GBP retail price, Code 128 barcode and full SKU. The SKU card and label printer share the same component.
- Added a print button on both new and saved product cards. A native modal preserves the entry, supports Escape/focus restoration and offers copy count, physical size and retail-price options.
- Browser workflow verified draft printing without a product-save request, printed label order, two draft copies, saved labels, edited retail price with immutable SKU, modal closing and mobile control widths.
- Draft PDF output contained exactly two 70 × 40 mm pages; saved-label PDFs contained exactly three pages at each selected size. Text extraction confirmed product name, £28.35 and the SKU, with no print controls/product form. First-page renders were visually inspected. Barcodes from both physical sizes and the draft output were independently decoded using ZXing.
- Production build and strict TypeScript checks passed. These are local browser/PDF checks; the update must be deployed to appear on the live site.

## Live verification still required

The production domain and deployment ID were supplied, but live Neon/PeaSoup credentials and permission to inspect Vercel runtime logs were unavailable. The serverless Neon driver and PostgreSQL migration are included. Provider connectivity, owner-role permissions, endpoint/region, bucket CORS and deployed persistence require a final check after configuration. Browser tests used local development persistence; PostgreSQL tests used PGlite, not a live Neon account.

Physical barcode scanners, device camera permissions/focus and label printers need a sample label checked on the actual hardware. Automated scanning used a generated camera stream and rasterized PDF labels.

Browser verification used Chromium and Playwright against the development server in the same execution context because the general agent-browser CLI could not start here. Temporary Chromium tooling is excluded from application dependencies.

Screenshots contain illustrative test products and use the supplied logo as the photo fixture. Test inventory, local photos, credentials, build output, test output and node_modules are excluded from the source archive.
