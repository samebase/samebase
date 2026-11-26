// The one command catalog of a broker: the core's commands (src/rules/commands.ts), each layer's, and
// the integrations part's.
// A host runs a command of this closed list by name, as one step over a `Tx` of src/store/tables.ts
// that serves the core's view and each layer's view.
import { Effect, Schema } from "effect";
import { integrationsCommands } from "../integrations/commands.ts";
import { IntegrationsTx } from "../integrations/tables.ts";
import { githubCommands } from "../layers/github/commands.ts";
import { GithubTx } from "../layers/github/tables.ts";
import { stackCommands } from "../layers/stack/commands.ts";
import { StackTx } from "../layers/stack/tables.ts";
import { coreCommands, type Command } from "../rules/commands.ts";
import { Tx, type CoreTables } from "../rules/tables.ts";
import { microtaskScheduler } from "./Store.ts";
import type { Tables } from "./tables.ts";
import type { TxShape } from "./Tx.ts";

const definitions = {
  ...coreCommands,
  ...githubCommands,
  ...stackCommands,
  ...integrationsCommands,
};

type Definitions = typeof definitions;
export type CommandName = keyof Definitions;
export type Args<N extends CommandName> = Definitions[N]["args"]["Type"];
export type Result<N extends CommandName> = Definitions[N]["result"]["Type"];

/** The registry, typed so that `commands[name]` keeps the argument and result types of `name`. */
export const commands: {
  readonly [N in CommandName]: Command<
    Args<N>,
    Result<N>,
    Tx | GithubTx | StackTx | IntegrationsTx
  >;
} = definitions;

export const commandNames = [
  "authRequests.create",
  "authRequests.get",
  "authRequests.startUpstream",
  "authRequests.claimUpstream",
  "authRequests.complete",
  "authRequests.abandon",
  "authRequests.exchangeCode",
  "clients.get",
  "signIns.record",
  "lifecycle.cleanup",
  "github.admit",
  "github.createClient",
  "github.readInitialAccessToken",
  "github.createDevelopmentClient",
  "github.renew",
  "github.remove",
  "github.counts",
  "github.blocks",
  "github.changeBlock",
  "github.signInPage",
  "github.changeSignInPage",
  "github.connectorGrants",
  "github.changeConnectorGrant",
  "github.clients",
  "github.deleteClient",
  "stack.createClient",
  "stack.renew",
  "stack.remove",
  "connections.create",
  "connections.claim",
  "connections.complete",
  "connections.abandon",
  "connections.exchangeCode",
  "connections.admitRefresh",
  "connections.authenticate",
  "connections.cleanup",
] as const satisfies ReadonlyArray<CommandName>;

/** Fails to compile when a command is missing from `commandNames`. */
export const everyCommandListed: Exclude<CommandName, (typeof commandNames)[number]> extends never
  ? true
  : false = true;

/** The command name of a host's input. Any other name is a defect of the caller. */
export const decodeName = Schema.decodeUnknownSync(Schema.Literals(commandNames));

/** Decodes the arguments of `name`. Bad arguments are a defect of the caller. */
const decodeArgs = <N extends CommandName>(name: N, input: unknown): Args<N> =>
  Schema.decodeUnknownSync(commands[name].args)(input);

/** Encodes the arguments of `name` for `Store.run`. */
export const encodeArgs = <N extends CommandName>(name: N, args: Args<N>): unknown =>
  Schema.encodeSync(commands[name].args)(args);

/** Decodes the result of `name` on the caller's side. */
export const decodeResult = <N extends CommandName>(name: N, input: unknown): Result<N> =>
  Schema.decodeUnknownSync(commands[name].result)(input);

/** The core's view of a step whose `Tx` is over the whole catalog. */
export const coreView = (tx: TxShape<Tables>): TxShape<CoreTables> =>
  // @ts-expect-error The catalog's tables hold every core table with the core's fields, and a card
  // row has the core's card fields with a layer's fields beside them, so a `Tx` over the catalog
  // serves every read and write of the core's view.
  tx;

/** The rule of `name` over `tx`, with every view of the step served by the same `tx`. */
const ruleOver = <N extends CommandName>(
  name: N,
  args: Args<N>,
  now: number,
  tx: TxShape<Tables>,
): Effect.Effect<Result<N>> =>
  commands[name]
    .rule(args, { now })
    .pipe(
      Effect.provideService(GithubTx, tx),
      Effect.provideService(StackTx, tx),
      Effect.provideService(IntegrationsTx, tx),
      Effect.provideService(Tx, coreView(tx)),
    );

/**
 * The command of a host's input, `name` and its encoded `args`, decoded before the host opens its
 * transaction: an unknown name or bad arguments throw. `readOnly`: the command writes nothing, so
 * its `Tx` may refuse writes. `run` runs the rule over `tx` at the step clock `now`, inside the
 * host's transaction, and returns the encoded result; it throws on a defect and on a rule that
 * suspends, and the host then rolls the transaction back. `runAsync` is `run` for a `Tx` whose
 * operations are async, such as one over Convex's `ctx.db`; it rejects on a defect.
 */
export const decodeCommand = (name: string, args: unknown) => {
  const command = decodeName(name);
  const decoded = decodeArgs(command, args);
  const encode = Schema.encodeSync(commands[command].result);
  return {
    readOnly: commands[command].readOnly,
    run: (now: number, tx: TxShape<Tables>): unknown =>
      encode(Effect.runSync(ruleOver(command, decoded, now, tx))),
    runAsync: async (now: number, tx: TxShape<Tables>): Promise<unknown> =>
      encode(
        await Effect.runPromise(ruleOver(command, decoded, now, tx), {
          scheduler: microtaskScheduler(),
        }),
      ),
  };
};
