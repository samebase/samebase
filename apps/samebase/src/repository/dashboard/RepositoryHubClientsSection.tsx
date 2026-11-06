import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { RepositoryOverviewLoadingLines } from "@/repository/dashboard/RepositoryEnvironmentTree";

type HubClient = Extract<
  FunctionReturnType<typeof api.hubClients.moderation.readClientsOfRepository>,
  { status: "on" }
>["clients"][number];

/** What deleting `client` stops, for the confirmation. */
function deletionEffect(client: HubClient) {
  return client.deploymentType === "production"
    ? `Sign-in on ${new URL(client.redirectUri).origin} stops until the next production deploy of ${client.registeredBy.app} gets a new client.`
    : `Sign-in on ${new URL(client.redirectUri).origin} stops until this deployment's next deploy or dev start gets a new client.`;
}

function DeleteClientDialog({
  client,
  onClose,
  onDelete,
}: {
  client: HubClient;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onDelete();
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !pending) {
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Delete this sign-in client?</DialogTitle>
          <DialogDescription>{deletionEffect(client)}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive" role="alert">
            The identity hub did not delete the client.
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={pending} type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            type="button"
            variant="destructive"
            onClick={() => void confirm()}
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

/**
The identity hub's sign-in clients of this repository: one per deployment that registered at
`POST /hub-clients`. Hidden while the hub's moderation key is not set on this deployment.
*/
export function HubClientsSection({
  canDelete,
  repositoryId,
}: {
  canDelete: boolean;
  repositoryId: Id<"repositories">;
}) {
  const readClients = useAction(api.hubClients.moderation.readClientsOfRepository);
  const deleteClient = useAction(api.hubClients.moderation.deleteClientOfRepository);
  const clients = useQuery({
    queryKey: ["repository-hub-clients", repositoryId],
    queryFn: async () => await readClients({ repositoryId }),
    retry: false,
  });
  const [deleting, setDeleting] = useState<HubClient | null>(null);

  if (clients.data?.status === "off") {
    return null;
  }

  return (
    <section aria-labelledby="repository-hub-clients-heading">
      <h2
        id="repository-hub-clients-heading"
        className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        Sign-in clients
      </h2>
      <div className="border-t border-border">
        {clients.isError ? (
          <p className="py-4 text-sm text-muted-foreground">Could not reach the identity hub.</p>
        ) : clients.data === undefined ? (
          <div className="px-1 py-4">
            <RepositoryOverviewLoadingLines />
          </div>
        ) : clients.data.clients.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No deployment has a client yet.</p>
        ) : (
          clients.data.clients.map((client) => (
            <div
              key={client.clientId}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  {client.registeredBy.app}, {client.clientName}
                </p>
                <p className="text-xs break-all text-muted-foreground">{client.redirectUri}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {client.lastSignInAt === null
                    ? "No sign-in yet"
                    : `Signed in ${formatRelativeTimeAgo(client.lastSignInAt)}`}
                </span>
                {canDelete ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => setDeleting(client)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      {deleting === null ? null : (
        <DeleteClientDialog
          client={deleting}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await deleteClient({ repositoryId, clientId: deleting.clientId });
            setDeleting(null);
            await clients.refetch();
          }}
        />
      )}
    </section>
  );
}
