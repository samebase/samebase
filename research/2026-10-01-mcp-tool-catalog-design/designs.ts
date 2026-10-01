/**
Candidate Samebase MCP catalogs for the evaluation.

P: primitive mirror (RFC 125 draft, 21 tools).
W: workflow level (12 tools); the server resolves attach, connect, or create.
H: hybrid (15 tools); reads separate from writes, one risk level per write, server-side choices.

Descriptions may reference other tools as {{key}}. renderCatalog() substitutes the scheme's names.
*/
import {
  APP2,
  ChoiceNeeded,
  attachConvex,
  attachWorker,
  attachedWorkerRows,
  attention,
  chooseToken,
  configureBuilds,
  connectWorker,
  convexAttachment,
  createApp,
  createConvexProject,
  createWorker,
  detachConvex,
  detachWorker,
  findAccountWorker,
  findApp,
  findAppById,
  findProject,
  fullName,
  liveStatus,
  readApp,
  requireToken,
  rotateKeys,
  workerAttachment,
  type App,
  type State,
} from "./fixtures.ts";

export type Scheme = "A" | "B" | "C" | "D" | "E";
export const SCHEMES: readonly Scheme[] = ["A", "B", "C", "D", "E"];
export type DesignId = "P" | "W" | "H";
export type Annotations = {
  readOnlyHint: boolean;
  openWorldHint: boolean;
  destructiveHint: boolean;
};
export type JsonSchema = { [key: string]: unknown };
export type Args = { [key: string]: unknown };
export type Handler = (state: State, args: Args, names: Record<string, string>) => unknown;

export type ToolSpec = {
  key: string;
  names: Record<Scheme, string>;
  description: string;
  /** Lead sentence used by the "Use this when" description condition. */
  when: string;
  inputSchema: JsonSchema;
  annotations: Annotations;
  output: string;
  dashboard: string;
  handler: Handler;
};

export type Design = { id: DesignId; label: string; instructions: string; tools: ToolSpec[] };

const RO: Annotations = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };
const WRITE_CLOSED: Annotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: false,
};
const WRITE_OPEN: Annotations = {
  readOnlyHint: false,
  openWorldHint: true,
  destructiveHint: false,
};
const DESTRUCTIVE_OPEN: Annotations = {
  readOnlyHint: false,
  openWorldHint: true,
  destructiveHint: true,
};
const DESTRUCTIVE_CLOSED: Annotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: true,
};

function str(description: string): JsonSchema {
  return { type: "string", description };
}
function object(properties: { [key: string]: JsonSchema }, required: string[]): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

function readString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`Missing required argument ${key}.`);
  return value.trim();
}
function readOptionalString(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`Argument ${key} must be a string.`);
  return value.trim();
}
function readArray(args: Args, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`Argument ${key} must be a non-empty array.`);
  return value;
}
function readRecord(value: unknown, label: string): Args {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const record: Args = {};
  for (const [key, entry] of Object.entries(value)) record[key] = entry;
  return record;
}
function rejectUnknown(args: Args, schema: JsonSchema): void {
  const properties = readRecord(schema.properties ?? {}, "schema");
  for (const key of Object.keys(args)) {
    if (!(key in properties)) throw new Error(`Unknown argument ${key}.`);
  }
}

const REGIONS = ["aws-us-east-1", "aws-eu-west-1", "aws-ca-central-1", "aws-ap-southeast-2"];
const regionSchema: JsonSchema = {
  type: "string",
  enum: REGIONS,
  description:
    "Optional Convex production region. Omit it to use the organization default (US East when none is saved). EU usage costs 1.3 times US usage, and included plan usage does not apply to EU deployments; say so before choosing EU.",
};
function readRegion(args: Args, key: string): string {
  const region = readOptionalString(args, key) ?? "aws-us-east-1";
  if (!REGIONS.includes(region))
    throw new Error(`Unknown region ${region}. Use one of ${REGIONS.join(", ")}.`);
  return region;
}

// Shared session tools. Same behavior in every design.

const accountStatus: Handler = (state) => ({
  account: { email: state.account.email },
  role: state.account.role,
  githubOwners: state.account.owners,
  scopes: state.account.scopes,
});
const signInLink: Handler = (state, args) => {
  state.signInLinks += 1;
  const path = readOptionalString(args, "returnToPath") ?? "/";
  return {
    url: `https://samebase.com/handoff/7Qx${state.signInLinks}Lr2Vb9?next=${encodeURIComponent(path)}`,
    expiresAt: "in 5 minutes",
  };
};
const feedback: Handler = (state, args) => {
  state.feedback.push(readString(args, "report"));
  return { status: "sent" };
};

const sessionDescriptions = {
  auth: "Read the caller's current Samebase MCP authentication state: account identity, role, the GitHub owners it can manage, and granted OAuth scopes.",
  signIn:
    "Create a one-time Samebase browser sign-in URL for the current user, optionally opening a given dashboard page. Show the returned URL to the user as a clickable link. It expires after 5 minutes. Keep the link private. Only claim that the dashboard opened when a browser action confirms it.",
  feedback:
    "Email one feedback report to Samebase staff. After a clear Samebase product or plugin problem, draft a short report that states what the user tried, what happened, and what should improve. Show the exact report and say that you can send it automatically with no form. Call only after the user approves that exact text. A direct request to send specified feedback is approval. Call once and do not retry unless the user asks. Do not include credentials, file contents, full logs, or unrelated conversation.",
};

function sessionTools(nouns: {
  auth: Record<Scheme, string>;
  signIn: Record<Scheme, string>;
  feedback: Record<Scheme, string>;
}): ToolSpec[] {
  return [
    {
      key: "auth_status",
      names: nouns.auth,
      description: sessionDescriptions.auth,
      when: "Use this when the user asks which Samebase account or organizations this connection uses or what it can access.",
      inputSchema: object({}, []),
      annotations: RO,
      output: "account email, role, GitHub owners, scopes",
      dashboard: "none (MCP session only)",
      handler: accountStatus,
    },
    {
      key: "sign_in_link",
      names: nouns.signIn,
      description: sessionDescriptions.signIn,
      when: "Use this when the user wants to open the Samebase dashboard, or accepts your offer to open it for a dashboard-only task.",
      inputSchema: object(
        {
          returnToPath: str(
            "Optional Samebase-relative path to open after sign-in. Defaults to the dashboard.",
          ),
        },
        [],
      ),
      annotations: WRITE_CLOSED,
      output: "one-time URL, expiresAt",
      dashboard: "none (MCP session only)",
      handler: signInLink,
    },
    {
      key: "submit_feedback",
      names: nouns.feedback,
      description: sessionDescriptions.feedback,
      when: "Use this when the user approves sending a drafted Samebase feedback report.",
      inputSchema: object(
        { report: str("The exact user-approved feedback report. Maximum 6000 characters.") },
        ["report"],
      ),
      annotations: DESTRUCTIVE_OPEN,
      output: "{ status: sent }",
      dashboard: "feedback form",
      handler: feedback,
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Design P: primitive mirror (RFC 125).

function repositoryRow(state: State, app: App) {
  return {
    repositoryId: app.repositoryId,
    cloudflareAccountId: app.cloudflareAccountId,
    githubOwnerLogin: app.owner,
    githubRepositoryName: app.name,
    githubRepositoryDatabaseId: app.githubRepositoryDatabaseId,
    githubRepositoryFullName: fullName(app),
    sourceSetup: app.sourceSetup,
    providerSetup: app.providerSetup,
    pendingCloudflareSetup: app.pendingCloudflare,
    deletion: { state: "not_deleting" },
    isSamebaseManaged: true,
    cloudflareWorkers: attachedWorkerRows(state, app).map((row) => ({
      ...row,
      accountId: app.cloudflareAccountId,
    })),
    convexProjects: app.convexProjects.map((attached) => ({
      convexProjectId: attached.convexProjectId,
      teamId: "team_7731",
      projectId: attached.projectId,
      codeLocation: { kind: "directory", convexDirectoryPath: attached.location },
    })),
  };
}

function requireAccount(app: App, args: Args): void {
  const accountId = readString(args, "accountId");
  if (accountId !== app.cloudflareAccountId) {
    throw new Error(
      "The Cloudflare account must be the Samebase repository's stored cloudflareAccountId.",
    );
  }
}

function locationSelection(state: State, app: App, value: unknown): string {
  const selection = readRecord(value, "codeLocation");
  const path = readString(selection, "convexDirectoryPath");
  const location = (state.locations[fullName(app)] ?? []).find(
    (candidate) => candidate.path === path,
  );
  if (
    !location ||
    selection.convexDirectoryTreeSha !== location.treeSha ||
    selection.packageJsonBlobSha !== location.packageJsonBlobSha ||
    selection.kind !== "directory"
  ) {
    throw new Error(
      "The selected Convex code location changed or does not match a discovered location. Discover Convex projects again and pass the exact location.",
    );
  }
  return path;
}

const P_LIST = "{{list_repositories}}";
const repositoryIdInput = str(`Samebase repository ID returned by ${P_LIST}.`);
const accountIdInput = str(`The Samebase repository's cloudflareAccountId returned by ${P_LIST}.`);
const tokenInput = str("Workers Builds token UUID returned by {{list_build_tokens}}.");
const pCodeLocationSchema: JsonSchema = {
  type: "object",
  description: "A code location exactly as {{discover_convex_projects}} returned it.",
  properties: {
    kind: { const: "directory" },
    convexDirectoryPath: { type: "string" },
    convexDirectoryTreeSha: { type: "string" },
    packageJsonBlobSha: { type: "string" },
  },
  required: ["kind", "convexDirectoryPath", "convexDirectoryTreeSha", "packageJsonBlobSha"],
  additionalProperties: false,
};

const pTools: ToolSpec[] = [
  ...sessionTools({
    auth: {
      A: "samebase_auth_getAuthenticationStatus",
      B: "account_getAuthenticationStatus",
      C: "get_authentication_status",
      D: "samebase_get_authentication_status",
      E: "samebase_get_authentication_status",
    },
    signIn: {
      A: "create_browser_handoff",
      B: "account_createSignInLink",
      C: "create_sign_in_link",
      D: "samebase_create_sign_in_link",
      E: "samebase_create_sign_in_link",
    },
    feedback: {
      A: "samebase_feedback_submit",
      B: "feedback_submit",
      C: "submit_feedback",
      D: "samebase_submit_feedback",
      E: "samebase_submit_feedback",
    },
  }),
  {
    key: "list_repositories",
    names: {
      A: "repository_dashboard_getUserRepositories",
      B: "repository_list",
      C: "list_repositories",
      D: "samebase_list_repositories",
      E: "samebase_list_repositories",
    },
    description:
      "List the Samebase repositories available to the authenticated user, including attached provider resources.",
    when: "Use this when you need the user's Samebase apps, their setup state, or a repositoryId for another Samebase tool.",
    inputSchema: object({}, []),
    annotations: RO,
    output:
      "repositories[]: repositoryId, cloudflareAccountId, GitHub identity, setup states, pendingCloudflareSetup, attached Workers and Convex projects",
    dashboard: "repository.dashboard.getUserRepositories (8 call sites)",
    handler: (state) => {
      for (const app of state.apps) readApp(state, app);
      return { repositories: state.apps.map((app) => repositoryRow(state, app)) };
    },
  },
  {
    key: "repository_status",
    names: {
      A: "repository_status_getRepositoryStatus",
      B: "repository_getStatus",
      C: "get_repository_status",
      D: "samebase_get_repository_status",
      E: "samebase_get_repository_status",
    },
    description:
      "Read live status for one Samebase repository: default branch head commit and checks, production Worker builds and URLs, Convex production deployments, and the first open pull requests with their checks and previews.",
    when: "Use this when the user asks whether a push deployed, what the production URL is, or how builds, checks, or pull requests look for a Samebase app.",
    inputSchema: object({ repositoryId: repositoryIdInput }, ["repositoryId"]),
    annotations: RO,
    output: "default branch, production Workers and Convex deployments, first 6 PRs",
    dashboard: "overview page (replaces 6 per-repository calls, RFC 125 PR 7)",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      readApp(state, app);
      return liveStatus(state, app);
    },
  },
  {
    key: "create_repository",
    names: {
      A: "repository_actions_createRepository",
      B: "repository_create",
      C: "create_repository",
      D: "samebase_create_repository",
      E: "samebase_create_repository",
    },
    description: `Create a new Samebase app. A current Workers Builds token provisions GitHub, Convex, and Cloudflare; a confirmed empty token list provisions GitHub and Convex and leaves Cloudflare pending. Returns a repository ID while setup runs. Read ${P_LIST} for progress. Ready setup does not prove that the app is live.`,
    when: "Use this when the user wants a new Samebase app created.",
    inputSchema: object(
      {
        githubOwnerLogin: str("GitHub owner login that will own the new repository."),
        githubRepositoryName: str("Name for the new GitHub repository and Samebase app."),
        convexProjectName: str("Convex project name to provision for the app."),
        convexDeploymentRegion: regionSchema,
        cloudflareWorkerName: str(
          "Cloudflare Worker name for automatic Cloudflare provisioning. This required field is ignored when cloudflareBuildTokenUuid is null.",
        ),
        cloudflareBuildTokenUuid: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description:
            "Exact Workers Builds token UUID returned by {{list_build_tokens}}, or null only after that current list is confirmed empty.",
        },
        description: str("Optional GitHub repository description."),
        private: {
          type: "boolean",
          description: "Whether to create a private GitHub repository. Defaults to true.",
        },
      },
      [
        "githubOwnerLogin",
        "githubRepositoryName",
        "convexProjectName",
        "cloudflareWorkerName",
        "cloudflareBuildTokenUuid",
      ],
    ),
    annotations: WRITE_OPEN,
    output: "repositoryId",
    dashboard: "repository.actions.createRepository (NewAppPage)",
    handler: (state, args) => {
      const token = args.cloudflareBuildTokenUuid;
      if (token === null && state.tokens.length > 0) {
        throw new Error(
          "cloudflareBuildTokenUuid is null, but the Cloudflare account has Workers Builds tokens. Pass one exact UUID from the current list.",
        );
      }
      if (token !== null && typeof token !== "string")
        throw new Error("cloudflareBuildTokenUuid must be a UUID string or null.");
      const app = createApp(state, {
        owner: readString(args, "githubOwnerLogin"),
        name: readString(args, "githubRepositoryName"),
        convexProjectName: readString(args, "convexProjectName"),
        region: readRegion(args, "convexDeploymentRegion"),
        workerName: readString(args, "cloudflareWorkerName"),
        token,
        isPrivate: args.private !== false,
      });
      return { repositoryId: app.repositoryId };
    },
  },
  {
    key: "connect_repository",
    names: {
      A: "repository_actions_connectRepository",
      B: "repository_connect",
      C: "connect_repository",
      D: "samebase_connect_repository",
      E: "samebase_connect_repository",
    },
    description:
      "Connect an existing GitHub repository as a Samebase repository by its full name, then sync its repository tree. Convex and Cloudflare stay unconfigured until explicitly attached.",
    when: "Use this when the user wants an existing GitHub repository added to Samebase.",
    inputSchema: object(
      {
        githubRepositoryFullName: str(
          "GitHub repository full name, owner/name, in an installed Samebase organization.",
        ),
      },
      ["githubRepositoryFullName"],
    ),
    annotations: WRITE_CLOSED,
    output: "repositoryId, githubRepositoryDatabaseId",
    dashboard: "repository.actions.connectRepository (ConnectRepository)",
    handler: (state, args) => connectExisting(state, readString(args, "githubRepositoryFullName")),
  },
  {
    key: "retry_provider_setup",
    names: {
      A: "repository_actions_retryInfrastructureProvisioning",
      B: "repository_retryProviderSetup",
      C: "retry_provider_setup",
      D: "samebase_retry_provider_setup",
      E: "samebase_retry_provider_setup",
    },
    description:
      "Start a fresh infrastructure setup run that reuses attached resources and creates missing ones. When Cloudflare is requested, it reconfigures Workers Builds and rotates Convex deploy keys.",
    when: "Use this when a Samebase app's provider setup failed and the user wants it retried.",
    inputSchema: object({ repositoryId: repositoryIdInput }, ["repositoryId"]),
    annotations: DESTRUCTIVE_OPEN,
    output: "{ status: started }",
    dashboard: "repository.actions.retryInfrastructureProvisioning",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const token = state.tokens.find(
        (candidate) => candidate.uuid === state.lastUsedTokenUuid,
      )?.uuid;
      if (!token && app.workers.length > 0) {
        app.providerSetup = {
          status: "failed",
          message:
            "The selected Cloudflare Workers Builds token is not in Cloudflare's current list.",
        };
        return { status: "started" };
      }
      for (const row of attachedWorkerRows(state, app)) {
        if (token) configureBuilds(state, app, row.workerId, row.rootDirectory, token);
        const convex = app.convexProjects.at(0);
        if (convex) rotateKeys(state, app, row.workerId, convex.convexProjectId);
      }
      app.providerSetup = { status: "ready" };
      return { status: "started" };
    },
  },
  {
    key: "list_build_tokens",
    names: {
      A: "cloudflare_listWorkersBuildTokens",
      B: "cloudflare_listBuildTokens",
      C: "list_workers_build_tokens",
      D: "samebase_list_workers_build_tokens",
      E: "samebase_list_workers_build_tokens",
    },
    description:
      "List the non-secret Workers Builds token names and UUIDs in the Cloudflare account connected to a Samebase organization, with its available last-used UUID.",
    when: "Use this when a Samebase create, connect, or Builds action needs a Workers Builds token UUID.",
    inputSchema: object(
      {
        githubOwnerLogin: str(
          "GitHub owner login for the Samebase organization whose Cloudflare account must be read.",
        ),
      },
      ["githubOwnerLogin"],
    ),
    annotations: RO,
    output: "accountId, lastUsedBuildTokenUuid, tokens[]",
    dashboard: "cloudflareBuildTokens.list",
    handler: (state, args) => {
      const owner = readString(args, "githubOwnerLogin");
      if (!state.account.owners.includes(owner))
        throw new Error(
          `GitHub owner ${owner} is not connected to a Samebase organization for this account.`,
        );
      const lastUsed = state.tokens.some((token) => token.uuid === state.lastUsedTokenUuid)
        ? state.lastUsedTokenUuid
        : null;
      return {
        accountId: state.cloudflareAccountId,
        lastUsedBuildTokenUuid: lastUsed,
        tokens: state.tokens,
      };
    },
  },
  {
    key: "discover_workers",
    names: {
      A: "repository_cloudflare_discoverWorkers",
      B: "repository_cloudflare_discoverWorkers",
      C: "discover_cloudflare_workers",
      D: "samebase_discover_cloudflare_workers",
      E: "samebase_discover_cloudflare_workers",
    },
    description:
      "List Workers in the Samebase repository's stored Cloudflare account that this repository can use, with one attachment status each, and counts of the other Workers. attachable: connected to this repository in Cloudflare; pass it to {{attach_workers}}. connectable: not connected to any repository; {{connect_worker}} connects it. Counts: attached (already on this app), attached_elsewhere (another Samebase app uses it; it cannot be attached or connected here), connected_elsewhere (connected to another repository in Cloudflare), unavailable.",
    when: "Use this when the user wants to know which existing Cloudflare Workers can be added to a Samebase app.",
    inputSchema: object({ repositoryId: repositoryIdInput, accountId: accountIdInput }, [
      "repositoryId",
      "accountId",
    ]),
    annotations: RO,
    output: "rows for attachable and connectable Workers, counts for the rest",
    dashboard: "repository.cloudflare.discoverWorkers (dialog keeps every row)",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      requireAccount(app, args);
      const rows: unknown[] = [];
      const counts = { attached: 0, attached_elsewhere: 0, connected_elsewhere: 0, unavailable: 0 };
      for (const worker of state.workers) {
        const status = workerAttachment(app, worker);
        if (status === "attachable")
          rows.push({
            attachment: status,
            workerName: worker.name,
            workerTag: worker.tag,
            rootDirectory: worker.root,
          });
        else if (status === "connectable")
          rows.push({ attachment: status, workerName: worker.name, workerTag: worker.tag });
        else counts[status] += 1;
      }
      return { inventoryState: "complete", workers: rows, counts };
    },
  },
  {
    key: "attach_workers",
    names: {
      A: "repository_cloudflare_attachWorkers",
      B: "repository_cloudflare_attachWorkers",
      C: "attach_cloudflare_workers",
      D: "samebase_attach_cloudflare_workers",
      E: "samebase_attach_cloudflare_workers",
    },
    description:
      "Attach existing Cloudflare Workers that {{discover_workers}} returned with attachment attachable. Only attachable Workers can be attached. Samebase re-verifies each Worker's identity and live GitHub repository root before it writes the attachment.",
    when: "Use this when the user wants to add Workers that discovery reported as attachable.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        accountId: accountIdInput,
        workers: {
          type: "array",
          description:
            "One or more Worker name and stable tag pairs that {{discover_workers}} returned with attachment attachable.",
          items: object({ workerName: { type: "string" }, workerTag: { type: "string" } }, [
            "workerName",
            "workerTag",
          ]),
        },
      },
      ["repositoryId", "accountId", "workers"],
    ),
    annotations: WRITE_CLOSED,
    output: "workerIds",
    dashboard: "repository.cloudflare.attachWorkers",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      requireAccount(app, args);
      const selected = readArray(args, "workers").map((entry) => {
        const record = readRecord(entry, "worker");
        const tag = readString(record, "workerTag");
        const worker = state.workers.find(
          (candidate) => candidate.tag === tag && candidate.name === record.workerName,
        );
        if (!worker)
          throw new Error(
            `Cloudflare Worker ${String(record.workerName)} with tag ${tag} was not found. Discover Workers again.`,
          );
        if (workerAttachment(app, worker) !== "attachable")
          throw new Error(
            `Cloudflare Worker ${worker.name} is ${workerAttachment(app, worker)}; only attachable Workers can be attached.`,
          );
        return worker;
      });
      return { workerIds: selected.map((worker) => attachWorker(state, app, worker)) };
    },
  },
  {
    key: "connect_worker",
    names: {
      A: "repository_cloudflare_connectWorker",
      B: "repository_cloudflare_connectWorker",
      C: "connect_cloudflare_worker",
      D: "samebase_connect_cloudflare_worker",
      E: "samebase_connect_cloudflare_worker",
    },
    description:
      "Connect a Worker that {{discover_workers}} returned with attachment connectable to this repository: configure Workers Builds for the given repository root and request a production build. That build replaces what the Worker serves now.",
    when: "Use this when the user wants to add an existing Worker that discovery reported as connectable.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        accountId: accountIdInput,
        workerName: str("Worker name from discovery."),
        workerTag: str("Worker tag from discovery."),
        rootDirectory: str("Repository root for this Worker's GitHub Builds triggers."),
        buildTokenUuid: tokenInput,
      },
      ["repositoryId", "accountId", "workerName", "workerTag", "rootDirectory", "buildTokenUuid"],
    ),
    annotations: DESTRUCTIVE_OPEN,
    output: "workerId, optional notice",
    dashboard: "repository.cloudflare.connectWorker",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      requireAccount(app, args);
      const tag = readString(args, "workerTag");
      const worker = state.workers.find((candidate) => candidate.tag === tag);
      if (!worker || worker.name !== readString(args, "workerName"))
        throw new Error("Cloudflare Worker changed after discovery.");
      return {
        state: "ready",
        workerId: connectWorker(
          state,
          app,
          worker,
          readString(args, "rootDirectory"),
          readString(args, "buildTokenUuid"),
        ),
      };
    },
  },
  {
    key: "create_worker",
    names: {
      A: "repository_cloudflare_createWorker",
      B: "repository_cloudflare_createWorker",
      C: "create_cloudflare_worker",
      D: "samebase_create_cloudflare_worker",
      E: "samebase_create_cloudflare_worker",
    },
    description:
      "Create and attach a Cloudflare Worker in the Samebase repository's stored Cloudflare account, configure Workers Builds for that repository root, and request the first production build. It does not install Convex deploy keys.",
    when: "Use this when the user wants a new Cloudflare Worker for a Samebase app.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        accountId: accountIdInput,
        workerName: str("Name for the new Cloudflare Worker. An existing name is rejected."),
        rootDirectory: str("Repository root for this Worker's GitHub Builds triggers."),
        buildTokenUuid: tokenInput,
      },
      ["repositoryId", "accountId", "workerName", "rootDirectory", "buildTokenUuid"],
    ),
    annotations: WRITE_OPEN,
    output: "workerId",
    dashboard: "repository.cloudflare.createWorker",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      requireAccount(app, args);
      return {
        workerId: createWorker(
          state,
          app,
          readString(args, "workerName"),
          readString(args, "rootDirectory"),
          readString(args, "buildTokenUuid"),
        ).workerId,
      };
    },
  },
  {
    key: "configure_builds",
    names: {
      A: "repository_cloudflare_configureWorkersBuildsForGitHub",
      B: "repository_cloudflare_configureBuilds",
      C: "configure_workers_builds",
      D: "samebase_configure_workers_builds",
      E: "samebase_configure_workers_builds",
    },
    description:
      "Configure the selected Worker's production and Previews Base Builds settings for the Samebase repository's GitHub repository, then start a production build.",
    when: "Use this when an attached Worker's Workers Builds connection or token must be set again.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        workerId: str(`Stable Samebase Worker attachment id returned by ${P_LIST}.`),
        rootDirectory: str("Repository root to write to this Worker's GitHub Builds settings."),
        buildTokenUuid: tokenInput,
      },
      ["repositoryId", "workerId", "rootDirectory", "buildTokenUuid"],
    ),
    annotations: DESTRUCTIVE_OPEN,
    output: "{ status: started }",
    dashboard: "repository.cloudflare.configureWorkersBuildsForGitHub",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      configureBuilds(
        state,
        app,
        readString(args, "workerId"),
        readString(args, "rootDirectory"),
        readString(args, "buildTokenUuid"),
      );
      return { status: "started" };
    },
  },
  {
    key: "rotate_keys",
    names: {
      A: "repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds",
      B: "repository_cloudflare_rotateConvexDeployKeys",
      C: "rotate_convex_deploy_keys",
      D: "samebase_rotate_convex_deploy_keys",
      E: "samebase_rotate_convex_deploy_keys",
    },
    description:
      "Rotate Samebase-named production and preview Convex deploy keys, write each as CONVEX_DEPLOY_KEY in its Workers Builds settings, update existing previews, write SAMEBASE_CONVEX_PROJECT in production, then start a production build.",
    when: "Use this when an attached Worker needs Convex deploy keys installed or replaced.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        workerId: str(`Stable Samebase Worker attachment id returned by ${P_LIST}.`),
        convexProjectId: str("Attached Convex project selected for this deploy-key rotation."),
      },
      ["repositoryId", "workerId", "convexProjectId"],
    ),
    annotations: DESTRUCTIVE_OPEN,
    output: "{ status: started }",
    dashboard: "repository.cloudflare.rotateConvexDeployKeysForWorkersBuilds",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      rotateKeys(state, app, readString(args, "workerId"), readString(args, "convexProjectId"));
      return { status: "started" };
    },
  },
  {
    key: "detach_worker",
    names: {
      A: "repository_cloudflare_detachWorker",
      B: "repository_cloudflare_detachWorker",
      C: "detach_cloudflare_worker",
      D: "samebase_detach_cloudflare_worker",
      E: "samebase_detach_cloudflare_worker",
    },
    description:
      "Remove a Worker attachment from this Samebase repository. The Worker and its Cloudflare settings do not change; attaching it again undoes this.",
    when: "Use this when the user wants a Worker removed from a Samebase app without deleting it.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        workerId: str(`Stable Samebase Worker attachment id returned by ${P_LIST}.`),
      },
      ["repositoryId", "workerId"],
    ),
    annotations: DESTRUCTIVE_CLOSED,
    output: "workerId",
    dashboard: "repository.cloudflare.detachWorker",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const workerId = readString(args, "workerId");
      detachWorker(state, app, workerId);
      return { workerId };
    },
  },
  {
    key: "discover_convex",
    names: {
      A: "repository_convex_discoverProjects",
      B: "repository_convex_discoverProjects",
      C: "discover_convex_projects",
      D: "samebase_discover_convex_projects",
      E: "samebase_discover_convex_projects",
    },
    description:
      "Discover Convex code locations in the Samebase repository's GitHub repository and the Convex projects in the connected Convex team that this repository can use. attachable: pass it to {{attach_convex}}. needs_production_deployment: create a production deployment in Convex first. Counts: attached (already on this app), attached_elsewhere (another Samebase app uses it).",
    when: "Use this when the user wants to know which Convex projects or code locations a Samebase app can use.",
    inputSchema: object({ repositoryId: repositoryIdInput }, ["repositoryId"]),
    annotations: RO,
    output:
      "code locations with Git SHAs, rows for attachable and needs_production_deployment projects, counts",
    dashboard: "repository.convex.discoverProjects (dialog keeps every row)",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const counts = { attached: 0, attached_elsewhere: 0 };
      const projects: unknown[] = [];
      for (const project of state.projects) {
        const status = convexAttachment(app, project);
        if (status === "attached" || status === "attached_elsewhere") counts[status] += 1;
        else
          projects.push({
            attachment: status,
            teamId: "team_7731",
            projectId: project.projectId,
            projectName: project.name,
            productionDeployment:
              project.prodDeployment === "available"
                ? { state: "available", region: project.region }
                : { state: "missing" },
          });
      }
      return {
        source: {
          completeness: "complete",
          locations: (state.locations[fullName(app)] ?? []).map((location) => ({
            kind: "directory",
            convexDirectoryPath: location.path,
            convexDirectoryTreeSha: location.treeSha,
            packageJsonBlobSha: location.packageJsonBlobSha,
          })),
        },
        projects,
        counts,
      };
    },
  },
  {
    key: "attach_convex",
    names: {
      A: "repository_convex_attachProjects",
      B: "repository_convex_attachProjects",
      C: "attach_convex_projects",
      D: "samebase_attach_convex_projects",
      E: "samebase_attach_convex_projects",
    },
    description:
      "Attach existing Convex projects that {{discover_convex}} returned with attachment attachable, each at a discovered repository code location. Only attachable projects can be attached.",
    when: "Use this when the user wants an existing Convex project added to a Samebase app.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        projects: {
          type: "array",
          description:
            "One or more project id and code location selections from {{discover_convex}}. Use only projects with attachment attachable.",
          items: object({ projectId: { type: "string" }, codeLocation: pCodeLocationSchema }, [
            "projectId",
            "codeLocation",
          ]),
        },
      },
      ["repositoryId", "projects"],
    ),
    annotations: WRITE_CLOSED,
    output: "convexProjectIds",
    dashboard: "repository.convex.attachProjects",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const selected = readArray(args, "projects").map((entry) => {
        const record = readRecord(entry, "project");
        const project = state.projects.find(
          (candidate) => candidate.projectId === record.projectId,
        );
        if (!project)
          throw new Error(
            `Convex project ${String(record.projectId)} was not found in the connected team.`,
          );
        return { project, location: locationSelection(state, app, record.codeLocation) };
      });
      return {
        convexProjectIds: selected.map(({ project, location }) =>
          attachConvex(state, app, project, location),
        ),
      };
    },
  },
  {
    key: "create_convex",
    names: {
      A: "repository_convex_createProject",
      B: "repository_convex_createProject",
      C: "create_convex_project",
      D: "samebase_create_convex_project",
      E: "samebase_create_convex_project",
    },
    description:
      "Create a new Convex project with one production deployment in the connected Convex team and attach it to this repository at a code location from {{discover_convex}}.",
    when: "Use this when the user wants a new Convex project for an existing Samebase app.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        projectName: str("Name for the new Convex project."),
        deploymentRegion: { ...regionSchema, description: "Convex production region." },
        codeLocation: pCodeLocationSchema,
      },
      ["repositoryId", "projectName", "deploymentRegion", "codeLocation"],
    ),
    annotations: WRITE_OPEN,
    output: "convexProjectId",
    dashboard: "repository.convex.createProject",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      return {
        convexProjectId: createConvexProject(
          state,
          app,
          readString(args, "projectName"),
          readRegion(args, "deploymentRegion"),
          locationSelection(state, app, args.codeLocation),
        ),
      };
    },
  },
  {
    key: "change_location",
    names: {
      A: "repository_convex_changeProjectCodeLocation",
      B: "repository_convex_changeCodeLocation",
      C: "change_convex_code_location",
      D: "samebase_change_convex_code_location",
      E: "samebase_change_convex_code_location",
    },
    description:
      "Change the repository code location recorded for an attached Convex project to another location from {{discover_convex}}. No file or provider changes.",
    when: "Use this when the user moved the convex/ folder or convex.json and the Samebase record must follow.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        convexProjectId: str(`Attached Convex project id returned by ${P_LIST}.`),
        codeLocation: pCodeLocationSchema,
      },
      ["repositoryId", "convexProjectId", "codeLocation"],
    ),
    annotations: DESTRUCTIVE_CLOSED,
    output: "convexProjectId",
    dashboard: "repository.convex.changeProjectCodeLocation",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const id = readString(args, "convexProjectId");
      const attached = app.convexProjects.find((candidate) => candidate.convexProjectId === id);
      if (!attached) throw new Error(`Convex project attachment ${id} is not attached.`);
      attached.location = locationSelection(state, app, args.codeLocation);
      return { convexProjectId: id };
    },
  },
  {
    key: "detach_convex",
    names: {
      A: "repository_convex_detachProject",
      B: "repository_convex_detachProject",
      C: "detach_convex_project",
      D: "samebase_detach_convex_project",
      E: "samebase_detach_convex_project",
    },
    description:
      "Remove a Convex project attachment from this Samebase repository. The Convex project does not change; attaching it again undoes this.",
    when: "Use this when the user wants a Convex project removed from a Samebase app without deleting it.",
    inputSchema: object(
      {
        repositoryId: repositoryIdInput,
        convexProjectId: str(`Attached Convex project id returned by ${P_LIST}.`),
      },
      ["repositoryId", "convexProjectId"],
    ),
    annotations: DESTRUCTIVE_CLOSED,
    output: "convexProjectId",
    dashboard: "repository.convex.detachProject",
    handler: (state, args) => {
      const app = findAppById(state, readString(args, "repositoryId"));
      const id = readString(args, "convexProjectId");
      detachConvex(state, app, id);
      return { convexProjectId: id };
    },
  },
];

function connectExisting(state: State, name: string) {
  const repo = state.githubRepos.find(
    (candidate) => candidate.fullName.toLowerCase() === name.toLowerCase(),
  );
  if (!repo)
    throw new Error(
      `GitHub repository ${name} is not visible to an installed Samebase GitHub App.`,
    );
  const [owner, repoName] = repo.fullName.split("/");
  const app = createApp(state, {
    owner,
    name: repoName,
    convexProjectName: "",
    region: "aws-us-east-1",
    workerName: "",
    token: null,
    isPrivate: true,
  });
  app.plan = null;
  app.pollsLeft = 0;
  app.sourceSetup = { status: "ready" };
  app.providerSetup = { status: "not_applicable" };
  app.githubRepositoryDatabaseId = repo.databaseId;
  state.githubRepos = state.githubRepos.filter((candidate) => candidate !== repo);
  return {
    repositoryId: app.repositoryId,
    app: fullName(app),
    githubRepositoryDatabaseId: repo.databaseId,
  };
}

const P_INSTRUCTIONS = `Samebase is only for repository-backed apps and explicit attachments to user-owned Convex and Cloudflare resources. The MCP acts as the authenticated Samebase account across every organization that the account can currently access. Never request or send an opaque Samebase organization ID. Never use Samebase for unrelated Git work or standalone provider resources.

For a request to open the Samebase dashboard, call {{sign_in_link}} directly. Show its returned URL to the user as a clickable link. The private sign-in link works once and expires after five minutes. Do not use authentication status or inventory as a preflight for this request.

Some Samebase app management is available only in the Samebase dashboard: removing a repository, accepting a Worker or GitHub rename, members, organization settings, billing, and provider connections. For these requests only, say that the user can do it in the Samebase dashboard and offer to open it with {{sign_in_link}}. Do not call a tool until the user accepts. Do not claim that the operation finished.

For build, deployment, URL, check, or pull request state, call {{repository_status}}. Do not call it as a preflight. Use provider-native tools for logs, environment values, migrations, and custom domains.

Every repository tool takes repositoryId from {{list_repositories}}. Keep repository identities separate. repositoryId is the opaque Samebase repository ID. githubRepositoryDatabaseId is GitHub's numeric repository database ID stored as a string. Never substitute one for the other.

For managed app creation, use only this closed sequence: read {{list_repositories}}, call {{list_build_tokens}} with the human GitHub owner login, call {{create_repository}}, then poll {{list_repositories}}. If the user chooses EU, pass aws-eu-west-1 and first say: "EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does not apply to EU deployments." Otherwise, omit convexDeploymentRegion so Samebase uses the organization default. When the current Workers Builds token list is confirmed empty, pass cloudflareBuildTokenUuid as explicit null. Otherwise, use an available lastUsedBuildTokenUuid without asking, use the only listed token, or ask the user to choose by the displayed name and UUID when several tokens are listed. Ask the user for the GitHub owner login when it is unclear.

After {{create_repository}}, poll {{list_repositories}} until source setup is ready or failed, then until provider setup is ready or failed. When cloudflareBuildTokenUuid was null, the managed run creates the GitHub repository and Convex project but no Cloudflare Worker. In that case, providerSetup status ready means only that the requested managed work finished. Confirm that pendingCloudflareSetup identifies the planned Convex attachment and cloudflareWorkers is empty. Report that Cloudflare setup is pending, and give the user https://samebase.com/docs/cloudflare-setup. After the user completes those steps and asks to finish the app, list tokens again and call {{create_worker}} with the pending workerName and rootDirectory and a current exact UUID. Reread inventory, then call {{rotate_keys}} with the new Worker and the pending convexProjectId. Do not retry the completed managed run.

For other writes, read {{list_repositories}} whenever a repository may already be connected, and reuse the returned repository and attachment identifiers. Before {{create_worker}}, {{connect_worker}}, or {{configure_builds}}, call {{list_build_tokens}} and choose the UUID with the same rule. If the token list is empty, do not call the write. After a new Worker is created or connected, call {{rotate_keys}} for the attached Convex project. For Cloudflare actions, pass that repository's cloudflareAccountId from {{list_repositories}}. Do not discover or select another Cloudflare account through Samebase MCP. A started provisioning run, requested build, or successful Git push is not proof of a successful deployment.

Make code changes, run setup and validation, and commit or push in the returned GitHub repository. The current action and provider-boundary docs are indexed at https://samebase.com/llms.txt.`;

// ---------------------------------------------------------------------------------------------
// Designs W and H share the app-named reads and session tools.

const appInput = str(
  "The Samebase app's GitHub repository full name, owner/name, as listed by {{list_apps}}.",
);
const optionalTokenInput = str(
  "Optional Workers Builds token UUID. Omit it: Samebase uses the last-used token or the only token, and asks for a choice only when that is ambiguous.",
);

function appRows(state: State) {
  return state.apps.map((app) => ({
    app: fullName(app),
    setup: { source: app.sourceSetup.status, provider: app.providerSetup.status },
    pendingCloudflareSetup: app.pendingCloudflare
      ? {
          workerName: app.pendingCloudflare.workerName,
          rootDirectory: app.pendingCloudflare.rootDirectory,
        }
      : null,
    cloudflareWorkers: attachedWorkerRows(state, app).map((row) => ({
      workerName: row.workerName,
      rootDirectory: row.rootDirectory,
    })),
    convexProjects: app.convexProjects.map((attached) => ({
      projectName:
        state.projects.find((project) => project.projectId === attached.projectId)?.name ??
        "unknown",
      codeLocation: attached.location,
    })),
  }));
}

function statusWithAttention(state: State, app: App, names: Record<string, string>) {
  readApp(state, app);
  const items = attention(state, app).map((item) => ({
    problem: item.problem,
    fix: item.fix === "repair" ? `call ${names.repair}` : "the user must act; see the problem text",
  }));
  return {
    ...liveStatus(state, app),
    pendingCloudflareSetup: app.pendingCloudflare
      ? {
          workerName: app.pendingCloudflare.workerName,
          rootDirectory: app.pendingCloudflare.rootDirectory,
        }
      : null,
    attention: items,
  };
}

function onlyLocation(state: State, app: App, given: string | undefined): string {
  const locations = state.locations[fullName(app)] ?? [];
  if (given) {
    if (!locations.some((location) => location.path === given))
      throw new Error(
        `No Convex code location ${given} in ${fullName(app)}. Found: ${locations.map((location) => location.path).join(", ") || "none"}.`,
      );
    return given;
  }
  if (locations.length === 1) return locations[0].path;
  if (locations.length === 0)
    throw new Error(
      `${fullName(app)} has no convex/ folder or convex.json on its default branch. Add one, push, and try again.`,
    );
  throw new ChoiceNeeded(
    `Several Convex code locations exist: ${locations.map((location) => location.path).join(", ")}. Ask the user which one and pass codeLocation.`,
  );
}

function installKeysIfOneProject(state: State, app: App, workerId: string): string {
  if (app.convexProjects.length !== 1)
    return "No Convex deploy key installed: the app has no single attached Convex project.";
  rotateKeys(state, app, workerId, app.convexProjects[0].convexProjectId);
  return "Convex deploy key installed for the app's Convex project.";
}

function repair(state: State, app: App, givenToken: string | undefined) {
  const performed: string[] = [];
  readApp(state, app);
  const items = attention(state, app);
  if (items.length === 0)
    return {
      performed,
      remaining: [],
      note: "Nothing to repair. Live state has no attention items.",
    };
  if (app.pendingCloudflare && app.workers.length === 0) {
    const token = chooseToken(state, givenToken);
    if (!token)
      return {
        performed,
        remaining: [
          "Cloudflare setup is pending and the account has no Workers Builds token. The user must create one: https://samebase.com/docs/cloudflare-setup",
        ],
      };
    const pending = app.pendingCloudflare;
    const created = createWorker(state, app, pending.workerName, pending.rootDirectory, token);
    performed.push(
      `Created Worker ${pending.workerName} with Workers Builds at ${pending.rootDirectory}.`,
    );
    rotateKeys(state, app, created.workerId, pending.convexProjectId);
    performed.push("Installed the Convex deploy key and started a production build.");
  }
  for (const row of attachedWorkerRows(state, app)) {
    const worker = state.workers.find((candidate) => candidate.tag === row.workerTag);
    if (!worker) continue;
    if (
      worker.buildTokenUuid &&
      !state.tokens.some((token) => token.uuid === worker.buildTokenUuid)
    ) {
      const token = chooseToken(state, givenToken);
      if (!token)
        return {
          performed,
          remaining: [
            "No Workers Builds token exists. The user must create one: https://samebase.com/docs/cloudflare-setup",
          ],
        };
      configureBuilds(state, app, row.workerId, row.rootDirectory, token);
      performed.push(
        `Reconnected Workers Builds for ${worker.name} with token ${token} and started a production build.`,
      );
    }
    if (app.convexProjects.length > 0 && worker.convexKeys !== "configured") {
      rotateKeys(state, app, row.workerId, app.convexProjects[0].convexProjectId);
      performed.push(`Rotated Convex deploy keys for ${worker.name}.`);
    }
  }
  if (app.providerSetup.status === "failed") {
    app.providerSetup = { status: "ready" };
    performed.push("Retried provider setup.");
  }
  return { performed, remaining: attention(state, app).map((item) => item.problem) };
}

function detachByName(state: State, app: App, name: string) {
  const row = attachedWorkerRows(state, app).find(
    (candidate) => candidate.workerName.toLowerCase() === name.toLowerCase(),
  );
  const projectRow = app.convexProjects.find(
    (attached) =>
      state.projects
        .find((project) => project.projectId === attached.projectId)
        ?.name.toLowerCase() === name.toLowerCase(),
  );
  if (row && projectRow)
    throw new ChoiceNeeded(
      `Both a Worker and a Convex project are named ${name}. Pass kind: cloudflare_worker or convex_project.`,
    );
  if (row) {
    detachWorker(state, app, row.workerId);
    return {
      detached: { kind: "cloudflare_worker", name: row.workerName },
      note: "The Worker still exists in Cloudflare.",
    };
  }
  if (projectRow) {
    detachConvex(state, app, projectRow.convexProjectId);
    return { detached: { kind: "convex_project", name }, note: "The Convex project still exists." };
  }
  throw new Error(
    `${fullName(app)} has no attached Worker or Convex project named ${name}. Attached: ${[...attachedWorkerRows(state, app).map((candidate) => candidate.workerName), ...app.convexProjects.map((attached) => state.projects.find((project) => project.projectId === attached.projectId)?.name ?? "")].join(", ") || "none"}.`,
  );
}

function workerFindings(state: State, app: App) {
  const attachable: unknown[] = [];
  const connectable: unknown[] = [];
  const cannotAdd = {
    already_on_this_app: 0,
    used_by_another_samebase_app: 0,
    connected_to_another_repository: 0,
  };
  for (const worker of state.workers) {
    const status = workerAttachment(app, worker);
    if (status === "attachable")
      attachable.push({ workerName: worker.name, rootDirectory: worker.root });
    else if (status === "connectable") connectable.push({ workerName: worker.name });
    else if (status === "attached") cannotAdd.already_on_this_app += 1;
    else if (status === "attached_elsewhere") cannotAdd.used_by_another_samebase_app += 1;
    else cannotAdd.connected_to_another_repository += 1;
  }
  return { attachable, connectable, cannotAdd };
}

function convexFindings(state: State, app: App) {
  const attachable: unknown[] = [];
  const needsProductionDeployment: unknown[] = [];
  const cannotAdd = { already_on_this_app: 0, used_by_another_samebase_app: 0 };
  for (const project of state.projects) {
    const status = convexAttachment(app, project);
    if (status === "attachable")
      attachable.push({ projectName: project.name, region: project.region });
    else if (status === "needs_production_deployment")
      needsProductionDeployment.push({ projectName: project.name });
    else if (status === "attached") cannotAdd.already_on_this_app += 1;
    else cannotAdd.used_by_another_samebase_app += 1;
  }
  return {
    codeLocations: (state.locations[fullName(app)] ?? []).map((location) => location.path),
    attachable,
    needsProductionDeployment,
    cannotAdd,
  };
}

function addConvex(state: State, app: App, args: Args, createWhenMissing: boolean) {
  const name = readString(args, "projectName");
  const location = onlyLocation(state, app, readOptionalString(args, "codeLocation"));
  const existing = findProject(state, name);
  if (args.create === true || (createWhenMissing && !existing)) {
    const convexProjectId = createConvexProject(
      state,
      app,
      name,
      readRegion(args, "convexDeploymentRegion"),
      location,
    );
    return { action: "created", projectName: name, codeLocation: location, convexProjectId };
  }
  if (!existing)
    throw new Error(
      `No Convex project named ${name} in the connected Convex team. To create a new one, call again with create: true.`,
    );
  attachConvex(state, app, existing, location);
  return { action: "attached", projectName: existing.name, codeLocation: location };
}

function createAppHandler(state: State, args: Args) {
  const name = readString(args, "name");
  const token = chooseToken(state, readOptionalString(args, "buildTokenUuid"));
  const app = createApp(state, {
    owner: readString(args, "githubOwnerLogin"),
    name,
    convexProjectName: readOptionalString(args, "convexProjectName") ?? name,
    region: readRegion(args, "convexDeploymentRegion"),
    workerName: readOptionalString(args, "cloudflareWorkerName") ?? name,
    token,
    isPrivate: args.private !== false,
  });
  return {
    app: fullName(app),
    setup: "running",
    cloudflare: token
      ? `A Worker named ${readOptionalString(args, "cloudflareWorkerName") ?? name} will be created with Workers Builds token ${token}.`
      : "Pending: the Cloudflare account has no Workers Builds token, so no Worker is created. The user must create one through Cloudflare's repository setup (https://samebase.com/docs/cloudflare-setup); then call {{repair}} to finish.",
    next: "Read {{app_status}} for progress. Ready setup does not prove the app is live.",
  };
}

const createAppSchema = object(
  {
    githubOwnerLogin: str(
      "GitHub owner (organization or user login) that will own the new repository. See {{auth_status}} for the owners this account can use.",
    ),
    name: str(
      "Name for the new GitHub repository and app. The Convex project and Worker use it too unless overridden.",
    ),
    convexDeploymentRegion: regionSchema,
    buildTokenUuid: optionalTokenInput,
    convexProjectName: str("Optional Convex project name. Defaults to the app name."),
    cloudflareWorkerName: str("Optional Cloudflare Worker name. Defaults to the app name."),
    description: str("Optional GitHub repository description."),
    private: {
      type: "boolean",
      description: "Whether the GitHub repository is private. Defaults to true.",
    },
  },
  ["githubOwnerLogin", "name"],
);

function appSessionAndReads(): ToolSpec[] {
  return [
    ...sessionTools({
      auth: {
        A: "samebase_auth_getAuthenticationStatus",
        B: "account_getAuthenticationStatus",
        C: "get_authentication_status",
        D: "samebase_get_authentication_status",
        E: "samebase_get_authentication_status",
      },
      signIn: {
        A: "create_browser_handoff",
        B: "account_createSignInLink",
        C: "create_sign_in_link",
        D: "samebase_create_sign_in_link",
        E: "samebase_create_sign_in_link",
      },
      feedback: {
        A: "samebase_feedback_submit",
        B: "feedback_submit",
        C: "submit_feedback",
        D: "samebase_submit_feedback",
        E: "samebase_submit_feedback",
      },
    }),
    {
      key: "list_apps",
      names: {
        A: "repository_dashboard_getUserRepositories",
        B: "repository_list",
        C: "list_apps",
        D: "samebase_list_apps",
        E: "samebase_list_repositories",
      },
      description:
        "List the user's Samebase apps across all organizations: GitHub repository, setup state, and attached Cloudflare Workers and Convex projects. Samebase records only; for live build and deployment state use {{app_status}}.",
      when: "Use this when the user asks which Samebase apps they have or what is attached to them.",
      inputSchema: object({}, []),
      annotations: RO,
      output:
        "apps[]: owner/name, setup states, pendingCloudflareSetup, Worker and Convex project names",
      dashboard: "repository.dashboard.getUserRepositories (unchanged; MCP projection)",
      handler: (state) => {
        for (const app of state.apps) readApp(state, app);
        return { apps: appRows(state) };
      },
    },
    {
      key: "app_status",
      names: {
        A: "repository_status_getRepositoryStatus",
        B: "repository_getStatus",
        C: "get_app_status",
        D: "samebase_get_app_status",
        E: "samebase_get_repository_status",
      },
      description:
        "Read the live state of one Samebase app: setup progress, default branch commit and checks, production build and URL per Worker, Convex production deployments, open pull requests, and attention items that say what is broken and which tool fixes it.",
      when: "Use this when the user asks whether a push deployed, what is broken, setup progress, URLs, builds, checks, or pull requests for a Samebase app.",
      inputSchema: object({ app: appInput }, ["app"]),
      annotations: RO,
      output: "live status (RFC 125 shape) plus pendingCloudflareSetup and attention[]",
      dashboard:
        "overview page (one call instead of 6) and Settings 'Needs attention' (computed on the server)",
      handler: (state, args, names) =>
        statusWithAttention(state, findApp(state, readString(args, "app")), names),
    },
    {
      key: "create_app",
      names: {
        A: "repository_actions_createRepository",
        B: "repository_create",
        C: "create_app",
        D: "samebase_create_app",
        E: "samebase_create_repository",
      },
      description:
        "Create a new Samebase app: a GitHub repository from the Samebase starter, a Convex project, and a Cloudflare Worker with Workers Builds. Samebase picks the Workers Builds token (the last-used one or the only one); if that is ambiguous the result lists the tokens to ask the user about. With no token, Cloudflare stays pending and the result says how to finish. Returns while setup runs; read {{app_status}} for progress.",
      when: "Use this when the user wants a new Samebase app created.",
      inputSchema: createAppSchema,
      annotations: WRITE_OPEN,
      output: "app owner/name, setup: running, Cloudflare plan or pending notice",
      dashboard:
        "repository.actions.createRepository (NewAppPage keeps passing the token the user picked)",
      handler: (state, args) => createAppHandler(state, args),
    },
    {
      key: "connect_app",
      names: {
        A: "repository_actions_connectRepository",
        B: "repository_connect",
        C: "connect_app",
        D: "samebase_connect_app",
        E: "samebase_connect_repository",
      },
      description:
        "Add an existing GitHub repository to Samebase as an app, by its full name (owner/name). Attaches no Convex project or Worker.",
      when: "Use this when the user wants an existing GitHub repository added to Samebase.",
      inputSchema: object(
        { githubRepositoryFullName: str("GitHub repository full name, owner/name.") },
        ["githubRepositoryFullName"],
      ),
      annotations: WRITE_CLOSED,
      output: "app owner/name",
      dashboard:
        "repository.actions.connectRepository (ConnectRepository passes the database ID it already has)",
      handler: (state, args) =>
        connectExisting(state, readString(args, "githubRepositoryFullName")),
    },
  ];
}

const repairSpec = (names: Record<Scheme, string>): ToolSpec => ({
  key: "repair",
  names,
  description:
    "Fix what {{app_status}} reports under attention: finish a pending Cloudflare setup, reconnect Workers Builds with a current token, install or rotate Convex deploy keys, or retry failed setup. Samebase chooses the steps from live state and returns what it did and what remains. It overwrites Workers Builds settings and replaces deploy keys.",
  when: "Use this when an app's builds, deploy keys, or setup are broken, or the user asks to finish a pending Cloudflare setup.",
  inputSchema: object({ app: appInput, buildTokenUuid: optionalTokenInput }, ["app"]),
  annotations: DESTRUCTIVE_OPEN,
  output: "performed[], remaining[]",
  dashboard:
    "Settings 'Needs attention' buttons pass an explicit step; MCP omits it and the server picks",
  handler: (state, args) =>
    repair(
      state,
      findApp(state, readString(args, "app")),
      readOptionalString(args, "buildTokenUuid"),
    ),
});

const H_INSTRUCTIONS = `Samebase manages apps: a GitHub repository with attached Cloudflare Workers and Convex projects. Use Samebase tools only for these apps and their attachments. For unrelated repositories, standalone provider resources, code changes, logs, environment variables, migrations, and custom domains, use GitHub, Cloudflare, or Convex tools.

Name an app by its GitHub full name (owner/name). For build, deployment, check, or pull request state, call {{app_status}} and follow its attention items.

Only the Samebase dashboard can delete an app, rename resources, or manage members, organization settings, billing, and provider connections. Say so, and offer {{sign_in_link}}. Call it only after the user accepts.

When a result asks for a choice, ask the user and pass the choice. A started setup, requested build, or Git push does not prove a successful deployment.`;

const hTools: ToolSpec[] = [
  ...appSessionAndReads(),
  {
    key: "find_workers",
    names: {
      A: "repository_cloudflare_discoverWorkers",
      B: "repository_cloudflare_findWorkers",
      C: "find_cloudflare_workers",
      D: "samebase_find_cloudflare_workers",
      E: "samebase_find_cloudflare_workers",
    },
    description:
      "List the Workers in the app's Cloudflare account that can be added to this app: attachable (already connected to this repository; use {{attach_workers}}) and connectable (no repository connection; use {{connect_worker}}), with counts of Workers that cannot be added and why.",
    when: "Use this when the user asks which existing Cloudflare Workers can be added to a Samebase app.",
    inputSchema: object({ app: appInput }, ["app"]),
    annotations: RO,
    output: "attachable[], connectable[], cannotAdd counts by reason",
    dashboard: "repository.cloudflare.discoverWorkers (dialog keeps every row)",
    handler: (state, args) => workerFindings(state, findApp(state, readString(args, "app"))),
  },
  {
    key: "attach_workers",
    names: {
      A: "repository_cloudflare_attachWorkers",
      B: "repository_cloudflare_attachWorkers",
      C: "attach_cloudflare_workers",
      D: "samebase_attach_cloudflare_workers",
      E: "samebase_attach_cloudflare_workers",
    },
    description:
      "Attach Workers that are already connected to this app's GitHub repository in Cloudflare (attachable), by name. Records the attachment in Samebase only; nothing changes in Cloudflare.",
    when: "Use this when the user wants to add existing Workers that are already connected to the app's repository.",
    inputSchema: object(
      {
        app: appInput,
        workerNames: {
          type: "array",
          items: { type: "string" },
          description: "Names of attachable Workers.",
        },
      },
      ["app", "workerNames"],
    ),
    annotations: WRITE_CLOSED,
    output: "attached Worker names",
    dashboard: "repository.cloudflare.attachWorkers (server resolves tags from names)",
    handler: (state, args) => {
      const app = findApp(state, readString(args, "app"));
      const workers = readArray(args, "workerNames").map((name) => {
        const worker = typeof name === "string" ? findAccountWorker(state, name) : undefined;
        if (!worker)
          throw new Error(`No Worker named ${String(name)} in the app's Cloudflare account.`);
        const status = workerAttachment(app, worker);
        if (status === "connectable")
          throw new Error(
            `Worker ${worker.name} has no repository connection; use {{connect_worker}} to connect it.`,
          );
        if (status !== "attachable")
          throw new Error(
            `Worker ${worker.name} cannot be attached: ${status === "attached" ? "it is already on this app" : status === "attached_elsewhere" ? "another Samebase app uses it" : "it is connected to another repository in Cloudflare"}.`,
          );
        return worker;
      });
      for (const worker of workers) attachWorker(state, app, worker);
      return { attached: workers.map((worker) => worker.name) };
    },
  },
  {
    key: "connect_worker",
    names: {
      A: "repository_cloudflare_connectWorker",
      B: "repository_cloudflare_connectWorker",
      C: "connect_cloudflare_worker",
      D: "samebase_connect_cloudflare_worker",
      E: "samebase_connect_cloudflare_worker",
    },
    description:
      "Connect an existing Worker that has no repository connection (connectable) to this app: configure Workers Builds for a repository root, install the Convex deploy key for the app's Convex project, and start a production build that replaces what the Worker serves now. Tell the user that before calling.",
    when: "Use this when the user wants to add an existing Worker that is not connected to any repository yet.",
    inputSchema: object(
      {
        app: appInput,
        workerName: str("Name of a connectable Worker."),
        rootDirectory: str("Repository root for Workers Builds. Defaults to /."),
        buildTokenUuid: optionalTokenInput,
      },
      ["app", "workerName"],
    ),
    annotations: DESTRUCTIVE_OPEN,
    output: "Worker name, deploy-key note",
    dashboard: "repository.cloudflare.connectWorker (dialog passes the token it shows)",
    handler: (state, args) => {
      const app = findApp(state, readString(args, "app"));
      const worker = findAccountWorker(state, readString(args, "workerName"));
      if (!worker)
        throw new Error(
          `No Worker named ${String(args.workerName)} in the app's Cloudflare account. To create one, use {{create_worker}}.`,
        );
      const token = chooseToken(state, readOptionalString(args, "buildTokenUuid"));
      if (!token)
        throw new Error(
          "The Cloudflare account has no Workers Builds token. The user must create one: https://samebase.com/docs/cloudflare-setup",
        );
      const workerId = connectWorker(
        state,
        app,
        worker,
        readOptionalString(args, "rootDirectory") ?? "/",
        token,
      );
      return { connected: worker.name, note: installKeysIfOneProject(state, app, workerId) };
    },
  },
  {
    key: "create_worker",
    names: {
      A: "repository_cloudflare_createWorker",
      B: "repository_cloudflare_createWorker",
      C: "create_cloudflare_worker",
      D: "samebase_create_cloudflare_worker",
      E: "samebase_create_cloudflare_worker",
    },
    description:
      "Create a new Cloudflare Worker for this app with Workers Builds and the Convex deploy key for the app's Convex project, then start the first production build. Without workerName it completes the app's pending Cloudflare setup with the planned name and root. An existing Worker name is rejected.",
    when: "Use this when the user wants a new Cloudflare Worker for a Samebase app or to finish a pending Cloudflare setup.",
    inputSchema: object(
      {
        app: appInput,
        workerName: str(
          "Optional name for the new Worker. Defaults to the pending setup's planned name.",
        ),
        rootDirectory: str(
          "Repository root for Workers Builds. Defaults to / or the planned root.",
        ),
        buildTokenUuid: optionalTokenInput,
      },
      ["app"],
    ),
    annotations: WRITE_OPEN,
    output: "Worker name, deploy-key note",
    dashboard: "repository.cloudflare.createWorker",
    handler: (state, args) => {
      const app = findApp(state, readString(args, "app"));
      const name = readOptionalString(args, "workerName") ?? app.pendingCloudflare?.workerName;
      if (!name) throw new Error("Pass workerName: this app has no pending Cloudflare setup.");
      const token = chooseToken(state, readOptionalString(args, "buildTokenUuid"));
      if (!token)
        throw new Error(
          "The Cloudflare account has no Workers Builds token. The user must create one: https://samebase.com/docs/cloudflare-setup",
        );
      const created = createWorker(
        state,
        app,
        name,
        readOptionalString(args, "rootDirectory") ?? app.pendingCloudflare?.rootDirectory ?? "/",
        token,
      );
      return { created: name, note: installKeysIfOneProject(state, app, created.workerId) };
    },
  },
  {
    key: "find_convex",
    names: {
      A: "repository_convex_discoverProjects",
      B: "repository_convex_findProjects",
      C: "find_convex_projects",
      D: "samebase_find_convex_projects",
      E: "samebase_find_convex_projects",
    },
    description:
      "List the Convex code locations in the app's repository and the Convex projects in the connected team that can be attached to this app, with counts of projects that cannot and why.",
    when: "Use this when the user asks which Convex projects can be added to a Samebase app.",
    inputSchema: object({ app: appInput }, ["app"]),
    annotations: RO,
    output: "codeLocations[], attachable[], needsProductionDeployment[], cannotAdd counts",
    dashboard: "repository.convex.discoverProjects (dialog keeps every row)",
    handler: (state, args) => convexFindings(state, findApp(state, readString(args, "app"))),
  },
  {
    key: "add_convex",
    names: {
      A: "repository_convex_addProject",
      B: "repository_convex_addProject",
      C: "add_convex_project",
      D: "samebase_add_convex_project",
      E: "samebase_add_convex_project",
    },
    description:
      "Attach an existing Convex project to this app by name, or create a new Convex project with a production deployment when create is true. Uses the repository's only Convex code location unless codeLocation is given.",
    when: "Use this when the user wants an existing or new Convex project on a Samebase app.",
    inputSchema: object(
      {
        app: appInput,
        projectName: str("Convex project name."),
        create: { type: "boolean", description: "true creates a new project. Defaults to false." },
        codeLocation: str("Optional code location path from {{find_convex}}."),
        convexDeploymentRegion: regionSchema,
      },
      ["app", "projectName"],
    ),
    annotations: WRITE_OPEN,
    output: "action attached|created, project name, code location",
    dashboard:
      "repository.convex.attachProjects and createProject (one handler; dialog passes the mode)",
    handler: (state, args) =>
      addConvex(state, findApp(state, readString(args, "app")), args, false),
  },
  repairSpec({
    A: "repository_actions_repairApp",
    B: "repository_repair",
    C: "repair_app",
    D: "samebase_repair_app",
    E: "samebase_repair_repository",
  }),
  {
    key: "detach",
    names: {
      A: "repository_actions_detachResource",
      B: "repository_detachResource",
      C: "detach_resource",
      D: "samebase_detach_resource",
      E: "samebase_detach_resource",
    },
    description:
      "Detach a Worker or Convex project from this app by name. Only the Samebase record is removed; the provider resource does not change, and attaching it again undoes this.",
    when: "Use this when the user wants a Worker or Convex project removed from a Samebase app without deleting it.",
    inputSchema: object(
      { app: appInput, resourceName: str("Name of the attached Worker or Convex project.") },
      ["app", "resourceName"],
    ),
    annotations: DESTRUCTIVE_CLOSED,
    output: "detached kind and name",
    dashboard:
      "repository.cloudflare.detachWorker and repository.convex.detachProject (one handler)",
    handler: (state, args) =>
      detachByName(
        state,
        findApp(state, readString(args, "app")),
        readString(args, "resourceName"),
      ),
  },
];

const wTools: ToolSpec[] = [
  ...appSessionAndReads(),
  {
    key: "find_addable",
    names: {
      A: "repository_dashboard_findAddableResources",
      B: "repository_findAddableResources",
      C: "find_addable_resources",
      D: "samebase_find_addable_resources",
      E: "samebase_find_addable_resources",
    },
    description:
      "List the Cloudflare Workers and Convex projects that can be added to this app, with counts of those that cannot and why, and the app's Convex code locations.",
    when: "Use this when the user asks which existing Workers or Convex projects can be added to a Samebase app.",
    inputSchema: object({ app: appInput }, ["app"]),
    annotations: RO,
    output: "cloudflareWorkers {attachable, connectable, cannotAdd}, convexProjects {...}",
    dashboard: "both discovery actions in one read",
    handler: (state, args) => {
      const app = findApp(state, readString(args, "app"));
      return {
        cloudflareWorkers: workerFindings(state, app),
        convexProjects: convexFindings(state, app),
      };
    },
  },
  {
    key: "add_worker",
    names: {
      A: "repository_cloudflare_addWorker",
      B: "repository_cloudflare_addWorker",
      C: "add_cloudflare_worker",
      D: "samebase_add_cloudflare_worker",
      E: "samebase_add_cloudflare_worker",
    },
    description:
      "Add a Cloudflare Worker to this app by name. Samebase checks the Worker: if it is already connected to this repository it is attached; if it has no repository connection it is connected, and a production build replaces what it serves now; if no Worker has this name, a new Worker is created with Workers Builds. Connected and created Workers get the Convex deploy key for the app's Convex project. Workers used by another app or connected to another repository are rejected with the reason.",
    when: "Use this when the user wants a Cloudflare Worker, existing or new, on a Samebase app.",
    inputSchema: object(
      {
        app: appInput,
        workerName: str("Worker name."),
        rootDirectory: str(
          "Repository root for Workers Builds when Samebase connects or creates the Worker. Defaults to /.",
        ),
        buildTokenUuid: optionalTokenInput,
      },
      ["app", "workerName"],
    ),
    annotations: DESTRUCTIVE_OPEN,
    output: "action attached|connected|created, Worker name, note",
    dashboard:
      "repository.cloudflare attach, connect, and create in one handler; the dialog passes its explicit mode",
    handler: (state, args) => {
      const app = findApp(state, readString(args, "app"));
      const name = readString(args, "workerName");
      const worker = findAccountWorker(state, name);
      const root = readOptionalString(args, "rootDirectory") ?? "/";
      if (worker) {
        const status = workerAttachment(app, worker);
        if (status === "attachable") {
          attachWorker(state, app, worker);
          return { action: "attached", workerName: worker.name };
        }
        if (status === "connectable") {
          const token = chooseToken(state, readOptionalString(args, "buildTokenUuid"));
          if (!token)
            throw new Error(
              "The Cloudflare account has no Workers Builds token. The user must create one: https://samebase.com/docs/cloudflare-setup",
            );
          const workerId = connectWorker(state, app, worker, root, token);
          return {
            action: "connected",
            workerName: worker.name,
            note: installKeysIfOneProject(state, app, workerId),
          };
        }
        throw new Error(
          `Worker ${worker.name} cannot be added: ${status === "attached" ? "it is already on this app" : status === "attached_elsewhere" ? "another Samebase app uses it" : "it is connected to another repository in Cloudflare"}.`,
        );
      }
      const token = chooseToken(state, readOptionalString(args, "buildTokenUuid"));
      if (!token)
        throw new Error(
          "The Cloudflare account has no Workers Builds token. The user must create one: https://samebase.com/docs/cloudflare-setup",
        );
      const created = createWorker(state, app, name, root, token);
      return {
        action: "created",
        workerName: name,
        note: installKeysIfOneProject(state, app, created.workerId),
      };
    },
  },
  {
    key: "add_convex",
    names: {
      A: "repository_convex_addProject",
      B: "repository_convex_addProject",
      C: "add_convex_project",
      D: "samebase_add_convex_project",
      E: "samebase_add_convex_project",
    },
    description:
      "Add a Convex project to this app by name: attach it if the connected Convex team has it, or create it with a production deployment if it does not. Uses the repository's only Convex code location unless codeLocation is given.",
    when: "Use this when the user wants a Convex project, existing or new, on a Samebase app.",
    inputSchema: object(
      {
        app: appInput,
        projectName: str("Convex project name."),
        codeLocation: str("Optional code location path."),
        convexDeploymentRegion: regionSchema,
      },
      ["app", "projectName"],
    ),
    annotations: WRITE_OPEN,
    output: "action attached|created, project name, code location",
    dashboard: "repository.convex attach and create in one handler",
    handler: (state, args) => addConvex(state, findApp(state, readString(args, "app")), args, true),
  },
  repairSpec({
    A: "repository_actions_repairApp",
    B: "repository_repair",
    C: "repair_app",
    D: "samebase_repair_app",
    E: "samebase_repair_repository",
  }),
  {
    key: "detach",
    names: {
      A: "repository_actions_removeResource",
      B: "repository_removeResource",
      C: "remove_resource",
      D: "samebase_remove_resource",
      E: "samebase_remove_resource",
    },
    description:
      "Remove a Worker or Convex project from this app by name. Only the Samebase record is removed; the provider resource does not change, and adding it again undoes this.",
    when: "Use this when the user wants a Worker or Convex project removed from a Samebase app without deleting it.",
    inputSchema: object(
      { app: appInput, resourceName: str("Name of the attached Worker or Convex project.") },
      ["app", "resourceName"],
    ),
    annotations: DESTRUCTIVE_CLOSED,
    output: "removed kind and name",
    dashboard:
      "repository.cloudflare.detachWorker and repository.convex.detachProject (one handler)",
    handler: (state, args) =>
      detachByName(
        state,
        findApp(state, readString(args, "app")),
        readString(args, "resourceName"),
      ),
  },
];

export const DESIGNS: Record<DesignId, Design> = {
  P: {
    id: "P",
    label: "primitive mirror (RFC 125, 21 tools)",
    instructions: P_INSTRUCTIONS,
    tools: pTools,
  },
  W: {
    id: "W",
    label: "workflow level (12 tools)",
    instructions: H_INSTRUCTIONS.replace(
      "follow its attention items",
      "follow its attention items with {{repair}}",
    ),
    tools: wTools,
  },
  H: {
    id: "H",
    label: "hybrid (15 tools)",
    instructions: H_INSTRUCTIONS.replace(
      "follow its attention items",
      "follow its attention items with {{repair}}",
    ),
    tools: hTools,
  },
};

export type DescriptionVariant = "base" | "when";

export type RenderedTool = {
  key: string;
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: Annotations;
};

function substitute(text: string, names: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const name = names[key];
    if (!name) throw new Error(`Unknown tool reference {{${key}}}.`);
    return name;
  });
}

function substituteSchema(value: unknown, names: Record<string, string>): unknown {
  if (typeof value === "string") return substitute(value, names);
  if (Array.isArray(value)) return value.map((entry) => substituteSchema(entry, names));
  if (typeof value === "object" && value !== null) {
    const result: { [key: string]: unknown } = {};
    for (const [key, entry] of Object.entries(value)) result[key] = substituteSchema(entry, names);
    return result;
  }
  return value;
}

export function namesFor(design: Design, scheme: Scheme): Record<string, string> {
  const names: Record<string, string> = {};
  for (const tool of design.tools) names[tool.key] = tool.names[scheme];
  // Aliases used by descriptions shared across designs.
  if (names.discover_convex) names.discover_convex_projects = names.discover_convex;
  if (!("list_build_tokens" in names)) names.list_build_tokens = "(no token tool)";
  return names;
}

export function renderCatalog(
  designId: DesignId,
  scheme: Scheme,
  variant: DescriptionVariant = "base",
) {
  const design = DESIGNS[designId];
  const names = namesFor(design, scheme);
  const seen = new Set<string>();
  const tools: RenderedTool[] = design.tools.map((tool) => {
    if (seen.has(tool.names[scheme]))
      throw new Error(`Duplicate tool name ${tool.names[scheme]} in ${designId}/${scheme}.`);
    seen.add(tool.names[scheme]);
    const description = variant === "when" ? `${tool.when} ${tool.description}` : tool.description;
    const schema = substituteSchema(tool.inputSchema, names);
    return {
      key: tool.key,
      name: tool.names[scheme],
      title: tool.key,
      description: substitute(description, names),
      inputSchema: readRecord(schema, "inputSchema"),
      annotations: tool.annotations,
    };
  });
  return { design, names, tools, instructions: substitute(design.instructions, names) };
}

export function handlerFor(
  designId: DesignId,
  scheme: Scheme,
  name: string,
): { spec: ToolSpec; names: Record<string, string> } | undefined {
  const design = DESIGNS[designId];
  const spec = design.tools.find((tool) => tool.names[scheme] === name);
  return spec ? { spec, names: namesFor(design, scheme) } : undefined;
}

export function callTool(
  state: State,
  designId: DesignId,
  scheme: Scheme,
  name: string,
  rawArgs: unknown,
): { ok: boolean; result: unknown; text: string } {
  const found = handlerFor(designId, scheme, name);
  if (!found) return { ok: false, result: null, text: `Unknown tool: ${name}` };
  try {
    const args = rawArgs === undefined || rawArgs === null ? {} : readRecord(rawArgs, "arguments");
    rejectUnknown(args, found.spec.inputSchema);
    const result = found.spec.handler(state, args, found.names);
    const text = substitute(JSON.stringify(result), found.names);
    return { ok: true, result: JSON.parse(text), text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, result: null, text: substitute(message, found.names) };
  }
}

export const FIXTURE_APP2 = APP2;
export { requireToken };
