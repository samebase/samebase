// The stack of the old identity hub, which is being removed. It declares no resource: its next
// deploy deletes the Convex project `identity-hub` and its production deployment, whose state rows
// carry the `destroy` policy, and forgets them. A later change removes this folder.
// .github/workflows/identity-hub.yml runs it from this folder; every run needs the team token
// CONVEX_ACCESS_TOKEN, or a Convex CLI login (`npx convex login`) on a development machine.
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "samebase/samebase/apps/identity-hub",
  { providers: Convex.providers(), state: Convex.withRunRecord(Convex.state()) },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    if (stage !== "prod") {
      throw new Error(`This stack has one stage, prod. The stage ${stage} is not deployed.`);
    }
    return {};
  }),
);
