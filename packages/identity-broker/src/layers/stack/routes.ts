// The stack layer: a broker that one app's own stack deploys registers any client that presents one
// of the broker's named keys at `POST /register` (RFC 7591 appendix A.1.2, a protected endpoint). The
// key is the only proof: no repository, no verification file. The name of the key that matched is
// what the broker trusts; it gives the card its budget, its gate and its reference. A key may make
// permanent clients only when its settings say so. Each client then reads and deletes itself with
// its own registration access token (RFC 7592), never with a key.
import { Config, Effect, Option, Redacted } from "effect";
import { readBearerToken } from "../../core/protocol.ts";
import { invalidToken, json, noToken } from "../../core/responses.ts";
import type { PrivateRegistration } from "../../core/router.ts";
import { BrokerConfig } from "../../core/services.ts";
import { sha256HexEffect } from "../../core/subject.ts";
import {
  insufficientScope,
  invalid,
  invalidConnectors,
  MAX_APP_LENGTH,
  managementRequest,
  newClient,
  newClientCredentials,
  readAnswer,
  readClientMetadata,
  updateClient,
} from "../clientRegistration.ts";
import { keyRef } from "./clients.ts";
import { command } from "./commands.ts";

/** One key of the broker. */
export type Key = {
  /** The key: a secret of the broker's host, such as `Config.Redacted("BROKER_PREVIEW_KEY")`. */
  readonly key: Config.Config<Redacted.Redacted<string>>;
  /** Clients of this key may be permanent: production clients, with no removal date. */
  readonly permanent?: boolean;
  /**
   * The integrations that clients of this key may use, such as `["cloudflare"]`: their cards'
   * `connections`. None without it.
   */
  readonly integrations?: ReadonlyArray<string>;
};

/** A client's name: its stage, such as `prod` or `pr-12`. It is part of the card's `ref`. */
const CLIENT_NAME = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The keys that the broker has now, each with the SHA-256 hex of its value, read in the request. A key
 * whose `Config` is missing or whose value is empty is not one of them.
 */
const configuredKeys = (settings: Readonly<Record<string, Key>>) =>
  Effect.forEach(Object.entries(settings), ([name, entry]) =>
    Effect.gen(function* () {
      const value = yield* Config.option(entry.key);
      return Option.isNone(value) || Redacted.value(value.value) === ""
        ? []
        : [
            {
              name,
              permanent: entry.permanent === true,
              // The key's `integrations` setting is stored as the card field `connections`.
              connections: [...new Set(entry.integrations ?? [])].sort(),
              digest: yield* sha256HexEffect(Redacted.value(value.value)),
            },
          ];
    }),
  ).pipe(
    Effect.map((keys) => keys.flat()),
    Effect.orDie,
  );

/** `POST <prefix>/register` with one of the broker's keys as the Bearer. */
const registerClient = (settings: Readonly<Record<string, Key>>) =>
  Effect.fn("stack.registerClient")(function* (request: Request) {
    const bearer = readBearerToken(request.headers.get("authorization"));
    if (bearer === null) {
      return noToken("register");
    }
    const digest = yield* sha256HexEffect(bearer);
    const key = (yield* configuredKeys(settings)).find((candidate) => candidate.digest === digest);
    if (key === undefined) {
      return invalidToken();
    }
    const metadata = yield* readClientMetadata(request);
    if (metadata instanceof Response) {
      return metadata;
    }
    if (metadata.softwareId.length === 0 || metadata.softwareId.length > MAX_APP_LENGTH) {
      return invalid("invalid_client_metadata", "software_id is 1 to 64 characters.");
    }
    const name = metadata.clientName;
    if (name === undefined || !CLIENT_NAME.test(name)) {
      return invalid(
        "invalid_client_metadata",
        "client_name is 1 to 64 letters, digits, dots, underscores and hyphens.",
      );
    }
    const permanent = metadata.deploymentType === "production";
    if (permanent && !key.permanent) {
      return invalid("invalid_client_metadata", "This key cannot register a production client.");
    }
    const broker = yield* BrokerConfig;
    const enrollment = [...new Set(metadata.connectors ?? broker.configured)].sort();
    if (enrollment.length === 0 || !enrollment.every((name) => broker.configured.includes(name))) {
      return invalidConnectors(broker.configured);
    }
    const credentials = yield* newClientCredentials;
    const client = {
      key: key.name,
      name,
      softwareId: metadata.softwareId,
      softwareVersion: metadata.softwareVersion,
      registrationTokenHash: credentials.registrationTokenHash,
      enrollment,
    };
    const { createdAt } = yield* command("stack.createClient", {
      clientId: credentials.clientId,
      secretHash: credentials.secretHash,
      tokenEndpointAuthMethod: metadata.tokenEndpointAuthMethod,
      redirectUris: metadata.redirectUris,
      permanent,
      client,
      configured: broker.configured,
      connections: key.connections,
    });
    return json(
      newClient({ issuer: broker.issuer, terms: broker.service?.terms }, credentials, {
        createdAt,
        redirectUris: metadata.redirectUris,
        clientName: name,
        softwareId: metadata.softwareId,
        softwareVersion: metadata.softwareVersion,
        tokenEndpointAuthMethod: metadata.tokenEndpointAuthMethod,
        connectors: enrollment,
      }),
      201,
    );
  });

/** `GET <prefix>/register/<client>`: a deploy of a client reads it, which renews it. */
const readClient = (settings: Readonly<Record<string, Key>>) =>
  Effect.fn("stack.readClient")(function* (request: Request) {
    const target = yield* managementRequest(request);
    if (target instanceof Response) {
      return target;
    }
    const broker = yield* BrokerConfig;
    const result = yield* command("stack.renew", {
      clientId: target.clientId,
      registrationTokenHash: target.registrationTokenHash,
      keys: (yield* configuredKeys(settings)).map((key) => ({
        name: key.name,
        connections: key.connections,
      })),
      configured: broker.configured,
    });
    if (!result.ok) {
      // RFC 7592 section 2.1: a client that is gone answers 401, one that may not read answers 403.
      switch (result.error) {
        case "invalid_token":
          return invalidToken();
        case "suspended":
          return insufficientScope("This client is suspended.");
        case "withdrawn":
          return insufficientScope("The key of this client is withdrawn.");
        default:
          return result.error satisfies never;
      }
    }
    return readAnswer(
      {
        issuer: broker.issuer,
        clientId: target.clientId,
        createdAt: result.createdAt,
        redirectUris: result.redirectUris,
        clientName: result.client.name,
        softwareId: result.client.softwareId,
        softwareVersion: result.client.softwareVersion,
        tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
        connectors: result.client.enrollment,
      },
      target.token,
    );
  });

/** `DELETE <prefix>/register/<client>`: a temporary client deletes itself. */
const deleteClient = Effect.fn("stack.deleteClient")(function* (request: Request) {
  const target = yield* managementRequest(request);
  if (target instanceof Response) {
    return target;
  }
  const result = yield* command("stack.remove", {
    clientId: target.clientId,
    registrationTokenHash: target.registrationTokenHash,
  });
  if (!result.ok) {
    return result.error === "permanent"
      ? insufficientScope("A production client cannot delete itself.")
      : invalidToken();
  }
  return new Response(null, { status: 204 });
});

/**
 * The stack layer as a broker's one registration layer: its routes with its keys by name, and its
 * gates. The name is the card's budget and gate: `stack:<name>`. That gate is live while the broker
 * has the key of that name, so a key removed from the settings refuses every sign-in step of its
 * clients.
 */
export const keys = (settings: Readonly<Record<string, Key>>): PrivateRegistration => ({
  routes: [
    {
      method: "POST",
      path: "/register",
      match: "exact",
      template: "/register",
      handler: registerClient(settings),
    },
    {
      method: "GET",
      path: "/register/",
      match: "prefix",
      template: "/register/{client}",
      handler: readClient(settings),
    },
    {
      method: "DELETE",
      path: "/register/",
      match: "prefix",
      template: "/register/{client}",
      handler: deleteClient,
    },
    {
      method: "PUT",
      path: "/register/",
      match: "prefix",
      template: "/register/{client}",
      handler: updateClient,
    },
  ],
  liveGates: Effect.suspend(() => configuredKeys(settings)).pipe(
    Effect.map((keys) => [{ prefix: keyRef(""), live: keys.map((key) => keyRef(key.name)) }]),
  ),
});
