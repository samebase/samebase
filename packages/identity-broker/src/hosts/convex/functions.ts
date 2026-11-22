// One Convex function per command, for the generated modules of component/: a query for a
// read-only command, a mutation for the others. Its arguments are the command's encoded arguments
// and the step clock `now`; it returns the encoded result. Both validators come from the command's
// codecs, so a command whose data is not a Convex value fails when the component loads.
import { mutationGeneric, queryGeneric, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { commands, decodeCommand, type CommandName } from "../../store/commands.ts";
import { convexValue } from "./schema.ts";
import { convexReadTx, convexTx } from "./tx.ts";

const validators = (name: CommandName) => ({
  args: { args: convexValue(commands[name].args), now: v.number() },
  returns: convexValue(commands[name].result),
});

export const commandQuery = (name: CommandName) =>
  queryGeneric({
    ...validators(name),
    handler: (ctx, input) =>
      decodeCommand(name, input.args).runAsync(input.now, convexReadTx(ctx.db)),
  });

export const commandMutation = (name: CommandName) =>
  mutationGeneric({
    ...validators(name),
    handler: (ctx, input) => decodeCommand(name, input.args).runAsync(input.now, convexTx(ctx.db)),
  });

/** What a command's function takes. */
export type CommandInput = { args: unknown; now: number };

/** The function of one command, as an app or the component's own `api` references it. */
export type CommandFunction =
  | {
      readonly kind: "query";
      readonly reference: FunctionReference<"query", "public" | "internal", CommandInput>;
    }
  | {
      readonly kind: "mutation";
      readonly reference: FunctionReference<"mutation", "public" | "internal", CommandInput>;
    };

export type CommandFunctions = { readonly [N in CommandName]: CommandFunction };
