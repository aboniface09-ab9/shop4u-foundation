# Supabase: migrations and dev database

Production holds real merchants and customer orders, and the existing project
is named `shop-4-u-dev`. Do not develop against it.

## One-time setup of a separate dev database (Adam does this)
1. Create a new Supabase project (free tier, same EU region), e.g. `youcommerce-dev`.
2. Apply, in order: `../supabase-schema.sql`, `../billing-schema.sql` (if not already inside the schema),
   the root `supabase-*-migration.sql` files, `../shop4u-foundation/*.sql` fixes, then everything in `migrations/`.
   The live database may differ from these files; if in doubt, dump the live schema
   (schema only, no data) and load that instead.
3. Seed with **fictional** data only (never copy production rows).
4. Point `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and `.dev.vars`
   (`SUPABASE_SERVICE_ROLE_KEY`) at the dev project. Both files are git-ignored. Never commit keys.

## Going forward
- New schema changes are new files in `migrations/` named `YYYYMMDDHHMMSS_description.sql`.
- Apply to dev, run `tests/*.sql`, then production only with approval.
- `tests/security_hardening.sql` must pass after `migrations/20261115000001_security_hardening.sql`.

## Status of the dev project (15 Nov 2026)
`youcommerce-dev` (ref `lgkreasgzfldjyblwokw`, eu-west-1) has the repo schema, categories, payfast config, platform_admins,
the two storage buckets, and the security hardening migration applied. `tests/security_hardening.sql` passes.
Before hardening, the same checks showed a merchant could set their own plan/billing_state and link themselves to another tenant.
Not loaded on dev: real merchant seed data, onboarding_submissions, and whatever anonymous-checkout policy exists on the live
orders table (not in the repo; dump it from production before testing storefront checkout on dev).

## Dev test login
The dev project has a fictional platform admin `dev-admin@example.com` (and fictional "Example Seafood Co" data) for UI checks.
Delete both before the dev project is ever used for anything else. Run the app against it with the `portal-dev-db`
launch config (port 8081); it uses the project's public key only.
