import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import * as Schema from "effect/Schema";

process.chdir(import.meta.dirname);
mkdirSync(".local", { recursive: true, mode: 0o700 });
const require = createRequire(import.meta.url);
const convexCli = join(dirname(require.resolve("convex/package.json")), "bin/main.js");
const alchemyCli = join(dirname(dirname(require.resolve("alchemy"))), "bin/alchemy.js");
const children: ChildProcess[] = [];
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USER: process.env.USER,
  TMPDIR: process.env.TMPDIR,
  CONVEX_AGENT_MODE: "anonymous",
  CI: "true",
};

function start(name: string, args: string[]) {
  const file = `.local/${name}.log`;
  writeFileSync(file, "", { mode: 0o600 });
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.stdout.on("data", (data: Buffer) => appendFileSync(file, data));
  child.stderr.on("data", (data: Buffer) => appendFileSync(file, data));
  child.on("error", (error) => console.error(`${name}: ${error.message}`));
  return child;
}

async function waitUntil(label: string, ready: () => boolean, child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  while (!ready()) {
    if (child.exitCode !== null || Date.now() > deadline) {
      throw new Error(`${label} did not become ready. See .local/ logs.`);
    }
    await setTimeout(250);
  }
  console.log(label);
}

async function stop() {
  for (const child of children.toReversed()) child.kill("SIGINT");
  await setTimeout(1500);
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

try {
  const convex = start("convex", [
    convexCli,
    "dev",
    "--local-cloud-port",
    "33210",
    "--local-site-port",
    "33211",
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
  ]);
  await waitUntil(
    "Convex code pushed to http://127.0.0.1:33210",
    () => readFileSync(".local/convex.log", "utf8").includes("Convex functions ready"),
    convex,
  );
  const local = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        adminKey: Schema.String,
        ports: Schema.Struct({ cloud: Schema.Number, site: Schema.Number }),
      }),
    ),
  )(readFileSync(".convex/local/default/config.json", "utf8"));
  if (local.ports.cloud !== 33210 || local.ports.site !== 33211)
    throw new Error("Unexpected backend ports");
  const secret = randomBytes(32).toString("hex");
  writeFileSync(
    ".local/alchemy.env",
    `EXPERIMENT_SECRET=${secret}\nEXPERIMENT_ADMIN_KEY=${local.adminKey}\n`,
    { mode: 0o600 },
  );
  const startedAt = Date.now();
  const alchemy = start("alchemy", [
    alchemyCli,
    "dev",
    "--no-input",
    "--stage",
    "local",
    "--profile",
    "component-binding-explicit",
    "--env-file",
    ".local/alchemy.env",
  ]);
  const outputFile = ".alchemy/state/component-binding-explicit/local/__stack_output__.json";
  await waitUntil(
    "Alchemy Worker and component binding are ready",
    () => existsSync(outputFile) && statSync(outputFile).mtimeMs >= startedAt,
    alchemy,
  );
  console.log(
    `Local experiment started at ${new Date(startedAt).toISOString()}. Run pnpm run verify in this directory.`,
  );
  if (process.argv.includes("--once")) {
    const verify = spawn(process.execPath, ["verify.ts"], { env, stdio: "inherit" });
    const exitCode = await new Promise<number | null>((resolve) => verify.once("exit", resolve));
    if (exitCode !== 0) throw new Error("Runtime verification failed");
    await stop();
  }
} catch (error) {
  await stop();
  throw error;
}
