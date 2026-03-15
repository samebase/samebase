import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureRepoAutoCd } from "../../../../runtime/daytonaSandboxPrograms/ensureRepoAutoCd.js";

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
  it("adds the repo cd line to bash profiles", async () => {
    const tempDir = await createTempDir();
    const bashrc = path.join(tempDir, ".bashrc");

    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
    });

    await expect(fs.readFile(bashrc, "utf8")).resolves.toBe(
      "cd '/home/daytona/workspace/noter'\n",
    );
  });

  it("keeps the profile update idempotent", async () => {
    const tempDir = await createTempDir();
    const bashrc = path.join(tempDir, ".bashrc");
    await fs.writeFile(bashrc, "export FOO=bar\n", "utf8");

    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
    });
    await ensureRepoAutoCd({
      repoPath: "/home/daytona/workspace/noter",
      bashProfileFiles: [bashrc],
    });

    await expect(fs.readFile(bashrc, "utf8")).resolves.toBe(
      "export FOO=bar\ncd '/home/daytona/workspace/noter'\n",
    );
  });
});
