import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State/LocalState";
import * as Effect from "effect/Effect";

export const sharedStack = "component-binding-shared";
export const archiveAddress = { stack: sharedStack, stage: "local-experiment", fqn: "Archive" };
export default Alchemy.Stack(
  sharedStack,
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    const archive = yield* Cloudflare.R2.Bucket(archiveAddress.fqn);
    return { archiveName: archive.bucketName };
  }),
);
