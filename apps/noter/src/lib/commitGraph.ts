export type CommitGraphProviderKind =
  | "fixture"
  | "local"
  | "github"
  | "remoteMachine";

export interface CommitGraphCapabilities {
  supportsFullGraph: boolean;
  supportsPagination: boolean;
  supportsFileStats: boolean;
  supportsAvatars: boolean;
  supportsRefSelection: boolean;
}

export type CommitGraphScope =
  | {
      kind: "repository";
      id: string;
      owner?: string;
      name?: string;
    }
  | {
      kind: "ref";
      id: string;
      name: string;
    }
  | {
      kind: "search";
      query: string;
    };

export interface CommitGraphQuery {
  scope: CommitGraphScope;
  limit: number;
  cursor?: string;
  includeRefs: boolean;
  includeStats: boolean;
  includeAvatars: boolean;
}

export interface CommitGraphAuthor {
  name: string;
  email?: string;
  handle?: string;
  avatarUrl?: string;
  isCurrentUser?: boolean;
}

export type CommitGraphRefKind =
  | "head"
  | "localBranch"
  | "remoteBranch"
  | "tag"
  | "stash";

export type CommitGraphRefTone =
  | "blue"
  | "cyan"
  | "purple"
  | "green"
  | "amber"
  | "slate";

export interface CommitGraphRef {
  id: string;
  name: string;
  kind: CommitGraphRefKind;
  tone: CommitGraphRefTone;
  isCurrent?: boolean;
}

export interface CommitGraphStats {
  filesChanged: number | null;
  additions: number;
  deletions: number;
}

export interface CommitGraphRow {
  id: string;
  sha: string;
  shortSha: string;
  parents: string[];
  subject: string;
  body?: string;
  author: CommitGraphAuthor;
  committedAt: string;
  refs: CommitGraphRef[];
  stats: CommitGraphStats | null;
}

export interface CommitGraphPage {
  provider: CommitGraphProviderKind;
  query: CommitGraphQuery;
  capabilities: CommitGraphCapabilities;
  generatedAt: string;
  nextCursor?: string;
  rows: CommitGraphRow[];
}

export type CommitGraphLaneColor =
  | "blue"
  | "cyan"
  | "purple"
  | "amber"
  | "emerald";

export type CommitGraphStrokeTone = "solid" | "muted";

export interface CommitGraphLanePoint {
  lane: number;
  y: number;
}

export type CommitGraphLaneSegment =
  | {
      type: "line";
      from: CommitGraphLanePoint;
      to: CommitGraphLanePoint;
      color: CommitGraphLaneColor;
      tone?: CommitGraphStrokeTone;
    }
  | {
      type: "curve";
      from: CommitGraphLanePoint;
      control: CommitGraphLanePoint;
      to: CommitGraphLanePoint;
      color: CommitGraphLaneColor;
      tone?: CommitGraphStrokeTone;
    };

export interface CommitGraphRenderedRow extends CommitGraphRow {
  isSelected?: boolean;
  graph: {
    laneCount: number;
    nodeLane: number;
    nodeColor: CommitGraphLaneColor;
    segments: CommitGraphLaneSegment[];
  };
}

export interface CommitGraphRenderedPage extends Omit<CommitGraphPage, "rows"> {
  graph: {
    laneWidth: number;
    paddingX: number;
    rowHeight: number;
    avatarSize: number;
  };
  rows: CommitGraphRenderedRow[];
}
