// HTTPS requests of the run to the hub's issuer, the suite and the fake provider. Each trusts only
// the run's certificate bundle, never follows a redirect, and connects to 127.0.0.1 for
// `localhost.emobix.co.uk`, so no request depends on public DNS.
import type { LookupFunction } from "node:net";
import { request } from "node:https";
import { HOST } from "./addresses.ts";

export type Answer = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly text: string;
};

const lookup: LookupFunction = (hostname, options, callback) => {
  if (hostname !== HOST) {
    callback(new Error(`Refused host ${hostname}`), "", 4);
    return;
  }
  if (options.all === true) {
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
    return;
  }
  callback(null, "127.0.0.1", 4);
};

export function makeHttps(ca: string) {
  return (
    url: string,
    init: {
      readonly method?: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly body?: string;
    } = {},
  ) =>
    new Promise<Answer>((resolve, reject) => {
      const target = new URL(url);
      const outgoing = request(
        target,
        {
          method: init.method ?? "GET",
          headers: init.headers ?? {},
          ca,
          lookup,
          timeout: 30_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              text: Buffer.concat(chunks).toString(),
            }),
          );
          response.on("error", reject);
        },
      );
      outgoing.on("timeout", () => outgoing.destroy(new Error(`Timeout: ${target.origin}`)));
      outgoing.on("error", reject);
      outgoing.end(init.body);
    });
}

export type Https = ReturnType<typeof makeHttps>;

/** The one value of a response header, or undefined. */
export const header = (answer: Answer, name: string): string | undefined => {
  const value = answer.headers[name];
  return Array.isArray(value) ? value[0] : value;
};
