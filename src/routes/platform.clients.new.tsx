import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ClientForm } from "@/components/platform/ClientForm";
import { Panel } from "@/components/platform/form-utils";
import { useCreateClient } from "@/data/clients";

export const Route = createFileRoute("/platform/clients/new")({
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const create = useCreateClient();

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-3xl font-semibold mb-6">New client</h1>
      <Panel title="Client details">
        <ClientForm
          submitLabel="Create client"
          busy={create.isPending}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (client) => {
                toast.success("Client created");
                navigate({ to: "/platform/clients/$id", params: { id: client.id } });
              },
              onError: (err) => toast.error("Couldn't create client", { description: err.message }),
            })
          }
        />
      </Panel>
    </div>
  );
}
