import { getSupabaseAdmin } from "../supabase-admin";
import { sendTransactionalEmail, type BrevoEmailEnv } from "../email/brevo";

/**
 * Daily billing cron — replaces the two pieces of "v1 manual ops" that a
 * human can't reasonably be expected to remember every day (see
 * billing-schema.sql's own note: "Automation later: a Cloudflare Workers
 * Cron checks every day at 06:00 SAST"). Two jobs, both idempotent (safe
 * to run more than once for the same tenant on the same day):
 *
 *   1. Suspend trials that ended with no card ever added — matches the
 *      documented state machine's `trialing --(trial ends, no card)-->
 *      soft_suspended` transition. Storefront stays live (soft_suspended
 *      means "admin restricted, storefront still up" — see the enum's own
 *      comment); only src/routes/admin.tsx's billing gate reacts to this.
 *   2. Email a one-time reminder to tenants whose trial ends in exactly
 *      3 days, so "enforcement" isn't a surprise. No new "reminder sent"
 *      column — firing only on the exact day (trial_ends_at is 3 days out
 *      today) rather than a >= range means a missed cron run just skips
 *      that tenant's reminder rather than needing dedup bookkeeping.
 *
 * SERVER-ONLY. Never import from src/lib or src/routes (browser code).
 */

export type BillingCronEnv = BrevoEmailEnv & {
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function startOfDayIso(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function runDailyBillingCron(env: BillingCronEnv, now = new Date()): Promise<void> {
  const admin = getSupabaseAdmin({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });

  await suspendExpiredTrialsWithNoCard(admin, now);
  await sendTrialEndingReminders(admin, env, now);
}

async function suspendExpiredTrialsWithNoCard(
  admin: ReturnType<typeof getSupabaseAdmin>,
  now: Date,
): Promise<void> {
  const { data: expiredTrials, error: trialsError } = await admin
    .from("tenants")
    .select("id")
    .eq("billing_state", "trialing")
    .lte("trial_ends_at", now.toISOString());
  if (trialsError || !expiredTrials?.length) {
    if (trialsError) console.error("Billing cron: failed to load expired trials", trialsError);
    return;
  }

  const expiredIds = expiredTrials.map((t) => t.id);

  const { data: withCard, error: subsError } = await admin
    .from("subscriptions")
    .select("tenant_id")
    .in("tenant_id", expiredIds)
    .is("cancelled_at", null)
    .not("card_token", "is", null);
  if (subsError) {
    console.error("Billing cron: failed to check which expired trials have a card", subsError);
    return;
  }

  const hasCard = new Set((withCard ?? []).map((s) => s.tenant_id));
  const toSuspend = expiredIds.filter((id) => !hasCard.has(id));
  if (!toSuspend.length) return;

  const { error: updateError } = await admin
    .from("tenants")
    .update({ billing_state: "soft_suspended" })
    .in("id", toSuspend);
  if (updateError) {
    console.error("Billing cron: failed to suspend expired trials", updateError);
  }
}

async function sendTrialEndingReminders(
  admin: ReturnType<typeof getSupabaseAdmin>,
  env: BillingCronEnv,
  now: Date,
): Promise<void> {
  const reminderDay = addDays(now, 3);
  const dayStart = startOfDayIso(reminderDay);
  const dayEnd = startOfDayIso(addDays(reminderDay, 1));

  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, slug, name, store_name, trial_ends_at")
    .eq("billing_state", "trialing")
    .gte("trial_ends_at", dayStart)
    .lt("trial_ends_at", dayEnd);
  if (error) {
    console.error("Billing cron: failed to load tenants due for a trial-ending reminder", error);
    return;
  }
  if (!tenants?.length) return;

  for (const tenant of tenants) {
    const { data: owners } = await admin
      .from("tenant_users")
      .select("auth_user_id")
      .eq("tenant_id", tenant.id)
      .eq("role", "owner");

    for (const owner of owners ?? []) {
      const { data: userRes, error: userError } = await admin.auth.admin.getUserById(owner.auth_user_id);
      const email = userRes?.user?.email;
      if (userError || !email) continue;

      const result = await sendTransactionalEmail(env, {
        to: { email },
        subject: "Your YouCommerce trial ends in 3 days",
        htmlContent: `
          <p>Hi,</p>
          <p>Your free trial for <strong>${tenant.store_name ?? tenant.name}</strong> on YouCommerce ends on
          <strong>${new Date(tenant.trial_ends_at as string).toLocaleDateString()}</strong>.</p>
          <p>Add a card before then to keep managing your store without interruption — your storefront stays
          live either way, but your admin panel will lock until billing is set up.</p>
          <p><a href="https://${tenant.slug}.youcommerce.co.za/admin/settings">Set up billing</a></p>
        `,
      });
      if (!result.ok) {
        console.error("Billing cron: failed to send trial-ending reminder", {
          tenantSlug: tenant.slug,
          reason: result.reason,
        });
      }
    }
  }
}
