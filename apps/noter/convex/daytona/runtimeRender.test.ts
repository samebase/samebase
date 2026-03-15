import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { describe, expect, it } from "vitest";
import {
  renderDaytonaSandboxProgramsGeneratedTsModule,
  renderDaytonaAuthFallbackDockerfileCommands,
  renderDaytonaCorepackPnpmRunCommand,
  renderDaytonaPrebuildDockerfileCommands,
  renderDaytonaRuntimeGeneratedTsModule,
  renderDockerfileDaytonaDeps,
} from "../../../../runtime/daytonaRuntime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

function normalizeFileContents(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}

async function readRepoFile(relativePath: string): Promise<string> {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.readFile(absolutePath, "utf8");
}

async function renderGeneratedTypeScript(
  relativePath: string,
  contents: string,
): Promise<string> {
  return normalizeFileContents(
    await prettier.format(contents, {
      filepath: path.join(repoRoot, relativePath),
    }),
  );
}

describe("Daytona runtime source of truth", () => {
  it("renders Dockerfile.daytona-deps from the runtime manifest", async () => {
    const rendered = normalizeFileContents(renderDockerfileDaytonaDeps());
    const existing = normalizeFileContents(
      await readRepoFile("Dockerfile.daytona-deps"),
    );

    expect(rendered).toBe(existing);
  });

  it("renders the generated Convex runtime module from the runtime manifest", async () => {
    const rendered = await renderGeneratedTypeScript(
      "apps/noter/convex/daytona/runtime.generated.ts",
      renderDaytonaRuntimeGeneratedTsModule(),
    );
    const existing = normalizeFileContents(
      await readRepoFile("apps/noter/convex/daytona/runtime.generated.ts"),
    );

    expect(rendered).toBe(existing);
  });

  it("renders the generated Daytona sandbox programs module from source", async () => {
    const rendered = await renderGeneratedTypeScript(
      "apps/noter/convex/daytona/sandboxPrograms.generated.ts",
      renderDaytonaSandboxProgramsGeneratedTsModule(),
    );
    const existing = normalizeFileContents(
      await readRepoFile(
        "apps/noter/convex/daytona/sandboxPrograms.generated.ts",
      ),
    );

    expect(rendered).toBe(existing);
  });

  it("keeps auth fallback commands aligned with the prebuild runtime prefix", () => {
    const authFallbackCommands = renderDaytonaAuthFallbackDockerfileCommands();
    const prebuildCommands = renderDaytonaPrebuildDockerfileCommands();

    expect(prebuildCommands).toHaveLength(authFallbackCommands.length + 1);
    expect(prebuildCommands[0]).toBe(authFallbackCommands[0]);
    expect(prebuildCommands[1]).toBe(renderDaytonaCorepackPnpmRunCommand());
    expect(prebuildCommands.at(-1)).toBe(authFallbackCommands.at(-1));
  });
});
