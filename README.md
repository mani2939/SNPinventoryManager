# Shapes & Pieces Inventory

A Vercel-ready jewellery inventory app using Next.js 16.3.8, React 19.3, TypeScript, Supabase PostgreSQL and PeaSoup S3-compatible object storage. The supplied Shapes and Pieces logo is included, with a navy, rose-gold, pink and blue interface.

## Included

- Username/password login, protected pages and APIs, 8-hour HttpOnly sessions and database-backed login throttling.
- Product photo upload with client-side resizing to WebP (maximum 1600px and 2 MB), private storage and authenticated photo reads.
- Product creation, editing and deletion.
- Item name, description, vendor dropdown, date (auto-filled for Europe/London), INR price per piece, quantity, discount percentage and shipping percentage.
- Automatic purchase totals, shipping amount, final landed total, batch GBP total, GBP cost per piece and 3× retail price per piece.
- Inventory table with vendor and inclusive date filters, all pricing fields, photos, descriptions and 25-row pagination.
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

## Connect Supabase

1. Create a Supabase project or use a dedicated existing project.
2. In its SQL Editor, run the complete `supabase/migration.sql`.
3. Set `SUPABASE_URL` to the project URL and `SUPABASE_SECRET_KEY` to a backend secret key. A legacy `SUPABASE_SERVICE_ROLE_KEY` is supported if your project uses one.
4. Use these values only as server environment variables. Do not prefix secrets with `NEXT_PUBLIC_`.

The migration creates `vendors`, `settings`, `products` and `login_limits`. It enables RLS, revokes `anon`/`authenticated` access, grants the server role access and installs a pricing trigger and login-rate-limit RPC. This is a single-admin app with its own username login; it does not require a Supabase Auth user.

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
3. Add all Supabase, PeaSoup, username, password hash and session-secret variables from `.env.example` to Vercel's Production environment. Add them to Preview only if previews should use those services. Prefer separate data/services for previews.
4. Set `DEMO_MODE=false` (or omit it). Do not manually set `NODE_ENV` or `VERCEL`.
5. Deploy and configure PeaSoup CORS for the deployment hostname. Redeploy after environment-variable changes.
6. Sign in, add your actual vendors, save your exchange rate, and create a product with a photo. Refresh and verify that the entry and photo persist.

Alternatively, from the configured project directory, use the Vercel CLI:

```bash
npx vercel
```

After configuring its environment variables, deploy production with:

```bash
npx vercel --prod
```

No provider accounts, live credentials, or hosted deployment are included in this source package. The production build has been validated locally; a final live Supabase/PeaSoup connection test is required after setting your credentials.

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

## Verify

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` checks financial rounding and input validation and executes the migration against local PostgreSQL via PGlite, including its pricing trigger, access restrictions and login limiter. Browser tests run a local demo server on port 3010 and create test vendors/products; use a separate checkout or reset local demo data if needed. Stop other `next dev` processes for the same checkout before running the browser suite.

The browser suite covers sign-in, auth rejection, settings, photo upload, create/edit/delete, persistence on refresh, filters, historical rate preservation, mobile layout, CSRF rejection and stale-edit conflicts. Provider connectivity, bucket CORS, network policy and Vercel deployment need a live check with your own services.

## Project layout

- `app/` — pages, layouts and authenticated API routes.
- `components/` — branded UI and forms.
- `lib/` — financial calculations, validation, sessions, data repository and storage adapter.
- `supabase/migration.sql` — schema, constraints, permissions, indexes and trigger.
- `scripts/password-hash.mjs` — local login password setup.
- `public/logo.webp` — optimised copy of the supplied logo.
- `tests/` — pricing, database and browser verification.

## Reference documentation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [PeaSoup S3 integration example](https://peasoup.cloud/docs/openmediavault/)
- [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs)
