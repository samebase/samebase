import { getCommitStatusBadgeClassName } from "@/lib/commitReviewStatus";

type CommitReviewStatusTotals = {
  added: number;
  modified: number;
  renamed: number;
  deleted: number;
};

export function CommitReviewStatusChips({
  totals,
}: {
  totals: CommitReviewStatusTotals;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono ${getCommitStatusBadgeClassName("added")}`}
      >
        A {totals.added}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono ${getCommitStatusBadgeClassName("modified")}`}
      >
        M {totals.modified}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono ${getCommitStatusBadgeClassName("renamed")}`}
      >
        R {totals.renamed}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono ${getCommitStatusBadgeClassName("deleted")}`}
      >
        D {totals.deleted}
      </span>
    </div>
  );
}
