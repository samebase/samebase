// The one command catalog of a hub: the core's commands (src/rules/commands.ts) and each layer's.
// A host runs a command of this closed list by name, as one step over a `Tx` of src/store/tables.ts
// that serves the core's view and each layer's view.
import { Effect, Schema } from "effect";
import { githubCommands } from "../layers/github/commands.ts";
import { GithubTx } from "../layers/github/tables.ts";
import { stackCommands } from "../layers/stack/commands.ts";
import { StackTx } from "../layers/stack/tables.ts";
import { coreCommands, type Command } from "../rules/commands.ts";
import { Tx, type CoreTables } from "../rules/tables.ts";
import { microtaskScheduler } from "./Store.ts";
import type { Tables } from "./tables.ts";
import type { TxShape } from "./Tx.ts";

const definitions = { ...coreCommands, ...githubCommands, ...stackCommands };

type Definitions = typeof definitions;
export type CommandName = keyof Definitions;
export type Args<N extends CommandName> = Definitions[N]["args"]["Type"];
export type Result<N extends CommandName> = Definitions[N]["result"]["Type"];

/** The registry, typed so that `commands[name]` keeps the argument and result types of `name`. */
export const commands: {
  readonly [N in CommandName]: Command<Args<N>, Result<N>, Tx | GithubTx | StackTx>;
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
  "stack.createClient",
  "stack.renew",
  "stack.remove",
] as const satisfies ReadonlyArray<CommandName>;

/** Fails to compile when a command is missing from `commandNames`. */
export const everyCommandListed: Exclude<CommandName, (typeof commandNames)[number]> extends never
  ? true
  : false = true;

/** The closed set of names. A host refuses any other name. */
export const CommandNameSchema = Schema.Literals(commandNames);

/** The command name of a host's input. Any other name is a defect of the caller. */
export const decodeName = Schema.decodeUnknownSync(CommandNameSchema);

/** Decodes the arguments of `name`. Bad arguments are a defect of the caller. */
export const decodeArgs = <N extends CommandName>(name: N, input: unknown): Args<N> =>
  Schema.decodeUnknownSync(commands[name].args)(input);

/** Encodes the arguments of `name` for `Store.run`. */
export const encodeArgs = <N extends CommandName>(name: N, args: Args<N>): unknown =>
  Schema.encodeSync(commands[name].args)(args);

/** Decodes the result of `name` on the caller's side. */
export const decodeResult = <N extends CommandName>(name: N, input: unknown): Result<N> =>
  Schema.decodeUnknownSync(commands[name].result)(input);

/** Whether the command of `name` writes nothing. A host gives such a step a `Tx` that refuses writes. */
export const isReadOnly = (name: CommandName): boolean => commands[name].readOnly;

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
      Effect.provideService(Tx, coreView(tx)),
    );

/**
 * Runs the rule of `name` to completion over `tx` and encodes its result, inside the host's
 * transaction, so a codec defect rolls the step back too. Throws on a defect, and on a rule that
 * suspends (`Effect.runSync` cannot finish it).
 */
export const runStep = <N extends CommandName>(
  name: N,
  args: Args<N>,
  now: number,
  tx: TxShape<Tables>,
): unknown =>
  Schema.encodeSync(commands[name].result)(Effect.runSync(ruleOver(name, args, now, tx)));

/**
 * `runStep` for a host whose storage is async (a `Tx` over Convex's `ctx.db`): the same decode
 * and encode, with the rule run by `Effect.runPromise`. Rejects on a defect.
 */
export const runStepAsync = async <N extends CommandName>(
  name: N,
  args: Args<N>,
  now: number,
  tx: TxShape<Tables>,
): Promise<unknown> =>
  Schema.encodeSync(commands[name].result)(
    await Effect.runPromise(ruleOver(name, args, now, tx), { scheduler: microtaskScheduler() }),
  );
