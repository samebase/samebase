import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import type { HubClient } from "@/components/hubClients/hubClient";
import { HubClientsTable } from "@/components/hubClients/HubClientsTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { ViewerOrganization } from "@/organization/context";
import type { HubClientsRouteSearch } from "@/routeSearch/hubClients";
import type { SearchPatch } from "@/routing/searchFlags";
import { rootQueries } from "@/routes/root.queries";

/** What deleting `client` stops, for the confirmation. */
function deletionEffect(client: HubClient) {
  const origin = new URL(client.redirectUri).origin;
  return client.deploymentType === "production"
    ? `Sign-in on ${origin} stops until the next production deploy of ${client.registeredBy.app} gets a new client.`
    : `Sign-in on ${origin} stops until this deployment's next deploy or dev start gets a new client.`;
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
The identity hubs' sign-in clients of every repository of an organization's GitHub owner, one per
deployment that registered at `POST /hub-clients`, in the admin page's table without its owner
filter. A member who can create apps can delete one. The hubs are not live data, so each visit asks
again: a cached empty answer must not hide a deploy that registered a minute ago.
*/
export function OrganizationHubClientsPage({
  organization,
  search,
  onSearchChange,
}: {
  organization: ViewerOrganization;
  search: HubClientsRouteSearch;
  onSearchChange: (patch: SearchPatch<HubClientsRouteSearch>) => void;
}) {
  const readClients = useAction(api.hubClients.moderation.readClientsOfOrganization);
  const deleteClient = useAction(api.hubClients.moderation.deleteClientOfOrganization);
  const { data: viewerAccess } = useQuery(rootQueries.viewerAccess);
  const canDelete = viewerAccess?.accessKeys.includes("access_app_create") ?? false;
  const clients = useQuery({
    queryKey: ["organization-hub-clients", organization.organizationId],
    queryFn: async () => await readClients({ organizationId: organization.organizationId }),
    refetchOnMount: "always",
    retry: false,
  });
  const [deleting, setDeleting] = useState<HubClient | null>(null);

  return (
    <main
      data-testid="organization-hub-clients-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6 @max-3xl:px-3"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Sign-in clients</h1>
      {clients.isError ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          Could not reach the identity hub.
        </p>
      ) : clients.data === undefined ? null : clients.data.status === "off" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          This deployment of Samebase does not read the identity hub.
        </p>
      ) : (
        <HubClientsTable
          clients={clients.data.clients}
          limitReached={clients.data.limitReached}
          now={clients.dataUpdatedAt}
          search={search}
          onSearchChange={onSearchChange}
          owners={false}
          blocked={() => false}
          clientActions={(client) =>
            canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(client)}>
                  <Trash2 />
                  Delete…
                </DropdownMenuItem>
              </>
            ) : null
          }
          groupActions={() => null}
        />
      )}
      {deleting === null ? null : (
        <DeleteClientDialog
          client={deleting}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await deleteClient({
              organizationId: organization.organizationId,
              clientId: deleting.clientId,
            });
            setDeleting(null);
            await clients.refetch();
          }}
        />
      )}
    </main>
  );
}
