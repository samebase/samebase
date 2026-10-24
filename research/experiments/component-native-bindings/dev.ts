import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import { setTimeout } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { association, attributes, backendUrl, convex } from "./deployment.ts";

import { inventory } from "./inventory.ts";
import { archiveAddress } from "./shared.run.ts";
import { componentPath } from "./component-path.ts";

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
const interruption = new AbortController();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    interruption.abort();
  });

function portOpen(port: number): Promise<boolean> {
  return new Promise((done, fail) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000, () => {
      socket.destroy();
      fail(new Error(`Port ${port} did not respond`));
    });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", (error) => {
      socket.destroy();
      if ("code" in error && error.code === "ECONNREFUSED") done(false);
      else fail(error);
    });
  });
}
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
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<boolean>((done) => child.once("exit", () => done(true)));
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"]);
    assert(await Promise.race([exited, setTimeout(3000, false)]), "Sample process did not stop");
    return;
  }
  const signalGroup = (signal: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
      // EPERM is ambiguous during teardown. Confirm that no live group members remain.
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        const groups = spawnSync("ps", ["-eo", "pgid=,stat="], { encoding: "utf8" });
        if (
          groups.status === 0 &&
          !groups.stdout
            .trim()
            .split("\n")
            .some((line) => {
              const fields = line.trim().split(/\s+/);
              const group = fields.at(0);
              const status = fields.at(1);
              return group === String(pid) && status !== undefined && !status.startsWith("Z");
            })
        )
          return false;
      }
      throw new Error(
        `Cannot send ${signal} to sample group ${pid}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  // A leader can exit before its backend/workerd children. Wait for the whole owned group.
  for (const signal of ["SIGINT", "SIGKILL"] as const) {
    if (!signalGroup(signal)) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      await setTimeout(100);
      if (!signalGroup(0)) return;
    }
  }
  throw new Error("Sample process group did not stop");
}

async function waitFor(
  check: () => Promise<boolean>,
  child: ReturnType<typeof spawn>,
  expectedFailure = false,
) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (interruption.signal.aborted) throw new Error("Sample interrupted");
    if (await check()) return;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(logs);
    if (!expectedFailure && logs.includes("alchemy dev: apply failed")) throw new Error(logs);
    await setTimeout(500);
  }
  throw new Error(`Sample timed out: ${logs}`);
}
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
    if (result.success)
      return {
        ...result.data,
        mtimeNs: (await stat(resolve(cwd, ".alchemy", path), { bigint: true })).mtimeNs,
      };
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

for (const port of [33440, 33441, 33442]) assert(!(await portOpen(port)), `Port ${port} is in use`);
for (const path of [
  ".local",
  ".alchemy",
  ".convex",
  ".env.local",
  "convex/_generated",
  "job/convex/_generated",
  "processing/_generated",
])
  await rm(resolve(cwd, path), { force: true, recursive: true });
await mkdir(resolve(cwd, ".local"), { recursive: true, mode: 0o700 });
const authorPaths = [
  "alchemy.run.ts",
  "convex/convex.config.ts",
  "convex/jobs.ts",
  "job/alchemy.ts",
];
const authorSources = new Map(
  await Promise.all(authorPaths.map(async (path) => [path, await readFile(path, "utf8")] as const)),
);
for (const source of authorSources.values()) {
  assert(
    !source.includes("components.pipeline") &&
      !source.includes('name: "pipeline"') &&
      !source.includes('R2.Bucket("Cache")'),
    "Sample sources contain changes from an interrupted run; restore them before starting",
  );
}
const failures: unknown[] = [];
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
          "processing/_generated/api.ts",
          "processing/_generated/server.ts",
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
  assert(await portOpen(33440));
  assert(await portOpen(33441));
  const { components } = await import("./convex/_generated/api.js");
  assert.deepEqual(componentPath(components.processing), ["processing"]);
  assert.throws(() => componentPath(components.processing.jobs.run), z.ZodError);
  assert(!(await convex(["env", "list", "--names-only"])).includes("JOBS_WORKER_"));
  console.log("Fresh backend and generated APIs ready; required Worker env is still absent.");

  const shared = start([
    alchemy,
    "dev",
    "shared.run.ts",
    "--stage",
    "local-experiment",
    "--no-input",
  ]);
  await waitFor(
    () =>
      access(".alchemy/state/component-binding-shared/local-experiment/__stack_output__.json").then(
        () => true,
        () => false,
      ),
    shared,
  );
  await stop(shared);
  const sharedBefore = await inventory(archiveAddress.stack, []);
  assert.equal(sharedBefore.length, 1);

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
  const firstInventory = await inventory("component-native-bindings", first.associations);
  assert(
    first.associations.every((item) =>
      firstInventory.some((row) => row.componentPath === item.componentPath),
    ),
  );
  assert.equal(
    firstInventory.find((row) => row.fqn === "Processing/Receipts")?.componentPath,
    "processing",
  );
  assert.equal(
    firstInventory.find((row) => row.fqn === "Processing/Jobs/Storage")?.componentPath,
    "processing/jobs",
  );
  assert.equal(
    firstInventory.find((row) => row.fqn === "Processing/Jobs/Processor")?.componentPath,
    "processing/jobs",
  );
  assert.equal(
    firstInventory.find((row) => row.fqn === "Processing/Lookalike")?.componentPath,
    null,
  );
  assert(!firstInventory.some((row) => row.fqn === archiveAddress.fqn));
  assert.deepEqual(first.associations[1]?.uses, [archiveAddress]);
  const sharedOutput = z
    .object({ archiveName: z.string() })
    .parse(
      JSON.parse(
        await readFile(
          ".alchemy/state/component-binding-shared/local-experiment/__stack_output__.json",
          "utf8",
        ),
      ),
    );
  const workerState = z
    .object({ bindings: z.array(z.object({ data: z.object({ bindings: z.array(z.unknown()) }) })) })
    .parse(
      JSON.parse(
        await readFile(
          ".alchemy/state/component-native-bindings/local-experiment/Processing__Jobs__Processor.json",
          "utf8",
        ),
      ),
    );
  const archiveBinding = workerState.bindings
    .flatMap(({ data }) => data.bindings)
    .flatMap((value) => {
      const parsed = z
        .object({
          type: z.literal("r2_bucket"),
          name: z.literal("ARCHIVE"),
          bucketName: z.string(),
        })
        .safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  assert.equal(archiveBinding.length, 1);
  assert.equal(archiveBinding.at(0)?.bucketName, sharedOutput.archiveName);
  const workerUrl = (await convex(["env", "get", "JOBS_WORKER_URL"])).trim();
  assert.equal(new URL(workerUrl).port, "33442");
  for (const headers of [new Headers(), new Headers({ Authorization: "Bearer wrong-secret" })]) {
    assert.equal((await fetch(workerUrl, { method: "POST", headers, body: "reject" })).status, 401);
  }
  const initialResult = await verifyRuntime("native binding first apply");
  assert.equal(firstState.bindings.length, 3);
  console.log(
    "Native bindings applied: normal component action saved the Worker result; both 401 checks passed.",
  );
  await stop(initial);

  const packageSource = await readFile("job/alchemy.ts", "utf8");
  await writeFile(
    "job/alchemy.ts",
    packageSource.replace(
      'const storage = yield* Cloudflare.R2.Bucket("Storage");',
      `const storage = yield* Cloudflare.R2.Bucket("Storage");
    yield* Cloudflare.R2.Bucket("Cache");`,
    ),
  );
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
  const changedInventory = await inventory("component-native-bindings", updated.associations);
  assert.equal(
    changedInventory.find((row) => row.fqn === "Processing/Jobs/Cache")?.componentPath,
    "processing/jobs",
  );
  assert.deepEqual(first.associations, updated.associations);
  assert.deepEqual(updated.envNames, ["JOBS_WORKER_SECRET", "JOBS_WORKER_URL"]);
  assert.match(await convex(["env", "get", "JOBS_WORKER_URL"]), /\?revision=2/);
  const names = await convex(["env", "list", "--names-only"]);
  assert(!names.includes("JOBS_MARKER"));
  const updatedResult = await verifyRuntime("native binding changed apply");
  assert.equal(changedState.bindings.length, 2);
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
  assert.equal(rotationState.bindings.length, 2);
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

  for (const path of authorPaths) {
    const source = await readFile(path, "utf8");
    await writeFile(
      path,
      source
        .replaceAll("components.processing", "components.pipeline")
        .replaceAll(`name: "processing"`, `name: "pipeline"`),
    );
  }
  // Regenerate host references after the ordinary config edit. Alchemy never imports config.
  await convex(["codegen", "--typecheck", "disable"]);
  const lifecycle = [];
  for (const phase of ["renamed", "unlinked"]) {
    logs = "";
    const child = start(
      [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
      phase,
    );
    await waitFor(
      () =>
        access(`.local/applied-${phase}.json`).then(
          () => true,
          () => false,
        ),
      child,
    );
    const applied = attributes.parse(
      JSON.parse(await readFile(`.local/applied-${phase}.json`, "utf8")),
    );
    await committedState(applied, child);
    const resources = await inventory("component-native-bindings", applied.associations);
    assert.deepEqual(
      resources.map(({ fqn, instanceId }) => ({ fqn, instanceId })),
      changedInventory.map(({ fqn, instanceId }) => ({ fqn, instanceId })),
    );
    assert.deepEqual(await inventory(archiveAddress.stack, []), sharedBefore);
    if (phase === "renamed") {
      assert.deepEqual(
        applied.associations.map((item) => item.componentPath),
        ["pipeline", "pipeline/jobs"],
      );
      assert.equal(
        resources.find((row) => row.fqn === "Processing/Jobs/Storage")?.componentPath,
        "pipeline/jobs",
      );
      assert.equal(
        await client.query(
          makeFunctionReference<"query", Record<string, never>, unknown>("jobs:latest"),
          {},
        ),
        null,
      );
    } else {
      assert.deepEqual(applied.associations, []);
      assert(resources.every((row) => row.componentPath === null));
    }
    const result = await verifyRuntime(`native binding ${phase}`);
    lifecycle.push({ phase, attributes: applied, resources, result });
    await stop(child);
  }
  logs = "";
  const beforeMissingParent = await state();
  assert.equal(beforeMissingParent.status, "updated");
  const missingParent = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "missing-parent",
  );
  await waitFor(async () => logs.includes("Component jobs is not mounted"), missingParent, true);
  assert.equal(
    await access(".local/applied-missing-parent.json").then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal((await state()).status, "updating");
  assert((await state()).mtimeNs > beforeMissingParent.mtimeNs);
  assert.equal(
    (
      await stat(
        ".alchemy/state/component-native-bindings/local-experiment/__stack_output__.json",
        { bigint: true },
      )
    ).mtimeNs,
    previousOutputTime,
  );
  await stop(missingParent);

  logs = "";
  const betweenFailures = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "between-failures",
  );
  await waitFor(
    () =>
      access(".local/applied-between-failures.json").then(
        () => true,
        () => false,
      ),
    betweenFailures,
  );
  const betweenAttributes = attributes.parse(
    JSON.parse(await readFile(".local/applied-between-failures.json", "utf8")),
  );
  await committedState(betweenAttributes, betweenFailures);
  await stop(betweenFailures);

  logs = "";
  const beforeInvalid = await state();
  assert.equal(beforeInvalid.status, "updated");
  const invalid = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "invalid",
  );
  await waitFor(async () => logs.includes("Invalid URL"), invalid, true);
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
  assert.deepEqual(failedState.old?.attr, betweenAttributes);
  assert(failedState.mtimeNs > beforeInvalid.mtimeNs);
  assert.equal(
    (
      await stat(
        ".alchemy/state/component-native-bindings/local-experiment/__stack_output__.json",
        { bigint: true },
      )
    ).mtimeNs,
    previousOutputTime,
  );
  await stop(invalid);
  logs = "";
  const recovery = start(
    [alchemy, "dev", "alchemy.run.ts", "--stage", "local-experiment", "--no-input"],
    "recovered",
  );
  await waitFor(
    () =>
      access(".local/applied-recovered.json").then(
        () => true,
        () => false,
      ),
    recovery,
  );
  const recovered = attributes.parse(
    JSON.parse(await readFile(".local/applied-recovered.json", "utf8")),
  );
  const recoveryState = await committedState(recovered, recovery);
  assert.deepEqual(recovered, lifecycle.at(0)?.attributes);
  const recoveryResult = await verifyRuntime("native binding recovered");
  await stop(recovery);
  const report = {
    convexVersion: "1.46.0",
    backendVersion,
    alchemyVersion: "2.0.0-beta.83",
    initial: first,
    firstInventory,
    changedInventory,
    sharedInventory: sharedBefore,
    archiveBinding: {
      bucketName: archiveBinding.at(0)?.bucketName,
      sharedStackBucketName: sharedOutput.archiveName,
    },
    lifecycle,
    convexDataMigratedOnRename: false,
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
      associationSnapshot: "last-successful",
      previousAssociationRetained: true,
      newSuccessRecord: false,
    },
    missingParent: { rejected: true, lastSuccessfulOutputUnchanged: true },
    recovery: { status: recoveryState.status, attributes: recovered, result: recoveryResult },
    unauthorizedStatus: 401,
    wrongSecretStatus: 401,
  };
  await writeFile(".local/result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  for (const [path, source] of authorSources) await writeFile(path, source);
  // Leave generated types consistent with the restored author files for the separate check command.
  await convex(["codegen", "--typecheck", "disable"]);
} catch (error) {
  failures.push(error);
} finally {
  const stopped = await Promise.allSettled(children.toReversed().map((child) => stop(child)));
  const closed = await Promise.allSettled(
    [33440, 33441, 33442].map(async (port) => {
      assert(!(await portOpen(port)), `Port ${port} is still in use`);
    }),
  );
  // Restore every source even if a process or another source failed to clean up.
  const restored = await Promise.allSettled(
    [...authorSources].map(([path, source]) => writeFile(path, source)),
  );
  for (const result of [...stopped, ...closed, ...restored]) {
    if (result.status === "rejected") failures.push(result.reason);
  }
}
if (interruption.signal.aborted) failures.push(new Error("Sample interrupted"));
if (failures.length) {
  throw new AggregateError(
    failures.map(
      (error) => new Error(redact(error instanceof Error ? error.message : String(error))),
    ),
    "Sample failed",
  );
}
