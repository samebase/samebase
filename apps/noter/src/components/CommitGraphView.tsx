import { FileIcon } from "@radix-ui/react-icons";
import { type CSSProperties } from "react";
import {
  type CommitGraphAuthor,
  type CommitGraphLaneColor,
  type CommitGraphLanePoint,
  type CommitGraphLaneSegment,
  type CommitGraphRef,
  type CommitGraphRefTone,
  type CommitGraphRenderedPage,
  type CommitGraphRenderedRow,
} from "@/lib/commitGraph";
import { cn } from "@/lib/utils";

const TABLE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "250px 220px minmax(0, 1.75fr) 150px 210px 180px 110px",
};

const LANE_STROKE_COLORS: Record<CommitGraphLaneColor, string> = {
  blue: "#3b82f6",
  cyan: "#38bdf8",
  purple: "#9333ea",
  amber: "#f59e0b",
  emerald: "#22c55e",
};

const REF_TONE_STYLES: Record<
  CommitGraphRefTone,
  {
    badge: string;
    dot: string;
  }
> = {
  blue: {
    badge: "border-[#2b6cb0] bg-[#1b365d] text-[#d8ecff]",
    dot: "bg-[#5aa8ff]",
  },
  cyan: {
    badge: "border-[#208aa6] bg-[#103848] text-[#d6fbff]",
    dot: "bg-[#67e8f9]",
  },
  purple: {
    badge: "border-[#7e22ce] bg-[#32124f] text-[#f1d4ff]",
    dot: "bg-[#c084fc]",
  },
  green: {
    badge: "border-[#2f855a] bg-[#173d2a] text-[#dafbe1]",
    dot: "bg-[#68d391]",
  },
  amber: {
    badge: "border-[#b7791f] bg-[#4b3008] text-[#fef3c7]",
    dot: "bg-[#f6ad55]",
  },
  slate: {
    badge: "border-[#475569] bg-[#1f2937] text-[#d5dde7]",
    dot: "bg-[#94a3b8]",
  },
};

function readRelativeTimeLabel(
  timestamp: string,
  nowTimestamp: string,
): string {
  const committedAtMs = Date.parse(timestamp);
  const nowMs = Date.parse(nowTimestamp);

  if (Number.isNaN(committedAtMs) || Number.isNaN(nowMs)) {
    return "Unknown";
  }

  const deltaSeconds = Math.max(0, Math.round((nowMs - committedAtMs) / 1000));

  if (deltaSeconds < 45) {
    return "just now";
  }

  if (deltaSeconds < 3_600) {
    const minutes = Math.max(1, Math.round(deltaSeconds / 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (deltaSeconds < 86_400) {
    const hours = Math.max(1, Math.round(deltaSeconds / 3_600));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.max(1, Math.round(deltaSeconds / 86_400));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function readAuthorLabel(author: CommitGraphAuthor): string {
  return author.isCurrentUser ? "You" : author.name;
}

function readAuthorInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return initials || "?";
}

function readVisibleRefs(refs: readonly CommitGraphRef[]) {
  return {
    visibleRefs: refs.slice(0, 2),
    hiddenRefCount: Math.max(0, refs.length - 2),
  };
}

function readLaneX(point: CommitGraphLanePoint, page: CommitGraphRenderedPage) {
  return (
    page.graph.paddingX +
    point.lane * page.graph.laneWidth +
    page.graph.laneWidth / 2
  );
}

function readLaneY(point: CommitGraphLanePoint, page: CommitGraphRenderedPage) {
  return point.y * page.graph.rowHeight;
}

function readSegmentPath(
  segment: CommitGraphLaneSegment,
  page: CommitGraphRenderedPage,
) {
  const fromX = readLaneX(segment.from, page);
  const fromY = readLaneY(segment.from, page);
  const toX = readLaneX(segment.to, page);
  const toY = readLaneY(segment.to, page);

  if (segment.type === "line") {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const controlX = readLaneX(segment.control, page);
  const controlY = readLaneY(segment.control, page);
  return `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
}

function CommitGraphAuthorAvatar({
  author,
  color,
  size,
}: {
  author: CommitGraphAuthor;
  color: CommitGraphLaneColor;
  size: number;
}) {
  const ringColor = LANE_STROKE_COLORS[color];

  return (
    <div
      className="overflow-hidden rounded-full bg-[#0f1722] shadow-[0_0_0_1px_rgba(12,18,28,0.95)]"
      style={{
        height: size,
        width: size,
        border: `3px solid ${ringColor}`,
      }}
    >
      {author.avatarUrl ? (
        <img
          src={author.avatarUrl}
          alt={`${author.name} avatar`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#1f2937] text-[11px] font-semibold text-[#e5edf6]">
          {readAuthorInitials(author.name)}
        </div>
      )}
    </div>
  );
}

function CommitGraphRefBadge({ item }: { item: CommitGraphRef }) {
  const style = REF_TONE_STYLES[item.tone];

  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-2 rounded-[4px] border px-3 text-sm font-medium",
        style.badge,
        item.isCurrent ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : "",
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-[3px]", style.dot)} />
      <span className="truncate">{item.name}</span>
    </span>
  );
}

function CommitGraphGraphCell({
  page,
  row,
}: {
  page: CommitGraphRenderedPage;
  row: CommitGraphRenderedRow;
}) {
  const nodeX =
    page.graph.paddingX +
    row.graph.nodeLane * page.graph.laneWidth +
    page.graph.laneWidth / 2 -
    page.graph.avatarSize / 2;
  const nodeY = page.graph.rowHeight / 2 - page.graph.avatarSize / 2;

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden border-r border-[#2d2d30]",
        row.isSelected ? "bg-[#284652]" : "bg-[#1a2533]",
      )}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 220 ${page.graph.rowHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {row.graph.segments.map((segment, index) => (
          <path
            key={`${row.id}-${index}`}
            d={readSegmentPath(segment, page)}
            fill="none"
            stroke={LANE_STROKE_COLORS[segment.color]}
            strokeWidth={segment.tone === "muted" ? 2.5 : 3}
            strokeOpacity={segment.tone === "muted" ? 0.45 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div
        className="absolute"
        style={{
          left: nodeX,
          top: nodeY,
        }}
      >
        <CommitGraphAuthorAvatar
          author={row.author}
          color={row.graph.nodeColor}
          size={page.graph.avatarSize}
        />
      </div>
    </div>
  );
}

function CommitGraphChangeCell({ row }: { row: CommitGraphRenderedRow }) {
  if (row.stats === null || row.stats.filesChanged === null) {
    return <span className="text-sm text-[#7f868d]">Unavailable</span>;
  }

  const totalLines = row.stats.additions + row.stats.deletions;
  const additionWidthPercent =
    totalLines === 0 ? 100 : (row.stats.additions / totalLines) * 100;
  const deletionWidthPercent =
    totalLines === 0 ? 0 : (row.stats.deletions / totalLines) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-[44px] items-center gap-1.5 text-sm font-medium text-[#d0d5db]">
        <FileIcon className="h-4 w-4 text-[#8b949e]" />
        <span>{row.stats.filesChanged}</span>
      </div>
      <div className="h-3 w-[140px] overflow-hidden rounded-[3px] bg-[#25282d]">
        <div className="flex h-full w-full">
          <div
            className="h-full bg-[#6a9955]"
            style={{ width: `${additionWidthPercent}%` }}
          />
          <div
            className="h-full bg-[#cc6655]"
            style={{ width: `${deletionWidthPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function CommitGraphView({
  page,
  className,
  dataTestId,
}: {
  page: CommitGraphRenderedPage;
  className?: string;
  dataTestId?: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "flex min-h-0 min-w-[1520px] flex-col overflow-hidden rounded-[10px] border border-[#323232] bg-[#1e1e1e] text-[#d4d4d4]",
        className,
      )}
    >
      <div
        className="grid h-10 items-center border-b border-[#2d2d30] bg-[#252526] px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8b949e]"
        style={TABLE_GRID_STYLE}
      >
        <div>Branch / Tag</div>
        <div>Graph</div>
        <div>Commit Message</div>
        <div>Author</div>
        <div>Changes</div>
        <div>Commit Date / Time</div>
        <div>Sha</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {page.rows.map((row) => {
          const { visibleRefs, hiddenRefCount } = readVisibleRefs(row.refs);

          return (
            <div
              key={row.id}
              className={cn(
                "grid items-stretch border-b border-[#252526]",
                row.isSelected ? "bg-[#1a4670]" : "bg-[#1e1e1e]",
              )}
              style={{
                ...TABLE_GRID_STYLE,
                minHeight: page.graph.rowHeight,
              }}
            >
              <div className="flex min-w-0 items-center gap-2 overflow-hidden px-4">
                {visibleRefs.map((ref) => (
                  <CommitGraphRefBadge key={ref.id} item={ref} />
                ))}
                {hiddenRefCount > 0 ? (
                  <span className="inline-flex h-8 items-center rounded-[4px] bg-[#264e7d] px-2.5 text-sm font-semibold text-[#d3ebff]">
                    +{hiddenRefCount}
                  </span>
                ) : null}
              </div>

              <CommitGraphGraphCell page={page} row={row} />

              <div className="flex min-w-0 items-center border-r border-[#2d2d30] px-4">
                <div className="min-w-0">
                  <div
                    className={cn(
                      "truncate text-[15px]",
                      row.isSelected
                        ? "font-semibold text-white"
                        : "font-medium text-[#d4d4d4]",
                    )}
                  >
                    {row.subject}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 items-center border-r border-[#2d2d30] px-4 text-[15px] text-[#d0d5db]">
                <div className="truncate">{readAuthorLabel(row.author)}</div>
              </div>

              <div className="flex min-w-0 items-center border-r border-[#2d2d30] px-4">
                <CommitGraphChangeCell row={row} />
              </div>

              <div className="flex min-w-0 items-center border-r border-[#2d2d30] px-4 text-[15px] text-[#b9c0c7]">
                {readRelativeTimeLabel(row.committedAt, page.generatedAt)}
              </div>

              <div className="flex min-w-0 items-center px-4 font-mono text-[15px] text-[#9ca3af]">
                {row.shortSha}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
