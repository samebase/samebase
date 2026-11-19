// The closed list of commands: the 19 that the HTTP handlers call, and `lifecycle.cleanup`. Each
// command is one all-or-nothing step. Names, arguments and results stay those of the Convex
// component, with the changes of the design (app ids and the verifier's challenge come from the
// core, the step clock comes from the host).
import { Effect, Schema } from "effect";
import type { Tx } from "../store/Tx.ts";
import * as authRequests from "./authRequests.ts";
import * as clients from "./clients.ts";
import * as connectorGrants from "./connectorGrants.ts";
import * as hubClients from "./hubClients.ts";
import * as lifecycle from "./lifecycle.ts";
import * as registration from "./registration.ts";
import * as S from "./schemas.ts";
import * as signIns from "./signIns.ts";

/** What the storage host gives a step: its clock at command entry, in milliseconds. */
export interface Step {
  readonly now: number;
}

export interface Command<A, R> {
  readonly args: Schema.Codec<A, unknown>;
  readonly result: Schema.Codec<R, unknown>;
  /** The step writes nothing. */
  readonly readOnly: boolean;
  /** No clock, no randomness, no hashing, no I/O: everything else arrives in `args` and `step`. */
  readonly rule: (args: A, step: Step) => Effect.Effect<R, never, Tx>;
}

const command = <A extends Schema.Top, R extends Schema.Top>(definition: {
  readonly args: A;
  readonly result: R;
  readonly readOnly: boolean;
  readonly rule: (args: A["Type"], step: Step) => Effect.Effect<R["Type"], never, Tx>;
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
  "authRequests.upstreamClient": command({
    args: S.UpstreamClientArgs,
    result: S.UpstreamClientResult,
    readOnly: true,
    rule: authRequests.upstreamClient,
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
  "clients.withApp": command({
    args: S.ClientIdArgs,
    result: S.WithAppResult,
    readOnly: true,
    rule: clients.withApp,
  }),
  "clients.forAuthorize": command({
    args: S.ClientIdArgs,
    result: S.ForAuthorizeResult,
    readOnly: true,
    rule: clients.forAuthorize,
  }),
  "connectorGrants.forRegistration": command({
    args: S.ForRegistrationArgs,
    result: S.ForRegistrationResult,
    readOnly: true,
    rule: connectorGrants.forRegistration,
  }),
  "hubClients.admit": command({
    args: S.AdmitArgs,
    result: S.AdmitResult,
    readOnly: false,
    rule: hubClients.admit,
  }),
  "hubClients.createClient": command({
    args: S.CreateClientArgs,
    result: S.CreateClientResult,
    readOnly: false,
    rule: hubClients.createClient,
  }),
  "hubClients.readInitialAccessToken": command({
    args: S.ReadInitialAccessTokenArgs,
    result: S.ReadInitialAccessTokenResult,
    readOnly: true,
    rule: hubClients.readInitialAccessToken,
  }),
  "hubClients.createDevelopmentClient": command({
    args: S.CreateDevelopmentClientArgs,
    result: S.CreateDevelopmentClientResult,
    readOnly: false,
    rule: hubClients.createDevelopmentClient,
  }),
  "registration.renew": command({
    args: S.RenewArgs,
    result: S.RenewResult,
    readOnly: false,
    rule: registration.renew,
  }),
  "registration.remove": command({
    args: S.RemoveArgs,
    result: S.RemoveResult,
    readOnly: false,
    rule: registration.remove,
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
export type CommandName = keyof Definitions;
export type Args<N extends CommandName> = Definitions[N]["args"]["Type"];
export type Result<N extends CommandName> = Definitions[N]["result"]["Type"];

/** The registry, typed so that `commands[name]` keeps the argument and result types of `name`. */
export const commands: { readonly [N in CommandName]: Command<Args<N>, Result<N>> } = definitions;

export const commandNames = [
  "authRequests.create",
  "authRequests.get",
  "authRequests.startUpstream",
  "authRequests.upstreamClient",
  "authRequests.claimUpstream",
  "authRequests.complete",
  "authRequests.abandon",
  "authRequests.exchangeCode",
  "clients.get",
  "clients.withApp",
  "clients.forAuthorize",
  "connectorGrants.forRegistration",
  "hubClients.admit",
  "hubClients.createClient",
  "hubClients.readInitialAccessToken",
  "hubClients.createDevelopmentClient",
  "registration.renew",
  "registration.remove",
  "signIns.record",
  "lifecycle.cleanup",
] as const satisfies ReadonlyArray<CommandName>;

/** Fails to compile when a command is missing from `commandNames`. */
export const everyCommandListed: Exclude<CommandName, (typeof commandNames)[number]> extends never
  ? true
  : false = true;

/** The closed set of names. A host refuses any other name. */
export const CommandNameSchema = Schema.Literals(commandNames);
