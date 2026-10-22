import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const convexCli = join(
  dirname(createRequire(import.meta.url).resolve("convex/package.json")),
  "bin/main.js",
);

export const BindJobs = Alchemy.Action(
  "BindJobs",
  (input: {
    target: { deployment: string; componentPath: string };
    workerFqn: string;
    workerUrl: string | undefined;
    secret: Redacted.Redacted<string>;
    adminKey: Redacted.Redacted<string>;
    secretHash: string;
  }) =>
    Effect.promise(async () => {
      if (!input.workerUrl) throw new Error("Worker has no URL");
      if (new URL(input.target.deployment).hostname !== "127.0.0.1") {
        throw new Error("This experiment only configures a local Convex deployment");
      }
      writeFileSync(
        ".local/binding.env",
        `CONVEX_SELF_HOSTED_URL=${input.target.deployment}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${Redacted.value(input.adminKey)}\n`,
        { mode: 0o600 },
      );
      try {
        await promisify(execFile)(
          process.execPath,
          [
            convexCli,
            "run",
            "--env-file",
            ".local/binding.env",
            "--component",
            input.target.componentPath,
            "jobs:configure",
            JSON.stringify({ url: input.workerUrl, secret: Redacted.value(input.secret) }),
          ],
          {
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
            },
          },
        );
      } catch (error) {
        // execFile errors include command arguments, which contain the local binding secret.
        const stderr =
          error instanceof Error && "stderr" in error && typeof error.stderr === "string"
            ? error.stderr
                .replaceAll(Redacted.value(input.secret), "<redacted>")
                .replaceAll(Redacted.value(input.adminKey), "<redacted>")
            : "No CLI error output";
        throw new Error(`Convex component registration failed: ${stderr}`);
      }
      return {
        deployment: input.target.deployment,
        componentPath: input.target.componentPath,
        resourceFqn: input.workerFqn,
        workerUrl: input.workerUrl,
      };
    }),
);
