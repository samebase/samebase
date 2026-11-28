// The script of the film: every named time in seconds, and the words it shows.
//
// Sources of the words (grep them before changing one):
// - Captions: apps/samebase/src/content/docs-the-big-migration.md ("What Samebase is", "How it
//   works") and LANDING_STEPS and the "How it works" intro in
//   apps/samebase/src/components/LandingPreviewPage.tsx.
// - The stack: /Users/nicu/dev/samebase/base/alchemy.run.ts, the `prod` path, shortened.
// - The run: .github/workflows/alchemy-deploy.yml (workflow, job and step names, the Deploy command).
// - The store: alchemy-convex src/store/component/schema.ts (`resources (stack, stage, fqn,
//   value)`, `outputs (stack, stage, value, currentRun)`), src/RunRecord.ts, and Alchemy's
//   ResourceState (`resourceType`, `status: "creating" | "created"`).
// - The dashboard: apps/samebase/src/repository/dashboard/RepositoryEnvironmentTree.tsx and the
//   repository-overview-v2 visual snapshots.

export const FPS = 60;
export const DURATION = 32.5;

// 1. The stack file.
export const OPEN_AT = 0;
export const CAPTION_FILE_AT = 0.25;
export const HEADER_FROM = 0.35;
export const HEADER_TO = 0.95;
export const OPINION_AT = 1.35;
export const BODY_FROM = 1.85;
/** Typing speed of the body: a person reads it after, nobody waits for it. */
export const CPS = 115;
/** The pause between two typed statements. */
export const STATEMENT_GAP = 0.32;

// 2. The push and the run.
export const TERMINAL_AT = 7.85;
export const PUSH_TYPE_FROM = 8.05;
export const PUSH_TYPE_TO = 8.55;
export const PUSHED_AT = 8.8;
export const CAPTION_RUN_AT = 8.2;
export const RUN_IN_FROM = 9.25;
export const RUN_IN_TO = 9.8;
export const CHANGES_DONE = 9.85;
export const RUN_DONE_AT = 14.2;

// 3. The state store.
export const PAN_FROM = 15.1;
export const PAN_TO = 16.4;
export const CAPTION_STATE_AT = 15.3;
export const TABLE_IN = 16.0;
/** A dot travels the thread from a card to its row for this long before the row is written. */
export const THREAD_TRAVEL = 0.35;
export const OUTPUT_WRITTEN = 18.4;

// 4. Samebase reads the store. The output row lights up and opens into the Samebase app.
export const CAPTION_READ_AT = 20.3;
export const ROW_LIGHT_AT = 20.6;
export const REVEAL_FROM = 21.15;
export const REVEAL_TO = 22.05;
export const LOADING_TO = 22.55;
export const APPS_IN = [22.6, 22.75, 22.9] as const;
/** The camera of the app: the whole app, then in on the stack of pantry, then back. */
export const PUSH_FROM = 23.75;
export const PUSH_TO = 24.55;
export const BACK_FROM = 25.3;
export const BACK_TO = 25.9;
export const CAPTION_ANY_AT = 25.3;
export const SELECT_LEDGER_AT = 25.75;
export const LEDGER_LOADING_TO = 26.15;
/** Then to the stack of ledger on the left, with its code on the right. */
export const LEDGER_SHOT_FROM = 26.15;
export const LEDGER_SHOT_TO = 26.95;
export const INSET_IN = 26.65;
export const CLOUDFLARE_ROWS_AT = 27.0;

// 5. The end card.
export const END_FROM = 29.7;
export const END_TO = 30.15;

export const CAPTIONS = [
  {
    at: CAPTION_FILE_AT,
    until: CAPTION_RUN_AT,
    title: "You describe your app in alchemy.run.ts.",
    sub: "Alchemy deploys your app from one file.",
  },
  {
    at: CAPTION_RUN_AT,
    until: CAPTION_STATE_AT,
    title: "GitHub Actions deploys it.",
    sub: "Alchemy creates the Convex project and the site. About 90 seconds.",
  },
  {
    at: CAPTION_STATE_AT,
    until: CAPTION_READ_AT,
    title: "Alchemy records each resource in the state store.",
    sub: "In Convex, in a project called alchemy-state-store on your team.",
  },
  {
    at: CAPTION_READ_AT,
    until: CAPTION_ANY_AT,
    title: "Samebase reads the store and shows you the stack.",
    sub: "One OAuth token, no expiry, nothing to paste.",
  },
  {
    at: CAPTION_ANY_AT,
    until: END_FROM,
    title: "Cloudflare stays available.",
    sub: "Declare a Worker in your stack. Alchemy deploys it, Samebase reads it.",
  },
] as const;

type Resource = {
  name: string;
  type: string;
  fqn: string;
  attrKey: string;
  attr: string;
  icon: "convex" | "key" | "globe";
  /** [creating from, created at] in the run. */
  run: readonly [number, number];
  /** When its row is written into the store. */
  written: number;
};

type Statement = { lines: readonly string[]; resource: Resource | null };

/** The stack file, shortened from the starter to its resource calls. A comment marks each cut. */
const HEADER = [
  'import * as Alchemy from "alchemy";',
  'import * as Convex from "@samebase/alchemy-convex";',
  'import * as IdentityHub from "@samebase/alchemy-convex/identity-hub";',
  "",
  "export default Alchemy.Stack(",
  '  repository, // "acme/pantry"',
  "  {",
  "    providers: Convex.providers(),",
  "    state: Convex.withRunRecord(Convex.state()),",
  "  },",
  "  Effect.gen(function* () {",
] as const;

/** The line of `state:`, the opinion. */
export const STATE_LINE = 8;
export const STATE_LINE_LENGTH = HEADER[STATE_LINE].length;

const BODY: readonly Statement[] = [
  {
    lines: [
      '    const project = yield* Convex.Project("Project", {',
      "      name: projectName,",
      "    });",
    ],
    resource: {
      name: "Convex project",
      type: "Convex.Project",
      fqn: "Project",
      attrKey: "name",
      attr: "pantry",
      icon: "convex",
      run: [11.05, 11.7],
      written: 16.75,
    },
  },
  {
    lines: [
      '    const deployment = yield* Convex.Deployment("Deployment", {',
      '      project, type: "prod", source,',
      "    });",
    ],
    resource: {
      name: "Production deployment",
      type: "Convex.Deployment",
      fqn: "Deployment",
      attrKey: "name",
      attr: "quiet-heron-412",
      icon: "convex",
      run: [11.7, 12.95],
      written: 17.1,
    },
  },
  {
    lines: [
      '    const client = yield* IdentityHub.Client("IdentityHubClient", {',
      '      hub: HUB, connectors: ["google", "github"], /* … */',
      "    });",
    ],
    resource: {
      name: "Google sign-in client",
      type: "IdentityHub.Client",
      fqn: "IdentityHubClient",
      attrKey: "status",
      attr: "on",
      icon: "key",
      run: [12.95, 13.4],
      written: 17.45,
    },
  },
  {
    lines: [
      '    const site = yield* Convex.Deployment("Site", {',
      '      project, type: "prod", env,',
      "    });",
    ],
    resource: {
      name: "Site",
      type: "Convex.Deployment",
      fqn: "Site",
      attrKey: "siteUrl",
      attr: "quiet-heron-412.convex.site",
      icon: "globe",
      run: [13.4, 13.95],
      written: 17.8,
    },
  },
  { lines: ["    return { url: site.siteUrl };", "  }),", ");"], resource: null },
];

export type CodeLine = { text: string; from: number; to: number; header: boolean };

/** A resource with where the code declares it and when its card is born. */
export type StackResource = Resource & { line: number; lineLength: number; born: number };

const schedule = () => {
  const lines: CodeLine[] = HEADER.map((text, index) => {
    const at = HEADER_FROM + ((HEADER_TO - HEADER_FROM) * index) / HEADER.length;
    return { text, from: at, to: at, header: true };
  });
  const resources: StackResource[] = [];
  let clock = BODY_FROM;
  for (const statement of BODY) {
    const line = lines.length;
    for (const text of statement.lines) {
      const length = text.trimStart().length;
      const from = clock;
      clock += length / CPS;
      lines.push({ text, from, to: clock, header: false });
      clock += 0.04;
    }
    if (statement.resource) {
      resources.push({
        ...statement.resource,
        line,
        lineLength: statement.lines.reduce((first, text) => first || text.length, 0),
        born: clock + 0.04,
      });
    }
    clock += STATEMENT_GAP;
  }
  return { lines, resources, typingEnd: clock - STATEMENT_GAP };
};

const SCHEDULE = schedule();
export const CODE: readonly CodeLine[] = SCHEDULE.lines;
export const STACK: readonly StackResource[] = SCHEDULE.resources;
export const TYPING_END = SCHEDULE.typingEnd;

/** The named steps of the job "Deploy production" in alchemy-deploy.yml, and when each is done. */
export const RUN_STEPS = [
  { name: "Set up job", from: 9.65, done: 9.95 },
  { name: "Run actions/checkout@3d3c42e", from: 9.95, done: 10.1 },
  { name: "Run pnpm/action-setup@0977fd9", from: 10.1, done: 10.25 },
  { name: "Run actions/setup-node@949feb2", from: 10.25, done: 10.4 },
  { name: "Install dependencies", from: 10.4, done: 10.65 },
  { name: "Find the installed tools", from: 10.65, done: 10.75 },
  { name: "Check that this run is still current", from: 10.75, done: 10.95 },
  { name: "Deploy", from: 10.95, done: 14.15 },
] as const;

export const DEPLOY_STEP_FROM = 10.95;

export const DEPLOY_LOG = [
  'Run $TOOLS/alchemy deploy --stage "$STAGE" --yes --no-input $ADOPT $DRIFT',
  "  env:",
  "    STAGE: prod",
  "    CONVEX_ACCESS_TOKEN: ***",
] as const;

export const COMMIT = { sha: "4f2a9c1", message: "Initial commit" } as const;

/** The one row of `outputs`: the stage output with its run record. */
export const OUTPUT_ROW = [
  "acme/pantry",
  "prod",
  '{"url":"https://quiet-heron-412.convex.site"}',
  `{ branch: "main", headCommit: "${COMMIT.sha}…", … }`,
] as const;
