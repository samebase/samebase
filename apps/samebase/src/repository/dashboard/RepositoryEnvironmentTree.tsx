import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SamebaseLogoMark } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { StackStateStore, StateStoreProblems } from "@/components/RepositoryAlchemyStateTree";
import { RepositoryChecksPopover } from "@/repository/dashboard/RepositoryChecksPopover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlchemyStageDiagram } from "@/components/AlchemyStageDiagram";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";
import { boxSubtitle, stageTree, type StageTreeNode } from "@samebase/alchemy-kit/stack";
import type {
  RepositoryEnvironmentAction,
  RepositoryEnvironmentResource,
  RepositoryStackCard,
} from "@/repository/dashboard/repositoryEnvironmentRoots";
import type { RepositoryStackView } from "../../../convex/userPreferenceModel";
import type {
  PullRequestResourceState,
  RepositoryPullRequestsState,
} from "@/repository/dashboard/useRepositoryPullRequests";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildRepositoryFileRoute } from "@/lib/repositoryRoutes";
import { Link } from "@tanstack/react-router";
import { convexDeploymentRegionDetails } from "../../../shared/convexDeploymentRegions";
import { ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

const STORE_READ_FAILED = "Could not read the team's Alchemy state store.";

export function RootDirectoryLabel({ rootDirectory }: { rootDirectory: string }) {
  return (
    <span className="max-lines-3 text-base font-semibold leading-5 text-foreground">
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
              <span className="min-w-0 max-lines-3">{action.label}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={`${action.destination}:${action.href}`} asChild>
              {action.destination === "samebase" ? (
                <Link className="min-w-0 no-underline" to={action.href}>
                  <SamebaseLogoMark />
                  <span className="min-w-0 max-lines-3">{action.label}</span>
                </Link>
              ) : (
                <a
                  className="min-w-0 no-underline"
                  href={action.href}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span className="min-w-0 max-lines-3">{action.label}</span>
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

/**
What a box of the stage diagram adds from the resource rows, at its top right, by the fqn in the
resource id (`alchemy:<stack>:<fqn>`): a Convex deployment's region flag and a menu with its
dashboard and Samebase routes, a menu with a Worker's dashboard and its URLs and routes other than
the box link, a menu with an R2 bucket's dashboard, and a menu with the dashboard of any other box
that `resourceDashboard` names, such as a D1 database. The Worker and R2 bucket rows of a component
are boxes in the frame of their namespace.
*/
function boxAsides(card: RepositoryStackCard) {
  const prefix = `alchemy:${card.stack}:`;
  const asides = new Map<string, ReactNode>();
  const add = (resource: RepositoryEnvironmentResource) => {
    const fqn = resource.id.slice(prefix.length);
    const box = card.diagram.boxes.find((candidate) => candidate.id === fqn);
    switch (resource.kind) {
      case "destination": {
        const region = resource.region ? convexDeploymentRegionDetails[resource.region] : undefined;
        asides.set(
          fqn,
          <>
            {region ? (
              <span className="text-xs" title={region.displayName}>
                <span aria-hidden="true">{region.icon}</span>
                <span className="sr-only">{region.displayName}</span>
              </span>
            ) : null}
            <EnvironmentActionsMenu
              actions={[
                { destination: "external", href: resource.href, label: resource.label },
                ...resource.actions,
              ]}
              label={resource.label}
            />
          </>,
        );
        for (const component of resource.components ?? []) {
          component.resources.forEach(add);
        }
        return;
      }
      case "cloudflare_worker": {
        const { destination, actions, workerName } = resource.worker;
        const dashboard = box?.rows[0].dashboard;
        const links = [
          ...(dashboard ? [{ destination: "external" as const, ...dashboard }] : []),
          ...(destination.state === "available"
            ? [
                {
                  destination: "external" as const,
                  href: destination.href,
                  label: destination.label,
                },
              ]
            : destination.state === "unlinked"
              ? [{ destination: "none" as const, label: destination.label }]
              : []),
          ...actions,
        ].filter((action) => action.destination === "none" || action.href !== box?.link);
        if (links.length > 0) {
          asides.set(fqn, <EnvironmentActionsMenu actions={links} label={workerName} />);
        }
        return;
      }
      case "cloudflare_r2_bucket":
        asides.set(
          fqn,
          <EnvironmentActionsMenu
            actions={[{ destination: "external", href: resource.href, label: resource.bucketName }]}
            label={resource.bucketName}
          />,
        );
        return;
      default:
        resource satisfies never;
    }
  };
  card.resources.forEach(add);
  // A box without a resource row, such as a D1 database, links to its dashboard page.
  for (const box of card.diagram.boxes) {
    const dashboard = box.rows[0].dashboard;
    if (dashboard && !asides.has(box.id)) {
      asides.set(
        box.id,
        <EnvironmentActionsMenu
          actions={[{ destination: "external", ...dashboard }]}
          label={box.name}
        />,
      );
    }
  }
  return asides;
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

function RepositoryStackCards({
  cards,
  view,
}: {
  cards: readonly RepositoryStackCard[];
  view: RepositoryStackView;
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-3">
      {cards.map((card) => {
        return (
          <div
            key={`${card.store}:${card.stack}`}
            aria-label={`Alchemy stack ${card.stack}`}
            className="min-w-0 border border-border"
            role="group"
          >
            <div className="flex items-start gap-2 pt-3 pr-1 pb-1 pl-3">
              <div className="flex min-w-0 flex-1 flex-col items-start">
                {card.folder ? <RootDirectoryLabel rootDirectory={card.folder} /> : null}
                {card.address ? (
                  <a
                    className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
                    href={card.address.href}
                    rel="noreferrer noopener"
                    target="_blank"
                    title={card.address.href}
                  >
                    <span className="min-w-0 max-lines-3 leading-5">{card.address.label}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : null}
                {card.run ? <StackRunLine run={card.run} /> : null}
              </div>
              <StackStateStore store={card.store} />
            </div>
            <StackCardBodyBoundary key={view}>
              {view === "list" ? <StackList card={card} /> : <StackDiagram card={card} />}
            </StackCardBodyBoundary>
          </div>
        );
      })}
    </div>
  );
}

/**
A card body draws state rows from any store. A row it cannot draw breaks only that card: the
header with the stack's address stays, and the rest of the page keeps working.
*/
class StackCardBodyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Stack card failed to render", error, errorInfo);
  }

  override render() {
    if (this.state.failed) {
      return (
        <p className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
          Could not draw this stack.
        </p>
      );
    }
    return this.props.children;
  }
}

/**
The List view of a stack card: the boxes of the stack diagram as a tree (`stageTree`), each under
the box that uses it, with the same names, links and menus (`boxAsides`) as the diagram. The rows
that fold into a box show under it.
*/
function StackList({ card }: { card: RepositoryStackCard }) {
  if (card.diagram.boxes.length === 0) {
    return null;
  }
  const asides = boxAsides(card);
  return (
    <ul className="border-t border-border px-3 py-1.5">
      {stageTree(card.diagram).map((node) => (
        <StackListNode key={node.box.id} asides={asides} node={node} />
      ))}
    </ul>
  );
}

function StackListNode({
  node,
  asides,
}: {
  node: StageTreeNode;
  asides: ReadonlyMap<string, ReactNode>;
}) {
  const { box, labels, repeated } = node;
  const below = repeated
    ? []
    : [
        ...node.children.map((child) => (
          <StackListNode key={`box:${child.box.id}`} asides={asides} node={child} />
        )),
        ...box.folded.map((row) => {
          const { icon, label } = resourceTypePresentation(row.resourceType);
          return (
            <li
              key={`row:${row.fqn}`}
              className="flex min-w-0 items-center gap-2 py-1 text-xs text-muted-foreground"
            >
              {icon}
              <span className="font-mono">{row.logicalId}</span>
              <span>{label}</span>
            </li>
          );
        }),
        ...node.shared.map((text) => (
          <li key={`shared:${text}`} className="py-1 text-xs text-muted-foreground">
            {text}
          </li>
        )),
      ];
  return (
    <li>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 py-1 text-sm">
        {resourceTypePresentation(box.resourceType).icon}
        <span className="min-w-0 font-mono font-medium max-lines-3">{box.name}</span>
        {labels.length > 0 ? (
          <span className="font-mono text-xs text-muted-foreground">{labels.join(", ")}</span>
        ) : null}
        {repeated ? null : (
          <>
            <span className="text-xs text-muted-foreground">{boxSubtitle(box)}</span>
            {box.link ? (
              <a
                className="inline-flex min-w-0 items-center gap-1 font-mono text-xs"
                href={box.link}
                rel="noreferrer noopener"
                target="_blank"
                title={box.link}
              >
                <span className="truncate">{new URL(box.link).host}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : null}
            {asides.get(box.id)}
          </>
        )}
      </div>
      {below.length > 0 ? <ul className="ml-2 border-l border-border pl-4">{below}</ul> : null}
    </li>
  );
}

function StackDiagram({ card }: { card: RepositoryStackCard }) {
  if (card.diagram.boxes.length === 0) {
    return null;
  }
  return (
    <div className="border-t border-border px-3 pt-3 pb-1">
      <AlchemyStageDiagram diagram={card.diagram} asides={boxAsides(card)} />
    </div>
  );
}

/** The choice between the resource list and the diagram in the stack cards of the page. */
export type RepositoryStackViewControl = {
  view: RepositoryStackView;
  onChange: (view: RepositoryStackView) => void;
};

function RepositoryStackViewToggle({ stackView }: { stackView: RepositoryStackViewControl }) {
  return (
    <ToggleGroup
      aria-label="Stack view"
      size="sm"
      value={stackView.view}
      onValueChange={(value) => {
        if (value === "list" || value === "diagram") {
          stackView.onChange(value);
        }
      }}
    >
      <ToggleGroupItem value="list">List</ToggleGroupItem>
      <ToggleGroupItem value="diagram">Diagram</ToggleGroupItem>
    </ToggleGroup>
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
so. A repository that is being removed reads nothing, so its failed read is no problem to retry. A
message about no stack also names a problem of the Cloudflare store or of the GitHub branch.
*/
function readStoreNotice({
  alchemyState,
  repository,
}: Pick<RepositoryWorkspaceSelected, "alchemyState" | "repository">): {
  message: string;
  reload?: () => void;
  cloudflareProblem?: "reconnect" | "unreadable";
  githubUnreadable?: true;
} | null {
  if (alchemyState.state === "loading" || repository.deletion.state !== "not_deleting") {
    return null;
  }
  if (alchemyState.state === "failed") {
    return { message: STORE_READ_FAILED, reload: alchemyState.reload };
  }
  const { providerPlan } = repository;
  const firstDeploymentPending = providerPlan !== null;
  const { observation, cloudflareProblem, githubUnreadable } = alchemyState;
  switch (observation.store) {
    case "no_connection":
      return {
        message: "This repository has no Convex connection, so Samebase cannot read its stacks.",
        cloudflareProblem,
        githubUnreadable,
      };
    case "missing":
      return firstDeploymentPending
        ? null
        : {
            message: "This team has no Alchemy state store yet.",
            cloudflareProblem,
            githubUnreadable,
          };
    case "found":
      if (observation.stacks.length === 0) {
        return firstDeploymentPending
          ? null
          : {
              message: "The team's Alchemy state store holds no stack for this repository.",
              cloudflareProblem,
              githubUnreadable,
            };
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
query, which runs in the browser. The branch name comes from the repository row, so the branch name
renders in the first frame and only this part waits for that query.
*/
function DefaultBranchCommit({
  branch,
  filesHref,
  pullRequests,
}: {
  branch: { name: string } | undefined;
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
  const branchLabel = branch ? (
    <span className="max-lines-3 text-xs leading-5 text-muted-foreground">{branch.name}</span>
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
        {branchLabel ? (
          <div className="flex min-w-0 items-center justify-between gap-2">
            {branchLabel}
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
      {/* Same shape as a pull request row: branch and time on top, checks at the right. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2">
        <div className="flex min-w-0 flex-[1_1_6rem] flex-wrap gap-x-2.5 text-xs leading-5 text-muted-foreground">
          <span className="max-lines-3">{branch.name}</span>
          <span>{relativeCommitTime}</span>
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
      {/* The commit and its title are one GitHub link, like a pull request's number and title. */}
      <p className="max-lines-3 text-sm font-medium leading-5">
        <a
          className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          href={observation.headCommitUrl}
          rel="noreferrer noopener"
          target="_blank"
          title="Open on GitHub"
        >
          <span className="font-mono font-normal text-muted-foreground">
            {observation.headCommitOid.slice(0, 7)}
          </span>{" "}
          {observation.headCommitTitle}
        </a>
      </p>
    </div>
  );
}

export function DefaultBranchSection({
  filesReadEnabled,
  stackView,
  workspace,
}: {
  filesReadEnabled: boolean;
  stackView: RepositoryStackViewControl;
  workspace: RepositoryWorkspaceSelected;
}) {
  const pullRequests = workspace.pullRequests;
  const defaultBranch = workspace.repository.defaultBranch?.trim();
  const branch = defaultBranch ? { name: defaultBranch } : undefined;
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
        <>
          {workspace.productionCards.length > 0 ? (
            <div className="mt-3 flex justify-end">
              <RepositoryStackViewToggle stackView={stackView} />
            </div>
          ) : null}
          <RepositoryStackCards cards={workspace.productionCards} view={stackView.view} />
        </>
      )}
      {storeNotice ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {storeNotice.message}
            {storeNotice.cloudflareProblem || storeNotice.githubUnreadable ? (
              <>
                {" "}
                <StateStoreProblems
                  cloudflareProblem={storeNotice.cloudflareProblem}
                  githubUnreadable={storeNotice.githubUnreadable}
                  owner={workspace.repository.githubOwnerLogin}
                />
              </>
            ) : null}
          </span>
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

export function PullRequestResources({
  resource,
  view,
}: {
  resource: PullRequestResourceState | undefined;
  view: RepositoryStackView;
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
  return resource ? <RepositoryStackCards cards={resource.stackCards} view={view} /> : null;
}
