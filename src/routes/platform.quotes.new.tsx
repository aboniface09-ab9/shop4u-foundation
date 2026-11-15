import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field, Panel, selectClass } from "@/components/platform/form-utils";
import { Button } from "@/components/ui/button";
import { useClients, useProjects } from "@/data/clients";
import { useCreateQuote } from "@/data/quotes";

export const Route = createFileRoute("/platform/quotes/new")({
  component: NewQuote,
});

function NewQuote() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const { data: projects = [] } = useProjects(clientId);
  const create = useCreateQuote();

  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl font-semibold mb-6">New quote</h1>
      <Panel title="Who is it for?">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!clientId) return toast.error("Choose a client first");
            create.mutate(
              { clientId, projectId: projectId || null },
              {
                onSuccess: (q) => navigate({ to: "/platform/quotes/$id", params: { id: q.id } }),
                onError: (err) => toast.error("Couldn't create quote", { description: err.message }),
              },
            );
          }}
        >
          <Field label="Client *" name="client">
            <select
              id="client"
              className={selectClass}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId("");
              }}
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)" name="project">
            <select id="project" className={selectClass} value={projectId} disabled={!clientId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project yet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create draft quote"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
