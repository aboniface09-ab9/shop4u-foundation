import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  Field,
  formToObject,
  Panel,
  zodFieldErrors,
  type FieldErrors,
} from "@/components/platform/form-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessSettings, useSaveBusinessSettings } from "@/data/quotes";
import { businessSettingsSchema } from "@/lib/schemas/quotes";

export const Route = createFileRoute("/platform/settings")({
  component: BusinessSettingsPage,
});

function BusinessSettingsPage() {
  const { data: s, isLoading, error } = useBusinessSettings();
  const save = useSaveBusinessSettings();
  const [errors, setErrors] = useState<FieldErrors>({});

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !s) return <p className="text-sm text-danger">Couldn&apos;t load settings.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold">Business settings</h1>
        <p className="text-muted text-sm mt-1">
          Appears on quotes and invoices. Only platform admins can see or change this.
        </p>
      </header>

      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = formToObject(e.currentTarget);
          const parsed = businessSettingsSchema.safeParse({
            ...raw,
            vat_registered: raw.vat_registered === "on",
          });
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          save.mutate(parsed.data, {
            onSuccess: () => toast.success("Settings saved"),
            onError: (err) => toast.error("Couldn't save", { description: err.message }),
          });
        }}
      >
        <Panel title="Company">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Legal name *" name="legal_name" error={errors.legal_name}>
              <Input
                id="legal_name"
                name="legal_name"
                defaultValue={s.legal_name}
                maxLength={200}
              />
            </Field>
            <Field
              label="Registration number"
              name="registration_number"
              error={errors.registration_number}
            >
              <Input
                id="registration_number"
                name="registration_number"
                defaultValue={s.registration_number}
              />
            </Field>
            <Field label="Email" name="email" error={errors.email}>
              <Input id="email" name="email" type="email" defaultValue={s.email} />
            </Field>
            <Field label="Phone" name="phone" error={errors.phone}>
              <Input id="phone" name="phone" type="tel" defaultValue={s.phone} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address" name="address" error={errors.address}>
                <Textarea id="address" name="address" rows={2} defaultValue={s.address} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="vat_registered" defaultChecked={s.vat_registered} /> VAT
              registered (new quotes add 15% VAT)
            </label>
            <Field label="VAT number" name="vat_number" error={errors.vat_number}>
              <Input id="vat_number" name="vat_number" defaultValue={s.vat_number} />
            </Field>
          </div>
        </Panel>

        <Panel title="Bank details for EFT payments">
          <p className="mb-4 text-xs text-muted">
            Shown on invoices so clients can pay by EFT. Use the company&apos;s account only.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Bank" name="bank_name" error={errors.bank_name}>
              <Input id="bank_name" name="bank_name" defaultValue={s.bank_name} />
            </Field>
            <Field label="Account holder" name="account_holder" error={errors.account_holder}>
              <Input id="account_holder" name="account_holder" defaultValue={s.account_holder} />
            </Field>
            <Field label="Account number" name="account_number" error={errors.account_number}>
              <Input
                id="account_number"
                name="account_number"
                inputMode="numeric"
                defaultValue={s.account_number}
                autoComplete="off"
              />
            </Field>
            <Field label="Branch code" name="branch_code" error={errors.branch_code}>
              <Input id="branch_code" name="branch_code" defaultValue={s.branch_code} />
            </Field>
          </div>
        </Panel>

        <Panel title="Defaults for new quotes">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Valid for (days)"
              name="default_validity_days"
              error={errors.default_validity_days}
            >
              <Input
                id="default_validity_days"
                name="default_validity_days"
                inputMode="numeric"
                defaultValue={String(s.default_validity_days)}
              />
            </Field>
            <Field
              label="Deposit %"
              name="default_deposit_percent"
              error={errors.default_deposit_percent}
            >
              <Input
                id="default_deposit_percent"
                name="default_deposit_percent"
                inputMode="numeric"
                defaultValue={String(s.default_deposit_percent)}
              />
            </Field>
            <Field
              label="Invoices due after (days)"
              name="default_invoice_due_days"
              error={errors.default_invoice_due_days}
            >
              <Input
                id="default_invoice_due_days"
                name="default_invoice_due_days"
                inputMode="numeric"
                defaultValue={String(s.default_invoice_due_days)}
              />
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Standard terms"
                name="default_terms"
                error={errors.default_terms}
                hint="Have an attorney review this wording before first use."
              >
                <Textarea
                  id="default_terms"
                  name="default_terms"
                  rows={6}
                  defaultValue={s.default_terms}
                />
              </Field>
            </div>
          </div>
        </Panel>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </div>
  );
}
