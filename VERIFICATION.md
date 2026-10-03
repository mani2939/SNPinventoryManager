# Verification — 3 October 2026 (product types and vendor codes)

- Final production build: passed (`next build`, Next.js 16.3.8); strict TypeScript compilation passed.
- Pricing, input-validation, SKU, PostgreSQL, automatic-migration and auth-configuration tests: **16 passed**.
- Browser workflows: **2 passed in separate runs**, covering desktop/mobile, login/logout, rejected login, protected APIs, vendor/rate setup, photo upload/read, create/edit/delete, refresh persistence, vendor/date filters, saved exchange rates, invalid input, cross-origin write rejection and stale-edit rejection. No JavaScript page errors were recorded.
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

The standalone SQL setup was run on fresh PostgreSQL via PGlite and rerun successfully. Existing vendor/rate data was preserved. The read-only verifier returned all six tables and caught a deliberately disabled identity trigger. SQL setup creates all required tables, keys, pricing and identity triggers, login limiter and settings singleton; it verifies required columns/types and supporting indexes before committing.

On 2 October 2026, the connected Vercel app listed `sn-pinventory-manager` (`prj_jbdcBdNejawu5WrdEdSeRCEag5Yj`), but project details and deployment access returned 403 for the `snp11` scope. No live database credential was available locally. No SQL has been applied to the live Neon database from this workspace, and production readiness is not yet verified. Re-authorizing Vercel for that scope is needed to continue live inspection.

## Automatic Vercel migration

- Added npm `prebuild` migration hook, `db:migrate` manual command, and `vercel.json` build-command wiring.
- The actual runner executed against PostgreSQL via PGlite: first deployment created all six tables; repeat deployment retained a complete saved product, barcode, vendor and exchange rate exactly.
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

## Product types and vendor pseudonyms

Story: Settings saves vendor codes and product types through authenticated APIs; the product dropdown stores the selected type, and SKU reservation uses the configured vendor code.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Settings and product UI | Passed | Add/edit vendor name and code, add/rename/archive type, mobile layout and product dropdown |
| API validation | Passed | Unauthorized type creation 401, duplicate vendor code 409, invalid code 400, archived type selection 400 |
| PostgreSQL upgrade | Passed | Previous five-table fixture upgraded to six tables, anonymous codes assigned with collision handling, existing product and barcode unchanged |
| PostgreSQL constraints | Passed | Unique codes/type names, nullable type FK, active-type trigger, RLS, rollback and stale vendor-code claim rejection |
| Persistence and scanning | Passed | Type shown in inventory and retained after edit; existing SVG and SKU unchanged after code edits; original barcode lookup succeeded |

The current complete inventory browser scenario passed with code-based SKUs. The dedicated Settings scenario passed separately: this environment's serverless Chromium cannot reliably create a second browser context in one process. No application page errors were recorded. The new SQL creation and upgrade were tested in PGlite; no live Neon credential was available to apply changes from this workspace. Vercel's automatic migration applies them on the next deployment.

Existing printed SKUs retain any legacy name prefix. Only newly reserved/backfilled SKUs use vendor pseudonyms; no silent relabeling or identity rotation occurs. Product type is optional (Unclassified), and older products remain unclassified until assigned.

## Live verification still required

The production domain and deployment ID were supplied, but live Neon/PeaSoup credentials and permission to inspect Vercel runtime logs were unavailable. The serverless Neon driver and PostgreSQL migration are included. Provider connectivity, owner-role permissions, endpoint/region, bucket CORS and deployed persistence require a final check after configuration. Browser tests used local development persistence; PostgreSQL tests used PGlite, not a live Neon account.

Physical barcode scanners, device camera permissions/focus and label printers need a sample label checked on the actual hardware. Automated scanning used a generated camera stream and rasterized PDF labels.

Browser verification used Chromium and Playwright against the development server in the same execution context because the general agent-browser CLI could not start here. Temporary Chromium tooling is excluded from application dependencies.

Screenshots contain illustrative test products and use the supplied logo as the photo fixture. Test inventory, local photos, credentials, build output, test output and node_modules are excluded from the source archive.

## Settings card positioning

- Exchange rate and Product types now share an independent stacked column. The Vendors card stays in the adjacent column on desktop; a long vendor list cannot push Product types down.
- Browser checks passed at 1440, 1024, 768 and 390 px: Product types aligns with Exchange rate, with a 24 px gap (20 px on phone), no horizontal overflow and no page errors. Desktop Vendors aligns at the top; mobile order is Exchange rate, Product types, Vendors. Desktop/mobile screenshots were visually inspected.
- Production build and TypeScript compilation passed. These are local layout checks; redeploy the updated source to apply the change.

## Inventory deletion and filtered totals

- Moved print/edit/delete actions into the product-details cell. Delete has a visible label and is reachable without scrolling through financial columns. Native confirmation supports cancellation/Escape, and stale-delete errors appear inside the dialog.
- Authenticated products API returns whole-filter aggregates alongside paginated rows. Vendor, inclusive date range and exact SKU filters are shared between the row and summary queries. Empty sets return zeros. No schema changes are required.
- PostgreSQL regression verified 26 matching products over two pages, excluded vendor/date rows, decimal arithmetic, saved batch costs, quantity-weighted retail value, exact SKU lookup and updated totals after deletion. Demo aggregation agreed with PostgreSQL. **17 tests passed.**
- Dedicated browser regression **passed**: 26 products/52 pieces/₹4,914 cost were retained on page 2; cancellation preserved them; confirmed deletion updated to 25 products/50 pieces/₹4,725 and page 1. Historical GBP totals remained unchanged after settings-rate edits. Mobile had no page overflow; stale deletion returned its error inside the modal; empty/cleared filters refreshed totals; no page errors were recorded. The mobile screenshot was visually inspected.
- The bundled Chromium executable had been truncated; a fresh extraction of its bundled binary restored browser verification. Browser security remained enabled during the successful scenario. No authentication/origin protections were weakened.
- Production build and TypeScript compilation passed. Live deployment/provider connections remain subject to the previously documented limitations; redeploy this source to apply the update.
