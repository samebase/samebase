import { linkStyle } from "@/components/styles";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  formatRepositoryCheckSummary,
  type RepositoryCheckSummary,
} from "@/repository/dashboard/repositoryChecks";
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleX, Loader2 } from "lucide-react";
import {
  classifyRepositoryCheck,
  type RepositoryCheck,
  type RepositoryCheckState,
  type RepositoryStatusCheckRollup,
} from "../../../convex/repository/pullRequestModel";

function ChecksIcon({ state }: { state: RepositoryCheckSummary["state"] }) {
  switch (state) {
    case "success":
      return <CircleCheck aria-hidden="true" className="h-4 w-4" />;
    case "failure":
      return <CircleX aria-hidden="true" className="h-4 w-4" />;
    case "running":
      return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;
    case "none":
      return <CircleDashed aria-hidden="true" className="h-4 w-4" />;
    case "neutral":
      return <CircleDot aria-hidden="true" className="h-4 w-4" />;
    case "unknown":
      return <CircleAlert aria-hidden="true" className="h-4 w-4" />;
    default:
      state satisfies never;
      return null;
  }
}

function checkName(check: RepositoryCheck): string {
  return check.kind === "check_run" ? check.name : check.context;
}

function checkStateClassName(state: RepositoryCheckSummary["state"]): string {
  switch (state) {
    case "success":
      return "text-emerald-600";
    case "failure":
      return "text-destructive";
    case "running":
      return "text-amber-700";
    case "none":
    case "neutral":
    case "unknown":
      return "text-muted-foreground";
    default:
      state satisfies never;
      return "text-muted-foreground";
  }
}

const checkStateOrder = {
  failure: 0,
  running: 1,
  unknown: 2,
  neutral: 3,
  success: 4,
} satisfies Record<RepositoryCheckState, number>;

export function RepositoryChecksPopover({
  checks,
  detailsUrl,
  heading,
  statusCheckRollup,
  triggerTitle,
}: {
  checks: RepositoryCheckSummary;
  detailsUrl: string;
  heading: string;
  statusCheckRollup: RepositoryStatusCheckRollup;
  triggerTitle: string;
}) {
  const contexts = [...(statusCheckRollup?.contexts.nodes ?? [])].sort(
    (left, right) =>
      checkStateOrder[classifyRepositoryCheck(left)] -
        checkStateOrder[classifyRepositoryCheck(right)] ||
      checkName(left).localeCompare(checkName(right)) ||
      left.kind.localeCompare(right.kind) ||
      (left.kind === "check_run" ? left.detailsUrl : left.targetUrl)?.localeCompare(
        right.kind === "check_run" ? (right.detailsUrl ?? "") : (right.targetUrl ?? ""),
      ) ||
      0,
  );

  return (
    <Popover>
      <PopoverTrigger asChild nativeButton>
        <button
          type="button"
          className={clsx(
            "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium tabular-nums underline decoration-muted-foreground/40 underline-offset-4 transition-colors @4xl:min-h-8",
            checkStateClassName(checks.state),
            linkStyle,
          )}
          title={triggerTitle}
        >
          <ChecksIcon state={checks.state} />
          {formatRepositoryCheckSummary(checks)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-1rem)] gap-0 p-0">
        <PopoverTitle className="border-b border-border/60 px-3 py-2.5">{heading}</PopoverTitle>
        {contexts.length === 0 ? (
          <p className="px-3 py-3 text-muted-foreground">No checks reported by GitHub.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {contexts.map((check, index) => {
              const name = checkName(check);
              const state = classifyRepositoryCheck(check);
              const detailsUrl = check.kind === "check_run" ? check.detailsUrl : check.targetUrl;
              const description =
                check.kind === "check_run"
                  ? check.title === name
                    ? null
                    : check.title
                  : check.description;
              return (
                <li
                  key={`${check.kind}:${name}:${detailsUrl ?? index}`}
                  className="flex min-w-0 items-start gap-2 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                >
                  <span className={clsx("mt-0.5 shrink-0", checkStateClassName(state))}>
                    <ChecksIcon state={state} />
                  </span>
                  <span className="min-w-0 flex-1">
                    {detailsUrl ? (
                      <a
                        href={detailsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={clsx(
                          "break-words font-medium underline decoration-muted-foreground/40 underline-offset-4",
                          linkStyle,
                        )}
                        aria-label={`Open ${name} check details`}
                      >
                        {name}
                      </a>
                    ) : (
                      <span className="break-words font-medium">{name}</span>
                    )}
                    {description ? (
                      <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                        {description}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {contexts.length < checks.totalCount ? (
          <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
            Showing {contexts.length} of {checks.totalCount}.{" "}
            <a
              href={detailsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={clsx("underline underline-offset-4", linkStyle)}
            >
              View all on GitHub
            </a>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
