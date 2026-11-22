import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { isRecord } from "@samebase/dependent";

import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

/**
Every tracked TypeScript file must open in the editor (VS Code's TypeScript server) in a config that
CI type-checks, so the editor shows the errors CI shows. The server takes the nearest
`tsconfig.json` whose files or references hold the file, then the ancestors' ones; a file that none
holds lands in an inferred project with default options.
*/
const checkedConfigs = new Set<string>([
  trackedFilePath("tsconfig.json"),
  trackedFilePath("apps/identity-broker-effect-example/tsconfig.node.json"),
  trackedFilePath("apps/identity-broker-effect-example/tsconfig.worker.json"),
  trackedFilePath("apps/remotion-studio/tsconfig.json"),
  trackedFilePath("apps/samebase/convex/tsconfig.json"),
  trackedFilePath("apps/samebase/tsconfig.json"),
  trackedFilePath("apps/sidebars-example/tsconfig.json"),
  trackedFilePath("apps/workspace-layout-v2-solid/tsconfig.app.json"),
  trackedFilePath("apps/workspace-layout-v2-solid/tsconfig.node.json"),
  trackedFilePath("packages/alchemy-convex/tsconfig.json"),
  trackedFilePath("packages/alchemy-kit/tsconfig.json"),
  trackedFilePath("packages/dependent/tsconfig.json"),
  trackedFilePath("packages/git-editor/tsconfig.json"),
  trackedFilePath("packages/identity-broker/tsconfig.node.json"),
  trackedFilePath("packages/identity-broker/tsconfig.worker.json"),
  trackedFilePath("packages/logo-model/tsconfig.json"),
  trackedFilePath("packages/onboarding-video-tools/tsconfig.json"),
  trackedFilePath("packages/sidebars/fixtures/packed-consumer/tsconfig.json"),
  trackedFilePath("packages/sidebars/tsconfig.json"),
  trackedFilePath("packages/sure/tsconfig.json"),
]);

function trackedTypeScriptFiles(repoRoot: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "*.ts", "*.tsx", "*.mts", "*.cts"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(result.stderr.trim() || "git ls-files failed");
  }
  const files = result.stdout
    .split("\0")
    .filter(
      (file) => file !== "" && !file.includes("node_modules/") && !file.includes("/_generated/"),
    );
  // The server unloads a project once none of its files is open, so files of one project go together.
  const nearestConfigFolder = (file: string): string => {
    const folder = path.dirname(file);
    return folder === "." || existsSync(path.join(repoRoot, folder, "tsconfig.json"))
      ? folder
      : nearestConfigFolder(folder);
  };
  return files
    .map((file) => ({ file, folder: nearestConfigFolder(file) }))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.file.localeCompare(b.file))
    .map(({ file }) => file);
}

/** A TypeScript server over stdio that answers one request at a time. */
function startTypeScriptServer(repoRoot: string) {
  const server = spawn(
    process.execPath,
    [
      "--max-old-space-size=6144",
      path.join(repoRoot, "node_modules/typescript/lib/tsserver.js"),
      "--disableAutomaticTypingAcquisition",
      "--suppressDiagnosticEvents",
    ],
    { cwd: repoRoot, stdio: ["pipe", "pipe", "inherit"] },
  );
  let buffer = Buffer.alloc(0);
  let sequence = 0;
  const pending = new Map<number, (body: unknown) => void>();
  const openFilesByProject = new Map<string, string[]>();

  server.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const length = Number(
        /Content-Length: (\d+)/.exec(buffer.subarray(0, headerEnd).toString())?.[1],
      );
      if (buffer.length < headerEnd + 4 + length) {
        return;
      }
      const message: unknown = JSON.parse(
        buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString(),
      );
      buffer = buffer.subarray(headerEnd + 4 + length);
      if (
        isRecord(message) &&
        message["type"] === "response" &&
        typeof message["request_seq"] === "number"
      ) {
        pending.get(message["request_seq"])?.(message["body"]);
        pending.delete(message["request_seq"]);
      }
    }
  });

  function send(command: string, args: object) {
    sequence += 1;
    server.stdin.write(
      `${JSON.stringify({ seq: sequence, type: "request", command, arguments: args })}\n`,
    );
    return sequence;
  }

  return {
    /** The config of the project that the editor opens `file` in, or `undefined` for an inferred project. */
    async projectConfig(file: string): Promise<string | undefined> {
      send("open", { file, projectRootPath: repoRoot });
      const body = await new Promise<unknown>((resolve) => {
        pending.set(send("projectInfo", { file, needFileNameList: false }), resolve);
      });
      const configFileName = isRecord(body) ? body["configFileName"] : undefined;
      if (typeof configFileName !== "string") {
        fail(`The TypeScript server gave no project for ${file}.`);
      }
      // The server unloads a project once none of its files is open: keep the files of the few
      // projects used last open, so a project loads about once and memory stays bounded.
      const openFiles = openFilesByProject.get(configFileName) ?? [];
      openFilesByProject.delete(configFileName);
      openFilesByProject.set(configFileName, [...openFiles, file]);
      if (openFilesByProject.size > 2) {
        const [[leastRecentProject, leastRecentFiles]] = openFilesByProject;
        openFilesByProject.delete(leastRecentProject);
        for (const openFile of leastRecentFiles) {
          send("close", { file: openFile });
        }
      }
      return path.isAbsolute(configFileName) && !configFileName.startsWith("/dev/null/")
        ? path.relative(repoRoot, configFileName)
        : undefined;
    },
    close() {
      server.kill();
    },
  };
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const server = startTypeScriptServer(repoRoot);
  const misplaced: string[] = [];
  try {
    for (const file of trackedTypeScriptFiles(repoRoot)) {
      const config = await server.projectConfig(path.join(repoRoot, file));
      if (config === undefined || !checkedConfigs.has(config)) {
        misplaced.push(`${file}: ${config ?? "no config (inferred project)"}`);
      }
    }
  } finally {
    server.close();
  }
  if (misplaced.length > 0) {
    fail(
      `These files open in the editor in no config that CI type-checks. Put each in the include of the tsconfig.json (or a config it references) that CI checks it with:\n${misplaced.join("\n")}`,
    );
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
