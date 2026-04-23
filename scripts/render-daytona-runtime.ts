import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatWithVpFmt } from "./format-with-vp-fmt.ts";
import {
  renderDaytonaSandboxProgramsGeneratedTsModule,
  renderDaytonaRuntimeGeneratedTsModule,
  renderDockerfileDaytonaDeps,
} from "../runtime/daytonaRuntime.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const outputFiles = [
  {
    path: path.join(repoRoot, "Dockerfile.daytona-deps"),
    contents: renderDockerfileDaytonaDeps(),
  },
  {
    path: path.join(repoRoot, "apps/noter/convex/daytona/runtime.generated.ts"),
    contents: renderDaytonaRuntimeGeneratedTsModule(),
  },
  {
    path: path.join(
      repoRoot,
      "apps/noter/convex/daytona/sandboxPrograms.generated.ts",
    ),
    contents: renderDaytonaSandboxProgramsGeneratedTsModule(),
  },
];

async function normalizeOutputContents(
  outputPath: string,
  contents: string,
): Promise<string> {
  const withTrailingNewline = contents.endsWith("\n")
    ? contents
    : `${contents}\n`;

  if (path.extname(outputPath) !== ".ts") {
    return withTrailingNewline;
  }

  return formatWithVpFmt(outputPath, withTrailingNewline);
}

async function main() {
  const checkOnly = process.argv.includes("--check");

  for (const output of outputFiles) {
    const normalized = await normalizeOutputContents(
      output.path,
      output.contents,
    );
    if (checkOnly) {
      const existing = await fs.readFile(output.path, "utf8");
      if (existing !== normalized) {
        throw new Error(
          `Generated Daytona runtime output is stale: ${output.path}`,
        );
      }
      continue;
    }

    await fs.mkdir(path.dirname(output.path), { recursive: true });
    await fs.writeFile(output.path, normalized, "utf8");
  }
}

await main();
