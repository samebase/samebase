// The GitHub layer's settings and its typed command runner.
import { Context } from "effect";
import { runCommand } from "../../core/command.ts";
import { githubCommands, type GithubCommandName } from "./commands.ts";
import type { AllowList } from "./schemas.ts";

/**
 * The repositories whose cards get every configured connector while the named owner owns them, and
 * whether the broker pauses every app. Each command that writes a card gets the allow-list whole: a
 * change reaches a card at its next registration, renewal or rewrite.
 */
export class GithubSettings extends Context.Service<
  GithubSettings,
  { readonly allowList: typeof AllowList.Type; readonly paused: boolean }
>()("identity-broker/layers/github/GithubSettings") {}

/** Runs one command of the GitHub layer, once. */
export const command = <N extends GithubCommandName>(
  name: N,
  args: (typeof githubCommands)[N]["args"]["Type"],
) => runCommand(name, githubCommands[name], args);
