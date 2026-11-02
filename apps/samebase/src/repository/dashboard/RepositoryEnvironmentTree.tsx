import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SamebaseLogoMark } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { RepositoryChecksPopover } from "@/repository/dashboard/RepositoryChecksPopover";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";
import type {
  RepositoryEnvironmentAction,
  RepositoryEnvironmentResource,
  RepositoryEnvironmentWorker,
  RepositoryStackCard,
} from "@/repository/dashboard/repositoryEnvironmentRoots";
import type {
  PullRequestResourceState,
  RepositoryPullRequestsState,
} from "@/repository/dashboard/useRepositoryPullRequests";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { buildRepositoryFileRoute } from "@/lib/repositoryRoutes";
import { Link } from "@tanstack/react-router";
import { convexDeploymentRegionDetails } from "../../../shared/convexDeploymentRegions";
import { ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

const STORE_READ_FAILED = "Could not read the team's Alchemy state store.";

export function RootDirectoryLabel({ rootDirectory }: { rootDirectory: string }) {
  return (
    <span className="block text-base font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
      {rootDirectory}
    </span>
  );
}

function EnvironmentActionsMenu({
  actions,
  label,
}: {
  actions: readonly RepositoryEnvironmentAction[];
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          aria-label={`Open ${label} actions`}
          className="size-10 @4xl:size-8"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-max min-w-40 max-w-[calc(100vw-2rem)] rounded-none shadow-none"
      >
        {actions.map((action) =>
          action.destination === "none" ? (
            <DropdownMenuItem key={`none:${action.label}`}>
              <span className="min-w-0 break-all">{action.label}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={`${action.destination}:${action.href}`} asChild>
              {action.destination === "samebase" ? (
                <Link className="min-w-0 no-underline" to={action.href}>
                  <SamebaseLogoMark />
                  <span className="min-w-0 break-all">{action.label}</span>
                </Link>
              ) : (
                <a
                  className="min-w-0 no-underline"
                  href={action.href}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span className="min-w-0 break-all">{action.label}</span>
                  <ExternalLink className="shrink-0" />
                </a>
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DestinationResource({
  resource,
}: {
  resource: Extract<RepositoryEnvironmentResource, { kind: "destination" }>;
}) {
  const presentation = resourceTypePresentation("Convex.Deployment");
  const region = resource.region ? convexDeploymentRegionDetails[resource.region] : undefined;

  return (
    <div
      aria-label={`Convex deployment ${resource.label}`}
      className="grid min-h-10 min-w-0 py-1.5"
      role="group"
    >
      <div className="flex min-w-0 items-center gap-1">
        <a
          className="inline-flex min-h-10 min-w-0 items-center gap-2.5 text-foreground no-underline hover:no-underline"
          href={resource.href}
          rel="noreferrer noopener"
          target="_blank"
          title={resource.title}
        >
          <span className="flex h-4 w-5 shrink-0 items-center justify-center">
            {presentation.icon}
          </span>
          <span className="min-w-0 text-sm font-medium leading-5 underline decoration-border underline-offset-4 [overflow-wrap:anywhere]">
            {resource.label}
          </span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
        </a>
        {region ? (
          <span className="text-xs" title={region.displayName}>
            <span aria-hidden="true">{region.icon}</span>
            <span className="sr-only">{region.displayName}</span>
          </span>
        ) : null}
        {resource.actions.length > 0 ? (
          <EnvironmentActionsMenu actions={resource.actions} label={resource.label} />
        ) : null}
      </div>
      {resource.components ? (
        <div className="ml-2.5 grid min-w-0 border-l border-border pl-3">
          {resource.components.map((component) => (
            <div
              key={component.path}
              aria-label={`Convex component ${component.path}`}
              className="min-w-0"
              role="group"
            >
              <div className="flex min-h-10 min-w-0 items-center gap-2.5 py-1.5">
                <span className="min-w-0 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
                  {component.path}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">Convex component</span>
              </div>
              <div className="ml-2.5 border-l border-border pl-3">
                {component.resources.map((child) => (
                  <RepositoryEnvironmentResourceRow
                    key={`${child.kind}:${child.id}`}
                    resource={child}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RepositoryEnvironmentResourceRow({
  resource,
}: {
  resource: RepositoryEnvironmentResource;
}) {
  switch (resource.kind) {
    case "destination":
      return <DestinationResource resource={resource} />;
    case "cloudflare_worker":
      return <CloudflareWorkerResource worker={resource.worker} />;
    case "cloudflare_r2_bucket":
      return (
        <div className="flex">
          <a
            className="inline-flex min-h-10 min-w-0 items-center gap-2.5 py-1.5 text-foreground no-underline hover:no-underline"
            href={resource.href}
            rel="noreferrer noopener"
            target="_blank"
            title={`Open R2 bucket ${resource.bucketName}`}
          >
            <span className="flex h-4 w-5 shrink-0 items-center justify-center">
              {resourceTypePresentation("Cloudflare.R2.Bucket").icon}
            </span>
            <span className="min-w-0 text-sm font-medium leading-5 underline decoration-border underline-offset-4 [overflow-wrap:anywhere]">
              {resource.bucketName}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        </div>
      );
    case "hub_client":
      return (
        <div className="flex min-h-10 items-center py-1.5 text-sm text-muted-foreground">
          Google sign-in: {resource.status}
        </div>
      );
    default:
      resource satisfies never;
      return null;
  }
}

/** The deployed commit of a stack and the time of its run, which links to the run when it has a URL. */
function StackRunLine({ run }: { run: NonNullable<RepositoryStackCard["run"]> }) {
  const recordedAt = Date.parse(run.recordedAt);
  const line = (
    <>
      <span className="font-mono">{run.deployedHeadCommit.slice(0, 7)}</span>
      <time dateTime={run.recordedAt} title={run.recordedAt}>
        {Number.isFinite(recordedAt) ? formatRelativeTimeAgo(recordedAt) : run.recordedAt}
      </time>
    </>
  );

  return run.runUrl ? (
    <a
      className="inline-flex min-h-8 items-center gap-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
      href={run.runUrl}
      rel="noreferrer noopener"
      target="_blank"
    >
      {line}
    </a>
  ) : (
    <span className="inline-flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
      {line}
    </span>
  );
}

function RepositoryStackCards({ cards }: { cards: readonly RepositoryStackCard[] }) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-3">
      {cards.map((card) => {
        return (
          <div
            key={card.stack}
            aria-label={`Alchemy stack ${card.stack}`}
            className="min-w-0 border border-border"
            role="group"
          >
            <div className="flex flex-col items-start px-3 pt-3 pb-1">
              {card.folder ? <RootDirectoryLabel rootDirectory={card.folder} /> : null}
              {card.address ? (
                <a
                  className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
                  href={card.address.href}
                  rel="noreferrer noopener"
                  target="_blank"
                  title={card.address.href}
                >
                  <span className="min-w-0 leading-5 [overflow-wrap:anywhere]">
                    {card.address.label}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : null}
              {card.run ? <StackRunLine run={card.run} /> : null}
            </div>
            <div className="border-t border-border px-3">
              {card.resources.map((resource) => (
                <RepositoryEnvironmentResourceRow
                  key={`${resource.kind}:${resource.id}`}
                  resource={resource}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RepositoryOverviewLoadingLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-2">
          <div className="h-4 w-2/3 bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-1/3 bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/**
What the store read says below the stack cards, null when the cards say it all. A repository_actions
repository has no stack until its first deployment finishes, and `RepositorySetupStackStatus` says
so. A repository that is being removed reads nothing, so its failed read is no problem to retry.
*/
function readStoreNotice({
  alchemyState,
  repository,
}: Pick<RepositoryWorkspaceSelected, "alchemyState" | "repository">): {
  message: string;
  reload?: () => void;
} | null {
  if (alchemyState.state === "loading" || repository.deletion.state !== "not_deleting") {
    return null;
  }
  if (alchemyState.state === "failed") {
    return { message: STORE_READ_FAILED, reload: alchemyState.reload };
  }
  const { providerPlan } = repository;
  const firstDeploymentPending =
    providerPlan !== null && !isSamebaseManagedProviderPlan(providerPlan);
  const { observation } = alchemyState;
  switch (observation.store) {
    case "no_connection":
      return {
        message: "This repository has no Convex connection, so Samebase cannot read its stacks.",
      };
    case "missing":
      return firstDeploymentPending
        ? null
        : { message: "This team has no Alchemy state store yet." };
    case "found":
      if (observation.stacks.length === 0) {
        return firstDeploymentPending
          ? null
          : { message: "The team's Alchemy state store holds no stack for this repository." };
      }
      return alchemyState.refreshFailed
        ? { message: "Deploy status may be out of date.", reload: alchemyState.reload }
        : null;
    default:
      observation satisfies never;
      return null;
  }
}

/**
The head commit of the default branch, its title and its checks come from the GitHub pull-request
query, which runs in the browser. The branch name comes from the repository row, so the branch link
renders in the first frame and only this part waits for that query.
*/
function DefaultBranchCommit({
  branch,
  filesHref,
  pullRequests,
}: {
  branch: { name: string; url: string } | undefined;
  filesHref: string | null;
  pullRequests: RepositoryPullRequestsState;
}) {
  const filesLink = filesHref ? (
    <Link
      aria-label="Open Files in Samebase"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground @4xl:h-8 @4xl:w-8"
      title="Open Files in Samebase"
      to={filesHref}
    >
      <Pencil aria-hidden="true" className="h-4 w-4" />
    </Link>
  ) : null;
  const branchLink = branch ? (
    <a
      className="inline-flex min-h-10 items-center text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground @4xl:min-h-8"
      href={branch.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {branch.name}
    </a>
  ) : null;
  if (
    !branch ||
    pullRequests.state === "loading" ||
    pullRequests.state === "problem" ||
    pullRequests.state === "not_requested" ||
    !pullRequests.defaultBranch
  ) {
    return (
      <>
        {branchLink ? (
          <div className="flex min-w-0 items-center justify-between gap-2">
            {branchLink}
            {filesLink}
          </div>
        ) : null}
        {pullRequests.state === "loading" ? (
          <div aria-label="Loading default branch commit">
            <RepositoryOverviewLoadingLines rows={1} />
          </div>
        ) : pullRequests.state === "problem" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Could not load the default branch from GitHub.</span>
            <Button size="sm" type="button" variant="outline" onClick={pullRequests.reload}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {pullRequests.state === "not_requested"
              ? "The GitHub repository is not ready yet."
              : "No default branch commit is available."}
          </div>
        )}
      </>
    );
  }

  const observation = pullRequests.defaultBranch;
  const commitTime = Date.parse(observation.headCommitCommittedAt);
  const relativeCommitTime = Number.isFinite(commitTime)
    ? formatRelativeTimeAgo(commitTime)
    : observation.headCommitCommittedAt;

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {branchLink}
          {/* The commit and its time wrap together, so a long branch name never leaves them apart. */}
          <span className="inline-flex items-center gap-2">
            <a
              className="inline-flex min-h-10 items-center font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
              href={observation.headCommitUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              {observation.headCommitOid.slice(0, 7)}
            </a>
            <span className="text-xs text-muted-foreground">{relativeCommitTime}</span>
          </span>
        </div>
        <RepositoryChecksPopover
          checks={observation.checks}
          detailsUrl={`${observation.headCommitUrl}/checks`}
          heading={`${branch.name} checks`}
          statusCheckRollup={observation.statusCheckRollup}
          triggerTitle={`Show ${branch.name} checks`}
        />
        {filesLink}
      </div>
      <div className="line-clamp-3 text-base font-medium leading-6 text-foreground [overflow-wrap:anywhere]">
        {observation.headCommitTitle}
      </div>
    </div>
  );
}

export function DefaultBranchSection({
  filesReadEnabled,
  workspace,
}: {
  filesReadEnabled: boolean;
  workspace: RepositoryWorkspaceSelected;
}) {
  const pullRequests = workspace.pullRequests;
  const defaultBranch = workspace.repository.defaultBranch?.trim();
  const branch = defaultBranch
    ? {
        name: defaultBranch,
        url: buildGitHubBranchTreeUrl({
          branchName: defaultBranch,
          githubRepositoryFullName: workspace.repository.githubRepositoryFullName,
        }),
      }
    : undefined;
  if (!branch) {
    return (
      <section className="pb-5">
        <DefaultBranchCommit branch={branch} filesHref={null} pullRequests={pullRequests} />
      </section>
    );
  }

  const filesHref = buildRepositoryFileRoute({
    owner: workspace.repository.githubOwnerLogin,
    repoName: workspace.repository.githubRepositoryName,
    branch: branch.name,
  });
  const storeNotice = readStoreNotice(workspace);

  return (
    <section
      aria-label={`Default branch ${branch.name}`}
      aria-busy={
        pullRequests.state === "current" || pullRequests.state === "stale"
          ? pullRequests.refreshing
          : undefined
      }
      className="pb-5"
    >
      <DefaultBranchCommit
        branch={branch}
        filesHref={filesReadEnabled ? filesHref : null}
        pullRequests={pullRequests}
      />
      {workspace.alchemyState.state === "loading" ? (
        <div className="grid gap-2 py-2" aria-label="Loading production destinations">
          <div className="h-3 w-44 max-w-full bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-32 max-w-full bg-muted motion-safe:animate-pulse" />
        </div>
      ) : (
        <RepositoryStackCards cards={workspace.productionCards} />
      )}
      {storeNotice ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{storeNotice.message}</span>
          {storeNotice.reload ? (
            <Button size="sm" type="button" variant="outline" onClick={storeNotice.reload}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CloudflareWorkerResource({ worker }: { worker: RepositoryEnvironmentWorker }) {
  const presentation = resourceTypePresentation("Cloudflare.Worker");

  return (
    <div
      aria-label={`Cloudflare Worker ${worker.workerName}`}
      className="grid min-w-0 gap-1.5 py-2.5"
      role="group"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
          {presentation.icon}
        </span>
        <span className="min-w-0 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
          {worker.workerName}
        </span>
      </div>
      {worker.destination.state !== "absent" || worker.actions.length > 0 ? (
        <div className="ml-2.5 grid min-w-0 gap-1.5 border-l border-border pl-3">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            {worker.destination.state === "available" ? (
              <a
                className="inline-flex min-h-10 min-w-0 items-center gap-1.5 text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
                href={worker.destination.href}
                rel="noreferrer noopener"
                target="_blank"
                title={worker.destination.title}
              >
                <span className="min-w-0 break-all leading-5">{worker.destination.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : worker.destination.state === "unlinked" ? (
              <span className="inline-flex min-h-10 min-w-0 items-center text-muted-foreground @4xl:min-h-8">
                <span className="min-w-0 break-all leading-5">{worker.destination.label}</span>
              </span>
            ) : null}
            {worker.actions.length > 0 ? (
              <EnvironmentActionsMenu actions={worker.actions} label={worker.workerName} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PullRequestResources({
  resource,
}: {
  resource: PullRequestResourceState | undefined;
}) {
  if (resource?.state === "loading") {
    return (
      <div className="ml-2.5 border-l border-border py-2 pl-5">
        <div className="h-3 w-32 bg-muted motion-safe:animate-pulse" aria-hidden="true" />
      </div>
    );
  }
  if (resource?.state === "failed") {
    return (
      <div className="ml-2.5 border-l border-border py-2 pl-5 text-xs text-muted-foreground">
        {STORE_READ_FAILED}
      </div>
    );
  }
  return resource ? <RepositoryStackCards cards={resource.stackCards} /> : null;
}
