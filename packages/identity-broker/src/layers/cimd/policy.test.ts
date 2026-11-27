// The policy of the CIMD layer (design section C.1): one test for each rule, with documents as
// data, and what the layer does with three real documents.
import { describe, expect, test } from "vite-plus/test";
import { checkDocument } from "../../cimd/reader.ts";
import { acceptDocument, hostRefusal, readClientId } from "./policy.ts";

const ID = "https://app.example.com/oauth-client.json";
const BROKER_ORIGIN = "https://auth.example.com";

/** The id, read; a test of a document needs a good one. */
const idOf = (raw: string) => {
  const id = readClientId(raw);
  if (id._tag !== "ClientId") {
    throw new Error(`Not a client id of the layer: ${id.code}`);
  }
  return id;
};

/** What the layer takes of `document`, as the document of `id`. */
const accept = (document: Record<string, unknown>, id = ID) => {
  const checked = checkDocument(id, { client_id: id, ...document });
  if (checked._tag !== "Checked") {
    throw new Error(`The reader refused the document: ${checked.code}`);
  }
  return acceptDocument(idOf(id), checked);
};

const refusalOf = (raw: string) => {
  const id = readClientId(raw);
  return id._tag === "Refused" ? id.code : undefined;
};

describe("the client id", () => {
  test("is at most 255 characters", () => {
    const base = "https://app.example.com/";
    expect(refusalOf(base + "a".repeat(255 - base.length))).toBeUndefined();
    expect(refusalOf(base + "a".repeat(256 - base.length))).toBe("client_id_too_long");
  });

  test("has no query", () => {
    expect(refusalOf(`${ID}?v=1`)).toBe("client_id_query");
  });

  test("names no port, not even 443", () => {
    expect(refusalOf("https://app.example.com:8443/client.json")).toBe("client_id_port");
    expect(refusalOf("https://app.example.com:443/client.json")).toBe("client_id_port");
  });

  test("has a DNS name for its host: no IP address and no localhost name", () => {
    expect(refusalOf("https://93.184.215.14/client.json")).toBe("client_id_not_dns_name");
    expect(refusalOf("https://[2606:2800:21f:cb07:6820:80da:af6b:8b2c]/client.json")).toBe(
      "client_id_not_dns_name",
    );
    expect(refusalOf("https://localhost/client.json")).toBe("client_id_not_dns_name");
    expect(refusalOf("https://app.localhost/client.json")).toBe("client_id_not_dns_name");
  });

  test("is refused by the reader's rules first", () => {
    expect(refusalOf("http://app.example.com/client.json")).toBe("client_id_not_https");
  });

  test("has a host in `hosts` when `hosts` is given: `*.` matches one or more labels", () => {
    const hosts = ["app.example.com", "*.previews.example.com"];
    const refusal = (raw: string, given: ReadonlyArray<string> | undefined) =>
      hostRefusal(idOf(raw), { hosts: given, brokerOrigin: BROKER_ORIGIN });
    expect(refusal(ID, hosts)).toBeUndefined();
    expect(refusal("https://pr-1.previews.example.com/c.json", hosts)).toBeUndefined();
    expect(refusal("https://a.pr-1.previews.example.com/c.json", hosts)).toBeUndefined();
    expect(refusal("https://previews.example.com/c.json", hosts)).toBe("host_not_allowed");
    expect(refusal("https://evilpreviews.example.com/c.json", hosts)).toBe("host_not_allowed");
    expect(refusal("https://other.example.com/c.json", hosts)).toBe("host_not_allowed");
    expect(refusal("https://other.example.com/c.json", undefined)).toBeUndefined();
    expect(refusal("https://other.example.com/c.json", [])).toBe("host_not_allowed");
  });

  test("is not on the broker's own origin", () => {
    expect(
      hostRefusal(idOf(`${BROKER_ORIGIN}/client.json`), {
        hosts: undefined,
        brokerOrigin: BROKER_ORIGIN,
      }),
    ).toBe("broker_origin");
  });
});

describe("the document", () => {
  const redirect = "https://app.example.com/auth/callback";

  test("offers the method none; keys of another method beside it are ignored", () => {
    expect(
      accept({ redirect_uris: [redirect], token_endpoint_auth_method: "private_key_jwt" }),
    ).toEqual({ _tag: "Refused", code: "no_none_method" });
    expect(
      accept({
        redirect_uris: [redirect],
        token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
        jwks_uri: "https://app.example.com/jwks.json",
      }),
    ).toEqual({ _tag: "Accepted", redirectUris: [redirect] });
  });

  test("has the grant type authorization_code, by default too", () => {
    expect(accept({ redirect_uris: [redirect], grant_types: ["refresh_token"] })).toEqual({
      _tag: "Refused",
      code: "no_code_grant",
    });
    expect(accept({ redirect_uris: [redirect] })).toEqual({
      _tag: "Accepted",
      redirectUris: [redirect],
    });
  });

  test("has the response type code", () => {
    expect(accept({ redirect_uris: [redirect], response_types: ["id_token"] })).toEqual({
      _tag: "Refused",
      code: "no_code_response",
    });
  });

  test("of the redirect URIs, only https ones on the id's origin that the broker's rule takes are kept", () => {
    expect(
      accept({
        redirect_uris: [
          "https://app.example.com/b",
          "https://app.example.com/a",
          "https://app.example.com/a",
          // A loopback address, another origin, plain http, another port, an OAuth response
          // parameter in the query, and user info.
          "http://127.0.0.1:8080/callback",
          "https://other.example.com/callback",
          "http://app.example.com/callback",
          "https://app.example.com:8443/callback",
          "https://app.example.com/callback?code=1",
          "https://user@app.example.com/callback",
        ],
      }),
    ).toEqual({
      _tag: "Accepted",
      redirectUris: ["https://app.example.com/a", "https://app.example.com/b"],
    });
  });

  test("keeps 1 to 8 redirect URIs", () => {
    const uris = (count: number) =>
      Array.from({ length: count }, (_, index) => `https://app.example.com/cb${index}`);
    expect(accept({ redirect_uris: ["https://other.example.com/cb"] })).toEqual({
      _tag: "Refused",
      code: "no_redirect_uri",
    });
    expect(accept({ redirect_uris: uris(8) })).toMatchObject({ _tag: "Accepted" });
    expect(accept({ redirect_uris: uris(9) })).toEqual({
      _tag: "Refused",
      code: "too_many_redirect_uris",
    });
  });
});

// The documents of the reader's tests (src/cimd/reader.test.ts, "checkDocument: real documents").
describe("real documents", () => {
  test("ChatGPT signs in as a none client on its own origin; its key method is ignored", () => {
    const id = "https://chatgpt.com/oauth/IbUR3zxyNQ16/client.json";
    expect(
      accept(
        {
          client_uri: "https://chatgpt.com/",
          client_name: "ChatGPT",
          logo_uri: "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
          redirect_uris: ["https://chatgpt.com/connector/oauth/IbUR3zxyNQ16"],
          token_endpoint_auth_method: "private_key_jwt",
          token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
          token_endpoint_auth_signing_alg: "RS256",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          jwks_uri: "https://chatgpt.com/oauth/jwks.json",
        },
        id,
      ),
    ).toEqual({
      _tag: "Accepted",
      redirectUris: ["https://chatgpt.com/connector/oauth/IbUR3zxyNQ16"],
    });
  });

  test("Claude signs in; the grant types that the broker does not have are ignored", () => {
    const id = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    expect(
      accept(
        {
          client_name: "Claude",
          client_uri: "https://claude.ai",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          token_endpoint_auth_method: "none",
          grant_types: [
            "authorization_code",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
          ],
          response_types: ["code"],
        },
        id,
      ),
    ).toEqual({ _tag: "Accepted", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
  });

  test("Claude Code is refused: it has only loopback redirect URIs", () => {
    const id = "https://claude.ai/oauth/claude-code-client-metadata";
    expect(
      accept(
        {
          client_name: "Claude Code",
          redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
          token_endpoint_auth_method: "none",
        },
        id,
      ),
    ).toEqual({ _tag: "Refused", code: "no_redirect_uri" });
  });
});
