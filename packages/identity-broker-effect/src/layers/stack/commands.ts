// The stack layer's commands and their typed runner. Each writes or reads cards with the layer's
// view, `StackTx`.
import { runCommand } from "../../core/command.ts";
import { command as define, type Command } from "../../rules/commands.ts";
import * as clients from "./clients.ts";
import type { StackTx } from "./tables.ts";

const definitions = {
  "stack.createClient": define({
    args: clients.CreateArgs,
    result: clients.CreateResult,
    readOnly: false,
    rule: clients.create,
  }),
  "stack.renew": define({
    args: clients.RenewArgs,
    result: clients.RenewResult,
    readOnly: false,
    rule: clients.renew,
  }),
  "stack.remove": define({
    args: clients.RemoveArgs,
    result: clients.RemoveResult,
    readOnly: false,
    rule: clients.remove,
  }),
};

type Definitions = typeof definitions;
export type StackCommandName = keyof Definitions;
type Args<N extends StackCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends StackCommandName> = Definitions[N]["result"]["Type"];

export const stackCommands: {
  readonly [N in StackCommandName]: Command<Args<N>, Result<N>, StackTx>;
} = definitions;

/** Runs one command of the stack layer, once. */
export const command = <N extends StackCommandName>(name: N, args: Args<N>) =>
  runCommand(name, stackCommands[name], args);
