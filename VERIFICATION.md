# Verification — 2 October 2026 (Neon and barcode update)

- Final production build: passed (`next build`, Next.js 16.3.8); strict TypeScript compilation passed.
- Pricing, input-validation, SKU and PostgreSQL tests: **7 passed**.
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

## Live verification still required

No live Neon database credential, PeaSoup bucket credentials or Vercel deployment was supplied. The serverless Neon driver and PostgreSQL migration are included. Provider connectivity, owner-role permissions, endpoint/region, bucket CORS and deployed persistence require a final check after configuration. Browser tests used local development persistence; PostgreSQL tests used PGlite, not a live Neon account.

Physical barcode scanners, device camera permissions/focus and label printers need a sample label checked on the actual hardware. Automated scanning used a generated camera stream and rasterized PDF labels.

Browser verification used Chromium and Playwright against the development server in the same execution context because the general agent-browser CLI could not start here. Temporary Chromium tooling is excluded from application dependencies.

Screenshots contain illustrative test products and use the supplied logo as the photo fixture. Test inventory, local photos, credentials, build output, test output and node_modules are excluded from the source archive.
