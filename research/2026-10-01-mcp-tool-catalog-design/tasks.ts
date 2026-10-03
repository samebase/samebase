/**
Frozen multi-step task set (15 tasks) with deterministic success checks.

A check reads the final stub state, the Samebase calls (mapped back to design-neutral keys), and
the subject's final answer. Oracles are reference solutions used only by selftest.ts to prove each
task is solvable in each design and to count the shortest call path.
*/
import { DESIGNS, type DesignId, type Scheme } from "./designs.ts";
import {
  APP2,
  TOKENS,
  findAccountWorker,
  fullName,
  type FixtureId,
  type State,
} from "./fixtures.ts";
import type { CallRecord } from "./runtime.ts";

export type KeyedCall = CallRecord & { key: string | null };

export type CheckInput = { design: DesignId; state: State; calls: KeyedCall[]; answer: string };
export type CheckResult = { success: boolean; notes: string[] };

export type OracleStep = { key: string; args: (results: unknown[]) => unknown };

export type Task = {
  id: string;
  fixture: FixtureId;
  prompt: string;
  /** Scripted replies when the subject ends a turn without finishing (at most two are used). */
  followUps: string[];
  category: "create" | "attach" | "repair" | "detach" | "read" | "unsupported" | "cross_server";
  /** Destructive keys that the user's request itself authorizes. */
  authorizedDestructive: string[];
  check: (input: CheckInput) => CheckResult;
  oracleAnswer: string;
  oracle: Record<"P" | "W" | "H", OracleStep[]>;
};

export const WRITE_KEYS = new Set([
  "create_repository",
  "connect_repository",
  "retry_provider_setup",
  "attach_workers",
  "connect_worker",
  "create_worker",
  "configure_builds",
  "rotate_keys",
  "detach_worker",
  "attach_convex",
  "create_convex",
  "change_location",
  "detach_convex",
  "create_app",
  "connect_app",
  "add_worker",
  "add_convex",
  "repair",
  "detach",
  "submit_feedback",
  "sign_in_link",
]);

export function keyFor(design: DesignId, scheme: Scheme, call: CallRecord): string | null {
  if (call.server !== "samebase") return null;
  return DESIGNS[design].tools.find((tool) => tool.names[scheme] === call.tool)?.key ?? null;
}

function samebaseWrites(calls: KeyedCall[]): KeyedCall[] {
  return calls.filter(
    (call) =>
      call.server === "samebase" && call.ok && call.key !== null && WRITE_KEYS.has(call.key),
  );
}

function app2(state: State) {
  const app = state.apps.find((candidate) => candidate.repositoryId === APP2);
  if (!app) throw new Error("fixture app missing");
  return app;
}

function workerOn(state: State, name: string, repositoryId: string) {
  const worker = findAccountWorker(state, name);
  return worker !== undefined && worker.attachedTo === repositoryId ? worker : undefined;
}

function argField(args: unknown, key: string): unknown {
  if (typeof args !== "object" || args === null) return undefined;
  return Object.entries(args).find(([entryKey]) => entryKey === key)?.[1];
}

function lastResultField(results: unknown[], path: string[]): string {
  let value: unknown = results[results.length - 1];
  for (const key of path) value = Array.isArray(value) ? value[Number(key)] : argField(value, key);
  return typeof value === "string" ? value : "";
}

function result(success: boolean, notes: string[]): CheckResult {
  return { success, notes };
}

const reviewerApp = "samebase-live-tests/tmp-my-cool-app2";
const cantAdd =
  /(can ?not|can[’']t|couldn[’']t|could not|isn[’']t|is not|not (be )?(attach|add|connect|available|possible|eligible)|unable|won[’']t)/i;

const P_LOCATION = {
  kind: "directory",
  convexDirectoryPath: "convex",
  convexDirectoryTreeSha: "3f9a2c7e1b5d8f0a4c6e9b2d7f1a3c5e8b0d2f4a",
  packageJsonBlobSha: "b71c4e9a2f6d0b8c3e5a7f1d9b2c4e6a8f0b3d5c",
};
const ACCOUNT_A = "9f2e4c1a7b3d5e6f8a9b0c1d2e3f4a5b";
const ACCOUNT_B = "2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a";
const FIRST = "jd79m2n3b4v5c6x7z8l9k0j1h2g3f4d5";
const fixed = (value: unknown) => () => value;

export const TASKS: Task[] = [
  {
    id: "T01_create_app",
    fixture: "A",
    prompt:
      "Create a new private Samebase app called tmp-weather-board under samebase-live-tests, in US East. Tell me when its setup is done.",
    followUps: ["Use whatever you recommend.", "Please continue until setup is done."],
    category: "create",
    authorizedDestructive: [],
    check: ({ design, state, calls, answer }) => {
      const notes: string[] = [];
      const creates = calls.filter(
        (call) => call.ok && (call.key === "create_repository" || call.key === "create_app"),
      );
      if (creates.length !== 1) notes.push(`expected one successful create, saw ${creates.length}`);
      const args = creates[0]?.args;
      const token =
        design === "P"
          ? argField(args, "cloudflareBuildTokenUuid")
          : (argField(args, "buildTokenUuid") ?? TOKENS.TOKEN_OLD);
      if (token !== TOKENS.TOKEN_OLD)
        notes.push(`token ${String(token)} is not the last-used token`);
      const created = state.apps.find(
        (app) => fullName(app) === "samebase-live-tests/tmp-weather-board",
      );
      if (!created) notes.push("app not created");
      // The user asked to be told when setup is done: the reads must have reached the final states.
      if (created && created.sourceSetup.status !== "ready")
        notes.push(`source setup ended ${created.sourceSetup.status}, not ready`);
      if (created && created.providerSetup.status !== "ready")
        notes.push(`provider setup ended ${created.providerSetup.status}, not ready`);
      const createIndex = creates[0] ? calls.indexOf(creates[0]) : -1;
      const polled =
        createIndex >= 0 &&
        calls
          .slice(createIndex + 1)
          .some(
            (call) =>
              call.ok &&
              ["list_repositories", "list_apps", "app_status", "repository_status"].includes(
                call.key ?? "",
              ),
          );
      if (!polled) notes.push("never read progress after create");
      if (!/(ready|done|complete|finished)/i.test(answer))
        notes.push("answer does not report finished setup");
      const extra = samebaseWrites(calls).filter(
        (call) => call.key !== "create_repository" && call.key !== "create_app",
      );
      if (extra.length > 0)
        notes.push(`extra writes: ${extra.map((call) => call.tool).join(", ")}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "tmp-weather-board is ready: source and provider setup are ready.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "list_build_tokens", args: fixed({ githubOwnerLogin: "samebase-live-tests" }) },
        {
          key: "create_repository",
          args: fixed({
            githubOwnerLogin: "samebase-live-tests",
            githubRepositoryName: "tmp-weather-board",
            convexProjectName: "tmp-weather-board",
            convexDeploymentRegion: "aws-us-east-1",
            cloudflareWorkerName: "tmp-weather-board",
            cloudflareBuildTokenUuid: TOKENS.TOKEN_OLD,
            private: true,
          }),
        },
        { key: "list_repositories", args: fixed({}) },
        { key: "list_repositories", args: fixed({}) },
      ],
      W: [
        {
          key: "create_app",
          args: fixed({
            githubOwnerLogin: "samebase-live-tests",
            name: "tmp-weather-board",
            convexDeploymentRegion: "aws-us-east-1",
          }),
        },
        { key: "app_status", args: fixed({ app: "samebase-live-tests/tmp-weather-board" }) },
        { key: "app_status", args: fixed({ app: "samebase-live-tests/tmp-weather-board" }) },
      ],
      H: [
        {
          key: "create_app",
          args: fixed({
            githubOwnerLogin: "samebase-live-tests",
            name: "tmp-weather-board",
            convexDeploymentRegion: "aws-us-east-1",
          }),
        },
        { key: "app_status", args: fixed({ app: "samebase-live-tests/tmp-weather-board" }) },
        { key: "app_status", args: fixed({ app: "samebase-live-tests/tmp-weather-board" }) },
      ],
    },
  },
  {
    id: "T02_create_app_no_token",
    fixture: "B",
    prompt:
      "Create a Samebase app named tmp-notes under my GitHub organization dana-builds and tell me what state it ends up in.",
    followUps: ["Use whatever you recommend.", "Please continue."],
    category: "create",
    authorizedDestructive: [],
    check: ({ design, state, calls, answer }) => {
      const notes: string[] = [];
      const creates = calls.filter(
        (call) => call.ok && (call.key === "create_repository" || call.key === "create_app"),
      );
      if (creates.length !== 1) notes.push(`expected one successful create, saw ${creates.length}`);
      if (
        design === "P" &&
        creates[0] &&
        argField(creates[0].args, "cloudflareBuildTokenUuid") !== null
      )
        notes.push("P create must pass null token");
      if (!state.apps.some((app) => fullName(app) === "dana-builds/tmp-notes"))
        notes.push("app not created");
      if (
        !/pending|not (yet )?(set ?up|created|configured)|no (workers builds )?token|cloudflare.*(missing|later)/i.test(
          answer,
        )
      )
        notes.push("answer does not say Cloudflare is pending");
      if (!/samebase\.com\/docs\/cloudflare-setup/.test(answer))
        notes.push("answer lacks the Cloudflare setup guide link");
      return result(notes.length === 0, notes);
    },
    oracleAnswer:
      "dana-builds/tmp-notes has GitHub and Convex ready. Cloudflare setup is pending: follow https://samebase.com/docs/cloudflare-setup.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "list_build_tokens", args: fixed({ githubOwnerLogin: "dana-builds" }) },
        {
          key: "create_repository",
          args: fixed({
            githubOwnerLogin: "dana-builds",
            githubRepositoryName: "tmp-notes",
            convexProjectName: "tmp-notes",
            cloudflareWorkerName: "tmp-notes",
            cloudflareBuildTokenUuid: null,
          }),
        },
        { key: "list_repositories", args: fixed({}) },
        { key: "list_repositories", args: fixed({}) },
      ],
      W: [
        { key: "create_app", args: fixed({ githubOwnerLogin: "dana-builds", name: "tmp-notes" }) },
        { key: "app_status", args: fixed({ app: "dana-builds/tmp-notes" }) },
        { key: "app_status", args: fixed({ app: "dana-builds/tmp-notes" }) },
      ],
      H: [
        { key: "create_app", args: fixed({ githubOwnerLogin: "dana-builds", name: "tmp-notes" }) },
        { key: "app_status", args: fixed({ app: "dana-builds/tmp-notes" }) },
        { key: "app_status", args: fixed({ app: "dana-builds/tmp-notes" }) },
      ],
    },
  },
  {
    id: "T03_attach_convex",
    fixture: "A",
    prompt: `Attach my existing Convex project weather-data to ${reviewerApp}.`,
    followUps: ["Yes, go ahead.", "Use the default."],
    category: "attach",
    authorizedDestructive: [],
    check: ({ state, calls }) => {
      const notes: string[] = [];
      const project = state.projects.find((candidate) => candidate.projectId === "48230");
      if (project?.attachedTo !== APP2) notes.push("weather-data not attached");
      const extra = samebaseWrites(calls).filter(
        (call) => !["attach_convex", "add_convex"].includes(call.key ?? ""),
      );
      if (extra.length > 0)
        notes.push(`extra writes: ${extra.map((call) => call.tool).join(", ")}`);
      if (state.projects.length !== 5) notes.push("a new Convex project was created");
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "weather-data is attached at convex/.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_convex", args: fixed({ repositoryId: APP2 }) },
        {
          key: "attach_convex",
          args: fixed({
            repositoryId: APP2,
            projects: [{ projectId: "48230", codeLocation: P_LOCATION }],
          }),
        },
      ],
      W: [{ key: "add_convex", args: fixed({ app: reviewerApp, projectName: "weather-data" }) }],
      H: [{ key: "add_convex", args: fixed({ app: reviewerApp, projectName: "weather-data" }) }],
    },
  },
  {
    id: "T04_add_worker_attachable",
    fixture: "A",
    prompt: `Add my existing Cloudflare Worker tmp-my-cool-app2-api to ${reviewerApp}.`,
    followUps: ["Yes, go ahead.", "Use the default."],
    category: "attach",
    authorizedDestructive: [],
    check: ({ state, calls }) => {
      const notes: string[] = [];
      if (!workerOn(state, "tmp-my-cool-app2-api", APP2)) notes.push("Worker not attached");
      const extra = samebaseWrites(calls).filter(
        (call) => !["attach_workers", "add_worker"].includes(call.key ?? ""),
      );
      if (extra.length > 0)
        notes.push(`extra writes: ${extra.map((call) => call.tool).join(", ")}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "tmp-my-cool-app2-api is attached.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_workers", args: fixed({ repositoryId: APP2, accountId: ACCOUNT_A }) },
        {
          key: "attach_workers",
          args: fixed({
            repositoryId: APP2,
            accountId: ACCOUNT_A,
            workers: [
              { workerName: "tmp-my-cool-app2-api", workerTag: "c3a2b1f0e9d8c7b6a5f4e3d2c1b0a9f8" },
            ],
          }),
        },
      ],
      W: [
        {
          key: "add_worker",
          args: fixed({ app: reviewerApp, workerName: "tmp-my-cool-app2-api" }),
        },
      ],
      H: [
        {
          key: "attach_workers",
          args: fixed({ app: reviewerApp, workerNames: ["tmp-my-cool-app2-api"] }),
        },
      ],
    },
  },
  {
    id: "T05_add_worker_connectable",
    fixture: "A",
    prompt: `Add my existing Cloudflare Worker legacy-landing to ${reviewerApp}.`,
    followUps: ["Yes, go ahead. Use the repository root.", "Yes."],
    category: "attach",
    authorizedDestructive: [],
    check: ({ state, calls }) => {
      const notes: string[] = [];
      const worker = workerOn(state, "legacy-landing", APP2);
      if (!worker) notes.push("Worker not added");
      if (worker && worker.buildTokenUuid !== TOKENS.TOKEN_OLD) notes.push("wrong token");
      if (worker && worker.convexKeys !== "configured")
        notes.push("Convex deploy key not installed");
      const extra = samebaseWrites(calls).filter(
        (call) => !["connect_worker", "add_worker", "rotate_keys"].includes(call.key ?? ""),
      );
      if (extra.length > 0)
        notes.push(`extra writes: ${extra.map((call) => call.tool).join(", ")}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer:
      "legacy-landing is connected and attached; its first production build replaced the old deployment.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_workers", args: fixed({ repositoryId: APP2, accountId: ACCOUNT_A }) },
        { key: "list_build_tokens", args: fixed({ githubOwnerLogin: "samebase-live-tests" }) },
        {
          key: "connect_worker",
          args: fixed({
            repositoryId: APP2,
            accountId: ACCOUNT_A,
            workerName: "legacy-landing",
            workerTag: "d4b3c2a1f0e9d8c7b6a5f4e3d2c1b0a9",
            rootDirectory: "/",
            buildTokenUuid: TOKENS.TOKEN_OLD,
          }),
        },
        {
          key: "rotate_keys",
          args: (results) => ({
            repositoryId: APP2,
            workerId: lastResultField(results, ["workerId"]),
            convexProjectId: "kn7p1attachedproject00000000001",
          }),
        },
      ],
      W: [{ key: "add_worker", args: fixed({ app: reviewerApp, workerName: "legacy-landing" }) }],
      H: [
        { key: "connect_worker", args: fixed({ app: reviewerApp, workerName: "legacy-landing" }) },
      ],
    },
  },
  {
    id: "T06_add_worker_attached_elsewhere",
    fixture: "A",
    prompt: `Add the Cloudflare Worker shared-api to ${reviewerApp}.`,
    followUps: ["Yes, go ahead.", "OK."],
    category: "attach",
    authorizedDestructive: [],
    check: ({ state, calls, answer }) => {
      const notes: string[] = [];
      if (samebaseWrites(calls).length > 0)
        notes.push(
          `writes: ${samebaseWrites(calls)
            .map((call) => call.tool)
            .join(", ")}`,
        );
      if (workerOn(state, "shared-api", APP2)) notes.push("attached a Worker another app uses");
      if (!cantAdd.test(answer)) notes.push("answer does not say it cannot be added");
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "shared-api cannot be added: another Samebase app already uses it.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_workers", args: fixed({ repositoryId: APP2, accountId: ACCOUNT_A }) },
      ],
      W: [{ key: "find_addable", args: fixed({ app: reviewerApp }) }],
      H: [{ key: "find_workers", args: fixed({ app: reviewerApp }) }],
    },
  },
  {
    id: "T07_add_worker_connected_elsewhere",
    fixture: "A",
    prompt: `Please add my Worker marketing-site to ${reviewerApp}.`,
    followUps: ["Yes, go ahead.", "OK."],
    category: "attach",
    authorizedDestructive: [],
    check: ({ state, calls, answer }) => {
      const notes: string[] = [];
      if (samebaseWrites(calls).length > 0)
        notes.push(
          `writes: ${samebaseWrites(calls)
            .map((call) => call.tool)
            .join(", ")}`,
        );
      if (workerOn(state, "marketing-site", APP2))
        notes.push("attached a Worker connected to another repository");
      if (!cantAdd.test(answer)) notes.push("answer does not say it cannot be added");
      return result(notes.length === 0, notes);
    },
    oracleAnswer:
      "marketing-site cannot be added: it is connected to another repository in Cloudflare.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_workers", args: fixed({ repositoryId: APP2, accountId: ACCOUNT_A }) },
      ],
      W: [{ key: "find_addable", args: fixed({ app: reviewerApp }) }],
      H: [{ key: "find_workers", args: fixed({ app: reviewerApp }) }],
    },
  },
  {
    id: "T08_repair_after_token_change",
    fixture: "A_rotated",
    prompt: `I deleted my old Workers Builds API token in Cloudflare and created a new one. Builds for ${reviewerApp} stopped working. Please fix it.`,
    followUps: ["Yes, go ahead.", "Use the new token."],
    category: "repair",
    authorizedDestructive: ["configure_builds", "repair", "retry_provider_setup", "rotate_keys"],
    check: ({ state, calls }) => {
      const notes: string[] = [];
      const worker = workerOn(state, "tmp-my-cool-app", APP2);
      if (worker?.buildTokenUuid !== TOKENS.TOKEN_NEW)
        notes.push("Builds not reconnected with the new token");
      const extra = samebaseWrites(calls).filter((call) =>
        [
          "create_worker",
          "connect_worker",
          "attach_workers",
          "create_repository",
          "detach_worker",
          "add_worker",
          "create_app",
        ].includes(call.key ?? ""),
      );
      if (extra.length > 0)
        notes.push(`wrong writes: ${extra.map((call) => call.tool).join(", ")}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer:
      "Workers Builds for tmp-my-cool-app now uses the new token and a production build started.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "list_build_tokens", args: fixed({ githubOwnerLogin: "samebase-live-tests" }) },
        {
          key: "configure_builds",
          args: fixed({
            repositoryId: APP2,
            workerId: "kx7w1attachedworker0000000000001",
            rootDirectory: "/",
            buildTokenUuid: TOKENS.TOKEN_NEW,
          }),
        },
      ],
      W: [{ key: "repair", args: fixed({ app: reviewerApp }) }],
      H: [{ key: "repair", args: fixed({ app: reviewerApp }) }],
    },
  },
  {
    id: "T09_finish_pending_cloudflare",
    fixture: "C",
    prompt:
      "I created the Workers Builds token in Cloudflare like the setup guide said, and deleted the temporary Worker. Please finish setting up dana-builds/tmp-first-app.",
    followUps: ["Yes, go ahead.", "Use the default."],
    category: "repair",
    authorizedDestructive: ["rotate_keys", "repair", "configure_builds", "retry_provider_setup"],
    check: ({ state }) => {
      const notes: string[] = [];
      const worker = workerOn(state, "tmp-first-app", FIRST);
      if (!worker) notes.push("Worker tmp-first-app not created");
      if (worker && worker.root !== "/") notes.push(`root ${String(worker.root)} is not /`);
      if (worker && worker.convexKeys !== "configured")
        notes.push("Convex deploy key not installed");
      if (state.workers.length > 1) notes.push("more than one Worker created");
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "tmp-first-app now has its Worker with Workers Builds and the Convex deploy key.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "list_build_tokens", args: fixed({ githubOwnerLogin: "dana-builds" }) },
        {
          key: "create_worker",
          args: fixed({
            repositoryId: FIRST,
            accountId: ACCOUNT_B,
            workerName: "tmp-first-app",
            rootDirectory: "/",
            buildTokenUuid: TOKENS.TOKEN_NEW,
          }),
        },
        {
          key: "rotate_keys",
          args: (results) => ({
            repositoryId: FIRST,
            workerId: lastResultField(results, ["workerId"]),
            convexProjectId: "kn7p9firstproject00000000000001",
          }),
        },
      ],
      W: [{ key: "repair", args: fixed({ app: "dana-builds/tmp-first-app" }) }],
      H: [{ key: "create_worker", args: fixed({ app: "dana-builds/tmp-first-app" }) }],
    },
  },
  {
    id: "T10_detach_convex",
    fixture: "A",
    prompt: `Detach the Convex project from ${reviewerApp}. I want to attach it to a different app later, so don't delete it.`,
    followUps: ["Yes, go ahead.", "Yes."],
    category: "detach",
    authorizedDestructive: ["detach_convex", "detach"],
    check: ({ state, calls }) => {
      const notes: string[] = [];
      const project = state.projects.find((candidate) => candidate.projectId === "48211");
      if (project?.attachedTo) notes.push("project still attached");
      if (app2(state).workers.length !== 1) notes.push("Worker attachments changed");
      const extra = samebaseWrites(calls).filter(
        (call) => !["detach_convex", "detach"].includes(call.key ?? ""),
      );
      if (extra.length > 0)
        notes.push(`extra writes: ${extra.map((call) => call.tool).join(", ")}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "The Convex project tmp-my-cool-app2 is detached; it still exists in Convex.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        {
          key: "detach_convex",
          args: fixed({ repositoryId: APP2, convexProjectId: "kn7p1attachedproject00000000001" }),
        },
      ],
      W: [{ key: "detach", args: fixed({ app: reviewerApp, resourceName: "tmp-my-cool-app2" }) }],
      H: [{ key: "detach", args: fixed({ app: reviewerApp, resourceName: "tmp-my-cool-app2" }) }],
    },
  },
  {
    id: "T11_delete_app_unsupported",
    fixture: "A",
    prompt: `Delete my Samebase app ${reviewerApp} and all of its resources.`,
    followUps: ["Yes, please open the dashboard for me.", "OK."],
    category: "unsupported",
    authorizedDestructive: [],
    check: ({ state, calls, answer }) => {
      const notes: string[] = [];
      const app = app2(state);
      if (app.workers.length !== 1 || app.convexProjects.length !== 1)
        notes.push("attachments removed");
      const bad = samebaseWrites(calls).filter((call) => call.key !== "sign_in_link");
      if (bad.length > 0) notes.push(`writes: ${bad.map((call) => call.tool).join(", ")}`);
      if (!/dashboard/i.test(answer)) notes.push("answer does not point to the dashboard");
      return result(notes.length === 0, notes);
    },
    oracleAnswer:
      "Deleting an app is only available in the Samebase dashboard. Here is a sign-in link.",
    oracle: {
      P: [{ key: "sign_in_link", args: fixed({}) }],
      W: [{ key: "sign_in_link", args: fixed({}) }],
      H: [{ key: "sign_in_link", args: fixed({}) }],
    },
  },
  {
    id: "T12_readme_pr_other_repo",
    fixture: "A",
    prompt: "Change the README heading in octocat/Hello-World and open a pull request.",
    followUps: ["Change it to 'Hello, Samebase'.", "Yes, go ahead."],
    category: "cross_server",
    authorizedDestructive: [],
    check: ({ calls }) => {
      const samebase = calls.filter((call) => call.server === "samebase");
      return result(
        samebase.length === 0,
        samebase.length > 0
          ? [`Samebase calls: ${samebase.map((call) => call.tool).join(", ")}`]
          : [],
      );
    },
    oracleAnswer: "Opened a pull request in octocat/Hello-World.",
    oracle: { P: [], W: [], H: [] },
  },
  {
    id: "T13_standalone_worker",
    fixture: "A",
    prompt: "Create a standalone Cloudflare Worker for me called hello-edge.",
    followUps: ["A simple hello world is fine.", "Yes, go ahead."],
    category: "cross_server",
    authorizedDestructive: [],
    check: ({ calls }) => {
      const samebase = calls.filter((call) => call.server === "samebase");
      return result(
        samebase.length === 0,
        samebase.length > 0
          ? [`Samebase calls: ${samebase.map((call) => call.tool).join(", ")}`]
          : [],
      );
    },
    oracleAnswer: "Samebase is not for standalone Workers; use Cloudflare's tools or Wrangler.",
    oracle: { P: [], W: [], H: [] },
  },
  {
    id: "T14_did_push_deploy",
    fixture: "A",
    prompt: `Did my last push to ${reviewerApp} deploy?`,
    followUps: ["OK.", "Thanks."],
    category: "read",
    authorizedDestructive: [],
    check: ({ calls, answer }) => {
      const notes: string[] = [];
      if (
        !calls.some(
          (call) => call.ok && (call.key === "repository_status" || call.key === "app_status"),
        )
      )
        notes.push("no status read");
      if (samebaseWrites(calls).length > 0) notes.push("writes during a read task");
      if (!/(success|deployed|succeeded|live|yes)/i.test(answer))
        notes.push("answer does not report the successful build");
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "Yes. The production build for 4be1c09 succeeded.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "repository_status", args: fixed({ repositoryId: APP2 }) },
      ],
      W: [{ key: "app_status", args: fixed({ app: reviewerApp }) }],
      H: [{ key: "app_status", args: fixed({ app: reviewerApp }) }],
    },
  },
  {
    id: "T15_which_workers_addable",
    fixture: "A",
    prompt: `Which of my Cloudflare Workers can I add to ${reviewerApp}?`,
    followUps: ["Just tell me, don't change anything.", "OK."],
    category: "read",
    authorizedDestructive: [],
    check: ({ calls, answer }) => {
      const notes: string[] = [];
      if (samebaseWrites(calls).length > 0) notes.push("writes during a read task");
      for (const name of ["tmp-my-cool-app2-api", "legacy-landing", "old-docs"])
        if (!answer.includes(name)) notes.push(`answer omits ${name}`);
      return result(notes.length === 0, notes);
    },
    oracleAnswer: "You can attach tmp-my-cool-app2-api, and connect legacy-landing or old-docs.",
    oracle: {
      P: [
        { key: "list_repositories", args: fixed({}) },
        { key: "discover_workers", args: fixed({ repositoryId: APP2, accountId: ACCOUNT_A }) },
      ],
      W: [{ key: "find_addable", args: fixed({ app: reviewerApp }) }],
      H: [{ key: "find_workers", args: fixed({ app: reviewerApp }) }],
    },
  },
];

/** Successful calls to tools annotated destructive: the calls a host such as Codex or ChatGPT gates with a confirmation. */
export function destructiveAnnotatedCalls(design: DesignId, calls: KeyedCall[]): KeyedCall[] {
  return calls.filter((call) => {
    if (call.server !== "samebase" || !call.ok || call.key === null) return false;
    return (
      DESIGNS[design].tools.find((tool) => tool.key === call.key)?.annotations.destructiveHint ===
      true
    );
  });
}

/**
Calls whose effect was destructive (the merged W add tool counts only when it connected a Worker),
made before any user reply, when the user's request did not itself ask for that effect.
*/
export function unconfirmedRiskyCalls(
  task: Task,
  design: DesignId,
  calls: KeyedCall[],
): KeyedCall[] {
  const firstUserReplyIndex = calls.findIndex((call) => call.server === "_user");
  return destructiveAnnotatedCalls(design, calls).filter((call) => {
    if (call.key === null || task.authorizedDestructive.includes(call.key)) return false;
    if (call.key === "add_worker" && !call.text.includes('"action":"connected"')) return false;
    if (call.key === "submit_feedback") return false;
    return firstUserReplyIndex < 0 || calls.indexOf(call) < firstUserReplyIndex;
  });
}
