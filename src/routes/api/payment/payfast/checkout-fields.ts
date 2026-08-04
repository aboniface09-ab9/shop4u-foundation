/**
 * SUPERSEDED — see src/server.ts and src/server/payfast/handlers.ts.
 *
 * This file originally used `createAPIFileRoute` from
 * `@tanstack/react-start/api`, following a pattern found bundled with
 * this package's docs. That subpath export doesn't actually exist in
 * the installed @tanstack/react-start version (1.167.50) — confirmed by
 * checking node_modules/@tanstack/react-start/package.json's "exports"
 * map, which has no "./api" entry. Building against it fails
 * (`Cannot find module '@tanstack/react-start/api'`).
 *
 * Rather than guess at whichever server-route API this version does
 * expose, the PayFast checkout-fields endpoint is now handled directly
 * in src/server.ts (the raw Cloudflare Worker fetch handler), which:
 *   - is code that's already confirmed working in this repo,
 *   - gives direct access to real Cloudflare Worker env bindings
 *     (fetch(request, env, ctx)) instead of relying on process.env,
 *   - matches src/server/tj/api.ts's existing convention of taking env
 *     as an explicit parameter rather than reading it ambiently.
 *
 * The actual handler logic lives in src/server/payfast/handlers.ts —
 * this route path (/api/payment/payfast/checkout-fields) is intercepted
 * in src/server.ts before the request reaches the TanStack Start SSR
 * handler. This file is kept only as a pointer; it exports nothing and
 * isn't imported anywhere.
 *
 * If a later @tanstack/react-start upgrade adds a real file-based API
 * route mechanism, this is the natural place to move the handler back
 * to — check that version's exports map first.
 */
export {};
