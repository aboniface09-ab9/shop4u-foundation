import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectRow } from "@/data/clients";
import { centsToRandInput, randToCents } from "@/lib/money-input";
import { DNS_ACCESS_STATUSES, projectSchema, type ProjectInput } from "@/lib/schemas/clients";
import { Field, formToObject, Panel, selectClass, zodFieldErrors, type FieldErrors } from "./form-utils";

export function ProjectForm({
  project,
  busy,
  onSubmit,
}: {
  project: ProjectRow;
  busy: boolean;
  onSubmit: (input: ProjectInput) => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const text = (v: string | null) => v ?? "";

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = formToObject(e.currentTarget);
        const cents = randToCents(raw.hosting_monthly_rand ?? "");
        if (cents === undefined) {
          return setErrors({ hosting_monthly_rand: "Enter a rand amount like 250 or 250.50" });
        }
        const { hosting_monthly_rand: _ignored, ...rest } = raw;
        const parsed = projectSchema.safeParse({ ...rest, hosting_monthly_cents: cents });
        if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      <Panel title="Project and links">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Project name *" name="name" error={errors.name}>
              <Input id="name" name="name" defaultValue={project.name} maxLength={200} />
            </Field>
          </div>
          <Field label="Repository (GitHub)" name="repo_url" error={errors.repo_url} hint="https:// address">
            <Input id="repo_url" name="repo_url" type="url" defaultValue={text(project.repo_url)} />
          </Field>
          <Field label="Staging site" name="staging_url" error={errors.staging_url}>
            <Input id="staging_url" name="staging_url" type="url" defaultValue={text(project.staging_url)} />
          </Field>
          <Field label="Live site" name="production_url" error={errors.production_url}>
            <Input id="production_url" name="production_url" type="url" defaultValue={text(project.production_url)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Domain and registrar">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Domain name" name="domain_name" error={errors.domain_name}>
            <Input id="domain_name" name="domain_name" defaultValue={text(project.domain_name)} placeholder="example.co.za" />
          </Field>
          <Field label="Registrar" name="registrar" error={errors.registrar}>
            <Input id="registrar" name="registrar" defaultValue={text(project.registrar)} />
          </Field>
          <Field label="Domain expires" name="domain_expiry" error={errors.domain_expiry}>
            <Input id="domain_expiry" name="domain_expiry" type="date" defaultValue={text(project.domain_expiry)} />
          </Field>
          <Field label="DNS access" name="dns_access_status" error={errors.dns_access_status}>
            <select id="dns_access_status" name="dns_access_status" defaultValue={project.dns_access_status} className={selectClass}>
              {DNS_ACCESS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Nameservers" name="nameservers" error={errors.nameservers}>
              <Input id="nameservers" name="nameservers" defaultValue={text(project.nameservers)} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field
              label="Where the registrar login is kept"
              name="credential_location"
              error={errors.credential_location}
              hint="Say where (e.g. “Password manager, Afrihost entry”). Never type the password here."
            >
              <Input id="credential_location" name="credential_location" defaultValue={text(project.credential_location)} autoComplete="off" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Hosting and maintenance">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Hosting provider" name="hosting_provider" error={errors.hosting_provider}>
            <Input id="hosting_provider" name="hosting_provider" defaultValue={project.hosting_provider} />
          </Field>
          <Field label="Plan" name="hosting_plan" error={errors.hosting_plan}>
            <Input id="hosting_plan" name="hosting_plan" defaultValue={text(project.hosting_plan)} placeholder="e.g. Hosting + maintenance" />
          </Field>
          <Field label="Monthly fee (rand, ex VAT)" name="hosting_monthly_rand" error={errors.hosting_monthly_rand}>
            <Input
              id="hosting_monthly_rand"
              name="hosting_monthly_rand"
              inputMode="decimal"
              defaultValue={centsToRandInput(project.hosting_monthly_cents)}
            />
          </Field>
          <Field label="Starts (launch day)" name="hosting_start_date" error={errors.hosting_start_date}>
            <Input id="hosting_start_date" name="hosting_start_date" type="date" defaultValue={text(project.hosting_start_date)} />
          </Field>
        </div>
      </Panel>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save project"}
      </Button>
    </form>
  );
}
