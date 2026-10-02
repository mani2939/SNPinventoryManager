# Shapes & Pieces Inventory

A Vercel-ready jewellery inventory app using Next.js 16.3.8, React 19.3, TypeScript, Neon PostgreSQL and PeaSoup S3-compatible object storage. The supplied Shapes and Pieces logo is included, with a navy, rose-gold, pink and blue interface.

## Included

- Username/password login, protected pages and APIs, 8-hour HttpOnly sessions and database-backed login throttling.
- Product photo upload with client-side resizing to WebP (maximum 1600px and 2 MB), private storage and authenticated photo reads.
- Product creation, editing and deletion.
- Automatic BACKGROUND SKU encoding and a saved Code 128 barcode shown before product saving.
- Exact barcode lookup using a USB/Bluetooth keyboard scanner, manual SKU entry or a camera.
- Printable 70 × 40 mm and 100 × 50 mm barcode labels with quantity and optional retail price.
- Item name, description, vendor dropdown, date (auto-filled for Europe/London), INR price per piece, quantity, discount percentage and shipping percentage.
- Automatic purchase totals, shipping amount, final landed total, batch GBP total, GBP cost per piece and 3× retail price per piece.
- Inventory table with barcode, vendor and inclusive date filters, all pricing fields, photos, descriptions and 25-row pagination.
- Settings to add/archive/restore vendors and set INR per £1. Archived vendors remain available in historical filters.
- Saved exchange-rate snapshots: later rate changes only affect new entries; edits preserve each product's original rate.
- Desktop and mobile layouts, keyboard-accessible forms and delete confirmation.

## Start locally

Use Node.js 24 LTS (Node 22 also supported).

```bash
npm ci
```

For a self-contained **development preview**, create `.env.local` with:

```dotenv
DEMO_MODE=true
```

Then run:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with **SNPAdmin / SNPRocks**. Add vendors and an exchange rate in Settings before entering products. Local demo data and photos live under `.demo-data/`; no sample inventory is preloaded. This mode is disabled when `NODE_ENV=production` or `VERCEL` is set. It is not production persistence.

For real services, copy `.env.example` to `.env.local`, supply the values described below, and set `DEMO_MODE=false`.

## Connect Neon

1. Create a Neon PostgreSQL project near your Vercel function region.
2. Connect Neon to the Vercel project and ensure **`DATABASE_URL` is enabled for Production** (and Preview if using preview deployments). The app runs its schema creation and verification automatically before every Vercel build; you do not need to paste SQL manually. Use the database owner role for this connection.
3. In **Connect**, select the database and owner role, enable connection pooling, and copy the PostgreSQL connection string. Set it as server-only `DATABASE_URL`; preserve its SSL parameters, including `sslmode=require`. The Neon serverless driver uses HTTPS, suitable for Vercel functions.
4. Never prefix this credential with `NEXT_PUBLIC_`. This app needs the table owner connection because tables have RLS enabled with no public policies; a restricted non-owner role will not work without explicitly configuring its policies/permissions.

### Automatic migration on deployment

`vercel.json` sets the build command to `npm run build`. Its npm `prebuild` hook runs `node scripts/migrate.mjs --build` before Next.js builds. The runner uses the existing Neon serverless dependency and connects with `DATABASE_URL`; no additional database service or migration credential is needed.

Each Vercel deployment (Production and Preview) creates/verifies all five app tables, supporting indexes/keys, price and identity triggers, login limiter and settings row. Creation and verification run in one PostgreSQL transaction with a transaction-level advisory lock, so simultaneous builds wait rather than changing the schema together. Existing inventory, photos, reserved SKUs, vendors and exchange rates are preserved on repeated builds. If connectivity, owner permissions, SQL or verification fails, the transaction rolls back and the build exits nonzero before Next.js builds. Error logs show the stage and PostgreSQL code without the connection string.

The successful build log contains **`Database schema verified: 5 app tables. Existing inventory preserved.`** Add your actual vendors and exchange rate in Settings after the first deployment. Missing `DATABASE_URL` fails Vercel builds even if `DEMO_MODE=true`. Use a separate Neon branch/database for Preview, since preview builds migrate the database configured for that environment.

Ordinary local `npm run build` remains offline. For local database creation, copy the server variables into `.env.local`, then explicitly run:

```bash
npm run db:migrate
```

The migration runner reads `.env.local` for manual local runs. The existing product SKU backfill remains a separate explicit command for older imported products. Build migrations do not invent vendors, exchange rates, stock or SKU backfill data.

Manual SQL setup is still available: run the complete `database/setup.sql` as owner in the Neon SQL Editor on the same branch/database as Vercel. It creates and verifies the same schema. A successful setup ends with `schema_status = schema verified` and `app_tables = 5`. The report also shows whether an exchange rate and active vendors are configured, plus any older products that need barcode backfill. Set your actual exchange rate and vendors in the app Settings. To check an existing schema without modifying it, run `database/verify.sql`.

The migration creates `vendors`, `settings`, `products`, `login_limits` and `sku_reservations`. It installs pricing, immutable-identity and login-limit triggers/functions; unique indexes protect SKUs and photo ownership. New-product saving atomically redeems a reservation and inserts the product in one PostgreSQL statement. Failed saves roll back the claim. Retrying the same reservation and identical data returns the existing product.

As of 2 October 2026, Neon Free provides **1 GB storage per project**. Around 1 GB of database data leaves little space for indexes, saved barcode SVGs, reservations and growth; choose capacity with headroom and monitor usage in the Neon console. PeaSoup photos are separate object storage and do not count toward the database size. The application stores each saved barcode in PostgreSQL so it can be retrieved without regeneration.

### Existing data

A new installation needs no backfill. For an existing PostgreSQL database with these app tables, apply the new migration, then run:

```bash
npm run backfill:skus
```

This reads the Neon `DATABASE_URL` from `.env.local`, uses each older product's saved GBP cost/rate and vendor, and atomically assigns and stores its SKU/barcode. It is safe to rerun and skips already assigned products. Existing products without SKUs can be viewed but must be backfilled before editing or printing labels.

If you already have live Supabase inventory, back up and transfer the app's `vendors`, `settings` and `products` tables into Neon **before** applying this migration, retaining IDs and saved monetary values. Use an owner-owned schema and remove provider-specific role grants/policies from the export; do not transfer Supabase Auth or Storage schemas. Apply this migration, run the backfill, update Vercel's database credential, and check row counts and a sample of photos/prices. Product photos remain in the same PeaSoup bucket. Existing sessions should be revoked by rotating `SESSION_SECRET` during the switch.

## Connect PeaSoup

Use a private S3-compatible PeaSoup bucket. Obtain the following from your account or provider:

| Variable                    | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| `PEASOUP_ENDPOINT`          | Full HTTPS S3 API endpoint supplied by PeaSoup                              |
| `PEASOUP_REGION`            | Region string required for signing by your provider                         |
| `PEASOUP_BUCKET`            | Bucket name, for example `snp-products`                                     |
| `PEASOUP_ACCESS_KEY_ID`     | Restricted storage access key                                               |
| `PEASOUP_SECRET_ACCESS_KEY` | Storage secret key                                                          |
| `PEASOUP_FORCE_PATH_STYLE`  | `true` by default; change only if your endpoint requires virtual-host style |

Grant this key GetObject, PutObject and DeleteObject access to `products/*` in that bucket (HeadObject uses object read permission). Keep the bucket private. The app never stores a public image URL.

Photos upload directly from the browser using short-lived signed PUT URLs. Configure bucket CORS for your exact Vercel app origin; include development or preview origins only when needed. Example CORS document, replacing the hostname:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://YOUR_APP.vercel.app"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

For a local real-service preview, add `http://localhost:3000` to `AllowedOrigins`. Use your provider's console or its S3-compatible CORS operation. GETs go through authenticated application routes, so browser access to the bucket for GET is unnecessary.

The app checks uploaded object size, content type and WebP signature before accepting a product. Replacing or deleting a saved photo attempts to delete its old object. Uploads abandoned before saving and failed cleanup operations can leave orphaned objects; retain application/database backups and remove unreferenced objects periodically. Do not apply a blanket expiration rule to `products/*`, as it also contains active product photos.

## Configure login

```bash
npm run password:hash
```

When prompted, enter **SNPRocks** to use the requested password. Paste the generated `salt:hash` into `ADMIN_PASSWORD_HASH`. Set `ADMIN_USERNAME=SNPAdmin`.

Generate a separate session secret:

```bash
openssl rand -hex 32
```

Set its output as `SESSION_SECRET`. Production requires a configured password hash and a session secret of at least 32 characters; the local demo password fallback is disabled. The password hash helper reads stdin rather than a command-line password argument. Changing the password hash does not immediately revoke existing 8-hour sessions; rotating `SESSION_SECRET` revokes them.

## Deploy to Vercel

1. Upload this source to a private GitHub/GitLab/Bitbucket repository, without `.env.local`, `.demo-data`, `.next` or `node_modules`.
2. Import the repository in Vercel. Use the **Next.js** framework preset, repository root, Node.js **24.x**, `npm ci` for install, and `npm run build` for build. Leave the Output Directory at the Next.js default.
3. Add all Neon, PeaSoup, username, password hash and session-secret variables from `.env.example` to Vercel's Production environment. Add them to Preview only if previews should use those services. Prefer separate data/services for previews.
4. Set `DEMO_MODE=false` (or omit it). Do not manually set `NODE_ENV` or `VERCEL`.
5. Commit the updated source, including `vercel.json` and `scripts/migrate.mjs`, and deploy. Watch for `Database schema verified: 5 app tables` in the build logs. Configure PeaSoup CORS for the deployment hostname. Redeploy after environment-variable changes.
6. Sign in, add your actual vendors, save your exchange rate, and create a product with a photo. Refresh and verify that the entry and photo persist.

Alternatively, from the configured project directory, use the Vercel CLI:

```bash
npx vercel
```

After configuring its environment variables, deploy production with:

```bash
npx vercel --prod
```

No provider accounts, live credentials, or hosted deployment are included in this source package. The production build has been validated locally; a final live Neon/PeaSoup connection test is required after setting your credentials.

## Pricing rules

Discount is a **percentage**, and both GBP prices are **per piece**, as selected during setup.

| Field                  | Calculation                                    |
| ---------------------- | ---------------------------------------------- |
| Total before discount  | INR unit price × quantity                      |
| Total after discount   | Total before discount × (1 − discount % ÷ 100) |
| Shipping amount        | Total after discount × shipping % ÷ 100        |
| Final total (INR)      | Total after discount + shipping amount         |
| Batch total (GBP)      | Final total ÷ INR-per-GBP rate                 |
| Cost per piece (GBP)   | Final total ÷ quantity ÷ INR-per-GBP rate      |
| Retail per piece (GBP) | Rounded GBP cost per piece × 3                 |

Amounts are rounded half-up to two decimal places at each displayed monetary step. Exchange rates accept four decimal places. Total discount may be 100%; shipping accepts 0–1000%, including decimals. Dates can be edited after the London-local date is automatically populated. VAT and import duty are not added by this requested pricing model.

Example: ₹1,000 × 10 pieces, 10% discount, 5% shipping, and ₹100 per £1 produces ₹10,000 before discount, ₹9,000 after discount, ₹450 shipping, ₹9,450 final total, £94.50 batch cost, **£9.45 per piece** and **£28.35 retail per piece**.

## SKU and barcode rules

SKUs use the **rounded landed GBP cost per piece**, including discount and shipping, rather than retail price. They use the initial saved exchange rate.

| Digit | Code | Digit | Code |
| ----- | ---- | ----- | ---- |
| 1     | B    | 6     | R    |
| 2     | A    | 7     | O    |
| 3     | C    | 8     | U    |
| 4     | K    | 9     | N    |
| 5     | G    | 0     | D    |

The decimal separator is **Z**, and pence always have two digits. Format: `VENDOR-COST-XXX`. The vendor prefix uses its first three uppercase alphanumeric characters, stripping accents and spaces; names shorter than three characters are padded with X.

- Test vendor, £12.34, suffix 001 → **TES-BAZCK-001**.
- Jaipur, £9.45, suffix 027 → **JAI-NZKG-027**.
- Test vendor, £10.00, suffix 000 → **TES-BDZDD-000**.

A cryptographically random starting suffix in 000–999 is chosen, with collision retries and a database unique constraint. The full SKU is encoded in **Code 128**, which supports the letters and hyphens. When valid vendor/pricing details are entered, the server reserves the SKU and saves the SVG barcode **before the product is saved**. Pricing changes before saving may require a new reservation. Product saving accepts only the matching reservation token; client-supplied SKU or calculated price values are not trusted.

Saved SKUs/barcodes remain fixed after edits, vendor archival and exchange-rate changes, so existing labels still resolve. They are not reused after deletion. Reservations are retained, including abandoned entries. The requested three-digit suffix allows **1,000 identifiers per vendor prefix and encoded price**, shared by vendors with identical prefixes. If all are consumed, saving that combination is blocked with a clear message; expanding the suffix requires changing the format and schema. This is a format limit, independent of database storage capacity.

### Scan and print

In Inventory, focus **Scan barcode or enter SKU**, scan with a USB/Bluetooth keyboard-wedge scanner and press Enter (or configure the scanner's Enter suffix). Exact SKU lookup clears previous vendor/date filters. Manual entry accepts lowercase and normalizes it. **Use camera** scans through the device camera; it requires HTTPS, browser camera permission and a supported browser. Camera capture stops after a successful scan, on closing, or when leaving the page.

Use the printer action on a saved row or **Print barcode labels** on the product page. Choose 1–1,000 copies, label size and whether to show retail price. Each label includes the brand, product name, barcode, full SKU and optional retail price. Printing uses the stored barcode and shows the product's current retail price. Select matching paper size, 100% scale and no browser headers/footers; print one label first to check your printer/scanner. Browser Print can also save a PDF. Long SKUs may need the wider 100 × 50 mm size for reliable scanning; physical printer/scanner quality must be checked on your hardware.

## Verify

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` checks automatic migration creation, preservation of saved inventory on redeployment, verification rollback and the actual npm build stopping without a Vercel database credential. It also checks financial rounding and input validation and executes the migration against local PostgreSQL via PGlite, including its pricing trigger, access restrictions, login limiter, unique reservations, immutable identifiers and atomic save rollback. Browser tests run a local demo server on port 3010 and create test vendors/products; use a separate checkout or reset local demo data if needed. Stop other `next dev` processes for the same checkout before running the browser suite.

The browser suite covers sign-in, auth rejection, settings, photo upload, create/edit/delete, persistence on refresh, filters, historical rate preservation, mobile layout, CSRF rejection and stale-edit conflicts. It also checks barcode generation before save, duplicate-free concurrent reservations, idempotent saving with a photo, reservation/pricing mismatch rejection, keyboard lookup, actual ZXing decoding from a generated barcode camera stream, label copy counts, print CSS/PDF sizes, and preserved barcodes after price edits. Provider connectivity, bucket CORS, network policy and Vercel deployment need a live check with your own services.

## Project layout

- `app/` — pages, layouts and authenticated API routes.
- `components/` — branded UI and forms.
- `lib/` — financial calculations, validation, sessions, data repository and storage adapter.
- `database/setup.sql` — complete creation and verification for the Neon SQL Editor.
- `database/migration.sql` — schema, constraints, permissions, indexes and triggers.
- `database/verify.sql` — read-only schema checks and configuration summary.
- `scripts/migrate.mjs` — automatic transactional creation and verification during Vercel builds.
- `vercel.json` — ensures Vercel uses the npm build command and its migration hook.
- `scripts/password-hash.mjs` — local login password setup.
- `scripts/backfill-skus.ts` — assign barcodes to older products in Neon.
- `public/logo.webp` — optimised copy of the supplied logo.
- `tests/` — pricing, database and browser verification.

## Reference documentation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Neon free plan: 1 GB per project](https://neon.com/blog/neon-free-plan-1-gb-per-project)
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [bwip-js barcode generator](https://github.com/metafloor/bwip-js)
- [ZXing browser scanner](https://github.com/zxing-js/browser)
- [PeaSoup S3 integration example](https://peasoup.cloud/docs/openmediavault/)
- [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs)
