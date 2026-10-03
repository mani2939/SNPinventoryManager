# Shapes & Pieces Inventory

A Vercel-ready jewellery inventory app using Next.js 16.3.8, React 19.3, TypeScript, Neon PostgreSQL and PeaSoup S3-compatible object storage. The supplied Shapes and Pieces logo is included, with a navy, rose-gold, pink and blue interface.

## Included

- Username/password login, protected pages and APIs, 8-hour HttpOnly sessions and database-backed login throttling.
- Product photo upload with client-side resizing to WebP (maximum 1600px and 2 MB), private storage and authenticated photo reads.
- Product creation, editing and deletion.
- Automatic BACKGROUND SKU encoding and a saved Code 128 barcode shown before product saving.
- Exact barcode lookup using a USB/Bluetooth keyboard scanner, manual SKU entry or a camera.
- Product-name, GBP retail-price and barcode labels, with printing directly from the SKU card before or after saving. Supports 70 × 40 mm and 100 × 50 mm labels and multiple copies.
- Item name, description, vendor dropdown, date (auto-filled for Europe/London), INR price per piece, quantity, discount percentage and shipping percentage.
- Automatic purchase totals, shipping amount, final landed total, batch GBP total, GBP cost per piece and 3× retail price per piece.
- Inventory table with barcode, vendor and inclusive date filters, all pricing fields, photos, descriptions and 25-row pagination.
- Settings to add/edit/archive/restore vendors with unique anonymous barcode codes, manage product types, and set INR per £1. Archived entries preserve product history.
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

Open http://localhost:3000 and sign in with **SNPAdmin / SNPRocks**. Add vendors with unique codes and an exchange rate in Settings before entering products; configure your product types there too. Local demo data and photos live under `.demo-data/`; no sample inventory is preloaded. This mode is disabled when `NODE_ENV=production` or `VERCEL` is set. It is not production persistence.

For real services, copy `.env.example` to `.env.local`, supply the values described below, and set `DEMO_MODE=false`.

## Connect Neon

1. Create a Neon PostgreSQL project near your Vercel function region.
2. Connect Neon to the Vercel project and ensure **`DATABASE_URL` is enabled for Production** (and Preview if using preview deployments). The app runs its schema creation and verification automatically before every Vercel build; you do not need to paste SQL manually. Use the database owner role for this connection.
3. In **Connect**, select the database and owner role, enable connection pooling, and copy the PostgreSQL connection string. Set it as server-only `DATABASE_URL`; preserve its SSL parameters, including `sslmode=require`. The Neon serverless driver uses HTTPS, suitable for Vercel functions.
4. Never prefix this credential with `NEXT_PUBLIC_`. This app needs the table owner connection because tables have RLS enabled with no public policies; a restricted non-owner role will not work without explicitly configuring its policies/permissions.

### Automatic migration on deployment

`vercel.json` sets the build command to `npm run build`. Its npm `prebuild` hook runs `node scripts/migrate.mjs --build` before Next.js builds. The runner uses the existing Neon serverless dependency and connects with `DATABASE_URL`; no additional database service or migration credential is needed.

Each Vercel deployment (Production and Preview) creates/verifies all six app tables, supporting indexes/keys, price, product-type and identity triggers, login limiter and settings row. Creation and verification run in one PostgreSQL transaction with a transaction-level advisory lock, so simultaneous builds wait rather than changing the schema together. Existing inventory, photos, reserved SKUs, vendors and exchange rates are preserved on repeated builds. If connectivity, owner permissions, SQL or verification fails, the transaction rolls back and the build exits nonzero before Next.js builds. Error logs show the stage and PostgreSQL code without the connection string. Vercel builds also validate admin password-hash and session-secret configuration before starting migration.

The successful build log contains **`Database schema verified: 6 app tables. Existing inventory preserved.`** Add your actual vendors and exchange rate in Settings after the first deployment. Missing `DATABASE_URL` fails Vercel builds even if `DEMO_MODE=true`. Use a separate Neon branch/database for Preview, since preview builds migrate the database configured for that environment.

Ordinary local `npm run build` remains offline. For local database creation, copy the server variables into `.env.local`, then explicitly run:

```bash
npm run db:migrate
```

The migration runner reads `.env.local` for manual local runs. The existing product SKU backfill remains a separate explicit command for older imported products. Build migrations do not invent vendors, exchange rates, stock or SKU backfill data.

Manual SQL setup is still available: run the complete `database/setup.sql` as owner in the Neon SQL Editor on the same branch/database as Vercel. It creates and verifies the same schema. A successful setup ends with `schema_status = schema verified` and `app_tables = 6`. The report also shows whether an exchange rate and active vendors are configured, plus any older products that need barcode backfill. Set your actual exchange rate and vendors in the app Settings. To check an existing schema without modifying it, run `database/verify.sql`.

The migration creates `vendors`, `product_types`, `settings`, `products`, `login_limits` and `sku_reservations`. It installs pricing, immutable-identity and login-limit triggers/functions; unique indexes protect SKUs and photo ownership. New-product saving atomically redeems a reservation and inserts the product in one PostgreSQL statement. Failed saves roll back the claim. Retrying the same reservation and identical data returns the existing product.

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

## Product types and vendor codes

In Settings, add product types such as Necklace sets, Earrings, Bangles or Bracelets. Types can be renamed, archived and restored. The Product type dropdown on both new and saved product entries uses these configured types. The selected type is saved as a foreign key and shown in inventory. Unclassified is available for existing products or entries that do not need a type. Archived types disappear from new entries, but existing assigned types remain visible and can be retained when editing.

Each vendor has a required, unique **Vendor code** of exactly three uppercase letters or digits, for example `V01`. Choose codes unrelated to supplier names. Settings allows editing both vendor names and codes, plus archive/restore. Names remain visible inside the signed-in inventory app; generated SKU/barcode values and labels use the code.

Redeployment automatically adds `vendors.pseudo_code`, the `product_types` table and nullable `products.product_type_id`, including its foreign key/index and active-type validation. Existing vendors receive unique anonymous codes derived from their IDs, independent of their names. Review or change these in Settings. Existing product data, prices, photos and barcode identities are preserved, and existing products start Unclassified.

**Existing printed barcodes remain unchanged.** Old SKUs may still contain the previous vendor-name prefix; changing a vendor code affects new barcodes, including backfilling older products without an SKU. A pending, unsaved reservation from an old code is rejected: refresh the entry and generate a new barcode. Automatic migration does not reassign or relabel saved SKUs.

## Production login 500 troubleshooting

A request summary with status 500 does not contain the server exception. Check the Runtime Logs for that request, or the detailed login response in this updated version. The login needs three server-side configurations independently of the Neon/Vercel connection:

| Variable | Required value |
| --- | --- |
| `DATABASE_URL` | Owner-role Neon connection string, enabled for Production |
| `ADMIN_PASSWORD_HASH` | The **salt:hash output** from `npm run password:hash`; enter SNPRocks at its prompt, not directly into this environment variable |
| `SESSION_SECRET` | A random secret, at least 32 characters; generate with `openssl rand -hex 32` |
| `ADMIN_USERNAME` | SNPAdmin (also the default if omitted) |

Set these values in the project's **Production environment**, then redeploy. Connecting Neon supplies the database URL; it does not configure the password hash or session secret. These variables must be available to the build and runtime.

Vercel prebuild now validates production login configuration before connecting/migrating. Missing or malformed authentication settings stop the build with a message identifying the variable. Manual `npm run db:migrate` does not require admin login settings. The local demo login is unchanged.

Runtime configuration failures show specific safe messages and codes, such as `AUTH_PASSWORD_HASH_MISSING`, `AUTH_PASSWORD_HASH_INVALID` or `AUTH_SESSION_SECRET_MISSING`. Database failures distinguish missing login schema/function and insufficient database permissions when PostgreSQL supplies those codes. Other failures include a reference code and request ID. Search Runtime Logs for `auth_login_failed`; each event reports `stage`, `code`, `requestId` and any PostgreSQL error code. Credentials, connection strings, secrets and raw database errors are not logged by this route.

A wrong username/password still returns 401; excessive attempts still return 429; origin protection remains active. Schema migrations and Neon connectivity do not bypass authentication. When sharing an error for diagnosis, share the safe code/message and request ID, not environment-variable values.

## Deploy to Vercel

1. Upload this source to a private GitHub/GitLab/Bitbucket repository, without `.env.local`, `.demo-data`, `.next` or `node_modules`.
2. Import the repository in Vercel. Use the **Next.js** framework preset, repository root, Node.js **24.x**, `npm ci` for install, and `npm run build` for build. Leave the Output Directory at the Next.js default.
3. Add all Neon, PeaSoup, username, password hash and session-secret variables from `.env.example` to Vercel's Production environment. Add them to Preview only if previews should use those services. Prefer separate data/services for previews.
4. Set `DEMO_MODE=false` (or omit it). Do not manually set `NODE_ENV` or `VERCEL`.
5. Commit the updated source, including `vercel.json` and `scripts/migrate.mjs`, and deploy. Watch for `Database schema verified: 6 app tables` in the build logs. Configure PeaSoup CORS for the deployment hostname. Redeploy after environment-variable changes.
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

The decimal separator is **Z**, and pence always have two digits. Format: `CODE-COST-XXX`. The prefix is the vendor’s unique three-character pseudonym from Settings, using uppercase letters/digits. Vendor names are not used in new barcode generation.

- Vendor code V01, £12.34, suffix 001 → **V01-BAZCK-001**.
- Vendor code V02, £9.45, suffix 027 → **V02-NZKG-027**.
- Vendor code V01, £10.00, suffix 000 → **V01-BDZDD-000**.

A cryptographically random starting suffix in 000–999 is chosen, with collision retries and a database unique constraint. The full SKU is encoded in **Code 128**, which supports the letters and hyphens. When valid vendor/pricing details are entered, the server reserves the SKU and saves the SVG barcode **before the product is saved**. Pricing changes before saving may require a new reservation. Product saving accepts only the matching reservation token; client-supplied SKU or calculated price values are not trusted.

Saved SKUs/barcodes remain fixed after edits, vendor archival and exchange-rate changes, so existing labels still resolve. They are not reused after deletion. Reservations are retained, including abandoned entries. The requested three-digit suffix allows **1,000 identifiers per vendor prefix and encoded price**, with codes unique across current vendors. Historical codes may share that namespace after code edits; reserved full SKUs are never reused. If all are consumed, saving that combination is blocked with a clear message; expanding the suffix requires changing the format and schema. This is a format limit, independent of database storage capacity.

### Scan and print

In Inventory, focus **Scan barcode or enter SKU**, scan with a USB/Bluetooth keyboard-wedge scanner and press Enter (or configure the scanner's Enter suffix). Exact SKU lookup clears previous vendor/date filters. Manual entry accepts lowercase and normalizes it. **Use camera** scans through the device camera; it requires HTTPS, browser camera permission and a supported browser. Camera capture stops after a successful scan, on closing, or when leaving the page.

Labels follow the supplied reference: **product name → large GBP retail price → barcode → full SKU**, centred in black on white. The product's SKU card previews this same layout. The retail price uses the existing 3× GBP cost calculation.

Click **Print barcode labels** on the **SKU & barcode** card to open the printer without leaving your entry. It works for new products once the name, costs and reserved barcode are ready, and for saved products. Select 1–1,000 copies and 70 × 40 mm or 100 × 50 mm labels, then click **Print labels**. Retail price is included by default; it can be hidden in the print options. Close the printer with its button or Escape; your entry remains in place. Only labels appear in printed output.

Printing from an entry uses its current name and calculated retail price, including unsaved edits, with the reserved/stored barcode. Printing does not save the product: save a new entry so scanning can find it in inventory; save edits to update labels printed later from the inventory row. The saved-row printer action and product label page remain available and use saved product data.

Select matching paper size, 100% scale and no browser headers/footers; print one label first to check your printer/scanner. Browser Print can also save a PDF. Product names wrap to two lines on physical labels; longer names are clipped to keep the price/barcode clear. Long SKUs may need the wider 100 × 50 mm size for reliable scanning; physical printer/scanner quality must be checked on your hardware.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run test:auth:production
npx playwright install chromium
npm run test:e2e
```

`npm test` checks automatic migration creation, preservation of saved inventory on redeployment, verification rollback and the actual npm build stopping without a Vercel database credential. It also checks financial rounding and input validation and executes the migration against local PostgreSQL via PGlite, including its pricing trigger, access restrictions, login limiter, unique reservations, immutable identifiers and atomic save rollback. Browser tests run a local demo server on port 3010 and create test vendors/products; use a separate checkout or reset local demo data if needed. Stop other `next dev` processes for the same checkout before running the browser suite.

The browser suite covers sign-in, auth rejection, settings, photo upload, create/edit/delete, persistence on refresh, filters, historical rate preservation, mobile layout, CSRF rejection and stale-edit conflicts. It also checks barcode generation before save, duplicate-free concurrent reservations, idempotent saving with a photo, reservation/pricing mismatch rejection, keyboard lookup, actual ZXing decoding from a generated barcode camera stream, label copy counts, print CSS/PDF sizes, and preserved barcodes after price edits. Provider connectivity, bucket CORS, network policy and Vercel deployment need a live check with your own services.

## Project layout

- `app/` — pages, layouts and authenticated API routes.
- `components/` — branded UI and forms.
- `lib/` — financial calculations, validation, production authentication checks, sessions, data repository and storage adapter.
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
