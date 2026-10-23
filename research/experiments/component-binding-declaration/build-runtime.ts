import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as Bundle from "alchemy/Bundle";
import * as Effect from "effect/Effect";

process.chdir(fileURLToPath(new URL("./", import.meta.url)));
await mkdir(".local", { recursive: true });
await Effect.runPromise(
  Bundle.build(
    {
      input: "./feature/output-entry.ts",
      platform: "node",
      external: (id) => id.startsWith("effect/"),
    },
    { file: "./.local/output-entry.js", format: "esm", codeSplitting: false },
  ),
);
await writeFile("./.local/output-entry.d.ts", 'export * from "../feature/output-entry.ts";\n');
