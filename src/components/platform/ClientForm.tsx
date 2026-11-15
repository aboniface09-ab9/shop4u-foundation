import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_STATUSES, clientSchema, type ClientInput } from "@/lib/schemas/clients";
import type { ClientRow } from "@/data/clients";
import { Field, formToObject, selectClass, zodFieldErrors, type FieldErrors } from "./form-utils";

export function ClientForm({
  client,
  submitLabel,
  busy,
  onSubmit,
}: {
  client?: ClientRow;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: ClientInput) => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <form
      noValidate
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = clientSchema.safeParse(formToObject(e.currentTarget));
        if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      <Field label="Company name *" name="company_name" error={errors.company_name}>
        <Input id="company_name" name="company_name" defaultValue={client?.company_name ?? ""} maxLength={200} />
      </Field>
      <Field label="Trading name" name="trading_name" error={errors.trading_name}>
        <Input id="trading_name" name="trading_name" defaultValue={client?.trading_name ?? ""} maxLength={200} />
      </Field>
      <Field label="VAT number" name="vat_number" error={errors.vat_number}>
        <Input id="vat_number" name="vat_number" defaultValue={client?.vat_number ?? ""} maxLength={30} />
      </Field>
      <Field label="Status" name="status" error={errors.status}>
        <select id="status" name="status" defaultValue={client?.status ?? "lead"} className={selectClass}>
          {CLIENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Billing address" name="billing_address" error={errors.billing_address}>
          <Textarea id="billing_address" name="billing_address" defaultValue={client?.billing_address ?? ""} rows={2} maxLength={500} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Notes" name="notes" error={errors.notes} hint="Internal only. Don't store passwords or ID numbers here.">
          <Textarea id="notes" name="notes" defaultValue={client?.notes ?? ""} rows={3} maxLength={4000} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
