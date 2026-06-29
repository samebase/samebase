type SamebasePostHogClient = (typeof import("posthog-js"))["default"];
type SamebasePostHogInitConfig = NonNullable<Parameters<SamebasePostHogClient["init"]>[1]>;

type SamebasePostHogSettings = {
  apiHost: string;
  projectToken: string;
};
type SamebasePostHogEnv = {
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
};

const DEFAULT_POSTHOG_API_HOST = "https://eu.i.posthog.com";

let postHogClientPromise: Promise<SamebasePostHogClient | null> | null = null;

export function readSamebasePostHogSettings(
  env: SamebasePostHogEnv,
): SamebasePostHogSettings | null {
  const projectToken = env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!projectToken) {
    return null;
  }

  return {
    apiHost: env.VITE_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_API_HOST,
    projectToken,
  };
}

export function buildSamebasePostHogInitConfig(args: {
  apiHost: string;
  dev: boolean;
}): SamebasePostHogInitConfig {
  return {
    api_host: args.apiHost,
    capture_exceptions: true,
    defaults: "2026-01-30",
    disable_session_recording: false,
    internal_or_test_user_hostname: args.dev ? null : undefined,
    session_recording: {
      blockSelector: "[data-posthog-block]",
      maskAllInputs: true,
      maskTextSelector: ".cm-editor, .monaco-editor, [data-posthog-mask]",
    },
  };
}

export async function loadSamebasePostHogClient(): Promise<SamebasePostHogClient | null> {
  const settings = readSamebasePostHogSettings(import.meta.env);
  if (settings === null) {
    return null;
  }

  if (postHogClientPromise === null) {
    postHogClientPromise = import("posthog-js")
      .then((module) => {
        module.default.init(
          settings.projectToken,
          buildSamebasePostHogInitConfig({
            apiHost: settings.apiHost,
            dev: import.meta.env.DEV,
          }),
        );
        return module.default;
      })
      .catch(() => null);
  }

  return await postHogClientPromise;
}

export async function identifySamebasePostHogUser(userId: string) {
  const posthog = await loadSamebasePostHogClient();
  posthog?.identify(userId);
}

export function resetSamebasePostHogClient() {
  void loadSamebasePostHogClient().then((posthog) => {
    posthog?.reset();
  });
}
