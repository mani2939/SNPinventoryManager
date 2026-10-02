# Verification — 2 October 2026

- Production build: passed (`next build`, Next.js 16.3.8).
- Strict TypeScript check: passed.
- Pricing, input-validation and database tests: 5 passed.
- Full browser workflow: 1 passed, covering desktop/mobile, login/logout, rejected login, authenticated access, vendor and rate setup, photo upload/read, product creation/edit/delete, refresh persistence, vendor/date filtering, saved exchange rates, invalid quantity rejection, cross-origin write rejection and stale-edit rejection. No JavaScript page errors were recorded.
- PostgreSQL migration: executed twice successfully in PGlite; pricing trigger matched TypeScript calculations, including rounding and large-value cases. Anonymous table and login-RPC access was rejected. Persistent login limiting and window reset passed.
- PeaSoup adapter: signed PUT URL expiry, signed content length, MIME header and S3 checksum compatibility verified using dummy credentials.
- Production/Vercel checks: local demo disabled; missing production password configuration fails closed.
- Desktop and mobile screenshots were inspected for layout. Mobile page overflow checks passed.

## Live verification still required

No live Supabase project, PeaSoup credentials/bucket, or Vercel deployment was supplied. The real adapters and migration are included, but provider access, permissions, endpoint/region, CORS and deployed persistence require verification after connecting your services. Browser workflow tests used explicitly enabled local development persistence, not a live Supabase or PeaSoup account.

The general agent-browser CLI could not start in this environment. Browser verification used Chromium and Playwright against the development server in the same execution context. The temporary Chromium tooling is not included in the application or its production dependencies.

Screenshots contain illustrative test products and use the supplied logo as the upload fixture. Test data, local photos, credentials, build output and node_modules are excluded from the source archive.
