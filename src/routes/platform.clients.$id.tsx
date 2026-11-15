import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ClientForm } from "@/components/platform/ClientForm";
import {
  Field,
  formToObject,
  Panel,
  zodFieldErrors,
  type FieldErrors,
} from "@/components/platform/form-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAddContact,
  useClient,
  useContacts,
  useCreateProject,
  useDeleteContact,
  useProjects,
  useUpdateClient,
} from "@/data/clients";
import { contactSchema, projectSchema } from "@/lib/schemas/clients";

export const Route = createFileRoute("/platform/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const { data: client, isLoading, error } = useClient(id);
  const update = useUpdateClient(id);

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !client) return <p className="text-sm text-danger">Client not found.</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/platform/clients" className="text-xs text-muted hover:text-text">
          ← All clients
        </Link>
        <h1 className="font-heading text-3xl font-semibold mt-1">{client.company_name}</h1>
      </div>

      <Panel title="Client details">
        <ClientForm
          client={client}
          submitLabel="Save changes"
          busy={update.isPending}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => toast.success("Client saved"),
              onError: (err) => toast.error("Couldn't save", { description: err.message }),
            })
          }
        />
      </Panel>

      <ContactsPanel clientId={id} />
      <ProjectsPanel clientId={id} />
    </div>
  );
}

function ContactsPanel({ clientId }: { clientId: string }) {
  const { data: contacts = [] } = useContacts(clientId);
  const add = useAddContact(clientId);
  const remove = useDeleteContact(clientId);
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <Panel title="Contacts">
      <ul className="mb-6 divide-y divide-border">
        {contacts.length === 0 && <li className="py-2 text-sm text-muted">No contacts yet.</li>}
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{c.name}</span>
              {c.is_primary && (
                <Badge variant="outline" className="ml-2">
                  Primary
                </Badge>
              )}
              <div className="text-xs text-muted">
                {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "No details"}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${c.name}`}
              disabled={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Delete contact ${c.name}?`)) return;
                remove.mutate(c.id, {
                  onError: (err) => toast.error("Couldn't delete", { description: err.message }),
                });
              }}
            >
              <Trash2 size={14} />
            </Button>
          </li>
        ))}
      </ul>

      <form
        noValidate
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const raw = formToObject(form);
          const parsed = contactSchema.safeParse({ ...raw, is_primary: raw.is_primary === "on" });
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          add.mutate(parsed.data, {
            onSuccess: () => {
              form.reset();
              toast.success("Contact added");
            },
            onError: (err) => toast.error("Couldn't add contact", { description: err.message }),
          });
        }}
      >
        <Field label="Name *" name="contact_name" error={errors.name}>
          <Input id="contact_name" name="name" maxLength={200} />
        </Field>
        <Field label="Role" name="contact_role" error={errors.role}>
          <Input id="contact_role" name="role" maxLength={100} />
        </Field>
        <Field label="Email" name="contact_email" error={errors.email}>
          <Input id="contact_email" name="email" type="email" maxLength={254} />
        </Field>
        <Field label="Phone" name="contact_phone" error={errors.phone}>
          <Input id="contact_phone" name="phone" type="tel" maxLength={40} />
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="is_primary" /> Primary contact
        </label>
        <div className="md:col-span-2">
          <Button type="submit" variant="outline" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add contact"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function ProjectsPanel({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects(clientId);
  const create = useCreateProject(clientId);
  const [errors, setErrors] = useState<FieldErrors>({});

  return (
    <Panel title="Projects">
      <ul className="mb-6 divide-y divide-border">
        {projects.length === 0 && <li className="py-2 text-sm text-muted">No projects yet.</li>}
        {projects.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            <Link
              to="/platform/projects/$id"
              params={{ id: p.id }}
              className="text-sm font-medium hover:underline"
            >
              {p.name}
            </Link>
            <Badge variant={p.stage === "live" ? "default" : "outline"} className="capitalize">
              {p.stage}
            </Badge>
          </li>
        ))}
      </ul>

      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = projectSchema
            .pick({ name: true })
            .safeParse(formToObject(e.currentTarget));
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          create.mutate(projectSchema.parse({ name: parsed.data.name }), {
            onSuccess: (project) => {
              toast.success("Project created with starter content checklist");
              navigate({ to: "/platform/projects/$id", params: { id: project.id } });
            },
            onError: (err) => toast.error("Couldn't create project", { description: err.message }),
          });
        }}
      >
        <div className="flex-1">
          <Field label="New project name" name="project_name" error={errors.name}>
            <Input
              id="project_name"
              name="name"
              maxLength={200}
              placeholder="e.g. Company website"
            />
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Add project"}
        </Button>
      </form>
    </Panel>
  );
}
