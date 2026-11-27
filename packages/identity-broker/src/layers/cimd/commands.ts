// The CIMD layer's commands and their typed runner. Each writes or reads cards with the layer's
// view, `CimdTx`; the budgets are the core's (`spendBudget`), on the core's view.
import { Schema } from "effect";
import { runCommand } from "../../core/command.ts";
import * as Api from "../../moderation/api.ts";
import { command as define, type Command } from "../../rules/commands.ts";
import type { Tx } from "../../rules/tables.ts";
import * as clients from "./clients.ts";
import type { CimdTx } from "./tables.ts";

const definitions = {
  "cimd.begin": define({
    args: clients.BeginArgs,
    result: clients.BeginResult,
    readOnly: false,
    rule: clients.begin,
  }),
  "cimd.put": define({
    args: clients.PutArgs,
    result: clients.PutResult,
    readOnly: false,
    rule: clients.put,
  }),
  "cimd.remove": define({
    args: clients.RemoveArgs,
    result: clients.RemoveResult,
    readOnly: false,
    rule: clients.remove,
  }),
  "cimd.blockHost": define({
    args: clients.HostArgs,
    result: clients.HostResult,
    readOnly: false,
    rule: clients.blockHost,
  }),
  "cimd.unblockHost": define({
    args: clients.HostArgs,
    result: clients.HostResult,
    readOnly: false,
    rule: clients.unblockHost,
  }),
  "cimd.hostBlocks": define({
    args: Schema.Struct({}),
    result: Api.HostBlockList,
    readOnly: true,
    rule: clients.hostBlocks,
  }),
  "cimd.clients": define({
    args: Schema.Struct({}),
    result: Api.CimdClientList,
    readOnly: true,
    rule: clients.listClients,
  }),
};

type Definitions = typeof definitions;
export type CimdCommandName = keyof Definitions;
type Args<N extends CimdCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends CimdCommandName> = Definitions[N]["result"]["Type"];

export const cimdCommands: {
  readonly [N in CimdCommandName]: Command<Args<N>, Result<N>, CimdTx | Tx>;
} = definitions;

/** Runs one command of the CIMD layer, once. */
export const command = <N extends CimdCommandName>(name: N, args: Args<N>) =>
  runCommand(name, cimdCommands[name], args);
