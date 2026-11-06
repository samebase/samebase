import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Ban, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { formatTime, type HubClient, ownerOf } from "@/components/hubClients/hubClient";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { applySearchPatch } from "@/routing/searchFlags";

const adminHubClientsRouteApi = getRouteApi("/_authed/admin/hub-clients");

type Overview = Extract<
  FunctionReturnType<typeof api.hubClients.moderation.readOverview>,
  { status: "on" }
>;
type BlockKind = Overview["blockList"]["blocks"][number]["kind"];

const BLOCK_KINDS = [
  { value: "repository", label: "Repository" },
  { value: "owner", label: "Owner" },
] as const;

const formatCount = (count: { count: number; atLeast: boolean }) =>
  `${count.count}${count.atLeast ? "+" : ""}`;

type BlockTarget = { kind: BlockKind; githubId: string; name: string; clientCount: number };

const repositoryTarget = (client: HubClient, clients: readonly HubClient[]): BlockTarget => ({
  kind: "repository",
  githubId: client.registeredBy.githubRepositoryDatabaseId,
  name: client.registeredBy.githubRepository,
  clientCount: clients.filter(
    (other) =>
      other.registeredBy.githubRepositoryDatabaseId ===
      client.registeredBy.githubRepositoryDatabaseId,
  ).length,
});

const ownerTarget = (client: HubClient, clients: readonly HubClient[]): BlockTarget => ({
  kind: "owner",
  githubId: client.registeredBy.githubOwnerId,
  name: ownerOf(client),
  clientCount: clients.filter(
    (other) => other.registeredBy.githubOwnerId === client.registeredBy.githubOwnerId,
  ).length,
});

/**
Every client at the identity hub with who made it at `/hub-clients` (a repository's GitHub Actions
run with its actor, or a laptop with the app's initial access token), grouped by repository, and the
blocks and their events.
*/
export function AdminHubClientsPage() {
  const readOverview = useAction(api.hubClients.moderation.readOverview);
  const changeBlock = useAction(api.hubClients.moderation.changeBlock);
  const overview = useQuery({
    queryKey: ["admin-hub-clients-overview"],
    queryFn: async () => await readOverview({}),
    retry: false,
  });
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);

  return (
    <main
      data-testid="admin-hub-clients-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6 @max-3xl:px-3"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Hub clients</h1>
      {overview.isError ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          Could not reach the identity hub.
        </p>
      ) : overview.data === undefined ? null : overview.data.status === "off" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Moderation is off: HUB_MODERATION_KEY is not set on this deployment.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCount(overview.data.counts.day)} registrations in the last day,{" "}
            {formatCount(overview.data.counts.week)} in the last week.
          </p>
          <Tabs defaultValue="clients" className="mt-6">
            <TabsList variant="line">
              <TabsTrigger value="clients">
                Clients {overview.data.clientList.clients.length}
              </TabsTrigger>
              <TabsTrigger value="blocks">
                Blocks {overview.data.blockList.blocks.length}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="clients">
              <AdminClientsTable
                overview={overview.data}
                now={overview.dataUpdatedAt}
                onBlock={setBlockTarget}
              />
            </TabsContent>
            <TabsContent value="blocks">
              <BlocksSection
                overview={overview.data}
                changeBlock={changeBlock}
                onChanged={async () => {
                  await overview.refetch();
                }}
              />
            </TabsContent>
          </Tabs>
          <BlockDialog
            target={blockTarget}
            changeBlock={changeBlock}
            onClose={() => setBlockTarget(null)}
            onChanged={async () => {
              await overview.refetch();
            }}
          />
        </>
      )}
    </main>
  );
}

/** The shared table with the admin's owner filter and grouping, the blocked badges, and the blocks. */
function AdminClientsTable({
  overview,
  now,
  onBlock,
}: {
  overview: Overview;
  now: number;
  onBlock: (target: BlockTarget) => void;
}) {
  const navigate = adminHubClientsRouteApi.useNavigate();
  const search = adminHubClientsRouteApi.useSearch();
  const clients = overview.clientList.clients;

  const blocked = useMemo(() => {
    const ids = new Set(
      overview.blockList.blocks.map((block) => `${block.kind}:${block.githubId}`),
    );
    return (client: HubClient) =>
      ids.has(`repository:${client.registeredBy.githubRepositoryDatabaseId}`) ||
      ids.has(`owner:${client.registeredBy.githubOwnerId}`);
  }, [overview.blockList.blocks]);

  return (
    <HubClientsTable
      clients={clients}
      limitReached={overview.clientList.limitReached}
      now={now}
      search={search}
      onSearchChange={(patch) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: (current) => applySearchPatch(current, patch),
          to: ".",
        });
      }}
      owners
      blocked={blocked}
      clientActions={(client) => (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onBlock(repositoryTarget(client, clients))}
          >
            <Ban />
            Block repository…
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onBlock(ownerTarget(client, clients))}
          >
            <Ban />
            Block owner…
          </DropdownMenuItem>
        </>
      )}
      groupActions={(first, group) => (
        <>
          {group === "repository" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onBlock(repositoryTarget(first, clients))}
              >
                <Ban />
                Block repository…
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onBlock(ownerTarget(first, clients))}
          >
            <Ban />
            Block owner…
          </DropdownMenuItem>
        </>
      )}
    />
  );
}

function BlockDialog({
  target,
  changeBlock,
  onClose,
  onChanged,
}: {
  target: BlockTarget | null;
  changeBlock: ReturnType<typeof useAction<typeof api.hubClients.moderation.changeBlock>>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const block = async (blockTarget: BlockTarget) => {
    setPending(true);
    setError(null);
    try {
      await changeBlock({
        action: "block",
        kind: blockTarget.kind,
        githubId: blockTarget.githubId,
        reason,
      });
      await onChanged();
      close();
    } catch {
      setError("The hub refused the change.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open || pending ? null : close())}>
      {target === null ? null : (
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>
              Block {target.kind} {target.name}?
            </DialogTitle>
            <DialogDescription>
              No client of{" "}
              {target.kind === "repository" ? "this repository" : "any repository of this owner"}{" "}
              can register, renew, or sign in until you unblock it. That stops {target.clientCount}{" "}
              {target.clientCount === 1 ? "client" : "clients"} in this list.
            </DialogDescription>
          </DialogHeader>
          <form
            id="admin-hub-clients-block-form"
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending) {
                void block(target);
              }
            }}
          >
            <Label htmlFor="admin-hub-clients-block-reason">Reason</Label>
            <Input
              id="admin-hub-clients-block-reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            {error === null ? null : (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="admin-hub-clients-block-form"
              variant="destructive"
              disabled={pending || reason.trim() === ""}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Blocking...
                </>
              ) : (
                `Block ${target.kind}`
              )}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      )}
    </Dialog>
  );
}

function BlocksSection({
  overview,
  changeBlock,
  onChanged,
}: {
  overview: Overview;
  changeBlock: ReturnType<typeof useAction<typeof api.hubClients.moderation.changeBlock>>;
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<BlockKind>("repository");
  const [githubId, setGithubId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"block" | "unblock" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (action: "block" | "unblock") => {
    if (pending !== null) {
      return;
    }
    setPending(action);
    setMessage(null);
    try {
      const result = await changeBlock({ action, kind, githubId: githubId.trim(), reason });
      setMessage(
        result.status === "on" && !result.changed
          ? action === "block"
            ? "Already blocked."
            : "Not blocked."
          : null,
      );
      setReason("");
      await onChanged();
    } catch {
      setMessage("The hub refused the change. Check the id and the reason.");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <form
        className="mt-4 grid max-w-xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("block");
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="admin-hub-clients-kind">What</Label>
          <Select value={kind} onValueChange={setKind} items={BLOCK_KINDS}>
            <SelectTrigger id="admin-hub-clients-kind" className="text-base">
              <SelectValue />
            </SelectTrigger>
            <AppSelectContent>
              {BLOCK_KINDS.map((option) => (
                <AppSelectItem key={option.value} value={option.value}>
                  {option.label}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-hub-clients-github-id">GitHub id</Label>
          <Input
            id="admin-hub-clients-github-id"
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            required
            value={githubId}
            onChange={(event) => setGithubId(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin-hub-clients-reason">Reason</Label>
          <Input
            id="admin-hub-clients-reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={pending !== null}>
            {pending === "block" ? (
              <>
                <Loader2 className="animate-spin" />
                Blocking...
              </>
            ) : (
              "Block"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity()) {
                void submit("unblock");
              }
            }}
          >
            {pending === "unblock" ? (
              <>
                <Loader2 className="animate-spin" />
                Unblocking...
              </>
            ) : (
              "Unblock"
            )}
          </Button>
        </div>
        {message === null ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </form>
      {overview.blockList.blocks.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No blocks.</p>
      ) : (
        <ul className="mt-6 divide-y border-y">
          {overview.blockList.blocks.map((block) => (
            <li key={`${block.kind}-${block.githubId}`} className="py-3 text-sm">
              {block.kind} {block.githubId}: {block.reason}{" "}
              <span className="text-muted-foreground">
                {block.adminEmail}, {formatTime(block.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-base font-semibold">Block events</h2>
      {overview.blockList.events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No block events.</p>
      ) : (
        <ol className="mt-3 divide-y border-y">
          {overview.blockList.events.map((event, index) => (
            <li key={`${event.createdAt}-${index}`} className="py-3 text-sm">
              {event.action} {event.kind} {event.githubId}: {event.reason}{" "}
              <span className="text-muted-foreground">
                {event.adminEmail}, {formatTime(event.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
