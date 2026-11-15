/**
 * SUPERSEDED — see src/server.ts and src/server/payfast/handlers.ts.
 *
 * Same reason as ./checkout-fields.ts: `createAPIFileRoute` from
 * `@tanstack/react-start/api` doesn't exist in the installed
 * @tanstack/react-start version (1.167.50) — no "./api" entry in its
 * package.json "exports" map. The ITN receiver is now handled directly
 * in src/server.ts, intercepted before the TanStack Start SSR handler.
 *
 * This file exports nothing and isn't imported anywhere; kept only as a
 * pointer for anyone who goes looking for it at the "obvious" path.
 */
export {};
