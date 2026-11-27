import { describe, expect, test } from "vite-plus/test";
import {
  parseRedirectUri,
  readClientAuthentication,
  validateAuthorizeRest,
  validateAuthorizeTarget,
  validateTokenRequest,
} from "./protocol.ts";

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("redirect URIs", () => {
  test("https without fragment, or http on loopback", () => {
    expect(parseRedirectUri("https://app.example.com/oauth/broker/callback")).not.toBeNull();
    expect(parseRedirectUri("http://127.0.0.1:3210/oauth/broker/callback")).not.toBeNull();
    expect(parseRedirectUri("http://localhost:3210/cb")).not.toBeNull();
    expect(parseRedirectUri("http://app.example.com/cb")).toBeNull();
    expect(parseRedirectUri("https://app.example.com/cb#frag")).toBeNull();
    expect(parseRedirectUri("not a url")).toBeNull();
  });
});

describe("authorize", () => {
  const base = {
    client_id: "cl_1",
    redirect_uri: "https://app.test/cb",
    response_type: "code",
    scope: "openid email",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
  };

  test("target then rest", () => {
    const params = new URLSearchParams({
      ...base,
      state: "s",
      nonce: "n",
      prompt: "login",
      max_age: "0",
    });
    const target = validateAuthorizeTarget(params);
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    const rest = validateAuthorizeRest(params, target.value);
    expect(rest.ok).toBe(true);
    if (rest.ok) {
      expect(rest.value.prompt).toEqual(["login"]);
      expect(rest.value.maxAge).toBe(0);
      expect(rest.value.scopes).toEqual(["openid", "email"]);
    }
  });

  test("max_age is decimal digits that make a safe integer", () => {
    const target = { clientId: "cl_1", redirectUri: base.redirect_uri };
    const maxAge = (value: string) => {
      const rest = validateAuthorizeRest(new URLSearchParams({ ...base, max_age: value }), target);
      return rest.ok ? rest.value.maxAge : rest.error;
    };
    expect(maxAge("0")).toBe(0);
    expect(maxAge("0300")).toBe(300);
    expect(maxAge("9007199254740991")).toBe(9_007_199_254_740_991);
    for (const value of ["", " 5", "1e3", "0x10", "1.0", "-1", "+1", "9007199254740992"]) {
      expect(maxAge(value)).toBe("invalid_request");
    }
  });

  test("connector is a space-delimited list; an empty value counts as omitted", () => {
    const target = { clientId: "cl_1", redirectUri: base.redirect_uri };
    const connectors = (value: string | undefined) => {
      const params = new URLSearchParams(base);
      if (value !== undefined) params.set("connector", value);
      const rest = validateAuthorizeRest(params, target);
      return rest.ok ? rest.value.connectors : rest.error;
    };
    expect(connectors(undefined)).toEqual([]);
    expect(connectors("")).toEqual([]);
    expect(connectors("   ")).toEqual([]);
    expect(connectors("google")).toEqual(["google"]);
    // `connector=google+github` in a URL: the plus is a space.
    expect(connectors("google github")).toEqual(["google", "github"]);
    expect(connectors(" github  google github ")).toEqual(["github", "google"]);
  });

  test("an https client_id is kept as sent; any other client_id is trimmed", () => {
    const clientId = (value: string) => {
      const target = validateAuthorizeTarget(new URLSearchParams({ ...base, client_id: value }));
      return target.ok ? target.value.clientId : target.error;
    };
    expect(clientId(" cl_1 ")).toBe("cl_1");
    expect(clientId("https://app.test/c.json")).toBe("https://app.test/c.json");
    expect(clientId(" https://app.test/c.json ")).toBe(" https://app.test/c.json ");
  });

  test("a repeated parameter of any name is refused before the target is read", () => {
    for (const name of ["client_id", "redirect_uri", "scope"]) {
      const params = new URLSearchParams(base);
      params.append(name, "again");
      expect(validateAuthorizeTarget(params)).toMatchObject({
        ok: false,
        error: "invalid_request",
        description: "A parameter is repeated.",
      });
    }
  });

  test("errors name the OAuth error code", () => {
    const target = { clientId: "cl_1", redirectUri: base.redirect_uri };
    const noOpenid = validateAuthorizeRest(
      new URLSearchParams({ ...base, scope: "email" }),
      target,
    );
    expect(noOpenid.ok).toBe(false);
    if (!noOpenid.ok) expect(noOpenid.error).toBe("invalid_scope");
    const token = validateAuthorizeRest(
      new URLSearchParams({ ...base, response_type: "token" }),
      target,
    );
    if (!token.ok) expect(token.error).toBe("unsupported_response_type");
    const plain = validateAuthorizeRest(
      new URLSearchParams({ ...base, code_challenge_method: "plain" }),
      target,
    );
    expect(plain.ok).toBe(false);
    const noPkce = new URLSearchParams(base);
    noPkce.delete("code_challenge");
    expect(validateAuthorizeRest(noPkce, target).ok).toBe(false);
    const mixed = validateAuthorizeRest(
      new URLSearchParams({ ...base, prompt: "none login" }),
      target,
    );
    expect(mixed.ok).toBe(false);
    for (const prompt of ["consent", "login select_account"]) {
      expect(validateAuthorizeRest(new URLSearchParams({ ...base, prompt }), target)).toMatchObject(
        {
          ok: false,
          error: "invalid_request",
          description: "prompt value not supported",
        },
      );
    }
  });
});

describe("token", () => {
  test("client credentials from the body or Basic", () => {
    const post = readClientAuthentication(
      null,
      new URLSearchParams({ client_id: "a", client_secret: "b" }),
    );
    expect(post.ok && post.value.method).toBe("client_secret_post");
    expect(readClientAuthentication(`Basic ${btoa("a:b%3Ac")}`, new URLSearchParams())).toEqual({
      ok: true,
      value: { clientId: "a", clientSecret: "b:c", method: "client_secret_basic" },
    });
    expect(readClientAuthentication("Bearer x", new URLSearchParams()).ok).toBe(false);
  });

  test("no authentication: a client_id and no client_secret, or HTTP Basic with an empty password", () => {
    const none = { ok: true, value: { method: "none", clientId: "https://app.test/c.json" } };
    expect(
      readClientAuthentication(null, new URLSearchParams({ client_id: "https://app.test/c.json" })),
    ).toEqual(none);
    // An empty client_secret counts as omitted (RFC 6749 section 3.2).
    expect(
      readClientAuthentication(
        null,
        new URLSearchParams("client_id=https%3A%2F%2Fapp.test%2Fc.json&client_secret="),
      ),
    ).toEqual(none);
    // A public client that sends `client_id:` in Basic has no secret (RFC 7591 `none`).
    expect(
      readClientAuthentication(
        `Basic ${btoa("https%3A%2F%2Fapp.test%2Fc.json:")}`,
        new URLSearchParams(),
      ),
    ).toEqual(none);
    expect(
      readClientAuthentication("Bearer x", new URLSearchParams({ client_id: "a" })),
    ).toMatchObject({ ok: false, status: 401, error: "invalid_client" });
    expect(readClientAuthentication(null, new URLSearchParams())).toMatchObject({
      ok: false,
      status: 401,
      error: "invalid_client",
    });
  });

  test("a client assertion is invalid_client, with or without another method", () => {
    for (const name of ["client_assertion", "client_assertion_type"]) {
      for (const authorization of [null, `Basic ${btoa("a:b")}`]) {
        expect(
          readClientAuthentication(
            authorization,
            new URLSearchParams({ client_id: "a", [name]: "x" }),
          ),
        ).toMatchObject({ ok: false, status: 401, error: "invalid_client" });
      }
    }
  });

  test("one method, no repeated parameter, and a malformed Basic header is invalid_client", () => {
    expect(
      readClientAuthentication(
        `Basic ${btoa("a:b")}`,
        new URLSearchParams({ client_id: "a", client_secret: "b" }),
      ),
    ).toMatchObject({ ok: false, status: 400, error: "invalid_request" });
    // RFC 6749 section 3.2: a parameter without a value is omitted, so this is Basic alone.
    expect(
      readClientAuthentication(`Basic ${btoa("a:b")}`, new URLSearchParams("client_secret=")),
    ).toEqual({
      ok: true,
      value: { clientId: "a", clientSecret: "b", method: "client_secret_basic" },
    });
    expect(
      readClientAuthentication(
        null,
        new URLSearchParams("client_id=a&client_secret=b&code=1&code=2"),
      ),
    ).toMatchObject({ ok: false, status: 400, error: "invalid_request" });
    expect(
      readClientAuthentication(`Basic ${btoa("a:%E0%A4%A")}`, new URLSearchParams()),
    ).toMatchObject({ ok: false, status: 401, error: "invalid_client" });
  });

  test("authorization_code only, with a verifier and the redirect URI", () => {
    const client = { clientId: "a", clientSecret: "b", method: "client_secret_post" as const };
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const request = {
      grant_type: "authorization_code",
      code: "c",
      code_verifier: verifier,
      redirect_uri: "https://app.test/cb",
    };
    const ok = validateTokenRequest(new URLSearchParams(request), client);
    expect(ok.ok).toBe(true);
    const refresh = validateTokenRequest(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: "r" }),
      client,
    );
    expect(refresh.ok).toBe(false);
    if (!refresh.ok) expect(refresh.error).toBe("unsupported_grant_type");
    const short = validateTokenRequest(
      new URLSearchParams({ ...request, code_verifier: "short" }),
      client,
    );
    expect(short.ok).toBe(false);
    // RFC 6749 section 4.1.3: every authorization request here names one, so the exchange must too.
    const { redirect_uri: _, ...withoutRedirect } = request;
    const missing = validateTokenRequest(new URLSearchParams(withoutRedirect), client);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.description).toMatch(/redirect_uri/);
  });
});
