import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formatTime = (time: number) => new Date(time).toLocaleString();

/** Moderation went off while the page was open: the broker changed nothing. */
const MODERATION_OFF = "Moderation is off: the broker changed nothing.";

/** The sites that sign in at login.samebase.com, and its host blocks. */
export function AdminBrokerClientsPage() {
  return (
    <main
      data-testid="admin-broker-clients-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6 @max-3xl:px-3"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">login.samebase.com</h1>
      <LoginBrokerModeration />
    </main>
  );
}

type LoginBroker = Extract<
  FunctionReturnType<typeof api.brokerClients.moderation.readLoginBroker>,
  { status: "on" }
>;

type ChangeLoginHostBlock = ReturnType<
  typeof useAction<typeof api.brokerClients.moderation.changeLoginHostBlock>
>;

function LoginBrokerModeration() {
  const readLoginBroker = useAction(api.brokerClients.moderation.readLoginBroker);
  const changeLoginHostBlock = useAction(api.brokerClients.moderation.changeLoginHostBlock);
  const readLoginSiteFiles = useAction(api.brokerClients.moderation.readLoginSiteFiles);
  const loginBroker = useQuery({
    queryKey: ["admin-broker-clients-login-broker"],
    queryFn: async () => await readLoginBroker({}),
    retry: false,
  });
  const siteFiles = useQuery({
    queryKey: ["admin-broker-clients-login-site-files"],
    queryFn: async () => await readLoginSiteFiles({}),
    enabled: loginBroker.data?.status === "on",
    retry: false,
  });
  const files = new Map(
    siteFiles.data?.status === "on"
      ? siteFiles.data.files.map(({ clientId, file }) => [clientId, file])
      : [],
  );
  const refetch = async () => {
    await loginBroker.refetch();
  };

  return loginBroker.isError ? (
    <p className="mt-3 text-sm text-destructive" role="alert">
      Could not reach login.samebase.com.
    </p>
  ) : loginBroker.data === undefined ? null : loginBroker.data.status === "off" ? (
    <p className="mt-3 text-sm text-muted-foreground">
      Moderation is off: LOGIN_BROKER_MODERATION_KEY not set on this deployment.
    </p>
  ) : (
    <Tabs defaultValue="sites" className="mt-3">
      <TabsList variant="line">
        <TabsTrigger value="sites">Sites {loginBroker.data.siteList.clients.length}</TabsTrigger>
        <TabsTrigger value="host-blocks">
          Host blocks {loginBroker.data.hostBlockList.blocks.length}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sites">
        <SitesSection siteList={loginBroker.data.siteList} files={files} />
      </TabsContent>
      <TabsContent value="host-blocks">
        <HostBlocksSection
          hostBlockList={loginBroker.data.hostBlockList}
          changeLoginHostBlock={changeLoginHostBlock}
          onChanged={refetch}
        />
      </TabsContent>
    </Tabs>
  );
}

type SiteFileState = Extract<
  FunctionReturnType<typeof api.brokerClients.moderation.readLoginSiteFiles>,
  { status: "on" }
>["files"][number]["file"];

/** The sites, with the files read so far; a site whose file is gone is folded away. */
function SitesSection({
  siteList,
  files,
}: {
  siteList: LoginBroker["siteList"];
  files: ReadonlyMap<string, SiteFileState>;
}) {
  const gone = siteList.clients.filter((site) => files.get(site.clientId)?.status === "gone");
  const live = siteList.clients.filter((site) => files.get(site.clientId)?.status !== "gone");
  return siteList.clients.length === 0 ? (
    <p className="mt-4 text-sm text-muted-foreground">No sites.</p>
  ) : (
    <>
      <SiteRows sites={live} files={files} />
      {gone.length === 0 ? null : (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Gone ({gone.length})</summary>
          <SiteRows sites={gone} files={files} />
        </details>
      )}
      {siteList.limitReached ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The newest {siteList.clients.length} sites.
        </p>
      ) : null}
    </>
  );
}

function SiteRows({
  sites,
  files,
}: {
  sites: LoginBroker["siteList"]["clients"];
  files: ReadonlyMap<string, SiteFileState>;
}) {
  return sites.length === 0 ? null : (
    <ul className="mt-4 divide-y border-y">
      {sites.map((site) => (
        <li key={site.clientId} className="py-3 text-sm">
          <a
            className="block break-all"
            href={site.clientId}
            rel="noopener noreferrer"
            target="_blank"
          >
            {site.clientId}
          </a>
          <span className="block text-muted-foreground">
            {site.host}, first use {formatTime(site.createdAt)},{" "}
            {site.lastSignInAt === null
              ? "no sign-in"
              : `last sign-in ${formatTime(site.lastSignInAt)}`}
          </span>
          <SiteFile file={files.get(site.clientId)} />
        </li>
      ))}
    </ul>
  );
}

/** What the site's file says now, as text: a stranger wrote it, so no address of it is loaded. */
function SiteFile({ file }: { file: SiteFileState | undefined }) {
  if (file === undefined) {
    return null;
  }
  if (file.status === "gone") {
    return <span className="block text-muted-foreground">File gone</span>;
  }
  return (
    <>
      {file.status === "refused" ? (
        <span className="block text-destructive">File refused: {file.reason}</span>
      ) : (
        <span className="block break-all text-muted-foreground">
          {file.clientName === null ? null : `Named "${file.clientName}"; `}
          returns to {file.redirectUris.join(", ")}
          {file.clientUri === null ? null : `; site ${file.clientUri}`}
          {file.logoUri === null ? null : `; logo ${file.logoUri}`}
        </span>
      )}
      {file.json === null ? null : (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">Show file</summary>
          <pre className="mt-1 overflow-x-auto bg-muted p-3 font-mono text-xs">{file.json}</pre>
        </details>
      )}
    </>
  );
}

/** A form that blocks a host, and the blocked hosts, each with an Unblock. */
function HostBlocksSection({
  hostBlockList,
  changeLoginHostBlock,
  onChanged,
}: {
  hostBlockList: LoginBroker["hostBlockList"];
  changeLoginHostBlock: ChangeLoginHostBlock;
  onChanged: () => Promise<void>;
}) {
  const [host, setHost] = useState("");
  // The host whose block or unblock runs: the form's, or a row's.
  const [pending, setPending] = useState<{ action: "block" | "unblock"; host: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (action: "block" | "unblock", target: string) => {
    if (pending !== null) {
      return;
    }
    setPending({ action, host: target });
    setMessage(null);
    try {
      const result = await changeLoginHostBlock({ action, host: target });
      setMessage(
        result.status === "off"
          ? MODERATION_OFF
          : result.changed
            ? null
            : action === "block"
              ? "Already blocked."
              : "Not blocked.",
      );
      if (action === "block") {
        setHost("");
      }
      await onChanged();
    } catch {
      setMessage("The broker refused the change. Check the host.");
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
          void submit("block", host);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="admin-broker-clients-login-host">Host</Label>
          <Input
            id="admin-broker-clients-login-host"
            required
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
        </div>
        <div>
          <Button type="submit" variant="destructive" disabled={pending !== null}>
            {pending?.action === "block" ? (
              <>
                <Loader2 className="animate-spin" />
                Blocking...
              </>
            ) : (
              "Block"
            )}
          </Button>
        </div>
        {message === null ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </form>
      {hostBlockList.blocks.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No blocks.</p>
      ) : (
        <ul className="mt-6 divide-y border-y">
          {hostBlockList.blocks.map((block) => (
            <li key={block.host} className="flex items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1 break-all">
                {block.host}{" "}
                <span className="text-muted-foreground">{formatTime(block.createdAt)}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() => void submit("unblock", block.host)}
              >
                {pending?.action === "unblock" && pending.host === block.host ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Unblocking...
                  </>
                ) : (
                  "Unblock"
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hostBlockList.limitReached ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The newest {hostBlockList.blocks.length} blocks.
        </p>
      ) : null}
    </>
  );
}
