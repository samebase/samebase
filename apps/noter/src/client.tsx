import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { initializeAppBootRecovery } from "#src/lib/appBootRecovery.ts";

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

async function hydrateApp() {
  initializeAppBootRecovery();
  await waitForAppFonts();

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

void hydrateApp();
