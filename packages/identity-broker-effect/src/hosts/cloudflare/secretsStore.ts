// A hub's secrets in the account's Cloudflare Secrets Store. The deploy binds each secret to the
// Worker by name, so no value passes through the deploy. The Worker's `env` then holds, under the
// configuration name, a binding whose `get()` reads the secret. hub.ts wires it; this module needs
// no Cloudflare runtime, so the Node tests import it.
import { ConfigProvider, Effect } from "effect";

/** Secrets of the Worker account's Cloudflare Secrets Store that the hub reads as configuration. */
export type SecretsStoreSettings = {
  /** The store's name, such as `default_secrets_store`, the name of an account's default store. */
  readonly store: string;
  /** Per configuration name, such as `IDENTITY_BROKER_KEYS`, the secret's name in the store. */
  readonly secrets: Readonly<Record<string, string>>;
};

/**
 * The configuration over `fallback` in which each name of `names` reads its value from `env`: a
 * string, or a Secrets Store binding, whose `get()` reads the secret. Every other name reads
 * `fallback`. A name of `names` that `env` holds as anything else is missing.
 */
export const secretsStoreConfig = (
  env: Readonly<Record<string, unknown>>,
  names: ReadonlySet<string>,
  fallback: ConfigProvider.ConfigProvider,
) =>
  ConfigProvider.make((path) => {
    const [name] = path;
    if (path.length !== 1 || typeof name !== "string" || !names.has(name)) {
      return fallback.load(path);
    }
    const value = env[name];
    if (typeof value === "string") {
      return Effect.succeed(ConfigProvider.makeValue(value));
    }
    if (typeof value !== "object" || value === null || !("get" in value)) {
      return Effect.succeed(undefined);
    }
    const { get } = value;
    if (typeof get !== "function") {
      return Effect.succeed(undefined);
    }
    // The failure carries no cause: it reaches the Worker's start-up error.
    const unreadable = new ConfigProvider.SourceError({
      message: `The Secrets Store secret of ${name} cannot be read`,
    });
    return Effect.tryPromise({
      try: async (): Promise<unknown> => get.call(value),
      catch: () => unreadable,
    }).pipe(
      Effect.flatMap((secret) =>
        typeof secret === "string"
          ? Effect.succeed(ConfigProvider.makeValue(secret))
          : Effect.fail(unreadable),
      ),
    );
  });
