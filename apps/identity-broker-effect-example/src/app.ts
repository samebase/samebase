// The app's routes: the home page, sign-in with Google through the identity hub, sign-out, and the
// file that the hub reads before it registers this deployment's client.
//
// No page and no log line holds a token, a code, a secret, or a URL with its query: the callback
// URL carries the code. A failed sign-in logs only its route and a fixed category.
import { Duration, Effect, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import {
  type AnswerWithoutIssuer,
  HubClient,
  type HubError,
  type NoAuthorizationEndpoint,
  type NoIdToken,
  PendingSignIn,
  User,
} from "./hub-client.ts";
import { Session } from "./session.ts";

/** The numeric GitHub id of samebase/samebase, which the verification file names. */
const REPOSITORY_ID = "1021726325";
/** The hub sign-in has this long, from /login to /callback. */
const SIGN_IN_TTL = Duration.minutes(10);
/** A session lasts this long. */
const SESSION_TTL = Duration.hours(24);

const SESSION_COOKIE = "__Host-session";
const SIGN_IN_COOKIE = "__Host-sign-in";

const SessionCookie = Schema.Struct({ ...User.fields, exp: Schema.Number });
const SignInCookie = Schema.Struct({ ...PendingSignIn.fields, exp: Schema.Number });

/** The sign-in cookie is missing, expired, or from another browser. */
class SignInExpired extends Schema.TaggedError<SignInExpired>()("SignInExpired", {}) {}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "Referrer-Policy": "no-referrer",
};

/** `__Host-` cookies must have Secure and Path=/, and no Domain. */
const COOKIE = { path: "/", httpOnly: true, secure: true, sameSite: "lax" } as const;

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** A page whose `body` is HTML that the caller escaped. */
const page = (status: number, body: string) =>
  HttpServerResponse.text(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Identity hub example</title></head><body>${body}</body></html>`,
    { status, contentType: "text/html; charset=utf-8", headers: SECURITY_HEADERS },
  );

const redirect = (location: string) =>
  HttpServerResponse.redirect(location, { headers: SECURITY_HEADERS });

const NOT_CONFIGURED = "<p>Sign-in is not configured.</p>";

const home = Effect.gen(function* () {
  const hub = yield* HubClient;
  if (!(yield* hub.configured)) return page(200, NOT_CONFIGURED);
  const request = yield* HttpServerRequest;
  const session = yield* Session;
  const user = yield* session.unseal("session", SessionCookie, request.cookies[SESSION_COOKIE]);
  return Option.match(user, {
    onNone: () => page(200, '<p><a href="/login">Sign in with Google</a></p>'),
    onSome: (user) =>
      page(
        200,
        `<dl><dt>Subject</dt><dd>${escapeHtml(user.sub)}</dd><dt>Email</dt><dd>${escapeHtml(user.email ?? "")}</dd><dt>Name</dt><dd>${escapeHtml(user.name ?? "")}</dd></dl><p><a href="/logout">Sign out</a></p>`,
      ),
  });
});

const login = Effect.fn("login")(function* (url: URL) {
  const hub = yield* HubClient;
  const session = yield* Session;
  const { url: authorize, pending } = yield* hub.start(`${url.origin}/callback`);
  const value = yield* session.seal("sign-in", pending, SIGN_IN_TTL);
  return redirect(authorize).pipe(
    HttpServerResponse.setCookieUnsafe(SIGN_IN_COOKIE, value, { ...COOKIE, maxAge: SIGN_IN_TTL }),
  );
});

const callback = Effect.fn("callback")(function* (url: URL) {
  const request = yield* HttpServerRequest;
  const hub = yield* HubClient;
  const session = yield* Session;
  const pending = yield* session.unseal("sign-in", SignInCookie, request.cookies[SIGN_IN_COOKIE]);
  if (Option.isNone(pending)) return yield* new SignInExpired();
  const user = yield* hub.finish(url, `${url.origin}/callback`, pending.value);
  const value = yield* session.seal("session", user, SESSION_TTL);
  return redirect("/").pipe(
    HttpServerResponse.setCookieUnsafe(SESSION_COOKIE, value, { ...COOKIE, maxAge: SESSION_TTL }),
    HttpServerResponse.expireCookieUnsafe(SIGN_IN_COOKIE, COOKIE),
  );
});

/** The page of a failed sign-in: a fixed reason, and the sign-in cookie cleared. */
const failed = Effect.fnUntraced(function* (
  route: string,
  status: number,
  reason: string,
  category: string,
) {
  yield* Effect.logError("sign_in_failed").pipe(Effect.annotateLogs({ route, category }));
  return page(status, `<p>${escapeHtml(reason)}</p><p><a href="/">Back</a></p>`).pipe(
    HttpServerResponse.expireCookieUnsafe(SIGN_IN_COOKIE, COOKIE),
  );
});

/** /login or /callback, with each failure as its page. */
const signIn = (
  route: "/login" | "/callback",
  attempt: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    SignInExpired | HubError | AnswerWithoutIssuer | NoAuthorizationEndpoint | NoIdToken,
    HttpServerRequest | HubClient | Session
  >,
) =>
  attempt.pipe(
    Effect.catchTags({
      SignInExpired: () =>
        failed(route, 400, "The sign-in expired or started in another browser.", "sign_in"),
      AnswerWithoutIssuer: () =>
        failed(route, 400, "The answer does not name the identity hub.", "sign_in"),
      NoAuthorizationEndpoint: () =>
        failed(route, 502, "The identity hub names no authorization endpoint.", "sign_in"),
      NoIdToken: () => failed(route, 502, "The identity hub gave no ID token.", "sign_in"),
      HubDeclined: () => failed(route, 400, "The identity hub did not sign you in.", "refused"),
      HubAnswerRejected: (error) =>
        failed(
          route,
          502,
          "The identity hub gave an answer that the app cannot accept.",
          error.code,
        ),
      TokenRefused: () => failed(route, 502, "The identity hub refused the sign-in.", "token"),
      HubUnreachable: () => failed(route, 502, "The identity hub could not be reached.", "other"),
    }),
  );

/** The app's request handler. */
export const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest;
  if (request.method !== "GET") return page(405, "<p>Method not allowed.</p>");
  const url = new URL(request.originalUrl);
  switch (url.pathname) {
    case "/":
      return yield* home;
    case "/samebase-verification.json":
      return HttpServerResponse.jsonUnsafe(
        { repository: REPOSITORY_ID },
        { headers: SECURITY_HEADERS },
      );
    case "/logout":
      return redirect("/").pipe(HttpServerResponse.expireCookieUnsafe(SESSION_COOKIE, COOKIE));
    case "/login":
    case "/callback": {
      const hub = yield* HubClient;
      if (!(yield* hub.configured)) return page(503, NOT_CONFIGURED);
      return yield* url.pathname === "/login"
        ? signIn(url.pathname, login(url))
        : signIn(url.pathname, callback(url));
    }
    default:
      return page(404, "<p>Not found.</p>");
  }
});
