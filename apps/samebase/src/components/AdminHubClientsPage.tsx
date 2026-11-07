import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Ban, Eye, EyeOff, Loader2 } from "lucide-react";
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

/**
The app of a client, for the hub's sign-in page: its broker app (the production app, or the preview
app with the development servers), whether a row of it exists now, and the owner to send: the
row's to remove it, else the repository owner that the hub recorded, which a new row binds to.
*/
type SignInPageTarget = {
  appId: string;
  ownerId: string | null;
  /** The owner that registered this client, which can be an earlier owner than `ownerId`. */
  registeredByOwnerId: string;
  name: string;
  production: boolean;
  exempt: boolean;
  now: HubClient["signInPage"];
};

const signInPageTarget = (client: HubClient, overview: Overview): SignInPageTarget => {
  const row = overview.signInPage.apps.find((app) => app.appId === client.appId);
  return {
    appId: client.appId,
    ownerId: row === undefined ? client.ownerId : row.ownerId,
    registeredByOwnerId: client.registeredBy.githubOwnerId,
    name: `${client.registeredBy.githubRepository} ${client.registeredBy.app}`,
    production: client.deploymentType === "production",
    exempt: row !== undefined,
    now: client.signInPage,
  };
};

const SIGN_IN_PAGE_NOW = {
  shown: "The hub shows its sign-in page to this app's users.",
  every_app: "The hub skips its sign-in page for every app.",
  this_app: "The hub skips its sign-in page for this app.",
  policy: "The hub's own rules skip its sign-in page for this app.",
} as const;

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
run with its actor, or a development server with the app's initial access token), grouped by
repository, and the blocks and their events.
*/
export function AdminHubClientsPage() {
  const readOverview = useAction(api.hubClients.moderation.readOverview);
  const changeBlock = useAction(api.hubClients.moderation.changeBlock);
  const changeSignInPage = useAction(api.hubClients.moderation.changeSignInPage);
  const overview = useQuery({
    queryKey: ["admin-hub-clients-overview"],
    queryFn: async () => await readOverview({}),
    retry: false,
  });
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [signInPageTarget, setSignInPageTarget] = useState<SignInPageTarget | null>(null);
  const refetch = async () => {
    await overview.refetch();
  };

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
              <TabsTrigger value="sign-in-page">Sign-in page</TabsTrigger>
            </TabsList>
            <TabsContent value="clients">
              <AdminClientsTable
                overview={overview.data}
                now={overview.dataUpdatedAt}
                onBlock={setBlockTarget}
                onSignInPage={setSignInPageTarget}
              />
            </TabsContent>
            <TabsContent value="blocks">
              <BlocksSection
                overview={overview.data}
                changeBlock={changeBlock}
                onChanged={refetch}
              />
            </TabsContent>
            <TabsContent value="sign-in-page">
              <SignInPageSection
                overview={overview.data}
                changeSignInPage={changeSignInPage}
                onChanged={refetch}
              />
            </TabsContent>
          </Tabs>
          <BlockDialog
            target={blockTarget}
            changeBlock={changeBlock}
            onClose={() => setBlockTarget(null)}
            onChanged={refetch}
          />
          <SignInPageDialog
            target={signInPageTarget}
            changeSignInPage={changeSignInPage}
            onClose={() => setSignInPageTarget(null)}
            onChanged={refetch}
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
  onSignInPage,
}: {
  overview: Overview;
  now: number;
  onBlock: (target: BlockTarget) => void;
  onSignInPage: (target: SignInPageTarget) => void;
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
          {overview.signInPage.apps.some((app) => app.appId === client.appId) ? (
            <DropdownMenuItem onSelect={() => onSignInPage(signInPageTarget(client, overview))}>
              <Eye />
              Show the sign-in page…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={client.ownerId === null}
              onSelect={() => onSignInPage(signInPageTarget(client, overview))}
            >
              <EyeOff />
              Skip the sign-in page…
            </DropdownMenuItem>
          )}
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

type ChangeSignInPage = ReturnType<
  typeof useAction<typeof api.hubClients.moderation.changeSignInPage>
>;

/** What the hub answered to a change that it did not make, for the admin. */
const signInPageRefusal = (result: string) =>
  result === "owner_changed"
    ? "The repository has another owner now. Reload the page and try again."
    : result === "unknown_app"
      ? "The hub no longer has this app."
      : null;

/** Skips or shows again the hub's sign-in page for one app, with a reason. */
function SignInPageDialog({
  target,
  changeSignInPage,
  onClose,
  onChanged,
}: {
  target: SignInPageTarget | null;
  changeSignInPage: ChangeSignInPage;
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

  const change = async (pageTarget: SignInPageTarget, ownerId: string) => {
    setPending(true);
    setError(null);
    try {
      const answer = await changeSignInPage({
        target: { scope: "app", appId: pageTarget.appId, expectedOwnerId: ownerId },
        skip: !pageTarget.exempt,
        reason,
      });
      const refusal = answer.status === "on" ? signInPageRefusal(answer.result) : null;
      if (refusal !== null) {
        setError(refusal);
        return;
      }
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
              {target.exempt ? "Show" : "Skip"} the sign-in page for {target.name}?
            </DialogTitle>
            <DialogDescription>
              {target.now === null ? null : `${SIGN_IN_PAGE_NOW[target.now]} `}
              {target.exempt
                ? "This removes the app's own exemption. From the next sign-in the hub shows its page, unless the switch for every app or the hub's own rules skip it. Sign-ins that already started finish as they started."
                : `The users of this app's ${target.production ? "production" : "previews and development servers"} go straight to Google or GitHub, with no page that names the app. The exemption trusts the repository's owner that the hub recorded, GitHub id ${target.ownerId ?? "none"}, and stops when the repository has another owner.`}
              {!target.exempt && target.registeredByOwnerId !== target.ownerId
                ? ` This client was registered by an earlier owner, GitHub id ${target.registeredByOwnerId}, and keeps the page: only clients of the recorded owner skip it.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <form
            id="admin-hub-clients-sign-in-page-form"
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              // The hub recorded no owner of the repository: no row can bind to one.
              if (!pending && target.ownerId !== null) {
                void change(target, target.ownerId);
              }
            }}
          >
            <Label htmlFor="admin-hub-clients-sign-in-page-reason">Reason</Label>
            <Input
              id="admin-hub-clients-sign-in-page-reason"
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
              form="admin-hub-clients-sign-in-page-form"
              disabled={pending || reason.trim() === "" || target.ownerId === null}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving...
                </>
              ) : target.exempt ? (
                "Show the page"
              ) : (
                "Skip the page"
              )}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      )}
    </Dialog>
  );
}

/**
The "every app" switch of the hub's sign-in page, and the apps that skip it, each with a Remove.
Every change needs the reason above.
*/
function SignInPageSection({
  overview,
  changeSignInPage,
  onChanged,
}: {
  overview: Overview;
  changeSignInPage: ChangeSignInPage;
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { everyApp, apps } = overview.signInPage;

  const submit = async (
    key: string,
    target: { scope: "every_app" } | { scope: "app"; appId: string; expectedOwnerId: string },
    skip: boolean,
  ) => {
    if (pending !== null || reason.trim() === "") {
      return;
    }
    setPending(key);
    setMessage(null);
    try {
      const answer = await changeSignInPage({ target, skip, reason });
      setMessage(answer.status === "on" ? signInPageRefusal(answer.result) : null);
      setReason("");
      await onChanged();
    } catch {
      setMessage("The hub refused the change.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-4 grid max-w-xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="admin-hub-clients-sign-in-page-change-reason">Reason</Label>
        <Input
          id="admin-hub-clients-sign-in-page-change-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <p className="text-sm">
        {everyApp === null
          ? "The switch for every app is off. The hub skips its sign-in page only for the apps below and where its own rules say so, such as samebase.com's production."
          : `The hub skips its sign-in page for every app: ${everyApp.reason}`}
      </p>
      <div>
        <Button
          type="button"
          variant={everyApp === null ? "destructive" : "outline"}
          disabled={pending !== null || reason.trim() === ""}
          onClick={() => void submit("every_app", { scope: "every_app" }, everyApp === null)}
        >
          {pending === "every_app" ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : everyApp === null ? (
            "Skip the sign-in page for every app"
          ) : (
            "Show the sign-in page for every app"
          )}
        </Button>
      </div>
      {message === null ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <h2 className="mt-6 text-base font-semibold">Apps that skip the sign-in page</h2>
      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No app.</p>
      ) : (
        <ul className="divide-y border-y">
          {apps.map((app) => (
            <li key={app.appId} className="flex items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1">
                {app.repository === null ? app.appId : `${app.repository} ${app.app ?? ""}`}
                {app.production === null
                  ? null
                  : app.production
                    ? ", production"
                    : ", previews and development"}
                : {app.reason}
                <span className="block text-muted-foreground">
                  Bound to the owner with GitHub id {app.ownerId}.
                  {app.active ? null : " Not active: the repository has another owner now."}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending !== null || reason.trim() === ""}
                onClick={() =>
                  void submit(
                    app.appId,
                    { scope: "app", appId: app.appId, expectedOwnerId: app.ownerId },
                    false,
                  )
                }
              >
                {pending === app.appId ? <Loader2 className="animate-spin" /> : null}
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
