// The metadata layer: a client whose id is the https address of its metadata document
// (draft-ietf-oauth-client-id-metadata-document-03) signs in with no registration and no secret.
// At `/authorize` the layer reads the document through the core's `Fetch`, checks it with the
// reader of src/cimd/ and its own policy (./policy.ts), and keeps a card while the document is
// fresh. The layer mounts no route.
import { Effect } from "effect";
import { checkDocument, fetchDocument, refusals, type RefusalCode } from "../../cimd/reader.ts";
import { logBrokerEvent } from "../../core/brokerEvents.ts";
import type { PublicRegistration, Registration, Resolve } from "../../core/router.ts";
import { BrokerConfig, Fetch } from "../../core/services.ts";
import { isDnsName } from "../clientRegistration.ts";
import { command } from "./commands.ts";
import {
  acceptDocument,
  policyRefusals,
  readSiteClientId,
  siteRefusal,
  type PolicyCode,
} from "./policy.ts";

export type MetadataOptions = {
  /**
   * The hosts whose clients may sign in, such as `["app.example.com", "*.previews.example.com"]`:
   * `*.` matches one or more labels to the left. Without it, any host: the layer is public.
   */
  readonly hosts?: ReadonlyArray<string>;
  /** The connectors of the layer's clients. Default: every configured connector. */
  readonly connectors?: ReadonlyArray<string>;
  /** Fetches of documents for the whole broker. Default: 120 each minute. */
  readonly fetchesPerMinute?: number;
  /** New cards for the whole broker. Default: 30 each hour. */
  readonly newCardsPerHour?: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** A bucket that saves at most one period's tokens. */
const perPeriod = (count: number, periodMs: number, name: string) => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`metadataDocuments: ${name} must be a whole number of 1 or more`);
  }
  return { rate: count, periodMs, capacity: count };
};

const checkPattern = (pattern: string) => {
  if (!isDnsName(pattern.startsWith("*.") ? `x${pattern.slice(1)}` : pattern)) {
    throw new Error(`metadataDocuments: "${pattern}" is not a host in lower case or *.<host>`);
  }
  return pattern;
};

/** The resolver of the layer, in the order of design section C.2. */
const resolver = (settings: {
  readonly hosts: ReadonlyArray<string> | undefined;
  readonly connectors: ReadonlyArray<string> | undefined;
  readonly fetches: { rate: number; periodMs: number; capacity: number };
  readonly newCards: { rate: number; periodMs: number; capacity: number };
}): Resolve =>
  Effect.fn("metadata.resolve")(function* (request: {
    readonly clientId: string;
    readonly redirectUri: string;
  }) {
    const id = readSiteClientId(request.clientId);
    if (id._tag === "Refused") {
      return invalid(id.code);
    }
    const { clientId } = request;
    /** A refusal of a valid id, which the broker's operator can act on: its log line. */
    const refused = (code: RefusalCode | PolicyCode | "limited" | "unavailable") =>
      logBrokerEvent({
        event: "sign_in_refused",
        clientId,
        ref: null,
        connector: null,
        reason: `metadata:${code}`,
      });
    const broker = yield* BrokerConfig;
    const policy = siteRefusal(id, {
      hosts: settings.hosts,
      brokerOrigin: new URL(broker.issuer).origin,
    });
    if (policy !== undefined) {
      refused(policy);
      return invalid(policy);
    }
    const connectors = [
      ...new Set(
        (settings.connectors ?? broker.configured).filter((name) =>
          broker.configured.includes(name),
        ),
      ),
    ].sort();
    const begun = yield* command("metadata.begin", {
      clientId,
      redirectUri: request.redirectUri,
      connectors,
      fetches: settings.fetches,
    });
    switch (begun.next) {
      case "fresh":
        return undefined;
      case "stopped":
        refused("stopped");
        return invalid("stopped");
      case "limited":
        refused("limited");
        return { refusal: "limited" } as const;
      case "fetch":
        break;
      default:
        return begun satisfies never;
    }
    const { fetchStartedAt } = begun;
    /** A document that is gone or refused: the card goes, when this fetch is the later one. */
    const gone = Effect.fnUntraced(function* (code: RefusalCode | PolicyCode) {
      yield* command("metadata.remove", { clientId, fetchStartedAt });
      refused(code);
      return invalid(code);
    });
    const fetched = yield* fetchDocument(id, (yield* Fetch).fetch);
    switch (fetched._tag) {
      case "Transient":
        // The card stays; past its freshness it gives no new sign-in, so this one waits.
        refused("unavailable");
        return fetched.retryAfter === undefined
          ? ({ refusal: "unavailable" } as const)
          : ({ refusal: "unavailable", retryAfter: fetched.retryAfter } as const);
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
    // An address that the document does not list stores nothing.
    if (!accepted.redirectUris.includes(request.redirectUri)) {
      refused("redirect_uri_not_listed");
      return invalid("redirect_uri_not_listed");
    }
    const put = yield* command("metadata.put", {
      clientId,
      fetchStartedAt,
      freshUntil: fetched.freshUntil,
      redirectUris: accepted.redirectUris,
      connectors,
      newCards: settings.newCards,
    });
    switch (put) {
      case "inserted":
      case "replaced":
      // A later fetch wrote the card: the core reads it and checks the address on it.
      case "older":
        return undefined;
      case "stopped":
        refused("stopped");
        return invalid("stopped");
      case "limited":
        refused("limited");
        return { refusal: "limited" } as const;
      default:
        return put satisfies never;
    }
  });

const descriptions: Record<RefusalCode | PolicyCode, string> = { ...refusals, ...policyRefusals };

const invalid = (code: RefusalCode | PolicyCode) =>
  ({ refusal: "invalid", description: descriptions[code] }) as const;

/**
 * The metadata layer, beside another layer or alone. With `hosts`, only clients of those hosts;
 * without it, the clients of any site, so the layer is public and the broker needs its `service`.
 */
export function metadataDocuments(
  options: MetadataOptions & { readonly hosts: ReadonlyArray<string> },
): Registration;
export function metadataDocuments(options?: MetadataOptions): PublicRegistration;
export function metadataDocuments(options: MetadataOptions = {}): Registration {
  const resolve = resolver({
    hosts: options.hosts?.map(checkPattern),
    connectors: options.connectors,
    fetches: perPeriod(options.fetchesPerMinute ?? 120, MINUTE_MS, "fetchesPerMinute"),
    newCards: perPeriod(options.newCardsPerHour ?? 30, HOUR_MS, "newCardsPerHour"),
  });
  return options.hosts === undefined
    ? { routes: [], resolve, public: true }
    : { routes: [], resolve };
}
