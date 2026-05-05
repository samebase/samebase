import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { AppRouterProvider } from "./lib/appRouter";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { initializeAppBootRecovery } from "@/lib/appBootRecovery";
import { QueryProvider } from "./lib/providers/query-provider";
import { OptionalThemeProvider } from "./lib/themeStorageFallback";

let mounted = false;
const APP_FONT_LOAD_TIMEOUT_MS = 3_000;
const APP_FONT_DESCRIPTORS = [
  'normal 400 1rem "IBM Plex Sans"',
  'normal 500 1rem "IBM Plex Sans"',
  'normal 600 1rem "IBM Plex Sans"',
  'normal 700 1rem "IBM Plex Sans"',
] as const;

function waitForTimeout(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, timeoutMs);
  });
}

/**
 * First paint should use the bundled app font so slow font files do not reflow
 * landing or workspace chrome after React has already rendered.
 */
async function waitForAppFonts() {
  if (!("fonts" in document)) {
    return;
  }

  await Promise.race([
    Promise.allSettled(
      APP_FONT_DESCRIPTORS.map(async (descriptor) => {
        await document.fonts.load(descriptor);
      }),
    ).then(() => undefined),
    waitForTimeout(APP_FONT_LOAD_TIMEOUT_MS),
  ]);
}

export async function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  initializeAppBootRecovery();
  await waitForAppFonts();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppBootErrorBoundary>
        <OptionalThemeProvider>
          <ConvexAuthProvider client={client}>
            <QueryProvider>
              <AppRouterProvider />
            </QueryProvider>
          </ConvexAuthProvider>
        </OptionalThemeProvider>
      </AppBootErrorBoundary>
    </React.StrictMode>,
  );
}
