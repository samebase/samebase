import { mkdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Reuse the exact dependencies installed by the required worktree bootstrap.
const root = resolve(import.meta.dirname, "../../..");
await mkdir(new URL("./node_modules/", import.meta.url), { recursive: true });
for (const name of ["convex", "zod", "@types/node"]) {
  const source = resolve(root, "apps/samebase/node_modules", name);
  const destination = resolve(import.meta.dirname, "node_modules", name);
  if (!existsSync(destination)) {
    await mkdir(dirname(destination), { recursive: true });
    await symlink(source, destination, "junction");
  }
}
