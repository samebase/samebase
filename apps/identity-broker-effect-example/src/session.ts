// Signed cookie values: `<payload>.<mac>`, both base64url. The payload is JSON with an `exp` in
// milliseconds; the mac is HMAC-SHA-256 with the session secret over the purpose and the payload,
// so a value made for one cookie is never accepted as another. The values are signed, not
// encrypted: they hold nothing secret from the browser that holds them.
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import { Clock, Context, Duration, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import * as Base64Url from "effect/encoding/Base64Url";

/** The cookie that a value is signed for. */
export type Purpose = "session" | "sign-in";

const encoder = new TextEncoder();

const hmacKey = (secret: Redacted.Redacted<string>) =>
  Effect.promise(() =>
    crypto.subtle.importKey(
      "raw",
      encoder.encode(Redacted.value(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    ),
  );

export class Session extends Context.Service<
  Session,
  {
    /** `payload` with its expiry, signed for `purpose`. */
    seal(
      purpose: Purpose,
      payload: Readonly<Record<string, string>>,
      ttl: Duration.Input,
    ): Effect.Effect<string>;
    /**
     * The payload of `value` when its mac is right for `purpose`, it decodes with `schema`, and
     * its `exp` is after the clock's time. `crypto.subtle.verify` compares the mac in constant
     * time.
     */
    unseal<S extends Schema.ConstraintDecoder<{ readonly exp: number }>>(
      purpose: Purpose,
      schema: S,
      value: string | undefined,
    ): Effect.Effect<Option.Option<S["Type"]>>;
  }
>()("identity-broker-effect-example/Session") {
  /** The service with the secret that `secret` reads. */
  static readonly layerWith = (secret: Effect.Effect<Redacted.Redacted<string>>) => {
    /** The JSON text of `value` when its mac is right for `purpose`. */
    const verified = Effect.fnUntraced(function* (purpose: Purpose, value: string | undefined) {
      const [body, macText, ...rest] = value?.split(".") ?? [];
      if (body === undefined || macText === undefined || rest.length > 0) return Option.none();
      const mac = Base64Url.decode(macText);
      const text = Base64Url.decodeString(body);
      if (Result.isFailure(mac) || Result.isFailure(text)) return Option.none();
      const key = yield* hmacKey(yield* secret);
      const valid = yield* Effect.promise(() =>
        crypto.subtle.verify("HMAC", key, mac.success, encoder.encode(`${purpose}.${body}`)),
      );
      return valid ? Option.some(text.success) : Option.none();
    });

    return Layer.succeed(
      Session,
      Session.of({
        seal: Effect.fn("Session.seal")(function* (purpose, payload, ttl) {
          const exp = (yield* Clock.currentTimeMillis) + Duration.toMillis(ttl);
          const body = Base64Url.encode(JSON.stringify({ ...payload, exp }));
          const key = yield* hmacKey(yield* secret);
          const mac = yield* Effect.promise(() =>
            crypto.subtle.sign("HMAC", key, encoder.encode(`${purpose}.${body}`)),
          );
          return `${body}.${Base64Url.encode(new Uint8Array(mac))}`;
        }),
        unseal: (purpose, schema, value) =>
          Effect.all([verified(purpose, value), Clock.currentTimeMillis]).pipe(
            Effect.map(([text, now]) =>
              text.pipe(
                Option.flatMap(Schema.decodeUnknownOption(Schema.fromJsonString(schema))),
                Option.filter((payload) => payload.exp > now),
              ),
            ),
          ),
      }),
    );
  };

  /**
   * The service on Cloudflare. `SessionSecret` is made once and kept in the state of the stage, so
   * sessions survive a redeploy. Yielding its Output here binds it to the Worker as
   * SESSION_SECRET at deploy, and reads it from the Worker's env per request.
   */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const random = yield* Alchemy.Random("SessionSecret");
      return Session.layerWith(yield* Output.named(random.text, "SESSION_SECRET"));
    }),
  );
}
