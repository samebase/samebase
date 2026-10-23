import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { backendUrl, convex } from "./deployment.ts";

const cwd = import.meta.dirname;
process.chdir(cwd);
const cli = resolve(cwd, "node_modules/convex/bin/main.js");
const alchemy = resolve(cwd, "../../../node_modules/alchemy/bin/cli.js");
const backendVersion = "precompiled-2026-10-10-72ce13c";
for (const [path, version] of [
  ["node_modules/convex/package.json", "1.46.0"],
  ["../../../node_modules/alchemy/package.json", "2.0.0-beta.83"],
]) {
  z.object({ version: z.literal(version) }).parse(
    JSON.parse(await readFile(resolve(cwd, path), "utf8")),
  );
}
const inherited = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
]);
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => inherited.has(key)),
);
childEnv.CONVEX_AGENT_MODE = "anonymous";
childEnv.ALCHEMY_HOME = resolve(cwd, ".local/alchemy-home");
const secret = randomBytes(32).toString("hex");
childEnv.EXPERIMENT_SECRET = secret;
// The direct CLI helper shares the same isolated environment as the child processes.
for (const key of Object.keys(process.env)) if (!inherited.has(key)) delete process.env[key];
Object.assign(process.env, childEnv);
const secrets = [secret];
const redact = (message: string) =>
  secrets.reduce((text, value) => text.replaceAll(value, "[REDACTED]"), message);
const children: ReturnType<typeof spawn>[] = [];
let logs = "";
function start(args: string[], phase?: string) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...childEnv, EXPERIMENT_PHASE: phase },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.stdout.on("data", (chunk: Buffer) => {
    logs += redact(chunk.toString());
  });
  child.stderr.on("data", (chunk: Buffer) => {
    logs += redact(chunk.toString());
  });
  return child;
}
async function stop(child: ReturnType<typeof spawn>) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else process.kill(-child.pid, "SIGINT");
  await Promise.race([
    new Promise<void>((done) => child.once("exit", () => done())),
    setTimeout(3000),
  ]);
}
async function waitFor(check: () => Promise<boolean>, child: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (await check()) return;
    if (child.exitCode !== null) throw new Error(logs);
    if (logs.includes("alchemy dev: apply failed")) throw new Error(logs);
    await setTimeout(500);
  }
  throw new Error(`Sample timed out: ${logs}`);
}
const association = z.object({
  componentPath: z.string(),
  resources: z.array(z.object({ fqn: z.string(), type: z.string() })),
  envNames: z.array(z.string()),
});
const attributes = z.object({ associations: z.array(association), envNames: z.array(z.string()) });
const stateSchema = z.object({
  resourceType: z.literal("Experiment.ConvexDeployment"),
  status: z.string(),
  bindings: z.array(z.unknown()),
  attr: attributes.optional(),
  old: z.object({ attr: attributes }).optional(),
});
async function state() {
  for (const path of globSync("**/*.json", { cwd: resolve(cwd, ".alchemy") })) {
    const result = stateSchema.safeParse(
      JSON.parse(await readFile(resolve(cwd, ".alchemy", path), "utf8")),
    );
    if (result.success) return result.data;
  }
  throw new Error("Alchemy did not persist the deployment resource");
}
const client = new ConvexHttpClient(backendUrl);
async function verifyRuntime(input: string) {
  const result = await client.action(
    makeFunctionReference<"action", { text: string }, string>("jobs:run"),
    { text: input },
  );
  assert.equal(result, input.toUpperCase());
  const latest = await client.query(
    makeFunctionReference<"query", Record<string, never>, unknown>("jobs:latest"),
    {},
  );
  assert.deepEqual(latest, { input, result });
  return latest;
}

if (
  await fetch(backendUrl).then(
    () => true,
    () => false,
  )
)
  throw new Error("Port 33440 is in use");
for (const path of [
  ".local",
  ".alchemy",
  ".convex",
  ".env.local",
  "convex/_generated",
  "job/convex/_generated",
])
  await rm(resolve(cwd, path), { force: true, recursive: true });
await mkdir(resolve(cwd, ".local"), { recursive: true, mode: 0o700 });
try {
  const backend = start([
    cli,
    "dev",
    "--local-cloud-port",
    "33440",
    "--local-site-port",
    "33441",
    "--local-backend-version",
    backendVersion,
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
  ]);
  await waitFor(
    () =>
      Promise.all(
        [
          "convex/_generated/api.js",
          "convex/_generated/server.js",
          "job/convex/_generated/api.ts",
          "job/convex/_generated/server.ts",
        ].map((path) => access(resolve(cwd, path))),
      ).then(
        () => true,
        () => false,
      ),
    backend,
  );
  const local = z
    .object({ adminKey: z.string() })
    .parse(JSON.parse(await readFile(resolve(cwd, ".convex/local/default/config.json"), "utf8")));
  secrets.push(local.adminKey);
  assert(!(await convex(["env", "list", "--names-only"])).includes("JOBS_WORKER_"));
  console.log("Fresh backend and generated APIs ready; required Worker env is still absent.");

  const initial = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "initial",
  );
  await waitFor(
    () =>
      access(".local/applied-initial.json").then(
        () => true,
        () => false,
      ),
    initial,
  );
  const first = attributes.parse(JSON.parse(await readFile(".local/applied-initial.json", "utf8")));
  assert.deepEqual(first.envNames, ["JOBS_MARKER", "JOBS_WORKER_SECRET", "JOBS_WORKER_URL"]);
  assert.deepEqual(first.associations[0]?.resources, [
    { fqn: "Processor", type: "Cloudflare.Worker" },
  ]);
  const workerUrl = (await convex(["env", "get", "JOBS_WORKER_URL"])).trim();
  assert.equal(new URL(workerUrl).port, "33442");
  for (const headers of [new Headers(), new Headers({ Authorization: "Bearer wrong-secret" })]) {
    assert.equal((await fetch(workerUrl, { method: "POST", headers, body: "reject" })).status, 401);
  }
  const initialResult = await verifyRuntime("native binding first apply");
  const firstState = await state();
  assert.equal(firstState.bindings.length, 2);
  console.log(
    "Native bindings applied: normal component action saved the Worker result; both 401 checks passed.",
  );
  await stop(initial);

  const changed = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "changed",
  );
  await waitFor(
    () =>
      access(".local/applied-changed.json").then(
        () => true,
        () => false,
      ),
    changed,
  );
  const updated = attributes.parse(
    JSON.parse(await readFile(".local/applied-changed.json", "utf8")),
  );
  assert.deepEqual(updated.envNames, ["JOBS_WORKER_SECRET", "JOBS_WORKER_URL"]);
  assert.match(await convex(["env", "get", "JOBS_WORKER_URL"]), /\?revision=2/);
  const names = await convex(["env", "list", "--names-only"]);
  assert(!names.includes("JOBS_MARKER"));
  const updatedResult = await verifyRuntime("native binding changed apply");
  const changedState = await state();
  assert.equal(changedState.bindings.length, 1);
  console.log("Changed binding reached Convex; removing the marker binding removed its env value.");
  await stop(changed);

  logs = "";
  const invalid = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "invalid",
  );
  await waitFor(async () => logs.includes("Invalid URL"), invalid);
  assert.equal(
    await access(".local/applied-invalid.json").then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.match(await convex(["env", "get", "JOBS_WORKER_URL"]), /\?revision=2/);
  const failedState = await state();
  assert.equal(failedState.status, "updating");
  assert.deepEqual(failedState.old?.attr, updated);
  const report = {
    convexVersion: "1.46.0",
    backendVersion,
    alchemyVersion: "2.0.0-beta.83",
    initial: first,
    updated,
    initialResult,
    updatedResult,
    invalidApply: {
      status: failedState.status,
      previousAssociationRetained: true,
      newSuccessRecord: false,
    },
    unauthorizedStatus: 401,
    wrongSecretStatus: 401,
  };
  await writeFile(".local/result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  throw new Error(redact(error instanceof Error ? error.message : String(error)));
} finally {
  for (const child of children.toReversed()) await stop(child);
}
