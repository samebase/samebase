import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as Redacted from "effect/Redacted";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { construct } from "./local-construction.ts";
import { workerUrl as runtimeBinding } from "./feature/workerBinding.ts";

const cwd = fileURLToPath(new URL("./", import.meta.url));
await import("./build-runtime.ts");
const once = process.argv.includes("--once");
const runtimeImport = process.argv.includes("--runtime-import");
if (once) {
  for (const path of [".convex", ".env.local", "convex/_generated", "feature/convex/_generated"]) {
    await rm(new URL(path, import.meta.url), { recursive: true, force: true });
  }
}
const convexCli = fileURLToPath(
  new URL("./bin/main.js", import.meta.resolve("convex/package.json")),
);
const workerCli = fileURLToPath(
  new URL("./bin/wrangler.js", import.meta.resolve("wrangler/package.json")),
);
const workerUrl = "http://127.0.0.1:33612";
const secret = randomBytes(32).toString("hex");
const declared = await construct(secret, workerUrl, runtimeImport ? runtimeBinding : undefined);
const workerSecret = declared.workerProps.env?.BRIDGE_SECRET;
const workerSecretText = Redacted.isRedacted(workerSecret)
  ? Redacted.value(workerSecret)
  : undefined;
if (typeof workerSecretText !== "string" || typeof declared.workerProps.main !== "string") {
  throw new Error("The sample needs a file Worker with a secret binding");
}
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  CONVEX_AGENT_MODE: "anonymous",
  WRANGLER_SEND_METRICS: "false",
};
await mkdir(new URL("./.local/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./.local/association.json", import.meta.url),
  JSON.stringify(declared.association, null, 2),
);
await writeFile(
  new URL("./.local/wrangler.json", import.meta.url),
  JSON.stringify({
    name: "component-binding-declaration",
    main: fileURLToPath(new URL(declared.workerProps.main, import.meta.url)),
    compatibility_date: "2026-10-01",
    dev: { ip: "127.0.0.1", port: 33612, inspector_port: 33613 },
  }),
);
await writeFile(
  new URL("./.local/.dev.vars", import.meta.url),
  `BRIDGE_SECRET=${workerSecretText}\n`,
  { mode: 0o600 },
);

const children: ChildProcess[] = [];
let failed: Error | undefined;
function start(cli: string, args: string[]) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: "inherit" });
  child.once("error", (error) => {
    failed = error;
  });
  child.once("exit", (code) => {
    if (code) failed = new Error(`Local child exited with code ${code}`);
  });
  children.push(child);
  return child;
}
async function command(cli: string, args: string[]) {
  const child = start(cli, args);
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`Command failed with exit code ${String(code)}`);
}
async function ready(url: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (failed) throw failed;
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Local server did not start: ${url}`);
}
function stop() {
  for (const child of children) child.kill("SIGINT");
}
process.once("SIGINT", () => {
  stop();
  process.exit(130);
});
process.once("SIGTERM", () => {
  stop();
  process.exit(143);
});

try {
  start(workerCli, [
    "dev",
    "--local",
    "--config",
    ".local/wrangler.json",
    "--show-interactive-dev-session=false",
  ]);
  start(convexCli, [
    "dev",
    "--local-cloud-port",
    "33610",
    "--local-site-port",
    "33611",
    "--typecheck-components",
    "--tail-logs=disable",
  ]);
  await Promise.all([ready(workerUrl), ready("http://127.0.0.1:33610/version")]);
  const localConfig: unknown = JSON.parse(
    await readFile(new URL("./.convex/local/default/config.json", import.meta.url), "utf8"),
  );
  if (
    !localConfig ||
    typeof localConfig !== "object" ||
    !("adminKey" in localConfig) ||
    typeof localConfig.adminKey !== "string"
  ) {
    throw new Error("The sample local backend has no admin key");
  }
  for (const [name, value] of Object.entries(declared.deploymentProps.env ?? {})) {
    await command(convexCli, [
      "env",
      "set",
      name,
      Redacted.isRedacted(value) ? Redacted.value(value) : value,
      "--url",
      "http://127.0.0.1:33610",
      "--admin-key",
      localConfig.adminKey,
    ]);
  }
  const client = new ConvexHttpClient("http://127.0.0.1:33610");
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      await client.query(makeFunctionReference<"query">("jobs:latest"), {});
      break;
    } catch {
      if (Date.now() > deadline) throw new Error("Convex did not deploy the sample query");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (once) {
    await command(
      fileURLToPath(new URL("./verify.ts", import.meta.url)),
      runtimeImport ? ["--runtime-import"] : [],
    );
  } else {
    console.log("Local sample ready. Run pnpm run verify in another terminal.");
    await new Promise(() => {});
  }
} finally {
  stop();
}
