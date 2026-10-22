import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { localState } from "alchemy/State/LocalState";
import * as Effect from "effect/Effect";
import { z } from "zod";
import { mountSchema } from "./graph.ts";
import { provision } from "./job/alchemy.ts";

const mount = mountSchema.parse(JSON.parse(readFileSync(".local/mount.json", "utf8")));
const secret = z.string().min(1).parse(process.env.EXPERIMENT_WORKER_SECRET);

// This registry is an experiment contract. Convex does not discover Alchemy exports.
const companions = new Map([["../job/convex", provision]]);
const companion = companions.get(mount.definitionPath);
if (!companion) throw new Error(`No companion registered for ${mount.definitionPath}`);

export default Alchemy.Stack(
  "component-binding-graph",
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    const worker = yield* companion(mount.componentPath, secret);
    return {
      workerUrl: worker.url.pipe(
        Output.mapEffect((url) =>
          Effect.promise(async () => {
            await writeFile(
              ".local/worker.json",
              JSON.stringify({ url, fqn: worker.FQN, resourceType: worker.Type }),
            );
            return url;
          }),
        ),
      ),
    };
  }),
);
