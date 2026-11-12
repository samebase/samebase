import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  ALCHEMY_REDACTED_MARKER,
  groupResourcesByComponent,
  stageResources,
} from "../../shared/alchemyState";
import type {
  AlchemyStack,
  AlchemyStage,
  AlchemyStateObservation,
} from "../../shared/alchemyStateModel";
import { Link } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";
import { ORGANIZATION_PROVIDERS_ROUTE } from "@/organization/organizationRoutes";
import type { RepositoryAlchemyState } from "@/repository/dashboard/useRepositoryAlchemyState";

type AlchemyRunRecord = AlchemyStage["run"];

const { object, string } = v;

/** `resourceType` names the provider of the resource, such as `Convex.Deployment`. */
const vResourceState = object({ status: string(), resourceType: string() });

const RUN_SOURCE_LABELS = {
  "github-actions": "GitHub Actions",
  checkout: "Git checkout",
} satisfies Record<AlchemyRunRecord["source"], string>;

/**
One entry for each value of the stage output, named by its dotted path. A secret keeps only its
path, with `value: null`.
*/
function outputEntries(output: unknown, path: string): { path: string; value: string | null }[] {
  if (typeof output !== "object" || output === null) {
    return [{ path, value: typeof output === "string" ? output : JSON.stringify(output) }];
  }
  if (ALCHEMY_REDACTED_MARKER in output) {
    return [{ path, value: null }];
  }
  return Object.entries(output).flatMap(([key, child]) =>
    outputEntries(child, path ? `${path}.${key}` : key),
  );
}

/** The line that a page with no stack shows when the Cloudflare store gave no stacks. */
export function CloudflareStateProblem({
  problem,
  owner,
}: {
  problem: NonNullable<Extract<RepositoryAlchemyState, { state: "loaded" }>["cloudflareProblem"]>;
  /** The GitHub owner of the organization, for its Providers page. */
  owner: string;
}) {
  return problem === "reconnect" ? (
    <span>
      An app with its Alchemy state in Cloudflare needs an owner to connect Cloudflare again on{" "}
      <Link className="underline" params={{ owner }} to={ORGANIZATION_PROVIDERS_ROUTE}>
        Providers
      </Link>{" "}
      and allow Secrets Store Read and Edit.
    </span>
  ) : (
    <span>Could not read the Alchemy state store in Cloudflare.</span>
  );
}

const STATE_STORES = {
  convex: {
    name: "Convex",
    icon: <ConvexProviderLogo />,
    detail:
      "This stack keeps its Alchemy state in the alchemy-state-store project of the Convex team (Convex.state()). The page updates live.",
  },
  cloudflare: {
    name: "Cloudflare",
    icon: <CloudflareProviderLogo />,
    detail:
      "This stack keeps its Alchemy state in the alchemy-state-store Worker of the Cloudflare account (Cloudflare.state()). Samebase reads it when the page opens.",
  },
} satisfies Record<AlchemyStack["store"], { name: string; icon: ReactNode; detail: string }>;

/**
The Alchemy state store that holds a stack: the provider's icon, which says more on hover and on
tap, since a phone has no hover.
*/
export function StackStateStore({ store }: { store: AlchemyStack["store"] }) {
  const { name, icon, detail } = STATE_STORES[store];
  return (
    <Popover>
      <PopoverTrigger asChild nativeButton openOnHover>
        <button
          type="button"
          aria-label={`Alchemy state in ${name}`}
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center opacity-70 transition-opacity hover:opacity-100 @4xl:size-8"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1rem)] gap-1 p-3">
        <PopoverTitle>Alchemy state in {name}</PopoverTitle>
        <PopoverDescription>{detail}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}

export function RepositoryAlchemyStateStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AlchemyStateDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="grid min-w-0 gap-0.5">{children}</dd>
    </>
  );
}

function AlchemyStateDetailItem({ detail, name }: { detail: ReactNode; name: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="min-w-0 break-all font-mono">{name}</span>
      {detail === null ? null : (
        <span className="min-w-0 break-all text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function AlchemyResourceItem({ fqn, state }: { fqn: string; state: unknown }) {
  const resource = validate(vResourceState, state, { allowUnknownFields: true }) ? state : null;
  const presentation = resourceTypePresentation(resource?.resourceType ?? "unknown");

  return (
    <AlchemyStateDetailItem
      name={
        <span className="inline-flex max-w-full items-center gap-1.5">
          <span className="shrink-0">{presentation.icon}</span>
          <span className="min-w-0 break-all">{fqn}</span>
        </span>
      }
      detail={resource ? `${resource.status}, ${presentation.label}` : "unknown"}
    />
  );
}

function AlchemyRunRecordRows({ record }: { record: AlchemyRunRecord }) {
  const recordedAt = Date.parse(record.recordedAt);
  const source = RUN_SOURCE_LABELS[record.source];

  return (
    <>
      {record.pullRequest === null ? null : (
        <AlchemyStateDetailRow label="Pull request">
          <AlchemyStateDetailItem
            name={
              <a
                href={`https://github.com/${record.repository}/pull/${record.pullRequest}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {`#${record.pullRequest}`}
              </a>
            }
            detail={null}
          />
        </AlchemyStateDetailRow>
      )}
      <AlchemyStateDetailRow label="Branch">
        <AlchemyStateDetailItem name={record.branch} detail={null} />
      </AlchemyStateDetailRow>
      <AlchemyStateDetailRow label="Commit">
        <AlchemyStateDetailItem
          name={
            <a
              href={`https://github.com/${record.repository}/commit/${record.headCommit}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              {record.headCommit.slice(0, 7)}
            </a>
          }
          detail={null}
        />
      </AlchemyStateDetailRow>
      <AlchemyStateDetailRow label="Run">
        <AlchemyStateDetailItem
          name={
            record.runUrl === null ? (
              source
            ) : (
              <a href={record.runUrl} rel="noreferrer noopener" target="_blank">
                {source}
              </a>
            )
          }
          detail={
            <time dateTime={record.recordedAt} title={record.recordedAt}>
              {Number.isFinite(recordedAt) ? formatRelativeTimeAgo(recordedAt) : record.recordedAt}
            </time>
          }
        />
      </AlchemyStateDetailRow>
    </>
  );
}

function AlchemyStageDetails({ stage }: { stage: AlchemyStage }) {
  // The output of a stage of the repository is a JSON object, so an empty one has no entry.
  const stageOutput: unknown = JSON.parse(stage.output);
  const output = outputEntries(stageOutput, "");
  const states = stage.resources.map((resource) => {
    const state: unknown = JSON.parse(resource.value);
    return { fqn: resource.fqn, state };
  });
  const { convexDeployments, workers } = stageResources({
    stackFile: stage.run.stackFile,
    resources: stage.resources,
  });
  const { others, components } = groupResourcesByComponent(states);

  return (
    <dl className="ml-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 pt-1 pb-3 text-xs">
      <AlchemyRunRecordRows record={stage.run} />

      {convexDeployments.length === 0 ? null : (
        <AlchemyStateDetailRow label="Convex">
          {convexDeployments.map(({ codeLocation, fqn, state }) => (
            <AlchemyStateDetailItem
              key={fqn}
              name={
                <a href={state.attr.url} rel="noreferrer noopener" target="_blank">
                  {state.attr.name}
                </a>
              }
              detail={codeLocation}
            />
          ))}
        </AlchemyStateDetailRow>
      )}
      {workers.length === 0 ? null : (
        <AlchemyStateDetailRow label="Workers">
          {workers.map(({ fqn, state }) => (
            <AlchemyStateDetailItem
              key={fqn}
              name={
                state.attr.url === undefined ? (
                  state.attr.workerName
                ) : (
                  <a href={state.attr.url} rel="noreferrer noopener" target="_blank">
                    {state.attr.workerName}
                  </a>
                )
              }
              detail={null}
            />
          ))}
        </AlchemyStateDetailRow>
      )}
      {states.length === 0 ? null : (
        <AlchemyStateDetailRow label="Resources">
          {others.map(({ fqn, state }) => (
            <AlchemyResourceItem key={fqn} fqn={fqn} state={state} />
          ))}
          {components.map((component) => (
            <Fragment key={`${component.deployment.fqn}:${component.path}`}>
              <AlchemyStateDetailItem name={component.path} detail={null} />
              <div className="ml-2.5 grid gap-0.5 border-l border-border pl-3">
                {component.resources.map(({ fqn, state }) => (
                  <AlchemyResourceItem key={fqn} fqn={fqn} state={state} />
                ))}
              </div>
            </Fragment>
          ))}
        </AlchemyStateDetailRow>
      )}
      {output.length === 0 ? null : (
        <AlchemyStateDetailRow label="Output">
          {output.map((entry) => (
            <AlchemyStateDetailItem key={entry.path} name={entry.path} detail={entry.value} />
          ))}
        </AlchemyStateDetailRow>
      )}
    </dl>
  );
}

export function AlchemyStateTree({
  observation,
  cloudflareProblem,
}: {
  observation: AlchemyStateObservation;
  /** A `CloudflareStateProblem`, shown after the message of a page with no stack. */
  cloudflareProblem?: ReactNode;
}) {
  const status = (message: string) => (
    <RepositoryAlchemyStateStatus>
      {cloudflareProblem ? (
        <span>
          {message} {cloudflareProblem}
        </span>
      ) : (
        message
      )}
    </RepositoryAlchemyStateStatus>
  );

  if (observation.store === "missing") {
    return status("No Alchemy state store in this team yet.");
  }

  if (observation.store === "no_connection") {
    return status("This repository has no Convex connection.");
  }

  if (observation.stacks.length === 0) {
    return status("No Alchemy state.");
  }

  return (
    <div className="p-3 text-sm">
      {observation.stacks.map((stack) => (
        <div key={`${stack.store}:${stack.name}`}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate py-1 font-mono font-medium">{stack.name}</span>
            <StackStateStore store={stack.store} />
          </div>
          <ul className="ml-2.5 border-l border-border pl-3">
            {stack.stages.map((stage) => (
              <li key={stage.name}>
                <details className="group">
                  <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 py-1">
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground group-open:rotate-90" />
                    <span className="min-w-0 truncate font-mono">{stage.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {`${stage.resources.length} ${stage.resources.length === 1 ? "resource" : "resources"}`}
                    </span>
                  </summary>
                  <AlchemyStageDetails stage={stage} />
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
