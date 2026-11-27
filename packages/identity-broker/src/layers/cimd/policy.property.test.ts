// Properties of the layer's policy over generated ids, documents and `hosts` patterns, each stated
// from the README ("Sign in with a Client ID Metadata Document", "The CIMD layer") and design
// section C.1. No expected value comes from the policy itself.
import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";
import { checkDocument } from "../../cimd/reader.ts";
import { acceptDocument, hostMatches, hostRefusal, readClientId } from "./policy.ts";

const RUNS = { numRuns: 400, seed: 2_0901 };
/** The parameters of an authorization response (RFC 6749 section 4.1.2, RFC 9207). */
const RESPONSE_PARAMETERS = ["code", "state", "iss", "error", "error_description", "error_uri"];

// Few labels, so that hosts and patterns often share labels and suffixes.
const label = fc.constantFrom("a", "b", "ab", "ba", "x-y", "app", "example", "com");
const dnsHost = fc.array(label, { minLength: 1, maxLength: 4 }).map((labels) => labels.join("."));
/** `host`, with some letters in upper case. */
const anyCase = (host: string) =>
  fc.array(fc.boolean(), { minLength: host.length, maxLength: host.length }).map((upper) =>
    host
      .split("")
      .map((c, i) => (upper[i] ? c.toUpperCase() : c))
      .join(""),
  );
/** Mostly `usual`, sometimes one of `odd`. */
const mostly = <A>(usual: fc.Arbitrary<A>, ...odd: ReadonlyArray<A>) =>
  fc.oneof({ weight: 8, arbitrary: usual }, { weight: 1, arbitrary: fc.constantFrom(...odd) });

const clientIdText = fc
  .tuple(
    mostly(
      dnsHost,
      "127.0.0.1",
      "1.2.3.4",
      "[2606:4700::1]",
      "localhost",
      "app.localhost",
      "app.example.com.",
    ),
    fc.boolean(),
    mostly(fc.constant(""), ":443", ":8443"),
    fc.oneof(
      { weight: 8, arbitrary: fc.constantFrom("/oauth-client.json", "/c", "/a/b.json") },
      { weight: 1, arbitrary: fc.integer({ min: 200, max: 280 }).map((n) => `/${"p".repeat(n)}`) },
    ),
    mostly(fc.constant(""), "?x=1", "?"),
  )
  .chain(([host, upper, port, path, query]) =>
    (upper ? anyCase(host) : fc.constant(host)).map((h) => `https://${h}${port}${path}${query}`),
  );

/** Return addresses near the origin of a client id on `host`: same origin, look-alikes, and other kinds. */
const redirectUri = (host: string) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.nat({ max: 11 }).map((n) => `https://${host}/cb${n}`) },
    {
      weight: 3,
      arbitrary: fc.constantFrom(
        `https://${host.toUpperCase()}/cb`,
        `HTTPS://${host}/cb`,
        `https://${host}:443/cb`,
        `https://${host}:8443/cb`,
        `http://${host}/cb`,
        `https://${host}./cb`,
        `https://${host}.evil.example/cb`,
        `https://evil.${host}/cb`,
        `https://evil${host}/cb`,
        `https://u@${host}/cb`,
        `https://:@${host}/cb`,
        `https://${host}/cb?code=1`,
        `https://${host}/cb?state=x`,
        `https://${host}/cb?iss=x`,
        `https://${host}/cb?c%6Fde=1`,
        `https://${host}/cb?x=1`,
        `https:${host}/cb`,
        `https:/${host}/cb`,
        `https:///${host}/cb`,
        `https://${host}/cb#`,
        `https://other.example/cb`,
        "http://127.0.0.1/cb",
        "http://localhost:3000/cb",
        "com.example.app:/cb",
      ),
    },
  );

/** A client id that the policy takes, and a document of it that the reader takes. */
const checkedClient = clientIdText
  .map(readClientId)
  .filter((id) => id._tag === "ClientId")
  .chain((id) =>
    fc
      .record(
        {
          redirect_uris: fc.array(redirectUri(id.hostname), { maxLength: 12 }),
          token_endpoint_auth_methods_supported: fc.subarray(["none", "private_key_jwt"], {
            minLength: 1,
          }),
          grant_types: fc.subarray(["authorization_code", "refresh_token"]),
          response_types: fc.subarray(["code", "token"]),
          jwks_uri: fc.constant("https://keys.example/jwks.json"),
        },
        { requiredKeys: ["redirect_uris"] },
      )
      .map((members) => ({ id, json: { client_id: id.id, ...members } })),
  );

/** Whether a host is a DNS name: labels of letters, digits and hyphens, and a last label that is not a number. */
const isDnsHost = (host: string) =>
  /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host) && !/^\d+$/.test(host.split(".").at(-1) ?? "");

describe("acceptDocument and readClientId: README and design section C.1", () => {
  test("an accepted client has an id of at most 255 characters with no query and no port on a DNS name that is not localhost, with its scheme and host in lower case, offers none and the code flow, and has 1 to 8 distinct return addresses, each https on the origin of its id, listed in its document as written, with no user info, no fragment and no authorization response parameter", () => {
    let accepted = 0;
    fc.assert(
      fc.property(checkedClient, ({ id, json }) => {
        const checked = checkDocument(id.id, json);
        if (checked._tag !== "Checked") {
          return;
        }
        const result = acceptDocument(id, checked);
        if (result._tag !== "Accepted") {
          return;
        }
        accepted += 1;
        const origin = new URL(id.id);
        expect(id.id.length).toBeLessThanOrEqual(255);
        expect(id.id).not.toContain("?");
        expect(id.id.slice("https://".length).split("/")[0]).not.toContain(":");
        expect(isDnsHost(origin.hostname)).toBe(true);
        expect(id.id.startsWith(`https://${id.id.slice(8).split("/")[0]?.toLowerCase()}/`)).toBe(
          true,
        );
        expect(origin.hostname === "localhost" || origin.hostname.endsWith(".localhost")).toBe(
          false,
        );

        expect(json.token_endpoint_auth_methods_supported ?? ["none"]).toContain("none");
        expect(json.grant_types ?? ["authorization_code"]).toContain("authorization_code");
        expect(json.response_types ?? ["code"]).toContain("code");

        expect(result.redirectUris.length).toBeGreaterThanOrEqual(1);
        expect(result.redirectUris.length).toBeLessThanOrEqual(8);
        expect(new Set(result.redirectUris).size).toBe(result.redirectUris.length);
        for (const uri of result.redirectUris) {
          const url = new URL(uri);
          expect(json.redirect_uris).toContain(uri);
          expect(url.protocol).toBe("https:");
          expect(url.origin).toBe(origin.origin);
          expect(url.username + url.password).toBe("");
          expect(uri).not.toContain("#");
          for (const name of RESPONSE_PARAMETERS) {
            expect(url.searchParams.has(name)).toBe(false);
          }
        }
      }),
      RUNS,
    );
    expect(accepted).toBeGreaterThan(RUNS.numRuns / 10);
  });
});

/** The rule of the README: a pattern is a host, or `*.` and a host that matches one or more whole labels to its left. */
function matchesByLabels(patterns: ReadonlyArray<string>, host: string) {
  const labels = host.split(".");
  return patterns.some((pattern) => {
    if (!pattern.startsWith("*.")) {
      return pattern === host;
    }
    const suffix = pattern.slice(2).split(".");
    return (
      labels.length > suffix.length &&
      labels.slice(labels.length - suffix.length).every((part, i) => part === suffix[i])
    );
  });
}

const pattern = fc.oneof(
  dnsHost,
  dnsHost.map((host) => `*.${host}`),
);

describe("hosts: README, The CIMD layer", () => {
  test("a host matches only a pattern equal to it, or `*.<suffix>` with one or more whole labels before `.<suffix>`; never by part of a label", () => {
    fc.assert(
      fc.property(fc.array(pattern, { maxLength: 3 }), dnsHost, (patterns, host) => {
        expect(hostMatches(patterns, host)).toBe(matchesByLabels(patterns, host));
      }),
      RUNS,
    );
  });

  test("the layer refuses the host of an id exactly when it matches no pattern of `hosts`", () => {
    const ids = clientIdText.map(readClientId).filter((id) => id._tag === "ClientId");
    fc.assert(
      fc.property(fc.array(pattern, { maxLength: 3 }), ids, (patterns, id) => {
        const refusal = hostRefusal(id, { hosts: patterns, brokerOrigin: "https://broker.test" });
        expect(refusal === "host_not_allowed").toBe(
          !matchesByLabels(patterns, new URL(id.id).hostname),
        );
      }),
      RUNS,
    );
  });
});

describe("broker origin: draft section 10.1", () => {
  test("an id on the broker's own origin is never accepted, whatever the case of the issuer's host, its path, and `hosts`", () => {
    const input = dnsHost.chain((host) =>
      fc.tuple(
        anyCase(host).map((h) => `https://${h}`),
        fc.constantFrom("", "/", ":443", ":443/", "/issuer"),
        // An id with upper case in its scheme or host is refused before (`readClientId`).
        clientIdText.map((text) => text.replace(/^https:\/\/[^/?]*/, `https://${host}`)),
        fc.option(
          fc.constantFrom([host], [`*.${host.split(".").slice(1).join(".") || "com"}`], ["*.com"]),
          { nil: undefined },
        ),
      ),
    );
    let checked = 0;
    fc.assert(
      fc.property(input, ([issuer, issuerTail, text, hosts]) => {
        const id = readClientId(text);
        if (id._tag !== "ClientId") {
          return;
        }
        const brokerOrigin = new URL(`${issuer}${issuerTail}`).origin;
        if (new URL(id.id).origin !== brokerOrigin) {
          return;
        }
        checked += 1;
        expect(hostRefusal(id, { hosts, brokerOrigin })).not.toBeUndefined();
      }),
      RUNS,
    );
    expect(checked).toBeGreaterThan(RUNS.numRuns / 4);
  });
});
