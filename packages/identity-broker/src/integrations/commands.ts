// The integrations part's commands and their typed runner. Each reads cards with the core's view
// `Tx` and the part's tables with `IntegrationsTx`.
import { runCommand } from "../core/command.ts";
import { command as define, type Command } from "../rules/commands.ts";
import type { Tx } from "../rules/tables.ts";
import * as rules from "./rules.ts";
import type { IntegrationsTx } from "./tables.ts";

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
  "connections.admitRefresh": define({
    args: rules.AdmitRefreshArgs,
    result: rules.AdmitRefreshResult,
    readOnly: false,
    rule: rules.admitRefresh,
  }),
  "connections.authenticate": define({
    args: rules.AuthenticateArgs,
    result: rules.AuthenticateResult,
    readOnly: true,
    rule: rules.authenticate,
  }),
  "connections.cleanup": define({
    args: rules.CleanupArgs,
    result: rules.CleanupResult,
    readOnly: false,
    rule: rules.cleanup,
  }),
};

type Definitions = typeof definitions;
export type IntegrationsCommandName = keyof Definitions;
type Args<N extends IntegrationsCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends IntegrationsCommandName> = Definitions[N]["result"]["Type"];

export const integrationsCommands: {
  readonly [N in IntegrationsCommandName]: Command<Args<N>, Result<N>, Tx | IntegrationsTx>;
} = definitions;

/** Runs one command of the integrations part, once. */
export const command = <N extends IntegrationsCommandName>(name: N, args: Args<N>) =>
  runCommand(name, integrationsCommands[name], args);
