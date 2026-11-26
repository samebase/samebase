// The metadata layer's commands and their typed runner. Each writes or reads cards with the layer's
// view, `MetadataTx`; the budgets are the core's (`spendBudget`), on the core's view.
import { runCommand } from "../../core/command.ts";
import { command as define, type Command } from "../../rules/commands.ts";
import type { Tx } from "../../rules/tables.ts";
import * as clients from "./clients.ts";
import type { MetadataTx } from "./tables.ts";

const definitions = {
  "metadata.begin": define({
    args: clients.BeginArgs,
    result: clients.BeginResult,
    readOnly: false,
    rule: clients.begin,
  }),
  "metadata.put": define({
    args: clients.PutArgs,
    result: clients.PutResult,
    readOnly: false,
    rule: clients.put,
  }),
  "metadata.remove": define({
    args: clients.RemoveArgs,
    result: clients.RemoveResult,
    readOnly: false,
    rule: clients.remove,
  }),
  "metadata.stop": define({
    args: clients.SiteArgs,
    result: clients.SiteResult,
    readOnly: false,
    rule: clients.stop,
  }),
  "metadata.release": define({
    args: clients.SiteArgs,
    result: clients.SiteResult,
    readOnly: false,
    rule: clients.release,
  }),
};

type Definitions = typeof definitions;
export type MetadataCommandName = keyof Definitions;
type Args<N extends MetadataCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends MetadataCommandName> = Definitions[N]["result"]["Type"];

export const metadataCommands: {
  readonly [N in MetadataCommandName]: Command<Args<N>, Result<N>, MetadataTx | Tx>;
} = definitions;

/** Runs one command of the metadata layer, once. */
export const command = <N extends MetadataCommandName>(name: N, args: Args<N>) =>
  runCommand(name, metadataCommands[name], args);
