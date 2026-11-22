// The command contract and the core's commands. Each command is one all-or-nothing step whose
// encoded arguments and result are plain JSON and Convex values (src/hosts/convex/schema.ts
// refuses any other schema). A layer declares its own commands with `command`; the one catalog that
// a host runs is composed in src/store/commands.ts.
import { Effect, Schema } from "effect";
import * as authRequests from "./authRequests.ts";
import * as clients from "./clients.ts";
import * as lifecycle from "./lifecycle.ts";
import * as S from "./schemas.ts";
import * as signIns from "./signIns.ts";
import type { Tx } from "./tables.ts";

/** What the storage host gives a step: its clock at command entry, in milliseconds. */
export interface Step {
  readonly now: number;
}

export interface Command<A, R, Requirements> {
  readonly args: Schema.Codec<A, unknown>;
  readonly result: Schema.Codec<R, unknown>;
  /** The step writes nothing. */
  readonly readOnly: boolean;
  /** No clock, no randomness, no hashing, no I/O: everything else arrives in `args` and `step`. */
  readonly rule: (args: A, step: Step) => Effect.Effect<R, never, Requirements>;
}

/** One command, typed from its schemas. `Requirements` is the `Tx` view that its rule reads. */
export const command = <A extends Schema.Top, R extends Schema.Top, Requirements>(definition: {
  readonly args: A;
  readonly result: R;
  readonly readOnly: boolean;
  readonly rule: (args: A["Type"], step: Step) => Effect.Effect<R["Type"], never, Requirements>;
}) => definition;

const definitions = {
  "authRequests.create": command({
    args: S.CreateArgs,
    result: S.CreateResult,
    readOnly: false,
    rule: authRequests.create,
  }),
  "authRequests.get": command({
    args: S.RequestIdArgs,
    result: S.GetResult,
    readOnly: true,
    rule: authRequests.get,
  }),
  "authRequests.startUpstream": command({
    args: S.StartUpstreamArgs,
    result: S.TransitionResult,
    readOnly: false,
    rule: authRequests.startUpstream,
  }),
  "authRequests.claimUpstream": command({
    args: S.ClaimUpstreamArgs,
    result: S.ClaimResult,
    readOnly: false,
    rule: authRequests.claimUpstream,
  }),
  "authRequests.complete": command({
    args: S.CompleteArgs,
    result: S.TransitionResult,
    readOnly: false,
    rule: authRequests.complete,
  }),
  "authRequests.abandon": command({
    args: S.RequestIdArgs,
    result: S.AbandonResult,
    readOnly: false,
    rule: authRequests.abandon,
  }),
  "authRequests.exchangeCode": command({
    args: S.ExchangeCodeArgs,
    result: S.ExchangeResult,
    readOnly: false,
    rule: authRequests.exchangeCode,
  }),
  "clients.get": command({
    args: S.ClientIdArgs,
    result: S.ClientResult,
    readOnly: true,
    rule: clients.get,
  }),
  "signIns.record": command({
    args: S.RecordArgs,
    result: Schema.Null,
    readOnly: false,
    rule: signIns.record,
  }),
  "lifecycle.cleanup": command({
    args: S.CleanupArgs,
    result: S.CleanupResult,
    readOnly: false,
    rule: lifecycle.cleanup,
  }),
};

type Definitions = typeof definitions;
export type CoreCommandName = keyof Definitions;
type Args<N extends CoreCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends CoreCommandName> = Definitions[N]["result"]["Type"];

/** The core's commands, typed so that `coreCommands[name]` keeps the types of `name`. */
export const coreCommands: {
  readonly [N in CoreCommandName]: Command<Args<N>, Result<N>, Tx>;
} = definitions;
