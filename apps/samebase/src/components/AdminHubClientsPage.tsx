import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Ban, Eye, EyeOff, Loader2, Plug } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import {
  formatTime,
  type HubClient,
  moderationIdOf,
  ownerOf,
} from "@/components/hubClients/hubClient";
import { HubClientsTable } from "@/components/hubClients/HubClientsTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
The app of a client, for the hub's sign-in page: the repository and the exact name, with its
production, preview, and development clients (`moderationIdOf`), whether a row of it exists now,
and the owner to send: the row's to remove it, else the repository owner that the hub recorded,
which a new row binds to.
*/
type SignInPageTarget = {
  appId: string;
  ownerId: string | null;
  /** The owner that registered this client, which can be an earlier owner than `ownerId`. */
  registeredByOwnerId: string;
  name: string;
  exempt: boolean;
  now: HubClient["signInPage"];
};

const signInPageTarget = (client: HubClient, overview: Overview): SignInPageTarget => {
  const appId = moderationIdOf(client);
  const row = overview.signInPage.apps.find((app) => app.appId === appId);
  return {
    appId,
    ownerId: row === undefined ? client.ownerId : row.ownerId,
    registeredByOwnerId: client.registeredBy.githubOwnerId,
    name: `${client.registeredBy.githubRepository} ${client.registeredBy.app}`,
    exempt: row !== undefined,
    now: client.signInPage,
  };
};

const SIGN_IN_PAGE_NOW = {
  shown: "The hub shows its sign-in page to this app's users.",
  every_app: "The hub skips its sign-in page for every app.",
  this_app: "The hub skips its sign-in page for this app.",
} as const;

/**
The app of a client, for its connector grants: the repository and the exact name, with its
production, preview, and development clients (`moderationIdOf`), the repository owner that the hub
recorded, which a new grant binds to, and the connectors that the hub's policy already gives this
client.
*/
type ConnectorsTarget = {
  appId: string;
  ownerId: string;
  name: string;
  policyConnectors: string[];
};

const connectorsTarget = (client: HubClient): ConnectorsTarget | null =>
  client.ownerId === null || client.policyConnectors === null
    ? null
    : {
        appId: moderationIdOf(client),
        ownerId: client.ownerId,
        name: `${client.registeredBy.githubRepository} ${client.registeredBy.app}`,
        policyConnectors: client.policyConnectors,
      };

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
  const changeConnectorGrant = useAction(api.hubClients.moderation.changeConnectorGrant);
  const overview = useQuery({
    queryKey: ["admin-hub-clients-overview"],
    queryFn: async () => await readOverview({}),
    retry: false,
  });
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [signInPageTarget, setSignInPageTarget] = useState<SignInPageTarget | null>(null);
  const [connectorsTargetOpen, setConnectorsTarget] = useState<ConnectorsTarget | null>(null);
  // Outside the overview: a reload that fails after a save must not take the save's report away.
  const [connectorsOutcome, setConnectorsOutcome] = useState<string | null>(null);
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
      {connectorsOutcome === null ? null : (
        <p className="mt-2 text-sm" role="status">
          {connectorsOutcome}
        </p>
      )}
      {overview.isError ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          Could not reach the identity hub.
        </p>
      ) : overview.data === undefined ? null : overview.data.status === "off" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Moderation is off: IDENTITY_HUB_MODERATION_KEY is not set on this deployment.
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
              <TabsTrigger value="connector-grants">
                Connector grants {overview.data.connectorGrants.grants.length}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="clients">
              <AdminClientsTable
                overview={overview.data}
                now={overview.dataUpdatedAt}
                onBlock={setBlockTarget}
                onSignInPage={setSignInPageTarget}
                onConnectors={setConnectorsTarget}
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
            <TabsContent value="connector-grants">
              <ConnectorGrantsSection
                overview={overview.data}
                changeConnectorGrant={changeConnectorGrant}
                onChanged={refetch}
              />
            </TabsContent>
          </Tabs>
          <ConnectorsDialog
            target={connectorsTargetOpen}
            overview={overview.data}
            changeConnectorGrant={changeConnectorGrant}
            onOutcome={setConnectorsOutcome}
            onClose={() => setConnectorsTarget(null)}
            onChanged={refetch}
          />
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
  onConnectors,
}: {
  overview: Overview;
  now: number;
  onBlock: (target: BlockTarget) => void;
  onSignInPage: (target: SignInPageTarget) => void;
  onConnectors: (target: ConnectorsTarget) => void;
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
          {overview.signInPage.apps.some((app) => app.appId === moderationIdOf(client)) ? (
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
            disabled={connectorsTarget(client) === null}
            onSelect={() => {
              const target = connectorsTarget(client);
              if (target !== null) {
                onConnectors(target);
              }
            }}
          >
            <Plug />
            Connectors…
          </DropdownMenuItem>
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
        result.status === "off"
          ? MODERATION_OFF
          : result.changed
            ? null
            : action === "block"
              ? "Already blocked."
              : "Not blocked.",
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
/** Moderation went off while the page was open: the hub changed nothing. */
const MODERATION_OFF = "Moderation is off: the hub changed nothing.";

/** The answer of a change: moderation off, or the hub's result. */
type ChangeAnswer = { status: "off" } | { status: "on"; result: string };

const signInPageRefusal = (answer: ChangeAnswer) =>
  answer.status === "off"
    ? MODERATION_OFF
    : answer.result === "owner_changed"
      ? "The repository has another owner now. Reload the page and try again."
      : answer.result === "unknown_app"
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
      const refusal = signInPageRefusal(answer);
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
                ? "This removes the app's own exemption. From the next sign-in the hub shows its page, unless the switch for every app skips it. Sign-ins that already started finish as they started."
                : `The users of this app's production, previews, and development servers go straight to Google or GitHub, with no page that names the app. The exemption trusts the repository's owner that the hub recorded, GitHub id ${target.ownerId ?? "none"}, the repository's pull request runs, and the holders of the app's development token, and stops when the repository has another owner.`}
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
      setMessage(signInPageRefusal(answer));
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
          ? "The switch for every app is off. The hub skips its sign-in page only for the apps below."
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
                {app.repository === null ? app.appId : `${app.repository} ${app.app ?? ""}`}:{" "}
                {app.reason}
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

type ChangeConnectorGrant = ReturnType<
  typeof useAction<typeof api.hubClients.moderation.changeConnectorGrant>
>;

/** What the hub answered to a grant that it did not change, for the admin. */
const connectorGrantRefusal = (answer: ChangeAnswer) =>
  answer.status === "on" && answer.result === "unknown_connector"
    ? "The hub does not have this connector."
    : signInPageRefusal(answer);

/**
The private connectors of one app: a checkbox for each connector of the hub that its policy does not
already give the app, checked when the app has a grant bound to the recorded owner. Save writes one
grant or revoke for each changed box, with the reason.
*/
function ConnectorsDialog({
  target,
  overview,
  changeConnectorGrant,
  onOutcome,
  onClose,
  onChanged,
}: {
  target: ConnectorsTarget | null;
  overview: Overview;
  changeConnectorGrant: ChangeConnectorGrant;
  onOutcome: (outcome: string) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  // A save in progress keeps the dialog open: it closes the dialog when it ends, and must not close
  // the dialog of another app that the admin opened meanwhile.
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open || pending ? null : onClose())}>
      {target === null ? null : (
        <ConnectorsForm
          key={target.appId}
          target={target}
          overview={overview}
          changeConnectorGrant={changeConnectorGrant}
          pending={pending}
          setPending={setPending}
          onOutcome={onOutcome}
          onClose={onClose}
          onChanged={onChanged}
        />
      )}
    </Dialog>
  );
}

function ConnectorsForm({
  target,
  overview,
  changeConnectorGrant,
  pending,
  setPending,
  onOutcome,
  onClose,
  onChanged,
}: {
  target: ConnectorsTarget;
  overview: Overview;
  changeConnectorGrant: ChangeConnectorGrant;
  /** Whether a save is in progress, owned by the dialog, which stays open meanwhile. */
  pending: boolean;
  setPending: (pending: boolean) => void;
  /** The report of a save, which the page shows outside the overview it reloads. */
  onOutcome: (outcome: string) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const rows = overview.connectorGrants.grants.filter((grant) => grant.appId === target.appId);
  const choices = overview.connectorGrants.connectors.filter(
    (name) => !target.policyConnectors.includes(name),
  );
  const saved = choices.filter((name) =>
    rows.some((row) => row.connector === name && row.ownerId === target.ownerId),
  );
  const [checked, setChecked] = useState<string[]>(saved);
  const [reason, setReason] = useState("");
  const changes = choices.filter((name) => checked.includes(name) !== saved.includes(name));

  /**
  One write per changed connector. Each one is saved or refused on its own, so the page reports which
  were saved and which were refused, closes the dialog, and reloads after every attempt. The report
  is the page's, so a reload that fails leaves it in place.
  */
  const save = async () => {
    setPending(true);
    const saved: string[] = [];
    const refused: string[] = [];
    for (const connector of changes) {
      const grant = checked.includes(connector);
      const row = rows.find((candidate) => candidate.connector === connector);
      try {
        const answer = await changeConnectorGrant({
          appId: target.appId,
          connector,
          // A grant binds to the recorded owner; a revoke names the owner of the row it removes.
          expectedOwnerId: grant || row === undefined ? target.ownerId : row.ownerId,
          grant,
          reason,
        });
        const refusal = connectorGrantRefusal(answer);
        if (refusal === null) {
          saved.push(connector);
        } else {
          refused.push(`${connector}: ${refusal}`);
        }
      } catch {
        refused.push(`${connector}: The hub refused the change.`);
      }
    }
    onOutcome(
      [
        saved.length === 0 ? null : `Saved: ${saved.join(", ")}.`,
        refused.length === 0 ? null : `Refused: ${refused.join(" ")}`,
      ]
        .filter((part) => part !== null)
        .join(" "),
    );
    setPending(false);
    onClose();
    await onChanged();
  };

  return (
    <AppDialogContent>
      <DialogHeader>
        <DialogTitle>Connectors of {target.name}</DialogTitle>
        <DialogDescription>
          The hub's policy gives this client {target.policyConnectors.join(", ")}. A grant adds a
          private connector for every client of this app: production, previews, and development
          servers. It trusts the repository's owner that the hub recorded, GitHub id{" "}
          {target.ownerId}, the repository's pull request runs, and the holders of the app's
          development token, and stops when the repository has another owner. A client uses a
          granted connector once it enrolls in it, at its next deploy.
        </DialogDescription>
      </DialogHeader>
      <form
        id="admin-hub-clients-connectors-form"
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && changes.length > 0 && reason.trim() !== "") {
            void save();
          }
        }}
      >
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The hub's policy already gives this app every connector.
          </p>
        ) : (
          choices.map((name) => (
            <Label key={name} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={checked.includes(name)}
                disabled={pending}
                onCheckedChange={(value) =>
                  setChecked((current) =>
                    value ? [...current, name] : current.filter((other) => other !== name),
                  )
                }
              />
              {name}
            </Label>
          ))
        )}
        <Label htmlFor="admin-hub-clients-connectors-reason">Reason</Label>
        <Input
          id="admin-hub-clients-connectors-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </form>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="admin-hub-clients-connectors-form"
          disabled={pending || changes.length === 0 || reason.trim() === ""}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </DialogFooter>
    </AppDialogContent>
  );
}

/** Every connector grant, each with a Remove. A removal needs the reason above. */
function ConnectorGrantsSection({
  overview,
  changeConnectorGrant,
  onChanged,
}: {
  overview: Overview;
  changeConnectorGrant: ChangeConnectorGrant;
  onChanged: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { grants } = overview.connectorGrants;

  const revoke = async (grant: (typeof grants)[number]) => {
    const key = `${grant.appId}:${grant.connector}`;
    if (pending !== null || reason.trim() === "") {
      return;
    }
    setPending(key);
    setMessage(null);
    try {
      const answer = await changeConnectorGrant({
        appId: grant.appId,
        connector: grant.connector,
        expectedOwnerId: grant.ownerId,
        grant: false,
        reason,
      });
      setMessage(connectorGrantRefusal(answer));
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
      <p className="text-sm text-muted-foreground">
        Grant a private connector to an app with Connectors… in its client's menu.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="admin-hub-clients-connector-grants-reason">Reason</Label>
        <Input
          id="admin-hub-clients-connector-grants-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {message === null ? null : (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No grant.</p>
      ) : (
        <ul className="divide-y border-y">
          {grants.map((grant) => {
            const key = `${grant.appId}:${grant.connector}`;
            return (
              <li key={key} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  {grant.connector} for{" "}
                  {grant.repository === null
                    ? grant.appId
                    : `${grant.repository} ${grant.app ?? ""}`}
                  : {grant.reason}
                  <span className="block text-muted-foreground">
                    Bound to the owner with GitHub id {grant.ownerId}.
                    {grant.active
                      ? null
                      : " Not active: the hub has no such app now, or the repository has another owner."}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending !== null || reason.trim() === ""}
                  onClick={() => void revoke(grant)}
                >
                  {pending === key ? <Loader2 className="animate-spin" /> : null}
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
