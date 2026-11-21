// The GitHub layer's commands: the storage steps of `POST /register` and of the client
// configuration endpoint (RFC 7592). Each writes or reads cards with the layer's view, `GithubTx`.
import { command, type Command } from "../../rules/commands.ts";
import * as clients from "./clients.ts";
import * as registration from "./registration.ts";
import * as S from "./schemas.ts";
import type { GithubTx } from "./tables.ts";

const definitions = {
  "github.admit": command({
    args: S.AdmitArgs,
    result: S.AdmitResult,
    readOnly: false,
    rule: registration.admit,
  }),
  "github.createClient": command({
    args: S.CreateClientArgs,
    result: S.CreateClientResult,
    readOnly: false,
    rule: registration.createClient,
  }),
  "github.readInitialAccessToken": command({
    args: S.ReadInitialAccessTokenArgs,
    result: S.ReadInitialAccessTokenResult,
    readOnly: true,
    rule: registration.readInitialAccessToken,
  }),
  "github.createDevelopmentClient": command({
    args: S.CreateDevelopmentClientArgs,
    result: S.CreateDevelopmentClientResult,
    readOnly: false,
    rule: registration.createDevelopmentClient,
  }),
  "github.renew": command({
    args: S.RenewArgs,
    result: S.RenewResult,
    readOnly: false,
    rule: clients.renew,
  }),
  "github.remove": command({
    args: S.RemoveArgs,
    result: S.RemoveResult,
    readOnly: false,
    rule: clients.remove,
  }),
};

type Definitions = typeof definitions;
export type GithubCommandName = keyof Definitions;
type Args<N extends GithubCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends GithubCommandName> = Definitions[N]["result"]["Type"];

export const githubCommands: {
  readonly [N in GithubCommandName]: Command<Args<N>, Result<N>, GithubTx>;
} = definitions;
