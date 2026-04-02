import { CommitGraphView } from "@/components/CommitGraphView";
import {
  type CommitGraphLaneColor,
  type CommitGraphLaneSegment,
  type CommitGraphRenderedPage,
  type CommitGraphRenderedRow,
} from "@/lib/commitGraph";

export type CommitGraphVisualMode = "commit-graph";

function createAvatarDataUri({
  backgroundStart,
  backgroundEnd,
  hairColor,
  shirtColor,
  skinColor,
}: {
  backgroundStart: string;
  backgroundEnd: string;
  hairColor: string;
  shirtColor: string;
  skinColor: string;
}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${backgroundStart}" />
          <stop offset="100%" stop-color="${backgroundEnd}" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="32" fill="url(#background)" />
      <circle cx="32" cy="25" r="12" fill="${skinColor}" />
      <path d="M12 62c2-14 11-22 20-22s18 8 20 22" fill="${shirtColor}" />
      <path d="M19 24c0-10 6-16 13-16 10 0 15 7 15 17-3-2-6-3-10-3-6 0-10 2-18 7z" fill="${hairColor}" />
      <circle cx="27" cy="24" r="1.6" fill="#111827" />
      <circle cx="36.5" cy="24" r="1.6" fill="#111827" />
      <path d="M27 31c1.2 1.5 2.8 2.2 5 2.2 2 0 3.9-.7 5.2-2.2" fill="none" stroke="#8b5e3c" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function line(
  lane: number,
  fromY: number,
  toY: number,
  color: CommitGraphLaneColor,
): CommitGraphLaneSegment {
  return {
    type: "line",
    from: { lane, y: fromY },
    to: { lane, y: toY },
    color,
  };
}

function curve(
  fromLane: number,
  fromY: number,
  controlLane: number,
  controlY: number,
  toLane: number,
  toY: number,
  color: CommitGraphLaneColor,
): CommitGraphLaneSegment {
  return {
    type: "curve",
    from: { lane: fromLane, y: fromY },
    control: { lane: controlLane, y: controlY },
    to: { lane: toLane, y: toY },
    color,
  };
}

const NICU_AVATAR = createAvatarDataUri({
  backgroundStart: "#2f80ed",
  backgroundEnd: "#0f4c81",
  hairColor: "#1f2937",
  shirtColor: "#0f172a",
  skinColor: "#f0c9a4",
});

const RINA_AVATAR = createAvatarDataUri({
  backgroundStart: "#34d399",
  backgroundEnd: "#0f766e",
  hairColor: "#2d1b0f",
  shirtColor: "#134e4a",
  skinColor: "#f2bf9c",
});

const OMAR_AVATAR = createAvatarDataUri({
  backgroundStart: "#a855f7",
  backgroundEnd: "#4c1d95",
  hairColor: "#111827",
  shirtColor: "#312e81",
  skinColor: "#c98a64",
});

const LENA_AVATAR = createAvatarDataUri({
  backgroundStart: "#f59e0b",
  backgroundEnd: "#9a3412",
  hairColor: "#6b2f0e",
  shirtColor: "#7c2d12",
  skinColor: "#f0c7ae",
});

// The first fixture keeps the DAG layout explicit so the view and the provider
// contract can evolve independently before we add live graph math.
const COMMIT_GRAPH_FIXTURE_PAGE: CommitGraphRenderedPage = {
  provider: "fixture",
  query: {
    scope: {
      kind: "repository",
      id: "nicu/noter",
      owner: "nicu",
      name: "noter",
    },
    limit: 11,
    includeRefs: true,
    includeStats: true,
    includeAvatars: true,
  },
  capabilities: {
    supportsFullGraph: true,
    supportsPagination: true,
    supportsFileStats: true,
    supportsAvatars: true,
    supportsRefSelection: true,
  },
  generatedAt: "2026-04-03T20:00:00.000Z",
  graph: {
    laneWidth: 36,
    paddingX: 26,
    rowHeight: 54,
    avatarSize: 30,
  },
  rows: [
    {
      id: "commit-0",
      sha: "9539c8f2bb0d0e605531ece3cc16fdcf7f7c0d10",
      shortSha: "9539c8f",
      parents: ["commit-1"],
      subject: "[codex] Build first commit graph fixture",
      author: {
        name: "Nicu Popa",
        handle: "@nicu",
        avatarUrl: NICU_AVATAR,
        isCurrentUser: true,
      },
      committedAt: "2026-04-03T19:57:00.000Z",
      refs: [
        {
          id: "ref-main",
          name: "main",
          kind: "head",
          tone: "cyan",
          isCurrent: true,
        },
        {
          id: "ref-origin-main",
          name: "origin/main",
          kind: "remoteBranch",
          tone: "slate",
        },
        {
          id: "ref-tag-032",
          name: "v0.32.0",
          kind: "tag",
          tone: "amber",
        },
      ],
      stats: {
        filesChanged: 17,
        additions: 31,
        deletions: 6,
      },
      isSelected: true,
      graph: {
        laneCount: 3,
        nodeLane: 0,
        nodeColor: "cyan",
        segments: [line(0, 0.5, 1, "cyan")],
      },
    },
    {
      id: "commit-1",
      sha: "5f615cbf123f29a51f688ba67672f1ca1ff4bcad",
      shortSha: "5f615cb",
      parents: ["commit-2"],
      subject: "Align commit graph ref pill spacing",
      author: {
        name: "Nicu Popa",
        handle: "@nicu",
        avatarUrl: NICU_AVATAR,
        isCurrentUser: true,
      },
      committedAt: "2026-04-03T19:52:00.000Z",
      refs: [],
      stats: {
        filesChanged: 4,
        additions: 7,
        deletions: 1,
      },
      graph: {
        laneCount: 3,
        nodeLane: 0,
        nodeColor: "cyan",
        segments: [line(0, 0, 1, "cyan")],
      },
    },
    {
      id: "commit-2",
      sha: "e661fbbf4b94bf8ca41a97c6e52d2af9138841d0",
      shortSha: "e661fbb",
      parents: ["commit-3", "commit-4"],
      subject: "Merge fixture rows back into main graph shell",
      author: {
        name: "Rina Hall",
        handle: "@rina",
        avatarUrl: RINA_AVATAR,
      },
      committedAt: "2026-04-03T19:44:00.000Z",
      refs: [],
      stats: {
        filesChanged: 8,
        additions: 22,
        deletions: 5,
      },
      graph: {
        laneCount: 3,
        nodeLane: 0,
        nodeColor: "cyan",
        segments: [line(0, 0, 1, "cyan"), curve(1, 1, 1, 0.78, 0, 0.5, "blue")],
      },
    },
    {
      id: "commit-3",
      sha: "7efbd08b19e6f0eef7064f1c0455d950c5ba9779",
      shortSha: "7efbd08",
      parents: ["commit-5"],
      subject: "Refresh fixture lane colors and node treatment",
      author: {
        name: "Nicu Popa",
        handle: "@nicu",
        avatarUrl: NICU_AVATAR,
        isCurrentUser: true,
      },
      committedAt: "2026-04-03T19:38:00.000Z",
      refs: [
        {
          id: "ref-feature",
          name: "codex/commit-graph-fixture",
          kind: "localBranch",
          tone: "blue",
        },
      ],
      stats: {
        filesChanged: 6,
        additions: 18,
        deletions: 3,
      },
      graph: {
        laneCount: 3,
        nodeLane: 1,
        nodeColor: "blue",
        segments: [line(0, 0, 1, "cyan"), line(1, 0, 1, "blue")],
      },
    },
    {
      id: "commit-4",
      sha: "378abacf86bce3d2b502fe3c27022a73091841a7",
      shortSha: "378abac",
      parents: ["commit-6"],
      subject: "Clarify commit graph data contract for local and GitHub",
      author: {
        name: "Nicu Popa",
        handle: "@nicu",
        avatarUrl: NICU_AVATAR,
        isCurrentUser: true,
      },
      committedAt: "2026-04-03T19:31:00.000Z",
      refs: [],
      stats: {
        filesChanged: 5,
        additions: 15,
        deletions: 2,
      },
      graph: {
        laneCount: 3,
        nodeLane: 1,
        nodeColor: "blue",
        segments: [line(0, 0, 1, "cyan"), line(1, 0, 1, "blue")],
      },
    },
    {
      id: "commit-5",
      sha: "49115f59c4eab4770f74d8fd0b2f3c7725b459cb",
      shortSha: "49115f5",
      parents: ["commit-8", "commit-6"],
      subject: "Merge review polish branch into fixture exploration",
      author: {
        name: "Rina Hall",
        handle: "@rina",
        avatarUrl: RINA_AVATAR,
      },
      committedAt: "2026-04-03T19:25:00.000Z",
      refs: [],
      stats: {
        filesChanged: 9,
        additions: 24,
        deletions: 4,
      },
      graph: {
        laneCount: 3,
        nodeLane: 1,
        nodeColor: "blue",
        segments: [
          line(0, 0, 1, "cyan"),
          line(1, 0, 1, "blue"),
          curve(2, 1, 2, 0.78, 1, 0.5, "purple"),
        ],
      },
    },
    {
      id: "commit-6",
      sha: "dc16de6b71a14b503c8a6850982fe35d7117b17a",
      shortSha: "dc16de6",
      parents: ["commit-7"],
      subject: "Tighten graph cell spacing after review",
      author: {
        name: "Omar Valev",
        handle: "@omar",
        avatarUrl: OMAR_AVATAR,
      },
      committedAt: "2026-04-03T19:19:00.000Z",
      refs: [
        {
          id: "ref-review",
          name: "review/polish",
          kind: "localBranch",
          tone: "purple",
        },
      ],
      stats: {
        filesChanged: 2,
        additions: 5,
        deletions: 1,
      },
      graph: {
        laneCount: 3,
        nodeLane: 2,
        nodeColor: "purple",
        segments: [
          line(0, 0, 1, "cyan"),
          line(1, 0, 1, "blue"),
          line(2, 0, 1, "purple"),
        ],
      },
    },
    {
      id: "commit-7",
      sha: "30c5439f20a5762e9cab831c0ec02cce1dc6209f",
      shortSha: "30c5439",
      parents: ["commit-8"],
      subject: "Add badge overflow treatment for dense refs",
      author: {
        name: "Omar Valev",
        handle: "@omar",
        avatarUrl: OMAR_AVATAR,
      },
      committedAt: "2026-04-03T19:10:00.000Z",
      refs: [],
      stats: {
        filesChanged: 3,
        additions: 7,
        deletions: 2,
      },
      graph: {
        laneCount: 3,
        nodeLane: 2,
        nodeColor: "purple",
        segments: [
          line(0, 0, 1, "cyan"),
          line(1, 0, 1, "blue"),
          line(2, 0, 0.5, "purple"),
          curve(2, 0.5, 2, 0.8, 1, 1, "purple"),
        ],
      },
    },
    {
      id: "commit-8",
      sha: "d25aa1ff9a1c00d30d7d6a0622983219fdc92efa",
      shortSha: "d25aa1f",
      parents: ["commit-9"],
      subject: "Document source-neutral graph provider capabilities",
      author: {
        name: "Lena Morari",
        handle: "@lena",
        avatarUrl: LENA_AVATAR,
      },
      committedAt: "2026-04-03T19:01:00.000Z",
      refs: [
        {
          id: "ref-tag-031",
          name: "v0.31.4",
          kind: "tag",
          tone: "amber",
        },
      ],
      stats: {
        filesChanged: 1,
        additions: 4,
        deletions: 0,
      },
      graph: {
        laneCount: 3,
        nodeLane: 1,
        nodeColor: "blue",
        segments: [line(0, 0, 1, "cyan"), line(1, 0, 1, "blue")],
      },
    },
    {
      id: "commit-9",
      sha: "116e27ec8520cf5ef0c67ac8859df6bb64cab64d",
      shortSha: "116e27e",
      parents: ["commit-10"],
      subject: "Start fixture branch from main graph baseline",
      author: {
        name: "Nicu Popa",
        handle: "@nicu",
        avatarUrl: NICU_AVATAR,
        isCurrentUser: true,
      },
      committedAt: "2026-04-03T18:53:00.000Z",
      refs: [],
      stats: {
        filesChanged: 4,
        additions: 11,
        deletions: 3,
      },
      graph: {
        laneCount: 3,
        nodeLane: 1,
        nodeColor: "blue",
        segments: [
          line(0, 0, 1, "cyan"),
          line(1, 0, 0.5, "blue"),
          curve(1, 0.5, 1, 0.82, 0, 1, "blue"),
        ],
      },
    },
    {
      id: "commit-10",
      sha: "9a0b0c0f280f63892b7ff567388f78f8fb1b73bb",
      shortSha: "9a0b0c0",
      parents: ["commit-11"],
      subject: "Baseline repository graph surface before fixture work",
      author: {
        name: "Lena Morari",
        handle: "@lena",
        avatarUrl: LENA_AVATAR,
      },
      committedAt: "2026-04-03T18:46:00.000Z",
      refs: [
        {
          id: "ref-release",
          name: "release/0.31",
          kind: "remoteBranch",
          tone: "green",
        },
      ],
      stats: {
        filesChanged: 2,
        additions: 6,
        deletions: 1,
      },
      graph: {
        laneCount: 3,
        nodeLane: 0,
        nodeColor: "cyan",
        segments: [line(0, 0, 1, "cyan")],
      },
    },
  ] satisfies CommitGraphRenderedRow[],
};

export function CommitGraphVisualFixture({
  mode,
}: {
  mode: CommitGraphVisualMode;
}) {
  mode satisfies CommitGraphVisualMode;

  return (
    <div
      data-testid="commit-graph-visual-fixture"
      className="flex h-[760px] w-[1600px] items-stretch bg-[#111315] p-6"
    >
      <CommitGraphView
        page={COMMIT_GRAPH_FIXTURE_PAGE}
        className="h-full w-full"
      />
    </div>
  );
}
