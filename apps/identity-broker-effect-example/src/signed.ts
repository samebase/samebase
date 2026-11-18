// Signed cookie values: `<payload>.<mac>`, both base64url. The payload is JSON with an `exp` in
// milliseconds; the mac is HMAC-SHA-256 with SESSION_SECRET over the purpose and the payload, so a
// value made for one cookie is never accepted as another. The values are signed, not encrypted:
// they hold nothing secret from the browser that holds them.
import { Option, Schema } from "effect";

/** The cookie that a value is signed for. */
export type Purpose = "session" | "sign-in";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The bytes of `text`, or undefined when it is not base64url. */
function fromBase64url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

/** `payload` with its expiry, signed for `purpose`. */
export async function seal(
  secret: string,
  purpose: Purpose,
  payload: Readonly<Record<string, string>>,
  exp: number,
): Promise<string> {
  const body = toBase64url(encoder.encode(JSON.stringify({ ...payload, exp })));
  const mac = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(`${purpose}.${body}`),
  );
  return `${body}.${toBase64url(new Uint8Array(mac))}`;
}

/**
 * The payload of `value` when its mac is right for `purpose`, it decodes with `schema`, and its
 * `exp` is after `now`; else undefined. `crypto.subtle.verify` compares the mac in constant time.
 */
export async function unseal<S extends Schema.ConstraintDecoder<{ readonly exp: number }>>(
  secret: string,
  purpose: Purpose,
  schema: S,
  value: string,
  now: number,
): Promise<S["Type"] | undefined> {
  const [body, macText, ...rest] = value.split(".");
  if (body === undefined || macText === undefined || rest.length > 0) return undefined;
  const mac = fromBase64url(macText);
  const bytes = fromBase64url(body);
  if (mac === undefined || bytes === undefined) return undefined;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    mac,
    encoder.encode(`${purpose}.${body}`),
  );
  if (!valid) return undefined;
  const decoded = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(schema))(decoder.decode(bytes)),
  );
  return decoded !== undefined && decoded.exp > now ? decoded : undefined;
}
