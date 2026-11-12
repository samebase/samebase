import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { StateStoreRead, StoreStack } from "../../../shared/stateStoreStacks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ViewerOrganization } from "@/organization/context";
import { ORGANIZATION_PROVIDERS_ROUTE } from "@/organization/organizationRoutes";

type Provider = "Cloudflare" | "Convex";

/** Why a store shows no stacks, with the Providers page as the place to fix a connection. */
function StoreMessage({
  owner,
  provider,
  read,
}: {
  owner: string;
  provider: Provider;
  read: Exclude<StateStoreRead, { state: "found" }>;
}) {
  const providers = (
    <Link className="underline" params={{ owner }} to={ORGANIZATION_PROVIDERS_ROUTE}>
      Providers
    </Link>
  );
  let message: ReactNode;
  switch (read.state) {
    case "not_connected":
      message = (
        <>
          Connect {provider} on {providers} to list the stacks of its state store.
        </>
      );
      break;
    case "reconnect":
      message = (
        <>
          This {provider} connection cannot read the state store. An owner can connect {provider}{" "}
          again on {providers} and allow Secrets Store Read and Edit.
        </>
      );
      break;
    case "unsupported_connection":
      message = (
        <>
          This {provider} connection goes through Cloudflare&apos;s MCP server, which cannot read
          the state store. An owner can connect {provider} with OAuth on {providers}.
        </>
      );
      break;
    case "no_store":
      message =
        provider === "Cloudflare"
          ? "This account has no state store. Samebase looks for the Worker alchemy-state-store on workers.dev, which Cloudflare.state() deploys."
          : "This team has no state store. Samebase looks for the project alchemy-state-store, which Convex.state() deploys.";
      break;
    case "unsupported_version":
      message = `The state store is at version ${read.version}. Samebase reads versions 7 and 8.`;
      break;
    case "failed":
      message = "Samebase could not read the state store. Reload the page to try again.";
      break;
    default:
      read satisfies never;
  }
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function Stack({ stack }: { stack: StoreStack }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">{stack.name}</h3>
      {stack.read === "failed" ? (
        <p className="text-sm text-destructive">Samebase could not read this stack.</p>
      ) : stack.stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stage holds a resource.</p>
      ) : (
        stack.stages.map((stage) => (
          <div key={stage.name} className="flex flex-col gap-1">
            <p className="text-sm">
              <span className="font-mono">{stage.name}</span>
              {stage.run ? (
                <>
                  {" deployed "}
                  <a
                    className="underline"
                    href={`https://github.com/${stage.run.repository}/commit/${stage.run.headCommit}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {stage.run.repository}@{stage.run.headCommit.slice(0, 7)}
                  </a>
                  {stage.run.runUrl ? (
                    <>
                      {" in "}
                      <a
                        className="underline"
                        href={stage.run.runUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        this run
                      </a>
                    </>
                  ) : null}
                </>
              ) : null}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stage.resources.map((resource) => (
                  <TableRow key={resource.fqn}>
                    <TableCell className="font-mono">{resource.fqn}</TableCell>
                    <TableCell>{resource.resourceType ?? "Unknown"}</TableCell>
                    <TableCell>{resource.status ?? "Unknown"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </section>
  );
}

function Store({
  name,
  owner,
  provider,
  read,
}: {
  name: string | null;
  owner: string;
  provider: Provider;
  read: StateStoreRead;
}) {
  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {provider}
        {name === null ? null : <span className="font-normal text-muted-foreground"> {name}</span>}
      </h2>
      {read.state !== "found" ? (
        <StoreMessage owner={owner} provider={provider} read={read} />
      ) : read.stacks.length === 0 ? (
        <p className="text-sm text-muted-foreground">The state store holds no stack.</p>
      ) : (
        read.stacks.map((stack) => <Stack key={stack.name} stack={stack} />)
      )}
    </section>
  );
}

/**
Every stack of the Alchemy state stores of an organization: the store of its Cloudflare account and
the store of its Convex team. A read takes some seconds, so it runs when the page opens and not on
window focus; the last read shows while the next one runs.
*/
export function OrganizationStacksPage({ organization }: { organization: ViewerOrganization }) {
  const readStacks = useAction(api.stacks.organization.read);
  const stacks = useQuery({
    queryKey: ["organization-stacks", organization.organizationId],
    queryFn: async () => await readStacks({ organizationId: organization.organizationId }),
    refetchOnMount: "always",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const owner = organization.githubOwnerLogin;

  return (
    <main
      data-testid="organization-stacks-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6 @max-3xl:px-3"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Stacks</h1>
      {stacks.isError ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          Samebase could not read the state stores.
        </p>
      ) : stacks.data === undefined ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Reading the state stores. This takes some seconds.
        </p>
      ) : (
        <>
          <Store
            name={stacks.data.cloudflare.account}
            owner={owner}
            provider="Cloudflare"
            read={stacks.data.cloudflare.read}
          />
          <Store
            name={stacks.data.convex.team}
            owner={owner}
            provider="Convex"
            read={stacks.data.convex.read}
          />
        </>
      )}
    </main>
  );
}
