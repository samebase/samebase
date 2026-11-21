// The GitHub layer's commands: the storage steps of `POST /register`, of the client configuration
// endpoint (RFC 7592) and of the moderation API. Each writes or reads cards with the layer's view,
// `GithubTx`.
import { Schema } from "effect";
import * as Api from "../../moderation/api.ts";
import { command, type Command } from "../../rules/commands.ts";
import * as clients from "./clients.ts";
import * as moderation from "./moderation.ts";
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
  "github.counts": command({
    args: Schema.Struct({}),
    result: Api.Counts,
    readOnly: true,
    rule: moderation.counts,
  }),
  "github.blocks": command({
    args: Schema.Struct({}),
    result: Api.BlockList,
    readOnly: true,
    rule: moderation.blocks,
  }),
  "github.changeBlock": command({
    args: Api.BlockChange,
    result: Api.Changed,
    readOnly: false,
    rule: moderation.changeBlock,
  }),
  "github.signInPage": command({
    args: Schema.Struct({}),
    result: Api.SignInPageList,
    readOnly: true,
    rule: moderation.signInPage,
  }),
  "github.changeSignInPage": command({
    args: S.ChangeSignInPageArgs,
    result: S.OwnerChangeResult,
    readOnly: false,
    rule: moderation.changeSignInPage,
  }),
  "github.connectorGrants": command({
    args: S.ConnectorGrantsArgs,
    result: Api.ConnectorGrantList,
    readOnly: true,
    rule: moderation.connectorGrants,
  }),
  "github.changeConnectorGrant": command({
    args: S.ChangeConnectorGrantArgs,
    result: S.OwnerChangeResult,
    readOnly: false,
    rule: moderation.changeConnectorGrant,
  }),
  "github.clients": command({
    args: S.ClientsArgs,
    result: Api.ClientList,
    readOnly: true,
    rule: moderation.clients,
  }),
  "github.deleteClient": command({
    args: S.DeleteClientArgs,
    result: Api.Changed,
    readOnly: false,
    rule: moderation.deleteClient,
  }),
};

type Definitions = typeof definitions;
export type GithubCommandName = keyof Definitions;
type Args<N extends GithubCommandName> = Definitions[N]["args"]["Type"];
type Result<N extends GithubCommandName> = Definitions[N]["result"]["Type"];

export const githubCommands: {
  readonly [N in GithubCommandName]: Command<Args<N>, Result<N>, GithubTx>;
} = definitions;
