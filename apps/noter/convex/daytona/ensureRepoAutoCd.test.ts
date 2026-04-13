import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureRepoAutoCd } from "../../../../runtime/daytonaSandboxPrograms/ensureRepoAutoCd";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "noter-auto-cd-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("ensureRepoAutoCd", () => {
  it("adds the repo cd line to bash and fish profiles", async () => {
    const tempDir = await createTempDir();
    const bashrc = path.join(tempDir, ".bashrc");
    const fishConfig = path.join(tempDir, ".config/fish/config.fish");

    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
      fishProfileFiles: [fishConfig],
    });

    await expect(fs.readFile(bashrc, "utf8")).resolves.toBe(
      "cd '/home/daytona/workspace/noter'\n",
    );
    await expect(fs.readFile(fishConfig, "utf8")).resolves.toBe(
      "cd '/home/daytona/workspace/noter'\n",
    );
  });

  it("keeps the profile update idempotent", async () => {
    const tempDir = await createTempDir();
    const bashrc = path.join(tempDir, ".bashrc");
    const fishConfig = path.join(tempDir, ".config/fish/config.fish");
    await fs.writeFile(bashrc, "set -gx FOO bar\n", "utf8");

    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
      fishProfileFiles: [fishConfig],
    });
    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
      fishProfileFiles: [fishConfig],
    });

    await expect(fs.readFile(bashrc, "utf8")).resolves.toBe(
      "set -gx FOO bar\ncd '/home/daytona/workspace/noter'\n",
    );
    await expect(fs.readFile(fishConfig, "utf8")).resolves.toBe(
      "cd '/home/daytona/workspace/noter'\n",
    );
  });
});
