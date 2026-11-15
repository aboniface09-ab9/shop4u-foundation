import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  handleCheckoutFields,
  handleChargeSubscription,
  handleNotify,
  handleSubscriptionCheckoutFields,
  handleSubscriptionNotify,
  handleSubscriptionsDue,
  type PayfastWorkerEnv,
} from "./server/payfast/handlers";
import { runDailyBillingCron, type BillingCronEnv } from "./server/billing/cron";
import { handleQuotePdf, handleSendQuote, type QuotesWorkerEnv } from "./server/quotes/handlers";

/** Quote routes: admin send, and the client's private PDF. See src/server/quotes/handlers.ts. */
async function tryHandleQuoteRoute(request: Request, env: QuotesWorkerEnv): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (request.method === "POST" && pathname === "/api/platform/quotes/send") {
    return handleSendQuote(request, env);
  }
  const pdfMatch = /^\/api\/q\/([^/]+)\/pdf$/.exec(pathname);
  if (request.method === "GET" && pdfMatch) {
    return handleQuotePdf(request, pdfMatch[1]);
  }
  return undefined;
}

/** Private client pages must never be cached, indexed or leak their URL as a referrer. */
function withPrivatePageHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

/**
 * Payment provider routes handled directly at the Worker level, ahead of
 * the TanStack Start SSR handler.
 *
 * Why here and not a file-based API route under src/routes/api/: this
 * repo's installed @tanstack/react-start (1.167.50) has no "./api"
 * subpath export — createAPIFileRoute doesn't exist in this version
 * (confirmed by checking its package.json exports map). Rather than
 * guess at an uncertain alternative, these two routes are intercepted
 * here, which also gives direct access to real Cloudflare Worker env
 * bindings (the `env` argument below) instead of relying on
 * `process.env`. See payfast-integration-brief.md and
 * src/server/payfast/handlers.ts for the actual logic.
 *
 * If a future TanStack Start upgrade adds a real file-based API route
 * mechanism, this is the natural thing to migrate — check that
 * version's exports map first.
 */
async function tryHandlePaymentRoute(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/api/platform/subscriptions-due") {
    return handleSubscriptionsDue(request, env);
  }

  if (request.method !== "POST") return undefined;
  if (pathname === "/api/payment/payfast/checkout-fields") {
    return handleCheckoutFields(request, env);
  }
  if (pathname === "/api/payment/payfast/notify") {
    return handleNotify(request, env);
  }
  if (pathname === "/api/payment/payfast/subscription-checkout-fields") {
    return handleSubscriptionCheckoutFields(request, env);
  }
  if (pathname === "/api/payment/payfast/subscription-notify") {
    return handleSubscriptionNotify(request, env);
  }
  if (pathname === "/api/platform/charge-subscription") {
    return handleChargeSubscription(request, env);
  }
  return undefined;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const quoteResponse = await tryHandleQuoteRoute(request, (env ?? {}) as QuotesWorkerEnv);
      if (quoteResponse) return quoteResponse;

      const paymentResponse = await tryHandlePaymentRoute(
        request,
        (env ?? {}) as PayfastWorkerEnv,
      );
      if (paymentResponse) return paymentResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return new URL(request.url).pathname.startsWith("/q/") ? withPrivatePageHeaders(normalized) : normalized;
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  // Daily billing cron — see wrangler.jsonc's "triggers.crons" and
  // src/server/billing/cron.ts for what this actually does.
  async scheduled(_event: unknown, env: unknown, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      runDailyBillingCron((env ?? {}) as BillingCronEnv).catch((error) => {
        console.error("Billing cron failed", error);
      }),
    );
  },
};
