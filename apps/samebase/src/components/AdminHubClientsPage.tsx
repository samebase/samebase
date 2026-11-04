import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIRST_PAGE: string | null = null;

const BLOCK_KINDS = [
  { value: "repository", label: "Repository" },
  { value: "owner", label: "Owner" },
] as const;

type BlockKind = (typeof BLOCK_KINDS)[number]["value"];

const formatTime = (time: number) => new Date(time).toLocaleString();

const formatOptionalTime = (time: number | null) => (time === null ? "Never" : formatTime(time));

const formatCount = (count: { count: number; atLeast: boolean }) =>
  `${count.count}${count.atLeast ? "+" : ""}`;

/**
The registrations of the identity hub's `/hub-clients`, every client at the hub, and the blocks and
their events.
*/
export function AdminHubClientsPage() {
  const readOverview = useAction(api.hubClients.moderation.readOverview);
  const listRegistrations = useAction(api.hubClients.moderation.listRegistrations);
  const changeBlock = useAction(api.hubClients.moderation.changeBlock);
  const overview = useQuery({
    queryKey: ["admin-hub-clients-overview"],
    queryFn: async () => await readOverview({}),
    retry: false,
  });
  const registrations = useInfiniteQuery({
    queryKey: ["admin-hub-clients-registrations"],
    queryFn: async ({ pageParam }) => await listRegistrations({ cursor: pageParam }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) =>
      last.status === "on" && !last.registrations.isDone
        ? last.registrations.continueCursor
        : undefined,
    enabled: overview.data?.status === "on",
    retry: false,
  });
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
      await overview.refetch();
    } catch {
      setMessage("The hub refused the change. Check the id and the reason.");
    } finally {
      setPending(null);
    }
  };

  const rows = (registrations.data?.pages ?? []).flatMap((page) =>
    page.status === "on" ? page.registrations.page : [],
  );

  return (
    <main
      data-testid="admin-hub-clients-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6"
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
          <p className="mt-6 text-sm text-muted-foreground">
            {formatCount(overview.data.counts.day)} registrations in the last day,{" "}
            {formatCount(overview.data.counts.week)} in the last week.
          </p>

          <h2 className="mt-10 text-base font-semibold">Registrations</h2>
          <div className="mt-3 overflow-x-auto border-t">
            <table className="w-full min-w-5xl text-left text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-3 pr-4 font-medium">Registered</th>
                  <th className="py-3 pr-4 font-medium">Repository</th>
                  <th className="py-3 pr-4 font-medium">Owner</th>
                  <th className="py-3 pr-4 font-medium">Actor</th>
                  <th className="py-3 pr-4 font-medium">Stage</th>
                  <th className="py-3 pr-4 font-medium">App</th>
                  <th className="py-3 font-medium">Return address</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.clientId} className="border-b">
                    <td className="py-3 pr-4">{formatTime(row.registeredAt)}</td>
                    <td className="py-3 pr-4">
                      {row.githubRepository}{" "}
                      <span className="text-muted-foreground">
                        {row.githubRepositoryDatabaseId}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{row.githubOwnerId}</td>
                    <td className="py-3 pr-4">{row.githubActorLogin}</td>
                    <td className="py-3 pr-4">{row.stage}</td>
                    <td className="py-3 pr-4">{row.app}</td>
                    <td className="py-3 break-all">{row.redirectUri}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {registrations.isError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              Could not load the registrations.
            </p>
          ) : registrations.isSuccess && rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No registrations.</p>
          ) : null}
          {registrations.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              disabled={registrations.isFetchingNextPage}
              onClick={() => void registrations.fetchNextPage()}
            >
              {registrations.isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          ) : null}

          <h2 className="mt-10 text-base font-semibold">All clients</h2>
          <div className="mt-3 overflow-x-auto border-t">
            <table className="w-full min-w-6xl text-left text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-3 pr-4 font-medium">Created</th>
                  <th className="py-3 pr-4 font-medium">App</th>
                  <th className="py-3 pr-4 font-medium">Client</th>
                  <th className="py-3 pr-4 font-medium">Client ID</th>
                  <th className="py-3 pr-4 font-medium">Deployment</th>
                  <th className="py-3 pr-4 font-medium">Return address</th>
                  <th className="py-3 pr-4 font-medium">Expires</th>
                  <th className="py-3 pr-4 font-medium">Last renewed</th>
                  <th className="py-3 font-medium">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.clientList.clients.map((client) => (
                  <tr key={client.clientId} className="border-b">
                    <td className="py-3 pr-4">{formatTime(client.createdAt)}</td>
                    <td className="py-3 pr-4 break-all">{client.appId}</td>
                    <td className="py-3 pr-4">{client.clientName}</td>
                    <td className="py-3 pr-4 break-all">{client.clientId}</td>
                    <td className="py-3 pr-4">{client.deploymentType}</td>
                    <td className="py-3 pr-4 break-all">{client.redirectUri}</td>
                    <td className="py-3 pr-4">{formatOptionalTime(client.removeAt)}</td>
                    <td className="py-3 pr-4">{formatOptionalTime(client.renewedAt)}</td>
                    <td className="py-3">{formatOptionalTime(client.lastSignInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overview.data.clientList.clients.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No clients.</p>
          ) : overview.data.clientList.limitReached ? (
            <p className="mt-4 text-sm text-muted-foreground">
              The newest {overview.data.clientList.clients.length} clients.
            </p>
          ) : null}

          <h2 className="mt-10 text-base font-semibold">Blocks</h2>
          <form
            className="mt-3 grid max-w-xl gap-4"
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
          {overview.data.blockList.blocks.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No blocks.</p>
          ) : (
            <ul className="mt-6 divide-y border-y">
              {overview.data.blockList.blocks.map((block) => (
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
          {overview.data.blockList.events.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No block events.</p>
          ) : (
            <ol className="mt-3 divide-y border-y">
              {overview.data.blockList.events.map((event, index) => (
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
      )}
    </main>
  );
}
