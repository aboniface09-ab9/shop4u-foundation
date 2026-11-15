import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Field,
  formToObject,
  Panel,
  selectClass,
  zodFieldErrors,
  type FieldErrors,
} from "@/components/platform/form-utils";
import { ProjectForm } from "@/components/platform/ProjectForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useActivity,
  useAddContentItem,
  useClient,
  useContentItems,
  useDeleteContentItem,
  useProject,
  useSetProjectStage,
  useUpdateContentItem,
  useUpdateProject,
} from "@/data/clients";
import { CONTENT_STATUSES, PROJECT_STAGES, contentItemSchema } from "@/lib/schemas/clients";

export const Route = createFileRoute("/platform/projects/$id")({
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const { data: project, isLoading, error } = useProject(id);
  const { data: client } = useClient(project?.client_id ?? "");
  const update = useUpdateProject(id);
  const setStage = useSetProjectStage({ id, stage: project?.stage ?? "discovery" });

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !project) return <p className="text-sm text-danger">Project not found.</p>;

  const currentIndex = PROJECT_STAGES.indexOf(project.stage);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          to="/platform/clients/$id"
          params={{ id: project.client_id }}
          className="text-xs text-muted hover:text-text"
        >
          ← {client?.company_name ?? "Client"}
        </Link>
        <h1 className="font-heading text-3xl font-semibold mt-1">{project.name}</h1>
      </div>

      <Panel title="Stage">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROJECT_STAGES.map((stage, i) => (
            <li key={stage}>
              <Button
                type="button"
                className="w-full capitalize"
                variant={i === currentIndex ? "default" : "outline"}
                aria-current={i === currentIndex ? "step" : undefined}
                disabled={setStage.isPending}
                onClick={() =>
                  setStage.mutate(stage, {
                    onSuccess: () => toast.success(`Stage: ${stage}`),
                    onError: (err) =>
                      toast.error("Couldn't change stage", { description: err.message }),
                  })
                }
              >
                {i + 1}. {stage}
              </Button>
            </li>
          ))}
        </ol>
        {project.launched_at && (
          <p className="mt-3 text-xs text-muted">
            Launched {new Date(project.launched_at).toLocaleDateString("en-ZA")}
          </p>
        )}
      </Panel>

      <ProjectForm
        project={project}
        busy={update.isPending}
        onSubmit={(input) =>
          update.mutate(input, {
            onSuccess: () => toast.success("Project saved"),
            onError: (err) => toast.error("Couldn't save", { description: err.message }),
          })
        }
      />

      <ContentPanel projectId={id} />
      <ActivityPanel projectId={id} />
    </div>
  );
}

function ContentPanel({ projectId }: { projectId: string }) {
  const { data: items = [] } = useContentItems(projectId);
  const add = useAddContentItem(projectId);
  const update = useUpdateContentItem(projectId);
  const remove = useDeleteContentItem(projectId);
  const [errors, setErrors] = useState<FieldErrors>({});

  const done = items.filter((i) => i.status === "approved" || i.status === "not_needed").length;

  return (
    <Panel title={`Content and assets (${done}/${items.length} done)`}>
      <ul className="mb-6 divide-y divide-border">
        {items.length === 0 && <li className="py-2 text-sm text-muted">No items.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm">{it.item}</span>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Status of ${it.item}`}
                className={`${selectClass} w-36`}
                value={it.status}
                onChange={(e) =>
                  update.mutate(
                    {
                      id: it.id,
                      patch: { status: e.target.value as (typeof CONTENT_STATUSES)[number] },
                    },
                    {
                      onError: (err) =>
                        toast.error("Couldn't update", { description: err.message }),
                    },
                  )
                }
              >
                {CONTENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${it.item}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (!window.confirm(`Remove “${it.item}”?`)) return;
                  remove.mutate(it.id, {
                    onError: (err) => toast.error("Couldn't delete", { description: err.message }),
                  });
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <form
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const parsed = contentItemSchema.safeParse(formToObject(form));
          if (!parsed.success) return setErrors(zodFieldErrors(parsed.error));
          setErrors({});
          add.mutate(parsed.data, {
            onSuccess: () => form.reset(),
            onError: (err) => toast.error("Couldn't add item", { description: err.message }),
          });
        }}
      >
        <div className="flex-1">
          <Field label="Add an item" name="content_item" error={errors.item}>
            <Input id="content_item" name="item" maxLength={200} />
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={add.isPending}>
          Add
        </Button>
      </form>
    </Panel>
  );
}

function ActivityPanel({ projectId }: { projectId: string }) {
  const { data: rows = [] } = useActivity(projectId);
  return (
    <Panel title="Activity">
      <ul className="space-y-1 text-sm">
        {rows.length === 0 && <li className="text-muted">Nothing yet.</li>}
        {rows.map((r) => {
          const d = r.detail as { from?: string; to?: string };
          return (
            <li key={r.id} className="flex justify-between gap-3">
              <span>
                {r.event.replace(/_/g, " ")}
                {d.from && d.to ? `: ${d.from} → ${d.to}` : ""}
              </span>
              <span className="font-mono text-xs text-muted">
                {new Date(r.created_at).toLocaleString("en-ZA")}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
