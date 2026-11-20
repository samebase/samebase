// The connections part's commands and their typed runner. Each reads cards with the core's view
// `Tx` and the part's tables with `ConnectionsTx`.
import { Schema } from "effect";
import { runCommand } from "../core/command.ts";
import { command as define, type Command } from "../rules/commands.ts";
import type { Tx } from "../rules/tables.ts";
import * as rules from "./rules.ts";
import type { ConnectionsTx } from "./tables.ts";

const definitions = {
  "connections.create": define({
    args: rules.CreateArgs,
    result: rules.CreateResult,
    readOnly: false,
    rule: rules.create,
  }),
  "connections.claim": define({
    args: rules.ClaimArgs,
    result: rules.ClaimResult,
    readOnly: false,
    rule: rules.claim,
  }),
  "connections.complete": define({
    args: rules.CompleteArgs,
    result: rules.CompleteResult,
    readOnly: false,
    rule: rules.complete,
  }),
  "connections.abandon": define({
    args: rules.RequestIdArgs,
    result: rules.AbandonResult,
    readOnly: false,
    rule: rules.abandon,
  }),
  "connections.exchangeCode": define({
    args: rules.ExchangeArgs,
    result: rules.ExchangeResult,
    readOnly: false,
    rule: rules.exchangeCode,
  }),
  "connections.claimRefresh": define({
    args: rules.ClaimRefreshArgs,
    result: rules.ClaimRefreshResult,
    readOnly: false,
    rule: rules.claimRefresh,
  }),
  "connections.finishRefresh": define({
    args: rules.FinishRefreshArgs,
    result: rules.FinishRefreshResult,
    readOnly: false,
    rule: rules.finishRefresh,
  }),
  "connections.failRefresh": define({
    args: rules.FailRefreshArgs,
    result: rules.FailRefreshResult,
    readOnly: false,
    rule: rules.failRefresh,
  }),
  "connections.revoke": define({
    args: rules.RevokeArgs,
    result: Schema.Boolean,
    readOnly: false,
    rule: rules.revoke,
  }),
  "connections.cleanup": define({
    args: rules.CleanupArgs,
    result: rules.CleanupResult,
    readOnly: false,
    rule: rules.cleanup,
  }),
};

type Definitions = typeof definitions;
export type ConnectionsCommandName = keyof Definitions;
type Args<N extends ConnectionsCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends ConnectionsCommandName> = Definitions[N]["result"]["Type"];

export const connectionsCommands: {
  readonly [N in ConnectionsCommandName]: Command<Args<N>, Result<N>, Tx | ConnectionsTx>;
} = definitions;

/** Runs one command of the connections part, once. */
export const command = <N extends ConnectionsCommandName>(name: N, args: Args<N>) =>
  runCommand(name, connectionsCommands[name], args);
