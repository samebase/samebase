import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { brotliCompressSync } from "node:zlib";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { graphSchema, mountSchema } from "./graph.ts";

const cwd = import.meta.dirname;
const root = resolve(cwd, "../../..");
const cli = resolve(cwd, "node_modules/convex/bin/main.js");
const url = "http://127.0.0.1:33410";
const backendVersion = "precompiled-2026-10-10-72ce13c";
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
const secrets = [secret];
function redact(message: string) {
  return secrets.reduce((text, value) => text.replaceAll(value, "[REDACTED]"), message);
}
childEnv.EXPERIMENT_WORKER_SECRET = secret;
for (const [path, version] of [
  [resolve(cwd, "node_modules/convex/package.json"), "1.46.0"],
  [resolve(root, "node_modules/alchemy/package.json"), "2.0.0-beta.83"],
]) {
  z.object({ version: z.literal(version) }).parse(JSON.parse(await readFile(path, "utf8")));
}
await mkdir(resolve(cwd, ".local"), { recursive: true });
await rm(resolve(cwd, ".local/worker.json"), { force: true });
if (
  await fetch(url).then(
    () => true,
    () => false,
  )
)
  throw new Error("Port 33410 is already in use; stop the previous sample first.");
// This sample owns a disposable backend. A completed deployment prevents deleting
// required env values, so a repeat run needs a new database to prove first-run discovery.
await rm(resolve(cwd, ".convex"), { recursive: true, force: true });
await rm(resolve(cwd, ".env.local"), { force: true });
await rm(resolve(cwd, "convex/_generated"), { recursive: true, force: true });
await rm(resolve(cwd, "job/convex/_generated"), { recursive: true, force: true });

const children: ReturnType<typeof spawn>[] = [];
const logs: string[] = [];
function start(args: string[]) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.stdout.on("data", (chunk) => {
    logs.push(redact(chunk.toString()));
  });
  child.stderr.on("data", (chunk) => {
    logs.push(redact(chunk.toString()));
  });
  return child;
}
function runConvex(args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: childEnv,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(redact(result.stderr).slice(0, 4000));
}
async function waitFor(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await check()) return;
    if (children.some((child) => child.exitCode !== null)) throw new Error(logs.join(""));
    await setTimeout(500);
  }
  throw new Error(`Local process did not become ready: ${logs.join("")}`);
}
try {
  start([
    cli,
    "dev",
    "--local-cloud-port",
    "33410",
    "--local-site-port",
    "33411",
    "--local-backend-version",
    backendVersion,
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
  ]);
  await waitFor(() =>
    fetch(url).then(
      () => true,
      () => false,
    ),
  );
  // The backend listens before `convex dev` writes the initial generated APIs.
  // A dry-run deploy does not create these missing files itself.
  await waitFor(() =>
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
  );
  const local = z
    .object({ adminKey: z.string(), backendVersion: z.literal(backendVersion) })
    .parse(JSON.parse(await readFile(resolve(cwd, ".convex/local/default/config.json"), "utf8")));
  secrets.push(local.adminKey);
  const deployment = ["--url", url, "--admin-key", local.adminKey];
  runConvex([
    "deploy",
    ...deployment,
    "--dry-run",
    "--write-push-request",
    ".local/request",
    "--typecheck",
    "disable",
  ]);
  const request = await readFile(resolve(cwd, ".local/request.json"), "utf8");
  await rm(resolve(cwd, ".local/request.json"));
  const response = await fetch(`${url}/api/deploy2/start_push`, {
    method: "POST",
    headers: {
      Authorization: `Convex ${local.adminKey}`,
      "Content-Type": "application/json",
      "Content-Encoding": "br",
    },
    body: brotliCompressSync(request),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      JSON.stringify(z.object({ code: z.string(), message: z.string() }).parse(body)),
    );
  const graph = graphSchema.parse(body);
  const [mount] = z.tuple([mountSchema]).parse(Object.values(graph.app.childComponents));
  const environment = z
    .object({ environmentVariables: z.record(z.string(), z.string()) })
    .parse(body);
  for (const binding of Object.values(mount.env))
    assert.equal(environment.environmentVariables[binding.name], undefined);
  await writeFile(resolve(cwd, ".local/mount.json"), JSON.stringify(mount, null, 2));
  console.log(
    `Graph without required env values: ${mount.componentPath} -> ${mount.definitionPath}`,
  );

  start([
    resolve(root, "node_modules/alchemy/bin/cli.js"),
    "dev",
    "alchemy.run.ts",
    "--stage",
    "local-experiment",
    "--no-input",
  ]);
  await waitFor(() =>
    readFile(resolve(cwd, ".local/worker.json"), "utf8").then(
      () => true,
      () => false,
    ),
  );
  const worker = z
    .object({
      url: z.string().url(),
      fqn: z.string(),
      resourceType: z.literal("Cloudflare.Worker"),
    })
    .parse(JSON.parse(await readFile(resolve(cwd, ".local/worker.json"), "utf8")));
  assert.equal(new URL(worker.url).port, "33412");
  const unauthorized = await fetch(worker.url, { method: "POST", body: "reject me" });
  assert.equal(unauthorized.status, 401);
  const wrongSecret = await fetch(worker.url, {
    method: "POST",
    headers: { Authorization: "Bearer wrong-secret" },
    body: "reject me",
  });
  assert.equal(wrongSecret.status, 401);

  runConvex(["env", "set", mount.env.WORKER_URL.name, worker.url, ...deployment]);
  runConvex(["env", "set", mount.env.WORKER_SECRET.name, secret, ...deployment]);
  runConvex(["deploy", ...deployment, "--yes", "--typecheck", "disable"]);
  const client = new ConvexHttpClient(url);
  const input = "component graph binding";
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
  const report = {
    convexVersion: "1.46.0",
    backendVersion,
    alchemyVersion: "2.0.0-beta.83",
    mount,
    resource: worker,
    unauthorizedStatus: unauthorized.status,
    wrongSecretStatus: wrongSecret.status,
    result,
    latest,
  };
  await writeFile(resolve(cwd, ".local/result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  throw new Error(redact(error instanceof Error ? error.message : String(error)));
} finally {
  for (const child of children.toReversed()) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    else process.kill(-child.pid, "SIGINT");
  }
  await setTimeout(1000);
}
