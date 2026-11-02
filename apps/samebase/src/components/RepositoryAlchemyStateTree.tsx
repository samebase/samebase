import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  ALCHEMY_REDACTED_MARKER,
  groupResourcesByComponent,
  stageResources,
} from "../../shared/alchemyState";
import type { AlchemyStage, AlchemyStateObservation } from "../../shared/alchemyStateModel";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";

type AlchemyRunRecord = AlchemyStage["record"];

const { object, string } = v;

/** `resourceType` names the provider of the resource, such as `Convex.Deployment`. */
const vResourceState = object({ status: string(), resourceType: string() });

const RUN_SOURCE_LABELS = {
  "github-actions": "GitHub Actions",
  laptop: "Laptop",
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
  const stageOutput: unknown = JSON.parse(stage.output);
  const output = stageOutput === null ? [] : outputEntries(stageOutput, "");
  const states = stage.resources.map((resource) => {
    const state: unknown = JSON.parse(resource.value);
    return { fqn: resource.fqn, state };
  });
  const { convexDeployments, workers } = stageResources({
    stackFile: stage.record.stackFile,
    resources: stage.resources,
  });
  const { others, components } = groupResourcesByComponent(states);

  return (
    <dl className="ml-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 pt-1 pb-3 text-xs">
      <AlchemyRunRecordRows record={stage.record} />

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

export function AlchemyStateTree({ observation }: { observation: AlchemyStateObservation }) {
  if (observation.store === "missing") {
    return (
      <RepositoryAlchemyStateStatus>
        No Alchemy state store in this team yet.
      </RepositoryAlchemyStateStatus>
    );
  }

  if (observation.store === "no_connection") {
    return (
      <RepositoryAlchemyStateStatus>
        This repository has no Convex connection.
      </RepositoryAlchemyStateStatus>
    );
  }

  if (observation.stacks.length === 0) {
    return <RepositoryAlchemyStateStatus>No Alchemy state.</RepositoryAlchemyStateStatus>;
  }

  return (
    <div className="p-3 text-sm">
      {observation.stacks.map((stack) => (
        <div key={stack.name}>
          <div className="truncate py-1 font-mono font-medium">{stack.name}</div>
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
