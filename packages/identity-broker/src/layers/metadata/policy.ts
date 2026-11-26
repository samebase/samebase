// The broker's policy for a client by a metadata document ("hosted sign-in on the site's own
// origin"), on what the reader of src/cimd/ gives: which client ids it accepts, and which part of a
// checked document it takes. Each refusal has a fixed code.
import { parseClientId, type CheckedDocument, type ClientId } from "../../cimd/reader.ts";
import { isDnsName, readRedirectUri } from "../clientRegistration.ts";

/** One sentence for each reason why the layer refuses a client that the reader accepts. */
export const policyRefusals = {
  client_id_too_long: "The client ID is longer than 255 characters.",
  client_id_query: "The client ID has a query, which this broker does not accept.",
  client_id_port: "The client ID names a port, which this broker does not accept.",
  client_id_not_dns_name: "The host of the client ID is not a DNS name.",
  host_not_allowed: "This broker does not accept clients of this host.",
  broker_origin: "The client ID is on the broker's own origin.",
  stopped: "The broker's operator stopped sign-in for this site.",
  no_none_method: "The document does not offer the authentication method none.",
  no_code_grant: "The document's grant_types do not include authorization_code.",
  no_code_response: "The document's response_types do not include code.",
  no_redirect_uri: "The document has no https redirect URI on the origin of its client ID.",
  too_many_redirect_uris:
    "The document has more than 8 https redirect URIs on the origin of its client ID.",
  redirect_uri_not_listed: "The redirect_uri is not one that the document permits on this broker.",
} as const;

export type PolicyCode = keyof typeof policyRefusals;

const MAX_CLIENT_ID_LENGTH = 255;
/** The return addresses of one client, as for a registered one (src/layers/clientRegistration.ts). */
const MAX_REDIRECT_URIS = 8;

const refuse = <const Code extends string>(code: Code) => ({ _tag: "Refused", code }) as const;

/**
 * The client id when the reader takes it and this policy's rules of an id do: at most 255
 * characters, no query, no port, and a host that is a DNS name. The rules of `hosts` and of the
 * broker's origin need the layer's settings and are `allowedSite`'s.
 */
export function readSiteClientId(raw: string) {
  if (raw.length > MAX_CLIENT_ID_LENGTH) {
    return refuse("client_id_too_long");
  }
  const id = parseClientId(raw);
  if (id._tag === "Refused") {
    return id;
  }
  if (id.hasQuery) {
    return refuse("client_id_query");
  }
  if (id.hasExplicitPort) {
    return refuse("client_id_port");
  }
  if (!isDnsName(id.host)) {
    return refuse("client_id_not_dns_name");
  }
  return id;
}

/**
 * Whether `host` matches one of `patterns`: a pattern is a host, or `*.` and a host, which matches
 * one or more labels to the left of it.
 */
export const hostMatches = (patterns: ReadonlyArray<string>, host: string) =>
  patterns.some((pattern) =>
    pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern,
  );

/** Undefined when the site of `id` may use the layer, else the code that refuses it. */
export const siteRefusal = (
  id: ClientId,
  settings: { readonly hosts: ReadonlyArray<string> | undefined; readonly brokerOrigin: string },
) =>
  settings.hosts !== undefined && !hostMatches(settings.hosts, id.host)
    ? ("host_not_allowed" as const)
    : id.origin === settings.brokerOrigin
      ? ("broker_origin" as const)
      : undefined;

/**
 * What the layer takes of a checked document of `id`: a `none` client of the code flow (its keys,
 * if any, are ignored), with the redirect URIs that the broker's rule for a return address takes
 * and that are https on the origin of `id`, sorted and unique. The others are ignored; 1 to 8 must
 * be left.
 */
export function acceptDocument(id: ClientId, document: CheckedDocument) {
  if (!document.authMethods.includes("none")) {
    return refuse("no_none_method");
  }
  if (!document.grantTypes.includes("authorization_code")) {
    return refuse("no_code_grant");
  }
  if (!document.responseTypes.includes("code")) {
    return refuse("no_code_response");
  }
  const redirectUris = [
    ...new Set(
      document.redirectUris
        .map(({ uri }) => ({ uri, read: readRedirectUri(uri) }))
        .filter(({ read }) => read !== null && !read.loopback && read.url.origin === id.origin)
        .map(({ uri }) => uri),
    ),
  ].sort();
  if (redirectUris.length === 0) {
    return refuse("no_redirect_uri");
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return refuse("too_many_redirect_uris");
  }
  return { _tag: "Accepted", redirectUris } as const;
}
