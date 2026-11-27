// The Client ID Metadata Document (CIMD) layer: a client whose id is the https address of its
// metadata document (draft-ietf-oauth-client-id-metadata-document-03) signs in with no registration
// and no secret. At `/authorize` the layer reads the document through the core's `Fetch`, checks it
// with the reader of src/cimd/ and its own policy (./policy.ts), and keeps a card while the document
// is fresh. The layer mounts no route.
import { Effect } from "effect";
import {
  checkDocument,
  fetchDocument,
  refusalDescriptions,
  type RefusalCode,
} from "../../cimd/reader.ts";
import { logBrokerEvent } from "../../core/brokerEvents.ts";
import type {
  ClientResolver,
  PrivateRegistration,
  PublicRegistration,
  Registration,
} from "../../core/router.ts";
import { BrokerConfig, Fetch } from "../../core/services.ts";
import { isDnsName } from "../clientRegistration.ts";
import { command } from "./commands.ts";
import {
  acceptDocument,
  acceptsRedirectUri,
  hostRefusal,
  policyRefusals,
  readClientId,
  type PolicyCode,
} from "./policy.ts";

export type ClientIdMetadataDocumentOptions = {
  /**
   * The hosts whose clients may sign in, such as `["app.example.com", "*.previews.example.com"]`:
   * `*.` matches one or more labels to the left. Without it, any host: the layer is public.
   */
  readonly hosts?: ReadonlyArray<string>;
  /** The connectors of the layer's clients. Default: every configured connector. */
  readonly connectors?: ReadonlyArray<string>;
  /** Fetches of documents for the whole broker. Default: 120 each minute. */
  readonly fetchesPerMinute?: number;
  /** The most clients of one host at a time. Default: 5. */
  readonly clientsPerHost?: number;
  /** New clients for the whole broker. Default: 200 each hour. */
  readonly newClientsPerHour?: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const wholeNumber = (count: number, name: string) => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`clientIdMetadataDocuments: ${name} must be a whole number of 1 or more`);
  }
  return count;
};

/** A bucket that saves at most one period's tokens. */
const perPeriod = (count: number, periodMs: number, name: string) => {
  const rate = wholeNumber(count, name);
  return { rate, periodMs, capacity: rate };
};

const checkPattern = (pattern: string) => {
  if (!isDnsName(pattern.startsWith("*.") ? `x${pattern.slice(1)}` : pattern)) {
    throw new Error(
      `clientIdMetadataDocuments: "${pattern}" is not a host in lower case or *.<host>`,
    );
  }
  return pattern;
};

/** The resolver of the layer, in the order of design section C.2. */
const resolver = (settings: {
  readonly hosts: ReadonlyArray<string> | undefined;
  readonly connectors: ReadonlyArray<string> | undefined;
  readonly fetches: { rate: number; periodMs: number; capacity: number };
  readonly clientsPerHost: number;
  readonly newClients: { rate: number; periodMs: number; capacity: number };
}): ClientResolver =>
  Effect.fn("cimd.resolveClient")(function* (request: {
    readonly clientId: string;
    readonly redirectUri: string;
  }) {
    const id = readClientId(request.clientId);
    if (id._tag === "Refused") {
      return invalid(id.code);
    }
    const { clientId } = request;
    /** A refusal of a valid id, which the broker's operator can act on: its log line. */
    const refused = (code: RefusalCode | PolicyCode | "rate_limited" | "unavailable") =>
      logBrokerEvent({
        event: "sign_in_refused",
        clientId,
        ref: null,
        connector: null,
        reason: `cimd:${code}`,
      });
    const broker = yield* BrokerConfig;
    const policy = hostRefusal(id, {
      hosts: settings.hosts,
      brokerOrigin: new URL(broker.issuer).origin,
    });
    if (policy !== undefined) {
      refused(policy);
      return invalid(policy);
    }
    // An address that no document of this id can give costs no read.
    if (!acceptsRedirectUri(id, request.redirectUri)) {
      refused("redirect_uri_not_listed");
      return invalid("redirect_uri_not_listed");
    }
    const connectors = [
      ...new Set(
        (settings.connectors ?? broker.configured).filter((name) =>
          broker.configured.includes(name),
        ),
      ),
    ].sort();
    const begun = yield* command("cimd.begin", {
      clientId,
      redirectUri: request.redirectUri,
      connectors,
      fetches: settings.fetches,
    });
    switch (begun.next) {
      case "fresh":
        return undefined;
      case "stopped":
        refused("host_blocked");
        return invalid("host_blocked");
      case "rate_limited":
        refused("rate_limited");
        return { reason: "rate_limited" } as const;
      case "fetch":
        break;
      default:
        return begun satisfies never;
    }
    const { fetchStartedAt } = begun;
    /** A document that is gone or refused: the card goes, when this fetch is the later one. */
    const gone = Effect.fnUntraced(function* (code: RefusalCode | PolicyCode) {
      yield* command("cimd.remove", { clientId, fetchStartedAt });
      refused(code);
      return invalid(code);
    });
    const fetched = yield* fetchDocument(id, (yield* Fetch).fetch);
    switch (fetched._tag) {
      case "Transient":
        // The card stays; past its freshness it gives no new sign-in, so this one waits.
        refused("unavailable");
        return fetched.retryAfter === undefined
          ? ({ reason: "unavailable" } as const)
          : ({ reason: "unavailable", retryAfter: fetched.retryAfter } as const);
      case "Terminal":
        return yield* gone(fetched.code);
      case "Document":
        break;
      default:
        return fetched satisfies never;
    }
    const checked = checkDocument(clientId, fetched.json);
    if (checked._tag === "Refused") {
      return yield* gone(checked.code);
    }
    const accepted = acceptDocument(id, checked);
    if (accepted._tag === "Refused") {
      return yield* gone(accepted.code);
    }
    const put = yield* command("cimd.put", {
      clientId,
      redirectUri: request.redirectUri,
      fetchStartedAt,
      freshUntil: fetched.freshUntil,
      redirectUris: accepted.redirectUris,
      connectors,
      clientsPerHost: settings.clientsPerHost,
      newClients: settings.newClients,
    });
    switch (put) {
      case "inserted":
      case "replaced":
      // A later fetch wrote the card: the core reads it and checks the address on it.
      case "older":
        return undefined;
      case "stopped":
        refused("host_blocked");
        return invalid("host_blocked");
      case "rate_limited":
        refused("rate_limited");
        return { reason: "rate_limited" } as const;
      case "not_listed":
        refused("redirect_uri_not_listed");
        return invalid("redirect_uri_not_listed");
      default:
        return put satisfies never;
    }
  });

const descriptions: Record<RefusalCode | PolicyCode, string> = {
  ...refusalDescriptions,
  ...policyRefusals,
};

const invalid = (code: RefusalCode | PolicyCode) =>
  ({ reason: "invalid", description: descriptions[code] }) as const;

/**
 * The CIMD layer, beside another layer or alone. With `hosts`, only clients of those hosts;
 * without it, the clients of any host, so the layer is public and the broker needs its `service`.
 */
export function clientIdMetadataDocuments(
  options: ClientIdMetadataDocumentOptions & { readonly hosts: ReadonlyArray<string> },
): PrivateRegistration;
export function clientIdMetadataDocuments(
  options?: ClientIdMetadataDocumentOptions,
): PublicRegistration;
export function clientIdMetadataDocuments(
  options: ClientIdMetadataDocumentOptions = {},
): Registration {
  const resolveClient = resolver({
    hosts: options.hosts?.map(checkPattern),
    connectors: options.connectors,
    fetches: perPeriod(options.fetchesPerMinute ?? 120, MINUTE_MS, "fetchesPerMinute"),
    clientsPerHost: wholeNumber(options.clientsPerHost ?? 5, "clientsPerHost"),
    newClients: perPeriod(options.newClientsPerHour ?? 200, HOUR_MS, "newClientsPerHour"),
  });
  const moderation = { layer: "cimd" } as const;
  return options.hosts === undefined
    ? { routes: [], resolveClient, public: true, moderation }
    : { routes: [], resolveClient, moderation };
}
