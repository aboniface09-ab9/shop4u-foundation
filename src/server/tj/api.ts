import { getAccessToken, type TJOAuthCredentials } from "./oauth";
import type {
  TJCreateSessionRequest,
  TJCreateSessionResponse,
  TJTransaction,
} from "./types";

/**
 * TJ API client — server-only.
 *
 * Wraps the documented hosted payment page endpoints. Each call handles
 * OAuth token acquisition internally via the cached client, so callers
 * only deal with their inputs and outputs.
 *
 * Caller is responsible for:
 *   - Providing TJ credentials (loaded from Worker env in the route handler).
 *   - Validating webhook payloads via getTransaction before trusting them.
 *   - Mapping TJ transaction statuses to our internal order status (see types.ts).
 *
 * SERVER-ONLY: do not import from src/lib or src/routes (browser bundles).
 */

export type TJEnv = TJOAuthCredentials & {
  /** Base URL for the gateway, e.g.
   *  "https://uat-pg-api.transactionjunction.com/uat/ipgw/gateway/v1" */
  apiBaseUrl: string;
  /** Merchant identifier issued by TJ during onboarding. */
  merchantId: string;
  /** Merchant profile UUID issued by TJ during onboarding. */
  profileId: string;
};

/**
 * Create a hosted payment session. Returns the URL to redirect the
 * customer to.
 *
 * Per TJ docs the amount is a float (e.g. 100.01 = R100.01), NOT cents.
 * Internal code keeps everything as cents; the conversion happens here.
 */
export async function createSession(
  env: TJEnv,
  input: {
    orderReference: string; // becomes merchantRef
    amountCents: number;
    redirectSuccessUrl: string;
    redirectFailedUrl: string;
    redirectCancelUrl?: string;
    customerProfileId?: string;
    metadata?: Record<string, string>;
  },
): Promise<TJCreateSessionResponse> {
  const token = await getAccessToken(env);

  const body: TJCreateSessionRequest = {
    redirectSuccessUrl: input.redirectSuccessUrl,
    redirectFailedUrl: input.redirectFailedUrl,
    redirectCancelUrl: input.redirectCancelUrl,
    metaData: input.metadata,
    transaction: {
      amount: input.amountCents / 100,
      merchantId: env.merchantId,
      profileId: env.profileId,
      merchantRef: input.orderReference,
      customerProfileId: input.customerProfileId,
    },
  };

  const res = await fetch(`${env.apiBaseUrl}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Body may contain useful debug info but no secrets — safe to forward.
    const text = await res.text();
    throw new Error(`TJ createSession failed: HTTP ${res.status} — ${text}`);
  }

  return (await res.json()) as TJCreateSessionResponse;
}

/**
 * Fetch the authoritative state of a transaction by TJ's transactionId.
 * This is the call we use to verify webhook contents — never trust the
 * webhook payload itself; always re-check with this.
 */
export async function getTransaction(
  env: TJEnv,
  transactionId: string,
): Promise<TJTransaction> {
  const token = await getAccessToken(env);

  const res = await fetch(`${env.apiBaseUrl}/transactions/${encodeURIComponent(transactionId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`TJ getTransaction failed: HTTP ${res.status}`);
  }

  return (await res.json()) as TJTransaction;
}

/**
 * Lookup a transaction by our own merchantRef (our order_number).
 * Useful for reconciling when we know the order ref but not TJ's
 * transactionId.
 */
export async function getTransactionByMerchantRef(
  env: TJEnv,
  merchantRef: string,
): Promise<TJTransaction> {
  const token = await getAccessToken(env);
  const url = new URL(`${env.apiBaseUrl}/transactions/search`);
  url.searchParams.set("merchantId", env.merchantId);
  url.searchParams.set("profileId", env.profileId);
  url.searchParams.set("merchantRef", merchantRef);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`TJ getTransactionByMerchantRef failed: HTTP ${res.status}`);
  }

  return (await res.json()) as TJTransaction;
}

/**
 * Standalone refund. Not wired into the app yet — merchant admin
 * refund UI is a later iteration.
 */
export async function standaloneRefund(
  env: TJEnv,
  input: {
    amountCents: number;
    merchantRef: string;
  },
): Promise<unknown> {
  const token = await getAccessToken(env);

  const res = await fetch(`${env.apiBaseUrl}/create-card-payment/standalone/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      merchantId: env.merchantId,
      profileId: env.profileId,
      amount: input.amountCents / 100,
      merchantRef: input.merchantRef,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TJ refund failed: HTTP ${res.status} — ${text}`);
  }
  return res.json();
}
