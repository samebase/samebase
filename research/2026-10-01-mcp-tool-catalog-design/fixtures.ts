/**
Deterministic fixtures and provider-state model for the tool catalog evaluation.

The model mirrors the decisions the real handlers make (attachment statuses in
apps/samebase/convex/repository/contracts/cloudflareAttachments.ts and convexAttachments.ts, token
selection in apps/samebase/src/repository/setup/useCloudflareBuildTokens.ts, provider setup
polling in getUserRepositories.ts). It never calls a real provider.
*/

export type CodeLocation = {
  path: string;
  treeSha: string;
  packageJsonBlobSha: string;
};

export type AccountWorker = {
  name: string;
  tag: string;
  /** GitHub full name of the repository this Worker's Builds connection points at. */
  connectedRepo: string | null;
  root: string | null;
  /** repositoryId of the Samebase app that records this Worker. */
  attachedTo: string | null;
  buildTokenUuid: string | null;
  convexKeys: "configured" | "missing";
  lastBuild: "success" | "failure" | "none";
};

export type TeamProject = {
  projectId: string;
  name: string;
  deploymentName: string;
  region: string;
  prodDeployment: "available" | "missing";
  attachedTo: string | null;
};

export type AttachedWorker = { workerId: string; tag: string };
export type AttachedConvex = { convexProjectId: string; projectId: string; location: string };

export type SetupState =
  | { status: "ready" }
  | { status: "running" }
  | { status: "failed"; message: string }
  | { status: "not_applicable" };

export type App = {
  repositoryId: string;
  owner: string;
  name: string;
  githubRepositoryDatabaseId: string;
  cloudflareAccountId: string;
  sourceSetup: SetupState;
  providerSetup: SetupState;
  pendingCloudflare: { workerName: string; rootDirectory: string; convexProjectId: string } | null;
  workers: AttachedWorker[];
  convexProjects: AttachedConvex[];
  /** Reads left before a newly created app finishes setup. */
  pollsLeft: number;
  /** Planned managed resources while setup runs. */
  plan: { workerName: string | null; convexProjectName: string; region: string } | null;
  headCommit: { title: string; sha: string; checks: string };
  pullRequests: { number: number; title: string; checks: string }[];
};

export type State = {
  fixture: FixtureId;
  account: { email: string; role: string; owners: string[]; scopes: string[] };
  cloudflareAccountId: string;
  apps: App[];
  workers: AccountWorker[];
  projects: TeamProject[];
  tokens: { uuid: string; name: string }[];
  lastUsedTokenUuid: string | null;
  locations: Record<string, CodeLocation[]>;
  githubRepos: { fullName: string; databaseId: string }[];
  signInLinks: number;
  feedback: string[];
  counter: number;
  /** Confirmation tokens issued by two-step destructive tools (variant V4). */
  confirmations: string[];
};

export type FixtureId = "A" | "A_rotated" | "B" | "C" | "D";

const ACCOUNT = "9f2e4c1a7b3d5e6f8a9b0c1d2e3f4a5b";
const TOKEN_OLD = "5f0c2b7e-1d3a-4c8b-9e6f-0a1b2c3d4e5f";
const TOKEN_CI = "9b7e4d2c-6a1f-4e3b-8c5d-2f1e0d9c8b7a";
const TOKEN_NEW = "c3d1a9f0-7e2b-4d6c-a5f8-1b0e9d8c7a6f";
export const TOKENS = { TOKEN_OLD, TOKEN_CI, TOKEN_NEW };
export const APP2 = "jd7c1v8q2k9m3n4p5r6s7t8u9w0x1y2z";
const BLOG = "jd7b0a9z8y7x6w5v4u3t2s1r0q9p8o7n";
const FIRST = "jd79m2n3b4v5c6x7z8l9k0j1h2g3f4d5";

function reviewerFixture(): State {
  const app2: App = {
    repositoryId: APP2,
    owner: "samebase-live-tests",
    name: "tmp-my-cool-app2",
    githubRepositoryDatabaseId: "1048576211",
    cloudflareAccountId: ACCOUNT,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    pendingCloudflare: null,
    workers: [
      { workerId: "kx7w1attachedworker0000000000001", tag: "a1f0c9d8e7b6a5f4e3d2c1b0a9f8e7d6" },
    ],
    convexProjects: [
      {
        convexProjectId: "kn7p1attachedproject00000000001",
        projectId: "48211",
        location: "convex",
      },
    ],
    pollsLeft: 0,
    plan: null,
    headCommit: { title: "Add weather widget", sha: "4be1c09", checks: "success (3 of 3)" },
    pullRequests: [{ number: 14, title: "Add dark mode", checks: "pending (1 of 3 running)" }],
  };
  const blog: App = {
    repositoryId: BLOG,
    owner: "samebase-live-tests",
    name: "tmp-blog-demo",
    githubRepositoryDatabaseId: "1048576300",
    cloudflareAccountId: ACCOUNT,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    pendingCloudflare: null,
    workers: [
      { workerId: "kx7w2blogworker00000000000000001", tag: "b2e1d0c9f8a7b6c5d4e3f2a1b0c9d8e7" },
    ],
    convexProjects: [
      {
        convexProjectId: "kn7p2blogproject000000000000001",
        projectId: "48190",
        location: "convex",
      },
    ],
    pollsLeft: 0,
    plan: null,
    headCommit: { title: "Write first post", sha: "91aa0de", checks: "success (2 of 2)" },
    pullRequests: [],
  };
  const worker = (
    name: string,
    tag: string,
    connectedRepo: string | null,
    root: string | null,
    attachedTo: string | null,
  ): AccountWorker => ({
    name,
    tag,
    connectedRepo,
    root,
    attachedTo,
    buildTokenUuid: connectedRepo ? TOKEN_OLD : null,
    convexKeys: attachedTo ? "configured" : "missing",
    lastBuild: connectedRepo ? "success" : "none",
  });
  const workers: AccountWorker[] = [
    worker(
      "tmp-my-cool-app",
      "a1f0c9d8e7b6a5f4e3d2c1b0a9f8e7d6",
      "samebase-live-tests/tmp-my-cool-app2",
      "/",
      APP2,
    ),
    worker(
      "tmp-my-cool-app2-api",
      "c3a2b1f0e9d8c7b6a5f4e3d2c1b0a9f8",
      "samebase-live-tests/tmp-my-cool-app2",
      "api",
      null,
    ),
    worker("legacy-landing", "d4b3c2a1f0e9d8c7b6a5f4e3d2c1b0a9", null, null, null),
    worker("old-docs", "e5c4d3b2a1f0e9d8c7b6a5f4e3d2c1b0", null, null, null),
    worker(
      "shared-api",
      "b2e1d0c9f8a7b6c5d4e3f2a1b0c9d8e7",
      "samebase-live-tests/tmp-blog-demo",
      "/",
      BLOG,
    ),
    worker(
      "marketing-site",
      "f6d5e4c3b2a1f0e9d8c7b6a5f4e3d2c1",
      "samebase-live-tests/marketing",
      "/",
      null,
    ),
  ];
  for (let index = 1; index <= 6; index += 1) {
    workers.push(
      worker(
        `edge-proxy-${index}`,
        `0${index}d5e4c3b2a1f0e9d8c7b6a5f4e3d2c`,
        `samebase-live-tests/edge-${index}`,
        "/",
        null,
      ),
    );
  }
  for (let index = 1; index <= 3; index += 1) {
    workers.push(
      worker(
        `blog-cron-${index}`,
        `1${index}e5f4d3c2b1a0f9e8d7c6b5a4f3e2d`,
        "samebase-live-tests/tmp-blog-demo",
        `cron-${index}`,
        BLOG,
      ),
    );
  }
  return {
    fixture: "A",
    account: {
      email: "reviewer@samebase.dev",
      role: "member",
      owners: ["samebase-live-tests"],
      scopes: [
        "access_dashboard",
        "access_provider_connections",
        "access_app_create",
        "access_repo_connect",
        "access_browser_login_handoff",
        "access_feedback_submit",
      ],
    },
    cloudflareAccountId: ACCOUNT,
    apps: [app2, blog],
    workers,
    projects: [
      {
        projectId: "48211",
        name: "tmp-my-cool-app2",
        deploymentName: "happy-otter-123",
        region: "aws-us-east-1",
        prodDeployment: "available",
        attachedTo: APP2,
      },
      {
        projectId: "48190",
        name: "blog-demo",
        deploymentName: "quiet-heron-456",
        region: "aws-us-east-1",
        prodDeployment: "available",
        attachedTo: BLOG,
      },
      {
        projectId: "48230",
        name: "weather-data",
        deploymentName: "brave-lynx-789",
        region: "aws-us-east-1",
        prodDeployment: "available",
        attachedTo: null,
      },
      {
        projectId: "48231",
        name: "analytics-prod",
        deploymentName: "calm-finch-321",
        region: "aws-eu-west-1",
        prodDeployment: "available",
        attachedTo: null,
      },
      {
        projectId: "48232",
        name: "scratch-project",
        deploymentName: "",
        region: "aws-us-east-1",
        prodDeployment: "missing",
        attachedTo: null,
      },
    ],
    tokens: [
      { uuid: TOKEN_OLD, name: "Samebase Workers Builds" },
      { uuid: TOKEN_CI, name: "CI token 2025" },
    ],
    lastUsedTokenUuid: TOKEN_OLD,
    locations: {
      "samebase-live-tests/tmp-my-cool-app2": [
        {
          path: "convex",
          treeSha: "3f9a2c7e1b5d8f0a4c6e9b2d7f1a3c5e8b0d2f4a",
          packageJsonBlobSha: "b71c4e9a2f6d0b8c3e5a7f1d9b2c4e6a8f0b3d5c",
        },
      ],
      "samebase-live-tests/tmp-blog-demo": [
        {
          path: "convex",
          treeSha: "7d1e3f5a9c2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f",
          packageJsonBlobSha: "2a4c6e8f0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a",
        },
      ],
    },
    githubRepos: [{ fullName: "samebase-live-tests/legacy-portfolio", databaseId: "912345678" }],
    signInLinks: 0,
    feedback: [],
    counter: 0,
    confirmations: [],
  };
}

/** Fixture A where tmp-blog-demo's Worker shared-api lost its Convex deploy key, so repair rotates keys. */
function destructiveFixture(): State {
  const state = reviewerFixture();
  state.fixture = "D";
  for (const worker of state.workers) {
    if (worker.name === "shared-api") {
      worker.convexKeys = "missing";
      worker.lastBuild = "failure";
    }
  }
  return state;
}

function rotatedTokenFixture(): State {
  const state = reviewerFixture();
  state.fixture = "A_rotated";
  // The user deleted the old token in Cloudflare and created a new one.
  state.tokens = [{ uuid: TOKEN_NEW, name: "Samebase Workers Builds 2026" }];
  state.lastUsedTokenUuid = null;
  for (const worker of state.workers) {
    if (worker.name === "tmp-my-cool-app") worker.lastBuild = "failure";
  }
  return state;
}

function newAccountFixture(): State {
  return {
    fixture: "B",
    account: {
      email: "dana@example.com",
      role: "owner",
      owners: ["dana-builds"],
      scopes: [
        "access_dashboard",
        "access_provider_connections",
        "access_app_create",
        "access_repo_connect",
        "access_browser_login_handoff",
        "access_feedback_submit",
      ],
    },
    cloudflareAccountId: "2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a",
    apps: [],
    workers: [],
    projects: [],
    tokens: [],
    lastUsedTokenUuid: null,
    locations: {},
    githubRepos: [],
    signInLinks: 0,
    feedback: [],
    counter: 0,
    confirmations: [],
  };
}

function pendingSetupFixture(): State {
  const state = newAccountFixture();
  state.fixture = "C";
  const repositoryId = FIRST;
  state.apps.push({
    repositoryId,
    owner: "dana-builds",
    name: "tmp-first-app",
    githubRepositoryDatabaseId: "1077001122",
    cloudflareAccountId: state.cloudflareAccountId,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    pendingCloudflare: {
      workerName: "tmp-first-app",
      rootDirectory: "/",
      convexProjectId: "kn7p9firstproject00000000000001",
    },
    workers: [],
    convexProjects: [
      {
        convexProjectId: "kn7p9firstproject00000000000001",
        projectId: "51001",
        location: "convex",
      },
    ],
    pollsLeft: 0,
    plan: null,
    headCommit: {
      title: "Initial commit from Samebase starter",
      sha: "0c1d2e3",
      checks: "success (2 of 2)",
    },
    pullRequests: [],
  });
  state.projects.push({
    projectId: "51001",
    name: "tmp-first-app",
    deploymentName: "eager-panda-111",
    region: "aws-us-east-1",
    prodDeployment: "available",
    attachedTo: repositoryId,
  });
  state.locations["dana-builds/tmp-first-app"] = [
    {
      path: "convex",
      treeSha: "8e0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f",
      packageJsonBlobSha: "4c6e8a0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c",
    },
  ];
  state.tokens = [{ uuid: TOKEN_NEW, name: "Workers Builds - tmp-first-app" }];
  return state;
}

export function buildFixture(id: FixtureId): State {
  switch (id) {
    case "A":
      return reviewerFixture();
    case "A_rotated":
      return rotatedTokenFixture();
    case "B":
      return newAccountFixture();
    case "C":
      return pendingSetupFixture();
    case "D":
      return destructiveFixture();
    default:
      return id satisfies never;
  }
}

// Domain operations shared by every design. Errors carry the message a real handler would return.

export function fullName(app: App): string {
  return `${app.owner}/${app.name}`;
}

export function findApp(state: State, reference: string): App {
  const trimmed = reference.trim().replace(/^https:\/\/github\.com\//, "");
  const app = state.apps.find(
    (candidate) =>
      candidate.repositoryId === trimmed ||
      fullName(candidate).toLowerCase() === trimmed.toLowerCase(),
  );
  if (!app) {
    const byName = state.apps.filter(
      (candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (byName.length === 1) return byName[0];
    throw new Error(
      `No Samebase app matches "${reference}". Known apps: ${state.apps.map(fullName).join(", ") || "none"}.`,
    );
  }
  return app;
}

export function findAppById(state: State, repositoryId: string): App {
  const app = state.apps.find((candidate) => candidate.repositoryId === repositoryId);
  if (!app) throw new Error(`Repository ${repositoryId} was not found or is not accessible.`);
  return app;
}

/** Each read of an app advances a newly created app's setup by one step. */
export function advance(app: App): void {
  if (app.pollsLeft <= 0) return;
  app.pollsLeft -= 1;
  if (app.pollsLeft === 1) {
    app.sourceSetup = { status: "ready" };
    app.providerSetup = { status: "running" };
  }
  if (app.pollsLeft === 0) {
    app.providerSetup = { status: "ready" };
  }
}

export type WorkerAttachment =
  | "attached"
  | "attached_elsewhere"
  | "attachable"
  | "connectable"
  | "connected_elsewhere";

export function workerAttachment(app: App, worker: AccountWorker): WorkerAttachment {
  if (worker.attachedTo === app.repositoryId) return "attached";
  if (worker.attachedTo) return "attached_elsewhere";
  if (worker.connectedRepo === fullName(app)) return "attachable";
  if (worker.connectedRepo === null) return "connectable";
  return "connected_elsewhere";
}

export function findAccountWorker(state: State, name: string): AccountWorker | undefined {
  return state.workers.find((worker) => worker.name.toLowerCase() === name.trim().toLowerCase());
}

export function attachedWorkerRows(state: State, app: App) {
  return app.workers.map((attached) => {
    const worker = state.workers.find((candidate) => candidate.tag === attached.tag);
    return {
      workerId: attached.workerId,
      workerName: worker?.name ?? "unknown",
      workerTag: attached.tag,
      rootDirectory: worker?.root ?? "/",
    };
  });
}

export function nextId(state: State, prefix: string): string {
  state.counter += 1;
  return `${prefix}${String(state.counter).padStart(32 - prefix.length, "0")}`;
}

export class ChoiceNeeded extends Error {}

/**
Server-side token choice used by the workflow and hybrid designs: the given UUID, else the
available last-used token, else the only token. Several tokens with no last-used one need a user
choice. No token returns null.
*/
export function chooseToken(state: State, given: string | undefined | null): string | null {
  if (given) {
    if (!state.tokens.some((token) => token.uuid === given)) {
      throw new Error(
        `Workers Builds token ${given} is not in Cloudflare's current list. Current tokens: ${state.tokens.map((token) => `${token.name} (${token.uuid})`).join(", ") || "none"}.`,
      );
    }
    return given;
  }
  const lastUsed = state.tokens.find((token) => token.uuid === state.lastUsedTokenUuid);
  if (lastUsed) return lastUsed.uuid;
  if (state.tokens.length === 1) return state.tokens[0].uuid;
  if (state.tokens.length === 0) return null;
  throw new ChoiceNeeded(
    `Choose a Workers Builds token: several exist and none was used before: ${state.tokens.map((token) => `${token.name} (${token.uuid})`).join(", ")}. Ask the user which one, then call again with buildTokenUuid.`,
  );
}

export function requireToken(state: State, uuid: string): void {
  if (!state.tokens.some((token) => token.uuid === uuid)) {
    throw new Error(
      `The selected Cloudflare Workers Builds token is not in Cloudflare's current list: ${uuid}.`,
    );
  }
}

export function attachWorker(state: State, app: App, worker: AccountWorker): string {
  const status = workerAttachment(app, worker);
  if (status !== "attachable") {
    throw new Error(
      `Cloudflare Worker ${worker.name} is ${status}; only attachable Workers can be attached.`,
    );
  }
  worker.attachedTo = app.repositoryId;
  const workerId = nextId(state, "kx7w");
  app.workers.push({ workerId, tag: worker.tag });
  return workerId;
}

export function connectWorker(
  state: State,
  app: App,
  worker: AccountWorker,
  root: string,
  token: string,
): string {
  const status = workerAttachment(app, worker);
  if (status !== "connectable") {
    throw new Error(
      `Cloudflare Worker ${worker.name} is ${status}; only connectable Workers can be connected.`,
    );
  }
  requireToken(state, token);
  worker.connectedRepo = fullName(app);
  worker.root = root;
  worker.attachedTo = app.repositoryId;
  worker.buildTokenUuid = token;
  worker.lastBuild = "success";
  state.lastUsedTokenUuid = token;
  const workerId = nextId(state, "kx7w");
  app.workers.push({ workerId, tag: worker.tag });
  return workerId;
}

export function createWorker(
  state: State,
  app: App,
  name: string,
  root: string,
  token: string,
): { workerId: string; worker: AccountWorker } {
  if (findAccountWorker(state, name)) {
    throw new Error(
      `A Cloudflare Worker named ${name} already exists in this account. Choose another name.`,
    );
  }
  requireToken(state, token);
  const worker: AccountWorker = {
    name,
    tag: `${String(state.counter + 1).padStart(4, "0")}9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c`,
    connectedRepo: fullName(app),
    root,
    attachedTo: app.repositoryId,
    buildTokenUuid: token,
    convexKeys: "missing",
    lastBuild: "success",
  };
  state.workers.push(worker);
  state.lastUsedTokenUuid = token;
  const workerId = nextId(state, "kx7w");
  app.workers.push({ workerId, tag: worker.tag });
  if (app.pendingCloudflare && app.pendingCloudflare.workerName === name)
    app.pendingCloudflare = null;
  return { workerId, worker };
}

export function workerById(state: State, app: App, workerId: string): AccountWorker {
  const attached = app.workers.find((candidate) => candidate.workerId === workerId);
  const worker = attached && state.workers.find((candidate) => candidate.tag === attached.tag);
  if (!worker)
    throw new Error(`Worker attachment ${workerId} is not attached to ${fullName(app)}.`);
  return worker;
}

export function configureBuilds(
  state: State,
  app: App,
  workerId: string,
  root: string,
  token: string,
): void {
  const worker = workerById(state, app, workerId);
  requireToken(state, token);
  worker.root = root;
  worker.connectedRepo = fullName(app);
  worker.buildTokenUuid = token;
  worker.lastBuild = "success";
  state.lastUsedTokenUuid = token;
}

export function rotateKeys(
  state: State,
  app: App,
  workerId: string,
  convexProjectId: string,
): void {
  const worker = workerById(state, app, workerId);
  const attached = app.convexProjects.find(
    (candidate) => candidate.convexProjectId === convexProjectId,
  );
  if (!attached)
    throw new Error(
      `Convex project attachment ${convexProjectId} is not attached to ${fullName(app)}.`,
    );
  const project = state.projects.find((candidate) => candidate.projectId === attached.projectId);
  if (!project || project.prodDeployment !== "available") {
    throw new Error("The selected Convex project has no production deployment.");
  }
  worker.convexKeys = "configured";
  worker.lastBuild = "success";
}

export function detachWorker(state: State, app: App, workerId: string): void {
  const worker = workerById(state, app, workerId);
  worker.attachedTo = null;
  app.workers = app.workers.filter((candidate) => candidate.workerId !== workerId);
}

export type ConvexAttachment =
  | "attached"
  | "attached_elsewhere"
  | "attachable"
  | "needs_production_deployment";

export function convexAttachment(app: App, project: TeamProject): ConvexAttachment {
  if (project.attachedTo === app.repositoryId) return "attached";
  if (project.attachedTo) return "attached_elsewhere";
  if (project.prodDeployment !== "available") return "needs_production_deployment";
  return "attachable";
}

export function findProject(state: State, reference: string): TeamProject | undefined {
  const trimmed = reference.trim().toLowerCase();
  return state.projects.find(
    (project) => project.projectId === trimmed || project.name.toLowerCase() === trimmed,
  );
}

export function attachConvex(
  state: State,
  app: App,
  project: TeamProject,
  location: string,
): string {
  const status = convexAttachment(app, project);
  if (status !== "attachable") {
    throw new Error(
      `Convex project ${project.name} is ${status}; only attachable projects can be attached.`,
    );
  }
  project.attachedTo = app.repositoryId;
  const convexProjectId = nextId(state, "kn7p");
  app.convexProjects.push({ convexProjectId, projectId: project.projectId, location });
  return convexProjectId;
}

export function createConvexProject(
  state: State,
  app: App,
  name: string,
  region: string,
  location: string,
): string {
  if (state.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(
      `A Convex project named ${name} already exists in this team. Choose another name.`,
    );
  }
  const project: TeamProject = {
    projectId: String(52000 + state.counter),
    name,
    deploymentName: "fresh-otter-999",
    region,
    prodDeployment: "available",
    attachedTo: null,
  };
  state.projects.push(project);
  return attachConvex(state, app, project, location);
}

export function detachConvex(state: State, app: App, convexProjectId: string): void {
  const attached = app.convexProjects.find(
    (candidate) => candidate.convexProjectId === convexProjectId,
  );
  if (!attached)
    throw new Error(
      `Convex project attachment ${convexProjectId} is not attached to ${fullName(app)}.`,
    );
  const project = state.projects.find((candidate) => candidate.projectId === attached.projectId);
  if (project) project.attachedTo = null;
  app.convexProjects = app.convexProjects.filter(
    (candidate) => candidate.convexProjectId !== convexProjectId,
  );
}

export function createApp(
  state: State,
  args: {
    owner: string;
    name: string;
    convexProjectName: string;
    region: string;
    workerName: string;
    token: string | null;
    isPrivate: boolean;
  },
): App {
  if (!state.account.owners.includes(args.owner)) {
    throw new Error(
      `GitHub owner ${args.owner} is not connected to a Samebase organization for this account. Connected owners: ${state.account.owners.join(", ")}.`,
    );
  }
  if (
    state.apps.some(
      (app) => fullName(app).toLowerCase() === `${args.owner}/${args.name}`.toLowerCase(),
    )
  ) {
    throw new Error(
      `A GitHub repository named ${args.owner}/${args.name} already exists. Choose another name.`,
    );
  }
  if (args.token) requireToken(state, args.token);
  const repositoryId = nextId(state, "jd7n");
  const app: App = {
    repositoryId,
    owner: args.owner,
    name: args.name,
    githubRepositoryDatabaseId: String(1100000000 + state.counter),
    cloudflareAccountId: state.cloudflareAccountId,
    sourceSetup: { status: "running" },
    providerSetup: { status: "not_applicable" },
    pendingCloudflare: null,
    workers: [],
    convexProjects: [],
    pollsLeft: 2,
    plan: {
      workerName: args.token ? args.workerName : null,
      convexProjectName: args.convexProjectName,
      region: args.region,
    },
    headCommit: {
      title: "Initial commit from Samebase starter",
      sha: "a0b1c2d",
      checks: "success (2 of 2)",
    },
    pullRequests: [],
  };
  state.apps.push(app);
  state.locations[fullName(app)] = [
    {
      path: "convex",
      treeSha: "6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d",
      packageJsonBlobSha: "0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b",
    },
  ];
  return app;
}

/** Applies the managed provider plan once a created app's polling finishes. */
export function settle(state: State, app: App): void {
  if (app.pollsLeft > 0 || !app.plan) return;
  const plan = app.plan;
  app.plan = null;
  const project: TeamProject = {
    projectId: String(53000 + state.counter),
    name: plan.convexProjectName,
    deploymentName: "new-heron-222",
    region: plan.region,
    prodDeployment: "available",
    attachedTo: app.repositoryId,
  };
  state.projects.push(project);
  const convexProjectId = nextId(state, "kn7p");
  app.convexProjects.push({ convexProjectId, projectId: project.projectId, location: "convex" });
  if (plan.workerName) {
    const token = state.lastUsedTokenUuid ?? state.tokens.at(0)?.uuid ?? null;
    const worker: AccountWorker = {
      name: plan.workerName,
      tag: `${String(state.counter + 7).padStart(4, "0")}1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d`,
      connectedRepo: fullName(app),
      root: "/",
      attachedTo: app.repositoryId,
      buildTokenUuid: token,
      convexKeys: "configured",
      lastBuild: "success",
    };
    state.workers.push(worker);
    app.workers.push({ workerId: nextId(state, "kx7w"), tag: worker.tag });
  } else {
    app.pendingCloudflare = { workerName: app.name, rootDirectory: "/", convexProjectId };
  }
}

export function readApp(state: State, app: App): void {
  advance(app);
  settle(state, app);
}

export type Attention = { problem: string; fix: string };

/** What the workflow and hybrid status reads report, computed from provider state on the server. */
export function attention(state: State, app: App): Attention[] {
  const items: Attention[] = [];
  if (app.sourceSetup.status === "failed" || app.providerSetup.status === "failed") {
    items.push({ problem: "Setup failed.", fix: "repair" });
  }
  if (app.pendingCloudflare && app.workers.length === 0) {
    items.push(
      state.tokens.length > 0
        ? {
            problem: `Cloudflare setup is pending: Worker ${app.pendingCloudflare.workerName} is not created yet. A Workers Builds token is now available.`,
            fix: "repair",
          }
        : {
            problem:
              "Cloudflare setup is pending: the Cloudflare account has no Workers Builds token. The user must create one through Cloudflare's repository setup: https://samebase.com/docs/cloudflare-setup",
            fix: "user",
          },
    );
  }
  for (const row of attachedWorkerRows(state, app)) {
    const worker = state.workers.find((candidate) => candidate.tag === row.workerTag);
    if (!worker) continue;
    if (
      worker.buildTokenUuid &&
      !state.tokens.some((token) => token.uuid === worker.buildTokenUuid)
    ) {
      items.push({
        problem: `Worker ${worker.name}: its Workers Builds token was deleted in Cloudflare, so builds cannot start.`,
        fix: "repair",
      });
    }
    if (app.convexProjects.length > 0 && worker.convexKeys !== "configured") {
      items.push({
        problem: `Worker ${worker.name}: Workers Builds has no Convex deploy key.`,
        fix: "repair",
      });
    }
  }
  return items;
}

export function liveStatus(state: State, app: App) {
  return {
    app: fullName(app),
    setup: { source: app.sourceSetup.status, provider: app.providerSetup.status },
    defaultBranch: {
      name: "main",
      headCommit: { title: app.headCommit.title, sha: app.headCommit.sha },
      checks: app.headCommit.checks,
    },
    production: {
      workers: attachedWorkerRows(state, app).map((row) => {
        const worker = state.workers.find((candidate) => candidate.tag === row.workerTag);
        const failed = worker?.lastBuild === "failure";
        return {
          workerName: row.workerName,
          rootDirectory: row.rootDirectory,
          url: `https://${row.workerName}.${app.owner}.workers.dev`,
          lastProductionBuild:
            worker?.lastBuild === "none"
              ? { state: "absent" }
              : failed
                ? {
                    state: "failure",
                    commit: app.headCommit.sha,
                    message: "Build could not start: Workers Builds token not found.",
                  }
                : { state: "success", commit: app.headCommit.sha },
        };
      }),
      convexProjects: app.convexProjects.map((attached) => {
        const project = state.projects.find(
          (candidate) => candidate.projectId === attached.projectId,
        );
        return {
          projectName: project?.name ?? "unknown",
          codeLocation: attached.location,
          deployment:
            project && project.prodDeployment === "available"
              ? { state: "available", name: project.deploymentName, region: project.region }
              : { state: "missing" },
        };
      }),
    },
    pullRequests: { openCount: app.pullRequests.length, items: app.pullRequests },
  };
}
