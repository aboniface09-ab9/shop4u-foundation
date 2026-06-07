import type { TJOAuthResponse } from "./types";

/**
 * TJ OAuth client — server-only.
 *
 * Implements the documented client_credentials flow against TJ's
 * /auth/oauth2/token endpoint. Caches the access token in-process for
 * just under its 30-minute lifetime, refreshing transparently.
 *
 * SECURITY:
 *   - Credentials are passed as parameters, never imported as constants.
 *     The caller (a Cloudflare Worker route handler) reads them from
 *     the Worker environment binding and passes them in.
 *   - This module MUST NOT be imported by any browser code. The bundler
 *     should be configured (or this kept under src/server/) to enforce.
 *
 * NOTE on caching scope: this is a module-level in-memory cache. In a
 * Workers environment, each isolate has its own copy — that's fine and
 * actually safer than a shared cache. Token requests are cheap enough
 * that per-isolate caching is the right trade-off.
 */

export type TJOAuthCredentials = {
  /** Full OAuth token endpoint, e.g.
   *  "https://uat-pg-api.transactionjunction.com/auth/oauth2/token" */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

let cache: CachedToken | null = null;
let inflight: Promise<string> | null = null;

const SAFETY_MARGIN_MS = 2 * 60 * 1000; // refresh 2 minutes before expiry

/**
 * Get a fresh access token (cached). Coalesces concurrent calls so we
 * don't fire off multiple token requests when the cache is cold.
 */
export async function getAccessToken(creds: TJOAuthCredentials): Promise<string> {
  // Cache hit?
  if (cache && Date.now() < cache.expiresAt - SAFETY_MARGIN_MS) {
    return cache.accessToken;
  }
  // Already fetching? Wait for that one.
  if (inflight) return inflight;

  inflight = fetchToken(creds)
    .then((token) => {
      cache = token;
      return token.accessToken;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

async function fetchToken(creds: TJOAuthCredentials): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const res = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Don't include the response body in the error — it may echo the
    // request body which contains the client_secret.
    throw new Error(`TJ OAuth failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as TJOAuthResponse;
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("TJ OAuth response missing access_token or expires_in");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/** Test helper: clear the cache. Not exported in production code paths. */
export function _resetCacheForTests() {
  cache = null;
  inflight = null;
}
