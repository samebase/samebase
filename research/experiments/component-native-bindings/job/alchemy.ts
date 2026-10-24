import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";

type Inputs = {
  secret: Redacted.Redacted<string>;
  archive: ReturnType<typeof Cloudflare.R2.Bucket.ref>;
};

// The package owns its resources. The app supplies the shared bucket reference and secret.
export const Processor = (inputs: Inputs) =>
  Effect.gen(function* () {
    const storage = yield* Cloudflare.R2.Bucket("Storage");
    return yield* Worker(storage, inputs);
  });

const Worker = (storage: Cloudflare.R2.Bucket, inputs: Inputs) =>
  Cloudflare.Worker("Processor", {
    main: "./job/worker.ts",
    env: { SECRET: inputs.secret, STORAGE: storage, ARCHIVE: inputs.archive },
    dev: { host: "127.0.0.1", port: 33442, strictPort: true },
  });

export type WorkerEnv = Cloudflare.InferEnv<ReturnType<typeof Worker>>;
