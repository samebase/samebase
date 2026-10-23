import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
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
let previousOutputTime = 0n;
async function committedState(
  expected: z.infer<typeof attributes>,
  child: ReturnType<typeof spawn>,
) {
  // The reconcile artifact precedes Apply's state and output commits. Wait for both.
  const outputPath =
    ".alchemy/state/component-native-bindings/local-experiment/__stack_output__.json";
  await waitFor(async () => {
    const current = await state();
    if (current.status !== "created" && current.status !== "updated") return false;
    if (!isDeepStrictEqual(current.attr, expected)) return false;
    if (
      !(await access(outputPath).then(
        () => true,
        () => false,
      ))
    )
      return false;
    const output = z
      .object({ associations: z.array(association) })
      .parse(JSON.parse(await readFile(outputPath, "utf8")));
    return (
      (await stat(outputPath, { bigint: true })).mtimeNs > previousOutputTime &&
      isDeepStrictEqual(output.associations, expected.associations)
    );
  }, child);
  previousOutputTime = (await stat(outputPath, { bigint: true })).mtimeNs;
  const committed = await state();
  assert.deepEqual(committed.attr, expected);
  return committed;
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
  const firstState = await committedState(first, initial);
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
  const changedState = await committedState(updated, changed);
  assert.deepEqual(updated.envNames, ["JOBS_WORKER_SECRET", "JOBS_WORKER_URL"]);
  assert.match(await convex(["env", "get", "JOBS_WORKER_URL"]), /\?revision=2/);
  const names = await convex(["env", "list", "--names-only"]);
  assert(!names.includes("JOBS_MARKER"));
  const updatedResult = await verifyRuntime("native binding changed apply");
  assert.equal(changedState.bindings.length, 1);
  console.log("Changed binding reached Convex; removing the marker binding removed its env value.");
  await stop(changed);

  logs = "";
  const nextSecret = randomBytes(32).toString("hex");
  secrets.push(nextSecret);
  childEnv.EXPERIMENT_SECRET = nextSecret;
  process.env.EXPERIMENT_SECRET = nextSecret;
  const beforeRotationUrl = (await convex(["env", "get", "JOBS_WORKER_URL"])).trim();
  const rotation = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "secret-only",
  );
  await waitFor(
    () =>
      access(".local/applied-secret-only.json").then(
        () => true,
        () => false,
      ),
    rotation,
  );
  const rotated = attributes.parse(
    JSON.parse(await readFile(".local/applied-secret-only.json", "utf8")),
  );
  assert.deepEqual(rotated, updated);
  const rotationState = await committedState(rotated, rotation);
  assert.equal(rotationState.bindings.length, 1);
  assert.equal((await convex(["env", "get", "JOBS_WORKER_URL"])).trim(), beforeRotationUrl);
  assert.equal((await convex(["env", "get", "JOBS_WORKER_SECRET"])).trim() === nextSecret, true);
  const oldSecretResponse = await fetch(beforeRotationUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: "reject old secret",
  });
  assert.equal(oldSecretResponse.status, 401);
  const newSecretResponse = await fetch(beforeRotationUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${nextSecret}` },
    body: "new secret",
  });
  assert.equal(newSecretResponse.status, 200);
  assert.equal(await newSecretResponse.text(), "NEW SECRET");
  const rotationResult = await verifyRuntime("native binding secret only");
  console.log(
    "Secret-only native binding update committed; URL stayed fixed, old secret rejected, component action passed.",
  );
  await stop(rotation);

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
    committedStates: {
      initial: firstState.status,
      changed: changedState.status,
      secretOnly: rotationState.status,
    },
    stackOutputsCommitted: true,
    secretOnlyUpdate: {
      urlUnchanged: true,
      oldSecretStatus: oldSecretResponse.status,
      newSecretStatus: newSecretResponse.status,
      result: rotationResult,
    },
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
