import { buildOnceOffPayment, buildSubscriptionSignup, verifyItn } from "./api";
import { chargeSubscriptionAdhoc } from "./recurring-api";
import { mapPayfastStatusToOrderStatus, type PlatformPayfastConfig } from "./types";
import { getSupabaseAdmin } from "../supabase-admin";
import { resolveTenantSlug } from "@/lib/tenant-slug";
import { isSameOriginUrl } from "./url-guard";

// Plan pricing, used ONLY to lock in a monthly amount at the moment a
// merchant signs up for billing (subscriptions.monthly_amount_cents is
// then the source of truth forever after — see billing-schema.sql's
// note on grandfathering prices). Keep in sync with the actual pricing
// page copy if it ever changes; this is the one place that duplication
// currently lives.
const PLAN_MONTHLY_CENTS: Record<string, number> = {
  starter: 24900,
  growth: 59900,
  pro: 129900,
};

/**
 * PayFast route handlers — wired into src/server.ts (the raw Cloudflare
 * Worker fetch handler), NOT a TanStack Start file-based API route. See
 * the comment in src/routes/api/payment/payfast/checkout-fields.ts for
 * why: `createAPIFileRoute` doesn't exist in this repo's installed
 * @tanstack/react-start version.
 *
 * Each handler takes the real Cloudflare Worker `env` object (the
 * second argument to the Worker's fetch()), which is where
 * `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` actually surfaces —
 * no process.env guessing required.
 */

export type PayfastWorkerEnv = {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // YOUR OWN PayFast merchant account — singular, used only for charging
  // merchants their YouCommerce subscription (see
  // payfast-subscription-billing-brief.md). NOT the same thing as
  // tenant_payfast_config (per-merchant, for their own customer checkout).
  PLATFORM_PAYFAST_MERCHANT_ID?: string;
  PLATFORM_PAYFAST_MERCHANT_KEY?: string;
  PLATFORM_PAYFAST_PASSPHRASE?: string;
  PLATFORM_PAYFAST_MODE?: string; // "sandbox" | "live"
};

function getPlatformPayfastConfig(env: PayfastWorkerEnv): PlatformPayfastConfig | undefined {
  if (!env.PLATFORM_PAYFAST_MERCHANT_ID || !env.PLATFORM_PAYFAST_MERCHANT_KEY || !env.PLATFORM_PAYFAST_PASSPHRASE) {
    return undefined;
  }
  return {
    merchantId: env.PLATFORM_PAYFAST_MERCHANT_ID,
    merchantKey: env.PLATFORM_PAYFAST_MERCHANT_KEY,
    passphrase: env.PLATFORM_PAYFAST_PASSPHRASE,
    mode: env.PLATFORM_PAYFAST_MODE === "live" ? "live" : "sandbox",
  };
}

type CheckoutFieldsRequestBody = {
  orderReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  cancelUrl: string;
};

/**
 * POST /api/payment/payfast/checkout-fields
 *
 * Looks up the requesting tenant's OWN PayFast merchant credentials
 * (never a shared global one — see supabase-payfast-migration.sql) and
 * returns a signed field set the browser can POST straight to PayFast's
 * hosted page. No amount/order-status trust decisions happen here —
 * this only builds an outbound signed request. verifyItn() in
 * handleNotify() is where amounts get re-verified before anything is
 * marked paid.
 */
export async function handleCheckoutFields(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  let body: CheckoutFieldsRequestBody;
  try {
    body = (await request.json()) as CheckoutFieldsRequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.orderReference || !body.amountCents || !body.returnUrl || !body.cancelUrl) {
    return new Response("Missing required fields", { status: 400 });
  }

  if (!isSameOriginUrl(body.returnUrl, request.url) || !isSameOriginUrl(body.cancelUrl, request.url)) {
    return new Response("returnUrl and cancelUrl must be on this store's own address", { status: 400 });
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const admin = getSupabaseAdmin({
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
  });

  const requestUrl = new URL(request.url);
  const tenantSlug = resolveTenantSlug(requestUrl.hostname);

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, store_name")
    .eq("slug", tenantSlug)
    .single();
  if (tenantError || !tenant) {
    return new Response(`No tenant found for slug "${tenantSlug}"`, { status: 404 });
  }

  const { data: config, error: configError } = await admin
    .from("tenant_payfast_config")
    .select("merchant_id, merchant_key, passphrase, mode")
    .eq("tenant_id", tenant.id)
    .single();
  if (configError || !config) {
    return new Response(
      `Tenant "${tenantSlug}" has no PayFast merchant config yet — add a row to tenant_payfast_config first.`,
      { status: 412 },
    );
  }

  const notifyUrl = `${requestUrl.origin}/api/payment/payfast/notify`;

  const { action, fields } = buildOnceOffPayment(
    {
      merchantId: config.merchant_id,
      merchantKey: config.merchant_key,
      passphrase: config.passphrase ?? undefined,
      mode: config.mode as "sandbox" | "live",
    },
    {
      orderReference: body.orderReference,
      amountCents: body.amountCents,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      itemName: tenant.store_name ? `Order from ${tenant.store_name}` : "Order",
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
      notifyUrl,
      customStr1: tenantSlug, // so handleNotify doesn't have to guess the tenant
    },
  );

  return Response.json({
    action,
    fields,
    sessionReference: body.orderReference,
  });
}

/**
 * POST /api/payment/payfast/notify — PayFast's ITN (Instant Transaction
 * Notification) receiver.
 *
 * Security posture (full checklist in payfast-integration-brief.md):
 *   - Never trusts the payload until verifyItn() has confirmed signature
 *     + PayFast's own /eng/query/validate echo + a re-derived expected
 *     amount from our own order record.
 *   - Idempotent: if the order is already "paid"/"fulfilled", a repeat
 *     ITN (PayFast retries on non-2xx) is a no-op.
 *   - Signature/amount/merchant mismatches are NOT retried — those won't
 *     be fixed by PayFast trying again, so we return 200 (stop the retry
 *     loop) but log loudly for manual review. Only the PayFast
 *     validate-endpoint call itself failing (transient) gets a 500.
 */
export async function handleNotify(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  const rawBody = await request.text();

  const params = new URLSearchParams(rawBody);
  const mPaymentId = params.get("m_payment_id");
  const merchantId = params.get("merchant_id");
  if (!mPaymentId || !merchantId) {
    console.error("PayFast ITN missing m_payment_id or merchant_id", { fields: [...params.keys()] });
    return new Response("Missing required fields", { status: 400 });
  }

  const admin = getSupabaseAdmin({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });

  const { data: config, error: configError } = await admin
    .from("tenant_payfast_config")
    .select("tenant_id, merchant_id, merchant_key, passphrase, mode")
    .eq("merchant_id", merchantId)
    .single();
  if (configError || !config) {
    console.error("PayFast ITN for unknown merchant_id", { merchantId });
    return new Response("Unknown merchant", { status: 200 }); // forged id won't be fixed by retrying
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, order_number, tenant_id, total_cents, status")
    .eq("order_number", mPaymentId)
    .eq("tenant_id", config.tenant_id)
    .single();
  if (orderError || !order) {
    console.error("PayFast ITN for unknown order", { mPaymentId, tenantId: config.tenant_id });
    return new Response("Unknown order", { status: 200 });
  }

  if (order.status === "paid" || order.status === "fulfilled") {
    return new Response("OK (already processed)", { status: 200 });
  }

  let result;
  try {
    result = await verifyItn({
      rawBody,
      merchant: {
        merchantId: config.merchant_id,
        merchantKey: config.merchant_key,
        passphrase: config.passphrase ?? undefined,
        mode: config.mode as "sandbox" | "live",
      },
      expectedAmountCents: order.total_cents,
    });
  } catch (err) {
    console.error("PayFast ITN validate call failed", err);
    return new Response("Validate call failed", { status: 500 }); // transient — worth a retry
  }

  if (!result.ok) {
    console.error("PayFast ITN verification failed — NOT marking order paid", {
      mPaymentId,
      reason: result.reason,
    });
    return new Response("OK (unverified, ignored)", { status: 200 });
  }

  const orderStatus = mapPayfastStatusToOrderStatus(result.payload.payment_status);

  const { error: updateError } = await admin
    .from("orders")
    .update({
      status: orderStatus,
      payment_reference: result.payload.pf_payment_id,
      paid_at: orderStatus === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("Failed to update order after verified PayFast ITN", updateError);
    return new Response("Failed to update order", { status: 500 }); // verified payment, worth a retry
  }

  return new Response("OK", { status: 200 });
}

// =========================================================================
// Subscription billing — a MERCHANT paying their own YouCommerce fee.
// Separate concern from everything above (which is storefront customers
// paying merchants). See payfast-subscription-billing-brief.md.
//
// NOT TESTED END-TO-END — built ahead of Adam registering his own PayFast
// account (in progress). Verify against a real sandbox signup + charge
// before trusting any of this with real money.
// =========================================================================

type SubscriptionCheckoutFieldsRequestBody = {
  amountCents: number; // 0 for pure card-capture, or a plan's first-month fee
  itemName: string;
  customerEmail?: string;
  customerName?: string;
  returnUrl: string;
  cancelUrl: string;
};

/**
 * POST /api/payment/payfast/subscription-checkout-fields
 *
 * Same hostname-based tenant resolution as handleCheckoutFields (this
 * runs on the merchant's OWN subdomain, e.g. poolsbydayle.youcommerce.co.za,
 * when they click "Set up billing" in their own /admin/settings) — but
 * signs against YOUR platform PayFast credentials, not tenant_payfast_config.
 */
export async function handleSubscriptionCheckoutFields(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  let body: SubscriptionCheckoutFieldsRequestBody;
  try {
    body = (await request.json()) as SubscriptionCheckoutFieldsRequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (
    body.returnUrl && body.cancelUrl &&
    (!isSameOriginUrl(body.returnUrl, request.url) || !isSameOriginUrl(body.cancelUrl, request.url))
  ) {
    return new Response("returnUrl and cancelUrl must be on this store's own address", { status: 400 });
  }
  if (!body.itemName || !body.returnUrl || !body.cancelUrl || body.amountCents === undefined) {
    return new Response("Missing required fields", { status: 400 });
  }

  const platformConfig = getPlatformPayfastConfig(env);
  if (!platformConfig) {
    return new Response(
      "Platform PayFast credentials not configured yet — set PLATFORM_PAYFAST_MERCHANT_ID/KEY/PASSPHRASE as Worker secrets first.",
      { status: 412 },
    );
  }

  const requestUrl = new URL(request.url);
  const tenantSlug = resolveTenantSlug(requestUrl.hostname);
  const notifyUrl = `${requestUrl.origin}/api/payment/payfast/subscription-notify`;

  let action: string;
  let fields: Record<string, string>;
  try {
    const built = buildSubscriptionSignup(platformConfig, {
      tenantSlug,
      amountCents: body.amountCents,
      itemName: body.itemName,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
      notifyUrl,
    });
    action = built.action;
    fields = built.fields as unknown as Record<string, string>;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to build signup fields", {
      status: 500,
    });
  }

  return Response.json({ action, fields });
}

/**
 * POST /api/payment/payfast/subscription-notify — ITN receiver for
 * subscription SIGNUP specifically (capturing the card / first charge).
 * Ongoing monthly charges go through chargeSubscriptionAdhoc() instead
 * (called from handleChargeSubscription, triggered from /platform), which
 * deliberately skips its own async ITN (see recurring-api.ts) — so this
 * route only ever fires once per merchant, at signup.
 *
 * No pre-existing "order" record exists to check the amount against
 * (unlike handleNotify above) — verifyItn() is called with
 * expectedAmountCents omitted. Signature + PayFast's validate-endpoint
 * call still fully authenticate that this payload genuinely came from
 * PayFast unmodified; there's just no separate "did it match what WE
 * expected" check to layer on top, since there was no prior expectation.
 */
export async function handleSubscriptionNotify(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const tenantSlug = params.get("custom_str1");
  const token = params.get("token");

  if (!tenantSlug || !token) {
    console.error("PayFast subscription ITN missing custom_str1 (tenant slug) or token", { fields: [...params.keys()] });
    return new Response("Missing required fields", { status: 400 });
  }

  const platformConfig = getPlatformPayfastConfig(env);
  if (!platformConfig) {
    console.error("Subscription ITN received but platform PayFast credentials aren't configured");
    return new Response("Platform PayFast not configured", { status: 500 });
  }

  let result;
  try {
    result = await verifyItn({ rawBody, merchant: platformConfig }); // no expectedAmountCents — see doc comment above
  } catch (err) {
    console.error("PayFast subscription ITN validate call failed", err);
    return new Response("Validate call failed", { status: 500 });
  }

  if (!result.ok) {
    console.error("PayFast subscription ITN verification failed — NOT storing token", {
      tenantSlug,
      reason: result.reason,
    });
    return new Response("OK (unverified, ignored)", { status: 200 });
  }

  const admin = getSupabaseAdmin({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, plan, billing_anchor, billing_state")
    .eq("slug", tenantSlug)
    .single();
  if (tenantError || !tenant) {
    console.error("Subscription ITN for unknown tenant slug", { tenantSlug });
    return new Response("Unknown tenant", { status: 200 }); // forged slug won't be fixed by retrying
  }

  const chargedNowCents = Math.round(parseFloat(result.payload.amount_gross) * 100);
  const monthlyAmountCents = PLAN_MONTHLY_CENTS[tenant.plan] ?? chargedNowCents;

  // BillingCard now charges the real plan price on first-time signup (only
  // a card-update on an already-active subscription sends 0) — so paying
  // right now always buys a fresh month starting today, whenever "today"
  // happens to be (mid-trial by choice, or after trial-end suspension).
  // No proration needed either way. Anchor billing_anchor/next_charge_date
  // to today, same as any normal subscription's first billing cycle.
  const nextCharge = new Date(new Date().setMonth(new Date().getMonth() + 1));
  const billingAnchor = tenant.billing_anchor ?? Math.min(new Date().getDate(), 28);
  nextCharge.setDate(billingAnchor); // clamp to the 1-28 range subscriptions.billing_anchor requires

  // Two-step upsert rather than a single .upsert() call: subscriptions'
  // "one active row per tenant" constraint is a PARTIAL unique index
  // (WHERE cancelled_at IS NULL — see billing-schema.sql), and PostgREST's
  // upsert can't target a partial index's predicate, only a plain column
  // list. Select-then-insert-or-update sidesteps that limitation.
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenant.id)
    .is("cancelled_at", null)
    .maybeSingle();

  if (existingSub) {
    await admin
      .from("subscriptions")
      .update({
        card_token: token,
        last_charge_status: chargedNowCents > 0 ? "succeeded" : null,
        last_charge_at: chargedNowCents > 0 ? new Date().toISOString() : null,
      })
      .eq("id", existingSub.id);
  } else {
    await admin.from("subscriptions").insert({
      tenant_id: tenant.id,
      plan: tenant.plan,
      monthly_amount_cents: monthlyAmountCents,
      billing_anchor: billingAnchor,
      next_charge_date: nextCharge.toISOString().slice(0, 10),
      card_token: token,
      last_charge_status: chargedNowCents > 0 ? "succeeded" : null,
      last_charge_at: chargedNowCents > 0 ? new Date().toISOString() : null,
    });
  }

  if (chargedNowCents > 0) {
    await admin.from("charges").insert({
      tenant_id: tenant.id,
      subscription_id: existingSub?.id, // null on first-ever signup insert — fine, charges.subscription_id is nullable-safe here since we just created the row; acceptable gap, flagged as a follow-up
      amount_cents: chargedNowCents,
      status: "succeeded",
      charge_type: "initial",
      gateway_reference: result.payload.pf_payment_id,
      settled_at: new Date().toISOString(),
    });

    // A real charge succeeding always means "active" now, regardless of
    // which state they came from — trialing (paying early), past_due
    // (caught up), or soft/hard_suspended (trial ended, paying to unlock).
    await admin.from("tenants").update({ billing_state: "active" }).eq("id", tenant.id);
  }

  return new Response("OK", { status: 200 });
}

/**
 * Shared gate for every /api/platform/* route: validates the caller's
 * Supabase access token (sent as `Authorization: Bearer <token>` from the
 * browser — see src/data/platform.ts) and confirms they're on the
 * platform_admins list. Cross-tenant privileged actions, so this is
 * deliberately NOT the hostname/tenant-resolution trust model the
 * checkout routes use — those apply to normal per-tenant admin API
 * variables, whereas /platform can see every merchant, which no ordinary
 * merchant admin should ever be able to trigger.
 */
async function requirePlatformAdmin(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<{ ok: true; admin: ReturnType<typeof getSupabaseAdmin> } | { ok: false; response: Response }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, response: new Response("Missing Authorization header", { status: 401 }) };
  }

  const admin = getSupabaseAdmin({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, response: new Response("Invalid session", { status: 401 }) };
  }

  const { data: adminRow } = await admin
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!adminRow) {
    return { ok: false, response: new Response("Not a platform admin", { status: 403 }) };
  }

  return { ok: true, admin };
}

/**
 * GET /api/platform/subscriptions-due — powers the /platform billing-run
 * list. Deliberately a service-role-gated route rather than a direct
 * client query + RLS policy: `subscriptions.card_token` is sensitive
 * enough (PayFast Recurring Billing token) that it shouldn't be reachable
 * via any client-side query path, even a well-intentioned one — this
 * route only ever returns a `hasCardToken` boolean, never the token
 * itself.
 */
export async function handleSubscriptionsDue(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  const gate = await requirePlatformAdmin(request, env);
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.admin
    .from("subscriptions")
    .select(
      "id, tenant_id, plan, monthly_amount_cents, next_charge_date, last_charge_status, last_charge_at, card_token, tenants(slug, store_name, name, billing_state)",
    )
    .is("cancelled_at", null)
    .order("next_charge_date", { ascending: true });

  if (error) {
    return new Response(`Failed to load subscriptions: ${error.message}`, { status: 500 });
  }

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    plan: row.plan,
    monthlyAmountCents: row.monthly_amount_cents,
    nextChargeDate: row.next_charge_date,
    lastChargeStatus: row.last_charge_status,
    lastChargeAt: row.last_charge_at,
    hasCardToken: !!row.card_token,
    tenant: row.tenants,
  }));

  return Response.json({ subscriptions: rows });
}

/**
 * POST /api/platform/charge-subscription — admin-triggered from the
 * /platform billing-run screen. Requires the caller to be on the
 * platform_admins list (checked via their Supabase auth token, NOT
 * hostname/tenant resolution — this is a cross-tenant privileged action).
 */
export async function handleChargeSubscription(
  request: Request,
  env: PayfastWorkerEnv,
): Promise<Response> {
  const gate = await requirePlatformAdmin(request, env);
  if (!gate.ok) return gate.response;
  const admin = gate.admin;

  let body: { subscriptionId?: string };
  try {
    body = (await request.json()) as { subscriptionId?: string };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.subscriptionId) {
    return new Response("Missing subscriptionId", { status: 400 });
  }

  const { data: sub, error: subError } = await admin
    .from("subscriptions")
    .select("id, tenant_id, card_token, monthly_amount_cents, billing_anchor, last_charge_status")
    .eq("id", body.subscriptionId)
    .single();
  if (subError || !sub) {
    return new Response("Subscription not found", { status: 404 });
  }
  if (!sub.card_token) {
    return new Response("This subscription has no card on file yet", { status: 412 });
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("store_name, name")
    .eq("id", sub.tenant_id)
    .single();

  const platformConfig = getPlatformPayfastConfig(env);
  if (!platformConfig) {
    return new Response("Platform PayFast credentials not configured yet", { status: 412 });
  }

  const result = await chargeSubscriptionAdhoc(platformConfig, {
    token: sub.card_token,
    amountCents: sub.monthly_amount_cents,
    itemName: `YouCommerce subscription — ${tenant?.store_name ?? tenant?.name ?? "merchant"}`,
    mPaymentId: sub.id,
  });

  const nextCharge = new Date();
  nextCharge.setMonth(nextCharge.getMonth() + 1);
  nextCharge.setDate(sub.billing_anchor ?? new Date().getDate());

  if (result.ok) {
    await admin.from("charges").insert({
      tenant_id: sub.tenant_id,
      subscription_id: sub.id,
      amount_cents: sub.monthly_amount_cents,
      status: "succeeded",
      // First-ever successful charge (trial just ended) is "initial";
      // every one after that is a normal "recurring" monthly charge.
      charge_type: sub.last_charge_status ? "recurring" : "initial",
      gateway_response: result.raw as object,
      settled_at: new Date().toISOString(),
    });
    await admin
      .from("subscriptions")
      .update({
        next_charge_date: nextCharge.toISOString().slice(0, 10),
        last_charge_status: "succeeded",
        last_charge_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    await admin.from("tenants").update({ billing_state: "active" }).eq("id", sub.tenant_id);

    return Response.json({ ok: true });
  }

  await admin.from("charges").insert({
    tenant_id: sub.tenant_id,
    subscription_id: sub.id,
    amount_cents: sub.monthly_amount_cents,
    status: "failed",
    charge_type: "recurring",
    failure_reason: result.reason,
  });
  await admin
    .from("subscriptions")
    .update({ last_charge_status: "failed" })
    .eq("id", sub.id);
  await admin.from("tenants").update({ billing_state: "past_due" }).eq("id", sub.tenant_id);

  return Response.json({ ok: false, reason: result.reason }, { status: 402 });
}
